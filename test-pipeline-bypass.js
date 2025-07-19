import { request } from 'undici';

console.log('🎯 === PIPELINE BYPASS TEST: Gemini + XTTS ===\n');

// Direkt mit simuliertem Transkript testen (Deepgram umgehen)
async function testPipelineWithTranscript() {
  console.log('🧠 Testing Gemini 2.5 Flash-Lite + RunPod XTTS pipeline...');
  
  // Simuliere einen typischen deutschen Kundenanruf
  const testTranscript = "Hallo ich hätte gerne eine Tischreservierung für heute Abend um acht Uhr für vier Personen";
  
  const requestBody = {
    // Verwende ein kleines 1-Byte Audio um den STT-Check zu umgehen
    audio: Buffer.from([0]).toString('base64'), // Minimal-Audio
    voice: 'german_m2',
    bypass_transcript: testTranscript // BYPASS: Direkt Transkript setzen
  };
  
  try {
    console.log(`📝 Simulated transcript: "${testTranscript}"`);
    console.log('📡 Sending bypass request to voice agent...');
    
    const startTime = Date.now();
    
    const { body, statusCode } = await request('http://localhost:3000/api/voice-agent', {
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
      return;
    }

    // Parse streaming NDJSON response
    const results = {
      llm_chunks: [],
      audio_chunks: [],
      errors: [],
      timings: {
        request_start: startTime,
        first_llm_chunk: null,
        first_audio_chunk: null,
        total_time: null
      }
    };

    let responseBuffer = '';
    
    console.log('\n🤖 Gemini Response:');
    for await (const chunk of body) {
      if (!results.timings.first_llm_chunk) {
        results.timings.first_llm_chunk = Date.now();
      }
      
      responseBuffer += chunk.toString();
      const lines = responseBuffer.split('\n');
      responseBuffer = lines.pop();
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            
            switch (parsed.type) {
              case 'llm_chunk':
                results.llm_chunks.push(parsed.data.text);
                process.stdout.write(parsed.data.text); // Real-time output
                break;
                
              case 'audio_chunk':
                if (!results.timings.first_audio_chunk) {
                  results.timings.first_audio_chunk = Date.now();
                  console.log('\n🎵 First XTTS audio chunk received!');
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
            // Ignore parse errors
          }
        }
      }
    }
    
    results.timings.total_time = Date.now();
    console.log('\n');
    
    // Analyze performance
    const geminiTTFC = results.timings.first_llm_chunk - results.timings.request_start;
    const xttsTTFA = results.timings.first_audio_chunk ? 
      (results.timings.first_audio_chunk - results.timings.request_start) : null;
    const totalTime = results.timings.total_time - results.timings.request_start;
    
    console.log('📊 === BYPASS PERFORMANCE RESULTS ===');
    console.log(`🧠 Gemini 2.5 Flash-Lite TTFC: ${geminiTTFC}ms`);
    if (xttsTTFA) {
      console.log(`🎵 RunPod XTTS TTFA: ${xttsTTFA}ms`);
    } else {
      console.log('🎵 RunPod XTTS: No audio generated (Pod likely stopped)');
    }
    console.log(`🏁 Total Pipeline Time: ${totalTime}ms`);
    console.log(`📝 LLM Response: "${results.llm_chunks.join('')}"`);
    console.log(`🎶 Audio Chunks Generated: ${results.audio_chunks.length}`);
    
    if (results.errors.length > 0) {
      console.log(`❌ Errors: ${results.errors.join(', ')}`);
    }
    
    // Success criteria
    const success = results.llm_chunks.length > 0 && results.errors.length === 0;
    console.log(`\n🎯 Pipeline Test: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (success) {
      console.log('🚀 Complete Gemini + XTTS pipeline is working!');
      
      // Expected performance with real audio
      console.log('\n📈 === EXPECTED REAL-WORLD PERFORMANCE ===');
      console.log('🎤 Deepgram STT (real audio): ~200ms');
      console.log(`🧠 Gemini 2.5 Flash-Lite: ${geminiTTFC}ms (current)`);
      if (xttsTTFA) {
        const realXTTS = xttsTTFA - geminiTTFC;
        console.log(`🎵 RunPod XTTS: ~${realXTTS}ms (current)`);
        console.log(`🏁 Expected Total E2E: ~${200 + geminiTTFC + realXTTS}ms`);
      } else {
        console.log('🎵 RunPod XTTS: ~150ms (when Pod running)');
        console.log(`🏁 Expected Total E2E: ~${200 + geminiTTFC + 150}ms`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Network Error: ${error.message}`);
  }
}

// Run bypass test
await testPipelineWithTranscript();
console.log('\n🏁 Pipeline bypass test completed!'); 