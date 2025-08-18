/* =======================================================================
   FILE: api/voice-agent-stream.js  (Low Latency WebSocket API)
   -----------------------------------------------------------------------
   - WebSocket-basierte Audio-Verarbeitung für niedrige Latenz
   - 20ms Audio-Chunks direkt von Frontend
   - Optimierte Deepgram-Parameter
   - Früher LLM-Start mit Token-Flush
   - Azure TTS ohne Voice-Fallback
   ======================================================================= */

import { request, Agent } from 'undici';
import WebSocket from 'ws';

// ---------------- Configuration ----------------
let config;
try {
  config = await import('../config.js').then(m => m.config);
} catch {
  config = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'germanywestcentral',
    GEMINI_REGION: process.env.GEMINI_REGION || 'us-central1',
    SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined
  };
}

const {
  DEEPGRAM_API_KEY,
  AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION,
  GEMINI_REGION = 'us-central1',
  SERVICE_ACCOUNT_JSON
} = config;

// ---------------- HTTP Agents (Optimized) ----------------
const geminiAgent = new Agent({ 
  keepAliveTimeout: 30_000, 
  keepAliveMaxTimeout: 120_000, 
  keepAliveTimeoutThreshold: 1000, 
  connections: 10, 
  pipelining: 1,
  connect: { timeout: 5000 }
});
const azureAgent = new Agent({ 
  keepAliveTimeout: 30_000, 
  keepAliveMaxTimeout: 120_000, 
  connections: 10, 
  pipelining: 1,
  connect: { timeout: 5000 }
});

// ---------------- Azure Voice (Fixed) ----------------
const AZURE_VOICE_NAME = 'de-DE-Florian:DragonHDLatestNeural';

