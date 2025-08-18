import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import WebSocketManager from '../utils/WebSocketManager';

interface VoiceResponse {
  type: string;
  data: any;
}

export const VoiceChat: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // WebSocket URL bestimmen
  const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

  // WebSocket Verbindung aufbauen
  const reconnectDelayRef = useRef<number>(2000);
  const connectWebSocket = useCallback(async () => {
    const manager = WebSocketManager.getInstance();
    // Bereits verbunden?
    if (manager.isConnected()) {
      wsRef.current = manager.getActiveConnection();
      setIsConnected(true);
      return;
    }
    if (manager.isConnecting()) {
      return;
    }
    try {
      console.log('🔗 Connecting to WebSocket via Manager:', WS_URL);
      const ws = await manager.connect(WS_URL);
      wsRef.current = ws;
      reconnectDelayRef.current = 2000; // reset backoff

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data: VoiceResponse = JSON.parse(event.data);
          console.log('📥 Received:', data.type, data.data);
  
          switch (data.type) {
            case 'connected':
              console.log('🔗 Connection confirmed');
              break;
            case 'transcript':
              setTranscript(data.data.text || '');
              break;
            case 'llm_chunk':
              setResponse(prev => prev + (data.data.text || ''));
              break;
            case 'llm_response':
              setResponse(data.data.text || '');
              break;
            case 'audio_header':
              console.log('🔊 Audio header received:', data.data.mime);
              break;
            case 'audio_chunk':
              if (audioEnabled && data.data.base64) {
                playAudioChunk(data.data.base64, data.data.format);
              }
              break;
            case 'tts_engine':
              console.log('🔊 TTS Engine:', data.data.engine);
              break;
            case 'end':
              console.log('✅ Processing complete');
              setIsProcessing(false);
              break;
            case 'error':
              console.error('❌ Server error:', data.data.message);
              setError(data.data.message);
              setIsProcessing(false);
              break;
          }
        } catch (e) {
          console.warn('⚠️ Parse error:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        if (event.code !== 1000) {
          // Exponential Backoff
          const delay = Math.min(reconnectDelayRef.current, 30000);
          console.log(`🔄 Reconnect in ${delay}ms`);
          setTimeout(connectWebSocket, delay);
          reconnectDelayRef.current = Math.min(delay * 2, 30000);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('WebSocket Verbindungsfehler');
        setIsConnected(false);
      };
    } catch (error) {
      console.error('❌ Manager connect failed:', error);
      setIsConnected(false);
      const delay = Math.min(reconnectDelayRef.current, 30000);
      setTimeout(connectWebSocket, delay);
      reconnectDelayRef.current = Math.min(delay * 2, 30000);
    }
  }, [WS_URL, audioEnabled]);

  // Audio Chunk abspielen
  const playAudioChunk = (base64Audio: string, format: string) => {
    if (!audioEnabled) return;

    try {
      const audioData = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
      const audioBlob = new Blob([audioData], { type: `audio/${format}` });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.play().catch(e => console.warn('Audio play failed:', e));
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  };

  // Recording starten
  const startRecording = async () => {
    if (!isConnected) {
      setError('WebSocket nicht verbunden');
      return;
    }

    try {
      setIsRecording(true);
      setTranscript('');
      setResponse('');
      setError(null);
      setIsProcessing(true);
      audioChunksRef.current = [];

      // Mikrofonzugriff
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;

      // MediaRecorder mit Opus/WebM
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 48000
      });

      mediaRecorderRef.current = mediaRecorder;

      // Audio-Start Signal senden
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start_audio' }));
      }

      // Kontinuierlich Audio-Chunks senden
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(event.data);
          }
        }
      };

      mediaRecorder.start(100);
      console.log('🎤 Recording started');

    } catch (error) {
      console.error('❌ Recording start failed:', error);
      setError('Mikrofonzugriff fehlgeschlagen');
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  // Recording stoppen
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_audio' }));
    }

    setIsRecording(false);
    console.log('🎤 Recording stopped');
  };

  // WebSocket beim Mount verbinden
  useEffect(() => {
    connectWebSocket();
    return () => {
      const manager = WebSocketManager.getInstance();
      manager.disconnect();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [connectWebSocket]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Voice Chat</h2>
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className={`flex items-center gap-2 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-sm font-medium">
              {isConnected ? 'Verbunden' : 'Nicht verbunden'}
            </span>
          </div>
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2 rounded-full ${audioEnabled ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}
            title={audioEnabled ? 'Audio deaktivieren' : 'Audio aktivieren'}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      <div className="text-center mb-6">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!isConnected || isProcessing}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg scale-110'
              : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md'
          } ${(!isConnected || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isRecording ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
        <p className="text-sm text-gray-600 mt-2">
          {isRecording ? 'Aufnahme läuft...' : isProcessing ? 'Verarbeitung...' : 'Klicken zum Sprechen'}
        </p>
      </div>

      {transcript && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-blue-800 mb-2">Sie haben gesagt:</h3>
          <p className="text-blue-700">{transcript}</p>
        </div>
      )}

      {response && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-semibold text-green-800 mb-2">Antwort:</h3>
          <p className="text-green-700">{response}</p>
        </div>
      )}
    </div>
  );
};