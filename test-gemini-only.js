import { request, Agent } from 'undici';
import { createSign } from 'crypto';

console.log('🧠 === GEMINI-ONLY WORKFLOW TEST ===\n');

// Configuration
const SERVICE_ACCOUNT_JSON = {
  "type": "service_account",
  "project_id": "gen-lang-client-0449145483",
  "private_key_id": "1e6ef13b66c6482c0b9aef385d6d95f042717a0b",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCdfC/EouuNEeSm\n2FXhptXiwm7P7qkQk4afQjXgaJ8cMSJgE0DKWbhingFQEBxJgSncPfmbRQpXiGFO\nEWngJFyObbXMyTrbBU2h2Q4se+n+T44Vu3mcYcPFVbPFT1iIbOi70RUG2ek1ea+w\nw3y+ayh0o7v9/Jo5ShelS5gInjsbuOkmT7DV0kbWn1kx0uA1ss3L7fBwCt9WfJSV\nlZrpliVrZRdIolBV14ieW3scaL2E57KR/gvnjoo3g7G+y4xXCT7h4BysyH3SLMcU\nVcj52uKgcOp9Akn4/Z2dXZVErpjH/FwWAQ0yLz40HwggIItoRRqxQgg0nYBd1Gth\nDDftRBBZAgMBAAECggEADBZJ/Eec2Jj0+bFE9iq948eUhbUFmNYZ0QNd6zlcbOeA\nges4X89/DWKfKyvxX9rgAZ1oGPi1kH5RKZLAk4l26R+Wgn83WzQO/0sPgW6JSRGG\nEDjxXoVKZ0zqnUw3uVDSlAe6G2qCMa6DQ4fdfSfwVPN0LExE8fyzz+X7Zz3tv3TU\n4tjnIVV6CPGsysYD5KRF68w1qgQb4K4pTTOoiaCM1mJYFp8jCd7y5HFjM2+2bq0i\nyVNLxnJ7kcm0spUuHZwINImEZ3RV6tuXwljM088ph9voX2ZE8dcwtcBvo8rgGEJE\nMkIc0N5iiTqCINcFgtV5dCGuzHnkIvSFYXFNY+zI4QKBgQDTqPimyLQrx9tyOYb1\nxzT17ekvj0VAluYUMgwgFgncMFnm3i0wHUMp/a3OOmJasko5/Z3RhCRPO6PhB2e8\nIDL1A9VxaFCVrSARVA5oFZTVBZG6O1iH7BRgqGMusHY58wFF/wpl5J/s/wY9CpYU\nz1tB5wEkoFNUx3AoqND4cuyBnQKBgQC+eePQoUq4tTSYq8/M+yfnigkoYt7EeNel\nxyPOOmbN0IMSpOyKvjrBmQes10pjT9aAFql12Km+/aQ+bjWq0T5tqw8znZkfQPb/\nWQk6LkZkYRWIPNiqU/P/7+6fxd38wEyYqJuzd73Db0RkT2aDiCt8fLvnpIp4SyLL\nBG/Uo3S67QKBgQCf9CcNK8n0+BFgDhdu7/+XBxddKMGmISN5CaVeLil/bE7UiPzP\nSp3yQtKxci/X6LrtfjthFaK2+hRLv+PmKNM5lI8eKD4WDwKX9dT5Va3nGlFZ0vWB\nqqhvr3Fc3GBMRNemhSnffNpbKRMW2EQ5L8cAU8nqWvr+q8WYBJP/3iHbhQKBgEuq\n+nCgEqIMAmgAIR4KTFD0Ci1MEbk1VF3cHYJIuxxaECfw8rMvXQIZu+3S3Q9U4R6j\nYhCZ0N05v+y5NYK1ezpv8SsNGY5L7ZOFGGBPj9FCrB4iJeSMU2tCMqawIT7OWd9v\nY+NI107zPdUnoc7w4m2i07bzK7scBidmjNKJWM8FAoGADZ8Ew7y19Zzn7+vp8GEq\nLcZ+dtgT9diJH65fllnuX8pLmT8/qgX2UrzioPQ8ibdsHxg7JzJ56kYD+3+rH3H/\nx9B6GEDHKQoyKEPP/mO1K2TKYgyNcOuV/DvOaHa79fIUdZVuKAN1VPDOF/1rrRUu\ns1Ic6uppkG5eB+SXKwU9O5M=\n-----END PRIVATE KEY-----\n",
  "client_email": "erik86756r75@gen-lang-client-0449145483.iam.gserviceaccount.com",
  "token_uri": "https://oauth2.googleapis.com/token"
};

// HTTP/2 Keep-Alive Agents
const geminiAgent = new Agent({
  keepAliveTimeout: 30 * 1000,
  keepAliveMaxTimeout: 120 * 1000,
  connections: 10,
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

async function* getGeminiStream(transcript) {
  const accessToken = await generateAccessToken();
  const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: `Du bist ein Telefonassistent. Antworte kurz und freundlich.\nKunde: ${transcript}` }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 200
    }
  };
  
  const { body } = await request(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    dispatcher: geminiAgent
  });

  for await (const chunk of body) {
    try {
      const jsonResponse = JSON.parse(chunk.toString().startsWith('[') ? chunk.toString().slice(1) : chunk.toString());
      const content = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) yield content;
    } catch (e) {
      console.warn('Could not parse LLM chunk:', chunk.toString());
    }
  }
}

// === Test Functions ===

