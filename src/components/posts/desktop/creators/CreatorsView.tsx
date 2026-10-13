import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { CcwCreator } from '@/types/api';
import { type CreatorSortKey, creatorAsUser, creatorSortOptions, rankCreators, useCcwCreators } from '../../ccwCreatorsData';
import type { OpenUserSpace } from '../../postModel';
import { CountUp } from './CountUp';
import { type OpenCreator, PodiumCard, RankCard } from './CreatorCard';
import { CreatorsIntro, type IntroMode, type IntroStatus } from './CreatorsIntro';
import { prefersReducedMotion, useFlip, useTilt } from './motion';

/** 片头只在这次运行里第一次进来时播完整版，之后进来播一秒的精简版 */
let introSeen = false;

/** 预览页的「重播片头」用：让下一次进入重新播完整版。 */
export function resetCreatorsIntro(): void {
  introSeen = false;
}

/**
 * 片头的四个阶段。页面上的元素按它决定自己露不露面：
 * play 片头占着舞台 → land 片头开始落位，页面其余部分入场 → settle 片头里的替身换成真元素 → done 片头撤走。
 */
type IntroPhase = 'play' | 'land' | 'settle' | 'done';

interface CreatorsViewProps {
  hidden?: boolean;
  onBack: () => void;
  onOpenUserSpace: OpenUserSpace;
  /** 动态页接管「点卡片」：它同时拿着名单页和主页，能做从卡片到主页的衔接转场 */
  onOpenCreator?: OpenCreator;
}

function Skeleton(): JSX.Element {
  return (
    <div className="kcr-skeleton" aria-label="正在加载入住名单" role="status">
      <div className="kcr-podium">
        {[2, 1, 3].map((rank) => <span key={rank} className="kcr-bone kcr-bone--top" data-rank={rank} />)}
      </div>
      <div className="kcr-grid">
        {Array.from({ length: 8 }, (_, index) => <span key={index} className="kcr-bone kcr-bone--card" style={{ '--kcr-delay': `${index * 90}ms` } as CSSProperties} />)}
      </div>
    </div>
  );
}

