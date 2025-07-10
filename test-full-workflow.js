import { request, Agent } from 'undici';
import { createSign } from 'crypto';
import WebSocket from 'ws';
import fs from 'fs/promises';
import path from 'path';

// --- Konfiguration ---
// Verwenden Sie hier Ihre tatsächlichen Keys und IDs
const config = {
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "ac6a04eb0684c7bd7c61e8faab45ea6b1ee47681",
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY || "rpa_FXP6CF71K5SS604DFCJJ2ZT9HBQX76EF4R6ZPQBGnhgr44",
    RUNPOD_POD_ID: process.env.RUNPOD_POD_ID || "e3nohugxevf9s6",
    SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?
        JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) :
        {
            "type": "service_account",
            "project_id": "gen-lang-client-0449145483",
            "private_key_id": "1e6ef13b66c6482c0b9aef385d6d95f042717a0b",
            "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCdfC/EouuNEeSm\\n2FXhptXiwm7P7qkQk4afQjXgaJ8cMSJgE0DKWbhingFQEBxJgSncPfmbRQpXiGFO\\nEWngJFyObbXMyTrbBU2h2Q4se+n+T44Vu3mcYcPFVbPFT1iIbOi70RUG2ek1ea+w\\nw3y+ayh0o7v9/Jo5ShelS5gInjsbuOkmT7DV0kbWn1kx0uA1ss3L7fBwCt9WfJSV\\nlZrpliVrZRdIolBV14ieW3scaL2E57KR/gvnjoo3g7G+y4xXCT7h4BysyH3SLMcU\\nVcj52uKgcOp9Akn4/Z2dXZVErpjH/FwWAQ0yLz40HwggIItoRRqxQgg0nYBd1Gth\\nDDftRBBZAgMBAAECggEADBZJ/Eec2Jj0+bFE9iq948eUhbUFmNYZ0QNd6zlcbOeA\\nges4X89/DWKfKyvxX9rgAZ1oGPi1kH5RKZLAk4l26R+Wgn83WzQO/0sPgW6JSRGG\\nEDjxXoVKZ0zqnUw3uVDSlAe6G2qCMa6DQ4fdfSfwVPN0LExE8fyzz+X7Zz3tv3TU\\n4tjnIVV6CPGsysYD5KRF68w1qgQb4K4pTTOoiaCM1mJYFp8jCd7y5HFjM2+2bq0i\\nyVNLxnJ7kcm0spUuHZwINImEZ3RV6tuXwljM088ph9voX2ZE8dcwtcBvo8rgGEJE\\nMkIc0N5iiTqCINcFgtV5dCGuzHnkIvSFYXFNY+zI4QKBgQDTqPimyLQrx9tyOYb1\\nxzT17ekvj0VAluYUMgwgFgncMFnm3i0wHUMp/a3OOmJasko5/Z3RhCRPO6PhB2e8\\nIDL1A9VxaFCVrSARVA5oFZTVBZG6O1iH7BRgqGMusHY58wFF/wpl5J/s/wY9CpYU\\nz1tB5wEkoFNUx3AoqND4cuyBnQKBgQC+eePQoUq4tTSYq8/M+yfnigkoYt7EeNel\\nxyPOOmbN0IMSpOyKvjrBmQes10pjT9aAFql12Km+/aQ+bjWq0T5tqw8znZkfQPb/\\nWQk6LkZkYRWIPNiqU/P/7+6fxd38wEyYqJuzd73Db0RkT2aDiCt8fLvnpIp4SyLL\\nBG/Uo3S67QKBgQCf9CcNK8n0+BFgDhdu7/+XBxddKMGmISN5CaVeLil/bE7UiPzP\\nSp3yQtKxci/X6LrtfjthFaK2+hRLv+PmKNM5lI8eKD4WDwKX9dT5Va3nGlFZ0vWB\\nqqhvr3Fc3GBMRNemhSnffNpbKRMW2EQ5L8cAU8nqWvr+q8WYBJP/3iHbhQKBgEuq\\n+nCgEqIMAmgAIR4KTFD0Ci1MEbk1VF3cHYJIuxxaECfw8rMvXQIZu+3S3Q9U4R6j\\nYhCZ0N05v+y5NYK1ezpv8SsNGY5L7ZOFGGBPj9FCrB4iJeSMU2tCMqawIT7OWd9v\\nY+NI107zPdUnoc7w4m2i07bzK7scBidmjNKJWM8FAoGADZ8Ew7y19Zzn7+vp8GEq\\nLcZ+dtgT9diJH65fllnuX8pLmT8/qgX2UrzioPQ8ibdsHxg7JzJ56kYD+3+rH3H/\\nx9B6GEDHKQoyKEPP/mO1K2TKYgyNcOuV/DvOaHa79fIUdZVuKAN1VPDOF/1rrRUu\\ns1Ic6uppkG5eB+SXKwU9O5M=\\n-----END PRIVATE KEY-----\\n",
            "client_email": "erik86756r75@gen-lang-client-0449145483.iam.gserviceaccount.com",
            "client_id": "115562603227493619457",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/erik86756r75%40gen-lang-client-0449145483.iam.gserviceaccount.com",
            "universe_domain": "googleapis.com"
        }
};

