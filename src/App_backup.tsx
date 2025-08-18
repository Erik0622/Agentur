import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, Volume2, Bot } from 'lucide-react'
import AudioVisualizer from './components/AudioVisualizer'

// WebSocket URL (prod uses same host, dev uses localhost:8080)
const WS_URL =
  (import.meta.env.VITE_WS_URL ?? (window as any)?.NEXT_PUBLIC_WS_URL)
  ?? ((typeof window !== 'undefined' && window.location.hostname !== 'localhost')
        ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
        : 'ws://localhost:8080')

const OPUS_MIME = 'audio/webm;codecs=opus'
const CHUNK_MS = 20 // 20ms MediaRecorder timeslice

export default function App() {
  // UI state
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlayingResponse, setIsPlayingResponse] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [wsConnected, setWsConnected] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)

  // Audio + VAD refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const speakingRef = useRef<boolean>(false)
  const silenceCountRef = useRef<number>(0)

  // Mic capture refs
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const usePcmRef = useRef<boolean>(false)
  const pcmSourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const pcmProcessorRef = useRef<ScriptProcessorNode | null>(null)

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null)

  // MSE streaming refs
  const mseRef = useRef<MediaSource | null>(null)
  const sourceBufferRef = useRef<SourceBuffer | null>(null)
  const audioQueueRef = useRef<Uint8Array[]>([])
  const appendingRef = useRef<boolean>(false)
  const audioElRef = useRef<HTMLAudioElement | null>(null)

  function b64ToUint8(b64: string) {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  function appendNextChunk() {
    const sb = sourceBufferRef.current
    if (!sb || appendingRef.current || !audioQueueRef.current.length) return
    if (sb.updating) return
    appendingRef.current = true
    const next = audioQueueRef.current.shift()!
    sb.appendBuffer(next.buffer as ArrayBuffer)
  }

  function setupMse(mime: string = OPUS_MIME) {
    return new Promise<void>((resolve, reject) => {
      if (!MediaSource.isTypeSupported(mime)) {
        reject(new Error(`MIME not supported: ${mime}`))
        return
      }

      if (mseRef.current && sourceBufferRef.current) {
        resolve()
        return
      }

      const ms = new MediaSource()
      mseRef.current = ms

      const audioEl = audioElRef.current || new Audio()
      audioElRef.current = audioEl
      audioEl.autoplay = true

      const url = URL.createObjectURL(ms)
      audioEl.src = url

      ms.addEventListener('sourceopen', () => {
        try {
          const sb = ms.addSourceBuffer(mime)
          sourceBufferRef.current = sb
          sb.addEventListener('updateend', () => {
            appendingRef.current = false
            appendNextChunk()
          })
          resolve()
        } catch (e) {
          reject(e as Error)
        }
      }, { once: true })
    })
  }

  function endMseStream() {
    const ms = mseRef.current
    if (ms && ms.readyState === 'open') {
      try { ms.endOfStream() } catch {}
    }
  }

  function floatTo16BitPCM(float32: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32.length * 2)
    const view = new DataView(buffer)
    for (let i = 0; i < float32.length; i++) {
      let s = Math.max(-1, Math.min(1, float32[i]))
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    return buffer
  }

  function sendPCMFrame(float32: Float32Array) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(floatTo16BitPCM(float32))
    }
  }

  const startWebSocket = async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const payload = (data && (data.data ?? data)) as any
          switch (data.type) {
            case 'connected':
              setWsConnected(true)
              break
            case 'transcript':
              setTranscript(payload.text || '')
              break
            case 'llm_chunk':
              if (payload?.text) setAiResponse(prev => prev + payload.text)
              break
            case 'audio_header':
              setupMse(payload?.mime || OPUS_MIME).then(() => setIsPlayingResponse(true)).catch(() => {})
              break
            case 'audio_chunk':
              if (payload?.base64) {
                const u8 = b64ToUint8(payload.base64)
                audioQueueRef.current.push(u8)
                appendNextChunk()
              }
              break
            case 'end':
              endMseStream()
              setIsProcessing(false)
              break
            case 'error':
              if ((payload?.message || data.message) === 'No speech detected.') {
                setTranscript('Keine Sprache erkannt. Bitte sprechen Sie lauter.')
                setAiResponse('')
              } else {
                console.error('Voice processing error:', payload?.message || data.message)
              }
              break
            default:
              break
          }
        } catch (e) {
          console.error('WS message parse error:', e)
        }
      }

      ws.onclose = () => {
        setWsConnected(false)
        wsRef.current = null
        setTimeout(() => { if (!wsRef.current) startWebSocket() }, 3000)
      }

      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        setWsConnected(false)
      }
    } catch (e) {
      console.error('WS setup error:', e)
      setWsConnected(false)
    }
  }

  const sendAudioChunk = (chunk: Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(chunk)
    }
  }

  const startContinuousRecording = () => {
    if (!streamRef.current) return

    try {
      if (usePcmRef.current) {
        const ac = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)()
        audioContextRef.current = ac

        if (pcmProcessorRef.current) {
          try { pcmProcessorRef.current.disconnect() } catch {}
          pcmProcessorRef.current = null
        }
        if (pcmSourceRef.current) {
          try { pcmSourceRef.current.disconnect() } catch {}
          pcmSourceRef.current = null
        }

        const sourceNode = ac.createMediaStreamSource(streamRef.current)
        const processor = ac.createScriptProcessor(1024, 1, 1)
        pcmSourceRef.current = sourceNode
        pcmProcessorRef.current = processor

        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0)
          sendPCMFrame(input)
        }

        sourceNode.connect(processor)
        processor.connect(ac.destination)

        startWebSocket().then(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'start_audio' }))
          }
        })
      } else {
        const mr = new MediaRecorder(streamRef.current, { mimeType: OPUS_MIME })
        recorderRef.current = mr

        startWebSocket().then(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'start_audio' }))
          }
        })

        mr.ondataavailable = e => e.data.size && sendAudioChunk(e.data)
        mr.start(CHUNK_MS)
      }
    } catch (e) {
      console.error('Start recording failed:', e)
    }
  }

  const stopContinuousRecording = () => {
    if (usePcmRef.current) {
      if (pcmProcessorRef.current) {
        try { pcmProcessorRef.current.disconnect() } catch {}
        pcmProcessorRef.current = null
      }
      if (pcmSourceRef.current) {
        try { pcmSourceRef.current.disconnect() } catch {}
        pcmSourceRef.current = null
      }
    }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_audio' }))
    }
  }

  const startAudioVisualization = (stream: MediaStream, isForVAD = false) => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    analyserRef.current = audioContextRef.current.createAnalyser()
    const source = audioContextRef.current.createMediaStreamSource(stream)
    source.connect(analyserRef.current)

    analyserRef.current.fftSize = 256
    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const SPEECH_THRESHOLD = 12 // sensitiver als vorher
    const SILENCE_FRAMES_NEEDED = 18 // ~0.3s bei 60fps

    const update = () => {
      const active = isForVAD ? isListening : true
      if (analyserRef.current && active && audioContextRef.current?.state === 'running') {
        try {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength
          const level = (average / 255) * 100
          setAudioLevel(level)

          if (isForVAD && isListening) {
            const wasSpeaking = speakingRef.current
            const isSpeaking = level > SPEECH_THRESHOLD

            if (isSpeaking && !wasSpeaking) {
              speakingRef.current = true
              silenceCountRef.current = 0
              startContinuousRecording()
            } else if (!isSpeaking && wasSpeaking) {
              silenceCountRef.current += 1
              if (silenceCountRef.current >= SILENCE_FRAMES_NEEDED) {
                speakingRef.current = false
                silenceCountRef.current = 0
                stopContinuousRecording()
              }
            } else if (isSpeaking) {
              silenceCountRef.current = 0
            }
          }

          animationRef.current = requestAnimationFrame(update)
        } catch (e) {
          console.error('VAD update error:', e)
          setAudioLevel(0)
        }
      } else {
        setAudioLevel(0)
      }
    }

    update()
  }

  const startConversationMode = async () => {
    if (isListening) return
    try {
      const canOpus = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(OPUS_MIME)
      usePcmRef.current = !canOpus

      await startWebSocket()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1
        }
      })

      streamRef.current = stream
      setTranscript('')
      setAiResponse('')
      setIsListening(true)
      speakingRef.current = false
      silenceCountRef.current = 0

      startAudioVisualization(stream, true)
    } catch (e: any) {
      console.error('Gesprächsmodus-Start fehlgeschlagen:', e)
      const name = e?.name || ''
      if (name === 'NotAllowedError') alert('Mikrofonzugriff verweigert.')
      else if (name === 'NotFoundError') alert('Kein Mikrofon gefunden.')
      else alert('Konnte den Gesprächsmodus nicht starten.')
    }
  }

  const stopConversationMode = () => {
    if (!isListening) return
    setIsListening(false)
    speakingRef.current = false
    silenceCountRef.current = 0

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
    if (pcmProcessorRef.current) {
      try { pcmProcessorRef.current.disconnect() } catch {}
      pcmProcessorRef.current = null
    }
    if (pcmSourceRef.current) {
      try { pcmSourceRef.current.disconnect() } catch {}
      pcmSourceRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try { wsRef.current.send(JSON.stringify({ type: 'end_audio' })) } catch {}
    }
  }

  useEffect(() => {
    startWebSocket()
    return () => {
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
        wsRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">Voice Agent – Gesprächsmodus</h1>

        <div className="flex flex-col items-center space-y-4">
          <div className={`w-28 h-28 rounded-full flex items-center justify-center shadow ${isListening ? 'bg-red-600' : isPlayingResponse ? 'bg-green-600' : wsConnected ? 'bg-primary-600' : 'bg-gray-500'}`}>
            {isListening ? (
              <Mic className="h-12 w-12 text-white" />
            ) : isPlayingResponse ? (
              <Volume2 className="h-12 w-12 text-white" />
            ) : (
              <Bot className="h-12 w-12 text-white" />
            )}
          </div>

          <div className="w-full">
            <AudioVisualizer
              isRecording={isListening}
              isProcessing={isProcessing}
              isPlayingResponse={isPlayingResponse}
              audioLevel={audioLevel}
            />
          </div>

          <div className="text-center text-gray-600">
            {isListening ? (speakingRef.current ? 'Nehme auf…' : 'Höre zu…') : wsConnected ? 'Bereit' : 'Verbinde…'}
          </div>

          <div className="flex gap-3">
            <motion.button
              onClick={isListening ? stopConversationMode : startConversationMode}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`px-6 py-3 rounded-xl font-semibold text-white ${isListening ? 'bg-red-600' : 'bg-green-600'}`}
            >
              {isListening ? 'Gespräch beenden' : 'Gespräch starten'}
            </motion.button>
          </div>

          <div className="w-full mt-6 grid grid-cols-1 gap-3">
            {!!transcript && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-sm font-medium text-blue-800 mb-1">Sie:</div>
                <div className="text-blue-700 text-sm">{transcript}</div>
              </div>
            )}
            {!!aiResponse && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <div className="text-sm font-medium text-green-800 mb-1">KI-Agent:</div>
                <div className="text-green-700 text-sm">{aiResponse}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}