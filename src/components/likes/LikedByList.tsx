import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal, getDesktopPortalRoot } from '@/components/ui/desktop/Modal';
import { registerNativeBackHandler } from '@/native/back';
import type { User } from '@/types/api';
import type { ProfileLikeReceivedItem } from '@/types/profileLikes';
import { formatClockTime, formatMessageDividerTime } from '@/utils/dateTime';
import { useMyProfileLikes, useReceivedProfileLikes } from './data';

interface LikedByListProps {
  /** 我自己 */
  user: User;
  /** 点了名单里的某个人：去他的主页 */
  onOpenUser: (user: User) => void;
}

/**
 * 「谁赞了我」：最近给我点赞的人，按时间倒序，滚到底接着加载（GET /users/me/likes/received）。
 * 只有内容，不带外框 —— 自己的资料卡里就地展开、个人空间的对话框、手机上的整页，三处套的壳不一样。
 * 同一个人每天一条；今天的那些带一个「今天」的小标记（是不是今天由服务端按 UTC+8 判断）。
 */
export function LikedByList({ user, onOpenUser }: LikedByListProps): JSX.Element {
  const mine = useMyProfileLikes(user);
  const query = useReceivedProfileLikes();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // 翻页是按偏移量取的：中途有人新点了赞，后面的页会和前面的重几条，按「谁 + 什么时候」去重
  const items = useMemo(() => {
    const seen = new Set<string>();
    const list: ProfileLikeReceivedItem[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        const key = `${item.user.id}|${item.created_at}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push(item);
        }
      }
    }
    return list;
  }, [query.data]);

  // 滚到底自动加载。观察的是视口（root 不填）：外面套的是哪个滚动容器都算得对，Shadow DOM 里也一样
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, items.length]);

  const firstPage = query.data?.pages[0];
  const total = mine.available ? mine.total : firstPage?.total ?? 0;
  const today = mine.available ? mine.today : firstPage?.today_count ?? 0;

  return (
    <div className="klk-list" data-like-list={query.status}>
      <p className="klk-list-sum">
        <span>累计 <b>{total.toLocaleString('zh-CN')}</b> 个赞</span>
        {today > 0 ? <span className="klk-list-today">今天 <b>+{today.toLocaleString('zh-CN')}</b></span> : <span>今天还没有人赞</span>}
      </p>
      {query.isPending ? (
        <ul className="klk-rows" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <li key={index} className="klk-row is-bone"><i /><span /><em /></li>)}
        </ul>
      ) : query.isError && items.length === 0 ? (
        <p className="klk-list-state" role="alert">
          名单没有取到
          <button type="button" className="klk-list-retry" onClick={() => void query.refetch()}>再试一次</button>
        </p>
      ) : items.length === 0 ? (
        <p className="klk-list-state">还没有人给你点赞。多去别人的主页逛逛吧。</p>
      ) : (
        <ul className="klk-rows">
          {items.map((item) => {
            const name = getDisplayName(item.user, `用户 ${item.user.id}`);
            return (
              <li key={`${item.user.id}|${item.created_at}`}>
                <button type="button" className="klk-row" title={`去 ${name} 的主页`} onClick={() => onOpenUser(item.user)}>
                  <Avatar user={item.user} label={name} size="sm" />
                  <span className="klk-row-name">{name}</span>
                  {item.today ? <span className="klk-row-today">今天</span> : null}
                  {/* 今天的只写几点几分：「今天」是服务端按 UTC+8 算的，和本机的日期差着时区时不能再写一个「昨天」上去 */}
                  <time className="klk-row-time">{item.today ? formatClockTime(item.created_at) : formatMessageDividerTime(item.created_at)}</time>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 ? (
        <div ref={sentinelRef} className="klk-list-more">
          {isFetchingNextPage ? '加载中…'
            : hasNextPage ? <button type="button" className="klk-list-retry" onClick={() => void fetchNextPage()}>加载更多</button>
            : items.length > 8 ? '没有更多了' : null}
        </div>
      ) : null}
    </div>
  );
}

/** 桌面布局下的「谁赞了我」对话框（个人空间里点自己的赞数打开）。 */
export function LikedByDialog({ user, onOpenUser, onClose }: LikedByListProps & { onClose: () => void }): JSX.Element {
  return createPortal(
    <Modal title="谁赞了我" className="kmd-modal--sm klk-dialog" bodyClassName="klk-dialog-body" onClose={onClose}>
      <LikedByList user={user} onOpenUser={onOpenUser} />
    </Modal>,
    getDesktopPortalRoot()
  );
}

/**
 * 移动布局下的「谁赞了我」：盖在个人主页上面的一整页，左上角返回（安卓的返回键也认）。
 * 挂到窗口根上：入口在主页顶上那张毛玻璃卡片里，卡片带 backdrop-filter，fixed 的后代会被它圈在卡片里面。
 */
export function MobileLikedByPage({ user, onOpenUser, onClose }: LikedByListProps & { onClose: () => void }): JSX.Element {
  // 比个人主页（170）高一档：按返回键先关这一页
  useEffect(() => registerNativeBackHandler(() => {
    onClose();
    return true;
  }, 176), [onClose]);

  return createPortal(
    <section className="klk-page fixed inset-0 z-[2147483647] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] [color:var(--kc-text)]" role="dialog" aria-label="谁赞了我">
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回个人主页"><Icon name="chevronLeft" className="h-6 w-6" /></button>
        <h2 className="min-w-0 flex-1 truncate text-center text-[18px] font-black">谁赞了我</h2>
        <span className="h-10 w-10 shrink-0" />
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+24px)] pt-1">
        <div className="klk-page-card">
          <LikedByList user={user} onOpenUser={onOpenUser} />
        </div>
      </main>
    </section>,
    getDesktopPortalRoot()
  );
}
