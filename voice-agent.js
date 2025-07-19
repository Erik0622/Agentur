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

// Initialize Gemini AI
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
    this.startTime = Date.now();
  }

  sendToClient(data) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({
        ...data,
        timestamp: Date.now(),
        latency: Date.now() - this.startTime
      }));
    }
  }

  async startDeepgramStream() {
    try {
      console.log('🎤 Starte Deepgram Stream für Client:', this.clientId);
      
          const deepgramUrl = `wss://api.deepgram.com/v1/listen?` + new URLSearchParams({
      language: 'multi',
<<<<<<< HEAD
        model: 'nova-3',
=======
      model: 'nova-3',
>>>>>>> a761fbca09bf9c522e4c67323332cafd36812c46
        punctuate: 'true',
        interim_results: 'true',
        endpointing: '300',
        vad_events: 'true',
        smart_format: 'true',
        utterance_end_ms: '1000',
        encoding: 'linear16',
        sample_rate: '16000'
      });

      const headers = { 
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json'
      };
      
      const WebSocketDG = (await import('ws')).WebSocket;
      this.deepgramSocket = new WebSocketDG(deepgramUrl, { headers });

      this.deepgramSocket.on('open', () => {
        console.log('✅ Deepgram WebSocket verbunden');
        this.sendToClient({
          type: 'status',
          message: 'Spracherkennung bereit - sprechen Sie jetzt!'
        });
      });

      this.deepgramSocket.on('message', async (msg) => {
        try {
          const data = JSON.parse(msg);
          
          if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
            const transcript = data.channel.alternatives[0].transcript;
            const isFinal = data.is_final;
            const confidence = data.channel.alternatives[0].confidence;
            
            if (transcript && transcript.trim()) {
              this.currentTranscript = transcript;
              
              this.sendToClient({
                type: 'transcript',
                text: transcript,
                isFinal: isFinal,
                confidence: confidence || 0,
                partial: !isFinal
              });

              if (isFinal && transcript.length > 2 && !this.isProcessing) {
                this.isProcessing = true;
                console.log('🤖 Verarbeite:', transcript);
                this.processWithGemini(transcript);
              }
            }
          }

          if (data.type === 'UtteranceEnd') {
            console.log('🔚 Satzende erkannt');
            this.sendToClient({
              type: 'utterance_end',
              message: 'Satzende erkannt'
            });
          }

        } catch (e) { 
          console.error('❌ Deepgram Parse-Fehler:', e); 
        }
      });

      this.deepgramSocket.on('close', (code, reason) => {
        console.log('🔌 Deepgram WebSocket geschlossen:', code, reason.toString());
      });

      this.deepgramSocket.on('error', (err) => {
        console.error('❌ Deepgram Fehler:', err);
        this.sendToClient({
          type: 'error',
          message: 'Spracherkennung Fehler'
        });
      });

    } catch (error) {
      console.error('❌ Deepgram Setup Fehler:', error);
      this.sendToClient({
        type: 'error',
        message: 'Spracherkennung konnte nicht gestartet werden'
      });
    }
  }

  async processWithGemini(transcript) {
    try {
      const processingStart = Date.now();
      
      const systemPrompt = `Du bist ein freundlicher Telefonassistent für das Restaurant "Bella Vista". 

Deine Hauptaufgaben:
- Tischreservierungen entgegennehmen 
- Informationen über Öffnungszeiten geben
- Fragen zur Speisekarte beantworten
- Bei Reservierungen: Name, Datum, Uhrzeit, Personenzahl erfragen

Öffnungszeiten:
• Montag-Freitag: 17:00-23:00 Uhr
• Samstag: 17:00-24:00 Uhr  
• Sonntag: 17:00-22:00 Uhr

WICHTIG: Antworte SEHR KURZ und natürlich (max. 20 Wörter). Sei freundlich aber effizient.`;

      this.conversationHistory.push(`Kunde: ${transcript}`);
      const context = this.conversationHistory.slice(-8).join('\n');

      const model = genAI.getGenerativeModel({ 
        model: "models/gemini-2.5-flash-lite-preview-0617",
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 50,
          topP: 0.8,
          topK: 40
        }
      });

      const fullPrompt = `${systemPrompt}\n\nAktuelles Gespräch:\n${context}\n\nAssistant:`;

      this.sendToClient({
        type: 'ai_thinking',
        message: 'KI überlegt...'
      });

      const result = await model.generateContentStream(fullPrompt);
      let fullResponse = '';
      let firstChunk = true;

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        if (chunkText) {
          fullResponse += chunkText;
          
          this.sendToClient({
            type: 'llm_chunk',
            text: chunkText,
            isFirst: firstChunk
          });
          firstChunk = false;
        }
      }

      const processingTime = Date.now() - processingStart;
      console.log(`⚡ Gemini 2.5 Flash-Lite Response in ${processingTime}ms:`, fullResponse.substring(0, 50));

      if (fullResponse.trim()) {
        this.conversationHistory.push(`Assistant: ${fullResponse}`);
        this.generateSpeech(fullResponse, processingTime);
      } else {
        this.isProcessing = false;
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

  async generateSpeech(text, geminiTime = 0) {
    try {
      const ttsStart = Date.now();
      console.log('🔊 Generiere deutsche Sprache mit Lightning v2:', text.substring(0, 30) + '...');
      
      const response = await fetch('https://waves-api.smallest.ai/api/v1/lightning-v2/get_speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SMALLEST_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice_id: 'de-DE-Standard-A',
          text: text,
          language: 'de',
          response_format: 'mp3',
          speed: 1.2
        })
      });

      const ttsTime = Date.now() - ttsStart;

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString('base64');
        
        console.log(`🎵 TTS in ${ttsTime}ms, Audio: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
        
        this.sendToClient({
          type: 'voice_response',
          transcript: this.currentTranscript,
          response: text,
          audio: base64Audio,
          format: 'mp3',
          metrics: {
            gemini_time: geminiTime,
            tts_time: ttsTime,
            total_time: Date.now() - this.startTime,
            audio_size: audioBuffer.byteLength
          }
        });
      } else {
        const errorText = await response.text();
        console.error('❌ TTS Fehler:', response.status, errorText);
        
        this.sendToClient({
          type: 'voice_response',
          transcript: this.currentTranscript,
          response: text,
          audio: null,
          error: 'TTS fehlgeschlagen'
        });
      }

    } catch (error) {
      console.error('❌ TTS Fehler:', error);
      
      this.sendToClient({
        type: 'voice_response',
        transcript: this.currentTranscript,
        response: text,
        audio: null,
        error: error.message
      });
    } finally {
      this.isProcessing = false;
      this.startTime = Date.now();
    }
  }

  async handleAudioChunk(chunk) {
    if (!this.deepgramSocket || this.deepgramSocket.readyState !== 1) {
      return;
    }
    
    try {
      this.deepgramSocket.send(chunk);
    } catch (error) {
      console.error('❌ Audio-Chunk Fehler:', error);
    }
  }

  async endDeepgramStream() {
    if (this.deepgramSocket) {
      try {
        this.deepgramSocket.send(JSON.stringify({type: 'CloseStream'}));
      } catch (e) {}
      
      this.deepgramSocket.close(1000, 'Stream beendet');
      this.deepgramSocket = null;
      console.log('🛑 Deepgram Stream beendet für Client:', this.clientId);
    }
  }

  resetConversation() {
    this.conversationHistory = [];
    this.currentTranscript = '';
    this.isProcessing = false;
    console.log('🔄 Conversation reset für Client:', this.clientId);
  }
}

wss.on('connection', (ws) => {
  const clientId = uuidv4();
  const agent = new VoiceAgent(clientId, ws);
  clients.set(clientId, agent);
  
  console.log(`👤 Neuer Client verbunden: ${clientId} (Total: ${clients.size})`);
  
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Voice Agent bereit! 🎙️ Drücken Sie auf das Mikrofon und sprechen Sie.',
    version: '2.0.0'
  }));

  ws.on('message', async (data, isBinary) => {
    try {
      if (isBinary) {
        await agent.handleAudioChunk(data);
        return;
      }

      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'start_recording':
          console.log('🎤 Start Recording für Client:', clientId);
          agent.resetConversation();
          await agent.startDeepgramStream();
          break;
          
        case 'audio_data':
          if (message.audio) {
            const audioBuffer = Buffer.from(message.audio, 'base64');
            await agent.handleAudioChunk(audioBuffer);
          }
          break;
          
        case 'stop_recording':
          console.log('🛑 Stop Recording für Client:', clientId);
          await agent.endDeepgramStream();
          break;
          
        case 'reset_conversation':
          agent.resetConversation();
          agent.sendToClient({
            type: 'conversation_reset',
            message: 'Gespräch zurückgesetzt'
          });
          break;

        case 'ping':
          agent.sendToClient({ type: 'pong', timestamp: Date.now() });
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

  ws.on('close', (code, reason) => {
    console.log(`👋 Client ${clientId} getrennt: ${code} ${reason} (Verbleibend: ${clients.size - 1})`);
    clients.delete(clientId);
    agent.endDeepgramStream();
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket Fehler für Client ${clientId}:`, error);
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    clients: clients.size,
    services: {
      deepgram: '✅ Speech-to-Text (Nova-3)',
      gemini: '✅ AI Chat (2.5-Flash-Lite)',
      smallest_ai: '✅ Text-to-Speech (Lightning-v2)'
    },
    version: '2.0.0',
    node_version: process.version
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('\n🚀 VOICE AGENT SERVER GESTARTET 🚀');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔗 WebSocket: ws://localhost:${PORT}`);
  console.log('\n🔧 Services (NEUESTE MODELLE):');
  console.log('   🎤 Deepgram Nova-3 - Deutsche Spracherkennung');
  console.log('   🤖 Gemini 2.5 Flash-Lite - Ultraschnelle KI-Antworten');  
  console.log('   🔊 Smallest.ai Lightning-v2 - Deutsche Sprachsynthese');
  console.log('\n⚡ Optimiert für <500ms Latenz mit neuesten Modellen!');
  console.log('📊 Health Check: http://localhost:' + PORT + '/health\n');
});

export default server; 