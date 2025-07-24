// ---------------- RunPod Management ----------------
async function ensurePodRunning() {
  try {
    const status = await getPodStatus();
    if (status === 'STOPPED' || status === 'EXITED' || status === 'STARTING') {
      await startPod();
      await waitForPodReady();
    }
    if (!podStartTime) podStartTime = Date.now();
  } catch (e) {
    console.error('RunPod not available:', e.message);
    currentPodEndpoint = null;
  }
}

async function getPodStatus() {
  const { body, statusCode } = await request('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: { Authorization: RUNPOD_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { id desiredStatus runtime { uptimeInSeconds ports { ip isIpPublic privatePort publicPort type } } } }`
    }),
    dispatcher: runpodAgent
  });

  if (statusCode !== 200) throw new Error(`RunPod API ${statusCode}`);
  const result = await body.json();
  if (result.errors) throw new Error(result.errors[0].message);

  const pod = result.data?.pod;
  if (!pod) throw new Error('Pod not found');

  let podStatus = pod.desiredStatus;
  if (pod.runtime?.uptimeInSeconds > 0) podStatus = 'RUNNING';
  if (pod.desiredStatus === 'RUNNING' && !pod.runtime) podStatus = 'STARTING';
  if (podStatus === 'EXITED') podStatus = 'STOPPED';

  // ---------------- New: smart port detection ----------------
  if (podStatus === 'RUNNING' && Array.isArray(pod.runtime?.ports)) {
    console.log('↪︎  RunPod port map:', pod.runtime.ports);
    // Prefer privatePort 8020, otherwise first public HTTP port
    const preferred = pod.runtime.ports.find(p => p.isIpPublic && p.type === 'http' && p.privatePort === 8020);
    const anyHttp   = pod.runtime.ports.find(p => p.isIpPublic && p.type === 'http');
    const portObj   = preferred || anyHttp;
    if (portObj) {
      currentPodEndpoint = `https://${RUNPOD_POD_ID}-${portObj.publicPort}.proxy.runpod.net`;
    }
  }
  return podStatus;
}

async function startPod() {
  const { body, statusCode } = await request('https://api.runpod.io/graphql', {
    method: 'POST',
    headers: { Authorization: RUNPOD_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation { podResume(input: {podId: "${RUNPOD_POD_ID}", gpuCount: 1}) { id desiredStatus } }`
    }),
    dispatcher: runpodAgent
  });
  if (statusCode !== 200) throw new Error(`Start pod failed ${statusCode}`);
  const result = await body.json();
  if (result.errors || !result.data?.podResume) throw new Error('Pod resume error');
}

async function waitForPodReady() {
  const timeout = Date.now() + 180_000; // 3 min
  while (Date.now() < timeout) {
    try {
      const status = await getPodStatus();
      if (status === 'RUNNING' && currentPodEndpoint) {
        const { statusCode } = await request(`${currentPodEndpoint}/`, { method: 'GET', dispatcher: runpodAgent });
        if (statusCode && statusCode < 500) return; // Accept 2xx‑4xx
      }
    } catch (e) {
      console.warn('RunPod health probe →', e.message);
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Pod readiness timeout');
}

// ---------------- (The rest of the file is unchanged and omitted for brevity) ----------------


async function stopPod() {
  try {
    const { body } = await request('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: { Authorization: RUNPOD_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation { podStop(input: {podId: "${RUNPOD_POD_ID}"}) { id desiredStatus } }`
      }),
      dispatcher: runpodAgent
    });
    const result = await body.json();
    if (result.data?.podStop) {
      currentPodEndpoint = null;
      podStartTime = null;
    }
  } catch (e) {
    console.error('Stop pod error', e);
  }
}

function schedulePodStop() {
  if (podStopTimer) clearTimeout(podStopTimer);
  podStopTimer = setTimeout(() => {
    if (podStartTime && Date.now() - podStartTime > 5 * 60 * 1000) {
      stopPod();
    }
  }, 5 * 60 * 1000);
}

// ---------------- Google Auth & GCP TTS Fallback ----------------
async function generateAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: SERVICE_ACCOUNT_JSON.token_uri,
    exp: now + 3600,
    iat: now
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const toSign = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.` +
                 `${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const signature = createSign('RSA-SHA256').update(toSign).sign(SERVICE_ACCOUNT_JSON.private_key, 'base64url');

  const { body, statusCode } = await request(SERVICE_ACCOUNT_JSON.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${signature}`,
    dispatcher: tokenAgent
  });
  if (statusCode !== 200) throw new Error(`Token exchange failed ${statusCode}`);
  return (await body.json()).access_token;
}

async function generateAndStreamSpeechGCP(text, voice, res) {
  try {
    const accessToken = await generateAccessToken();
    const reqBody = {
      input: { text },
      voice: { languageCode: 'de-DE', name: 'de-DE-Neural2-B', ssmlGender: 'MALE' },
      audioConfig: { audioEncoding: 'MP3', effectsProfileId: ['telephony-class-application'] }
    };
    const { body, statusCode } = await request('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      dispatcher: tokenAgent
    });
    if (statusCode !== 200) throw new Error(`GCP TTS ${statusCode}`);
    const result = await body.json();
    streamResponse(res, 'audio_chunk', { base64: result.audioContent, format: 'mp3' });
    streamResponse(res, 'tts_engine', { engine: 'gcp' });
  } catch (e) {
    console.error('GCP TTS error', e);
    streamResponse(res, 'audio_chunk', { base64: 'SUQzBAAAAAAAI1RTU0UAAAAPAAADAE1wZWcgZ2VuZXJhdG9yAA==', format: 'mp3' });
    streamResponse(res, 'tts_engine', { engine: 'silent', reason: e.message });
  }
}

export { processAndStreamLLMResponse, generateAndStreamSpeechGCP };
