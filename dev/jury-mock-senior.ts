/**
 * 风纪预览页 · 三期的假数据和假接口（docs/jury-v2.md 第 3 节）：资深合议、申诉复审、机器来源的案件、判例、
 * 申诉进度、重复举报与复议。议事厅在 jury-mock-hall.ts。
 *
 * 用法：withPhase3(juryMock) 把一期的假接口包一层 —— 三期的路径在这里处理，
 * 一期接口的响应按契约补上三期新增的字段（/jury/config 的能力、/jury/me 的 senior、案件的 case_origin / precedent …）。
 * seniorScenario.phase3 = 'off' 时什么都不加，用来验证「后端只有一、二期」时界面不发任何三期请求。
 */
import type { ReportRead } from '@/types/api';
import type { JuryCaseDetail, JuryCaseMessage, JuryCaseView, JuryConfig, JuryOpinion, JuryPublicCase, JuryStatus, JuryTally, JuryVoteItem, JuryVotesPage } from '@/types/jury';
import type { AppealMineItem, AppealOutcome, AppealReviewView, AppealVote, PanelCaseView, PanelVote, Precedent, PrecedentDetail } from '@/types/jurySenior';
import type { ModerationStanding, ViolationRead } from '@/types/moderation';
import { requestLog, scenario } from './jury-mock';
import { hallMock, hallRules } from './jury-mock-hall';
import { json, type MockHandler } from './mocks/types';

export interface SeniorScenario {
  /** 后端有没有三期的能力。off = 只有一、二期 */
  phase3: 'on' | 'off';
  /** 合议队列的下一件：三种来到合议的原因、机器来源、队列为空 */
  panel: 'no_consensus' | 'need_context' | 'timeout' | 'machine' | 'empty';
  /** 我投完合议票之后案件是否定案 */
  panelAfter: 'open' | 'closed';
  /** 复审队列的下一件：委员定案的消息 / 机器处罚 / 合议定案的动态 / 举报人复议 / 队列为空 */
  appeal: 'jury' | 'machine' | 'post' | 'reconsider' | 'empty';
  /** 我投完复审票之后：还没出结果 / 出结果（结果就是我投的那一项） */
  appealAfter: 'open' | 'settled';
  /** switches.appeals */
  appealsSwitch: 'on' | 'off';
  /** 在任资深委员够不够 3 位 */
  seniors: 'enough' | 'few';
  /** 评审台的案件来源 */
  caseOrigin: 'report' | 'machine';
  precedents: 'many' | 'empty';
  /** 设置里「处罚与申诉」的处罚记录：没有 / 申诉的各个阶段 */
  penalties: 'none' | 'stages';
  /** capabilities 里有没有 reconsider */
  reconsider: 'on' | 'off';
  /** 再次举报已经认定不违规的内容 */
  report: 'ok' | 'reviewed';
  /** 在任委员正在受处罚 */
  restricted: 'no' | 'muted';
  /** 下一张合议票被拒绝（只拒一次）：已经投过 / 已经回避过 */
  panelError: 'none' | 'already_voted' | 'already_recused';
  /** 下一张复审票被拒绝（只拒一次） */
  appealError: 'none' | 'review_closed' | 'already_voted' | 'review_not_found' | 'invalid_vote';
  /** 处罚记录里那条「资深复审中」的申诉被转给了管理员（appeal_escalated） */
  escalated: 'no' | 'yes';
}

export const seniorScenario: SeniorScenario = {
  phase3: 'on', panel: 'no_consensus', panelAfter: 'open', appeal: 'jury', appealAfter: 'open', appealsSwitch: 'on', seniors: 'enough',
  caseOrigin: 'report', precedents: 'many', penalties: 'stages', reconsider: 'on', report: 'ok', restricted: 'no',
  panelError: 'none', appealError: 'none', escalated: 'no'
};

