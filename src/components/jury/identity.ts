import type { JuryMembership, JuryStatus, JuryTier } from '@/types/jury';
import type { JuryRestriction } from '@/types/juryGrowth';
import { parseApiDate } from '@/utils/dateTime';

/**
 * 当前用户在风纪系统里的身份。所有「能不能看 / 能不能做」的判断都从这里出，
 * 不要在组件里直接比较 status.status 或 status.tier —— 以后规则变了只改这一个文件。
 */
export interface JuryIdentity {
  /** 还没拿到 /jury/me */
  loading: boolean;
  membership: JuryMembership;
  /** 在任委员 */
  isJuror: boolean;
  /** 当过委员（在任、任期已满、被暂停、已卸任），有投票记录可看 */
  everJuror: boolean;
  /** 层级；不是在任委员、或后端还没有层级时为 null */
  tier: JuryTier | null;
  isSenior: boolean;
  /** 现在可以提交申请（含续任） */
  canApply: boolean;
  /** 任期已满，再申请一次就是续任 */
  renewing: boolean;
  /**
   * 当前是否受限：在任委员正在受处罚（禁言 / 封禁）。受限时评审、发观点、点赞、议事厅发言都会被服务端拒绝，
   * 界面应当直接显示受限状态（原因和到期时间在 restriction 里），而不是等提交后报错。回看自己投过的案件不受影响。
   */
  restricted: boolean;
  restriction: JuryRestriction | null;
  /** 弃权过多被暂停发案到什么时候；没有暂停时为 null（二期） */
  cooldownUntil: string | null;
  /** 能不能用练习场：满足申请的四项资格，或者当过委员（二期） */
  canPractice: boolean;
}

const EVER_JUROR: JuryMembership[] = ['active', 'expired', 'suspended', 'retired'];
const CAN_APPLY: JuryMembership[] = ['none', 'rejected', 'expired', 'retired'];

function inFuture(value: string | null | undefined): boolean {
  // parseApiDate：服务端有些时间不带时区（实际是 UTC），直接 Date.parse 会按本地时间算，差 8 小时
  const time = parseApiDate(value)?.getTime() ?? NaN;
  return Number.isFinite(time) && time > Date.now();
}

/** 资深工作台里等我处理的件数（合议 + 复审，/jury/me 的 senior）。不是资深委员、或后端还没有三期时是 0。 */
export function seniorQueueCount(status: JuryStatus | null | undefined): number {
  return status?.status === 'active' && status.senior ? Math.max(0, status.senior.panel ?? 0) + Math.max(0, status.senior.appeals ?? 0) : 0;
}

export function deriveJuryIdentity(status: JuryStatus | null | undefined, loading = false): JuryIdentity {
  const membership = status?.status ?? 'none';
  const isJuror = membership === 'active';
  const tier = isJuror ? status?.tier ?? null : null;
  // 申请待审批 / 被拒绝的人：服务端也会给一个全是 0 的 stats（有成员记录就有），所以要看真的投过票没有，
  // 不能只看 stats 在不在 —— 否则从没当过委员的申请人也会多出一个空的「我的评审」
  const everJuror = EVER_JUROR.includes(membership) || (status?.stats?.votes_total ?? 0) > 0;
  const restriction = isJuror ? status?.restriction ?? null : null;
  return {
    loading: loading && !status,
    membership,
    isJuror,
    everJuror,
    tier,
    isSenior: tier === 'senior',
    canApply: CAN_APPLY.includes(membership),
    renewing: membership === 'expired',
    restricted: restriction !== null,
    restriction,
    cooldownUntil: isJuror && inFuture(status?.cooldown_until) ? status?.cooldown_until ?? null : null,
    canPractice: everJuror || Boolean(status?.eligible)
  };
}
