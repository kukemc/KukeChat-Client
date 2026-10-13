import type { HallPost, HallPostKind, HallPostStatus, HallVoteState, JuryHallRules } from '@/types/juryHall';
import { parseApiDate } from '@/utils/dateTime';
import { errorField } from '../data/growth';
import { errorCode } from '../data/queries';
import { slotResetText } from '../growth/labels';
import { formatDateTime, formatRate } from '../labels';

// 议事厅里的文字：帖子类型、状态、提案的算法、服务端错误码对应的提示。

export const HALL_KIND_LABEL: Record<HallPostKind, string> = { announcement: '公告', proposal: '规则提案', discussion: '讨论' };
export const HALL_KIND_SHORT: Record<HallPostKind, string> = { announcement: '公告', proposal: '提案', discussion: '讨论' };

/** 状态标签的文字和颜色。提案的 open 是「表决中」；公告和讨论进行中时不需要状态标签（返回 null）。 */
export function statusTag(post: Pick<HallPost, 'kind' | 'status'>): { text: string; tone: string } | null {
  switch (post.status) {
    case 'open': return post.kind === 'proposal' ? { text: '表决中', tone: 'kui-tag--warn' } : null;
    case 'passed': return { text: '通过 · 待采纳', tone: 'kui-tag--ok' };
    case 'adopted': return { text: '已采纳', tone: 'kui-tag--ok' };
    case 'declined': return { text: '未采纳', tone: '' };
    case 'rejected': return { text: '未通过', tone: '' };
    case 'closed': return { text: '已关闭', tone: '' };
    default: return { text: post.status, tone: '' };
  }
}

/** 帖子被折叠了：服务端这时不给正文（content 为 null），标题是占位文字 */
export function isHiddenPost(post: Pick<HallPost, 'state' | 'content'>): boolean {
  return post.state === 'hidden';
}

export const HIDDEN_POST_TEXT = '这条帖子被多位委员举报，已折叠，等待管理员处理。';

/** 举报成功后的提示。自动折叠只看在任委员的举报，所以这句话只对在任委员说；其他人的举报照常记录，由管理员处理。 */
export function reportDoneText(state: string | undefined, isJuror: boolean, rules: Pick<JuryHallRules, 'auto_hide_reports'>): string {
  if (state === 'hidden') return '举报已提交。这条内容已经被多位委员举报，先折叠起来，等管理员处理。';
  return isJuror ? `举报已提交，管理员会处理。同一条内容被 ${rules.auto_hide_reports} 位在任委员举报后会先折叠起来。` : '举报已提交，管理员会处理。';
}

/** 列表上的状态筛选项。 */
export const HALL_STATUS_FILTERS: Array<{ value: HallPostStatus; label: string }> = [
  { value: 'open', label: '进行中 / 表决中' },
  { value: 'passed', label: '通过 · 待采纳' },
  { value: 'adopted', label: '已采纳' },
  { value: 'declined', label: '未采纳' },
  { value: 'rejected', label: '未通过' },
  { value: 'closed', label: '已关闭' }
];

export interface ProposalMath {
  cast: number;
  /** 赞成率；还没人投时为 null */
  ratio: number | null;
  quorumMet: boolean;
  ratioMet: boolean;
  /** 表决期已过（不管服务端有没有来得及结算） */
  ended: boolean;
}

/** 通过线：赞成票要占到 pass_num / pass_den。ratio 用来画刻度，text 是给人看的写法（「2/3」比四舍五入的百分比准确）。 */
export function passLine(vote: Pick<HallVoteState, 'pass_num' | 'pass_den'>): { ratio: number; text: string } {
  const den = vote.pass_den > 0 ? vote.pass_den : 1;
  return { ratio: Math.min(1, Math.max(0, vote.pass_num / den)), text: `${vote.pass_num}/${den}` };
}

export function proposalMath(vote: HallVoteState, status: HallPostStatus): ProposalMath {
  const cast = vote.yes + vote.no;
  const ratio = cast > 0 ? vote.yes / cast : null;
  const end = parseApiDate(vote.ends_at);
  // 和服务端一样按整数比：yes × pass_den >= (yes + no) × pass_num，恰好压线算通过（不拿小数去比，6 赞成 3 反对才不会被算成差一点）
  return { cast, ratio, quorumMet: cast >= vote.quorum, ratioMet: cast > 0 && vote.yes * vote.pass_den >= cast * vote.pass_num, ended: status !== 'open' || Boolean(end && end.getTime() <= Date.now()) };
}

