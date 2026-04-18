
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

export const generatePresentationStructure = async (
  topic: string,
  count: number,
  files: File[]
): Promise<{ slides: Slide[]; sources: Source[]; title: string; themeColor: string; welcomeSlide: WelcomeSlide }> => {
  
  const rawFileParts = await Promise.all(files.map(fileToPart));
  const fileParts = rawFileParts.filter(p => p !== null) as any[];

  const prompt = `
    Jsi student tvořící školní prezentaci na téma: "${topic}".
    Počet slidů: ${count}.
    Generuj obsah v češtině.
    
    EXTRÉMNĚ DŮLEŽITÉ PRAVIDLO PRO TEXT (ZABRAŇ PŘETÉKÁNÍ):
    - Text na slajdech musí být MINIMÁLNÍ.
    - Maximálně 3-4 odrážky na jeden slide.
    - Každá odrážka SMÍ MÍT maximálně 6-8 slov.
    - Nadpisy slajdů max 5 slov.
    - ABSOLUTNĚ ŽÁDNÉ formátování jako **tučné**, # hashtagy. Vrať čistý text.
    
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
    model: "gemini-2.0-flash",
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
};

export const updateSlideContent = async (slide: Slide, request: string): Promise<Partial<Slide>> => {
  const prompt = `
    Aktualizuj slide: "${slide.title}".
    Uživatel chce: "${request}"
    STRIKTNÍ PRAVIDLO: Texty extrémně krátké. Max 4 odrážky, max 8 slov na odrážku. Žádné ** ani #.
    Pokud uživatel chce změnit obrázek, uprav "imagePrompt" tak, aby odpovídal novému požadavku.
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
    model: "gemini-2.0-flash",
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
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: imagePrompt }] },
      config: { imageConfig: { aspectRatio: "1:1" } }
    });
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
  } catch (error: any) {
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
      model: "gemini-2.0-flash",
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
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } },
      },
    });
    const base64PCM = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64PCM) return addWavHeader(base64PCM);
  } catch (error: any) {
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
      model: "gemini-2.0-flash",
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
