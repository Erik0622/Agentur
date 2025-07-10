// COMPREHENSIVE LATENCY TEST: Gemini 2.5 Flash-Lite + RunPod XTTS v2.0.3
// Tests the complete optimized pipeline with new endpoints and configurations

import { request, Agent } from 'undici';
import fs from 'fs';
import { createSign } from 'crypto';

// === Configuration ===
const config = {
  DEEPGRAM_API_KEY: "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681",
  RUNPOD_API_KEY: "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk",
  RUNPOD_POD_ID: "e3nohugxevf9s6",
  SERVICE_ACCOUNT_JSON: {
    "type": "service_account",
    "project_id": "gen-lang-client-0449145483",
    "private_key_id": "1e6ef13b66c6482c0b9aef385d6d95f042717a0b",
    "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCdfC/EouuNEeSm\n2FXhptXiwm7P7qkQk4afQjXgaJ8cMSJgE0DKWbhingFQEBxJgSncPfmbRQpXiGFO\nEWngJFyObbXMyTrbBU2h2Q4se+n+T44Vu3mcYcPFVbPFT1iIbOi70RUG2ek1ea+w\nw3y+ayh0o7v9/Jo5ShelS5gInjsbuOkmT7DV0kbWn1kx0uA1ss3L7fBwCt9WfJSV\nlZrpliVrZRdIolBV14ieW3scaL2E57KR/gvnjoo3g7G+y4xXCT7h4BysyH3SLMcU\nVcj52uKgcOp9Akn4/Z2dXZVErpjH/FwWAQ0yLz40HwggIItoRRqxQgg0nYBd1Gth\nDDftRBBZAgMBAAECggEADBZJ/Eec2Jj0+bFE9iq948eUhbUFmNYZ0QNd6zlcbOeA\nges4X89/DWKfKyvxX9rgAZ1oGPi1kH5RKZLAk4l26R+Wgn83WzQO/0sPgW6JSRGG\nEDjxXoVKZ0zqnUw3uVDSlAe6G2qCMa6DQ4fdfSfwVPN0LExE8fyzz+X7Zz3tv3TU\n4tjnIVV6CPGsysYD5KRF68w1qgQb4K4pTTOoiaCM1mJYFp8jCd7y5HFjM2+2bq0i\nyVNLxnJ7kcm0spUuHZwINImEZ3RV6tuXwljM088ph9voX2ZE8dcwtcBvo8rgGEJE\nMkIc0N5iiTqCINcFgtV5dCGuzHnkIvSFYXFNY+zI4QKBgQDTqPimyLQrx9tyOYb1\nxzT17ekvj0VAluYUMgwgFgncMFnm3i0wHUMp/a3OOmJasko5/Z3RhCRPO6PhB2e8\nIDL1A9VxaFCVrSARVA5oFZTVBZG6O1iH7BRgqGMusHY58wFF/wpl5J/s/wY9CpYU\nz1tB5wEkoFNUx3AoqND4cuyBnQKBgQC+eePQoUq4tTSYq8/M+yfnigkoYt7EeNel\nxyPOOmbN0IMSpOyKvjrBmQes10pjT9aAFql12Km+/aQ+bjWq0T5tqw8znZkfQPb/\nWQk6LkZkYRWIPNiqU/P/7+6fxd38wEyYqJuzd73Db0RkT2aDiCt8fLvnpIp4SyLL\nBG/Uo3S67QKBgQCf9CcNK8n0+BFgDhdu7/+XBxddKMGmISN5CaVeLil/bE7UiPzP\nSp3yQtKxci/X6LrtfjthFaK2+hRLv+PmKNM5lI8eKD4WDwKX9dT5Va3nGlFZ0vWB\nqqhvr3Fc3GBMRNemhSnffNpbKRMW2EQ5L8cAU8nqWvr+q8WYBJP/3iHbhQKBgEuq\n+nCgEqIMAmgAIR4KTFD0Ci1MEbk1VF3cHYJIuxxaECfw8rMvXQIZu+3S3Q9U4R6j\nYhCZ0N05v+y5NYK1ezpv8SsNGY5L7ZOFGGBPj9FCrB4iJeSMU2tCMqawIT7OWd9v\nY+NI107zPdUnoc7w4m2i07bzK7scBidmjNKJWM8FAoGADZ8Ew7y19Zzn7+vp8GEq\nLcZ+dtgT9diJH65fllnuX8pLmT8/qgX2UrzioPQ8ibdsHxg7JzJ56kYD+3+rH3H/\nx9B6GEDHKQoyKEPP/mO1K2TKYgyNcOuV/DvOaHa79fIUdZVuKAN1VPDOF/1rrRUu\ns1Ic6uppkG5eB+SXKwU9O5M=\n-----END PRIVATE KEY-----\n",
    "client_email": "erik86756r75@gen-lang-client-0449145483.iam.gserviceaccount.com",
    "client_id": "115562603227493619457",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/erik86756r75%40gen-lang-client-0449145483.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  }
};

