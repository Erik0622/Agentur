import { useState, useRef, useCallback } from 'react';

export const useMediaRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 48000
      });

      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      mediaRecorder.start();
      console.log('🎤 Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state !== 'recording') {
        reject(new Error('Not recording'));
        return;
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('🎤 Audio recorded:', event.data.size, 'bytes, type:', event.data.type);
          
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = (reader.result as string).split(',')[1];
            console.log('🎤 Base64 audio length:', base64.length);
            
            // Debug audio format
            try {
              const headerBytes = atob(base64.substring(0, 16));
              const hexHeader = Array.from(headerBytes)
                .map(b => b.charCodeAt(0).toString(16).padStart(2, '0'))
                .join(' ');
              console.log('🎤 Audio header hex:', hexHeader);
            } catch (e) {
              console.log('🎤 Could not decode header');
            }
            
            resolve(base64);
          };
          reader.onerror = () => reject(new Error('Failed to read audio data'));
          reader.readAsDataURL(event.data);
        } else {
          reject(new Error('No audio data recorded'));
        }
      };

      mediaRecorder.stop();
      setIsRecording(false);

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }

      console.log('🎤 Recording stopped');
    });
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording
  };
};
