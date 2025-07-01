import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// API Keys - In Production über Umgebungsvariablen
const DEEPGRAM_API_KEY = '3e69806feb52b90f01f2e47f9e778fc87b6d811a';
const GEMINI_API_KEY = 'AIzaSyDCqBRhKqrwXGfIbfmQVj3nRbQLDFsGqEI';
const SMALLEST_API_KEY = 'sk-2ad79c9f-cf37-44b3-87dd-0b0b8eb66e5b';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const clients = new Map();

class VoiceAgent {
  constructor(clientId, ws) {
    this.clientId = clientId;
    this.ws = ws;
    this.deepgramSocket = null;
    this.conversationHistory = [];
    this.currentTranscript = '';
    this.isProcessing = false;
    this.startTime = Date.now();
  }

  sendToClient(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({
        ...data,
        timestamp: Date.now(),
        latency: Date.now() - this.startTime
      }));
    }
  }

  async startDeepgramStream() {
    try {
      console.log('🎤 Starte Deepgram Stream für Client:', this.clientId);
      
      // Optimierte Deepgram-Konfiguration für niedrige Latenz
      const deepgramUrl = `wss://api.deepgram.com/v1/listen?` + new URLSearchParams({
        language: 'de',
        model: 'nova-2',
        punctuate: 'true',
        interim_results: 'true',
        endpointing: '300', // Schnelle Erkennung von Satzende
        vad_events: 'true', // Voice Activity Detection
        smart_format: 'true',
        utterance_end_ms: '1000', // 1 Sekunde für Utterance End
        encoding: 'linear16',
        sample_rate: '16000'
      });

      const headers = { 
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      };
      
      const WebSocketDG = (await import('ws')).WebSocket;
      this.deepgramSocket = new WebSocketDG(deepgramUrl, { headers });

      this.deepgramSocket.on('open', () => {
        console.log('✅ Deepgram WebSocket verbunden');
        this.sendToClient({
          type: 'status',
          message: 'Spracherkennung bereit - sprechen Sie jetzt!'
        });
      });

      this.deepgramSocket.on('message', async (msg) => {
        try {
          const data = JSON.parse(msg);
          
          // Speech-to-Text Results
          if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
            const transcript = data.channel.alternatives[0].transcript;
            const isFinal = data.is_final;
            const confidence = data.channel.alternatives[0].confidence;
            
            if (transcript && transcript.trim()) {
              this.currentTranscript = transcript;
              
              this.sendToClient({
                type: 'transcript',
                text: transcript,
                isFinal: isFinal,
                confidence: confidence || 0,
                partial: !isFinal
              });

              // Bei finalem Transcript -> Sofort LLM Processing
              if (isFinal && transcript.length > 2 && !this.isProcessing) {
                this.isProcessing = true;
                console.log('🤖 Verarbeite:', transcript);
                
                // Parallele Verarbeitung für noch niedrigere Latenz
                this.processWithGemini(transcript);
              }
            }
          }

          // Voice Activity Detection
          if (data.type === 'UtteranceEnd') {
            console.log('🔚 Satzende erkannt');
            this.sendToClient({
              type: 'utterance_end',
              message: 'Satzende erkannt'
            });
          }

        } catch (e) { 
          console.error('❌ Deepgram Parse-Fehler:', e); 
        }
      });

      this.deepgramSocket.on('close', (code, reason) => {
        console.log('🔌 Deepgram WebSocket geschlossen:', code, reason.toString());
      });

      this.deepgramSocket.on('error', (err) => {
        console.error('❌ Deepgram Fehler:', err);
        this.sendToClient({
          type: 'error',
          message: 'Spracherkennung Fehler'
        });
      });

    } catch (error) {
      console.error('❌ Deepgram Setup Fehler:', error);
      this.sendToClient({
        type: 'error',
        message: 'Spracherkennung konnte nicht gestartet werden'
      });
    }
  }

  async processWithGemini(transcript) {
    try {
      const processingStart = Date.now();
      
      // Restaurant-spezifischer Prompt für Buchungen
      const systemPrompt = `Du bist ein freundlicher Telefonassistent für das Restaurant "Bella Vista". 

Deine Hauptaufgaben:
- Tischreservierungen entgegennehmen 
- Informationen über Öffnungszeiten geben
- Fragen zur Speisekarte beantworten
- Bei Reservierungen: Name, Datum, Uhrzeit, Personenzahl erfragen

Öffnungszeiten:
• Montag-Freitag: 17:00-23:00 Uhr
• Samstag: 17:00-24:00 Uhr  
• Sonntag: 17:00-22:00 Uhr

WICHTIG: Antworte SEHR KURZ und natürlich (max. 20 Wörter). Sei freundlich aber effizient.`;

      // Conversation Context für bessere Antworten
      this.conversationHistory.push(`Kunde: ${transcript}`);
      const context = this.conversationHistory.slice(-8).join('\n'); // Letzte 4 Nachrichten

      const model = genAI.getGenerativeModel({ 
        model: "models/gemini-2.5-flash-lite-preview-0617", // Neuestes & schnellstes Modell!
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 50, // Ultra-kurze Antworten für maximale Speed
          topP: 0.8,
          topK: 40
        }
      });

      const fullPrompt = `${systemPrompt}\n\nAktuelles Gespräch:\n${context}\n\nAssistant:`;

      this.sendToClient({
        type: 'ai_thinking',
        message: 'KI überlegt...'
      });

      // Streaming für sofortige Antworten
      const result = await model.generateContentStream(fullPrompt);
      let fullResponse = '';
      let firstChunk = true;

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          
          // Ersten Chunk sofort senden für gefühlte niedrigere Latenz
          this.sendToClient({
            type: 'llm_chunk',
            text: chunkText,
            isFirst: firstChunk
          });
          firstChunk = false;
        }
      }

      const processingTime = Date.now() - processingStart;
      console.log(`⚡ Gemini Response in ${processingTime}ms:`, fullResponse.substring(0, 50));

      if (fullResponse.trim()) {
        // Antwort zur History hinzufügen
        this.conversationHistory.push(`Assistant: ${fullResponse}`);
        
        // Parallel TTS starten (nicht warten)
        this.generateSpeech(fullResponse, processingTime);
      } else {
        this.isProcessing = false;
      }

    } catch (error) {
      console.error('❌ Gemini Fehler:', error);
      this.sendToClient({
        type: 'error',
        message: 'KI-Verarbeitung fehlgeschlagen'
      });
      this.isProcessing = false;
    }
  }

  async generateSpeech(text, geminiTime = 0) {
    try {
      const ttsStart = Date.now();
      console.log('🔊 Generiere deutsche Sprache:', text.substring(0, 30) + '...');
      
      // Smallest.ai TTS API - Optimiert für deutsche Sprache
      const response = await fetch('https://api.smallest.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SMALLEST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1', // Schnellstes TTS Modell
          input: text,
          voice: 'echo', // Neutrale deutsche Stimme
          response_format: 'mp3',
          speed: 1.1 // Leicht beschleunigt für Effizienz
        })
      });

      const ttsTime = Date.now() - ttsStart;

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');
        
        console.log(`🎵 TTS in ${ttsTime}ms, Audio: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
        
        this.sendToClient({
          type: 'voice_response',
          transcript: this.currentTranscript,
          response: text,
          audio: base64Audio,
          format: 'mp3',
          metrics: {
            gemini_time: geminiTime,
            tts_time: ttsTime,
            total_time: Date.now() - this.startTime,
            audio_size: audioBuffer.byteLength
          }
        });
      } else {
        const errorText = await response.text();
        console.error('❌ TTS Fehler:', response.status, errorText);
        
        // Fallback ohne Audio
        this.sendToClient({
          type: 'voice_response',
          transcript: this.currentTranscript,
          response: text,
          audio: null,
          error: 'TTS fehlgeschlagen'
        });
      }

    } catch (error) {
      console.error('❌ TTS Fehler:', error);
      
      // Fallback ohne Audio
      this.sendToClient({
        type: 'voice_response',
        transcript: this.currentTranscript,
        response: text,
        audio: null,
        error: error.message
      });
    } finally {
      this.isProcessing = false;
      this.startTime = Date.now(); // Reset für nächste Interaktion
    }
  }

  async handleAudioChunk(chunk) {
    if (!this.deepgramSocket || this.deepgramSocket.readyState !== 1) {
      return;
    }
    
    try {
      // Sende rohe Audio-Daten direkt an Deepgram
      this.deepgramSocket.send(chunk);
    } catch (error) {
      console.error('❌ Audio-Chunk Fehler:', error);
    }
  }

  async endDeepgramStream() {
    if (this.deepgramSocket) {
      // Sende KeepAlive bevor close
      try {
        this.deepgramSocket.send(JSON.stringify({type: 'CloseStream'}));
      } catch (e) {}
      
      this.deepgramSocket.close(1000, 'Stream beendet');
      this.deepgramSocket = null;
      console.log('🛑 Deepgram Stream beendet für Client:', this.clientId);
    }
  }

  resetConversation() {
    this.conversationHistory = [];
    this.currentTranscript = '';
    this.isProcessing = false;
    console.log('🔄 Conversation reset für Client:', this.clientId);
  }
}

// WebSocket Connection Handler
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  const agent = new VoiceAgent(clientId, ws);
  clients.set(clientId, agent);
  
  console.log(`👤 Neuer Client verbunden: ${clientId} (Total: ${clients.size})`);
  
  // Willkommensnachricht
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Voice Agent bereit! 🎙️ Drücken Sie auf das Mikrofon und sprechen Sie.',
    version: '2.0.0'
  }));

  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) {
        // Raw Audio Data (direkt von MediaRecorder)
        await agent.handleAudioChunk(data);
        return;
      }

      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'start_recording':
          console.log('🎤 Start Recording für Client:', clientId);
          agent.resetConversation();
          await agent.startDeepgramStream();
          break;
          
        case 'audio_data':
          // Audio als Base64 String
          if (message.audio) {
            const audioBuffer = Buffer.from(message.audio, 'base64');
            await agent.handleAudioChunk(audioBuffer);
          }
          break;
          
        case 'stop_recording':
          console.log('🛑 Stop Recording für Client:', clientId);
          await agent.endDeepgramStream();
          break;
          
        case 'reset_conversation':
          agent.resetConversation();
          agent.sendToClient({
            type: 'conversation_reset',
            message: 'Gespräch zurückgesetzt'
          });
          break;

        case 'ping':
          agent.sendToClient({ type: 'pong', timestamp: Date.now() });
          break;
          
        default:
          console.log('❓ Unbekannter Message-Type:', message.type);
      }
    } catch (error) {
      console.error('❌ Message Handler Fehler:', error);
      agent.sendToClient({
        type: 'error',
        message: 'Nachrichtenverarbeitung fehlgeschlagen'
      });
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`👋 Client ${clientId} getrennt: ${code} ${reason} (Verbleibend: ${clients.size - 1})`);
    clients.delete(clientId);
    agent.endDeepgramStream();
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket Fehler für Client ${clientId}:`, error);
  });
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    clients: clients.size,
    services: {
      deepgram: '✅ Speech-to-Text',
      gemini: '✅ AI Chat (2.0-flash-exp)',
      smallest_ai: '✅ Text-to-Speech'
    },
    version: '2.0.0',
    node_version: process.version
  });
});

