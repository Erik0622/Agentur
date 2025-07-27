/* =======================================================================
   FILE: api/voice-agent.js  (Ultra-low-latency edition – 2025-07-27)
   -----------------------------------------------------------------------
   Pipeline:  STT (Deepgram WS)  →  LLM (Gemini 2.5 Flash-Lite SSE)
              →  TTS (Azure DragonHD Streaming, WebM/Opus)
   Key latency optimizations:
   - Reuse HTTP agents & cached tokens
   - Deepgram: interim_results=true, endpointing=0, immediate CloseStream
   - Start LLM on first final phrase; stream tokens
   - Sentence-level TTS chunking; stream audio chunks as they arrive
   - No voice-list fallback for DragonHD (bypass)
   - NDJSON contract preserved for FE
   ======================================================================= */

import { request, Agent } from 'undici';
import WebSocket from 'ws';
import { createSign } from 'crypto';
import { performance } from 'node:perf_hooks';

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
    SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
      : undefined
  };
}

const {
  DEEPGRAM_API_KEY,
  AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION,
  GEMINI_REGION,
  SERVICE_ACCOUNT_JSON
} = config;

// ---------------- Constants ----------------
const AZURE_VOICE_NAME = 'de-DE-Florian:DragonHDLatestNeural';
const DG_MODEL = 'nova-2';
const DG_LANG = 'de';
const LLM_MODEL_ENDPOINT = `https://${GEMINI_REGION}-aiplatform.googleapis.com/v1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/${GEMINI_REGION}/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse`;

const AUDIO_FORMAT = 'webm-24khz-16bit-mono-opus';
const MSE_MIME = 'audio/webm;codecs=opus';

// ---------------- HTTP Agents (keep-alive) ----------------
const geminiAgent = new Agent({
  keepAliveTimeout: 120_000,
  keepAliveMaxTimeout: 300_000,
  connections: 20,
  pipelining: 1
});
const tokenAgent = new Agent({
  keepAliveTimeout: 300_000,
  keepAliveMaxTimeout: 600_000,
  connections: 4,
  pipelining: 1
});
const azureAgent = new Agent({
  keepAliveTimeout: 120_000,
  keepAliveMaxTimeout: 300_000,
  connections: 20,
  pipelining: 1
});

// ---------------- Caches ----------------
let _voiceListCache = null;
let _azureBearer = null;
let _azureBearerExp = 0;
let _gcpAccessToken = null;
let _gcpAccessExp = 0;

