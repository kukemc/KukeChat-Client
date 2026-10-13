import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 商店相关的本机偏好。和主题、提示音一样只存在这台设备上，不跨设备同步。
 */
interface ShopPrefsState {
  /** 聊天里是否显示别人的气泡皮肤。关掉后别人的气泡按自己的主题画，自己的皮肤照常显示。 */
  showOthersSkins: boolean;
  setShowOthersSkins: (show: boolean) => void;
}

type PersistedShopPrefs = Pick<ShopPrefsState, 'showOthersSkins'>;

function sanitize(value: unknown): PersistedShopPrefs {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return { showOthersSkins: source.showOthersSkins !== false };
}

export const useShopPrefs = create<ShopPrefsState>()(
  persist<ShopPrefsState, [], [], PersistedShopPrefs>(
    (set) => ({
      showOthersSkins: true,
      setShowOthersSkins: (showOthersSkins) => set({ showOthersSkins })
    }),
    {
      name: 'kukechat-shop-prefs',
      version: 1,
      migrate: (persisted) => sanitize(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
      partialize: (state) => ({ showOthersSkins: state.showOthersSkins })
    }
  )
);
