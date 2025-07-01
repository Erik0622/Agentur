import { GoogleGenerativeAI } from '@google/generative-ai';

// API Keys aus Umgebungsvariablen oder Fallback
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '3e69806feb52b90f01f2e47f9e778fc87b6d811a';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDCqBRhKqrwXGfIbfmQVj3nRbQLDFsGqEI';
const SMALLEST_API_KEY = process.env.SMALLEST_API_KEY || 'sk-2ad79c9f-cf37-44b3-87dd-0b0b8eb66e5b';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export default async function handler(req, res) {
  // CORS Headers für Frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, audio, text } = req.body;

    switch (type) {
      case 'transcribe':
        return await handleTranscription(req, res, audio);
      
      case 'chat':
        return await handleChat(req, res, text);
      
      case 'text_to_speech':
        return await handleTTS(req, res, text);
      
      case 'voice_complete':
        return await handleCompleteVoice(req, res, audio);
      
      default:
        return res.status(400).json({ error: 'Invalid request type' });
    }
  } catch (error) {
    console.error('Voice Agent Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
}

// Kompletter Voice-to-Voice Pipeline
async function handleCompleteVoice(req, res, audioBase64) {
  try {
    const startTime = Date.now();

    // 1. Speech-to-Text mit Deepgram
    const transcript = await transcribeAudio(audioBase64);
    const transcribeTime = Date.now() - startTime;

    if (!transcript || transcript.trim().length === 0) {
      return res.json({
        success: false,
        error: 'Keine Sprache erkannt'
      });
    }

    // 2. KI-Antwort mit Gemini
    const chatStart = Date.now();
    const aiResponse = await generateChatResponse(transcript);
    const chatTime = Date.now() - chatStart;

    // 3. Text-to-Speech mit Smallest.ai
    const ttsStart = Date.now();
    const audioResponse = await generateSpeech(aiResponse);
    const ttsTime = Date.now() - ttsStart;

    const totalTime = Date.now() - startTime;

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
    console.error('Complete Voice Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Voice processing failed',
      message: error.message
    });
  }
}

// Deepgram Speech-to-Text
async function transcribeAudio(audioBase64) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    const response = await fetch('https://api.deepgram.com/v1/listen?language=de&model=nova-2&punctuate=true&smart_format=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/webm'
      },
      body: audioBuffer
    });

    if (!response.ok) {
      throw new Error(`Deepgram error: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.results?.channels?.[0]?.alternatives?.[0]?.transcript) {
      return result.results.channels[0].alternatives[0].transcript;
    }
    
    return '';

  } catch (error) {
    console.error('Transcription error:', error);
    throw error;
  }
}

// Gemini Chat Response
async function generateChatResponse(transcript) {
  try {
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

WICHTIG: Antworte SEHR KURZ und natürlich (max. 25 Wörter). Sei freundlich aber effizient.`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 80,
        topP: 0.8,
        topK: 40
      }
    });

    const prompt = `${systemPrompt}\n\nKunde: ${transcript}\n\nAssistant:`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return response.text() || 'Entschuldigung, ich habe Sie nicht verstanden.';

  } catch (error) {
    console.error('Chat generation error:', error);
    return 'Entschuldigung, es gab ein technisches Problem.';
  }
}

// Smallest.ai Text-to-Speech
async function generateSpeech(text) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch('https://api.smallest.ai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SMALLEST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'nova',
        response_format: 'mp3',
        speed: 1.1
      })
    });

    if (response.ok) {
      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer).toString('base64');
    } else {
      console.error('TTS Error:', response.status, await response.text());
      return null;
    }

  } catch (error) {
    console.error('TTS generation error:', error);
    return null;
  }
}

// Einzelne Handler für spezifische Anfragen
async function handleTranscription(req, res, audio) {
  const transcript = await transcribeAudio(audio);
  return res.json({ transcript });
}

async function handleChat(req, res, text) {
  const response = await generateChatResponse(text);
  return res.json({ response });
}

async function handleTTS(req, res, text) {
  const audio = await generateSpeech(text);
  return res.json({ audio });
} 