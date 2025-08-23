// WS-Gateway-Test gegen Produktions-URL
// Nutzung: node scripts/ws-gateway-test.js

import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'wss://agentur.fly.dev';

console.log('[WS-TEST] Verbinde zu', WS_URL);
const ws = new WebSocket(WS_URL);

let gotReady = false;

ws.on('open', () => {
  console.log('[WS-TEST] ✅ open');
  ws.send(JSON.stringify({ type: 'start_audio' }));
  console.log('[WS-TEST] ▶️ start_audio gesendet');
});

ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    console.log('[WS-TEST] ⬅', msg.type);
    if (msg.type === 'session_ready') {
      gotReady = true;
      console.log('[WS-TEST] ✅ session_ready erhalten');
      // Sanity: Text auslösen
      ws.send(JSON.stringify({ type: 'say', text: 'Sag bitte deutlich "Hallo".' }));
      console.log('[WS-TEST] 💬 say gesendet');
      // Nach kurzer Zeit stoppen
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'stop_audio' }));
        console.log('[WS-TEST] ⏹ stop gesendet');
      }, 2000);
    }
    if (msg.type === 'audio_out') {
      console.log('[WS-TEST] 🔊 audio_out len=', (msg.data || '').length);
    }
    if (msg.type === 'server_error') {
      console.error('[WS-TEST] ❌ server_error', msg.where, msg.detail);
    }
    if (msg.type === 'turn_complete') {
      console.log('[WS-TEST] 🔄 turn_complete');
    }
  } catch (e) {
    console.error('[WS-TEST] parse error', e);
  }
});

ws.on('error', (e) => {
  console.error('[WS-TEST] ❌ ws error', e.message || e);
});

ws.on('close', () => {
  console.log('[WS-TEST] ⛔ closed. gotReady=', gotReady);
  process.exit(0);
});
