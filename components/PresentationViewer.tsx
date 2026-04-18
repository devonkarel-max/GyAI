
import React, { useState, useEffect, useRef } from 'react';
import { PresentationData, Slide, Asset, SlideAsset } from '../types';
import { ChevronLeft, ChevronRight, Download, RefreshCw, MonitorPlay, Wand2, X, Info, Layout, Printer, Image as ImageIcon, CheckCircle2, AlertTriangle, Upload, Sparkles, Loader2, Save, Volume2, LogOut, Trash2, Plus, MousePointer2, RotateCcw } from 'lucide-react';
import { generatePPTX } from '../services/pptxService';
import { generateHTMLPresentation, ExportOptions } from '../services/htmlExportService';
import { updateSlideContent, generateSlideImage, validateImage, generateSlideAudio } from '../services/geminiService';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

interface PresentationViewerProps {
  data: PresentationData;
  loadingStatus: string;
  onReset: () => void;
  onUpdateSlide: (index: number, updates: Partial<Slide>) => void;
  onAddSlide?: () => void;
  onSave?: () => void;
  assets?: Asset[];
  onGenerateAsset?: (prompt: string) => Promise<Asset | undefined>;
}

export const PresentationViewer: React.FC<PresentationViewerProps> = ({ data, loadingStatus, onReset, onUpdateSlide, onAddSlide, onSave, assets = [], onGenerateAsset }) => {
  const [editableTitle, setEditableTitle] = useState(data?.presentationTitle || data?.topic || "Prezentace");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportTab, setExportTab] = useState<'files' | 'guide'>('files');
  const [isEditing, setIsEditing] = useState(false);
  const [aiUpdatePrompt, setAiUpdatePrompt] = useState("");
  const [assetPrompt, setAssetPrompt] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeAudio: true, includeNotes: true, includeSources: true,
    includeAnimations: true, includeDecorations: true, format: 'html'
  });
  
  const [viewportSize, setViewportSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const themeColor = data.themeColor || "#3b82f6";
  const totalSlides = data?.slides?.length || 0;
  const hasWelcome = !!data.welcomeSlide;
  const totalPages = totalSlides + (hasWelcome ? 1 : 0) + ((data?.sources?.length || 0) > 0 ? 1 : 0);

  const currentSlideIndex = hasWelcome ? currentIndex - 1 : currentIndex;
  const currentSlide = currentSlideIndex >= 0 && currentSlideIndex < totalSlides ? data.slides[currentSlideIndex] : null;
  const isWelcomePage = hasWelcome && currentIndex === 0;
  const isSourcesPage = currentIndex === totalPages - 1 && (data?.sources?.length || 0) > 0;
  
  useEffect(() => {
    if (isPlaying) setIsPlaying(false);
  }, [currentIndex]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const nextSlide = () => { if (currentIndex < totalPages - 1) setCurrentIndex(prev => prev + 1); };
  const prevSlide = () => { if (currentIndex > 0) setCurrentIndex(prev => prev - 1); };

  const handleDownloadImages = async () => {
    const zip = new JSZip();
    const slidesElements = document.querySelectorAll('.slide-card-raw');
    
    setIsUpdating(true);
    for (let i = 0; i < slidesElements.length; i++) {
        const canvas = await html2canvas(slidesElements[i] as HTMLElement, { backgroundColor: '#020617', scale: 2 });
        const dataUrl = canvas.toDataURL('image/png').split(',')[1];
        zip.file(`slide_${i + 1}.png`, dataUrl, { base64: true });
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${editableTitle}_fotky.zip`;
    a.click();
    setIsUpdating(false);
    setIsExportDialogOpen(false);
  };

  const handleUpdateSlideAI = async () => {
    if (currentSlideIndex < 0 || !aiUpdatePrompt) return;
    setIsUpdating(true);
    const updates = await updateSlideContent(data.slides[currentSlideIndex], aiUpdatePrompt);
    onUpdateSlide(currentSlideIndex, updates);
    setAiUpdatePrompt("");
    setIsUpdating(false);
  };

  const handleRegenerateImage = async () => {
      if (currentSlideIndex < 0) return;
      setIsUpdating(true);
      const img = await generateSlideImage(data.slides[currentSlideIndex].imagePrompt);
      if (img) {
          const validation = await validateImage(img, data.slides[currentSlideIndex].title, data.slides[currentSlideIndex].bulletPoints);
          onUpdateSlide(currentSlideIndex, { imageBase64: img, imageValidation: validation });
      }
      setIsUpdating(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && currentSlideIndex >= 0) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              const base64 = ev.target?.result?.toString().split(',')[1];
              if (base64) onUpdateSlide(currentSlideIndex, { imageBase64: base64, imageValidation: undefined });
          };
          reader.readAsDataURL(file);
      }
  };

  const handleAddAssetToSlide = (assetId: string) => {
    if (currentSlideIndex < 0) return;
    const newAsset: SlideAsset = {
      assetId,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0
    };
    const currentAssets = data.slides[currentSlideIndex].assets || [];
    onUpdateSlide(currentSlideIndex, { assets: [...currentAssets, newAsset] });
  };

  const handleUpdateAsset = (assetIdx: number, updates: Partial<SlideAsset>) => {
    if (currentSlideIndex < 0) return;
    const currentAssets = [...(data.slides[currentSlideIndex].assets || [])];
    currentAssets[assetIdx] = { ...currentAssets[assetIdx], ...updates };
    onUpdateSlide(currentSlideIndex, { assets: currentAssets });
  };

  const handleRemoveAsset = (assetIdx: number) => {
    if (currentSlideIndex < 0) return;
    const currentAssets = [...(data.slides[currentSlideIndex].assets || [])];
    currentAssets.splice(assetIdx, 1);
    onUpdateSlide(currentSlideIndex, { assets: currentAssets });
  };

  const currentPos = isSourcesPage ? { x: (data?.slides?.[totalSlides-1]?.x || 0) + 1600, y: (data?.slides?.[totalSlides-1]?.y || 0) } : (isWelcomePage ? { x: -1600, y: 0 } : { x: data?.slides?.[currentSlideIndex]?.x || 0, y: data?.slides?.[currentSlideIndex]?.y || 0 });
  const cameraX = (viewportSize.w / 2) - currentPos.x - 500;
  const cameraY = (viewportSize.h / 2) - currentPos.y - 300;

  return (
    <div className="fixed inset-0 bg-[#020617] overflow-hidden flex flex-col font-sans perspective-[2000px] selection:bg-blue-500/30">
      {/* Atmospheric Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      {/* Hidden elements for export */}
      <div className="fixed -left-[2000px] top-0 pointer-events-none">
          {data.slides.map((slide, i) => (
              <div key={i} id={`raw-slide-${i}`} className="slide-card-raw w-[1000px] h-[600px] bg-[#020617] flex overflow-hidden p-10 border border-white/5">
                   <div className={`flex w-full h-full ${slide.layout === 'reversed' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="w-1/2 p-10 flex flex-col justify-center">
                            <h2 className="text-white text-5xl font-black mb-8 leading-tight tracking-tighter uppercase italic">{slide.title}</h2>
                            <ul className="space-y-4">
                                {slide.bulletPoints.map((bp, j) => (
                                    <li key={j} className="text-slate-300 text-xl flex items-start">
                                        <span className="w-2 h-2 bg-blue-500 rounded-full mr-4 mt-2"></span> {bp}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {(slide.imageUrl || slide.imageBase64) && (
                            <div className="w-1/2 p-10 h-full">
                                <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover rounded-2xl" />
                            </div>
                        )}
                   </div>
              </div>
          ))}
      </div>

      <div className="absolute top-0 left-0 w-full h-full transition-transform duration-[1.2s] cubic-bezier(0.2, 0, 0.2, 1) transform-style-3d" style={{ transform: `translate3d(${cameraX}px, ${cameraY}px, 0)` }}>
        {/* Welcome Slide */}
        {data.welcomeSlide && (
            <div className={`absolute w-[1200px] h-[700px] transition-all duration-1000 overflow-hidden flex flex-col justify-center p-20 ${isWelcomePage ? 'opacity-100 scale-100 z-50' : 'opacity-10 scale-90 blur-[4px]'}`} style={{ left: -1600, top: 0 }}>
                <div className="max-w-3xl space-y-8">
                    <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] opacity-50" style={{ color: themeColor }}>{data.welcomeSlide.subtitle}</span>
                        <h1 className="text-8xl font-black text-white leading-[0.85] tracking-tighter uppercase italic">{data.welcomeSlide.title}</h1>
                    </div>
                    <div className="w-24 h-2" style={{ backgroundColor: themeColor }} />
                    <p className="text-2xl text-slate-400 font-medium leading-relaxed max-w-2xl">{data.welcomeSlide.description}</p>
                    <div className="pt-12 flex items-center gap-12">
                        <div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 block mb-1">Prezentuje</span>
                            <span className="text-xl font-bold text-white">{data.welcomeSlide.presenter}</span>
                        </div>
                        {data.welcomeSlide.website && (
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 block mb-1">Web</span>
                                <span className="text-xl font-bold text-white">{data.welcomeSlide.website}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}

        {(data?.slides || []).map((slide, index) => {
            const isActive = (hasWelcome ? index + 1 : index) === currentIndex;
            return (
                <div key={index} className={`absolute w-[1200px] h-[700px] transition-all duration-1000 overflow-hidden flex ${isActive ? 'opacity-100 scale-100 z-50' : 'opacity-10 scale-90 blur-[4px]'}`} style={{ left: slide.x || 0, top: slide.y || 0 }}>
                    <div className={`flex w-full h-full items-center gap-16 ${slide.layout === 'reversed' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="mb-4">
                                <span className="font-black text-5xl tracking-tighter block mb-2 opacity-30" style={{ color: themeColor }}>
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <h3 className="font-black text-white text-7xl leading-[0.9] tracking-tighter uppercase italic">{slide.title}</h3>
                            </div>
                            <ul className="space-y-6 mt-8">
                                {(slide.bulletPoints || []).map((bp, idx) => (
                                    <li key={idx} className="flex items-start text-2xl text-slate-300 leading-tight font-bold tracking-tight group">
                                        <span className="w-2.5 h-2.5 rounded-full mt-2.5 mr-6 shadow-[0_0_15px_rgba(59,130,246,0.6)] group-hover:scale-125 transition-transform" style={{ backgroundColor: themeColor }}></span> {bp}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        {(slide.imageUrl || slide.imageBase64) && (
                            <div className="flex-1 h-[80%] flex items-center justify-center relative">
                                <div className="w-full h-full rounded-[2.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-white/5 group">
                                    <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                                </div>
                                {slide.imageValidation && (
                                    <div className={`absolute bottom-8 right-8 px-4 py-2 rounded-full backdrop-blur-2xl border flex items-center gap-2 shadow-2xl ${slide.imageValidation.isOk ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                        {slide.imageValidation.isOk ? <CheckCircle2 className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
                                        <span className="text-[10px] font-black uppercase tracking-widest">{slide.imageValidation.isOk ? 'AI OK' : 'AI VAROVÁNÍ'}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Assets (Stickers) on Slide */}
                    {slide.assets?.map((sa, sIdx) => {
                        const asset = assets.find(a => a.id === sa.assetId);
                        if (!asset) return null;
                        return (
                            <div 
                                key={sIdx} 
                                className="absolute pointer-events-auto group/asset"
                                style={{ 
                                    left: `${sa.x}%`, 
                                    top: `${sa.y}%`, 
                                    transform: `translate(-50%, -50%) rotate(${sa.rotation}deg) scale(${sa.scale})`,
                                    zIndex: 100 + sIdx
                                }}
                            >
                                <img src={asset.imageBase64.startsWith('http') ? asset.imageBase64 : `data:image/png;base64,${asset.imageBase64}`} alt="" className="w-48 h-auto drop-shadow-2xl" />
                                {isEditing && (
                                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/80 backdrop-blur-md p-1 rounded-lg border border-white/10 opacity-0 group-hover/asset:opacity-100 transition-opacity">
                                        <button onClick={() => handleUpdateAsset(sIdx, { x: sa.x - 5 })} className="p-1 hover:bg-white/10 rounded"><ChevronLeft size={12}/></button>
                                        <button onClick={() => handleUpdateAsset(sIdx, { x: sa.x + 5 })} className="p-1 hover:bg-white/10 rounded"><ChevronRight size={12}/></button>
                                        <button onClick={() => handleUpdateAsset(sIdx, { scale: sa.scale + 0.1 })} className="p-1 hover:bg-white/10 rounded"><Plus size={12}/></button>
                                        <button onClick={() => handleUpdateAsset(sIdx, { scale: Math.max(0.1, sa.scale - 0.1) })} className="p-1 hover:bg-white/10 rounded"><X size={12} className="rotate-45"/></button>
                                        <button onClick={() => handleRemoveAsset(sIdx)} className="p-1 hover:bg-red-500/20 text-red-400 rounded"><Trash2 size={12}/></button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        })}

        {/* Sources Slide */}
        {data.sources.length > 0 && (
            <div className={`absolute w-[1200px] h-[700px] transition-all duration-1000 overflow-hidden flex flex-col justify-center p-20 ${isSourcesPage ? 'opacity-100 scale-100 z-50' : 'opacity-10 scale-90 blur-[4px]'}`} style={{ left: (data.slides[totalSlides-1]?.x || 0) + 1600, top: (data.slides[totalSlides-1]?.y || 0) }}>
                <h3 className="font-black text-white text-7xl leading-tight mb-12 tracking-tighter uppercase italic">Zdroje & Odkazy</h3>
                <div className="grid grid-cols-2 gap-8">
                    {data.sources.map((source, idx) => (
                        <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="group p-6 bg-white/5 border border-white/5 rounded-2xl hover:bg-blue-600/10 hover:border-blue-500/30 transition-all">
                            <h4 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">{source.title}</h4>
                            <p className="text-xs text-slate-500 truncate font-mono">{source.uri}</p>
                        </a>
                    ))}
                </div>
            </div>
        )}
      </div>

      {/* Editor Sidebar Backdrop */}
      {isEditing && (
          <div 
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[55] animate-fade-in cursor-pointer" 
            onClick={() => setIsEditing(false)}
          />
      )}

      {/* Right Sidebar Editor */}
      <aside className={`fixed right-0 top-0 h-full w-80 bg-[#0a0f1e]/90 backdrop-blur-2xl border-l border-white/5 z-[60] shadow-2xl transition-transform duration-500 ease-in-out flex flex-col ${isEditing ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 border-b border-white/5 flex justify-between items-center">
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                <Wand2 size={12} className="text-blue-500"/> Editor Slidu
              </h4>
              <button onClick={() => setIsEditing(false)} className="text-slate-500 hover:text-white transition-colors"><X size={16}/></button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              <div className="space-y-4">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Ruční úprava textu</label>
                  <div className="space-y-3">
                      <input 
                        type="text" 
                        value={currentSlide?.title || ''} 
                        onChange={(e) => currentSlideIndex >= 0 && onUpdateSlide(currentSlideIndex, { title: e.target.value })}
                        placeholder="Nadpis slidu"
                        className="w-full bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
                      />
                      <textarea 
                        value={currentSlide?.bulletPoints.join('\n') || ''} 
                        onChange={(e) => currentSlideIndex >= 0 && onUpdateSlide(currentSlideIndex, { bulletPoints: e.target.value.split('\n') })}
                        placeholder="Odrážky (každá na nový řádek)"
                        className="w-full h-32 bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none resize-none"
                      />
                  </div>
              </div>

              <div className="space-y-3 border-t border-white/5 pt-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">AI ÚPRAVA (TEXT + OBRAZ)</label>
                    <div className="group relative">
                      <Info size={12} className="text-slate-600 cursor-help" />
                      <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-black border border-white/10 rounded text-[8px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        Zkus: "přidej sticker kočky na bílém pozadí" pro efekt bez pozadí v PPTX.
                      </div>
                    </div>
                  </div>
                  <textarea 
                    value={aiUpdatePrompt}
                    onChange={(e) => setAiUpdatePrompt(e.target.value)}
                    placeholder="Např: 'Změň obrázek na futuristický a přidej odrážku o AI'..."
                    className="w-full h-32 bg-black/40 border border-white/5 rounded-xl p-4 text-xs text-white focus:border-blue-500/50 focus:outline-none resize-none transition-all placeholder:text-slate-700 font-medium"
                  />
                  <button 
                    onClick={handleUpdateSlideAI} 
                    disabled={isUpdating || !aiUpdatePrompt}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-blue-900/20"
                  >
                      {isUpdating ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} Upravit pomocí AI
                  </button>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Knihovna prvků (Stickers)</label>
                  <div className="space-y-3">
                      <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={assetPrompt} 
                            onChange={(e) => setAssetPrompt(e.target.value)}
                            placeholder="Např: 'mrak', 'raketa'..."
                            className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-white focus:border-blue-500/50 focus:outline-none"
                        />
                        <button 
                            onClick={async () => {
                                if (!auth.currentUser) {
                                    alert("Pro generování prvků se musíš přihlásit.");
                                    return;
                                }
                                if (onGenerateAsset && assetPrompt) {
                                    try {
                                        setIsUpdating(true);
                                        await onGenerateAsset(assetPrompt);
                                        setAssetPrompt("");
                                    } catch (err) {
                                        console.error(err);
                                    } finally {
                                        setIsUpdating(false);
                                    }
                                }
                            }}
                            disabled={isUpdating || !assetPrompt}
                            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-all"
                        >
                            {isUpdating ? <Loader2 size={14} className="animate-spin"/> : <Plus size={14}/>}
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                          {assets.map(asset => (
                              <button 
                                key={asset.id} 
                                onClick={() => handleAddAssetToSlide(asset.id)}
                                className="aspect-square bg-white/5 border border-white/5 rounded-lg p-2 hover:bg-white/10 hover:border-white/20 transition-all group relative"
                              >
                                  <img src={asset.imageBase64.startsWith('http') ? asset.imageBase64 : `data:image/png;base64,${asset.imageBase64}`} alt={asset.name} className="w-full h-full object-contain" />
                                  <div className="absolute inset-0 bg-blue-600/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                                      <Plus size={16} className="text-white"/>
                                  </div>
                              </button>
                          ))}
                      </div>
                  </div>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6">
                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Vizuální úprava</label>
                  <div className="grid grid-cols-1 gap-2">
                      <label className="flex items-center justify-center gap-3 p-5 bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/30 rounded-xl cursor-pointer transition-all group shadow-lg shadow-blue-900/20">
                          <Upload size={18} className="group-hover:-translate-y-1 transition-transform"/>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest">Nahrát vlastní obrázek</span>
                            <span className="text-[8px] opacity-70 font-bold uppercase">Nahradí aktuální AI obrázek</span>
                          </div>
                          <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*"/>
                      </label>
                      <button onClick={handleRegenerateImage} disabled={isUpdating} className="flex items-center justify-center gap-3 p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all group">
                          <RefreshCw size={14} className={`text-indigo-400 group-hover:rotate-180 transition-transform duration-500 ${isUpdating ? 'animate-spin' : ''}`}/>
                          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Regenerovat AI obrázek</span>
                      </button>
                  </div>
              </div>

              {currentSlide?.imageValidation && (
                  <div className={`p-4 rounded-xl border ${currentSlide.imageValidation.isOk ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
                      <h5 className={`text-[8px] font-black uppercase mb-1 tracking-widest ${currentSlide.imageValidation.isOk ? 'text-emerald-400' : 'text-red-400'}`}>Analýza obrazu:</h5>
                      <p className="text-slate-500 text-[10px] italic leading-relaxed">"{currentSlide.imageValidation.reason}"</p>
                  </div>
              )}
          </div>
      </aside>

      {/* Top Navigation */}
      <nav className="absolute top-0 left-0 w-full p-6 z-50 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto flex gap-2">
           <button onClick={onReset} className="w-10 h-10 rounded-xl bg-[#0a0f1e]/80 backdrop-blur-xl flex items-center justify-center text-slate-400 border border-white/5 shadow-xl hover:text-white transition-all group relative">
             <RefreshCw size={18} />
             <span className="absolute left-full ml-2 px-2 py-1 bg-black text-[8px] font-black uppercase tracking-widest rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">Nová prezentace</span>
           </button>
        </div>
        
        <div className="pointer-events-auto flex items-center gap-3">
            <div className="flex flex-col items-end mr-4">
              <input type="text" value={editableTitle} onChange={(e) => setEditableTitle(e.target.value)} className="text-xl font-black text-white text-right bg-transparent border-none focus:outline-none tracking-tighter uppercase italic" />
              <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.3em]">Prezentace v2.5</span>
            </div>
            
            {(currentSlide?.audioUrl || currentSlide?.audioBase64) && (
              <button 
                onClick={toggleAudio} 
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg ${isPlaying ? 'bg-blue-600 text-white animate-pulse' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-white/10'}`}
              >
                <Volume2 size={18} />
                <audio 
                  ref={audioRef} 
                  src={currentSlide.audioUrl || `data:audio/wav;base64,${currentSlide.audioBase64}`} 
                  onEnded={() => setIsPlaying(false)}
                />
              </button>
            )}
        </div>
      </nav>

      {/* Export Dialog */}
      {isExportDialogOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#020617]/90 backdrop-blur-xl animate-fade-in">
              <div className="w-full max-w-xl bg-[#0a0f1e] border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                  <div className="flex border-b border-white/5">
                      <button onClick={() => setExportTab('files')} className={`flex-1 py-5 font-black text-[10px] tracking-widest uppercase transition-all ${exportTab === 'files' ? 'text-blue-400 border-b-2 border-blue-500 bg-blue-500/5' : 'text-slate-600'}`}>Soubory</button>
                      <button onClick={() => setExportTab('guide')} className={`flex-1 py-5 font-black text-[10px] tracking-widest uppercase transition-all ${exportTab === 'guide' ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5' : 'text-slate-600'}`}>Nápověda</button>
                      <button onClick={() => setIsExportDialogOpen(false)} className="px-6 text-slate-600 hover:text-white transition-colors"><X size={20}/></button>
                  </div>

                  <div className="p-8">
                    {exportTab === 'files' ? (
                        <div className="grid grid-cols-2 gap-3">
                            <ExportFileCard title="PowerPoint" desc=".pptx pro Teams" icon={<Layout className="text-orange-500"/>} onClick={() => generatePPTX(data, assets)} />
                            <ExportFileCard title="Fotky Slajdů" desc=".zip kolekce PNG" icon={<ImageIcon className="text-emerald-500"/>} onClick={handleDownloadImages} />
                            <ExportFileCard title="PDF Dokument" desc="Pro rychlý náhled" icon={<Printer className="text-red-500"/>} onClick={() => window.print()} />
                            <ExportFileCard title="Interaktivní Web" desc=".html s audiem" icon={<MonitorPlay className="text-blue-500"/>} onClick={() => {}} />
                        </div>
                    ) : (
                        <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-6 flex gap-4">
                            <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                            <p className="text-slate-500 text-xs leading-relaxed">Nahraj PPTX nebo PDF soubor do "Soubory" v Teams. Pro nejlepší dojem pošli učiteli i HTML soubor, který obsahuje animace a audio doprovod.</p>
                        </div>
                    )}
                  </div>
                  
                  <div className="p-8 pt-0 flex justify-end">
                      <button onClick={() => setIsExportDialogOpen(false)} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg text-[10px] uppercase tracking-widest transition-all">Zavřít</button>
                  </div>
              </div>
          </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#0a0f1e]/80 backdrop-blur-2xl border border-white/5 px-4 py-2 rounded-2xl shadow-2xl z-50">
        <div className="flex items-center gap-2 border-r border-white/10 pr-4">
          <button onClick={prevSlide} disabled={currentIndex === 0} className="p-2 text-white disabled:opacity-10 hover:scale-125 transition-all"><ChevronLeft size={20} /></button>
          <div className="text-white font-mono text-xs w-16 text-center tracking-widest">{String(currentIndex + 1).padStart(2, '0')} <span className="text-slate-700">/ {String(totalPages).padStart(2, '0')}</span></div>
          <button onClick={nextSlide} disabled={currentIndex === totalPages - 1} className="p-2 text-white disabled:opacity-10 hover:scale-125 transition-all"><ChevronRight size={20} /></button>
        </div>

        <div className="flex items-center gap-2">
          {onAddSlide && (
            <button 
              onClick={onAddSlide}
              className="bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center transition-all"
            >
              <Layout size={14} className="mr-2" />
              Přidat slide
            </button>
          )}

          <button 
            onClick={() => setIsEditing(!isEditing)} 
            className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all border ${isEditing ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <Wand2 size={14} />
            {isEditing ? 'Zavřít editor' : 'Upravit slide'}
          </button>
          
          {onSave && (
            <button 
              onClick={onSave} 
              disabled={loadingStatus.includes('Ukládám')}
              className="bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/30 px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center transition-all disabled:opacity-50"
            >
              {loadingStatus.includes('Ukládám') ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />} 
              Uložit
            </button>
          )}
          <button onClick={() => setIsExportDialogOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center shadow-lg transition-all"><MonitorPlay size={14} className="mr-2" /> Exportovat</button>
        </div>
      </div>
    </div>
  );
};

const ExportFileCard = ({ title, icon, desc, onClick }: any) => (
    <button onClick={onClick} className="bg-white/[0.03] p-6 rounded-2xl border border-white/5 flex flex-col text-left group hover:bg-white/[0.06] hover:border-white/10 transition-all">
        <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">{icon}</div>
            <h4 className="font-black text-white text-[10px] uppercase tracking-widest">{title}</h4>
        </div>
        <p className="text-slate-500 text-[10px] leading-relaxed font-medium">{desc}</p>
    </button>
);
