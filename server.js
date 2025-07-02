import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// API Keys
const DEEPGRAM_API_KEY = '3e69806feb52b90f01f2e47f9e778fc87b6d811a';
const GEMINI_API_KEY = 'AIzaSyDCqBRhKqrwXGfIbfmQVj3nRbQLDFsGqEI';
const SMALLEST_API_KEY = 'sk-2ad79c9f-cf37-44b3-87dd-0b0b8eb66e5b';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const clients = new Map();

class VoiceAgent {
  constructor(clientId, ws) {
    this.clientId = clientId;
    this.ws = ws;
    this.deepgramSocket = null;
    this.conversationHistory = [];
    this.currentTranscript = '';
    this.isProcessing = false;
  }

  sendToClient(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async startDeepgramStream() {
    try {
      const deepgramUrl = `wss://api.deepgram.com/v1/listen?language=multi&model=nova-3&punctuate=true&interim_results=true&endpointing=300&vad_events=true&smart_format=true`;
      const headers = { Authorization: `Token ${DEEPGRAM_API_KEY}` };
      
      const WebSocketDG = (await import('ws')).WebSocket;
      this.deepgramSocket = new WebSocketDG(deepgramUrl, { headers });

      this.deepgramSocket.on('open', () => {
        console.log('🎤 Deepgram WebSocket verbunden');
        this.sendToClient({
          type: 'status',
          message: 'Spracherkennung bereit'
        });
      });

      this.deepgramSocket.on('message', async (msg) => {
        try {
          const data = JSON.parse(msg);
          
          if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
            const transcript = data.channel.alternatives[0].transcript;
            const isFinal = data.is_final;
            
            if (transcript && transcript.trim()) {
              this.currentTranscript = transcript;
              
              this.sendToClient({
                type: 'transcript',
                text: transcript,
                isFinal: isFinal,
                confidence: data.channel.alternatives[0].confidence
              });

              // Bei finalem Transcript -> LLM Processing starten
              if (isFinal && !this.isProcessing) {
                this.isProcessing = true;
                await this.processWithGemini(transcript);
              }
            }
          }

          // Voice Activity Detection Events
          if (data.type === 'UtteranceEnd') {
            console.log('🔚 Utterance beendet');
          }
        } catch (e) { 
          console.error('Deepgram Parse-Fehler:', e); 
        }
      });

      this.deepgramSocket.on('close', () => {
        console.log('🔌 Deepgram WebSocket geschlossen');
      });

      this.deepgramSocket.on('error', (err) => {
        console.error('❌ Deepgram WebSocket Fehler:', err);
        this.sendToClient({
          type: 'error',
          message: 'Spracherkennung fehler'
        });
      });
    } catch (error) {
      console.error('❌ Deepgram Setup Fehler:', error);
    }
  }

  async processWithGemini(transcript) {
    try {
      // Conversation context for restaurant booking
      const systemPrompt = `Du bist ein intelligenter Telefonassistent für ein Restaurant. 
Deine Aufgaben:
- Tischreservierungen entgegennehmen
- Informationen über Öffnungszeiten geben
- Fragen zur Speisekarte beantworten
- Freundlich und hilfsbereit sein

Aktuelle Öffnungszeiten:
- Mo-Fr: 17:00-23:00
- Sa: 17:00-24:00  
- So: 17:00-22:00

Antworte KURZ und natürlich auf Deutsch. Maximal 2-3 Sätze.`;

      const model = genAI.getGenerativeModel({ 
        model: "models/gemini-2.5-flash-lite-preview-0617", // Neuestes & schnellstes Modell!
        generationConfig: {
          temperature: 0.3, // Konsistentere Antworten
          maxOutputTokens: 60, // Noch kürzer für maximale Speed
          topP: 0.8,
          topK: 40
        }
      });

      // Conversation history für Kontext
      this.conversationHistory.push(`User: ${transcript}`);
      const context = this.conversationHistory.slice(-6).join('\n'); // Letzte 6 Nachrichten

      const prompt = `${systemPrompt}\n\nGespräch:\n${context}\n\nAssistant:`;

      this.sendToClient({
        type: 'status',
        message: 'Verarbeite Anfrage...'
      });

      // Streaming Response von Gemini
      const result = await model.generateContentStream(prompt);
      let fullResponse = '';

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          // Streaming chunks an Frontend senden
          this.sendToClient({
            type: 'llm_chunk',
            text: chunkText
          });
        }
      }

