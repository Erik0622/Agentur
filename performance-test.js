import { request, Agent } from 'undici';
import WebSocket from 'ws';
import { createSign } from 'crypto';

// --- Configuration (use same as voice-agent.js) ---
let config;
try {
  config = await import('./config.js').then(m => m.config);
} catch {
  config = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681",
    SMALLEST_API_KEY: process.env.SMALLEST_API_KEY || "sk_2e04c125a92baf9d289788d555855f80",
    SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 
      JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) : 
      {
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
      }
  };
}

const { DEEPGRAM_API_KEY, SMALLEST_API_KEY, SERVICE_ACCOUNT_JSON } = config;

// --- Optimized HTTP/2 Keep-Alive Agents ---
const geminiAgent = new Agent({
  keepAliveTimeout: 30 * 1000,
  keepAliveMaxTimeout: 120 * 1000,
  keepAliveTimeoutThreshold: 1000,
  connections: 10,
  pipelining: 1
});

const ttsAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

const tokenAgent = new Agent({
  keepAliveTimeout: 60 * 1000,
  keepAliveMaxTimeout: 300 * 1000,
  connections: 2,
  pipelining: 1
});

// --- Test Audio Generation ---
function createTestAudio() {
  const sampleRate = 16000;
  const duration = 2.0; // 2 seconds realistic speech
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
  
  // Realistic speech-like audio
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const fundamental = 220;
    const sample = (
      Math.sin(2 * Math.PI * fundamental * t) * 3000 +
      Math.sin(2 * Math.PI * fundamental * 2 * t) * 1500 +
      Math.sin(2 * Math.PI * fundamental * 3 * t) * 750 +
      Math.random() * 200 - 100
    ) * Math.sin(Math.PI * t / duration);
    
    buffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }
  
  return buffer;
}

// --- OPTIMIZED Deepgram Test ---
async function testOptimizedDeepgram() {
  console.log('\n🎤 OPTIMIZED Deepgram Test (europe-west4 equivalent latency)...');
  
  const audioBuffer = createTestAudio();
  const startTime = performance.now();
  
  return new Promise((resolve, reject) => {
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&punctuate=true&interim_results=true&endpointing=300';
    const ws = new WebSocket(deepgramUrl, { 
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false
    });
    
    let finalTranscript = '';
    let firstResponseTime = null;
    
    ws.on('open', () => {
      const connectionTime = performance.now() - startTime;
      console.log(`✅ WebSocket connected: ${connectionTime.toFixed(2)}ms`);
      
      const pcmData = audioBuffer.subarray(44);
      const chunkSize = 1600; // 50ms chunks
      
      for (let i = 0; i < pcmData.length; i += chunkSize) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pcmData.subarray(i, i + chunkSize));
        }
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CloseStream' }));
      }
    });

    ws.on('message', data => {
      if (!firstResponseTime) {
        firstResponseTime = performance.now();
        console.log(`📨 First response: ${(firstResponseTime - startTime).toFixed(2)}ms`);
      }
      
      const message = JSON.parse(data.toString());
      if (message.channel?.alternatives[0]?.transcript) {
        const transcript = message.channel.alternatives[0].transcript;
        if (message.is_final) {
          finalTranscript += transcript + ' ';
        }
      }
    });

    ws.on('close', () => {
      const totalTime = performance.now() - startTime;
      resolve({
        totalTime,
        firstResponseTime: firstResponseTime - startTime,
        transcript: finalTranscript.trim()
      });
    });

    ws.on('error', reject);
    setTimeout(() => { 
      if (ws.readyState !== WebSocket.CLOSED) { 
        ws.terminate(); 
        reject(new Error('Timeout')); 
      }
    }, 5000);
  });
}

