import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
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

const server = http.createServer(app);

// Globale Limits
const MAX_CLIENTS = parseInt(process.env.MAX_WS_CLIENTS || '10', 10);
const RATE_LIMIT_WINDOW_MS = 10_000; // 10s Sliding Window
// Etwas entspannteres Default-Limit, um parallele Handshakes/Reconnections nicht zu blocken
const MAX_CONNECTIONS_PER_WINDOW = parseInt(process.env.MAX_CONNS_PER_WINDOW || '8', 10);
// Heartbeat zur Erkennung toter Verbindungen
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_MS || '30000', 10);

// Sliding-Window Request Log pro IP
const ipRequestLog = new Map(); // Map<string, number[]>

const wss = new WebSocketServer({ 
  server, 
  perMessageDeflate: false,
  // Fly.io optimierte Einstellungen
  maxPayload: 6 * 1024 * 1024, // 6MB für Audio-Daten
  skipUTF8Validation: true,     // Performance-Optimierung für Binary Data
  clientTracking: true,        // Client-Tracking für Health Checks
  // Hinweis: maxClients wird von ws nicht ausgewertet; wir erzwingen das selbst unten
  verifyClient: (info) => {
    try {
      // Echte Client-IP (Proxy aware)
      const fwd = info.req.headers['x-forwarded-for'];
      const raw = Array.isArray(fwd) ? fwd[0] : (fwd || '');
      const forwardedIP = raw.split(',')[0].trim();
      const socketIP = info.req.socket.remoteAddress;
      const clientIP = forwardedIP || socketIP;

      const now = Date.now();
      const arr = ipRequestLog.get(clientIP) || [];
      // Sliding window bereinigen
      const fresh = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (fresh.length >= MAX_CONNECTIONS_PER_WINDOW) {
        console.log(`🚫 Rate limit exceeded for IP: ${clientIP}`);
        ipRequestLog.set(clientIP, fresh); // nur frische Einträge behalten
        return false;
      }
      fresh.push(now);
      ipRequestLog.set(clientIP, fresh);
      return true;
    } catch (e) {
      console.warn('verifyClient error, allowing connection:', e);
      return true;
    }
  }
});

// Fly.io Health Check (nach WebSocketServer, damit wss existiert)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    websocket_clients: wss.clients.size
  });
});

// Fallback für SPA Routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// Connection Tracking für Logging / Cleanup
const connectionTracker = new Map();

// WS Heartbeat: terminate Verbindungen ohne Pong
function heartbeat() {
  // @ts-ignore (Runtime property)
  this.isAlive = true;
}

