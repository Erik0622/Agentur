import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const clients = new Map();

class VoiceAgent {
  constructor(clientId, ws) {
    this.clientId = clientId;
    this.ws = ws;
    this.deepgramSocket = null;
  }

  sendToClient(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async startDeepgramStream() {
    // Deepgram WebSocket vorbereiten (Integration folgt)
    const deepgramApiKey = '3e69806feb52b90f01f2e47f9e778fc87b6d811a';
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?language=de&model=nova-2&punctuate=true&interim_results=true`;
    const headers = { Authorization: `Token ${deepgramApiKey}` };
    const WebSocketDG = (await import('ws')).WebSocket;
    this.deepgramSocket = new WebSocketDG(deepgramUrl, { headers });

    this.deepgramSocket.on('open', () => {
      console.log('Deepgram WebSocket verbunden');
    });
    this.deepgramSocket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.channel && data.channel.alternatives && data.channel.alternatives[0].transcript) {
          this.sendToClient({
            type: 'transcript',
            text: data.channel.alternatives[0].transcript,
            isFinal: data.is_final
          });
        }
      } catch (e) { console.error('Deepgram-Fehler:', e); }
    });
    this.deepgramSocket.on('close', () => {
      console.log('Deepgram WebSocket geschlossen');
    });
    this.deepgramSocket.on('error', (err) => {
      console.error('Deepgram WebSocket Fehler:', err);
    });
  }

  async handleAudioChunk(chunk) {
    if (!this.deepgramSocket || this.deepgramSocket.readyState !== 1) return;
    this.deepgramSocket.send(chunk);
  }

  async endDeepgramStream() {
    if (this.deepgramSocket) {
      this.deepgramSocket.close();
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  const agent = new VoiceAgent(clientId, ws);
  clients.set(clientId, ws);
  
  console.log('Client connected:', clientId);
  
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Voice Agent bereit!'
  }));

  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) {
        // Audio-Chunk als Binary (z.B. Float32Array, PCM, o.ä.)
        await agent.handleAudioChunk(data);
        return;
      }
      const message = JSON.parse(data);
      if (message.type === 'start_audio') {
        await agent.startDeepgramStream();
      } else if (message.type === 'audio_chunk' && message.audio) {
        // Audio-Chunk als Base64
        const buffer = Buffer.from(message.audio, 'base64');
        await agent.handleAudioChunk(buffer);
      } else if (message.type === 'end_audio') {
        await agent.endDeepgramStream();
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected:', clientId);
    clients.delete(clientId);
    agent.endDeepgramStream();
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      deepgram: true,
      gemini: true,
      tts: 'mock'
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log('Voice Agent Server läuft auf Port', PORT);
}); 