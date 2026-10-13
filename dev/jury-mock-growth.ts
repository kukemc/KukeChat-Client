/**
 * 风纪预览页 · 二期的假数据和假接口（docs/jury-v2.md 第 2 节）：入门考试、练习场、新投票选项、风纪值、层级、成就、
 * 排行榜、公开展示身份；以及一期后来补的四个字段（讲解、max_ban_hours、overview.daily、restriction）。
 *
 * 用法：withGrowth(juryMock) 把一期的假接口包一层 —— 二期的路径在这里处理，
 * 一期接口的响应按契约补上二期新增的字段（/jury/config 的能力和规则数字、/jury/me 的考试 / 风纪值 / 层级进度、投票的 reward …）。
 * growthScenario.phase2 = 'off' 时什么都不加，用来验证「后端只有一期」时二期的板块仍是「即将开放」、不发任何二期请求。
 *
 * 考试的到期时间用考试时钟（components/jury/exam/clock.ts）算：预览页把时钟往后拨，这里的「服务端」跟着走。
 */
import { examNow } from '@/components/jury/exam/clock';
import type { User } from '@/types/api';
import type { JuryCaseDetail, JuryCaseMessage, JuryCaseView, JuryConfig, JuryOverview, JuryStatus, JuryTier, JuryVoteItem, JuryVotesPage } from '@/types/jury';
import type {
  JuryAchievement, JuryBallot, JuryExamQuestion, JuryExamState, JuryLeaderboard, JuryLeaderboardItem, JuryLeaderboardPeriod, JuryPointsItem,
  JuryPracticeQuestion, JuryQuestionContent, JuryReward, JuryStandardAnswer, JuryTierProgress, JuryTierRequirement
} from '@/types/juryGrowth';
import { requestLog, scenario } from './jury-mock';
import { json, type MockHandler } from './mocks/types';

export interface GrowthScenario {
  /** 后端有没有二期的能力。off = 只有一期 */
  phase2: 'on' | 'off';
  /** 入门考试的状态。failed = 上次没过、在等重考；exhausted = 次数用完 */
  exam: 'ready' | 'unavailable' | 'active' | 'passed' | 'failed' | 'exhausted';
  /** /jury/me.exam_required */
  examRequired: 'no' | 'yes';
  /** switches.auto_appoint */
  autoAppoint: 'off' | 'on';
  /** 练习场。few = 额度只剩 2 题（用来走到「做完了」）；round = 题库里的题都做过一遍了；forbidden = 403 没有资格 */
  practice: 'questions' | 'few' | 'round' | 'limit' | 'empty' | 'forbidden' | 'error';
  /** 委员的状态：warn = 弃权率提示；warn_old = 同上，但 warnings 是早期的字符串数组；cooldown = 暂停发案；muted / banned = 受处罚 */
  standing: 'ok' | 'warn' | 'warn_old' | 'cooldown' | 'muted' | 'banned';
  /** 回避次数还有没有（按最近 24 小时滚动计算） */
  recuse: 'left' | 'none';
  /** 晋升进度：刚开始 / 差一点 / 条件都满足 / 接近降级线 */
  progress: 'early' | 'near' | 'ready' | 'risk';
  achievements: 'some' | 'none' | 'all';
  /** 排行榜：outside = 人多且自己不在这一页里 */
  board: 'many' | 'few' | 'empty' | 'outside';
  badge: 'hidden' | 'visible';
  /** 质控题有没有讲解 */
  explanation: 'yes' | 'no';
  /** /jury/overview.daily：有趋势 / 全是 0 / 没有这个字段 */
  daily: 'trend' | 'zero' | 'none';
  /**
   * 让服务端拒绝一次：投票带的类别不在列表里 / 设置公开身份时「从没当过委员」/ 交卷时场次不存在 /
   * 交卷时这一场已经在别处交过（exam_closed，reason: submitted）/ 同上但没有 reason 字段（早期的后端）
   */
  reject: 'none' | 'invalid_category' | 'settings_not_juror' | 'exam_not_found' | 'exam_submitted' | 'exam_closed_old';
}

export const growthScenario: GrowthScenario = {
  phase2: 'on', exam: 'ready', examRequired: 'no', autoAppoint: 'off', practice: 'questions', standing: 'ok', recuse: 'left',
  progress: 'near', achievements: 'some', board: 'many', badge: 'hidden', explanation: 'yes', daily: 'trend', reject: 'none'
};

export const GROWTH_OPTIONS: { [Key in keyof GrowthScenario]: Array<GrowthScenario[Key]> } = {
  phase2: ['on', 'off'], exam: ['ready', 'unavailable', 'active', 'passed', 'failed', 'exhausted'], examRequired: ['no', 'yes'], autoAppoint: ['off', 'on'],
  practice: ['questions', 'few', 'round', 'limit', 'empty', 'forbidden', 'error'], standing: ['ok', 'warn', 'warn_old', 'cooldown', 'muted', 'banned'], recuse: ['left', 'none'],
  progress: ['early', 'near', 'ready', 'risk'], achievements: ['some', 'none', 'all'], board: ['many', 'few', 'empty', 'outside'], badge: ['hidden', 'visible'],
  explanation: ['yes', 'no'], daily: ['trend', 'zero', 'none'], reject: ['none', 'invalid_category', 'settings_not_juror', 'exam_not_found', 'exam_submitted', 'exam_closed_old']
};

