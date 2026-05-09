
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Image as ImageIcon, X, Sparkles, Mic, Play, Square, Eye, Layout, Clipboard, Loader2, Info } from 'lucide-react';
import { previewVoice } from '../services/geminiService';

interface InputSectionProps {
  topic: string;
  setTopic: (t: string) => void;
  slideCount: number;
  setSlideCount: (c: number) => void;
  voice: string;
  setVoice: (v: string) => void;
  files: File[];
  setFiles: (f: File[]) => void;
  onGenerate: () => void;
  onShowDemo: () => void;
  isGenerating: boolean;
  onClose?: () => void;
}

export const InputSection: React.FC<InputSectionProps> = ({
  topic, setTopic, slideCount, setSlideCount, voice, setVoice, files, setFiles, onGenerate, onShowDemo, isGenerating, onClose
}) => {
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles([...files, ...newFiles]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const file = new File([blob], `vlozeny_obrazek_${Date.now()}_${i}.png`, { type: blob.type });
          pastedFiles.push(file);
        }
      }
    }
    
    if (pastedFiles.length > 0) {
      setFiles([...files, ...pastedFiles]);
    }
  };

  useEffect(() => {
    files.forEach(file => {
      if (file.type.startsWith('image/') && !filePreviews[file.name + file.size]) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreviews(prev => ({ ...prev, [file.name + file.size]: reader.result as string }));
        };
        reader.readAsDataURL(file);
      }
    });
  }, [files]);

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    const key = fileToRemove.name + fileToRemove.size;
    const newPreviews = { ...filePreviews };
    delete newPreviews[key];
    setFilePreviews(newPreviews);
    setFiles(files.filter((_, i) => i !== index));
  };

  const handlePreviewVoice = async () => {
      if (isPreviewPlaying && audioRef.current) {
          audioRef.current.pause();
          setIsPreviewPlaying(false);
          return;
      }

      setIsPreviewLoading(true);
      const base64Audio = await previewVoice(voice);
      
      if (base64Audio) {
          if (audioRef.current) audioRef.current.pause();
          audioRef.current = new Audio(`data:audio/wav;base64,${base64Audio}`);
          audioRef.current.onended = () => setIsPreviewPlaying(false);
          audioRef.current.play();
          setIsPreviewPlaying(true);
      }
      setIsPreviewLoading(false);
  };

  const voices = [
    { id: 'Kore', name: 'Kore (Žena - Klidný)', gender: 'F' },
    { id: 'Fenrir', name: 'Fenrir (Muž - Hluboký)', gender: 'M' },
    { id: 'Puck', name: 'Puck (Neutrální)', gender: 'N' },
    { id: 'Aoede', name: 'Aoede (Žena - Jemný)', gender: 'F' },
    { id: 'Charon', name: 'Charon (Muž - Vážný)', gender: 'M' },
  ];

  return (
    <div className="w-full max-w-2xl mx-auto bg-[#0a0f1e]/80 backdrop-blur-2xl border border-white/5 rounded-2xl shadow-2xl animate-fade-in relative overflow-hidden">
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-20 p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 transition-all"
        >
          <X size={20} />
        </button>
      )}
      <div className="p-8 space-y-8 relative z-10">
        <div className="text-center">
          <h1 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic">
            AI Presenter <span className="text-blue-500">v2.5</span>
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.3em]">
            Generování profesionálních prezentací
          </p>
        </div>

        <div className="space-y-6">
          <div className="relative group">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Zadání tématu</label>
              <div className="flex items-center gap-2 text-[9px] font-mono text-blue-500/50">
                <Clipboard size={10} />
                <span>CTRL+V PODPOROVÁNO</span>
              </div>
            </div>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onPaste={handlePaste}
              placeholder="Např: Historie umělé inteligence a její dopad na školství..."
              className="w-full h-28 bg-black/40 border border-white/5 rounded-xl p-4 text-sm text-white focus:border-blue-500/50 focus:outline-none resize-none transition-all placeholder:text-slate-700 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Rozsah</label>
                <span className="text-xs font-mono text-blue-400">{slideCount} SLIDŮ</span>
              </div>
              <input
                type="range"
                min="3"
                max="15"
                value={slideCount}
                onChange={(e) => setSlideCount(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Hlas dabeře</label>
              <div className="flex gap-2">
                <select 
                  value={voice} 
                  onChange={(e) => { 
                    setVoice(e.target.value);
                    setIsPreviewPlaying(false);
                    if(audioRef.current) audioRef.current.pause();
                  }}
                  className="flex-1 bg-black/40 border border-white/5 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500/50 cursor-pointer"
                >
                  {voices.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <button 
                  onClick={handlePreviewVoice}
                  disabled={isPreviewLoading}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border transition-all ${
                    isPreviewPlaying 
                    ? 'bg-blue-600 border-blue-500 text-white' 
                    : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {isPreviewLoading ? <Loader2 size={12} className="animate-spin" /> : isPreviewPlaying ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-black/20 p-4 rounded-xl border border-white/5">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Podklady a přílohy</label>
            <div className="flex gap-3">
              <label className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl cursor-pointer transition-all group">
                <Upload size={14} className="text-slate-500 group-hover:text-blue-400" />
                <span className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 uppercase tracking-widest">Nahrát soubory</span>
                <input type="file" multiple accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
              </label>
              <button onClick={onShowDemo} className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-slate-500 hover:text-blue-400 transition-all">
                <Layout size={14} />
              </button>
            </div>
          </div>

          <div className="bg-blue-600/5 border border-blue-500/10 rounded-xl p-4 flex gap-3">
            <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Jak to funguje?</p>
              <p className="text-[9px] text-slate-500 leading-relaxed">Po vygenerování můžeš každý slide upravit kliknutím na <span className="text-blue-400 font-bold">"Upravit slide"</span>. Tam můžeš AI napsat co změnit, nebo nahrát vlastní obrázek.</p>
            </div>
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-black/40 rounded-xl border border-white/5">
              {files.map((file, index) => (
                <div key={index} className="group relative flex items-center gap-2 px-2 py-1.5 bg-white/5 border border-white/5 rounded-lg">
                  <FileText size={10} className="text-blue-400" />
                  <span className="text-[9px] font-bold text-slate-400 truncate max-w-[80px]">{file.name}</span>
                  <button onClick={() => removeFile(index)} className="text-slate-600 hover:text-red-400">
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onGenerate}
            disabled={!topic || isGenerating}
            className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center transition-all shadow-xl
              ${!topic || isGenerating 
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/20 hover:scale-[1.01] active:scale-[0.99]'
              }`}
          >
            {isGenerating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <span className="flex items-center gap-2"><Sparkles size={14} /> Spustit generování</span>
            )}
          </button>
        </div>
      </div>
      
      {/* Decorative lines */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>
    </div>
  );
};