/** 预览页控制条上的选项：键是 seniorScenario 的键，地址参数同名 */
export const SENIOR_OPTIONS: { [Key in keyof SeniorScenario]: Array<SeniorScenario[Key]> } = {
  phase3: ['on', 'off'], panel: ['no_consensus', 'need_context', 'timeout', 'machine', 'empty'], panelAfter: ['open', 'closed'],
  appeal: ['jury', 'machine', 'post', 'reconsider', 'empty'], appealAfter: ['open', 'settled'], appealsSwitch: ['on', 'off'], seniors: ['enough', 'few'],
  caseOrigin: ['report', 'machine'], precedents: ['many', 'empty'], penalties: ['none', 'stages'], reconsider: ['on', 'off'], report: ['ok', 'reviewed'], restricted: ['no', 'muted'],
  panelError: ['none', 'already_voted', 'already_recused'], appealError: ['none', 'review_closed', 'already_voted', 'review_not_found', 'invalid_vote'], escalated: ['no', 'yes']
};
export const SENIOR_LABELS: Record<keyof SeniorScenario, string> = {
  phase3: '三期', panel: '合议', panelAfter: '合议后', appeal: '复审', appealAfter: '复审后', appealsSwitch: '申诉开关', seniors: '资深人数',
  caseOrigin: '案件来源', precedents: '判例', penalties: '处罚记录', reconsider: '复议', report: '再次举报', restricted: '受限',
  panelError: '合议票被拒', appealError: '复审票被拒', escalated: '申诉转管理员'
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
const later = (ms: number): string => new Date(Date.now() + ms).toISOString();
const error = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response => json({ detail: { code, message, ...extra } }, status);
const notFound = (): Response => json({ detail: 'Not Found' }, 404);

const isSenior = (): boolean => scenario.identity === 'active' && scenario.tier === 'senior';
const phase3On = (): boolean => seniorScenario.phase3 === 'on' && scenario.backend !== 'legacy';

// ───────────────────────── 配置 ─────────────────────────

const PHASE3_CAPABILITIES = ['panel', 'appeal_review', 'machine_cases', 'precedents', 'hall'];

function patchConfig(config: JuryConfig): JuryConfig {
  return {
    ...config,
    capabilities: [...config.capabilities, ...PHASE3_CAPABILITIES, ...(seniorScenario.reconsider === 'on' ? ['reconsider'] : [])],
    switches: { ...config.switches, appeals: seniorScenario.appealsSwitch === 'on', machine_review: seniorScenario.caseOrigin === 'machine' },
    panel: { seats: 3, consensus_votes: 2, timeout_hours: 48 },
    appeals: { seats: 3, consensus_votes: 2, timeout_hours: 72 },
    hall: hallRules,
    ...(seniorScenario.reconsider === 'on' ? { reconsider: { window_days: 7, text_min: 10 } } : {})
  };
}

// ───────────────────────── 合议 ─────────────────────────

function line(offset: number, speaker: string, content: string | null): JuryCaseMessage {
  return { speaker, is_target: offset === 0, type: 'text', content, images: [], created_at: new Date(Date.now() - 80 * HOUR + offset * 55_000).toISOString(), offset };
}

const PROMO_TALK: JuryCaseMessage[] = [
  line(-6, '成员A', '今天作品区有更新吗'),
  line(-5, '成员B', '有，首页那个跑酷做得不错'),
  line(-4, '被举报人', '来玩我的新作品《像素跑酷 3》，求点赞求收藏'),
  line(-3, '成员A', '上午不是发过一遍了吗'),
  line(-2, '成员C', '我去看了，第二关有点难'),
  line(-1, '被举报人', '难才好玩'),
  line(0, '被举报人', '来玩我的新作品《像素跑酷 3》，求点赞求收藏！！点赞过 100 我就更新下一关，不点的都是没眼光'),
  line(1, '成员C', '一天发三遍了'),
  line(2, '被举报人', '群里不是可以宣传作品吗'),
  line(3, '成员B', '可以宣传，但别刷，也别说别人没眼光'),
  line(4, '成员A', '+1'),
  line(5, '被举报人', '行吧')
];

const SHORT_TALK: JuryCaseMessage[] = [
  line(-1, '成员A', '你昨天那个怎么回事'),
  line(0, '被举报人', '你自己心里清楚，别装'),
  line(1, '成员A', '？')
];

let nextOpinionId = 9000;

function opinion(alias: string, content: string, extra: Partial<JuryOpinion> = {}): JuryOpinion {
  nextOpinionId += 1;
  return { id: nextOpinionId, parent_id: null, alias, tier: 'trainee', vote: null, content, state: 'visible', is_note: true, mine: false, like_count: 0, liked: false, reported: false, created_at: ago(30 * HOUR), reply_to_alias: null, replies: [], ...extra };
}

function originOpinions(reason: SeniorScenario['panel']): JuryOpinion[] {
  if (reason === 'timeout') {
    return [opinion('委员 A', '语气不好，但只有一句，我觉得不到违规的程度。', { vote: 'none' })];
  }
  if (reason === 'need_context') {
    return [
      opinion('委员 A', '只有三条消息，看不出「昨天那个」指什么，没法判断是不是在威胁。', { vote: 'need_context', tier: 'regular' }),
      opinion('委员 C', '「别装」算不上辱骂。但如果前面有过节，性质就不一样了，现有内容不够。', { vote: 'need_context' }),
      opinion('委员 D', '就这一句的话不违规。', { vote: 'none', like_count: 1 })
    ];
  }
  const first = opinion('委员 A', '一天三遍同样的话，算刷屏。不过宣传自己的作品本身是群里允许的，所以我给轻微。', { vote: 'l1', tier: 'regular', like_count: 2 });
  first.replies = [opinion('委员 D', '问题不在次数，在「不点的都是没眼光」，这句是在贬低别人。', { parent_id: first.id, vote: 'l2', is_note: false, created_at: ago(28 * HOUR) })];
  return [
    first,
    opinion('委员 C', '群规允许宣传作品，三遍不算多。最后那句是玩笑话的口气，没有针对具体的人，不违规。', { vote: 'none', like_count: 1, created_at: ago(29 * HOUR) }),
    opinion('委员 D', '求赞求收藏加上「点赞过 100 就更新」，是在拿更新换数据，我认为属于垃圾广告，一般。', { vote: 'l2', created_at: ago(28.5 * HOUR) }),
    opinion('委员 E', '同意委员 C，被提醒之后他也说了「行吧」，没有继续。', { vote: 'none', tier: 'senior', created_at: ago(27 * HOUR) }),
    opinion('委员 F', '重复发相同内容就是刷屏，规则里没有「宣传作品可以例外」。轻微。', { vote: 'l1', created_at: ago(26 * HOUR) })
  ];
}

const ORIGIN_TALLY: Record<Exclude<SeniorScenario['panel'], 'empty'>, JuryTally> = {
  no_consensus: { none: 2, l1: 2, l2: 1, l3: 0, abstain: 0, need_context: 0 },
  need_context: { none: 1, l1: 0, l2: 0, l3: 0, abstain: 0, need_context: 2 },
  timeout: { none: 1, l1: 0, l2: 0, l3: 0, abstain: 1, need_context: 0 },
  machine: { none: 2, l1: 1, l2: 2, l3: 0, abstain: 0, need_context: 0 }
};

let nextPanelId = 1244;

function panelView(): PanelCaseView {
  const kind = seniorScenario.panel === 'empty' ? 'no_consensus' : seniorScenario.panel;
  const machine = kind === 'machine';
  return {
    case_id: nextPanelId,
    kind: 'message',
    reasons: machine ? [{ reason: '机器筛查 · 辱骂骚扰', count: 1 }] : kind === 'need_context' ? [{ reason: '辱骂骚扰', count: 1 }] : [{ reason: '刷屏灌水', count: 2 }, { reason: '垃圾广告', count: 1 }],
    report_count: machine ? 0 : kind === 'need_context' ? 1 : 3,
    messages: kind === 'need_context' ? SHORT_TALK : PROMO_TALK,
    post: null,
    assigned_at: ago(40 * 60_000),
    expires_at: later(31 * HOUR),
    suggested_category: kind === 'need_context' || machine ? 'harassment' : 'flooding',
    case_origin: machine ? 'machine' : 'report',
    origin: { reason: machine ? 'no_consensus' : kind, tally: ORIGIN_TALLY[kind], opinions: originOpinions(kind) },
    panel: { seats: 3, votes_cast: seniorScenario.panelAfter === 'closed' ? 1 : 0, expires_at: later(31 * HOUR) }
  };
}

interface PanelVoted {
  view: PanelCaseView;
  vote: PanelVote;
  note: string | null;
  votedAt: string;
  closed: boolean;
  opinions: JuryOpinion[];
}

const panelVoted = new Map<number, PanelVoted>();

function panelDetail(item: PanelVoted): JuryCaseDetail {
  const violation = item.vote !== 'none';
  const level = violation ? Number(item.vote.slice(1)) : null;
  const { origin, panel: _panel, ...view } = item.view;
  return {
    ...view,
    content_available: true,
    my_vote: { vote: item.vote, note: item.note, voted_at: item.votedAt, alias: '合议委员 B', agreed: item.closed ? true : null, points: item.closed ? 15 : 0 },
    stage: item.closed ? 'closed' : 'panel',
    votes_cast: (['none', 'l1', 'l2', 'l3'] as const).reduce((sum, key) => sum + (origin.tally?.[key] ?? 0), 0),
    tally: item.closed ? { none: origin.tally?.none ?? 0, l1: origin.tally?.l1 ?? 0, l2: origin.tally?.l2 ?? 0, l3: origin.tally?.l3 ?? 0, abstain: origin.tally?.abstain ?? 0, need_context: origin.tally?.need_context ?? 0, panel: { none: violation ? 0 : 2, l1: 0, l2: 0, l3: 0, ...(violation ? { [item.vote]: 2 } : {}) } } : null,
    verdict: item.closed ? { outcome: violation ? 'violation' : 'clean', source: 'panel', category: violation ? 'flooding' : null, category_label: violation ? '刷屏灌水' : null, level, closed_at: item.votedAt, hours: 81.5, overturned: false, overturn_note: null } : null,
    is_quality_check: false,
    opinions_enabled: true,
    opinion_count: item.opinions.reduce((sum, root) => sum + 1 + root.replies.length, 0)
  };
}

// ───────────────────────── 申诉复审 ─────────────────────────

let nextReviewId = 31;

function appealView(): AppealReviewView {
  const kind = seniorScenario.appeal === 'empty' ? 'jury' : seniorScenario.appeal;
  const base = { review_id: nextReviewId, expires_at: later(50 * HOUR), seats: 3, votes_cast: seniorScenario.appealAfter === 'settled' ? 1 : 0 };
  const origin = { tally: { none: 1, l1: 0, l2: 3, l3: 0, abstain: 1 }, opinions: originOpinions('no_consensus').slice(0, 3) };
  if (kind === 'reconsider') {
    return {
      ...base, type: 'reconsider', kind: 'message', source: null, category: null, category_label: null, level: null, penalty: null, messages: PROMO_TALK, post: null, content: null,
      origin: { tally: { none: 3, l1: 1, l2: 0, l3: 0, abstain: 0 }, opinions: originOpinions('no_consensus').slice(1, 4) },
      appeal_text: null, appealed_at: null,
      reconsider_text: '这个人不是第一次了，上周也是一天刷好几遍，被人说了就骂别人没眼光。只看这一条当然觉得没什么，但他是惯犯，希望重新看一下。',
      requested_at: ago(9 * HOUR), verdict: { outcome: 'clean', source: 'jury', closed_at: ago(2 * DAY) }
    };
  }
  if (kind === 'machine') {
    return {
      ...base, type: 'appeal', kind: 'message', source: 'machine', category: 'advertising', category_label: '垃圾广告', level: 1, penalty: { kind: 'notice', hours: null }, messages: [], post: null,
      content: { text: '有没有人一起组队做游戏，我出美术，加我好友私聊，长期有效', image_count: 0 }, origin: null,
      appeal_text: '我只是在找人一起做作品，没有卖东西也没有发链接，这也算广告吗？', appealed_at: ago(5 * HOUR)
    };
  }
  if (kind === 'post') {
    return {
      ...base, type: 'appeal', kind: 'post', source: 'panel', category: 'fraud', category_label: '诈骗或钓鱼', level: 3, penalty: { kind: 'ban', hours: 72 }, messages: [],
      post: { content: '【免费领会员】扫码进群，群主每天发 10 个会员兑换码，先到先得！\n进群后把这条动态转发到三个群，截图发给群主就能领。', image_urls: [], created_at: ago(4 * DAY) },
      content: null, origin: { tally: { none: 0, l1: 1, l2: 2, l3: 2, abstain: 0 }, opinions: originOpinions('no_consensus').slice(2, 4) },
      appeal_text: `这是我们自己小组内部的活动，兑换码是我自己买的，真的会发。${'我可以提供购买记录截图。'.repeat(8)}封三天太重了，我还有作品要在周末前交。`, appealed_at: ago(20 * HOUR)
    };
  }
  return {
    ...base, type: 'appeal', kind: 'message', source: 'jury', category: 'harassment', category_label: '辱骂骚扰', level: 2, penalty: { kind: 'mute', hours: 24 }, messages: PROMO_TALK, post: null, content: null, origin,
    appeal_text: '我说「没眼光」是开玩笑的，群里的人都知道我平时就这么说话。被提醒之后我马上就停了，没有再发。禁言一天我觉得太重了。', appealed_at: ago(7 * HOUR)
  };
}

const appealMine: AppealMineItem[] = Array.from({ length: 9 }, (_, index) => {
  const reconsider = index === 3;
  const outcome: AppealOutcome | null = index === 0 ? null : reconsider ? 'overturn' : (['uphold', 'reduce', 'revoke', 'uphold'] as AppealOutcome[])[index % 4];
  const myVote: AppealVote = reconsider ? 'overturn' : (['uphold', 'uphold', 'revoke', 'uphold', 'reduce'] as AppealVote[])[index % 5];
  return {
    review_id: 30 - index, type: reconsider ? 'reconsider' : 'appeal', kind: index % 3 === 1 ? 'post' : 'message', source: reconsider ? null : (['jury', 'machine', 'panel'] as const)[index % 3],
    category_label: reconsider ? null : ['辱骂骚扰', '垃圾广告', '刷屏灌水'][index % 3], level: reconsider ? null : (index % 3) + 1, penalty: reconsider ? null : { kind: index % 2 ? 'mute' : 'ban', hours: index % 2 ? 24 : 72 },
    my_vote: myVote, voted_at: ago(index * 2 * DAY + 3 * HOUR), outcome, settled_at: outcome ? ago(index * 2 * DAY) : null
  };
});

// ───────────────────────── 判例 ─────────────────────────

const PRECEDENT_SEED: Array<Pick<Precedent, 'case_id' | 'title' | 'kind' | 'outcome' | 'category' | 'category_label' | 'level' | 'by' | 'mine'> & { summary: string }> = [
  { case_id: 1269, title: '宣传自己的作品可以，同样的话一天发三遍就是刷屏', kind: 'message', outcome: 'violation', category: 'flooding', category_label: '刷屏灌水', level: 1, by: 'senior', mine: true, summary: '群里允许宣传自己的作品，但「允许宣传」不等于可以反复发同一段话。\n判断刷屏看的是重复和打断：同一段内容在短时间内出现三次及以上，且中间有人明确表示已经看到，就构成刷屏。\n情节轻微（没有带链接、被提醒后停止）的按 L1 处理；被提醒后继续的，上调一级。' },
  { case_id: 1180, title: '「免费领」加「先转发再领」，按诈骗或钓鱼处理', kind: 'post', outcome: 'violation', category: 'fraud', category_label: '诈骗或钓鱼', level: 3, by: 'admin', mine: false, summary: '以「免费领取」为名，要求先转发、先加群、先私聊才能领的，无论最后是否真的发放，都按诈骗或钓鱼处理：它利用的是其他用户的信任来扩散。\n真正的福利活动不需要把转发作为领取条件。' },
  // 隐私类（和色情、涉未成年一样）不能成为判例，所以这里没有那一类
  { case_id: 1168, title: '被提醒之后还继续刷屏的，上调一级', kind: 'message', outcome: 'violation', category: 'flooding', category_label: '刷屏灌水', level: 2, by: 'senior', mine: false, summary: '第一次刷屏、被提醒后立刻停止的，按 L1。\n有人明确提醒之后仍然继续发同样内容的，说明不是无心之失，上调到 L2。\n「提醒」指的是群里有人直接对他说过，不要求是管理员。' },
  { case_id: 1164, title: '新人问基础问题被嘲讽：只有一句重话的，按轻微处理', kind: 'message', outcome: 'violation', category: 'harassment', category_label: '辱骂骚扰', level: 1, by: 'senior', mine: false, summary: '「这都不会」「回去重读小学」这类话针对的是人而不是问题，属于辱骂骚扰。\n只有一句、没有脏话、没有持续纠缠的，按 L1；连续多条或在对方表示不适后继续的，按 L2。' },
  { case_id: 1156, title: '语气冲不等于辱骂：没有针对具体的人就不违规', kind: 'message', outcome: 'clean', category: null, category_label: null, level: null, by: 'senior', mine: false, summary: '「这代码写得真烂」针对的是作品，不是人。批评可以难听，只要没有人身攻击、没有持续纠缠，就不构成违规。\n举报人感到不舒服是真实的，但规则保护的是不被攻击，不是不被批评。' },
  { case_id: 1148, title: '找人组队不是广告，带收费信息才是', kind: 'message', outcome: 'clean', category: null, category_label: null, level: null, by: 'admin', mine: false, summary: '在群里找人一起做作品、招募美术或程序，是社区的正常交流。\n出现价格、付款方式、站外店铺链接，或者同一段招募在多个群反复发的，才按垃圾广告处理。' },
  ...Array.from({ length: 9 }, (_, index) => ({
    case_id: 905 - index * 7, title: [`同一张表情连发十次以上算刷屏`, '在评论区贴站外群号', '冒充管理员要求别人交出密码', `长标题测试：${'这是一个非常非常长的判例标题用来看看换行和截断'.repeat(2)}`, '给别人的作品刷一星并留言嘲讽', '转发未经证实的「封号名单」', '用谐音字绕过屏蔽词骂人', '在群里直播揭别人的黑历史', '反复 @ 同一个人要求回复'][index],
    kind: (index % 3 === 1 ? 'post' : 'message') as Precedent['kind'], outcome: 'violation' as const, category: ['flooding', 'advertising', 'fraud', 'harassment'][index % 4], category_label: ['刷屏灌水', '垃圾广告', '诈骗或钓鱼', '辱骂骚扰'][index % 4], level: (index % 3) + 1,
    by: (index % 4 === 0 ? 'admin' : 'senior') as Precedent['by'], mine: false, summary: `裁判要旨示例 ${index + 1}。${'判断时先看内容针对的是人还是事，再看是否重复、是否在被提醒后继续。'.repeat((index % 3) + 1)}`
  }))
];

let nextPrecedentId = 100;
const precedents: Precedent[] = PRECEDENT_SEED.map((item, index) => ({ ...item, id: 20 - index, created_at: ago((index * 3 + 1) * DAY) }));

const visiblePrecedents = (): Precedent[] => (seniorScenario.precedents === 'empty' ? precedents.filter((item) => item.id >= 100) : precedents);
const precedentForCase = (caseId: number): Precedent | null => visiblePrecedents().find((item) => item.case_id === caseId) ?? null;

function precedentDetail(item: Precedent): PrecedentDetail {
  // #17 当作「案件还没进公示栏」的判例（定案不足公示等待期）：全站可见的那部分没有内容，原因是 unpublished
  const unpublished = item.id === 17;
  const hasContent = !unpublished && item.kind === 'post' && item.outcome === 'violation';
  const juror = scenario.identity === 'active';
  return {
    ...item,
    content: hasContent ? { text: '【免费领会员】扫码进群，群主每天发 10 个会员兑换码，先到先得！\n进群后把这条动态转发到三个群，截图发给群主就能领。', image_count: 1, created_at: ago(20 * DAY) } : null,
    content_hidden_reason: hasContent ? null : unpublished ? 'unpublished' : item.outcome === 'clean' ? 'clean' : item.kind === 'message' ? 'group_message' : 'sensitive',
    case: juror ? (item.kind === 'post' ? { messages: [], post: { content: '【免费领会员】扫码进群，群主每天发 10 个会员兑换码，先到先得！\n进群后把这条动态转发到三个群，截图发给群主就能领。', image_urls: [], created_at: ago(20 * DAY) } } : { messages: PROMO_TALK, post: null }) : null
  };
}

/** 案件详情上三期新增的字段：来源、判例、能不能标为判例 */
function patchDetail(detail: JuryCaseDetail): JuryCaseDetail {
  const precedent = precedentForCase(detail.case_id);
  const eligible = isSenior() && detail.stage === 'closed' && !detail.is_quality_check && !detail.verdict?.overturned && !['sexual', 'privacy'].includes(detail.verdict?.category ?? '');
  // 「我的评审」里的 #1251：没人举报的机器案件，超时没凑够票、也没有合议可用，以「未作处理」结案。
  // 服务端给的是 clean + auto，我的票不计一致率（agreed 为 null），没有票数分布，也不能标为判例
  if (detail.case_id === UNHANDLED_CASE_ID && detail.verdict) {
    return {
      ...detail, case_origin: 'machine', report_count: 0, reasons: [{ reason: '机器筛查 · 辱骂骚扰', count: 1 }],
      my_vote: { ...detail.my_vote, agreed: null, points: 0 }, tally: null,
      verdict: { ...detail.verdict, outcome: 'clean', source: 'auto', category: null, category_label: null, level: null, overturned: false, overturn_note: null },
      precedent: null, can_mark_precedent: false
    };
  }
  return {
    ...detail,
    case_origin: detail.case_origin ?? 'report',
    precedent: precedent ? { id: precedent.id, title: precedent.title, mine: Boolean(precedent.mine) } : null,
    can_mark_precedent: eligible && !precedent
  };
}

const UNHANDLED_CASE_ID = 1251;

// ───────────────────────── 申诉进度（设置 · 处罚与申诉） ─────────────────────────

function violation(id: number, extra: Partial<ViolationRead>): ViolationRead {
  return {
    id, category: 'harassment', category_label: '辱骂骚扰', level: 2, points: 3, points_total: 3, source: 'jury', target_type: 'message', summary: '这都不会？回去重读小学吧，别在群里丢人了', status: 'active',
    penalty_kind: 'mute', penalty_ends_at: later(20 * HOUR), appeal_status: 'none', can_appeal: false, created_at: ago(id * 9 * HOUR), expires_at: later(80 * DAY), ...extra
  };
}

const violations: ViolationRead[] = [
  violation(1, { can_appeal: true, summary: '来玩我的新作品，求点赞求收藏！！不点的都是没眼光', category_label: '刷屏灌水', level: 1, points: 1, penalty_kind: 'notice', penalty_ends_at: null }),
  violation(2, { appeal_status: 'pending', appeal_stage: 'senior', appeal_result: null, appeal_decided_by: null }),
  violation(3, { appeal_status: 'pending', appeal_stage: 'admin', appeal_result: null, appeal_decided_by: null, source: 'admin', penalty_kind: 'ban', penalty_ends_at: later(9 * DAY), level: 3, points: 6, category_label: '诈骗或钓鱼', summary: '【免费领会员】扫码进群……' }),
  violation(4, { appeal_status: 'accepted', appeal_stage: null, appeal_result: 'revoked', appeal_decided_by: 'senior', status: 'revoked', points: 0, source: 'auto', category_label: '垃圾广告', level: 1, penalty_kind: 'notice', penalty_ends_at: null, summary: '有没有人一起组队做游戏，我出美术' }),
  violation(5, { appeal_status: 'accepted', appeal_stage: null, appeal_result: 'reduced', appeal_decided_by: 'senior', penalty_ends_at: ago(2 * HOUR) }),
  violation(6, { appeal_status: 'rejected', appeal_stage: null, appeal_result: 'upheld', appeal_decided_by: 'senior', appeal_note: null }),
  violation(7, { appeal_status: 'rejected', appeal_stage: null, appeal_result: 'upheld', appeal_decided_by: 'admin', appeal_note: '上下文里你连续三次针对同一个人，不是玩笑。', source: 'report', penalty_kind: 'warning', penalty_ends_at: null }),
  // 旧后端：只有 appeal_status，没有三期的三个字段
  violation(8, { appeal_status: 'pending' })
];

function patchStanding(standing: ModerationStanding): ModerationStanding {
  if (seniorScenario.penalties !== 'stages') {
    return standing;
  }
  // 后端没有三期时，处罚记录里没有申诉进度的三个字段
  // 「申诉转管理员」：资深复审超时或凑不齐人，那条复审中的申诉 appeal_stage 变成 admin（服务端同时发 moderation.violation.updated，action 为 appeal_escalated）
  const current = violations.map((item) => (item.id === 2 && seniorScenario.escalated === 'yes' ? { ...item, appeal_stage: 'admin' } : item));
  const list = phase3On() ? current : current.map(({ appeal_stage: _stage, appeal_result: _result, appeal_decided_by: _by, ...rest }) => rest);
  return { ...standing, points: 9, next_threshold: 12, next_penalty: 'ban:168', muted_until: later(20 * HOUR), mute_reason: '辱骂骚扰', violations: list };
}

// ───────────────────────── 举报记录与复议 ─────────────────────────

function report(id: number, extra: Partial<ReportRead>): ReportRead {
  return { id, target_type: 'message', target_id: 9000 + id, reason: '辱骂骚扰', description: null, attachments: [], status: 'reviewed', created_at: ago(id * DAY), reviewed_at: ago(id * DAY - 6 * HOUR), case_id: 1200 + id, result_title: null, result_text: null, ...extra };
}

const reports: ReportRead[] = [
  report(1, { status: 'pending', reviewed_at: null, reason: '垃圾广告', target_type: 'post' }),
  report(2, { status: 'rejected', result_title: '举报不成立', result_text: '风纪委员评审后认为这条内容没有违反社区规则。', can_reconsider: true, reconsider_status: 'none', description: '他一天刷了好几遍，还骂人没眼光。' }),
  report(3, { status: 'rejected', result_title: '举报不成立', result_text: '风纪委员评审后认为这条内容没有违反社区规则。', can_reconsider: false, reconsider_status: 'pending' }),
  report(4, { status: 'rejected', result_title: '举报不成立', result_text: '风纪委员评审后认为这条内容没有违反社区规则。', can_reconsider: false, reconsider_status: 'upheld' }),
  report(5, { status: 'reviewed', result_title: '举报成立', result_text: '经复议改判为违规，已按规则处理。', can_reconsider: false, reconsider_status: 'overturned' }),
  // 同一个案件已经有别的举报人申请过复议：这一条会返回 409
  report(6, { status: 'rejected', result_title: '举报不成立', result_text: '风纪委员评审后认为这条内容没有违反社区规则。', can_reconsider: true, reconsider_status: 'none', reason: '刷屏灌水' }),
  report(7, { status: 'reviewed', result_title: '举报成立', result_text: '内容已撤回，对方被警告。', reason: '诈骗或钓鱼' }),
  // 管理员直接驳回的：不能复议
  report(8, { status: 'rejected', review_note: '证据不足。', can_reconsider: false, reconsider_status: 'none' })
];

function visibleReports(): ReportRead[] {
  // 后端没有复议能力时，这两个字段不存在
  return seniorScenario.reconsider === 'on' && phase3On() ? reports : reports.map(({ can_reconsider: _can, reconsider_status: _status, ...rest }) => rest);
}

// ───────────────────────── 假接口 ─────────────────────────

async function patched<T>(response: Response | undefined, change: (data: T) => unknown): Promise<Response | undefined> {
  if (!response || !response.ok) {
    return response;
  }
  return json(change(await response.json() as T));
}

const PHASE3_PATHS = /^\/jury\/(panel|appeals|precedents|hall)(\/|$)|^\/reports\/\d+\/reconsider$/;

export function withPhase3(base: MockHandler): MockHandler {
  return async (request) => {
    const { path, url, method, body } = request;
    const data = (body ?? {}) as Record<string, unknown>;
    const on = phase3On();

    // 举报（设置里的举报记录、举报弹窗）不属于 /jury，一期的假接口不认识
    if (path.startsWith('/reports')) {
      requestLog.push({ method, path, body });
      if (path === '/reports/options') return json({ reasons: ['垃圾广告', '辱骂骚扰', '刷屏灌水', '色情低俗', '违法违规', '诈骗或钓鱼'].map((reason) => ({ reason, details_required: false })).concat({ reason: '其他', details_required: true }), details_min_length: 10, max_evidence_messages: 10, max_attachments: 6 });
      if (path === '/reports/quota') return json({ daily_quota: 10, used_today: 2, remaining_today: 8 });
      if (path === '/reports/me') return json(visibleReports());
      if (path === '/reports' && method === 'POST') {
        if (on && seniorScenario.report === 'reviewed') return error(409, 'already_reviewed', '这条内容近期已经评审过，结论是不违规，不能重复举报', { case_id: 1202 });
        return json(report(99, { status: 'pending', reviewed_at: null, reason: String(data.reason ?? '') }), 201);
      }
      const reconsider = path.match(/^\/reports\/(\d+)\/reconsider$/);
      if (reconsider && method === 'POST') {
        if (!on || seniorScenario.reconsider !== 'on') return notFound();
        const target = reports.find((item) => item.id === Number(reconsider[1]));
        if (!target) return notFound();
        if (typeof data.text !== 'string' || data.text.trim().length < 10) return error(422, 'text_required', '请写明申请复议的理由，至少 10 个字');
        if (target.id === 6 || !target.can_reconsider) return error(409, 'reconsider_unavailable', '这个案件已经有人申请过复议，或者已经超过申请期限');
        Object.assign(target, { can_reconsider: false, reconsider_status: 'pending' });
        return json(target);
      }
      return notFound();
    }

    if (PHASE3_PATHS.test(path)) {
      requestLog.push({ method, path, body });
      if (!on) return notFound();
    }
    if (path.startsWith('/jury/hall')) {
      return (await hallMock(request)) ?? notFound();
    }

    // —— 资深合议 ——
    if (path === '/jury/panel/next') {
      if (!isSenior()) return error(403, 'not_senior', '只有资深委员可以参加合议');
      if (seniorScenario.restricted === 'muted') return error(403, 'juror_restricted', '受处罚期间不能参与评审');
      return json({ case: seniorScenario.panel === 'empty' ? null : panelView() });
    }
    const panelVote = path.match(/^\/jury\/panel\/(\d+)\/vote$/);
    if (panelVote && method === 'POST') {
      if (scenario.voteFails) return error(503, 'server_busy', '服务器开小差了，请稍后重试');
      const caseId = Number(panelVote[1]);
      const vote = data.vote as PanelVote;
      // 合议不能弃权，也没有「上下文不足」
      if (!['none', 'l1', 'l2', 'l3', 'recuse'].includes(String(data.vote))) return error(422, 'invalid_vote', '合议只能给出判断或回避');
      nextPanelId += 1;
      if (seniorScenario.panelError !== 'none') {
        const code = seniorScenario.panelError;
        seniorScenario.panelError = 'none';
        return error(409, code, code === 'already_voted' ? '你已经对这个案件投过票了' : '你已经回避过这个案件');
      }
      if (vote === 'recuse') return json({ case_id: caseId, settled: false, case: null, reward: null });
      const note = typeof data.note === 'string' && data.note ? data.note : null;
      const view = panelView();
      const closed = seniorScenario.panelAfter === 'closed';
      const item: PanelVoted = { view: { ...view, case_id: caseId }, vote, note, votedAt: new Date().toISOString(), closed, opinions: [...view.origin.opinions] };
      if (note) item.opinions.push(opinion('合议委员 B', note, { mine: true, tier: 'senior', vote: closed ? vote : null, created_at: item.votedAt }));
      panelVoted.set(caseId, item);
      return json({ case_id: caseId, settled: closed, case: patchDetail(panelDetail(item)), reward: closed ? { points: 15, total: 172, items: [{ kind: 'panel_agreed', points: 15, label: '合议票与结论一致' }] } : { points: 0, total: 157, items: [] } });
    }
    const caseMatch = path.match(/^\/jury\/cases\/(\d+)(\/opinions)?$/);
    if (on && caseMatch && panelVoted.has(Number(caseMatch[1]))) {
      requestLog.push({ method, path, body });
      const item = panelVoted.get(Number(caseMatch[1])) as PanelVoted;
      if (!caseMatch[2]) return json(patchDetail(panelDetail(item)));
      if (method === 'POST') {
        const created = opinion('合议委员 B', String(data.content ?? ''), { mine: true, tier: 'senior', is_note: false, vote: item.closed ? item.vote : null, created_at: new Date().toISOString(), parent_id: typeof data.parent_id === 'number' ? data.parent_id : null });
        const root = item.opinions.find((entry) => entry.id === created.parent_id || entry.replies.some((reply) => reply.id === created.parent_id));
        if (root) root.replies.push({ ...created, parent_id: root.id });
        else item.opinions.push(created);
        return json(created);
      }
      return json({ items: item.opinions, total: item.opinions.reduce((sum, root) => sum + 1 + root.replies.length, 0) });
    }

    // —— 申诉复审 ——
    if (path === '/jury/appeals/next') {
      if (!isSenior()) return error(403, 'not_senior', '只有资深委员可以参加复审');
      if (seniorScenario.restricted === 'muted') return error(403, 'juror_restricted', '受处罚期间不能参与评审');
      return json({ review: seniorScenario.appeal === 'empty' || seniorScenario.appealsSwitch === 'off' && seniorScenario.appeal !== 'reconsider' ? null : appealView() });
    }
    const appealVote = path.match(/^\/jury\/appeals\/(\d+)\/vote$/);
    if (appealVote && method === 'POST') {
      if (scenario.voteFails) return error(503, 'server_busy', '服务器开小差了，请稍后重试');
      const view = appealView();
      const vote = data.vote as AppealVote;
      if (seniorScenario.appealError !== 'none') {
        const code = seniorScenario.appealError;
        seniorScenario.appealError = 'none';
        nextReviewId += 1;
        if (code === 'review_not_found') return error(404, code, '这件复审不存在，或者没有分给你');
        if (code === 'invalid_vote') return error(422, code, '这个选项不适用于这件复审');
        return error(409, code, code === 'review_closed' ? '这件复审已经结束或已转给管理员' : '你已经投过这件复审了');
      }
      const settled = seniorScenario.appealAfter === 'settled';
      appealMine.unshift({ review_id: view.review_id, type: view.type, kind: view.kind, source: view.source, category_label: view.category_label, level: view.level, penalty: view.penalty, my_vote: vote, voted_at: new Date().toISOString(), outcome: settled ? vote : null, settled_at: settled ? new Date().toISOString() : null });
      nextReviewId += 1;
      return json({ review_id: view.review_id, settled, outcome: settled ? vote : null, reward: { points: 8, total: 165, items: [{ kind: 'review_vote', points: 8, label: '参与复审' }] } });
    }
    if (path === '/jury/appeals/mine') {
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      return json({ items: appealMine.slice(offset, offset + limit), total: appealMine.length });
    }

    // —— 判例 ——
    if (path === '/jury/precedents') {
      if (method === 'POST') {
        if (!isSenior()) return error(403, 'not_senior', '只有资深委员可以标注判例');
        const caseId = Number(data.case_id);
        if (precedentForCase(caseId)) return error(409, 'precedent_exists', '这个案件已经是判例了');
        const detail = await (await base({ path: `/jury/cases/${caseId}`, url, method: 'GET', body: undefined }))?.json().catch(() => null) as JuryCaseDetail | null;
        if (!detail?.verdict) return error(422, 'case_not_eligible', '这个案件不能成为判例');
        if (String(data.title ?? '').includes('失败')) return error(422, 'case_not_eligible', '这个案件不能成为判例：结论已被改判');
        const created: Precedent = { id: (nextPrecedentId += 1), case_id: caseId, title: String(data.title ?? ''), summary: String(data.summary ?? ''), kind: detail.kind, outcome: detail.verdict.outcome, category: detail.verdict.category, category_label: detail.verdict.category_label, level: detail.verdict.level, by: 'senior', mine: true, created_at: new Date().toISOString() };
        precedents.unshift(created);
        return json(created, 201);
      }
      const category = url.searchParams.get('category');
      const all = visiblePrecedents().filter((item) => !category || item.category === category);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 20);
      return json({ items: all.slice(offset, offset + limit), total: all.length });
    }
    const precedentMatch = path.match(/^\/jury\/precedents\/(\d+)$/);
    if (precedentMatch) {
      const target = visiblePrecedents().find((item) => item.id === Number(precedentMatch[1]));
      if (!target) return notFound();
      if (method === 'GET') return json(precedentDetail(target));
      if (!target.mine) return error(403, 'not_precedent_author', '只能修改自己标注的判例');
      if (method === 'DELETE') {
        precedents.splice(precedents.indexOf(target), 1);
        return json({ id: target.id, status: 'removed' });
      }
      Object.assign(target, { title: String(data.title ?? target.title), summary: String(data.summary ?? target.summary) });
      return json(target);
    }

    // —— 一期接口：补上三期新增的字段 ——
    const response = await base(request);
    if (path === '/moderation/me') return patched<ModerationStanding>(response, patchStanding);
    if (path.startsWith('/moderation/violations/') && method === 'POST') {
      const target = violations.find((item) => path === `/moderation/violations/${item.id}/appeal`);
      if (!target) return notFound();
      Object.assign(target, { can_appeal: false, appeal_status: 'pending', ...(on && seniorScenario.appealsSwitch === 'on' ? { appeal_stage: 'senior', appeal_result: null, appeal_decided_by: null } : {}) });
      return json(target);
    }
    if (!on) return response;

    if (path === '/jury/config') return patched<JuryConfig>(response, patchConfig);
    if (path === '/jury/me') {
      return patched<JuryStatus>(response, (status) => ({
        ...status,
        senior: isSenior() ? { panel: seniorScenario.panel === 'empty' ? 0 : 2, appeals: seniorScenario.appeal === 'empty' ? 0 : 1 } : null,
        ...(seniorScenario.restricted === 'muted' && status.status === 'active' ? { restriction: { reason: 'muted', until: later(20 * HOUR), message: '受处罚期间不能参与评审' } } : {})
      }));
    }
    if (path === '/jury/overview') return patched<{ jurors: Record<string, number>; backlog: Record<string, number> }>(response, (overview) => ({ ...overview, jurors: { ...overview.jurors, senior: seniorScenario.seniors === 'few' ? 1 : Math.max(4, overview.jurors.senior ?? 0) }, backlog: { ...overview.backlog, panel: seniorScenario.panel === 'empty' ? 0 : 2 } }));
    if (path === '/jury/cases/next') {
      return patched<{ case: JuryCaseView | null }>(response, (result) => ({ case: result.case ? (seniorScenario.caseOrigin === 'machine' ? { ...result.case, case_origin: 'machine', report_count: 0, reasons: [{ reason: '机器筛查 · 辱骂骚扰', count: 1 }] } : { ...result.case, case_origin: 'report' }) : null }));
    }
    if (/^\/jury\/cases\/\d+\/vote$/.test(path)) return patched<{ case?: JuryCaseDetail | null }>(response, (result) => ({ ...result, case: result.case ? patchDetail({ ...result.case, ...(seniorScenario.caseOrigin === 'machine' ? { case_origin: 'machine', report_count: 0, reasons: [{ reason: '机器筛查 · 辱骂骚扰', count: 1 }] } : {}) }) : result.case }));
    if (/^\/jury\/cases\/\d+$/.test(path)) return patched<JuryCaseDetail>(response, patchDetail);
    if (path === '/jury/votes') {
      return patched<JuryVotesPage>(response, (page) => {
        const first = Number(url.searchParams.get('offset') ?? 0) === 0 && !url.searchParams.get('state') && !url.searchParams.get('outcome') && !url.searchParams.get('agreed');
        const mine: JuryVoteItem[] = first ? [...panelVoted.entries()].reverse().map(([caseId, item]) => {
          const detail = panelDetail(item);
          return { case_id: caseId, kind: 'message', primary_reason: item.view.reasons[0]?.reason ?? null, vote: item.vote, voted_at: item.votedAt, alias: '合议委员 B', stage: detail.stage, outcome: detail.verdict?.outcome ?? null, verdict_source: detail.verdict?.source ?? null, verdict_level: detail.verdict?.level ?? null, closed_at: detail.verdict?.closed_at ?? null, agreed: detail.my_vote.agreed, overturned: false, is_quality_check: false, opinion_count: detail.opinion_count, vote_stage: 'panel' as const };
        }) : [];
        // 资深委员的历史里混几条合议票
        const items = page.items.map((item, index) => (
          // 「未作处理」结案的机器案件：clean + auto，这一票不计一致率
          item.case_id === UNHANDLED_CASE_ID ? { ...item, vote_stage: 'jury' as const, stage: 'closed' as const, outcome: 'clean' as const, verdict_source: 'auto' as const, verdict_level: null, agreed: null, primary_reason: '机器筛查 · 辱骂骚扰' }
            : isSenior() && item.stage === 'closed' && !item.is_quality_check && index % 6 === 4 ? { ...item, vote_stage: 'panel' as const, verdict_source: 'panel' as const, alias: '合议委员 B' } : { ...item, vote_stage: 'jury' as const }));
        return { items: [...mine, ...items], total: page.total + panelVoted.size };
      });
    }
    // 公示栏的条目和详情：判例标记、案件来源。#1172 当作一个机器来源、认定违规的案件
    const patchPublic = <T extends JuryPublicCase>(item: T): T => ({
      ...item, precedent_id: precedentForCase(item.case_id)?.id ?? null,
      ...(item.case_id === 1172 ? { case_origin: 'machine', report_count: 0, reasons: [{ reason: '机器筛查 · 辱骂骚扰', count: 1 }] } : { case_origin: 'report' })
    });
    if (path === '/jury/public/cases') return patched<{ items: JuryPublicCase[]; total: number }>(response, (page) => ({ ...page, items: page.items.map(patchPublic) }));
    if (/^\/jury\/public\/cases\/\d+$/.test(path)) return patched<JuryPublicCase>(response, patchPublic);
    return response;
  };
}
