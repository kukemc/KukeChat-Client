import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { DEFAULT_THEME_SETTINGS, THEME_PRESETS, isLibraryWallpaper, presetPatch, wallpaperMode, type ThemePreset, type ThemeSettings } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useThemeEditor } from '@/theme/useTheme';
import { useWallpaperEntry } from '@/theme/wallpaperStore';
import { useResolvedThemeMode } from '@/utils/theme';
import { Card, ConfirmLayer, Toggle, btn } from './settingsUi';
import { Option } from './theme/controls';
import { LibraryCard } from './theme/LibraryCard';
import { ColorCard, ShapeCard } from './theme/LookCards';
import { MaterialCard } from './theme/MaterialCard';
import { ThemeStage, ThemeThumbnail } from './theme/ThemePreview';
import { WallpaperCard } from './theme/WallpaperCard';

/** 预设缩略图用的那套设置：预设自己的整套搭配，不带用户的任何改动。 */
function presetSettings(preset: ThemePreset): ThemeSettings {
  return { ...DEFAULT_THEME_SETTINGS, ...presetPatch(preset) };
}

/** 预览只有在滚动区够高时才钉在顶上。 */
const PIN_MIN_HEIGHT = 760;

/** 元素所在的滚动容器有多高；找不到就当作够高。 */
function useScrollerHeight(ref: React.RefObject<HTMLElement>): number {
  const [height, setHeight] = useState(PIN_MIN_HEIGHT);
  useEffect(() => {
    let scroller = ref.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    if (!scroller) {
      return undefined;
    }
    const target = scroller;
    const observer = new ResizeObserver(() => setHeight(target.clientHeight));
    observer.observe(target);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

/**
 * 「外观」页里的主题定制区：预设、预览、背景、材质、颜色、形状、我的主题。
 * 所有改动立即作用到整个界面并保存在本机；改的是当前配色方案（浅色或深色）用的那一套。
 */
export function ThemeCustomizer(): JSX.Element {
  const scheme = useResolvedThemeMode(useKukeStore((state) => state.themeMode));
  const editor = useThemeEditor(scheme);
  const { settings, update, split } = editor;
  const wallpaperUrl = useWallpaperEntry(settings.wallpaper)?.url ?? null;
  const mode = wallpaperMode(settings, scheme, wallpaperUrl);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const pinned = useScrollerHeight(previewRef) >= PIN_MIN_HEIGHT;

  function applyPreset(preset: ThemePreset): void {
    const patch = presetPatch(preset);
    // 换预设时回到它的整套默认搭配；用户自己上传的背景图连同摆法保留不动
    if (isLibraryWallpaper(settings.wallpaper)) {
      delete patch.wallpaper;
      delete patch.wallpaperScope;
      delete patch.wallpaperDim;
      delete patch.wallpaperShade;
    }
    update(patch);
    useThemeStore.getState().setActiveSaved(null);
  }

  return (
    <>
      <Card title="主题预设" description="选一套整体搭配，下面还可以继续微调。" action={<button type="button" className={btn.ghost} onClick={() => setConfirmingReset(true)}>恢复全部默认</button>} padded>
        <div className="grid gap-4">
          <div className="kth-presets">
            {THEME_PRESETS.map((preset) => {
              const active = settings.presetId === preset.id;
              return (
                <div key={preset.id} className={`kth-preset ${active ? 'is-active' : ''}`}>
                  <button type="button" className="kth-preset-pick" aria-pressed={active} onClick={() => applyPreset(preset)}>
                    <ThemeThumbnail settings={presetSettings(preset)} scheme={scheme} />
                    <span className="kth-preset-name">{preset.name}{active ? <Icon name="check" className="kth-preset-check" /> : null}</span>
                    <span className="kth-preset-tagline">{preset.tagline}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <Option title="浅色、深色分别设置" description={split ? `现在改的是「${scheme === 'dark' ? '深色' : '浅色'}」这一套；切换上面的明暗模式去改另一套。` : '关着时两种配色共用一套设置。打开后可以各配各的，比如各用一张背景。'}>
            <Toggle checked={split} onChange={editor.setSplit} label="浅色、深色分别设置" />
          </Option>
        </div>
      </Card>

      <div ref={previewRef} className={`kth-preview ${pinned ? 'is-pinned' : ''}`}>
        <Card padded>
          <ThemeStage mode={mode} />
        </Card>
      </div>

      <WallpaperCard editor={editor} scheme={scheme} />
      <MaterialCard editor={editor} mode={mode} />
      <ColorCard editor={editor} scheme={scheme} />
      <ShapeCard editor={editor} />
      <LibraryCard scheme={scheme} />

      {confirmingReset ? <ConfirmLayer title="恢复全部默认？" message="浅色、深色两套设置都会回到出厂状态。背景图库和「我的主题」里存下来的主题不受影响。" confirmText="恢复默认" danger onConfirm={() => {
        editor.resetAll();
        setConfirmingReset(false);
      }} onCancel={() => setConfirmingReset(false)} /> : null}
    </>
  );
}
