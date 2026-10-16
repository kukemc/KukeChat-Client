import type { SbRenderer } from './scratchblocksRuntime';

let pending: Promise<SbRenderer> | null = null;

/** 按需加载 scratchblocks（单独一块，登录页先出表单）。失败后下次调用会重试。 */
export function loadScratchblocks(): Promise<SbRenderer> {
  if (!pending) {
    pending = import('./scratchblocksRuntime').then((module) => module.renderer);
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
