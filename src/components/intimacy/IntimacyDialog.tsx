import { useEffect, useMemo, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { RedPacketLayer } from '@/components/redpacket/RedPacketLayer';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { BadgeDisplay, FriendIntimacyDetail, IntimacyRules, SeriesLevelView, SeriesView } from '@/types/intimacy';
import { parseApiDate } from '@/utils/dateTime';
import { BadgeGlyph } from './BadgeGlyph';
import { intimacyErrorText, useFriendIntimacy, useIntimacyHistory, useIntimacyRules, useIntimacyUi, useMarkBadgesSeen, useSetFriendBadge } from './data';

type Tab = 'overview' | 'badges' | 'rules';

const HISTORY_DAYS = 14;

function fmt(value: number): string {
  return value.toLocaleString('zh-CN');
}

export function conditionText(series: Pick<SeriesView, 'condition'>, threshold: number | null): string {
  if (!series.condition) {
    return '隐藏成就，达成之后揭晓';
  }
  return series.condition.replace(/\{n\}|\bN\b/g, threshold !== null ? fmt(threshold) : '?');
}

/** 详情弹层的唯一入口：主界面上挂一个，谁要看就 openIntimacy(好友 id)。 */
export function IntimacyHost(): JSX.Element | null {
  const friendId = useIntimacyUi((state) => state.friendId);
  const close = useIntimacyUi((state) => state.close);
  if (friendId === null) {
    return null;
  }
  return <IntimacyDialog key={friendId} friendId={friendId} onClose={close} />;
}

/**
 * 「我们的友谊」：我和一个好友的亲密度、今天的进度、各项统计、全部好友成就，以及挂在 TA 名字旁的是哪一枚。
 * 外壳借红包的弹层（RedPacketLayer：桌面居中、移动端从底下升起，Esc / 系统返回键关闭），内容的样式在 intimacy.css（kit-）。
 */
export function IntimacyDialog({ friendId, onClose }: { friendId: number; onClose: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>('overview');
  const query = useFriendIntimacy(friendId);
  const rules = useIntimacyRules().data ?? null;
  const detail = query.data;
  const name = detail ? getDisplayName(detail.friend, `用户 ${friendId}`) : '';

  return (
    <RedPacketLayer label="我们的友谊" onClose={onClose} className="kit-layer">
      <section className="krp-panel kit-panel" data-intimacy-view={tab}>
        <header className="krp-panel-head">
          <span className="kit-panel-icon"><Icon name="heart" className="h-4 w-4" /></span>
          <h2>{detail ? `我和 ${name} 的友谊` : '我们的友谊'}</h2>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        {query.isLoading ? <div className="krp-panel-body"><p className="kit-quiet" role="status">加载中…</p></div>
          : !detail ? (
            <div className="krp-panel-body">
              <p className="kui-note kui-note--danger" role="alert">没有加载出来：{intimacyErrorText(query.error)}</p>
              <button type="button" className="kui-btn kui-btn--sm" onClick={() => void query.refetch()}>重试</button>
            </div>
          ) : (
            <>
              <Hero detail={detail} />
              <div className="kui-segment kit-tabs" role="tablist" aria-label="友谊">
                <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'is-active' : undefined} onClick={() => setTab('overview')}>概览</button>
                <button type="button" role="tab" aria-selected={tab === 'badges'} className={tab === 'badges' ? 'is-active' : undefined} onClick={() => setTab('badges')}>
                  好友成就<span className="kit-tab-count">{detail.badge_count}/{detail.total_badges}</span>
                  {detail.series.some((series) => series.levels.some((level) => level.is_new)) ? <i className="kit-dot" aria-label="有新解锁的" /> : null}
                </button>
                <button type="button" role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'is-active' : undefined} onClick={() => setTab('rules')}>怎么涨</button>
              </div>
              <div className="krp-panel-body kit-body kui-scroll">
                {tab === 'overview' ? <Overview detail={detail} friendId={friendId} onBadges={() => setTab('badges')} /> : null}
                {tab === 'badges' ? <BadgeWall detail={detail} friendId={friendId} /> : null}
                {tab === 'rules' ? <Rules rules={rules} /> : null}
              </div>
            </>
          )}
      </section>
    </RedPacketLayer>
  );
}

