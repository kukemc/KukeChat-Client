import { useCallback, useRef } from 'react';
import { create } from 'zustand';

/**
 * 桌面布局里可以拖动调宽的两栏：会话列表（左）、聊天右侧栏（群公告 + 成员）。
 * 宽度只是本机的偏好，存在 localStorage（读写失败——隐私模式、被禁用——时用默认值，界面照常工作）。
 */
export type PaneKey = 'list' | 'side';

interface PaneSpec {
  default: number;
  min: number;
  max: number;
}

export const PANE_SPECS: Record<PaneKey, PaneSpec> = {
  list: { default: 268, min: 220, max: 440 },
  side: { default: 220, min: 200, max: 400 }
};

const STORAGE_KEY = 'kukechat-pane-widths';

function clamp(key: PaneKey, value: number): number {
  const spec = PANE_SPECS[key];
  return Math.round(Math.min(spec.max, Math.max(spec.min, value)));
}

function readStored(): Record<PaneKey, number> {
  const widths: Record<PaneKey, number> = { list: PANE_SPECS.list.default, side: PANE_SPECS.side.default };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Record<PaneKey, unknown>>) : {};
    for (const key of Object.keys(PANE_SPECS) as PaneKey[]) {
      if (typeof parsed[key] === 'number' && Number.isFinite(parsed[key])) {
        widths[key] = clamp(key, parsed[key] as number);
      }
    }
  } catch {
    // 用默认值
  }
  return widths;
}

function writeStored(widths: Record<PaneKey, number>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // 记不住就算了
  }
}

interface PaneSizeState {
  widths: Record<PaneKey, number>;
  setWidth: (key: PaneKey, value: number, persist?: boolean) => void;
  reset: (key: PaneKey) => void;
}

export const usePaneSizes = create<PaneSizeState>((set, get) => ({
  widths: typeof window === 'undefined' ? { list: PANE_SPECS.list.default, side: PANE_SPECS.side.default } : readStored(),
  setWidth: (key, value, persist = true) => {
    const widths = { ...get().widths, [key]: clamp(key, value) };
    set({ widths });
    if (persist) {
      writeStored(widths);
    }
  },
  reset: (key) => get().setWidth(key, PANE_SPECS[key].default)
}));

/**
 * 拖动条的事件处理。edge = 拖动条在这一栏的哪一边：right（会话列表，往右拖变宽）/ left（右侧栏，往左拖变宽）。
 * 拖动中只改内存里的宽度（每帧一次），松手才写 localStorage；双击恢复默认宽度。
 */
export function usePaneResizer(key: PaneKey, edge: 'left' | 'right') {
  const setWidth = usePaneSizes((state) => state.setWidth);
  const reset = usePaneSizes((state) => state.reset);
  const frame = useRef(0);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = usePaneSizes.getState().widths[key];
    const direction = edge === 'right' ? 1 : -1;
    let latest = startWidth;
    const root = document.documentElement;
    root.classList.add('ksh-resizing');

    const move = (moveEvent: PointerEvent): void => {
      latest = startWidth + (moveEvent.clientX - startX) * direction;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setWidth(key, latest, false));
    };
    const up = (): void => {
      cancelAnimationFrame(frame.current);
      setWidth(key, latest, true);
      root.classList.remove('ksh-resizing');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, [edge, key, setWidth]);

  const onDoubleClick = useCallback(() => reset(key), [key, reset]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    // 键盘也能调：左右方向键每次 16px
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }
    event.preventDefault();
    const step = (event.key === 'ArrowRight' ? 16 : -16) * (edge === 'right' ? 1 : -1);
    setWidth(key, usePaneSizes.getState().widths[key] + step, true);
  }, [edge, key, setWidth]);

  return { onPointerDown, onDoubleClick, onKeyDown };
}

/** 拖动条：贴在一栏的左 / 右边缘，看不见，悬停 / 拖动时那条边线变成强调色 */
export function PaneResizeHandle({ pane, edge, label }: { pane: PaneKey; edge: 'left' | 'right'; label: string }): JSX.Element {
  const handlers = usePaneResizer(pane, edge);
  const width = usePaneSizes((state) => state.widths[pane]);
  const spec = PANE_SPECS[pane];
  return (
    <div
      className={`ksh-resize ksh-resize--${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={width}
      tabIndex={0}
      title="拖动调整宽度，双击恢复默认"
      {...handlers}
    />
  );
}
