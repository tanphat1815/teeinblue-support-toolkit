import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

const p = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  base: './',
  resolve: { alias: { '@': p('./src') } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: mode === 'development',
    minify: mode === 'development' ? false : 'esbuild',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: p('./sidepanel.html'),
        background: p('./src/background/index.ts')
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
}));
