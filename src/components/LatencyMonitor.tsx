import React, { useState, useRef, useEffect } from 'react';
import { Clock, Zap, Target } from 'lucide-react';

interface LatencyMetrics {
  audioStart: number;
  deepgramStart: number;
  deepgramEnd: number;
  llmStart: number;
  llmFirstToken: number;
  ttsStart: number;
  ttsFirstAudio: number;
  audioPlayback: number;
  totalTTFA: number;
}

interface LatencyBreakdown {
  stt: number;
  llm: number;
  tts: number;
  total: number;
}

export const LatencyMonitor: React.FC<{ onMetricsUpdate?: (metrics: LatencyBreakdown) => void }> = ({ 
  onMetricsUpdate 
}) => {
  const [metrics, setMetrics] = useState<LatencyMetrics>({
    audioStart: 0,
    deepgramStart: 0,
    deepgramEnd: 0,
    llmStart: 0,
    llmFirstToken: 0,
    ttsStart: 0,
    ttsFirstAudio: 0,
    audioPlayback: 0,
    totalTTFA: 0
  });

  const [breakdown, setBreakdown] = useState<LatencyBreakdown>({
    stt: 0,
    llm: 0,
    tts: 0,
    total: 0
  });

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [history, setHistory] = useState<LatencyBreakdown[]>([]);

  const metricsRef = useRef<LatencyMetrics>(metrics);

  // Performance Monitoring
  const startTimer = (event: keyof LatencyMetrics) => {
    const now = performance.now();
    metricsRef.current = { ...metricsRef.current, [event]: now };
    setMetrics(prev => ({ ...prev, [event]: now }));
    
    if (event === 'audioStart') {
      setIsMonitoring(true);
      console.log('⏱️ TTFA Timer started');
    }
  };

  const endTimer = (event: keyof LatencyMetrics) => {
    const now = performance.now();
    metricsRef.current = { ...metricsRef.current, [event]: now };
    setMetrics(prev => ({ ...prev, [event]: now }));
  };

  const calculateBreakdown = () => {
    const m = metricsRef.current;
    
    const stt = m.deepgramEnd && m.deepgramStart ? m.deepgramEnd - m.deepgramStart : 0;
    const llm = m.llmFirstToken && m.llmStart ? m.llmFirstToken - m.llmStart : 0;
    const tts = m.ttsFirstAudio && m.ttsStart ? m.ttsFirstAudio - m.ttsStart : 0;
    const total = m.ttsFirstAudio && m.audioStart ? m.ttsFirstAudio - m.audioStart : 0;

    const newBreakdown = { stt, llm, tts, total };
    setBreakdown(newBreakdown);
    
    if (total > 0) {
      setHistory(prev => [...prev.slice(-9), newBreakdown]);
      setIsMonitoring(false);
      console.log(`⏱️ TTFA Complete: ${total.toFixed(0)}ms`);
      
      if (onMetricsUpdate) {
        onMetricsUpdate(newBreakdown);
      }
    }

    return newBreakdown;
  };

  // WebSocket Message Listener für automatische Messung
  useEffect(() => {
    const originalConsoleLog = console.log;
    
    console.log = (...args) => {
      const message = args.join(' ');
      
      // Audio Start Detection
      if (message.includes('🎤 Starting recording')) {
        startTimer('audioStart');
      }
      
      // Deepgram Events
      if (message.includes('✅ Deepgram WebSocket connected')) {
        startTimer('deepgramStart');
      }
      if (message.includes('📝 Interim transcript:') || message.includes('📝 Final transcript:')) {
        endTimer('deepgramEnd');
      }
      
      // LLM Events
      if (message.includes('🤖 Starting LLM processing')) {
        startTimer('llmStart');
      }
      if (message.includes('📥 Received: llm_chunk')) {
        if (metricsRef.current.llmFirstToken === 0) {
          endTimer('llmFirstToken');
        }
      }
      
      // TTS Events
      if (message.includes('🔊 Azure HD TTS starting')) {
        startTimer('ttsStart');
      }
      if (message.includes('📥 Received: audio_chunk')) {
        if (metricsRef.current.ttsFirstAudio === 0) {
          endTimer('ttsFirstAudio');
          calculateBreakdown();
        }
      }
      
      originalConsoleLog.apply(console, args);
    };

    return () => {
      console.log = originalConsoleLog;
    };
  }, []);

  const averageLatency = history.length > 0 
    ? history.reduce((sum, h) => sum + h.total, 0) / history.length 
    : 0;

  const getPerformanceStatus = (latency: number) => {
    if (latency === 0) return { status: 'WAITING', color: 'text-gray-500', bg: 'bg-gray-100' };
    if (latency < 800) return { status: 'EXCELLENT', color: 'text-green-600', bg: 'bg-green-100' };
    if (latency < 1200) return { status: 'GOOD', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    return { status: 'NEEDS OPTIMIZATION', color: 'text-red-600', bg: 'bg-red-100' };
  };

  const currentPerf = getPerformanceStatus(breakdown.total);
  const avgPerf = getPerformanceStatus(averageLatency);

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 max-w-md mx-auto">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-gray-800 flex items-center justify-center gap-2">
          <Clock size={20} />
          TTFA Latency Monitor
        </h3>
        <p className="text-sm text-gray-600">Time To First Audio</p>
      </div>

      {/* Current Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className={`px-3 py-2 rounded-lg ${currentPerf.bg}`}>
            <div className={`text-2xl font-bold ${currentPerf.color}`}>
              {breakdown.total > 0 ? `${breakdown.total.toFixed(0)}ms` : '--'}
            </div>
            <div className="text-xs text-gray-600">Current</div>
          </div>
        </div>
        <div className="text-center">
          <div className={`px-3 py-2 rounded-lg ${avgPerf.bg}`}>
            <div className={`text-2xl font-bold ${avgPerf.color}`}>
              {averageLatency > 0 ? `${averageLatency.toFixed(0)}ms` : '--'}
            </div>
            <div className="text-xs text-gray-600">Average</div>
          </div>
        </div>
      </div>

      {/* Target Indicator */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <Target size={16} className="text-blue-500" />
        <span className="text-sm font-medium text-blue-600">Target: &lt; 800ms</span>
        {breakdown.total > 0 && breakdown.total < 800 && (
          <Zap size={16} className="text-green-500" />
        )}
      </div>

      {/* Breakdown */}
      {breakdown.total > 0 && (
        <div className="space-y-2 mb-4">
          <div className="text-sm font-medium text-gray-700">Breakdown:</div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span>STT (Deepgram):</span>
              <span className="font-mono">{breakdown.stt.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>LLM (First Token):</span>
              <span className="font-mono">{breakdown.llm.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>TTS (First Audio):</span>
              <span className="font-mono">{breakdown.tts.toFixed(0)}ms</span>
            </div>
            <div className="border-t pt-1 flex justify-between text-sm font-medium">
              <span>Total TTFA:</span>
              <span className="font-mono">{breakdown.total.toFixed(0)}ms</span>
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="text-center">
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${currentPerf.bg} ${currentPerf.color}`}>
          {isMonitoring ? 'MEASURING...' : currentPerf.status}
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-xs text-gray-600 mb-2">Recent Measurements:</div>
          <div className="flex gap-1">
            {history.slice(-10).map((h, i) => (
              <div
                key={i}
                className={`flex-1 h-8 rounded text-xs flex items-center justify-center ${
                  h.total < 800 ? 'bg-green-100 text-green-700' : 
                  h.total < 1200 ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-red-100 text-red-700'
                }`}
                title={`${h.total.toFixed(0)}ms`}
              >
                {h.total.toFixed(0)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};