export const GROWTH_LABELS: Record<keyof GrowthScenario, string> = {
  phase2: '二期', exam: '考试', examRequired: '考试必须', autoAppoint: '自动任命', practice: '练习场', standing: '委员状态', recuse: '回避次数',
  progress: '晋升进度', achievements: '成就', board: '排行榜', badge: '公开身份', explanation: '讲解', daily: '每日趋势', reject: '服务端拒绝'
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
const later = (ms: number): string => new Date(Date.now() + ms).toISOString();
const error = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response => json({ detail: { code, message, ...extra } }, status);
const notFound = (): Response => json({ detail: 'Not Found' }, 404);

const phase2On = (): boolean => growthScenario.phase2 === 'on' && scenario.backend !== 'legacy';
const isActive = (): boolean => scenario.identity === 'active';
const everJuror = (): boolean => ['active', 'expired', 'suspended'].includes(scenario.identity);

async function patched<T>(response: Response | undefined, change: (data: T) => unknown): Promise<Response | undefined> {
  if (!response || !response.ok) {
    return response;
  }
  return json(change(await response.json() as T));
}

// ───────────────────────── 配置 ─────────────────────────

const CATEGORY_KEYS = ['harassment', 'advertising', 'flooding', 'fraud', 'illegal', 'privacy'];
const PHASE2_CAPABILITIES = ['exam', 'practice', 'votes_v2', 'points', 'tiers', 'achievements', 'leaderboard', 'badge'];
const EXAM_RULES = { total: 10, pass_score: 8, time_limit_minutes: 60, grace_seconds: 90, attempts_max: 3, window_days: 30, retry_hours: 24, valid_days: 90 };
const PRACTICE_LIMIT = 20;
const RECUSE_LIMIT = 5;
const POINTS = { vote_agreed: 10, vote_disagreed: 3, quality_correct: 5, quality_wrong: -5, daily_first: 2, streak_7: 10, opinion_liked: 5, exam_passed: 20, overturn_adjust: 7 };
const TIER_RULES = {
  regular: { votes_settled: 15, agreement_rate: 0.7, quality_rate: 0.7, quality_min: 3, days_served: 14 },
  senior: { votes_settled: 50, agreement_rate: 0.8, quality_rate: 0.8, quality_min: 8, days_served: 60 }
};

function patchConfig(config: JuryConfig): JuryConfig {
  // max_ban_hours 是一期后来补的字段，和二期开不开无关
  const base: JuryConfig = { ...config, rules: { ...config.rules, max_ban_hours: 168 } };
  if (!phase2On()) {
    return base;
  }
  return {
    ...base,
    capabilities: [...base.capabilities, ...PHASE2_CAPABILITIES],
    switches: { ...base.switches, auto_appoint: growthScenario.autoAppoint === 'on' },
    votes: [
      ...base.votes,
      { value: 'need_context', kind: 'abstain', label: '上下文不足', hint: '全部上下文看完，仍然判断不了' },
      { value: 'recuse', kind: 'recuse', label: '主动回避', hint: '我可能认识当事人，或者有利害关系' }
    ],
    rules: { ...base.rules, severe_min_votes: 5, need_context_votes: 2 },
    opinions: { ...base.opinions, like_reward_threshold: 3 },
    categories: [
      { key: 'harassment', label: '辱骂骚扰', default_level: 2 }, { key: 'advertising', label: '垃圾广告', default_level: 1 }, { key: 'flooding', label: '刷屏灌水', default_level: 1 },
      { key: 'fraud', label: '诈骗或钓鱼', default_level: 3 }, { key: 'illegal', label: '违法违规', default_level: 3 }, { key: 'privacy', label: '人肉与隐私', default_level: 3 }
    ],
    points: POINTS,
    tiers: [
      { key: 'trainee', label: '见习委员', requirements: null, demote_below: null },
      { key: 'regular', label: '正式委员', requirements: TIER_RULES.regular, demote_below: { agreement_rate: 0.6, window: 30, min_votes: 15, to: 'trainee' } },
      { key: 'senior', label: '资深委员', requirements: TIER_RULES.senior, demote_below: { agreement_rate: 0.7, window: 30, min_votes: 15, to: 'regular' } }
    ],
    suspend: { min_settled: 20, agreement_rate: 0.6, quality_min: 5, quality_rate: 0.6 },
    exam: EXAM_RULES,
    practice: { daily_limit: PRACTICE_LIMIT },
    recuse: { daily_limit: RECUSE_LIMIT },
    abstain: { window: 50, min_votes: 20, warn_rate: 0.3, cooldown_rate: 0.5, cooldown_hours: 24 }
  };
}

// ───────────────────────── 题库 ─────────────────────────

interface BankItem extends JuryQuestionContent {
  id: number;
  verified: boolean;
  answer: JuryStandardAnswer;
}

function talk(lines: Array<[string, string | null]>, target: number): JuryCaseMessage[] {
  return lines.map(([speaker, content], index) => ({ speaker, is_target: index === target, type: 'text', content, images: [], created_at: new Date(Date.now() - 3 * DAY + index * 45_000).toISOString(), offset: index - target }));
}

function messageItem(id: number, reason: string, lines: Array<[string, string | null]>, target: number, answer: JuryStandardAnswer, verified = true): BankItem {
  return { id, kind: 'message', reasons: [{ reason, count: 1 + (id % 3) }], report_count: 1 + (id % 3), messages: talk(lines, target), post: null, verified, answer };
}

function postItem(id: number, reason: string, content: string, answer: JuryStandardAnswer, verified = true): BankItem {
  return { id, kind: 'post', reasons: [{ reason, count: 2 }], report_count: 2, messages: [], post: { content, image_urls: [], created_at: ago(5 * DAY) }, verified, answer };
}

const violation = (level: number, category: string, explanation: string | null): JuryStandardAnswer => ({ outcome: 'violation', level, category_label: category, explanation });
const clean = (explanation: string | null): JuryStandardAnswer => ({ outcome: 'clean', level: null, category_label: null, explanation });

const LONG_RANT = `你们这群人${'真的是没救了，说多少遍都不听'.repeat(14)}。\n\n${'我早就说过会这样'.repeat(10)}`;

const BANK: BankItem[] = [
  messageItem(1, '辱骂骚扰', [['成员A', '这个角色的碰撞判定怎么写比较好'], ['成员B', '用「碰到颜色」最简单'], ['被举报人', '这种问题都要问，脑子是摆设吗'], ['成员A', '我只是想确认一下……'], ['被举报人', '废物就别做游戏了'], ['成员B', '过分了啊']], 4,
    violation(2, '辱骂骚扰', '连续两句都是冲着提问的人去的（「脑子是摆设」「废物」），不是在讨论问题本身。没有持续纠缠，所以定为一般而不是严重。')),
  messageItem(2, '辱骂骚扰', [['成员A', '我这版本改了三天了'], ['成员B', '我看看'], ['被举报人', '说实话这个手感挺一般的，跳跃太飘了'], ['成员A', '啊……好吧'], ['被举报人', '重力调大一点试试，别灰心'], ['成员A', '好，我改改']], 2,
    clean('这是对作品的批评，不是对人的攻击，而且后面给了具体建议。语气直接不等于辱骂 —— 判断时要分清「说作品不好」和「说人不好」。')),
  messageItem(3, '垃圾广告', [['成员C', '有人知道怎么导出 sb3 吗'], ['被举报人', '加我领全套素材包和会员，名额有限，私聊发群号'], ['成员C', '？'], ['被举报人', '已经三百多人领了，手慢无'], ['成员D', '又是这个']], 1,
    violation(1, '垃圾广告', '和群里正在聊的内容无关的引流信息，并且重复发。没有诈骗的迹象（没有要钱、没有钓鱼链接），按垃圾广告的默认等级定为轻微。')),
  messageItem(4, '刷屏灌水', [['成员A', '今晚八点联机'], ['被举报人', '哈哈哈哈哈哈'], ['被举报人', '哈哈哈哈哈哈哈哈哈'], ['被举报人', '笑死'], ['成员B', '什么事这么好笑'], ['被举报人', '刚才那个 bug 把角色弹飞了']], 2,
    clean('连发了三条，但都是正常聊天里的反应，没有打断别人，后面也解释了在笑什么。刷屏指的是大量重复、挤掉别人说话的内容，这里够不上。')),
  messageItem(5, '人肉与隐私', [['成员B', '昨天那个抄袭的是谁啊'], ['被举报人', '我查到了，真名和学校都在这：（内容已隐去）'], ['成员C', '这样不太好吧'], ['被举报人', '让大家都去他学校贴吧说一说']], 1,
    violation(3, '人肉与隐私', '公开别人的真实姓名和学校，还号召大家去找他。不管对方是不是真的抄袭，泄露个人信息本身就是严重违规，可能造成线下的伤害。')),
  messageItem(6, '辱骂骚扰', [['成员A', '我退出这个合作了'], ['被举报人', '行'], ['成员A', '你把我画的素材删掉'], ['被举报人', '凭什么'], ['成员A', '那是我画的'], ['被举报人', '已经用在作品里了，要删你自己想办法']], 5,
    clean('这是一场合作纠纷，双方态度都不好，但被举报的这句话没有辱骂，也没有威胁。素材归属的争议不属于社区规则里的违规，可以建议他们找管理员协调。')),
  messageItem(7, '诈骗或钓鱼', [['成员D', '有没有人出会员'], ['被举报人', '我有，先转我 20，转完发你兑换码'], ['成员D', '能先给码吗'], ['被举报人', '不行，都是先款。我这有截图证明（图片已隐去）'], ['成员E', '上周有人被这样骗过']], 1,
    violation(3, '诈骗或钓鱼', '要求先付款再发货、拒绝任何担保，并且群里有人指出同样的手法骗过人。涉及钱款的诈骗按严重处理。')),
  messageItem(8, '辱骂骚扰', [['成员A', '这关太难了'], ['成员B', '菜就多练'], ['被举报人', '哈哈哈哈确实，你上次也卡这'], ['成员A', '你们俩就知道笑我'], ['被举报人', '好啦我教你，先踩左边那块']], 2,
    clean('熟人之间的玩笑，被调侃的人自己也接了话，后面是在帮忙。上下文里看得出来关系是友好的。举报理由是「辱骂」，但内容本身不构成辱骂。')),
  messageItem(9, '辱骂骚扰', [['成员A', '我觉得这个机制可以改一下'], ['被举报人', LONG_RANT], ['成员B', '冷静一点'], ['被举报人', '我很冷静']], 1,
    violation(1, '辱骂骚扰', '很长的一段发泄，针对的是「你们这群人」，但没有具体的脏话和人身攻击，也没有针对某一个人。情节轻微，提醒即可。')),
  postItem(10, '垃圾广告', '【代做作品】各类小游戏、课程作业代做，价格私聊。\n接急单，当天交付，质量保证。\n需要的看我主页联系方式。',
    clean('这是在自己的动态里发的服务信息，没有刷屏，也没有骗人的迹象。「代做作业」确实不值得提倡，但现行规则里没有禁止这一类内容，所以不认定违规。'), false),
  messageItem(11, '刷屏灌水', [['成员A', '有人在吗'], ['被举报人', '111'], ['被举报人', '111'], ['被举报人', '111'], ['被举报人', '111'], ['被举报人', '111'], ['成员B', '别刷了'], ['被举报人', '111']], 4,
    violation(1, '刷屏灌水', '连续发无意义的重复内容，被人提醒之后还在继续。这是典型的刷屏。')),
  messageItem(12, '违法违规', [['成员C', '怎么才能绕过那个平台的实名认证'], ['被举报人', '用别人的身份证号就行，我这有一批，要的私聊'], ['成员C', '真的假的'], ['被举报人', '真的，都是能过的']], 1,
    violation(3, '违法违规', '提供他人的身份证号用于冒用实名，属于违法行为，也涉及他人隐私。')),
  messageItem(13, '辱骂骚扰', [['成员A', '我的作品上推荐了！'], ['被举报人', '恭喜'], ['成员B', '厉害'], ['被举报人', '不过说真的，推荐位现在水分挺大的']], 3,
    clean('泼冷水、不太会说话，但没有攻击任何人。让人不舒服的话不等于违规。'), false),
  messageItem(14, '辱骂骚扰', [['成员A', '管理员能不能管管'], ['被举报人', '管理员就是个摆设'], ['成员B', '也不能这么说'], ['被举报人', '我说错了吗，举报了半个月都没人理']], 1,
    clean('这是对管理工作的批评。批评管理员、表达不满是允许的，只要不是人身攻击。'))
];

const contentOf = (item: BankItem): JuryQuestionContent => ({ kind: item.kind, reasons: item.reasons, report_count: item.report_count, messages: item.messages, post: item.post });
const isRight = (item: BankItem, vote: JuryBallot | null | undefined): boolean => Boolean(vote) && (vote === 'none') === (item.answer.outcome === 'clean');

// ───────────────────────── 入门考试 ─────────────────────────

interface ExamMemory {
  appliedFor: GrowthScenario['exam'] | null;
  attemptsUsed: number;
  passed: boolean;
  passedAt: string | null;
  nextAttemptAt: string | null;
  last: { score: number; passed: boolean; submitted_at: string } | null;
  active: { attempt_id: number; expires_at: string; bank: number[] } | null;
}

const exam: ExamMemory = { appliedFor: null, attemptsUsed: 0, passed: false, passedAt: null, nextAttemptAt: null, last: null, active: null };
let nextAttemptId = 7;
const VERIFIED = BANK.filter((item) => item.verified);

/** 场景切换时把考试状态摆到对应的样子；之后的交互（开考、交卷）在这个状态上接着走。 */
function syncExam(): void {
  if (exam.appliedFor === growthScenario.exam) {
    return;
  }
  exam.appliedFor = growthScenario.exam;
  Object.assign(exam, { attemptsUsed: 0, passed: false, passedAt: null, nextAttemptAt: null, last: null, active: null });
  if (growthScenario.exam === 'active') {
    exam.attemptsUsed = 1;
    exam.active = { attempt_id: (nextAttemptId += 1), expires_at: new Date(examNow() + 42 * 60_000).toISOString(), bank: VERIFIED.slice(0, EXAM_RULES.total).map((item) => item.id) };
  } else if (growthScenario.exam === 'passed') {
    Object.assign(exam, { attemptsUsed: 1, passed: true, passedAt: ago(2 * DAY), last: { score: 9, passed: true, submitted_at: ago(2 * DAY) } });
  } else if (growthScenario.exam === 'failed') {
    Object.assign(exam, { attemptsUsed: 1, nextAttemptAt: new Date(examNow() + 19 * HOUR).toISOString(), last: { score: 6, passed: false, submitted_at: ago(5 * HOUR) } });
  } else if (growthScenario.exam === 'exhausted') {
    Object.assign(exam, { attemptsUsed: EXAM_RULES.attempts_max, nextAttemptAt: new Date(examNow() + 9 * DAY).toISOString(), last: { score: 5, passed: false, submitted_at: ago(DAY) } });
  }
}

const examAvailable = (): boolean => growthScenario.exam !== 'unavailable';

function examQuestions(bank: number[]): JuryExamQuestion[] {
  return bank.map((id, index) => ({ question: index + 1, ...contentOf(BANK.find((item) => item.id === id) as BankItem) }));
}

/** 进行中的那一场过了宽限期还没交：按 0 分记一次未通过 */
function expireExam(): void {
  if (exam.active && examNow() > Date.parse(exam.active.expires_at) + EXAM_RULES.grace_seconds * 1000) {
    exam.active = null;
    exam.last = { score: 0, passed: false, submitted_at: new Date().toISOString() };
    exam.nextAttemptAt = exam.attemptsUsed >= EXAM_RULES.attempts_max ? new Date(examNow() + 9 * DAY).toISOString() : new Date(examNow() + EXAM_RULES.retry_hours * HOUR).toISOString();
  }
}

function examState(eligible: boolean): JuryExamState {
  syncExam();
  expireExam();
  const waiting = exam.nextAttemptAt && Date.parse(exam.nextAttemptAt) > examNow() ? exam.nextAttemptAt : null;
  return {
    available: examAvailable(), eligible, passed: exam.passed, passed_at: exam.passedAt,
    total: EXAM_RULES.total, pass_score: EXAM_RULES.pass_score, time_limit_minutes: EXAM_RULES.time_limit_minutes,
    attempts_used: exam.attemptsUsed, attempts_max: EXAM_RULES.attempts_max, window_days: EXAM_RULES.window_days,
    next_attempt_at: waiting, last_result: exam.last,
    active: exam.active ? { attempt_id: exam.active.attempt_id, expires_at: exam.active.expires_at, questions: examQuestions(exam.active.bank) } : null,
    server_time: new Date(examNow()).toISOString()
  };
}

// ───────────────────────── 练习场 ─────────────────────────

/** seen：做过的题（不重复计）。默认前 4 道没做过，其余做过；round 场景下全做过。order：重做时按「最久没做」的顺序 */
const practice = { appliedFor: null as GrowthScenario['practice'] | null, left: 17, answered: 34, correct: 29, seen: new Set<number>(), order: [] as number[] };

function syncPractice(): void {
  if (practice.appliedFor === growthScenario.practice) {
    return;
  }
  practice.appliedFor = growthScenario.practice;
  practice.left = growthScenario.practice === 'limit' ? 0 : growthScenario.practice === 'few' ? 2 : 17;
  const done = growthScenario.practice === 'round' ? BANK : BANK.slice(4);
  practice.seen = new Set(done.map((item) => item.id));
  practice.order = done.map((item) => item.id);
}

// ───────────────────────── 风纪值、层级、成就 ─────────────────────────

const points = { total: 142, votedThisSession: 0 };
const ledgerExtra: JuryPointsItem[] = [];
const recused = new Set<number>();
let recuseUsed = 0;
const earnedExtra = new Set<string>();

const LEDGER_KINDS: Array<[string, string, number, boolean]> = [
  ['vote_agreed', '判断与结论一致', 10, true], ['daily_first', '今日首票', 2, false], ['vote_agreed', '判断与结论一致', 10, true], ['quality_correct', '质控题答对', 5, true],
  ['vote_disagreed', '参与了已定案的评审', 3, true], ['opinion_liked', '观点获得认可', 5, true], ['vote_agreed', '判断与结论一致', 10, true], ['quality_wrong', '质控题答错', -5, true],
  ['streak_7', '连续参与 7 天', 10, false], ['overturn_adjust', '案件改判后调整', -7, true], ['vote_agreed', '判断与结论一致', 10, true], ['daily_first', '今日首票', 2, false]
];

const ledgerSeed: JuryPointsItem[] = Array.from({ length: 57 }, (_, index) => {
  const [kind, label, value, withCase] = LEDGER_KINDS[index % LEDGER_KINDS.length];
  return { kind, label, points: value, case_id: withCase ? 1290 - index * 3 : null, created_at: ago(index * 9 * HOUR + 40 * 60_000) };
});
ledgerSeed.push({ kind: 'exam_passed', label: '通过入门考试', points: 20, case_id: null, created_at: ago(40 * DAY) });

function ledger(): JuryPointsItem[] {
  if (scenario.backend === 'cold' || !everJuror()) {
    return ledgerExtra;
  }
  return [...ledgerExtra, ...ledgerSeed];
}

function pointsTotal(): number {
  if (scenario.backend === 'cold' || !everJuror()) {
    return Math.max(0, ledgerExtra.reduce((sum, item) => sum + item.points, 0) + (exam.passed ? POINTS.exam_passed : 0));
  }
  return points.total;
}

function addPoints(kind: string, label: string, value: number, caseId: number | null): void {
  points.total = Math.max(0, points.total + value);
  ledgerExtra.unshift({ kind, label, points: value, case_id: caseId, created_at: new Date().toISOString() });
}

function requirement(key: string, label: string, current: number | null, target: number, note?: string): JuryTierRequirement {
  return { key, label, current, target, ok: current === null ? true : current >= target, ...(note ? { note } : {}) };
}

function tierProgress(tier: JuryTier): JuryTierProgress {
  if (tier === 'senior') {
    return { next_tier: null, requirements: [] };
  }
  const next = tier === 'trainee' ? 'regular' as const : 'senior' as const;
  const rule = TIER_RULES[next];
  const mode = growthScenario.progress;
  const numbers = mode === 'early' ? { votes: Math.round(rule.votes_settled * 0.2), rate: 0.67, quality: null, days: Math.round(rule.days_served * 0.3) }
    : mode === 'ready' ? { votes: rule.votes_settled + 3, rate: rule.agreement_rate + 0.09, quality: rule.quality_rate + 0.1, days: rule.days_served + 6 }
    : mode === 'risk' ? { votes: rule.votes_settled + 8, rate: 0.62, quality: 0.6, days: rule.days_served + 20 }
    : { votes: Math.round(rule.votes_settled * 0.6), rate: rule.agreement_rate + 0.08, quality: null, days: rule.days_served + 6 };
  return {
    next_tier: next,
    requirements: [
      requirement('votes_settled', '已出结论的票', numbers.votes, rule.votes_settled),
      requirement('agreement_rate', '一致率', numbers.rate, rule.agreement_rate),
      requirement('quality_rate', '质控正确率', numbers.quality, rule.quality_rate, numbers.quality === null ? `答满 ${rule.quality_min} 道后开始计算` : undefined),
      requirement('days_served', '在任天数', numbers.days, rule.days_served)
    ]
  };
}

const ACHIEVEMENTS: Array<{ key: string; label: string; description: string; target: number; some: number; earned: boolean }> = [
  { key: 'first_vote', label: '第一案', description: '投出第一张票', target: 1, some: 1, earned: true },
  { key: 'votes_10', label: '十案', description: '10 张票所在的案件已出结论', target: 10, some: 10, earned: true },
  { key: 'votes_50', label: '五十案', description: '50 张票所在的案件已出结论', target: 50, some: 50, earned: true },
  { key: 'votes_100', label: '百案', description: '100 张票所在的案件已出结论', target: 100, some: 97, earned: false },
  { key: 'sharp_eye', label: '明察', description: '已结 30 张以上，一致率不低于 90%', target: 30, some: 30, earned: false },
  { key: 'streak_7', label: '七日不辍', description: '连续 7 天都有投票', target: 7, some: 7, earned: true },
  { key: 'streak_30', label: '月不间断', description: '连续 30 天都有投票', target: 30, some: 9, earned: false },
  { key: 'quality_10', label: '十题连对', description: '质控题连续答对 10 道', target: 10, some: 6, earned: false },
  { key: 'liked_10', label: '言之有理', description: '观点累计获得 10 个赞同', target: 10, some: 10, earned: true },
  { key: 'exam_first_try', label: '一次通过', description: '入门考试第一次就通过', target: 1, some: 1, earned: true },
  { key: 'tier_regular', label: '正式委员', description: '晋升为正式委员', target: 1, some: 0, earned: false },
  { key: 'tier_senior', label: '资深委员', description: '晋升为资深委员', target: 1, some: 0, earned: false }
];

function achievements(): JuryAchievement[] {
  const mode = scenario.backend === 'cold' || !everJuror() ? 'none' : growthScenario.achievements;
  return ACHIEVEMENTS.map((item, index) => {
    const earned = earnedExtra.has(item.key) || mode === 'all' || (mode === 'some' && item.earned);
    return { key: item.key, label: item.label, description: item.description, earned_at: earned ? ago((index + 2) * 3 * DAY) : null, current: earned ? item.target : mode === 'some' ? Math.min(item.some, item.target - (item.target > 1 ? 1 : 0)) : 0, target: item.target };
  });
}

// ───────────────────────── 排行榜 ─────────────────────────

const NAMES = ['陆星野', '一只爱写积木的柠檬茶', 'Mint_Coder', '北山', '橘子汽水', 'blocks_and_bugs_and_a_very_long_username', '阿澈', '林深时见鹿', '七月', 'TurboFan', '南风知我意', '小满'];

function publicUser(index: number, tier: JuryTier): User {
  return { id: 200 + index, username: `juror${index}`, nickname: NAMES[index % NAMES.length], avatar_url: null, jury_badge: tier } as User;
}

function leaderboard(period: JuryLeaderboardPeriod): JuryLeaderboard {
  const mode = scenario.backend === 'cold' ? 'empty' : growthScenario.board;
  const scale = period === 'week' ? 1 : period === 'month' ? 3.6 : 11;
  const count = mode === 'empty' ? 0 : mode === 'few' ? 3 : mode === 'outside' ? 50 : 12;
  const myRank = !isActive() ? null : mode === 'few' ? 2 : mode === 'outside' ? 63 : 5;
  const visible = growthScenario.badge === 'visible';
  const items: JuryLeaderboardItem[] = Array.from({ length: count }, (_, index) => {
    const rank = index + 1;
    const me = myRank === rank;
    const tier: JuryTier = me ? (scenario.tier === 'none' ? 'trainee' : scenario.tier) : rank <= 2 ? 'senior' : rank <= 6 ? 'regular' : 'trainee';
    return {
      rank, points: Math.round((96 - index * (count > 20 ? 1.7 : 6.5)) * scale), tier, votes: Math.max(1, Math.round((15 - index * (count > 20 ? 0.25 : 1)) * scale)), me,
      // 一半的人公开了身份；自己那一行看「公开身份」的场景
      user: me ? (visible ? { id: 1, username: 'kuke', nickname: '酷可mc', avatar_url: null, jury_badge: tier } as User : null) : index % 2 === 0 || index === 5 ? publicUser(index, tier) : null
    };
  });
  const myTier: JuryTier = scenario.tier === 'none' ? 'trainee' : scenario.tier;
  const mine: JuryLeaderboardItem | null = myRank === null || mode === 'empty' ? null
    : items.find((item) => item.me) ?? { rank: myRank, points: Math.round(4 * scale), tier: myTier, votes: Math.max(1, Math.round(scale)), me: true, user: visible ? { id: 1, username: 'kuke', nickname: '酷可mc', avatar_url: null, jury_badge: myTier } as User : null };
  return { period, items, me: mine, generated_at: new Date().toISOString() };
}

// ───────────────────────── 一期接口的响应上补字段 ─────────────────────────

function restrictionFor(status: JuryStatus): JuryStatus['restriction'] {
  if (status.status !== 'active') return null;
  if (growthScenario.standing === 'muted') return { reason: 'muted', until: later(20 * HOUR), message: '受处罚期间不能参与评审' };
  if (growthScenario.standing === 'banned') return { reason: 'banned', until: later(3 * DAY), message: '受处罚期间不能参与评审' };
  return null;
}

/** 预警：数字是「服务端判断时实际用的」——最近若干张票的比率，和 /jury/me.stats 里的累计数不是一回事 */
function warningsFor(tier: JuryTier | null): JuryStatus['warnings'] {
  const abstain = '最近 50 张票里，「拿不准」和「上下文不足」偏多。超过 50% 会暂停发案 24 小时 —— 拿不准时可以先去练习场校准一下尺度。';
  if (growthScenario.standing === 'warn_old') {
    // 早期的形状：一串字符串
    return [abstain] as unknown as JuryStatus['warnings'];
  }
  const warnings: NonNullable<JuryStatus['warnings']> = [];
  if (growthScenario.standing === 'warn') {
    warnings.push({ code: 'high_abstain', message: abstain, current: 0.34, threshold: 0.3, sample: 50 });
  }
  if (growthScenario.progress === 'risk') {
    const line = tier === 'senior' ? 0.7 : 0.6;
    if (tier !== 'trainee') {
      warnings.push({ code: 'demote_risk', message: `最近的一致率接近降级线：低于 ${Math.round(line * 100)}% 会降为${tier === 'senior' ? '正式' : '见习'}委员。`, current: line + 0.02, threshold: line, sample: 30 });
    }
    warnings.push({ code: 'suspend_risk', message: '质控题正确率接近暂停线：低于 60% 评审资格会被系统暂停。可以去练习场对照标准结论校准一下尺度。', current: 0.6, threshold: 0.6, sample: null });
  }
  return warnings;
}

function patchStatus(status: JuryStatus): JuryStatus {
  // restriction 是一期后来补的字段，和二期开不开无关
  const base: JuryStatus = scenario.backend === 'legacy' ? status : { ...status, restriction: restrictionFor(status) };
  if (!phase2On()) {
    return base;
  }
  syncExam();
  expireExam();
  const active = status.status === 'active';
  const tier = active ? status.tier ?? null : null;
  const waiting = exam.nextAttemptAt && Date.parse(exam.nextAttemptAt) > examNow() ? exam.nextAttemptAt : null;
  return {
    ...base,
    voted_today: Math.max(0, base.voted_today - recuseUsed),
    exam: { available: examAvailable(), passed: exam.passed, passed_at: exam.passedAt, attempts_used: exam.attemptsUsed, attempts_max: EXAM_RULES.attempts_max, next_attempt_at: waiting, last_score: exam.last?.score ?? null, pass_score: EXAM_RULES.pass_score, total: EXAM_RULES.total },
    exam_required: growthScenario.examRequired === 'yes',
    points: pointsTotal(),
    tier_progress: tier ? tierProgress(tier) : null,
    badge_visible: growthScenario.badge === 'visible',
    warnings: active ? warningsFor(tier) : [],
    cooldown_until: active && growthScenario.standing === 'cooldown' ? later(17 * HOUR) : null,
    recuse_left_today: active ? Math.max(0, (growthScenario.recuse === 'none' ? 0 : RECUSE_LIMIT) - recuseUsed) : null
  };
}

function patchDetail(detail: JuryCaseDetail): JuryCaseDetail {
  const quality = detail.is_quality_check;
  // 「上下文不足」和弃权一样不算一致与否
  const agreed = detail.my_vote.vote === 'need_context' ? null : detail.my_vote.agreed;
  const earned = !phase2On() ? undefined : quality ? (agreed === true ? POINTS.quality_correct : agreed === false ? POINTS.quality_wrong : 0) : detail.stage === 'closed' ? (agreed === true ? POINTS.vote_agreed : agreed === false ? POINTS.vote_disagreed : 0) : 0;
  return {
    ...detail,
    my_vote: { ...detail.my_vote, agreed, ...(earned === undefined ? {} : { points: earned }) },
    tally: detail.tally && phase2On() ? { ...detail.tally, need_context: detail.case_id % 4 === 0 ? 1 : 0 } : detail.tally,
    verdict: detail.verdict ? { ...detail.verdict, explanation: quality && growthScenario.explanation === 'yes' && scenario.backend !== 'legacy' ? '连续两条都是针对提问的人，而不是针对问题：先是「这种问题也拿出来问」，接着是「回去重读小学」「别在群里丢人」。没有脏话不等于不构成辱骂 —— 贬低人格、让人难堪同样算。只有这一轮、没有持续纠缠，所以是一般而不是严重。' : null } : detail.verdict
  };
}

function dailySeries(overview: JuryOverview): JuryOverview['daily'] {
  const zero = growthScenario.daily === 'zero' || overview.settled.d30 === 0 && overview.backlog.jury === 0;
  const queued = [1, 0, 3, 2, 0, 1, 4, 2, 1, 0, 2, 5, 3, 1, 0, 0, 2, 3, 1, 4, 2, 0, 1, 3, 6, 2, 1, 2, 3, 1];
  const settled = [0, 1, 1, 3, 1, 0, 2, 3, 2, 1, 0, 3, 4, 2, 1, 0, 1, 2, 2, 3, 3, 1, 0, 2, 4, 3, 2, 1, 2, 2];
  return queued.map((value, index) => ({ date: new Date(Date.now() - (29 - index) * DAY).toISOString().slice(0, 10), queued: zero ? 0 : scenario.backend === 'cold' ? (index > 26 ? 1 : 0) : value, settled: zero || scenario.backend === 'cold' ? 0 : settled[index] }));
}

function voteItem(item: JuryVoteItem, index: number, plain: boolean): JuryVoteItem {
  if (recused.has(item.case_id) || (plain && index === 3 && !item.is_quality_check)) {
    return { ...item, vote: 'recuse', agreed: null, outcome: null, stage: 'jury', verdict_source: null, verdict_level: null, closed_at: null, opinion_count: 0, can_view: false };
  }
  if (plain && index === 6 && !item.is_quality_check) {
    return { ...item, vote: 'need_context', agreed: null, can_view: true };
  }
  return { ...item, can_view: true };
}

/** 预览页和测试用：模拟「案件定案，给我加分」「获得成就」之后，假接口这边的数字也跟着变。 */
export function applyGrowthEvent(rawType: string, data: Record<string, unknown>): void {
  if (rawType === 'jury.points.changed' && typeof data.delta === 'number') {
    addPoints(String(data.kind ?? 'vote_agreed'), data.delta < 0 ? '案件改判后调整' : '判断与结论一致', data.delta, typeof data.case_id === 'number' ? data.case_id : null);
  }
  if (rawType === 'jury.achievement.earned' && typeof data.key === 'string') {
    earnedExtra.add(data.key);
  }
}

export const growthPoints = (): number => pointsTotal();

/** 明细里最新一笔的文字：模拟的实时事件带上它，和服务端「事件的 label 与明细同源」一致 */
export const latestPointsLabel = (): string | null => ledgerExtra[0]?.label ?? null;

/** 测试用：进行中这一场考试每道题的标准结论（violation / clean），脚本据此填对或填错。 */
export function examAnswerKey(): Array<'violation' | 'clean'> {
  return (exam.active?.bank ?? []).map((id) => (BANK.find((item) => item.id === id) as BankItem).answer.outcome);
}

// ───────────────────────── 假接口 ─────────────────────────

const PHASE2_PATHS = /^\/jury\/(exam|practice|leaderboard|me\/(points|achievements|settings))/;

export function withGrowth(base: MockHandler): MockHandler {
  return async (request) => {
    const { path, url, method, body } = request;
    const data = (body ?? {}) as Record<string, unknown>;
    const on = phase2On();
    // 借一期的假接口拿当前身份；这是假接口内部的调用，不记进请求日志
    const baseStatus = async (): Promise<JuryStatus> => {
      const logged = requestLog.length;
      const status = await (await base({ path: '/jury/me', url, method: 'GET', body: undefined }) as Response).json() as JuryStatus;
      requestLog.length = logged;
      return patchStatus(status);
    };

    if (PHASE2_PATHS.test(path)) {
      requestLog.push({ method, path, body });
      if (!on) return notFound();

      // —— 入门考试 ——
      if (path === '/jury/exam') return json(examState((await baseStatus()).eligible));
      if (path === '/jury/exam/start' && method === 'POST') {
        const status = await baseStatus();
        syncExam();
        expireExam();
        if (!status.eligible) return error(403, 'jury_not_eligible', '还不满足申请条件，暂时不能参加考试');
        if (!examAvailable()) return error(409, 'exam_unavailable', '题库里已核对的题目不够，暂时不能考试');
        if (exam.passed) return error(409, 'exam_passed', '你已经通过入门考试了');
        if (!exam.active) {
          if (exam.attemptsUsed >= EXAM_RULES.attempts_max) return error(429, 'exam_attempts_exhausted', `${EXAM_RULES.window_days} 天内最多考 ${EXAM_RULES.attempts_max} 次`);
          if (exam.nextAttemptAt && Date.parse(exam.nextAttemptAt) > examNow()) return error(429, 'exam_cooldown', '距离上次考试还不到 24 小时', { next_attempt_at: exam.nextAttemptAt });
          exam.attemptsUsed += 1;
          const start = (nextAttemptId * 3) % VERIFIED.length;
          const picked = [...VERIFIED.slice(start), ...VERIFIED.slice(0, start)].slice(0, EXAM_RULES.total);
          exam.active = { attempt_id: (nextAttemptId += 1), expires_at: new Date(examNow() + EXAM_RULES.time_limit_minutes * 60_000).toISOString(), bank: picked.map((item) => item.id) };
        }
        return json({ attempt_id: exam.active.attempt_id, expires_at: exam.active.expires_at, questions: examQuestions(exam.active.bank), server_time: new Date(examNow()).toISOString() });
      }
      const submit = path.match(/^\/jury\/exam\/(\d+)\/submit$/);
      if (submit && method === 'POST') {
        if (scenario.voteFails) return error(503, 'server_busy', '服务器开小差了，请稍后重试');
        // 过了宽限期才交：超时作废（reason: expired）
        const expired = Boolean(exam.active) && examNow() > Date.parse(exam.active!.expires_at) + EXAM_RULES.grace_seconds * 1000;
        expireExam();
        if (growthScenario.reject === 'exam_not_found' || (exam.active && exam.active.attempt_id !== Number(submit[1]))) {
          exam.active = null;
          return error(404, 'exam_not_found', '这一场考试不存在');
        }
        if (growthScenario.reject === 'exam_submitted' || growthScenario.reject === 'exam_closed_old') {
          // 这一场已经在别处（另一个窗口 / 设备）交过卷。exam_closed_old 是早期的后端：没有 reason 字段
          exam.active = null;
          return error(409, 'exam_closed', '这一场考试已经交过卷了', growthScenario.reject === 'exam_submitted' ? { reason: 'submitted' } : {});
        }
        if (!exam.active) return error(409, 'exam_closed', expired ? '这一场考试已经超时作废' : '这一场考试已经交过卷了', { reason: expired ? 'expired' : 'submitted' });
        const answers = Array.isArray(data.answers) ? data.answers as Array<{ question: number; vote: JuryBallot }> : [];
        if (answers.some((item) => !Number.isInteger(item.question) || item.question < 1 || item.question > exam.active!.bank.length || !['none', 'l1', 'l2', 'l3'].includes(item.vote)) || new Set(answers.map((item) => item.question)).size !== answers.length) {
          return error(422, 'invalid_answers', '答案里有不存在的题号、重复的题号或不合法的选项');
        }
        const results = exam.active.bank.map((id, index) => {
          const item = BANK.find((entry) => entry.id === id) as BankItem;
          const mine = answers.find((entry) => entry.question === index + 1)?.vote ?? null;
          return { question: index + 1, correct: isRight(item, mine), your_vote: mine, answer: item.answer };
        });
        const score = results.filter((item) => item.correct).length;
        const passed = score >= EXAM_RULES.pass_score;
        const first = exam.attemptsUsed === 1;
        exam.active = null;
        exam.last = { score, passed, submitted_at: new Date().toISOString() };
        if (passed) {
          exam.passed = true;
          exam.passedAt = exam.last.submitted_at;
          exam.nextAttemptAt = null;
          if (first) earnedExtra.add('exam_first_try');
          if (growthScenario.autoAppoint === 'on' && (scenario.identity === 'eligible' || scenario.identity === 'rejected')) {
            scenario.identity = 'active';
            scenario.tier = 'trainee';
          }
        } else {
          exam.nextAttemptAt = new Date(examNow() + (exam.attemptsUsed >= EXAM_RULES.attempts_max ? 9 * DAY : EXAM_RULES.retry_hours * HOUR)).toISOString();
        }
        return json({ score, total: results.length, pass_score: EXAM_RULES.pass_score, passed, results, attempts_left: Math.max(0, EXAM_RULES.attempts_max - exam.attemptsUsed), next_attempt_at: passed ? null : exam.nextAttemptAt, status: await baseStatus() });
      }

      // —— 练习场 ——
      if (path === '/jury/practice/next') {
        const status = await baseStatus();
        syncPractice();
        if (growthScenario.practice === 'error') return error(500, 'server_error', '服务器开小差了，请稍后再试');
        if (growthScenario.practice === 'forbidden' || (!status.eligible && !everJuror())) return error(403, 'jury_not_eligible', '满足风纪委员申请条件后才能进入练习场');
        const stats = { answered: practice.answered, correct: practice.correct };
        if (growthScenario.practice === 'empty') return json({ question: null, left_today: practice.left, daily_limit: PRACTICE_LIMIT, stats, round: { total: 0, done: 0 } });
        if (practice.left <= 0) return error(429, 'practice_daily_limit', `最近 24 小时已经练了 ${PRACTICE_LIMIT} 题，稍后再来`);
        // 没做过的题优先；都做过后按最久没做的顺序重出
        const item = BANK.find((entry) => !practice.seen.has(entry.id)) ?? (BANK.find((entry) => entry.id === practice.order[0]) as BankItem);
        const round = { total: BANK.length, done: practice.seen.size };
        const question: JuryPracticeQuestion = { question_id: 9000 + item.id, verified: item.verified, answered_before: practice.seen.has(item.id), ...contentOf(item) };
        return json({ question, left_today: practice.left, daily_limit: PRACTICE_LIMIT, stats, round });
      }
      const answer = path.match(/^\/jury\/practice\/(\d+)\/answer$/);
      if (answer && method === 'POST') {
        if (scenario.voteFails) return error(503, 'server_busy', '服务器开小差了，请稍后重试');
        const item = BANK.find((entry) => 9000 + entry.id === Number(answer[1]));
        if (!item) return notFound();
        if (practice.left <= 0) return error(429, 'practice_daily_limit', `最近 24 小时已经练了 ${PRACTICE_LIMIT} 题，稍后再来`);
        const correct = isRight(item, data.vote as JuryBallot);
        practice.left -= 1;
        practice.seen.add(item.id);
        practice.order = [...practice.order.filter((id) => id !== item.id), item.id];
        practice.answered += 1;
        practice.correct += correct ? 1 : 0;
        return json({ correct, answer: item.answer, left_today: practice.left, stats: { answered: practice.answered, correct: practice.correct } });
      }

      // —— 风纪值、成就、排行榜、公开身份 ——
      if (path === '/jury/me/points') {
        const all = ledger();
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 20);
        return json({ total: pointsTotal(), items: all.slice(offset, offset + limit), count: all.length });
      }
      if (path === '/jury/me/achievements') return json({ items: achievements() });
      if (path === '/jury/leaderboard') {
        const period = url.searchParams.get('period');
        return json(leaderboard(period === 'month' || period === 'all' ? period : 'week'));
      }
      if (path === '/jury/me/settings' && method === 'PUT') {
        if (growthScenario.reject === 'settings_not_juror' || !everJuror()) return error(403, 'not_juror', '只有当过风纪委员才能设置');
        if (scenario.voteFails) return error(503, 'server_busy', '服务器开小差了，请稍后重试');
        growthScenario.badge = data.badge_visible ? 'visible' : 'hidden';
        return json(await baseStatus());
      }
      return notFound();
    }

    // —— 申请：考试是硬条件时没考不能申请；通过了且开着自动任命时直接成为见习委员 ——
    if (on && path === '/jury/apply' && method === 'POST' && (scenario.identity === 'eligible' || scenario.identity === 'rejected')) {
      syncExam();
      if (growthScenario.examRequired === 'yes' && !exam.passed) {
        requestLog.push({ method, path, body });
        return error(403, 'exam_required', '需要先通过入门考试才能申请');
      }
      if (exam.passed && growthScenario.autoAppoint === 'on') {
        requestLog.push({ method, path, body });
        scenario.identity = 'active';
        scenario.tier = 'trainee';
        return json(await baseStatus());
      }
    }

    // —— 评审台：暂停发案、受限、主动回避 ——
    if (path === '/jury/cases/next' && isActive() && scenario.backend !== 'legacy') {
      if (growthScenario.standing === 'muted' || growthScenario.standing === 'banned') {
        requestLog.push({ method, path, body });
        return error(403, 'juror_restricted', '受处罚期间不能参与评审');
      }
      if (on && growthScenario.standing === 'cooldown') {
        requestLog.push({ method, path, body });
        return error(429, 'jury_cooldown', '最近弃权太多，暂停发案 24 小时', { until: later(17 * HOUR) });
      }
    }
    const voteMatch = path.match(/^\/jury\/cases\/(\d+)\/vote$/);
    if (on && voteMatch && method === 'POST' && typeof data.category === 'string' && (growthScenario.reject === 'invalid_category' || !CATEGORY_KEYS.includes(data.category))) {
      requestLog.push({ method, path, body });
      return error(422, 'invalid_category', '违规类别不在可选范围内');
    }
    if (on && voteMatch && method === 'POST' && data.vote === 'recuse' && !scenario.voteFails) {
      if (growthScenario.recuse === 'none' || recuseUsed >= RECUSE_LIMIT) {
        requestLog.push({ method, path, body });
        return error(429, 'recuse_limit', `最近 24 小时已经回避了 ${RECUSE_LIMIT} 次，暂时不能再回避了`);
      }
      // 让一期的假接口把队列往后推一件；回避本身不计入评审数，也不能再看这个案件
      await base({ ...request, body: { vote: 'abstain' } });
      requestLog[requestLog.length - 1] = { method, path, body };
      recused.add(Number(voteMatch[1]));
      recuseUsed += 1;
      return json({ case_id: Number(voteMatch[1]), settled: false, case: null, reward: null });
    }
    const detailMatch = path.match(/^\/jury\/cases\/(\d+)(\/opinions)?$/);
    if (on && detailMatch && recused.has(Number(detailMatch[1]))) {
      requestLog.push({ method, path, body });
      return error(403, 'not_voted', '只有对这个案件投过票的委员可以查看');
    }

    const response = await base(request);
    if (scenario.backend === 'legacy') return response;

    if (path === '/jury/config') return patched<JuryConfig>(response, patchConfig);
    if (path === '/jury/me' || path === '/jury/apply') return patched<JuryStatus>(response, patchStatus);
    if (path === '/jury/overview') return patched<JuryOverview>(response, (overview) => (growthScenario.daily === 'none' ? overview : { ...overview, daily: dailySeries(overview) }));
    if (/^\/jury\/cases\/\d+$/.test(path)) return patched<JuryCaseDetail>(response, patchDetail);
    if (voteMatch) {
      return patched<{ case_id: number; settled: boolean; case?: JuryCaseDetail | null }>(response, (result) => {
        const detail = result.case ? patchDetail(result.case) : result.case;
        if (!on) {
          return { ...result, case: detail };
        }
        // 当场结算的只有质控题和今日首票；案件定案的加分走实时事件
        const items: JuryReward['items'] = [];
        if (detail?.is_quality_check && detail.my_vote.agreed !== null) {
          items.push(detail.my_vote.agreed ? { kind: 'quality_correct', points: POINTS.quality_correct, label: '质控题答对' } : { kind: 'quality_wrong', points: POINTS.quality_wrong, label: '质控题答错' });
        }
        if (points.votedThisSession === 0 && ['none', 'l1', 'l2', 'l3'].includes(String(data.vote))) {
          items.push({ kind: 'daily_first', points: POINTS.daily_first, label: '今日首票' });
        }
        points.votedThisSession += 1;
        // 今日首票不属于某个案件，明细里的 case_id 是 null
        items.forEach((item) => addPoints(item.kind, item.label, item.points, item.kind === 'daily_first' ? null : result.case_id));
        return { ...result, case: detail, reward: { points: items.reduce((sum, item) => sum + item.points, 0), total: pointsTotal(), items } };
      });
    }
    if (!on) return response;

    if (path === '/jury/cases/next') {
      return patched<{ case: JuryCaseView | null }>(response, (result) => ({ case: result.case ? { ...result.case, suggested_category: result.case.kind === 'post' ? 'advertising' : 'harassment' } : null }));
    }
    if (path === '/jury/votes') {
      const plain = Number(url.searchParams.get('offset') ?? 0) === 0 && !url.searchParams.get('state') && !url.searchParams.get('outcome') && !url.searchParams.get('agreed');
      return patched<JuryVotesPage>(response, (page) => ({ ...page, items: page.items.map((item, index) => voteItem(item, index, plain && scenario.backend !== 'cold')) }));
    }
    return response;
  };
}
