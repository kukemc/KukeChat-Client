import { type AnimationEvent, type CSSProperties, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { CcwCreator } from '@/types/api';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { type CreatorSortKey, creatorAsUser, creatorCover, creatorIntroduction, creatorName } from '../../ccwCreatorsData';
import { CountUp } from './CountUp';
import { useCoverTone } from './coverTone';
import { useInViewOnce } from './motion';

export type OpenCreator = (creator: CcwCreator, card: HTMLElement) => void;

interface CardProps {
  creator: CcwCreator;
  rank: number;
  sortKey: CreatorSortKey;
  /** 片头还在播时先别入场，等它把舞台让出来 */
  revealEnabled: boolean;
  /** 片头刚被打断：这一刻露面的卡片直接就位，不播入场 */
  instant: boolean;
  onOpen: OpenCreator;
}

/** 一张卡片共用的状态：有没有进过视口、题图地址和它的主色、题图是否加载失败。 */
function useCard(creator: CcwCreator, revealEnabled: boolean, instant: boolean) {
  const cellRef = useRef<HTMLLIElement>(null);
  const { seen, order } = useInViewOnce(cellRef, revealEnabled);
  // 露面那一刻是不是「直接就位」，定下来就不再变
  const reveal = useRef<'in' | 'quiet' | null>(null);
  if (seen && !reveal.current) {
    reveal.current = instant ? 'quiet' : 'in';
  }
  // 入场、扫光各自播完就把对应的类名摘掉。不摘的话，整页被藏起来（display: none）再显示时，这些关键帧会从头再播一遍
  const [played, setPlayed] = useState({ rise: false, sheen: false });
  function onAnimationEnd(event: AnimationEvent<HTMLLIElement>): void {
    if (event.animationName === 'kcr-rise' && event.target === event.currentTarget) {
      setPlayed((current) => ({ ...current, rise: true }));
    } else if (event.animationName === 'kcr-sheen') {
      setPlayed((current) => ({ ...current, sheen: true }));
    }
  }
  const revealClass = !reveal.current ? '' : reveal.current === 'quiet' || played.rise ? 'is-quiet' : 'is-in';
  const cover = resolveAssetUrl(creatorCover(creator));
  const [coverState, setCoverState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const tone = useCoverTone(coverState === 'failed' ? undefined : resolveThumbnailUrl(creatorCover(creator)), seen);
  const style = { '--kcr-delay': `${Math.min(order, 8) * 70}ms`, ...(tone ? { '--kcr-tone': tone } : null) } as CSSProperties;
  return { cellRef, seen, order, tone, style, revealClass, sheenClass: seen && !played.sheen ? 'is-seen' : '', onAnimationEnd, cover: cover && coverState !== 'failed' ? cover : undefined, coverReady: coverState === 'ready', setCoverState };
}

/** 题图。外层跟着指针做一点视差，里面的图在悬停时慢慢放大；没加载出来之前是主色的占位。 */
function Cover({ src, ready, eager = false, onState }: { src?: string; ready: boolean; eager?: boolean; onState: (state: 'ready' | 'failed') => void }): JSX.Element {
  return (
    <span className="kcr-cover" data-shared="cover" aria-hidden="true">
      {src ? (
        <span className="kcr-cover-shift">
          <img src={src} alt="" className={ready ? 'is-ready' : undefined} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} onLoad={() => onState('ready')} onError={() => onState('failed')} />
        </span>
      ) : null}
    </span>
  );
}

/** 前三名头像外面的那圈金属环。片头里飞进来的也是它，所以单独成一个组件。 */
export function Medal({ creator, rank }: { creator: CcwCreator; rank: number }): JSX.Element {
  return (
    <span className="kcr-medal" data-rank={rank} data-shared="avatar">
      <Avatar user={creatorAsUser(creator)} avatarUrl={creator.avatar_url || creator.ccw_avatar_url} size="xl" />
      <span className="kcr-medal-ring" aria-hidden="true" />
      {rank === 1 ? (
        <svg className="kcr-crown" viewBox="0 0 32 24" aria-hidden="true">
          <path d="M3 20.5h26M4.6 17 2.5 6.2l7.4 5.2L16 2.6l6.1 8.8 7.4-5.2L27.4 17z" />
        </svg>
      ) : null}
    </span>
  );
}

function Handle({ creator }: { creator: CcwCreator }): JSX.Element {
  return (
    <small className="kcr-handle">
      <span className="kcr-clip">@{creator.username}</span>
      <span className="kcr-verified"><Icon name="check" />CCW 已验证</span>
    </small>
  );
}

function Stats({ creator, sortKey, run, delay }: { creator: CcwCreator; sortKey: CreatorSortKey; run: boolean; delay: number }): JSX.Element {
  const items: Array<{ key: CreatorSortKey; label: string; value?: number | null }> = [
    { key: 'followers', label: '粉丝', value: creator.ccw_follower_count },
    { key: 'likes', label: '获赞', value: creator.ccw_like_count },
    { key: 'works', label: '作品', value: creator.ccw_creation_count }
  ];
  return (
    <span className="kcr-stats">
      {items.map((item) => (
        <span key={item.key} className={item.key === sortKey ? 'is-key' : undefined}>
          <CountUp value={item.value} run={run} delay={delay} />
          <small>{item.label}</small>
        </span>
      ))}
    </span>
  );
}

/** 领奖台上的一位（前三名）：题图铺满整张卡，名次是一枚大号的金属数字。 */
export function PodiumCard({ creator, rank, sortKey, revealEnabled, instant, staged: stagedNow, onOpen, onTone }: CardProps & { /** 片头会亲自把这张卡送上台，卡片自己不再做入场 */ staged: boolean; onTone?: (tone: string | null) => void }): JSX.Element {
  const card = useCard(creator, revealEnabled, instant);
  // 只认挂载那一刻：片头播完以后不能再回头补一次入场动画
  const [staged] = useState(stagedNow);

  useEffect(() => {
    onTone?.(card.tone);
    // 只在主色变化时上报
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.tone]);

  return (
    <li ref={card.cellRef} className={`kcr-cell kcr-podium-cell ${staged ? 'is-staged' : card.revealClass} ${card.sheenClass}`} data-rank={rank} data-flip={creator.id} style={card.style} onAnimationEnd={card.onAnimationEnd}>
      <button type="button" className="kcr-top" data-tilt="" data-rank={rank} data-creator-id={creator.id} onClick={(event) => onOpen(creator, event.currentTarget)}>
        <Cover src={card.cover} ready={card.coverReady} eager onState={card.setCoverState} />
        <span className="kcr-top-shade" aria-hidden="true" />
        <span className="kcr-top-rank" aria-label={`第 ${rank} 名`}>{rank}</span>
        <span className="kcr-top-main">
          <Medal creator={creator} rank={rank} />
          <strong className="kcr-name">{creatorName(creator)}</strong>
          <Handle creator={creator} />
          <span className="kcr-sign">{creatorIntroduction(creator)}</span>
          <Stats creator={creator} sortKey={sortKey} run={card.seen} delay={card.order * 70 + 200} />
        </span>
        <span className="kcr-enter" aria-hidden="true">进入主页<Icon name="chevron" /></span>
        <span className="kcr-spot" aria-hidden="true" />
        <span className="kcr-sheen" aria-hidden="true" />
        <span className="kcr-frame" aria-hidden="true" />
      </button>
    </li>
  );
}

/** 第四名往后的卡片：上面一条题图，名次是压在题图上的描边大字。 */
export function RankCard({ creator, rank, sortKey, revealEnabled, instant, onOpen }: CardProps): JSX.Element {
  const card = useCard(creator, revealEnabled, instant);

  return (
    <li ref={card.cellRef} className={`kcr-cell ${card.revealClass}`} data-flip={creator.id} style={card.style} onAnimationEnd={card.onAnimationEnd}>
      <button type="button" className="kcr-card" data-tilt="" data-creator-id={creator.id} onClick={(event) => onOpen(creator, event.currentTarget)}>
        <Cover src={card.cover} ready={card.coverReady} onState={card.setCoverState} />
        <span className="kcr-card-rank" data-n={String(rank).padStart(2, '0')} aria-label={`第 ${rank} 名`}>{String(rank).padStart(2, '0')}</span>
        <span className="kcr-card-main">
          <span className="kcr-card-avatar" data-shared="avatar">
            <Avatar user={creatorAsUser(creator)} avatarUrl={creator.avatar_url || creator.ccw_avatar_url} size="lg" />
          </span>
          <strong className="kcr-name">{creatorName(creator)}</strong>
          <Handle creator={creator} />
          <span className="kcr-sign">{creatorIntroduction(creator)}</span>
          <Stats creator={creator} sortKey={sortKey} run={card.seen} delay={card.order * 70 + 160} />
        </span>
        <span className="kcr-enter" aria-hidden="true">进入主页<Icon name="chevron" /></span>
        <span className="kcr-spot" aria-hidden="true" />
      </button>
    </li>
  );
}
