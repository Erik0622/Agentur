import https from 'https';

const testData = JSON.stringify({
  audio: "UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" // Dummy base64
});

const options = {
  hostname: 'agentur-chi.vercel.app',
  port: 443,
  path: '/api/voice-agent',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

console.log('🧪 Teste Vercel API direkt...');
console.log('URL:', `https://${options.hostname}${options.path}`);

const req = https.request(options, (res) => {
  console.log(`\n📊 Status Code: ${res.statusCode}`);
  console.log('📋 Headers:', res.headers);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
    console.log('📦 Chunk erhalten:', chunk.toString());
  });
  
  res.on('end', () => {
    console.log('\n✅ Response beendet');
    console.log('📄 Vollständige Response:', data);
    
    if (res.statusCode === 404) {
      console.log('❌ 404 Error - API Route nicht gefunden!');
      console.log('💡 Mögliche Ursachen:');
      console.log('   - /api/voice-agent.js existiert nicht in Vercel');
      console.log('   - Vercel hat das Deployment nicht erkannt');
      console.log('   - Falscher Pfad oder Routing-Problem');
    } else if (res.statusCode === 500) {
      console.log('❌ 500 Error - Server-seitiger Fehler!');
      try {
        JSON.parse(data);
        console.log('✓ Response ist gültiges JSON');
      } catch (e) {
        console.log('❌ Response ist KEIN gültiges JSON:', e.message);
        console.log('🔍 Raw Response (erste 200 Zeichen):', data.substring(0, 200));
      }
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request Fehler:', e.message);
});

req.write(testData);
req.end(); 