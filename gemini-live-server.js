import http from 'http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// --- Konfiguration ---
const PORT = process.env.PORT || 8080;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!GEMINI_API_KEY) {
  console.error('FATAL ERROR: GEMINI_API_KEY environment variable is not set.');
  process.exit(1);
}

// --- System Prompt ---
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

// --- Express App Setup ---
const app = express();
const server = http.createServer(app);

// Statische Dateien (Vite Build Output) servieren
app.use(express.static(join(__dirname, 'dist')));

// Health Check für Fly.io
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Fallback für SPA-Routing
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// --- WebSocket Server Setup ---
const wss = new WebSocketServer({ server });
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

wss.on('connection', (ws) => {
  const connectionId = `conn-${Date.now()}`;
  console.log(`[${connectionId}] WebSocket client connected.`);

  let liveSession = null;
  let isRecording = false;

  const startGeminiSession = async () => {
    return new Promise((resolve, reject) => {
      try {
        console.log(`[${connectionId}] Initializing Gemini Live session...`);
        ai.live.connect({
          model: 'gemini-2.5-flash-preview-native-audio-dialog',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: SYSTEM_PROMPT,
          },
          callbacks: {
            onopen: () => {
              console.log(`[${connectionId}] Gemini Live session opened.`);
              resolve(); // Session ist bereit
            },
            onmessage: (message) => {
              if (ws.readyState !== ws.OPEN) return;
              // Audio-Daten von Gemini empfangen (PCM @ 24kHz)
              if (message.data) {
                const audioData = Buffer.from(message.data, 'base64');
                ws.send(JSON.stringify({ type: 'audio_chunk', data: { base64: audioData.toString('base64'), format: 'pcm_s16le_24k' } }));
              }
              // Ende des Gesprächszugs
              if (message.serverContent?.turnComplete) {
                console.log(`[${connectionId}] Gemini turn complete.`);
                ws.send(JSON.stringify({ type: 'end' }));
              }
            },
            onerror: (e) => {
              console.error(`[${connectionId}] Gemini Live session error:`, e);
              reject(e);
            },
            onclose: () => {
              console.log(`[${connectionId}] Gemini Live session closed.`);
            },
          },
        }).then(session => {
          liveSession = session;
          console.log(`[${connectionId}] Gemini Live session successfully initialized.`);
        }).catch(reject);
      } catch (error) {
        console.error(`[${connectionId}] FAILED to initialize Gemini Live session:`, error);
        reject(error);
      }
    });
  };

  ws.on('message', (message) => {
    try {
      const isBuffer = Buffer.isBuffer(message);

      if (isBuffer) {
        if (isRecording && liveSession) {
          const base64 = message.toString('base64');
          liveSession.sendRealtimeInput({
            audio: { data: base64, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } else {
        const data = JSON.parse(message.toString());
        if (data.type === 'start_audio') {
          console.log(`[${connectionId}] start_audio → initializing Gemini...`);
          // erst Session hochfahren, dann Recording scharf schalten
          startGeminiSession().then(() => {
            isRecording = true;
            ws.send(JSON.stringify({ type: 'session_ready' }));
          }).catch(e => {
            console.error(`[${connectionId}] Failed to start session:`, e);
            ws.send(JSON.stringify({ type: 'error', data: { message: 'Session initialization failed' } }));
          });
        } else if (data.type === 'end_audio') {
          console.log(`[${connectionId}] Received end_audio signal.`);
          isRecording = false;
        }
      }
    } catch (error) {
      console.error(`[${connectionId}] Error processing message:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[${connectionId}] WebSocket client disconnected.`);
    liveSession?.close();
  });

  ws.on('error', (error) => {
    console.error(`[${connectionId}] WebSocket error:`, error);
    liveSession?.close();
  });

  ws.send(JSON.stringify({ type: 'connected' }));
});

// --- Server Start ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🔗 WebSocket server ready`);
});