// === HTTP/2 Agents ===
const geminiAgent = new Agent({
  keepAliveTimeout: 30 * 1000,
  keepAliveMaxTimeout: 120 * 1000,
  connections: 10,
  pipelining: 1
});

const runpodAgent = new Agent({
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

// === Test Data ===
let testAudioData;
try {
  testAudioData = fs.readFileSync('./test-audio.wav');
} catch (error) {
  console.log('ℹ️  No test-audio.wav found, generating synthetic test audio...');
  testAudioData = generateSyntheticAudio();
}

function generateSyntheticAudio() {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + 16000 * 2, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(16000 * 2, 40);
  
  const sampleCount = 16000 * 2;
  const pcmData = Buffer.alloc(sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    const value = Math.sin(2 * Math.PI * 440 * i / 16000) * 16000;
    pcmData.writeInt16LE(Math.round(value), i * 2);
  }
  
  return Buffer.concat([header, pcmData]);
}

// === Helper Functions ===

async function generateAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.SERVICE_ACCOUNT_JSON.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: config.SERVICE_ACCOUNT_JSON.token_uri,
    exp: now + 3600,
    iat: now
  };
  
  const header = { alg: 'RS256', typ: 'JWT' };
  const toSign = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256').update(toSign).sign(config.SERVICE_ACCOUNT_JSON.private_key, 'base64url');
  
  const { body, statusCode } = await request(config.SERVICE_ACCOUNT_JSON.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${signature}`,
    dispatcher: tokenAgent
  });

  if (statusCode !== 200) throw new Error(`Token failed: ${statusCode}`);
  return (await body.json()).access_token;
}

// === RunPod Pod Management ===

async function getPodStatus() {
  const { body, statusCode } = await request('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: {
      'x-api-key': config.RUNPOD_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: `query { pod(input: {podId: "${config.RUNPOD_POD_ID}"}) { id, desiredStatus, runtime { ports { ip, isIpPublic, privatePort, publicPort, type } } } }`
    }),
    dispatcher: runpodAgent
  });

  if (statusCode !== 200) throw new Error(`RunPod API error: ${statusCode}`);
  const result = await body.json();
  
  if (result.data?.pod) {
    const pod = result.data.pod;
    let endpoint = null;
    
    // FIXED: Korrekte Proxy-URL für XTTS Port 8020
    if (pod.desiredStatus === 'RUNNING') {
      endpoint = `https://${config.RUNPOD_POD_ID}-8020.proxy.runpod.net`;
    }
    
    return { status: pod.desiredStatus, endpoint };
  }
  
  throw new Error('Pod not found');
}

// === Test Functions ===

