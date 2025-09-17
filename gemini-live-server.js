// server.js - Minimal Gemini Live Audio Bridge (23.08.2025)
// Behebt "Upgrade Required" Fehler durch Service von statischen Files via Express
import 'dotenv/config';
import express from 'express';
import Database from 'better-sqlite3';
import os from 'os';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';

// ===== Audio Helpers for Twilio Media Streams (PCM16 ↔ μ-law, Resample) =====
function muLawEncodeSample(pcmSample) {
  // pcmSample: Int16 (-32768..32767)
  const MAX = 32768;
  const MU = 255;
  const x = Math.max(-MAX, Math.min(MAX, pcmSample)) / MAX; // normalize to [-1,1]
  const sign = x < 0 ? 0x80 : 0x00;
  const abs = Math.abs(x);
  const muEncoded = Math.log(1 + MU * abs) / Math.log(1 + MU);
  let quantized = ((muEncoded * 127) | 0) & 0x7F;
  return (~(sign | quantized)) & 0xFF; // 8-bit μ-law
}

function resamplePCM16(int16Array, inRate, outRate) {
  if (inRate === outRate) return int16Array;
  const ratio = outRate / inRate;
  const outLen = Math.floor(int16Array.length * ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcIndex = i / ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, int16Array.length - 1);
    const t = srcIndex - i0;
    out[i] = ((1 - t) * int16Array[i0] + t * int16Array[i1]) | 0;
  }
  return out;
}

function bytesToInt16LE(buf) {
  const len = Math.floor(buf.length / 2);
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = buf.readInt16LE(i * 2);
  }
  return out;
}

function encodePCM16ToMuLaw8k(pcmInt16, sourceRate) {
  const pcm8k = resamplePCM16(pcmInt16, sourceRate, 8000);
  const out = Buffer.alloc(pcm8k.length);
  for (let i = 0; i < pcm8k.length; i++) out[i] = muLawEncodeSample(pcm8k[i]);
  return out;
}

// ---- μ-law (Twilio) ⇄ PCM16 Helfer ----
function muLawDecodeSample(u) {
  // u: 0..255
  const MU = 255;
  u = ~u & 0xFF;
  const sign = (u & 0x80) ? -1 : 1;
  const quant = u & 0x7F;
  const x = Math.pow(1 + MU, quant / 127) - 1;
  const normalized = x / MU;
  // Zurück in Int16
  const sample = Math.max(-1, Math.min(1, normalized)) * 32768;
  return (sample * sign) | 0;
}

function muLawBufferToPCM16(buf) {
  const out = new Int16Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = muLawDecodeSample(buf[i]);
  return out;
}

function int16ToBytes(int16Arr) {
  const out = Buffer.alloc(int16Arr.length * 2);
  for (let i = 0; i < int16Arr.length; i++) out.writeInt16LE(int16Arr[i], i * 2);
  return out;
}

function chunkBuffer(buf, size) {
  const chunks = [];
  for (let i = 0; i < buf.length; i += size) chunks.push(buf.slice(i, i + size));
  return chunks;
}

function parsePcmRateFromMime(mime) {
  const m = typeof mime === 'string' ? mime.match(/rate=(\d+)/i) : null;
  return m ? parseInt(m[1], 10) : 16000; // fallback
}

function sendTwilioOutboundAudio(ws, streamSid, base64PcmLE, mime) {
  if (!streamSid) return;
  const sourceRate = parsePcmRateFromMime(mime);
  const pcmBytes = Buffer.from(base64PcmLE, 'base64');
  const pcm16 = bytesToInt16LE(pcmBytes);
  const mulaw8k = encodePCM16ToMuLaw8k(pcm16, sourceRate);
  // Twilio erwartet ~20ms Frames @8kHz => 160 Samples/Bytes pro Frame
  const frames = chunkBuffer(mulaw8k, 160);
  for (const frame of frames) {
    ws.send(JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: frame.toString('base64') }
    }));
  }
}

const PORT = process.env.PORT || 8080;
const KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const PIPELINE_BACKEND = (process.env.PIPELINE_BACKEND || '').toLowerCase(); // e.g. 'pipecat'
const PIPELINE_WS_URL = process.env.PIPELINE_WS_URL || process.env.PIPECAT_WS_URL || '';
const PIPECAT_PCM_RATE = parseInt(process.env.PIPECAT_PCM_RATE || '24000', 10);
if (!KEY) {
  console.warn('[BOOT] ⚠️ Kein GOOGLE_API_KEY/GEMINI_API_KEY gesetzt. Server startet, aber Gemini ist deaktiviert.');
} else {
  console.log('[BOOT] ✅ API-Key gefunden:', `${KEY.slice(0,8)}...${KEY.slice(-4)}`);
}

