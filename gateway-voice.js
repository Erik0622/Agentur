import http from 'http';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import express from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

// Express App für statische Dateien
const app = express();

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Body Parser für JSON
app.use(express.json({ limit: '10mb' }));

// Statische Dateien aus dem dist-Ordner servieren
app.use(express.static(join(__dirname, 'dist')));

// API Routes - Voice Agent (für Fallback)
app.use('/api/voice-agent', async (req, res) => {
  try {
    const voiceAgentModule = await import('./api/voice-agent.js');
    const voiceAgent = voiceAgentModule.default || voiceAgentModule;
    return voiceAgent(req, res);
  } catch (error) {
    console.error('Voice Agent API Error:', error);
    res.status(500).json({ error: 'Voice Agent API nicht verfügbar' });
  }
});

// Fallback für SPA Routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ 
  server, 
  perMessageDeflate: false 
});

// ===== REAL-TIME DEEPGRAM VOICE AGENT =====
wss.on('connection', clientWs => {
  console.log('🔗 Client WebSocket verbunden');
  
  // Sende Verbindungsbestätigung
  clientWs.send(JSON.stringify({ type: 'connected', message: 'Voice Agent bereit' }));
  
  let deepgramWs = null;
  let isRecording = false;
  let currentTranscript = '';
  
  // Deepgram WebSocket Verbindung
  const connectDeepgram = () => {
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
    if (!DEEPGRAM_API_KEY) {
      console.error('❌ DEEPGRAM_API_KEY fehlt');
      clientWs.send(JSON.stringify({ type: 'error', message: 'API-Schlüssel fehlt' }));
      return;
    }
    
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
      model: 'nova-2',
      language: 'de',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '300',
      utterance_end_ms: '1000',
      vad_events: 'true',
      smart_format: 'true',
      encoding: 'opus',
      sample_rate: '48000',
      channels: '1'
    }).toString();
    
    console.log('🔗 Verbinde zu Deepgram:', deepgramUrl);
    
    deepgramWs = new WebSocket(deepgramUrl, {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false
    });
    
    deepgramWs.on('open', () => {
      console.log('✅ Deepgram WebSocket verbunden');
      clientWs.send(JSON.stringify({ type: 'status', message: 'Deepgram bereit' }));
    });
    
    deepgramWs.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        
        if (response.type === 'Results' && response.channel?.alternatives?.[0]) {
          const transcript = response.channel.alternatives[0].transcript;
          
          if (transcript && transcript.trim()) {
            console.log('📝 Deepgram Transkript:', transcript);
            
            if (response.is_final) {
              currentTranscript = transcript;
              // Sende Transkript an Client
              clientWs.send(JSON.stringify({ 
                type: 'transcript', 
                text: transcript 
              }));
              
              // Verarbeite mit LLM und TTS
              processWithLLMAndTTS(transcript, clientWs);
            } else {
              // Interim-Ergebnis
              clientWs.send(JSON.stringify({ 
                type: 'interim', 
                text: transcript 
              }));
            }
          }
        }
        
        if (response.type === 'UtteranceEnd') {
          console.log('🔚 Utterance beendet');
        }
        
      } catch (error) {
        console.error('❌ Deepgram Message Parse Error:', error);
      }
    });
    
    deepgramWs.on('error', (error) => {
      console.error('❌ Deepgram WebSocket Error:', error);
      clientWs.send(JSON.stringify({ type: 'error', message: 'Deepgram Verbindungsfehler' }));
    });
    
    deepgramWs.on('close', (code, reason) => {
      console.log('🔌 Deepgram WebSocket geschlossen:', code, reason.toString());
    });
  };
  
  // Client WebSocket Message Handler
  clientWs.on('message', (data) => {
    try {
      if (data instanceof Buffer) {
        // Binary Audio Data - direkt an Deepgram weiterleiten
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN && isRecording) {
          deepgramWs.send(data);
        }
      } else {
        // JSON Commands
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'start_audio':
            console.log('🎤 Audio-Aufnahme gestartet');
            isRecording = true;
            if (!deepgramWs || deepgramWs.readyState !== WebSocket.OPEN) {
              connectDeepgram();
            }
            break;
            
          case 'end_audio':
            console.log('⏹️ Audio-Aufnahme beendet');
            isRecording = false;
            if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
              deepgramWs.send(JSON.stringify({ type: 'CloseStream' }));
            }
            break;
        }
      }
    } catch (error) {
      console.error('❌ Client Message Error:', error);
    }
  });
  
  clientWs.on('close', () => {
    console.log('🔌 Client WebSocket getrennt');
    if (deepgramWs) {
      deepgramWs.close();
    }
  });
  
  clientWs.on('error', (error) => {
    console.error('❌ Client WebSocket Error:', error);
  });
});

// LLM und TTS Verarbeitung
async function processWithLLMAndTTS(transcript, clientWs) {
  try {
    console.log('🤖 Verarbeite mit LLM:', transcript);
    
    // Einfache Antwort für Test
    const response = `Sie haben gesagt: "${transcript}". Das ist ein Test der KI-Antwort.`;
    
    clientWs.send(JSON.stringify({ 
      type: 'llm_response', 
      text: response 
    }));
    
    // TODO: Hier würde normalerweise die LLM-Verarbeitung stattfinden
    // TODO: Hier würde normalerweise die TTS-Verarbeitung stattfinden
    
    clientWs.send(JSON.stringify({ type: 'end' }));
    
  } catch (error) {
    console.error('❌ LLM/TTS Error:', error);
    clientWs.send(JSON.stringify({ type: 'error', message: 'Verarbeitungsfehler' }));
  }
}

server.listen(PORT, HOST, () => {
  console.log(`🚀 Voice Agent Server bereit auf http://${HOST}:${PORT}`);
  console.log(`🔗 WebSocket bereit auf ws://${HOST}:${PORT}`);
  console.log(`🎤 Deepgram Voice Agent aktiviert`);
});