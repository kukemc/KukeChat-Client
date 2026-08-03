import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { assertKukeEnv } from './vite.env';

export default defineConfig(({ mode }) => {
  assertKukeEnv(mode);

  return {
    plugins: [react()],
    build: {
      outDir: 'dist-desktop',
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        input: {
          index: fileURLToPath(new URL('./index.desktop.html', import.meta.url))
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    server: {
      host: '127.0.0.1',
      port: 1420,
      strictPort: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        },
        '/uploads': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true
        },
        '/ws': {
          target: 'ws://127.0.0.1:8000',
          ws: true,
          changeOrigin: true
        }
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  };
});