// --- OPTIMIZED Gemini Test (europe-west4 + Flash-Lite) ---
async function testOptimizedGemini() {
  console.log('\n🤖 OPTIMIZED Gemini Test (europe-west4 + Flash-Lite)...');
  
  const startTime = performance.now();
  
  // Generate token
  const tokenStart = performance.now();
  const accessToken = await generateAccessToken();
  const tokenTime = performance.now() - tokenStart;
  console.log(`🔑 Token generated: ${tokenTime.toFixed(2)}ms`);
  
  // Test with optimized endpoint
  const endpoint = `https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/europe-west4/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;
  
  const requestBody = {
    contents: [{ 
      role: "user", 
      parts: [{ text: `Du bist ein Telefonassistent. Antworte kurz.\nKunde: Hallo, können Sie mir helfen?` }] 
    }],
  };
  
  const requestStart = performance.now();
  const { body, statusCode } = await request(endpoint, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${accessToken}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify(requestBody),
    dispatcher: geminiAgent
  });
  
  if (statusCode !== 200) {
    throw new Error(`HTTP ${statusCode}`);
  }
  
  let firstChunkTime = null;
  let totalText = '';
  let chunkCount = 0;
  
  for await (const chunk of body) {
    chunkCount++;
    if (!firstChunkTime) {
      firstChunkTime = performance.now();
      console.log(`📨 First chunk: ${(firstChunkTime - requestStart).toFixed(2)}ms`);
    }
    
    try {
      const jsonStr = chunk.toString();
      let jsonResponse;
      
      if (jsonStr.startsWith('[')) {
        jsonResponse = JSON.parse(jsonStr.slice(1));
      } else if (jsonStr.includes('{')) {
        // Handle streaming JSON chunks
        const jsonMatch = jsonStr.match(/\{[^}]+\}/);
        if (jsonMatch) {
          jsonResponse = JSON.parse(jsonMatch[0]);
        }
      }
      
      if (jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
        totalText += jsonResponse.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      // Ignore parse errors in streaming
    }
  }
  
  const totalTime = performance.now() - requestStart;
  
  return {
    totalTime,
    firstChunkTime: firstChunkTime - requestStart,
    tokenTime,
    chunkCount,
    text: totalText
  };
}

// --- Token Generation ---
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
    dispatcher: tokenAgent
  });

  if (statusCode !== 200) {
    throw new Error(`Token exchange failed: ${statusCode}`);
  }
  return (await body.json()).access_token;
}

// --- Main Test ---
async function runPerformanceTest() {
  console.log('🚀 OPTIMIZED VOICE AGENT PERFORMANCE TEST');
  console.log('📍 Testing: europe-west4 region + Flash-Lite + 50ms chunks + HTTP/2 Keep-Alive');
  console.log('='.repeat(80));
  
  const tests = [];
  
  // Run multiple iterations for accurate results
  for (let i = 1; i <= 3; i++) {
    console.log(`\n🔄 Test Run ${i}/3`);
    
    try {
      // Test Deepgram
      const deepgramResult = await testOptimizedDeepgram();
      console.log(`📊 Deepgram - Total: ${deepgramResult.totalTime.toFixed(2)}ms, TTFR: ${deepgramResult.firstResponseTime.toFixed(2)}ms`);
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Test Gemini
      const geminiResult = await testOptimizedGemini();
      console.log(`📊 Gemini - Total: ${geminiResult.totalTime.toFixed(2)}ms, TTFC: ${geminiResult.firstChunkTime.toFixed(2)}ms`);
      console.log(`🎯 Generated: "${geminiResult.text}"`);
      
      tests.push({
        deepgram: deepgramResult,
        gemini: geminiResult
      });
      
    } catch (error) {
      console.error(`❌ Test ${i} failed:`, error.message);
    }
    
    // Delay between full test runs
    if (i < 3) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Calculate averages
  if (tests.length > 0) {
    const avgDeepgramTTFR = tests.reduce((sum, t) => sum + t.deepgram.firstResponseTime, 0) / tests.length;
    const avgDeepgramTotal = tests.reduce((sum, t) => sum + t.deepgram.totalTime, 0) / tests.length;
    const avgGeminiTTFC = tests.reduce((sum, t) => sum + t.gemini.firstChunkTime, 0) / tests.length;
    const avgGeminiTotal = tests.reduce((sum, t) => sum + t.gemini.totalTime, 0) / tests.length;
    const avgTokenTime = tests.reduce((sum, t) => sum + t.gemini.tokenTime, 0) / tests.length;
    
    console.log('\n' + '='.repeat(80));
    console.log('📈 AVERAGE PERFORMANCE RESULTS (3 runs)');
    console.log('='.repeat(80));
    console.log(`🎤 Deepgram TTFR (Time to First Response): ${avgDeepgramTTFR.toFixed(2)}ms`);
    console.log(`🎤 Deepgram Total Processing: ${avgDeepgramTotal.toFixed(2)}ms`);
    console.log(`🤖 Gemini Token Generation: ${avgTokenTime.toFixed(2)}ms`);
    console.log(`🤖 Gemini TTFC (Time to First Chunk): ${avgGeminiTTFC.toFixed(2)}ms`);
    console.log(`🤖 Gemini Total Processing: ${avgGeminiTotal.toFixed(2)}ms`);
    
    const estimatedE2E = avgDeepgramTTFR + avgGeminiTTFC + 150; // +150ms for TTS estimate
    console.log(`\n🎯 ESTIMATED END-TO-END LATENCY: ${estimatedE2E.toFixed(2)}ms`);
    
    // Performance comparison vs targets
    console.log('\n📊 PERFORMANCE vs TARGETS:');
    console.log(`   Deepgram Target: ~150ms, Actual: ${avgDeepgramTTFR.toFixed(2)}ms ${avgDeepgramTTFR <= 200 ? '✅' : '❌'}`);
    console.log(`   Gemini Target: ~300ms, Actual: ${avgGeminiTTFC.toFixed(2)}ms ${avgGeminiTTFC <= 400 ? '✅' : '❌'}`);
    console.log(`   E2E Target: ~500ms, Estimated: ${estimatedE2E.toFixed(2)}ms ${estimatedE2E <= 600 ? '✅' : '❌'}`);
  }
}

// Run the performance test
runPerformanceTest().catch(console.error); 