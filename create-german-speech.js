import fs from 'fs';
import textToSpeech from '@google-cloud/text-to-speech';
import util from 'util';

async function createSpeechSample() {
    console.log('--- Erstelle saubere deutsche Test-Audiodatei ---');

    // Initialisiere den Google Cloud TTS Client
    // Dies erfordert, dass die Authentifizierung (z.B. über GOOGLE_APPLICATION_CREDENTIALS) eingerichtet ist.
    // Für dieses Skript verwenden wir die einfachste Form der Authentifizierung.
    const client = new textToSpeech.TextToSpeechClient();

    const text = 'Hallo Welt, dies ist ein Test.';
    const outputFile = 'german-speech-test.wav';

    const request = {
        input: { text: text },
        voice: { languageCode: 'de-DE', ssmlGender: 'NEUTRAL' },
        // WICHTIG: Korrektes Audioformat für Deepgram
        audioConfig: { 
            audioEncoding: 'LINEAR16',
            sampleRateHertz: 16000
        },
    };

    try {
        console.log(`Sende Anfrage an Google TTS für den Text: "${text}"`);
        const [response] = await client.synthesizeSpeech(request);
        
        const writeFile = util.promisify(fs.writeFile);
        await writeFile(outputFile, response.audioContent, 'binary');
        
        console.log(`✅ Audiodatei erfolgreich als '${outputFile}' gespeichert.`);
        console.log('   Format: LINEAR16, 16000Hz');

    } catch (error) {
        console.error('❌ FEHLER bei der Erstellung der Audiodatei:', error);
        console.error('\n   Mögliche Ursachen:');
        console.error('   - Google Cloud Authentifizierung nicht konfiguriert.');
        console.error('   - Führen Sie `gcloud auth application-default login` in Ihrem Terminal aus.');
        console.error('   - Oder setzen Sie die `GOOGLE_APPLICATION_CREDENTIALS` Umgebungsvariable.');
    }
}

createSpeechSample(); 