const heartbeatInterval = setInterval(() => {
  // @ts-ignore (Runtime property)
  wss.clients.forEach((ws) => {
    // @ts-ignore (Runtime property)
    if (ws.isAlive === false) {
      try { ws.terminate(); } catch {}
      return;
    }
    // @ts-ignore (Runtime property)
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, HEARTBEAT_INTERVAL_MS);

// Cleanup alte Connection-Tracker-Einträge alle 5 Minuten
setInterval(() => {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  
  for (const [ip, data] of connectionTracker.entries()) {
    if (data.lastConnect < fiveMinutesAgo && data.count === 0) {
      connectionTracker.delete(ip);
      console.log(`🧹 Cleaned up old connection tracker for IP: ${ip}`);
    }
  }
  
  console.log(`📊 Active connection trackers: ${connectionTracker.size}`);
}, 5 * 60 * 1000);

wss.on('connection', (ws, req) => {
  // Echte Client-IP (Proxy aware)
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : (fwd || '');
  const forwardedIP = raw.split(',')[0].trim();
  const clientIP = forwardedIP || req.socket.remoteAddress;
  const connectionId = `${clientIP}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log(`🔗 NEW WebSocket connection: ${connectionId}`);
  console.log(`🔍 Connection details: IP=${clientIP}, UserAgent=${req.headers['user-agent']}`);
  console.log(`🔍 Current total connections: ${wss.clients.size + 1}`);

  // Heartbeat aktivieren
  // @ts-ignore (Runtime property)
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  // Erzwinge Maximale gleichzeitige Verbindungen
  if (wss.clients.size > MAX_CLIENTS) {
    try {
      ws.close(1013, 'Server busy');
    } catch {}
    console.log('🚫 Max gleichzeitige Verbindungen erreicht. Verbindung abgelehnt.');
    return;
  }
  
  // Connection-Tracker hochzählen
  const nowTs = Date.now();
  const clientData = connectionTracker.get(clientIP) || { count: 0, lastConnect: 0 };
  clientData.count += 1;
  clientData.lastConnect = nowTs;
  connectionTracker.set(clientIP, clientData);

  // PER-CONNECTION Audio State (CRITICAL!)
  let chunks = [];
  let isRecording = false;
  console.log(`🔍 [${connectionId}] Initialized with empty chunks array`);

  // Message-Listener direkt registrieren, bevor wir irgendetwas senden
  ws.on('message', msg => {
    try {
      // Bestimme Message-Typ
      const isBuffer = Buffer.isBuffer(msg);
      const isString = typeof msg === 'string';
      const asString = isBuffer ? msg.toString('utf8') : (isString ? msg : '');
      
      console.log(`📥 [${connectionId}] WebSocket message received:`, {
        isBuffer,
        isString,
        size: isBuffer ? msg.length : (asString ? asString.length : 'unknown'),
        type: isBuffer ? 'binary' : 'text',
        recording: isRecording,
        currentChunks: chunks.length
      });

      // Versuche JSON zu parsen für Control-Messages (auch wenn der Frame ein Buffer ist)
      if (asString && asString.trim().startsWith('{')) {
        console.log('🔍 Attempting to parse control message:', asString);
        const parsed = JSON.parse(asString);
        console.log('📥 Control message:', parsed.type);
        console.log('🔍 Full parsed message:', parsed);
        
        if (parsed.type === 'start_audio') {
          chunks = [];
          isRecording = true;
          console.log(`🎤 [${connectionId}] Audio recording started - ready for chunks`);
          console.log(`🔍 [${connectionId}] isRecording now set to:`, isRecording);
          console.log(`🔍 [${connectionId}] Chunks array reset, length:`, chunks.length);
          return;
        }
        
        if (parsed.type === 'end_audio') {
          isRecording = false;
          console.log(`🎤 [${connectionId}] Audio recording ended, chunks:`, chunks.length);
          console.log(`🔍 [${connectionId}] Final chunks array content lengths:`, chunks.map(c => c.length));
          console.log(`🔍 [${connectionId}] Connection state: recording was ${isRecording}, total connections: ${wss.clients.size}`);
          if (chunks.length > 0) {
            const audioBuffer = Buffer.concat(chunks);
            console.log(`📦 [${connectionId}] Combined audio buffer size:`, audioBuffer.length, 'bytes');
            console.log(`🔄 [${connectionId}] Starting relay to voice-agent API...`);
            return relay(audioBuffer, ws, connectionId);
          } else {
            console.error(`❌ [${connectionId}] No audio chunks received during recording`);
            console.error(`🔍 [${connectionId}] Debug: isRecording was ${isRecording} when end_audio received`);
            console.error(`🔍 [${connectionId}] This suggests audio chunks went to different connection!`);
            ws.send(JSON.stringify({ type: 'error', data: { message: 'No audio data received' } }));
          }
          return;
        }
      }
      
      // Binary audio data
      if (isRecording && isBuffer) {
        // FIX: Ignoriere sehr kleine Chunks (Header/Corrupt Data)
        if (msg.length > 10) {
          chunks.push(msg);
          console.log(`📦 [${connectionId}] Audio chunk received:`, msg.length, 'bytes, total chunks:', chunks.length);
        } else {
          console.warn(`⚠️ [${connectionId}] Ignoring small/corrupt audio chunk:`, msg.length, 'bytes');
        }
      } else if (isRecording && !isBuffer) {
        // Versuche Binary-String zu Buffer zu konvertieren
        const chunk = Buffer.from(msg);
        if (chunk.length > 10) {
          chunks.push(chunk);
          console.log(`📦 [${connectionId}] Audio chunk received (converted):`, chunk.length, 'bytes, total chunks:', chunks.length);
        } else {
          console.warn(`⚠️ [${connectionId}] Ignoring small/corrupt converted chunk:`, chunk.length, 'bytes');
        }
      } else if (!isRecording && isBuffer) {
        console.warn(`⚠️ [${connectionId}] Binary data received but not recording - ignoring, size:`, msg.length, 'bytes');
      }
    } catch (e) {
      console.error('❌ WebSocket message processing error:', e);
    }
  });

  // Informiere Client über erfolgreichen Verbindungsaufbau (nachdem Listener hängt)
  try { 
    ws.send(JSON.stringify({ type: 'connected', message: 'Stream bereit' })); 
    console.log('📤 Connection message sent');
  } catch (e) {
    console.error('Failed to send connection message:', e);
  }

  ws.on('close', (code, reason) => {
    console.log(`🔌 [${connectionId}] WebSocket connection closed: (${code}: ${reason})`);
    console.log(`🔍 [${connectionId}] Final state: chunks=${chunks.length}, recording=${isRecording}`);
    // Cleanup connection tracking
    const clientData = connectionTracker.get(clientIP);
    if (clientData && clientData.count > 0) {
      clientData.count--;
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for ${connectionId}:`, error);
    // Cleanup bei Error
    const clientData = connectionTracker.get(clientIP);
    if (clientData && clientData.count > 0) {
      clientData.count--;
    }
  });
});

