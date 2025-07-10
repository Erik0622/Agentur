import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681";
const AUDIO_FILE = 'german-speech-test.wav';

async function debugDeepgram() {
    console.log('--- DEEPGRAM DEBUG-TEST ---');

    // 1. Audio-Datei prüfen
    let audioBuffer;
    try {
        const filePath = path.join(process.cwd(), AUDIO_FILE);
        audioBuffer = await fs.readFile(filePath);
        console.log(`✅ Audio-Datei '${AUDIO_FILE}' erfolgreich geladen (${audioBuffer.byteLength} bytes).`);
    } catch (error) {
        console.error(`❌ FEHLER: Konnte die Audio-Datei '${AUDIO_FILE}' nicht finden oder lesen.`);
        console.error('   Stellen Sie sicher, dass die Datei im Hauptverzeichnis des Projekts liegt.');
        return;
    }

    // 2. WebSocket-Verbindung aufbauen
    // FIXED: Downgrade auf nova-2 und explizite Spracheinstellung auf "de"
    const deepgramUrl = 'wss://api.deepgram.com/v1/listen?model=nova-2&language=de&encoding=linear16&sample_rate=16000&punctuate=true';
    console.log(`\n建立 WebSocket-Verbindung zu Deepgram...`);
    console.log(`   URL: ${deepgramUrl}`);
    
    const ws = new WebSocket(deepgramUrl, {
        headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` }
    });

    let finalTranscript = '';

    ws.on('open', () => {
        console.log('✅ WebSocket-Verbindung geöffnet. Sende Audio-Daten...');
        
        // WAV-Header entfernen und Daten in Chunks senden
        const pcmData = audioBuffer.subarray(44);
        const chunkSize = 1600; 

        let i = 0;
        const intervalId = setInterval(() => {
            if (i >= pcmData.length) {
                clearInterval(intervalId);
                console.log('✅ Alle Audio-Chunks gesendet. Schließe den Stream...');
                ws.send(JSON.stringify({ type: 'CloseStream' }));
                return;
            }
            const chunk = pcmData.subarray(i, i + chunkSize);
            ws.send(chunk);
            i += chunkSize;
        }, 50); // Simuliert Echtzeit-Streaming
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('⬇️ Nachricht von Deepgram empfangen:', JSON.stringify(message, null, 2));

        if (message.is_final && message.channel?.alternatives[0]?.transcript) {
            finalTranscript += message.channel.alternatives[0].transcript + ' ';
        }
    });

    ws.on('error', (error) => {
        console.error('\n❌ WebSocket-FEHLER:', error.message);
    });

    ws.on('close', (code) => {
        console.log(`\n🏁 WebSocket-Verbindung geschlossen (Code: ${code})`);
        console.log('--- Finales Transkript ---');
        console.log(finalTranscript.trim() || '>> KEIN TRANSKRIPT EMPFANGEN <<');
        console.log('--------------------------');
    });
}

debugDeepgram(); 