const { DEEPGRAM_API_KEY, RUNPOD_API_KEY, RUNPOD_POD_ID, SERVICE_ACCOUNT_JSON } = config;

// --- Agents ---
const runpodAgent = new Agent({ connections: 5 });
const geminiAgent = new Agent({ connections: 10 });
const tokenAgent = new Agent({ connections: 2 });

let currentPodEndpoint = null;

// --- Kernlogik (aus voice-agent.js extrahiert und angepasst) ---

async function getPodStatus() {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
        method: 'POST',
        headers: { 'Authorization': RUNPOD_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus, runtime { uptimeInSeconds, ports { isIpPublic, privatePort, publicPort, type } } } }` }),
        dispatcher: runpodAgent
    });
    if (statusCode !== 200) throw new Error(`RunPod API error: ${statusCode}`);
    const result = await body.json();
    if (result.errors) throw new Error(`RunPod GraphQL Error: ${result.errors[0].message}`);
    if (!result.data.pod) return 'NOT_FOUND';

    const pod = result.data.pod;
    let podStatus = pod.desiredStatus;
    if (pod.runtime?.uptimeInSeconds > 0) podStatus = 'RUNNING';
    else if (pod.desiredStatus === 'RUNNING' && !pod.runtime) podStatus = 'STARTING';
    if (podStatus === 'EXITED') podStatus = 'STOPPED';

    if (podStatus === 'RUNNING' && pod.runtime?.ports) {
        const httpPort = pod.runtime.ports.find(p => p.isIpPublic && p.type === 'http' && p.privatePort === 8020);
        if (httpPort) currentPodEndpoint = `https://${RUNPOD_POD_ID}-${httpPort.publicPort}.proxy.runpod.net`;
    }
    return podStatus;
}

async function stopPod() {
    console.log('  -> Sende `podStop` Mutation...');
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
        method: 'POST',
        headers: { 'Authorization': RUNPOD_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { podStop(input: {podId: "${RUNPOD_POD_ID}"}) { id, desiredStatus } }` }),
        dispatcher: runpodAgent
    });
    if (statusCode !== 200) console.error('Stop Pod Request fehlgeschlagen');
    const result = await body.json();
    if (result.errors) {
        console.error('Stop Pod Fehler:', result.errors[0].message);
        return false;
    }
    console.log('  -> Stopp-Befehl erfolgreich gesendet.');
    return true;
}

async function startPod() {
    const { body, statusCode } = await request(`https://api.runpod.io/graphql`, {
        method: 'POST',
        headers: { 'Authorization': RUNPOD_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `mutation { podResume(input: {podId: "${RUNPOD_POD_ID}", gpuCount: 1}) { id, desiredStatus } }` }),
        dispatcher: runpodAgent
    });
    if (statusCode !== 200) throw new Error(`Failed to start pod: ${statusCode}`);
    const result = await body.json();
    if (result.errors) throw new Error(`RunPod Start Error: ${result.errors[0].message}`);
    if (!result.data.podResume) throw new Error('Failed to start pod, invalid response.');
}

