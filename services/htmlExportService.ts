
import { PresentationData } from "../types";

export interface ExportOptions {
  includeAudio: boolean;
  includeNotes: boolean;
  includeSources: boolean;
  includeAnimations: boolean;
  includeDecorations: boolean;
  format: 'html' | 'aspx';
}

export const generateHTMLPresentation = (data: PresentationData, options: ExportOptions) => {
  // Pomocná funkce pro vyčištění textu pro HTML (ponechává formátování, ale maže hvězdičky tam, kde nepatří)
  const cleanMarkup = (text: string) => {
    if (!text) return "";
    return text.replace(/#/g, "").trim();
  };

  const filteredData = {
    ...data,
    slides: data.slides.map(s => ({
      ...s,
      audioBase64: options.includeAudio ? s.audioBase64 : undefined,
      speakerNotes: options.includeNotes ? s.speakerNotes : undefined
    })),
    sources: options.includeSources ? data.sources : []
  };

  const safeData = JSON.stringify(filteredData).replace(/</g, '\\u003c');
  const title = cleanMarkup(data?.presentationTitle || data?.topic || "Prezentace");
  const GAP_X = 1600;
  const GAP_Y_OFFSET = 1000;

  const bgObjects = [];
  if (options.includeDecorations) {
    const colors = ['bg-blue-600', 'bg-indigo-700', 'bg-sky-500', 'bg-slate-700', 'bg-blue-900'];
    for (let i = 0; i <= data.slides.length; i++) {
        for (let j = 0; j < 4; j++) {
            const size = 80 + Math.random() * 200;
            const x = (i * GAP_X) + (Math.random() - 0.5) * 2400;
            const y = (i % 2 === 0 ? 0 : GAP_Y_OFFSET) + (Math.random() - 0.5) * 1800;
            const bg = colors[Math.floor(Math.random() * colors.length)];
            const animDur = 15 + Math.random() * 20;
            bgObjects.push(`<div class="absolute ${bg} rounded-3xl opacity-[0.12] ${options.includeAnimations ? 'animate-float' : ''} pointer-events-none" style="left:${x}px; top:${y}px; width:${size}px; height:${size}px; animation-duration:${animDur}s;"></div>`);
        }
    }
  }

  const slidesHtml = (data?.slides || []).map((slide, index) => {
      const x = index % 3 * GAP_X; 
      const y = Math.floor(index / 3) * GAP_Y_OFFSET;
      const hasImage = !!slide.imageBase64;
      const shapeClass = slide.shape || 'rounded-[3rem]';

      // Logika pro detekci a zmenšení textu, aby nepřetékal
      const totalChars = slide.bulletPoints.reduce((acc, curr) => acc + curr.length, 0);
      const fontSizeClass = totalChars > 600 ? 'text-sm' : totalChars > 400 ? 'text-base' : 'text-lg';

      const formatText = (text: string) => {
          if (!text) return "";
          // Odstraní #, ale převede ** na silný text
          const cleaned = text.replace(/#/g, "");
          return cleaned.split(/(\*\*.*?\*\*)/g).map(part => {
              if (part.startsWith('**') && part.endsWith('**')) {
                  return `<strong class="text-white">${part.slice(2, -2)}</strong>`;
              }
              return `<span>${part}</span>`;
          }).join('');
      };

      const bulletsHtml = (slide.bulletPoints || []).map((bp, idx) => `
          <li class="bullet-point ${options.includeAnimations ? 'opacity-0 translate-x-[-10px]' : ''} transition-all duration-700 flex items-start text-slate-200" style="transition-delay: ${idx * 100}ms">
              <span class="w-2 h-2 rounded-full mt-2.5 mr-4 flex-shrink-0 bg-blue-500"></span>
              <span class="leading-relaxed ${fontSizeClass}">${formatText(bp)}</span>
          </li>`).join('');

      return `
      <div id="slide-${index}" class="slide-card absolute w-[1000px] h-[600px] bg-[#111827]/95 backdrop-blur-3xl border border-white/5 overflow-hidden flex shadow-2xl ${shapeClass} opacity-40 scale-95 blur-[1px] grayscale-[50%]" style="left: ${x}px; top: ${y}px;" onclick="goToSlide(${index})">
            <div class="flex w-full h-full ${slide.layout === 'reversed' && hasImage ? 'flex-row-reverse' : 'flex-row'} relative z-10">
                <div class="${hasImage ? 'w-1/2 p-14' : 'w-full p-20 text-center'} flex flex-col justify-center">
                    <h3 class="${hasImage ? 'text-4xl mb-6' : 'text-5xl mb-10'} font-black text-white leading-tight">${cleanMarkup(slide.title)}</h3>
                    <ul class="space-y-4 ${!hasImage ? 'max-w-2xl mx-auto text-left' : ''}">${bulletsHtml}</ul>
                </div>
                ${hasImage ? `
                <div class="w-1/2 p-8 h-full flex items-center justify-center">
                    <div class="w-full h-full ${shapeClass} overflow-hidden bg-slate-900 border border-white/5 shadow-2xl">
                        <img src="data:image/png;base64,${slide.imageBase64}" class="w-full h-full object-cover" />
                    </div>
                </div>` : ''}
            </div>
      </div>`;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Outfit', sans-serif; background-color: #020617; overflow: hidden; perspective: 2000px; color: white; }
        .slide-card { transition: all ${options.includeAnimations ? '1.0s' : '0.1s'} cubic-bezier(0.2, 0, 0.2, 1); }
        .camera-view { transition: transform ${options.includeAnimations ? '1.4s' : '0.1s'} cubic-bezier(0.2, 0, 0.2, 1); transform-style: preserve-3d; }
        @keyframes float { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(10px,-20px); } }
        .animate-float { animation: float 15s ease-in-out infinite; }
        .slide-active { opacity: 1 !important; transform: scale(1) !important; filter: none !important; blur: 0 !important; z-index: 50 !important; }
        .slide-active .bullet-point { opacity: 1 !important; transform: translateX(0) !important; }
        #notes-panel { transition: transform 0.4s ease, opacity 0.4s ease; transform: translateY(20px); opacity: 0; pointer-events: none; }
        #notes-panel.visible { transform: translateY(0); opacity: 1; pointer-events: auto; }
        .btn-active { color: #818cf8 !important; border-color: rgba(129, 140, 248, 0.4) !important; background: rgba(129, 140, 248, 0.1) !important; }
        .btn-disabled { opacity: 0.15 !important; pointer-events: none !important; }
    </style>
</head>
<body>
    <div id="camera" class="absolute top-0 left-0 w-full h-full camera-view">
        ${bgObjects.join('')}
        ${slidesHtml}
    </div>

    <div id="notes-panel" class="fixed bottom-24 right-8 w-96 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl z-[100] p-6">
        <h4 class="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center">POZNÁMKY K PREZENTACI</h4>
        <div id="notes-content" class="text-slate-300 text-sm leading-relaxed max-h-64 overflow-y-auto pr-3 whitespace-pre-wrap"></div>
    </div>

    <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-slate-900/90 backdrop-blur-2xl border border-white/10 px-8 py-4 rounded-full shadow-2xl z-50">
        <button onclick="prevSlide()" id="btn-prev" class="p-2 text-white hover:scale-125 transition-all"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m15 18-6-6 6-6"/></svg></button>
        <div class="font-black text-xl w-20 text-center flex items-center justify-center">
            <span id="curr">1</span><span class="text-slate-600 text-lg"> / ${data?.slides?.length || 0}</span>
        </div>
        <button onclick="nextSlide()" id="btn-next" class="p-2 text-white hover:scale-125 transition-all"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m9 18 6-6-6-6"/></svg></button>
        
        <div class="w-px h-6 bg-white/10 mx-2"></div>
        
        <button onclick="toggleAudio()" id="btn-audio" class="p-2 text-slate-400 hover:text-white transition-all rounded-full border border-transparent" title="Audio">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
        </button>

        <button onclick="toggleNotes()" id="btn-notes" class="p-2 text-slate-400 hover:text-white transition-all rounded-full border border-transparent" title="Poznámky">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
    </div>

    <script>
        const data = ${safeData};
        let currentIndex = 0;
        let notesVisible = false;
        let audio = new Audio();
        let isPlaying = false;

        function update() {
            const index = currentIndex;
            const slide = data.slides[index];
            if (!slide) return;
            const x = index % 3 * 1600;
            const y = Math.floor(index / 3) * 1000;
            const camX = (window.innerWidth/2) - x - 500;
            const camY = (window.innerHeight/2) - y - 300;
            
            document.getElementById('camera').style.transform = \`translate3d(\${camX}px, \${camY}px, 0)\`;
            
            for(let i=0; i<data.slides.length; i++) {
                const el = document.getElementById('slide-'+i);
                if(el) {
                  el.classList.remove('slide-active');
                  if(i === index) el.classList.add('slide-active');
                }
            }
            
            document.getElementById('curr').innerText = index + 1;
            document.getElementById('btn-prev').classList.toggle('opacity-20', index === 0);
            document.getElementById('btn-next').classList.toggle('opacity-20', index === data.slides.length - 1);
            
            document.getElementById('notes-content').textContent = slide.speakerNotes || 'K tomuto slidu nejsou poznámky.';
            
            const btnAudio = document.getElementById('btn-audio');
            const btnNotes = document.getElementById('btn-notes');
            btnAudio.classList.toggle('btn-disabled', !slide.audioBase64);
            btnNotes.classList.toggle('btn-disabled', !slide.speakerNotes);
            
            stopAudio();
        }

        function toggleNotes() {
            notesVisible = !notesVisible;
            document.getElementById('notes-panel').classList.toggle('visible', notesVisible);
            document.getElementById('btn-notes').classList.toggle('btn-active', notesVisible);
        }

        function toggleAudio() {
            const slide = data.slides[currentIndex];
            if (!slide.audioBase64) return;
            if (isPlaying) { stopAudio(); } 
            else {
                audio.src = "data:audio/wav;base64," + slide.audioBase64;
                audio.play();
                isPlaying = true;
                document.getElementById('btn-audio').classList.add('btn-active');
                audio.onended = stopAudio;
            }
        }

        function stopAudio() {
            audio.pause();
            isPlaying = false;
            document.getElementById('btn-audio').classList.remove('btn-active');
        }

        function nextSlide() { if(currentIndex < data.slides.length-1) { currentIndex++; update(); } }
        function prevSlide() { if(currentIndex > 0) { currentIndex--; update(); } }
        function goToSlide(i) { currentIndex = i; update(); }
        
        window.addEventListener('keydown', e => { 
            if(e.key==='ArrowRight' || e.key===' ') nextSlide(); 
            if(e.key==='ArrowLeft') prevSlide(); 
        });
        
        update();
    </script>
</body>
</html>`;
};
