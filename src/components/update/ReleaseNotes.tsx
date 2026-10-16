import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchReleaseHistory } from '@/api/releases';
import { ApiError } from '@/api/client';
import { getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import type { AppRelease, ReleasePlatform } from '@/types/release';
import { ChangelogText } from './ChangelogText';
import { formatReleaseDate } from './updateFormat';

/**
 * 更新日志：某个平台已发布版本的列表（GET /releases，KukeChat-Server/docs/releases.md 2.2），从新到旧。
 * 桌面端看 windows，安卓看 android；网页 / 扩展两个都能切。
 */

const PLATFORM_LABEL: Record<ReleasePlatform, string> = { windows: 'Windows', android: 'Android', macos: 'macOS', linux: 'Linux' };
const PAGE = 20;

/** 浮层挂载点：安卓原生壳挂到带 data-theme / data-layout 的 .kc-native-app 里，其它情况同桌面弹窗 */
export function updatePortalRoot(): Element {
  return document.querySelector('.kc-native-app') ?? getDesktopPortalRoot();
}

type ListState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: AppRelease[]; total: number };

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return '服务器还没有开放更新日志。';
  return '更新日志加载失败，请稍后重试。';
}

export function ReleaseNotesList({ platform, currentVersion }: { platform: ReleasePlatform; currentVersion?: string | null }): JSX.Element {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    fetchReleaseHistory({ platform, limit: PAGE })
      .then((page) => { if (alive) setState({ status: 'ready', items: page.items, total: page.total }); })
      .catch((error: unknown) => { if (alive) setState({ status: 'error', message: errorMessage(error) }); });
    return () => { alive = false; };
  }, [platform, attempt]);

  if (state.status === 'loading') return <p className="kup-empty">正在加载…</p>;
  if (state.status === 'error') {
    return (
      <div className="kup-empty">
        <p className="kup-text">{state.message}</p>
        <button type="button" className="kup-link" onClick={() => setAttempt((value) => value + 1)}>重试</button>
      </div>
    );
  }
  if (state.items.length === 0) return <p className="kup-empty">还没有发布过 {PLATFORM_LABEL[platform]} 版本。</p>;

  const more = async (): Promise<void> => {
    setLoadingMore(true);
    try {
      const page = await fetchReleaseHistory({ platform, limit: PAGE, offset: state.items.length });
      setState({ status: 'ready', items: [...state.items, ...page.items], total: page.total });
    } catch {
      /* 留在当前页，按钮还在，可以再点 */
    } finally {
      setLoadingMore(false);
    }
  };

  const current = currentVersion?.replace(/^v/i, '') ?? null;
  return (
    <div className="kup-notes">
      {state.items.map((release, index) => (
        <article key={release.id || release.version} className="kup-note">
          <header className="kup-note-head">
            <span className="kup-note-version">v{release.version}</span>
            {index === 0 ? <span className="kup-chip is-ink">最新</span> : null}
            {release.channel === 'beta' ? <span className="kup-chip">测试版</span> : null}
            {current && current === release.version ? <span className="kup-chip">当前版本</span> : null}
            <span className="kup-note-date">{formatReleaseDate(release.publishedAt)}</span>
          </header>
          <ChangelogText text={release.changelog} />
        </article>
      ))}
      {state.items.length < state.total ? (
        <div style={{ paddingTop: 12, textAlign: 'center' }}>
          <button type="button" className="kup-btn-quiet" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? '加载中…' : '查看更早的版本'}</button>
        </div>
      ) : null}
    </div>
  );
}

/** 更新日志弹窗。platforms 有多个时顶上出现切换。 */
export function ReleaseNotesDialog({ open, onClose, platforms, currentVersion }: {
  open: boolean;
  onClose: () => void;
  platforms: ReleasePlatform[];
  currentVersion?: string | null;
}): JSX.Element | null {
  const [platform, setPlatform] = useState<ReleasePlatform>(platforms[0] ?? 'windows');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="kup-layer" onMouseDown={onClose}>
      <section role="dialog" aria-modal="true" aria-label="更新日志" className="kup-sheet kup-sheet--wide" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kup-head">
          <h2 className="kup-title">更新日志</h2>
          {platforms.length > 1 ? (
            <div className="kup-tabs" role="tablist">
              {platforms.map((item) => (
                <button key={item} type="button" role="tab" aria-selected={item === platform} className={`kup-tab ${item === platform ? 'is-active' : ''}`} onClick={() => setPlatform(item)}>
                  {PLATFORM_LABEL[item]}
                </button>
              ))}
            </div>
          ) : null}
        </header>
        <div className="kup-body">
          <ReleaseNotesList platform={platform} currentVersion={currentVersion} />
        </div>
        <footer className="kup-foot">
          <button type="button" className="kup-btn" onClick={onClose}>关闭</button>
        </footer>
      </section>
    </div>,
    updatePortalRoot()
  );
}
