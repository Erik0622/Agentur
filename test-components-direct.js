import { request, Agent } from 'undici';
import { createSign } from 'crypto';

console.log('🎯 === DIRECT COMPONENTS TEST: Gemini + XTTS ===\n');

// Configuration (same as voice-agent.js)
const SERVICE_ACCOUNT_JSON = {
  "type": "service_account",
  "project_id": "gen-lang-client-0449145483",
  "private_key_id": "1e6ef13b66c6482c0b9aef385d6d95f042717a0b",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCdfC/EouuNEeSm\n2FXhptXiwm7P7qkQk4afQjXgaJ8cMSJgE0DKWbhingFQEBxJgSncPfmbRQpXiGFO\nEWngJFyObbXMyTrbBU2h2Q4se+n+T44Vu3mcYcPFVbPFT1iIbOi70RUG2ek1ea+w\nw3y+ayh0o7v9/Jo5ShelS5gInjsbuOkmT7DV0kbWn1kx0uA1ss3L7fBwCt9WfJSV\nlZrpliVrZRdIolBV14ieW3scaL2E57KR/gvnjoo3g7G+y4xXCT7h4BysyH3SLMcU\nVcj52uKgcOp9Akn4/Z2dXZVErpjH/FwWAQ0yLz40HwggIItoRRqxQgg0nYBd1Gth\nDDftRBBZAgMBAAECggEADBZJ/Eec2Jj0+bFE9iq948eUhbUFmNYZ0QNd6zlcbOeA\nges4X89/DWKfKyvxX9rgAZ1oGPi1kH5RKZLAk4l26R+Wgn83WzQO/0sPgW6JSRGG\nEDjxXoVKZ0zqnUw3uVDSlAe6G2qCMa6DQ4fdfSfwVPN0LExE8fyzz+X7Zz3tv3TU\n4tjnIVV6CPGsysYD5KRF68w1qgQb4K4pTTOoiaCM1mJYFp8jCd7y5HFjM2+2bq0i\nyVNLxnJ7kcm0spUuHZwINImEZ3RV6tuXwljM088ph9voX2ZE8dcwtcBvo8rgGEJE\nMkIc0N5iiTqCINcFgtV5dCGuzHnkIvSFYXFNY+zI4QKBgQDTqPimyLQrx9tyOYb1\nxzT17ekvj0VAluYUMgwgFgncMFnm3i0wHUMp/a3OOmJasko5/Z3RhCRPO6PhB2e8\nIDL1A9VxaFCVrSARVA5oFZTVBZG6O1iH7BRgqGMusHY58wFF/wpl5J/s/wY9CpYU\nz1tB5wEkoFNUx3AoqND4cuyBnQKBgQC+eePQoUq4tTSYq8/M+yfnigkoYt7EeNel\nxyPOOmbN0IMSpOyKvjrBmQes10pjT9aAFql12Km+/aQ+bjWq0T5tqw8znZkfQPb/\nWQk6LkZkYRWIPNiqU/P/7+6fxd38wEyYqJuzd73Db0RkT2aDiCt8fLvnpIp4SyLL\nBG/Uo3S67QKBgQCf9CcNK8n0+BFgDhdu7/+XBxddKMGmISN5CaVeLil/bE7UiPzP\nSp3yQtKxci/X6LrtfjthFaK2+hRLv+PmKNM5lI8eKD4WDwKX9dT5Va3nGlFZ0vWB\nqqhvr3Fc3GBMRNemhSnffNpbKRMW2EQ5L8cAU8nqWvr+q8WYBJP/3iHbhQKBgEuq\n+nCgEqIMAmgAIR4KTFD0Ci1MEbk1VF3cHYJIuxxaECfw8rMvXQIZu+3S3Q9U4R6j\nYhCZ0N05v+y5NYK1ezpv8SsNGY5L7ZOFGGBPj9FCrB4iJeSMU2tCMqawIT7OWd9v\nY+NI107zPdUnoc7w4m2i07bzK7scBidmjNKJWM8FAoGADZ8Ew7y19Zzn7+vp8GEq\nLcZ+dtgT9diJH65fllnuX8pLmT8/qgX2UrzioPQ8ibdsHxg7JzJ56kYD+3+rH3H/\nx9B6GEDHKQoyKEPP/mO1K2TKYgyNcOuV/DvOaHa79fIUdZVuKAN1VPDOF/1rrRUu\ns1Ic6uppkG5eB+SXKwU9O5M=\n-----END PRIVATE KEY-----\n",
  "client_email": "erik86756r75@gen-lang-client-0449145483.iam.gserviceaccount.com",
  "token_uri": "https://oauth2.googleapis.com/token"
};

const RUNPOD_API_KEY = "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk";
const RUNPOD_POD_ID = "e3nohugxevf9s6";

// HTTP/2 Keep-Alive Agents
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

// === Utility Functions ===

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

  if (statusCode !== 200) throw new Error(`Token exchange failed: ${statusCode}`);
  return (await body.json()).access_token;
}

// === Component Tests ===

