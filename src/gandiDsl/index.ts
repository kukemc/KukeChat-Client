/**
 * 聊天里的积木文本（Gandi 3.0 DSL）—— 对外入口。
 *
 * 同步、轻量的部分（围栏切段、预筛、包围栏）直接导出；编译和渲染在 pipeline.ts 里，
 * 会带上 acorn 和九千行编译器，一律通过 {@link loadGandiDsl} 懒加载。
 * 桌面端构建里它是单独的一块；社区扩展是单文件 IIFE（inlineDynamicImports），会被内联进去，但仍然只在用到时才执行。
 *
 * 设计与部署见 docs/gandi-dsl-blocks.md。
 */
export { DSL_FENCE_LANG, DSL_FENCE_LANGS, DSL_MAX_LENGTH, dslPreviewText, looksLikeDsl, mayContainDsl, splitDslFences, wrapDslFence } from './detect';
export type { DslSegment } from './detect';
export { blocklyMaybeAvailable, setGandiBlocksRemoteBase, setHostBlocklyProvider, setHostRuntimeProvider } from './blockly';

export type GandiDslModule = typeof import('./pipeline');

let pending: Promise<GandiDslModule> | null = null;

/** 懒加载编译器 + 渲染器。失败后下次调用会重试。 */
export function loadGandiDsl(): Promise<GandiDslModule> {
  if (!pending) {
    pending = import('./pipeline');
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
