import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAnnouncements } from '@/api/announcements';
import type { Announcement } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/ui/Markdown';
import { resolveAssetUrl } from '@/utils/assetUrl';

function delayStyle(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties;
}

interface AnnouncementModalProps {
  initialId?: number | null;
  mobile?: boolean;
  onClose: () => void;
}

function formatDate(value?: string | null, withTime = true): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  const base = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  return withTime ? `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}` : base;
}

export function AnnouncementModal({ initialId, mobile = false, onClose }: AnnouncementModalProps): JSX.Element {
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(mobile ? null : initialId ?? null);
  const listQuery = useQuery({ queryKey: ['announcement', 'list'], queryFn: getAnnouncements, staleTime: 30_000 });
  const list = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const selected: Announcement | null = useMemo(() => {
    if (!list.length) {
      return null;
    }
    return list.find((item) => item.id === selectedId) ?? list[0];
  }, [list, selectedId]);

  function requestClose(): void {
    if (closing) {
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 220);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        requestClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cover = selected?.cover_url ? resolveAssetUrl(selected.cover_url) : null;
  const empty = !listQuery.isLoading && list.length === 0;

  if (mobile) {
    const showDetail = selectedId !== null && selected !== null;
    return (
      <div className={`fixed inset-0 z-[2147483646] h-[100dvh] w-screen overflow-hidden [background:var(--kc-mobile-bg)] [color:var(--kc-text)] ${closing ? 'kc-ann-backdrop-out' : 'kc-ann-backdrop'}`} onClick={requestClose}>
        <div
          className={`relative flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden [background:var(--kc-mobile-bg)] ${closing ? 'kc-ann-modal-out' : 'kc-ann-modal'}`}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="shrink-0 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-bg)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {showDetail ? <button type="button" onClick={() => setSelectedId(null)} className="kc-mobile-back-button grid h-10 w-10 shrink-0 place-items-center rounded-full transition [background:var(--kc-panel-muted)] active:scale-[0.98]" aria-label="返回公告列表"><Icon name="chevronLeft" className="h-5 w-5 [color:var(--kc-text)]" /></button> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white shadow-[0_10px_24px_rgba(59,130,246,.22)]" style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}><Icon name="announcement" className="h-5 w-5" /></span>}
                <div className="min-w-0">
                  <h2 className="truncate text-[18px] font-black leading-tight [color:var(--kc-text)]">{showDetail ? '公告详情' : '公告中心'}</h2>
                  <p className="mt-0.5 truncate text-[12px] [color:var(--kc-muted)]">{showDetail ? '返回可查看全部公告' : `${list.length} 条公告`}</p>
                </div>
              </div>
              <button type="button" onClick={requestClose} className="kc-mobile-close-button grid h-9 w-9 shrink-0 place-items-center rounded-full transition [background:var(--kc-panel-muted)] hover:[background:var(--kc-hover)]" aria-label="关闭公告">
                <Icon name="close" className="h-4 w-4 [color:var(--kc-muted)]" />
              </button>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {empty ? (
              <div className="grid min-h-full place-items-center px-8 text-center">
                <div>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                    <Icon name="announcement" className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-lg font-bold [color:var(--kc-text)]">暂无公告</h3>
                  <p className="mt-1 text-sm [color:var(--kc-muted)]">还没有发布任何公告，敬请期待～</p>
                </div>
              </div>
            ) : !showDetail ? (
              <div className="grid w-full max-w-full gap-2 px-4 pb-5">
                {listQuery.isLoading ? <p className="rounded-2xl px-4 py-5 text-center text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">加载中…</p> : null}
                {list.map((item, index) => (
                  <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} style={delayStyle(index * 30)} className="kc-ann-item flex w-full max-w-full items-center gap-3 overflow-hidden rounded-[22px] border p-3 text-left transition [background:var(--kc-panel)] [border-color:var(--kc-border)] active:scale-[0.99]">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[19px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name={item.pinned ? 'pin' : 'announcement'} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-black [color:var(--kc-text)]">{item.title}</span>
                      <span className="mt-1 block text-[12px] [color:var(--kc-muted)]">{formatDate(item.created_at, false)}</span>
                    </span>
                    <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                  </button>
                ))}
              </div>
            ) : selected ? (
              <article key={selected.id} className="w-full max-w-full overflow-x-hidden pb-5">
                {cover ? (
                  <div className="kc-ann-cover relative h-[150px] w-full overflow-hidden">
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
                  </div>
                ) : null}
                <div className="max-w-full px-5 py-5">
                  <span className="kc-ann-item inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]" style={delayStyle(80)}>
                    <Icon name="announcement" className="h-3 w-3" /> 公告
                  </span>
                  <h1 className="kc-ann-item mt-3 break-words text-[24px] font-black leading-[1.15] tracking-[-0.02em] [color:var(--kc-text)]" style={delayStyle(140)}>{selected.title}</h1>
                  <div className="kc-ann-item mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs [color:var(--kc-muted)]" style={delayStyle(200)}>
                    {selected.author ? (
                      <>
                        <span className="[&>*]:!h-4 [&>*]:!w-4"><Avatar user={selected.author} size="sm" /></span>
                        <span className="max-w-[150px] truncate">{getDisplayName(selected.author)}</span>
                        <span>·</span>
                      </>
                    ) : null}
                    <span>{formatDate(selected.created_at)}</span>
                  </div>
                  <div className="kc-ann-item mt-5" style={delayStyle(260)}>
                    <Markdown content={selected.content} className="kc-ann-md kc-ann-md-mobile" />
                  </div>
                </div>
              </article>
            ) : (
              <div className="grid min-h-full place-items-center text-sm [color:var(--kc-muted)]">加载中…</div>
            )}
          </section>

          <div className="shrink-0 border-t px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 [background:var(--kc-mobile-bg)] [border-color:var(--kc-border)]">
            <button type="button" onClick={requestClose} className="h-12 w-full rounded-[20px] text-sm font-black text-white shadow-[0_12px_26px_rgba(22,139,255,.22)] transition active:scale-[0.99] [background:linear-gradient(135deg,var(--kc-accent),#42a5ff)]">
              {showDetail ? '我知道了' : '回到首页'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-[80] grid place-items-center p-4 ${closing ? 'kc-ann-backdrop-out' : 'kc-ann-backdrop'}`} onClick={requestClose}>
      <div
        className={`relative flex h-[min(660px,88vh)] w-[min(940px,95vw)] overflow-hidden rounded-[26px] border shadow-2xl [background:var(--kc-panel)] [border-color:var(--kc-border)] ${closing ? 'kc-ann-modal-out' : 'kc-ann-modal'}`}
        onClick={(event) => event.stopPropagation()}
      >
        {/* left: announcement list */}
        <aside className="flex w-[260px] shrink-0 flex-col border-r [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
          <div className="flex items-center gap-2 px-5 pb-3 pt-5">
            <span className="grid h-8 w-8 place-items-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
              <Icon name="announcement" className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-black [color:var(--kc-text)]">公告中心</h2>
              <p className="text-[11px] [color:var(--kc-muted)]">{list.length} 条公告</p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {listQuery.isLoading ? (
              <p className="px-2 py-6 text-center text-xs [color:var(--kc-muted)]">加载中…</p>
            ) : list.map((item, index) => {
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  style={delayStyle(index * 40)}
                  className={`kc-ann-item mb-1 flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition ${active ? '[background:var(--kc-panel)] shadow-sm' : 'hover:[background:var(--kc-hover)]'}`}
                >
                  <span className="flex items-center gap-1.5">
                    {item.pinned ? <Icon name="pin" className="h-3 w-3 shrink-0 [color:var(--kc-accent)]" /> : null}
                    <span className={`truncate text-sm font-semibold ${active ? '[color:var(--kc-accent)]' : '[color:var(--kc-text)]'}`}>{item.title}</span>
                  </span>
                  <span className="text-[11px] [color:var(--kc-muted)]">{formatDate(item.created_at, false)}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* right: content */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <button type="button" onClick={requestClose} className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full transition hover:[background:var(--kc-hover)]">
            <Icon name="close" className="h-4 w-4 [color:var(--kc-muted)]" />
          </button>

          {empty ? (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#3b82f6,#6366f1)' }}>
                  <Icon name="announcement" className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-bold [color:var(--kc-text)]">暂无公告</h3>
                <p className="mt-1 text-sm [color:var(--kc-muted)]">还没有发布任何公告，敬请期待～</p>
              </div>
            </div>
          ) : selected ? (
            <>
              <div key={selected.id} className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {cover ? (
                  <div className="kc-ann-cover relative h-44 w-full overflow-hidden">
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  </div>
                ) : null}
                <div className="px-8 py-7">
                  <span className="kc-ann-item inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]" style={delayStyle(80)}>
                    <Icon name="announcement" className="h-3 w-3" /> 公告
                  </span>
                  <h1 className="kc-ann-item mt-3 text-[26px] font-black leading-tight [color:var(--kc-text)]" style={delayStyle(140)}>{selected.title}</h1>
                  <div className="kc-ann-item mt-2.5 flex items-center gap-2 text-xs [color:var(--kc-muted)]" style={delayStyle(200)}>
                    {selected.author ? (
                      <>
                        <span className="[&>*]:!h-4 [&>*]:!w-4"><Avatar user={selected.author} size="sm" /></span>
                        <span>{getDisplayName(selected.author)}</span>
                        <span>·</span>
                      </>
                    ) : null}
                    <span>{formatDate(selected.created_at)}</span>
                  </div>
                  <div className="kc-ann-item mt-6" style={delayStyle(280)}>
                    <Markdown content={selected.content} className="kc-ann-md" />
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t px-8 py-4 [border-color:var(--kc-border)]">
                <button type="button" onClick={requestClose} className="w-full rounded-2xl py-3 text-sm font-bold text-white transition hover:brightness-110 [background:var(--kc-accent)]">
                  我知道了
                </button>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm [color:var(--kc-muted)]">加载中…</div>
          )}
        </section>
      </div>
    </div>
  );
}