/** 提案走到哪一步，用一句话说清：表决中看还差什么，结束后看为什么通过 / 没通过。 */
export function proposalSummary(post: Pick<HallPost, 'status'>, vote: HallVoteState): string {
  const math = proposalMath(vote, post.status);
  const rate = formatRate(math.ratio);
  const line = passLine(vote).text;
  switch (post.status) {
    case 'open':
      if (math.ended) return '表决期已结束，正在等待结算。';
      if (!math.quorumMet) return `还差 ${vote.quorum - math.cast} 人参与才算数。`;
      return math.ratioMet ? `参与人数已够，赞成率 ${rate}，按现在的票数会通过。` : `参与人数已够，但赞成率 ${rate} 还没到 ${line}。`;
    case 'passed': return `赞成率 ${rate}，达到了 ${line} 的通过线。等待管理员决定是否采纳。`;
    case 'adopted': return '提案通过表决，管理员已采纳。';
    case 'declined': return '提案通过了表决，但管理员决定不采纳。';
    case 'rejected':
      return !math.quorumMet ? `参与不足：只有 ${math.cast} 人表决，至少需要 ${vote.quorum} 人。` : `赞成不足：赞成率 ${rate}，没有达到 ${line}。`;
    default: return '这个提案已关闭。';
  }
}

/** 多久之前：刚刚 / 12 分钟前 / 3 小时前 / 5 天前，更早的直接写日期。 */
export function formatAgo(value?: string | null): string {
  const date = parseApiDate(value);
  if (!date) return '';
  const minutes = (Date.now() - date.getTime()) / 60_000;
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${Math.floor(minutes)} 分钟前`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前`;
  if (minutes < 30 * 24 * 60) return `${Math.floor(minutes / 1440)} 天前`;
  return formatDateTime(value);
}

/**
 * 服务端下发的守则拆成一条条。「不要讨论未结案件」这一条界面上固定写在最前面（不管服务端的守则里有没有），
 * 所以这里把守则里说同一件事的那一行去掉，免得重复。
 */
export function guidelineLines(rules: JuryHallRules): string[] {
  return rules.guidelines.split(/\n+/).map((line) => line.trim()).filter((line) => line && !line.includes('未结案件'));
}

/** 规则数字写成一句话，发帖页和侧栏都用。 */
export function proposalRuleText(rules: JuryHallRules): string {
  return `提案发出后由在任委员表决 ${rules.vote_days} 天，结束前可以改票。参与表决的人数达到在任委员的 ${formatRate(rules.quorum_ratio)}（至少 ${rules.quorum_min} 人）、且赞成票达到 ${passLine(rules).text}（恰好达到也算），提案通过，交给管理员决定是否采纳；规则本身仍由管理员修改。`;
}

/** 服务端错误 → 给人看的话。认不出的错误码用服务端自带的 message（契约保证可以直接展示）。 */
export function hallErrorText(error: unknown, rules: JuryHallRules, fallback: string, action: 'write' | 'report' = 'write'): string {
  switch (errorCode(error)) {
    case 'not_juror': return '只有在任的风纪委员可以在议事厅发言和表决。';
    case 'tier_required': return '见习委员可以评论和表决；晋升为正式委员后才能发帖。';
    case 'juror_restricted': return '你的账号正在受处罚，期间不能在议事厅发言和表决。';
    case 'vote_closed': return '这个提案的表决已经结束，这一票没有记上。';
    case 'post_locked': return '这个帖子现在不能修改或删除了：提案有人表决后不能再改，出结果后也不能撤回；被折叠的帖子要等管理员处理。';
    case 'post_closed': return '这个帖子已经关闭或被折叠，不能再评论。';
    case 'post_not_found': return '这个帖子已经不存在了，可能刚被作者或管理员删除。';
    case 'comment_not_found': return '这条评论已经不存在了。';
    case 'not_post_author':
    case 'not_comment_author': return '只能修改或删除自己发的内容。';
    case 'content_rejected': return '内容没有通过审核，请修改后再发。';
    case 'hall_rate_limited': {
      // 上限按最近 24 小时滚动，不在零点清零；服务端给了恢复时间就直接说时间
      const reset = slotResetText(errorField(error, 'resets_at'));
      // 举报和发帖 / 评论共用这一个错误码，但不是同一份额度：按正在做的事来说
      if (action === 'report') {
        return `举报得太频繁了，24 小时内的举报次数已经用完。${reset ? `${reset}。` : '最早的一次满 24 小时后恢复一个名额。'}`;
      }
      return `发得太频繁了：每人 24 小时内最多发 ${rules.posts_per_day} 个帖子、${rules.comments_per_day} 条评论。${reset ? `${reset}。` : '最早的一条满 24 小时后恢复一个名额。'}`;
    }
    case 'already_reported': return '你已经举报过了，管理员会处理。';
    case 'cannot_report_own': return '不能举报自己发的内容。';
    case 'invalid_reason': return '请选一个举报理由；选「其他」时请至少写 5 个字说明情况。';
    default: return error instanceof Error && error.message ? error.message : fallback;
  }
}
