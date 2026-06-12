import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El dashboard vive en web/. Vite lo compila a public/, que es la carpeta
// que Netlify publica (ver netlify.toml).
export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
});
