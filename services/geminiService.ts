
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Slide, Source, WelcomeSlide } from "../types";

export const fileToPart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } } | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result || !result.includes(',')) {
        resolve(null);
        return;
      }
      const base64String = result.split(',')[1];
      if (!base64String) {
        resolve(null);
        return;
      }
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
};

export const uploadToCloudinary = async (base64Data: string, resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'): Promise<string | null> => {
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: base64Data.startsWith('data:') ? base64Data : `data:${resourceType === 'image' ? 'image/png' : 'audio/wav'};base64,${base64Data}`,
        resource_type: resourceType
      })
    });
    if (!response.ok) throw new Error('Upload failed');
    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return null;
  }
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const addWavHeader = (base64Pcm: string): string => {
  const binaryString = atob(base64Pcm);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(44 + len);
  const view = new DataView(buffer);
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + len, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 24000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, len, true);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) bytes[44 + i] = binaryString.charCodeAt(i);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const layouts = ['classic', 'reversed', 'modern', 'immersive', 'minimal', 'bento', 'split', 'hero', 'gallery'];

export const generatePresentationOutline = async (
  topic: string,
  count: number,
  files: File[]
): Promise<{ title: string; outline: { title: string; points: string[] }[] }> => {
  try {
    const rawFileParts = await Promise.all(files.map(fileToPart));
    const fileParts = rawFileParts.filter(p => p !== null) as any[];

    const prompt = `
      Jsi student tvořící osnovu školní prezentace na téma: "${topic}".
      Počet slidů: ${count}.
      
      VELEDULEŽITÉ: Úvodní slajd (po vítacím) musí téma představit tak polopatě, aby ho pochopil i člověk, který o něm nikdy neslyšel. Musí to být jasný a srozumitelný úvod do kontextu.
      
      Navrhni osnovu (nadpisy a hlavní body) v češtině.
      Vrať JSON: { "title": string, "outline": [ { "title": string, "points": string[] } ] }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...fileParts, { text: prompt }] },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            outline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  points: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["title", "points"]
              }
            }
          },
          required: ["title", "outline"]
        } as any
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error: any) {
    throw error;
  }
};

export const generatePresentationFromOutline = async (
  topic: string,
  outline: { title: string; points: string[] }[],
  files: File[]
): Promise<{ slides: Slide[]; sources: Source[]; title: string; themeColor: string; welcomeSlide: WelcomeSlide }> => {
  try {
    const rawFileParts = await Promise.all(files.map(fileToPart));
    const fileParts = rawFileParts.filter(p => p !== null) as any[];

    const prompt = `
      Na základě této osnovy vygeneruj kompletní obsah prezentace na téma "${topic}":
      ${JSON.stringify(outline)}
      
      DŮLEŽITÉ: Ten úplně první slajd s obsahem (po welcome slidu) musí být "Úvod do problematiky". Musí jasně a jednoduše vysvětlit, o co jde, i laikovi.
      
      EXTRÉMNĚ DŮLEŽITÉ PRAVIDLO PRO TEXT (ZABRAŇ PŘETÉKÁNÍ):
      - Text na slajdech musí být MINIMÁLNÍ.
      - Maximálně 3-4 odrážky na jeden slide.
      - Každá odrážka SMÍ MÍT maximálně 5-7 slov.
      - Nadpisy slajdů max 4 slova.
      - ABSOLUTNĚ ŽÁDNÉ formátování (**tučné**, #). Clean text.
      
      Vrať JSON podle schématu pro všechny ${outline.length} slidů.
    `;
    
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        presentationTitle: { type: Type.STRING },
        themeColor: { type: Type.STRING },
        welcomeSlide: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            description: { type: Type.STRING },
            presenter: { type: Type.STRING },
            website: { type: Type.STRING }
          },
          required: ["title", "subtitle", "description", "presenter"]
        },
        slides: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              bulletPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              speakerNotes: { type: Type.STRING },
              imagePrompt: { type: Type.STRING }
            },
            required: ["title", "bulletPoints", "speakerNotes", "imagePrompt"]
          }
        }
      },
      required: ["presentationTitle", "themeColor", "welcomeSlide", "slides"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...fileParts, { text: prompt }] },
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: responseSchema as any
      },
    });

    let parsed = JSON.parse(response.text || "{}");
    
    const sources: Source[] = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
      });
    }

    const slides: Slide[] = (parsed.slides || []).map((s: any, idx: number) => ({
      id: idx,
      title: s.title || "Slide bez názvu",
      bulletPoints: Array.isArray(s.bulletPoints) ? s.bulletPoints : [],
      speakerNotes: s.speakerNotes || "",
      imagePrompt: s.imagePrompt || topic
    }));

    return { 
      slides, 
      sources: sources.slice(0, 4), 
      title: parsed.presentationTitle || topic,
      themeColor: parsed.themeColor || "#3b82f6",
      welcomeSlide: parsed.welcomeSlide || {
          title: parsed.presentationTitle || topic,
          subtitle: "Prezentace",
          description: "Vítejte u této prezentace.",
          presenter: "AI Student"
      }
    };
  } catch (error: any) {
    throw error;
  }
};

export const generatePresentationStructure = async (
  topic: string,
  count: number,
  files: File[]
): Promise<{ slides: Slide[]; sources: Source[]; title: string; themeColor: string; welcomeSlide: WelcomeSlide }> => {
  try {
    const rawFileParts = await Promise.all(files.map(fileToPart));
    const fileParts = rawFileParts.filter(p => p !== null) as any[];

    const prompt = `
      Jsi student tvořící školní prezentaci na téma: "${topic}".
      Počet slidů: ${count}.
      
      DŮLEŽITÉ: Ten úplně první slajd s obsahem (po welcome slidu) musí být "Úvod do problematiky". Musí jasně a jednoduše vysvětlit, o co jde, i laikovi.
      
      Generuj obsah v češtině.
      
      EXTRÉMNĚ DŮLEŽITÉ PRAVIDLO PRO TEXT (ZABRAŇ PŘETÉKÁNÍ):
      - Text na slajdech musí být MINIMÁLNÍ.
      - Maximálně 3-4 odrážky na jeden slide.
      - Každá odrážka SMÍ MÍT maximálně 6-8 slov.
      - Nadpisy slajdů max 5 slov.
      - ABSOLUTNĚ ŽÁDNÉ formátování jako **tučné**, # hashtagy. Vrať čistý text.
      
      PRAVIDLO PRO OBRAZOVÉ PROMPTY (STICKER STYLE):
      - "imagePrompt" musí být v angličtině.
      - Musí to být detailní popis grafického prvku ve stylu STICKERU (minimalistický 3D render nebo čistá ilustrace).
      - VŽDY přidej: "isolated on solid white background, high quality sticker style, vibrant, no shadows, masterpiece".
      - Obraz nesmí mít žádné pozadí (jen bílé), aby šlo pak automaticky odstranit.
      
      Vrať JSON podle schématu.
    `;
    
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        presentationTitle: { type: Type.STRING },
        themeColor: { type: Type.STRING },
        welcomeSlide: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            description: { type: Type.STRING },
            presenter: { type: Type.STRING },
            website: { type: Type.STRING }
          },
          required: ["title", "subtitle", "description", "presenter"]
        },
        slides: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              bulletPoints: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              speakerNotes: { type: Type.STRING },
              imagePrompt: { type: Type.STRING }
            },
            required: ["title", "bulletPoints", "speakerNotes", "imagePrompt"]
          }
        }
      },
      required: ["presentationTitle", "themeColor", "welcomeSlide", "slides"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [...fileParts, { text: prompt }] },
      config: { 
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: responseSchema as any
      },
    });

    let rawJSON = response.text || "{}";
    let parsed: any = { slides: [], presentationTitle: topic };
    try {
      parsed = JSON.parse(rawJSON);
    } catch (e) {
      console.error("JSON parse failed", rawJSON);
    }
    
    const sources: Source[] = [];
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) sources.push({ title: chunk.web.title, uri: chunk.web.uri });
      });
    }

    const slides: Slide[] = (parsed.slides || []).map((s: any, idx: number) => ({
      id: idx,
      title: s.title || "Slide bez názvu",
      bulletPoints: Array.isArray(s.bulletPoints) ? s.bulletPoints : [],
      speakerNotes: s.speakerNotes || "",
      imagePrompt: s.imagePrompt || topic
    }));

    return { 
      slides, 
      sources: sources.slice(0, 4), 
      title: parsed.presentationTitle || topic,
      themeColor: parsed.themeColor || "#3b82f6",
      welcomeSlide: parsed.welcomeSlide || {
          title: parsed.presentationTitle || topic,
          subtitle: "Prezentace",
          description: "Vítejte u této prezentace.",
          presenter: "AI Student"
      }
    };
  } catch (error: any) {
    const rawMessage = error.message || String(error);
    if (rawMessage.toLowerCase().includes('quota') || rawMessage.includes('429')) {
      throw new Error(`AI Limit vyčerpán (Quota Exceeded). Detail: ${rawMessage}`);
    }
    throw error;
  }
};

export const updateSlideContent = async (slide: Slide, request: string): Promise<Partial<Slide>> => {
  const prompt = `
    Aktualizuj slide: "${slide.title}".
    Uživatel chce: "${request}"
    STRIKTNÍ PRAVIDLO: Texty extrémně krátké. Max 4 odrážky, max 8 slov na odrážku. Žádné ** ani #.
    Pokud uživatel chce změnit obrázek, uprav "imagePrompt" tak, aby odpovídal novému požadavku. VŽDY přidej: "isolated on white background, sticker style, no detail in background".
    Pokud uživatel chce změnit text, uprav "title", "bulletPoints" a "speakerNotes".
    Vrať JSON podle schématu.
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      bulletPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      speakerNotes: { type: Type.STRING },
      imagePrompt: { type: Type.STRING }
    }
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts: [{ text: prompt }] },
    config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema as any
    }
  });
  let rawJSON = response.text || "{}";
  try { return JSON.parse(rawJSON); } catch (e) { return {}; }
};

