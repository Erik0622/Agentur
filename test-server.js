// SIMPLE HTTP TEST SERVER: Voice Agent REST API
// Hosts the optimized voice-agent.js as HTTP endpoint for workflow testing

import express from 'express';
import cors from 'cors';
import handler from './api/voice-agent.js';

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // For large audio files
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Voice Agent API endpoint
app.all('/api/voice-agent', async (req, res) => {
  try {
    console.log(`📞 ${req.method} /api/voice-agent - ${new Date().toISOString()}`);
    
    // Call our optimized voice agent handler
    await handler(req, res);
    
  } catch (error) {
    console.error('❌ Voice Agent Handler Error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
      });
    }
  }
});

// Catch-all for other routes
app.all('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 === VOICE AGENT TEST SERVER ===');
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`🎯 Voice Agent endpoint: http://localhost:${PORT}/api/voice-agent`);
  console.log('📊 Ready for workflow testing!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Server shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Server shutting down gracefully...');
  process.exit(0);
}); 