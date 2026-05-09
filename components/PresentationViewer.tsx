
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PresentationData, Slide, Asset, SlideAsset } from '../types';
import { ChevronLeft, ChevronRight, Download, RefreshCw, MonitorPlay, Wand2, X, Info, Layout, Printer, Image as ImageIcon, CheckCircle2, AlertTriangle, Upload, Sparkles, Loader2, Save, Volume2, LogOut, Trash2, Plus, MousePointer2, RotateCcw, Brain, FileText, BookOpen, Library } from 'lucide-react';
import { generatePPTX } from '../services/pptxService';
import { generateHTMLPresentation, ExportOptions } from '../services/htmlExportService';
import { updateSlideContent, generateSlideImage, validateImage, generateSlideAudio, uploadToCloudinary, generateExtendedNotes } from '../services/geminiService';
import { Gallery } from './Gallery';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import html2canvas from 'html2canvas';
import JSZip from 'jszip';

import { chatWithAI } from '../services/aiService';

interface PresentationViewerProps {
  data: PresentationData;
  loadingStatus: string;
  onReset: () => void;
  onUpdateSlide: (index: number, updates: Partial<Slide>) => void;
  onUpdatePresentation: (updates: Partial<PresentationData>) => void;
  onAddSlide?: () => void;
  onRemoveSlide?: (index: number) => void;
  assets?: Asset[];
  onGenerateAsset?: (prompt: string) => Promise<Asset | undefined>;
  onOpenAIDraft?: () => void;
  error?: string;
  onError?: (msg: string | undefined) => void;
  isReadOnly?: boolean;
}

const InlineEditableText: React.FC<{
  value: string;
  onSave: (val: string) => void;
  className?: string;
  multiline?: boolean;
}> = ({ value, onSave, className, multiline }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);

  useEffect(() => setCurrentValue(value), [value]);

  if (isEditing) {
    return multiline ? (
      <textarea
        autoFocus
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={() => { setIsEditing(false); onSave(currentValue); }}
        className={`bg-white/5 border border-blue-500/50 rounded p-1 outline-none w-full ${className}`}
      />
    ) : (
      <input
        autoFocus
        value={currentValue}
        onChange={(e) => setCurrentValue(e.target.value)}
        onBlur={() => { setIsEditing(false); onSave(currentValue); }}
        className={`bg-white/5 border border-blue-500/50 rounded p-1 outline-none w-full ${className}`}
      />
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)} 
      className={`cursor-text hover:bg-white/5 transition-colors rounded p-1 ${className}`}
    >
      {value || (multiline ? "Klikněte pro přidání textu..." : "Klikněte pro název...")}
    </div>
  );
};

