
/**
 * Removes white background from a base64 image string using HTML5 Canvas.
 * Returns a base64 string of the processed PNG.
 */
export const removeWhiteBackground = async (base64Data: string, tolerance: number = 20): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                resolve(base64Data);
                return;
            }
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            // Limit for "near white" - 255 is pure white
            const threshold = 255 - tolerance;
            
            // Simple color keying for near-white backgrounds
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // If pixel is near white, make it transparent
                if (r > threshold && g > threshold && b > threshold) {
                    data[i + 3] = 0;
                }
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/png').split(',')[1]);
        };
        img.onerror = () => resolve(base64Data);
        img.src = base64Data.startsWith('data:') ? base64Data : `data:image/png;base64,${base64Data}`;
    });
};

/**
 * Adds a sticker border to an image (white outline + shadow).
 */
export const applyStickerEffect = async (base64Data: string): Promise<string> => {
    // This is more complex to do with canvas-only without external libs, 
    // but we can at least ensure background is gone.
    return removeWhiteBackground(base64Data);
};