/** 「大佬入住」：已绑定 CCW、粉丝过千的创作者的名人堂。 */
export function CcwCreatorsView({ hidden = false, onBack, onOpenUserSpace, onOpenCreator }: CreatorsViewProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { creators, total, isLoading, isError, hasMore, loadingMore, loadMore, retry } = useCcwCreators();
  const [sortKey, setSortKey] = useState<CreatorSortKey>('followers');
  const [intro, setIntro] = useState<IntroPhase>(() => (prefersReducedMotion() ? 'done' : 'play'));
  const [introMode] = useState<IntroMode>(() => (introSeen ? 'short' : 'full'));
  // 片头被打断后的一小会儿：页面直接呈现最终状态，不再补播入场
  const [instant, setInstant] = useState(false);
  const [leadTone, setLeadTone] = useState<string | null>(null);
  const [withIntro] = useState(intro === 'play');
  const ranked = useMemo(() => rankCreators(creators, sortKey), [creators, sortKey]);
  const status: IntroStatus = isLoading ? 'loading' : isError ? 'error' : creators.length === 0 ? 'empty' : 'ready';
  const flip = useFlip(stageRef, sortKey);
  useTilt(stageRef, intro === 'done' && status === 'ready');

  function finishIntro(skipped: boolean): void {
    introSeen = true;
    setIntro('done');
    if (skipped) {
      setInstant(true);
      window.setTimeout(() => setInstant(false), 600);
    }
  }

  function changeSort(next: CreatorSortKey): void {
    if (next !== sortKey) {
      flip.capture();
      setSortKey(next);
    }
  }

  /** 收场：整页轻轻退后淡出，再把舞台交还出去。 */
  function leave(): void {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) {
      onBack();
      return;
    }
    root.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.985)' }], { duration: 190, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.then(onBack, onBack);
  }

  function open(creator: CcwCreator, card: HTMLElement): void {
    if (onOpenCreator) {
      onOpenCreator(creator, card);
      return;
    }
    const go = (): void => onOpenUserSpace(creatorAsUser(creator), creator.id);
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) {
      go();
      return;
    }
    // 没有可以衔接的另一页（从主页进来的）：被点的卡片迎上来，整页淡出，再切走
    card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], { duration: 240, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-in' }).finished.then(go, go);
  }

  const cardProps = { sortKey, revealEnabled: intro !== 'play', instant, onOpen: open };
  const rootStyle = (leadTone ? { '--kcr-lead': leadTone } : undefined) as CSSProperties | undefined;

  return (
    <div ref={rootRef} className="kpo-page kcr" hidden={hidden} data-intro={intro} style={rootStyle}>
      <div className="kcr-scroll kui-scroll">
        <header className="kcr-bar">
          <button type="button" className="kui-icon-btn" aria-label="返回" title="返回" onClick={leave}><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <span className="kcr-bar-title">大佬入住</span>
          {status === 'ready' ? <span className="kcr-bar-note">{total} 位创作者已入住</span> : null}
        </header>

        <div className="kcr-hero">
          <div className="kcr-hero-bg" aria-hidden="true">
            <span className="kcr-hero-glow" />
            <svg className="kcr-hero-rings"><circle cx="78%" cy="30%" r="150" /><circle cx="78%" cy="30%" r="230" /><circle cx="78%" cy="30%" r="320" /></svg>
            <span className="kcr-hero-mark">HALL OF FAME</span>
          </div>
          <p className="kcr-eyebrow">HALL OF FAME</p>
          <h1 className="kcr-title">大佬入住</h1>
          <p className="kcr-count" data-empty={status === 'error' || status === 'empty' ? '' : undefined}>{status === 'loading' ? '名单清点中…' : <><CountUp value={total} run={intro !== 'play'} instant={withIntro} /> 位创作者已入住</>}</p>
          <div className="kcr-hero-foot">
            <p className="kcr-lede">已绑定 CCW、粉丝超过 1,000 的创作者在这里留名。座次按 CCW 粉丝数排，点一张卡片进入 Ta 的 KukeChat 主页。</p>
            {status === 'ready' ? (
              <div className="kcr-sort">
                <span>排行依据</span>
                <div className="kui-segment" role="radiogroup" aria-label="排行依据">
                  {creatorSortOptions.map((option) => <button key={option.value} type="button" role="radio" aria-checked={sortKey === option.value} className={sortKey === option.value ? 'is-active' : undefined} onClick={() => changeSort(option.value)}>{option.label}</button>)}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {status === 'loading' && intro === 'done' ? <Skeleton /> : null}
        {status === 'error' ? (
          <div className="kcr-state" role="alert">
            <Icon name="alert" className="h-6 w-6" />
            <strong>暂时无法加载入住名单</strong>
            <span>网络或服务出了点状况，稍后再试。</span>
            <button type="button" className="kui-btn" onClick={retry}><Icon name="refresh" className="h-3.5 w-3.5" />重新加载</button>
          </div>
        ) : null}
        {status === 'empty' ? (
          <div className="kcr-state">
            <Icon name="sparkles" className="h-6 w-6" />
            <strong>第一位大佬正在来的路上</strong>
            <span>绑定 CCW 且粉丝超过 1,000 的创作者会出现在这里。</span>
          </div>
        ) : null}

        {status === 'ready' ? (
          <div ref={stageRef} className="kcr-stage">
            <ol className="kcr-podium">
              {ranked.slice(0, 3).map((creator, index) => <PodiumCard key={creator.id} creator={creator} rank={index + 1} staged={intro !== 'done'} onTone={index === 0 ? setLeadTone : undefined} {...cardProps} />)}
            </ol>
            {ranked.length > 3 ? (
              <ol className="kcr-grid">
                {ranked.slice(3).map((creator, index) => <RankCard key={creator.id} creator={creator} rank={index + 4} {...cardProps} />)}
              </ol>
            ) : null}
            {hasMore ? <button type="button" className="kui-btn kcr-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? '正在加载…' : '继续查看更多创作者'}</button> : null}
            <p className="kcr-footnote">{sortKey === 'followers' ? '座次' : '当前座次只在已加载的创作者里排；默认座次'}依据最近一次 CCW 同步的数据。</p>
          </div>
        ) : null}
      </div>

      {intro !== 'done' ? (
        <CreatorsIntro mode={introMode} status={status} top={ranked.slice(0, 3)} total={total} onLand={() => setIntro('land')} onSettle={() => setIntro('settle')} onDone={finishIntro} />
      ) : null}
    </div>
  );
}
