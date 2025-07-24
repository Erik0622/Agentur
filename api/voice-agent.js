/* =======================================================================
   FILE 1: api/voice-agent.js  (patched)
   -----------------------------------------------------------------------
   - Fix Deepgram 400 (remove encoding/sample_rate for container audio)
   - Ensure Gemini stream always yields a TTS text (fallback when empty)
   - Better logging & error handling
   - Keep NDJSON streaming contract
   ======================================================================= */

import { request, Agent } from 'undici';
import WebSocket from 'ws';
import { createSign } from 'crypto';

// ---------------- Configuration ----------------
let config;
try {
  config = await import('../config.js').then(m => m.config);
} catch {
  config = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
    RUNPOD_POD_ID: process.env.RUNPOD_POD_ID,
    SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) : undefined
  };
}

const { DEEPGRAM_API_KEY, RUNPOD_API_KEY, RUNPOD_POD_ID, SERVICE_ACCOUNT_JSON } = config;

// ---------------- HTTP Agents ----------------
const geminiAgent = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, keepAliveTimeoutThreshold: 1000, connections: 10, pipelining: 1 });
const runpodAgent = new Agent({ keepAliveTimeout: 15_000, keepAliveMaxTimeout: 60_000, connections: 5, pipelining: 1 });
const tokenAgent  = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 300_000, connections: 2, pipelining: 1 });

// ---------------- Pod State ----------------
let currentPodEndpoint = null;
let podStartTime = null;
let podStopTimer = null;

// ---------------- API Handler ----------------
export default async function handler(req, res) {
  console.log('[voice-agent] --- API Request ---');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bypass-Stt, X-Simulated-Transcript');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audio, voice = 'german_m2', detect = false } = req.body || {};

  console.log('🔍 API Request Debug:');
  console.log('  - Audio vorhanden:', !!audio);
  console.log('  - Audio Länge (Base64 chars):', audio ? audio.length : 'N/A');
  console.log('  - Voice:', voice);
  console.log('  - Request body keys:', Object.keys(req.body || {}));

  if (!audio) {
    console.log('⚠️ Missing audio data');
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

// ---------------- Streaming Helper ----------------
function streamResponse(res, type, data) {
  if (res.finished) return;
  try {
    res.write(JSON.stringify({ type, data }) + '\n');
  } catch {
    res.write(JSON.stringify({ type: 'error', data: { message: 'serialization' } }) + '\n');
  }
}

// ---------------- Deepgram WebSocket ----------------
function getTranscriptViaWebSocket(audioBuffer, { detect }) {
  return new Promise((resolve, reject) => {
    const hex8 = audioBuffer.slice(0, 8).toString('hex');
    let encodingParam = '';
    let sampleRateParam = '';
    let channelsParam = '';
    let format = 'unknown';

    if (hex8.startsWith('1a45dfa3')) format = 'webm';
    else if (hex8.startsWith('52494646')) format = 'wav';
    else if (hex8.startsWith('4f676753')) format = 'ogg';
    else {
      format = 'raw';
      encodingParam = '&encoding=opus';
      sampleRateParam = '&sample_rate=48000';
      channelsParam = '&channels=1';
    }

    const langParams = detect ? 'detect_language=true' : 'language=de';

    const deepgramUrl =
      `wss://api.deepgram.com/v1/listen?model=nova-2` +
      `&${langParams}` +
      `&punctuate=true` +
      `&interim_results=false` +
      `&endpointing=300` +
      `&vad_events=true` +
      encodingParam + sampleRateParam + channelsParam;

    console.log('🔍 Audio Format Detection:', hex8);
    console.log('✅ Detected format:', format);
    console.log('🔗 Deepgram WebSocket URL:', deepgramUrl);

    const ws = new WebSocket(deepgramUrl, {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false
    });

    let finalTranscript = '';
    let gotResults = false;
    let opened = false;

    ws.on('open', () => {
      opened = true;
      console.log('✅ Deepgram WebSocket connected');
      try {
        ws.send(audioBuffer);
        console.log('📤 Audio gesendet:', audioBuffer.length, 'bytes');
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'CloseStream' }));
            console.log('📤 CloseStream gesendet');
          }
        }, 50);
      } catch (err) {
        reject(err);
      }
    });

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
          const alt = msg.channel.alternatives[0];
          const txt = alt.transcript || '';
          if (txt.trim()) {
            gotResults = true;
            if (msg.is_final) finalTranscript += txt + ' ';
          }
        }
      } catch (e) {
        console.warn('⚠️ Parse error:', e);
      }
    });

    ws.on('close', (code, reasonBuf) => {
      const reason = reasonBuf?.toString() || '';
      console.log('🔌 Deepgram WebSocket closed:', code, reason);
      const result = finalTranscript.trim();

      if (!opened) return reject(new Error('WS not opened – check API key/URL'));
      if (code >= 4000 || code === 1006) return reject(new Error(`Deepgram WS closed abnormally (${code}) ${reason}`));
      if (!gotResults && format === 'raw') return reject(new Error('No results – likely wrong encoding/sample rate for raw audio'));
      resolve(result);
    });

    ws.on('error', err => {
      console.error('❌ Deepgram WebSocket Error:', err);
      if (String(err?.message || '').includes('400')) reject(new Error('Deepgram 400 Error - Invalid audio format or parameters'));
      else if (String(err?.message || '').includes('401')) reject(new Error('Deepgram 401 Error - Invalid API key'));
      else reject(err);
    });

    setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) {
        console.log('⏰ Deepgram Timeout');
        try { ws.terminate(); } catch {}
        reject(new Error('Deepgram timeout - try shorter audio'));
      }
    }, 25000);
  });
}

