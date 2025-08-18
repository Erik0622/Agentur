// Voice Agent Configuration
// WICHTIG: Fügen Sie hier Ihre echten API-Keys ein!

export const config = {
  // Deepgram API Key für Speech-to-Text
  // Holen Sie sich einen kostenlosen API-Key: https://console.deepgram.com/
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY || "your_deepgram_api_key_here",
  
  // Azure Speech Services für Text-to-Speech
  // Erstellen Sie einen kostenlosen Account: https://azure.microsoft.com/de-de/services/cognitive-services/speech-services/
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY || "your_azure_speech_key_here",
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || "germanywestcentral",
  
  // Google Cloud Service Account für Gemini 2.5 Flash-Lite
  // Erstellen Sie ein Service Account: https://console.cloud.google.com/
  SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? 
    JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) : {
      "type": "service_account",
      "project_id": "your-project-id",
      "private_key_id": "your-private-key-id", 
      "private_key": "-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----\n",
      "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
      "client_id": "your-client-id",
      "auth_uri": "https://accounts.google.com/o/oauth2/auth",
      "token_uri": "https://oauth2.googleapis.com/token",
      "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
      "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/your-service-account%40your-project.iam.gserviceaccount.com",
      "universe_domain": "googleapis.com"
    },
  
  // Gemini Region
  GEMINI_REGION: process.env.GEMINI_REGION || "us-central1"
};

// HINWEIS: 
// 1. Ersetzen Sie die Platzhalter durch Ihre echten API-Keys
// 2. Alternativ setzen Sie die Umgebungsvariablen in Ihrem Hosting-Provider
// 3. Für lokale Entwicklung können Sie eine .env Datei verwenden