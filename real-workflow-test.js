// REAL WORKFLOW TEST: Complete Voice Agent Pipeline
// Tests: Real Audio → Deepgram → Gemini 2.5 Flash-Lite → RunPod XTTS
// Measures: Cold Start vs Warm Start performance differences

import { request } from 'undici';
import fs from 'fs';

// === Test Configuration ===
const VOICE_AGENT_URL = 'http://localhost:3000/api/voice-agent';
const TEST_ITERATIONS = 2; // Cold Start + Warm Start

// === Generate Real Audio for Deepgram ===
function generateRealAudioSample() {
  // FIRST: Try to use the corrected German speech simulation
  if (fs.existsSync('german-speech-test.wav')) {
    console.log('🎤 Using corrected German speech simulation: german-speech-test.wav');
    const realAudio = fs.readFileSync('german-speech-test.wav');
    console.log(`✅ Loaded ${Math.round(realAudio.length/1024)}KB German speech simulation (16-bit PCM)`);
    return realAudio;
  }
  
  // FALLBACK: Try other files
  if (fs.existsSync('deepgram-ready.wav')) {
    console.log('🎤 Using corrected German audio file: deepgram-ready.wav');
    const realAudio = fs.readFileSync('deepgram-ready.wav');
    console.log(`✅ Loaded ${Math.round(realAudio.length/1024)}KB corrected German speech sample`);
    return realAudio;
  }
  
  if (fs.existsSync('test-speech-sample.wav')) {
    console.log('🎤 Using real German audio file: test-speech-sample.wav');
    const realAudio = fs.readFileSync('test-speech-sample.wav');
    console.log(`✅ Loaded ${Math.round(realAudio.length/1024)}KB real German speech sample`);
    return realAudio;
  }
  
  console.log('🎤 Generating realistic audio sample for Deepgram...');
  
  // WAV Header for 16kHz, 16-bit, mono
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(0, 4); // File size (will be updated)
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(1, 22);  // 1 channel (mono)
  header.writeUInt32LE(16000, 24); // 16kHz sample rate
  header.writeUInt32LE(32000, 28); // byte rate
  header.writeUInt16LE(2, 32);     // block align
  header.writeUInt16LE(16, 34);    // bits per sample
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(0, 40); // data size (will be updated)
  
  // Generate 3 seconds of realistic speech-like audio
  // Mix of different frequencies to simulate human speech
  const sampleRate = 16000;
  const duration = 3; // seconds
  const sampleCount = sampleRate * duration;
  const audioData = Buffer.alloc(sampleCount * 2); // 16-bit samples
  
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    
    // Speech-like signal: fundamental + harmonics + noise
    const fundamental = 140; // Hz (typical male voice)
    let sample = 0;
    
    // Fundamental frequency
    sample += 0.4 * Math.sin(2 * Math.PI * fundamental * t);
    
    // Harmonics (typical for vowel sounds)
    sample += 0.2 * Math.sin(2 * Math.PI * fundamental * 2 * t);
    sample += 0.1 * Math.sin(2 * Math.PI * fundamental * 3 * t);
    
    // Formant frequencies (around 800Hz and 1200Hz)
    sample += 0.15 * Math.sin(2 * Math.PI * 800 * t) * Math.exp(-t * 2);
    sample += 0.1 * Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 1.5);
    
    // Add some noise for realism
    sample += 0.05 * (Math.random() - 0.5);
    
    // Envelope (fade in/out to simulate speech pauses)
    const envelope = Math.sin(Math.PI * t / duration);
    sample *= envelope;
    
    // Convert to 16-bit PCM
    const pcmValue = Math.max(-32768, Math.min(32767, Math.round(sample * 16000)));
    audioData.writeInt16LE(pcmValue, i * 2);
  }
  
  // Update header with correct sizes
  const dataSize = audioData.length;
  const fileSize = 36 + dataSize;
  header.writeUInt32LE(fileSize, 4);
  header.writeUInt32LE(dataSize, 40);
  
  const completeAudio = Buffer.concat([header, audioData]);
  
  // Save for inspection
  fs.writeFileSync('test-speech-sample.wav', completeAudio);
  console.log(`✅ Generated ${Math.round(dataSize/1024)}KB speech-like audio sample`);
  
  return completeAudio;
}

