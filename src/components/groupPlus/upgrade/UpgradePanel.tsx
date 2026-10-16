import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { RedPacketLayer } from '@/components/redpacket/RedPacketLayer';
import { openCcwBinding, useRedPacketMotion } from '@/components/redpacket/ui';
import { useRefreshBalance, useShop } from '@/components/shop/data';
import { describeRefreshError, formatCoins } from '@/components/shop/labels';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { GroupPlusInfo, GroupPlusPeriod, GroupPlusPlans, GroupPlusQuote, GroupPlusTier, GroupPlusTierPlan } from '@/types/groupPlus';
import { formatChinaDateTime } from '@/utils/dateTime';
import { openExternalUrl } from '@/utils/openExternalUrl';
import {
  describeGroupPlusError, isGroupStaff, useGroupPlusInfo, useGroupPlusPlans, useGroupPlusRecords, usePurchaseGroupPlus, useQuoteGroupPlus,
  type GroupPlusFailure
} from '../data';
import { CrownGlyph, PlusTierTag } from '../PlusBadge';
import { effectiveTier, formatFileSize, formatLimit, formatRemaining, isPermanentPlus, TIER_META, tierRank } from '../tier';
import type { UpgradeReason } from '../ui';

type PaidTier = Exclude<GroupPlusTier, 'free'>;
type View = 'select' | 'confirm' | 'done' | 'records';

/** 面板顶部那一句话：为什么会打开升级面板 */
const REASON_TEXT: Record<UpgradeReason, string | null> = {
  manual: null,
  members: '群人数已经满了：升级后可以容纳更多成员。',
  featured: '精华消息已经达到上限：升级后可以保存更多精华。',
  files: '群文件需要 Pro 及以上的档位才能使用。',
  messages: '升级后，云端会保留更多聊天记录。'
};

const ACTION_LABEL = { new: '开通', renew: '续期', upgrade: '升级' } as const;

interface Perk {
  icon: IconName;
  label: string;
  value: string;
  /** 这一项在这个档位上是不是「没有」（置灰） */
  off?: boolean;
}

/** 群文件这一项：有空间写空间大小；解锁了但没有空间（Pro）是只能传 24 小时的临时文件 */
function fileValue(plan: Pick<GroupPlusTierPlan, 'file_enabled' | 'file_quota_bytes'>): string {
  if (!plan.file_enabled) {
    return '未解锁';
  }
  return plan.file_quota_bytes ? `${formatFileSize(plan.file_quota_bytes)} 空间` : '临时文件';
}

function perksOf(plan: Pick<GroupPlusTierPlan, 'member_limit' | 'message_limit' | 'file_enabled' | 'file_quota_bytes' | 'file_temp_max_bytes' | 'featured_limit'>): Perk[] {
  // 临时文件那一行：每个解锁了群文件的档位都有（空间用完也能传），旧服务端没有这个字段就不画
  const temp: Perk[] = plan.file_temp_max_bytes === undefined ? [] : [
    { icon: 'clock', label: '临时文件', value: plan.file_temp_max_bytes ? `单个 ${formatFileSize(plan.file_temp_max_bytes)}` : '—', off: !plan.file_temp_max_bytes }
  ];
  return [
    { icon: 'users', label: '群成员上限', value: `${formatLimit(plan.member_limit)} 人` },
    { icon: 'message', label: '云端消息', value: `${formatLimit(plan.message_limit)} 条` },
    { icon: 'folder', label: '群文件', value: fileValue(plan), off: !plan.file_enabled },
    ...temp,
    { icon: 'star', label: '精华上限', value: `${formatLimit(plan.featured_limit)} 条` }
  ];
}

function vibrate(): void {
  // 庆祝时轻震一下；没有这个能力（桌面、部分 WebView）就什么都不做
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(14);
  }
}

/** 到期的那一刻让界面重算（到期降级没有实时事件）。setTimeout 的上限约 24.8 天，更久的到期时间不用设。 */
function useExpiryTick(expiresAt: string | null | undefined): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const until = expiresAt ? Date.parse(expiresAt) : NaN;
    if (!Number.isFinite(until)) {
      return undefined;
    }
    const delay = until - Date.now() + 500;
    if (delay <= 0 || delay > 2_147_000_000) {
      return undefined;
    }
    const timer = window.setTimeout(() => setTick((value) => value + 1), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return tick;
}

