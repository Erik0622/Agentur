import React from 'react';
import { motion } from 'framer-motion';

interface AudioVisualizerProps {
  isRecording: boolean;
  isProcessing: boolean;
  isPlayingResponse: boolean;
  audioLevel: number;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isRecording,
  isProcessing: _,
  isPlayingResponse,
  audioLevel
}) => {
  // Audio bars für Visualisierung
  const generateBars = () => {
    const bars = [];
    const numBars = 20;
    
    for (let i = 0; i < numBars; i++) {
      const height = isRecording 
        ? Math.max(8, (audioLevel / 100) * 60 + Math.random() * 20)
        : isPlayingResponse
        ? Math.random() * 40 + 10
        : 8;
        
      bars.push(
        <motion.div
          key={i}
          className={`w-1 rounded-full mx-0.5 ${
            isRecording 
              ? 'bg-red-500' 
              : isPlayingResponse 
              ? 'bg-green-500' 
              : 'bg-gray-300'
          }`}
          animate={{ height: `${height}px` }}
          transition={{ 
            duration: isRecording || isPlayingResponse ? 0.1 : 0.5,
            repeat: isPlayingResponse ? Infinity : 0,
            repeatType: "reverse"
          }}
        />
      );
    }
    
    return bars;
  };

  return (
    <div className="flex items-center justify-center h-16 w-full max-w-md mx-auto">
      <div className="flex items-end h-full">
        {generateBars()}
      </div>
    </div>
  );
};

export default AudioVisualizer; 