async function waitForPodReady() {
    const maxWaitTime = 180000; // 3 Minuten
    const startTime = Date.now();
    console.log('  -> Warte bis Pod bereit ist (max 3 min)...');
    while (Date.now() - startTime < maxWaitTime) {
        try {
            const status = await getPodStatus();
            if (status === 'RUNNING' && currentPodEndpoint) {
                process.stdout.write('\n  -> Pod ist RUNNING. Führe Health-Check durch...');
                const { statusCode } = await request(`${currentPodEndpoint}/`, { method: 'GET', dispatcher: runpodAgent });
                if (statusCode === 200) {
                    console.log(' OK (200)!');
                    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
                    console.log(`  -> Pod ist nach ${duration}s bereit.`);
                    return;
                } else {
                     console.log(` Health-Check fehlgeschlagen (Status: ${statusCode}).`);
                }
            } else {
                 process.stdout.write(`.`);
            }
        } catch (e) {
            process.stdout.write('x');
        }
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    throw new Error('Pod wurde nicht rechtzeitig bereit.');
}

async function ensurePodRunning() {
    try {
        const status = await getPodStatus();
        console.log(`  -> Aktueller Pod-Status: ${status}`);
        if (status === 'STOPPED') {
            console.log('  -> Pod ist gestoppt. Starte ihn...');
            await startPod();
            await waitForPodReady();
        } else if (status === 'RUNNING') {
            console.log('  -> Pod läuft bereits.');
        } else if (status === 'STARTING') {
            await waitForPodReady();
        } else if (status === 'NOT_FOUND') {
             throw new Error(`Pod mit ID ${RUNPOD_POD_ID} nicht gefunden.`);
        } else {
            throw new Error(`Unerwarteter Pod-Status: ${status}`);
        }
    } catch (error) {
        // FIXED: Fange Infrastruktur-Fehler ab
        if (error.message.includes('not enough free GPUs')) {
            console.error(`  -> ❌ INFRASTRUKTUR-FEHLER: Nicht genügend freie GPUs auf dem Host zum Starten des Pods.`);
            throw new Error('GPU_UNAVAILABLE'); // Werfe einen spezifischen, internen Fehler
        }
        // Werfe andere Fehler weiter
        throw error;
    }
}

function getTranscriptViaWebSocket(audioBuffer) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000', {
            headers: { Authorization: `Token ${DEEPGRAM_API_KEY}` }
        });
        let finalTranscript = '';
        ws.on('open', () => {
            const pcmData = audioBuffer.subarray(44); // WAV-Header entfernen
            ws.send(pcmData);
            ws.send(JSON.stringify({ type: 'CloseStream' }));
        });
        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.is_final && msg.channel?.alternatives[0]?.transcript) {
                finalTranscript += msg.channel.alternatives[0].transcript + ' ';
            }
        });
        ws.on('close', () => resolve(finalTranscript.trim()));
        ws.on('error', reject);
    });
}

async function* getGeminiStream(transcript) {
    const accessToken = await generateAccessToken();
    const endpoint = `https://aiplatform.googleapis.com/v1beta1/projects/${SERVICE_ACCOUNT_JSON.project_id}/locations/global/publishers/google/models/gemini-2.5-flash-lite-preview-06-17:streamGenerateContent`;
    const { body } = await request(endpoint, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `Antworte kurz. Kunde: ${transcript}` }] }] }),
        dispatcher: geminiAgent
    });
    for await (const chunk of body) {
        try {
            const jsonResponse = JSON.parse(chunk.toString().startsWith('[') ? chunk.toString().slice(1) : chunk.toString());
            const content = jsonResponse.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) yield content;
        } catch (e) { /* ignore parse errors */ }
    }
}

async function generateAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    const payload = { iss: SERVICE_ACCOUNT_JSON.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: SERVICE_ACCOUNT_JSON.token_uri, exp: now + 3600, iat: now };
    const toSign = `${Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
    
    // FIXED: Korrekte Formatierung des Private Keys
    const privateKey = SERVICE_ACCOUNT_JSON.private_key.replace(/\\n/g, '\n');
    const signature = createSign('RSA-SHA256').update(toSign).sign(privateKey, 'base64url');

    const { body } = await request(SERVICE_ACCOUNT_JSON.token_uri, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${signature}`,
        dispatcher: tokenAgent
    });
    return (await body.json()).access_token;
}

