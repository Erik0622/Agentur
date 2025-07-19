import { request, Agent } from 'undici';

const RUNPOD_API_KEY = "rpa_DHD4ZH00YYV8MW98C7C2WX6WT6EUCMUKWOI6AQTHc5ccyk";
const RUNPOD_POD_ID = "e3nohugxevf9s6";

const runpodAgent = new Agent({
  keepAliveTimeout: 15 * 1000,
  keepAliveMaxTimeout: 60 * 1000,
  connections: 5,
  pipelining: 1
});

console.log('🔍 === RUNPOD DEBUG & REPAIR ===\n');

async function debugPodStatus() {
  console.log('📡 Checking RunPod Status...');
  
  try {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
      method: 'POST',
      headers: {
        'x-api-key': RUNPOD_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus, runtime { ports { ip, isIpPublic, privatePort, publicPort, type } } } }`
      }),
      dispatcher: runpodAgent
    });

    console.log(`📈 GraphQL Status Code: ${statusCode}`);
    
    if (statusCode !== 200) {
      const errorText = await body.text();
      console.log(`❌ GraphQL Error: ${errorText}`);
      return null;
    }

    const result = await body.json();
    console.log('📊 GraphQL Response:', JSON.stringify(result, null, 2));
    
    if (result.data?.pod) {
      const pod = result.data.pod;
      console.log(`✅ Pod Found: ${pod.id}`);
      console.log(`📊 Status: ${pod.desiredStatus}`);
      
      if (pod.runtime?.ports) {
        console.log('🔌 Ports:', pod.runtime.ports);
      }
      
      return pod;
    } else {
      console.log('❌ Pod not found in response');
      return null;
    }
  } catch (error) {
    console.log(`❌ GraphQL Exception: ${error.message}`);
    return null;
  }
}

async function startPodIfNeeded() {
  console.log('\n⚡ Starting Pod if needed...');
  
  try {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
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

    console.log(`📈 Start Status Code: ${statusCode}`);
    
    if (statusCode !== 200) {
      const errorText = await body.text();
      console.log(`❌ Start Error: ${errorText}`);
      return false;
    }

    const result = await body.json();
    console.log('📊 Start Response:', JSON.stringify(result, null, 2));
    
    if (result.data?.podResume) {
      console.log('✅ Pod start command sent successfully');
      return true;
    } else {
      console.log('❌ Pod start failed');
      return false;
    }
  } catch (error) {
    console.log(`❌ Start Exception: ${error.message}`);
    return false;
  }
}

async function waitForPodReady() {
  console.log('\n⏳ Waiting for Pod to be ready...');
  
  const maxWaitTime = 180000; // 3 minutes
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      const pod = await debugPodStatus();
      
      if (pod && pod.desiredStatus === 'RUNNING') {
        // Test XTTS endpoint
        const endpoint = `https://${RUNPOD_POD_ID}-8020.proxy.runpod.net`;
        console.log(`🎯 Testing endpoint: ${endpoint}`);
        
        // Health check
        try {
          const { statusCode: healthStatus } = await request(`${endpoint}/`, {
            method: 'GET',
            dispatcher: runpodAgent
          });
          
          console.log(`🏥 Health check: ${healthStatus}`);
          
          if (healthStatus === 200) {
            console.log('✅ Pod is ready and healthy!');
            return endpoint;
          }
        } catch (e) {
          console.log(`⚠️  Health check failed: ${e.message}`);
        }
      }
      
      console.log('⏳ Pod not ready yet, waiting 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (e) {
      console.log(`⚠️  Wait error: ${e.message}`);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  console.log('❌ Pod did not become ready in time');
  return null;
}

async function testXTTSEndpoint(endpoint) {
  console.log('\n🎤 Testing XTTS API...');
  
  const testText = "Hallo, das ist ein Test der deutschen Sprachsynthese";
  const requestBody = {
    text: testText,
    speaker: "german_m2",
    language: "de",
    stream_chunk_size: 180
  };
  
  try {
    console.log(`📡 Calling: ${endpoint}/api/tts`);
    console.log(`📝 Request:`, JSON.stringify(requestBody, null, 2));
    
    const { body, statusCode, headers } = await request(`${endpoint}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      dispatcher: runpodAgent
    });

    console.log(`📈 XTTS Status Code: ${statusCode}`);
    console.log(`📋 Response Headers:`, Object.fromEntries(headers));
    
    if (statusCode !== 200) {
      const errorText = await body.text();
      console.log(`❌ XTTS Error Response: ${errorText}`);
      return false;
    }
    
    // Check if response is JSON or binary
    const contentType = headers['content-type'];
    console.log(`📦 Content-Type: ${contentType}`);
    
    if (contentType?.includes('application/json')) {
      const jsonResponse = await body.json();
      console.log('📊 JSON Response:', JSON.stringify(jsonResponse, null, 2));
    } else {
      const audioBuffer = await body.arrayBuffer();
      console.log(`🎵 Audio Response: ${audioBuffer.byteLength} bytes`);
      
      if (audioBuffer.byteLength > 0) {
        console.log('✅ XTTS working correctly - received audio data!');
        return true;
      } else {
        console.log('❌ XTTS returned empty audio');
        return false;
      }
    }
    
  } catch (error) {
    console.log(`❌ XTTS Exception: ${error.message}`);
    console.log(`📊 Error details:`, error);
    return false;
  }
}

// === Main Debug Flow ===

async function runFullDebug() {
  console.log('🚀 Starting comprehensive RunPod debug...\n');
  
  // Step 1: Check current status
  const pod = await debugPodStatus();
  
  if (!pod) {
    console.log('❌ Cannot continue - Pod not accessible');
    return;
  }
  
  // Step 2: Start pod if needed
  if (pod.desiredStatus !== 'RUNNING') {
    console.log('⚡ Pod not running, starting...');
    const startSuccess = await startPodIfNeeded();
    
    if (!startSuccess) {
      console.log('❌ Failed to start pod');
      return;
    }
  } else {
    console.log('✅ Pod already running');
  }
  
  // Step 3: Wait for pod to be ready
  const endpoint = await waitForPodReady();
  
  if (!endpoint) {
    console.log('❌ Pod did not become ready');
    return;
  }
  
  // Step 4: Test XTTS API
  const xttsSuccess = await testXTTSEndpoint(endpoint);
  
  if (xttsSuccess) {
    console.log('\n🎉 SUCCESS: RunPod XTTS is working correctly!');
    console.log(`🎯 Endpoint: ${endpoint}/api/tts`);
    console.log('🚀 Ready for full workflow tests');
  } else {
    console.log('\n❌ FAILED: XTTS API not working properly');
  }
}

// Run debug
await runFullDebug(); 