export const generateSlideImage = async (imagePrompt: string, retries = 3): Promise<string | undefined> => {
  if (!imagePrompt || imagePrompt.trim() === "") return undefined;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image", 
      contents: {
        parts: [
          { text: `Generate a high quality visual asset for a school presentation about: ${imagePrompt}. Clean style, high quality, suitable for educational use.` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(p => p.inlineData);
    const base64Data = imagePart?.inlineData?.data;
    
    if (base64Data) return base64Data;
    
    console.warn("No image data in Gemini response:", response);
  } catch (error: any) {
    const rawMessage = error.message || String(error);
    console.error("Gemini image generation error:", rawMessage);
    if (rawMessage.toLowerCase().includes('quota') || rawMessage.includes('429')) {
        throw new Error(`Obrázkový AI Limit vyčerpán. Detail: ${rawMessage}`);
    }
    if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return generateSlideImage(imagePrompt, retries - 1);
    }
  }
  return undefined;
};

export const validateImage = async (imageBase64: string, slideTitle: string, slideBullets: string[]): Promise<Slide['imageValidation']> => {
  try {
    const prompt = `
      Jsi vizuální kritik. Analyzuj tento obrázek vzhledem k tématu slidu: "${slideTitle}".
      Obsah slidu: ${slideBullets.join(', ')}.
      Hledej:
      1. Anatomické chyby (pokud jsou tam lidé).
      2. Relevanci k textu.
      3. Nesmyslné artefakty AI.
      Vrať JSON: { "isOk": boolean, "reason": "Krátké zdůvodnění v češtině", "score": number }
    `;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType: "image/png" } },
          { text: prompt }
        ]
      },
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text);
  } catch (e) {
    return { isOk: true, reason: "Kontrola se nezdařila, ale obrázek byl ponechán.", score: 5 };
  }
};

