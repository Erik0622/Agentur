# 📞 Twilio Integration für Vocaris AI Voice Agent

## Übersicht

Die Twilio-Integration ermöglicht es, eingehende Telefonnummern direkt mit dem Vocaris AI Voice Agent zu verbinden. Anrufer können über eine echte Telefonnummer mit der KI sprechen.

## 🔧 Setup-Schritte

### 1. Twilio Console Konfiguration

1. **Telefonnummer kaufen** (bereits erledigt ✅)
2. **Webhook URL konfigurieren**:
   - Gehen Sie zur Twilio Console
   - Wählen Sie Ihre Telefonnummer
   - Feld **"A call comes in"** → **Webhook**
   - URL: `https://agentur.fly.dev/twilio/incoming`
   - Methode: **HTTP POST**

### 2. Endpoints

| Endpoint | Typ | Beschreibung |
|----------|-----|--------------|
| `POST /twilio/incoming` | **Webhook** | Twilio ruft diese URL bei eingehenden Anrufen auf |
| `GET /twilio/incoming` | **Health Check** | Status-Check für die Integration |
| `wss://agentur.fly.dev` | **WebSocket** | Der eigentliche Voice Agent |

## 🔄 Ablauf

1. **Anruf** kommt bei Twilio rein
2. **Twilio** ruft `https://agentur.fly.dev/twilio/incoming` auf
3. **Server** antwortet mit TwiML XML:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <Response>
     <Connect>
       <Stream url="wss://agentur.fly.dev?source=twilio" track="both_tracks"/>
     </Connect>
   </Response>
   ```
4. **Twilio** baut Media Stream auf → verbindet sich mit WebSocket
5. **Voice Agent** arbeitet in Echtzeit

## 🎯 Features

- ✅ **Echte Telefonnummer** für Anrufe
- ✅ **Echtzeit Audio-Streaming** (bidirektional)
- ✅ **Automatische Twilio-Erkennung** (`?source=twilio`)
- ✅ **Separate Logging** für Twilio vs. Web Clients
- ✅ **Gemini Live API Integration** (gleicher Voice Agent)

## 🧪 Testing

### Health Check
```bash
curl https://agentur.fly.dev/twilio/incoming
```

### Webhook Test (simuliert Twilio)
```bash
curl -X POST https://agentur.fly.dev/twilio/incoming \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B1234567890&To=%2B0987654321"
```

## 📋 Audio-Format

- **Twilio → Gemini**: µ-law (8kHz) → PCM (konvertiert)
- **Gemini → Twilio**: PCM → µ-law (konvertiert)
- **Track Mode**: `both_tracks` (eingehend + ausgehend)

## 🔐 Sicherheit

- **Query Parameter**: `?source=twilio` zur Identifikation
- **Optional**: Token-basierte Authentifizierung möglich
- **Whitelist**: Nur Twilio IPs erlauben (optional)

## 📞 Produktive Nutzung

Nach dem Deployment können Kunden:
1. **Ihre Twilio-Telefonnummer anrufen**
2. **Direkt mit dem Voice Agent sprechen**
3. **Alle Features nutzen** (Terminbuchung, etc.)

## 🚀 Deployment Status

✅ **Server Code**: Implementiert in `gemini-live-server.js`
✅ **Endpoints**: `/twilio/incoming` verfügbar
✅ **WebSocket**: Twilio-kompatibel erweitert
⏳ **Twilio Config**: Manuell in Console einrichten

## 💡 Nächste Schritte

1. **Twilio Console** konfigurieren (siehe Setup-Schritte)
2. **Test-Anruf** durchführen
3. **Logs überwachen** in Fly.io Dashboard
4. **Performance optimieren** falls nötig

---

**Status**: ✅ **Integration Ready**
**URL**: https://agentur.fly.dev/twilio/incoming
**Voice Agent**: wss://agentur.fly.dev
