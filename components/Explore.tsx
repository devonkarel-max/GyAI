
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PresentationData } from '../types';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Search, Compass, Layout, Sparkles, Filter, ChevronRight, User, Clock, Share2, AlertTriangle, X } from 'lucide-react';

interface ExploreProps {
  onOpen: (p: PresentationData) => void;
  onClose: () => void;
}

export const Explore: React.FC<ExploreProps> = ({ onOpen, onClose }) => {
  const [presentations, setPresentations] = useState<PresentationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublished();
  }, []);

  const fetchPublished = async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'presentations'),
        where('isPublished', '==', true),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PresentationData));
      setPresentations(docs);
    } catch (err: any) {
      console.error("Error fetching explore items:", err);
      setError(err.message || "Nepodařilo se načíst veřejné lekce.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = presentations.filter(p => 
    p.presentationTitle.toLowerCase().includes(search.toLowerCase()) ||
    p.topic.toLowerCase().includes(search.toLowerCase())
  );

  const handleShare = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}?share=${id}`;
    navigator.clipboard.writeText(url);
    alert("Odkaz ke sdílení byl zkopírován do schránky!");
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-slate-200">
      {/* Header */}
      <div className="p-8 border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <Compass size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter italic text-white leading-tight">Prozkoumat</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
              Veřejná knihovna AI prezentací
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10 flex-1 md:flex-none">
            <Search size={14} className="text-slate-500" />
            <input 
              type="text" 
              placeholder="Hledat téma..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-medium text-slate-300 w-full md:w-64" 
            />
          </div>
          
          <button onClick={onClose} className="p-3 bg-white/5 rounded-xl border border-white/10 text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
        {error && (
            <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-3xl flex items-center gap-4 mb-8 text-red-500">
                <AlertTriangle size={24} />
                <p className="text-sm font-bold uppercase tracking-widest leading-relaxed">{error}</p>
            </div>
        )}

        {loading ? (
           <div className="h-full flex flex-col items-center justify-center gap-4 py-32">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Skladuji vesmírnou knihovnu...</p>
           </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <AnimatePresence mode="popLayout">
              {filtered.map((p, idx) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={p.id || idx}
                  onClick={() => onOpen(p)}
                  className="group relative h-72 bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden cursor-pointer hover:border-blue-500/50 transition-all hover:-translate-y-2 shadow-2xl flex flex-col"
                >
                    {/* Visual bg */}
                    <div 
                        className="absolute top-0 right-0 w-32 h-32 blur-[80px] opacity-10 -mr-12 -mt-12 transition-all group-hover:opacity-30 group-hover:scale-150"
                        style={{ backgroundColor: p.themeColor || '#3b82f6' }}
                    />

                    {/* Content */}
                    <div className="p-8 flex-1 flex flex-col justify-between relative z-10">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-blue-500 group-hover:bg-blue-600 group-hover:text-white transition-all">
                                    <Layout size={14} />
                                </div>
                                <button 
                                    onClick={(e) => handleShare(e, p.id!)}
                                    className="p-2 text-slate-500 hover:text-white transition-colors"
                                >
                                    <Share2 size={14} />
                                </button>
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter line-clamp-2 leading-tight group-hover:text-blue-400 transition-colors">
                                    {p.presentationTitle}
                                </h3>
                                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">{p.topic}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                                    <User size={10} className="text-slate-400" />
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Public Draft</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-blue-500 group-hover:translate-x-1 transition-transform">
                                <span className="text-[9px] font-black uppercase tracking-widest">Otevřít</span>
                                <ChevronRight size={10} />
                            </div>
                        </div>
                    </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-30 py-32">
            <Compass size={64} className="text-slate-600" />
            <p className="text-xl font-black uppercase tracking-widest italic">Nebyly nalezeny žádné lekce</p>
          </div>
        )}
      </div>
    </div>
  );
};
