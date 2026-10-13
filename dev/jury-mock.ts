/**
 * 风纪预览页（jury-harness）的假数据和假接口。
 *
 * 数据形状照 KukeChat-Server 的 docs/jury-v2.md 第 1 节和 docs/moderation-v2.md 第 3 节构造。
 * 案件内容遵守匿名规则：发言人只有「被举报人」「成员A」这类代称，观点区只有「委员 A」这类案件内代号。
 * 所有状态都在内存里，刷新页面就重来。
 */
import type {
  JuryCaseDetail, JuryCaseMessage, JuryCaseView, JuryConfig, JuryMembership, JuryMyStats, JuryOpinion, JuryOutcome, JuryOverview,
  JuryPublicCase, JuryPublicCaseDetail, JuryStatus, JuryTally, JuryTier, JuryVote, JuryVoteItem
} from '@/types/jury';
import { json, type MockHandler } from './mocks/types';

export interface JuryScenario {
  /** 我的身份。ineligible / eligible 都是「未加入」，差别在条件满不满足 */
  identity: 'ineligible' | 'eligible' | 'applied' | 'active' | 'expired' | 'rejected' | 'suspended';
  tier: JuryTier | 'none';
  /** 评审台下一件发什么 */
  caseKind: 'message' | 'post' | 'images' | 'recalled' | 'long' | 'quality';
  queue: 'cases' | 'empty' | 'limit' | 'restricted' | 'not_juror';
  /** 投票之后案件是否已定案 */
  after: 'open' | 'closed';
  opinions: 'empty' | 'few' | 'many';
  bulletin: 'many' | 'empty';
  /** v2 = 新后端；legacy = 旧后端（新接口全部 404）；low = 样本不足；cold = 冷启动（0 委员 0 定案） */
  backend: 'v2' | 'legacy' | 'low' | 'cold';
  voteFails: boolean;
  /** 假接口的延迟（毫秒） */
  delay: number;
}

export const scenario: JuryScenario = { identity: 'active', tier: 'trainee', caseKind: 'message', queue: 'cases', after: 'open', opinions: 'few', bulletin: 'many', backend: 'v2', voteFails: false, delay: 120 };

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

export const config: JuryConfig = {
  version: 2,
  capabilities: ['overview', 'case_detail', 'opinions', 'votes', 'public_cases'],
  switches: { auto_appoint: false, appeals: false, machine_review: false },
  tiers: [{ key: 'trainee', label: '见习委员' }, { key: 'regular', label: '正式委员' }, { key: 'senior', label: '资深委员' }],
  votes: [
    { value: 'none', kind: 'clean', label: '不违规', hint: '没有违反社区规则' },
    { value: 'l1', kind: 'violation', label: '违规 · 轻微', hint: '不太合适，情节轻微，提醒一下就够了', level: 1 },
    { value: 'l2', kind: 'violation', label: '违规 · 一般', hint: '明确违反了规则', level: 2 },
    { value: 'l3', kind: 'violation', label: '违规 · 严重', hint: '性质恶劣，或者屡教不改', level: 3 },
    { value: 'abstain', kind: 'abstain', label: '拿不准', hint: '看不懂或无法判断，不计入表决' }
  ],
  rules: { seats_per_case: 5, quick_consensus_votes: 3, full_consensus_votes: 4, timeout_hours: 72, assignment_ttl_hours: 24, daily_votes: 30, term_days: 30, context_near: 3, content_retention_days: 30, publish_delay_hours: 72, min_sample: 5 },
  opinions: { max_length: 500, per_case: 20, per_minute: 5, per_day: 100, auto_hide_reports: 2, report_reasons: ['人身攻击', '泄露身份或隐私', '照抄违规原文', '与案件无关', '其他'] },
  eligibility: { min_account_age_days: 30, min_recent_messages: 30, recent_activity_days: 30 }
};

const rules = {
  point_window_days: 90,
  categories: [
    { key: 'harassment', label: '辱骂骚扰', level: 2 }, { key: 'advertising', label: '垃圾广告', level: 1 }, { key: 'flooding', label: '刷屏灌水', level: 1 },
    { key: 'fraud', label: '诈骗或钓鱼', level: 3 }, { key: 'illegal', label: '违法违规', level: 4 }, { key: 'privacy', label: '人肉与隐私', level: 3 }, { key: 'sexual', label: '色情低俗', level: 3 }
  ],
  levels: [{ level: 1, points: 1, penalty: 'notice' }, { level: 2, points: 3, penalty: 'warning' }, { level: 3, points: 6, penalty: 'mute:24' }, { level: 4, points: 12, penalty: 'ban:168' }],
  ladder: [{ threshold: 6, penalty: 'mute:24' }, { threshold: 9, penalty: 'mute:72' }, { threshold: 12, penalty: 'ban:168' }, { threshold: 18, penalty: 'ban:720' }, { threshold: 24, penalty: 'ban:permanent' }]
};