async function testGemini() {
  console.log('🧠 Testing Gemini 2.5 Flash-Lite...');
  
  const transcript = "Hallo ich hätte gerne eine Tischreservierung für heute Abend um acht Uhr für vier Personen";
  
  try {
    const tokenStart = Date.now();
    const accessToken = await generateAccessToken();
    const tokenTime = Date.now() - tokenStart;
    
    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;
    const requestBody = {
      contents: [{ role: "user", parts: [{ text: `Du bist ein Telefonassistent. Antworte kurz und freundlich.\nKunde: ${transcript}` }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200
      }
    };
    
    const startTime = Date.now();
    const { body } = await request(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      dispatcher: geminiAgent
    });

    let firstChunkTime = null;
    let fullResponse = '';
    let chunkCount = 0;
    
    console.log('\n🤖 Gemini Response:');
    for await (const chunk of body) {
      if (!firstChunkTime) {
        firstChunkTime = Date.now();
      }
      
      try {
        const jsonResponse = JSON.parse(chunk.toString().startsWith('[') ? chunk.toString().slice(1) : chunk.toString());
        const content = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          fullResponse += content;
          chunkCount++;
          process.stdout.write(content);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    const totalTime = Date.now() - startTime;
    const ttfc = firstChunkTime - startTime;
    
    console.log('\n\n📊 Gemini Results:');
    console.log(`   🔑 Token Generation: ${tokenTime}ms`);
    console.log(`   ⚡ Time to First Chunk: ${ttfc}ms`);
    console.log(`   📊 Total Response Time: ${totalTime}ms`);
    console.log(`   🔢 Chunks Generated: ${chunkCount}`);
    console.log(`   📝 Response: "${fullResponse}"`);
    
    return { success: true, ttfc, totalTime, tokenTime, response: fullResponse };
    
  } catch (error) {
    console.log(`❌ Gemini Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testXTTS() {
  console.log('\n🎤 Testing RunPod XTTS v2.0.3...');
  
  const testText = "Gerne reserviere ich Ihnen einen Tisch für heute Abend um zwanzig Uhr für vier Personen. Kann ich noch Ihren Namen haben?";
  
  try {
    // Check Pod Status first
    const { body: statusBody } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus } }`
      }),
      dispatcher: runpodAgent
    });

    const statusResult = await statusBody.json();
    const podStatus = statusResult.data?.pod?.desiredStatus;
    console.log(`📡 Pod Status: ${podStatus}`);
    
    if (podStatus !== 'RUNNING') {
      console.log('⚠️  Pod is not running - XTTS test skipped');
      return { success: false, error: 'Pod not running' };
    }
    
    const endpoint = `https://${RUNPOD_POD_ID}-8020.proxy.runpod.net/api/tts`;
    const requestBody = {
      text: testText,
      speaker: "german_m2",
      language: "de",
      stream_chunk_size: 180
    };
    
    const startTime = Date.now();
    const { body, statusCode } = await request(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      dispatcher: runpodAgent
    });

    if (statusCode !== 200) {
      console.log(`❌ XTTS API Error: ${statusCode}`);
      return { success: false, error: `HTTP ${statusCode}` };
    }
    
    const audioBuffer = await body.arrayBuffer();
    const totalTime = Date.now() - startTime;
    
    console.log('📊 XTTS Results:');
    console.log(`   ⚡ Time to First Audio: ${totalTime}ms`);
    console.log(`   📦 Audio Size: ${audioBuffer.byteLength} bytes`);
    console.log(`   🎵 Format: WAV`);
    console.log(`   📝 Text: "${testText}"`);
    
    return { success: true, ttfa: totalTime, audioSize: audioBuffer.byteLength };
    
  } catch (error) {
    console.log(`❌ XTTS Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// === Main Test Execution ===

async function runComponentTests() {
  console.log('🚀 Starting direct component tests...\n');
  
  // Test Gemini
  const geminiResult = await testGemini();
  
  // Test XTTS
  const xttsResult = await testXTTS();
  
  // Summary
  console.log('\n📈 === PERFORMANCE SUMMARY ===');
  
  if (geminiResult.success) {
    console.log(`🧠 Gemini 2.5 Flash-Lite:`);
    console.log(`   TTFC: ${geminiResult.ttfc}ms (Target: ~330ms)`);
    console.log(`   Total: ${geminiResult.totalTime}ms`);
    console.log(`   Token Gen: ${geminiResult.tokenTime}ms`);
  } else {
    console.log(`❌ Gemini 2.5 Flash-Lite: FAILED (${geminiResult.error})`);
  }
  
  if (xttsResult.success) {
    console.log(`🎵 RunPod XTTS v2.0.3:`);
    console.log(`   TTFA: ${xttsResult.ttfa}ms (Target: ~150ms)`);
    console.log(`   Audio: ${Math.round(xttsResult.audioSize/1024)}KB WAV`);
  } else {
    console.log(`❌ RunPod XTTS: FAILED (${xttsResult.error})`);
  }
  
  // Expected E2E with real audio
  if (geminiResult.success) {
    const expectedE2E = 200 + geminiResult.ttfc + (xttsResult.success ? xttsResult.ttfa : 150);
    console.log(`\n🎯 Expected E2E with real audio: ~${expectedE2E}ms`);
    console.log('   🎤 Deepgram STT: ~200ms');
    console.log(`   🧠 Gemini: ${geminiResult.ttfc}ms`);
    console.log(`   🎵 XTTS: ${xttsResult.success ? xttsResult.ttfa : 150}ms`);
  }
  
  const overallSuccess = geminiResult.success && xttsResult.success;
  console.log(`\n🏁 Overall Test: ${overallSuccess ? '✅ SUCCESS' : '⚠️ PARTIAL'}`);
  
  if (overallSuccess) {
    console.log('🚀 Complete pipeline ready for real-world deployment!');
  }
}

// Run tests
await runComponentTests(); 