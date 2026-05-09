
import React from 'react';
import { motion } from 'motion/react';
import { PresentationData } from '../types';
import { Plus, Layout, Clock, ChevronRight, Wand2, Trash2, Search, Filter, Sparkles, MoreVertical, Share2 } from 'lucide-react';

interface DashboardProps {
  presentations: PresentationData[];
  onOpen: (p: PresentationData) => void;
  onCreateNew: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  userName: string | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ presentations, onOpen, onCreateNew, onDelete, userName }) => {
  const handleShare = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const url = `${window.location.origin}${window.location.pathname}?share=${id}`;
    navigator.clipboard.writeText(url);
    alert("Odkaz ke sdílení byl zkopírován do schránky!");
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Meta Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-10"
      >
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
                <Sparkles size={20} className="text-white" />
            </div>
            <div>
                <h2 className="text-xs font-black uppercase tracking-[0.4em] text-blue-500 mb-0.5">StudentAI</h2>
                <p className="text-slate-500 text-[8px] font-bold uppercase tracking-widest leading-none">Professional Presenter v2.0</p>
            </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
                <Search size={12} className="text-slate-500" />
                <input type="text" placeholder="Hledat..." className="bg-transparent border-none outline-none text-[10px] font-medium text-slate-300 w-32" />
            </div>
            <button className="p-2 bg-white/5 rounded-lg border border-white/10 text-slate-400 hover:text-white transition-colors">
                <Filter size={16} />
            </button>
        </div>
      </motion.div>

      {/* Main Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div className="space-y-2">
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[4rem] font-black text-white tracking-tighter uppercase italic leading-[0.8] mb-2"
          >
            Studio
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.4em] flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            Vítej zpět{userName ? `, ${userName}` : ''} • {presentations.length} projektů
          </motion.p>
        </div>
        
        <motion.button 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onCreateNew}
          className="group relative flex items-center gap-3 px-8 py-4 bg-white text-black rounded-2xl transition-all shadow-2xl shadow-blue-500/20"
        >
          <Plus size={18} className="group-hover:rotate-90 transition-transform duration-500" />
          <span className="font-black text-[11px] uppercase tracking-widest">Nový Projekt</span>
        </motion.button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create Card (Empty State Trigger) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          onClick={onCreateNew}
          className="group h-64 border-2 border-dashed border-white/10 bg-white/[0.01] hover:bg-white/[0.03] hover:border-blue-500/50 rounded-[2rem] flex flex-col items-center justify-center gap-4 cursor-pointer transition-all relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:scale-110 group-hover:bg-blue-600 group-hover:border-blue-500 transition-all shadow-2xl">
            <Plus size={24} />
          </div>
          <div className="text-center space-y-0.5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 group-hover:text-white transition-colors">Vytvořit prezentaci</p>
            <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Začít od čisté karty</p>
          </div>
        </motion.div>

        {presentations.map((p, idx) => (
          <motion.div 
            key={p.id || idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + idx * 0.05 }}
            onClick={() => onOpen(p)}
            className="group relative h-64 bg-white/[0.02] backdrop-blur-3xl border border-white/5 rounded-[2rem] overflow-hidden cursor-pointer hover:border-white/20 transition-all hover:translate-y-[-4px] shadow-2xl flex flex-col"
          >
            {/* Visual background based on theme color */}
            <div 
              className="absolute top-0 right-0 w-32 h-32 blur-[80px] opacity-10 -mr-12 -mt-12 transition-all group-hover:opacity-30 group-hover:scale-150"
              style={{ backgroundColor: p.themeColor || '#3b82f6' }}
            ></div>

            {/* Thumbnail Preview Area */}
            <div className="h-32 bg-white/[0.03] relative overflow-hidden flex items-center justify-center group-hover:bg-white/[0.06] transition-colors">
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#020617] to-transparent" />
                <div className="p-6 w-full">
                    <Layout className="w-10 h-10 text-blue-500/30 group-hover:scale-110 group-hover:text-blue-500 transition-all" />
                </div>
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <button 
                        onClick={(e) => handleShare(e, p.id!)}
                        className="w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-black transition-all"
                        title="Sdílet odkaz"
                    >
                        <Share2 size={12} />
                    </button>
                    <button 
                        onClick={(e) => onDelete(e, p.id!)}
                        className="w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-slate-500 hover:text-red-400 hover:bg-black transition-all"
                    >
                        <Trash2 size={12} />
                    </button>
                    <div className="w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-lg text-slate-500">
                        <MoreVertical size={12} />
                    </div>
                </div>
            </div>

            <div className="p-6 flex-1 flex flex-col justify-between relative z-10 -mt-4">
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter line-clamp-1 leading-tight group-hover:text-blue-400 transition-colors">
                  {p.presentationTitle}
                </h3>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                   <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center">
                     <Clock size={10} className="text-blue-500" />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[9px] font-black text-white uppercase tracking-widest leading-none mb-0.5">Datum</span>
                     <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : 'Dnes'}</span>
                   </div>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-xl">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{p.slides.length}</span>
                    <Layout size={8} className="text-blue-500" />
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {presentations.length === 0 && (
         <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-12 py-32 text-center border-2 border-dashed border-white/10 rounded-[3rem] bg-white/[0.01]"
         >
            <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border border-white/10">
                <Wand2 size={40} className="text-slate-700" />
            </div>
            <h3 className="text-white text-2xl font-black uppercase italic tracking-[0.2em] mb-4">Tvůj tvůrčí prostor je prázdný</h3>
            <p className="text-slate-500 text-sm font-medium max-w-sm mx-auto leading-relaxed">Představ si téma a my ti pomůžeme vytvořit prezentaci, která vyrazí dech.</p>
            <button 
                onClick={onCreateNew}
                className="mt-12 px-10 py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-3xl font-black uppercase text-xs tracking-widest transition-all shadow-xl shadow-blue-900/30"
            >
                Vytvoř svou první prezentaci
            </button>
         </motion.div>
      )}
    </div>
  );
};