// ───────────────────────── 案件内容 ─────────────────────────

let pictures: string[] = [];

/** 画几张占位图。真实案件里的图片是普通的聊天图片，这里只需要不同的尺寸。 */
export async function preparePictures(): Promise<void> {
  const make = (width: number, height: number, hue: number): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = `hsl(${hue} 30% 82%)`;
      context.fillRect(0, 0, width, height);
      context.fillStyle = `hsl(${hue} 30% 40%)`;
      context.font = '600 22px sans-serif';
      context.fillText(`示例图片 ${width}×${height}`, 18, 38);
    }
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
  };
  pictures = await Promise.all([make(640, 360, 210), make(360, 520, 20), make(480, 480, 130)]);
}

function line(offset: number, speaker: string, content: string | null, extra: Partial<JuryCaseMessage> = {}): JuryCaseMessage {
  return { speaker, is_target: offset === 0, type: 'text', content, images: [], created_at: new Date(Date.now() - 5 * HOUR + offset * 40_000).toISOString(), offset, ...extra };
}

const LONG_TEXT = `你们这种人就是不行，我跟你们讲${'，说了多少遍了都不听'.repeat(18)}。\n\n算了不说了，反正说了你们也不懂，一个个的就知道在这里装，${'真的很烦'.repeat(24)}\nhttps://example.com/a-very-long-link-without-any-break-opportunity-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;

function transcript(kind: JuryScenario['caseKind']): JuryCaseMessage[] {
  const target = kind === 'long' ? LONG_TEXT : kind === 'images' ? '看看你做的这是什么东西' : '这都不会？回去重读小学吧，别在群里丢人了';
  return [
    line(-10, '成员C', '早'),
    line(-9, '成员A', '有人在吗，想问个克隆体的问题'),
    line(-8, '成员B', '说'),
    line(-7, '成员A', '我想让每个克隆体记住自己的编号，但是变量一改全都变了'),
    line(-6, '成员C', '要用「仅适用于当前角色」的变量'),
    line(-5, '成员A', '我试了，还是不行'),
    line(-4, '成员B', kind === 'recalled' ? null : '你把创建克隆体那段发出来看看'),
    line(-3, '成员A', kind === 'images' ? null : '就是这样拼的', kind === 'images' ? { type: 'image', content: pictures[0] } : {}),
    line(-2, '被举报人', '这种问题也拿出来问'),
    line(-1, '成员A', '我刚学两个星期……'),
    line(0, '被举报人', target, kind === 'images' ? { images: [pictures[1], pictures[2]] } : {}),
    line(1, '成员C', '好好说话行不行'),
    line(2, '被举报人', kind === 'recalled' ? null : '我说的是实话'),
    line(3, '成员B', '别吵了，问题在于克隆体启动时才给变量赋值'),
    line(4, '成员A', '好的谢谢'),
    line(5, '成员C', '新人问问题很正常'),
    line(6, '成员B', '嗯'),
    line(7, '成员A', '改好了，可以了'),
    line(8, '成员C', '👍')
  ];
}

function buildView(caseId: number, kind: JuryScenario['caseKind']): JuryCaseView {
  const post = kind === 'post';
  return {
    case_id: caseId,
    kind: post ? 'post' : 'message',
    reasons: post ? [{ reason: '垃圾广告', count: 3 }, { reason: '诈骗或钓鱼', count: 1 }] : [{ reason: '辱骂骚扰', count: 2 }],
    report_count: post ? 4 : 2,
    messages: post ? [] : transcript(kind),
    post: post ? { content: '【限时福利】加这个群免费领全套素材和会员，名额有限先到先得！！\n群号私信我，备注「素材」。\n已经有三百多人领到了，不信的可以看评论区。', image_urls: [pictures[0]], created_at: ago(9 * HOUR) } : null,
    assigned_at: ago(20 * 60_000),
    expires_at: new Date(Date.now() + 23 * HOUR + 40 * 60_000).toISOString()
  };
}

// ───────────────────────── 我投过的案件 ─────────────────────────

interface VotedCase {
  view: JuryCaseView;
  vote: JuryVote;
  note: string | null;
  votedAt: string;
  alias: string;
  closed: boolean;
  outcome: JuryOutcome;
  level: number | null;
  quality: boolean;
  overturned?: boolean;
  expired?: boolean;
  opinions: JuryOpinion[];
}

const voted = new Map<number, VotedCase>();
let nextCaseId = 1301;
let votedToday = 4;
let nextOpinionId = 5000;

function tallyFor(item: VotedCase): JuryTally {
  const tally: JuryTally = item.outcome === 'violation' ? { none: 1, l1: 0, l2: 3, l3: 0, abstain: 1 } : { none: 3, l1: 1, l2: 0, l3: 0, abstain: 0 };
  return tally;
}

function agreedFor(item: VotedCase): boolean | null {
  if (!item.closed || item.vote === 'abstain') return null;
  return (item.vote === 'none') === (item.outcome === 'clean');
}

function opinion(id: number, alias: string, content: string, extra: Partial<JuryOpinion> = {}): JuryOpinion {
  return { id, parent_id: null, alias, tier: 'trainee', vote: null, content, state: 'visible', is_note: false, mine: false, like_count: 0, liked: false, reported: false, created_at: ago(3 * HOUR), reply_to_alias: null, replies: [], ...extra };
}

function seedOpinions(mode: JuryScenario['opinions'], closed: boolean): JuryOpinion[] {
  if (mode === 'empty') {
    return [];
  }
  const vote = (value: JuryVote): JuryVote | null => (closed ? value : null);
  const id = (): number => (nextOpinionId += 1);
  const first = opinion(id(), '委员 A', '连续两条都是冲着人去的，不是在讨论问题。新人问基础问题很正常，这种回复会把人赶走。', { tier: 'regular', vote: vote('l2'), is_note: true, like_count: 3, liked: true, created_at: ago(5 * HOUR) });
  first.replies = [
    opinion(id(), '委员 C', '同意。不过只有一句重话，我觉得算轻微。', { parent_id: first.id, vote: vote('l1'), created_at: ago(4.5 * HOUR) }),
    opinion(id(), '委员 A', '前面那句「这种问题也拿出来问」也算，所以我给了一般。', { parent_id: first.id, tier: 'regular', vote: vote('l2'), reply_to_alias: '委员 C', created_at: ago(4.2 * HOUR) })
  ];
  const few = [
    first,
    opinion(id(), '委员 D', '语气确实冲，但没有脏话，也没有持续纠缠，我倾向于不违规，提醒一下就行。', { vote: vote('none'), is_note: true, like_count: 1, created_at: ago(4 * HOUR) }),
    opinion(id(), '委员 E', '拿不准，上下文里看不出两个人之前有没有过节。', { tier: 'senior', vote: vote('abstain'), created_at: ago(2 * HOUR) })
  ];
  if (mode === 'few') {
    return few;
  }
  const deleted = opinion(id(), '委员 F', '', { content: null, state: 'deleted', created_at: ago(110 * 60_000) });
  deleted.replies = [opinion(id(), '委员 D', '这条说得有点过了，删了也好。', { parent_id: deleted.id, created_at: ago(100 * 60_000) })];
  const more = [
    deleted,
    opinion(id(), '委员 G', '', { content: null, state: 'hidden', reported: true, created_at: ago(95 * 60_000) }),
    opinion(id(), '委员 C', `补充一点：${'规则里「辱骂骚扰」的默认等级是 L2，但手册也说了可以按情节调整。'.repeat(6)}`, { vote: vote('l1'), like_count: 7, created_at: ago(90 * 60_000) }),
    ...Array.from({ length: 9 }, (_, index) => opinion(id(), `委员 ${'ACDEFG'[index % 6]}`, ['+1', '我也这么看', '重点是有没有针对人，而不是语气好不好', '「丢人」这个词算不算辱骂，我觉得算', '类似的情况上周定的是轻微', '如果被举报人之前有记录，等级会不会不一样？我们看不到，所以只看这一条', '同意楼上', '这类案件建议都写一下理由，方便之后对照', '已阅'][index], { like_count: index % 4, vote: vote((['l2', 'l1', 'l2', 'none', 'l1', 'l2'] as JuryVote[])[index % 6]), created_at: ago((80 - index * 7) * 60_000) }))
  ];
  return [...few, ...more];
}

/** 未删除的观点数：含回复、含被折叠的；已删除的根观点留下的占位不算 */
function countOpinions(opinions: JuryOpinion[]): number {
  return opinions.reduce((sum, root) => sum + (root.state === 'deleted' ? 0 : 1) + root.replies.length, 0);
}

function toDetail(item: VotedCase): JuryCaseDetail {
  const closed = item.closed || item.quality;
  return {
    ...item.view,
    messages: item.expired ? [] : item.view.messages,
    post: item.expired ? null : item.view.post,
    content_available: !item.expired,
    my_vote: { vote: item.vote, note: item.note, voted_at: item.votedAt, alias: item.quality ? null : '委员 B', agreed: item.quality ? (item.vote === 'abstain' ? null : (item.vote === 'none') === (item.outcome === 'clean')) : agreedFor(item) },
    stage: closed ? 'closed' : 'jury',
    votes_cast: item.quality ? 0 : closed ? 4 : 2,
    tally: closed && !item.quality ? tallyFor(item) : null,
    verdict: closed ? {
      outcome: item.outcome, source: 'jury', category: item.outcome === 'violation' ? 'harassment' : null, category_label: item.outcome === 'violation' ? (item.view.kind === 'post' ? '垃圾广告' : '辱骂骚扰') : null,
      level: item.outcome === 'violation' ? item.level ?? 2 : null, closed_at: ago(2 * HOUR), hours: 5.2, overturned: Boolean(item.overturned), overturn_note: item.overturned ? '被处罚人申诉后，管理员认定情节不构成违规。' : null
    } : null,
    is_quality_check: item.quality,
    opinions_enabled: !item.quality,
    opinion_count: countOpinions(item.opinions)
  };
}

// ───────────────────────── 历史、公示 ─────────────────────────

const REASONS = ['辱骂骚扰', '垃圾广告', '刷屏灌水', '诈骗或钓鱼', '辱骂骚扰', '人肉与隐私'];

const historySeed: JuryVoteItem[] = Array.from({ length: 133 }, (_, index) => {
  const closed = index >= 6 && index % 9 !== 0;
  const outcome: JuryOutcome = index % 5 < 3 ? 'violation' : 'clean';
  const vote = (['l2', 'none', 'l1', 'l2', 'abstain', 'none', 'l3', 'l1'] as JuryVote[])[index % 8];
  const quality = index % 14 === 3;
  return {
    case_id: 1290 - index * 3, kind: index % 4 === 1 ? 'post' : 'message', primary_reason: REASONS[index % REASONS.length], vote, voted_at: ago(index * 7 * HOUR + 30 * 60_000), alias: '委员 B',
    stage: closed || quality ? 'closed' : index % 9 === 0 && index > 0 ? 'admin' : 'jury',
    outcome: closed || quality ? outcome : null, verdict_source: closed ? (index % 11 === 0 ? 'admin' : 'jury') : null, verdict_level: (closed || quality) && outcome === 'violation' ? (index % 3) + 1 : null,
    closed_at: closed ? ago(index * 7 * HOUR) : null, agreed: (closed || quality) && vote !== 'abstain' ? (vote === 'none') === (outcome === 'clean') : null, overturned: closed && index === 12,
    is_quality_check: quality, opinion_count: quality ? 0 : index % 6
  };
});

function historyItems(): JuryVoteItem[] {
  const mine: JuryVoteItem[] = [...voted.entries()].filter(([id]) => !historySeed.some((item) => item.case_id === id)).map(([id, item]) => ({
    case_id: id, kind: item.view.kind, primary_reason: item.view.reasons[0]?.reason ?? null, vote: item.vote, voted_at: item.votedAt, alias: '委员 B', stage: item.closed || item.quality ? 'closed' as const : 'jury' as const,
    outcome: item.closed || item.quality ? item.outcome : null, verdict_source: item.closed ? 'jury' as const : null, verdict_level: item.closed ? item.level : null, closed_at: item.closed ? ago(HOUR) : null,
    agreed: toDetail(item).my_vote.agreed, overturned: false, is_quality_check: item.quality, opinion_count: countOpinions(item.opinions)
  })).reverse();
  return [...mine, ...historySeed];
}

/** 历史里的案件点开时才生成详情，同一个编号每次生成的都一样。 */
function ensureVoted(caseId: number): VotedCase | null {
  const existing = voted.get(caseId);
  if (existing) {
    return existing;
  }
  const row = historySeed.find((item) => item.case_id === caseId);
  if (!row) {
    return null;
  }
  const index = historySeed.indexOf(row);
  const closed = row.stage === 'closed';
  const created: VotedCase = {
    view: buildView(caseId, row.kind === 'post' ? 'post' : 'message'), vote: row.vote, note: index % 3 === 0 ? '连续两条都在针对人，不是讨论问题。' : null, votedAt: row.voted_at, alias: '委员 B',
    closed, outcome: row.outcome ?? 'violation', level: row.verdict_level ?? null, quality: Boolean(row.is_quality_check), overturned: row.overturned, expired: index > 100,
    opinions: row.is_quality_check ? [] : seedOpinions(scenario.opinions, closed)
  };
  voted.set(caseId, created);
  return created;
}

const publicSeed: JuryPublicCase[] = Array.from({ length: 47 }, (_, index) => {
  const outcome: JuryOutcome = index % 4 === 3 ? 'clean' : 'violation';
  const kind = index % 3 === 0 ? 'post' as const : 'message' as const;
  const category = rules.categories[index % 6];
  const level = outcome === 'violation' ? (index % 3) + 1 : null;
  const overturned = index === 5;
  return {
    case_id: 1180 - index * 4, kind, reasons: index % 5 === 0 ? [{ reason: category.label, count: 3 }, { reason: '其他', count: 1 }] : [{ reason: category.label, count: 1 + (index % 3) }], report_count: index % 5 === 0 ? 4 : 1 + (index % 3),
    outcome, category: outcome === 'violation' ? category.key : null, category_label: outcome === 'violation' ? category.label : null, level, source: index % 9 === 4 ? 'admin' : 'jury',
    tally: outcome === 'violation' ? { none: index % 2, l1: level === 1 ? 3 : 1, l2: level === 2 ? 3 : 0, l3: level === 3 ? 3 : 0, abstain: index % 3 === 0 ? 1 : 0 } : { none: 3 + (index % 2), l1: index % 2, l2: 0, l3: 0, abstain: 0 },
    votes: 3 + (index % 3), closed_at: ago(4 * DAY + index * 9 * HOUR), hours: [0.6, 5.2, 11, 26.5, 70][index % 5], overturned,
    has_content: kind === 'post' && outcome === 'violation' && category.key !== 'privacy' && !overturned
  };
});

function publicDetail(item: JuryPublicCase): JuryPublicCaseDetail {
  const reason = item.has_content ? null : item.overturned ? 'overturned' as const : item.outcome === 'clean' ? 'clean' as const : item.kind === 'message' ? 'group_message' as const : 'sensitive' as const;
  return {
    ...item,
    content: item.has_content ? { text: '【限时福利】加这个群免费领全套素材和会员，名额有限先到先得！！\n群号私信我，备注「素材」。', image_count: item.case_id % 8 === 0 ? 2 : 0, created_at: ago(6 * DAY) } : null,
    content_hidden_reason: reason,
    overturn_note: item.overturned ? '被处罚人申诉后，管理员认定情节不构成违规。' : null
  };
}

// ───────────────────────── 我、总览、统计 ─────────────────────────

const REQUIREMENTS = [
  { key: 'account_age', ok: true, text: '注册满 30 天', detail: '已注册 86 天' },
  { key: 'ccw_bound', ok: true, text: '已绑定 CCW 账号', detail: '已绑定' },
  { key: 'clean_record', ok: true, text: '近 90 天没有违规记录', detail: '无违规' },
  { key: 'activity', ok: true, text: '近 30 天发言不少于 30 条', detail: '已发言 214 条' }
];

function status(): JuryStatus {
  const membership: JuryMembership = scenario.identity === 'ineligible' || scenario.identity === 'eligible' ? 'none' : scenario.identity;
  const active = membership === 'active';
  const ever = active || membership === 'expired' || membership === 'suspended';
  const legacy = scenario.backend === 'legacy';
  const fresh = scenario.backend === 'cold';
  return {
    status: membership,
    eligible: scenario.identity !== 'ineligible' && membership !== 'suspended',
    requirements: scenario.identity === 'ineligible' ? REQUIREMENTS.map((item) => (item.key === 'activity' ? { ...item, ok: false, detail: '已发言 12 条' } : item)) : REQUIREMENTS,
    term_ends_at: active ? new Date(Date.now() + 19 * DAY + 5 * HOUR).toISOString() : membership === 'expired' ? ago(2 * DAY) : null,
    review_note: membership === 'rejected' ? '申请陈述过于简单，建议先熟悉社区规则后再申请。' : membership === 'suspended' ? '质控题准确率连续过低（近 10 题对 3 题），暂停评审资格 14 天。' : null,
    stats: ever && !fresh ? { votes_total: 133 + voted.size, votes_settled: 97, votes_agreed: 81, agreement_rate: 0.835, golden_total: 20, golden_correct: 17 } : ever ? { votes_total: voted.size, votes_settled: 0, votes_agreed: 0, agreement_rate: 0, golden_total: 0, golden_correct: 0 } : null,
    daily_limit: 30,
    voted_today: scenario.queue === 'limit' ? 30 : votedToday,
    ...(legacy ? {} : { tier: active && scenario.tier !== 'none' ? scenario.tier : null, available_cases: active ? (scenario.queue === 'cases' ? 3 : 0) : null })
  };
}

function overview(): JuryOverview {
  const me = status();
  const mine = { status: me.status, tier: me.tier ?? null, available_cases: me.available_cases ?? null, voted_today: me.voted_today, daily_limit: me.daily_limit };
  if (scenario.backend === 'cold') {
    return { jurors: { total: 0, trainee: 0, regular: 0, senior: 0 }, backlog: { jury: 2, panel: 0 }, settled: { d7: 0, d30: 0, total: 0 }, window_days: 30, sample: 0, sample_enough: false, median_hours: null, consensus_rate: null, violation_rate: null, overturn_rate: null, counts: { consensus: 0, escalated: 0, violation: 0, clean: 0, overturned: 0 }, me: mine, generated_at: new Date().toISOString() };
  }
  if (scenario.backend === 'low') {
    return { jurors: { total: 3, trainee: 3, regular: 0, senior: 0 }, backlog: { jury: 4, panel: 0 }, settled: { d7: 2, d30: 3, total: 3 }, window_days: 30, sample: 4, sample_enough: false, median_hours: 9.5, consensus_rate: null, violation_rate: null, overturn_rate: null, counts: { consensus: 3, escalated: 1, violation: 2, clean: 1, overturned: 0 }, me: mine, generated_at: new Date().toISOString() };
  }
  return { jurors: { total: 12, trainee: 8, regular: 3, senior: 1 }, backlog: { jury: 4, panel: 0 }, settled: { d7: 9, d30: 31, total: 120 }, window_days: 30, sample: 31, sample_enough: true, median_hours: 6.4, consensus_rate: 0.87, violation_rate: 0.61, overturn_rate: 0.03, counts: { consensus: 27, escalated: 4, violation: 19, clean: 12, overturned: 1 }, me: mine, generated_at: new Date().toISOString() };
}

function myStats(): JuryMyStats {
  if (scenario.backend === 'cold') {
    return { votes_total: voted.size, votes_settled: 0, votes_agreed: 0, agreement_rate: 0, golden_total: 0, golden_correct: 0, golden_rate: 0, abstain_total: 0, abstain_rate: 0, opinions_total: 0, likes_received: 0, trend: Array.from({ length: 30 }, (_, index) => ({ date: new Date(Date.now() - (29 - index) * DAY).toISOString().slice(0, 10), votes: 0, settled: 0, agreed: 0 })) };
  }
  const pattern = [0, 2, 4, 1, 0, 0, 3, 5, 2, 1, 0, 6, 4, 2, 0, 0, 1, 3, 7, 2, 4, 0, 0, 2, 5, 3, 1, 0, 4, votedToday];
  return {
    votes_total: 133 + voted.size, votes_settled: 97, votes_agreed: 81, agreement_rate: 0.835, golden_total: 20, golden_correct: 17, golden_rate: 0.85, abstain_total: 9, abstain_rate: 0.068, opinions_total: 31, likes_received: 44,
    trend: pattern.map((votes, index) => ({ date: new Date(Date.now() - (29 - index) * DAY).toISOString().slice(0, 10), votes, settled: Math.max(0, votes - (index > 26 ? 2 : 0)), agreed: Math.max(0, Math.round(votes * 0.8) - (index > 26 ? 1 : 0)) }))
  };
}

// ───────────────────────── 假接口 ─────────────────────────

const error = (status: number, code: string, message: string): Response => json({ detail: { code, message } }, status);
const notFound = (): Response => json({ detail: 'Not Found' }, 404);

function findOpinion(opinionId: number): { owner: VotedCase; opinion: JuryOpinion } | null {
  for (const owner of voted.values()) {
    for (const root of owner.opinions) {
      if (root.id === opinionId) return { owner, opinion: root };
      const reply = root.replies.find((item) => item.id === opinionId);
      if (reply) return { owner, opinion: reply };
    }
  }
  return null;
}

/** 记录每个请求，方便预览页里的脚本核对「界面有没有真的调接口」。 */
export const requestLog: Array<{ method: string; path: string; body: unknown }> = [];

export const juryMock: MockHandler = ({ path, url, method, body }) => {
  const legacy = scenario.backend === 'legacy';
  const data = (body ?? {}) as Record<string, unknown>;
  if (path.startsWith('/jury') || path.startsWith('/moderation/rules')) {
    requestLog.push({ method, path, body });
  }

  if (path === '/moderation/rules') return json(rules);
  if (path === '/moderation/me') return json({ points: 3, point_window_days: 90, muted_until: null, mute_reason: null, next_threshold: 6, next_penalty: 'mute:24', ban: null, violations: [] });
  if (!path.startsWith('/jury')) return undefined;

  if (path === '/jury/me') return json(status());
  if (path === '/jury/apply' && method === 'POST') {
    if (scenario.identity === 'ineligible') return error(403, 'jury_not_eligible', '还不满足申请条件：近 30 天发言不少于 30 条');
    scenario.identity = scenario.identity === 'expired' ? 'active' : 'applied';
    return json(status());
  }
  if (path === '/jury/cases/next') {
    if (scenario.identity !== 'active' || scenario.queue === 'not_juror') return error(403, 'not_juror', '你不是在任的风纪委员');
    if (scenario.queue === 'restricted') return error(403, 'juror_restricted', '受处罚期间不能评审');
    if (scenario.queue === 'limit') return error(429, 'jury_daily_limit', '今天已经评了 30 件，明天再来吧');
    if (scenario.queue === 'empty') return json({ case: null });
    const view = buildView(nextCaseId, scenario.caseKind);
    return json({ case: legacy ? { ...view, messages: view.messages.filter((message) => (message.offset ?? 0) >= -5 && (message.offset ?? 0) <= 3).map(({ offset: _offset, ...rest }) => rest), assigned_at: undefined, expires_at: undefined } : view });
  }
  const voteMatch = path.match(/^\/jury\/cases\/(\d+)\/vote$/);
  if (voteMatch && method === 'POST') {
    if (scenario.voteFails) return json({ detail: { code: 'server_busy', message: '服务器开小差了，请稍后重试' } }, 503);
    const caseId = Number(voteMatch[1]);
    const quality = scenario.caseKind === 'quality';
    const closed = scenario.after === 'closed';
    const vote = data.vote as JuryVote;
    const note = typeof data.note === 'string' && data.note ? data.note : null;
    const item: VotedCase = { view: buildView(caseId, scenario.caseKind === 'quality' ? 'message' : scenario.caseKind), vote, note, votedAt: new Date().toISOString(), alias: '委员 B', closed, outcome: 'violation', level: 2, quality, opinions: quality ? [] : seedOpinions(scenario.opinions, closed) };
    if (note && !quality) {
      item.opinions.push(opinion((nextOpinionId += 1), '委员 B', note, { mine: true, is_note: true, vote: closed ? vote : null, created_at: item.votedAt, tier: scenario.tier === 'none' ? null : scenario.tier }));
    }
    voted.set(caseId, item);
    nextCaseId += 1;
    votedToday += 1;
    return json(legacy ? { case_id: caseId, settled: closed } : { case_id: caseId, settled: closed || quality, case: toDetail(item) });
  }
  if (path === '/jury/history') {
    return json(historyItems().slice(0, 50).map((item) => ({ case_id: item.case_id, kind: item.kind, vote: item.vote, voted_at: item.voted_at, agreed: item.agreed, outcome: item.outcome })));
  }

  // 以下是风纪 v2 的新接口：旧后端上不存在
  if (legacy) return notFound();

  if (path === '/jury/config') return json(config);
  if (path === '/jury/overview') return json(overview());
  if (path === '/jury/me/stats') return json(myStats());
  if (path === '/jury/votes') {
    const state = url.searchParams.get('state');
    const outcome = url.searchParams.get('outcome');
    const agreed = url.searchParams.get('agreed');
    const all = (scenario.backend === 'cold' ? historyItems().filter((item) => voted.has(item.case_id) && !historySeed.includes(item)) : historyItems()).filter((item) => (!state || (state === 'closed') === (item.stage === 'closed')) && (!outcome || item.outcome === outcome) && (!agreed || item.agreed === (agreed === 'true')));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    return json({ items: all.slice(offset, offset + limit), total: all.length });
  }
  if (path === '/jury/public/cases') {
    const kind = url.searchParams.get('kind');
    const outcome = url.searchParams.get('outcome');
    const category = url.searchParams.get('category');
    const all = (scenario.bulletin === 'empty' || scenario.backend === 'cold' ? [] : publicSeed).filter((item) => (!kind || item.kind === kind) && (!outcome || item.outcome === outcome) && (!category || item.category === category));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    return json({ items: all.slice(offset, offset + limit), total: all.length });
  }
  const publicMatch = path.match(/^\/jury\/public\/cases\/(\d+)$/);
  if (publicMatch) {
    const item = publicSeed.find((entry) => entry.case_id === Number(publicMatch[1]));
    return item ? json(publicDetail(item)) : notFound();
  }
  const caseMatch = path.match(/^\/jury\/cases\/(\d+)$/);
  if (caseMatch) {
    const item = ensureVoted(Number(caseMatch[1]));
    return item ? json(toDetail(item)) : error(403, 'not_voted', '只有对这个案件投过票的委员可以查看');
  }
  const opinionsMatch = path.match(/^\/jury\/cases\/(\d+)\/opinions$/);
  if (opinionsMatch) {
    const item = ensureVoted(Number(opinionsMatch[1]));
    if (!item) return error(403, 'not_voted', '只有对这个案件投过票的委员可以查看');
    if (item.quality) return error(403, 'opinions_closed', '这个案件没有观点区');
    if (method === 'POST') {
      const content = typeof data.content === 'string' ? data.content.trim() : '';
      if (!content || content.length > 500) return error(422, 'invalid_opinion', '观点内容不能为空，也不能超过 500 字');
      if (content.includes('频率')) return error(429, 'opinion_rate_limited', '发得太快了，歇一会儿再发');
      const parentId = typeof data.parent_id === 'number' ? data.parent_id : null;
      const root = parentId === null ? null : item.opinions.find((entry) => entry.id === parentId || entry.replies.some((reply) => reply.id === parentId)) ?? null;
      const parent = root && root.id !== parentId ? root.replies.find((reply) => reply.id === parentId) ?? null : null;
      const created = opinion((nextOpinionId += 1), '委员 B', content, { mine: true, parent_id: root?.id ?? null, reply_to_alias: parent?.alias ?? null, vote: item.closed ? item.vote : null, created_at: new Date().toISOString(), tier: scenario.tier === 'none' ? null : scenario.tier });
      if (root) root.replies.push(created);
      else item.opinions.push(created);
      return json(created);
    }
    return json({ items: item.opinions, total: countOpinions(item.opinions) });
  }
  const opinionMatch = path.match(/^\/jury\/opinions\/(\d+)(?:\/(like|report))?$/);
  if (opinionMatch) {
    const found = findOpinion(Number(opinionMatch[1]));
    if (!found) return notFound();
    const target = found.opinion;
    if (opinionMatch[2] === 'like') {
      if (target.mine) return error(400, 'cannot_like_own', '不能给自己的观点点赞');
      const liked = method === 'POST';
      if (target.liked !== liked) {
        target.liked = liked;
        target.like_count += liked ? 1 : -1;
      }
      return json({ id: target.id, like_count: target.like_count, liked: target.liked });
    }
    if (opinionMatch[2] === 'report') {
      if (target.reported) return error(409, 'already_reported', '你已经举报过这条观点了');
      target.reported = true;
      // 假装之前已经有一位委员举报过「委员 D」的观点：这一次举报让它被折叠
      if (target.alias === '委员 D') {
        target.state = 'hidden';
        target.content = null;
      }
      return json({ id: target.id, state: target.state });
    }
    if (method === 'DELETE') {
      if (!target.mine) return error(403, 'not_opinion_author', '只能删除自己的观点');
      // 和真实后端一样：已删除的回复直接消失；已删除的根观点只在还有回复时留占位
      found.owner.opinions = found.owner.opinions
        .map((root) => (root.id === target.id ? { ...root, state: 'deleted' as const, content: null } : { ...root, replies: root.replies.filter((reply) => reply.id !== target.id) }))
        .filter((root) => root.state !== 'deleted' || root.replies.length > 0);
      return json({ id: target.id, state: 'deleted' });
    }
  }
  return notFound();
};
