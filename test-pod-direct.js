import { request, Agent } from 'undici';

const RUNPOD_API_KEY = "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk";

const runpodAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

console.log('🔍 === DIREKTER POD-TEST ===');
console.log();

async function testPodDirect() {
  const testPodId = "jexhpi7vypip9o";
  
  console.log(`📡 Teste Pod direkt: ${testPodId}`);
  
  // Test: Minimale Pod-Query
  try {
    const { body, statusCode, headers } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { pod(input: {podId: "${testPodId}"}) { id desiredStatus } }`
      }),
      dispatcher: runpodAgent
    });

    console.log(`   📈 Status Code: ${statusCode}`);
    console.log(`   📄 Headers:`, Object.fromEntries(Object.entries(headers)));
    
    const responseText = await body.text();
    console.log(`   📝 Response: ${responseText}`);
    
    if (statusCode === 200) {
      try {
        const result = JSON.parse(responseText);
        if (result.data?.pod) {
          console.log(`   ✅ Pod gefunden! Status: ${result.data.pod.desiredStatus}`);
          
          // Versuche Pod zu starten falls gestoppt
          if (result.data.pod.desiredStatus === 'STOPPED' || result.data.pod.desiredStatus === 'EXITED') {
            console.log(`   ⚡ Versuche Pod zu starten...`);
            
            const { body: startBody, statusCode: startStatus } = await request(`https://api.runpod.io/graphql`, {
              method: 'POST',
              headers: {
                'x-api-key': RUNPOD_API_KEY,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                query: `mutation { podResume(input: {podId: "${testPodId}"}) { id desiredStatus } }`
              }),
              dispatcher: runpodAgent
            });
            
            const startResponse = await startBody.text();
            console.log(`   📊 Start Response (${startStatus}): ${startResponse}`);
          }
          
        } else if (result.data?.pod === null) {
          console.log(`   ❌ Pod nicht gefunden (null)`);
        } else {
          console.log(`   ❓ Unerwartete Response-Struktur`);
        }
        
        if (result.errors) {
          console.log(`   ❌ GraphQL Errors:`, result.errors);
        }
      } catch (parseError) {
        console.log(`   ❌ JSON Parse Error: ${parseError.message}`);
      }
    }

  } catch (error) {
    console.error(`   ❌ Request Error: ${error.message}`);
  }
  
  // Test auch den alten Pod
  console.log(`\n📡 Teste alten Pod: e3nohugxevf9s6`);
  
  try {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { pod(input: {podId: "e3nohugxevf9s6"}) { id desiredStatus } }`
      }),
      dispatcher: runpodAgent
    });

    const responseText = await body.text();
    console.log(`   📈 Status Code: ${statusCode}`);
    console.log(`   📝 Response: ${responseText}`);

  } catch (error) {
    console.error(`   ❌ Request Error: ${error.message}`);
  }
}

testPodDirect(); 