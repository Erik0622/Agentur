// ULTRA-LOW LATENCY VOICE AGENT OPTIMIZER
// Target: <0.8s TTFA (Time To First Audio)

// Aktuelle Pipeline Analyse:
// 1. Audio Recording: ~100ms (kontinuierlich)
// 2. Deepgram STT: ~200-400ms (kann optimiert werden)
// 3. Gemini LLM: ~300-600ms (kann parallel gestartet werden)
// 4. Azure TTS: ~200-400ms (kann früh gestartet werden)
// 5. Audio Playback: ~50ms
// GESAMT: 850-1550ms ❌

// Optimierte Pipeline Ziel:
// 1. Audio Recording: ~50ms (frühere VAD-Erkennung)
// 2. Deepgram STT: ~150ms (optimierte Parameter)
// 3. Gemini LLM: ~200ms (parallel + früher Start)
// 4. Azure TTS: ~150ms (parallel + streaming)
// 5. Audio Playback: ~50ms
// GESAMT: <650ms ✅

export const ULTRA_LOW_LATENCY_CONFIG = {
  // Deepgram Ultra-Fast Settings
  deepgram: {
    model: 'nova-2',              // Schneller als nova-3
    language: 'de',               // Spezifisch statt multi
    encoding: 'linear16',
    sample_rate: 16000,           // Niedriger für Geschwindigkeit
    channels: 1,
    punctuate: false,             // Deaktiviert für Geschwindigkeit
    interim_results: true,
    endpointing: 50,              // Sehr kurz
    utterance_end_ms: 100,        // Sehr kurz
    vad_events: true,
    smart_format: false,          // Deaktiviert für Geschwindigkeit
    diarize: false,
    multichannel: false,
    alternatives: 1,              // Nur beste Alternative
    profanity_filter: false,
    redact: false,
    search: false,
    replace: false,
    keywords: false,
    keyword_boost: false
  },

  // Gemini Ultra-Fast Settings
  gemini: {
    model: 'gemini-2.0-flash-exp',  // Schnellstes Modell
    temperature: 0.3,               // Niedriger für Konsistenz
    maxOutputTokens: 50,            // Sehr kurz für TTFA
    candidateCount: 1,
    stopSequences: [],
    safetySettings: []              // Minimal für Geschwindigkeit
  },

  // Azure TTS Ultra-Fast Settings
  azure: {
    voice: 'de-DE-KatjaNeural',     // Standard Neural (schneller als HD)
    format: 'audio-16khz-32kbitrate-mono-mp3', // Komprimiert
    rate: '+20%',                   // Schneller sprechen
    pitch: 'default',
    volume: 'default'
  },

  // Timing Optimierungen
  timing: {
    vadSilenceThreshold: 800,       // Kürzer: 0.8s statt 1.5s
    vadSpeechThreshold: 0.015,      // Empfindlicher
    deepgramEarlyStart: 3,          // LLM bei 3 Zeichen starten
    ttsEarlyStart: 8,               // TTS bei 8 Tokens starten
    audioChunkSize: 50,             // 50ms Chunks
    maxProcessingTime: 5000         // 5s Timeout
  }
};

// Pipeline Optimierungen
export const LATENCY_OPTIMIZATIONS = {
  // 1. Parallel Processing
  enableParallelProcessing: true,
  
  // 2. Early Starts
  enableEarlyLLMStart: true,        // LLM bei ersten Interim-Results
  enableEarlyTTSStart: true,        // TTS bei ersten LLM-Tokens
  
  // 3. Streaming Optimierungen
  enableLLMStreaming: true,
  enableTTSStreaming: true,
  enableAudioStreaming: true,
  
  // 4. Caching
  enableTokenCaching: true,         // Gemini Token cachen
  enableVoiceCaching: true,         // Azure Voice cachen
  
  // 5. Connection Optimierungen
  keepAliveConnections: true,
  connectionPooling: true,
  
  // 6. Audio Optimierungen
  audioPreProcessing: false,        // Deaktiviert für Geschwindigkeit
  audioPostProcessing: false,
  audioBuffering: 'minimal'
};

// Performance Monitoring
export class LatencyMonitor {
  constructor() {
    this.metrics = {
      audioStart: 0,
      deepgramStart: 0,
      deepgramEnd: 0,
      llmStart: 0,
      llmFirstToken: 0,
      ttsStart: 0,
      ttsFirstAudio: 0,
      audioPlayback: 0,
      totalTTFA: 0
    };
  }

  startTimer(event) {
    this.metrics[event] = performance.now();
  }

  endTimer(event) {
    const now = performance.now();
    this.metrics[event + 'Duration'] = now - this.metrics[event];
    return this.metrics[event + 'Duration'];
  }

  calculateTTFA() {
    if (this.metrics.audioStart && this.metrics.ttsFirstAudio) {
      this.metrics.totalTTFA = this.metrics.ttsFirstAudio - this.metrics.audioStart;
      return this.metrics.totalTTFA;
    }
    return null;
  }

  getReport() {
    return {
      ttfa: this.calculateTTFA(),
      breakdown: {
        stt: this.metrics.deepgramEndDuration || 0,
        llm: this.metrics.llmFirstTokenDuration || 0,
        tts: this.metrics.ttsFirstAudioDuration || 0
      },
      target: 800, // 0.8s
      performance: this.calculateTTFA() < 800 ? 'EXCELLENT' : 'NEEDS_OPTIMIZATION'
    };
  }
}

export default { ULTRA_LOW_LATENCY_CONFIG, LATENCY_OPTIMIZATIONS, LatencyMonitor };