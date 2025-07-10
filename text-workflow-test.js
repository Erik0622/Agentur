// DIRECT TEXT WORKFLOW TEST: Bypass STT, Test LLM + TTS
// Tests: Text → Gemini 2.5 Flash-Lite → RunPod XTTS
// Measures: Cold Start vs Warm Start for LLM + TTS pipeline

import { request } from 'undici';

// === Test Configuration ===
const VOICE_AGENT_URL = 'http://localhost:3000/api/voice-agent';
const TEST_ITERATIONS = 2;

// Create minimal WAV with silence (to bypass audio validation)
function createMinimalWavBuffer() {
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + 1600, 4); // Small file
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(1600, 40);
  
  // 0.1 seconds of silence
  const silence = Buffer.alloc(1600);
  
  return Buffer.concat([header, silence]);
}

// === Modified Voice Agent Handler (Text Input) ===
async function testTextToSpeechWorkflow(testNumber, inputText) {
  console.log(`\n🚀 === TEST ${testNumber}: ${testNumber === 1 ? 'COLD START' : 'WARM START'} ===`);
  console.log(`📝 Input Text: "${inputText}"`);
  
  const startTime = Date.now();
  
  // Create minimal audio buffer to satisfy API validation
  const dummyAudio = createMinimalWavBuffer().toString('base64');
  
  // Override the request to inject our text directly
  const requestBody = {
    audio: dummyAudio,
    voice: 'german_m2',
    directText: inputText // Custom field for text injection
  };
  
  try {
    console.log('📡 Sending request to voice agent...');
    const requestStart = Date.now();
    
    const { body, statusCode } = await request(VOICE_AGENT_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/x-ndjson'
      },
      body: JSON.stringify(requestBody)
    });

    if (statusCode !== 200) {
      console.log(`❌ Voice Agent Error: HTTP ${statusCode}`);
      const errorText = await body.text();
      console.log(`Error details: ${errorText}`);
      return null;
    }

    const results = {
      transcript: inputText, // Pre-set since we're injecting text
      llm_chunks: [],
      audio_chunks: [],
      errors: [],
      timings: {
        request_start: requestStart,
        first_response: null,
        first_llm_chunk: null,
        first_audio_chunk: null,
        total_time: null
      }
    };

    let responseBuffer = '';
    
    console.log('🤖 Streaming Response:');
    
    for await (const chunk of body) {
      if (!results.timings.first_response) {
        results.timings.first_response = Date.now();
      }
      
      responseBuffer += chunk.toString();
      const lines = responseBuffer.split('\n');
      responseBuffer = lines.pop();
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            
            switch (parsed.type) {
              case 'transcript':
                console.log(`📝 Transcript received: "${parsed.data.text}"`);
                break;
                
              case 'llm_chunk':
                if (!results.timings.first_llm_chunk) {
                  results.timings.first_llm_chunk = Date.now();
                  console.log(`🧠 First LLM chunk: ${Date.now() - requestStart}ms`);
                }
                results.llm_chunks.push(parsed.data.text);
                process.stdout.write(parsed.data.text);
                break;
                
              case 'audio_chunk':
                if (!results.timings.first_audio_chunk) {
                  results.timings.first_audio_chunk = Date.now();
                  console.log(`\n🎵 First audio chunk: ${Date.now() - requestStart}ms`);
                }
                results.audio_chunks.push({
                  size: parsed.data.base64.length,
                  format: parsed.data.format
                });
                break;
                
              case 'error':
                results.errors.push(parsed.data.message);
                console.log(`❌ Error: ${parsed.data.message}`);
                break;
            }
          } catch (e) {
            console.log(`⚠️  Parse error: ${line.substring(0, 100)}...`);
          }
        }
      }
    }
    
    results.timings.total_time = Date.now();
    console.log('\n'); // New line after streaming
    
    return results;
    
  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
    return null;
  }
}