async function generateAndStreamSpeechXTTS(text) {
    if (!currentPodEndpoint) throw new Error("Pod-Endpunkt nicht verfügbar!");
    const { body, statusCode } = await request(`${currentPodEndpoint}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, speaker: "german_m2", language: "de" }),
        dispatcher: runpodAgent
    });
    if (statusCode !== 200) throw new Error(`XTTS API Error: ${statusCode}`);
    return body.arrayBuffer();
}

// --- Test-Workflow ---

async function runWorkflow(testName) {
    console.log(`\n--- ${testName} ---`);
    const totalTime = Date.now();
    let sttDuration = 0, llmDuration = 0, ttsDuration = 0;

    try {
        // 1. STT
        const sttStartTime = Date.now();
        console.log('1. STT: Lese `german-speech-test.wav` und sende an Deepgram...');
        const audioBuffer = await fs.readFile(path.join(process.cwd(), 'german-speech-test.wav'));
        let transcript = await getTranscriptViaWebSocket(audioBuffer);
        sttDuration = Date.now() - sttStartTime;
        
        if (!transcript || transcript.trim().length === 0) {
            console.log('  -> WARNUNG: Deepgram lieferte leeres Transkript. Verwende Fallback-Text.');
            transcript = "Hallo, wie ist das Wetter heute?";
        }
        console.log(`  -> Transkript: "${transcript}" (in ${sttDuration / 1000}s)`);

        // 2. LLM
        const llmStartTime = Date.now();
        console.log('2. LLM: Sende Transkript an Gemini...');
        const geminiStream = getGeminiStream(transcript);
        let llmResponse = '';
        for await (const chunk of geminiStream) {
            process.stdout.write(chunk);
            llmResponse += chunk;
        }
        llmDuration = Date.now() - llmStartTime;
        console.log(`\n  -> Vollständige LLM-Antwort: "${llmResponse}" (in ${llmDuration / 1000}s)`);

        // 3. TTS
        const ttsStartTime = Date.now();
        console.log('3. TTS: Sende LLM-Antwort an XTTS...');
        await ensurePodRunning();
        const audio = await generateAndStreamSpeechXTTS(llmResponse);
        ttsDuration = Date.now() - ttsStartTime;
        console.log(`  -> TTS erfolgreich: ${audio.byteLength} bytes Audio empfangen.`);
        console.log(`  -> Zeit für TTS (inkl. Pod-Check): ${ttsDuration / 1000}s`);

        console.log(`\n✅ ${testName} abgeschlossen in ${(Date.now() - totalTime) / 1000}s`);
    
    } catch (error) {
        if (error.message === 'GPU_UNAVAILABLE') {
            console.log(`\n⚠️ ${testName} abgebrochen, da keine GPU verfügbar war.`);
        } else {
            console.error(`\n❌ ${testName} mit einem unerwarteten Fehler abgebrochen:`, error);
        }
    } finally {
        console.log("\n--- Latenz-Zusammenfassung ---");
        console.log(`- Deepgram (STT): ${(sttDuration / 1000).toFixed(3)}s`);
        console.log(`- Gemini (LLM):   ${(llmDuration / 1000).toFixed(3)}s`);
        if (ttsDuration > 0) console.log(`- RunPod (TTS):   ${(ttsDuration / 1000).toFixed(3)}s`);
        console.log("---------------------------------");
    }
}

async function main() {
    console.log("🚀 Starte vollständigen Workflow-Test");
    
    // Cold Start
    console.log("\nStelle sicher, dass der Pod für den Kaltstart-Test gestoppt ist...");
    await stopPod();
    let status = await getPodStatus();
    while(status !== 'STOPPED') {
        process.stdout.write(`  -> Warte auf Stopp (aktuell: ${status})...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        status = await getPodStatus();
    }
    console.log('\n  -> Pod ist gestoppt. Starte Kaltstart-Test.');
    await runWorkflow("COLD START TEST");

    // Warm Start
    await runWorkflow("WARM START TEST");

    console.log("\n🏁 Alle Tests abgeschlossen.");
}

main().catch(console.error); 