
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";
import { PresentationData, Slide } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const presentationTools: FunctionDeclaration[] = [
  {
    name: "update_slide_content",
    description: "Update the title and bullet points of a specific slide.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        slideIndex: { type: Type.INTEGER, description: "Index of the slide (0-based)." },
        title: { type: Type.STRING, description: "New title for the slide." },
        bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "New list of bullet points." }
      },
      required: ["slideIndex"]
    }
  },
  {
    name: "add_new_slide",
    description: "Add a new slide to the presentation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "Title of the new slide." },
        bulletPoints: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Initial bullet points." }
      },
      required: ["title"]
    }
  },
  {
    name: "remove_slide",
    description: "Remove a slide from the presentation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        slideIndex: { type: Type.INTEGER, description: "Index of the slide to remove." }
      },
      required: ["slideIndex"]
    }
  },
  {
    name: "change_theme_color",
    description: "Change the theme color of the presentation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        color: { type: Type.STRING, description: "Hex color code (e.g., #ff0000)." }
      },
      required: ["color"]
    }
  },
  {
      name: "change_slide_layout",
      description: "Change the layout of a specific slide.",
      parameters: {
          type: Type.OBJECT,
          properties: {
              slideIndex: { type: Type.INTEGER },
              layout: { type: Type.STRING, enum: ["default", "reversed", "fullImage", "centeredText"] }
          },
          required: ["slideIndex", "layout"]
      }
  }
];

export async function chatWithAI(
    message: string, 
    presentation: PresentationData,
    onToolCall: (name: string, args: any) => void
) {
    const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
            systemInstruction: `You are an expert presentation designer. You help users edit their presentation called "${presentation.presentationTitle || 'Prezentace'}". 
            You can update content, add or remove slides, and change theme colors. 
            When the user asks for a change, call the appropriate function. 
            The presentation has ${presentation.slides.length} slides.`,
            tools: [{ functionDeclarations: presentationTools }]
        },
        history: [] // We can maintain history in the component if needed
    });

    const result = await chat.sendMessage({ message });
    
    if (result.functionCalls) {
        for (const call of result.functionCalls) {
            onToolCall(call.name, call.args);
        }
        return "Provedl jsem požadované změny v prezentaci.";
    }

    return result.text;
}