async function relay(buffer, ws, connectionId = 'unknown') {
  try {
    console.log(`🔄 [${connectionId}] Starting relay to voice-agent API`);
    console.log(`🔍 [${connectionId}] Audio buffer size:`, buffer.length, 'bytes');
    console.log(`🔍 [${connectionId}] REST endpoint:`, REST);
    console.log(`🔍 [${connectionId}] WebSocket readyState:`, ws.readyState);
    
    // Prüfe WebSocket-Status vor Relay
    if (ws.readyState !== WebSocket.OPEN) {
      console.log(`⚠️ [${connectionId}] WebSocket nicht mehr offen, breche Relay ab`);
      return;
    }
    
    // Prepare request payload
    const payload = { 
      audio: buffer.toString('base64'),
      voice: 'german_m2'
    };
    console.log(`🔍 [${connectionId}] Request payload size:`, JSON.stringify(payload).length, 'chars');
    console.log(`🔍 [${connectionId}] Base64 audio length:`, payload.audio.length, 'chars');
    
    console.log(`📤 [${connectionId}] Sending POST request to:`, REST);
    const fetchStart = Date.now();
    
    const res = await fetch(REST, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'gateway/1.0'
      },
      body: JSON.stringify(payload)
    });

    const fetchDuration = Date.now() - fetchStart;
    console.log(`📥 [${connectionId}] Voice Agent API response:`, res.status, res.statusText);
    console.log(`🔍 [${connectionId}] Response time:`, fetchDuration, 'ms');
    console.log(`🔍 [${connectionId}] Response headers:`, Object.fromEntries(res.headers.entries()));

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ [${connectionId}] Voice Agent API Error:`, res.status, res.statusText);
      console.error(`🔍 [${connectionId}] Error response body:`, errorText.substring(0, 500));
      console.error(`🔍 [${connectionId}] Full error response headers:`, Object.fromEntries(res.headers.entries()));
      ws.send(JSON.stringify({ type: 'error', data: { message: `API Error: ${res.status} - ${res.statusText}` } }));
      return;
    }

    // NDJSON/Chunk-Stream korrekt in Zeilen zerlegen und als Text senden
    console.log(`🔄 [${connectionId}] Starting to process streaming response...`);
    const decoder = new TextDecoder();
    let buf = '';
    let chunkCount = 0;
    let totalBytes = 0;
    
    for await (const chunk of res.body) {
      chunkCount++;
      totalBytes += chunk.length;
      console.log(`📦 [${connectionId}] Received chunk ${chunkCount}, size:`, chunk.length, 'bytes');
      
      buf += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        
        console.log(`🔍 [${connectionId}] Processing line:`, line.substring(0, 100) + (line.length > 100 ? '...' : ''));
        
        try {
          // Validiere JSON vor dem Senden
          const parsed = JSON.parse(line);
          console.log(`📤 [${connectionId}] Streaming to client - type:`, parsed.type, 'data keys:', Object.keys(parsed.data || {}));
          
          // Als Text senden (kein Binär-Frame), damit der Browser JSON.parse nutzen kann
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(line);
            console.log(`✅ [${connectionId}] Sent line to client successfully`);
          } else {
            console.warn(`⚠️ [${connectionId}] WebSocket not open when trying to send, state:`, ws.readyState);
          }
        } catch (parseError) {
          console.warn(`⚠️ [${connectionId}] Invalid JSON line:`, line.substring(0, 200));
          console.warn(`🔍 [${connectionId}] Parse error:`, parseError.message);
        }
      }
    }
    
    console.log(`✅ [${connectionId}] Relay complete - processed ${chunkCount} chunks, ${totalBytes} total bytes`);
  } catch (e) {
    console.error(`❌ [${connectionId}] Relay error:`, e.message);
    console.error(`🔍 [${connectionId}] Full error:`, e);
    console.error(`🔍 [${connectionId}] Error stack:`, e.stack);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', data: { message: e.message || 'Unknown relay error' } }));
    } else {
      console.error(`⚠️ [${connectionId}] Cannot send error to client - WebSocket not open:`, ws.readyState);
    }
  }
}

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server bereit auf http://${HOST}:${PORT}`);
  console.log(`🔗 WebSocket Server bereit auf ws://${HOST}:${PORT}`);
  console.log(`🌐 API Server bereit auf http://${HOST}:${PORT}/api/voice-agent`);
  console.log(`🔒 Connection Rate Limiting: Max ${MAX_CONNECTIONS_PER_WINDOW} Verbindungen pro IP in ${Math.round(RATE_LIMIT_WINDOW_MS/1000)}s`);
  console.log(`🔌 Max gleichzeitige WebSocket-Verbindungen: ${MAX_CLIENTS}`);
  console.log(`🫀 Heartbeat aktiv: Intervall ${Math.round(HEARTBEAT_INTERVAL_MS/1000)}s`);
});