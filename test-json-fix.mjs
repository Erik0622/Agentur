import https from 'https';
import fs from 'fs';

// Lade eine echte Audio-Datei wenn vorhanden, sonst verwende dummy data
let audioBase64;
try {
  // Versuche eine der Audio-Dateien zu laden
  const audioBuffer = fs.readFileSync('test-speech-sample.wav');
  audioBase64 = audioBuffer.toString('base64');
  console.log('📁 Echte Audio-Datei geladen:', audioBuffer.length, 'bytes');
} catch {
  // Fallback zu dummy audio
  audioBase64 = "UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  console.log('📁 Dummy Audio-Daten verwendet');
}

const testData = JSON.stringify({
  audio: audioBase64,
  voice: 'german_m2'
});

// Teste verschiedene URLs um zu sehen welche funktioniert
const testUrls = [
  'agentur-voice-3z26q13an-erik0622s-projects.vercel.app', // Neueste
  'agentur-voice-2lgqagmyv-erik0622s-projects.vercel.app', // Vorherige
  'agentur-chi.vercel.app' // Original
];

async function testUrl(hostname) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Teste: https://${hostname}/api/voice-agent`);
    
    const options = {
      hostname: hostname,
      port: 443,
      path: '/api/voice-agent',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData)
      }
    };

    const req = https.request(options, (res) => {
      console.log(`📊 Status: ${res.statusCode}`);
      
      let data = '';
      let jsonParseErrors = 0;
      let validJsonChunks = 0;
      
      res.on('data', (chunk) => {
        data += chunk;
        
        // Teste jeden empfangenen JSON-Chunk
        const lines = chunk.toString().split('\n').filter(line => line.trim());
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            validJsonChunks++;
            console.log(`✅ Gültiger JSON-Chunk:`, parsed.type, parsed.data?.text?.substring(0, 50) || parsed.data?.message);
          } catch (e) {
            jsonParseErrors++;
            console.log(`❌ JSON-Parse-Fehler:`, e.message);
            console.log(`   Problematischer Chunk:`, line.substring(0, 100));
          }
        }
      });
      
      res.on('end', () => {
        console.log(`\n📊 Zusammenfassung für ${hostname}:`);
        console.log(`   Status Code: ${res.statusCode}`);
        console.log(`   Gültige JSON-Chunks: ${validJsonChunks}`);
        console.log(`   JSON-Parse-Fehler: ${jsonParseErrors}`);
        console.log(`   Gesamt Response-Länge: ${data.length} bytes`);
        
        if (res.statusCode === 200 && jsonParseErrors === 0) {
          console.log(`🎉 ERFOLG! Keine JSON-Parse-Fehler!`);
        } else if (res.statusCode === 401) {
          console.log(`🔒 Authentication erforderlich (erwarteter Fehler)`);
        } else if (jsonParseErrors > 0) {
          console.log(`❌ FEHLER NOCH VORHANDEN! ${jsonParseErrors} JSON-Parse-Fehler`);
        }
        
        resolve({
          hostname,
          statusCode: res.statusCode,
          validJsonChunks,
          jsonParseErrors,
          dataLength: data.length
        });
      });
    });

    req.on('error', (e) => {
      console.error(`❌ Request Fehler für ${hostname}:`, e.message);
      resolve({ hostname, error: e.message });
    });

    req.setTimeout(30000, () => {
      console.log(`⏰ Timeout für ${hostname}`);
      req.destroy();
      resolve({ hostname, error: 'Timeout' });
    });

    req.write(testData);
    req.end();
  });
}

console.log('🔍 Teste JSON-Parse-Fix auf verschiedenen Vercel-URLs...\n');

// Teste alle URLs nacheinander
for (const url of testUrls) {
  await testUrl(url);
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2s Pause zwischen Tests
}

console.log('\n✅ JSON-Parse-Fix-Test abgeschlossen!'); 