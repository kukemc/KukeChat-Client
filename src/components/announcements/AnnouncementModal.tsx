import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Announcement } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/ui/Markdown';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { AnnouncementReactionBar } from './AnnouncementReactionBar';
import { formatAnnouncementDate, useAnnouncementList, useCoverImage, type AnnouncementModalProps } from './announcementData';
import { AnnouncementCenterDesktop } from './desktop/AnnouncementCenterDesktop';

function delayStyle(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties;
}

/** 系统公告 / 更新日志。桌面布局是左右两栏的对话框，手机布局是整页。 */
export function AnnouncementModal(props: AnnouncementModalProps): JSX.Element {
  return props.mobile ? <MobileAnnouncementCenter onClose={props.onClose} /> : <AnnouncementCenterDesktop {...props} />;
}

function MobileAnnouncementCenter({ onClose }: Pick<AnnouncementModalProps, 'onClose'>): JSX.Element {
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listQuery = useAnnouncementList();
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
  // 没拿到过数据的失败才算失败；手里有旧的一份时照常显示旧的
  const failed = listQuery.isError && !listQuery.data;
  const empty = !listQuery.isLoading && !failed && list.length === 0;
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
                <p className="mt-0.5 truncate text-[12px] [color:var(--kc-muted)]">{showDetail ? '返回可查看全部公告' : listQuery.isLoading ? '正在加载…' : failed ? '加载失败' : `${list.length} 条公告`}</p>
              </div>
            </div>
            <button type="button" onClick={requestClose} className="kc-mobile-close-button grid h-9 w-9 shrink-0 place-items-center rounded-full transition [background:var(--kc-panel-muted)] hover:[background:var(--kc-hover)]" aria-label="关闭公告">
              <Icon name="close" className="h-4 w-4 [color:var(--kc-muted)]" />
            </button>
          </div>
        </header>

        <section className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {failed ? (
            <div className="grid min-h-full place-items-center px-8 text-center" role="alert">
              <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-red-500">
                  <Icon name="alert" className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-lg font-bold [color:var(--kc-text)]">公告没有加载出来</h3>
                <p className="mt-1 text-sm [color:var(--kc-muted)]">检查一下网络，再试一次。</p>
                {/* 还没拿到过数据时重试，查询回到「加载中」，这里会换回骨架 */}
                <button type="button" onClick={() => void listQuery.refetch()} className="mt-5 h-10 rounded-full px-6 text-sm font-black text-white transition active:scale-[0.98] [background:var(--kc-accent)]">重试</button>
              </div>
            </div>
          ) : empty ? (
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
              {listQuery.isLoading ? <MobileListSkeleton /> : null}
              {list.map((item, index) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} style={delayStyle(index * 30)} className="kc-ann-item flex w-full max-w-full items-center gap-3 overflow-hidden rounded-[22px] border p-3 text-left transition [background:var(--kc-panel)] [border-color:var(--kc-border)] active:scale-[0.99]">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[19px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name={item.pinned ? 'pin' : 'announcement'} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-black [color:var(--kc-text)]">{item.title}</span>
                    <span className="mt-1 block text-[12px] [color:var(--kc-muted)]">{formatAnnouncementDate(item.created_at, false)}</span>
                  </span>
                  <Icon name="chevron" className="h-4 w-4 shrink-0 [color:var(--kc-muted)]" />
                </button>
              ))}
            </div>
          ) : selected ? (
            <article key={selected.id} className="w-full max-w-full overflow-x-hidden pb-5">
              {cover ? <MobileCover src={cover} /> : null}
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
                  <span>{formatAnnouncementDate(selected.created_at)}</span>
                </div>
                <div className="kc-ann-item mt-5" style={delayStyle(260)}>
                  <Markdown content={selected.content} className="kc-ann-md kc-ann-md-mobile" />
                </div>
                <div className="mt-6 border-t pt-4 [border-color:var(--kc-border)]">
                  <AnnouncementReactionBar announcement={selected} mobile />
                </div>
              </div>
            </article>
          ) : null}
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

const SKELETON_TITLE_WIDTHS = [64, 82, 46, 72];
const BONE = 'block animate-pulse motion-reduce:animate-none [background:var(--kc-panel-muted)]';

/** 列表加载中的骨架：和真的列表项同一个形状（图标块 + 标题 + 日期），内容到了原地换上去，换上去的那几项自带进场动画。 */
function MobileListSkeleton(): JSX.Element {
  return (
    <div className="grid gap-2" role="status" aria-label="正在加载公告">
      {SKELETON_TITLE_WIDTHS.map((width, index) => (
        <div key={index} style={delayStyle(index * 30)} className="kc-ann-item flex w-full items-center gap-3 rounded-[22px] border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <span className={`${BONE} h-12 w-12 shrink-0 rounded-[19px]`} />
          <span className="min-w-0 flex-1">
            <span className={`${BONE} h-3.5 rounded-full`} style={{ width: `${width}%` }} />
            <span className={`${BONE} mt-2.5 h-2.5 w-24 rounded-full`} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** 详情页顶上的封面图。位置是固定高度的，图没到之前垫一块呼吸的底色，到了淡入；加载失败就不显示。 */
function MobileCover({ src }: { src: string }): JSX.Element | null {
  const { status, ref, onLoad, onError } = useCoverImage();
  if (status === 'failed') {
    return null;
  }
  return (
    <div className="kc-ann-cover relative h-[150px] w-full overflow-hidden">
      {status === 'loading' ? <div className={`${BONE} absolute inset-0`} /> : null}
      <img ref={ref} src={src} alt="" onLoad={onLoad} onError={onError} className={`h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent" />
    </div>
  );
}