export const generateSlideAudio = async (text: string, voiceName: string = 'Kore', retries = 3): Promise<string | undefined> => {
  if (!text || text.trim() === "") return undefined;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview", 
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } },
      },
    });
    const base64PCM = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64PCM) return addWavHeader(base64PCM);
  } catch (error: any) {
    const rawMessage = error.message || String(error);
    if (rawMessage.toLowerCase().includes('quota') || rawMessage.includes('429')) {
        throw new Error(`Hlasový AI Limit vyčerpán. Detail: ${rawMessage}`);
    }
    if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 4000));
        return generateSlideAudio(text, voiceName, retries - 1);
    }
  }
  return undefined;
};

export const previewVoice = async (voiceName: string): Promise<string | undefined> => {
    return await generateSlideAudio("Ahoj, tohle je ukázka mého hlasu.", voiceName);
};

export const nameAsset = async (imageBase64: string, prompt: string): Promise<string> => {
  try {
    const aiPrompt = `Analyzuj tento obrázek (sticker) vygenerovaný na dotaz "${prompt}". Vymysli pro něj krátký, výstižný název v češtině (max 3 slova). Vrať pouze ten název.`;
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { inlineData: { data: imageBase64, mimeType: "image/png" } },
          { text: aiPrompt }
        ]
      }
    });
    return response.text.trim();
  } catch (e) {
    return "Nový prvek";
  }
};

export const generateExtendedNotes = async (slide: Slide, topic: string): Promise<{ speakerNotes: string; deepDive: string; aiScript: string }> => {
  const prompt = `
    Jsi expert na vzdělávání. Vygeneruj detailní podklady k tomuto slajdu prezentace na téma "${topic}".
    
    Slajd: "${slide.title}"
    Obsah: ${slide.bulletPoints.join(', ')}
    
    Vygeneruj tři sekce v češtině:
    1. Poznámky pro řečníka (Co přesně říct k těmto bodům, aby to bylo poutavé).
    2. Hluboký vhled (Dodatečné informace a kontext pro prezentujícího, aby tématu opravdu rozuměl a mohl odpovídat na dotazy).
    3. AI Skript (Jak by tento slajd odprezentovala umělá inteligence - profesionálně, jasně, stručně).
    
    Vrať JSON: { "speakerNotes": string, "deepDive": string, "aiScript": string }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            speakerNotes: { type: Type.STRING },
            deepDive: { type: Type.STRING },
            aiScript: { type: Type.STRING }
          },
          required: ["speakerNotes", "deepDive", "aiScript"]
        } as any
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to generate extended notes:", e);
    return { 
      speakerNotes: slide.speakerNotes || "K tomuto slajdu zatím nejsou podrobnější poznámky.",
      deepDive: "Nepodařilo se vygenerovat dodatečné informace.",
      aiScript: "Omlouvám se, nepodařilo se vygenerovat AI skript."
    };
  }
};
