import express from 'express';
import cors from 'cors';
import voiceAgentHandler from './api/voice-agent.js';

const app = express();
const PORT = 3100;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

console.log('🚀 === VOICE AGENT BYPASS TEST SERVER ===');

// Erweiterte Voice Agent Route mit Bypass-Funktionalität
app.post('/api/voice-agent', async (req, res) => {
  // BYPASS: Wenn STT-Bypass aktiviert ist
  if (req.headers['x-bypass-stt'] === 'true' && req.headers['x-simulated-transcript']) {
    const transcript = req.headers['x-simulated-transcript'];
    const { voice = 'german_m2' } = req.body;
    
    console.log('🎯 STT BYPASS aktiviert:', transcript);
    
    try {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
      });

      // Simuliere Transkript-Response
      res.write(JSON.stringify({ type: 'transcript', data: { text: transcript } }) + '\n');
      
      // Importiere die processAndStreamLLMResponse Funktion
      const { processAndStreamLLMResponse } = await import('./api/voice-agent.js');
      
      // Führe Gemini + XTTS Pipeline aus
      await processAndStreamLLMResponse(transcript, voice, res);
      
    } catch (error) {
      console.error('Bypass Error:', error);
      res.write(JSON.stringify({ type: 'error', data: { message: error.message } }) + '\n');
    } finally {
      if (!res.finished) {
        res.end();
      }
    }
    
    return;
  }
  
  // Standard Voice Agent Handler
  return voiceAgentHandler(req, res);
});

// Gesundheitscheck
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Request Logging
app.use((req, res, next) => {
  console.log(`📞 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🎯 Voice Agent endpoint: http://localhost:${PORT}/api/voice-agent`);
  console.log(`📊 Ready for bypass workflow testing!`);
}); 