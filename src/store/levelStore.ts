import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LEVEL_ICONS } from '@/api/levels';
import type { LevelIconRule } from '@/types/level';

/**
 * 账号等级里「每个等级图标都要读」的那一点状态，单独放一个很小的 store：
 *
 *   showInChat   本机偏好「在聊天里显示等级图标」（外观设置里的开关）。和主题、提示音一样只存在这台设备上。
 *   available    当前连接的服务端有没有账号等级：null 还不知道 / true 有 / false 没有（GET /levels/rules 是 404）。
 *                false 时所有等级图标和入口都不显示；null 时图标照用户对象上的 account_level 画（旧后端的用户对象上没有这个字段，自然也不画）。
 *   icons        图标的换算表（rules.icons）。拿到规则之前是契约里的默认值。
 *
 * 聊天的每一行消息都会订阅这里（components/level/LevelIcons.tsx），所以它几乎不变：只在探测出结果、规则换了、用户拨开关时变。
 * available 和 icons 由 components/level/data.ts 在拿到规则时写进来，不持久化。
 */
interface LevelStoreState {
  showInChat: boolean;
  available: boolean | null;
  icons: readonly LevelIconRule[];
  setShowInChat: (show: boolean) => void;
}

type PersistedLevelPrefs = Pick<LevelStoreState, 'showInChat'>;

function sanitize(value: unknown): PersistedLevelPrefs {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return { showInChat: source.showInChat !== false };
}

export const useLevelStore = create<LevelStoreState>()(
  persist<LevelStoreState, [], [], PersistedLevelPrefs>(
    (set) => ({
      showInChat: true,
      available: null,
      icons: DEFAULT_LEVEL_ICONS,
      setShowInChat: (showInChat) => set({ showInChat })
    }),
    {
      name: 'kukechat-level-prefs',
      version: 1,
      migrate: (persisted) => sanitize(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
      partialize: (state) => ({ showInChat: state.showInChat })
    }
  )
);