      if (fullResponse.trim()) {
        this.conversationHistory.push(`Assistant: ${fullResponse}`);
        
        // Text-to-Speech mit Smallest.ai
        await this.generateSpeech(fullResponse);
      }

    } catch (error) {
      console.error('❌ Gemini Fehler:', error);
      this.sendToClient({
        type: 'error',
        message: 'KI-Verarbeitung fehlgeschlagen'
      });
      this.isProcessing = false;
    }
  }

  async generateSpeech(text) {
    try {
      console.log('🔊 Generiere deutsche Sprache:', text.substring(0, 50) + '...');
      
      // Smallest.ai TTS API - Korrektes Format
      const response = await fetch('https://api.smallest.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SMALLEST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonic-v1', // Schnellstes Modell ~100ms
          input: text,
          voice: 'sonic-german', // Deutsche Optimierung  
          response_format: 'mp3',
          speed: 1.2, // Leicht beschleunigt
          quality: 'standard' // Für Geschwindigkeit
        })
      });

      if (response.ok) {
        const audioData = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioData).toString('base64');
        
        this.sendToClient({
          type: 'voice_response',
          transcript: this.currentTranscript,
          response: text,
          audio: base64Audio,
          metrics: {
            processingTime: Date.now(),
            audioSize: audioData.byteLength
          }
        });
      } else {
        console.error('❌ TTS Fehler:', response.status, await response.text());
        
        // Fallback: Nur Text ohne Audio
        this.sendToClient({
          type: 'voice_response',
          transcript: this.currentTranscript,
          response: text,
          audio: null
        });
      }
    } catch (error) {
      console.error('❌ TTS Fehler:', error);
      
      // Fallback: Nur Text
      this.sendToClient({
        type: 'voice_response',
        transcript: this.currentTranscript,
        response: text,
        audio: null
      });
    } finally {
      this.isProcessing = false;
    }
  }

  async handleAudioChunk(chunk) {
    if (!this.deepgramSocket || this.deepgramSocket.readyState !== 1) return;
    
    try {
      // Sende Audio-Chunk direkt an Deepgram für Live-Transkription
      this.deepgramSocket.send(chunk);
    } catch (error) {
      console.error('❌ Audio-Chunk Fehler:', error);
    }
  }

  async endDeepgramStream() {
    if (this.deepgramSocket) {
      this.deepgramSocket.close();
      this.deepgramSocket = null;
    }
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  const agent = new VoiceAgent(clientId, ws);
  clients.set(clientId, agent);
  
  console.log('👤 Client verbunden:', clientId);
  
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Voice Agent bereit! 🎙️'
  }));

  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) {
        // Binary Audio-Chunk (WebM, PCM, etc.)
        await agent.handleAudioChunk(data);
        return;
      }

      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'start_audio':
          console.log('🎤 Audio-Stream gestartet');
          await agent.startDeepgramStream();
          break;
          
        case 'audio_chunk':
          if (message.audio) {
            const buffer = Buffer.from(message.audio, 'base64');
            await agent.handleAudioChunk(buffer);
          }
          break;
          
        case 'end_audio':
          console.log('🛑 Audio-Stream beendet');
          await agent.endDeepgramStream();
          break;
          
        case 'reset_conversation':
          agent.conversationHistory = [];
          agent.sendToClient({
            type: 'status',
            message: 'Gespräch zurückgesetzt'
          });
          break;
          
        default:
          console.log('❓ Unbekannter Message-Type:', message.type);
      }
    } catch (error) {
      console.error('❌ Message Handler Fehler:', error);
      agent.sendToClient({
        type: 'error',
        message: 'Nachrichtenverarbeitung fehlgeschlagen'
      });
    }
  });

  ws.on('close', () => {
    console.log('👋 Client getrennt:', clientId);
    clients.delete(clientId);
    agent.endDeepgramStream();
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket Fehler:', error);
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    clients: clients.size,
    services: {
      deepgram: 'connected',
      gemini: 'ready',
      smallest_ai: 'ready'
    },
    version: '2.0.0'
  });
});

// API Status Endpoint
app.get('/api/status', async (req, res) => {
  const status = {
    deepgram: false,
    gemini: false,
    smallest: false
  };

  try {
    // Test Deepgram
    const dgResponse = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}` }
    });
    status.deepgram = dgResponse.ok;
  } catch (e) {}

  try {
    // Test Gemini
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash-lite-preview-0617" });
    await model.generateContent("test");
    status.gemini = true;
  } catch (e) {}

  try {
    // Test Smallest.ai
    const response = await fetch('https://api.smallest.ai/v1/models', {
      headers: { 'Authorization': `Bearer ${SMALLEST_API_KEY}` }
    });
    status.smallest = response.ok;
  } catch (e) {}

  res.json({
    status: 'API Status Check',
    services: status,
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Voice Agent Server läuft auf Port ${PORT}`);
  console.log('📡 Services:', {
    deepgram: '✅ Spracherkennung',
    gemini: '✅ KI-Chat',
    smallest: '✅ Sprachsynthese'
  });
}); 