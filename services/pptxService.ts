
import PptxGenJS from "pptxgenjs";
import { PresentationData, Slide, WelcomeSlide, SlideAsset, Asset } from "../types";
import { removeWhiteBackground } from "./imageUtils";

// Pomocná funkce pro vyčištění textu od Markdown artefaktů
const cleanText = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/\*\*/g, "") // Odstraní **
    .replace(/#/g, "")    // Odstraní #
    .replace(/\*/g, "")   // Odstraní samostatné *
    .replace(/__/g, "")   // Odstraní __
    .trim();
};

// Pomocná funkce pro výpočet optimální velikosti písma na základě délky textu a počtu odrážek
const getDynamicFontSize = (textArray: string[], baseSize: number): number => {
  const totalChars = textArray.reduce((acc, curr) => acc + curr.length, 0);
  const itemCount = textArray.length;
  
  let size = baseSize;
  
  // Agresivnější zmenšování aby se předešlo překrývání v Canva/PowerPointu
  if (totalChars > 800) size = baseSize - 10;
  else if (totalChars > 500) size = baseSize - 8;
  else if (totalChars > 300) size = baseSize - 6;
  else if (totalChars > 150) size = baseSize - 4;
  
  if (itemCount > 6) size -= 4;
  else if (itemCount > 4) size -= 2;
  
  return Math.max(size, 10);
};

// Helper to crop image to a rounded rectangle using Canvas
const processRoundedImage = async (base64Data: string, borderRadiusRatio: number = 0.1): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(base64Data); // Fallback
                return;
            }

            // Draw rounded rect path
            const radius = Math.min(img.width, img.height) * borderRadiusRatio;
            ctx.beginPath();
            ctx.moveTo(radius, 0);
            ctx.lineTo(img.width - radius, 0);
            ctx.quadraticCurveTo(img.width, 0, img.width, radius);
            ctx.lineTo(img.width, img.height - radius);
            ctx.quadraticCurveTo(img.width, img.height, img.width - radius, img.height);
            ctx.lineTo(radius, img.height);
            ctx.quadraticCurveTo(0, img.height, 0, img.height - radius);
            ctx.lineTo(0, radius);
            ctx.quadraticCurveTo(0, 0, radius, 0);
            ctx.closePath();
            ctx.clip();

            // Draw image inside the clip
            ctx.drawImage(img, 0, 0);
            
            // Export
            const newData = canvas.toDataURL('image/png').split(',')[1];
            resolve(newData);
        };
        img.onerror = () => resolve(base64Data); // Fallback
        img.src = `data:image/png;base64,${base64Data}`;
    });
};

// Helper to remove background (make white transparent) for sticker effect
const removeBackground = async (base64Data: string): Promise<string> => {
    return removeWhiteBackground(base64Data);
};

