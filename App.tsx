
import React, { useState, useEffect } from 'react';
import { InputSection } from './components/InputSection';
import { LoadingScreen } from './components/LoadingScreen';
import { PresentationViewer } from './components/PresentationViewer';
import { AppState, PresentationData, Slide, Asset } from './types';
import { generatePresentationStructure, generateSlideImage, generateSlideAudio, validateImage, uploadToCloudinary, nameAsset } from './services/geminiService';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore';
import { LogIn, History, Plus, LogOut, Trash2 } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [history, setHistory] = useState<PresentationData[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const [state, setState] = useState<AppState>({
    step: 'input',
    topic: '',
    voice: 'Kore',
    slideCount: 5,
    files: [],
    filePreviews: [],
    presentation: null,
    currentSlideIndex: 0,
    loadingStatus: '',
    progress: 0
  });

  useEffect(() => {
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
    } catch (error) {
      console.error("Error fetching assets:", error);
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
    } catch (error) {
      console.error("Error fetching history:", error);
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
      setShowHistory(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleDeleteHistory = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Opravdu chceš tuto prezentaci smazat?")) return;
    try {
      const { deleteDoc, doc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'presentations', id));
      setHistory(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const getRandomShape = () => {
    const shapes = ['rounded-[3rem]', 'rounded-tl-[5rem] rounded-br-[5rem]', 'rounded-tr-[5rem] rounded-bl-[5rem]', 'rounded-[4rem]'];
    return shapes[Math.floor(Math.random() * shapes.length)];
  };

  const getCoordinates = (index: number) => {
      const colWidth = 1600;
      const rowHeight = 1000;
      const cols = 3; 
      const row = Math.floor(index / cols);
      const colPos = index % cols;
      const actualCol = row % 2 === 0 ? colPos : (cols - 1) - colPos;
      return { x: actualCol * colWidth, y: row * rowHeight };
  };

  const handleGenerateStructure = async () => {
    setState(prev => ({ ...prev, step: 'generating', loadingStatus: 'Sestavuji strukturu a vyhledávám podklady...', progress: 15 }));
    try {
      const { slides, sources, title, themeColor, welcomeSlide } = await generatePresentationStructure(state.topic, state.slideCount, state.files);
      
      if (!slides || slides.length === 0) {
        throw new Error("Nebyl vygenerován žádný obsah.");
      }

      const processedSlides: Slide[] = slides.map((s, index) => {
          const coords = getCoordinates(index);
          return { ...s, shape: getRandomShape(), x: coords.x, y: coords.y, layout: index % 2 === 0 ? 'classic' : 'reversed' };
      });
      setState(prev => ({ ...prev, step: 'preview', presentation: { topic: state.topic, presentationTitle: title, slides: processedSlides, sources, themeColor, welcomeSlide }, progress: 100 }));
      generateContentBackground(processedSlides, state.voice);
    } catch (error: any) {
      alert(error.message || "Chyba při generování.");
      setState(prev => ({ ...prev, step: 'input' }));
    }
  };

  const generateContentBackground = async (slides: Slide[], voice: string) => {
      for (let i = 0; i < slides.length; i++) {
          const slide = slides[i];
          generateSlideImage(slide.imagePrompt).then(async img => {
              if (img) {
                const validation = await validateImage(img, slide.title, slide.bulletPoints);
                const url = await uploadToCloudinary(img, 'image');
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
             setState(prev => ({ ...prev, loadingStatus: `Dabuji slide ${i + 1}...` }));
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
        const { doc, updateDoc } = await import('firebase/firestore');
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

  const updateSlide = (index: number, updates: Partial<Slide>) => {
      setState(cur => {
          if (!cur.presentation) return cur;
          const newSlides = [...cur.presentation.slides];
          if (newSlides[index]) newSlides[index] = { ...newSlides[index], ...updates };
          return { ...cur, presentation: { ...cur.presentation, slides: newSlides } };
      });
  };

  const addSlide = () => {
      setState(cur => {
          if (!cur.presentation) return cur;
          const newSlide: Slide = {
              id: cur.presentation.slides.length,
              title: "Nový slide",
              bulletPoints: ["Nová myšlenka"],
              speakerNotes: "",
              imagePrompt: "Minimalist illustration"
          };
          return { ...cur, presentation: { ...cur.presentation, slides: [...cur.presentation.slides, newSlide] } };
      });
  };

  const handleGenerateAsset = async (prompt: string) => {
    if (!user) return;
    try {
      setState(p => ({ ...p, loadingStatus: 'Generuji grafický prvek...' }));
      const stickerPrompt = `${prompt}, isolated on white background, high quality sticker, minimalist style`;
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

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      <nav className="border-b border-white/5 bg-[#020617]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setState(p => ({...p, step: 'input', presentation: null}))}>
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center font-black text-white group-hover:rotate-12 transition-transform">G</div>
            <span className="font-black text-lg tracking-tighter text-white">GYAI</span>
          </div>
          
          <div className="flex items-center gap-6">
            {user ? (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowHistory(!showHistory)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-md transition-all text-xs font-bold uppercase tracking-widest border ${showHistory ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'border-white/10 hover:bg-white/5 text-slate-400'}`}
                >
                  <History size={14} />
                  <span>Historie</span>
                </button>
                <div className="h-4 w-px bg-white/10"></div>
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

      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Sidebar History (Desktop) */}
        {user && (
          <aside className={`w-72 border-r border-white/5 bg-[#020617]/50 flex flex-col transition-all duration-300 ${showHistory ? 'translate-x-0' : '-translate-x-full absolute'}`}>
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Moje práce</h2>
              <span className="text-[10px] font-mono text-blue-500/50">{history.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {history.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => setState(prev => ({ ...prev, step: 'preview', presentation: p }))}
                  className={`group p-3 rounded-lg border transition-all cursor-pointer relative ${state.presentation?.id === p.id ? 'bg-blue-600/10 border-blue-500/30' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                >
                  <button 
                    onClick={(e) => handleDeleteHistory(e, p.id!)}
                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                  <h3 className="text-xs font-bold text-slate-200 mb-1 truncate pr-6">{p.presentationTitle}</h3>
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                    <span>{p.slides.length} SLIDŮ</span>
                    <span>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}</span>
                  </div>
                </div>
              ))}
              {history.length === 0 && (
                <div className="py-10 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">Žádná historie</div>
              )}
            </div>
          </aside>
        )}

        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          {/* Background Decor */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]"></div>
          </div>

          <div className="container mx-auto px-6 py-12 relative z-10">
            {state.step === 'input' && (
              <InputSection 
                {...state} 
                setTopic={t => setState(p => ({...p, topic: t}))} 
                setSlideCount={c => setState(p => ({...p, slideCount: c}))} 
                setVoice={v => setState(p => ({...p, voice: v}))} 
                setFiles={f => setState(p => ({...p, files: f}))} 
                onGenerate={handleGenerateStructure} 
                onShowDemo={() => {}} 
                isGenerating={false} 
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
          onReset={() => setState(p => ({...p, step: 'input', presentation: null}))} 
          onUpdateSlide={updateSlide} 
          onAddSlide={addSlide}
          onSave={user ? handleSave : undefined}
          assets={assets}
          onGenerateAsset={handleGenerateAsset}
        />
      )}
    </div>
  );
};

export default App;