async function testGeminiWorkflow(testName, isWarmStart = false) {
  console.log(`\n🚀 === ${testName.toUpperCase()} ===`);
  
  const testTranscripts = [
    "Hallo ich hätte gerne eine Tischreservierung für heute Abend um acht Uhr für vier Personen",
    "Guten Tag ich möchte einen Termin vereinbaren für nächste Woche",
    "Hallo können Sie mir mit meiner Bestellung helfen"
  ];
  
  const transcript = testTranscripts[Math.floor(Math.random() * testTranscripts.length)];
  
  try {
    console.log(`📝 Transkript: "${transcript}"`);
    console.log('🧠 Starte Gemini 2.5 Flash-Lite Stream...');
    
    const startTime = Date.now();
    const geminiStream = getGeminiStream(transcript);
    
    let firstChunkTime = null;
    let fullResponse = '';
    let chunkCount = 0;
    
    console.log('\n🤖 Gemini Response:');
    for await (const chunk of geminiStream) {
      if (!firstChunkTime) {
        firstChunkTime = Date.now();
      }
      fullResponse += chunk;
      chunkCount++;
      process.stdout.write(chunk);
    }
    
    const totalTime = Date.now() - startTime;
    const ttfc = firstChunkTime ? firstChunkTime - startTime : null;
    
    console.log('\n');
    
    return {
      success: true,
      transcript,
      response: fullResponse,
      ttfc,
      totalTime,
      chunkCount,
      startTime
    };
    
  } catch (error) {
    console.log(`❌ Gemini Error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      transcript,
      startTime: Date.now()
    };
  }
}

function analyzeResults(results, testName) {
  console.log(`📊 === PERFORMANCE ANALYSE - ${testName.toUpperCase()} ===`);
  
  if (!results.success) {
    console.log(`❌ ${testName} FAILED: ${results.error}`);
    return { success: false };
  }
  
  console.log(`⚡ Time to First Chunk: ${results.ttfc}ms`);
  console.log(`📊 Total Response Time: ${results.totalTime}ms`);
  console.log(`🔢 Chunks Generated: ${results.chunkCount}`);
  console.log(`📝 Response: "${results.response}"`);
  
  return {
    success: true,
    ttfc: results.ttfc,
    totalTime: results.totalTime,
    response: results.response
  };
}

async function runGeminiWorkflowTests() {
  console.log('🚀 Starte Gemini-Only Workflow-Tests...\n');
  
  // Test 1: Cold Start
  console.log('⏳ Warte 2 Sekunden vor Test-Start...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const coldStartResults = await testGeminiWorkflow('Cold Start');
  const coldAnalysis = analyzeResults(coldStartResults, 'Cold Start');
  
  // Pause zwischen Tests
  console.log('\n⏳ Warte 3 Sekunden vor nächstem Test...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 2: Warm Start  
  const warmStartResults = await testGeminiWorkflow('Warm Start', true);
  const warmAnalysis = analyzeResults(warmStartResults, 'Warm Start');
  
  // Vergleich
  console.log('\n🔥 === COLD START vs WARM START VERGLEICH ===');
  
  if (coldAnalysis.success && warmAnalysis.success) {
    const ttfcImprovement = coldAnalysis.ttfc - warmAnalysis.ttfc;
    const totalImprovement = coldAnalysis.totalTime - warmAnalysis.totalTime;
    
    console.log(`Performance Verbesserung (Cold → Warm):`);
    console.log(`   ${ttfcImprovement >= 0 ? '⚡' : '🐌'} Gemini TTFC: ${Math.abs(ttfcImprovement)}ms ${ttfcImprovement >= 0 ? 'schneller' : 'langsamer'}`);
    console.log(`   ${totalImprovement >= 0 ? '⚡' : '🐌'} Total Zeit: ${Math.abs(totalImprovement)}ms ${totalImprovement >= 0 ? 'schneller' : 'langsamer'}`);
    
    // HTTP/2 Keep-Alive Nachweis
    if (ttfcImprovement > 50) {
      console.log(`\n✅ HTTP/2 Keep-Alive funktioniert! (${ttfcImprovement}ms Verbesserung)`);
    }
  } else {
    console.log('❌ Vergleich nicht möglich - unvollständige Testergebnisse');
  }
  
  // Finale Bewertung
  console.log('\n🎯 === FINALE BEWERTUNG ===');
  
  const workingTests = [coldAnalysis.success, warmAnalysis.success].filter(Boolean).length;
  console.log(`✅ Funktionierende Tests: ${workingTests}/2`);
  
  if (workingTests === 2) {
    console.log('🎉 GEMINI WORKFLOW ERFOLGREICH!');
    
    // Erwartete Performance mit komplettem System
    console.log('\n📈 === ERWARTETE KOMPLETTE PIPELINE ===');
    console.log('🎤 Deepgram STT: ~200ms');
    console.log(`🧠 Gemini 2.5 Flash-Lite: ${warmAnalysis.ttfc}ms`);
    console.log('🎵 XTTS v2.0.3: ~150ms (wenn Pod läuft)');
    console.log(`🏁 Erwartete Total E2E: ~${200 + warmAnalysis.ttfc + 150}ms`);
    
    if (200 + warmAnalysis.ttfc + 150 < 1200) {
      console.log('🎯 SUB-1.2-SEKUNDEN PERFORMANCE ERREICHBAR! 🚀');
    }
  } else if (workingTests === 1) {
    console.log('⚠️  TEILWEISE ERFOLGREICH: Gemini größtenteils funktional');
  } else {
    console.log('❌ FEHLGESCHLAGEN: Gemini Pipeline nicht funktional');
  }
  
  console.log('\n🏁 Gemini-Only Workflow-Test abgeschlossen!');
}

// Run Tests
await runGeminiWorkflowTests(); 