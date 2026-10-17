import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 输入框的本机偏好（桌面端）。和主题、提示音一样只存在这台设备上。
 *
 * pasteImageMode：粘贴、拖进来或从工具栏选的图片怎么处理。
 * - inline：放进输入框，显示成缩略图，和文字一起按发送（QQ / 微信的习惯，默认）
 * - confirm：先弹「发送图片」确认框，在框里确认后单独发
 */
export type PasteImageMode = 'inline' | 'confirm';

interface ComposerPrefsState {
  pasteImageMode: PasteImageMode;
  setPasteImageMode: (mode: PasteImageMode) => void;
}

type PersistedComposerPrefs = Pick<ComposerPrefsState, 'pasteImageMode'>;

function sanitize(value: unknown): PersistedComposerPrefs {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return { pasteImageMode: source.pasteImageMode === 'confirm' ? 'confirm' : 'inline' };
}

export const useComposerPrefs = create<ComposerPrefsState>()(
  persist<ComposerPrefsState, [], [], PersistedComposerPrefs>(
    (set) => ({
      pasteImageMode: 'inline',
      setPasteImageMode: (pasteImageMode) => set({ pasteImageMode })
    }),
    {
      name: 'kukechat-composer-prefs',
      version: 1,
      migrate: (persisted) => sanitize(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
      partialize: (state) => ({ pasteImageMode: state.pasteImageMode })
    }
  )
);
