# 🎙️ Voice Agent - KI-Agentur

Ein hochleistungsfähiger Voice Agent mit minimaler Latenz, der drei APIs für die optimale Spracherkennung, KI-Antworten und Text-to-Speech kombiniert.

## 🚀 Features

### ⚡ **Ultra-niedrige Latenz**
- **Streaming in Echtzeit** für alle APIs
- **Parallele Verarbeitung** von Audio und Text
- **Optimierte Audio-Codecs** (WebM/Opus, 16kHz)
- **Chunked Audio Processing** (100ms Intervalle)

### 🔧 **Vollständig integrierte APIs**

#### 🎤 **Deepgram STT** (Speech-to-Text)
- **Deutsche Spracherkennung** mit Nova-2 Modell
- **Live-Transkription** mit Interim Results
- **Voice Activity Detection** für automatische Satzende-Erkennung
- **Smart Formatting** und Interpunktion

#### 🤖 **Google Gemini 2.0 Flash** (KI-Chat)
- **Ultraschnelle Antworten** mit Streaming
- **Restaurant-Assistent** für Buchungen und Anfragen
- **Kurze, natürliche Antworten** (max. 20 Wörter)
- **Conversation Memory** für Kontext

#### 🔊 **Smallest.ai TTS** (Text-to-Speech)
- **Deutsche Sprachsynthese** mit Nova-Stimme
- **MP3-Audio-Output** für beste Qualität
- **Optimierte Geschwindigkeit** (1.1x Speed)

## 🏗️ **Architektur**

```
┌─────────────────┐    WebSocket     ┌─────────────────┐
│   Frontend      │ ◄──────────────► │   Voice Agent   │
│   (React/Vite)  │                  │   Server        │
└─────────────────┘                  └─────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
            ┌───────▼────────┐    ┌─────────▼────────┐    ┌─────────▼─────────┐
            │   Deepgram     │    │   Gemini 2.0     │    │   Smallest.ai    │
            │   STT API      │    │   Flash API      │    │   TTS API        │
            │   (WebSocket)  │    │   (Streaming)    │    │   (REST)         │
            └────────────────┘    └──────────────────┘    └───────────────────┘
```

## 📦 **Installation & Setup**

### 1. **Dependencies installieren**
```bash
# Root (Frontend)
npm install

# Server (Backend)
cd server
npm install
```

### 2. **APIs konfigurieren**
Die API-Keys sind bereits in `server/server.js` hinterlegt:
- ✅ **Deepgram**: `3e69806feb52b90f01f2e47f9e778fc87b6d811a`
- ✅ **Gemini**: `AIzaSyDCqBRhKqrwXGfIbfmQVj3nRbQLDFsGqEI`
- ✅ **Smallest.ai**: `sk-2ad79c9f-cf37-44b3-87dd-0b0b8eb66e5b`

### 3. **Server starten**
```bash
# Terminal 1: Voice Agent Server
cd server
npm start
# Server läuft auf: http://localhost:3001

# Terminal 2: Frontend
npm run dev  
# Frontend läuft auf: http://localhost:5173
```

## 🎯 **Verwendung**

### **1. Voice Agent aktivieren**
1. Öffne `http://localhost:5173`
2. Scrolle zum Voice Agent Bereich
3. Klicke auf das **Mikrofon-Symbol** 🎤
4. **Spreche auf Deutsch** deine Anfrage
5. Klicke **Stop** zum Beenden der Aufnahme

### **2. Beispiel-Dialoge**

#### **Tischreservierung**
```
👤 Benutzer: "Hallo, ich möchte einen Tisch für morgen Abend reservieren."
🤖 Assistant: "Gerne! Für wie viele Personen und um welche Uhrzeit?"
👤 Benutzer: "Für 4 Personen um 19:00 Uhr."
🤖 Assistant: "Perfekt! Auf welchen Namen soll ich reservieren?"
```

#### **Öffnungszeiten**
```
👤 Benutzer: "Wann habt ihr geöffnet?"
🤖 Assistant: "Montag bis Freitag 17-23 Uhr, Samstag 17-24 Uhr, Sonntag 17-22 Uhr."
```

## 🔍 **Monitoring & Health Checks**

### **Server Status**
```bash
# Health Check
curl http://localhost:3001/health

# API Status Check  
curl http://localhost:3001/api/status
```

### **Response Beispiel**
```json
{
  "status": "healthy",
  "uptime": 3600,
  "clients": 1,
  "services": {
    "deepgram": "✅ Speech-to-Text",
    "gemini": "✅ AI Chat (2.0-flash-exp)",
    "smallest_ai": "✅ Text-to-Speech"
  },
  "version": "2.0.0"
}
```

## ⚡ **Performance Optimierungen**

### **Audio-Verarbeitung**
- **Chunk-Size**: 100ms für Live-Streaming
- **Sample-Rate**: 16kHz (optimiert für Deepgram)
- **Codec**: WebM/Opus (beste Kompression)
- **Kanäle**: Mono (reduzierte Bandbreite)

