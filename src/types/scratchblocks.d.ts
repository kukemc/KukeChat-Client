/**
 * scratchblocks 没有自带类型。登录页只用到源码里这几个入口（见 components/auth/blocks/scratchblocksRuntime.ts），
 * 直接引源码而不是 build/ 里的打包件：打包件一加载就往 document.head 塞样式，扩展的 Shadow DOM 里用不上。
 */
declare module 'scratchblocks/syntax/index.js' {
  export interface ScratchblocksDocument {
    readonly scripts: unknown[];
  }
  export function parse(code: string, options?: { languages?: string[]; inline?: boolean }): ScratchblocksDocument;
  export function loadLanguages(languages: Record<string, unknown>): void;
}

declare module 'scratchblocks/scratch3/index.js' {
  import type { ScratchblocksDocument } from 'scratchblocks/syntax/index.js';
  export function init(window: Window): void;
  export function makeStyle(): SVGStyleElement;
  export function newView(doc: ScratchblocksDocument, options: { style: string; scale: number }): { render(): SVGSVGElement };
}
