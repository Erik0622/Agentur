import { GoogleGenerativeAI } from '@google/generative-ai';

// DIREKTIVE API KEYS UND SERVICE ACCOUNT - NUR SICHER FÜR PRIVATE REPOSITORIES!
const API_KEYS = {
  DEEPGRAM: "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681",
  GEMINI: "AIzaSyDMfirI46wtNLlmV2moDRjnxmSzhAWIMZQ", 
  SMALLEST: "sk-2ad79c9f-cf37-44b3-87dd-0b0b8eb66e5b"
};

// Vertex AI Service Account - ECHTE CREDENTIALS
const SERVICE_ACCOUNT_JSON = {
  "type": "service_account",
  "project_id": "gen-lang-client-0449145483",
  "private_key_id": "fd894c935498452a331afb70b27279bcba4e83d2",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDd0gIe91pDO0pa\ndaD55Ok6g7Huyjz5ARjXYYDtUqAihGDvJdMeuIrqdzf/Pb/jVYEQVVEUn2PDInz5\n+SQHtcfQRuY2mf1YPzdB2Zh1WGsliTwCCQJ320A07cTAnE8P0Q84yxzyOIS4EI/D\nyva+hZ1sm7lMw3XO0dtlneabSVBSRrSB4qkfH5aorGjD4CUdO9BhPhzB3MxkfWGr\nk1HMyq4jkRk3RAFJx/+07PX96TnQehIUUQQNWd1GPY4N6FBwvt7GatRtP23cXyL9\nEQ6j7HxFUb4PPHFWdHDLXPefcBWyFo6gYiLpEXS4gZia1q3aStBtfBOpc7NiKJ/h\n4uBNR9jjAgMBAAECggEAGYuzgdRzuTVtUTClytGxiHMdPUZeMkENltRcUDiJR6Be\nN3xwLWQMX4c+VC9M14YD2JkyvsDCcPkaUoF+REMLkXFw1s3yLsUM/JDuLWly4X5G\nAmf+OEZwRQgy9gmqU0R8z8oYec7HfhkuLVrFAtkJcbYXZ39FJH3nmfLO2YhebzMN\nWZYmsApyYXps54401xNXuvUuuqOMmhQKFEWj4wJ8g8l+e48FLYhssm/k3WE6tZ1z\nHeUtxVnCCeh9sa674JXR6jFtufSZPxjgp+/Z1VC02VZ9zpFw6T5RCenuz7gtH3Vp\nLmdY6nmNVkDIgdvnC3K53B+QhTxGxUWlf6RlMd2AcQKBgQD+pWjgrFEbYePuhLHH\nMLuxmveY2sR/xXBYmxAsBAOuQb+iUkgY8V3oO4bCCqQOH/6YtpzycUpB8Zz4DBTY\nSLk7lB7woTHIiXP9U2stqrMmXOhctupVPriQQmBVwo2/oS9YsdlJ6WFtXpNEiUBM\n7XmkI1dOxULzaXPnZT97AK0hMwKBgQDe/+untejoH6F5p2RaDCyV4trRT5JLyTTz\nwMvdDtLJD308UL44AE6+3eWOhTfnzodayzMFKRfaS28yd6T7ZKlhDg9QaHl3RdsP\np+ajFWRWtBSuSYHEFbmYUJTRKDNbHYULtaKhwGWRJuEov/uG4owsG7HdgYuZtbPl\nvchJoT3JkQKBgQCp+vpWN1BwydhfqD4Pq+0ucjZi122hqMcEroWODCP01zi3fttX\now6/bbTXpEi8kQjfIc8EWzFpcYIJZe8oLOtQ5N/+Wmuj5HUDngKGWlL6Abyt3v/v\nZU3IJjauKI98Ynj7aMSV/O6nFiGR91hvwXmYYmruTukRGMxgowpL7jijVwKBgCLs\nweOKQefYzFlZNgZEUddHqC2P4MGtyXVDhKoiYDDNFDgWDTSIF80cw48GnjLXzasS\nl/L+9JVjqw6kXlpg8YYZxZw6QIvFjQFuslhoSUaq/XIuYPxsypxoQmZffWuPu/6R\ne98JWt7Yz/qp1qLRaFKgI8MlPs/b/UjF6FBfyGWBAoGAQjR4TlrWLjdy41VKAW98\nZDnwqz/EpucuucoVBRJhCT9OvqwRYL64Sdk8c1rD80eW1MuRgBnSI4PXRdKilxLX\nB9wWC6O9zAfkq5u+oRqp9fmOqltBbdFkhbJvgg6vX6KwsMmhYw+TpmNK/X84hj8S\nvlySbCS6HKLn5grx13LWR0g=\n-----END PRIVATE KEY-----\n",
  "client_email": "erik86756r75@gen-lang-client-0449145483.iam.gserviceaccount.com",
  "client_id": "115562603227493619457",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/erik86756r75%40gen-lang-client-0449145483.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

// Log to check if the module and api keys are loaded
console.log('--- api/voice-agent module loading ---');
console.log('GEMINI_API_KEY:', API_KEYS.GEMINI ? '✅ Direct Key' : '❌ Missing');
console.log('DEEPGRAM_API_KEY:', API_KEYS.DEEPGRAM ? '✅ Direct Key' : '❌ Missing');
console.log('SMALLEST_API_KEY:', API_KEYS.SMALLEST ? '✅ Direct Key' : '❌ Missing');
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

// Deepgram Speech-to-Text mit direkten Keys
async function transcribeAudio(audioBase64) {
  const DEEPGRAM_API_KEY = API_KEYS.DEEPGRAM;
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY not set');
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

// Korrigierte JWT Token Generation für Service Account (ES-Modul kompatibel)
async function generateAccessToken() {
  // ES-Modul Import für crypto
  const { createSign } = await import('crypto');
  
  const now = Math.floor(Date.now() / 1000);
  
  // JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  };
  
  // JWT Payload  
  const payload = {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: SERVICE_ACCOUNT_JSON.token_uri,
    exp: now + 3600, // 1 Stunde
    iat: now
  };
  
  // Base64URL encode (kompatibel mit allen Node.js Versionen)
  function base64UrlEncode(str) {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }
  
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  // Signatur mit korrekter ES-Modul crypto API
  const signThis = `${encodedHeader}.${encodedPayload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signThis);
  const signature = sign.sign(SERVICE_ACCOUNT_JSON.private_key);
  const encodedSignature = base64UrlEncode(signature);
  
  const jwt = `${signThis}.${encodedSignature}`;
  
  console.log('JWT token created, length:', jwt.length);
  
  // JWT gegen Access Token tauschen
  const fetch = (await import('node-fetch')).default;
  const response = await fetch(SERVICE_ACCOUNT_JSON.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token exchange error:', response.status, errorText);
    throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
  }
  
  const tokenData = await response.json();
  console.log('Access token received, expires in:', tokenData.expires_in, 'seconds');
  return tokenData.access_token;
}

// Gemini Chat Response mit korrekter Vertex AI Implementation
async function generateChatResponse(transcript) {
  const PROJECT_ID = "gen-lang-client-0449145483";
  const LOCATION = "global"; 
  const MODEL_ID = "gemini-2.5-flash-lite-preview-06-17";
  
  console.log('Using Vertex AI model:', MODEL_ID);
  console.log('Project ID:', PROJECT_ID);

  const systemPrompt = `Du bist ein freundlicher Telefonassistent für das Restaurant "Bella Vista". Antworte SEHR KURZ und natürlich (max. 25 Wörter).
Öffnungszeiten: Mo-Fr 17-23h, Sa 17-24h, So 17-22h.`;

  try {
    // Service Account Access Token generieren
    console.log('Generating Vertex AI access token...');
    const accessToken = await generateAccessToken();
    console.log('Access token generated successfully');
    
    const fetch = (await import('node-fetch')).default;
    
    // KORREKTUR: Korrekter Vertex AI global Endpoint für Publisher-Modelle mit v1beta1
    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/global/publishers/google/models/${MODEL_ID}:streamGenerateContent`;
    
    console.log('Sending request to Vertex AI endpoint:', endpoint);
    
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemPrompt}\n\nKunde: ${transcript}\n\nAssistant:`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 60,
        topP: 0.8,
        topK: 40
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Vertex AI error response:', response.status, errorBody);
      throw new Error(`Vertex AI API error: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();
    console.log('Vertex AI response successful');
    console.log('Full Gemini response:', JSON.stringify(result, null, 2));
    
    // Gemini Streaming Response ist ein Array - nehme den letzten vollständigen Chunk
    let text = '';
    if (Array.isArray(result)) {
      // Suche nach dem letzten Chunk mit finishReason: "STOP" 
      const finalChunk = result.find(chunk => 
        chunk.candidates?.[0]?.finishReason === "STOP"
      );
      if (finalChunk) {
        text = finalChunk.candidates[0].content.parts[0].text;
      } else {
        // Fallback: Sammle alle Textteile
        text = result
          .map(chunk => chunk.candidates?.[0]?.content?.parts?.[0]?.text)
          .filter(Boolean)
          .join('');
      }
    } else {
      // Einzelnes Objekt (nicht-streaming)
      text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    }
    
    console.log('Extracted text:', text);
    return text || 'Entschuldigung, ich habe Sie nicht verstanden.';
    
  } catch (error) {
    console.error('Vertex AI detailed error:');
    console.error('- Error name:', error.name);
    console.error('- Error message:', error.message);
    console.error('- Error stack:', error.stack);
    throw error;
  }
}

// Smallest.ai Text-to-Speech mit direkten Keys
async function generateSpeech(text) {
    const SMALLEST_API_KEY = API_KEYS.SMALLEST;
    if (!SMALLEST_API_KEY) {
        throw new Error('SMALLEST_API_KEY not set');
    }

    const fetch = (await import('node-fetch')).default;
    
    // Upgrade auf Lightning v2 - bessere Qualität und 16 Sprachen
    const response = await fetch('https://waves-api.smallest.ai/api/v1/lightning-v2/get_speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SMALLEST_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        voice_id: 'german-male', // Lightning v2 unterstützt deutsche Stimmen
        text: text,
        sample_rate: 22050,
        add_wav_header: true
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`TTS API Error: ${response.status} - ${errorBody}`);
    }

    const audioBuffer = await response.arrayBuffer();
    return Buffer.from(audioBuffer).toString('base64');
} 