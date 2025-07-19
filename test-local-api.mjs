// Importiere die voice-agent Funktionen direkt
import { processAndStreamLLMResponse } from './api/voice-agent.js';

// Mock Response-Objekt für lokales Testing
class MockResponse {
  constructor() {
    this.data = '';
    this.finished = false;
    this.statusCode = 200;
    this.headers = {};
  }
  
  writeHead(code, headers) {
    this.statusCode = code;
    this.headers = headers;
    console.log(`📤 Response Headers gesetzt: ${code}`, headers);
  }
  
  write(chunk) {
    this.data += chunk;
    console.log('📦 Chunk geschrieben:', chunk.substring(0, 100));
    
    // Teste jeden JSON-Chunk
    const lines = chunk.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        console.log(`✅ Gültiger JSON:`, parsed.type, parsed.data?.text?.substring(0, 30) || parsed.data?.message);
      } catch (e) {
        console.log(`❌ JSON-Parse-Fehler:`, e.message);
        console.log(`   Chunk:`, line);
      }
    }
  }
  
  end() {
    this.finished = true;
    console.log('✅ Response beendet');
  }
}

async function testJsonFix() {
  console.log('🧪 Teste JSON-Fix direkt in voice-agent.js...\n');
  
  const mockRes = new MockResponse();
  const testTranscript = "Hallo, ich brauche Hilfe mit meiner Bestellung";
  const testVoice = "german_m2";
  
  try {
    console.log('📝 Teste mit Transkript:', testTranscript);
    await processAndStreamLLMResponse(testTranscript, testVoice, mockRes);
    
    console.log('\n📊 Test-Ergebnisse:');
    console.log(`   Response Länge: ${mockRes.data.length} bytes`);
    console.log(`   Response beendet: ${mockRes.finished}`);
    console.log(`   Status Code: ${mockRes.statusCode}`);
    
    // Analysiere alle JSON-Chunks
    const chunks = mockRes.data.split('\n').filter(line => line.trim());
    let validChunks = 0;
    let errorChunks = 0;
    
    for (const chunk of chunks) {
      try {
        JSON.parse(chunk);
        validChunks++;
      } catch (e) {
        errorChunks++;
      }
    }
    
    console.log(`\n🎯 JSON-Analyse:`);
    console.log(`   Gültige JSON-Chunks: ${validChunks}`);
    console.log(`   Fehlerhafte JSON-Chunks: ${errorChunks}`);
    
    if (errorChunks === 0) {
      console.log('🎉 ERFOLG! Keine JSON-Parse-Fehler in der API!');
    } else {
      console.log('❌ FEHLER! Noch JSON-Parse-Probleme vorhanden.');
    }
    
  } catch (error) {
    console.error('❌ Test-Fehler:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testJsonFix(); 