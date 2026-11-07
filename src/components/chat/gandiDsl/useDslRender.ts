import { useEffect, useState } from 'react';
import { loadGandiDsl, type GandiDslModule } from '@/gandiDsl';
import type { DslRenderResult } from '@/gandiDsl/pipeline';
import { useKukeStore } from '@/store/kukeStore';
import { useResolvedThemeMode } from '@/utils/theme';

export type DslRenderState =
  | { phase: 'loading' }
  | { phase: 'done'; result: DslRenderResult }
  | { phase: 'failed'; message: string };

/** 编译器 + 渲染器加载好之后的模块（拿来调 insertIntoEditor 之类的同步函数）。 */
let loadedModule: GandiDslModule | null = null;

export function gandiDslModule(): GandiDslModule | null {
  return loadedModule;
}

/**
 * 把一段积木文本编译并画出来。结果在 pipeline 里按「文本 + 主题」缓存，列表滚动回来不会重画。
 * @param debounceMs 输入框实时预览用：停手这么久再画。
 */
export function useDslRender(code: string, debounceMs = 0): DslRenderState {
  const theme = useResolvedThemeMode(useKukeStore((state) => state.themeMode));
  const [state, setState] = useState<DslRenderState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const run = (): void => {
      loadGandiDsl()
        .then((module) => {
          loadedModule = module;
          return module.renderDslCode(code, theme);
        })
        .then((result) => {
          if (!cancelled) setState({ phase: 'done', result });
        })
        .catch((error: unknown) => {
          if (!cancelled) setState({ phase: 'failed', message: error instanceof Error ? error.message : '积木渲染模块加载失败' });
        });
    };
    if (debounceMs > 0) {
      const timer = window.setTimeout(run, debounceMs);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [code, theme, debounceMs]);

  return state;
}

/**
 * 没有围栏的消息：交给编译器判断是不是整段积木文本。还没判完 / 不是 → false（照普通文字显示）。
 */
export function useDslDetect(text: string, enabled: boolean): boolean {
  const [detected, setDetected] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setDetected(false);
      return;
    }
    let cancelled = false;
    loadGandiDsl()
      .then((module) => {
        loadedModule = module;
        if (!cancelled) setDetected(module.detectDsl(text));
      })
      .catch(() => {
        if (!cancelled) setDetected(false);
      });
    return () => {
      cancelled = true;
    };
  }, [text, enabled]);
  return detected;
}
