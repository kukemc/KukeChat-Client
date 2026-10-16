import { create } from 'zustand';
import type { ReactNode } from 'react';

/**
 * 全站统一的提示（toast）。
 *
 * 一个 store + 一个渲染处（components/ui/toast/ToastHost.tsx），任何地方 —— 组件、hook、
 * 实时事件处理、api 层 —— 都可以直接调 `toast.success('已复制')`，不需要层层传 onToast 回调，
 * 也不需要各自维护一份 useState + setTimeout。
 *
 * 队列行为：
 *   · 最多同时显示 MAX_VISIBLE 条，新的排在最上面（从顶上往下堆）。
 *   · 同样的文字短时间内再来一次不新增一条，只把它顶到最前并重新计时（计数写在右边）。
 *   · 默认 2.5 秒自己收；error 和带动作按钮的停得久一点，鼠标停在上面时暂停计时。
 *
 * 这个文件不引 React 组件，只描述数据，方便被非组件代码引用。
 */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  /** 点了之后默认会把这条提示收掉，除非 keepOpen */
  onClick: () => void;
  keepOpen?: boolean;
  /** 按钮暂时不可点（比如「换上中…」） */
  disabled?: boolean;
}

export interface ToastOptions {
  tone?: ToastTone;
  /** 第二行的小字说明 */
  subtitle?: string;
  /** 正文前面自定义的一块内容（头像、礼物图形、徽章……），用来表达「谁送了你什么」这类通知 */
  leading?: ReactNode;
  /** 一到两个动作按钮。给了动作按钮就停得久一点 */
  actions?: ToastAction[];
  /** 停留毫秒数。不给就按类型取默认值（见 defaultDuration） */
  duration?: number;
  /** 同样的文字短时间内重复出现时只显示一条（默认开） */
  dedupe?: boolean;
  /** 这条提示的标识，用来让实时事件里同一个来源只出现一次（不传时用 tone + 正文去重） */
  id?: string;
}

export interface ToastItem extends Omit<ToastOptions, 'dedupe' | 'id'> {
  /** 这条提示的身份，一生不变，作为 React 的 key */
  key: number;
  /** 「计时从什么时候重新开始」的戳：重复出现、鼠标移开时会换，计时器和进度条都跟着它重启 */
  stamp: number;
  /** 去重用的键：给了 id 就用 id，否则用 tone + 正文 */
  dedupeKey: string;
  tone: ToastTone;
  message: string;
  /** 短时间内重复出现了几次 */
  repeat: number;
  /** 正在做收起动画，放完就真的删掉 */
  exiting: boolean;
  /** 鼠标停在上面、计时暂停 */
  paused: boolean;
}

export const MAX_VISIBLE = 3;

const BASE_DURATION: Record<ToastTone, number> = {
  info: 2500,
  success: 2500,
  warning: 4000,
  error: 4000
};

/** 一条提示自己待多久。带动作按钮的多给一点，让人来得及看和点。 */
export function defaultDuration(tone: ToastTone, actions: readonly ToastAction[] | undefined): number {
  const base = BASE_DURATION[tone];
  if (!actions || actions.length === 0) {
    return base;
  }
  return Math.max(base, 6000);
}

interface ToastStoreState {
  items: ToastItem[];
  push: (message: string, options?: ToastOptions) => number;
  dismiss: (key: number) => void;
  /** 开始收起动画，动画放完由宿主组件调用 remove */
  startExit: (key: number) => void;
  remove: (key: number) => void;
  setPaused: (key: number, paused: boolean) => void;
  clear: () => void;
}

let nextKey = 1;

export const useToastStore = create<ToastStoreState>((set) => ({
  items: [],
  push: (message, options = {}) => {
    const tone = options.tone ?? 'info';
    const key = nextKey++;
    const dedupeKey = options.id ?? `${tone}\u0000${message}`;
    const dedupe = options.dedupe !== false;
    let returnKey = key;
    set((state) => {
      const existing = dedupe ? state.items.find((item) => item.dedupeKey === dedupeKey) : undefined;
      if (existing) {
        // 同样的文字又来了：原地更新（key 不变，React 不重新挂载，就不会把进场动画再放一遍）、计数 +1、重新计时。
        // 只覆盖这次真的传了的字段，没传的沿用原来那条的（重复出现时常常只重复一句同样的正文）。
        returnKey = existing.key;
        const next: ToastItem = {
          ...existing,
          stamp: key,
          repeat: existing.repeat + 1,
          exiting: false,
          paused: false,
          subtitle: options.subtitle !== undefined ? options.subtitle : existing.subtitle,
          leading: options.leading !== undefined ? options.leading : existing.leading,
          actions: options.actions !== undefined ? options.actions : existing.actions,
          duration: options.duration !== undefined ? options.duration : existing.duration
        };
        return { items: state.items.map((item) => (item === existing ? next : item)) };
      }
      const item: ToastItem = {
        key,
        stamp: key,
        dedupeKey,
        tone,
        message,
        repeat: 1,
        exiting: false,
        paused: false,
        subtitle: options.subtitle,
        leading: options.leading,
        actions: options.actions,
        duration: options.duration
      };
      // 超出上限的最旧几条不直接删掉，而是标成「正在收起」，让它们走离场动画
      let live = 0;
      const items = [item, ...state.items].map((entry) => {
        if (entry.exiting) {
          return entry;
        }
        live += 1;
        return live > MAX_VISIBLE ? { ...entry, exiting: true } : entry;
      });
      return { items };
    });
    return returnKey;
  },
  dismiss: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),
  startExit: (key) => set((state) => ({ items: state.items.map((item) => (item.key === key ? { ...item, exiting: true } : item)) })),
  remove: (key) => set((state) => ({ items: state.items.filter((item) => item.key !== key) })),
  // 鼠标移开时换一个新的 stamp：计时从头开始
  setPaused: (key, paused) => set((state) => ({ items: state.items.map((item) => (item.key === key ? { ...item, paused, stamp: paused ? item.stamp : nextKey++ } : item)) })),
  clear: () => set({ items: [] })
}));

/**
 * 全局提示入口。非组件代码（实时事件处理、api 层、工具函数）也能直接调。
 *
 *   toast.info('已复制')
 *   toast.success('好友申请已发送', { subtitle: '等待对方通过' })
 *   toast.error('发送失败，请稍后重试。')
 *   toast.show({ tone: 'warning', message: '「天使」快到期了', actions: [{ label: '去续期', onClick: … }] })
 */
export const toast = {
  show: (options: ToastOptions & { message: string }): number => {
    const { message, ...rest } = options;
    return useToastStore.getState().push(message, rest);
  },
  info: (message: string, options?: ToastOptions): number => useToastStore.getState().push(message, { ...options, tone: 'info' }),
  success: (message: string, options?: ToastOptions): number => useToastStore.getState().push(message, { ...options, tone: 'success' }),
  warning: (message: string, options?: ToastOptions): number => useToastStore.getState().push(message, { ...options, tone: 'warning' }),
  error: (message: string, options?: ToastOptions): number => useToastStore.getState().push(message, { ...options, tone: 'error' }),
  /** 手动收掉一条（拿到的是 show 返回的 key） */
  dismiss: (key: number): void => useToastStore.getState().dismiss(key),
  /** 全部收掉 */
  clear: (): void => useToastStore.getState().clear()
};
