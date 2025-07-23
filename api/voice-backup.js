// api/voice-agent.js - KOMPLETT ERSETZEN
import { request, Agent } from 'undici';
import WebSocket from 'ws';
import { createSign } from 'crypto';

// Configuration
let config;
try {
  config = await import('../config.js').then(m => m.config);
} catch {
  config = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681",
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY || "rpa_6BJIJQF8T0JDF8CV2PMGDDM3NMU4EQFGY5FQJYEGcd95ru",
    RUNPOD_POD_ID: process.env.RUNPOD_POD_ID || "1qk7cgnywlip7f",
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

// HTTP Agents
const geminiAgent = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, keepAliveTimeoutThreshold: 1000, connections: 10, pipelining: 1 });
const runpodAgent = new Agent({ keepAliveTimeout: 15_000, keepAliveMaxTimeout: 60_000, connections: 5, pipelining: 1 });
const tokenAgent  = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 300_000, connections: 2, pipelining: 1 });

// Pod State
let currentPodEndpoint = null;
let podStartTime = null;
let podStopTimer = null;

// MAIN API HANDLER - KORRIGIERT für Frontend Request Format
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bypass-Stt, X-Simulated-Transcript');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // WICHTIG: Frontend sendet {audio, voice}, nicht {type, audio, text}
  const { audio, voice = 'german_m2', detect = false } = req.body || {};
  
  console.log('🔍 API Request Debug:');
  console.log('  - Audio vorhanden:', !!audio);
  console.log('  - Audio Länge (Base64 chars):', audio ? audio.length : 'N/A');
  console.log('  - Voice:', voice);
  console.log('  - Request body keys:', Object.keys(req.body || {}));
  
  if (!audio) {
    console.log('❌ Kein Audio in Request Body');
    return res.status(400).json({ error: 'Missing audio data' });
  }

  try {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'Transfer-Encoding': 'chunked'
    });

    let transcript;
    if (req.headers['x-bypass-stt'] === 'true' && req.headers['x-simulated-transcript']) {
      transcript = req.headers['x-simulated-transcript'];
      streamResponse(res, 'transcript', { text: transcript });
    } else {
      const audioBuffer = Buffer.from(audio, 'base64');
      console.log('🎤 Audio Buffer Debug:');
      console.log('  - Buffer Size (bytes):', audioBuffer.length);
      console.log('  - First 4 bytes (hex):', audioBuffer.slice(0, 4).toString('hex'));
      
      transcript = await getTranscriptViaWebSocket(audioBuffer, { detect });
      console.log('📝 Transkript erhalten:', transcript);
      
      if (transcript) streamResponse(res, 'transcript', { text: transcript });
    }

    if (!transcript || transcript.trim().length === 0) {
      console.log('❌ Kein Transkript - sende Error');
      streamResponse(res, 'error', { message: 'No speech detected.' });
      streamResponse(res, 'end', {});
      return res.end();
    }

    await processAndStreamLLMResponse(transcript, voice, res);

    schedulePodStop();
    streamResponse(res, 'end', {});
  } catch (e) {
    console.error('Pipeline Error:', e);
    streamResponse(res, 'error', { message: e.message || 'Internal error' });
    streamResponse(res, 'end', {});
  } finally {
    if (!res.finished) res.end();
  }
}

// Streaming Helper
function streamResponse(res, type, data) {
  if (res.finished) return;
  try {
    res.write(JSON.stringify({ type, data }) + '\n');
  } catch {
    res.write(JSON.stringify({ type: 'error', data: { message: 'serialization' } }) + '\n');
  }
}

