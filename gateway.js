import http from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';
import express from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;                       // Fly.io Standard Port
const HOST = process.env.HOST || '0.0.0.0';                  // Fly.io braucht 0.0.0.0
const REST = process.env.VOICE_REST || `http://127.0.0.1:${PORT}/api/voice-agent`;

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

// API Routes - Voice Agent
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

// Fly.io Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    websocket_clients: 'WebSocket server ready'
  });
});

// Fallback für SPA Routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ 
  server, 
  perMessageDeflate: false,
  // Fly.io optimierte Einstellungen
  maxPayload: 6 * 1024 * 1024, // 6MB für Audio-Daten
  skipUTF8Validation: true,     // Performance-Optimierung für Binary Data
  clientTracking: true         // Client-Tracking für Health Checks
});

wss.on('connection', ws => {
  console.log('🔗 New WebSocket connection');
  
  // Informiere Client über erfolgreichen Verbindungsaufbau
  try { 
    ws.send(JSON.stringify({ type: 'connected', message: 'Stream bereit' })); 
    console.log('📤 Connection message sent');
  } catch (e) {
    console.error('Failed to send connection message:', e);
  }

  let chunks = [];
  let isRecording = false;

  ws.on('message', msg => {
    try {
      // Versuche JSON zu parsen für Control-Messages
      const asString = msg.toString();
      
      if (asString.startsWith('{')) {
        const parsed = JSON.parse(asString);
        console.log('📥 Control message:', parsed.type);
        
        if (parsed.type === 'start_audio') {
          chunks = [];
          isRecording = true;
          console.log('🎤 Audio recording started');
          return;
        }
        
        if (parsed.type === 'end_audio') {
          isRecording = false;
          console.log('🎤 Audio recording ended, chunks:', chunks.length);
          if (chunks.length > 0) {
            const audioBuffer = Buffer.concat(chunks);
            console.log('📦 Combined audio buffer size:', audioBuffer.length, 'bytes');
            return relay(audioBuffer, ws);
          } else {
            ws.send(JSON.stringify({ type: 'error', data: { message: 'No audio data received' } }));
          }
          return;
        }
      }
      
      // Binary audio data
      if (isRecording) {
        const chunk = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
        chunks.push(chunk);
        console.log('📦 Audio chunk received:', chunk.length, 'bytes, total chunks:', chunks.length);
      }
    } catch (e) {
      console.error('❌ WebSocket message processing error:', e);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

async function relay(buffer, ws) {
  try {
    console.log('🔄 Relaying audio to voice-agent API, buffer size:', buffer.length);
    
    const res = await fetch(REST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        audio: buffer.toString('base64'),
        voice: 'german_m2'
      })
    });

    console.log('📥 Voice Agent API response status:', res.status);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Voice Agent API Error:', res.status, errorText);
      ws.send(JSON.stringify({ type: 'error', data: { message: `API Error: ${res.status}` } }));
      return;
    }

    // NDJSON/Chunk-Stream korrekt in Zeilen zerlegen und als Text senden
    const decoder = new TextDecoder();
    let buf = '';
    
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        
        try {
          // Validiere JSON vor dem Senden
          const parsed = JSON.parse(line);
          console.log('📤 Streaming to client:', parsed.type);
          
          // Als Text senden (kein Binär-Frame), damit der Browser JSON.parse nutzen kann
          ws.send(line);
        } catch (parseError) {
          console.warn('⚠️ Invalid JSON line:', line);
        }
      }
    }
    
    console.log('✅ Relay complete');
  } catch (e) {
    console.error('❌ Relay error:', e);
    ws.send(JSON.stringify({ type: 'error', data: { message: e.message } }));
  }
}

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server bereit auf http://${HOST}:${PORT}`);
  console.log(`🔗 WebSocket Server bereit auf ws://${HOST}:${PORT}`);
  console.log(`🌐 API Server bereit auf http://${HOST}:${PORT}/api/voice-agent`);
});