// API Status Check
app.get('/api/status', async (req, res) => {
  const checks = {
    deepgram: false,
    gemini: false,
    smallest: false,
    latency: {}
  };

  try {
    // Deepgram Test
    const dgStart = Date.now();
    const dgResponse = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}` }
    });
    checks.deepgram = dgResponse.ok;
    checks.latency.deepgram = Date.now() - dgStart;
  } catch (e) {
    checks.latency.deepgram = -1;
  }

  try {
    // Gemini Test
    const geminiStart = Date.now();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    await model.generateContent("test");
    checks.gemini = true;
    checks.latency.gemini = Date.now() - geminiStart;
  } catch (e) {
    checks.latency.gemini = -1;
  }

  try {
    // Smallest.ai Test
    const smallestStart = Date.now();
    const response = await fetch('https://api.smallest.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${SMALLEST_API_KEY}` }
    });
    checks.smallest = response.ok;
    checks.latency.smallest = Date.now() - smallestStart;
  } catch (e) {
    checks.latency.smallest = -1;
  }

  res.json({
    timestamp: new Date().toISOString(),
    api_status: checks,
    overall_health: checks.deepgram && checks.gemini && checks.smallest
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('💥 Server Fehler:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('\n🚀 VOICE AGENT SERVER GESTARTET 🚀');
  console.log(`📡 Server: http://${HOST}:${PORT}`);
  console.log(`🔗 WebSocket: ws://${HOST}:${PORT}`);
  console.log('\n🔧 Services:');
  console.log('   🎤 Deepgram STT - Deutsche Spracherkennung');
  console.log('   🤖 Gemini 2.0 Flash - Ultraschnelle KI-Antworten');  
  console.log('   🔊 Smallest.ai TTS - Deutsche Sprachsynthese');
  console.log('\n⚡ Optimiert für minimale Latenz mit Streaming!');
  console.log('📊 Health Check: http://localhost:' + PORT + '/health');
  console.log('🔍 API Status: http://localhost:' + PORT + '/api/status\n');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('📴 Server herunterfahren...');
  server.close(() => {
    console.log('✅ Server beendet');
    process.exit(0);
  });
});

export default server; 