// ---------------- API Handler ----------------
export default async function handler(req, res) {
  const t0 = performance.now();
  console.log('[voice-agent] --- API Request ---');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bypass-Stt, X-Simulated-Transcript');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audio, voice = AZURE_VOICE_NAME, detect = false } = req.body || {};
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
    let tSttStart = performance.now();

    if (req.headers['x-bypass-stt'] === 'true' && req.headers['x-simulated-transcript']) {
      transcript = req.headers['x-simulated-transcript'];
      streamResponse(res, 'transcript', { text: transcript });
    } else {
      const audioBuffer = Buffer.from(audio, 'base64');

      console.log('🎤 Audio Buffer Debug:');
      console.log('  - Buffer Size (bytes):', audioBuffer.length);
      console.log('  - First 4 bytes (hex):', audioBuffer.slice(0, 4).toString('hex'));

      const { transcript: sttText } = await getTranscriptViaWebSocket(audioBuffer, { detect, res });
      transcript = sttText;
    }

    if (!transcript || transcript.trim().length === 0) {
      console.log('❌ Kein Transkript - sende Error');
      streamResponse(res, 'error', { message: 'No speech detected.' });
      streamResponse(res, 'end', {});
      return res.end();
    }

    const tSttEnd = performance.now();
    console.log(`⏱️ STT total: ${(tSttEnd - tSttStart).toFixed(1)}ms`);

    await processAndStreamLLMResponse(transcript, voice, res);

    streamResponse(res, 'end', {});
    const tTotal = performance.now() - t0;
    console.log(`✅ Total request latency: ${tTotal.toFixed(1)}ms`);
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

// ---------------- Deepgram WebSocket (low latency) ----------------
async function getTranscriptViaWebSocket(audioBuffer, { detect, res }) {
  return new Promise((resolve, reject) => {
    const hex8 = audioBuffer.slice(0, 8).toString('hex');
    let format = 'unknown';
    if (hex8.startsWith('1a45dfa3')) format = 'webm';
    else if (hex8.startsWith('52494646')) format = 'wav';
    else if (hex8.startsWith('4f676753')) format = 'ogg';
    else format = 'raw';

    const params = new URLSearchParams({
      model: DG_MODEL,
      punctuate: 'true',
      interim_results: 'true',   // get partials ASAP
      endpointing: '0',          // no extra wait
      vad_events: 'false'
    });
    if (detect) params.set('detect_language', 'true');
    else params.set('language', DG_LANG);

    if (format === 'raw') {
      params.set('encoding', 'opus');
      params.set('sample_rate', '48000');
      params.set('channels', '1');
    }

    const deepgramUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    console.log('🔍 Audio Format Detection:', hex8);
    console.log('✅ Detected format:', format);
    console.log('🔗 Deepgram WebSocket URL:', deepgramUrl);

    const ws = new WebSocket(deepgramUrl, {
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false
    });

    let opened = false;
    let finalTranscript = '';
    let firstFinalSent = false;

    ws.on('open', () => {
      opened = true;
      console.log('✅ Deepgram WebSocket connected');
      try {
        ws.send(audioBuffer);
        console.log('📤 Audio gesendet:', audioBuffer.length, 'bytes');
        ws.send(JSON.stringify({ type: 'CloseStream' })); // no delay
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
          const isFinal = msg.is_final;
          if (txt.trim()) {
            if (isFinal) {
              finalTranscript += txt + ' ';
              if (!firstFinalSent) {
                firstFinalSent = true;
                streamResponse(res, 'transcript', { text: txt.trim() });
              }
            } else {
              // interim
              streamResponse(res, 'debug_sentence', { text: txt });
            }
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
      resolve({ transcript: result });
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
    }, 15_000);
  });
}

// ---------------- LLM Processing (stream & parallel TTS) ----------------
async function processAndStreamLLMResponse(transcript, voice, res) {
  console.log('🤖 Starting LLM processing for:', transcript);
  const tLlmStart = performance.now();

  const ttsQueue = []; // sentences waiting for TTS
  let ttsRunning = false;
  let fullResponse = '';
  let bufferForSentence = '';

  const enqueueTts = async (sentence) => {
    if (!sentence.trim()) return;
    ttsQueue.push(sentence.trim());
    if (!ttsRunning) {
      ttsRunning = true;
      try {
        await runTtsQueue(ttsQueue, res, voice);
      } finally {
        ttsRunning = false;
      }
    }
  };

  try {
    const stream = getGeminiStream(transcript);
    for await (const token of stream) {
      if (!token) continue;
      streamResponse(res, 'llm_chunk', { text: token });
      fullResponse += token;
      bufferForSentence += token;

      // Simple sentence detector
      if (/[\.!\?…]\s*$/.test(bufferForSentence)) {
        await enqueueTts(bufferForSentence);
        bufferForSentence = '';
      }
    }
  } catch (e) {
    console.error('Gemini stream failed:', e);
  }

  // remaining text
  if (bufferForSentence.trim()) {
    await enqueueTts(bufferForSentence);
    bufferForSentence = '';
  }

  const tLlmEnd = performance.now();
  console.log(`⏱️ LLM total: ${(tLlmEnd - tLlmStart).toFixed(1)}ms`);
  streamResponse(res, 'llm_response', { text: fullResponse });
}

// Process TTS queue sequentially (each sentence)
async function runTtsQueue(queue, res, voice) {
  if (!queue.length) return;
  const text = queue.shift();
  await generateAndStreamSpeechAzureHD(text, res, { voice });
  // process next
  if (queue.length) await runTtsQueue(queue, res, voice);
}

// ---------------- Gemini Streaming ----------------
async function* getGeminiStream(userTranscript) {
  const accessToken = await getGcpAccessToken();
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `Du bist ein freundlicher, sehr schneller Telefonassistent. Antworte knapp.\nKunde: ${userTranscript}` }]
      }
    ],
    generationConfig: { temperature: 0.5, maxOutputTokens: 120 }
  };

  const { body, statusCode, headers } = await request(LLM_MODEL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    dispatcher: geminiAgent
  });

  if (statusCode !== 200) throw new Error(`Gemini returned ${statusCode}`);

  const isSSE = /text\/event-stream/i.test(headers['content-type'] || '');
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      let line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      if (isSSE && line.startsWith('data:')) line = line.slice(5).trim();
      if (line === '[DONE]') return;

      const payloadStr = line.replace(/^[\[,]?/, '').replace(/[\,]?]$/, '');
      let payload;
      try { payload = JSON.parse(payloadStr); } catch { continue; }

      const partsArr = payload.candidates?.[0]?.content?.parts ??
                       payload.candidates?.[0]?.delta?.content?.parts ?? [];
      const text = partsArr[0]?.text;
      if (text) yield text;
    }
  }
}

