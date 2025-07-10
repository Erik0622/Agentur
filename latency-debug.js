import { request, Agent } from 'undici';
import WebSocket from 'ws';
import { createSign } from 'crypto';
import fs from 'fs';

// --- Hardcoded Keys for Testing ---
const DEEPGRAM_API_KEY = "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681";
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

const keepAliveAgent = new Agent({
  keepAliveTimeout: 10 * 1000,
  keepAliveMaxTimeout: 60 * 1000
});

// Erstelle besseres synthetisches Audio das wie Sprache klingt
function createRealisticSpeechAudio() {
  const sampleRate = 16000;
  const duration = 1.0; // 1 Sekunde für bessere Erkennung
  const samples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + samples * 2);
  
  // WAV Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  
  // Generiere mehr realistisches Audio das Sprache ähnelt
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    
    // Mehrere Frequenzen überlagern (Grundfrequenz + Obertöne wie bei menschlicher Stimme)
    const fundamental = 220; // Grundfrequenz wie menschliche Stimme
    const sample = (
      Math.sin(2 * Math.PI * fundamental * t) * 3000 +         // Grundton
      Math.sin(2 * Math.PI * fundamental * 2 * t) * 1500 +     // Erste Oberwelle
      Math.sin(2 * Math.PI * fundamental * 3 * t) * 750 +      // Zweite Oberwelle
      Math.sin(2 * Math.PI * fundamental * 0.5 * t) * 500 +    // Subharmonic
      Math.random() * 200 - 100                                // Leichtes Rauschen
    ) * Math.sin(Math.PI * t / duration); // Envelope (fade in/out)
    
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }
  
  return buffer;
}

// Alternative: Erstelle sehr kurzes Audio für Ultra-Speed-Test
function createUltraFastTestAudio() {
  const sampleRate = 16000;
  const duration = 0.1; // Nur 100ms!
  const samples = Math.floor(sampleRate * duration);
  const buffer = Buffer.alloc(44 + samples * 2);
  
  // WAV Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  
  // Kurzer aber deutlicher Ton
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin(2 * Math.PI * 800 * i / sampleRate) * 8000;
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  
  return buffer;
}

