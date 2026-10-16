import { useMemo } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { DayBars, Meter, type DayBar } from '@/components/jury/widgets/Charts';
import { BubbleStage } from '@/components/shop/BubbleSample';
import { KNOWN_CATEGORIES, useShop } from '@/components/shop/data';
import { DEFAULT_PREVIEW_TEXT } from '@/components/shop/labels';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { LevelBonusRule, LevelBonusState, LevelHistoryDay, LevelMe, LevelRules } from '@/types/level';
import { useLevelHistory } from './data';
import { exchangeLines, formatDayLabel, formatDayPart, formatDays, formatMinutes, formatRank } from './labels';
import { LevelGlyph } from './LevelGlyph';
import { LevelIcons } from './LevelIcons';
import { isLevelIconKey, splitLevel } from './levelMath';

/**
 * 等级页「我的等级」里的几块内容，桌面和移动两套外框共用（样式在 styles/level.css，前缀 klv-）。
 * 进度条、每日的小柱图、条件清单用的是风纪页现成的那几个（jury/widgets/Charts、kjr-req），不另造一套。
 * 规则里的文字和数值全部来自 GET /levels/rules 和 GET /levels/me，这里不写死任何阈值。
 */

function Card({ title, aside, className, children, name }: { title?: string; aside?: React.ReactNode; className?: string; children: React.ReactNode; name: string }): JSX.Element {
  return (
    <section className={cx('klv-card', className)} data-level={name}>
      {title ? <header className="klv-card-head"><h2>{title}</h2>{aside ? <div className="klv-card-aside">{aside}</div> : null}</header> : null}
      {children}
    </section>
  );
}

/** 当前等级：大图标、等级数字、累计活跃天、到下一级的进度，以及连续天数 / 名次 / 注册天数。 */
export function LevelHero({ me, rules, onOpenBoard }: { me: LevelMe; rules: LevelRules; onOpenBoard: () => void }): JSX.Element {
  const span = me.next_level_days !== null ? me.next_level_days - me.level_days : 0;
  const done = Math.max(0, me.active_days - me.level_days);
  const maxed = me.next_level === null || me.next_level_days === null;
  return (
    <Card name="hero" className="klv-hero">
      <div className="klv-hero-main">
        <div className="klv-hero-badge">
          {me.level > 0 ? <LevelIcons level={me.level} variant="full" className="klv-hero-icons" plain /> : <LevelGlyph kind="star" className="klv-hero-ghost" />}
        </div>
        <div className="klv-hero-fig">
          <p className="klv-hero-level" data-level-number={me.level}><small>Lv.</small>{me.level}</p>
          <p className="klv-hero-days">累计活跃 <b>{formatDays(me.active_days)}</b> 天</p>
        </div>
      </div>
      <div className="klv-next" data-level-next={me.next_level ?? 'max'}>
        {maxed ? (
          <p className="klv-next-text"><span>已经是最高等级（Lv.{rules.max_level}）</span></p>
        ) : (
          <>
            <p className="klv-next-text">
              <span>{me.days_to_next !== null ? <>还差 <b>{formatDays(me.days_to_next)}</b> 天升到 Lv.{me.next_level}</> : <>下一级 Lv.{me.next_level}</>}</span>
              <span className="klv-next-range">{formatDays(me.active_days)} / {formatDays(me.next_level_days ?? 0)} 天</span>
            </p>
            <Meter value={done} max={span} label={`到 Lv.${me.next_level} 的进度`} />
          </>
        )}
      </div>
      <dl className="klv-facts">
        <div><dt>连续活跃</dt><dd><b>{me.streak}</b> 天</dd></div>
        <div>
          <dt>全站名次</dt>
          <dd>
            <button type="button" className="klv-facts-link" data-action="open-board" onClick={onOpenBoard} title="看排行榜">
              {typeof me.rank === 'number' && me.rank > 0 ? <>第 <b>{me.rank.toLocaleString('zh-CN')}</b> 名</> : <b>—</b>}
              <Icon name="chevron" className="h-3.5 w-3.5" />
            </button>
          </dd>
        </div>
        <div><dt>注册</dt><dd><b>{me.registered_days.toLocaleString('zh-CN')}</b> 天</dd></div>
      </dl>
    </Card>
  );
}

