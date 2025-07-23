import { useState, useCallback } from 'react';

interface VoiceResponse {
  type: string;
  data: any;
}

export const useVoiceAgent = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const sendAudio = useCallback(async (audioBase64: string, voice: string = 'german_m2') => {
    console.log('📤 Sending audio to API:', {
      audioLength: audioBase64.length,
      voice,
      preview: audioBase64.substring(0, 50) + '...'
    });

    setIsLoading(true);
    setError(null);
    setTranscript('');
    setResponse('');

    try {
      const response = await fetch('/api/voice-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson'
        },
        body: JSON.stringify({
          audio: audioBase64,  // WICHTIG: 'audio' key
          voice: voice
        })
      });

      console.log('📥 Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Stream processing
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data: VoiceResponse = JSON.parse(line);
            console.log('📥 Stream data:', data.type, data.data);
            
            switch (data.type) {
              case 'transcript':
                setTranscript(data.data.text);
                break;
              case 'llm_chunk':
                setResponse(prev => prev + data.data.text);
                break;
              case 'llm_response':
                setResponse(data.data.text);
                break;
              case 'audio_chunk':
                playAudio(data.data.base64, data.data.format);
                break;
              case 'error':
                setError(data.data.message);
                break;
              case 'end':
                console.log('✅ Stream ended');
                break;
            }
          } catch (e) {
            console.warn('⚠️ Parse error:', e, 'Line:', line);
          }
        }
      }
    } catch (error) {
      console.error('❌ Voice API Error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const playAudio = useCallback((base64Audio: string, format: string) => {
    console.log('🔊 Playing audio:', format, base64Audio.length, 'chars');
    
    try {
      const audioBlob = new Blob([
        Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))
      ], { type: `audio/${format}` });
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.play().catch(e => console.error('Audio play error:', e));
    } catch (e) {
      console.error('Audio creation error:', e);
    }
  }, []);

  return {
    sendAudio,
    isRecording,
    setIsRecording,
    transcript,
    response,
    error,
    isLoading
  };
};
