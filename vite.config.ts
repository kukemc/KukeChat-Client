import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { assertKukeEnv } from './vite.env';

export default defineConfig(({ mode }) => {
  assertKukeEnv(mode);

  return {
    plugins: [react()],
    build: {
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      target: 'es2018',
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          passes: 2,
          drop_debugger: true
        },
        mangle: {
          safari10: true
        },
        format: {
          comments: false
        }
      },
      emptyOutDir: true,
      lib: {
        entry: fileURLToPath(new URL('./src/extension/index.ts', import.meta.url)),
        name: 'KukeChatExtensionBundle',
        formats: ['iife'],
        fileName: () => 'KukeChat.js'
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: 5173,
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
