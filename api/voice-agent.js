import { request, Agent } from 'undici';
import WebSocket from 'ws';
import { createSign } from 'crypto';

// --- Configuration with fallback to environment variables ---
// For production: use environment variables or external config
// For development: create config.js based on config.example.js

let config;
try {
  // Try to import config.js (not in git)
  config = await import('../config.js').then(m => m.config);
} catch {
  // Fallback to environment variables
  config = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681",
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY || "rpa_6BJIJQF8T0JDF8CV2PMGDDM3NMU4EQFGY5FQJYEGcd95ru",
    RUNPOD_POD_ID: process.env.RUNPOD_POD_ID || "e3nohugxevf9s6",
    SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) : 
      {
        "type": "service_account",
        "project_id": "gen-lang-client-0449145483",
        "private_key_id": "1e6ef13b66c6482c0b9aef385d6d95f042717a0b",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCdfC/EouuNEeSm\n2FXhptXiwm7P7qkQk4afQjXgaJ8cMSJgE0DKWbhingFQEBxJgSncPfmbRQpXiGFO\nEWngJFyObbXMyTrbBU2h2Q4se+n+T44Vu3mcYcPFVbPFT1iIbOi70RUG2ek1ea+w\nw3y+ayh0o7v9/Jo5ShelS5gInjsbuOkmT7DV0kbWn1kx0uA1ss3L7fBwCt9WfJSV\nlZrpliVrZRdIolBV14ieW3scaL2E57KR/gvnjoo3g7G+y4xXCT7h4BysyH3SLMcU\nVcj52uKgcOp9Akn4/Z2dXZVErpjH/FwWAQ0yLz40HwggIItoRRqxQgg0nYBd1Gth\nDDftRBBZAgMBAAECggEADBZJ/Eec2Jj0+bFE9iq948eUhbUFmNYZ0QNd6zlcbOeA\nges4X89/DWKfKyvxX9rgAZ1oGPi1kH5RKZLAk4l26R+Wgn83WzQO/0sPgW6JSRGG\nEDjxXoVKZ0zqnUw3uVDSlAe6G2qCMa6DQ4fdfSfwVPN0LExE8fyzz+X7Zz3tv3TU\n4tjnIVV6CPGsysYD5KRF68w1qgQb4K4pTTOoiaCM1mJYFp8jCd7y5HFjM2+2bq0i\nyVNLxnJ7kcm0spUuHZwINImEZ3RV6tuXwljM088ph9voX2ZE8dcwtcBvo8rgGEJE\nMkIc0N5iiTqCINcFgtV5dCGuzHnkIvSFYXFNY+zI4QKBgQDTqPimyLQrx9tyOYb1\nxzT17ekvj0VAluYUMgwgFgncMFnm3i0wHUMp/a3OOmJasko5/Z3RhCRPO6PhB2e8\nIDL1A9VxaFCVrSARVA5oFZTVBZG6O1iH7BRgqGMusHY58wFF/wpl5J/s/wY9CpYU\nz1tB5wEkoFNUx3AoqND4cuyBnQKBgQC+eePQoUq4tTSYq8/M+yfnigkoYt7EeNel\nxyPOOmbN0IMSpOyKvjrBmQes10pjT9aAFql12Km+/aQ+bjWq0T5tqw8znZkfQPb/\nWQk6LkZkYRWIPNiqU/P/7+6fxd38wEyYqJuzd73Db0RkT2aDiCt8fLvnpIp4SyLL\nBG/Uo3S67QKBgQCf9CcNK8n0+BFgDhdu7/+XBxddKMGmISN5CaVeLil/bE7UiPzP\nSp3yQtKxci/X6LrtfjthFaK2+hRLv+PmKNM5lI8eKD4WDwKX9dT5Va3nGlFZ0vWB\nqqhvr3Fc3GBMRNemhSnffNpbKRMW2EQ5L8cAU8nqWvr+q8WYBJP/3iHbhQKBgEuq\n+nCgEqIMAmgAIR4KTFD0Ci1MEbk1VF3cHYJIuxxaECfw8rMvXQIZu+3S3Q9U4R6j\nYhCZ0N05v+y5NYK1ezpv8SsNGY5L7ZOFGGBPj9FCrB4iJeSMU2tCMqawIT7OWd9v\nY+NI107zPdUnoc7w4m2i07bzK7scBidmjNKJWM8FAoGADZ8Ew7y19Zzn7+vp8GEq\nLcZ+dtgT9diJH65fllnuX8pLmT8/qgX2UrzioPQ8ibdsHxg7JzJ56kYD+3+rH3H/\nx9B6GEDHKQoyKEPP/mO1K2TKYgyNcOuV/DvOaHa79fIUdZVuKAN1VPDOF/1rrRUu\ns1Ic6uppkG5eB+SXKwU9O5M=\n-----END PRIVATE KEY-----\n",
        "client_email": "erik86756r75@gen-lang-client-0449145483.iam.gserviceaccount.com",
        "client_id": "115562603227493619457",
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
        "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/erik86756r75%40gen-lang-client-0449145483.iam.gserviceaccount.com",
        "universe_domain": "googleapis.com"
      }
  };
}

