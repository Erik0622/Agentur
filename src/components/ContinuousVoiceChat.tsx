import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Volume2, VolumeX, Phone, PhoneOff } from 'lucide-react';
import WebSocketManager from '../utils/WebSocketManager';

interface VoiceResponse {
  type: string;
  data: any;
}

interface VADConfig {
  threshold: number;
  minSpeechDuration: number;
  maxSilenceDuration: number;
  sampleRate: number;
}

export const ContinuousVoiceChat: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Array<{user: string, ai: string, timestamp: Date}>>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('Puck');
  const availableVoices = [
    { id: 'Puck', label: 'Puck (neutral, klar)' },
    { id: 'Charon', label: 'Charon (männlich, warm)' },
    { id: 'Kore', label: 'Kore (weiblich, freundlich)' }
  ];

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // legacy, ungenutzt nach PCM-Umstellung
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const speechTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const audioLevelRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // ULTRA-LOW LATENCY VAD Configuration
  const vadConfig: VADConfig = {
    threshold: 0.008, // Noch sensibler für kontinuierlichen Modus
    minSpeechDuration: 200, // schnelleres Triggern
    maxSilenceDuration: 2000, // FIX: Längere Pause erlauben (2s statt 700ms)
    sampleRate: 48000
  };

  // WebSocket URL für Fly.io
  const WS_URL = process.env.NODE_ENV === 'production' 
    ? `wss://${window.location.host}` 
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

  // WebSocket Verbindung über Manager (Single Connection)
  const connectWebSocket = useCallback(async () => {
    const manager = WebSocketManager.getInstance();
    
    // Prüfe ob bereits verbunden oder verbindet
    if (manager.isConnected()) {
      console.log('🔗 [CONTINUOUS] WebSocket Manager: Bereits verbunden');
      const existingWs = manager.getActiveConnection();
      console.log('🔍 [CONTINUOUS] Existing WebSocket URL:', existingWs?.url);
      console.log('🔍 [CONTINUOUS] Existing WebSocket readyState:', existingWs?.readyState);
      wsRef.current = existingWs;
      setIsConnected(true);
      return;
    }
    
    if (manager.isConnecting()) {
      console.log('🔗 [CONTINUOUS] WebSocket Manager: Verbindung läuft bereits');
      return;
    }

    try {
      console.log('🔗 [CONTINUOUS] WebSocket Manager: Starte neue Verbindung zu:', WS_URL);
      const ws = await manager.connect(WS_URL);
      console.log('🔍 [CONTINUOUS] New WebSocket created:', ws.url);
      console.log('🔍 [CONTINUOUS] New WebSocket readyState:', ws.readyState);
      wsRef.current = ws;

      // Event Listeners setzen/überschreiben
      ws.onopen = () => {
        console.log('✅ WebSocket connected via Manager');
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data: VoiceResponse = JSON.parse(event.data);
          console.log('📥 Received:', data.type);

          switch (data.type) {
            case 'connected':
              console.log('🔗 Connection confirmed');
              break;
            case 'transcript':
              const transcriptText = data.data.text || '';
              setTranscript(transcriptText);
              if (transcriptText.trim()) {
                setIsListening(false);
                setIsProcessing(true);
              }
              break;
            case 'llm_chunk':
              setResponse(prev => prev + (data.data.text || ''));
              break;
            case 'llm_response':
              const aiResponse = data.data.text || '';
              setResponse(aiResponse);
              
              // Conversation History aktualisieren
              if (transcript.trim() && aiResponse.trim()) {
                setConversationHistory(prev => [...prev, {
                  user: transcript.trim(),
                  ai: aiResponse.trim(),
                  timestamp: new Date()
                }]);
              }
              break;
            case 'audio_header':
              console.log('🔊 Audio header received');
              setIsSpeaking(true);
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
              setIsSpeaking(false);
              
              // ULTRA-LOW LATENCY: Sofort wieder zuhören
              setTimeout(() => {
                if (isActive && !isProcessing) {
                  startListening();
                }
              }, 200); // Viel kürzer: 200ms statt 1000ms
              break;
            case 'error':
              console.error('❌ Server error:', data.data.message);
              setError(data.data.message);
              setIsProcessing(false);
              setIsSpeaking(false);
              break;
          }
        } catch (e) {
          console.warn('⚠️ Parse error:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('🔌 WebSocket closed via Manager:', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;
        
        // Auto-reconnect für Fly.io nur wenn aktiv und nicht manuell geschlossen
        if (event.code !== 1000 && event.code !== 1001 && isActive) {
          console.log('🔄 Auto-reconnect in 5s...');
          // Clear existing reconnect timeout
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(() => {
            // Nochmal prüfen ob wir noch aktiv sind
            if (isActive && !manager.isConnected()) {
              connectWebSocket();
            }
            reconnectTimeoutRef.current = null;
          }, 5000); // Längere Wartezeit für Fly.io
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error via Manager:', error);
        setError('WebSocket Verbindungsfehler');
        setIsConnected(false);
      };
      
      setIsConnected(true);
      setError(null);
    } catch (error) {
      console.error('❌ WebSocket Manager Verbindungsfehler:', error);
      setError(`Verbindungsfehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      setIsConnected(false);
    }
  }, [WS_URL, audioEnabled, isActive, isProcessing]);

  // Audio Playback
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

  // PCM Helpers
  function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  // Voice Activity Detection
  const analyzeAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isActive || isSpeaking) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    // RMS berechnen
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length) / 255;
    audioLevelRef.current = rms;

    const isSpeechDetected = rms > vadConfig.threshold;

    if (isSpeechDetected) {
      // Sprache erkannt
      if (!isRecordingRef.current && !isProcessing) {
        // Warte auf Mindest-Sprechdauer
        if (!speechTimerRef.current) {
          speechTimerRef.current = setTimeout(() => {
            if (audioLevelRef.current > vadConfig.threshold) {
              startRecording();
            }
            speechTimerRef.current = null;
          }, vadConfig.minSpeechDuration);
        }
      }

      // Reset silence timer
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    } else {
      // Stille erkannt
      if (speechTimerRef.current) {
        clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
      }

      if (isRecordingRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          stopRecording();
          silenceTimerRef.current = null;
        }, vadConfig.maxSilenceDuration);
      }
    }
  }, [isActive, isSpeaking, isProcessing]);

  // Audio Setup
  const setupAudio = async () => {
    try {
      console.log('🎤 Setting up audio...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: vadConfig.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      streamRef.current = stream;
      console.log('✅ MediaStream obtained:', stream.getTracks().length, 'tracks');

      // AudioContext für VAD
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      
      // Resume AudioContext falls suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('✅ AudioContext resumed');
      }

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      
      analyserRef.current = analyser;

      // VAD Loop starten
      vadIntervalRef.current = setInterval(analyzeAudioLevel, 50); // 20fps

      console.log('✅ Audio setup complete - AudioContext state:', audioContext.state);
      
      // Hinweis: Für Gemini Live senden wir PCM 16kHz – kein MediaRecorder nötig

      return true;
    } catch (error) {
      console.error('❌ Audio setup failed:', error);
      setError(`Mikrofonzugriff fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  // PCM‑Recording starten (16kHz, 16‑bit, mono)
  const startRecording = () => {
    if (!streamRef.current || isRecordingRef.current || isProcessing || isSpeaking) return;

    try {
      console.log('🎤 Starting PCM recording (16kHz)...');
      isRecordingRef.current = true;
      setIsListening(true);
      setTranscript('');
      setResponse('');

      // Audio‑Start Signal mit Voice
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start_audio', voice: selectedVoice }));
      } else {
        console.error('❌ [CONTINUOUS] WebSocket not ready for start_audio');
      }

      // ScriptProcessor erzeugen und PCM Frames senden
      const ac = audioContextRef.current!;
      const source = ac.createMediaStreamSource(streamRef.current);
      const bufferSize = 2048;
      const processor = ac.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!isRecordingRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
        const input = event.inputBuffer.getChannelData(0);
        // Downsample von ac.sampleRate (~48000) auf 16000
        const ratio = ac.sampleRate / 16000;
        const outLength = Math.floor(input.length / ratio);
        const down = new Float32Array(outLength);
        for (let i = 0; i < outLength; i++) {
          down[i] = input[Math.floor(i * ratio)] || 0;
        }
        const pcm = floatTo16BitPCM(down);
        wsRef.current!.send(pcm); // Binär senden
      };

      source.connect(processor);
      processor.connect(ac.destination);
      console.log('✅ PCM streaming started');
    } catch (error) {
      console.error('❌ PCM recording start failed:', error);
      isRecordingRef.current = false;
      setIsListening(false);
    }
  };

  // Recording stoppen
  const stopRecording = () => {
    if (!isRecordingRef.current) return;

    console.log('🎤 Stopping PCM recording...');
    isRecordingRef.current = false;
    setIsListening(false);

    // Processor entfernen
    try {
      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
      }
    } catch {}

    // end_audio senden
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_audio' }));
    }

    setIsProcessing(true);
  };

  // Listening Mode starten
  const startListening = () => {
    if (isListening || isProcessing || isSpeaking) return;
    console.log('👂 Ready to listen...');
    // VAD wird automatisch das Recording starten
  };

  // Kontinuierlichen Modus starten/stoppen
  const toggleContinuousMode = async () => {
    if (isActive) {
      // Stoppen
      setIsActive(false);
      setIsListening(false);
      setIsProcessing(false);
      isRecordingRef.current = false;

      // Cleanup
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }
      if (speechTimerRef.current) {
        clearTimeout(speechTimerRef.current);
        speechTimerRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      // WebSocket über Manager schließen
      const manager = WebSocketManager.getInstance();
      manager.disconnect();
      wsRef.current = null;
    } else {
      // Starten
      if (!isConnected) {
        connectWebSocket();
        await new Promise(resolve => setTimeout(resolve, 1000)); // Warten auf Verbindung
      }
      
      if (await setupAudio()) {
        setIsActive(true);
        setTimeout(startListening, 500);
      }
    }
  };

  // WebSocket nur beim ersten Mount verbinden, nicht bei jedem connectWebSocket-Update
  useEffect(() => {
    // Nur verbinden wenn noch keine Verbindung existiert
    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
      connectWebSocket();
    }
    return () => {
      // WebSocket über Manager schließen beim Unmount
      const manager = WebSocketManager.getInstance();
      manager.disconnect();
      wsRef.current = null;
    };
  }, []); // Leere Dependency Array - nur einmal beim Mount

  // Audio Level für Visualisierung
  const audioLevel = audioLevelRef.current;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Kontinuierlicher Voice Chat</h2>
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

      {/* Stimmenauswahl */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Stimme</label>
        <select
          value={selectedVoice}
          onChange={(e) => setSelectedVoice(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        >
          {availableVoices.map(v => (
            <option key={v.id} value={v.id}>{v.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">Diese Stimmen werden vom Gemini Native Audio Modell unterstützt.</p>
      </div>

      {/* Status Anzeigen */}
      <div className="text-center mb-6">
        <div className="flex justify-center items-center gap-4 mb-4">
          <div className={`px-3 py-1 rounded-full text-sm ${isListening ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
            {isListening ? '👂 Hört zu...' : '😴 Bereit'}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm ${isProcessing ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'}`}>
            {isProcessing ? '🧠 Verarbeitet...' : '💭 Wartet'}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm ${isSpeaking ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
            {isSpeaking ? '🔊 Spricht...' : '🔇 Stumm'}
          </div>
        </div>

        {/* Audio Level Visualizer */}
        {isActive && (
          <div className="flex justify-center mb-4">
            <div className="flex items-center gap-1">
              {Array.from({length: 10}).map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-8 rounded-full transition-all duration-100 ${
                    audioLevel * 10 > i ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                  style={{
                    height: `${Math.max(8, audioLevel * 40)}px`
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Haupt-Button */}
        <button
          onClick={toggleContinuousMode}
          disabled={!isConnected}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 ${
            isActive
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg scale-110'
              : 'bg-green-500 hover:bg-green-600 text-white shadow-md'
          } ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isActive ? <PhoneOff size={32} /> : <Phone size={32} />}
        </button>
        <p className="text-sm text-gray-600 mt-2">
          {isActive ? 'Gespräch beenden' : 'Gespräch starten'}
        </p>
      </div>

      {/* Aktueller Dialog */}
      {transcript && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-blue-800 mb-2">Sie:</h3>
          <p className="text-blue-700">{transcript}</p>
        </div>
      )}

      {response && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-green-800 mb-2">KI:</h3>
          <p className="text-green-700">{response}</p>
        </div>
      )}

      {/* Gesprächsverlauf */}
      {conversationHistory.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Gesprächsverlauf:</h3>
          <div className="max-h-60 overflow-y-auto space-y-3">
            {conversationHistory.slice(-5).map((conv, index) => (
              <div key={index} className="text-sm">
                <div className="text-blue-700 mb-1">
                  <strong>Sie:</strong> {conv.user}
                </div>
                <div className="text-green-700 mb-2">
                  <strong>KI:</strong> {conv.ai}
                </div>
                <div className="text-xs text-gray-500 border-b pb-2">
                  {conv.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};