async function testGemini25FlashLite() {
  console.log('🧠 Testing Gemini 2.5 Flash-Lite (Global Endpoint)...');
  
  const startTime = Date.now();
  const accessToken = await generateAccessToken();
  const tokenTime = Date.now() - startTime;
  
  const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${config.SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;
  
  const requestBody = {
    contents: [{ 
      role: "user", 
      parts: [{ text: "Hallo, ich hätte gerne Informationen zu Ihren Öffnungszeiten." }] 
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 100
    }
  };
  
  try {
    const geminiStart = Date.now();
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
      console.log(`❌ Gemini error: ${statusCode}`);
      const errorText = await body.text();
      console.log(`Error details: ${errorText}`);
      return null;
    }

    let ttfc = null;
    let totalChunks = 0;
    let totalResponse = '';

    for await (const chunk of body) {
      if (!ttfc) {
        ttfc = Date.now() - geminiStart;
      }
      
      try {
        const chunkStr = chunk.toString();
        const jsonStr = chunkStr.startsWith('[') ? chunkStr.slice(1) : chunkStr;
        const parsed = JSON.parse(jsonStr);
        const content = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (content) {
          totalResponse += content;
          totalChunks++;
        }
      } catch (e) {
        // Skip unparseable chunks
      }
    }

    const totalTime = Date.now() - geminiStart;
    
    console.log(`✅ Gemini 2.5 Flash-Lite Results:`);
    console.log(`   🔑 Token Generation: ${tokenTime}ms`);
    console.log(`   ⚡ Time to First Chunk: ${ttfc}ms`);
    console.log(`   📊 Total Response Time: ${totalTime}ms`);
    console.log(`   🔢 Chunks Generated: ${totalChunks}`);
    console.log(`   📝 Response: "${totalResponse.substring(0, 100)}..."`);
    
    return { ttfc, totalTime, chunks: totalChunks, token_time: tokenTime };
    
  } catch (error) {
    console.log(`❌ Gemini test failed:`, error.message);
    return null;
  }
}

async function testRunPodXTTS() {
  console.log('🎤 Testing RunPod XTTS v2.0.3...');
  
  try {
    // Check Pod Status
    const podInfo = await getPodStatus();
    console.log(`📊 Pod Status: ${podInfo.status}`);
    
    if (podInfo.status !== 'RUNNING' || !podInfo.endpoint) {
      console.log('⚠️  Pod not running or no endpoint available');
      console.log('   💡 In production, pod would be started automatically');
      return null;
    }
    
    console.log(`🔗 Pod Endpoint: ${podInfo.endpoint}`);
    
    // FIXED: Health Check auf / statt /health
    const healthStart = Date.now();
    try {
      const { statusCode: healthStatus } = await request(`${podInfo.endpoint}/`, {
        method: 'GET',
        dispatcher: runpodAgent
      });
      
      const healthTime = Date.now() - healthStart;
      console.log(`✅ Health Check: ${healthStatus} (${healthTime}ms)`);
      
      if (healthStatus !== 200) {
        console.log('❌ XTTS service not healthy');
        return null;
      }
    } catch (e) {
      console.log('❌ Health check failed:', e.message);
      return null;
    }
    
    // FIXED: Test TTS Generation mit korrektem API-Pfad und Payload
    const ttsStart = Date.now();
    const requestBody = {
      text: "Hallo, unsere Öffnungszeiten sind Montag bis Freitag von 9 bis 17 Uhr.",
      speaker: "german_m2", // FIXED: speaker statt speaker_wav
      language: "de",
      stream_chunk_size: 180 // FIXED: Optimiert für ~150ms TTFA
    };
    
    const { body, statusCode } = await request(`${podInfo.endpoint}/api/tts`, { // FIXED: /api/tts
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      dispatcher: runpodAgent
    });

    if (statusCode !== 200) {
      console.log(`❌ TTS generation failed: ${statusCode}`);
      const errorText = await body.text();
      console.log(`Error: ${errorText}`);
      return null;
    }

    const audioBuffer = await body.arrayBuffer();
    const totalTime = Date.now() - ttsStart;
    
    console.log(`✅ XTTS Generation Results:`);
    console.log(`   ⚡ Time to First Audio: ${totalTime}ms`);
    console.log(`   📊 Audio Size: ${audioBuffer.byteLength} bytes`);
    console.log(`   🎵 Format: WAV`);
    
    return { ttfa: totalTime, audioSize: audioBuffer.byteLength };
    
  } catch (error) {
    console.log(`❌ XTTS test failed:`, error.message);
    return null;
  }
}

// === Main Test Runner ===

async function runLatencyTest() {
  console.log('🚀 === FINAL LATENCY TEST: Gemini 2.5 Flash-Lite + RunPod XTTS ===\n');
  
  const results = {};
  
  // Test Gemini 2.5 Flash-Lite
  results.gemini = await testGemini25FlashLite();
  console.log('');
  
  // Test RunPod XTTS
  results.xtts = await testRunPodXTTS();
  console.log('');
  
  // Summary
  console.log('📈 === PERFORMANCE SUMMARY ===');
  
  if (results.gemini) {
    console.log(`🧠 Gemini 2.5 Flash-Lite:`);
    console.log(`   TTFC: ${results.gemini.ttfc}ms (Target: ~330ms)`);
    console.log(`   Total: ${results.gemini.totalTime}ms`);
    console.log(`   Token Gen: ${results.gemini.token_time}ms`);
  } else {
    console.log(`❌ Gemini 2.5 Flash-Lite: FAILED`);
  }
  
  if (results.xtts) {
    console.log(`🎤 RunPod XTTS v2.0.3:`);
    console.log(`   TTFA: ${results.xtts.ttfa}ms (Target: ~150ms)`);
    console.log(`   Audio: ${Math.round(results.xtts.audioSize / 1024)}KB`);
  } else {
    console.log(`❌ RunPod XTTS: FAILED (Pod likely stopped)`);
  }
  
  if (results.gemini && results.xtts) {
    const estimatedE2E = results.gemini.ttfc + results.xtts.ttfa;
    console.log(`⚡ Estimated E2E Latency: ${estimatedE2E}ms (Target: ~480ms)`);
    
    if (estimatedE2E < 600) {
      console.log(`✅ EXCELLENT: Under 600ms target!`);
    } else if (estimatedE2E < 1000) {
      console.log(`⚠️  GOOD: Under 1s, but room for improvement`);
    } else {
      console.log(`❌ NEEDS WORK: Over 1s latency`);
    }
  }
  
  console.log('\n🏁 Test completed!');
}

// Run the test
runLatencyTest().catch(console.error); 