const { DEEPGRAM_API_KEY, RUNPOD_API_KEY, RUNPOD_POD_ID, SERVICE_ACCOUNT_JSON } = config;

// --- Optimized HTTP/2 Keep-Alive Agents for undici ---
const geminiAgent = new Agent({
  keepAliveTimeout: 30 * 1000,
  keepAliveMaxTimeout: 120 * 1000,
  keepAliveTimeoutThreshold: 1000,
  connections: 10,
  pipelining: 1
});

const runpodAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

const tokenAgent = new Agent({
  keepAliveTimeout: 60 * 1000,
  keepAliveMaxTimeout: 300 * 1000,
  connections: 2,
  pipelining: 1
});

// --- Global Variables for Pod Management ---
let currentPodEndpoint = null;
let podStartTime = null;

// --- Main Handler ---
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
    
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audio, voice = 'german_m2' } = req.body; // FIXED: Gültiger XTTS Speaker
  if (!audio) {
    return res.status(400).json({ error: 'Missing audio data' });
  }

  try {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
    });

    // BYPASS für Testing: Verwende simuliertes Transkript wenn Header gesetzt
    let transcript;
    
    if (req.headers['x-bypass-stt'] === 'true' && req.headers['x-simulated-transcript']) {
      transcript = req.headers['x-simulated-transcript'];
      console.log('🎯 STT BYPASS: Verwende simuliertes Transkript:', transcript);
      streamResponse(res, 'transcript', { text: transcript });
    } else {
      // FINAL & FASTEST: WebSocket with nova-3 and language=multi
      transcript = await getTranscriptViaWebSocket(Buffer.from(audio, 'base64'));
      streamResponse(res, 'transcript', { text: transcript });
      
      if (!transcript) {
          streamResponse(res, 'error', { message: 'No speech detected.' });
          return res.end();
      }
    }
    
    // Prüfe nochmal auf leeres Transkript
    if (!transcript || transcript.trim().length === 0) {
      streamResponse(res, 'error', { message: 'No speech detected.' });
      return res.end();
    }

    // Optimized Gemini -> XTTS Streaming
    await processAndStreamLLMResponse(transcript, voice, res);

    // Schedule Pod Stop after conversation ends (cost optimization)
    schedulePodStop();

  } catch (error) {
    console.error('!!! Pipeline Error !!!', error);
    streamResponse(res, 'error', { message: error.message || 'An internal error occurred.' });
  } finally {
    if (!res.finished) {
      res.end();
    }
  }
}

// --- Helper Functions ---

function streamResponse(res, type, data) {
  if (!res.finished) {
    res.write(JSON.stringify({ type, data }) + '\n');
  }
}

