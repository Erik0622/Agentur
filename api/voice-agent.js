/* =======================================================================
   API: /api/voice-agent.js (rebuilt)
   - STT: Deepgram (WebSocket)
   - LLM: Google Gemini 2.5 Flash Lite via general API (API key)
   - TTS: Azure Speech (webm-opus chunk streaming)
   - Output: NDJSON lines (types: transcript, llm_chunk, llm_response, audio_header, audio_chunk, tts_engine, error, end)
   ======================================================================= */

import { request, Agent } from 'undici';
import WebSocket from 'ws';

export const config = {
  api: {
    bodyParser: { sizeLimit: '6mb' },
  },
};

// -------- Configuration --------
let appConfig;
try {
  appConfig = await import('../config.js').then(m => m.config);
} catch {
  appConfig = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'germanywestcentral',
  };
}

const {
  DEEPGRAM_API_KEY,
  GEMINI_API_KEY,
  AZURE_SPEECH_KEY,
  AZURE_SPEECH_REGION,
} = appConfig;

// -------- HTTP Agents --------
const geminiAgent = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, keepAliveTimeoutThreshold: 1000, connections: 10, pipelining: 1, connect: { timeout: 5000 } });
const azureAgent  = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, connections: 8, pipelining: 1, connect: { timeout: 5000 } });

// -------- API Handler --------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audio, voice = 'hd_florian', detect = false } = req.body || {};
  if (!audio) return res.status(400).json({ error: 'Missing audio data' });

  try {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'Transfer-Encoding': 'chunked',
    });

    // 1) STT
    const audioBuffer = Buffer.from(audio, 'base64');
    const transcript = await getTranscriptViaDeepgram(audioBuffer, { detect });
    if (transcript) stream(res, 'transcript', { text: transcript });

    if (!transcript || !transcript.trim()) {
      stream(res, 'error', { message: 'No speech detected.' });
      stream(res, 'end', {});
      return res.end();
    }

    // 2) LLM streaming + 3) Early TTS
    await processAndStreamLLMResponse(transcript, voice, res);

    stream(res, 'end', {});
  } catch (e) {
    stream(res, 'error', { message: e?.message || 'Internal error' });
  } finally {
    if (!res.finished) res.end();
  }
}

// -------- Helpers --------
function stream(res, type, data) {
  if (res.finished) return;
  try { res.write(JSON.stringify({ type, data }) + '\n'); }
  catch { res.write(JSON.stringify({ type: 'error', data: { message: 'serialization' } }) + '\n'); }
}

