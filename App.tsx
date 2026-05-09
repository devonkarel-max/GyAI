
import React, { useState, useEffect } from 'react';
import { InputSection } from './components/InputSection';
import { LoadingScreen } from './components/LoadingScreen';
import { PresentationViewer } from './components/PresentationViewer';
import { Dashboard } from './components/Dashboard';
import { Gallery } from './components/Gallery';
import { Explore } from './components/Explore';
import { AppState, PresentationData, Slide, Asset } from './types';
import { generatePresentationOutline, generatePresentationFromOutline, generateSlideImage, generateSlideAudio, validateImage, uploadToCloudinary, nameAsset } from './services/geminiService';
import { PresentationOutline } from './components/PresentationOutline';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { LogIn, History, Plus, LogOut, Trash2, AlertTriangle, X, Compass, Library } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [history, setHistory] = useState<PresentationData[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [state, setState] = useState<AppState>({
    step: 'dashboard',
    topic: '',
    voice: 'Kore',
    slideCount: 5,
    files: [],
    filePreviews: [],
    presentation: null,
    outline: null,
    currentSlideIndex: 0,
    loadingStatus: '',
    progress: 0
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedId = params.get('share');
    if (sharedId) {
      loadSharedPresentation(sharedId);
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) {
        fetchHistory(u.uid);
        fetchAssets(u.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchAssets = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'assets'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Asset));
      setAssets(docs);
      if (state.error?.includes('databáze')) setState(prev => ({ ...prev, error: undefined }));
    } catch (error: any) {
      console.error("Error fetching assets:", error);
      const rawMessage = error.message || String(error);
      if (rawMessage.toLowerCase().includes('quota') || error.code === 'resource-exhausted') {
        setState(prev => ({ ...prev, error: `Databáze vyčerpala limit (Quota Exceeded). Zkus to zítra. Detail: ${rawMessage}` }));
      }
    }
  };

  const fetchHistory = async (uid: string) => {
    try {
      const q = query(
        collection(db, 'presentations'),
        where('userId', '==', uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PresentationData));
      setHistory(docs);
      if (state.error?.includes('databáze')) setState(prev => ({ ...prev, error: undefined }));
    } catch (error: any) {
      console.error("Error fetching history:", error);
      const rawMessage = error.message || String(error);
      if (rawMessage.toLowerCase().includes('quota') || error.code === 'resource-exhausted') {
        setState(prev => ({ ...prev, error: `Databáze vyčerpala limit (Quota Exceeded). Zkus to zítra. Detail: ${rawMessage}` }));
      }
    }
  };

  const loadSharedPresentation = async (id: string) => {
    try {
      setState(p => ({ ...p, step: 'generating', loadingStatus: 'Načítám sdílenou prezentaci...', progress: 30 }));
      const docSnap = await getDoc(doc(db, 'presentations', id));
      
      if (docSnap.exists()) {
        const presentation = { id: docSnap.id, ...docSnap.data() } as PresentationData;
        setState(prev => ({ 
          ...prev, 
          step: 'preview', 
          presentation,
          loadingStatus: 'Hotovo.'
        }));
        setIsReadOnly(true);
      } else {
        setState(prev => ({ ...prev, step: 'dashboard', error: "Sdílená prezentace nebyla nalezena." }));
      }
    } catch (error) {
      console.error("Error loading shared presentation:", error);
      setState(prev => ({ ...prev, step: 'dashboard', error: "Nemohu načíst sdílenou prezentaci." }));
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Force account selection to avoid some internal cache issues
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("Prohlížeč zablokoval vyskakovací okno. Prosím, povol vyskakovací okna pro tuto stránku a zkus to znovu.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // This often happens if user clicks twice or closes too fast, usually safe to ignore or just log
      } else {
        alert("Přihlášení se nezdařilo. Zkus to prosím znovu.");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setHistory([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Opravdu chceš tuto prezentaci smazat?")) return;
    try {
      await deleteDoc(doc(db, 'presentations', id));
      setHistory(prev => prev.filter(p => p.id !== id));
      alert("Smazáno!");
    } catch (error) {
      console.error("Delete error:", error);
      alert("Nepodařilo se smazat prezentaci. Zkontroluj připojení nebo oprávnění.");
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!confirm("Opravdu chceš tento vizuál smazat?")) return;
    try {
      await deleteDoc(doc(db, 'assets', id));
      setAssets(prev => prev.filter(a => a.id !== id));
      alert("Smazáno!");
    } catch (error) {
      console.error("Delete asset error:", error);
    }
  };

  const getRandomShape = () => {
    const shapes = ['rounded-[3rem]', 'rounded-tl-[5rem] rounded-br-[5rem]', 'rounded-tr-[5rem] rounded-bl-[5rem]', 'rounded-[4rem]'];
    return shapes[Math.floor(Math.random() * shapes.length)];
  };

  const getCoordinates = (index: number) => {
      const colWidth = 2000;
      const rowHeight = 1200;
      const cols = 3; 
      const row = Math.floor(index / cols);
      const colPos = index % cols;
      
      return { 
        x: colPos * colWidth, 
        y: row * rowHeight,
        z: 0,
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0
      };
  };

  const handleReset = () => {
    if (isReadOnly) {
      window.history.replaceState({}, '', window.location.pathname);
      setIsReadOnly(false);
    }
    setState(p => ({...p, step: 'dashboard', presentation: null, error: undefined}));
  };

  const handleGenerateOutline = async () => {
    setState(prev => ({ ...prev, step: 'generating', loadingStatus: 'Navrhuji osnovu prezentace...', progress: 10, error: undefined }));
    try {
      const { title, outline } = await generatePresentationOutline(state.topic, state.slideCount, state.files);
      setState(prev => ({ ...prev, step: 'outline', outline, loadingStatus: '', progress: 40 }));
    } catch (error: any) {
      setState(prev => ({ ...prev, step: 'input', error: error.message || "Nepodařilo se vygenerovat osnovu." }));
    }
  };

  const handleFullGenerate = async () => {
    if (!state.outline) return;
    setState(prev => ({ ...prev, step: 'generating', loadingStatus: 'Sestavuji kompletní obsah a podklady...', progress: 50, error: undefined }));
    try {
      const { slides, sources, title, themeColor, welcomeSlide } = await generatePresentationFromOutline(state.topic, state.outline, state.files);
      
      const layouts: Slide['layout'][] = ['classic', 'reversed', 'modern', 'immersive', 'minimal', 'bento', 'split', 'hero', 'gallery'];
      const processedSlides: Slide[] = slides.map((s, index) => {
          const coords = getCoordinates(index);
          const layout = index === 0 ? 'hero' : layouts[Math.floor(Math.random() * layouts.length)];
          return { 
            ...s, 
            shape: getRandomShape(), 
            x: coords.x, 
            y: coords.y, 
            z: coords.z,
            rotateX: coords.rotateX,
            rotateY: coords.rotateY,
            rotateZ: coords.rotateZ,
            layout 
          };
      });

      setState(prev => ({ 
        ...prev, 
        step: 'preview', 
        presentation: { topic: state.topic, presentationTitle: title, slides: processedSlides, sources, themeColor, welcomeSlide }, 
        progress: 100 
      }));
      generateContentBackground(processedSlides, state.voice);
    } catch (error: any) {
      setState(prev => ({ ...prev, step: 'outline', error: error.message || "Chyba při generování obsahu." }));
    }
  };

  const handleGenerateStructure = handleGenerateOutline;

  const handleCreateEmpty = () => {
    const emptyPresentation: PresentationData = {
      topic: "Nová Prezentace",
      presentationTitle: "Nová Prezentace",
      themeColor: "#3b82f6",
      welcomeSlide: {
        title: "Nová Prezentace",
        subtitle: "PODNADPIS",
        description: "Zde začíná tvůj příběh.",
        presenter: user?.displayName || "AI Student"
      },
      slides: [
        {
          id: 0,
          title: "První Slide",
          bulletPoints: ["Tvůj první bod"],
          speakerNotes: "",
          imagePrompt: "Minimalist placeholder",
          x: 0,
          y: 0,
          shape: getRandomShape(),
          layout: 'classic'
        }
      ],
      sources: []
    };
    setState(prev => ({ 
      ...prev, 
      step: 'preview', 
      presentation: emptyPresentation,
      currentSlideIndex: 0 
    }));
  };

  const generateContentBackground = async (slides: Slide[], voice: string) => {
      for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          generateSlideImage(slide.imagePrompt).then(async img => {
              if (img) {
                const validation = await validateImage(img, slide.title, slide.bulletPoints);
                const url = await uploadToCloudinary(img, 'image');
                
                // Save to Asset Library automatically
                if (user && url) {
                  try {
                    const name = await nameAsset(img, slide.imagePrompt);
                    const assetData = {
                      name: `Slide ${i+1}: ${name}`,
                      imageBase64: url,
                      type: 'background',
                      userId: user.uid,
                      createdAt: new Date().toISOString()
                    };
                    const docRef = await addDoc(collection(db, 'assets'), assetData);
                    setAssets(prev => [{ id: docRef.id, ...assetData } as Asset, ...prev]);
                  } catch (e) {
                    console.error("Auto-save asset failed:", e);
                  }
                }

                // Clear imageBase64 once we have a URL to save memory and prevent Firestore size limits
                updateSlide(i, { 
                  imageBase64: url ? undefined : img, 
                  imageUrl: url || undefined, 
                  imageValidation: validation 
                });
              }
          });
      }
      for (let i = 0; i < slides.length; i++) {
         try {
             setState(prev => ({ ...prev, loadingStatus: `Dabuji slide ${i + 1}...`, progress: 60 + (i / slides.length) * 40 }));
             const audio = await generateSlideAudio(slides[i].speakerNotes, voice);
             if (audio) {
               const url = await uploadToCloudinary(audio, 'auto');
               // Clear audioBase64 once we have a URL
               updateSlide(i, { 
                 audioBase64: url ? undefined : audio, 
                 audioUrl: url || undefined 
               });
             }
             await new Promise(r => setTimeout(r, 800));
         } catch (e) {}
      }
      setState(prev => ({ ...prev, loadingStatus: 'Hotovo.' }));
  };

  const handleSave = async () => {
    if (!user || !state.presentation) return;
    try {
      setState(p => ({ ...p, loadingStatus: 'Ukládám do databáze...' }));
      
      // Sanitize data: Firestore doesn't support 'undefined' and has 1MB limit
      const sanitize = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(sanitize);
        if (obj !== null && typeof obj === 'object') {
          return Object.fromEntries(
            Object.entries(obj)
              .filter(([k, v]) => v !== undefined && k !== 'imageBase64' && k !== 'audioBase64')
              .map(([k, v]) => [k, sanitize(v)])
          );
        }
        return obj;
      };

      const isUpdate = !!state.presentation.id;
      const docData = sanitize({
        ...state.presentation,
        userId: user.uid,
        updatedAt: new Date().toISOString(),
        ...(isUpdate ? {} : { createdAt: new Date().toISOString() })
      });

      if (isUpdate) {
        await updateDoc(doc(db, 'presentations', state.presentation.id!), docData);
      } else {
        const docRef = await addDoc(collection(db, 'presentations'), docData);
        setState(p => ({ ...p, presentation: { ...state.presentation!, id: docRef.id } as PresentationData }));
      }
      
      fetchHistory(user.uid);
      alert(isUpdate ? "Aktualizováno!" : "Uloženo!");
    } catch (error) {
      console.error("Save error:", error);
      alert("Chyba při ukládání.");
    } finally {
      setState(p => ({ ...p, loadingStatus: 'Hotovo.' }));
    }
  };

  const updateSlide = (index: number, updates: any) => {
      setState(cur => {
          if (!cur.presentation) return cur;
          if (index === -99) {
             return { ...cur, presentation: { ...cur.presentation, welcomeSlide: { ...cur.presentation.welcomeSlide!, ...updates } } };
          }
          const newSlides = [...cur.presentation.slides];
          if (newSlides[index]) newSlides[index] = { ...newSlides[index], ...updates };
          return { ...cur, presentation: { ...cur.presentation, slides: newSlides } };
      });
  };

  const updatePresentation = (updates: Partial<PresentationData>) => {
    setState(cur => {
      if (!cur.presentation) return cur;
      return { ...cur, presentation: { ...cur.presentation, ...updates } };
    });
  };

  const addSlide = () => {
      setState(cur => {
          if (!cur.presentation) return cur;
          const index = cur.presentation.slides.length;
          const coords = getCoordinates(index);
          const newSlide: Slide = {
              id: Date.now(),
              title: "Nový slide",
              bulletPoints: ["Nová myšlenka"],
              speakerNotes: "",
              imagePrompt: "Minimalist illustration",
              x: coords.x,
              y: coords.y,
              z: coords.z,
              rotateX: coords.rotateX,
              rotateY: coords.rotateY,
              rotateZ: coords.rotateZ,
              layout: 'modern',
              shape: getRandomShape()
          };
          return { ...cur, presentation: { ...cur.presentation, slides: [...cur.presentation.slides, newSlide] } };
      });
  };

  const removeSlide = (index: number) => {
    if (!confirm("Opravdu chceš tento slide smazat?")) return;
    setState(cur => {
      if (!cur.presentation) return cur;
      const newSlides = [...cur.presentation.slides];
      newSlides.splice(index, 1);
      
      // Adjust currentIndex if necessary
      let newIdx = cur.currentSlideIndex;
      const hasWelcome = !!cur.presentation.welcomeSlide;
      const actualSlideIdx = hasWelcome ? cur.currentSlideIndex - 1 : cur.currentSlideIndex;
      
      // If we deleted the current slide or one before it, we might need to shift
      // This is complex, simplest is to just go to previous slide if current is deleted
      if (actualSlideIdx === index) {
        newIdx = Math.max(0, cur.currentSlideIndex - 1);
      } else if (actualSlideIdx > index) {
        newIdx = cur.currentSlideIndex - 1;
      }

      return { 
        ...cur, 
        currentSlideIndex: newIdx,
        presentation: { ...cur.presentation, slides: newSlides } 
      };
    });
  };

  const handleGenerateAsset = async (prompt: string) => {
    if (!user) return;
    try {
      setState(p => ({ ...p, loadingStatus: 'Generuji grafický prvek...' }));
      const stickerPrompt = `${prompt}, isolated on white background, high quality sticker, minimalist style, vibrant colors`;
      const img = await generateSlideImage(stickerPrompt);
      if (img) {
        const name = await nameAsset(img, prompt);
        const url = await uploadToCloudinary(img, 'image');
        
        const assetData = {
          name,
          imageBase64: url || img, // Prefer URL if available
          type: 'sticker',
          userId: user.uid,
          createdAt: new Date().toISOString()
        };
        
        const docRef = await addDoc(collection(db, 'assets'), assetData);
        const newAsset = { id: docRef.id, ...assetData } as Asset;
        setAssets(prev => [newAsset, ...prev]);
        return newAsset;
      }
    } catch (error) {
      console.error("Asset generation error:", error);
    } finally {
      setState(p => ({ ...p, loadingStatus: 'Hotovo.' }));
    }
  };

  if (isReadOnly && state.step === 'preview' && state.presentation) {
    return (
      <PresentationViewer 
        data={state.presentation} 
        loadingStatus={state.loadingStatus} 
        onReset={handleReset} 
        onUpdateSlide={updateSlide} 
        onUpdatePresentation={updatePresentation}
        onAddSlide={addSlide}
        onRemoveSlide={removeSlide}
        onSave={undefined}
        assets={assets}
        onGenerateAsset={handleGenerateAsset}
        onOpenAIDraft={undefined}
        error={state.error}
        onError={(msg) => setState(p => ({ ...p, error: msg }))}
        isReadOnly={true}
      />
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30">
      <nav className="border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl sticky top-0 z-50 flex-shrink-0">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setState(p => ({...p, step: 'input', presentation: null}))}>
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center font-black text-white group-hover:rotate-12 transition-transform">G</div>
            <span className="font-black text-lg tracking-tighter text-white">GYAI</span>
          </div>
          
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setState(p => ({ ...p, step: 'dashboard' }))}
              className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${state.step === 'dashboard' ? 'text-blue-500' : 'text-slate-500 hover:text-white'}`}
            >
              <History size={14} />
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => setState(p => ({ ...p, step: 'explore' }))}
              className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${state.step === 'explore' ? 'text-blue-500' : 'text-slate-500 hover:text-white'}`}
            >
              <Compass size={14} />
              <span>Explore</span>
            </button>
            <button 
              onClick={() => setState(p => ({ ...p, step: 'gallery' }))}
              className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${state.step === 'gallery' ? 'text-indigo-500' : 'text-slate-500 hover:text-white'}`}
            >
              <Library size={14} />
              <span>Galerie</span>
            </button>
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">{user.displayName}</span>
                    <button onClick={handleLogout} className="text-[9px] font-bold text-slate-500 hover:text-red-400 transition-colors uppercase tracking-widest">Odhlásit</button>
                  </div>
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-white/10 p-0.5" />
                </div>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 transition-all font-black text-[10px] uppercase tracking-widest text-white shadow-lg shadow-blue-900/20"
              >
                <LogIn size={14} />
                <span>Přihlásit se</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {state.error && (
        <div className="bg-red-500/20 border-y border-red-500/30 px-6 py-2 flex items-center justify-between animate-slide-down">
          <div className="flex items-center gap-3">
            <AlertTriangle size={14} className="text-red-400" />
            <span className="text-[10px] font-bold text-red-100 uppercase tracking-widest">{state.error}</span>
          </div>
          <button onClick={() => setState(p => ({ ...p, error: undefined }))} className="text-red-400/50 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          {/* Background Decor */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
          </div>

          <div className="container mx-auto px-6 py-12 relative z-10">
            {state.step === 'dashboard' && (
              <Dashboard 
                presentations={history}
                onOpen={(p) => setState(prev => ({ ...prev, step: 'preview', presentation: p }))}
                onCreateNew={handleCreateEmpty}
                onDelete={handleDeleteHistory}
                userName={user?.displayName || null}
              />
            )}

            {state.step === 'input' && (
              <InputSection 
                {...state} 
                setTopic={t => setState(p => ({...p, topic: t}))} 
                setSlideCount={c => setState(p => ({...p, slideCount: c}))} 
                setVoice={v => setState(p => ({...p, voice: v}))} 
                setFiles={f => setState(p => ({...p, files: f}))} 
                onGenerate={handleGenerateOutline} 
                onShowDemo={() => {}} 
                isGenerating={false} 
                onClose={() => setState(p => ({ ...p, step: p.presentation ? 'preview' : 'dashboard' }))}
              />
            )}

            {state.step === 'outline' && state.outline && (
              <PresentationOutline 
                outline={state.outline}
                onUpdate={(newOutline) => setState(p => ({ ...p, outline: newOutline }))}
                onGenerate={handleFullGenerate}
                isGenerating={state.loadingStatus !== ''}
              />
            )}

            {state.step === 'gallery' && (
              <Gallery 
                assets={assets}
                onDelete={handleDeleteAsset}
                onClose={() => setState(p => ({ ...p, step: 'dashboard' }))}
              />
            )}

            {state.step === 'explore' && (
              <Explore 
                onOpen={(p) => {
                   setState(prev => ({ ...prev, step: 'preview', presentation: p }));
                   setIsReadOnly(true);
                }}
                onClose={() => setState(p => ({ ...p, step: 'dashboard' }))}
              />
            )}
            
            {state.step === 'generating' && <LoadingScreen status={state.loadingStatus} progress={state.progress} />}
          </div>
        </main>
      </div>
      
      {state.step === 'preview' && state.presentation && (
        <PresentationViewer 
          data={state.presentation} 
          loadingStatus={state.loadingStatus} 
          onReset={handleReset} 
          onUpdateSlide={updateSlide} 
          onUpdatePresentation={updatePresentation}
          onAddSlide={addSlide}
          onRemoveSlide={removeSlide}
          onSave={user && !isReadOnly ? handleSave : undefined}
          assets={assets}
          onGenerateAsset={handleGenerateAsset}
          onOpenAIDraft={() => setState(p => ({ ...p, step: 'input' }))}
          error={state.error}
          onError={(msg) => setState(p => ({ ...p, error: msg }))}
          isReadOnly={isReadOnly}
        />
      )}
    </div>
  );
};

export default App;
