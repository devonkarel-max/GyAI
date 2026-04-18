import express from "express";
import { v2 as cloudinary } from "cloudinary";
import path from "path";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_CLOUD_NAME !== 'Root') 
    ? process.env.CLOUDINARY_CLOUD_NAME 
    : "dio4fr3hz";

  cloudinary.config({
    cloud_name: cloudName,
    api_key: process.env.CLOUDINARY_API_KEY || "811422534857519",
    api_secret: process.env.CLOUDINARY_API_SECRET || "vIsqmQCXxO-xuhkWqfAwLMTu8iU",
  });

  app.use(express.json({ limit: '50mb' }));

  app.post("/api/upload", async (req, res) => {
    try {
      const { data, folder, resource_type } = req.body;
      // data can be base64 string
      const result = await cloudinary.uploader.upload(data, {
        folder: folder || "gyai",
        resource_type: resource_type || "auto",
      });
      res.json({ url: result.secure_url });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Upload failed" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
