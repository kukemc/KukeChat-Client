// 油猴脚本：userscript/src → dist-userscript/kukechat-ccw.user.js
// 库模式打成单个 IIFE，油猴头部作为 banner 放在最前面。不依赖 vite.env.ts：脚本只连 CCW 和公开的 KukeChat 地址。
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./userscript/package.json', import.meta.url), 'utf8')) as { version: string };

const header = [
  '// ==UserScript==',
  '// @name         KukeChat for CCW',
  '// @namespace    https://chat-api.kuke.ink/',
  `// @version      ${pkg.version}`,
  '// @description  重做共创世界网页版的消息中心和动态页，并把 KukeChat 接进共创世界。',
  '// @author       kukemc',
  '// @match        https://www.ccw.site/*',
  '// @run-at       document-start',
  '// @grant        none',
  '// @downloadURL  https://chat-api.kuke.ink/ccw.user.js',
  '// @updateURL    https://chat-api.kuke.ink/ccw.meta.js',
  '// ==/UserScript==',
  ''
].join('\n');

export default defineConfig({
  publicDir: false,
  // 请求 KukeChat 时的客户端标识 kukechat-ccw/<版本>（KukeChat-Server app/core/request_guard.py）
  define: { __USERSCRIPT_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist-userscript',
    emptyOutDir: true,
    target: 'es2020',
    minify: false,
    lib: {
      entry: 'userscript/src/main.js',
      name: 'KukeChatCcw',
      formats: ['iife'],
      fileName: () => 'kukechat-ccw.user.js'
    },
    rollupOptions: {
      output: { banner: header }
    }
  }
});