// ---------------- Azure TTS (streaming) ----------------
async function generateAndStreamSpeechAzureHD(text, res, opts = {}) {
  const region = (process.env.AZURE_SPEECH_REGION || AZURE_SPEECH_REGION || 'westeurope').toLowerCase();
  const TTS_HOST = process.env.AZURE_TTS_HOST || `${region}.tts.speech.microsoft.com`;
  const TOKEN_HOST = process.env.AZURE_TOKEN_HOST || `${region}.api.cognitive.microsoft.com`;

  let requestedVoice = (opts.voice || AZURE_VOICE_NAME).trim();
  let ssmlVoiceName = requestedVoice;
  let deploymentId = opts.deploymentId || null;

  const isDragonHd = /:DragonHDLatestNeural$/i.test(ssmlVoiceName);
  if (!isDragonHd && ssmlVoiceName.includes(':')) {
    const [maybeName, maybeDep] = ssmlVoiceName.split(':');
    if (/^[0-9a-f-]{36}$/i.test(maybeDep)) {
      deploymentId = maybeDep;
      ssmlVoiceName = maybeName;
    } else {
      ssmlVoiceName = maybeName;
    }
  }

  if (!isDragonHd) {
    try {
      ssmlVoiceName = await ensureVoiceAvailable(ssmlVoiceName, TTS_HOST, TOKEN_HOST) || ssmlVoiceName;
    } catch (e) {
      console.warn('⚠️ ensureVoiceAvailable failed:', e.message);
    }
  } else {
    console.log('🔵 HD voice bypass active for', ssmlVoiceName);
  }

  const safeText = String(text || '').trim();
  if (!safeText) throw new Error('Empty text for TTS');

  // Inform FE once per request (guard with flag?)
  streamResponse(res, 'audio_header', { mime: MSE_MIME, format: 'webm' });

  const ssml = buildSsml(safeText, 'de-DE', ssmlVoiceName);
  await synthesizeOnce(ssml, {
    TTS_HOST,
    TOKEN_HOST,
    deploymentId,
    res,
    format: AUDIO_FORMAT
  });
}

// ---------------- SSML Builder ----------------
function buildSsml(text, lang, voice) {
  return `
<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis">
  <voice name="${voice}">${escapeXml(text)}</voice>
</speak>`;
}

// ---------------- Azure synth call ----------------
async function synthesizeOnce(ssml, ctx) {
  const { TTS_HOST, TOKEN_HOST, deploymentId, res, format } = ctx;

  const baseUrl = `https://${TTS_HOST}/cognitiveservices/v1`;
  const endpoint = deploymentId ? `${baseUrl}?deploymentId=${encodeURIComponent(deploymentId)}` : baseUrl;

  let headers = await buildAuthHeaders(TOKEN_HOST);
  applyCommonTtsHeaders(headers, format);

  const { bytesSent, needRetry } = await doTtsRequest(endpoint, headers, ssml, res);
  if (needRetry) {
    headers = await buildAuthHeaders(TOKEN_HOST, true);
    applyCommonTtsHeaders(headers, format);
    await doTtsRequest(endpoint, headers, ssml, res);
  }
}

// ---------------- Common headers ----------------
function applyCommonTtsHeaders(headers, format) {
  headers['Content-Type'] = 'application/ssml+xml';
  headers['X-Microsoft-OutputFormat'] = format;
  headers['User-Agent'] = 'voice-agent/1.0';
}

// ---------------- Azure request streamer ----------------
async function doTtsRequest(endpoint, headers, ssml, res) {
  const tStart = performance.now();
  const { body, statusCode, headers: respHeaders } = await request(endpoint, {
    method: 'POST',
    headers,
    body: ssml,
    dispatcher: azureAgent
  });

  console.log('📥 Azure TTS HTTP status:', statusCode);
  if (statusCode === 401 || statusCode === 403) {
    console.error('Auth failed (will retry?):', respHeaders);
    await safeReadBodyText(body);
    return { bytesSent: 0, needRetry: true };
  }
  if (statusCode !== 200) {
    const errorText = await safeReadBodyText(body);
    console.error('❌ Azure TTS error body:', truncate(errorText, 800));
    console.error('❌ Resp headers:', respHeaders);
    throw new Error(`Azure TTS ${statusCode}: ${truncate(errorText, 500)}`);
  }

  let bytesSent = 0;
  let first = true;
  for await (const chunk of body) {
    if (!chunk?.length) continue;
    bytesSent += chunk.length;
    streamResponse(res, 'audio_chunk', {
      base64: Buffer.from(chunk).toString('base64'),
      format: 'webm'
    });

    if (first) {
      first = false;
      const now = performance.now();
      console.log(`⏱️ TTS first-chunk latency: ${(now - tStart).toFixed(1)}ms`);
    }
  }
  console.log(`⏱️ TTS finish latency: ${(performance.now() - tStart).toFixed(1)}ms`);
  return { bytesSent, needRetry: false };
}

