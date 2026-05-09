
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Asset } from '../types';
import { Image as ImageIcon, Trash2, Search, Filter, Plus, X, CheckCircle2, Layout, Sparkles } from 'lucide-react';

interface GalleryProps {
  assets: Asset[];
  onDelete: (id: string) => void;
  onSelect?: (asset: Asset) => void;
  onClose?: () => void;
  isPicker?: boolean;
}

export const Gallery: React.FC<GalleryProps> = ({ assets, onDelete, onSelect, onClose, isPicker }) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<'all' | 'background' | 'sticker'>('all');

  const filteredAssets = assets.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || a.type === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className={`flex flex-col h-full bg-[#020617] text-slate-200 ${isPicker ? 'rounded-[2.5rem] overflow-hidden' : ''}`}>
      {/* Header */}
      <div className="p-8 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter italic text-white leading-tight">Moje Galerie</h2>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
              {assets.length} uložených vizuálů
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
            <Search size={14} className="text-slate-500" />
            <input 
              type="text" 
              placeholder="Hledat vizuál..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-xs font-medium text-slate-300 w-48" 
            />
          </div>
          
          <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl">
             {(['all', 'background', 'sticker'] as const).map((f) => (
               <button
                 key={f}
                 onClick={() => setFilter(f)}
                 className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filter === f ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
               >
                 {f === 'all' ? 'Vše' : f === 'background' ? 'Pozadí' : 'Prvky'}
               </button>
             ))}
          </div>

          {onClose && (
            <button onClick={onClose} className="p-3 bg-white/5 rounded-xl border border-white/10 text-slate-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
        {filteredAssets.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            <AnimatePresence mode="popLayout">
              {filteredAssets.map((asset) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={asset.id}
                  className="group relative aspect-[4/3] bg-white/[0.02] border border-white/5 rounded-[2.5rem] overflow-hidden hover:border-indigo-500/50 transition-all shadow-xl hover:shadow-indigo-500/5"
                >
                  <img 
                    src={asset.imageBase64.startsWith('http') ? asset.imageBase64 : `data:image/png;base64,${asset.imageBase64}`} 
                    alt={asset.name} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-[#020617]/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-6">
                    <div className="flex justify-end gap-2">
                       <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(asset.id); }}
                        className="p-3 bg-red-600/20 border border-red-500/20 text-red-500 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-lg"
                       >
                         <Trash2 size={16} />
                       </button>
                    </div>

                    <div>
                      <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 mb-1 block">{asset.type}</span>
                      <h3 className="text-white font-black text-sm uppercase italic tracking-tighter truncate leading-tight">{asset.name}</h3>
                      
                      {onSelect && (
                        <button 
                          onClick={() => onSelect(asset)}
                          className="mt-4 w-full py-3 bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-xl"
                        >
                          <CheckCircle2 size={14} className="inline mr-2" /> Vybrat
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-30">
            <Layout size={64} className="text-slate-600" />
            <p className="text-xl font-black uppercase tracking-widest italic">Galerie je prázdná</p>
          </div>
        )}
      </div>
    </div>
  );
};
