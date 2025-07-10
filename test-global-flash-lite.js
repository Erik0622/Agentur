import https from 'https';
import { createSign } from 'crypto';

// Service Account (simplified for testing)
const SERVICE_ACCOUNT_JSON = {
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
};

// Generate JWT token using Node.js crypto
function generateJWT() {
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
  
  return `${toSign}.${signature}`;
}

// Get access token using native Node.js
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const jwt = generateJWT();
    const postData = `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`;
    
    const options = {
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error(`Token error: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(e);
    });
    
    req.write(postData);
    req.end();
  });
}

// Test Global Flash-Lite endpoint
function testFlashLiteEndpoint(accessToken) {
  return new Promise((resolve, reject) => {
    const prompt = "Du bist ein Telefonassistent. Antworte kurz.\nKunde: Hallo, können Sie mir helfen?";
    
    const requestBody = JSON.stringify({
      contents: [{ 
        role: "user", 
        parts: [{ text: prompt }] 
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 60
      }
    });
    
    const options = {
      hostname: 'aiplatform.googleapis.com',
      port: 443,
      path: `/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };
    
    console.log(`🌍 Testing Global Flash-Lite Preview...`);
    console.log(`   Endpoint: https://${options.hostname}${options.path}`);
    
    const startTime = performance.now();
    let firstChunkTime = null;
    let totalText = '';
    let chunkCount = 0;
    
    const req = https.request(options, (res) => {
      console.log(`   📡 Response Status: ${res.statusCode}`);
      
      if (res.statusCode !== 200) {
        console.log(`   ❌ HTTP ${res.statusCode} - Failed`);
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => {
          console.log(`   Error details: ${errorData}`);
          reject(new Error(`HTTP ${res.statusCode}: ${errorData}`));
        });
        return;
      }
      
      res.on('data', (chunk) => {
        chunkCount++;
        if (!firstChunkTime) {
          firstChunkTime = performance.now();
          console.log(`   ⚡ TTFT: ${(firstChunkTime - startTime).toFixed(2)}ms`);
        }
        
        try {
          const chunkStr = chunk.toString();
          
          // Parse streaming JSON chunks
          const lines = chunkStr.split('\n').filter(line => line.trim());
          for (const line of lines) {
            if (line.includes('"text"')) {
              try {
                let jsonResponse;
                if (line.startsWith('[')) {
                  jsonResponse = JSON.parse(line.slice(1));
                } else {
                  jsonResponse = JSON.parse(line);
                }
                
                const content = jsonResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (content) {
                  totalText += content;
                }
              } catch (e) {
                // Continue parsing other lines
              }
            }
          }
        } catch (e) {
          // Ignore streaming parse errors
        }
      });
      
      res.on('end', () => {
        const totalTime = performance.now() - startTime;
        
        console.log(`   ✅ Success!`);
        console.log(`   📊 Total Time: ${totalTime.toFixed(2)}ms`);
        console.log(`   📊 Chunks: ${chunkCount}`);
        console.log(`   📝 Response: "${totalText}"`);
        
        resolve({
          ttft: firstChunkTime - startTime,
          totalTime,
          chunkCount,
          response: totalText,
          success: true
        });
      });
    });
    
    req.on('error', (e) => {
      console.log(`   ❌ Request Error: ${e.message}`);
      reject(e);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// Run the test
async function runFlashLiteTest() {
  console.log('🚀 GLOBAL FLASH-LITE PREVIEW TEST');
  console.log('📍 Testing: aiplatform.googleapis.com/locations/global');
  console.log('='.repeat(60));
  
  try {
    // Get access token
    console.log('🔑 Generating access token...');
    const tokenStart = performance.now();
    const accessToken = await getAccessToken();
    const tokenTime = performance.now() - tokenStart;
    console.log(`✅ Token generated: ${tokenTime.toFixed(2)}ms`);
    
    // Test Flash-Lite endpoint
    const result = await testFlashLiteEndpoint(accessToken);
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 RESULTS SUMMARY');
    console.log('='.repeat(60));
    console.log(`⚡ Time to First Token: ${result.ttft.toFixed(2)}ms`);
    console.log(`📊 Total Processing: ${result.totalTime.toFixed(2)}ms`);
    console.log(`🔑 Token Generation: ${tokenTime.toFixed(2)}ms`);
    
    // Performance assessment
    if (result.ttft < 300) {
      console.log('🏆 EXCELLENT: Sub-300ms TTFT achieved!');
    } else if (result.ttft < 500) {
      console.log('✅ GOOD: Sub-500ms TTFT');
    } else {
      console.log('⚠️  SLOW: >500ms TTFT');
    }
    
    // Comparison with regional alternatives
    console.log('\n💡 Next Steps:');
    console.log('   1. Compare with regional Gemini 2.0 Flash-Lite (~260ms expected)');
    console.log('   2. Set up HTTP/2 Keep-Alive for production');
    console.log('   3. Consider min_replica_count = 1 for consistent performance');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

runFlashLiteTest().catch(console.error); 