// Diagnose-/Audio-Parameter (müssen vor Logging definiert sein)
const DIAG_LOOPBACK_MS = parseInt(process.env.TWILIO_LOOPBACK_MS || '0', 10); // 0=aus
const DIAG_TESTTONE_MS = parseInt(process.env.TWILIO_TESTTONE_MS || '0', 10); // 0=aus
const TWILIO_AGGREGATE_MS = parseInt(process.env.TWILIO_AGGREGATE_MS || '300', 10); // min. 300ms pro Outbound-Chunk
const TURN_END_SILENCE_MS = parseInt(process.env.TURN_END_SILENCE_MS || '500', 10); // Stille-Dauer bis Turn-Ende
const VAD_RMS_THRESHOLD = parseInt(process.env.VAD_RMS_THRESHOLD || '450', 10); // ~0..32767

console.log('[BOOT] ⚙️ Audio settings:', {
  DIAG_TESTTONE_MS,
  DIAG_LOOPBACK_MS,
  TURN_END_SILENCE_MS,
  VAD_RMS_THRESHOLD,
  TWILIO_AGGREGATE_MS
});
console.log('[BOOT] 🧩 Pipeline:', { PIPELINE_BACKEND, PIPELINE_WS_URL: PIPELINE_WS_URL ? '(set)' : '(unset)' });

// Allgemeiner System‑Prompt (Deutsch, B2B, Voice Agents mit Funktionsaufrufen)
const SYSTEM_PROMPT = [
  'Sprich ausschließlich Deutsch. Du bist ein professioneller Voice‑Agent für Unternehmen.',
  'Ziel: Telefonate effizient und natürlich führen. Antworte präzise, freundlich und kurz (1–2 Sätze).',
  'Wenn der Anwendungsfall es erfordert, frage gezielt nach fehlenden Informationen.',
  'Unterstützte Funktionsaufrufe (je nach Kunde konfigurierbar):',
  '- Terminbuchungen und Kalender‑Integration (Google/Microsoft, ICS).',
  '- E‑Mail und SMS versenden (z. B. Bestätigungen, Benachrichtigungen).',
  '- Bestellungen entgegennehmen und per SMS/E-Mail/Webhook weiterleiten.',
  '- Leads qualifizieren und Informationen ins CRM schreiben/aktualisieren.',
  '- Daten aus Datenbanken/REST‑APIs abfragen (Kundendaten, Verfügbarkeiten, Preise).',
  '- Call‑Routing (z. B. nur bei besetzter Leitung annehmen oder 100% aller Anrufe).',
  'Richtlinien:',
  '- Keine vertraulichen Daten vorlesen. Frage bei Sensiblem nach Opt‑in.',
  '- Bleibe immer sachlich, hilfreich und respektvoll.',
  '- Falls dir Informationen fehlen, frage nach oder gib transparent an, was du brauchst.'
].join('\n');

// First-Turn-Guard entfernt – VAD/Turn-Handling übernimmt Steuerung

function generateMuLawTone(durationMs, freqHz = 1000, sampleRate = 8000) {
  const totalSamples = Math.floor((durationMs / 1000) * sampleRate);
  const ulaw = Buffer.alloc(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const pcm = Math.round(32767 * Math.sin(2 * Math.PI * freqHz * t));
    ulaw[i] = muLawEncodeSample(pcm);
  }
  return chunkBuffer(ulaw, 160); // 20ms Frames
}

// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// JSON Body Parser für Voice Agent API
app.use(express.json({ limit: '6mb' }));

// Twilio Webhook Form-Parser
app.use(express.urlencoded({ extended: false }));

// Voice Agent API Route
app.post('/api/voice-agent', async (req, res) => {
  try {
    console.log('📨 Voice Agent Request:', req.body?.audio?.length || 0, 'chars');
    
    // Import voice agent module
    const { default: voiceAgentHandler } = await import('./api/voice-agent.js');
    
    // Create mock Vercel-style request/response
    const mockReq = { 
      method: 'POST', 
      body: req.body,
      headers: req.headers 
    };
    const mockRes = {
      status: (code) => ({ json: (data) => res.status(code).json(data) }),
      json: (data) => res.json(data),
      setHeader: (name, value) => res.setHeader(name, value),
      write: (chunk) => res.write(chunk),
      end: (chunk) => res.end(chunk)
    };
    
    await voiceAgentHandler(mockReq, mockRes);
  } catch (error) {
    console.error('❌ Voice Agent Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Twilio Webhook Route für eingehende Anrufe
app.post('/twilio/incoming', (req, res) => {
  console.log('📞 Twilio incoming call webhook triggered');
  console.log('📋 Twilio request body:', req.body);
  
  // TwiML Response für Twilio - verbindet den Anruf mit unserem WebSocket Voice Agent
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://agentur.fly.dev?source=twilio"/>
  </Connect>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
  
  console.log('📤 TwiML response sent - connecting to WebSocket voice agent');
});

// Health check für Twilio Webhook
app.get('/twilio/incoming', (req, res) => {
  console.log('🔍 Twilio webhook health check');
  res.json({ 
    status: 'ready', 
    service: 'Vocaris AI Voice Agent',
    webhook_url: 'https://agentur.fly.dev/twilio/incoming',
    websocket_url: 'wss://agentur.fly.dev',
    timestamp: new Date().toISOString()
  });
});

// Statische Files aus dem 'dist' Ordner serven
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/health', (_req, res) => res.status(200).send('ok'));
// Diagnose Pipecat-Verbindung
app.get('/diag/pipecat', async (_req, res) => {
  if (PIPELINE_BACKEND !== 'pipecat') return res.status(400).json({ ok: false, reason: 'PIPELINE_BACKEND!=pipecat' });
  if (!PIPELINE_WS_URL) return res.status(400).json({ ok: false, reason: 'PIPELINE_WS_URL unset' });
  try {
    const url = PIPELINE_WS_URL;
    const start = Date.now();
    const sock = new WebSocket(url);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { sock.terminate(); } catch {}
      res.status(504).json({ ok: false, reason: 'timeout', ms: Date.now() - start });
    }, 2000);
    sock.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      res.json({ ok: true, ms: Date.now() - start });
    });
    sock.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.status(502).json({ ok: false, reason: String(e?.message || e) });
    });
  } catch (e) {
    res.status(500).json({ ok: false, reason: String(e?.message || e) });
  }
});