/** 一项加成今天的状态。规则里有、今天的状态里没有的（服务端没给），按「还没达成」画。 */
function BonusRow({ rule, state, baseEarned }: { rule: LevelBonusRule; state: LevelBonusState | undefined; baseEarned: boolean }): JSX.Element {
  const earned = Boolean(state?.earned);
  const target = state?.target ?? rule.target;
  const current = state?.current;
  const counted = typeof target === 'number' && target > 0 && typeof current === 'number';
  const reached = counted && current >= target;
  let note: string;
  if (earned) {
    note = '已拿到';
  } else if (reached) {
    // 条件满足了却没记上：要么基础活跃天还没拿到，要么今天按更高的一档算了（连续 30 天替代连续 7 天）
    note = baseEarned ? '已达成，今天按更高的一档计入' : '已达成，拿到基础活跃天后生效';
  } else if (counted) {
    note = `还差 ${formatDays(target - current)}`;
  } else {
    // 没有进度可看的加成（签到、绑定 CCW）：基础还没拿到时，条件满足了服务端也不会记，这里分不出来，只说它什么时候才算
    note = baseEarned ? '还没达成' : '拿到基础活跃天后才计入';
  }
  return (
    <li className={cx('kjr-req', earned && 'is-ok')} data-bonus={rule.key} data-earned={earned}>
      <span className="kjr-req-mark">{earned ? <Icon name="check" className="h-3 w-3" /> : null}</span>
      <span className="kjr-req-label">{rule.label}</span>
      <span className="kjr-req-value">+{formatDayPart(state?.days ?? rule.days)}</span>
      {counted ? (
        <span className="kjr-req-bar" role="progressbar" aria-label={rule.label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(current, target)}>
          <i style={{ width: `${Math.min(1, Math.max(0, current / target)) * 100}%` }} />
        </span>
      ) : null}
      {/* 进度只在还没到的时候写成「12 / 20」；到了之后（连续 12 天过了 7 天这一档）只说结果 */}
      <span className="kjr-req-note">{counted && !reached ? `${formatDays(current)} / ${formatDays(target)} · ${note}` : counted ? `${note}（现在 ${formatDays(current)}）` : note}</span>
    </li>
  );
}

