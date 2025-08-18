import React from 'react';
import { ContinuousVoiceChat } from './components/ContinuousVoiceChat';

export const VoiceChatTest: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Kontinuierlicher Voice Agent
        </h1>
        <ContinuousVoiceChat />
        
        <div className="mt-8 max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Kontinuierlicher Gesprächsmodus:</h2>
            <ol className="list-decimal list-inside space-y-2 text-gray-700">
              <li>Klicken Sie auf "Gespräch starten" (grüner Telefon-Button)</li>
              <li>Gewähren Sie Mikrofonzugriff wenn gefragt</li>
              <li>Sprechen Sie einfach - das System hört automatisch zu</li>
              <li>Voice Activity Detection erkennt automatisch wann Sie sprechen</li>
              <li>Nach 1,5s Stille wird die Aufnahme automatisch gestoppt</li>
              <li>KI antwortet automatisch und das System hört wieder zu</li>
              <li>Führen Sie ein natürliches Gespräch ohne Klicken!</li>
              <li>Klicken Sie "Gespräch beenden" um zu stoppen</li>
            </ol>
            
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">Features:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• <strong>Voice Activity Detection:</strong> Automatische Spracherkennung</li>
                <li>• <strong>Turn-Taking:</strong> Natürlicher Gesprächsfluss</li>
                <li>• <strong>Audio-Level Visualizer:</strong> Zeigt Ihre Lautstärke</li>
                <li>• <strong>Status-Anzeigen:</strong> Hört zu / Verarbeitet / Spricht</li>
                <li>• <strong>Gesprächshistorie:</strong> Letzten 5 Austausche</li>
                <li>• <strong>Auto-Reconnect:</strong> Stabile Verbindung auf Fly.io</li>
              </ul>
            </div>
            
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