# RunPod API Fehleranalyse und Lösung

## 🚨 Hauptproblem identifiziert: UNGÜLTIGER API-KEY

### Testergebnisse

1. **Schema-Tests**: GraphQL "status" Feld existiert nicht → verwendet "desiredStatus"
2. **Authentication-Tests**: API-Key ist ungültig oder abgelaufen
3. **Pod-Tests**: Alle Queries geben `myself: null` zurück

### Kernprobleme

#### 1. Ungültiger/Abgelaufener API-Key ⚠️
```
Status: ❌ KRITISCH
API Response: { "data": { "myself": null } }
```

**Behebung erforderlich:**
- Neuen API-Key in RunPod Console generieren
- Key-Berechtigungen für Pod-Management prüfen
- Environment Variables oder config.js aktualisieren

#### 2. Falsches GraphQL Schema 🔧
```javascript
// ❌ FALSCH (existiert nicht)
query { pod { status } }

// ✅ KORREKT
query { pod { desiredStatus } }
```

### Sofortige Fixes für voice-agent.js

#### Fix 1: Schema-Korrektur
```javascript
// Ersetze in getPodStatus():
query: `query { pod(input: {podId: "${RUNPOD_POD_ID}"}) { 
  id, 
  desiredStatus,  // statt "status"
  runtime { 
    uptimeInSeconds,
    ports { ip, isIpPublic, privatePort, publicPort, type } 
  } 
} }`
```

#### Fix 2: Status-Mapping aktualisieren
```javascript
async function getPodStatus() {
  // ... GraphQL Query ...
  
  if (result.data?.pod) {
    const pod = result.data.pod;
    
    // Status-Mapping korrigieren
    let podStatus = pod.desiredStatus; // statt pod.status
    
    // Pod gilt als "RUNNING" wenn runtime.uptimeInSeconds > 0 existiert
    if (pod.runtime?.uptimeInSeconds > 0) {
      podStatus = 'RUNNING';
    }
    
    return podStatus;
  }
}
```

#### Fix 3: Erweiterte Fehlerbehandlung
```javascript
async function ensurePodRunning() {
  try {
    const podStatus = await getPodStatus();
    
    if (podStatus === 'STOPPED' || podStatus === 'EXITED' || !podStatus) {
      await startPod();
      await waitForPodReady();
    }
  } catch (error) {
    if (error.message.includes('myself": null')) {
      console.error('🔐 RunPod API-Key ungültig! Verwende Google Cloud TTS Fallback');
      currentPodEndpoint = null; // Trigger Fallback
      return;
    }
    throw error;
  }
}
```

### Empfohlene Migrations-Strategie

1. **Sofort**: Neuen RunPod API-Key generieren
2. **Schema**: GraphQL Queries auf korrektes Schema umstellen  
3. **Fallback**: Google Cloud TTS als primären Fallback beibehalten
4. **Monitoring**: Verbesserte Fehlerbehandlung für API-Key-Probleme

### Testbare Lösung

```javascript
// Neuer sicherer Pod-Status-Check
async function validateRunPodConnection() {
  try {
    const { body, statusCode } = await request('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: { 'x-api-key': RUNPOD_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { myself { id } }' })
    });
    
    const result = await body.json();
    
    if (!result.data?.myself?.id) {
      throw new Error('Invalid RunPod API Key');
    }
    
    return true;
  } catch (error) {
    console.error('RunPod connection failed:', error.message);
    return false;
  }
}
```

### Nächste Schritte

1. ✅ Neuen API-Key in RunPod Dashboard generieren
2. ✅ `config.js` oder Environment Variables aktualisieren  
3. ✅ Schema-Fixes in `voice-agent.js` implementieren
4. ✅ Tests erneut ausführen
5. ✅ XTTS-Integration validieren 