/** 今天：在线时长换来的基础活跃天、每项加成拿没拿到、今天已得 / 上限。 */
export function LevelTodayCard({ me, rules }: { me: LevelMe; rules: LevelRules }): JSX.Element | null {
  const today = me.today;
  if (!today) {
    return null;
  }
  // 档位从低到高：30 分钟 0.5、2 小时 1.0
  const tiers = rules.online.slice().sort((left, right) => left.minutes - right.minutes);
  const top = tiers[tiers.length - 1];
  const nextTier = tiers.find((tier) => tier.minutes > today.online_minutes);
  const cap = today.cap > 0 ? today.cap : rules.daily_cap;
  const baseEarned = today.base > 0;
  const states = new Map(today.bonuses.map((bonus) => [bonus.key, bonus]));
  return (
    <Card name="today" title="今天" aside={<span className="klv-today-sum" data-level-today>已得 <b>{formatDayPart(today.earned)}</b> / 上限 {formatDayPart(cap)}</span>}>
      <Meter value={today.earned} max={cap} label="今天已得的活跃天" />
      <div className="klv-online">
        <p className="klv-online-text">
          <span>在线 <b>{formatMinutes(today.online_minutes)}</b></span>
          <span>基础 <b>+{formatDayPart(today.base)}</b></span>
        </p>
        {top ? (
          <>
            <div className="klv-online-bar" role="progressbar" aria-label="今天的在线时长" aria-valuemin={0} aria-valuemax={top.minutes} aria-valuenow={Math.min(today.online_minutes, top.minutes)}>
              <i style={{ width: `${Math.min(1, today.online_minutes / top.minutes) * 100}%` }} />
              {tiers.map((tier) => <b key={tier.minutes} className={today.online_minutes >= tier.minutes ? 'is-on' : undefined} style={{ left: `${Math.min(1, tier.minutes / top.minutes) * 100}%` }} />)}
            </div>
            <div className="klv-online-ticks" aria-hidden="true">
              {tiers.map((tier) => <span key={tier.minutes} className={today.online_minutes >= tier.minutes ? 'is-on' : undefined} style={{ left: `${Math.min(1, tier.minutes / top.minutes) * 100}%` }}>满 {formatMinutes(tier.minutes)} · {formatDayPart(tier.days)}</span>)}
            </div>
          </>
        ) : null}
        <p className="klv-quiet">{nextTier ? `再在线 ${formatMinutes(nextTier.minutes - today.online_minutes)}，基础活跃天变成 ${formatDayPart(nextTier.days)}。` : tiers.length > 0 ? '今天的基础活跃天已经拿满。' : ''}{baseEarned ? '' : '加成要先拿到基础活跃天才生效。'}</p>
      </div>
      {rules.bonuses.length > 0 ? (
        <>
          <h3 className="klv-h">加成</h3>
          <ul className="kjr-reqs2 klv-bonuses">
            {rules.bonuses.map((rule) => <BonusRow key={rule.key} rule={rule} state={states.get(rule.key)} baseEarned={baseEarned} />)}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/** 近 30 天每天拿到的活跃天：柱子里实色的是基础，浅色的是加成。 */
export function LevelHistoryCard({ days = 30 }: { days?: number }): JSX.Element {
  const query = useLevelHistory(days, true);
  const items: LevelHistoryDay[] | undefined = query.data;
  const bars = useMemo<DayBar[]>(() => (items ?? []).map((day) => ({
    title: `${day.date}：${formatDayPart(day.earned)} 天（基础 ${formatDayPart(day.base)} + 加成 ${formatDayPart(day.bonus)}），在线 ${formatMinutes(day.online_minutes)}`,
    value: day.earned,
    part: Math.min(day.base, day.earned)
  })), [items]);
  const total = (items ?? []).reduce((sum, day) => sum + day.earned, 0);
  const activeDays = (items ?? []).filter((day) => day.earned > 0).length;
  return (
    <Card name="history" title={`近 ${days} 天`} aside={items && items.length > 0 ? <span className="klv-meta">共 <b>{formatDays(total)}</b> 天 · {activeDays} 天有活跃</span> : null}>
      {query.isLoading ? <p className="klv-quiet" role="status">加载中…</p>
        : query.error ? <p className="kui-note kui-note--danger" role="alert">每天的记录没有加载出来：{query.error.message}</p>
        : !items || items.length === 0 || total === 0 ? <p className="klv-quiet" data-level-history="empty">近 {days} 天还没有拿到活跃天。在线满一会儿，这里就会长出第一根柱子。</p>
        : (
          <DayBars
            bars={bars}
            label={`近 ${days} 天每天拿到的活跃天，共 ${formatDays(total)} 天`}
            startLabel={formatDayLabel(items[0].date)}
            endLabel={formatDayLabel(items[items.length - 1].date)}
            legend={[{ tone: 'part', text: '基础' }, { tone: 'full', text: '加成' }]}
          />
        )}
    </Card>
  );
}

/** 规则说明：等级怎么算、图标怎么换、几个里程碑。 */
export function LevelRulesCard({ rules, me }: { rules: LevelRules; me: LevelMe | undefined }): JSX.Element {
  const tiers = rules.online.slice().sort((left, right) => left.minutes - right.minutes);
  const exchange = exchangeLines(rules.icons);
  const smallest = rules.icons.filter((rule) => isLevelIconKey(rule.key)).slice().sort((left, right) => left.levels - right.levels)[0];
  return (
    <Card name="rules" title="规则">
      <h3 className="klv-h">等级怎么算</h3>
      <p className="klv-text">
        等级看的是<b>累计活跃天数</b>，升得很慢：{rules.formula ? <>升到 N 级需要 <b>{rules.formula}</b> 天，</> : null}最高 {rules.max_level} 级。
        {rules.daily_cap > 0 ? <>每天最多攒 <b>{formatDayPart(rules.daily_cap)}</b> 个活跃天：</> : null}
        {tiers.length > 0 ? <>当天在线{tiers.map((tier, index) => <span key={tier.minutes}>{index > 0 ? '、' : ''}满 {formatMinutes(tier.minutes)}记 {formatDayPart(tier.days)}</span>)}（基础）</> : null}
        {rules.bonuses.length > 0 ? '，再加上「今天」里列的各项加成。挂着不动只有基础，真的在聊天、签到才拿得满。' : '。'}
      </p>
      <h3 className="klv-h">图标怎么换</h3>
      <ul className="klv-exchange">
        {smallest && isLevelIconKey(smallest.key) ? <li><span>{smallest.levels} 级</span><i>=</i><LevelGlyph kind={smallest.key} /><span>1 个{smallest.label}</span></li> : null}
        {exchange.map((line) => (isLevelIconKey(line.from.key) && isLevelIconKey(line.to.key) ? (
          <li key={line.to.key}><LevelGlyph kind={line.from.key} /><span>{line.count} 个{line.from.label}</span><i>=</i><LevelGlyph kind={line.to.key} /><span>1 个{line.to.label}</span></li>
        ) : null))}
      </ul>
      {rules.milestones.length > 0 ? (
        <>
          <h3 className="klv-h">里程碑</h3>
          <ul className="klv-milestones">
            {rules.milestones.map((milestone) => {
              const reached = me ? me.active_days >= milestone.days : false;
              return (
                <li key={milestone.level} className={reached ? 'is-reached' : undefined} data-milestone={milestone.level}>
                  <span className="klv-milestone-icons">{splitLevel(milestone.level, rules.icons).length > 0 ? <LevelIcons level={milestone.level} variant="full" plain /> : null}</span>
                  <span className="klv-milestone-level">Lv.{milestone.level}</span>
                  <span className="klv-milestone-days">{formatDays(milestone.days)} 天</span>
                  <span className="klv-milestone-state">{!me ? '' : reached ? '已达到' : `还差 ${formatDays(milestone.days - me.active_days)} 天`}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

/** 等级解锁的商店奖励。商店不可用（服务端没有商店、还没拿到）时整块不出现。 */
export function LevelRewardsCard({ level, layout }: { level: number; layout: 'desktop' | 'mobile' }): JSX.Element | null {
  const shop = useShop().data;
  const openShop = useKukeStore((state) => state.openShop);
  const items = useMemo(() => (shop?.items ?? [])
    .filter((item) => item.unlock_level !== null && KNOWN_CATEGORIES.has(item.category) && (!item.delisted || item.owned))
    .sort((left, right) => (left.unlock_level ?? 0) - (right.unlock_level ?? 0)), [shop?.items]);
  if (!shop || items.length === 0) {
    return null;
  }
  return (
    <Card name="rewards" title="等级解锁的装扮" aside={<button type="button" className="kui-link" data-action="open-shop" onClick={openShop}>去商店<Icon name="chevron" className="h-3.5 w-3.5" /></button>}>
      <ul className="klv-rewards">
        {items.map((item) => {
          const need = item.unlock_level ?? 0;
          const owned = item.owned || item.obtainable === 'owned';
          const reached = level >= need;
          return (
            <li key={item.id} className={cx(owned && 'is-owned', !owned && reached && 'is-ready')} data-reward={item.sku} data-reward-state={owned ? 'owned' : reached ? 'ready' : 'locked'}>
              <BubbleStage style={item.style} messages={[{ mine: true, text: item.preview_text.trim() || DEFAULT_PREVIEW_TEXT }]} layout={layout} className="ksp-stage--slot" />
              <span className="klv-reward-name">{item.name}</span>
              <span className="klv-reward-need">Lv.{need} 免费解锁{item.price > 0 ? '，也可以直接买' : ''}</span>
              {owned ? <span className="kui-tag kui-tag--ok">已拥有</span>
                : reached ? <button type="button" className="kui-tag kui-tag--accent klv-reward-go" onClick={openShop}>可以领取</button>
                : <span className="kui-tag">还差 {need - level} 级</span>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** 活跃榜的入口（放在「我的等级」里，桌面和移动都有）：点了去排行榜页，停在「活跃榜」上。 */
export function LevelBoardEntry({ me, onOpenBoard }: { me: LevelMe; onOpenBoard: () => void }): JSX.Element {
  return (
    <button type="button" className="klv-card klv-entry" data-level="board-entry" data-action="open-board" onClick={onOpenBoard}>
      <span className="klv-entry-icon"><Icon name="list" className="h-4 w-4" /></span>
      <span className="klv-entry-main">
        <b>活跃排行榜</b>
        <span>{typeof me.rank === 'number' && me.rank > 0 ? `你现在排在全站${formatRank(me.rank)}` : '总榜看累计活跃天，月榜看本月新增'}</span>
      </span>
      <Icon name="chevron" className="h-4 w-4" />
    </button>
  );
}
