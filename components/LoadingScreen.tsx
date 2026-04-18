import React from 'react';

interface LoadingScreenProps {
  status: string;
  progress: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ status, progress }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
        <div 
          className="absolute inset-0 border-4 border-fuchsia-500 rounded-full border-t-transparent animate-spin"
        ></div>
        <div className="absolute inset-0 flex items-center justify-center font-bold text-xl text-white">
          {progress}%
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-2 animate-pulse">{status}</h2>
      <p className="text-zinc-400 max-w-md">
        AI právě analyzuje zadání, vyhledává zdroje, píše texty, generuje vizuály a nahrává audio komentář.
      </p>

      {/* Progress visual steps */}
      <div className="flex gap-2 mt-8">
        {[25, 50, 75, 100].map((step, idx) => (
          <div 
            key={idx}
            className={`h-2 w-16 rounded-full transition-colors duration-500 ${
              progress >= step ? 'bg-cyan-500' : 'bg-zinc-800'
            }`}
          />
        ))}
      </div>
    </div>
  );
};