function Coins({ value }: { value: number }): JSX.Element {
  return <span className="kgp-coins"><CoinIcon size={14} className="h-3.5 w-3.5" />{formatCoins(value)}</span>;
}

/* ───────── 档位卡片 ───────── */

/** 卡片上档位名下面的一句话 */
const TIER_LINE: Record<PaidTier, string> = {
  pro: '更大的群，更久的聊天记录',
  pro_plus: '专属群空间，资料长久保存',
  max: '为大型社区打造的旗舰档位'
};

function TierCard({ plan, period, plans, current, selected, onSelect }: {
  plan: GroupPlusTierPlan & { key: PaidTier };
  period: GroupPlusPeriod;
  plans: GroupPlusPlans;
  current: boolean;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const months = Math.max(1, Math.round(plans.year_days / plans.month_days));
  const price = period === 'year' ? plan.price_year : plan.price_month;
  const perMonth = period === 'year' ? Math.round(plan.price_year / months) : null;
  return (
    <button type="button" role="radio" aria-checked={selected} className={cx('kgp-card', `kgp-card--${plan.key}`, selected && 'is-active', current && 'is-current')} data-tier={plan.key} onClick={onSelect}>
      <span className="kgp-card-head">
        <span className="kgp-card-name">{plan.key === 'max' ? <CrownGlyph className="kgp-card-crown" /> : null}{TIER_META[plan.key].label}</span>
        {current ? <span className="kgp-card-now">当前</span> : null}
        <span className="kgp-card-radio" aria-hidden="true"><Icon name="check" className="h-3 w-3" /></span>
      </span>
      <span className="kgp-card-line">{TIER_LINE[plan.key]}</span>
      <span className="kgp-card-price">
        <CoinIcon size={18} className="h-[18px] w-[18px]" />
        <b>{formatCoins(price)}</b>
        <small>/ {period === 'year' ? '年' : '月'}</small>
      </span>
      {/* 月付时提示年付的总价，年付时折算到每月：两种周期下这一行都有字，切换时卡片高度不跳 */}
      <span className="kgp-card-sub">{perMonth !== null ? `折合每月 ${formatCoins(perMonth)} 币` : `年付 ${formatCoins(plan.price_year)} 币`}</span>
      <ul className="kgp-perks">
        {perksOf(plan).map((perk) => (
          <li key={perk.label} className={cx(perk.off && 'is-off')}>
            <Icon name={perk.off ? 'lock' : perk.icon} className="h-3.5 w-3.5" />
            <span>{perk.label}</span>
            <b>{perk.value}</b>
          </li>
        ))}
      </ul>
    </button>
  );
}

/** 当前档位的一项用量：名字、数字、一条细进度条（快满了变色） */
function Meter({ label, used, limit, text }: { label: string; used: number; limit: number | null; text?: string }): JSX.Element {
  if (limit === null) {
    // 人数不限（后台给这个群单独设的）：只写人数，没有进度条
    return (
      <span className="kgp-meter">
        <span className="kgp-meter-top"><span>{label}</span><b>{text ?? `${formatLimit(used)} / 不限`}</b></span>
        <span className="kgp-meter-bar" />
      </span>
    );
  }
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  return (
    <span className={cx('kgp-meter', ratio >= 0.9 && 'is-full', ratio >= 0.75 && ratio < 0.9 && 'is-near')}>
      <span className="kgp-meter-top"><span>{label}</span><b>{text ?? `${formatLimit(used)} / ${formatLimit(limit)}`}</b></span>
      <span className="kgp-meter-bar"><i style={{ width: `${Math.max(ratio * 100, used > 0 ? 3 : 0)}%` }} /></span>
    </span>
  );
}

/* ───────── 面板 ───────── */

export interface UpgradePanelProps {
  conversation: Conversation;
  reason: UpgradeReason;
  focusTier?: PaidTier;
  onClose: () => void;
}

export function UpgradePanel({ conversation, reason, focusTier, onClose }: UpgradePanelProps): JSX.Element {
  const conversationId = conversation.id;
  const mobile = useKukeStore((state) => state.layoutMode === 'mobile');
  const motion = useRedPacketMotion();
  const plansQuery = useGroupPlusPlans();
  const infoQuery = useGroupPlusInfo(conversationId);
  const plans = plansQuery.data ?? null;
  const info: GroupPlusInfo | null = infoQuery.data ?? null;
  const shop = useShop().data;
  const refresh = useRefreshBalance();
  const quoteMutation = useQuoteGroupPlus(conversationId);
  const purchase = usePurchaseGroupPlus(conversationId);

  const [view, setView] = useState<View>('select');
  const [period, setPeriod] = useState<GroupPlusPeriod>('month');
  const [picked, setPicked] = useState<PaidTier | null>(focusTier ?? null);
  const [quote, setQuote] = useState<GroupPlusQuote | null>(null);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [failure, setFailure] = useState<GroupPlusFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [donated, setDonated] = useState(false);
  const [bought, setBought] = useState<{ tier: GroupPlusTier; expiresAt: string | null; action: GroupPlusQuote['action'] } | null>(null);
  const [recordsOffset, setRecordsOffset] = useState(0);

  const tick = useExpiryTick(info?.expires_at ?? conversation.plus_expires_at);
  const now = useMemo(() => Date.now(), [tick, info, conversation.plus_tier]);
  const currentTier = effectiveTier(info?.tier ?? conversation.plus_tier ?? 'free', info?.expires_at ?? conversation.plus_expires_at ?? null, now);
  const currentExpires = currentTier === 'free' ? null : info?.expires_at ?? conversation.plus_expires_at ?? null;
  // 永久档位（后台给的）：服务端不卖（409 already_permanent），这里也不给购买入口
  const permanent = isPermanentPlus(currentTier, currentExpires, info?.permanent ?? conversation.plus_permanent);
  const staff = info?.can_purchase ?? isGroupStaff(conversation);
  const canBuy = staff && !permanent;
  const paidPlans = useMemo(() => (plans?.tiers ?? []).filter((plan): plan is GroupPlusTierPlan & { key: PaidTier } => plan.key !== 'free'), [plans]);
  const freePlan = plans?.tiers.find((plan) => plan.key === 'free') ?? null;
  const currentPlan = plans?.tiers.find((plan) => plan.key === currentTier) ?? null;

  // 默认选中：当前档位的上一档（比当前高的第一档）；已经是最高档就停在它自己上（续期）
  const selected: PaidTier | null = useMemo(() => {
    if (picked && paidPlans.some((plan) => plan.key === picked)) {
      return picked;
    }
    const higher = paidPlans.find((plan) => tierRank(plan.key) > tierRank(currentTier));
    return (higher ?? paidPlans[paidPlans.length - 1])?.key ?? null;
  }, [paidPlans, picked, currentTier]);
  const selectedPlan = paidPlans.find((plan) => plan.key === selected) ?? null;
  const downgrade = selected !== null && currentTier !== 'free' && tierRank(selected) < tierRank(currentTier);
  const balanceInfo = shop?.balance ?? null;
  const unbound = (balanceInfo !== null && !balanceInfo.bound) || failure?.code === 'ccw_not_bound';
  const donateUrl = failure?.donateUrl ?? shop?.donate_url ?? '';
  const closed = plans !== null && plans.enabled === false;
  const records = useGroupPlusRecords(conversationId, 10, recordsOffset, view === 'records');

  // 手机上档位横滑：选中的那张居中
  // 刚打开（面板还在升起）时直接跳到位，之后点别的档位才平滑滚过去：两段动画叠在一起，卡片会停在半路
  const listRef = useRef<HTMLDivElement>(null);
  const placedRef = useRef(false);
  useEffect(() => {
    if (!mobile || view !== 'select') {
      placedRef.current = false;
      return;
    }
    const card = listRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!card) {
      return;
    }
    card.scrollIntoView({ inline: 'center', block: 'nearest', behavior: motion && placedRef.current ? 'smooth' : 'auto' });
    placedRef.current = true;
  }, [mobile, view, selected, motion, paidPlans.length]);

  // 绑定后从没核实过的人余额是 0：替他核实一次，免得确认面板一打开就说余额不够
  const triedVerify = useRef(false);
  const neverVerified = Boolean(balanceInfo && balanceInfo.bound && balanceInfo.verified_at === null);
  const refreshBalance = refresh.mutate;
  useEffect(() => {
    if (neverVerified && !triedVerify.current) {
      triedVerify.current = true;
      refreshBalance(undefined, { onError: (error) => setRefreshError(describeRefreshError(error).message) });
    }
  }, [neverVerified, refreshBalance]);

  function requestQuote(tier: PaidTier, nextPeriod: GroupPlusPeriod, message?: string): void {
    setFailure(null);
    setNotice(message ?? null);
    quoteMutation.mutate({ tier, period: nextPeriod }, {
      onSuccess: (result) => {
        setQuote(result);
        setConfirmForfeit(false);
        setView('confirm');
      },
      onError: (error) => setFailure(describeGroupPlusError(error))
    });
  }

  function submitPurchase(): void {
    if (!quote || purchase.isPending) {
      return;
    }
    const needForfeit = quote.action === 'upgrade' && quote.forfeited_seconds > 0;
    if (needForfeit && !confirmForfeit) {
      return;
    }
    setFailure(null);
    setNotice(null);
    const target = { tier: quote.tier as PaidTier, period: quote.period };
    purchase.mutate({ ...target, confirm_forfeit: needForfeit ? true : undefined, expected_price: quote.price }, {
      onSuccess: (result) => {
        setBought({ tier: result.conversation.plus_tier, expiresAt: result.conversation.plus_expires_at, action: quote.action });
        setView('done');
        vibrate();
      },
      onError: (error) => {
        const described = describeGroupPlusError(error);
        if (described.code === 'forfeit_not_confirmed' && described.quote) {
          setQuote(described.quote);
          setConfirmForfeit(false);
          setNotice('这次升级会作废原档位的剩余时间，请先确认。');
          return;
        }
        if (described.code === 'price_changed' || described.code === 'plan_changed') {
          // 价格或档位关系刚变：按新情况重新报价，让用户看清楚再决定
          requestQuote(target.tier, target.period, described.message);
          return;
        }
        setFailure(described);
      }
    });
  }

  function refreshNow(): void {
    setRefreshError(null);
    setFailure(null);
    refresh.mutate(undefined, { onError: (error) => setRefreshError(describeRefreshError(error).message) });
  }

  function retryLoad(): void {
    void plansQuery.refetch();
    void infoQuery.refetch();
  }

  const loading = plansQuery.isLoading || (infoQuery.isLoading && !conversation.plus_tier);
  const loadFailed = plansQuery.isError || infoQuery.isError;
  const locked = purchase.isPending || quoteMutation.isPending;
  const busyClose = purchase.isPending;

  const header = (title: string, back?: () => void): JSX.Element => (
    <header className="krp-panel-head kgp-head">
      {back ? <button type="button" className="kui-icon-btn" aria-label="返回" onClick={back}><Icon name="chevronLeft" className="h-4 w-4" /></button> : <span className="krp-panel-icon kgp-head-icon"><Icon name="sparkles" className="h-4 w-4" /></span>}
      <h2>{title}</h2>
      {view === 'select' && staff && plans ? <button type="button" className="krp-link kgp-link" data-action="plus-records" onClick={() => { setRecordsOffset(0); setView('records'); }}>购买记录</button> : null}
      <button type="button" className="kui-icon-btn" aria-label="关闭" disabled={busyClose} onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
    </header>
  );

  const shell = (children: React.ReactNode, label: string, state: string): JSX.Element => (
    <RedPacketLayer label={label} onClose={onClose} locked={busyClose} className="kgp-layer">
      <section className={cx('krp-panel kgp-panel', mobile && 'is-mobile', !motion && 'is-still')} data-plus-view={view} data-state={state}>
        {children}
      </section>
    </RedPacketLayer>
  );

  /* 还没拿到 / 没有这个功能 / 失败 */
  if (loading) {
    return shell(<>{header('群升级')}<div className="krp-panel-body kgp-skeleton" aria-busy="true"><span /><span /><span /></div></>, '群升级', 'loading');
  }
  if (plansQuery.data === null) {
    return shell(<>{header('群升级')}<div className="krp-panel-body"><p className="krp-empty" data-plus="missing">群升级暂未开放。</p></div></>, '群升级', 'missing');
  }
  if (loadFailed || !plans) {
    return shell(
      <>{header('群升级')}<div className="krp-panel-body"><p className="kui-note kui-note--danger" role="alert">群升级信息加载失败，请稍后重试。</p><button type="button" className="kui-btn kui-btn--sm" onClick={retryLoad}><Icon name="refresh" className="h-3.5 w-3.5" />重试</button></div></>,
      '群升级', 'error'
    );
  }

  /* 购买记录 */
  if (view === 'records') {
    const data = records.data;
    return shell(
      <>
        {header('购买记录', () => setView('select'))}
        <div className="krp-panel-body kui-scroll">
          {records.isLoading ? <p className="krp-empty">加载中…</p> : null}
          {records.isError ? <p className="kui-note kui-note--danger" role="alert">记录加载失败。<button type="button" className="krp-link" onClick={() => void records.refetch()}>重试</button></p> : null}
          {data && data.items.length === 0 ? <p className="krp-empty">还没有购买记录。</p> : null}
          <ul className="kgp-records">
            {data?.items.map((record) => (
              <li key={record.id}>
                <span className="kgp-record-main">
                  <PlusTierTag tier={record.new_tier} />
                  <b>{record.source === 'purchase' ? { new: '开通', renew: '续期', upgrade: '升级', grant: '赠送', revoke: '取消' }[record.action] : record.source === 'grant' ? '后台赠送' : '后台取消'}</b>
                  {record.period ? <span>{record.period === 'year' ? '年付' : '月付'}</span> : null}
                </span>
                <span className="kgp-record-side">
                  {record.amount > 0 ? <Coins value={record.amount} /> : <span>免费</span>}
                  <small>{record.user ? (record.user.nickname || record.user.username) : '后台'} · {formatChinaDateTime(record.created_at)}</small>
                </span>
              </li>
            ))}
          </ul>
        </div>
        {data && data.total > 10 ? (
          <footer className="krp-panel-foot krp-panel-foot--pager">
            <span>{recordsOffset + 1}–{Math.min(recordsOffset + 10, data.total)} / {data.total}</span>
            <button type="button" className="kui-btn kui-btn--sm" disabled={recordsOffset === 0} onClick={() => setRecordsOffset(Math.max(0, recordsOffset - 10))}>上一页</button>
            <button type="button" className="kui-btn kui-btn--sm" disabled={recordsOffset + 10 >= data.total} onClick={() => setRecordsOffset(recordsOffset + 10)}>下一页</button>
          </footer>
        ) : null}
      </>,
      '购买记录', 'records'
    );
  }

  /* 成功 */
  if (view === 'done' && bought) {
    const doneTier = TIER_META[bought.tier];
    return shell(
      <>
        {header('群升级')}
        <div className={cx('krp-panel-body kgp-done', motion && 'is-celebrate')} data-plus="done">
          <span className={cx('kgp-done-medal', `kgp-done-medal--${bought.tier}`)}><Icon name="checkCircle" className="h-7 w-7" /></span>
          <p className="kgp-done-title">已{bought.action === 'renew' ? '续期' : '升级'}为 <PlusTierTag tier={bought.tier} size="md" className="kgp-done-tag" />{doneTier.label}</p>
          <p className="kgp-done-sub">{bought.expiresAt ? `有效期至 ${formatChinaDateTime(bought.expiresAt)}` : null}</p>
          <p className="kgp-done-sub">群成员、云端消息和精华的上限已经生效。</p>
        </div>
        <footer className="krp-panel-foot"><button type="button" className="kgp-btn" onClick={onClose}>完成</button></footer>
      </>,
      '升级成功', 'done'
    );
  }

  /* 确认 */
  if (view === 'confirm' && quote) {
    const target = plans.tiers.find((plan) => plan.key === quote.tier) ?? null;
    const before = currentPlan ?? freePlan;
    const needForfeit = quote.action === 'upgrade' && quote.forfeited_seconds > 0;
    const balanceNow = balanceInfo?.balance ?? quote.balance;
    const after = balanceNow - quote.price;
    const short = after < 0 || failure?.code === 'insufficient_balance';
    const shortfall = Math.max(after < 0 ? -after : 0, failure?.shortfall ?? 0);
    const diffs = target && before ? perksOf(target).map((perk, index) => ({ perk, from: perksOf(before)[index] })).filter(({ perk, from }) => perk.value !== from.value) : [];
    return shell(
      <>
        {header('确认购买', () => { setView('select'); setFailure(null); setNotice(null); })}
        <div className="krp-panel-body kui-scroll">
          <div className={cx('kgp-confirm-hero', `kgp-confirm-hero--${quote.tier}`)}>
            <PlusTierTag tier={quote.tier} size="md" />
            <b>{ACTION_LABEL[quote.action]} · {quote.period === 'year' ? '年付' : '月付'} {quote.days} 天</b>
          </div>

          {diffs.length > 0 ? (
            <ul className={cx('kgp-diff', `kgp-diff--${quote.tier}`)} aria-label="将获得的权益">
              {diffs.map(({ perk, from }) => (
                <li key={perk.label}>
                  <Icon name={perk.icon} className="h-3.5 w-3.5" />
                  <span>{perk.label}</span>
                  <em>{from.value}</em>
                  <Icon name="chevron" className="kgp-diff-arrow h-3 w-3" />
                  <b>{perk.value}</b>
                </li>
              ))}
            </ul>
          ) : <p className="kui-note">档位权益不变，有效期会顺延。</p>}

          <dl className="krp-bill kgp-bill">
            <div><dt>{quote.action === 'renew' ? '原到期时间' : '当前档位'}</dt><dd>{quote.action === 'renew' ? formatChinaDateTime(quote.current_expires_at) : TIER_META[quote.current_tier].label}</dd></div>
            <div><dt>新的到期时间</dt><dd data-plus="new-expire">{formatChinaDateTime(quote.new_expires_at)}</dd></div>
            <div className="is-cost"><dt>将扣除</dt><dd data-plus="price"><Coins value={quote.price} /></dd></div>
            <div><dt>现在的余额</dt><dd>{formatCoins(balanceNow)}</dd></div>
            <div className={cx(after < 0 && 'is-bad')}><dt>买完剩下</dt><dd>{after < 0 ? `不够，还差 ${formatCoins(-after)}` : formatCoins(after)}</dd></div>
          </dl>

          {needForfeit ? (
            <label className={cx('kgp-forfeit', confirmForfeit && 'is-checked')} data-plus="forfeit">
              <input type="checkbox" checked={confirmForfeit} onChange={(event) => setConfirmForfeit(event.target.checked)} />
              <span>
                <b>{quote.forfeit_notice ?? `升级后原来 ${TIER_META[quote.current_tier].label} 剩余的 ${quote.forfeited_days} 天将作废`}</b>
                <small>勾选表示我知道这部分时间不会折算，也不退款。</small>
              </span>
            </label>
          ) : null}

          {notice ? <p className="kui-note kui-note--warn" role="status">{notice}</p> : null}
          {short ? (
            <div className="krp-short" data-plus="short">
              <p className="kui-note kui-note--warn">{shortfall > 0 ? `金币不够，还差 ${formatCoins(shortfall)} 个。` : '金币不够。'}{donated ? '投完了吗？回来点「刷新余额」。' : '去 KukeChat 官方作品页投币，回来点「刷新余额」。'}</p>
              <div className="krp-short-actions">
                <button type="button" className="kui-btn kui-btn--sm" disabled={refresh.isPending} onClick={refreshNow}><Icon name="refresh" className={cx('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} />{refresh.isPending ? '核实中…' : '刷新余额'}</button>
                <button type="button" className="kui-btn kui-btn--sm kui-btn--primary" disabled={!donateUrl} title={donateUrl ? undefined : '暂时不能充值'} onClick={() => { setDonated(true); void openExternalUrl(donateUrl); }}><Icon name="external" className="h-3.5 w-3.5" />去投币</button>
              </div>
            </div>
          ) : null}
          {unbound ? <p className="kui-note kui-note--warn" role="alert">还没有绑定 CCW 账号，绑定之后才能用金币购买。</p> : null}
          {balanceInfo?.stale ? <p className="kui-note kui-note--warn">上次向 CCW 核实没有成功，余额可能不是最新的。</p> : null}
          {refreshError ? <p className="kui-note kui-note--danger" role="alert">{refreshError}</p> : null}
          {failure && failure.code !== 'insufficient_balance' && failure.code !== 'ccw_not_bound' ? <p className="kui-note kui-note--danger" role="alert" data-plus="error">{failure.message}</p> : null}
          <p className="krp-fineprint">群升级是花掉金币换来的，购买后不退款；到期后群里已有的内容不会被删除，只是回到免费档的上限（群文件有 {plans.file_grace_days} 天宽限期）。</p>
        </div>
        <footer className="krp-panel-foot">
          <button type="button" className="kui-btn kui-btn--ghost" disabled={purchase.isPending} onClick={() => { setView('select'); setFailure(null); setNotice(null); }}>返回</button>
          {unbound ? (
            <button type="button" className="kgp-btn" onClick={() => { onClose(); openCcwBinding(); }}>去绑定 CCW 账号</button>
          ) : (
            <button type="button" className="kgp-btn" data-action="confirm-plus" disabled={purchase.isPending || short || (needForfeit && !confirmForfeit)} onClick={submitPurchase}>
              {purchase.isPending ? '正在处理…' : `确认${ACTION_LABEL[quote.action]}（${formatCoins(quote.price)} 币）`}
            </button>
          )}
        </footer>
      </>,
      '确认购买', 'confirm'
    );
  }

  /* 选档位 */
  const reasonText = REASON_TEXT[reason];
  const months = Math.max(1, Math.round(plans.year_days / plans.month_days));
  const saveMonths = Math.max(0, months - plans.year_months_paid);
  const remain = permanent ? null : formatRemaining(currentExpires, now);
  const usage = info?.usage;
  // 人数上限以群自己的为准（后台可能单独设过，含「不限」）；旧服务端没有时用档位的
  const memberLimit = info ? (info.limits.member_limit_unlimited ? null : info.limits.member_limit ?? currentPlan?.member_limit ?? null) : currentPlan?.member_limit ?? null;
  const continueDisabled = locked || !selected || downgrade || closed || !canBuy;
  const selectedPrice = selectedPlan ? (period === 'year' ? selectedPlan.price_year : selectedPlan.price_month) : 0;
  const groupName = conversation.title || '未命名群聊';
  const continueLabel = !selected
    ? '继续'
    : currentTier === 'free'
      ? `开通 ${TIER_META[selected].label}`
      : selected === currentTier
        ? `续期 ${TIER_META[selected].label}`
        : `升级到 ${TIER_META[selected].label}`;
  // 卡片下面最多一条提示：错误 > 不能降级 > 没绑定 > 续期 / 升级说明
  const hint: { tone: 'danger' | 'warn' | 'info'; text: string; data: string } | null = failure && failure.code !== 'ccw_not_bound'
    ? { tone: 'danger', text: failure.message, data: 'error' }
    : downgrade && selected
      ? { tone: 'warn', text: `当前 ${TIER_META[currentTier].label} 还没到期，到期之前不能购买更低的档位。`, data: 'downgrade' }
      : unbound
        ? { tone: 'warn', text: '还没有绑定 CCW 账号，绑定之后才能用金币购买。', data: 'unbound' }
        : selected && currentTier !== 'free' && selected === currentTier
          ? { tone: 'info', text: '购买同档位是续期：在原来的到期时间上顺延。', data: 'renew' }
          : selected && currentTier !== 'free' && tierRank(selected) > tierRank(currentTier)
            ? { tone: 'info', text: '升级立即生效，原档位剩余的时间会作废；确认前会告诉你具体天数。', data: 'upgrade' }
            : null;
  return shell(
    <>
      <header className={cx('kgp-hero', `kgp-hero--${currentTier}`)}>
        <div className="kgp-hero-top">
          <span className="kgp-hero-title">
            <h2>群升级</h2>
            <span className="kgp-hero-group" title={groupName}>{groupName}</span>
          </span>
          {staff ? <button type="button" className="kgp-link" data-action="plus-records" onClick={() => { setRecordsOffset(0); setView('records'); }}>购买记录</button> : null}
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </div>
        <div className="kgp-status" data-plus="status">
          <span className="kgp-status-main">
            <span className="kgp-status-label">当前</span>
            {currentTier === 'free' ? <b className="kgp-status-free">免费版</b> : <PlusTierTag tier={currentTier} size="md" className="kgp-status-tag" />}
            <span className="kgp-status-expire">
              {currentTier === 'free' ? '升级后立即生效' : permanent ? <b data-plus="permanent">永久 · 不会到期</b> : <>{remain ? <>还剩 <b>{remain}</b> · </> : null}{formatChinaDateTime(currentExpires)} 到期</>}
            </span>
          </span>
          {usage && currentPlan ? (
            <span className="kgp-meters">
              <Meter label="成员" used={usage.member_count} limit={memberLimit} />
              <Meter label="精华" used={usage.featured_count} limit={currentPlan.featured_limit} />
              {currentPlan.file_enabled && currentPlan.file_quota_bytes
                ? <Meter label="群文件" used={usage.file_bytes_used} limit={currentPlan.file_quota_bytes} text={`${formatFileSize(usage.file_bytes_used)} / ${formatFileSize(currentPlan.file_quota_bytes)}`} />
                : <span className="kgp-meter is-locked"><span className="kgp-meter-top"><span>群文件</span><b>{currentPlan.file_enabled ? '仅临时文件' : <><Icon name="lock" className="h-3 w-3" />未解锁</>}</b></span><span className="kgp-meter-bar" /></span>}
            </span>
          ) : null}
        </div>
      </header>

      <div className="krp-panel-body kui-scroll kgp-select">
        {reasonText ? <p className="kgp-reason" data-plus="reason"><Icon name="info" className="h-4 w-4" />{reasonText}</p> : null}
        {closed ? <p className="kui-note kui-note--warn" role="status" data-plus="closed">群升级暂时停止购买，已有的档位照常生效。</p> : null}
        {permanent ? <p className="kui-note" role="status" data-plus="permanent-note">这个群已经是永久 {TIER_META[currentTier].label}，不会到期，也不用再购买。下面是各档位的权益。</p> : null}
        {!closed && !canBuy && !permanent ? <p className="kui-note" data-plus="staff-only">只有群主和管理员可以购买群升级，你可以在这里查看各档位的权益。</p> : null}

        <div className="kgp-select-bar">
          <h3>选择档位</h3>
          <div className={cx('kgp-period', period === 'year' && 'is-year')} role="radiogroup" aria-label="付费周期">
            <button type="button" role="radio" aria-checked={period === 'month'} className={cx(period === 'month' && 'is-active')} data-period="month" onClick={() => setPeriod('month')}>月付</button>
            <button type="button" role="radio" aria-checked={period === 'year'} className={cx(period === 'year' && 'is-active')} data-period="year" onClick={() => setPeriod('year')}>
              年付{saveMonths > 0 ? <em>省 {saveMonths} 个月</em> : null}
            </button>
          </div>
        </div>

        <div className="kgp-tiers" role="radiogroup" aria-label="档位" ref={listRef}>
          {paidPlans.map((plan) => (
            <TierCard key={plan.key} plan={plan} plans={plans} period={period} current={plan.key === currentTier} selected={plan.key === selected} onSelect={() => { setPicked(plan.key); setFailure(null); }} />
          ))}
        </div>

        {paidPlans.some((plan) => plan.file_temp_max_bytes !== undefined) ? (
          <p className="kgp-explain" data-plus="temp-files">
            <Icon name="clock" className="h-3.5 w-3.5" />
            <span><b>临时文件</b>保存 24 小时，不占群空间。Pro 群的文件都是临时文件；Pro+ 和 MAX 的群空间用完后，也能继续传临时文件。</span>
          </p>
        ) : null}
        {freePlan ? <p className="kgp-baseline">免费版：{formatLimit(freePlan.member_limit)} 人 · {formatLimit(freePlan.message_limit)} 条云端消息 · 精华 {formatLimit(freePlan.featured_limit)} 条 · 不含群文件</p> : null}
        {hint ? <p className={cx('kgp-hint', `kgp-hint--${hint.tone}`)} role={hint.tone === 'danger' ? 'alert' : undefined} data-plus={hint.data}><Icon name={hint.tone === 'info' ? 'info' : 'alertCircle'} className="h-3.5 w-3.5" />{hint.text}</p> : null}
      </div>
      <footer className="krp-panel-foot kgp-foot">
        {selectedPlan && canBuy && !closed ? (
          <span className="kgp-foot-sum">
            <span>{TIER_META[selectedPlan.key].label} · {period === 'year' ? '年付' : '月付'}</span>
            <b><CoinIcon size={16} className="h-4 w-4" />{formatCoins(selectedPrice)}</b>
          </span>
        ) : <span />}
        <button type="button" className="kui-btn kui-btn--ghost" onClick={onClose}>关闭</button>
        {canBuy ? (
          unbound ? (
            <button type="button" className="kgp-btn" onClick={() => { onClose(); openCcwBinding(); }}>去绑定 CCW 账号</button>
          ) : (
            <button type="button" className="kgp-btn" data-action="plus-continue" disabled={continueDisabled} onClick={() => selected && requestQuote(selected, period)}>
              {quoteMutation.isPending ? '正在报价…' : continueLabel}
            </button>
          )
        ) : null}
      </footer>
    </>,
    '群升级', 'select'
  );
}
