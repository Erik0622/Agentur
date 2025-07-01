# KI-Service Pro - Automatisierter Kundenservice für Restaurants

Eine moderne, professionelle Website für eine KI-Agentur, die telefonischen Kundenservice für Restaurants automatisiert.

## 🎯 Features

- **Modernes, minimalistisches Design** mit cleanen Animationen
- **Überzeugende Verkaufsargumente** basierend auf echten Problemen der Gastronomie
- **Responsive Design** für alle Geräte
- **Smooth Animationen** mit Framer Motion
- **Performance-optimiert** mit Vite und React
- **Integriertes Buchungssystem** mit intelligenter Terminverwaltung
  - Mo-Fr: 7:00-15:00 Uhr verfügbar
  - Sa: 7:00-13:00 Uhr verfügbar
  - So: Geschlossen
  - Automatische Speicherung gebuchter Termine
  - Verhindert Doppelbuchungen

## 📊 Hauptargumente der Website

### Das Problem:
- **30% verlorene Kunden** durch Nichterreichbarkeit
- Überlastete Telefonleitungen
- Lange Wartezeiten
- Gestresstes Personal

### Die Lösung:
- **85% Kosteneinsparung** im Kundenservice
- **24/7 Verfügbarkeit** ohne Unterbrechung
- Automatische Buchungsabwicklung
- Mehrsprachiger Support
- Intelligente Anrufweiterleitung
- **Integriertes Buchungssystem** für Beratungstermine

## 🚀 Technologie-Stack

- **Frontend:** React 18 + TypeScript
- **Styling:** Tailwind CSS
- **Animationen:** Framer Motion
- **Icons:** Lucide React
- **Build Tool:** Vite
- **Deployment-ready:** Optimiert für Produktion

## 🛠 Installation & Entwicklung

```bash
# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev

# Für Produktion bauen
npm run build

# Produktion-Preview
npm run preview
```

---

# KI-Agentur Voice Agent Backend

Ein hochperformanter Voice-Agent für Restaurants mit End-to-End-Sprachverarbeitung.

## 🚀 Tech Stack

- **Speech-to-Text:** Deepgram Nova-2 (Deutsch)
- **LLM:** Google Gemini 1.5 Flash (Streaming)  
- **Text-to-Speech:** smallest.ai (Deutsche Stimme)
- **Backend:** Node.js + Express + WebSocket
- **Performance:** ~500ms Gesamtlatenz

## 📊 Performance & Kosten

### Latenz (typisch):
- **STT (Deepgram):** 100-300ms
- **LLM First Token:** 200-500ms  
- **TTS (smallest.ai):** 100-200ms
- **🎯 Gesamt:** 400-1000ms

### Kosten pro Gespräch:
- **Deepgram:** ~$0.0059/min
- **Gemini Flash:** ~$0.001/1K tokens
- **smallest.ai:** ~$0.002/1K chars
- **🎯 Gesamt:** ~€0.02/Gespräch

## 🛠 Installation

```bash
# Dependencies installieren
npm install

# Environment konfigurieren
cp env.example .env
# API Keys in .env eintragen

# Server starten
npm run dev
```

## 🔧 API Keys benötigt

1. **Deepgram:** https://console.deepgram.com
2. **Google Gemini:** https://ai.google.dev
3. **smallest.ai:** https://smallest.ai

## 🌐 API Endpoints

### WebSocket (Echtzeit)
```
ws://localhost:3001
```

### REST API
```bash
# Voice Processing
POST /api/voice
Content-Type: multipart/form-data
File: audio (max 10MB)

# Health Check
GET /health

# Kosten & Performance
GET /api/costs
```

## 📱 Frontend Integration

```javascript
// WebSocket Verbindung
const ws = new WebSocket('ws://localhost:3001');

// Audio senden
ws.send(JSON.stringify({
  type: 'voice_input',
  audio: base64AudioData
}));

// Antworten empfangen
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'voice_response') {
    // Audio abspielen
    const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
    audio.play();
  }
};
```

## 🎯 Restaurant Kontext

Der Agent ist speziell für Restaurants optimiert:
- Tischreservierungen
- Menü-Anfragen  
- Öffnungszeiten
- Allergien-Beratung
- Lieferservice

## 🔄 Workflow

1. **Audio Input** → Frontend sendet Audio
2. **STT** → Deepgram transkribiert (Deutsch)
3. **LLM** → Gemini generiert Antwort (Streaming)
4. **TTS** → smallest.ai synthetisiert Sprache
5. **Audio Output** → Frontend spielt Antwort ab

## 📈 Monitoring

Jede Session wird mit detaillierten Metriken geloggt:
```javascript
{
  sessionId: "uuid",
  sttLatency: 150,
  llmFirstToken: 300, 
  llmLatency: 450,
  ttsLatency: 120,
  totalLatency: 720
}
```

## 🚀 Deployment

```bash
# Production Build
npm start

# Docker (optional)
docker build -t voice-agent .
docker run -p 3001:3001 voice-agent
```

## ✅ Warum dieser Stack?

- **Deepgram:** Beste deutsche STT, niedrige Latenz
- **Gemini Flash:** Extrem schnell, günstig, Streaming
- **smallest.ai:** Spezialisiert auf niedrige Latenz TTS
- **Gesamt:** Professionell für Restaurant-Use-Case