### **KI-Antworten**
- **Max Tokens**: 60 (kurze Antworten)
- **Temperature**: 0.3 (konsistente Antworten)
- **Streaming**: Chunk-basierte Ausgabe
- **Context Window**: Letzte 8 Nachrichten

### **Text-to-Speech**
- **Speed**: 1.1x (leicht beschleunigt)
- **Format**: MP3 (beste Qualität/Größe-Verhältnis)
- **Voice**: Nova (natürliche deutsche Stimme)

## 🛠️ **Latenz-Metriken**

Der Voice Agent misst automatisch alle Latenz-Komponenten:

```javascript
{
  "metrics": {
    "gemini_time": 450,      // KI-Verarbeitung in ms
    "tts_time": 800,         // Sprachgenerierung in ms  
    "total_time": 1250,      // Gesamtzeit in ms
    "audio_size": 15360      // Audio-Größe in Bytes
  }
}
```

### **Typische Latenz-Werte**
- 🎤 **Deepgram STT**: ~200-400ms
- 🤖 **Gemini 2.0 Flash**: ~300-600ms  
- 🔊 **Smallest.ai TTS**: ~500-1000ms
- ⚡ **Gesamt-Latenz**: ~1-2 Sekunden

## 🔧 **Erweiterte Konfiguration**

### **Restaurant-Kontext anpassen**
In `server/server.js` → `processWithGemini()`:
```javascript
const systemPrompt = `Du bist ein freundlicher Telefonassistent für das Restaurant "IHR_NAME". 

Öffnungszeiten:
• Montag-Freitag: 17:00-23:00 Uhr
• Samstag: 17:00-24:00 Uhr  
• Sonntag: 17:00-22:00 Uhr

// Weitere Anpassungen...
`;
```

### **Audio-Qualität optimieren**
```javascript
// Höhere Qualität (mehr Latenz)
sampleRate: 22050,    // Statt 16000
channelCount: 2       // Stereo statt Mono

// Niedrigere Latenz (weniger Qualität)  
sampleRate: 8000,     // Telefon-Qualität
```

## 📊 **Architektur-Details**

### **WebSocket Message-Types**

#### **Frontend → Server**
```javascript
// Audio-Aufnahme starten
{ type: 'start_recording' }

// Audio-Daten senden
{ type: 'audio_data', audio: 'base64_data' }

// Audio-Aufnahme stoppen  
{ type: 'stop_recording' }

// Gespräch zurücksetzen
{ type: 'reset_conversation' }
```

#### **Server → Frontend**
```javascript
// Live-Transkription
{ type: 'transcript', text: '...', isFinal: false }

// KI-Antwort Chunks (Streaming)
{ type: 'llm_chunk', text: '...', isFirst: true }

// Vollständige Antwort mit Audio
{ 
  type: 'voice_response',
  transcript: '...',
  response: '...',
  audio: 'base64_mp3',
  metrics: { ... }
}

// Status-Updates
{ type: 'status', message: 'Spracherkennung bereit' }
```

## 🚨 **Troubleshooting**

### **Häufige Probleme**

#### **Mikrofon-Zugriff verweigert**
- ✅ Browser-Berechtigungen überprüfen
- ✅ HTTPS verwenden (für Production)
- ✅ Mikrofon-Hardware testen

#### **WebSocket-Verbindung fehlschlägt**
```bash
# Server Status prüfen
curl http://localhost:3001/health

# Ports überprüfen
netstat -an | findstr 3001
```

#### **API-Fehler**
- ✅ API-Keys validieren
- ✅ Rate Limits überprüfen  
- ✅ Netzwerk-Konnektivität testen

#### **Audio-Probleme**
- ✅ Browser-Kompatibilität (Chrome/Edge empfohlen)
- ✅ Audio-Codec Support (WebM/Opus)
- ✅ Bandbreite überprüfen

## 🌟 **Nächste Schritte**

### **Production Deployment**
1. **Umgebungsvariablen** für API-Keys verwenden
2. **HTTPS/WSS** für sichere Verbindungen
3. **Load Balancing** für mehrere Clients
4. **Logging & Monitoring** implementieren

### **Feature-Erweiterungen**
- 🎭 **Mehrere Sprachen** (EN, FR, ES)
- 🎨 **Voice Cloning** für personalisierte Stimmen
- 📊 **Analytics Dashboard** für Gespräche
- 🔐 **User Authentication** für personalisierte Erfahrungen

## 📞 **Support**

Bei Fragen oder Problemen:
- 📧 **E-Mail**: support@ki-agentur.de
- 💬 **GitHub Issues**: [Repository](https://github.com/Erik0622/Agentur)
- 📚 **Dokumentation**: Diese README

---

**⚡ Entwickelt für minimale Latenz und maximale Benutzererfahrung! 🚀** 