function Hero({ detail }: { detail: FriendIntimacyDetail }): JSX.Element {
  const me = useKukeStore((state) => state.currentUser);
  const { level } = detail;
  const span = level.next_threshold !== null ? level.next_threshold - level.threshold : 0;
  const progress = span > 0 ? Math.min(1, (detail.intimacy - level.threshold) / span) : 1;
  return (
    <div className="kit-hero" data-intimacy-level={level.level}>
      <div className="kit-pair" aria-hidden="true">
        <Avatar user={me} size="lg" />
        <span className="kit-pair-heart"><Icon name="heart" className="h-3.5 w-3.5" /></span>
        <Avatar user={detail.friend} size="lg" />
      </div>
      <div className="kit-hero-main">
        <p className="kit-hero-level">
          <b>{level.name}</b>
          <span className="kit-hero-lv">Lv.{level.level}</span>
          {detail.badge ? <BadgeGlyph icon={detail.badge.icon} tier={detail.badge.tier} size={20} title={detail.badge.name} /> : null}
        </p>
        <div className="kit-bar" role="progressbar" aria-label="亲密度" aria-valuemin={level.threshold} aria-valuemax={level.next_threshold ?? detail.intimacy} aria-valuenow={detail.intimacy}>
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="kit-hero-sub">
          <span>亲密度 <b className="kit-num">{fmt(detail.intimacy)}</b></span>
          <span>{level.next_threshold !== null ? `离「${level.next_name ?? ''}」还差 ${fmt(level.next_threshold - detail.intimacy)}` : '已经是最高等级了'}</span>
        </p>
        <p className="kit-hero-sub">
          {detail.rank !== null ? <span>在你的 {detail.friend_count} 个好友里排第 <b className="kit-num">{detail.rank}</b></span> : null}
          <span>成为好友 {fmt(detail.friend_days)} 天</span>
        </p>
      </div>
    </div>
  );
}

function SourceMeter({ label, value, cap, hint }: { label: string; value: number; cap: number | null; hint?: string }): JSX.Element {
  const full = cap !== null && cap > 0 && value >= cap;
  return (
    <div className={cx('kit-source', full && 'is-full')} title={hint}>
      <span className="kit-source-label">{label}</span>
      <span className="kit-source-value">{cap !== null ? <>+{value}<small>/{cap}</small></> : <>+{value}</>}</span>
      {cap !== null && cap > 0 ? <span className="kit-source-bar"><i style={{ width: `${Math.min(100, Math.round((value / cap) * 100))}%` }} /></span> : null}
    </div>
  );
}