// OPTIMIZED: WebSocket with nova-3, 50ms chunks for ultra-low latency
function getTranscriptViaWebSocket(audioBuffer) {
  return new Promise((resolve, reject) => {
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&punctuate=true&interim_results=true&endpointing=300';
    const ws = new WebSocket(deepgramUrl, { 
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false // Disable compression for lower latency
    });
    let finalTranscript = '';

    ws.on('open', () => {
      // FIXED: Deepgram WebSocket erwartet NUR rohe PCM-Daten (kein WAV-Header!)
      // Header-Erkennung und Entfernung für verschiedene Audio-Formate
      let pcmData;
      
      if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        // WAV-Format: Header entfernen (normalerweise 44 Bytes)
        pcmData = audioBuffer.subarray(44);
        console.log('📦 WAV-Header entfernt, sende reine PCM-Daten');
      } else {
        // Bereits rohe PCM-Daten
        pcmData = audioBuffer;
        console.log('📦 Rohe PCM-Daten erkannt');
      }
      
      const chunkSize = 1600; // 50ms chunks bei 16kHz (16000 * 0.05 * 2 bytes)
      console.log(`📤 Sende ${pcmData.length} Bytes PCM-Daten in ${Math.ceil(pcmData.length/chunkSize)} Chunks`);
      
      // Sende BINÄRE PCM-Frames (nicht Base64!)
      for (let i = 0; i < pcmData.length; i += chunkSize) {
        if (ws.readyState === WebSocket.OPEN) {
          const chunk = pcmData.subarray(i, i + chunkSize);
          ws.send(chunk); // Binäre Daten, nicht Base64
        }
      }
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
    });

    ws.on('message', data => {
      const message = JSON.parse(data.toString());
      
      // Process both interim and final results for lower perceived latency
      if (message.channel?.alternatives[0]?.transcript) {
        const transcript = message.channel.alternatives[0].transcript;
        
        if (message.is_final) {
          finalTranscript += transcript + ' ';
        }
        // Could also use interim results for even faster response initiation
      }
    });

    ws.on('close', () => resolve(finalTranscript.trim()));
    ws.on('error', reject);
    setTimeout(() => { if (ws.readyState !== WebSocket.CLOSED) { ws.terminate(); reject(new Error('Deepgram timeout')); }}, 10000);
  });
}

async function processAndStreamLLMResponse(transcript, voice, res) {
  // TEMPORARILY DISABLED: XTTS Pod management for testing
  // await ensurePodRunning();
  
  const geminiStream = getGeminiStream(transcript);
  let sentenceBuffer = '';

  for await (const chunk of geminiStream) {
    streamResponse(res, 'llm_chunk', { text: chunk });
    sentenceBuffer += chunk;
    const sentenceEndIndex = sentenceBuffer.search(/[.!?]/);
    if (sentenceEndIndex !== -1) {
      const sentence = sentenceBuffer.substring(0, sentenceEndIndex + 1);
      sentenceBuffer = sentenceBuffer.substring(sentenceEndIndex + 1);
      // TEMPORARILY DISABLED: XTTS for testing
      // generateAndStreamSpeechXTTS(sentence, voice, res).catch(e => console.error('XTTS Error:', e.message));
      console.log(`🎵 XTTS deaktiviert für Test: "${sentence}"`);
    }
  }
  if (sentenceBuffer.trim()) {
    // TEMPORARILY DISABLED: Final XTTS for testing
    // generateAndStreamSpeechXTTS(sentenceBuffer, voice, res).catch(e => console.error('Final XTTS Error:', e.message));
    console.log(`🎵 Final XTTS deaktiviert für Test: "${sentenceBuffer}"`);
  }
}

// UPDATED: Gemini 2.5 Flash-Lite Global Endpoint
async function* getGeminiStream(transcript) {
  const accessToken = await generateAccessToken();
  // GLOBAL endpoint for Flash-Lite (nur hier verfügbar)
  const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;
  const requestBody = {
      contents: [{ role: "user", parts: [{ text: `Du bist ein Telefonassistent. Antworte kurz und freundlich.\nKunde: ${transcript}` }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200
      }
  };
  
  const { body } = await request(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    dispatcher: geminiAgent
  });

  for await (const chunk of body) {
    try {
        const jsonResponse = JSON.parse(chunk.toString().startsWith('[') ? chunk.toString().slice(1) : chunk.toString());
        const content = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) yield content;
    } catch (e) {
        console.warn('Could not parse LLM chunk:', chunk.toString());
    }
  }
}

// --- RunPod Pod Management ---

