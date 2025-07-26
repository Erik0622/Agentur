/* =======================================================================
   FILE 1: api/voice-agent.js  (patched 2025‑07‑24)
   -----------------------------------------------------------------------
   - Replace XTTS v2/RunPod with Azure Speech HD (chunked streaming)
   - Ensure Gemini stream always yields a TTS text (fallback when empty)
   - Switch to GA model "gemini‑2.5‑flash‑lite" (preview ID removed)
   - Use regional endpoint (us‑central1 by default) + alt=sse for SSE
   - Robust parser: supports SSE, NDJSON and raw JSON/Protobuf chunks
   - Optional SafetySettings & exponential‑back‑off
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
   
   // ---------------- HTTP Agents ----------------
   const geminiAgent = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, keepAliveTimeoutThreshold: 1000, connections: 10, pipelining: 1 });
   const tokenAgent  = new Agent({ keepAliveTimeout: 60_000, keepAliveMaxTimeout: 300_000, connections: 2, pipelining: 1 });
   const azureAgent  = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, connections: 10, pipelining: 1 });
   
   // ---------------- Azure Voice ----------------
   const AZURE_VOICE_NAME = 'de-DE-Florian:DragonHDLatestNeural';
   
   // ---------------- Exponential back‑off helper ----------------
   async function retry(fn, retries = 3, delay = 800) {
     try {
       return await fn();
     } catch (e) {
       if (retries === 0) throw e;
       await new Promise(r => setTimeout(r, delay));
       return retry(fn, retries - 1, delay * 2);
     }
   }
   
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
   
       // (RunPod cleanup removed)
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
       }, 25_000);
     });
   }
   
   // ---------------- LLM Processing ----------------
   async function processAndStreamLLMResponse(transcript, voice, res) {
     console.log('🤖 Starting LLM processing for:', transcript);
     let fullResponse = '';
   
     try {
       const geminiStream = getGeminiStream(transcript);
       for await (const token of geminiStream) {
         if (token) {
           streamResponse(res, 'llm_chunk', { text: token });
           fullResponse += token;
         }
       }
     } catch (e) {
       console.error('Gemini stream failed:', e);
     }
   
     console.log('🤖 LLM Complete Response:', fullResponse);
     streamResponse(res, 'llm_response', { text: fullResponse });
   
     const ttsText = (fullResponse && fullResponse.trim()) ? fullResponse.trim() : 'Ich habe dich verstanden.';
     await generateAndStreamSpeechAzureHD(ttsText, res);
   }
   
   // ---------------- Gemini Streaming ----------------
   async function* getGeminiStream(userTranscript) {
     const accessToken = await retry(() => generateAccessToken(), 2);
   
     const endpoint = `https://${GEMINI_REGION}-aiplatform.googleapis.com/v1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/${GEMINI_REGION}/publishers/google/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse`;
   
     const requestBody = {
       contents: [{ role: 'user', parts: [{ text: `Du bist ein freundlicher Telefonassistent. Antworte kurz und freundlich.\nKunde: ${userTranscript}` }] }],
       generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
       safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }]
     };
   
     const { body, statusCode, headers } = await request(endpoint, {
       method: 'POST',
       headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
   
         // Remove SSE prefix if present
         if (isSSE && line.startsWith('data:')) line = line.slice(5).trim();
   
         if (line === '[DONE]') return;
   
         // Some servers wrap the JSON array in brackets, strip them
         const payloadStr = line.replace(/^[\[,]?/, '').replace(/[\,]?]$/, '');
         let payload;
         try { payload = JSON.parse(payloadStr); } catch { continue; }
   
         // Accept both delta and full text depending on API version
         const partsArr = payload.candidates?.[0]?.content?.parts ??
                          payload.candidates?.[0]?.delta?.content?.parts ?? [];
         const text = partsArr[0]?.text;
         if (text) yield text;
       }
     }
   }
   
  // ---------------- Azure TTS (chunked REST stream) ----------------
async function generateAndStreamSpeechAzureHD(text, res, opts = {}) {
  // Force new West Europe resource hosts (override old region)
  const TTS_HOST   = process.env.AZURE_TTS_HOST   || 'westeurope.tts.speech.microsoft.com';
  const TOKEN_HOST = process.env.AZURE_TOKEN_HOST || 'westeurope.api.cognitive.microsoft.com';

  const requestedVoice = opts.voice || AZURE_VOICE_NAME;
  console.log('🔊 Azure HD TTS starting...');
  console.log('  • Raw text length:', text?.length || 0);
  console.log('  • Configured voice:', requestedVoice);
  console.log('  • Hosts -> TTS:', TTS_HOST, ' TOKEN:', TOKEN_HOST);

  // ----- Voice / deployment handling -----
  let ssmlVoiceName = requestedVoice;
  let deploymentId  = opts.deploymentId || null;
  // If someone passes "name:GUID" split, only treat second part as deploymentId when it's a real GUID
  if (ssmlVoiceName.includes(':')) {
    const [maybeName, maybeDep] = ssmlVoiceName.split(':');
    if (/^[0-9a-f-]{36}$/i.test(maybeDep)) {
      deploymentId = maybeDep;
      ssmlVoiceName = maybeName;
    }
  }

  const baseTtsUrl = `https://${TTS_HOST}/cognitiveservices/v1`;
  const endpoint   = deploymentId
    ? `${baseTtsUrl}?deploymentId=${encodeURIComponent(deploymentId)}`
    : baseTtsUrl;

  const ssml =
    `<speak version="1.0" xml:lang="de-DE">` +
      `<voice name="${ssmlVoiceName}">${escapeXml(text)}</voice>` +
    `</speak>`;

  // ----- Auth headers -----
  let useBearer = process.env.AZURE_TTS_USE_BEARER === 'true';
  const headers = {
    'Content-Type': 'application/ssml+xml',
    'X-Microsoft-OutputFormat': 'riff-24000hz-16bit-mono-pcm',
    'User-Agent': 'voice-agent/1.0'
  };

  if (useBearer) {
    try {
      const token = await getAzureToken(TOKEN_HOST);
      headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.warn('⚠️ Bearer token retrieval failed, falling back to key:', e.message);
      useBearer = false;
    }
  }
  if (!useBearer) headers['Ocp-Apim-Subscription-Key'] = AZURE_SPEECH_KEY;

  console.log('🔗 Azure TTS URL:', endpoint);
  console.log('  • Using bearer token:', useBearer);
  console.log('  • Headers set:', Object.keys(headers));

  let bytesSent = 0;

  try {
    // Optional voice availability probe (cached)
    await ensureVoiceAvailable(ssmlVoiceName, TTS_HOST, headers);

    const { body, statusCode, headers: respHeaders } = await request(endpoint, {
      method: 'POST',
      headers,
      body: ssml,
      dispatcher: azureAgent
    });

    console.log('📥 Azure TTS HTTP status:', statusCode);
    if (statusCode !== 200) {
      const errorText = await safeReadBodyText(body);
      console.error('❌ Azure TTS error body:', truncate(errorText, 800));
      console.error('❌ Resp headers:', respHeaders);
      throw new Error(`Azure TTS ${statusCode}: ${truncate(errorText, 500)}`);
    }

    for await (const chunk of body) {
      if (!chunk?.length) continue;
      bytesSent += chunk.length;
      streamResponse(res, 'audio_chunk', {
        base64: Buffer.from(chunk).toString('base64'),
        format: 'wav'
      });
    }

    console.log('✅ Azure TTS streamed bytes:', bytesSent);
    streamResponse(res, 'tts_engine', {
      engine: 'azure_hd',
      voice: requestedVoice,
      bytes: bytesSent
    });
  } catch (err) {
    console.error('🔴 Azure HD TTS failed:', err);
    streamResponse(res, 'tts_engine', { engine: 'azure_hd', error: err.message });

    // Fallback to GCP
    try {
      console.log('🟡 Falling back to GCP TTS…');
      await generateAndStreamSpeechGCP(text, null, res);
    } catch (fallbackErr) {
      console.error('🔴 GCP fallback also failed:', fallbackErr);
      streamResponse(res, 'error', { message: 'All TTS engines failed.' });
    }
  }
}

let _voiceListCache = null;
async function ensureVoiceAvailable(voiceName, host, authHeaders) {
  if (_voiceListCache) return;
  try {
    const { body, statusCode } = await request(`https://${host}/cognitiveservices/voices/list`, {
      method: 'GET',
      headers: authHeaders,
      dispatcher: azureAgent
    });
    if (statusCode !== 200) {
      console.warn('⚠️ voices/list returned', statusCode);
      return;
    }
    const list = await body.json();
    _voiceListCache = list;
    const found = list.some(v => v.ShortName === voiceName || v.Name === voiceName);
    console.log('🔎 Voice present in list:', found);
    if (!found) console.warn(`⚠️ Voice "${voiceName}" not found in region list. Check region or spelling.`);
  } catch (e) {
    console.warn('⚠️ Could not fetch voices/list:', e.message);
  }
}

async function getAzureToken(tokenHost) {
  console.log('🔑 Requesting Azure token…');
  const url = `https://${tokenHost}/sts/v1.0/issueToken`;
  const { body, statusCode } = await request(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': '0'
    },
    dispatcher: azureAgent
  });
  if (statusCode !== 200) {
    const txt = await safeReadBodyText(body);
    throw new Error(`Azure token failed (${statusCode}): ${truncate(txt, 300)}`);
  }
  const token = await body.text();
  console.log('🔑 Azure token acquired (len):', token.length);
  return token;
}

function escapeXml(str = '') {
  return str.replace(/[<>&'"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;' }[c]));
}

async function safeReadBodyText(body) {
  try { return await body.text(); } catch { return '<unreadable body>'; }
}

function truncate(str = '', max = 200) {
  return str.length <= max ? str : str.slice(0, max) + '…';
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
    console.log('✅ GCP TTS succeeded');
  } catch (e) {
    console.error('GCP TTS error', e);
    // tiny silent mp3
    streamResponse(res, 'audio_chunk', { base64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADAE1wZWcgZ2VuZXJhdG9yAA==', format: 'mp3' });
    streamResponse(res, 'tts_engine', { engine: 'silent', reason: e.message });
  }
}

export { processAndStreamLLMResponse, generateAndStreamSpeechGCP };