// --- Bookings API (SQLite) ---
// Persistente DB: bevorzugt Volume unter /data; konfigurierbar via DB_PATH
const defaultDbPath = process.env.DB_PATH || '/data/bookings.sqlite';
try { fs.mkdirSync(require('path').dirname(defaultDbPath), { recursive: true }); } catch {}
const db = new Database(defaultDbPath);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  meetingType TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(date, time);
`);

function isValidDate(yyyyMmDd) {
  return typeof yyyyMmDd === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd);
}
function isValidTime(hhMm) {
  return typeof hhMm === 'string' && /^\d{2}:\d{2}$/.test(hhMm);
}

app.get('/api/bookings', (req, res) => {
  try {
    const from = isValidDate(req.query.from) ? req.query.from : '0000-01-01';
    const to = isValidDate(req.query.to) ? req.query.to : '9999-12-31';
    const rows = db.prepare(
      'SELECT id, name, email, phone, meetingType, date, time, createdAt FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date, time'
    ).all(from, to);
    res.json(rows);
  } catch (e) {
    console.error('[API] /api/bookings GET error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

app.post('/api/bookings', (req, res) => {
  try {
    // Optional shared secret for Voice Agent
    const clientSecret = req.header('x-agent-secret');
    const serverSecret = process.env.AGENT_SECRET;
    if (clientSecret && serverSecret && clientSecret !== serverSecret) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { name, email, phone, meetingType, date, time } = req.body || {};
    if (!name || !email || !meetingType || !date || !time || !isValidDate(date) || !isValidTime(time)) {
      return res.status(400).json({ error: 'invalid_payload' });
    }

    const taken = db.prepare('SELECT 1 FROM bookings WHERE date=? AND time=?').get(date, time);
    if (taken) return res.status(409).json({ error: 'slot_taken' });

    const id = Date.now().toString();
    db.prepare(
      'INSERT INTO bookings (id, name, email, phone, meetingType, date, time, createdAt) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, String(name), String(email), phone ? String(phone) : null, String(meetingType), String(date), String(time), new Date().toISOString());

    // Fire-and-forget SMS Notification via Twilio REST API (optional)
    (async () => {
      try {
        const normalizeE164 = (s) => typeof s === 'string' ? s.replace(/[^\d+]/g, '') : s;
        const to = normalizeE164(process.env.NOTIFY_SMS_TO);
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const from = normalizeE164(process.env.TWILIO_FROM || process.env.TWILIO_FROM_NUMBER); // Verified Twilio number
        if (to && sid && token && from && /^\+\d{6,15}$/.test(to) && /^\+\d{6,15}$/.test(from)) {
          const auth = Buffer.from(`${sid}:${token}`).toString('base64');
          const body = new URLSearchParams({
            To: to,
            From: from,
            Body: `Neue Buchung: ${name} (${email}${phone ? ", "+phone : ''}) • ${date} ${time} • Typ: ${meetingType}`
          });
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body
          }).catch(() => {});
        }
      } catch {}
    })();

    res.json({ success: true, id });
  } catch (e) {
    console.error('[API] /api/bookings POST error', e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server, perMessageDeflate: false }); // An den HTTP-Server binden

wss.on('listening', () => console.log(`🔗 WebSocket-Erweiterung für Server auf Port ${PORT} bereit.`));

let ai = null;
if (KEY) {
  try { ai = new GoogleGenAI({ apiKey: KEY }); }
  catch (e) { console.warn('[BOOT] ⚠️ GoogleGenAI init failed:', e?.message || e); }
}

async function openGeminiSession(ws, id) {
  try {
    if (PIPELINE_BACKEND === 'pipecat') {
      console.log(`[${id}] 🔧 Verwende Pipecat Pipeline Bridge über ${PIPELINE_WS_URL || '(local)'}`);
      return { __pipecat: true }; // Dummy handle; Kommunikation erfolgt unten über _pipecatSocket
    }
    if (!ai) { console.warn(`[${id}] ⚠️ Kein Gemini-Client initialisiert (fehlender KEY).`); return null; }
    console.log(`[${id}] 🔧 Öffne Gemini Live session...`);
    const session = await ai.live.connect({
      model: 'gemini-2.5-flash-preview-native-audio-dialog',
      config: { responseModalities: [Modality.AUDIO], systemInstruction: SYSTEM_PROMPT },
      callbacks: {
        onopen: () => {
          console.log(`[${id}] ✅ Gemini session open (AUDIO modality)`);
          console.log(`[${id}] 🚀 Session ready - Client kann Audio senden`);
        },
        onmessage: (msg) => {
          try {
            // Diagnose: Struktur ausgeben
            const topKeys = msg && typeof msg === 'object' ? Object.keys(msg) : typeof msg;
            console.log(`[${id}] 🔔 onmessage keys:`, topKeys);
            
            // Detaillierte serverContent Analyse
            if (msg?.serverContent) {
              console.log(`[${id}] 🔍 serverContent struktur:`, JSON.stringify(msg.serverContent, null, 2).slice(0, 500));
            }

            // 1) Direkte data-Payload (Base64 PCM)
            if (msg?.data && typeof msg.data === 'string' && msg.data.length > 0) {
              console.log(`[${id}] 📥 Gemini audio response (data) ${msg.data.length} chars`);
              if (ws._isTwilio) {
                ws._twilioSendAudio?.(msg.data, 'audio/pcm;rate=24000');
              } else {
              ws.send(JSON.stringify({ type: 'audio_out', data: msg.data }));
              }
            }

            // 2) modelContent → parts → inlineData (Base64 PCM)
            const partsA = msg?.modelContent?.[0]?.parts;
            if (Array.isArray(partsA)) {
              for (const p of partsA) {
                const inline = p?.inlineData;
                if (inline?.mimeType?.startsWith('audio/pcm') && typeof inline?.data === 'string') {
                  console.log(`[${id}] 📥 Gemini audio inlineData ${inline.data.length} chars @ ${inline.mimeType}`);
                  if (ws._isTwilio) {
                    console.log(`[${id}] 📞➡️ Calling _twilioSendAudio for modelContent audio`);
                    ws._twilioSendAudio?.(inline.data, inline.mimeType);
                  } else {
                    ws.send(JSON.stringify({ type: 'audio_out', data: inline.data }));
                  }
                }
                if (p?.text) {
                  console.log(`[${id}] 💬 Gemini text:`, String(p.text).slice(0, 120));
                }
              }
            }

            // 3) candidates[0].content.parts style
            const partsB = msg?.candidates?.[0]?.content?.parts;
            if (Array.isArray(partsB)) {
              for (const p of partsB) {
                const inline = p?.inlineData;
                if (inline?.mimeType?.startsWith('audio/pcm') && typeof inline?.data === 'string') {
                  console.log(`[${id}] 📥 Gemini audio candidate inlineData ${inline.data.length} chars @ ${inline.mimeType}`);
                  if (ws._isTwilio) {
                    console.log(`[${id}] 📞➡️ Calling _twilioSendAudio for candidate audio`);
                    ws._twilioSendAudio?.(inline.data, inline.mimeType);
                  } else {
                    ws.send(JSON.stringify({ type: 'audio_out', data: inline.data }));
                  }
                }
                if (p?.text) {
                  console.log(`[${id}] 💬 Gemini text (cand):`, String(p.text).slice(0, 120));
                }
              }
            }

            // 4) serverContent → modelTurn → parts style (das ist was wir bekommen!)
            const partsC = msg?.serverContent?.modelTurn?.parts;
            if (Array.isArray(partsC)) {
              for (const p of partsC) {
                const inline = p?.inlineData;
                if (inline?.mimeType?.startsWith('audio/pcm') && typeof inline?.data === 'string') {
                  console.log(`[${id}] 📥 Gemini audio serverContent.modelTurn inlineData ${inline.data.length} chars @ ${inline.mimeType}`);
                  console.log(`[${id}] 📤 WebSocket readyState: ${ws.readyState} (sending audio_out)`);
                  try {
                    if (ws._isTwilio) {
                      console.log(`[${id}] 📞➡️ Calling _twilioSendAudio for serverContent audio`);
                      ws._twilioSendAudio?.(inline.data, inline.mimeType);
                    } else {
                      ws.send(JSON.stringify({ type: 'audio_out', data: inline.data }));
                    }
                    console.log(`[${id}] ✅ Audio_out sent successfully`);
                  } catch (e) {
                    console.error(`[${id}] ❌ Failed to send audio_out:`, e);
                  }
                }
                if (p?.text) {
                  console.log(`[${id}] 💬 Gemini text (server):`, String(p.text).slice(0, 120));
                }
              }
            }

            if (msg?.serverContent?.turnComplete) {
              console.log(`[${id}] 🔄 Turn complete`);
              if (!ws._isTwilio) ws.send(JSON.stringify({ type: 'turn_complete' }));
            }
          } catch (err) {
            console.error(`[${id}] ❌ onmessage parse error`, err);
          }
        },
        onerror: (e) => {
          console.error(`[${id}] ❌ Gemini onerror`, e?.message || e);
          if (!ws._isTwilio) ws.send(JSON.stringify({ type: 'server_error', where: 'onerror', detail: String(e?.message || e) }));
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

function attachTwilioHelpers(ws, id, getTwilioStreamSid) {
  if (ws._twilioSendAudio) return; // Already attached
  console.log(`[${id}] ➕ Attaching Twilio audio helpers to WebSocket.`);

  // Aggregator für PCM (z. B. 24 kHz) → bündelt ≥ AGGREGATE_MS, bevor zu μ-law konvertiert wird
  ws._pcmAgg = { buf: Buffer.alloc(0), rate: 24000 };
  ws._enqueuePcm = (b64, mime) => {
    const rate = parsePcmRateFromMime(mime) || 24000;
    if (!ws._pcmAgg || ws._pcmAgg.rate !== rate) ws._pcmAgg = { buf: Buffer.alloc(0), rate };
    const bytes = Buffer.from(b64, 'base64');
    ws._pcmAgg.buf = Buffer.concat([ws._pcmAgg.buf, bytes]);
    const minBytes = Math.floor(rate * 2 * (TWILIO_AGGREGATE_MS / 1000));
    while (ws._pcmAgg.buf.length >= minBytes) {
      const chunk = ws._pcmAgg.buf.slice(0, minBytes);
      ws._pcmAgg.buf = ws._pcmAgg.buf.slice(minBytes);
      ws._twilioSendAudio(chunk.toString('base64'), `audio/pcm;rate=${rate}`);
    }
  };
  ws._flushPcmAgg = () => {
    if (ws._pcmAgg && ws._pcmAgg.buf.length > 0) {
      const { rate, buf } = ws._pcmAgg;
      ws._pcmAgg.buf = Buffer.alloc(0);
      ws._twilioSendAudio(buf.toString('base64'), `audio/pcm;rate=${rate}`);
    }
  };

  // Outbound Frame Queue mit 20ms Pacing + Mark-Burst
  ws._outboundQueue = [];
  ws._outboundBurstActive = false;
  ws._outboundTimer = setInterval(() => {
    try {
      const twilioStreamSid = getTwilioStreamSid();
      // Sende nur, wenn der Stream wirklich gestartet wurde
      if (!twilioStreamSid || !ws._twilioStarted || ws.readyState !== 1) return;
      if (ws._outboundQueue.length === 0) {
        if (ws._outboundBurstActive) {
          // Burst ist zu Ende – optional Mark-Ende schicken (nicht zwingend)
        }
        ws._outboundBurstActive = false;
        return;
      }
      const frame = ws._outboundQueue.shift();
      ws.send(JSON.stringify({ event: 'media', streamSid: twilioStreamSid, media: { payload: frame.toString('base64') } }));
    } catch {}
  }, 20);

  ws._twilioSendAudio = (base64PcmLE, mime) => {
    const twilioStreamSid = getTwilioStreamSid();
    if (!twilioStreamSid || !ws._twilioStarted) {
      console.warn(`[${id}] ⚠️ _twilioSendAudio called but twilioStreamSid is not set.`);
      return;
    }
    // Sende Mark bei neuem Burst
    if (!ws._outboundBurstActive) {
      try {
        ws.send(JSON.stringify({ event: 'mark', streamSid: twilioStreamSid, mark: { name: 'agent-response-start' } }));
      } catch {}
      ws._outboundBurstActive = true;
    }
    const rate = parsePcmRateFromMime(mime);
      const pcmBytes = Buffer.from(base64PcmLE, 'base64');
      const pcm16 = bytesToInt16LE(pcmBytes);
      const mulaw8k = encodePCM16ToMuLaw8k(pcm16, rate);
      const frames = chunkBuffer(mulaw8k, 160);
    console.log(`[${id}] 📤 Enqueue ${frames.length} frames to Twilio stream ${twilioStreamSid}`);
    for (const f of frames) ws._outboundQueue.push(f);
  };
}

wss.on('connection', async (ws, req) => {
  const id = Date.now();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const source = url.searchParams.get('source');
  let isTwilio = source === 'twilio';
  ws._isTwilio = isTwilio;
  
  console.log(`[${id}] 🌐 WebSocket client connected ${isTwilio ? '(📞 Twilio Call)' : '(💻 Web Client)'}`);

  let session;
  let recording = false;
  let bytesIn = 0;
  let chunkCount = 0;
  let inactivityTimer = null;
  let twilioStreamSid = null;
  const getTwilioStreamSid = () => twilioStreamSid;
  let silenceFrames = 0;
  const framesPerSecond = 50; // 20ms pro Frame @8kHz von Twilio
  const silenceFramesNeeded = Math.max(1, Math.floor((TURN_END_SILENCE_MS / 1000) * framesPerSecond));

  // Kein First‑Turn Guard – reine VAD/Turn-Steuerung

  // Session sofort öffnen, damit der Client session_ready früh bekommt
  session = await openGeminiSession(ws, id);
  if (PIPELINE_BACKEND === 'pipecat') {
    // Stelle Bridge zu Pipecat WS her
    try {
      const targetUrl = PIPELINE_WS_URL || `ws://127.0.0.1:8765`; // Beispiel
      console.log(`[${id}] 🔌 Connect Pipecat WS: ${targetUrl}`);
      const pws = new WebSocket(targetUrl);
      ws._pipecatSocket = pws;
      pws.on('open', () => console.log(`[${id}] ✅ Pipecat connected`));
      pws.on('error', (e) => console.warn(`[${id}] ⚠️ Pipecat error:`, e?.message || e));
      pws.on('close', () => console.log(`[${id}] ⛔ Pipecat closed`));
      // Antworten von Pipecat (Base64 PCM @ PIPECAT_PCM_RATE)
      pws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === 'audio_out' && typeof msg?.data === 'string') {
            if (ws._isTwilio) {
              ws._twilioSendAudio?.(msg.data, `audio/pcm;rate=${PIPECAT_PCM_RATE}`);
            } else {
              ws.send(JSON.stringify({ type: 'audio_out', data: msg.data }));
            }
          }
        } catch {}
      });
    } catch (e) {
      console.warn(`[${id}] ⚠️ Pipecat init failed:`, e?.message || e);
    }
  }

  // Für Twilio: outbound helper auf dem Socket bereitstellen
  if (isTwilio) {
    attachTwilioHelpers(ws, id, getTwilioStreamSid);
  }

  function scheduleTurnEnd() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      try {
        if (!session) return;
        console.log(`[${id}] ⛳ Inaktivität erreicht – sende audioStreamEnd + turnComplete (chunks=${chunkCount})`);
        if (PIPELINE_BACKEND === 'pipecat') {
          if (ws._pipecatSocket?.readyState === 1) {
            ws._pipecatSocket.send(JSON.stringify({ type: 'turn_end' }));
          } else {
            console.warn(`[${id}] ⚠️ turn_end skipped (Pipecat socket not ready)`);
          }
        } else {
          session.sendRealtimeInput({ media: [], audioStreamEnd: true, turnComplete: true });
        }
        recording = false;
        chunkCount = 0;
      } catch (e) {
        console.error(`[${id}] ❌ Fehler bei turnComplete:`, e?.message || e);
      }
    }, 800); // 800ms ohne neuen Chunk => Turn beenden
  }

  ws.on('message', async (raw) => {
    try {
      // Normalisiere: immer erst versuchen, JSON zu lesen (auch bei Buffer)
      const asText = Buffer.isBuffer(raw) ? raw.toString('utf8') : (typeof raw === 'string' ? raw : '');
      if (asText) {
        try {
          console.log(`[${id}] 📩 text>`, asText.slice(0, 120));
          const m = JSON.parse(asText);
          // Dynamisch Twilio erkennen, falls Query fehlt
          if (!ws._isTwilio && typeof m === 'object' && m && 'event' in m && typeof m.event === 'string') {
            ws._isTwilio = true;
            isTwilio = true;
            attachTwilioHelpers(ws, id, getTwilioStreamSid); // Helfer hier erstellen!
            console.log(`[${id}] 🔄 Socket als Twilio-Stream erkannt`);
            // Da oft kein 'start' Event kommt, hier die Begrüßung auslösen
            // Wichtig: Begrüßung NICHT mehr sofort senden – erst nach 'start'
          }

          // ===== Twilio Media Stream Handling =====
          if (isTwilio && m.event) {
            // StreamSID bei jeder Gelegenheit aktualisieren, falls sie beim Start gefehlt hat
            if (m.streamSid && !twilioStreamSid) {
              twilioStreamSid = m.streamSid;
              console.log(`[${id}] 📞 Captured streamSid: ${twilioStreamSid}`);
            }
            console.log(`[${id}] 📞 Twilio event:`, m.event);
            
            switch (m.event) {
              case 'mark':
                console.log(`[${id}] 🏷️ Twilio mark received:`, m.mark?.name || '(no name)');
                break;
              case 'start':
                console.log(`[${id}] 📞 Twilio call started, streamSid:`, m.start?.streamSid || m.streamSid);
                recording = true;
                twilioStreamSid = m.start?.streamSid || m.streamSid || twilioStreamSid;
                ws._twilioStarted = true; // Ab jetzt darf Outbound gesendet werden
                // Optional: Begrüßung NACH Start senden (vermeidet Outbound vor Start)
                try {
                  if (PIPELINE_BACKEND === 'pipecat' && ws._pipecatSocket?.readyState === 1) {
                    ws._pipecatSocket.send(JSON.stringify({ type: 'say', text: 'Sag "Hallo und herzlich willkommen."' }));
                  } else {
                    session?.sendClientContent({
                      turns: [{ role: 'user', parts: [{ text: 'Sag "Hallo und herzlich willkommen."' }] }],
                      turnComplete: true
                    });
                  }
                } catch {}
                break;
                
              case 'media':
                // Loopback-Diagnose: μ-law Payload 1:1 zurücksenden (innerhalb des Diagnosefensters)
                const loopbackActive = DIAG_LOOPBACK_MS > 0 && recording;
                if (loopbackActive && m.media?.payload && typeof m.media.payload === 'string') {
                  const f = Buffer.from(m.media.payload, 'base64');
                  if (ws._outboundQueue) ws._outboundQueue.push(f);
                }
                // Nur eingehendes Audio verarbeiten, Echo ignorieren
                if (m.media?.track === 'inbound' && session && m.media?.payload) {
                  const ulawBuffer = Buffer.from(m.media.payload, 'base64');
                  const pcm16 = muLawBufferToPCM16(ulawBuffer);

                  // VAD (einfach): durchschnittlicher Absolutwert
                  let sumAbs = 0;
                  for (let i = 0; i < pcm16.length; i++) sumAbs += Math.abs(pcm16[i]);
                  const avgAbs = pcm16.length > 0 ? (sumAbs / pcm16.length) : 0;
                  const isSpeech = avgAbs >= VAD_RMS_THRESHOLD;

                  if (isSpeech) {
                    // Aufnahme ggf. automatisch starten
                    if (!recording) {
                      console.log(`[${id}] 🎙️ Speech detected → start turn`);
                      recording = true;
                      chunkCount = 0;
                    }
                    silenceFrames = 0;
                    // Hochsamplen und an Gemini senden (24kHz)
                    const outRate = PIPELINE_BACKEND === 'pipecat' ? PIPECAT_PCM_RATE : 24000;
                  const pcm16_out = resamplePCM16(pcm16, 8000, outRate);
                    const pcm16_out_bytes = int16ToBytes(pcm16_out);
                  bytesIn += ulawBuffer.length;
                  chunkCount++;
                  if (PIPELINE_BACKEND === 'pipecat' && ws._pipecatSocket?.readyState === 1) {
                      ws._pipecatSocket.send(JSON.stringify({ type: 'audio_in', data: Buffer.from(pcm16_out_bytes).toString('base64'), mimeType: `audio/pcm;rate=${outRate}` }));
                  } else {
                      session.sendRealtimeInput({ media: [{ data: Buffer.from(pcm16_out_bytes).toString('base64'), mimeType: `audio/pcm;rate=${outRate}` }] });
                    }
                    console.log(`[${id}] 📞 Twilio inbound audio chunk: ${ulawBuffer.length} bytes processed (avgAbs=${avgAbs|0})`);
                  } else {
                    // Stilleframe
                    if (recording) {
                      silenceFrames += 1;
                      if (silenceFrames >= silenceFramesNeeded) {
                        // Turn beenden
                        try {
                          ws._flushPcmAgg?.();
                          if (PIPELINE_BACKEND === 'pipecat') {
                            if (ws._pipecatSocket?.readyState === 1) {
                              ws._pipecatSocket.send(JSON.stringify({ type: 'turn_end' }));
                          } else {
                              console.warn(`[${id}] ⚠️ turn_end skipped (Pipecat socket not ready)`);
                            }
                          } else {
                            session.sendRealtimeInput({ media: [], audioStreamEnd: true, turnComplete: true });
                          }
                          console.log(`[${id}] 🛑 VAD silence ${TURN_END_SILENCE_MS}ms → turnComplete`);
                        } catch (e) {
                          console.warn(`[${id}] ⚠️ turnComplete error:`, e?.message || e);
                        }
                        recording = false;
                        silenceFrames = 0;
                        chunkCount = 0;
                      }
                    }
                  }
                }
                break;
                
              case 'stop':
                console.log(`[${id}] 📞 Twilio call ended`);
                recording = false;
                break;
            }
            return; // Twilio-spezifische Behandlung ist abgeschlossen
          }

          // Voice Agent Route - traditioneller Text/Audio Chat
          if (m.type === 'voice_agent') {
            console.log(`[${id}] 🎤 Voice Agent Request:`, m.data?.audio?.length || 0, 'chars');
            try {
              // Import voice agent module
              const { default: voiceAgentHandler } = await import('./api/voice-agent.js');
              
              // Create streaming response handler
              let responseText = '';
              const mockRes = {
                setHeader: () => {},
                write: (chunk) => {
                  try {
                    const lines = chunk.toString().split('\n').filter(line => line.trim());
                    for (const line of lines) {
                      if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        console.log(`[${id}] 📤 Voice Agent Event:`, data.type);
                        
                        // Forward voice agent events to WebSocket
                        ws.send(JSON.stringify(data));
                        
                        if (data.type === 'llm_chunk' && data.data?.text) {
                          responseText += data.data.text;
                        }
                      }
                    }
                  } catch (e) {
                    console.warn(`[${id}] ⚠️ Parse voice agent chunk:`, e.message);
                  }
                },
                end: () => {
                  console.log(`[${id}] ✅ Voice Agent Response complete:`, responseText.slice(0, 50));
                  ws.send(JSON.stringify({ type: 'end' }));
                }
              };
              
              const mockReq = { 
                method: 'POST', 
                body: m.data,
                headers: { 'content-type': 'application/json' }
              };
              
              await voiceAgentHandler(mockReq, mockRes);
            } catch (error) {
              console.error(`[${id}] ❌ Voice Agent Error:`, error);
              ws.send(JSON.stringify({ type: 'error', data: { message: error.message } }));
            }
            return;
          }

          if (m.type === 'start_audio') {
            session = session || await openGeminiSession(ws, id);
            if (!session) return; // Fehler schon an Client geschickt
            recording = true;
            chunkCount = 0;
            if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
            console.log(`[${id}] ▶️ start_audio ack`);
            // Sende session_ready erneut, falls der Client das erste verpasst hat
            try { ws.send(JSON.stringify({ type: 'session_ready' })); } catch {}
            return;
          }
          if (m.type === 'audio_chunk_b64') {
            if (!recording || !session) return;
            const buf = Buffer.from(m.data, 'base64');
            bytesIn += buf.length;
            chunkCount += 1;
            console.log(`[${id}] 📤 → Gemini audio ${buf.length} bytes (b64) [chunk #${chunkCount}]`);
            // Route je nach Backend
            if (PIPELINE_BACKEND === 'pipecat' && ws._pipecatSocket?.readyState === 1) {
              ws._pipecatSocket.send(JSON.stringify({ type: 'audio_in', data: m.data, mimeType: 'audio/pcm;rate=24000' }));
            } else {
              // Use 'media' array per @google/genai live API
              session.sendRealtimeInput({ media: [{ data: m.data, mimeType: 'audio/pcm;rate=24000' }] });
            }
            scheduleTurnEnd();
            return;
          }
          if (m.type === 'stop_audio') {
            recording = false;
            if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
            // Markiere Turn-Ende explizit
            session?.sendRealtimeInput({ media: [], audioStreamEnd: true, turnComplete: true });
            console.log(`[${id}] ⏹ stop_audio ack (audioStreamEnd + turnComplete)`);
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
        // Twilio akzeptiert nur JSON-Protokoll. Falls Twilio, ignoriere Binär.
        if (ws._isTwilio) return;
        if (!recording || !session) return;
        bytesIn += raw.length;
        chunkCount += 1;
        const b64 = raw.toString('base64');
        if (PIPELINE_BACKEND === 'pipecat' && ws._pipecatSocket?.readyState === 1) {
          ws._pipecatSocket.send(JSON.stringify({ type: 'audio_in', data: b64, mimeType: 'audio/pcm;rate=24000' }));
        } else {
          // Use 'media' array per @google/genai live API
          session.sendRealtimeInput({ media: [{ data: b64, mimeType: 'audio/pcm;rate=24000' }] });
        }
        console.log(`[${id}] 📤 → Gemini audio ${Math.max(0, raw.length - (raw.length - 1364))} bytes (bin) [chunk #${chunkCount}]`);
        scheduleTurnEnd();
        return;
      }
    } catch (e) {
      console.error(`[${id}] 🧨 onmessage error`, e);
      // Sende niemals Nicht-Twilio-JSON an Twilio-WS (vermeidet 31951)
      if (!ws._isTwilio) {
        try { ws.send(JSON.stringify({ type: 'server_error', where: 'onmessage', detail: String(e?.message || e) })); } catch {}
      }
    }
  });

  // Optional: Keepalive (Fly trennt Idle-WS gern)
  const ka = setInterval(() => { try { ws.ping(); } catch {} }, 25000);
  
  ws.on('close', () => {
    console.log(`[${id}] 🔚 closed, bytesIn=${bytesIn}`);
    clearInterval(ka);
    if (ws._outboundTimer) try { clearInterval(ws._outboundTimer); } catch {}
    ws._outboundQueue = [];
    session?.close?.();
  });
});

// --- Server starten ---
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Kombinierter HTTP/WebSocket Server läuft auf http://0.0.0.0:${PORT}`);
});

// Globale Error-Handler, damit die App nicht crash-t
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});