async function ensurePodRunning() {
  try {
    // Check Pod Status
    const podStatus = await getPodStatus();
    
    // FIXED: Handle all non-running states
    if (podStatus === 'STOPPED' || podStatus === 'EXITED' || podStatus === 'STARTING') {
      console.log('⚡ Starting RunPod for XTTS...');
      await startPod();
      // Wait for Pod to be ready
      await waitForPodReady();
    } else if (podStatus === 'RUNNING') {
      console.log('✓ RunPod already running');
    }
    
    // Set pod start time for auto-stop scheduling
    if (!podStartTime) {
      podStartTime = Date.now();
    }
  } catch (error) {
    // Check for authentication issues specifically
    if (error.message.includes('authentication failed') || error.message.includes('invalid or expired API key')) {
      console.error('🔐 RunPod API-Key ungültig oder abgelaufen! Verwende Google Cloud TTS Fallback');
      console.error('   → Bitte neuen API-Key in RunPod Dashboard generieren');
    } else {
      console.error('🔧 RunPod nicht verfügbar, Fallback zu Google Cloud TTS:', error.message);
    }
    
    // Fallback: Verwende Google Cloud TTS statt RunPod XTTS
    currentPodEndpoint = null; // Signalisiert Fallback-Modus
  }
}

async function getPodStatus() {
  // FIXED: Korrekter Auth-Header und Schema
  const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
    method: 'POST',
    headers: {
      'Authorization': RUNPOD_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus, runtime { uptimeInSeconds, ports { ip, isIpPublic, privatePort, publicPort, type } } } }`
    }),
    dispatcher: runpodAgent
  });

  if (statusCode !== 200) throw new Error(`RunPod API error: ${statusCode}`);
  const result = await body.json();
  
  if (result.errors) {
    throw new Error(`RunPod GraphQL Error: ${result.errors[0].message}`);
  }
  
  if (result.data?.pod) {
    const pod = result.data.pod;
    
    let podStatus = pod.desiredStatus;
    
    if (pod.runtime?.uptimeInSeconds > 0) {
      podStatus = 'RUNNING';
    } else if (pod.desiredStatus === 'RUNNING' && !pod.runtime) {
      podStatus = 'STARTING';
    }
    
    if (podStatus === 'EXITED') {
      podStatus = 'STOPPED';
    }
    
    if (podStatus === 'RUNNING' && pod.runtime?.ports) {
      const httpPort = pod.runtime.ports.find(p => p.isIpPublic && p.type === 'http' && p.privatePort === 8020);
      if (httpPort) {
        currentPodEndpoint = `https://${RUNPOD_POD_ID}-${httpPort.publicPort}.proxy.runpod.net`;
        console.log(`✓ Pod Proxy URL: ${currentPodEndpoint}`);
      }
    }
    
    return podStatus;
  }
  throw new Error('Pod not found or invalid API key');
}

async function startPod() {
  // FIXED: Korrekter Auth-Header und Schema
  const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
    method: 'POST',
    headers: {
      'Authorization': RUNPOD_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `mutation { podResume(input: {podId: "${RUNPOD_POD_ID}", gpuCount: 1}) { id, desiredStatus } }`
    }),
    dispatcher: runpodAgent
  });

  if (statusCode !== 200) throw new Error(`Failed to start pod: ${statusCode}`);
  const result = await body.json();
  
  if (result.errors) {
    throw new Error(`RunPod Start Error: ${result.errors[0].message}`);
  }
  
  if (!result.data?.podResume) {
    throw new Error('Failed to start pod, response did not contain podResume data.');
  }
}

async function waitForPodReady() {
  const maxWaitTime = 120000; // 2 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const status = await getPodStatus();
      if (status === 'RUNNING' && currentPodEndpoint) {
        // FIXED: Health-Check auf / statt /health
        const { statusCode } = await request(`${currentPodEndpoint}/`, {
          method: 'GET',
          dispatcher: runpodAgent
        });
        
        if (statusCode === 200) {
          console.log('✓ XTTS Pod ready at:', currentPodEndpoint);
          return;
        }
      }
    } catch (e) {
      // Continue waiting
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s
  }
  
  throw new Error('Pod did not become ready in time');
}

