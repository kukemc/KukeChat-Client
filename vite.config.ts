import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { assertKukeEnv, devBackendProxy } from './vite.env';
import { gandiBlocksDefines, gandiBlocksPlugin } from './vite.gandiBlocks';

export default defineConfig(({ mode, command }) => {
  assertKukeEnv(mode);

  return {
    // 扩展是单文件，不带 gandi-blocks（积木渲染库）：运行时借宿主编辑器的，或从 VITE_GANDI_BLOCKS_BASE 加载。
    // 本地预览（dev）时由开发服务器在 /gandi-blocks/ 下提供，见 vite.gandiBlocks.ts
    plugins: [react(), gandiBlocksPlugin({ emit: false })],
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
      'process.env.NODE_ENV': JSON.stringify('production'),
      ...gandiBlocksDefines(command === 'serve')
    },
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: 5173,
      proxy: devBackendProxy(mode)
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  };
});