// ---------------- WebSocket Handler ----------------
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // WebSocket Upgrade
  if (!res.socket.server.ws) {
    res.socket.server.ws = new WebSocket.Server({ noServer: true });
    
    res.socket.server.ws.on('connection', (ws) => {
      console.log('🔗 WebSocket Stream verbunden');
      
      let deepgramSocket = null;
      let isProcessing = false;
      let interimKickTimer = null;
      let currentTranscript = '';
      let audioChunks = [];
      
      // Deepgram WebSocket starten
      const startDeepgram = () => {
  const deepgramUrl =
    `wss://api.deepgram.com/v1/listen?model=nova-3`
    + `&language=multi`
    + `&punctuate=true`
    + `&interim_results=true`
    + `&endpointing=200`
    + `&utterance_end_ms=300`
    + `&vad_events=true`
    + `&smart_format=true`
    + `&encoding=opus`             // <— WICHTIG für MediaRecorder/WebM-Opus
    + `&sample_rate=48000`
    + `&channels=1`;

  deepgramSocket = new WebSocket(deepgramUrl, {
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
    perMessageDeflate: false
  });
};
        
        deepgramSocket.on('open', () => {
          console.log('✅ Deepgram WebSocket verbunden');
          ws.send(JSON.stringify({ type: 'status', message: 'Deepgram bereit' }));
        });
        
        deepgramSocket.on('message', async (data) => {
  try {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
      const alt = msg.channel.alternatives[0];
      const txt = (alt.transcript || '').trim();

      if (txt) {
        if (msg.is_final) {
          currentTranscript = txt;
          ws.send(JSON.stringify({ type: 'transcript', text: txt, isFinal: true }));
          if (!isProcessing) { isProcessing = true; await processWithLLM(txt, ws); }
        } else {
          ws.send(JSON.stringify({ type: 'transcript', text: txt, isFinal: false }));

          // Zeit-Fallback: falls nur kurze Wörter kommen
          if (!isProcessing && !interimKickTimer) {
            interimKickTimer = setTimeout(async () => {
              if (!isProcessing) {
                isProcessing = true;
                console.log('⏱️ LLM per Timer-Interim gestartet');
                await processWithLLM(txt, ws);
              }
            }, 200);
          }

          // Früher Trigger ab 6 Zeichen stabil
          if (!isProcessing && txt.length >= 6) {
            isProcessing = true;
            if (interimKickTimer) { clearTimeout(interimKickTimer); interimKickTimer = null; }
            console.log('🚀 LLM früh gestartet (≥6 Zeichen Interim)');
            await processWithLLM(txt, ws);
          }
        }
      }
    }
  } catch (e) {
    console.error('Deepgram message error:', e);
  }
});
        
        deepgramSocket.on('close', () => {
          console.log('🔌 Deepgram WebSocket geschlossen');
        });
        
        deepgramSocket.on('error', (error) => {
          console.error('❌ Deepgram WebSocket Error:', error);
        });
      };
      
      // LLM Processing mit frühem TTS-Start
      const processWithLLM = async (transcript, ws) => {
        try {
          console.log('🤖 LLM Processing für:', transcript);
          
          const accessToken = await generateAccessToken();
          const endpoint = `https://${GEMINI_REGION}-aiplatform.googleapis.com/v1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/${GEMINI_REGION}/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse`;
          
          const requestBody = {
            contents: [{ 
              role: 'user', 
              parts: [{ text: `Du bist ein freundlicher Telefonassistent. Antworte kurz und benutze keine Emojis.\nKunde: ${transcript}` }] 
            }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
            safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }]
          };
          
          const { body, statusCode } = await request(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            dispatcher: geminiAgent
          });
          
          if (statusCode !== 200) throw new Error(`Gemini returned ${statusCode}`);
          
          const decoder = new TextDecoder();
          let buffer = '';
          let fullResponse = '';
          let tokenCount = 0;
          let ttsStarted = false;
          
          // Audio Header senden
          ws.send(JSON.stringify({ 
            type: 'audio_header', 
            mime: 'audio/wav' 
          }));
          
          for await (const chunk of body) {
            buffer += decoder.decode(chunk, { stream: true });
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
              let line = buffer.slice(0, newlineIndex).trim();
              buffer = buffer.slice(newlineIndex + 1);
              if (!line) continue;
              
              if (line.startsWith('data:')) line = line.slice(5).trim();
              if (line === '[DONE]') break;
              
              const payloadStr = line.replace(/^[\[,]?/, '').replace(/[\,]?]$/, '');
              let payload;
              try { payload = JSON.parse(payloadStr); } catch { continue; }
              
              const partsArr = payload.candidates?.[0]?.content?.parts ??
                               payload.candidates?.[0]?.delta?.content?.parts ?? [];
              const text = partsArr[0]?.text;
              
              if (text) {
                ws.send(JSON.stringify({ type: 'llm_chunk', text }));
                fullResponse += text;
                tokenCount++;
                
                // TTS nach 15 Tokens früh starten
                if (!ttsStarted && (tokenCount >= 15 || fullResponse.length >= 50)) {
                  ttsStarted = true;
                  console.log('🚀 TTS früh gestartet nach', tokenCount, 'Tokens');
                  generateTTS(fullResponse, ws);
                }
              }
            }
          }
          
          // Falls TTS noch nicht gestartet wurde
          if (!ttsStarted) {
            generateTTS(fullResponse || 'Ich habe dich verstanden.', ws);
          }
          
        } catch (error) {
          console.error('LLM Processing Error:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'LLM-Verarbeitung fehlgeschlagen' 
          }));
        }
      };
      
      // Azure TTS ohne Voice-Fallback
      const generateTTS = async (text, ws) => {
        try {
          console.log('🔊 Azure TTS für:', text);
          
          const region = AZURE_SPEECH_REGION.toLowerCase();
          const TTS_HOST = `${region}.tts.speech.microsoft.com`;
          const TOKEN_HOST = `${region}.api.cognitive.microsoft.com`;
          
          const ssml = `<speak version="1.0" xml:lang="de-DE" xmlns="http://www.w3.org/2001/10/synthesis">
            <voice name="${AZURE_VOICE_NAME}">${escapeXml(text)}</voice>
          </speak>`;
          
          const headers = {
            'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'riff-16khz-16bit-mono-pcm',
            'User-Agent': 'voice-agent/1.0',
            'Connection': 'keep-alive'
          };
          
          const { body, statusCode } = await request(`https://${TTS_HOST}/cognitiveservices/v1`, {
            method: 'POST',
            headers,
            body: ssml,
            dispatcher: azureAgent
          });
          
          if (statusCode !== 200) {
            throw new Error(`Azure TTS ${statusCode}`);
          }
          
          for await (const chunk of body) {
            if (chunk?.length) {
              ws.send(JSON.stringify({
                type: 'audio_chunk',
                base64: Buffer.from(chunk).toString('base64'),
                format: 'wav'
              }));
            }
          }
          
          ws.send(JSON.stringify({ type: 'end' }));
          
        } catch (error) {
          console.error('TTS Error:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'TTS-Verarbeitung fehlgeschlagen' 
          }));
        }
      };
      
      // Google Auth
      const generateAccessToken = async () => {
        const now = Math.floor(Date.now() / 1000);
        const payload = {
          iss: SERVICE_ACCOUNT_JSON.client_email,
          scope: 'https://www.googleapis.com/auth/cloud-platform',
          aud: SERVICE_ACCOUNT_JSON.token_uri,
          exp: now + 3600,
          iat: now
        };
        
        const header = { alg: 'RS256', typ: 'JWT' };
        const token = await createJWT(header, payload, SERVICE_ACCOUNT_JSON.private_key);
        
        const { body, statusCode } = await request(SERVICE_ACCOUNT_JSON.token_uri, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`,
          dispatcher: geminiAgent
        });
        
        if (statusCode !== 200) throw new Error(`Token request failed: ${statusCode}`);
        const response = await body.json();
        return response.access_token;
      };
      
      // JWT Helper
      const createJWT = async (header, payload, privateKey) => {
        const { createSign } = await import('crypto');
        const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
        const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const signature = createSign('RSA-SHA256').update(`${headerB64}.${payloadB64}`).sign(privateKey, 'base64url');
        return `${headerB64}.${payloadB64}.${signature}`;
      };
      
      // XML Escape
      const escapeXml = (str = '') => {
        return str.replace(/[<>&'"/]/g, c => ({
          '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;','/':'&#47;'
        }[c]));
      };
      
      // WebSocket Message Handler
      ws.on('message', (data) => {
        try {
          if (data instanceof Buffer) {
            // Binary Audio Data
            if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
              deepgramSocket.send(data);
            }
          } else {
            // JSON Control Messages
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
              case 'start_audio':
                console.log('🎤 Audio-Stream gestartet');
                startDeepgram();
                break;
                
              case 'end_audio':
                console.log('🛑 Audio-Stream beendet');
                if (deepgramSocket) {
                  deepgramSocket.close();
                }
                break;
                
              default:
                console.log('❓ Unbekannter Message-Type:', message.type);
            }
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket Stream getrennt');
        if (deepgramSocket) {
          deepgramSocket.close();
        }
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket Error:', error);
      });
    });
  }
  
  // WebSocket Upgrade
  res.socket.server.ws.handleUpgrade(req, req.socket, Buffer.alloc(0), (ws) => {
    res.socket.server.ws.emit('connection', ws, req);
  });
} 
