import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fetch from 'node-fetch';
import express from 'express';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { GoogleGenAI, Modality } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;                       // Fly.io Standard Port
const HOST = process.env.HOST || '0.0.0.0';                  // Fly.io braucht 0.0.0.0
const REST = process.env.VOICE_REST || `http://127.0.0.1:${PORT}/api/voice-agent`;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Gemini Live API (Native Audio) Client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Restaurant System Prompt (Deutsch)
const SYSTEM_PROMPT = [
  'Du bist der freundliche Telefon‑Assistent des Restaurants "Bella Vista" in München.',
  'Aufgabe: Kunden am Telefon begrüßen, Reservierungen aufnehmen, Fragen zur Speisekarte, Allergenen und Öffnungszeiten beantworten.',
  'Beantworte stets kurz, natürlich und hilfsbereit. Sprich max. 1–2 Sätze pro Antwort.',
  'Details:',
  '- Öffnungszeiten: Mo–Fr 12:00–22:00, Sa 12:00–23:00, So geschlossen',
  '- Adresse: Sonnenstraße 12, 80331 München',
  '- Telefon: +49 89 1234567',
  '- Spezialitäten: Hausgemachte Pasta, Holzofen‑Pizza, Tiramisù',
  '- Vegetarisch/Vegan: Margherita, Funghi, Pasta Arrabbiata, Salat Mediterran',
  '- Glutenfrei auf Wunsch: Pizza‑Boden und Pasta',
  'Bei Reservierungen immer Personenanzahl, Datum, Uhrzeit und Name erfragen. Bestätige freundlich.'
].join('\n');

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
  let liveSession = null; // Gemini Live session per connection
  let liveSessionOpen = false;
  let selectedVoice = 'Puck'; // Default Gemini Native Voice (can be overridden by client)
  let receivedPcmChunks = [];
  let sentHeader = false;
  let pendingPcmQueue = [];
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
          receivedPcmChunks = [];
          sentHeader = false;
          isRecording = true;
          selectedVoice = typeof parsed.voice === 'string' && parsed.voice.trim() ? parsed.voice.trim() : selectedVoice;
          console.log(`🎤 [${connectionId}] Audio recording started - ready for chunks`);
          console.log(`🔍 [${connectionId}] Selected voice: ${selectedVoice}`);
          console.log(`🔍 [${connectionId}] isRecording now set to:`, isRecording);
          console.log(`🔍 [${connectionId}] Chunks array reset, length:`, chunks.length);
          // Starte Gemini Live Session wenn noch nicht offen
          if (!liveSessionOpen) {
            pendingPcmQueue = [];
            startGeminiLiveSession().catch(e => {
              console.error(`❌ [${connectionId}] Live session start failed:`, e);
              try { ws.send(JSON.stringify({ type: 'error', data: { message: 'Gemini Live Session Fehler' } })); } catch {}
            });
          }
          return;
        }
        
        if (parsed.type === 'end_audio') {
          isRecording = false;
          console.log(`🎤 [${connectionId}] Audio recording ended, chunks:`, chunks.length);
          console.log(`🔍 [${connectionId}] Final chunks array content lengths:`, chunks.map(c => c.length));
          console.log(`🔍 [${connectionId}] Connection state: recording was ${isRecording}, total connections: ${wss.clients.size}`);
          // Bei Live-API: Turn-Completion kommt von Gemini (onmessage)
          // Hier nichts weiter tun
          return;
        }
      }
      
      // Binary audio data → direkt an Gemini Live weiterleiten (PCM 16kHz, 16bit, mono)
      if (isRecording && isBuffer) {
        if (msg.length > 10) {
          chunks.push(msg);
          // Sende an Live API falls Session offen
          if (liveSessionOpen && liveSession) {
            const base64 = Buffer.from(msg).toString('base64');
            try {
              liveSession.sendRealtimeInput({
                audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
              });
            } catch (e) {
              console.error(`❌ [${connectionId}] Failed to send audio to Live API:`, e.message);
            }
          } else {
            // Session noch nicht offen – zwischenpuffern
            try { pendingPcmQueue.push(Buffer.from(msg).toString('base64')); } catch {}
          }
        } else {
          console.warn(`⚠️ [${connectionId}] Ignoring small/corrupt audio chunk:`, msg.length, 'bytes');
        }
      } else if (isRecording && !isBuffer) {
        const chunk = Buffer.from(msg);
        if (chunk.length > 10) {
          chunks.push(chunk);
          if (liveSessionOpen && liveSession) {
            const base64 = chunk.toString('base64');
            try {
              liveSession.sendRealtimeInput({
                audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
              });
            } catch (e) {
              console.error(`❌ [${connectionId}] Failed to send converted audio to Live API:`, e.message);
            }
          } else {
            try { pendingPcmQueue.push(chunk.toString('base64')); } catch {}
          }
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
    // Beende Live Session
    try { liveSession?.close?.(); } catch {}
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for ${connectionId}:`, error);
    // Cleanup bei Error
    const clientData = connectionTracker.get(clientIP);
    if (clientData && clientData.count > 0) {
      clientData.count--;
    }
  });

  // --- Helpers: Gemini Live Session handling ---
  async function startGeminiLiveSession() {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY fehlt');
    console.log(`🚀 [${connectionId}] Opening Gemini Live session (native audio)...`);
    receivedPcmChunks = [];
    sentHeader = false;
    const session = await ai.live.connect({
      model: 'gemini-2.5-flash-preview-native-audio-dialog',
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: SYSTEM_PROMPT,
        voice: selectedVoice
      },
      callbacks: {
        onopen: () => {
          console.log(`✅ [${connectionId}] Live session opened`);
          liveSessionOpen = true;
          // Bereits gesammelte PCM-Frames senden
          if (pendingPcmQueue.length) {
            try {
              console.log(`📤 [${connectionId}] Flushing ${pendingPcmQueue.length} queued PCM frames`);
              for (const base64 of pendingPcmQueue) {
                session.sendRealtimeInput({
                  audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              }
            } catch (e) {
              console.error(`❌ [${connectionId}] Flush error:`, e?.message || e);
            } finally {
              pendingPcmQueue = [];
            }
          }
        },
        onmessage: (message) => {
          try {
            // Audio data (base64 PCM16 @24kHz)
            if (message?.data) {
              if (!sentHeader) {
                try { ws.send(JSON.stringify({ type: 'audio_header', data: { mime: 'audio/wav' } })); } catch {}
                sentHeader = true;
              }
              const chunkBuf = Buffer.from(message.data, 'base64');
              receivedPcmChunks.push(chunkBuf);
            }
            // Turn completion → sende WAV an Client und "end"
            if (message?.serverContent?.turnComplete) {
              const wav = wrapPcmChunksToWav(receivedPcmChunks, 24000);
              try {
                ws.send(JSON.stringify({ type: 'audio_chunk', data: { base64: wav.toString('base64'), format: 'wav' } }));
                ws.send(JSON.stringify({ type: 'end', data: {} }));
              } catch (e) {
                console.error(`❌ [${connectionId}] Failed to send WAV to client:`, e.message);
              }
              // Reset for next turn
              receivedPcmChunks = [];
              sentHeader = false;
            }
          } catch (e) {
            console.error(`❌ [${connectionId}] Live onmessage error:`, e);
          }
        },
        onerror: (e) => {
          console.error(`❌ [${connectionId}] Live session error:`, e?.message || e);
          try { ws.send(JSON.stringify({ type: 'error', data: { message: e?.message || 'Live session error' } })); } catch {}
        },
        onclose: (e) => {
          console.log(`🔚 [${connectionId}] Live session closed:`, e?.reason || '');
          liveSessionOpen = false;
        }
      }
    });
    liveSession = session;
  }

  function wrapPcmChunksToWav(pcmChunks, sampleRate) {
    const pcm = Buffer.concat(pcmChunks);
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcm.length;
    const fileSize = 36 + dataSize;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return Buffer.concat([header, pcm]);
  }
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