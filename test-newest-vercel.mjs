import https from 'https';

const testData = JSON.stringify({
  audio: "UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=" // Dummy base64
});

const options = {
  hostname: 'agentur-voice-3z26q13an-erik0622s-projects.vercel.app',
  port: 443,
  path: '/api/voice-agent',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(testData)
  }
};

console.log('🧪 Teste ALLERNEUESTE Vercel API...');
console.log('URL:', `https://${options.hostname}${options.path}`);

const req = https.request(options, (res) => {
  console.log(`\n📊 Status Code: ${res.statusCode}`);
  console.log('📋 Headers:', res.headers);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
    console.log('📦 Chunk erhalten:', chunk.toString().substring(0, 200));
  });
  
  res.on('end', () => {
    console.log('\n✅ Response beendet');
    
    if (res.statusCode === 200) {
      console.log('🎉 SUCCESS! API funktioniert perfekt!');
      console.log('📄 Response Anfang:', data.substring(0, 300));
    } else if (res.statusCode === 400) {
      console.log('⚠️  400 Bad Request - API erreichbar, aber Eingabe braucht Verbesserung');
      console.log('📄 Response:', data.substring(0, 500));
    } else if (res.statusCode === 500) {
      console.log('❌ 500 Error - Server-seitiger Fehler in voice-agent.js');
      console.log('📄 Response:', data.substring(0, 500));
    } else if (res.statusCode === 401) {
      console.log('🔒 NOCH IMMER Authentication - Team/Account Problem');
    } else {
      console.log(`❓ Status: ${res.statusCode}`);
      console.log('📄 Response:', data.substring(0, 200));
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request Fehler:', e.message);
});

req.write(testData);
req.end(); 