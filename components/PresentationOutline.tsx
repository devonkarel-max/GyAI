
import React, { useState } from 'react';
import { motion, Reorder } from 'framer-motion';
import { Sparkles, ArrowRight, Trash2, Plus, GripVertical } from 'lucide-react';
import { OutlineItem } from '../types';

interface PresentationOutlineProps {
  outline: OutlineItem[];
  onUpdate: (newOutline: OutlineItem[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export const PresentationOutline: React.FC<PresentationOutlineProps> = ({ outline, onUpdate, onGenerate, isGenerating }) => {
  const [items, setItems] = useState<OutlineItem[]>(outline);

  const handleUpdate = (index: number, title: string) => {
    const newItems = [...items];
    newItems[index].title = title;
    setItems(newItems);
    onUpdate(newItems);
  };

  const handleUpdatePoint = (slideIndex: number, pointIndex: number, text: string) => {
    const newItems = [...items];
    newItems[slideIndex].points[pointIndex] = text;
    setItems(newItems);
    onUpdate(newItems);
  };

  const removeSlide = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    onUpdate(newItems);
  };

  const addPoint = (index: number) => {
    const newItems = [...items];
    newItems[index].points.push("Nová myšlenka");
    setItems(newItems);
    onUpdate(newItems);
  };

  const removePoint = (slideIndex: number, pointIndex: number) => {
    const newItems = [...items];
    newItems[slideIndex].points.splice(pointIndex, 1);
    setItems(newItems);
    onUpdate(newItems);
  };

  const addSlide = () => {
    const newItems = [...items, { title: "Nový Slide", points: ["Zde doplň bod"] }];
    setItems(newItems);
    onUpdate(newItems);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">Osnova prezentace</h2>
          <p className="text-slate-400 font-medium">Uprav si strukturu dříve, než AI vygeneruje celý obsah.</p>
        </div>
        
        <button 
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-white font-black rounded-2xl shadow-xl shadow-blue-500/20 group uppercase tracking-widest text-xs"
        >
          {isGenerating ? "Generuji..." : (
            <>
                <span>Vytvořit prezentaci</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>

      <div className="space-y-6">
          {items.map((item, idx) => (
            <motion.div 
              key={idx}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white/5 border border-white/5 p-6 rounded-3xl backdrop-blur-xl relative group"
            >
              <div className="flex items-start gap-6">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400 font-black shrink-0">
                  {idx + 1}
                </div>
                
                <div className="flex-1 space-y-4">
                  <input 
                    value={item.title}
                    onChange={(e) => handleUpdate(idx, e.target.value)}
                    className="w-full bg-transparent border-none text-2xl font-black text-white p-0 focus:outline-none focus:ring-0 placeholder:opacity-20 uppercase italic tracking-tighter"
                    placeholder="Název slidu..."
                  />
                  
                  <div className="space-y-3">
                    {item.points.map((point, pIdx) => (
                      <div key={pIdx} className="flex items-center gap-3 group/point">
                         <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40" />
                         <input 
                           value={point}
                           onChange={(e) => handleUpdatePoint(idx, pIdx, e.target.value)}
                           className="flex-1 bg-transparent border-none text-slate-300 p-0 focus:outline-none focus:ring-0 text-sm font-medium"
                         />
                         <button 
                           onClick={() => removePoint(idx, pIdx)}
                           className="opacity-0 group-point-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-all"
                         >
                            <Trash2 size={12} />
                         </button>
                      </div>
                    ))}
                    
                    <button 
                      onClick={() => addPoint(idx)}
                      className="flex items-center gap-2 text-[10px] font-black text-blue-500/60 hover:text-blue-400 uppercase tracking-widest transition-colors mt-2"
                    >
                      <Plus size={12} /> Přidat bod
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => removeSlide(idx)}
                  className="opacity-0 group-hover:opacity-100 p-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
          
          <button 
            onClick={addSlide}
            className="w-full py-6 border-2 border-dashed border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all rounded-3xl flex items-center justify-center gap-3 text-slate-500 hover:text-white font-black uppercase tracking-widest text-[10px]"
          >
            <Plus size={16} /> Přidat další slide
          </button>
      </div>

      <div className="mt-12 flex justify-center pb-24">
        <button 
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex items-center gap-3 px-12 py-5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-white font-black rounded-2xl shadow-2xl shadow-blue-500/30 group uppercase tracking-widest text-sm"
        >
          {isGenerating ? "Generuji..." : (
            <>
                <Sparkles size={18} />
                <span>Začít generovat obsah</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