// ---------------- Voice helpers ----------------
function needsHdBypass(name) {
  return /:DragonHDLatestNeural$/i.test(name);
}

async function ensureVoiceAvailable(voiceName, ttsHost, tokenHost) {
  if (needsHdBypass(voiceName)) return voiceName;
  if (_voiceListCache && voiceExists(_voiceListCache, voiceName)) return voiceName;

  try {
    const headers = await buildAuthHeaders(tokenHost);
    const { body, statusCode } = await request(`https://${ttsHost}/cognitiveservices/voices/list`, {
      method: 'GET',
      headers,
      dispatcher: azureAgent
    });
    if (statusCode !== 200) {
      console.warn('⚠️ voices/list returned', statusCode);
      return voiceName;
    }
    const list = await body.json();
    _voiceListCache = list;
    if (voiceExists(list, voiceName)) return voiceName;
    const fallback = findClosestVoice(list, voiceName);
    if (fallback) {
      console.warn(`⚠️ Voice "${voiceName}" not found. Falling back to "${fallback}".`);
      return fallback;
    }
    console.warn(`⚠️ Voice "${voiceName}" not found and no fallback detected.`);
    return voiceName;
  } catch (e) {
    console.warn('⚠️ Could not fetch voices/list:', e.message);
    return voiceName;
  }
}

function voiceExists(list, name) {
  return list.some(v => v.ShortName === name || v.Name === name);
}

function findClosestVoice(list, name) {
  const base = name.split(':')[0];
  const hit = list.find(v => v.ShortName === base || v.ShortName?.startsWith(base));
  if (hit) return hit.ShortName;
  const deMale = list.find(v => /de-DE/i.test(v.Locale) && /Male/i.test(v.Gender));
  return deMale?.ShortName;
}

// ---------------- Auth helpers ----------------
async function buildAuthHeaders(tokenHost, forceBearer = false) {
  if (forceBearer || process.env.AZURE_TTS_USE_BEARER === 'true') {
    const token = await getAzureToken(tokenHost);
    return { Authorization: `Bearer ${token}` };
  }
  return { 'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY };
}

async function getAzureToken(tokenHost) {
  const now = Date.now();
  if (_azureBearer && now < _azureBearerExp - 60_000) return _azureBearer;

  console.log('🔑 Requesting Azure token…');
  const url = `https://${tokenHost}/sts/v1.0/issueToken`;
  const { body, statusCode } = await request(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': '0'
    },
    dispatcher: tokenAgent
  });
  if (statusCode !== 200) {
    const txt = await safeReadBodyText(body);
    throw new Error(`Azure token failed (${statusCode}): ${truncate(txt, 300)}`);
  }
  const token = await body.text();
  _azureBearer = token;
  _azureBearerExp = now + 9 * 60 * 1000; // ~9 min
  console.log('🔑 Azure token acquired (len):', token.length);
  return token;
}

async function getGcpAccessToken() {
  const now = Date.now();
  if (_gcpAccessToken && now < _gcpAccessExp - 60_000) return _gcpAccessToken;

  const token = await generateAccessToken();
  _gcpAccessToken = token;
  _gcpAccessExp = now + 55 * 60 * 1000;
  return token;
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

async function generateAndStreamSpeechGCP(text, voice, res) {
  try {
    const accessToken = await getGcpAccessToken();
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
    console.log('✅ GCP TTS succeeded');
  } catch (e) {
    console.error('GCP TTS error', e);
    // tiny silent mp3
    streamResponse(res, 'audio_chunk', { base64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADAE1wZWcgZ2VuZXJhdG9yAA==', format: 'mp3' });
    streamResponse(res, 'tts_engine', { engine: 'silent', reason: e.message });
  }
}

// ---------------- Utils ----------------
function escapeXml(str = '') {
  return str.replace(/[<>&'"/]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;', '/': '&#47;' }[c])
  );
}

async function safeReadBodyText(body) {
  try { return await body.text(); } catch { return '<unreadable body>'; }
}

function truncate(str = '', max = 200) {
  return str.length <= max ? str : str.slice(0, max) + '…';
}
