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
      // Fortfahren ohne Audio, wenn TTS fehlschlägt
    }
    const ttsTime = Date.now() - ttsStart;

    const totalTime = Date.now() - startTime;
    console.log(`=== Voice Pipeline Complete: ${totalTime}ms total ===`);

    return res.json({
      success: true,
      transcript: transcript,
      response: aiResponse,
      audio: audioResponse, // Kann null sein wenn TTS fehlschlägt
      metrics: {
        transcribe_time: transcribeTime,
        chat_time: chatTime,
        tts_time: ttsTime,
        total_time: totalTime
      }
    });

  } catch (error) {
    console.error('=== Voice Pipeline Error ===', error);
    return res.status(500).json({
      success: false,
      error: 'Voice processing failed',
      message: error.message,
      stack: error.stack
    });
  }
}

// Deepgram Speech-to-Text
async function transcribeAudio(audioBase64) {
  try {
    const fetch = (await import('node-fetch')).default;
    
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    
    const response = await fetch('https://api.deepgram.com/v1/listen?language=de&model=nova-3&punctuate=true&smart_format=true&tier=enhanced', {
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
      model: "models/gemini-2.5-flash-lite-preview-0617", // Neuestes & schnellstes Modell!
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 60, // Noch kürzer für maximale Speed
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
    
    console.log('TTS Request to Lightning V2:', { text, voice: 'de-DE-Standard-A' });
    
    const response = await fetch('https://waves-api.smallest.ai/api/v1/lightning-v2/get_speech', {
      method: 'POST',
      headers: {
        'X-API-KEY': SMALLEST_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        voice: 'de-DE-Standard-A', // Deutsche Lightning V2 Stimme
        format: 'mp3',
        speed: 1.2 // Leicht beschleunigt
      })
    });

    console.log('TTS Response Status:', response.status);

    if (response.ok) {
      const contentType = response.headers.get('content-type');
      console.log('TTS Content-Type:', contentType);
      
      if (contentType && contentType.includes('application/json')) {
        // Fallback: JSON Response mit URL oder direktem Audio
        const jsonResponse = await response.json();
        console.log('TTS JSON Response:', jsonResponse);
        
        if (jsonResponse.audio_url) {
          // URL-basierte Response
          const audioResponse = await fetch(jsonResponse.audio_url);
          const audioBuffer = await audioResponse.arrayBuffer();
          return Buffer.from(audioBuffer).toString('base64');
        } else if (jsonResponse.audio) {
          // Direkte Base64 Response
          return jsonResponse.audio;
        }
      } else {
        // Direkte Audio-Datei Response
        const audioBuffer = await response.arrayBuffer();
        return Buffer.from(audioBuffer).toString('base64');
      }
    } else {
      const errorText = await response.text();
      console.error('TTS Error:', response.status, errorText);
      throw new Error(`TTS API Error: ${response.status} - ${errorText}`);
    }

  } catch (error) {
    console.error('TTS generation error:', error);
    throw error; // Werfen statt null zurückgeben für bessere Fehlerbehandlung
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