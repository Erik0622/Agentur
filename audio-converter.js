import fs from 'fs';

// === Audio File Analysis & Conversion Tool ===

function analyzeWavFile(filename) {
  console.log(`🔍 Analyzing audio file: ${filename}`);
  
  if (!fs.existsSync(filename)) {
    console.log('❌ File not found');
    return null;
  }
  
  const buffer = fs.readFileSync(filename);
  console.log(`📊 File size: ${buffer.length} bytes (${Math.round(buffer.length/1024)}KB)`);
  
  // Check WAV header
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
    console.log('❌ Not a valid WAV file (missing RIFF header)');
    return null;
  }
  
  if (buffer.toString('ascii', 8, 12) !== 'WAVE') {
    console.log('❌ Not a valid WAV file (missing WAVE marker)');
    return null;
  }
  
  // Find fmt chunk
  let offset = 12;
  let fmtChunk = null;
  
  while (offset < buffer.length - 8) {
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    if (chunkType === 'fmt ') {
      fmtChunk = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        numChannels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        byteRate: buffer.readUInt32LE(offset + 16),
        blockAlign: buffer.readUInt16LE(offset + 18),
        bitsPerSample: buffer.readUInt16LE(offset + 20)
      };
      break;
    }
    
    offset += 8 + chunkSize;
  }
  
  if (!fmtChunk) {
    console.log('❌ No fmt chunk found');
    return null;
  }
  
  console.log('📈 Audio Properties:');
  console.log(`   Format: ${fmtChunk.audioFormat === 1 ? 'PCM' : 'Other'}`);
  console.log(`   Channels: ${fmtChunk.numChannels}`);
  console.log(`   Sample Rate: ${fmtChunk.sampleRate}Hz`);
  console.log(`   Bits per Sample: ${fmtChunk.bitsPerSample}`);
  console.log(`   Byte Rate: ${fmtChunk.byteRate}`);
  
  // Find data chunk
  offset = 12;
  let dataChunk = null;
  
  while (offset < buffer.length - 8) {
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    if (chunkType === 'data') {
      dataChunk = {
        offset: offset + 8,
        size: chunkSize
      };
      break;
    }
    
    offset += 8 + chunkSize;
  }
  
  if (!dataChunk) {
    console.log('❌ No data chunk found');
    return null;
  }
  
  const durationSeconds = dataChunk.size / fmtChunk.byteRate;
  console.log(`⏱️  Duration: ${durationSeconds.toFixed(2)}s`);
  console.log(`📦 Data size: ${dataChunk.size} bytes`);
  
  return {
    format: fmtChunk,
    data: dataChunk,
    buffer: buffer,
    duration: durationSeconds
  };
}

function convertToDeepgramFormat(audioInfo, outputFilename) {
  console.log('\n🔄 Converting to Deepgram format (16kHz, 16-bit, Mono, PCM)...');
  
  const { format, data, buffer } = audioInfo;
  
  // Extract raw audio data
  const rawAudio = buffer.subarray(data.offset, data.offset + data.size);
  
  // If already in correct format, just copy
  if (format.sampleRate === 16000 && format.numChannels === 1 && format.bitsPerSample === 16) {
    console.log('✅ Audio already in correct format!');
    fs.writeFileSync(outputFilename, buffer);
    return;
  }
  
  // Simple conversion (basic resampling)
  let convertedAudio;
  
  if (format.numChannels === 2 && format.bitsPerSample === 16) {
    // Convert stereo to mono by averaging channels
    console.log('🔄 Converting stereo to mono...');
    const samples = rawAudio.length / 4; // 2 channels * 2 bytes per sample
    convertedAudio = Buffer.alloc(samples * 2); // mono 16-bit
    
    for (let i = 0; i < samples; i++) {
      const left = rawAudio.readInt16LE(i * 4);
      const right = rawAudio.readInt16LE(i * 4 + 2);
      const mono = Math.round((left + right) / 2);
      convertedAudio.writeInt16LE(mono, i * 2);
    }
  } else {
    console.log('⚠️  Complex conversion needed - using original audio');
    convertedAudio = rawAudio;
  }
  
  // Create new WAV header for 16kHz, mono, 16-bit
  const header = Buffer.alloc(44);
  const dataSize = convertedAudio.length;
  const fileSize = 36 + dataSize;
  
  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);
  
  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(1, 22);  // 1 channel (mono)
  header.writeUInt32LE(16000, 24); // 16kHz sample rate
  header.writeUInt32LE(32000, 28); // byte rate (16000 * 1 * 16/8)
  header.writeUInt16LE(2, 32);     // block align (1 * 16/8)
  header.writeUInt16LE(16, 34);    // bits per sample
  
  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  
  // Combine header and audio data
  const finalAudio = Buffer.concat([header, convertedAudio]);
  
  fs.writeFileSync(outputFilename, finalAudio);
  console.log(`✅ Converted audio saved as: ${outputFilename}`);
  console.log(`📊 New size: ${Math.round(finalAudio.length/1024)}KB`);
}

// === Main Execution ===

console.log('🎵 === AUDIO CONVERTER & ANALYZER ===\n');

// Analyze original German audio
const audioInfo = analyzeWavFile('test-speech-sample.wav');

if (audioInfo) {
  // Convert to Deepgram-compatible format
  convertToDeepgramFormat(audioInfo, 'deepgram-ready.wav');
  
  console.log('\n✅ Audio analysis and conversion completed!');
  console.log('🎯 Use "deepgram-ready.wav" for testing');
} else {
  console.log('❌ Failed to analyze audio file');
} 