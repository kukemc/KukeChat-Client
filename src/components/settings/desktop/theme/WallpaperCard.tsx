import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { BUILTIN_WALLPAPERS, isLibraryWallpaper, type ThemeScheme, type WallpaperAlign, type WallpaperFit, type WallpaperScope } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { wallpapersInUse, type ThemeEditor } from '@/theme/useTheme';
import { MAX_IMAGES, addWallpaper, removeWallpaper, touchWallpaper, useWallpaperLibrary } from '@/theme/wallpaperStore';
import { Card, Choice, Notice } from '../settingsUi';
import { Option, SectionReset, Slider } from './controls';

const SCOPES: Array<{ value: WallpaperScope; label: string }> = [{ value: 'chat', label: '仅聊天区' }, { value: 'window', label: '整个窗口' }];
const FITS: Array<{ value: WallpaperFit; label: string }> = [{ value: 'cover', label: '铺满' }, { value: 'contain', label: '适应' }, { value: 'stretch', label: '拉伸' }, { value: 'tile', label: '平铺' }];
const ALIGNS: Array<{ value: WallpaperAlign; label: string }> = [{ value: 'center', label: '居中' }, { value: 'top', label: '靠上' }, { value: 'bottom', label: '靠下' }, { value: 'left', label: '靠左' }, { value: 'right', label: '靠右' }];

function shadeLabel(value: number): string {
  return value === 0 ? '原样' : value < 0 ? `压暗 ${-value}%` : `提亮 ${value}%`;
}

/** 背景：内置的、自己上传的，以及图片怎么摆、怎么调。 */
export function WallpaperCard({ editor, scheme }: { editor: ThemeEditor; scheme: ThemeScheme }): JSX.Element {
  const { settings, update, split } = editor;
  const library = useWallpaperLibrary();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const hasWallpaper = settings.wallpaper !== 'none';
  const custom = isLibraryWallpaper(settings.wallpaper);

  async function upload(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    setUploading(true);
    setError('');
    try {
      update({ wallpaper: await addWallpaper(file, wallpapersInUse()) });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '背景图保存失败，请换一张试试。');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string): Promise<void> {
    // 另一套配色（或共用的那一套）也可能正用着这张图，一起摘掉
    if (useKukeStore.getState().themeSettings.wallpaper === id) {
      useKukeStore.getState().updateThemeSettings({ wallpaper: 'none' });
    }
    if (useThemeStore.getState().dark?.wallpaper === id) {
      useThemeStore.getState().updateDark({ wallpaper: 'none' });
    }
    await removeWallpaper(id).catch(() => undefined);
  }

  return (
    <Card title="背景" description={`图片只保存在这台设备上，不会上传；最多留 ${MAX_IMAGES} 张，满了会替换最久没用的。`} action={<SectionReset onClick={() => editor.resetSection('wallpaper')} />} padded>
      <div className="grid gap-4">
        <div className="kth-walls">
          <button type="button" aria-pressed={!hasWallpaper} onClick={() => update({ wallpaper: 'none' })} className={`kth-wall kth-wall--none ${!hasWallpaper ? 'is-active' : ''}`}>无</button>
          {BUILTIN_WALLPAPERS.map((wallpaper) => (
            <button key={wallpaper.id} type="button" aria-pressed={settings.wallpaper === wallpaper.id} onClick={() => update({ wallpaper: wallpaper.id })} className={`kth-wall ${settings.wallpaper === wallpaper.id ? 'is-active' : ''}`} style={{ background: wallpaper.image[scheme] }}>
              <span className="kth-wall-name">{wallpaper.name}</span>
            </button>
          ))}
          {library.map((entry) => (
            <div key={entry.id} className={`kth-wall kth-wall--image ${settings.wallpaper === entry.id ? 'is-active' : ''}`} style={{ backgroundImage: `url("${entry.url}")` }}>
              <button type="button" className="kth-wall-pick" aria-pressed={settings.wallpaper === entry.id} aria-label="使用这张图片" onClick={() => {
                touchWallpaper(entry.id);
                update({ wallpaper: entry.id });
              }} />
              <button type="button" className="kth-wall-remove" title="从图库删除" aria-label="从图库删除" onClick={() => void remove(entry.id)}><Icon name="close" className="h-3 w-3" /></button>
            </div>
          ))}
          <button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="kth-wall kth-wall--upload">
            <Icon name="upload" className="h-4 w-4" />{uploading ? '处理中…' : '上传图片'}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
            void upload(event.target.files?.[0]);
            event.target.value = '';
          }} />
        </div>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {hasWallpaper ? (
          <>
            <Option title="显示范围" description={settings.wallpaperScope === 'window' ? '背景铺满整个窗口，侧栏、列表透出多少在下面的「材质」里调。' : '只在聊天消息区显示。'}>
              <Choice value={settings.wallpaperScope} options={SCOPES} onChange={(wallpaperScope) => update({ wallpaperScope })} />
            </Option>
            <Slider label="画布遮罩" value={settings.wallpaperDim} min={0} max={100} unit="%" onChange={(wallpaperDim) => update({ wallpaperDim })} />
            <Slider label="明暗" value={settings.wallpaperShade} min={-60} max={60} format={shadeLabel} onChange={(wallpaperShade) => update({ wallpaperShade })} />
            {custom ? (
              <>
                <Slider label="模糊" value={settings.wallpaperBlur} min={0} max={30} unit="px" onChange={(wallpaperBlur) => update({ wallpaperBlur })} />
                <Slider label="饱和度" value={settings.wallpaperSaturation} min={0} max={200} step={5} unit="%" onChange={(wallpaperSaturation) => update({ wallpaperSaturation })} />
                <Option title="填充方式"><Choice value={settings.wallpaperFit} options={FITS} onChange={(wallpaperFit) => update({ wallpaperFit })} /></Option>
                {settings.wallpaperFit !== 'stretch' ? <Option title="对齐位置"><Choice value={settings.wallpaperAlign} options={ALIGNS} onChange={(wallpaperAlign) => update({ wallpaperAlign })} /></Option> : null}
              </>
            ) : <p className="kth-hint">模糊、饱和度和填充方式只对自己上传的图片生效；内置背景是程序画出来的渐变和纹理。</p>}
          </>
        ) : null}
        {!split ? <p className="kth-hint">想让浅色、深色各用一张背景？打开最上面的「浅色、深色分别设置」。</p> : null}
      </div>
    </Card>
  );
}