// === Test Functions ===

async function testVoiceAgentWorkflow(testNumber, audioBuffer) {
  console.log(`\n🚀 === TEST ${testNumber}: ${testNumber === 1 ? 'COLD START' : 'WARM START'} ===`);
  
  const startTime = Date.now();
  const audioBase64 = audioBuffer.toString('base64');
  
  const requestBody = {
    audio: audioBase64,
    voice: 'german_m2' // Use corrected XTTS speaker
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

    // Parse streaming NDJSON response
    const results = {
      transcript: null,
      llm_chunks: [],
      audio_chunks: [],
      errors: [],
      timings: {
        request_start: requestStart,
        first_response: null,
        transcript_time: null,
        first_llm_chunk: null,
        first_audio_chunk: null,
        total_time: null
      }
    };

    let responseBuffer = '';
    
    for await (const chunk of body) {
      if (!results.timings.first_response) {
        results.timings.first_response = Date.now();
      }
      
      responseBuffer += chunk.toString();
      const lines = responseBuffer.split('\n');
      responseBuffer = lines.pop(); // Keep incomplete line
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            
            switch (parsed.type) {
              case 'transcript':
                results.transcript = parsed.data.text;
                results.timings.transcript_time = Date.now();
                console.log(`📝 Transcript: "${results.transcript}"`);
                break;
                
              case 'llm_chunk':
                if (!results.timings.first_llm_chunk) {
                  results.timings.first_llm_chunk = Date.now();
                }
                results.llm_chunks.push(parsed.data.text);
                process.stdout.write(parsed.data.text); // Real-time output
                break;
                
              case 'audio_chunk':
                if (!results.timings.first_audio_chunk) {
                  results.timings.first_audio_chunk = Date.now();
                  console.log('\n🎵 First audio chunk received!');
                }
                results.audio_chunks.push({
                  size: parsed.data.base64.length,
                  format: parsed.data.format
                });
                break;
                
              case 'error':
                results.errors.push(parsed.data.message);
                console.log(`❌ Pipeline Error: ${parsed.data.message}`);
                break;
            }
          } catch (e) {
            console.log(`⚠️  Parse error: ${line}`);
          }
        }
      }
    }
    
    results.timings.total_time = Date.now();
    console.log('\n'); // New line after streaming output
    
    return results;
    
  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
    return null;
  }
}

// === Performance Analysis ===

function analyzePerformance(results, testNumber) {
  if (!results) {
    console.log(`❌ Test ${testNumber}: FAILED - No results to analyze`);
    return;
  }
  
  const timings = results.timings;
  const requestStart = timings.request_start;
  
  console.log(`📊 === PERFORMANCE ANALYSIS - TEST ${testNumber} ===`);
  
  // Calculate key metrics
  const metrics = {
    time_to_first_response: timings.first_response ? timings.first_response - requestStart : null,
    time_to_transcript: timings.transcript_time ? timings.transcript_time - requestStart : null,
    time_to_first_llm_chunk: timings.first_llm_chunk ? timings.first_llm_chunk - requestStart : null,
    time_to_first_audio: timings.first_audio_chunk ? timings.first_audio_chunk - requestStart : null,
    total_processing_time: timings.total_time - requestStart
  };
  
  // Display metrics
  console.log(`⚡ Time to First Response: ${metrics.time_to_first_response || 'N/A'}ms`);
  console.log(`🎤 Deepgram Transcript Time: ${metrics.time_to_transcript || 'N/A'}ms`);
  console.log(`🧠 Gemini First Chunk (TTFC): ${metrics.time_to_first_llm_chunk || 'N/A'}ms`);
  console.log(`🎵 XTTS First Audio (TTFA): ${metrics.time_to_first_audio || 'N/A'}ms`);
  console.log(`🏁 Total E2E Latency: ${metrics.total_processing_time}ms`);
  
  // Component breakdown
  if (metrics.time_to_transcript && metrics.time_to_first_llm_chunk) {
    const deepgram_latency = metrics.time_to_transcript;
    const gemini_latency = metrics.time_to_first_llm_chunk - metrics.time_to_transcript;
    const xtts_latency = metrics.time_to_first_audio ? 
      metrics.time_to_first_audio - metrics.time_to_first_llm_chunk : null;
    
    console.log(`\n🔬 Component Breakdown:`);
    console.log(`   Deepgram STT: ${deepgram_latency}ms`);
    console.log(`   Gemini LLM: ${gemini_latency}ms`);
    console.log(`   XTTS TTS: ${xtts_latency || 'N/A'}ms`);
  }
  
  // Content analysis
  console.log(`\n📋 Content Analysis:`);
  console.log(`   Transcript: "${results.transcript || 'No transcript'}"`);
  console.log(`   LLM Response: "${results.llm_chunks.join('') || 'No LLM response'}"`);
  console.log(`   Audio Chunks: ${results.audio_chunks.length}`);
  console.log(`   Errors: ${results.errors.length}`);
  
  if (results.errors.length > 0) {
    console.log(`   Error Details: ${results.errors.join(', ')}`);
  }
  
  return metrics;
}