// -------- Deepgram STT (WebSocket) --------
function getTranscriptViaDeepgram(audioBuffer, { detect }) {
  return new Promise((resolve, reject) => {
    const hex8 = audioBuffer.slice(0, 8).toString('hex');
    let encodingParam = '';
    let sampleRateParam = '';
    let channelsParam = '';

    if (hex8.startsWith('1a45dfa3')) {
      // webm
    } else if (hex8.startsWith('52494646')) {
      encodingParam = '&encoding=linear16';
      sampleRateParam = '&sample_rate=48000';
      channelsParam = '&channels=1';
    } else {
      // raw/unknown -> assume linear16 mono 48k
      encodingParam = '&encoding=linear16';
      sampleRateParam = '&sample_rate=48000';
      channelsParam = '&channels=1';
    }

    const langParams = detect ? 'detect_language=true' : 'language=multi';
    const url = `wss://api.deepgram.com/v1/listen?model=nova-3&${langParams}&punctuate=true&interim_results=true&endpointing=200&utterance_end_ms=300&vad_events=true&smart_format=true${encodingParam}${sampleRateParam}${channelsParam}`;

    const ws = new WebSocket(url, { headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` }, perMessageDeflate: false });

    let finalTranscript = '';
    let opened = false;

    ws.on('open', () => {
      opened = true;
      // 20ms chunks heurstic
      const CHUNK_SIZE = 960;
      for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
        ws.send(audioBuffer.subarray(i, i + CHUNK_SIZE));
      }
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }));
      }, 100);
    });

    ws.on('message', data => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'Results' && msg.channel?.alternatives?.[0]) {
          const txt = msg.channel.alternatives[0].transcript || '';
          if (txt && msg.is_final) finalTranscript += txt + ' ';
        }
      } catch {}
    });

    ws.on('close', () => resolve(finalTranscript.trim()));
    ws.on('error', err => reject(err));

    setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) {
        try { ws.terminate(); } catch {}
        reject(new Error('Deepgram timeout'));
      }
    }, 15_000);
  });
}

// -------- LLM -> TTS Pipeline --------
async function processAndStreamLLMResponse(transcript, selectedVoice, res) {
  let full = '';
  let startedTts = false;

  for await (const token of getGeminiStream(transcript)) {
    if (!token) continue;
    stream(res, 'llm_chunk', { text: token });
    full += token;
    if (!startedTts && (full.length >= 50)) {
      startedTts = true;
      generateAndStreamSpeechAzure(full, res, { voice: mapSelectedVoiceToAzure(selectedVoice) }).catch(() => {});
    }
  }

  stream(res, 'llm_response', { text: full });
  if (!startedTts) {
    const text = full.trim() || 'Ich habe dich verstanden.';
    await generateAndStreamSpeechAzure(text, res, { voice: mapSelectedVoiceToAzure(selectedVoice) });
  }
}

// -------- Gemini Streaming (General API + API Key) --------
async function* getGeminiStream(userTranscript) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse&key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const bodyJson = {
    contents: [{ role: 'user', parts: [{ text: `Du bist ein freundlicher Telefonassistent. Antworte kurz und ohne Emojis.\nKunde: ${userTranscript}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 200 },
    safetySettings: [{ category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' }],
  };

  const { body, statusCode, headers } = await request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyJson),
    dispatcher: geminiAgent,
  });

  if (statusCode !== 200) throw new Error(`Gemini returned ${statusCode}`);

  const isSSE = /text\/event-stream/i.test(headers['content-type'] || '');
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      let line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      if (isSSE && line.startsWith('data:')) line = line.slice(5).trim();
      if (line === '[DONE]') return;
      const payloadStr = line.replace(/^[\[,]?/, '').replace(/[\,]?]$/, '');
      let payload;
      try { payload = JSON.parse(payloadStr); } catch { continue; }
      const partsArr = payload.candidates?.[0]?.content?.parts ?? payload.candidates?.[0]?.delta?.content?.parts ?? [];
      const text = partsArr[0]?.text;
      if (text) yield text;
    }
  }
}

// -------- Azure TTS (streaming) --------
async function generateAndStreamSpeechAzure(text, res, opts = {}) {
  const region = (AZURE_SPEECH_REGION || 'germanywestcentral').toLowerCase();
  const TTS_HOST = `${region}.tts.speech.microsoft.com`;

  const voiceName = (opts.voice || 'de-DE-Florian:DragonHDLatestNeural').trim();
  const MSE_MIME = 'audio/webm;codecs=opus';
  const AUDIO_FORMAT = 'webm-16khz-16bit-mono-opus';

  stream(res, 'audio_header', { mime: MSE_MIME, format: 'webm-opus' });

  const ssml = buildSsml(text, 'de-DE', voiceName);
  const endpoint = `https://${TTS_HOST}/cognitiveservices/v1`;

  const { body, statusCode } = await request(endpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AUDIO_FORMAT,
      'User-Agent': 'voice-agent/1.0',
    },
    body: ssml,
    dispatcher: azureAgent,
  });

  if (statusCode !== 200) {
    const txt = await safeReadBodyText(body);
    throw new Error(`Azure TTS ${statusCode}: ${txt?.slice(0, 200)}`);
  }

  let totalBytes = 0;
  for await (const chunk of body) {
    if (!chunk?.length) continue;
    totalBytes += chunk.length;
    stream(res, 'audio_chunk', { base64: Buffer.from(chunk).toString('base64'), format: 'webm-opus' });
  }
  stream(res, 'tts_engine', { engine: 'azure', voice: voiceName, bytes: totalBytes, mime: MSE_MIME });
}

function buildSsml(text, lang, voice) {
  return `\n<speak version="1.0" xml:lang="${lang}" xmlns="http://www.w3.org/2001/10/synthesis">\n  <voice name="${voice}">${escapeXml(String(text || '').trim())}</voice>\n</speak>`;
}

function escapeXml(str = '') {
  return str.replace(/[<>&'"/]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;', '/': '&#47;' }[c]));
}

async function safeReadBodyText(body) { try { return await body.text(); } catch { return '<unreadable body>'; } }

// -------- Voice mapping --------
function mapSelectedVoiceToAzure(selected) {
  const key = String(selected || '').toLowerCase();
  if (key === 'standard_florian' || key === 'florian_standard') return 'de-DE-FlorianMultilingualNeural';
  return 'de-DE-Florian:DragonHDLatestNeural';
}