// Deepgram WebSocket - KORRIGIERT für bessere Format-Erkennung
function getTranscriptViaWebSocket(audioBuffer, { detect }) {
  return new Promise((resolve, reject) => {
    // Format Detection - VERBESSERT
    let encoding;
    const hex = audioBuffer.slice(0, 8).toString('hex');
    console.log('🔍 Audio Format Detection:', hex);
    
    if (hex.startsWith('1a45dfa3')) {
      encoding = 'webm';
      console.log('✅ Detected: WebM/EBML format');
    } else if (hex.startsWith('52494646')) { // RIFF
      encoding = 'wav';
      console.log('✅ Detected: WAV/RIFF format');
    } else if (hex.startsWith('4f676753')) { // OggS
      encoding = 'ogg-opus';
      console.log('✅ Detected: OGG format');
    } else {
      encoding = 'webm'; // Fallback für unbekannte Formate
      console.log('⚠️ Unknown format, using WebM fallback');
    }

    const sampleRate = 48000;
    const channels = 1;

    const langParams = detect ? 'detect_language=true' : 'language=de';

    const deepgramUrl =
      `wss://api.deepgram.com/v1/listen?model=nova-2` +
      `&encoding=${encodeURIComponent(encoding)}` +
      `&sample_rate=${sampleRate}` +
      `&channels=${channels}` +
      `&${langParams}` +
      `&punctuate=true&interim_results=true&endpointing=300`;

    console.log('🔗 Deepgram WebSocket URL:', deepgramUrl);

    const ws = new WebSocket(deepgramUrl, {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false
    });

    let finalTranscript = '';
    let hasReceivedAnyData = false;

    ws.on('open', () => {
      console.log('✅ Deepgram WebSocket connected');

      // Chunked streaming für bessere Erkennung
      const CHUNK_SIZE = 8192; // 8KB chunks
      let offset = 0;

      function sendNext() {
        if (ws.readyState !== WebSocket.OPEN) return;
        
        const end = Math.min(offset + CHUNK_SIZE, audioBuffer.length);
        const chunk = audioBuffer.subarray(offset, end);
        
        ws.send(chunk);
        offset = end;
        
        if (offset < audioBuffer.length) {
          setTimeout(sendNext, 50); // 50ms delay zwischen chunks
        } else {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          console.log('📤 Audio komplett gesendet:', audioBuffer.length, 'bytes');
        }
      }
      sendNext();
    });

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        hasReceivedAnyData = true;
        
        if (msg.channel?.alternatives?.[0]) {
          const alt = msg.channel.alternatives[0];
          const partial = alt.transcript;
          if (partial) {
            console.log('📝 Partial transcript:', partial, '(final:', msg.is_final, ')');
            if (msg.is_final) {
              finalTranscript += partial + ' ';
            }
          }
        }
        
        if (msg.type === 'Metadata') {
          console.log('ℹ️ Deepgram Metadata:', JSON.stringify(msg, null, 2));
        }
      } catch (e) {
        console.warn('Deepgram Message Parse Error:', e);
      }
    });

    ws.on('close', () => {
      const result = finalTranscript.trim();
      console.log('🔌 Deepgram WebSocket closed. Final:', result);
      if (!hasReceivedAnyData) {
        console.warn('⚠️ No data received - possible encoding mismatch');
      }
      resolve(result);
    });

    ws.on('error', (error) => {
      console.error('❌ Deepgram WebSocket Error:', error);
      reject(error);
    });

    // Timeout
    setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) {
        console.log('⏰ Deepgram Timeout');
        try { ws.terminate(); } catch {}
        reject(new Error('Deepgram timeout'));
      }
    }, 15000);
  });
}

// LLM Processing - mit XTTS Integration
async function processAndStreamLLMResponse(transcript, voice, res) {
  console.log('🤖 Starting LLM processing for:', transcript);
  
  const geminiStream = getGeminiStream(transcript);
  let fullResponse = '';

  // Stream LLM Response
  for await (const token of geminiStream) {
    streamResponse(res, 'llm_chunk', { text: token });
    fullResponse += token;
  }

  console.log('🤖 LLM Complete Response:', fullResponse);
  streamResponse(res, 'llm_response', { text: fullResponse });

  // Generate TTS
  if (fullResponse.trim()) {
    console.log('🔊 Starting TTS generation...');
    await generateAndStreamSpeechXTTS(fullResponse, voice, res);
  }
}

// Gemini 2.5 Flash Lite Stream - KORRIGIERT
async function* getGeminiStream(userTranscript) {
  const accessToken = await generateAccessToken();
  const endpoint =
    `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}` +
    `/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;

  const requestBody = {
    contents: [{ 
      role: 'user', 
      parts: [{ text: `Du bist ein freundlicher Telefonassistent. Antworte kurz und freundlich.\nKunde: ${userTranscript}` }] 
    }],
    generationConfig: { 
      temperature: 0.7, 
      maxOutputTokens: 200 
    }
  };

  console.log('🤖 Gemini Request to:', endpoint);

  const { body } = await request(endpoint, {
    method: 'POST',
    headers: { 
      Authorization: `Bearer ${accessToken}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(requestBody),
    dispatcher: geminiAgent
  });

  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex;
    
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      
      if (!line) continue;
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        
        try {
          const json = JSON.parse(payload.replace(/^\[/, '').replace(/\]$/, ''));
          const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) {
            console.log('🤖 Gemini token:', content);
            yield content;
          }
        } catch (e) {
          // Ignore parse errors for partial data
        }
      }
    }
  }
}

// XTTS v2 über RunPod
async function generateAndStreamSpeechXTTS(text, voice, res) {
  console.log('🔊 XTTS generation starting...');
  
  try {
    await ensurePodRunning();
    
    if (!currentPodEndpoint) {
      throw new Error('RunPod not available');
    }

    const endpoint = `${currentPodEndpoint}/api/tts`;
    const reqBody = {
      text,
      speaker: voice || 'german_m2',
      language: 'de',
      stream_chunk_size: 180
    };
    
    console.log('🔊 XTTS Request:', endpoint, reqBody);

    const { body, statusCode } = await request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      dispatcher: runpodAgent
    });

    if (statusCode !== 200) {
      throw new Error(`XTTS returned ${statusCode}`);
    }

    const audioBuffer = Buffer.from(await body.arrayBuffer());
    console.log('🔊 XTTS audio generated:', audioBuffer.length, 'bytes');
    
    streamResponse(res, 'audio_chunk', {
      base64: audioBuffer.toString('base64'),
      format: 'wav'
    });
    streamResponse(res, 'tts_engine', { engine: 'xtts' });

  } catch (e) {
    console.error('XTTS Error:', e);
    streamResponse(res, 'tts_engine', { engine: 'gcp_fallback', reason: e.message });
    await generateAndStreamSpeechGCP(text, voice, res);
  }
}

