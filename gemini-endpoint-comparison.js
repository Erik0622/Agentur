import { request, Agent } from 'undici';
import { createSign } from 'crypto';

// --- Configuration ---
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
        "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDd0gIe91pDO0pa\ndaD55Ok6g7Huyjz5ARjXYYDtUqAihGDvJdMeuIrqdzf/Pb/jVYEQVVEUn2PDInz5\n+SQHtcfQRuY2mf1YPzdB2Zh1WGsliTwCCQJ320A07cTAnE8P0Q84yxzyOIS4EI/D\nyva+hZ1sm7lMw3XO0dtlneabSVBSRrSB4qkfH5aorGjD4CUdO9BhPhzB3MxkfWGr\nk1HMyq4jkRk3RAFJx/+07PX96TnQehIUUQQNWd1GPY4N6FBwvt7GatRtP23cXyL9\nEQ6j7HxFUb4PPHFWdHDLXPefcBWyFo6gYiLpEXS4gZia1q3aStBtfBOpc7NiKJ/h\n4uBNR9jjAgMBAAECggEAGYuzgdRzuTVtUTClytGxiHMdPUZeMkENltRcUDiJR6Be\nN3xwLWQMX4c+VC9M14YD2JkyvsDCcPkaUoF+REMLkXFw1s3yLsUM/JDuLWly4X5G\nAmf+OEZwRQgy9gmqU0R8z8oYec7HfhkuLVrFAtkJcbYXZ39FJH3nmfLO2YhebzMN\nWZYmsApyYXps54401xNXuvUuuqOMmhQKFEWj4wJ8g8l+e48FLYhssm/k3WE6tZ1z\nHeUtxVnCCeh9sa674JXR6jFtufSZPxjgp+/Z1VC02VZ9zpFw6T5RCenuz7gtH3Vp\nLmdY6nmNVkDIgdvnC3K53B+QhTxGxUWlf6RlMd2AcQKBgQD+pWjgrFEbYePuhLHH\nMLuxmveY2sR/xXBYmxAsBAOuQb+iUkgY8V3oO4bCCqQOH/6YtpzycUpB8Zz4DBTY\nSLk7lB7woTHIiXP9U2stqrMmXOhctupVPriQQmBVwo2/oS9YsdlJ6WFtXpNEiUBM\n7XmkI1dOxULzaXPnZT97AK0hMwKBgQDe/+untejoH6F5p2RaDCyV4trRT5JLyTTz\nwMvdDtLJD308UL44AE6+3eWOhTfnzodayzMFKRfaS28yd6T7ZKlhDg9QaHl3RdsP\n+ajFWRWtBSuSYHEFbmYUJTRKDNbHYULtaKhwGWRJuEov/uG4owsG7HdgYuZtbPl\nvchJoT3JkQKBgQCp+vpWN1BwydhfqD4Pq+0ucjZi122hqMcEroWODCP01zi3fttX\now6/bbTXpEi8kQjfIc8EWzFpcYIJZe8oLOtQ5N/+Wmuj5HUDngKGWlL6Abyt3v/v\nZU3IJjauKI98Ynj7aMSV/O6nFiGR91hvwXmYYmruTukRGMxgowpL7jijVwKBgCLs\nweOKQefYzFlZNgZEUddHqC2P4MGtyXVDhKoiYDDNFDgWDTSIF80cw48GnjLXzasS\nl/L+9JVjqw6kXlpg8YYZxZw6QIvFjQFuslhoSUaq/XIuYPxsypxoQmZffWuPu/6R\ne98JWt7Yz/qp1qLRaFKgI8MlPs/b/UjF6FBfyGWBAoGAQjR4TlrWLjdy41VKAW98\nZDnwqz/EpucuucoVBRJhCT9OvqwRYL64Sdk8c1rD80eW1MuRgBnSI4PXRdKilxLX\nB9wWC6O9zAfkq5u+oRqp9fmOqltBbdFkhbJvgg6vX6KwsMmhYw+TpmNK/X84hj8S\nvlySbCS6HKLn5grx13LWR0g=\n-----END PRIVATE KEY-----\n",
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

const { SERVICE_ACCOUNT_JSON } = config;

// Optimized Agent for HTTP/2 Keep-Alive
const geminiAgent = new Agent({
  keepAliveTimeout: 30 * 1000,
  keepAliveMaxTimeout: 120 * 1000,
  keepAliveTimeoutThreshold: 1000,
  connections: 10,
  pipelining: 1
});

// Test configurations
const testConfigs = [
  {
    name: "Gemini 2.5 Flash-Lite (Global Preview)",
    endpoint: `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`,
    expectedTTFT: "~220ms (Preview, Global)",
    location: "Global"
  },
  {
    name: "Gemini 2.0 Flash-Lite (EU Regional)",
    endpoint: `https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/europe-west4/publishers/google/models/gemini-2.0-flash-lite:streamGenerateContent`,
    expectedTTFT: "~260ms (Regional)",
    location: "europe-west4"
  },
  {
    name: "Gemini 2.5 Flash (EU Regional)",
    endpoint: `https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/europe-west4/publishers/google/models/gemini-2.5-flash:streamGenerateContent`,
    expectedTTFT: "~320ms (Regional)",
    location: "europe-west4"
  },
  {
    name: "Gemini 2.0 Flash (EU Regional)",
    endpoint: `https://europe-west4-aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/europe-west4/publishers/google/models/gemini-2.0-flash:streamGenerateContent`,
    expectedTTFT: "~400ms (Regional)",
    location: "europe-west4"
  }
];

