import { request, Agent } from 'undici';

const RUNPOD_POD_ID = "jexhpi7vypip9o";
const RUNPOD_API_KEY = "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk";

const runpodAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

console.log('🔍 === NEUER POD TEST ===');
console.log(`📋 Pod ID: ${RUNPOD_POD_ID}`);
console.log();

async function testNewPod() {
  console.log('📡 Teste Pod Status...');
  
  try {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id, name, desiredStatus, runtime { ports { ip, isIpPublic, privatePort, publicPort, type } } } }`
      }),
      dispatcher: runpodAgent
    });

    console.log(`📈 GraphQL Status Code: ${statusCode}`);
    const result = await body.json();
    console.log('📊 GraphQL Response:', JSON.stringify(result, null, 2));

    if (result.data?.pod) {
      const pod = result.data.pod;
      console.log(`✅ Pod gefunden: ${pod.id}`);
      console.log(`📊 Status: ${pod.desiredStatus}`);
      console.log(`🏷️ Name: ${pod.name || 'Unbekannt'}`);
      
      if (pod.runtime?.ports) {
        console.log('🔌 Ports:', pod.runtime.ports);
        
        // Teste direkte Verbindung
        if (pod.desiredStatus === 'RUNNING') {
          const proxyUrl = `https://${RUNPOD_POD_ID}-8020.proxy.runpod.net`;
          console.log(`🌐 Teste Verbindung zu: ${proxyUrl}`);
          
          try {
            const { statusCode: healthStatus } = await request(proxyUrl + '/', {
              method: 'GET',
              dispatcher: runpodAgent
            });
            console.log(`🩺 Health Check: ${healthStatus}`);
          } catch (e) {
            console.log(`❌ Health Check Error: ${e.message}`);
          }
        }
      }
      
      // Teste Pod Start wenn gestoppt
      if (pod.desiredStatus === 'STOPPED' || pod.desiredStatus === 'EXITED') {
        console.log('⚡ Versuche Pod zu starten...');
        
        const { body: startBody, statusCode: startStatus } = await request(`https://api.runpod.io/graphql`, {
          method: 'POST',
          headers: {
            'x-api-key': RUNPOD_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query: `mutation { podResume(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus } }`
          }),
          dispatcher: runpodAgent
        });
        
        const startResult = await startBody.json();
        console.log(`📊 Start Response (${startStatus}):`, JSON.stringify(startResult, null, 2));
        
        if (startResult.data?.podResume) {
          console.log('⏳ Warte auf Pod-Start (10 Sekunden)...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Erneuter Status-Check
          console.log('🔄 Erneuter Status-Check...');
          await testNewPod();
        }
      }
      
    } else {
      console.log('❌ Pod nicht gefunden');
    }

  } catch (error) {
    console.error('❌ Fehler:', error.message);
  }
}

testNewPod(); 