import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { gandiBlocksDefines, gandiBlocksPlugin } from './vite.gandiBlocks';

/**
 * 安卓积木渲染页：dist-dsl-render/ 是一个自包含的目录，整个拷进安卓的 assets 就能用。
 *
 *   index.html               空页面，加载下面这个脚本
 *   kuke-dsl-render.js       编译器 + 渲染（普通脚本，不是 ES 模块：file:// 下模块脚本会被同源策略拦掉）
 *   gandi-blocks/…           积木库，运行时按相对路径加载
 *
 * 不读 .env、不连后端。契约见 docs/gandi-dsl-blocks.md。
 */

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KukeChat 积木渲染</title>
<style>html,body{margin:0;background:transparent;}</style>
</head>
<body>
<script src="./kuke-dsl-render.js"></script>
</body>
</html>
`;

function renderHtml(): Plugin {
  return {
    name: 'kuke-dsl-render-html',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'index.html', source: HTML });
    }
  };
}

export default defineConfig({
  plugins: [gandiBlocksPlugin({ emit: true }), renderHtml()],
  // 不需要 .env：这个页面不连后端
  envDir: fileURLToPath(new URL('./src/dslRender', import.meta.url)),
  publicDir: false,
  build: {
    outDir: 'dist-dsl-render',
    emptyOutDir: true,
    target: 'es2018',
    sourcemap: false,
    minify: 'terser',
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: fileURLToPath(new URL('./src/dslRender/main.ts', import.meta.url)),
      name: 'KukeDslRender',
      formats: ['iife'],
      fileName: () => 'kuke-dsl-render.js'
    },
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    ...gandiBlocksDefines(true)
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
});
