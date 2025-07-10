import { request } from 'undici';

console.log('🧪 === DIREKTER STT-BYPASS TEST ===\n');

async function testSTTBypass() {
  const testCases = [
    "Hallo ich möchte eine Tischreservierung für vier Personen",
    "Können Sie mir mit meiner Bestellung helfen",
    "Guten Tag ich hätte gerne einen Termin für nächste Woche"
  ];
  
  for (const [index, transcript] of testCases.entries()) {
    console.log(`🔄 Test ${index + 1}/3: "${transcript}"`);
    const startTime = performance.now();
    
    try {
      const { body, statusCode } = await request('http://localhost:3100/api/voice-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bypass-stt': 'true',
          'x-simulated-transcript': transcript
        },
        body: JSON.stringify({ voice: 'german_m2' })
      });
      
      if (statusCode !== 200) {
        console.log(`❌ HTTP Error: ${statusCode}`);
        continue;
      }
      
      let responseText = '';
      let firstChunkTime = null;
      let chunkCount = 0;
      let transcriptReceived = false;
      let llmStarted = false;
      
      for await (const chunk of body) {
        chunkCount++;
        const chunkText = chunk.toString();
        
        if (!firstChunkTime) {
          firstChunkTime = performance.now();
          console.log(`⚡ First Chunk: ${(firstChunkTime - startTime).toFixed(2)}ms`);
        }
        
        // Parse JSON chunks
        const lines = chunkText.split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'transcript' && !transcriptReceived) {
              transcriptReceived = true;
              console.log(`📝 Transcript: "${data.data.text}"`);
            } else if (data.type === 'llm_chunk' && !llmStarted) {
              llmStarted = true;
              const llmTime = performance.now();
              console.log(`🧠 LLM Start: ${(llmTime - startTime).toFixed(2)}ms`);
            }
          } catch (e) {
            // Ignore parse errors for non-JSON chunks
          }
        }
        
        responseText += chunkText;
      }
      
      const totalTime = performance.now() - startTime;
      
      console.log(`📊 Total Zeit: ${totalTime.toFixed(2)}ms`);
      console.log(`📝 Chunks: ${chunkCount}`);
      console.log(`✅ Test erfolgreich`);
      console.log('─'.repeat(50));
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
      console.log('─'.repeat(50));
    }
    
    // Warte zwischen Tests
    if (index < testCases.length - 1) {
      console.log('⏳ Warte 2 Sekunden...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

testSTTBypass().catch(console.error); 