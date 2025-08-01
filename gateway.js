import http from 'http';
import { WebSocketServer } from 'ws';
import fetch from 'node-fetch';

const PORT = process.env.PORT || 3001;                       // Fly horcht hier
const REST = process.env.VOICE_REST || 'http://localhost:3000/api/voice-agent';

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
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
    for await (const line of res.body) ws.send(line);
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', message: e.message }));
  }
}

server.listen(PORT, () => console.log('WS-gateway ready on', PORT));
