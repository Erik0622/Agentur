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

// Fallback für SPA Routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ 
  server, 
  perMessageDeflate: false 
});

wss.on('connection', ws => {
  // Informiere Client über erfolgreichen Verbindungsaufbau
  try { ws.send(JSON.stringify({ type: 'connected', message: 'Stream bereit' })); } catch {}

  let chunks = [];

  ws.on('message', msg => {
    const asString = msg.toString();

    if (asString === '{"type":"start_audio"}') { chunks = []; return; }
    if (asString === '{"type":"end_audio"}')   return relay(Buffer.concat(chunks), ws);

    chunks.push(Buffer.isBuffer(msg) ? msg : Buffer.from(msg));
  });
});

async function relay(buffer, ws) {
  try {
    const res = await fetch(REST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: buffer.toString('base64') })
    });

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
          // Als Text senden (kein Binär-Frame), damit der Browser JSON.parse nutzen kann
          ws.send(line);
        } catch {}
      }
    }
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: e.message }));
  }
}

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server bereit auf http://${HOST}:${PORT}`);
  console.log(`🔗 WebSocket Server bereit auf ws://${HOST}:${PORT}`);
  console.log(`🌐 API Server bereit auf http://${HOST}:${PORT}/api/voice-agent`);
});
