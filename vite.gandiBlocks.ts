import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * gandi-blocks（积木渲染库）的静态文件：vendor/gandi-blocks/。
 *
 * - 开发服务器：所有构建都在 `/gandi-blocks/` 下直接提供这些文件；
 * - 桌面端 / 网页、安卓渲染页的构建：原样拷进产物的 `gandi-blocks/` 目录，运行时按需加载；
 * - 社区扩展（单文件 IIFE）不带这些文件，运行时借宿主编辑器的积木库，或从 VITE_GANDI_BLOCKS_BASE 加载。
 *
 * 详见 docs/gandi-dsl-blocks.md。
 */

export const GANDI_BLOCKS_DIR = resolve(process.cwd(), 'vendor/gandi-blocks');
const PUBLIC_PREFIX = 'gandi-blocks/';

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.png': 'image/png'
};

/** 要发布的文件（相对 vendor/gandi-blocks 的路径，正斜杠）。LICENSE 一起带上。 */
export function gandiBlocksFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (name === 'LICENSE' || CONTENT_TYPES[extname(name)]) {
        out.push(relative(GANDI_BLOCKS_DIR, full).split(sep).join('/'));
      }
    }
  };
  if (existsSync(GANDI_BLOCKS_DIR)) walk(GANDI_BLOCKS_DIR);
  return out.sort();
}

/** 文件内容的指纹：拼在脚本地址后面（`?v=`），换了一版积木库浏览器不会拿缓存里的旧文件。 */
export function gandiBlocksVersion(): string {
  const hash = createHash('sha1');
  for (const file of gandiBlocksFiles().filter((name) => name.endsWith('.js'))) {
    hash.update(file);
    hash.update(readFileSync(join(GANDI_BLOCKS_DIR, file)));
  }
  return hash.digest('hex').slice(0, 10);
}

/**
 * 两个构建期常量：
 * - `__KUKE_GANDI_BLOCKS_LOCAL__`：随包发布的 gandi-blocks 相对页面的目录（空串 = 没随包发布）；
 * - `__KUKE_GANDI_BLOCKS_VERSION__`：文件指纹。
 */
export function gandiBlocksDefines(local: boolean): Record<string, string> {
  return {
    __KUKE_GANDI_BLOCKS_LOCAL__: JSON.stringify(local ? PUBLIC_PREFIX : ''),
    __KUKE_GANDI_BLOCKS_VERSION__: JSON.stringify(gandiBlocksVersion())
  };
}

/**
 * @param emit 构建时要不要把文件拷进产物（扩展构建传 false）。
 */
export function gandiBlocksPlugin({ emit }: { emit: boolean }): Plugin {
  return {
    name: 'kuke-gandi-blocks',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const [rawPath, query = ''] = (req.url ?? '').split('?');
        const path = decodeURIComponent(rawPath);
        // 页面在子目录（dev/xxx-harness.html）时相对地址会落到 /dev/gandi-blocks/，所以按「路径里有 /gandi-blocks/」认；
        // 源码里 import 的 vendor/gandi-blocks/media/*.svg?raw 是模块请求，交给 Vite 自己处理
        const index = path.indexOf(`/${PUBLIC_PREFIX}`);
        if (index < 0 || path.startsWith('/vendor/') || /(^|&)(import|raw|url|inline)(&|=|$)/.test(query)) {
          next();
          return;
        }
        const file = resolve(GANDI_BLOCKS_DIR, path.slice(index + PUBLIC_PREFIX.length + 1));
        if (!file.startsWith(GANDI_BLOCKS_DIR + sep) || !existsSync(file) || statSync(file).isDirectory()) {
          next();
          return;
        }
        res.setHeader('Content-Type', CONTENT_TYPES[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      if (!emit) return;
      for (const file of gandiBlocksFiles()) {
        this.emitFile({ type: 'asset', fileName: `${PUBLIC_PREFIX}${file}`, source: readFileSync(join(GANDI_BLOCKS_DIR, file)) });
      }
    }
  };
}