// Test single endpoint
async function testGeminiEndpoint(config) {
  console.log(`\n🤖 Testing: ${config.name}`);
  console.log(`   Location: ${config.location}`);
  console.log(`   Expected: ${config.expectedTTFT}`);
  
  try {
    // Generate token first
    const tokenStart = performance.now();
    const accessToken = await generateAccessToken();
    const tokenTime = performance.now() - tokenStart;
    
    const prompt = "Du bist ein Telefonassistent. Antworte kurz.\nKunde: Hallo, können Sie mir mit meinem Konto helfen?";
    
    const requestBody = {
      contents: [{ 
        role: "user", 
        parts: [{ text: prompt }] 
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 60  // Short response for TTFT measurement
      }
    };
    
    const requestStart = performance.now();
    
    const { body, statusCode } = await request(config.endpoint, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(requestBody),
      dispatcher: geminiAgent
    });
    
    if (statusCode !== 200) {
      console.log(`   ❌ HTTP ${statusCode} - Model not available in this region`);
      return null;
    }
    
    let firstChunkTime = null;
    let totalText = '';
    let chunkCount = 0;
    
    for await (const chunk of body) {
      chunkCount++;
      if (!firstChunkTime) {
        firstChunkTime = performance.now();
        console.log(`   ⚡ TTFT: ${(firstChunkTime - requestStart).toFixed(2)}ms`);
      }
      
      try {
        const chunkStr = chunk.toString();
        let jsonResponse;
        
        // Handle different streaming formats
        if (chunkStr.startsWith('[')) {
          jsonResponse = JSON.parse(chunkStr.slice(1));
        } else if (chunkStr.includes('{')) {
          const lines = chunkStr.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.includes('"text"')) {
              try {
                jsonResponse = JSON.parse(line.startsWith('[') ? line.slice(1) : line);
                break;
              } catch (e) {
                // Try next line
              }
            }
          }
        }
        
        const content = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          totalText += content;
        }
      } catch (e) {
        // Ignore streaming parse errors
      }
    }
    
    const totalTime = performance.now() - requestStart;
    
    console.log(`   ✅ Success! Total: ${totalTime.toFixed(2)}ms`);
    console.log(`   📝 Response: "${totalText.substring(0, 50)}${totalText.length > 50 ? '...' : ''}"`);
    
    return {
      config: config.name,
      location: config.location,
      tokenTime,
      ttft: firstChunkTime - requestStart,
      totalTime,
      chunkCount,
      responseLength: totalText.length,
      success: true
    };
    
  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return {
      config: config.name,
      location: config.location,
      success: false,
      error: error.message
    };
  }
}

// Generate Access Token
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
  
  const tokenAgent = new Agent({
    keepAliveTimeout: 60 * 1000,
    keepAliveMaxTimeout: 300 * 1000,
    connections: 2
  });
  
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

// Main comparison test
async function runGeminiComparison() {
  console.log('🚀 GEMINI ENDPOINT COMPARISON TEST');
  console.log('📊 Global Flash-Lite Preview vs Regional Alternatives');
  console.log('='.repeat(70));
  
  const results = [];
  
  for (const config of testConfigs) {
    const result = await testGeminiEndpoint(config);
    if (result) {
      results.push(result);
    }
    
    // Short delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Results analysis
  console.log('\n' + '='.repeat(70));
  console.log('📈 COMPARISON RESULTS');
  console.log('='.repeat(70));
  
  const successfulResults = results.filter(r => r.success);
  
  if (successfulResults.length > 0) {
    console.log('\n🏆 TTFT Rankings (fastest first):');
    successfulResults
      .sort((a, b) => a.ttft - b.ttft)
      .forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.config}`);
        console.log(`      TTFT: ${result.ttft.toFixed(2)}ms | Location: ${result.location}`);
      });
    
    const fastest = successfulResults.reduce((min, r) => r.ttft < min.ttft ? r : min);
    const slowest = successfulResults.reduce((max, r) => r.ttft > max.ttft ? r : max);
    
    console.log(`\n🥇 Fastest: ${fastest.config} (${fastest.ttft.toFixed(2)}ms)`);
    console.log(`🐌 Slowest: ${slowest.config} (${slowest.ttft.toFixed(2)}ms)`);
    console.log(`📊 Speed difference: ${(slowest.ttft - fastest.ttft).toFixed(2)}ms`);
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (fastest.location === 'Global') {
      console.log('   🌍 Global Flash-Lite Preview is fastest despite geographic distance');
      console.log('   💰 Consider cost vs latency (Preview vs GA pricing)');
      console.log('   ⏰ Monitor for GA release & regional deployment');
    } else {
      console.log('   🇪🇺 Regional model is fastest - use for production');
      console.log('   🔒 Better for EU data residency requirements');
    }
    
    if (successfulResults.some(r => r.ttft < 300)) {
      console.log('   ✅ Excellent: Sub-300ms TTFT achieved!');
    } else if (successfulResults.some(r => r.ttft < 500)) {
      console.log('   ⚠️  Good: Sub-500ms TTFT, room for improvement');
    } else {
      console.log('   ❌ Slow: >500ms TTFT, check connection/optimization');
    }
  }
  
  // Failed endpoints
  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    console.log('\n❌ Failed Endpoints:');
    failedResults.forEach(result => {
      console.log(`   ${result.config}: ${result.error}`);
    });
  }
}

runGeminiComparison().catch(console.error); 