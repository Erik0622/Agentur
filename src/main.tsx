import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import VoiceChatTest from './VoiceChatTest.tsx'
import './index.css'

// Für Testing: VoiceChat-Test laden wenn ?test=voice in URL
const urlParams = new URLSearchParams(window.location.search);
const testMode = urlParams.get('test');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {testMode === 'voice' ? <VoiceChatTest /> : <App />}
  </React.StrictMode>,
) 