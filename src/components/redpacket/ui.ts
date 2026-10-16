import { create } from 'zustand';
import { useEffect, useState } from 'react';
import { useKukeStore } from '@/store/kukeStore';
import { useThemeStore } from '@/theme/themeStore';
import type { User } from '@/types/api';
import type { RedPacketMeta } from '@/types/redPacket';

/** 正开着的那个红包。卡片只管把它交出来，弹层由聊天面板里的 RedPacketHost 画 —— 消息行被虚拟列表卸载时弹层不会跟着没。 */
export interface RedPacketTarget {
  meta: RedPacketMeta;
  conversationId: number;
  /** 消息上带的发送者，红包状态取回来之前先用它 */
  sender: User | null;
}

interface RedPacketUiState {
  target: RedPacketTarget | null;
  open: (target: RedPacketTarget) => void;
  close: () => void;
}

export const useRedPacketUi = create<RedPacketUiState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null })
}));

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 红包的动效播不播：系统开了「减少动态效果」、或者外观里开了「性能优先」就不播。 */
export function useRedPacketMotion(): boolean {
  const performance = useThemeStore((state) => state.performance);
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => setReduced(media.matches);
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return !performance && !reduced;
}

/** 去绑定 CCW 账号。桌面直接落到设置里的「CCW 账号」；移动端的设置页不能从这里直达，先到商店页，那里有绑定的入口。 */
export function openCcwBinding(): void {
  const state = useKukeStore.getState();
  if (state.layoutMode === 'mobile') {
    state.openShop();
  } else {
    state.openSettingsTab('ccw');
  }
}
