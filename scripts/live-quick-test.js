// Minimaler Isolations-Test für Gemini Live Native Audio
// Nutzung: WINDOWS POWERSHELL
// $env:GOOGLE_API_KEY="<DEIN_KEY>"; node scripts/live-quick-test.js

import { GoogleGenAI, Modality } from '@google/genai';

const KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('[TEST] ❌ Kein GOOGLE_API_KEY/GEMINI_API_KEY gesetzt');
  process.exit(1);
}

console.log('[TEST] Starte Live-API Isolations-Test...');
const ai = new GoogleGenAI({ apiKey: KEY });

try {
  let session;
  session = await ai.live.connect({
    model: 'gemini-2.5-flash-preview-native-audio-dialog',
    config: { responseModalities: [Modality.AUDIO] },
    callbacks: {
      onopen: () => {
        console.log('[TEST] ✅ session open');
      },
      onmessage: (msg) => {
        if (msg?.data) {
          console.log('[TEST] 🔊 audio_out b64 len=', msg.data.length);
        }
        if (msg?.serverContent?.turnComplete) {
          console.log('[TEST] 🔄 turn_complete');
        }
      },
      onerror: (e) => console.error('[TEST] ❌ onerror', e?.message || e),
      onclose: (e) => console.log('[TEST] ⛔ closed', e?.reason || ''),
    }
  });

  // Nach erfolgreichem Connect: Sanity-Text senden
  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: 'Sag bitte deutlich „Hallo“. ' }] }],
    turnComplete: true
  });

  setTimeout(() => {
    try { session?.close?.(); } catch {}
    console.log('[TEST] ⏹ Ende');
    process.exit(0);
  }, 10000);
} catch (e) {
  console.error('[TEST] ❌ connect failed', e?.message || e);
  process.exit(1);
}
