import { request } from 'undici';
import WebSocket from 'ws';
import fs from 'fs';

const DEEPGRAM_API_KEY = "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681";

console.log('🎤 === DEEPGRAM DIRECT TEST ===\n');

// Test 1: REST API Test
async function testDeepgramREST() {
  console.log('📡 Testing Deepgram REST API...');
  
  if (!fs.existsSync('german-speech-test.wav')) {
    console.log('❌ german-speech-test.wav not found');
    return;
  }
  
  const audioBuffer = fs.readFileSync('german-speech-test.wav');
  console.log(`📊 Audio size: ${audioBuffer.length} bytes`);
  
  try {
    const { body, statusCode } = await request('https://api.deepgram.com/v1/listen?model=nova-3&language=multi&punctuate=true', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/wav'
      },
      body: audioBuffer
    });
    
    console.log(`📈 Status Code: ${statusCode}`);
    
    if (statusCode === 200) {
      const result = await body.json();
      console.log('✅ REST API Response:', JSON.stringify(result, null, 2));
      
      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (transcript) {
        console.log(`📝 Transcript: "${transcript}"`);
      } else {
        console.log('❌ No transcript found in response');
      }
    } else {
      const errorText = await body.text();
      console.log(`❌ REST API Error: ${errorText}`);
    }
  } catch (error) {
    console.log(`❌ REST API Exception: ${error.message}`);
  }
}

// Test 2: WebSocket Test
function testDeepgramWebSocket() {
  return new Promise((resolve) => {
    console.log('\n🌐 Testing Deepgram WebSocket...');
    
    if (!fs.existsSync('german-speech-test.wav')) {
      console.log('❌ german-speech-test.wav not found');
      resolve();
      return;
    }
    
    const audioBuffer = fs.readFileSync('german-speech-test.wav');
    console.log(`📊 Audio size: ${audioBuffer.length} bytes`);
    
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&punctuate=true&interim_results=true&endpointing=300';
    
    const ws = new WebSocket(deepgramUrl, { 
      headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` },
      perMessageDeflate: false
    });
    
    let receivedTranscript = '';
    let messageCount = 0;
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected');
      
      // FIXED: Deepgram benötigt NUR rohe PCM-Daten (kein WAV-Header!)
      let pcmData;
      
      if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
        // WAV-Format: Header komplett entfernen
        pcmData = audioBuffer.subarray(44);
        console.log('📦 WAV-Header entfernt - sende nur PCM-Daten');
      } else {
        // Bereits rohe PCM-Daten
        pcmData = audioBuffer;
        console.log('📦 Rohe PCM-Daten erkannt');
      }
      
      console.log(`📤 Sending ${pcmData.length} bytes of PURE PCM data...`);
      
      // Send in optimierte Chunks (≤100ms für niedrige Latenz)
      const chunkSize = 1600; // 50ms chunks bei 16kHz linear16
      for (let i = 0; i < pcmData.length; i += chunkSize) {
        if (ws.readyState === WebSocket.OPEN) {
          const chunk = pcmData.subarray(i, i + chunkSize);
          ws.send(chunk); // BINÄRE PCM-Frames, nicht Base64!
          console.log(`📤 Sent PCM chunk ${Math.floor(i/chunkSize) + 1}: ${chunk.length} bytes`);
        }
      }
      
      // Close stream
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CloseStream' }));
        console.log('📤 Sent CloseStream');
      }
    });
    
    ws.on('message', data => {
      messageCount++;
      console.log(`📥 Message ${messageCount}: ${data.toString()}`);
      
      try {
        const message = JSON.parse(data.toString());
        
        if (message.channel?.alternatives?.[0]?.transcript) {
          const transcript = message.channel.alternatives[0].transcript;
          console.log(`📝 Transcript (${message.is_final ? 'final' : 'interim'}): "${transcript}"`);
          
          if (message.is_final) {
            receivedTranscript += transcript + ' ';
          }
        }
      } catch (e) {
        console.log(`⚠️  Parse error: ${e.message}`);
      }
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
      console.log(`📝 Final transcript: "${receivedTranscript.trim()}"`);
      resolve();
    });
    
    ws.on('error', error => {
      console.log(`❌ WebSocket error: ${error.message}`);
      resolve();
    });
    
    // Timeout after 15 seconds
    setTimeout(() => {
      if (ws.readyState !== WebSocket.CLOSED) {
        console.log('⏰ Timeout - closing WebSocket');
        ws.terminate();
        resolve();
      }
    }, 15000);
  });
}

// Run Tests
async function runTests() {
  await testDeepgramREST();
  await testDeepgramWebSocket();
  console.log('\n🏁 Direct Deepgram tests completed!');
}

runTests(); 