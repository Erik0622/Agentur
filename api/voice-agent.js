import { GoogleGenerativeAI } from '@google/generative-ai';

// Log to check if the module and env vars are loaded at all. This is the first thing that should appear.
console.log('--- api/voice-agent module loading ---');
console.log('GEMINI_API_KEY available:', !!process.env.GEMINI_API_KEY);
console.log('DEEPGRAM_API_KEY available:', !!process.env.DEEPGRAM_API_KEY);
console.log('SMALLEST_API_KEY available:', !!process.env.SMALLEST_API_KEY);
console.log('------------------------------------');

export default async function handler(req, res) {
  // CORS Headers für Frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
    
  console.log(`[${new Date().toISOString()}] Received request:`, req.method, req.url);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, audio, text } = req.body;
    console.log('Request body type:', type);

    switch (type) {
      case 'voice_complete':
        return await handleCompleteVoice(req, res, audio);
      
      default:
        return res.status(400).json({ error: 'Invalid request type' });
    }
  } catch (error) {
    console.error('!!! Top-level handler error !!!', error);
    return res.status(500).json({ 
      error: 'Internal server error in handler', 
      message: error.message 
    });
  }
}

// Kompletter Voice-to-Voice Pipeline
async function handleCompleteVoice(req, res, audioBase64) {
  try {
    console.log('=== Voice Pipeline Started ===');
    const startTime = Date.now();

    // 1. Speech-to-Text mit Deepgram
    console.log('Step 1: Starting Deepgram transcription...');
    const transcript = await transcribeAudio(audioBase64);
    const transcribeTime = Date.now() - startTime;
    console.log(`Step 1 Complete: Transcript="${transcript}" (${transcribeTime}ms)`);

    if (!transcript || transcript.trim().length === 0) {
      console.log('No speech detected, returning error');
      return res.json({
        success: false,
        error: 'Keine Sprache erkannt'
      });
    }

    // 2. KI-Antwort mit Gemini
    console.log('Step 2: Starting Gemini chat generation...');
    const chatStart = Date.now();
    const aiResponse = await generateChatResponse(transcript);
    const chatTime = Date.now() - chatStart;
    console.log(`Step 2 Complete: Response="${aiResponse}" (${chatTime}ms)`);

    // 3. Text-to-Speech mit Smallest.ai
    console.log('Step 3: Starting Lightning V2 TTS...');
    const ttsStart = Date.now();
    let audioResponse = null;
    try {
      audioResponse = await generateSpeech(aiResponse);
      console.log(`Step 3 Complete: Audio generated successfully (${Date.now() - ttsStart}ms)`);
    } catch (ttsError) {
      console.error('TTS failed, continuing without audio:', ttsError);
    }
    const ttsTime = Date.now() - ttsStart;

    const totalTime = Date.now() - startTime;
    console.log(`=== Voice Pipeline Complete: ${totalTime}ms total ===`);

    return res.json({
      success: true,
      transcript: transcript,
      response: aiResponse,
      audio: audioResponse,
      metrics: {
        transcribe_time: transcribeTime,
        chat_time: chatTime,
        tts_time: ttsTime,
        total_time: totalTime
      }
    });

  } catch (error) {
    console.error('=== Voice Pipeline FAILED ===', error);
    return res.status(500).json({
      success: false,
      error: 'Voice processing failed',
      message: error.message,
      stack: error.stack
    });
  }
}

// Deepgram Speech-to-Text mit Fallback-Strategie
async function transcribeAudio(audioBase64) {
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY environment variable not set');
  }
    
  const fetch = (await import('node-fetch')).default;
  const audioBuffer = Buffer.from(audioBase64, 'base64');
  
  // Einfacher Test nur mit nova-3 (ohne tier=enhanced)
  const response = await fetch('https://api.deepgram.com/v1/listen?language=multi&model=nova-3&punctuate=true&smart_format=true', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${DEEPGRAM_API_KEY}`,
      'Content-Type': 'audio/webm'
    },
    body: audioBuffer
  });

  if (response.ok) {
    const result = await response.json();
    console.log('nova-3 successful');
    return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  } else {
    const errorBody = await response.text();
    console.log('nova-3 failed:', response.status, errorBody);
    throw new Error(`Nova-3 not available: ${response.status}`);
  }
}

// Gemini Chat Response mit Fallback-Modellen
async function generateChatResponse(transcript) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable not set');
  }

  // Debug API Key (nur erste/letzte Zeichen)
  console.log('Gemini API Key format:', `${GEMINI_API_KEY.substring(0, 6)}...${GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 6)}`);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

  const systemPrompt = `Du bist ein freundlicher Telefonassistent für das Restaurant "Bella Vista". Antworte SEHR KURZ und natürlich (max. 25 Wörter).
Öffnungszeiten: Mo-Fr 17-23h, Sa 17-24h, So 17-22h.`;

  // Versuche verschiedene Gemini-Modelle in Reihenfolge
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro", 
    "gemini-pro"
  ];

  for (const modelName of models) {
    try {
      console.log(`Trying Gemini model: ${modelName}`);
      
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 60,
          topP: 0.8,
          topK: 40
        }
      });

      const prompt = `${systemPrompt}\n\nKunde: ${transcript}\n\nAssistant:`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      
      console.log(`Gemini model ${modelName} successful`);
      return response.text() || 'Entschuldigung, ich habe Sie nicht verstanden.';
      
    } catch (error) {
      console.log(`Gemini model ${modelName} failed:`, error.message);
      // Weiter zum nächsten Modell
    }
  }
  
  throw new Error('All Gemini models failed');
}

// Smallest.ai Text-to-Speech
async function generateSpeech(text) {
    const SMALLEST_API_KEY = process.env.SMALLEST_API_KEY;
    if (!SMALLEST_API_KEY) {
        throw new Error('SMALLEST_API_KEY environment variable not set');
    }

    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch('https://waves-api.smallest.ai/api/v1/lightning-v2/get_speech', {
      method: 'POST',
      headers: {
        'X-API-KEY': SMALLEST_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        voice: 'de-DE-Standard-A',
        format: 'mp3',
        speed: 1.2
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`TTS API Error: ${response.status} - ${errorBody}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return Buffer.from(audioBuffer).toString('base64');
} 