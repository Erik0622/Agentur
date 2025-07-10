// Voice Agent Configuration Example
// Copy this file to config.js and add your real API keys

export const config = {
  // Deepgram API Key for Speech-to-Text
  DEEPGRAM_API_KEY: "your_deepgram_api_key_here",
  
  // RunPod API Configuration for XTTS v2.0.3
  // IMPORTANT: Generate new API key in RunPod Dashboard > API Keys
  // Format should be: "rpa_XXXXXXXXXXXXXXXXXXXXXXXXXX"
  // If authentication fails, check: https://www.runpod.io/console/user/api-keys
  RUNPOD_API_KEY: "your_runpod_api_key_here",
  
  // RunPod Pod ID for XTTS Container
  // Find this in RunPod Dashboard > Pods > Pod Details
  RUNPOD_POD_ID: "your_runpod_pod_id_here",
  
  // Google Cloud Service Account for Gemini 2.5 Flash-Lite
  SERVICE_ACCOUNT_JSON: {
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
  }
};

// Alternative: Use environment variables
// export const config = {
//   DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
//   RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
//   RUNPOD_POD_ID: process.env.RUNPOD_POD_ID,
//   SERVICE_ACCOUNT_JSON: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}')
// }; 