// === Performance Analysis ===
function analyzeTextWorkflowPerformance(results, testNumber, inputText) {
  if (!results) {
    console.log(`❌ Test ${testNumber}: FAILED - No results to analyze`);
    return;
  }
  
  const timings = results.timings;
  const requestStart = timings.request_start;
  
  console.log(`📊 === PERFORMANCE ANALYSIS - TEST ${testNumber} ===`);
  
  const metrics = {
    time_to_first_response: timings.first_response ? timings.first_response - requestStart : null,
    time_to_first_llm_chunk: timings.first_llm_chunk ? timings.first_llm_chunk - requestStart : null,
    time_to_first_audio: timings.first_audio_chunk ? timings.first_audio_chunk - requestStart : null,
    total_processing_time: timings.total_time - requestStart
  };
  
  console.log(`⚡ Time to First Response: ${metrics.time_to_first_response || 'N/A'}ms`);
  console.log(`🧠 Gemini TTFC: ${metrics.time_to_first_llm_chunk || 'N/A'}ms`);
  console.log(`🎵 XTTS TTFA: ${metrics.time_to_first_audio || 'N/A'}ms`);
  console.log(`🏁 Total Processing Time: ${metrics.total_processing_time}ms`);
  
  // Component breakdown
  if (metrics.time_to_first_llm_chunk && metrics.time_to_first_audio) {
    const gemini_latency = metrics.time_to_first_llm_chunk;
    const xtts_latency = metrics.time_to_first_audio - metrics.time_to_first_llm_chunk;
    
    console.log(`\n🔬 Component Breakdown:`);
    console.log(`   Gemini LLM: ${gemini_latency}ms`);
    console.log(`   XTTS TTS: ${xtts_latency}ms`);
  }
  
  console.log(`\n📋 Content Analysis:`);
  console.log(`   Input: "${inputText}"`);
  console.log(`   LLM Response: "${results.llm_chunks.join('') || 'No response'}"`);
  console.log(`   Audio Chunks: ${results.audio_chunks.length}`);
  console.log(`   Errors: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log(`   Error Details: ${results.errors.join(', ')}`);
  }
  
  return metrics;
}

// === Main Test Runner ===
async function runTextWorkflowTest() {
  console.log('🎯 === TEXT WORKFLOW TEST: LLM + TTS Pipeline ===\n');
  
  const testText = "Hallo, ich hätte gerne eine Tischreservierung für heute Abend um 19 Uhr für zwei Personen.";
  console.log(`📝 Test Input: "${testText}"`);
  
  const testResults = [];
  
  for (let i = 1; i <= TEST_ITERATIONS; i++) {
    const result = await testTextToSpeechWorkflow(i, testText);
    const metrics = analyzeTextWorkflowPerformance(result, i, testText);
    
    testResults.push({ result, metrics });
    
    if (i < TEST_ITERATIONS) {
      console.log('\n⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Compare Cold vs Warm Start
  console.log('\n🔥 === COLD START vs WARM START COMPARISON ===');
  
  if (testResults[0].metrics && testResults[1].metrics) {
    const cold = testResults[0].metrics;
    const warm = testResults[1].metrics;
    
    console.log('LLM + TTS Performance (Cold → Warm):');
    
    const improvements = {
      'Time to First Response': warm.time_to_first_response - cold.time_to_first_response,
      'Gemini TTFC': warm.time_to_first_llm_chunk - cold.time_to_first_llm_chunk,
      'XTTS TTFA': warm.time_to_first_audio - cold.time_to_first_audio,
      'Total Processing': warm.total_processing_time - cold.total_processing_time
    };
    
    for (const [metric, diff] of Object.entries(improvements)) {
      if (diff !== null && diff !== undefined && !isNaN(diff)) {
        const symbol = diff < 0 ? '⚡' : '🐌';
        const direction = diff < 0 ? 'faster' : 'slower';
        console.log(`   ${symbol} ${metric}: ${Math.abs(diff)}ms ${direction}`);
      }
    }
  }
  
  // Final Assessment
  console.log('\n🎯 === FINAL ASSESSMENT ===');
  
  const workingTests = testResults.filter(t => t.result && t.result.llm_chunks.length > 0).length;
  console.log(`✅ Working Tests: ${workingTests}/${TEST_ITERATIONS}`);
  
  if (workingTests > 0) {
    const bestLatency = Math.min(...testResults
      .filter(t => t.metrics && t.metrics.total_processing_time)
      .map(t => t.metrics.total_processing_time));
    
    console.log(`⚡ Best Processing Time: ${bestLatency}ms`);
    
    if (bestLatency < 1000) {
      console.log('🏆 EXCELLENT: Sub-second LLM + TTS!');
    } else if (bestLatency < 2000) {
      console.log('👍 GOOD: Under 2 seconds');
    } else {
      console.log('⚠️  NEEDS OPTIMIZATION: Over 2 seconds');
    }
  }
  
  console.log('\n🏁 Text workflow test finished!');
}

// Start the test
runTextWorkflowTest().catch(console.error); 