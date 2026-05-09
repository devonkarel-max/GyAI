
export interface SlideAsset {
  assetId: string;
  x: number; // 0-100
  y: number; // 0-100
  scale: number;
  rotation: number;
}

export interface WelcomeSlide {
  title: string;
  subtitle: string;
  description: string;
  presenter: string;
  website?: string;
}

export interface Asset {
  id: string;
  name: string;
  imageBase64: string;
  type: 'sticker' | 'background';
  userId: string;
  createdAt: string;
}

export interface Slide {
  id: number;
  title: string;
  bulletPoints: string[];
  speakerNotes: string;
  imagePrompt: string;
  imageBase64?: string; 
  imageUrl?: string;
  audioBase64?: string; 
  audioUrl?: string;
  animation?: 'pan' | 'pop' | 'zoom' | 'flip'; 
  layout?: 'classic' | 'reversed' | 'modern' | 'immersive' | 'minimal' | 'bento' | 'split' | 'hero' | 'gallery';
  shape?: string; 
  x?: number; 
  y?: number;
  z?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  assets?: SlideAsset[];
  imageValidation?: {
    isOk: boolean;
    reason: string;
    score: number; // 0-10
  };
}

export interface Source {
  title: string;
  uri: string;
}

export interface PresentationData {
  id?: string;
  userId?: string;
  topic: string; 
  presentationTitle: string; 
  themeColor?: string;
  welcomeSlide?: WelcomeSlide;
  slides: Slide[];
  sources: Source[];
  createdAt?: string;
  isPublished?: boolean;
}

export interface OutlineItem {
  title: string;
  points: string[];
}

export interface AppState {
  step: 'dashboard' | 'input' | 'outline' | 'generating' | 'preview' | 'gallery';
  topic: string;
  voice: string; 
  slideCount: number;
  files: File[];
  filePreviews: string[]; 
  presentation: PresentationData | null;
  outline: OutlineItem[] | null;
  currentSlideIndex: number;
  loadingStatus: string;
  progress: number; 
  error?: string;
}

export enum GenerationStage {
  IDLE,
  STRUCTURE,
  IMAGES,
  AUDIO,
  COMPLETE
}
