import { type CSSProperties, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getCcwCreators } from '@/api/users';
import type { CcwCreator, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { resolveAssetUrl } from '@/utils/assetUrl';

const PAGE_SIZE = 30;

interface CcwCreatorsPageProps {
  isMobile: boolean;
  onBack: () => void;
  onOpenUserSpace: (user: User | null | undefined, fallbackId: number) => void;
  transitionStyle?: CSSProperties;
}

function compactNumber(value?: number | null): string {
  const count = value ?? 0;
  if (count >= 100000000) return `${(count / 100000000).toFixed(count >= 1000000000 ? 0 : 1)}亿`;
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}k`;
  return String(count);
}

function creatorAsUser(creator: CcwCreator): User {
  return creator as User;
}

function CreatorCard({ creator, rank, onOpen }: { creator: CcwCreator; rank: number; onOpen: () => void }): JSX.Element {
  const user = creatorAsUser(creator);
  const cover = resolveAssetUrl(creator.profile_cover_url || creator.ccw_homepage_cover_url);
  const introduction = creator.profile_tagline || creator.profile_title || creator.bio || creator.ccw_bio || '在 KukeChat 遇见这位优秀的 CCW 创作者。';
  return (
    <button type="button" onClick={onOpen} className={`kc-creator-card kc-creator-reveal group text-left ${rank <= 2 ? `kc-creator-card-top kc-creator-rank-${rank}` : ''}`} style={{ '--creator-index': Math.min(rank - 1, 15) } as CSSProperties}>
      <span className="kc-creator-cover" style={cover ? { backgroundImage: `linear-gradient(180deg,rgba(9,14,26,.08),rgba(9,14,26,.72)),url(${cover})` } : undefined} aria-hidden="true" />
      <span className="kc-creator-card-surface">
        <span className="kc-creator-rank" aria-label={`第 ${rank} 位`}>{String(rank).padStart(2, '0')}</span>
        <span className="kc-creator-avatar-wrap"><Avatar user={user} avatarUrl={creator.avatar_url || creator.ccw_avatar_url} size="xl" /><span className="kc-creator-verified"><Icon name="check" className="h-3.5 w-3.5" /></span></span>
        <span className="kc-creator-copy">
          <span className="kc-creator-name">{creator.ccw_name || getDisplayName(user)}</span>
          <span className="kc-creator-handle">@{creator.username} · CCW 已验证</span>
          <span className="kc-creator-intro">{introduction}</span>
        </span>
        <span className="kc-creator-metrics">
          <span><strong>{compactNumber(creator.ccw_follower_count)}</strong><small>粉丝</small></span>
          <span><strong>{compactNumber(creator.ccw_like_count)}</strong><small>获赞</small></span>
          <span><strong>{compactNumber(creator.ccw_creation_count)}</strong><small>作品</small></span>
        </span>
        <span className="kc-creator-enter">查看主页 <Icon name="chevron" className="h-4 w-4" /></span>
      </span>
    </button>
  );
}

export function CcwCreatorsPage({ isMobile, onBack, onOpenUserSpace, transitionStyle }: CcwCreatorsPageProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const query = useInfiniteQuery({
    queryKey: ['ccw-creators'],
    queryFn: ({ pageParam }) => getCcwCreators(PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (page) => page.has_more ? page.offset + page.items.length : undefined
  });
  const creators = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const frame = window.requestAnimationFrame(() => {
      root.querySelectorAll('.kc-creator-reveal:not(.kc-creator-visible)').forEach((node) => node.classList.add('kc-creator-visible'));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [creators.length]);

  return (
    <section className={`kc-creators-page ${isMobile ? 'kc-creators-mobile fixed inset-0 z-[2147483647]' : 'h-full min-h-0'}`} style={transitionStyle}>
      {isMobile ? <MobileStatusBar /> : null}
      <div ref={scrollRef} className="kc-creators-scroll scroll-soft h-full overflow-y-auto">
        <header className="kc-creators-hero">
          <div className="kc-creators-orbit" aria-hidden="true"><i /><i /><i /></div>
          <button type="button" onClick={onBack} className="kc-creators-back" aria-label="返回动态"><Icon name="chevronLeft" className="h-5 w-5" /><span>返回动态</span></button>
          <div className="kc-creators-hero-copy kc-creator-reveal kc-creator-visible">
            <span className="kc-creators-kicker"><Icon name="sparkles" className="h-4 w-4" /> KukeChat Creator Residence</span>
            <h1>大佬入住</h1>
            <p>这里汇聚了已绑定 CCW、粉丝超过 1,000 的优秀创作者。每一次入住，都让 KukeChat 的创作宇宙更辽阔。</p>
          </div>
          <div className="kc-creators-proof kc-creator-reveal kc-creator-visible">
            <span><strong>{total}</strong><small>位创作者已入住</small></span>
            <span><strong>1k+</strong><small>CCW 粉丝认证门槛</small></span>
          </div>
        </header>

        <main className="kc-creators-content">
          <div className="kc-creators-section-title">
            <div><span>RESIDENTS</span><h2>认识正在发光的人</h2></div>
            <p>按 CCW 粉丝数排列，点击卡片进入 KukeChat 个人主页。</p>
          </div>
          {query.isLoading ? <div className="kc-creators-state"><span className="kc-creators-loader" /><p>正在迎接大佬入住...</p></div> : null}
          {query.isError ? <div className="kc-creators-state"><Icon name="shield" className="h-7 w-7" /><p>暂时无法加载入住名单</p><button type="button" onClick={() => void query.refetch()}>重新加载</button></div> : null}
          {!query.isLoading && !query.isError && creators.length === 0 ? <div className="kc-creators-state"><Icon name="sparkles" className="h-8 w-8" /><p>第一位大佬正在来的路上</p></div> : null}
          <div className="kc-creators-grid">
            {creators.map((creator, index) => <CreatorCard key={creator.id} creator={creator} rank={index + 1} onOpen={() => onOpenUserSpace(creatorAsUser(creator), creator.id)} />)}
          </div>
          {query.hasNextPage ? <button type="button" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} className="kc-creators-more">{query.isFetchingNextPage ? '正在加载...' : '继续探索更多创作者'}</button> : null}
          <footer className="kc-creators-footer"><span>KukeChat × CCW</span><p>真实绑定，真实影响力。名单依据最近一次 CCW 同步数据生成。</p></footer>
        </main>
      </div>
    </section>
  );
}
