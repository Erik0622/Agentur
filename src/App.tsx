import { motion } from 'framer-motion'
import { Phone, Clock, TrendingDown, Users, Bot, Star, CheckCircle, ArrowRight, Calendar, X, ChevronLeft, ChevronRight, Video, Monitor, Mic, Volume2, Loader, MessageCircle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import AudioVisualizer from './components/AudioVisualizer'

interface BookingData {
  name: string;
  email: string;
  date: string;
  time: string;
  meetingType: 'phone' | 'zoom' | 'teams';
  phone?: string;
  id: string;
}

function App() {
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<{date: string, time: string} | null>(null);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    meetingType: 'phone' as 'phone' | 'zoom' | 'teams'
  });

  // Voice Agent State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingResponse, setIsPlayingResponse] = useState(false);
  const [isListening, setIsListening] = useState(false); // Kontinuierliches Zuhören
  const [conversationMode, setConversationMode] = useState(true); // Standard: Gespräch-Modus
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [wsConnected, setWsConnected] = useState(false);
  const [voiceMetrics, setVoiceMetrics] = useState<any>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [conversationHistory, setConversationHistory] = useState<Array<{user: string, ai: string, timestamp: Date}>>([]);
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);
  const [silenceCount, setSilenceCount] = useState(0);
  
  // Deutsche Stimmenauswahl für Bella Vista (nur geklonte deutsche Stimmen)
  const [selectedVoice, setSelectedVoice] = useState<keyof typeof germanVoices>('bella_vista_german_voice');
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const germanVoices = {
    'bella_vista_german_voice': { name: 'Bella Vista Original', gender: 'Weiblich', description: 'Authentische deutsche Stimme (geklont, Standard)' }
  } as const;
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Kontinuierliche Voice Detection Refs
  const continuousStreamRef = useRef<MediaStream | null>(null);
  const continuousRecorderRef = useRef<MediaRecorder | null>(null);
  const speechDetectionRef = useRef<boolean>(false);

  // ===== LATENCY CONSTANTS & HELPERS ===== [F-LAT-0]
  const OPUS_MIME = 'audio/webm;codecs=opus';
  const CHUNK_MS  = 20; // MediaRecorder timeslice (20ms für niedrige Latenz)
  // -------- Laufzeit-Schalter --------------------------------
  const isProd  = window.location.hostname !== 'localhost';
  const USE_WS  = !isProd;                 // DEV = WebSocket, PROD = REST
  
  const WS_URL  = USE_WS
    ? 'ws://localhost:3001'
    : null;  // in Prod nicht benötigt



  // batch UI updates for llm chunks
  let llmChunkBuf = '';
  let llmFlushTimer: number | null = null;
  function pushLlmChunk(setter: (v: any) => void, txt: string) {
    llmChunkBuf += txt;
    if (llmFlushTimer) return;
    llmFlushTimer = window.setTimeout(() => {
      setter((prev: string) => prev + llmChunkBuf);
      llmChunkBuf = '';
      llmFlushTimer && clearTimeout(llmFlushTimer);
      llmFlushTimer = null;
    }, 50);
  }

  // ===== Streaming Audio (MSE) – Refs & Helper =====  // [F0]
  const mseRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const appendingRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  function b64ToUint8(b64: string) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ===== MSE SETUP (reuse & updating check) ===== [F-LAT-1]
  function appendNextChunk() {
    const sb = sourceBufferRef.current;
    if (!sb || appendingRef.current || !audioQueueRef.current.length) return;
    if (sb.updating) return; // wait for updateend
    appendingRef.current = true;
    sb.appendBuffer(audioQueueRef.current.shift()!);
  }

  function setupMse(mime: string = OPUS_MIME) {
    return new Promise<void>((resolve, reject) => {
      // MIME Type Support Check
      if (!MediaSource.isTypeSupported(mime)) {
        console.error('❌ MIME Type nicht unterstützt:', mime);
        reject(new Error(`MIME Type nicht unterstützt: ${mime}`));
        return;
      }
      
      // Reuse if exists
      if (mseRef.current && sourceBufferRef.current) {
        resolve(); return;
      }
      const ms = new MediaSource();
      mseRef.current = ms;

      const audioEl = audioElRef.current || new Audio();
      audioElRef.current = audioEl;
      audioEl.autoplay = true;

      const url = URL.createObjectURL(ms);
      audioEl.src = url;

      ms.addEventListener('sourceopen', () => {
        try {
          const sb = ms.addSourceBuffer(mime);
          sourceBufferRef.current = sb;
          sb.addEventListener('updateend', () => {
            appendingRef.current = false;
            appendNextChunk();
          });
          resolve();
        } catch (e) { reject(e); }
      }, { once: true });
    });
  }

  function endMseStream() {
    const ms = mseRef.current;
    if (ms && ms.readyState === 'open') {
      try { ms.endOfStream(); } catch {}
    }
  }

  // ===== WebSocket Streaming (Low Latency) ===== [F-LAT-1]
  const wsStreamRef = useRef<WebSocket | null>(null);

  const startWebSocketStream = async () => {
    if (!USE_WS) return;   // Production: kein WS
    
    if (wsStreamRef.current?.readyState === WebSocket.OPEN) {
      console.log('🔗 WebSocket bereits verbunden');
      return;
    }

    try {
      console.log('🔗 Verbinde zu WebSocket Stream:', WS_URL);
      const ws = new WebSocket(WS_URL!);
      wsStreamRef.current = ws;

      ws.onopen = () => {
        console.log('🔗 WebSocket Stream verbunden');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Stream Event:', data.type);

          switch (data.type) {
            case 'transcript':
              setTranscript(data.text);
              break;
            case 'llm_chunk':
              pushLlmChunk(setAiResponse, data.text);
              break;
            case 'audio_chunk':
              if (data.base64) {
                const u8 = b64ToUint8(data.base64);
                audioQueueRef.current.push(u8);
                appendNextChunk();
              }
              break;
            case 'audio_header':
              setupMse(data.mime).then(() => setIsPlayingResponse(true));
              break;
            case 'end':
              endMseStream();
              setIsProcessing(false);
              break;
            case 'error':
              if (data.message === 'No speech detected.') {
                setTranscript('Keine Sprache erkannt. Bitte sprechen Sie lauter.');
                setAiResponse('');
              } else {
                throw new Error(data.message || 'Voice processing error');
              }
              break;
          }
        } catch (error) {
          console.error('Stream message error:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket Stream getrennt');
        setWsConnected(false);
        wsStreamRef.current = null;
      };

      ws.onerror = (error) => {
        console.error('WebSocket Stream Error:', error);
        setWsConnected(false);
      };

    } catch (error) {
      console.error('WebSocket Stream Setup Error:', error);
      setWsConnected(false);
    }
  };

  const sendAudioChunk = (chunk: Blob) => {
    if (USE_WS && wsStreamRef.current?.readyState === WebSocket.OPEN) {
      wsStreamRef.current.send(chunk);
    }
  };

  const endWebSocketStream = () => {
    if (wsStreamRef.current?.readyState === WebSocket.OPEN) {
      wsStreamRef.current.send(JSON.stringify({ type: 'end_audio' }));
    }
  };

  // Lade gespeicherte Termine aus localStorage
  useEffect(() => {
    const savedBookings = localStorage.getItem('bookings');
    if (savedBookings) {
      setBookings(JSON.parse(savedBookings));
    }
  }, []);

  // WebSocket Verbindung für Voice Agent
  useEffect(() => {
    const connectWebSocket = () => {
      // Production erkennen
      const isProduction = window.location.hostname !== 'localhost';
      
      if (isProduction) {
        // In Production: REST API verwenden statt WebSocket
        console.log('🌐 Production-Modus: REST API wird verwendet');
        setWsConnected(true); // Simuliere Verbindung für UI
        return;
      }
      
      // Development: WebSocket verwenden
      const wsUrl = 'ws://localhost:3001';
      console.log('🔗 Verbinde zu Voice Agent:', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🔗 Voice Agent verbunden');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('📨 Nachricht erhalten:', data);

        switch (data.type) {
          case 'transcript':
            setTranscript(data.text);
            setVoiceMetrics(data.metrics);
            break;
          case 'llm_chunk':
            setAiResponse(prev => prev + data.text);
            break;
          case 'voice_response':
            setTranscript(data.transcript);
            setAiResponse(data.response);
            setVoiceMetrics(data.metrics);
            setIsProcessing(false);
            
            // Audio abspielen mit Visualisierung
            if (data.audio) {
              setIsPlayingResponse(true);
              const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
              audio.onended = () => setIsPlayingResponse(false);
              audio.play().catch(e => console.error('Audio playback failed:', e));
            }
            break;
          case 'error':
            console.error('Voice Agent Error:', data.message);
            setIsProcessing(false);
            alert(`Fehler: ${data.message}`);
            break;
          case 'status':
            console.log('Status:', data.message);
            break;
        }
      };

      ws.onclose = () => {
        console.log('🔌 Voice Agent getrennt');
        setWsConnected(false);
        // Automatisch reconnecten nach 3 Sekunden
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket Fehler:', error);
        setWsConnected(false);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Audio Visualizer & Voice Activity Detection
  const startAudioVisualization = (stream: MediaStream, isForVAD = false) => {
    // Cleanup vorheriger AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    audioContextRef.current = new AudioContext();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);

    analyserRef.current.fftSize = 256;
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const SPEECH_THRESHOLD = 25; // Anpassen je nach Umgebung
    const SILENCE_FRAMES_NEEDED = 30; // ~0.5 Sekunden bei 60fps

    const updateAudioLevel = () => {
      const isActive = isForVAD ? isListening : isRecording;
      
      if (analyserRef.current && isActive && audioContextRef.current?.state === 'running') {
        try {
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
          const audioLevel = average / 255 * 100;
          setAudioLevel(audioLevel);

          // Voice Activity Detection für kontinuierliches Gespräch
          if (isForVAD && isListening) {
            const wasSpeaking = speechDetectionRef.current;
            const isSpeaking = audioLevel > SPEECH_THRESHOLD;
            
            if (isSpeaking && !wasSpeaking) {
              // Sprache erkannt - beginne Aufnahme
              console.log('🎤 Sprache erkannt - starte Aufnahme');
              speechDetectionRef.current = true;
              setIsSpeechDetected(true);
              setSilenceCount(0);
              startContinuousRecording();
            } else if (!isSpeaking && wasSpeaking) {
              // Stille erkannt - zähle Frames
              setSilenceCount(prev => prev + 1);
            } else if (!isSpeaking && wasSpeaking && silenceCount >= SILENCE_FRAMES_NEEDED) {
              // Genug Stille - beende Aufnahme
              console.log('🔇 Stille erkannt - beende Aufnahme');
              speechDetectionRef.current = false;
              setIsSpeechDetected(false);
              setSilenceCount(0);
              stopContinuousRecording();
            }
          }

        animationRef.current = requestAnimationFrame(updateAudioLevel);
        } catch (error) {
          console.error('Audio level update error:', error);
          setAudioLevel(0);
        }
      } else {
        setAudioLevel(0);
      }
    };

    updateAudioLevel();
  };

  const stopAudioVisualization = () => {
    // Animation stoppen
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // AudioContext sicher schließen
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    setAudioLevel(0);
  };

  // Kontinuierliche Gespräch-Funktionen
  const startConversationMode = async () => {
    try {
      console.log('🎯 Starte Gesprächsmodus');
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        } 
      });
      
      continuousStreamRef.current = stream;
      setIsListening(true);
      setTranscript('');
      setAiResponse('');
      
      // Voice Activity Detection starten
      startAudioVisualization(stream, true);
      
    } catch (error) {
      console.error('Gesprächsmodus-Start fehlgeschlagen:', error);
      alert('Mikrofonzugriff fehlgeschlagen. Bitte überprüfen Sie Ihre Browser-Einstellungen.');
    }
  };

  const stopConversationMode = () => {
    console.log('⏹️ Stoppe Gesprächsmodus');
    
    setIsListening(false);
    setIsSpeechDetected(false);
    setSilenceCount(0);
    speechDetectionRef.current = false;
    
    // Aktuelle Aufnahme stoppen falls läuft
    if (continuousRecorderRef.current && continuousRecorderRef.current.state === 'recording') {
      continuousRecorderRef.current.stop();
    }
    
    // Stream stoppen
    if (continuousStreamRef.current) {
      continuousStreamRef.current.getTracks().forEach(track => track.stop());
      continuousStreamRef.current = null;
    }
    
    stopAudioVisualization();
  };

  // ===== CONTINUOUS RECORDING (WebSocket Streaming) ===== [F-LAT-4]
  const startContinuousRecording = () => {
    if (!continuousStreamRef.current) return;
    try {
      const mr = new MediaRecorder(continuousStreamRef.current, { mimeType: OPUS_MIME });
      continuousRecorderRef.current = mr;
      
      // WebSocket Stream starten
      startWebSocketStream().then(() => {
        if (wsStreamRef.current?.readyState === WebSocket.OPEN) {
          wsStreamRef.current.send(JSON.stringify({ type: 'start_audio' }));
        }
      });

      if (USE_WS) {
        mr.ondataavailable = e => e.data.size && sendAudioChunk(e.data);
      } else {
        const parts: Blob[] = [];
        mr.ondataavailable = e => parts.push(e.data);
        mr.onstop = () => {
          const blob = new Blob(parts, { type: OPUS_MIME });
          processVoiceInputREST(blob);
        };
      }

      mr.start(CHUNK_MS); // 20ms Chunks für niedrige Latenz
    } catch (e) {
      console.error('Kontinuierliche Aufnahme-Start fehlgeschlagen:', e);
    }
  };

  const stopContinuousRecording = () => {
    if (continuousRecorderRef.current && continuousRecorderRef.current.state === 'recording') {
      continuousRecorderRef.current.stop();
    }
    // WebSocket Stream beenden (nur wenn WS aktiv)
    if (USE_WS) {
      endWebSocketStream();
    }
  };

  // ===== REST API Processing (Production) ===== [F-LAT-3]
  async function processVoiceInputREST(audioBlob: Blob) {
    try {
      setTranscript('Verarbeite Audio...');
      setAiResponse('');
      setIsProcessing(true);

      const ab = await audioBlob.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      const payload = JSON.stringify({ audio: b64, voice: 'german_m2' });

      const res = await fetch('/api/voice-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          
          if (!line) continue;
          
          try {
            const event = JSON.parse(line);
            console.log('📨 Stream Event:', event.type);
            
            switch (event.type) {
              case 'transcript':
                setTranscript(event.data.text);
                break;
              case 'llm_chunk':
                pushLlmChunk(setAiResponse, event.data.text);
                break;
              case 'audio_header':
                try { await setupMse(event.data.mime); setIsPlayingResponse(true); } catch (e) { console.error(e); }
                break;
              case 'audio_chunk': {
                const u8 = b64ToUint8(event.data.base64);
                audioQueueRef.current.push(u8);
                appendNextChunk();
                break;
              }
              case 'end':
                endMseStream();
                setIsProcessing(false);
                break;
              case 'error':
                if (event.data.message === 'No speech detected.') {
                  setTranscript('Keine Sprache erkannt. Bitte sprechen Sie lauter.');
                  setAiResponse('');
                } else {
                  throw new Error(event.data.message || 'Voice processing error');
                }
                break;
              default:
                console.log('📨 Unbekanntes Event:', event.type);
            }
          } catch (error) {
            console.error('Stream parse error:', error);
          }
        }
      }
    } catch (error) {
      console.error('Voice API Error:', error);
      setTranscript('');
      setAiResponse('Fehler bei der Sprachverarbeitung.');
      alert('Sprachverarbeitung fehlgeschlagen: ' + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }

  // ===== START/STOP RECORDING (WebSocket Streaming) ===== [F-LAT-2]
  const startRecording = async () => {
    try {
      setIsRecording(true);
      setTranscript('');
      setAiResponse('');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mr = new MediaRecorder(stream, { mimeType: OPUS_MIME });
      
      if (USE_WS) {
        // --- Low-Latency WS ---
        await startWebSocketStream();
        if (wsStreamRef.current?.readyState === WebSocket.OPEN) {
          wsStreamRef.current.send(JSON.stringify({ type: 'start_audio' }));
        }
        mr.ondataavailable = e => e.data.size && sendAudioChunk(e.data);
        mr.onstop = () => { endWebSocketStream(); stream.getTracks().forEach(t => t.stop()); };
      } else {
        // --- Production-REST: 20 ms Chunks sammeln, danach EIN Blob schicken ---
        const parts: Blob[] = [];
        mr.ondataavailable = e => parts.push(e.data);
        mr.onstop = async () => {
          const blob = new Blob(parts, { type: OPUS_MIME });
          await processVoiceInputREST(blob);   // existiert bereits
          stream.getTracks().forEach(t => t.stop());
        };
      }
      mr.start(CHUNK_MS); // 20ms Chunks für niedrige Latenz
      setMediaRecorder(mr);
    } catch (err) {
      console.error('Fehler beim Starten der Aufnahme:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };









  const isSlotAvailable = (date: string, time: string) => {
    return !bookings.some(booking => 
      booking.date === date && booking.time === time
    );
  };

  const handleSlotClick = (date: string, time: string) => {
    if (isSlotAvailable(date, time)) {
      setSelectedSlot({ date, time });
      setIsBookingModalOpen(true);
    }
  };

  const handleBookingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !selectedSlot) {
      alert('Bitte füllen Sie alle Felder aus.');
      return;
    }

    if (formData.meetingType === 'phone' && !formData.phone) {
      alert('Bitte geben Sie Ihre Telefonnummer an.');
      return;
    }

    const newBooking: BookingData = {
      ...formData,
      date: selectedSlot.date,
      time: selectedSlot.time,
      phone: formData.meetingType === 'phone' ? formData.phone : undefined,
      id: Date.now().toString()
    };

    const updatedBookings = [...bookings, newBooking];
    setBookings(updatedBookings);
    localStorage.setItem('bookings', JSON.stringify(updatedBookings));
    
    // Reset form
    setFormData({ name: '', email: '', phone: '', meetingType: 'phone' });
    setSelectedSlot(null);
    setIsBookingModalOpen(false);
    
    const meetingTypeText = {
      phone: 'rufen Sie an',
      zoom: 'senden Ihnen einen Zoom-Link',
      teams: 'senden Ihnen einen Teams-Link'
    };
    
    alert(`Termin erfolgreich gebucht! Wir ${meetingTypeText[newBooking.meetingType]} zur vereinbarten Zeit.`);
  };

  // Wochennavigation
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Montag als erster Tag
    return new Date(d.setDate(diff));
  };

  const getWeekDays = (startDate: Date) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const previousWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() - 7);
    setCurrentWeek(newWeek);
  };

  const nextWeek = () => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(currentWeek.getDate() + 7);
    setCurrentWeek(newWeek);
  };

  const scrollToCalendar = () => {
    const calendarSection = document.getElementById('calendar-section');
    if (calendarSection) {
      calendarSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Wochenkalender rendern
  const renderWeekCalendar = () => {
    const weekStart = getWeekStart(currentWeek);
    const weekDays = getWeekDays(weekStart);
    const today = new Date();
    const monthNames = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    // Alle möglichen Uhrzeiten (7-15 Uhr bzw. 7-13 Uhr Samstag)
    const timeHours = Array.from({ length: 9 }, (_, i) => 7 + i); // 7-15 Uhr

    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h3 className="text-lg sm:text-2xl font-bold text-gray-900">
            <span className="hidden sm:inline">
            {weekStart.getDate()}. {monthNames[weekStart.getMonth()]} - {weekDays[6].getDate()}. {monthNames[weekDays[6].getMonth()]} {weekStart.getFullYear()}
            </span>
            <span className="sm:hidden">
              {weekStart.getDate()}.{(weekStart.getMonth() + 1).toString().padStart(2, '0')} - {weekDays[6].getDate()}.{(weekDays[6].getMonth() + 1).toString().padStart(2, '0')}.{weekStart.getFullYear()}
            </span>
          </h3>
          <div className="flex space-x-2">
            <button
              onClick={previousWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <button
              onClick={nextWeek}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header mit Wochentagen */}
            <div className="grid grid-cols-8 gap-1 mb-2">
              <div className="p-1 sm:p-2 text-center text-xs sm:text-sm font-medium text-gray-500">Zeit</div>
              {weekDays.map((day, index) => {
                const isToday = day.toDateString() === today.toDateString();
                return (
                  <div key={index} className={`p-1 sm:p-2 text-center text-xs sm:text-sm font-medium ${isToday ? 'text-primary-600 bg-primary-50' : 'text-gray-500'} rounded`}>
                    <div className="text-xs sm:text-sm">{dayNames[index]}</div>
                    <div className="text-xs">{day.getDate()}.{(day.getMonth() + 1).toString().padStart(2, '0')}</div>
                  </div>
                );
              })}
            </div>

            {/* Stunden-Grid */}
            {timeHours.map(hour => (
              <div key={hour} className="grid grid-cols-8 gap-1 mb-1">
                <div className="p-1 sm:p-2 text-center text-xs sm:text-sm font-medium text-gray-600 bg-gray-50 rounded">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                {weekDays.map((day) => {
                  const dateString = `${day.getFullYear()}-${(day.getMonth() + 1).toString().padStart(2, '0')}-${day.getDate().toString().padStart(2, '0')}`;
                  const timeString = `${hour.toString().padStart(2, '0')}:00`;
                  const isPast = day < today || (day.toDateString() === today.toDateString() && hour <= new Date().getHours());
                  const dayOfWeek = day.getDay();
                  
                  // Prüfe Öffnungszeiten
                  const isOpen = dayOfWeek !== 0 && // Nicht Sonntag
                                 ((dayOfWeek === 6 && hour < 13) || // Samstag bis 13 Uhr
                                  (dayOfWeek !== 6 && hour < 15));   // Rest bis 15 Uhr

                  const isAvailable = isOpen && !isPast && isSlotAvailable(dateString, timeString);
                  const isBooked = isOpen && bookings.some(booking => 
                    booking.date === dateString && booking.time === timeString
                  );

                  return (
                    <div key={`${dateString}-${timeString}`} className="p-0.5 sm:p-1">
                      {isOpen ? (
                        <button
                          onClick={() => isAvailable ? handleSlotClick(dateString, timeString) : undefined}
                          disabled={!isAvailable}
                          className={`w-full h-8 sm:h-10 rounded text-xs font-medium transition-colors leading-tight
                            ${isAvailable 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer' 
                              : isBooked 
                                ? 'bg-red-100 text-red-700 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                          <span className="text-xs sm:text-sm">
                          {isAvailable ? 'Frei' : isBooked ? 'Belegt' : 'Vorbei'}
                          </span>
                        </button>
                      ) : (
                        <div className="w-full h-8 sm:h-10 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400">
                          <span className="text-xs leading-tight text-center">
                            {dayOfWeek === 0 ? 'Geschl.' : 'Geschl.'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-gray-600">Verfügbar</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-gray-600">Belegt</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
            <span className="text-gray-600">Geschlossen</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-2"
            >
              <Bot className="h-8 w-8 text-primary-600" />
              <span className="font-bold text-xl text-gray-900">KI-Service Pro</span>
            </motion.div>
            
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={scrollToCalendar}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors shadow-glow"
                          >
                Kostenlos Termin buchen
              </motion.button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="text-5xl md:text-7xl font-bold text-gray-900 mb-6"
            >
              Automatisieren Sie Ihren
              <span className="gradient-text block">Kundenservice mit KI</span>
              <span className="text-4xl md:text-5xl block mt-4">und sparen Sie 85% der Kosten</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-xl md:text-2xl text-gray-600 mb-12 max-w-4xl mx-auto"
            >
              Unser KI-Telefonsystem ist 24/7 erreichbar, führt automatisch Buchungen durch 
              und spart Ihnen bis zu 85% der Kundenservice-Kosten
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <button 
                onClick={scrollToCalendar}
                className="bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-primary-700 transition-colors shadow-glow flex items-center justify-center group"
              >
                <Calendar className="mr-2 h-5 w-5" />
                Kostenlos Beratungstermin buchen
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:border-primary-600 hover:text-primary-600 transition-colors">
                Live-Demo anfordern
              </button>
            </motion.div>
          </div>

          {/* Stats */}
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <div className="text-center">
              <div className="text-4xl font-bold text-red-500 mb-2">30%</div>
              <div className="text-gray-600">verlorene Kunden durch Nichterreichbarkeit</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-500 mb-2">85%</div>
              <div className="text-gray-600">Kosteneinsparung im Kundenservice</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-500 mb-2">24/7</div>
              <div className="text-gray-600">Verfügbarkeit ohne Unterbrechung</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Das Problem kennen Sie
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Jeden Tag verlieren Restaurants wertvolle Kunden, weil der Telefonservice überlastet ist
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Phone, title: "Verpasste Anrufe", desc: "Besetzt oder niemand da", color: "text-red-500" },
              { icon: Clock, title: "Lange Wartezeiten", desc: "Kunden legen auf", color: "text-orange-500" },
              { icon: TrendingDown, title: "Umsatzverluste", desc: "30% weniger Buchungen", color: "text-red-600" },
              { icon: Users, title: "Überlastetes Personal", desc: "Stress und Fehler", color: "text-yellow-500" }
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-shadow"
              >
                <item.icon className={`h-12 w-12 ${item.color} mb-4`} />
                <h3 className="font-semibold text-lg text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-600">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Die <span className="gradient-text">KI-Lösung</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Unser intelligentes System übernimmt Ihren kompletten Telefondienst
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              <h3 className="text-3xl font-bold text-gray-900 mb-8">Was unsere KI kann:</h3>
              
              {[
                "Reservierungen automatisch entgegennehmen",
                "Menüfragen professionell beantworten", 
                "Öffnungszeiten und Informationen mitteilen",
                "Kundendaten sicher verwalten",
                "Bei Bedarf an Mitarbeiter weiterleiten",
                "In mehreren Sprachen kommunizieren"
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="flex items-center mb-4"
                >
                  <CheckCircle className="h-6 w-6 text-green-500 mr-3 flex-shrink-0" />
                  <span className="text-lg text-gray-700">{feature}</span>
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-primary-50 to-accent-50 p-8 rounded-2xl"
            >
              <div className="text-center">
                <Bot className="h-24 w-24 text-primary-600 mx-auto mb-6 animate-bounce-slow" />
                <h4 className="text-2xl font-bold text-gray-900 mb-4">Immer verfügbar</h4>
                <p className="text-gray-600 mb-6">
                  Ihre KI arbeitet rund um die Uhr, auch an Feiertagen und Wochenenden
                </p>
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-3xl font-bold text-green-500">100%</div>
                  <div className="text-sm text-gray-600">Verfügbarkeit garantiert</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-primary-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ihre Vorteile auf einen Blick
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              { 
                title: "Kosteneinsparung", 
                value: "85%", 
                desc: "Weniger Personal für Telefondienst nötig" 
              },
              { 
                title: "Mehr Buchungen", 
                value: "+30%", 
                desc: "Nie wieder verpasste Reservierungen" 
              },
              { 
                title: "Kundenzufriedenheit", 
                value: "98%", 
                desc: "Sofortige, professionelle Antworten" 
              },
              { 
                title: "Zeitersparnis", 
                value: "8h/Tag", 
                desc: "Personal kann sich auf Kerngeschäft konzentrieren" 
              },
              { 
                title: "Verfügbarkeit", 
                value: "24/7", 
                desc: "Auch nachts und an Feiertagen erreichbar" 
              },
              { 
                title: "Fehlerreduzierung", 
                value: "95%", 
                desc: "Weniger menschliche Fehler bei Buchungen" 
              }
            ].map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-white/10 backdrop-blur-sm p-6 rounded-xl border border-white/20"
              >
                <div className="text-3xl font-bold text-accent-500 mb-2">{benefit.value}</div>
                <h3 className="text-xl font-semibold text-white mb-2">{benefit.title}</h3>
                <p className="text-primary-100">{benefit.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Was unsere Kunden sagen
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: "Maria Schmidt",
                restaurant: "Ristorante Milano",
                text: "Seit der KI-Einführung haben wir 40% mehr Reservierungen. Das System ist einfach fantastisch!",
                rating: 5
              },
              {
                name: "Thomas Müller", 
                restaurant: "Gasthof zur Sonne",
                text: "Endlich können wir uns auf das Kochen konzentrieren, während die KI perfekt unsere Anrufe managed.",
                rating: 5
              },
              {
                name: "Lisa Wagner",
                restaurant: "Café Central",
                text: "Die Investition hat sich bereits nach 2 Monaten amortisiert. Unglaubliche Kosteneinsparung!",
                rating: 5
              }
            ].map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.2 }}
                viewport={{ once: true }}
                className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="flex mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-gray-600 mb-4 italic">"{testimonial.text}"</p>
                <div>
                  <div className="font-semibold text-gray-900">{testimonial.name}</div>
                  <div className="text-sm text-gray-500">{testimonial.restaurant}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-primary-50 to-accent-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-8 sm:mb-12 lg:mb-16"
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
              Erleben Sie unsere <span className="gradient-text">KI live</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 max-w-3xl mx-auto">
              Testen Sie jetzt unseren Voice-Agent und erleben Sie, wie natürlich und effizient KI-basierter Kundenservice funktioniert
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="bg-white p-4 sm:p-6 lg:p-8 rounded-2xl shadow-xl"
            >
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 text-center">
                🎙️ Voice-Agent Demo
              </h3>
              
              <div className="space-y-4 sm:space-y-6">
                {/* Audio Visualizer */}
                <div className="flex flex-col items-center">
                  <div className={`w-28 h-28 sm:w-36 sm:h-36 lg:w-40 lg:h-40 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
                    isRecording 
                      ? 'bg-gradient-to-br from-red-500 to-red-600 animate-pulse' 
                      : isProcessing
                      ? 'bg-gradient-to-br from-yellow-500 to-orange-500 animate-pulse'
                      : isPlayingResponse
                      ? 'bg-gradient-to-br from-green-500 to-green-600 animate-pulse'
                      : wsConnected
                      ? 'bg-gradient-to-br from-primary-500 to-accent-500'
                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                  }`}>
                    {isProcessing ? (
                      <Loader className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 text-white animate-spin" />
                    ) : isRecording ? (
                      <Mic className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 text-white animate-pulse" />
                    ) : isPlayingResponse ? (
                      <Volume2 className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 text-white animate-pulse" />
                    ) : (
                      <Bot className="h-12 w-12 sm:h-16 sm:w-16 lg:h-20 lg:w-20 text-white" />
                    )}
                  </div>
                  
                  {/* Audio Wellen Visualisierung */}
                  <div className="mt-4 sm:mt-6 w-full">
                    <AudioVisualizer 
                      isRecording={isRecording}
                      isProcessing={isProcessing}
                      isPlayingResponse={isPlayingResponse}
                      audioLevel={audioLevel}
                    />
                  </div>

                  {/* Status Text */}
                  <div className="text-center mb-4 sm:mb-6 lg:mb-8">
                    <div className={`text-lg sm:text-xl lg:text-2xl font-bold mb-2 ${
                      isRecording || isListening
                        ? 'text-red-600' 
                        : isProcessing 
                        ? 'text-orange-600'
                        : isPlayingResponse
                        ? 'text-green-600'
                        : wsConnected
                        ? 'text-primary-600'
                        : 'text-gray-500'
                    }`}>
                      {conversationMode ? (
                        // Gespräch-Modus Status
                        isListening
                          ? isSpeechDetected
                            ? '🎤 Nehme auf...'
                            : '👂 Höre zu...'
                          : isProcessing 
                            ? '🧠 Denkt nach...'
                            : isPlayingResponse
                              ? '🔊 Spricht...'
                              : '💬 Bereit für Gespräch'
                      ) : (
                        // Klassischer Modus Status
                        isRecording 
                        ? '🎤 Hört zu...' 
                        : isProcessing 
                        ? '🧠 Denkt nach...'
                        : isPlayingResponse
                        ? '🔊 Spricht...'
                        : !wsConnected
                        ? '🔄 Verbinde...'
                        : '🤖 Bereit zum Sprechen'
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {conversationMode ? (
                        // Gespräch-Modus Beschreibung
                        isListening
                          ? isSpeechDetected
                            ? 'Ihre Worte werden aufgenommen...'
                            : 'Sprechen Sie einfach - ich höre automatisch zu'
                          : isProcessing 
                            ? 'KI verarbeitet Ihre Anfrage...'
                            : isPlayingResponse
                              ? 'KI-Agent antwortet...'
                              : 'Klicken Sie "Gespräch starten" für natürliche Unterhaltung'
                      ) : (
                        // Klassischer Modus Beschreibung
                        isRecording 
                        ? 'Sprechen Sie deutlich ins Mikrofon' 
                        : isProcessing 
                        ? 'KI verarbeitet Ihre Anfrage...'
                        : isPlayingResponse
                        ? 'KI-Agent antwortet...'
                        : !wsConnected
                        ? 'Verbindung wird hergestellt...'
                        : 'Klicken Sie den Button, um zu sprechen'
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Deutsche Stimmenauswahl für Bella Vista */}
                <div className="mb-4 sm:mb-6">
                  <h4 className="text-base sm:text-lg font-semibold text-gray-700 mb-2 sm:mb-3 text-center">
                    🗣️ Deutsche Stimme wählen
                  </h4>
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {Object.entries(germanVoices).map(([voiceKey, voice]) => (
                      <button
                        key={voiceKey}
                        onClick={() => setSelectedVoice(voiceKey as keyof typeof germanVoices)}
                        className={`p-2 sm:p-3 rounded-lg border-2 transition-all text-left ${
                          selectedVoice === voiceKey
                            ? 'bg-primary-50 border-primary-300 text-primary-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <div className="font-medium text-sm sm:text-base">{voice.name}</div>
                        <div className="text-xs opacity-75">{voice.gender}</div>
                        <div className="text-xs opacity-60 hidden sm:block">{voice.description}</div>
                      </button>
                    ))}
                  </div>
                  <div className="text-center mt-1 sm:mt-2">
                    <span className="text-xs sm:text-sm text-gray-500">
                      Aktuell: <strong>{germanVoices[selectedVoice].name}</strong> ({germanVoices[selectedVoice].gender})
                    </span>
                  </div>
                </div>
                
                {/* Voice Control Buttons */}
                <div className="text-center">
                  {/* Mode Selection */}
                  <div className="mb-4 sm:mb-6">
                    <div className="flex justify-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                      <button 
                        onClick={() => setConversationMode(false)}
                        className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                          !conversationMode 
                            ? 'bg-primary-100 text-primary-700 border-2 border-primary-300' 
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-200'
                        }`}
                      >
                        📝 Klassisch
                      </button>
                      <button 
                        onClick={() => setConversationMode(true)}
                        className={`px-3 sm:px-4 py-2 rounded-lg font-medium transition-all text-sm sm:text-base ${
                          conversationMode 
                            ? 'bg-green-100 text-green-700 border-2 border-green-300' 
                            : 'bg-gray-100 text-gray-600 border-2 border-gray-200'
                        }`}
                      >
                        💬 Gespräch
                      </button>
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 text-center">
                      {conversationMode 
                        ? 'Kontinuierliches Gespräch wie am Telefon' 
                        : 'Aufnehmen → Stoppen → Antwort'
                      }
                    </div>
                  </div>

                  {/* Voice Control Button(s) */}
                  {conversationMode ? (
                    // Kontinuierlicher Gesprächsmodus
                    <motion.button 
                      onClick={isListening ? stopConversationMode : startConversationMode}
                      disabled={isProcessing}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`px-6 sm:px-8 lg:px-12 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg lg:text-xl transition-all shadow-xl ${
                        isListening 
                          ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800' 
                          : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800'
                      }`}
                    >
                      {isListening 
                        ? '🔴 Gespräch beenden' 
                        : '🎯 Gespräch starten'
                      }
                    </motion.button>
                  ) : (
                    // Klassischer Aufnahme-Modus
                  <motion.button 
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing || !wsConnected}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`px-6 sm:px-8 lg:px-12 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg lg:text-xl transition-all shadow-xl ${
                      isRecording 
                        ? 'bg-gradient-to-r from-red-600 to-red-700 text-white hover:from-red-700 hover:to-red-800' 
                        : isProcessing
                        ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white cursor-not-allowed'
                        : !wsConnected
                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white cursor-not-allowed'
                        : 'bg-gradient-to-r from-primary-600 to-accent-600 text-white hover:from-primary-700 hover:to-accent-700'
                    }`}
                  >
                    {isRecording 
                      ? '🛑 Stoppen' 
                      : isProcessing
                      ? 'Verarbeite...'
                      : !wsConnected
                      ? 'Verbinde...'
                      : '🎤 Sprechen'
                    }
                  </motion.button>
                  )}
                  
                  {/* Status Indicators */}
                  <div className="mt-3 sm:mt-4 space-y-2">
                    {/* Voice Activity Indicator */}
                    {isListening && (
                      <div className="flex justify-center items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${isSpeechDetected ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                        <span className={`text-xs sm:text-sm font-medium ${isSpeechDetected ? 'text-red-600' : 'text-green-600'}`}>
                          {isSpeechDetected ? '🎤 Nehme auf...' : '👂 Höre zu...'}
                        </span>
                      </div>
                    )}
                  
                  {/* Connection Status */}
                    <div className="flex items-center justify-center text-xs sm:text-sm">
                    <div className={`w-2 h-2 rounded-full mr-2 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className={wsConnected ? 'text-green-600' : 'text-red-600'}>
                      {wsConnected ? 'KI-Agent verbunden' : 'Verbindung unterbrochen'}
                    </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 sm:mt-8 space-y-3 sm:space-y-4">
                <h4 className="font-semibold text-gray-900 text-sm sm:text-base">Demo-Szenarien:</h4>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    "Tischreservierung für 4 Personen",
                    "Nachfrage zu Allergenen im Menü", 
                    "Öffnungszeiten und Anfahrt",
                    "Stornierung einer Reservierung"
                  ].map((scenario, index) => (
                    <div key={index} className="flex items-center p-2 sm:p-3 bg-gray-50 rounded-lg">
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-500 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-gray-700">{scenario}</span>
                    </div>
                  ))}
                </div>

                {/* Live Demo Chat */}
                {(transcript || aiResponse) && (
                  <div className="mt-8 p-6 bg-gray-50 rounded-xl">
                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                      <Volume2 className="h-5 w-5 mr-2" />
                      {conversationMode ? 'Live Gespräch' : 'Live Demo Chat'}
                    </h4>
                    
                    <div className="space-y-4">
                      {/* Aktuelle Interaktion */}
                      {transcript && (
                        <div className="bg-blue-100 p-3 rounded-lg">
                          <div className="text-sm font-medium text-blue-800 mb-1">Sie:</div>
                          <div className="text-blue-700">{transcript}</div>
                        </div>
                      )}
                      
                      {aiResponse && (
                        <div className="bg-green-100 p-3 rounded-lg">
                          <div className="text-sm font-medium text-green-800 mb-1 flex items-center">
                            <Bot className="h-4 w-4 mr-1" />
                            KI-Agent:
                          </div>
                          <div className="text-green-700">{aiResponse}</div>
                        </div>
                      )}
                      
                      {voiceMetrics && (
                        <div className="text-xs text-gray-500 bg-white p-2 rounded border">
                          <div className="grid grid-cols-2 gap-2">
                            <div>STT: {voiceMetrics.sttLatency}ms</div>
                            <div>LLM: {voiceMetrics.llmFirstToken}ms</div>
                            <div>TTS: {voiceMetrics.ttsLatency}ms</div>
                            <div>Gesamt: {voiceMetrics.totalLatency}ms</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Konversations-Historie (nur im Gespräch-Modus) */}
                {conversationMode && conversationHistory.length > 0 && (
                  <div className="mt-8 p-6 bg-white border-2 border-green-200 rounded-xl">
                    <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
                      <MessageCircle className="h-5 w-5 mr-2 text-green-600" />
                      Gesprächsverlauf ({conversationHistory.length} Nachrichten)
                    </h4>
                    
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {conversationHistory.map((exchange, index) => (
                        <div key={index} className="border-l-4 border-gray-200 pl-4">
                          <div className="text-xs text-gray-500 mb-1">
                            {exchange.timestamp.toLocaleTimeString()}
                          </div>
                          <div className="bg-blue-50 p-2 rounded mb-2">
                            <div className="text-sm font-medium text-blue-800">Sie:</div>
                            <div className="text-blue-700 text-sm">{exchange.user}</div>
                          </div>
                          <div className="bg-green-50 p-2 rounded">
                            <div className="text-sm font-medium text-green-800 flex items-center">
                              <Bot className="h-3 w-3 mr-1" />
                              KI-Agent:
                            </div>
                            <div className="text-green-700 text-sm">{exchange.ai}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {conversationHistory.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button 
                          onClick={() => setConversationHistory([])}
                          className="text-sm text-red-600 hover:text-red-700 transition-colors"
                        >
                          🗑️ Verlauf löschen
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="space-y-6 lg:space-y-8"
            >
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg">
                <h4 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
                  🚀 Unsere Technologie
                </h4>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-3"></div>
                    <span className="text-sm sm:text-base text-gray-700"><strong>Deepgram:</strong> Präzise Spracherkennung</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm sm:text-base text-gray-700"><strong>Gemini Flash:</strong> Blitzschnelle KI-Antworten</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-purple-500 rounded-full mr-3"></div>
                    <span className="text-sm sm:text-base text-gray-700"><strong>smallest.ai:</strong> Natürliche Sprachsynthese</span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg">
                <h4 className="text-lg sm:text-xl font-bold text-gray-900 mb-3 sm:mb-4">
                  ⚡ Performance
                </h4>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-green-600">~500ms</div>
                    <div className="text-xs sm:text-sm text-gray-600">Antwortzeit</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-blue-600">99.9%</div>
                    <div className="text-xs sm:text-sm text-gray-600">Verfügbarkeit</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-purple-600">~€0.02</div>
                    <div className="text-xs sm:text-sm text-gray-600">pro Gespräch</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl sm:text-2xl font-bold text-orange-600">24/7</div>
                    <div className="text-xs sm:text-sm text-gray-600">Betrieb</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-xl border border-green-200">
                <h4 className="text-lg font-bold text-green-800 mb-2">
                  ✅ Demo-Ergebnis garantiert:
                </h4>
                <p className="text-green-700 text-sm">
                  Nach der Demo sind 95% unserer Interessenten überzeugt von der Qualität und buchen unser System.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Calendar Section - NOW AFTER TESTIMONIALS */}
      <section id="calendar-section" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Buchen Sie Ihren <span className="gradient-text">Beratungstermin</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Wählen Sie einfach einen verfügbaren Termin aus unserem Kalender. Wir kontaktieren Sie zur vereinbarten Zeit.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            {renderWeekCalendar()}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className="mt-8 text-center"
          >
            <div className="bg-white p-6 rounded-xl shadow-sm max-w-2xl mx-auto">
              <h4 className="font-semibold text-gray-900 mb-4">Unsere Sprechzeiten:</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <div className="font-medium text-primary-600">Montag - Freitag</div>
                  <div>07:00 - 15:00 Uhr</div>
                </div>
                <div>
                  <div className="font-medium text-primary-600">Samstag</div>
                  <div>07:00 - 13:00 Uhr</div>
                </div>
                <div>
                  <div className="font-medium text-gray-400">Sonntag</div>
                  <div>Geschlossen</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-accent-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Bereit für die Zukunft?
            </h2>
            <p className="text-xl text-primary-100 mb-8">
              Starten Sie noch heute und sichern Sie sich Ihren Wettbewerbsvorteil
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <motion.button
                onClick={scrollToCalendar}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white text-primary-600 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition-colors shadow-lg flex items-center justify-center"
              >
                <Calendar className="mr-2 h-5 w-5" />
                Kostenloses Beratungsgespräch
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="border-2 border-white text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white hover:text-primary-600 transition-colors"
              >
                Live-Demo anfordern
              </motion.button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Bot className="h-8 w-8 text-primary-500" />
              <span className="font-bold text-xl">KI-Service Pro</span>
            </div>
            <p className="text-gray-400 mb-8">
              Revolutionieren Sie Ihren Kundenservice mit künstlicher Intelligenz
            </p>
            <div className="border-t border-gray-700 pt-8">
              <p className="text-gray-500 text-sm">
                © 2024 KI-Service Pro. Alle Rechte vorbehalten.
              </p>
            </div>
          </div>
        </div>
      </footer>

      {/* Booking Modal */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">
                  {selectedSlot ? 'Termin bestätigen' : 'Beratungstermin buchen'}
                </h3>
                <button
                  onClick={() => {
                    setIsBookingModalOpen(false);
                    setSelectedSlot(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              {selectedSlot && (
                <div className="mb-6 p-4 bg-primary-50 rounded-lg">
                  <h4 className="font-semibold text-primary-900 mb-2">Gewählter Termin:</h4>
                  <p className="text-primary-700">
                    <strong>{new Date(selectedSlot.date).toLocaleDateString('de-DE', { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}</strong>
                  </p>
                  <p className="text-primary-700">
                    <strong>{selectedSlot.time} Uhr</strong>
                  </p>
                </div>
              )}

              {!selectedSlot && (
                <div className="mb-6 p-4 bg-primary-50 rounded-lg">
                  <h4 className="font-semibold text-primary-900 mb-2">Hinweis:</h4>
                  <p className="text-sm text-primary-700">
                    Bitte wählen Sie zuerst einen verfügbaren Termin aus dem Kalender aus.
                  </p>
                </div>
              )}

              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Ihr Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Max Mustermann"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    E-Mail-Adresse *
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="max@beispiel.de"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Bevorzugte Kontaktart *
                  </label>
                  <div className="grid grid-cols-1 gap-3">
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="meetingType"
                        value="phone"
                        checked={formData.meetingType === 'phone'}
                        onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as 'phone' | 'zoom' | 'teams' })}
                        className="mr-3"
                      />
                      <Phone className="h-5 w-5 text-primary-600 mr-2" />
                      <span>Telefon</span>
                    </label>
                    
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="meetingType"
                        value="zoom"
                        checked={formData.meetingType === 'zoom'}
                        onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as 'phone' | 'zoom' | 'teams' })}
                        className="mr-3"
                      />
                      <Video className="h-5 w-5 text-blue-600 mr-2" />
                      <span>Zoom</span>
                    </label>
                    
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="meetingType"
                        value="teams"
                        checked={formData.meetingType === 'teams'}
                        onChange={(e) => setFormData({ ...formData, meetingType: e.target.value as 'phone' | 'zoom' | 'teams' })}
                        className="mr-3"
                      />
                      <Monitor className="h-5 w-5 text-purple-600 mr-2" />
                      <span>Microsoft Teams</span>
                    </label>
                  </div>
                </div>

                {formData.meetingType === 'phone' && (
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                      Telefonnummer *
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="+49 123 456789"
                    />
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={!formData.name || !formData.email || !selectedSlot || (formData.meetingType === 'phone' && !formData.phone)}
                    className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-primary-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Termin buchen
                  </button>
                </div>
              </form>

              <p className="text-xs text-gray-500 mt-4">
                * Pflichtfelder. <strong>Sie erhalten eine Bestätigungsmail mit den Zugangsdaten</strong> für Ihren Beratungstermin.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
  }
  
  export default App 
