import { useRef, useState } from 'react';
import { copyText } from '@/components/chat/message/chatDom';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import { MAX_THEME_FILE_BYTES, exportTheme, parseTheme, type ThemePackage } from '@/theme/themeCode';
import { isLibraryWallpaper, type ThemeScheme, type ThemeSettings } from '@/theme/themes';
import { MAX_SAVED_THEMES, MAX_THEME_NAME, useThemeStore, type SavedTheme } from '@/theme/themeStore';
import { applyTheme, wallpapersInUse } from '@/theme/useTheme';
import { addWallpaper, useWallpaperLibrary } from '@/theme/wallpaperStore';
import { Card, ConfirmLayer, Notice, Toggle, btn, inputClass, textareaClass } from '../settingsUi';
import { Option } from './controls';
import { ThemeThumbnail } from './ThemePreview';

type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;

function sameTheme(theme: SavedTheme, light: ThemeSettings, dark: ThemeSettings | null): boolean {
  return JSON.stringify([theme.light, theme.dark]) === JSON.stringify([light, dark]);
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 把导入的主题里带来的背景图存进图库，返回可以直接用的两套设置。 */
async function adoptImages(theme: ThemePackage): Promise<{ light: ThemeSettings; dark: ThemeSettings | null; imageFailed: boolean }> {
  let imageFailed = false;
  const adopt = async (settings: ThemeSettings | null, image: Blob | null): Promise<ThemeSettings | null> => {
    if (!settings || !image) {
      return settings;
    }
    try {
      return { ...settings, wallpaper: await addWallpaper(image, wallpapersInUse()) };
    } catch {
      imageFailed = true;
      return settings;
    }
  };
  const light = (await adopt(theme.light, theme.images.light)) ?? theme.light;
  const dark = await adopt(theme.dark, theme.images.dark);
  return { light, dark, imageFailed };
}

/** 我的主题：把当前整套配置存下来、切换、改名、覆盖、删除，以及导出给别人和导入别人的。 */
export function LibraryCard({ scheme }: { scheme: ThemeScheme }): JSX.Element {
  const light = useKukeStore((state) => state.themeSettings);
  const dark = useThemeStore((state) => state.dark);
  const saved = useThemeStore((state) => state.saved);
  const activeId = useThemeStore((state) => state.activeSavedId);
  const store = useThemeStore.getState;
  const library = useWallpaperLibrary();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<SavedTheme | null>(null);
  const [withImages, setWithImages] = useState(false);
  const [importing, setImporting] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const active = saved.find((theme) => theme.id === activeId) ?? null;
  const modified = active ? !sameTheme(active, light, dark) : false;
  const hasOwnImage = isLibraryWallpaper(light.wallpaper) || Boolean(dark && isLibraryWallpaper(dark.wallpaper));
  const wallpaperUrl = (settings: ThemeSettings): string | null => library.find((entry) => entry.id === settings.wallpaper)?.url ?? null;

  function save(): void {
    const id = store().saveTheme(name.trim() || `我的主题 ${saved.length + 1}`, light, dark);
    setFeedback(id ? { tone: 'success', text: '已保存到「我的主题」。' } : { tone: 'error', text: `最多保存 ${MAX_SAVED_THEMES} 份主题，请先删掉不用的。` });
    if (id) {
      setName('');
    }
  }

  async function share(kind: 'code' | 'file'): Promise<void> {
    setBusy(true);
    setFeedback(null);
    try {
      const themeName = active?.name ?? '我的主题';
      const exported = await exportTheme(themeName, light, dark, kind === 'file' && withImages);
      if (kind === 'file') {
        downloadText(`${themeName.replace(/[\\/:*?"<>|]/g, '_')}.kctheme.json`, exported.json);
      } else {
        await copyText(exported.code);
      }
      const done = kind === 'file' ? '主题文件已导出。' : '主题码已复制，发给别人粘贴导入就能用。';
      setFeedback({ tone: 'success', text: exported.droppedImage ? `${done}${kind === 'file' && withImages ? '背景图太大，没能带上。' : '自己上传的背景图不会包含在内。'}` : done });
    } catch {
      setFeedback({ tone: 'error', text: kind === 'file' ? '导出失败，请重试。' : '复制失败，请改用「导出为文件」。' });
    } finally {
      setBusy(false);
    }
  }

  async function importTheme(text: string): Promise<void> {
    const parsed = parseTheme(text);
    if (!parsed.ok) {
      setFeedback({ tone: 'error', text: parsed.error });
      return;
    }
    setBusy(true);
    try {
      const adopted = await adoptImages(parsed.value);
      const id = store().saveTheme(parsed.value.name, adopted.light, adopted.dark);
      applyTheme(adopted.light, adopted.dark, id);
      const notes = [...parsed.value.notes, ...(adopted.imageFailed ? ['主题里带的背景图没能存下来（图库已满或图片打不开），背景已去掉。'] : []), ...(id ? [] : ['「我的主题」已经存满，这份主题只是应用了，没有保存。'])];
      setFeedback({ tone: notes.length > 0 ? 'info' : 'success', text: `已导入并应用「${parsed.value.name}」。${notes.join('')}` });
      setCode('');
      setImporting(false);
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | undefined): Promise<void> {
    if (!file) {
      return;
    }
    if (file.size > MAX_THEME_FILE_BYTES) {
      setFeedback({ tone: 'error', text: '文件太大了，这不像是一份主题。' });
      return;
    }
    await importTheme(await file.text().catch(() => ''));
  }

  return (
    <Card title="我的主题" description="把现在这一整套（两种配色、背景、材质、颜色、形状）存下来，随时切回来。" padded>
      <div className="grid gap-4">
        {saved.length > 0 ? (
          <div className="kth-presets">
            {saved.map((theme) => {
              const isActive = theme.id === activeId;
              const shown = scheme === 'dark' && theme.dark ? theme.dark : theme.light;
              return (
                <div key={theme.id} className={`kth-preset ${isActive ? 'is-active' : ''}`}>
                  <button type="button" className="kth-preset-pick" aria-pressed={isActive} onClick={() => {
                    applyTheme(theme.light, theme.dark, theme.id);
                    setFeedback(null);
                  }}>
                    <ThemeThumbnail settings={shown} scheme={scheme} wallpaperUrl={wallpaperUrl(shown)} />
                    {renaming === theme.id ? null : <span className="kth-preset-name">{theme.name}{isActive ? <Icon name="check" className="kth-preset-check" /> : null}</span>}
                  </button>
                  {renaming === theme.id ? (
                    <input autoFocus className={`${inputClass} kth-rename`} value={renameText} maxLength={MAX_THEME_NAME} aria-label="主题名称" onChange={(event) => setRenameText(event.target.value)} onBlur={() => {
                      store().renameTheme(theme.id, renameText);
                      setRenaming(null);
                    }} onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      } else if (event.key === 'Escape') {
                        setRenaming(null);
                      }
                    }} />
                  ) : (
                    <span className="kth-preset-tools">
                      <span className="kth-preset-tagline">{isActive && modified ? '已修改' : theme.dark ? '浅色 + 深色' : '两种配色共用'}</span>
                      <button type="button" title="重命名" aria-label={`重命名 ${theme.name}`} onClick={() => {
                        setRenameText(theme.name);
                        setRenaming(theme.id);
                      }}><Icon name="edit" className="h-3.5 w-3.5" /></button>
                      <button type="button" title="删除" aria-label={`删除 ${theme.name}`} onClick={() => setDeleting(theme)}><Icon name="trash" className="h-3.5 w-3.5" /></button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : <p className="kth-hint">还没有保存过主题。调到满意之后在下面起个名字存下来。</p>}

        <div className="kth-save">
          <input className={inputClass} value={name} maxLength={MAX_THEME_NAME} placeholder="给这套主题起个名字" aria-label="新主题的名称" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              save();
            }
          }} />
          <button type="button" className={btn.primary} onClick={save}>保存为新主题</button>
          {active && modified ? <button type="button" className={btn.secondary} onClick={() => {
            store().overwriteTheme(active.id, light, dark);
            setFeedback({ tone: 'success', text: `已把现在的设置保存到「${active.name}」。` });
          }}>保存修改到「{active.name}」</button> : null}
        </div>

        <div className="kth-share">
          <p className="kth-label">分享</p>
          <div className="kth-share-actions">
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void share('code')}><Icon name="copy" className="h-4 w-4" />复制主题码</button>
            <button type="button" className={btn.secondary} disabled={busy} onClick={() => void share('file')}><Icon name="download" className="h-4 w-4" />导出为文件</button>
            <button type="button" className={btn.secondary} disabled={busy} aria-expanded={importing} onClick={() => {
              setImporting((value) => !value);
              setFeedback(null);
            }}><Icon name="upload" className="h-4 w-4" />导入主题</button>
          </div>
          {hasOwnImage ? (
            <Option title="导出文件时带上背景图" description="图片会压缩后写进文件里；主题码太短装不下图片，始终不带。">
              <Toggle checked={withImages} onChange={setWithImages} label="导出文件时带上背景图" />
            </Option>
          ) : null}
          {importing ? (
            <div className="kth-import">
              <textarea className={`${textareaClass} kth-import-code`} rows={3} value={code} placeholder="把别人发来的主题码（KCT1: 开头）粘贴到这里" aria-label="主题码" spellCheck={false} onChange={(event) => setCode(event.target.value)} />
              <div className="kth-share-actions">
                <button type="button" className={btn.primary} disabled={busy || !code.trim()} onClick={() => void importTheme(code)}>{busy ? '导入中…' : '导入并应用'}</button>
                <button type="button" className={btn.secondary} disabled={busy} onClick={() => fileInputRef.current?.click()}>从文件导入…</button>
                <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => {
                  void importFile(event.target.files?.[0]);
                  event.target.value = '';
                }} />
              </div>
              <p className="kth-hint">导入会替换现在的主题，并存进「我的主题」。导入的内容会逐项检查，颜色和数值不合法的主题码会被整份拒绝。</p>
            </div>
          ) : null}
          {feedback ? <Notice tone={feedback.tone}>{feedback.text}</Notice> : null}
        </div>
      </div>
      {deleting ? <ConfirmLayer title="删除这份主题？" message={`「${deleting.name}」会从「我的主题」里移除。正在用的外观不会变。`} confirmText="删除" danger onConfirm={() => {
        store().deleteTheme(deleting.id);
        setDeleting(null);
      }} onCancel={() => setDeleting(null)} /> : null}
    </Card>
  );
}
