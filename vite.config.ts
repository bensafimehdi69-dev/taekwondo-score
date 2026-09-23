import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// L'app web vit dans web/ ; elle importe le moteur de lecture directement depuis src/.
export default defineConfig({
  root: "web",
  publicDir: "../public",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
});
