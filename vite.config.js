import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      esmExternals: true
    },
    chunkSizeWarningLimit: 1000,
    target: 'es2020'
  },
  optimizeDeps: {
    include: [
      '@google/generative-ai',
      '@google/generative-ai/dist/web/index.mjs'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  define: {
    'process.env': process.env
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
