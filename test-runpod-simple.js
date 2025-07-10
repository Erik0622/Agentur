import { request, Agent } from 'undici';

const RUNPOD_API_KEY = "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk";

const runpodAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

console.log('🔍 === RUNPOD API TEST (KORRIGIERT) ===');
console.log();

async function testRunPodAPI() {
  const testPods = ['jexhpi7vypip9o', 'e3nohugxevf9s6'];
  
  console.log('📡 Teste RunPod API...');
  
  for (const podId of testPods) {
    console.log(`\n🔍 Teste Pod: ${podId}`);
    
    try {
      const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
        method: 'POST',
        headers: {
          'x-api-key': RUNPOD_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: `query { 
            pod(input: {podId: "${podId}"}) { 
              id 
              name 
              desiredStatus 
              costPerHr 
              machine { 
                displayName 
              }
              runtime { 
                ports { 
                  ip 
                  privatePort 
                  publicPort 
                  type 
                } 
              } 
            } 
          }`
        }),
        dispatcher: runpodAgent
      });

      console.log(`   📈 Status Code: ${statusCode}`);
      
      if (statusCode === 200) {
        const result = await body.json();
        
        if (result.errors) {
          console.log(`   ❌ Errors: ${JSON.stringify(result.errors)}`);
        }
        
        if (result.data?.pod) {
          const pod = result.data.pod;
          console.log(`   ✅ Pod gefunden!`);
          console.log(`   📋 ID: ${pod.id}`);
          console.log(`   🏷️ Name: ${pod.name || 'Unbenannt'}`);
          console.log(`   📊 Status: ${pod.desiredStatus}`);
          console.log(`   💰 Kosten: $${pod.costPerHr}/h`);
          console.log(`   🖥️ Machine: ${pod.machine?.displayName || 'Unbekannt'}`);
          
          if (pod.runtime?.ports) {
            console.log(`   🔌 Ports:`);
            pod.runtime.ports.forEach(port => {
              console.log(`      ${port.privatePort} → ${port.publicPort} (${port.type})`);
            });
            
            // Test der Proxy-URL
            if (pod.desiredStatus === 'RUNNING') {
              const proxyUrl = `https://${podId}-8020.proxy.runpod.net`;
              console.log(`   🌐 Teste Proxy: ${proxyUrl}`);
              
              try {
                const { statusCode: healthStatus } = await request(proxyUrl + '/', {
                  method: 'GET',
                  dispatcher: runpodAgent
                });
                console.log(`   🩺 Health Check: ${healthStatus}`);
              } catch (e) {
                console.log(`   ❌ Health Error: ${e.message}`);
              }
            }
          }
        } else {
          console.log(`   ❌ Pod nicht gefunden`);
        }
      } else {
        console.log(`   ❌ API Error: ${statusCode}`);
      }

    } catch (error) {
      console.log(`   ❌ Request Error: ${error.message}`);
    }
  }
  
  // Teste auch eine einfache Myself-Query
  console.log(`\n👤 Teste Account-Info...`);
  try {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { myself { id email } }`
      }),
      dispatcher: runpodAgent
    });

    if (statusCode === 200) {
      const result = await body.json();
      if (result.data?.myself) {
        console.log(`   ✅ Account: ${result.data.myself.email}`);
      }
    }
  } catch (e) {
    console.log(`   ❌ Account Test Error: ${e.message}`);
  }
}

testRunPodAPI(); 