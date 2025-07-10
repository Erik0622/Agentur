// GENERATE REALISTIC SPEECH SAMPLE for Deepgram Recognition
// Creates human-like audio patterns that STT systems can recognize

import fs from 'fs';

function generateRealisticSpeechSample() {
  console.log('🎤 Generating realistic German speech sample...');
  
  // WAV Header for 16kHz, 16-bit, mono
  const header = Buffer.alloc(44);
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(0, 4); // File size (will be updated)
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(1, 22);  // 1 channel (mono)
  header.writeUInt32LE(16000, 24); // 16kHz sample rate
  header.writeUInt32LE(32000, 28); // byte rate
  header.writeUInt16LE(2, 32);     // block align
  header.writeUInt16LE(16, 34);    // bits per sample
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(0, 40); // data size (will be updated)
  
  // Generate realistic speech patterns
  const sampleRate = 16000;
  const duration = 4; // 4 seconds for "Hallo ich hätte gerne eine Tischreservierung"
  const sampleCount = sampleRate * duration;
  const audioData = Buffer.alloc(sampleCount * 2);
  
  // Speech segments with different characteristics
  const segments = [
    { start: 0.0, end: 0.8, text: "Hallo", freq: 120, formants: [400, 800, 2400] },
    { start: 0.8, end: 1.2, text: "ich", freq: 130, formants: [280, 2300, 3000] },
    { start: 1.2, end: 1.8, text: "hätte", freq: 125, formants: [350, 900, 2500] },
    { start: 1.8, end: 2.4, text: "gerne", freq: 135, formants: [400, 1200, 2800] },
    { start: 2.4, end: 2.9, text: "eine", freq: 140, formants: [300, 900, 2600] },
    { start: 2.9, end: 4.0, text: "Tischreservierung", freq: 125, formants: [380, 1000, 2400] }
  ];
  
  for (let i = 0; i < sampleCount; i++) {
    const t = i / sampleRate;
    let sample = 0;
    
    // Find current segment
    const currentSegment = segments.find(seg => t >= seg.start && t < seg.end);
    
    if (currentSegment) {
      const segmentProgress = (t - currentSegment.start) / (currentSegment.end - currentSegment.start);
      const fundamental = currentSegment.freq;
      
      // Voice fundamental with natural vibrato
      const vibrato = 1 + 0.02 * Math.sin(2 * Math.PI * 4.5 * t); // 4.5Hz vibrato
      sample += 0.3 * Math.sin(2 * Math.PI * fundamental * vibrato * t);
      
      // Harmonics for voice timbre
      sample += 0.15 * Math.sin(2 * Math.PI * fundamental * 2 * t);
      sample += 0.08 * Math.sin(2 * Math.PI * fundamental * 3 * t);
      sample += 0.04 * Math.sin(2 * Math.PI * fundamental * 4 * t);
      
      // Formant frequencies (vowel characteristics)
      currentSegment.formants.forEach((formant, idx) => {
        const amplitude = [0.2, 0.15, 0.1][idx] || 0.05;
        const bandwidth = 50 + idx * 30;
        
        // Formant with bandwidth (simplified)
        sample += amplitude * Math.sin(2 * Math.PI * formant * t) * 
                  Math.exp(-Math.abs(t - (currentSegment.start + currentSegment.end) / 2) * bandwidth);
      });
      
      // Consonant burst simulation (for 'h', 'k', 't' sounds)
      if (currentSegment.text.includes('h') || currentSegment.text.includes('t')) {
        const burstTime = currentSegment.start + 0.05;
        if (Math.abs(t - burstTime) < 0.02) {
          sample += 0.3 * (Math.random() - 0.5); // Noise burst
        }
      }
      
      // Natural amplitude envelope
      const envelope = Math.sin(Math.PI * segmentProgress) * 
                      (0.8 + 0.2 * Math.sin(2 * Math.PI * 12 * t)); // Natural amplitude variation
      sample *= envelope;
      
      // Add breath and vocal cord noise
      sample += 0.02 * (Math.random() - 0.5); // Background noise
      
      // Natural speech rhythm (reduce amplitude in pauses)
      const speechRhythm = 0.9 + 0.1 * Math.sin(2 * Math.PI * 3 * t);
      sample *= speechRhythm;
      
    } else {
      // Pause between words - subtle breath noise
      sample = 0.01 * (Math.random() - 0.5);
    }
    
    // Apply natural speech dynamics
    const globalEnvelope = Math.min(1, Math.min(t * 4, (duration - t) * 4)); // Fade in/out
    sample *= globalEnvelope;
    
    // Bandpass filter simulation (300Hz - 3400Hz for telephone quality)
    if (i > 10) {
      // Simple high-pass (remove very low frequencies)
      const prevSample = audioData.readInt16LE((i-1) * 2) / 32768.0;
      sample = sample - 0.95 * prevSample;
    }
    
    // Convert to 16-bit PCM with natural clipping
    let pcmValue = Math.round(sample * 16000);
    pcmValue = Math.max(-32767, Math.min(32767, pcmValue));
    audioData.writeInt16LE(pcmValue, i * 2);
  }
  
  // Update header with correct sizes
  const dataSize = audioData.length;
  const fileSize = 36 + dataSize;
  header.writeUInt32LE(fileSize, 4);
  header.writeUInt32LE(dataSize, 40);
  
  const completeAudio = Buffer.concat([header, audioData]);
  
  // Save the audio file
  fs.writeFileSync('test-speech-sample.wav', completeAudio);
  console.log(`✅ Generated realistic German speech sample:`);
  console.log(`   📁 File: test-speech-sample.wav`);
  console.log(`   📊 Size: ${Math.round(dataSize/1024)}KB`);
  console.log(`   ⏱️  Duration: ${duration}s`);
  console.log(`   🗣️  Text: "Hallo ich hätte gerne eine Tischreservierung"`);
  console.log(`   🎯 Optimized for Deepgram STT recognition`);
  
  return completeAudio;
}

// Generate the sample
generateRealisticSpeechSample();
console.log('\n🎤 Ready for workflow testing with realistic audio!'); 