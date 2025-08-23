// server.js - Minimal Gemini Live Audio Bridge (23.08.2025)
// Behebt "Upgrade Required" Fehler durch Service von statischen Files via Express
import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

const PORT = process.env.PORT || 8080;
const KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

if (!KEY) {
  console.error('[BOOT] ❌ Kein GOOGLE_API_KEY/GEMINI_API_KEY gesetzt!');
  process.exit(1);
}
console.log('[BOOT] ✅ API-Key gefunden:', KEY ? `${KEY.slice(0,8)}...${KEY.slice(-4)}` : 'NONE');

// System Prompt für Restaurant
const SYSTEM_PROMPT = [
  'Du bist der freundliche Telefon‑Assistent des Restaurants "Bella Vista" in München.',
  'Aufgabe: Kunden am Telefon begrüßen, Reservierungen aufnehmen, Fragen zur Speisekarte beantworten.',
  'Beantworte stets kurz und natürlich. Max. 1–2 Sätze pro Antwort.',
  'Details: Öffnungszeiten Mo–Fr 12:00–22:00, Sa 12:00–23:00, So geschlossen.',
  'Telefon: +49 89 1234567, Adresse: Sonnenstraße 12, 80331 München.'
].join('\n');


// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// Statische Files aus dem 'dist' Ordner serven
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/health', (_req, res) => res.status(200).send('ok'));

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server, perMessageDeflate: false }); // An den HTTP-Server binden

wss.on('listening', () => console.log(`🔗 WebSocket-Erweiterung für Server auf Port ${PORT} bereit.`));

const ai = new GoogleGenAI({ apiKey: KEY });

async function openGeminiSession(ws, id) {
  try {
    console.log(`[${id}] 🔧 Öffne Gemini Live session...`);
    const session = await ai.live.connect({
      model: 'gemini-2.5-flash-preview-native-audio-dialog',
      config: { responseModalities: [Modality.AUDIO], systemInstruction: SYSTEM_PROMPT },
      callbacks: {
        onopen: () => {
          console.log(`[${id}] ✅ Gemini session open (AUDIO modality)`);
          ws.send(JSON.stringify({ type: 'session_ready' })); // <-- ganz wichtig
          console.log(`[${id}] 🚀 Session ready - Client kann Audio senden`);
        },
        onmessage: (msg) => {
          // Audio kommt Base64-kodiert als 24kHz PCM zurück
          if (msg?.data) {
            console.log(`[${id}] 📥 Gemini audio response ${msg.data.length} chars`);
            ws.send(JSON.stringify({ type: 'audio_out', data: msg.data }));
          }
          if (msg?.serverContent?.turnComplete) {
            console.log(`[${id}] 🔄 Turn complete`);
            ws.send(JSON.stringify({ type: 'turn_complete' }));
          }
        },
        onerror: (e) => {
          console.error(`[${id}] ❌ Gemini onerror`, e?.message || e);
          ws.send(JSON.stringify({ type: 'server_error', where: 'onerror', detail: String(e?.message || e) }));
        },
        onclose: (e) => console.log(`[${id}] ⛔ Gemini closed`, e?.reason || ''),
      }
    });
    return session;
  } catch (e) {
    console.error(`[${id}] ❌ connect failed`, e);
    ws.send(JSON.stringify({ type: 'server_error', where: 'connect', detail: String(e?.message || e) }));
    return null;
  }
}

wss.on('connection', async (ws) => {
  const id = Date.now();
  console.log(`[${id}] 🌐 WebSocket client connected.`);

  let session;
  let recording = false;
  let bytesIn = 0;

  // Session sofort öffnen, damit der Client session_ready früh bekommt
  session = await openGeminiSession(ws, id);

  ws.on('message', async (raw) => {
    try {
      // Normalisiere: immer erst versuchen, JSON zu lesen (auch bei Buffer)
      const asText = Buffer.isBuffer(raw) ? raw.toString('utf8') : (typeof raw === 'string' ? raw : '');
      if (asText) {
        try {
          console.log(`[${id}] 📩 text>`, asText.slice(0, 120));
          const m = JSON.parse(asText);

          if (m.type === 'start_audio') {
            session = session || await openGeminiSession(ws, id);
            if (!session) return; // Fehler schon an Client geschickt
            recording = true;
            console.log(`[${id}] ▶️ start_audio ack`);
            return;
          }
          if (m.type === 'audio_chunk_b64') {
            if (!recording || !session) return;
            const buf = Buffer.from(m.data, 'base64');
            bytesIn += buf.length;
            console.log(`[${id}] 📤 → Gemini audio ${buf.length} bytes (b64)`);
            session.sendRealtimeInput({ audio: { data: m.data, mimeType: 'audio/pcm;rate=16000' } });
            return;
          }
          if (m.type === 'stop_audio') {
            recording = false;
            session?.sendRealtimeInput({ audioStreamEnd: true });
            console.log(`[${id}] ⏹ stop_audio ack`);
            return;
          }
          if (m.type === 'say') {
            session = session || await openGeminiSession(ws, id);
            if (!session) return;
            console.log(`[${id}] 💬 Text-Trigger: "${m.text || 'Hallo'}"`);
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: m.text || 'Sag deutlich „Hallo".' }] }],
              turnComplete: true
            });
            return;
          }
        } catch (e) {
          // Kein valides JSON → als Binär behandeln (falls Buffer)
          if (!Buffer.isBuffer(raw)) throw e;
        }
      }

      // Binär-Frames: rohes Int16-PCM little-endian @ 16kHz
      if (Buffer.isBuffer(raw)) {
        console.log(`[${id}] 📦 bin> true ${raw.length}`);
        if (!recording || !session) return;
        bytesIn += raw.length;
        const b64 = raw.toString('base64');
        session.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
        return;
      }
    } catch (e) {
      console.error(`[${id}] 🧨 onmessage error`, e);
      ws.send(JSON.stringify({ type: 'server_error', where: 'onmessage', detail: String(e?.message || e) }));
    }
  });

  // Optional: Keepalive (Fly trennt Idle-WS gern)
  const ka = setInterval(() => { try { ws.ping(); } catch {} }, 25000);
  
  ws.on('close', () => {
    console.log(`[${id}] 🔚 closed, bytesIn=${bytesIn}`);
    clearInterval(ka);
    session?.close?.();
  });
});

// --- Server starten ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Kombinierter HTTP/WebSocket Server läuft auf http://0.0.0.0:${PORT}`);
});