// === Main Test Runner ===

async function runCompleteWorkflowTest() {
  console.log('🎯 === REAL WORKFLOW TEST: Voice Agent Pipeline ===\n');
  
  // Generate realistic audio sample
  const testAudio = generateRealAudioSample();
  
  // Wait a moment for any previous requests to clear
  console.log('\n⏳ Waiting 2 seconds before starting tests...');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const testResults = [];
  
  // Run tests
  for (let i = 1; i <= TEST_ITERATIONS; i++) {
    const result = await testVoiceAgentWorkflow(i, testAudio);
    const metrics = analyzePerformance(result, i);
    
    testResults.push({ result, metrics });
    
    // Wait between tests
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
    
    console.log('Performance Improvement (Cold → Warm):');
    
    const improvements = {
      'Time to First Response': warm.time_to_first_response - cold.time_to_first_response,
      'Deepgram Transcript': warm.time_to_transcript - cold.time_to_transcript,
      'Gemini TTFC': warm.time_to_first_llm_chunk - cold.time_to_first_llm_chunk,
      'XTTS TTFA': warm.time_to_first_audio - cold.time_to_first_audio,
      'Total E2E': warm.total_processing_time - cold.total_processing_time
    };
    
    for (const [metric, diff] of Object.entries(improvements)) {
      if (diff !== null && diff !== undefined && !isNaN(diff)) {
        const symbol = diff < 0 ? '⚡' : '🐌';
        const direction = diff < 0 ? 'faster' : 'slower';
        console.log(`   ${symbol} ${metric}: ${Math.abs(diff)}ms ${direction}`);
      }
    }
  } else {
    console.log('❌ Cannot compare - incomplete test results');
  }
  
  // Overall assessment
  console.log('\n🎯 === FINAL ASSESSMENT ===');
  
  const workingTests = testResults.filter(t => t.result && t.result.transcript).length;
  console.log(`✅ Working Tests: ${workingTests}/${TEST_ITERATIONS}`);
  
  if (workingTests > 0) {
    const bestLatency = Math.min(...testResults
      .filter(t => t.metrics && t.metrics.total_processing_time)
      .map(t => t.metrics.total_processing_time));
    
    console.log(`⚡ Best E2E Latency: ${bestLatency}ms`);
    
    if (bestLatency < 1000) {
      console.log('🏆 EXCELLENT: Sub-second response time!');
    } else if (bestLatency < 2000) {
      console.log('👍 GOOD: Under 2 seconds');
    } else {
      console.log('⚠️  NEEDS OPTIMIZATION: Over 2 seconds');
    }
  }
  
  console.log('\n🏁 Complete workflow test finished!');
}

// Start the test
runCompleteWorkflowTest().catch(console.error); 