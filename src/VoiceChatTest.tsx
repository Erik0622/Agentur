import React from 'react';
import { VoiceChat } from './components/VoiceChat';

export const VoiceChatTest: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Voice Agent Test
        </h1>
        <VoiceChat />
        
        <div className="mt-8 max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Anleitung:</h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Stellen Sie sicher, dass die WebSocket-Verbindung hergestellt ist (grüner Punkt)</li>
              <li>Klicken Sie auf das Mikrofon-Symbol um die Aufnahme zu starten</li>
              <li>Sprechen Sie deutlich ins Mikrofon</li>
              <li>Klicken Sie erneut um die Aufnahme zu beenden</li>
              <li>Warten Sie auf die Transkription und KI-Antwort</li>
              <li>Die Audio-Antwort wird automatisch abgespielt (falls aktiviert)</li>
            </ol>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Debug-Informationen:</h3>
              <p className="text-sm text-blue-700">
                Öffnen Sie die Browser-Entwicklertools (F12) und schauen Sie in die Konsole 
                für detaillierte Logs der WebSocket-Verbindung und Audio-Verarbeitung.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceChatTest;