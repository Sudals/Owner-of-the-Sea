import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// --mode demo → web demo (localStorage, no login)   --mode full → desktop/full build (API + login)
// design §2, §9. Each mode builds into its own folder.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // the web demo runs from any folder (/demo/ on the site, an itch.io iframe): relative URLs.
  // The full build is served from app://bundle/ by the desktop shell.
  base: mode === "demo" ? "./" : "/",
  define: {
    __BUILD_MODE__: JSON.stringify(mode === "demo" ? "demo" : "full"),
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    outDir: `dist/${mode === "demo" ? "demo" : "full"}`,
    emptyOutDir: true,
    assetsDir: "static", // public/assets/ holds the sprite sheets; keep Vite's hashed files apart
    assetsInlineLimit: 0, // keep sprite PNGs as files (crisp, cacheable)
  },
}));