// ---------------- LLM Processing ----------------
async function processAndStreamLLMResponse(transcript, voice, res) {
  console.log('🤖 Starting LLM processing for:', transcript);
  let fullResponse = '';

  try {
    const geminiStream = getGeminiStream(transcript);
    for await (const token of geminiStream) {
      streamResponse(res, 'llm_chunk', { text: token });
      fullResponse += token;
    }
  } catch (e) {
    console.error('Gemini stream failed:', e);
  }

  console.log('🤖 LLM Complete Response:', fullResponse);
  streamResponse(res, 'llm_response', { text: fullResponse });

  const ttsText = (fullResponse && fullResponse.trim()) ? fullResponse.trim() : 'Ich habe dich verstanden.';
  await generateAndStreamSpeechXTTS(ttsText, voice, res);
}

// ---------------- Gemini Streaming ----------------
async function* getGeminiStream(userTranscript) {
  const accessToken = await generateAccessToken();
  const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;

  const requestBody = {
    contents: [{ role: 'user', parts: [{ text: `Du bist ein freundlicher Telefonassistent. Antworte kurz und freundlich.\nKunde: ${userTranscript}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
  };

  const { body } = await request(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
          if (content) yield content;
        } catch {
          // ignore partial lines
        }
      }
    }
  }
}

// ---------------- XTTS via RunPod ----------------
async function generateAndStreamSpeechXTTS(text, voice, res) {
  console.log('🔊 XTTS generation starting...');
  try {
    await ensurePodRunning();
    if (!currentPodEndpoint) throw new Error('RunPod not available');

    const endpoint = `${currentPodEndpoint}/api/tts`;
    const reqBody = { text, speaker: voice || 'german_m2', language: 'de', stream_chunk_size: 180 };

    const { body, statusCode } = await request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      dispatcher: runpodAgent
    });

    if (statusCode !== 200) throw new Error(`XTTS returned ${statusCode}`);

    const audioBuffer = Buffer.from(await body.arrayBuffer());
    streamResponse(res, 'audio_chunk', { base64: audioBuffer.toString('base64'), format: 'wav' });
    streamResponse(res, 'tts_engine', { engine: 'xtts' });
  } catch (e) {
    console.error('XTTS Error:', e);
    streamResponse(res, 'tts_engine', { engine: 'gcp_fallback', reason: e.message });
    await generateAndStreamSpeechGCP(text, voice, res);
  }
}

// ---------------- RunPod Management ----------------
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
  const { body, statusCode } = await request('https://api.runpod.io/graphql', {
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
  const { body, statusCode } = await request('https://api.runpod.io/graphql', {
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
    const { body } = await request('https://api.runpod.io/graphql', {
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

// ---------------- Google Auth & GCP TTS Fallback ----------------
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
  const toSign = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.` +
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
    streamResponse(res, 'audio_chunk', { base64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADAE1wZWcgZ2VuZXJhdG9yAA==', format: 'mp3' });
    streamResponse(res, 'tts_engine', { engine: 'silent', reason: e.message });
  }
}

export { processAndStreamLLMResponse, generateAndStreamSpeechGCP };