async function stopPod() {
  try {
    // FIXED: Korrekter Auth-Header
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'Authorization': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `mutation { podStop(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus } }`
      }),
      dispatcher: runpodAgent
    });

    const result = await body.json();

    if (result.data?.podStop) {
      console.log('🛑 RunPod stopped to save costs');
      currentPodEndpoint = null;
      podStartTime = null;
    } else if (result.errors) {
      console.error('Failed to stop pod:', result.errors[0].message);
    }
  } catch (error) {
    console.error('Failed to stop pod:', error);
  }
}

function schedulePodStop() {
  // Stop pod after 5 minutes of inactivity to save costs
  setTimeout(() => {
    if (podStartTime && Date.now() - podStartTime > 5 * 60 * 1000) {
      stopPod();
    }
  }, 5 * 60 * 1000);
}

// --- XTTS v2.0.3 Integration (FIXED) ---

async function generateAndStreamSpeechXTTS(text, voice, res) {
  // FALLBACK: Wenn RunPod nicht verfügbar, verwende Google Cloud TTS
  if (!currentPodEndpoint) {
    console.log('🔄 Fallback zu Google Cloud TTS (RunPod nicht verfügbar)');
    await generateAndStreamSpeechGCP(text, voice, res);
    return;
  }

  try {
    // FIXED: Korrekter API-Pfad für XTTS Community Images
    const endpoint = `${currentPodEndpoint}/api/tts`;
    const requestBody = {
      text: text,
      speaker: voice || "german_m2", // FIXED: speaker statt speaker_wav
      language: "de",
      stream_chunk_size: 180 // FIXED: Optimiert für ~150ms TTFA
    };
    
    const { body, statusCode } = await request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      dispatcher: runpodAgent
    });

    if (statusCode !== 200) throw new Error(`XTTS API Error: ${statusCode}`);
    
    // Stream WAV audio chunks direkt (kein Base64 needed)
    const audioBuffer = await body.arrayBuffer();
    streamResponse(res, 'audio_chunk', { 
      base64: Buffer.from(audioBuffer).toString('base64'),
      format: 'wav'
    });
  } catch (error) {
    console.log('🔄 XTTS fehgeschlagen, Fallback zu Google Cloud TTS:', error.message);
    await generateAndStreamSpeechGCP(text, voice, res);
  }
}

async function generateAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: SERVICE_ACCOUNT_JSON.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: SERVICE_ACCOUNT_JSON.token_uri, exp: now + 3600, iat: now };
  const header = { alg: 'RS256', typ: 'JWT' };
  const toSign = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256').update(toSign).sign(SERVICE_ACCOUNT_JSON.private_key, 'base64url');
  
  const { body, statusCode } = await request(SERVICE_ACCOUNT_JSON.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${signature}`,
    dispatcher: tokenAgent
  });

  if (statusCode !== 200) throw new Error(`Token exchange failed: ${statusCode}`);
  return (await body.json()).access_token;
}

// --- Google Cloud TTS Fallback ---

async function generateAndStreamSpeechGCP(text, voice, res) {
  try {
    console.log('🎵 Google Cloud TTS Fallback aktiv');
    const accessToken = await generateAccessToken();
    
    const requestBody = {
      input: { text: text },
      voice: { 
        languageCode: 'de-DE', 
        name: 'de-DE-Neural2-B', // Deutsche männliche Stimme
        ssmlGender: 'MALE' 
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        effectsProfileId: ['telephony-class-application']
      }
    };

    const { body, statusCode } = await request('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      dispatcher: tokenAgent
    });

    if (statusCode !== 200) throw new Error(`Google Cloud TTS Error: ${statusCode}`);
    
    const result = await body.json();
    streamResponse(res, 'audio_chunk', { 
      base64: result.audioContent,
      format: 'mp3'
    });
    
    console.log('✅ Google Cloud TTS erfolgreich');
  } catch (error) {
    console.error('❌ Google Cloud TTS Fehler:', error.message);
    // Als letzte Möglichkeit: Silent Audio für Graceful Degradation
    streamResponse(res, 'audio_chunk', { 
      base64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADAE1wZWcgZ2VuZXJhdG9yAA==', // Silent MP3
      format: 'mp3'
    });
  }
} 

export { processAndStreamLLMResponse, generateAndStreamSpeechGCP }; 