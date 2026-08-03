import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { assertKukeEnv } from './vite.env';

export default defineConfig(({ mode }) => {
  assertKukeEnv(mode);

  return {
    plugins: [react()],
    build: {
      outDir: 'dist-mobile',
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: false,
      rollupOptions: {
        input: fileURLToPath(new URL('./index.mobile.html', import.meta.url)),
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  };
});