export const generatePPTX = async (data: PresentationData, assets: Asset[] = []) => {
  const pres = new PptxGenJS();
  
  const title = cleanText(data.presentationTitle || data.topic);
  pres.title = title;
  pres.subject = "AI Generated Presentation";
  
  pres.layout = "LAYOUT_16x9";

  const themeColor = (data.themeColor || "3b82f6").replace("#", "");
  const BG_COLOR = "020617";   
  const TEXT_COLOR = "FFFFFF"; 
  const BULLET_COLOR = themeColor; 

  pres.defineSlideMaster({
    title: "CANVAS_MASTER",
    background: { color: BG_COLOR },
  });

  const renderWelcomeSlide = async (pptSlide: PptxGenJS.Slide, welcome: WelcomeSlide) => {
    // Subtitle/Topic
    pptSlide.addText(welcome.subtitle.toUpperCase(), {
        x: 0.5, y: 1.0, w: 9.0, h: 0.4,
        fontSize: 14,
        fontFace: "Arial Black",
        color: themeColor,
        bold: true,
        charSpacing: 4
    });

    // Main Title
    pptSlide.addText(welcome.title.toUpperCase(), {
        x: 0.5, y: 1.5, w: 9.0, h: 2.0,
        fontSize: 42,
        fontFace: "Arial Black",
        color: TEXT_COLOR,
        bold: true,
        italic: true,
        charSpacing: -2,
        lineSpacing: 1.0
    });

    // Accent Line
    pptSlide.addShape(pres.ShapeType.rect, {
        x: 0.5, y: 3.6, w: 1.5, h: 0.1,
        fill: { color: themeColor }
    });

    // Description
    pptSlide.addText(welcome.description, {
        x: 0.5, y: 4.0, w: 6.0, h: 1.0,
        fontSize: 16,
        fontFace: "Arial",
        color: "cbd5e1",
        bold: true
    });

    // Presenter Info
    pptSlide.addText("PREZENTUJE", {
        x: 0.5, y: 5.0, w: 2.0, h: 0.2,
        fontSize: 9,
        fontFace: "Arial Black",
        color: "475569",
        bold: true
    });
    pptSlide.addText(welcome.presenter, {
        x: 0.5, y: 5.2, w: 2.0, h: 0.3,
        fontSize: 16,
        fontFace: "Arial",
        color: TEXT_COLOR,
        bold: true
    });

    if (welcome.website) {
        pptSlide.addText("WEB", {
            x: 3.0, y: 5.0, w: 2.0, h: 0.2,
            fontSize: 9,
            fontFace: "Arial Black",
            color: "475569",
            bold: true
        });
        pptSlide.addText(welcome.website, {
            x: 3.0, y: 5.2, w: 3.0, h: 0.3,
            fontSize: 16,
            fontFace: "Arial",
            color: TEXT_COLOR,
            bold: true
        });
    }
  };

  const renderCard = async (pptSlide: PptxGenJS.Slide, slideData: Slide | null, index: number, isSources: boolean = false) => {
     // Full page layout, no card borders
     const cardX = 0;
     const cardY = 0;
     const cardW = 10;
     const cardH = 5.625; // 16:9 full height

    if (isSources) {
         pptSlide.addText("Zdroje & Odkazy", {
            x: 0.5, y: 0.5, w: 9.0, h: 1.0,
            fontSize: 44,
            fontFace: "Arial Black",
            color: TEXT_COLOR,
            bold: true,
            italic: true,
            charSpacing: -2
        });
        
        const sourceText = data.sources.map(s => ({ 
            text: `• ${cleanText(s.title)}`, 
            options: { hyperlink: { url: s.uri }, breakLine: true, fontSize: 18, color: BULLET_COLOR } 
        }));
        pptSlide.addText(sourceText, {
            x: 0.5, y: 1.8, w: 9.0, h: 3.5,
            color: BULLET_COLOR, 
            paraSpaceAfter: 15,
            bold: true,
            valign: "top"
        });
        
    } else if (slideData) {
        const cleanedTitle = cleanText(slideData.title);
        const cleanedBullets = slideData.bulletPoints.map(bp => cleanText(bp));
        
        const titleFontSize = cleanedTitle.length > 50 ? 18 : (cleanedTitle.length > 30 ? 22 : 28);
        const bulletFontSize = getDynamicFontSize(cleanedBullets, 13);

        // Title - Bold, Italic
        pptSlide.addText(cleanedTitle.toUpperCase(), {
            x: 0.4, y: 0.4, w: 4.8, h: 1.0,
            fontSize: titleFontSize,
            fontFace: "Arial Black",
            color: TEXT_COLOR,
            bold: true,
            italic: true,
            valign: "top",
            charSpacing: -1,
            lineSpacing: 1.0
        });

        // Bullets with theme dots
        const bulletObjects: PptxGenJS.TextProps[] = cleanedBullets.map(bp => ({ 
            text: `  ${bp}`, 
            options: { 
                breakLine: true,
                bullet: { type: "bullet", characterCode: "2022", color: themeColor },
                color: "cbd5e1"
            } 
        }));

        pptSlide.addText(bulletObjects, {
            x: 0.5, y: 1.8, w: 4.8, h: 3.5,
            fontSize: bulletFontSize,
            fontFace: "Arial",
            color: "cbd5e1",
            paraSpaceAfter: 10,
            valign: "top",
            bold: true
        });

        const IMG_X = 5.2; 
        const IMG_W = 4.3;
        const IMG_H = 4.8;
        
        if (slideData.imageBase64 || slideData.imageUrl) {
             let imageData: { data?: string, path?: string } = {};
             
             if (slideData.imageBase64) {
                 // Check if it's a sticker (isolated on white)
                 const isSticker = slideData.imagePrompt?.toLowerCase().includes('isolated') || 
                                  slideData.imagePrompt?.toLowerCase().includes('white background');
                 
                 let processed = slideData.imageBase64;
                 if (isSticker) {
                     processed = await removeBackground(processed);
                 } else {
                     processed = await processRoundedImage(processed, 0.08);
                 }
                 imageData = { data: `image/png;base64,${processed}` };
             } else if (slideData.imageUrl) {
                 imageData = { path: slideData.imageUrl };
             }

             pptSlide.addImage({
                ...imageData,
                x: IMG_X, y: 0.4, w: IMG_W, h: IMG_H, 
                sizing: { type: "cover", w: IMG_W, h: IMG_H }
            });
        }

        // Add Assets (Stickers)
        if (slideData.assets && slideData.assets.length > 0) {
            for (const sa of slideData.assets) {
                const asset = assets.find(a => a.id === sa.assetId);
                if (asset) {
                    const assetBase64 = asset.imageBase64.startsWith('http') 
                        ? asset.imageBase64 
                        : `image/png;base64,${asset.imageBase64}`;
                    
                    // Convert percentage to inches (10x5.625)
                    const x = (sa.x / 100) * 10;
                    const y = (sa.y / 100) * 5.625;
                    const w = 2 * sa.scale; // Base width 2 inches
                    const h = 2 * sa.scale; // Base height 2 inches

                    pptSlide.addImage({
                        ...(asset.imageBase64.startsWith('http') ? { path: asset.imageBase64 } : { data: assetBase64 }),
                        x: x - (w/2), 
                        y: y - (h/2), 
                        w: w, 
                        h: h,
                        rotate: sa.rotation
                    });
                }
            }
        }
        
        if (slideData.audioBase64 || slideData.audioUrl) {
            const audioData = slideData.audioBase64 
                ? { data: `data:audio/wav;base64,${slideData.audioBase64}` }
                : { path: slideData.audioUrl };

            pptSlide.addMedia({
                type: "audio",
                ...audioData,
                x: 9.2, y: 5.0, w: 0.4, h: 0.4
            });
        }
    }
  };

  if (data.welcomeSlide) {
    const pptSlide = pres.addSlide({ masterName: "CANVAS_MASTER" });
    await renderWelcomeSlide(pptSlide, data.welcomeSlide);
  }

  const totalSlides = data.slides.length;
  for (let i = 0; i < totalSlides; i++) {
    const slide = data.slides[i];
    const pptSlide = pres.addSlide({ masterName: "CANVAS_MASTER" });
    await renderCard(pptSlide, slide, i);
    pptSlide.addNotes(cleanText(slide.speakerNotes));
  }

  if (data.sources.length > 0) {
      const pptSlide = pres.addSlide({ masterName: "CANVAS_MASTER" });
      await renderCard(pptSlide, null, -1, true);
  }

  await pres.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, '_').slice(0,30)}_Prezentace.pptx` });
};