// DEBUGGING: Detaillierter Deepgram Test
async function debugDeepgram() {
  console.log('\n🔍 DEBUGGING Deepgram...');
  
  // Teste beide Audio-Typen
  const audioTypes = [
    { name: "Ultra-Fast (100ms)", buffer: createUltraFastTestAudio() },
    { name: "Realistic Speech (1s)", buffer: createRealisticSpeechAudio() }
  ];
  
  for (const audioType of audioTypes) {
    console.log(`\n🎵 Teste ${audioType.name}...`);
    console.log(`📁 Audio Buffer: ${audioType.buffer.length} bytes (${(audioType.buffer.length / 1024).toFixed(1)}KB)`);
    
    await testDeepgramWithAudio(audioType.buffer, audioType.name);
    
    // Kurze Pause zwischen Tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Test Deepgram mit spezifischem Audio
async function testDeepgramWithAudio(audioBuffer, audioType) {
  const startTime = performance.now();
  let connectionTime = null;
  let firstMessageTime = null;
  let closeTime = null;
  
  return new Promise((resolve, reject) => {
    console.log('🔌 Verbinde zu Deepgram WebSocket...');
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&punctuate=true';
    const ws = new WebSocket(deepgramUrl, { 
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` } 
    });
    
    let finalTranscript = '';
    let messageCount = 0;
    
    ws.on('open', () => {
      connectionTime = performance.now();
      console.log(`✅ WebSocket verbunden nach ${(connectionTime - startTime).toFixed(2)}ms`);
      
      // Sende Audio optimiert
      const pcmData = audioBuffer.subarray(44);
      console.log(`📤 Sende ${pcmData.length} bytes PCM audio...`);
      
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(pcmData);
        console.log(`📤 Audio gesendet`);
        
        // Sende CloseStream
        ws.send(JSON.stringify({ type: 'CloseStream' }));
        console.log(`📤 CloseStream gesendet`);
      }
    });

    ws.on('message', data => {
      messageCount++;
      if (!firstMessageTime) {
        firstMessageTime = performance.now();
        console.log(`📨 Erste Nachricht nach ${(firstMessageTime - startTime).toFixed(2)}ms`);
      }
      
      try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Nachricht ${messageCount}:`, JSON.stringify(message, null, 2));
        
        if (message.is_final && message.channel?.alternatives[0]?.transcript) {
          finalTranscript += message.channel.alternatives[0].transcript + ' ';
          console.log(`📝 Final transcript: "${message.channel.alternatives[0].transcript}"`);
        }
      } catch (e) {
        console.log(`⚠️  Parse Error:`, data.toString());
      }
    });

    ws.on('close', (code, reason) => {
      closeTime = performance.now();
      console.log(`🔒 WebSocket geschlossen nach ${(closeTime - startTime).toFixed(2)}ms (Code: ${code}, Reason: ${reason?.toString()})`);
      
      const result = {
        audioType,
        transcript: finalTranscript.trim(),
        totalTime: closeTime - startTime,
        connectionTime: connectionTime - startTime,
        firstMessageTime: firstMessageTime ? firstMessageTime - startTime : null,
        messageCount
      };
      
      console.log(`\n📊 ${audioType} Deepgram Result:`);
      console.log(`   Total: ${result.totalTime.toFixed(2)}ms`);
      console.log(`   Connection: ${result.connectionTime.toFixed(2)}ms`);
      console.log(`   First Response: ${result.firstMessageTime ? result.firstMessageTime.toFixed(2) : 'N/A'}ms`);
      console.log(`   Messages: ${result.messageCount}`);
      console.log(`   Transcript: "${result.transcript}"`);
      
      resolve(result);
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket Error:`, error);
      reject(error);
    });
    
    setTimeout(() => { 
      if (ws.readyState !== WebSocket.CLOSED) { 
        console.log('⏰ Timeout - schließe WebSocket...');
        ws.terminate(); 
        reject(new Error('Deepgram timeout')); 
      }
    }, 5000);
  });
}

// DEBUGGING: Detaillierter Gemini Test
async function debugGemini() {
  console.log('\n🔍 DEBUGGING Gemini...');
  
  const testPrompt = "Hallo, wie geht es dir?";
  console.log(`📝 Test Prompt: "${testPrompt}"`);
  
  try {
    // Erstmal Token generieren
    console.log('🔑 Generiere Access Token...');
    const tokenStart = performance.now();
    const accessToken = await generateAccessToken();
    const tokenTime = performance.now() - tokenStart;
    console.log(`✅ Token generiert nach ${tokenTime.toFixed(2)}ms`);
    
    // Teste verschiedene Gemini 2.x Endpoints
    const endpoints = [
      `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/us-central1/publishers/google/models/gemini-2.0-flash-lite:streamGenerateContent`,
      `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/us-central1/publishers/google/models/gemini-2.0-flash:streamGenerateContent`,
      `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/us-central1/publishers/google/models/gemini-2.5-flash:streamGenerateContent`
    ];
    
    for (const endpoint of endpoints) {
      console.log(`\n🌐 Teste Endpoint: ${endpoint}`);
      await testGeminiEndpoint(endpoint, testPrompt, accessToken);
    }
  } catch (error) {
    console.error('❌ Gemini Error:', error);
    if (error.cause) {
      console.error('❌ Cause:', error.cause);
    }
  }
}

// Test einzelnen Gemini Endpoint
async function testGeminiEndpoint(endpoint, testPrompt, accessToken) {
  try {
    const requestBody = {
      contents: [{ 
        role: "user", 
        parts: [{ text: `Du bist ein Telefonassistent. Antworte kurz.\nKunde: ${testPrompt}` }] 
      }],
    };
    
    const requestStart = performance.now();
    console.log('📡 Sende Request...');
    
    const { body, statusCode } = await request(endpoint, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(requestBody),
      dispatcher: keepAliveAgent
    });
    
    const requestTime = performance.now() - requestStart;
    console.log(`📨 Response erhalten nach ${requestTime.toFixed(2)}ms (Status: ${statusCode})`);
    
    if (statusCode !== 200) {
      console.error(`❌ HTTP Error: ${statusCode}`);
      if (statusCode === 404) {
        console.error(`❌ Model nicht verfügbar oder Endpoint falsch`);
      }
      return;
    }

    let firstChunkTime = null;
    let chunkCount = 0;
    let totalText = '';
    
    console.log('📖 Lese Response Stream...');
    
    for await (const chunk of body) {
      chunkCount++;
      if (!firstChunkTime) {
        firstChunkTime = performance.now();
        console.log(`📨 Erster Chunk nach ${(firstChunkTime - requestStart).toFixed(2)}ms`);
      }
      
      const chunkStr = chunk.toString();
      console.log(`📨 Chunk ${chunkCount} (${chunkStr.length} bytes):`, chunkStr);
      
      try {
        // Verschiedene Parse-Strategien
        let jsonResponse;
        
        if (chunkStr.startsWith('[')) {
          jsonResponse = JSON.parse(chunkStr.slice(1));
        } else if (chunkStr.startsWith('data: ')) {
          jsonResponse = JSON.parse(chunkStr.slice(6));
        } else {
          jsonResponse = JSON.parse(chunkStr);
        }
        
        console.log(`📋 Parsed JSON:`, JSON.stringify(jsonResponse, null, 2));
        
        const content = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          console.log(`📝 Content gefunden: "${content}"`);
          totalText += content;
        } else {
          console.log(`⚠️  Kein Content in Response`);
        }
      } catch (e) {
        console.log(`⚠️  Parse Error:`, e.message);
      }
    }
    
    const totalTime = performance.now() - requestStart;
    
    console.log(`\n📊 Endpoint Summary:`);
    console.log(`   Total Time: ${totalTime.toFixed(2)}ms`);
    console.log(`   First Chunk: ${firstChunkTime ? (firstChunkTime - requestStart).toFixed(2) : 'N/A'}ms`);
    console.log(`   Chunks: ${chunkCount}`);
    console.log(`   Total Text: "${totalText}"`);
    console.log(`   ✅ ERFOLG! Model funktioniert`);
    
  } catch (error) {
    console.error('❌ Endpoint Error:', error.message);
  }
}

// Access Token generieren
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
  const toSign = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256').update(toSign).sign(SERVICE_ACCOUNT_JSON.private_key, 'base64url');
  
  const { body, statusCode } = await request(SERVICE_ACCOUNT_JSON.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${signature}`,
    dispatcher: keepAliveAgent
  });

  if (statusCode !== 200) {
    const errorText = await body.text();
    throw new Error(`Token exchange failed: ${statusCode} - ${errorText}`);
  }
  return (await body.json()).access_token;
}

// Haupttest
async function runDebugTests() {
  console.log('🔧 DEBUGGING Latenz-Probleme');
  console.log('='.repeat(70));
  
  try {
    // Teste Deepgram zuerst
    const deepgramResult = await debugDeepgram();
    console.log('\n📊 Deepgram Result:', deepgramResult);
    
    console.log('\n' + '='.repeat(70));
    
    // Dann Gemini
    await debugGemini();
    
  } catch (error) {
    console.error('❌ Debug Test fehlgeschlagen:', error);
  }
}

// Starte Debug-Tests
runDebugTests().catch(console.error); 