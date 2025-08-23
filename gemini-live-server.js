// server.js - Minimal Gemini Live Audio Bridge (23.08.2025)
import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { GoogleGenerativeAI, Modality } from '@google/genai';

const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ FATAL: GEMINI_API_KEY nicht gesetzt');
  process.exit(1);
}

// System Prompt für Restaurant
const SYSTEM_PROMPT = [
  'Du bist der freundliche Telefon‑Assistent des Restaurants "Bella Vista" in München.',
  'Aufgabe: Kunden am Telefon begrüßen, Reservierungen aufnehmen, Fragen zur Speisekarte beantworten.',
  'Beantworte stets kurz und natürlich. Max. 1–2 Sätze pro Antwort.',
  'Details: Öffnungszeiten Mo–Fr 12:00–22:00, Sa 12:00–23:00, So geschlossen.',
  'Telefon: +49 89 1234567, Adresse: Sonnenstraße 12, 80331 München.'
].join('\n');

const wss = new WebSocketServer({
  port: PORT,
  perMessageDeflate: false, // wichtig für Audio
  host: '0.0.0.0' // Fly.io
});

wss.on('listening', () => console.log(`🔗 WebSocket server ready on 0.0.0.0:${PORT}`));

wss.on('connection', async (ws) => {
  const id = Date.now();
  console.log(`[${id}] 🌐 WebSocket client connected.`);

  let session;
  let recording = false;
  let bytesIn = 0;

  const ai = new GoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
  const model = 'gemini-2.5-flash-preview-native-audio-dialog';
  const config = {
    responseModalities: [Modality.AUDIO], // zwingend für Audiooutput
    systemInstruction: SYSTEM_PROMPT,
  };

  async function openSessionOnce() {
    if (session) return;
    console.log(`[${id}] 🔧 Öffne Gemini Live session...`);
    session = await ai.live.connect({
      model,
      config,
      callbacks: {
        onopen: () => console.log(`[${id}] ✅ Gemini session open (AUDIO modality)`),
        onmessage: (m) => {
          // Audio kommt als Base64-Data in m.data (PCM 24kHz)
          if (m?.data) {
            console.log(`[${id}] 📥 Gemini audio response ${m.data.length} chars`);
            ws.send(JSON.stringify({ type: 'audio_out', data: m.data }));
          }
          if (m?.serverContent?.turnComplete) {
            console.log(`[${id}] 🔄 Turn complete`);
            ws.send(JSON.stringify({ type: 'turn_complete' }));
          }
        },
        onerror: (e) => console.error(`[${id}] ❌ Gemini error:`, e?.message || e),
        onclose: (e) => console.log(`[${id}] ⛔ Gemini closed:`, e?.reason),
      }
    });
    ws.send(JSON.stringify({ type: 'session_ready' })); // Client darf senden
    console.log(`[${id}] 🚀 Session ready - Client kann Audio senden`);
  }

  ws.on('message', async (raw) => {
    try {
      // Text-Frames: Steuerkommandos & Base64
      if (typeof raw === 'string') {
        const msg = JSON.parse(raw);
        if (msg.type === 'start_audio') {
          await openSessionOnce();
          recording = true;
          console.log(`[${id}] ▶️ start_audio`);
          return;
        }
        if (msg.type === 'stop_audio') {
          recording = false;
          session?.sendRealtimeInput({ audioStreamEnd: true });
          console.log(`[${id}] ⏹ stop_audio`);
          return;
        }
        if (msg.type === 'audio_chunk_b64') {
          if (!recording || !session) return;
          const buf = Buffer.from(msg.data, 'base64');
          bytesIn += buf.length;
          console.log(`[${id}] 📤 → Gemini audio ${buf.length} bytes (b64)`);
          session.sendRealtimeInput({ audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' } });
          return;
        }
        if (msg.type === 'say') {
          await openSessionOnce();
          // Sanity-Test: Reine Text-Antwort
          console.log(`[${id}] 💬 Text-Trigger: "${msg.text || 'Hallo'}"`);
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: msg.text || 'Sag Hallo.' }] }],
            turnComplete: true
          });
          return;
        }
      } else if (Buffer.isBuffer(raw)) {
        // Binary-Frames: rohes Int16-PCM little-endian @ 16kHz
        if (!recording || !session) return;
        bytesIn += raw.length;
        console.log(`[${id}] 📤 → Gemini audio ${raw.length} bytes (binary), head=${raw.readInt16LE(0)}`);
        const b64 = raw.toString('base64');
        session.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
        return;
      }
    } catch (e) {
      console.error(`[${id}] parse/error`, e);
    }
  });

  ws.on('close', () => {
    console.log(`[${id}] 🔚 closed, bytesIn=${bytesIn}`);
    session?.close?.();
  });
});

console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