function Overview({ detail, friendId, onBadges }: { detail: FriendIntimacyDetail; friendId: number; onBadges: () => void }): JSX.Element {
  const { today, stats } = detail;
  const history = useIntimacyHistory(friendId, HISTORY_DAYS);
  const days = history.data ?? [];
  const peak = Math.max(1, ...days.map((day) => day.gained));
  const recent = useMemo(() => [...detail.series]
    .flatMap((series) => series.levels.filter((level) => level.unlocked_at).map((level) => ({ series, level })))
    .sort((left, right) => (right.level.unlocked_at ?? '').localeCompare(left.level.unlocked_at ?? ''))
    .slice(0, 6), [detail.series]);
  const capReached = today.counted >= today.cap;

  return (
    <>
      <section className="kit-card" data-intimacy="today">
        <header className="kit-card-head">
          <h3>今天</h3>
          <span className="kit-quiet">{capReached ? '今天已经涨满了，明天再来' : `+${today.counted} / ${today.cap}`}</span>
        </header>
        <div className="kit-sources">
          <SourceMeter label="互相聊天" value={today.chat} cap={today.chat_cap} hint="双方都说话才会涨：只有一个人在说话涨不了" />
          <SourceMeter label="送礼物" value={today.gift} cap={today.gift_cap} />
          <SourceMeter label="连续互动" value={today.streak} cap={null} hint="连续几天都互相聊过天，每天多一点" />
          <SourceMeter label="生日礼物" value={today.birthday} cap={null} hint="在对方生日那天送礼物，有一次大加成，不占每日上限" />
        </div>
        <p className="kit-quiet kit-today-note">今天你发了 {fmt(today.messages_mine)} 条，TA 发了 {fmt(today.messages_theirs)} 条{stats.streak_days > 0 ? ` · 已经连续互动 ${stats.streak_days} 天` : ''}</p>
      </section>

      <section className="kit-card" data-intimacy="history">
        <header className="kit-card-head"><h3>最近 {HISTORY_DAYS} 天</h3></header>
        <div className="kit-spark" role="img" aria-label={`最近 ${HISTORY_DAYS} 天每天涨的亲密度`}>
          {days.map((day) => (
            <span key={day.date} className={cx('kit-spark-col', day.mutual && 'is-mutual')} title={`${day.date.slice(5)}：+${day.gained}`}>
              <i style={{ height: `${Math.max(day.gained > 0 ? 8 : 2, Math.round((day.gained / peak) * 100))}%` }} />
            </span>
          ))}
        </div>
      </section>

      <section className="kit-card" data-intimacy="stats">
        <header className="kit-card-head"><h3>我们的记录</h3></header>
        <dl className="kit-stats">
          <div><dt>互发消息</dt><dd>{fmt(stats.messages_total)}</dd></div>
          <div><dt>互相聊过天</dt><dd>{fmt(stats.mutual_days)} 天</dd></div>
          <div><dt>最长连续</dt><dd>{fmt(stats.best_streak)} 天</dd></div>
          <div><dt>单日最多</dt><dd>{fmt(stats.best_day_messages)} 条</dd></div>
          <div><dt>深夜畅聊</dt><dd>{fmt(stats.night_days)} 天</dd></div>
          <div><dt>清晨问候</dt><dd>{fmt(stats.dawn_days)} 天</dd></div>
          <div><dt>周末相伴</dt><dd>{fmt(stats.weekend_days)} 天</dd></div>
          <div><dt>互送礼物</dt><dd>{fmt(stats.gift_count)} 次</dd></div>
        </dl>
      </section>

      <section className="kit-card" data-intimacy="recent">
        <header className="kit-card-head">
          <h3>最近解锁</h3>
          <button type="button" className="kit-link" onClick={onBadges}>全部成就<Icon name="chevron" className="h-3 w-3" /></button>
        </header>
        {recent.length === 0 ? <p className="kit-quiet">还没有解锁好友成就。互相发 30 条消息，就能拿到第一枚「友谊幸运草」。</p> : (
          <ul className="kit-recent">
            {recent.map(({ series, level }) => (
              <li key={`${series.key}-${level.level}`} className={cx(level.is_new && 'is-new')}>
                <BadgeGlyph icon={series.icon} tier={level.tier} size={40} />
                <span className="kit-recent-name">{level.name}</span>
                <span className="kit-recent-sub">{formatDate(level.unlocked_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function formatDate(value: string | null): string {
  return parseApiDate(value)?.toLocaleDateString('zh-CN') ?? '';
}

function BadgeWall({ detail, friendId }: { detail: FriendIntimacyDetail; friendId: number }): JSX.Element {
  const seen = useMarkBadgesSeen(friendId);
  const setBadge = useSetFriendBadge(friendId);
  const hasNew = detail.series.some((series) => series.levels.some((level) => level.is_new));
  const friendName = getDisplayName(detail.friend, `用户 ${friendId}`);
  const [focus, setFocus] = useState<{ series: SeriesView; level: SeriesLevelView } | null>(null);

  // 打开徽章墙就算看过：「新」标记在这一次展示里留着，下次打开就没了
  useEffect(() => {
    if (hasNew && seen.isIdle) {
      seen.mutate();
    }
  }, [hasNew, seen]);

  const choose = (value: BadgeDisplay): void => {
    if (value !== detail.display) {
      setBadge.mutate(value);
    }
  };

  return (
    <>
      <section className="kit-card kit-display" data-intimacy="display">
        <header className="kit-card-head">
          <h3>挂在 {friendName} 名字旁</h3>
          {detail.badge ? <span className="kit-display-now"><BadgeGlyph icon={detail.badge.icon} tier={detail.badge.tier} size={18} />{detail.badge.name}</span> : <span className="kit-quiet">现在不挂</span>}
        </header>
        <div className="kui-segment kit-display-mode" role="radiogroup" aria-label="挂哪一枚">
          <button type="button" role="radio" aria-checked={detail.display === 'auto'} className={detail.display === 'auto' ? 'is-active' : undefined} disabled={setBadge.isPending} onClick={() => choose('auto')}>自动</button>
          <button type="button" role="radio" aria-checked={detail.display === 'none'} className={detail.display === 'none' ? 'is-active' : undefined} disabled={setBadge.isPending} onClick={() => choose('none')}>不挂</button>
          <button type="button" role="radio" aria-checked={detail.display !== 'auto' && detail.display !== 'none'} className={detail.display !== 'auto' && detail.display !== 'none' ? 'is-active' : undefined} disabled>指定</button>
        </div>
        <p className="kit-quiet">自动挂外框最好的那一枚；点下面任意一个已解锁的系列上的「挂上」可以指定。只有你自己看得到。</p>
        {setBadge.error ? <p className="kui-note kui-note--danger" role="alert">{intimacyErrorText(setBadge.error)}</p> : null}
      </section>

      <div className="kit-wall">
        {detail.series.map((series) => {
          const top = series.levels.find((level) => level.level === series.level) ?? null;
          const shown = top ?? series.levels[0];
          const unlocked = series.level > 0;
          const next = series.levels.find((level) => level.level === series.level + 1) ?? null;
          const span = next?.threshold != null ? next.threshold - (top?.threshold ?? 0) : 0;
          const progress = span > 0 && series.current !== null ? Math.max(0, Math.min(1, (series.current - (top?.threshold ?? 0)) / span)) : 1;
          const isNew = series.levels.some((level) => level.is_new);
          const chosen = detail.display === series.key;
          return (
            <article key={series.key} className={cx('kit-series', unlocked && 'is-unlocked', !series.revealed && 'is-mystery', isNew && 'is-new', chosen && 'is-chosen')} data-series={series.key}>
              <button type="button" className="kit-series-main" onClick={() => setFocus({ series, level: shown })}>
                <BadgeGlyph icon={series.icon} tier={shown.tier} size={52} locked={!unlocked} mystery={!series.revealed} />
                <span className="kit-series-text">
                  <span className="kit-series-name">{series.revealed ? series.name : '隐藏成就'}{isNew ? <span className="kit-new">新</span> : null}</span>
                  <span className="kit-series-level">{unlocked ? top?.name : '未解锁'}<small>{series.level}/{series.max_level}</small></span>
                </span>
              </button>
              {series.revealed && next ? (
                <div className="kit-series-progress" title={conditionText(series, next.threshold)}>
                  <span className="kit-source-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
                  <span className="kit-quiet">{fmt(series.current ?? 0)} / {fmt(next.threshold ?? 0)}</span>
                </div>
              ) : <p className="kit-quiet kit-series-done">{series.revealed ? '这一系列全部解锁了' : conditionText(series, null)}</p>}
              <div className="kit-pips" aria-label="各级">
                {series.levels.map((level) => (
                  <button key={level.level} type="button" className={cx('kit-pip', level.unlocked_at && 'is-on')} title={level.name ?? '？'} onClick={() => setFocus({ series, level })}>
                    <BadgeGlyph icon={series.icon} tier={level.tier} size={22} locked={!level.unlocked_at} mystery={!series.revealed} />
                  </button>
                ))}
              </div>
              {unlocked ? (
                <button type="button" className={cx('kit-wear', chosen && 'is-on')} disabled={setBadge.isPending} onClick={() => choose(chosen ? 'auto' : series.key)}>{chosen ? '已挂上' : '挂上'}</button>
              ) : null}
            </article>
          );
        })}
      </div>

      {focus ? <BadgeFocus series={focus.series} level={focus.level} onClose={() => setFocus(null)} /> : null}
    </>
  );
}

function BadgeFocus({ series, level, onClose }: { series: SeriesView; level: SeriesLevelView; onClose: () => void }): JSX.Element {
  const unlocked = Boolean(level.unlocked_at);
  return (
    <div className="kit-focus" role="dialog" aria-label={level.name ?? '隐藏成就'} onClick={onClose}>
      <div className={cx('kit-focus-card', unlocked && 'is-unlocked')} onClick={(event) => event.stopPropagation()}>
        <BadgeGlyph icon={series.icon} tier={level.tier} size={112} locked={!unlocked} mystery={!series.revealed} className="kit-focus-glyph" />
        <p className="kit-focus-name">{level.name ?? '？？？'}</p>
        <p className="kit-focus-series">{series.revealed ? `${series.name} · 第 ${level.level} 级` : '隐藏成就'}</p>
        <p className="kit-focus-cond">{conditionText(series, level.threshold)}</p>
        <p className="kit-quiet">{unlocked ? `${formatDate(level.unlocked_at)} 解锁` : series.revealed && series.current !== null ? `现在 ${fmt(series.current)}` : '还没有解锁'}</p>
        <button type="button" className="kui-btn kui-btn--sm" onClick={onClose}>好的</button>
      </div>
    </div>
  );
}

function Rules({ rules }: { rules: IntimacyRules | null }): JSX.Element {
  if (!rules) {
    return <p className="kit-quiet">规则没有加载出来。</p>;
  }
  return (
    <>
      <section className="kit-card">
        <header className="kit-card-head"><h3>亲密度怎么涨</h3><span className="kit-quiet">每天最多 +{rules.daily_cap}</span></header>
        <ul className="kit-rules">
          {rules.sources.map((source) => (
            <li key={source.key}>
              <b>{source.label}</b>
              <span>{source.detail}</span>
              <small>{source.cap !== null ? `每天最多 +${source.cap}` : '不占每日上限'}</small>
            </li>
          ))}
        </ul>
        <p className="kit-quiet">只算好友之间的私聊；按北京时间每天零点重新计。只有一个人在说话涨不了，要互相聊。</p>
      </section>
      <section className="kit-card">
        <header className="kit-card-head"><h3>等级</h3></header>
        <ol className="kit-levels">
          {rules.levels.map((level) => <li key={level.level}><span className="kit-hero-lv">Lv.{level.level}</span><b>{level.name}</b><span className="kit-quiet">{fmt(level.threshold)}</span></li>)}
        </ol>
      </section>
    </>
  );
}
