import { request, Agent } from 'undici';

const RUNPOD_API_KEY = "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk";

const runpodAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

console.log('🔍 === DIREKTER CURL-TEST WIE VOM USER VORGESCHLAGEN ===');
console.log();

async function testCurlDirect() {
  const podId = "jexhpi7vypip9o";
  
  console.log(`📡 Teste Pod: ${podId}`);
  console.log(`🌐 Endpoint: https://api.runpod.io/graphql`);
  console.log(`🔐 API Key: ${RUNPOD_API_KEY.substring(0, 20)}...`);
  console.log();
  
  try {
    const { body, statusCode, headers } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query{pod(input:{podId:"${podId}"}){id desiredStatus}}`
      }),
      dispatcher: runpodAgent
    });

    console.log(`📈 Status Code: ${statusCode}`);
    console.log(`📄 Response Headers:`, Object.fromEntries(Object.entries(headers)));
    
    const responseText = await body.text();
    console.log(`📝 Raw Response: ${responseText}`);
    
    try {
      const result = JSON.parse(responseText);
      console.log(`📊 Parsed Response:`, JSON.stringify(result, null, 2));
      
      if (result.data?.pod) {
        console.log(`✅ SUCCESS! Pod gefunden!`);
        console.log(`   📋 ID: ${result.data.pod.id}`);
        console.log(`   📊 Status: ${result.data.pod.desiredStatus}`);
        
        if (result.data.pod.desiredStatus === 'EXITED') {
          console.log(`   ⚠️ Pod ist EXITED - das ist der Grund für die Fehler!`);
          console.log(`   💡 EXITED muss wie STOPPED behandelt werden!`);
        }
      } else {
        console.log(`❌ Pod nicht gefunden oder ist null`);
      }
      
      if (result.errors) {
        console.log(`❌ GraphQL Errors:`, result.errors);
      }
      
    } catch (parseError) {
      console.log(`❌ JSON Parse Error: ${parseError.message}`);
    }

  } catch (error) {
    console.error(`❌ Request Error: ${error.message}`);
  }
  
  // Teste auch den alten Pod
  console.log(`\n📡 Teste auch alten Pod: e3nohugxevf9s6`);
  
  try {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query{pod(input:{podId:"e3nohugxevf9s6"}){id desiredStatus}}`
      }),
      dispatcher: runpodAgent
    });

    const responseText = await body.text();
    console.log(`📈 Status Code: ${statusCode}`);
    console.log(`📝 Response: ${responseText}`);
    
    try {
      const result = JSON.parse(responseText);
      if (result.data?.pod) {
        console.log(`✅ Alter Pod gefunden! Status: ${result.data.pod.desiredStatus}`);
      } else {
        console.log(`❌ Alter Pod nicht gefunden`);
      }
    } catch (e) {
      console.log(`❌ Parse Error: ${e.message}`);
    }

  } catch (error) {
    console.error(`❌ Request Error: ${error.message}`);
  }
}

testCurlDirect(); 