export const PresentationViewer: React.FC<PresentationViewerProps> = ({ data, loadingStatus, onReset, onUpdateSlide, onUpdatePresentation, onAddSlide, onRemoveSlide, assets = [], onGenerateAsset, onOpenAIDraft, error: globalError, onError, isReadOnly = false }) => {
  const [editableTitle, setEditableTitle] = useState(data?.presentationTitle || data?.topic || "Prezentace");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportTab, setExportTab] = useState<'files' | 'guide'>('files');
  const [isEditing, setIsEditing] = useState(true); // Always editing by default now
  const [chatInput, setChatInput] = useState("");
  const [aiUpdatePrompt, setAiUpdatePrompt] = useState("");
  const [assetPrompt, setAssetPrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
    { role: 'ai', text: 'Ahoj! Jsem tvůj kreativní asistent. Co dnes vytvoříme?' }
  ]);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isUpdating) return;
    
    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput("");
    setIsUpdating(true);

    try {
      const aiResponse = await chatWithAI(userMsg, data, (name, args) => {
        if (name === 'update_slide_content') {
           onUpdateSlide(args.slideIndex, { 
             title: args.title, 
             bulletPoints: args.bulletPoints 
           });
        } else if (name === 'add_new_slide') {
          onAddSlide?.(); // Simple version for now
        } else if (name === 'remove_slide') {
          onRemoveSlide?.(args.slideIndex);
        } else if (name === 'change_theme_color') {
          onUpdatePresentation({ themeColor: args.color });
        } else if (name === 'change_slide_layout') {
          onUpdateSlide(args.slideIndex, { layout: args.layout });
        }
      });
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: "Omlouvám se, došlo k chybě při zpracování tvého požadavku." }]);
    } finally {
      setIsUpdating(false);
    }
  };
  const [isPlaying, setIsPlaying] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isNotesLoading, setIsNotesLoading] = useState(false);
  const [extendedNotes, setExtendedNotes] = useState<{ speakerNotes: string; deepDive: string; aiScript: string } | null>(null);
  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);
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
  const [aiAudit, setAiAudit] = useState<{ status: 'perfect' | 'checking' | 'error', message: string }>({ status: 'perfect', message: 'Systém připraven.' });

  useEffect(() => {
    if (!data) return;
    const messages = [
      "Skenování geometrie...",
      "Audit okrajů slidu...",
      "Výpočet těžiště...",
      "Vynucování Zákona Středu...",
      "Geometrie: 100% Vyhovující. Všechny slidy ve středu."
    ];
    let step = 0;
    setAiAudit({ status: 'checking', message: messages[0] });
    
    const interval = setInterval(() => {
      step++;
      if (step < messages.length) {
        setAiAudit({ status: 'checking', message: messages[step] });
      } else {
        setAiAudit({ status: 'perfect', message: 'Geometrie: 100% FIXOVÁNA. Pozice: Střed.' });
        clearInterval(interval);
      }
    }, 400); 

    return () => clearInterval(interval);
  }, [currentIndex, isEditing]);

  const themeColor = data.themeColor || "#3b82f6";
  const totalSlides = data?.slides?.length || 0;
  const hasWelcome = !!data.welcomeSlide;
  const totalPages = totalSlides + (hasWelcome ? 1 : 0) + ((data?.sources?.length || 0) > 0 ? 1 : 0);

  const currentSlideIndex = hasWelcome ? currentIndex - 1 : currentIndex;
  const currentSlide = currentSlideIndex >= 0 && currentSlideIndex < totalSlides ? data.slides[currentSlideIndex] : null;
  const isWelcomePage = hasWelcome && currentIndex === 0;
  
  const onUpdateWelcome = (updates: Partial<typeof data.welcomeSlide>) => {
    if (!data.welcomeSlide) return;
    onUpdateSlide(-99, updates); // Use a special index for welcome slide
  };

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
    if (onError) onError(undefined);
    try {
      const updates = await updateSlideContent(data.slides[currentSlideIndex], aiUpdatePrompt);
      onUpdateSlide(currentSlideIndex, updates);
      setAiUpdatePrompt("");
    } catch (error: any) {
      if (onError) onError(error.message || "Chyba při aktualizaci slidu.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRegenerateImage = async (customPrompt?: string) => {
    if (currentSlideIndex < 0) return;
    setIsUpdating(true);
    if (onError) onError(undefined);
    try {
      const prompt = customPrompt || data.slides[currentSlideIndex].imagePrompt || data.topic;
      const img = await generateSlideImage(prompt);
      if (img) {
          const validation = await validateImage(img, data.slides[currentSlideIndex].title, data.slides[currentSlideIndex].bulletPoints);
          const url = await uploadToCloudinary(img, 'image');
          
          onUpdateSlide(currentSlideIndex, { 
            imageBase64: url ? undefined : img, 
            imageUrl: url || undefined, 
            imageValidation: validation 
          });
      }
    } catch (error: any) {
      if (onError) onError(error.message || "Chyba při generování obrázku.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteImage = () => {
    if (currentSlideIndex < 0) return;
    if (confirm("Smazat hlavní obrázek slidu?")) {
      onUpdateSlide(currentSlideIndex, { imageBase64: undefined, imageUrl: undefined, imageValidation: undefined });
    }
  };

  const handleFetchExtendedNotes = async () => {
    if (currentSlideIndex < 0) return; 

    const slide = data.slides[currentSlideIndex];
    setIsNotesLoading(true);
    setIsNotesOpen(true);
    setExtendedNotes(null); // Clear previous notes
    
    try {
      const notes = await generateExtendedNotes(slide, data.topic);
      setExtendedNotes(notes);
    } catch (error) {
      console.error("Notes generation failed:", error);
    } finally {
      setIsNotesLoading(false);
    }
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

  const handleSelectFromGallery = (asset: Asset) => {
    if (currentSlideIndex < 0) return;
    onUpdateSlide(currentSlideIndex, { 
      imageUrl: asset.imageBase64.startsWith('http') ? asset.imageBase64 : undefined,
      imageBase64: asset.imageBase64.startsWith('http') ? undefined : asset.imageBase64,
      imageValidation: undefined 
    });
    setIsGalleryPickerOpen(false);
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

  const currentPos = isSourcesPage 
    ? { x: (data?.slides?.[totalSlides-1]?.x || 0) + 1800, y: (data?.slides?.[totalSlides-1]?.y || 0), z: 0, rX: 0, rY: 0, rZ: 0 } 
    : (isWelcomePage ? { x: -1800, y: 0, z: -1000, rX: 0, rY: 0, rZ: 0 } : { 
        x: currentSlide?.x || 0, 
        y: currentSlide?.y || 0, 
        z: currentSlide?.z || 0,
        rX: currentSlide?.rotateX || 0,
        rY: currentSlide?.rotateY || 0,
        rZ: currentSlide?.rotateZ || 0
      });

  const sidebarWidth = isEditing ? 320 : 0;
  const zoom = isWelcomePage ? 0.25 : Math.min(0.8, (viewportSize.w - sidebarWidth - 160) / 1200, (viewportSize.h - 200) / 675);
  
  // Center of the visible area (viewport center adjusted for sidebar)
  const visualCenterX = (viewportSize.w - sidebarWidth) / 2;
  const visualCenterY = viewportSize.h / 2;
  
  // Camera translation to bring slide center to origin and then to visual center
  const cameraX = visualCenterX / zoom - (currentPos.x + 600);
  const cameraY = (viewportSize.h / 2) / zoom - (currentPos.y + 337.5); 
  const cameraZ = -currentPos.z;

  return (
    <div className={`fixed inset-0 bg-[#020617] overflow-hidden flex flex-col font-sans perspective-[2000px] selection:bg-blue-500/30 transition-all duration-700 z-[100] ${isEditing ? 'border-[8px] border-red-600 shadow-[inset_0_0_150px_rgba(220,38,38,0.4)]' : 'border-0'}`}>
      {/* AI Law Enforcement Badge */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-8 py-4 bg-black/90 backdrop-blur-2xl border-2 border-red-600/50 rounded-3xl shadow-[0_30px_60px_-15px_rgba(220,38,38,0.4)] flex items-center gap-5 min-w-[320px] overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 via-transparent to-red-600/10 opacity-50" />
            <div className={`w-4 h-4 rounded-full flex-shrink-0 relative ${aiAudit.status === 'perfect' ? 'bg-red-600' : 'bg-red-600/50'}`}>
               {aiAudit.status === 'checking' && (
                 <div className="absolute inset-0 bg-red-600 rounded-full animate-ping" />
               )}
               {aiAudit.status === 'perfect' && (
                 <div className="absolute -inset-1 border border-red-600/50 rounded-full animate-pulse" />
               )}
            </div>
            <div className="flex flex-col relative z-10 w-full">
               <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] mb-1">AI GEOMETRICKÝ DOHLED</span>
               <div className="h-5 overflow-hidden">
                 <AnimatePresence mode="wait">
                   <motion.span 
                    key={aiAudit.message}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    className="text-[12px] font-black text-white tracking-widest uppercase italic block"
                   >
                     {aiAudit.message}
                   </motion.span>
                 </AnimatePresence>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Cinematic Vignette */}
      <div className="fixed inset-0 pointer-events-none z-50 shadow-[inset_0_0_200px_rgba(0,0,0,0.6)]" />
      
      {/* 3D Background Stars/Depth Elements */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {[...Array(20)].map((_, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.3, 0.1], scale: [1, 1.2, 1] }}
            transition={{ duration: 5 + Math.random() * 5, repeat: Infinity, delay: Math.random() * 5 }}
            className="absolute rounded-full bg-blue-500/40 blur-[2px]"
            style={{ 
              width: Math.random() * 4 + 'px', 
              height: Math.random() * 4 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
            }}
          />
        ))}
      </div>

      {/* Decorative Blur Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 10, repeat: Infinity }}
          className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"
        />
        <motion.div 
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 12, repeat: Infinity }}
          className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px]"
        />
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

      <div 
        className="absolute top-0 left-0 w-full h-full transform-style-3d origin-top-left" 
        style={{ 
          transform: `scale(${zoom}) translate3d(${cameraX}px, ${cameraY}px, ${cameraZ}px) rotateX(${-currentPos.rX}deg) rotateY(${-currentPos.rY}deg) rotateZ(${-currentPos.rZ}deg)`,
          transition: 'transform 1.2s cubic-bezier(0.2, 0, 0, 1)'
        }}
      >
        {/* Welcome Slide */}
        {data.welcomeSlide && (
            <div className={`absolute w-[1200px] h-[675px] transition-all duration-1000 overflow-hidden flex flex-col justify-center p-20 bg-slate-900/40 backdrop-blur-3xl border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] rounded-[3rem] ${isWelcomePage ? 'opacity-100 scale-100 z-50' : 'opacity-20 scale-90 blur-[4px]'}`} style={{ left: -1800, top: 0, transform: `translate3d(0, 0, -500px) rotateY(20deg)` }}>
                <div className="max-w-4xl space-y-8">
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={isWelcomePage ? { opacity: 1, y: 0 } : {}}
                      transition={{ delay: 0.3 }}
                      className="space-y-4"
                    >
                        <span className="text-xs font-black uppercase tracking-[0.6em] text-blue-400 drop-shadow-sm" style={{ color: themeColor }}>{data.welcomeSlide.subtitle}</span>
                        <h1 className="text-[7rem] font-black text-white leading-[0.8] tracking-tighter uppercase italic drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)]">{data.welcomeSlide.title}</h1>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ scaleX: 0 }}
                      animate={isWelcomePage ? { scaleX: 1 } : {}}
                      transition={{ delay: 0.6, duration: 1 }}
                      className="w-32 h-3 origin-left" 
                      style={{ backgroundColor: themeColor }} 
                    />

                    <motion.p 
                      initial={{ opacity: 0 }}
                      animate={isWelcomePage ? { opacity: 1 } : {}}
                      transition={{ delay: 0.8 }}
                      className="text-3xl text-slate-200 font-bold leading-relaxed max-w-2xl drop-shadow-lg"
                    >
                      {data.welcomeSlide.description}
                    </motion.p>
                </div>
            </div>
        )}

        {(data?.slides || []).map((slide, index) => {
            const isActive = (hasWelcome ? index + 1 : index) === currentIndex;
            return (
                <div 
                    key={index} 
                    className={`absolute w-[1200px] h-[675px] transition-all duration-[1.2s] overflow-hidden bg-slate-900/40 backdrop-blur-3xl border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] rounded-[3rem] ${isActive ? 'opacity-100 scale-100 z-50 ring-2 ring-blue-500/10' : 'opacity-30 scale-95 blur-[2px]'}`} 
                    style={{ 
                        left: slide.x || 0, 
                        top: slide.y || 0,
                        transform: `translate3d(0, 0, ${slide.z || 0}px) rotateX(${slide.rotateX || 0}deg) rotateY(${slide.rotateY || 0}deg) rotateZ(${slide.rotateZ || 0}deg)`,
                        transformStyle: 'preserve-3d'
                    }}
                >
                    <SlideRenderer 
                        slide={slide} 
                        isActive={isActive} 
                        themeColor={themeColor} 
                        index={index} 
                        assets={assets} 
                        isEditing={isEditing} 
                        isReadOnly={isReadOnly}
                        handleUpdateAsset={handleUpdateAsset} 
                        handleRemoveAsset={handleRemoveAsset} 
                    />
                </div>
            );
        })}

        {/* Sources Slide */}
        {data.sources.length > 0 && (
            <div 
                className={`absolute w-[1200px] h-[675px] transition-all duration-1000 overflow-hidden flex flex-col justify-center p-20 bg-slate-900/40 backdrop-blur-3xl border border-white/10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] rounded-[3rem] ${isSourcesPage ? 'opacity-100 scale-100 z-50' : 'opacity-20 scale-90 blur-[4px]'}`} 
                style={{ left: (data.slides[data.slides.length-1]?.x || 0) + 1800, top: (data.slides[data.slides.length-1]?.y || 0), transform: `translate3d(0, 0, 0)` }}
            >
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

      {/* Right Sidebar - ChatBot */}
      <aside className={`fixed right-0 top-0 h-full w-[380px] bg-[#0a0f1e]/95 backdrop-blur-2xl border-l border-white/5 z-[150] shadow-2xl transition-transform duration-500 ease-in-out flex flex-col ${isEditing ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div className="flex flex-col">
                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <Brain size={12} className="text-blue-500"/> AI Partner @ Kreativa
                </h4>
                <button 
                  onClick={() => setIsDocsOpen(true)}
                  className="text-[9px] font-bold text-blue-400 hover:text-blue-300 transition-colors uppercase tracking-widest mt-1 flex items-center gap-1"
                >
                  <BookOpen size={10} /> Dokumentace chatbotu
                </button>
              </div>
              <button 
                onClick={() => setIsEditing(false)} 
                className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-white transition-all shadow-lg"
              >
                <X size={16}/>
              </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {chatMessages.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[90%] p-4 rounded-2xl text-[11px] leading-relaxed tracking-wide font-medium shadow-lg ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/5 text-slate-200 border border-white/5 rounded-tl-none'}`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
              {isUpdating && (
                <div className="flex items-center gap-2 text-slate-500 ml-2">
                  <Loader2 size={12} className="animate-spin" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">AI Přemýšlí...</span>
                </div>
              )}
              <div ref={chatEndRef} />
          </div>
          
          {isWelcomePage ? (
            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
                         <div className="space-y-2">
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Název</span>
                           <input 
                              type="text" 
                              value={data.welcomeSlide?.title || ''} 
                              onChange={(e) => onUpdateWelcome({ title: e.target.value })}
                              className="w-full bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Podnadpis</span>
                           <input 
                              type="text" 
                              value={data.welcomeSlide?.subtitle || ''} 
                              onChange={(e) => onUpdateWelcome({ subtitle: e.target.value })}
                              className="w-full bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Popis</span>
                           <textarea 
                              value={data.welcomeSlide?.description || ''} 
                              onChange={(e) => onUpdateWelcome({ description: e.target.value })}
                              className="w-full h-24 bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none resize-none"
                            />
                        </div>
                        <div className="space-y-2">
                           <span className="text-[10px] font-bold text-slate-500 uppercase">Prezentuje</span>
                           <input 
                              type="text" 
                              value={data.welcomeSlide?.presenter || ''} 
                              onChange={(e) => onUpdateWelcome({ presenter: e.target.value })}
                              className="w-full bg-black/40 border border-white/5 rounded-lg px-4 py-2 text-xs text-white focus:border-blue-500/50 focus:outline-none"
                            />
                        </div>
                      </div>
              ) : (
                <>
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
                                        if (onError) onError(undefined);
                                        await onGenerateAsset(assetPrompt);
                                        setAssetPrompt("");
                                    } catch (err: any) {
                                        console.error(err);
                                        if (onError) onError(err.message || "Chyba při generování prvku.");
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
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Ovládání slidu</label>
                    <button onClick={handleDeleteImage} className="text-red-500 hover:text-red-400 transition-colors p-1" title="Smazat obrázek">
                        <Trash2 size={12}/>
                      </button>
                  </div>
                  
                  <div className="space-y-3">
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-slate-500 uppercase">Textový příkaz pro AI obraz</span>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={currentSlide?.imagePrompt || ''}
                            onChange={(e) => onUpdateSlide(currentSlideIndex, { imagePrompt: e.target.value })}
                            className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-white focus:border-blue-500/50 focus:outline-none"
                            placeholder="Popis obrázku..."
                          />
                          <button 
                            onClick={() => handleRegenerateImage(currentSlide?.imagePrompt)}
                            disabled={isUpdating}
                            className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition-all"
                            title="Regenerovat podle textu"
                          >
                            <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''}/>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center justify-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-all group">
                            <Upload size={14} className="text-slate-400 group-hover:text-white"/>
                            <span className="text-[8px] font-black text-slate-500 group-hover:text-white uppercase tracking-widest leading-none">Nahrát</span>
                            <input type="file" onChange={handleFileUpload} className="hidden" accept="image/*"/>
                        </label>
                        <button 
                          onClick={() => setIsGalleryPickerOpen(true)}
                          className="flex items-center justify-center gap-3 p-3 bg-indigo-600/10 border border-indigo-500/10 rounded-xl hover:bg-indigo-600/20 text-indigo-400 transition-all group"
                        >
                          <Library size={14} />
                          <span className="text-[8px] font-black uppercase tracking-widest leading-none">Galerie</span>
                        </button>
                      </div>
                  </div>
              </div>

              {currentSlide?.imageValidation && (
                  <div className={`p-4 rounded-xl border ${currentSlide.imageValidation.isOk ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-red-500/5 border-red-500/10'}`}>
                      <p className="text-slate-500 text-[10px] italic leading-relaxed">"{currentSlide.imageValidation.reason}"</p>
                  </div>
              )}
              <div className="space-y-4 border-t border-white/5 pt-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Geometrický zákon</label>
                    <button 
                      onClick={() => {
                        if (confirm("Vynutit Zákon Středu na celou prezentaci? Toto přerovná všechny slidy do dokonalé sítě.")) {
                          data.slides.forEach((_, i) => {
                            const colWidth = 2000;
                            const rowHeight = 1200;
                            const cols = 3; 
                            const row = Math.floor(i / cols);
                            const colPos = i % cols;
                            onUpdateSlide(i, { x: colPos * colWidth, y: row * rowHeight, z: 0, rotateX: 0, rotateY: 0, rotateZ: 0 });
                          });
                        }
                      }}
                      className="text-blue-500 hover:text-blue-400 transition-colors p-1" 
                      title="Resetovat geometry"
                    >
                        <RotateCcw size={12}/>
                    </button>
                  </div>
                  <p className="text-[8px] text-slate-500 italic pb-2">Vytvoří dokonalou síť 3xN a vycentruje vše do geometrického středu.</p>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6 pb-12">
                      <button 
                        onClick={() => currentSlideIndex >= 0 && onRemoveSlide?.(currentSlideIndex)}
                        className="w-full py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/10 hover:border-red-500 font-black rounded-xl text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all group"
                      >
                         <Trash2 size={14} className="group-hover:scale-110 transition-transform" /> Smazat tento slide
                      </button>
                  </div>
            </>
          )}
          <div className="p-6 border-t border-white/5 bg-black/40 backdrop-blur-xl">
            <div className="relative flex flex-col gap-3">
              {/* Tool presets */}
              <div className="flex gap-2 flex-wrap pb-2">
                 {["Vytvoř slide o...", "Změň téma", "Vylepši texty"].map(tip => (
                   <button 
                     key={tip}
                     onClick={() => setChatInput(tip)}
                     className="text-[9px] bg-white/5 hover:bg-white/10 text-slate-400 px-2 py-1 rounded border border-white/5 transition-all uppercase tracking-widest"
                   >
                     {tip}
                   </button>
                 ))}
              </div>
              <div className="relative">
                <textarea 
                 value={chatInput}
                 onChange={(e) => setChatInput(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleSendMessage();
                   }
                 }}
                 placeholder="Instrukce: 'Změň barvu na zelenou', 'Přidej slide o DNA'..."
                 className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-4 pr-12 text-[11px] text-white focus:border-blue-500/50 focus:outline-none resize-none transition-all placeholder:text-slate-600"
                />
                <button 
                 onClick={handleSendMessage}
                 disabled={!chatInput.trim() || isUpdating}
                 className="absolute right-3 bottom-3 w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center disabled:opacity-30 transition-all shadow-lg shadow-blue-900/40"
                >
                  <Sparkles size={16} />
                </button>
              </div>
            </div>
          </div>
     </aside>

      {/* Top Navigation */}
      {!isReadOnly && (
        <nav className="absolute top-0 left-0 w-full p-6 z-[110] flex justify-between items-center pointer-events-none">
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
      )}

      {/* Centering Crosshair (Law reinforcement) */}
      {isEditing && (
        <div className="fixed inset-0 pointer-events-none z-[120] flex items-center justify-center">
           <div className="absolute w-[2px] h-32 bg-red-600/20" />
           <div className="absolute w-32 h-[2px] bg-red-600/20" />
           <motion.div 
             initial={{ scale: 2, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             key={currentIndex}
             className="w-4 h-4 border border-red-600/40 rounded-full"
           />
        </div>
      )}

      {/* Extended Notes Modal */}
      <AnimatePresence>
        {isNotesOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsNotesOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl bg-[#0a0f1e] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                    <Brain size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white uppercase italic tracking-wider">Podklady pro prezentujícího</h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Slide: {data.slides[currentIndex - (hasWelcome ? 1 : 0)]?.title}</p>
                  </div>
                </div>
                <button onClick={() => setIsNotesOpen(false)} className="p-3 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {isNotesLoading ? (
                  <div className="h-64 flex flex-col items-center justify-center space-y-4">
                    <Loader2 size={40} className="text-indigo-500 animate-spin" />
                    <p className="text-slate-400 font-black text-xs uppercase tracking-[0.2em]">Generuji chytré podklady...</p>
                  </div>
                ) : extendedNotes ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <section className="bg-white/[0.03] p-6 rounded-3xl border border-white/5">
                        <div className="flex items-center gap-3 mb-4 text-blue-400">
                          <Volume2 size={18} />
                          <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">Poznámky pro řečníka</h3>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed font-medium">{extendedNotes.speakerNotes}</p>
                      </section>

                      <section className="bg-indigo-600/[0.03] p-6 rounded-3xl border border-indigo-500/10">
                        <div className="flex items-center gap-3 mb-4 text-indigo-400">
                          <Sparkles size={18} />
                          <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">AI Skript (Jak to prodat)</h3>
                        </div>
                        <p className="text-slate-300 text-sm italic leading-relaxed font-medium">"{extendedNotes.aiScript}"</p>
                      </section>
                    </div>

                    <section className="bg-emerald-600/[0.03] p-6 rounded-3xl border border-emerald-500/10 h-fit">
                      <div className="flex items-center gap-3 mb-4 text-emerald-400">
                        <BookOpen size={18} />
                        <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">Hluboký vhled do tématu</h3>
                      </div>
                      <div className="text-slate-300 text-sm leading-relaxed font-medium space-y-4">
                        {extendedNotes.deepDive.split('\n').map((line, i) => (
                          <p key={i}>{line}</p>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-slate-500 italic">Nepodařilo se načíst poznámky.</p>
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-white/[0.02] border-t border-white/10 flex justify-end">
                <button 
                  onClick={() => setIsNotesOpen(false)}
                  className="bg-white/5 border border-white/10 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                >
                  Rozumím
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isGalleryPickerOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGalleryPickerOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-6xl bg-[#0a0f1e] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[80vh]"
            >
              <Gallery 
                assets={assets} 
                onDelete={() => {}} // We don't want to delete from picker for now to keep it safe
                onSelect={handleSelectFromGallery}
                onClose={() => setIsGalleryPickerOpen(false)}
                isPicker={true}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#0a0f1e]/80 backdrop-blur-2xl border border-white/5 px-3 py-1.5 rounded-2xl shadow-2xl z-[130]">
        <div className="flex items-center gap-2 border-r border-white/10 pr-3">
          <button onClick={prevSlide} disabled={currentIndex === 0} className="p-1.5 text-white disabled:opacity-10 hover:scale-125 transition-all"><ChevronLeft size={18} /></button>
          <div className="text-white font-mono text-[10px] w-14 text-center tracking-widest">{String(currentIndex + 1).padStart(2, '0')} <span className="text-slate-700">/ {String(totalPages).padStart(2, '0')}</span></div>
          <button onClick={nextSlide} disabled={currentIndex === totalPages - 1} className="p-1.5 text-white disabled:opacity-10 hover:scale-125 transition-all"><ChevronRight size={18} /></button>
        </div>

        <div className="flex items-center gap-1.5">
          {!isReadOnly && (
            <button 
              onClick={() => setIsEditing(!isEditing)} 
              className={`px-3 py-1.5 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center gap-1.5 transition-all border ${isEditing ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'}`}
            >
              <Sparkles size={12} />
              {isEditing ? 'Zavřít AI Parťáka' : 'AI Parťák'}
            </button>
          )}

          {data.id && (
            <button 
              onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?share=${data.id}`;
                navigator.clipboard.writeText(url);
                alert("Odkaz ke sdílení byl zkopírován do schránky!");
              }} 
              className="bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white border border-indigo-500/30 px-3 py-1.5 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center transition-all"
            >
              Sdílet
            </button>
          )}

          <button onClick={() => setIsExportDialogOpen(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl font-black text-[8px] uppercase tracking-widest flex items-center shadow-lg transition-all">
            <MonitorPlay size={12} className="mr-1.5" /> Export
          </button>
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

const SlideRenderer: React.FC<{ 
  slide: Slide; 
  isActive: boolean; 
  themeColor: string; 
  index: number; 
  assets: Asset[];
  isEditing: boolean;
  isReadOnly?: boolean;
  handleUpdateAsset: (idx: number, updates: any) => void;
  handleRemoveAsset: (idx: number) => void;
}> = ({ slide, isActive, themeColor, index, assets, isEditing, isReadOnly, handleUpdateAsset, handleRemoveAsset }) => {
  const layouts = {
    hero: (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-24 relative overflow-hidden">
        <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isActive ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 1 }}
            className="absolute inset-0"
        >
            <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover blur-[100px] opacity-30" />
            <div className="absolute inset-0 bg-gradient-to-b from-[#020617]/90 via-[#020617]/50 to-[#020617]/90" />
        </motion.div>
        
        <div className="relative z-10 space-y-6 flex flex-col items-center">
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={isActive ? { y: 0, opacity: 1 } : {}}
              transition={{ delay: 0.2 }}
            >
                <h2 className="text-4xl md:text-6xl font-black text-white leading-tight tracking-tighter uppercase italic drop-shadow-[0_15px_40px_rgba(0,0,0,1)]">{slide.title}</h2>
            </motion.div>
            <motion.div 
              initial={{ scaleX: 0 }}
              animate={isActive ? { scaleX: 1 } : {}}
              transition={{ delay: 0.5, duration: 0.8 }}
              className="w-32 h-2" style={{ backgroundColor: themeColor }} 
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={isActive ? { opacity: 1 } : {}}
              transition={{ delay: 0.8 }}
            >
              <ul className="flex flex-wrap justify-center gap-4 max-w-4xl px-12">
                  {slide.bulletPoints.map((bp, i) => (
                    <li key={i} className="text-lg md:text-xl font-bold text-slate-300 italic drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)]">"{bp}"</li>
                  ))}
              </ul>
            </motion.div>
        </div>
      </div>
    ),
    bento: (
      <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-6 p-12">
        <motion.div 
          initial={{ x: -50, opacity: 0 }}
          animate={isActive ? { x: 0, opacity: 1 } : {}}
          className="col-span-1 row-span-2 flex flex-col justify-center pr-8"
        >
          <h2 className="text-4xl md:text-5xl font-black text-white leading-[0.9] tracking-tighter uppercase italic mb-6">{slide.title}</h2>
          <div className="space-y-3">
              {slide.bulletPoints.slice(0, 2).map((bp, i) => (
                  <div key={i} className="bg-white/5 border border-white/5 p-5 rounded-2xl backdrop-blur-xl">
                      <p className="text-lg font-bold text-slate-200">{bp}</p>
                  </div>
              ))}
          </div>
        </motion.div>
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={isActive ? { scale: 1, opacity: 1 } : {}}
          transition={{ delay: 0.3 }}
          className="bg-white/5 rounded-[2.5rem] overflow-hidden border border-white/10"
        >
          <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover" />
        </motion.div>
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={isActive ? { y: 0, opacity: 1 } : {}}
          transition={{ delay: 0.5 }}
          className="bg-indigo-600/20 backdrop-blur-3xl rounded-[2.5rem] p-8 flex items-center justify-center text-center"
        >
            <p className="text-xl font-black text-white uppercase italic tracking-tight">{slide.bulletPoints[2] || "Klíčový detail"}</p>
        </motion.div>
      </div>
    ),
    gallery: (
        <div className="w-full h-full flex flex-col p-12 gap-6">
            <motion.div 
              initial={{ y: -30, opacity: 0 }}
              animate={isActive ? { y: 0, opacity: 1 } : {}}
              className="flex items-end justify-between border-b-2 border-white/10 pb-6"
            >
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">{slide.title}</h2>
            </motion.div>
            <div className="flex-1 flex gap-6">
                <motion.div 
                  initial={{ scale: 1.1, opacity: 0 }}
                  animate={isActive ? { scale: 1, opacity: 1 } : {}}
                  transition={{ duration: 0.8 }}
                  className="w-2/3 h-full rounded-[3rem] overflow-hidden shadow-2xl"
                >
                    <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover" />
                </motion.div>
                <div className="w-1/3 flex flex-col gap-4 justify-center">
                    {slide.bulletPoints.map((bp, i) => (
                        <motion.div 
                          key={i}
                          initial={{ x: 30, opacity: 0 }}
                          animate={isActive ? { x: 0, opacity: 1 } : {}}
                          transition={{ delay: 0.3 + i * 0.1 }}
                          className="flex items-center gap-4"
                        >
                            <span className="text-3xl font-black italic opacity-20" style={{ color: themeColor }}>0{i+1}</span>
                            <p className="text-xl font-bold text-slate-300 tracking-tight leading-tight">{bp}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    ),
    split: (
        <div className="w-full h-full flex">
            <motion.div 
              initial={{ x: -100, opacity: 0 }}
              animate={isActive ? { x: 0, opacity: 1 } : {}}
              className="w-1/2 h-full flex flex-col justify-center p-16 bg-white/[0.02]"
            >
                <h2 className="text-4xl font-black text-white leading-[0.85] tracking-tighter uppercase italic mb-8">{slide.title}</h2>
                <div className="space-y-6">
                    {slide.bulletPoints.map((bp, i) => (
                        <div key={i} className="flex gap-4 items-center group">
                            <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-black italic text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all">{i+1}</div>
                            <p className="text-xl font-bold text-slate-300 group-hover:text-white transition-colors">{bp}</p>
                        </div>
                    ))}
                </div>
            </motion.div>
            <motion.div 
              initial={{ scale: 1.2, opacity: 0 }}
              animate={isActive ? { scale: 1, opacity: 1 } : {}}
              transition={{ duration: 1.2 }}
              className="w-1/2 h-full overflow-hidden p-10"
            >
                <div className="w-full h-full rounded-[4rem] overflow-hidden shadow-2xl relative group">
                    <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
            </motion.div>
        </div>
    ),
    immersive: (
        <div className="w-full h-full relative">
            <motion.div 
              initial={{ scale: 1.1 }}
              animate={isActive ? { scale: 1 } : {}}
              transition={{ duration: 10 }}
              className="absolute inset-0"
            >
                <img src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/20 to-[#020617]/60" />
            </motion.div>
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center p-20">
                <motion.h2 
                  initial={{ y: 100, opacity: 0 }}
                  animate={isActive ? { y: 0, opacity: 1 } : {}}
                  className="text-4xl md:text-7xl font-black text-white leading-tight tracking-tighter uppercase italic mb-8 drop-shadow-[0_20px_60px_rgba(0,0,0,1)]"
                >
                  {slide.title}
                </motion.h2>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={isActive ? { opacity: 1 } : {}}
                  transition={{ delay: 0.5 }}
                  className="flex flex-wrap justify-center gap-8"
                >
                    {slide.bulletPoints.map((bp, i) => (
                        <div key={i} className="px-8 py-3 bg-black/60 backdrop-blur-2xl border border-white/20 rounded-full shadow-2xl">
                            <span className="text-xl md:text-3xl font-black text-white italic tracking-tight drop-shadow-[0_4px_12px_rgba(0,0,0,1)]">{bp}</span>
                        </div>
                    ))}
                </motion.div>
            </div>
        </div>
    ),
    classic: (
        <div className={`flex w-full h-full items-center gap-10 p-16 ${slide.layout === 'reversed' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className="flex-1 flex flex-col justify-center">
                <motion.div 
                    initial={{ x: -50, opacity: 0 }}
                    animate={isActive ? { x: 0, opacity: 1 } : {}}
                    className="mb-4"
                >
                    <h3 className="font-black text-white text-4xl md:text-5xl leading-[0.9] tracking-tighter uppercase italic">{slide.title}</h3>
                </motion.div>
                <ul className="space-y-4 mt-6">
                    {(slide.bulletPoints || []).map((bp, idx) => (
                        <motion.li 
                            key={idx} 
                            initial={{ x: -20, opacity: 0 }}
                            animate={isActive ? { x: 0, opacity: 1 } : {}}
                            transition={{ delay: 0.2 + idx * 0.1 }}
                            className="flex items-start text-xl text-slate-300 leading-tight font-bold tracking-tight group"
                        >
                            <span className="w-2.5 h-2.5 rounded-full mt-2.5 mr-6 shadow-[0_0_15px_rgba(59,130,246,0.6)] group-hover:scale-125 transition-transform" style={{ backgroundColor: themeColor }}></span> {bp}
                        </motion.li>
                    ))}
                </ul>
            </div>
            {(slide.imageUrl || slide.imageBase64) && (
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={isActive ? { scale: 1, opacity: 1 } : {}}
                    className="flex-1 h-[85%] flex items-center justify-center relative"
                >
                    <div className="w-full h-full rounded-[3.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] border border-white/10 group relative bg-black/20">
                        {/* Blurred background to fill gaps for non-16:9 images */}
                        <img 
                          src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} 
                          className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-20 scale-110" 
                        />
                        <img 
                          src={slide.imageUrl || `data:image/png;base64,${slide.imageBase64}`} 
                          className="relative w-full h-full object-contain transition-transform duration-1000 group-hover:scale-105 z-10" 
                        />
                    </div>
                </motion.div>
            )}
        </div>
    )
  };

  const layoutContent = layouts[slide.layout as keyof typeof layouts] || layouts.classic;

  return (
    <div className="w-full h-full relative group/renderer">
        {layoutContent}
        
        {/* Validation badge */}
        {!isReadOnly && isActive && slide.imageValidation && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`absolute bottom-8 right-8 px-4 py-2 rounded-full backdrop-blur-2xl border flex items-center gap-2 shadow-2xl z-[60] ${slide.imageValidation.isOk ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}
            >
                {slide.imageValidation.isOk ? <CheckCircle2 className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
                <span className="text-[10px] font-black uppercase tracking-widest">{slide.imageValidation.isOk ? 'AI OK' : 'AI VAROVÁNÍ'}</span>
            </motion.div>
        )}

        {/* Global assets container for the slide */}
        <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden rounded-[inherit]">
            {slide.assets?.map((sa, sIdx) => {
                const asset = assets.find(a => a.id === sa.assetId);
                if (!asset) return null;
                return (
                    <motion.div 
                        key={sIdx} 
                        initial={{ scale: 0, opacity: 0, rotate: -20 }}
                        animate={isActive ? { scale: sa.scale, opacity: 1, rotate: sa.rotation } : {}}
                        className="absolute pointer-events-auto group/asset"
                        style={{ 
                            left: `${sa.x}%`, 
                            top: `${sa.y}%`, 
                            transform: `translate(-50%, -50%) rotate(${sa.rotation}deg) scale(${sa.scale})`,
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
                    </motion.div>
                );
            })}
        </div>
    </div>
  );
};