// RunPod Management (behalten wie ursprünglich)
async function ensurePodRunning() {
  try {
    const status = await getPodStatus();
    if (status === 'STOPPED' || status === 'EXITED' || status === 'STARTING') {
      await startPod();
      await waitForPodReady();
    }
    if (!podStartTime) podStartTime = Date.now();
  } catch (e) {
    console.error('RunPod not available:', e.message);
    currentPodEndpoint = null;
  }
}

async function getPodStatus() {
  const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
    method: 'POST',
    headers: { Authorization: RUNPOD_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id desiredStatus runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } } } }`
    }),
    dispatcher: runpodAgent
  });
  
  if (statusCode !== 200) throw new Error(`RunPod API ${statusCode}`);
  const result = await body.json();
  if (result.errors) throw new Error(result.errors[0].message);
  
  const pod = result.data?.pod;
  if (!pod) throw new Error('Pod not found');

  let podStatus = pod.desiredStatus;
  if (pod.runtime?.uptimeInSeconds > 0) podStatus = 'RUNNING';
  if (pod.desiredStatus === 'RUNNING' && !pod.runtime) podStatus = 'STARTING';
  if (podStatus === 'EXITED') podStatus = 'STOPPED';

  if (podStatus === 'RUNNING' && pod.runtime?.ports) {
    const httpPort = pod.runtime.ports.find(p => p.isIpPublic && p.type === 'http' && p.privatePort === 8020);
    if (httpPort) {
      currentPodEndpoint = `https://${RUNPOD_POD_ID}-${httpPort.publicPort}.proxy.runpod.net`;
    }
  }
  return podStatus;
}

async function startPod() {
  const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
    method: 'POST',
    headers: { Authorization: RUNPOD_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation { podResume(input: {podId: "${RUNPOD_POD_ID}", gpuCount: 1}) { id desiredStatus } }`
    }),
    dispatcher: runpodAgent
  });
  if (statusCode !== 200) throw new Error(`Start pod failed ${statusCode}`);
  const result = await body.json();
  if (result.errors || !result.data?.podResume) throw new Error('Pod resume error');
}

async function waitForPodReady() {
  const timeout = Date.now() + 120_000;
  while (Date.now() < timeout) {
    try {
      const status = await getPodStatus();
      if (status === 'RUNNING' && currentPodEndpoint) {
        const { statusCode } = await request(`${currentPodEndpoint}/`, { method: 'GET', dispatcher: runpodAgent });
        if (statusCode === 200) return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Pod readiness timeout');
}

async function stopPod() {
  try {
    const { body } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: { Authorization: RUNPOD_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { podStop(input: {podId: "${RUNPOD_POD_ID}"}) { id desiredStatus } }`
      }),
      dispatcher: runpodAgent
    });
    const result = await body.json();
    if (result.data?.podStop) {
      currentPodEndpoint = null;
      podStartTime = null;
    }
  } catch (e) {
    console.error('Stop pod error', e);
  }
}

function schedulePodStop() {
  if (podStopTimer) clearTimeout(podStopTimer);
  podStopTimer = setTimeout(() => {
    if (podStartTime && Date.now() - podStartTime > 5 * 60 * 1000) {
      stopPod();
    }
  }, 5 * 60 * 1000);
}

// Google Access Token Generation
async function generateAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: SERVICE_ACCOUNT_JSON.token_uri,
    exp: now + 3600,
    iat: now
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const toSign =
    `${Buffer.from(JSON.stringify(header)).toString('base64url')}.` +
    `${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256').update(toSign).sign(SERVICE_ACCOUNT_JSON.private_key, 'base64url');

  const { body, statusCode } = await request(SERVICE_ACCOUNT_JSON.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${signature}`,
    dispatcher: tokenAgent
  });
  if (statusCode !== 200) throw new Error(`Token exchange failed ${statusCode}`);
  return (await body.json()).access_token;
}

// GCP TTS Fallback
async function generateAndStreamSpeechGCP(text, voice, res) {
  try {
    const accessToken = await generateAccessToken();
    const reqBody = {
      input: { text },
      voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B', ssmlGender: 'MALE' },
      audioConfig: { audioEncoding: 'MP3', effectsProfileId: ['telephony-class-application'] }
    };
    const { body, statusCode } = await request('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      dispatcher: tokenAgent
    });
    if (statusCode !== 200) throw new Error(`GCP TTS ${statusCode}`);
    const result = await body.json();
    streamResponse(res, 'audio_chunk', { base64: result.audioContent, format: 'mp3' });
    streamResponse(res, 'tts_engine', { engine: 'gcp' });
  } catch (e) {
    console.error('GCP TTS error', e);
    streamResponse(res, 'audio_chunk', {
      base64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADAE1wZWcgZ2VuZXJhdG9yAA==',
      format: 'mp3'
    });
    streamResponse(res, 'tts_engine', { engine: 'silent', reason: e.message });
  }
}
