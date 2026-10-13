/**
 * 风纪预览页 · 议事厅的假数据和假接口（docs/jury-v2.md 3.5）。由 jury-mock-senior.ts 的 withPhase3 调用。
 * 议事厅是实名的：这里的作者是带昵称的用户对象，和案件里的匿名代号正相反。
 *
 * 身份和层级读 jury-mock.ts 的 scenario（identity / tier），当前用户是 id 1「酷可mc」；受限读 jury-mock-senior.ts 的 seniorScenario.restricted。
 * 想看错误提示时，在标题 / 正文 / 评论里写关键词：「频率」→ 429 hall_rate_limited，「违规词」→ 422 content_rejected，标题「无效」→ 422 invalid_post。
 * 标题带「表决刚刚结束」的那个提案，投票会返回 409 vote_closed。
 */
import type { User } from '@/types/api';
import type { JuryTier } from '@/types/jury';
import type { HallBallot, HallComment, HallPost, HallPostKind, HallPostStatus, JuryHallRules } from '@/types/juryHall';
import { scenario } from './jury-mock';
import { seniorScenario } from './jury-mock-senior';
import { json, type MockHandler } from './mocks/types';

export interface HallScenario {
  /** 帖子列表：多 / 空 */
  hall: 'many' | 'empty';
}

export const hallScenario: HallScenario = { hall: 'many' };

/** 预览页控制条上的选项：键是 hallScenario 的键，地址参数同名 */
export const HALL_OPTIONS: { [Key in keyof HallScenario]: Array<HallScenario[Key]> } = { hall: ['many', 'empty'] };
export const HALL_LABELS: Record<keyof HallScenario, string> = { hall: '议事厅' };

export const hallRules: JuryHallRules = {
  title_max: 60, content_max: 5000, comment_max: 1000, posts_per_day: 3, comments_per_day: 50,
  vote_days: 7, quorum_ratio: 0.3, quorum_min: 3, pass_num: 2, pass_den: 3, pass_ratio: 0.6667, auto_hide_reports: 3,
  guidelines: '议事厅是公开、实名的讨论区，所有人都能看到你在这里说的话。\n不要讨论具体的未结案件；不要透露或猜测任何案件当事人的身份。\n就事论事，对规则提意见，不对人。',
  report_reasons: ['人身攻击', '讨论未结案件', '泄露身份或隐私', '与风纪无关', '其他']
};

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();
const later = (ms: number): string => new Date(Date.now() + ms).toISOString();
const error = (status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response => json({ detail: { code, message, ...extra } }, status);
const notFound = (code = 'post_not_found'): Response => json({ detail: { code, message: '内容不存在' } }, 404);

// ───────────────────────── 人 ─────────────────────────

const person = (id: number, username: string, nickname: string): User => ({ id, username, nickname, avatar_url: null } as User);

const ME = person(1, 'kuke', '酷可mc');
const ADMIN = person(2, 'kukechat', 'KukeChat 团队');
const PEOPLE: Array<{ user: User; tier: JuryTier }> = [
  { user: person(3, 'linshen', '林深'), tier: 'senior' },
  { user: person(4, 'azhe', '阿哲不吃辣'), tier: 'regular' },
  { user: person(5, 'momo', 'momo酱'), tier: 'trainee' },
  { user: person(6, 'longname', '一只名字很长很长很长很长的风纪委员小透明'), tier: 'regular' },
  { user: person(7, 'sora', 'Sora'), tier: 'senior' },
  { user: person(8, 'juzi', '橘子汽水'), tier: 'trainee' },
  { user: person(9, 'beidao', '北岛'), tier: 'regular' }
];
const who = (index: number): { user: User; tier: JuryTier } => PEOPLE[index % PEOPLE.length];

const isJuror = (): boolean => scenario.identity === 'active';
const isRestricted = (): boolean => isJuror() && seniorScenario.restricted === 'muted';
const myTier = (): JuryTier | null => (isJuror() && scenario.tier !== 'none' ? scenario.tier : null);
const canSpeak = (): boolean => isJuror() && !isRestricted();

// ───────────────────────── 帖子 ─────────────────────────

/** 存在内存里的帖子：和当前用户有关的字段（mine / can_* / my_vote）在返回时再算 */
interface StoredPost {
  id: number;
  kind: HallPostKind;
  title: string;
  content: string;
  author: User;
  authorTier: JuryTier | null;
  status: HallPostStatus;
  pinned: boolean;
  vote: { yes: number; no: number; ends_at: string; quorum: number } | null;
  myVote: HallBallot | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** 这个提案投票时返回 409 vote_closed */
  closing?: boolean;
  /** 被多位在任委员举报后折叠：不给正文，标题是占位文字 */
  hidden?: boolean;
  /** 已经有几名在任委员举报过（到 auto_hide_reports 就折叠） */
  jurorReports?: number;
  /**
   * 用来看「状态刚变化」时的 409：locks = 修改 / 撤回时才发现已经出结果（post_locked）；
   * closes = 评论时才发现已经关闭（post_closed）；vanishes = 打开一次之后就被删掉（重拉得到 404）
   */
  trap?: 'locks' | 'closes' | 'vanishes';
  opened?: boolean;
  /** 作者现在不在任：author_tier 为 null */
  retired?: boolean;
}

const LONG_BODY = `现在的规则里，「刷屏灌水」的默认等级是轻微（L1），处置是提醒。\n\n过去一个月我参与评审的刷屏类案件里，有不少是被提醒过之后隔天又来的。提醒对这类行为几乎没有约束力：它不记入禁言的阶梯，被处罚的人也感觉不到代价。\n\n我的建议：\n1. 把刷屏灌水的默认等级从轻微调到一般（L2），处置从提醒变成警告，记 3 分；\n2. 首次、且被提醒后立刻停止的，委员仍然可以下调到轻微 —— 这一点现在的规则已经允许；\n3. 手册的「委员须知」里补一句：判断刷屏看的是重复和打断，不是字数。\n\n${'之所以不建议直接上禁言，是因为刷屏的危害主要是打扰，不是伤害；警告加记分已经足够让阶梯起作用。'.repeat(3)}\n\n欢迎大家说说自己遇到的情况（请不要引用具体的未结案件）。`;

let nextPostId = 40;
let nextCommentId = 7000;

function seedPosts(): StoredPost[] {
  const post = (extra: Partial<StoredPost> & Pick<StoredPost, 'id' | 'kind' | 'title'>): StoredPost => ({
    content: '如题，想听听大家的看法。', author: who(extra.id).user, authorTier: who(extra.id).tier, status: 'open', pinned: false, vote: null, myVote: null, adminNote: null,
    createdAt: ago((40 - extra.id) * 20 * HOUR + 2 * HOUR), updatedAt: ago((40 - extra.id) * 9 * HOUR + 30 * 60_000), ...extra
  });
  const vote = (yes: number, no: number, endsAt: string): StoredPost['vote'] => ({ yes, no, ends_at: endsAt, quorum: 4 });
  return [
    post({ id: 21, kind: 'announcement', title: '议事厅开放：先读这一条', pinned: true, author: ADMIN, authorTier: null, content: '议事厅今天开放。这里是风纪委员和管理员公开商量规则的地方，全站可读。\n\n三件事请先知道：\n· 这里是实名的，和案件里的匿名评审正相反；\n· 不讨论具体的未结案件；\n· 通过表决的提案由管理员决定是否采纳，并会写明理由。', createdAt: ago(6 * DAY), updatedAt: ago(5 * HOUR) }),
    post({ id: 20, kind: 'proposal', title: '建议把刷屏的默认等级从轻微调到一般', author: PEOPLE[0].user, authorTier: 'senior', content: LONG_BODY, vote: vote(6, 3, later(3 * DAY + 4 * HOUR)), createdAt: ago(4 * DAY), updatedAt: ago(40 * 60_000) }),
    post({ id: 19, kind: 'proposal', title: '质控题答错时，把标准结论的理由也展示出来', author: ME, authorTier: 'regular', content: '现在质控题答错只告诉我标准结论是什么，不知道为什么。建议题库里有讲解的题，答完把讲解一起展示。', vote: vote(1, 0, later(6 * DAY)), createdAt: ago(20 * HOUR), updatedAt: ago(3 * HOUR) }),
    post({ id: 18, kind: 'proposal', title: '每日评审上限从 30 件调到 20 件', author: ME, authorTier: 'regular', content: '案件本来就不多，30 件的上限形同虚设。调低一点可以让案件分给更多人。', vote: vote(0, 0, later(6 * DAY + 20 * HOUR)), createdAt: ago(3 * HOUR), updatedAt: ago(3 * HOUR) }),
    post({ id: 17, kind: 'proposal', title: '见习委员也应该能看到已定案件的票数分布', author: PEOPLE[4].user, authorTier: 'senior', status: 'passed', content: '见习委员最需要校准尺度，定案后的分布对他们最有用。', vote: vote(9, 2, ago(1 * DAY)), createdAt: ago(8 * DAY), updatedAt: ago(1 * DAY) }),
    post({ id: 16, kind: 'proposal', title: '公示栏增加「按类别筛选」', author: PEOPLE[1].user, authorTier: 'regular', status: 'adopted', adminNote: '已经在这一版里加上了。谢谢提案。', content: '公示栏现在只能按类型和结论筛，想看某一类违规的尺度很不方便。', vote: vote(8, 0, ago(9 * DAY)), createdAt: ago(16 * DAY), updatedAt: ago(7 * DAY) }),
    post({ id: 15, kind: 'proposal', title: '委员可以给被举报人留言说明理由', author: PEOPLE[6].user, authorTier: 'regular', status: 'declined', adminNote: '委员和当事人之间不能有任何直接联系，这是匿名评审的前提。处罚通知里会带上认定的类别和等级，申诉渠道也在那里。', content: '被处罚的人经常不知道自己为什么被罚，建议允许委员留一句话。', vote: vote(7, 3, ago(12 * DAY)), createdAt: ago(19 * DAY), updatedAt: ago(10 * DAY) }),
    post({ id: 14, kind: 'proposal', title: '取消「拿不准」选项，强制每个委员给出判断', author: PEOPLE[3].user, authorTier: 'regular', status: 'rejected', content: '弃权太多会拖慢定案。', vote: vote(4, 5, ago(14 * DAY)), createdAt: ago(21 * DAY), updatedAt: ago(14 * DAY) }),
    post({ id: 13, kind: 'proposal', title: '把任期从 30 天延长到 90 天', author: PEOPLE[1].user, authorTier: 'regular', status: 'rejected', content: '30 天太短了，刚熟悉就要续任。', vote: vote(2, 0, ago(18 * DAY)), createdAt: ago(25 * DAY), updatedAt: ago(18 * DAY) }),
    post({ id: 22, kind: 'proposal', title: '（预览）表决刚刚结束的提案：投票会被拒绝', author: PEOPLE[4].user, authorTier: 'senior', content: '这个提案的表决期在你打开页面之后才结束，用来看 409 vote_closed 的处理。', vote: vote(3, 1, later(2 * 60_000)), closing: true, createdAt: ago(7 * DAY), updatedAt: ago(9 * HOUR) }),
    post({ id: 23, kind: 'discussion', title: '（预览）已经被折叠的讨论', author: PEOPLE[3].user, authorTier: 'regular', hidden: true, content: '这段正文不会下发。', createdAt: ago(3 * DAY), updatedAt: ago(26 * HOUR) }),
    post({ id: 24, kind: 'discussion', title: '（预览）再有一位在任委员举报就会折叠的讨论', author: PEOPLE[1].user, authorTier: 'regular', jurorReports: 2, content: '已经有两位在任委员举报过这个帖子。你是在任委员的话，举报之后它会当场折叠；不是的话只会记录下来。', createdAt: ago(2 * DAY), updatedAt: ago(25 * HOUR) }),
    post({ id: 25, kind: 'proposal', title: '（预览）刚出结果的提案：修改和撤回会被拒绝', author: ME, authorTier: 'regular', trap: 'locks', content: '打开时它还在表决、还没有人投票，所以能改能撤回；点下去的那一刻它刚好出了结果，用来看 409 post_locked 的处理。', vote: vote(0, 0, later(60_000)), createdAt: ago(7 * DAY), updatedAt: ago(24 * HOUR) }),
    post({ id: 26, kind: 'discussion', title: '（预览）刚被关闭的讨论：评论会被拒绝', author: PEOPLE[6].user, authorTier: 'regular', trap: 'closes', content: '打开时它还开着；发评论的那一刻它刚好被管理员关闭，用来看 409 post_closed 的处理。', createdAt: ago(4 * DAY), updatedAt: ago(23 * HOUR) }),
    post({ id: 27, kind: 'discussion', title: '（预览）打开之后会被删除的帖子', author: PEOPLE[2].user, authorTier: 'trainee', trap: 'vanishes', content: '第一次打开能看到；之后再拉取（比如收到 jury.hall.changed）就是 404，用来看「正看着的帖子被删除」的处理。', createdAt: ago(5 * DAY), updatedAt: ago(22 * HOUR) }),
    post({ id: 28, kind: 'discussion', title: '（预览）作者现在不在任', author: PEOPLE[5].user, authorTier: 'trainee', retired: true, content: '发帖时是在任委员，后来任期届满没有续任。author_tier 是此刻的层级，所以这里是 null。', createdAt: ago(12 * DAY), updatedAt: ago(21 * HOUR) }),
    post({ id: 12, kind: 'discussion', title: '给见习委员的几个写理由的建议', author: PEOPLE[4].user, authorTier: 'senior', content: '看了不少观点区，说几个常见的问题：\n1. 只写「同意」「+1」对别人没有帮助，至少说一句依据的是哪条规则；\n2. 不要复述违规原文，说它的性质就够了；\n3. 拿不准就写清楚哪里拿不准，这比硬投一票有用。', createdAt: ago(2 * DAY), updatedAt: ago(90 * 60_000) }),
    post({ id: 11, kind: 'discussion', title: '连续评审的时候怎么保持判断一致？', author: ME, authorTier: 'regular', content: '我发现连着看五六件之后，尺度会不自觉地变松。大家有什么办法吗？', createdAt: ago(30 * HOUR), updatedAt: ago(6 * HOUR) }),
    post({ id: 10, kind: 'discussion', title: '关于「玩笑」和「辱骂」的边界', author: PEOPLE[2].user, authorTier: 'trainee', status: 'closed', adminNote: '讨论里出现了正在评审的案件，先关闭。', content: '熟人之间互损算不算辱骂？', createdAt: ago(9 * DAY), updatedAt: ago(8 * DAY) }),
    post({ id: 9, kind: 'announcement', title: '质控题库更新说明', author: ADMIN, authorTier: null, content: '本周新增 12 道已核对的质控题，全部来自委员一致通过的案件。', createdAt: ago(5 * DAY), updatedAt: ago(5 * DAY) }),
    post({ id: 8, kind: 'discussion', title: `长标题测试：${'这是一个非常非常长的帖子标题用来看看列表和详情里的换行与截断'.repeat(2)}`, author: PEOPLE[3].user, authorTier: 'regular', content: `${'这是一段很长的正文，用来看列表里的两行截断和详情里的排版。'.repeat(40)}\nhttps://example.com/a-very-long-link-without-any-break-opportunity-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`, createdAt: ago(11 * DAY), updatedAt: ago(10 * DAY) }),
    ...Array.from({ length: 12 }, (_, index) => post({ id: index < 7 ? 7 - index : 23 + index, kind: 'discussion', title: ['评审台的快捷键用得顺手吗', '公开动态的案件为什么这么少', '「上下文不足」什么时候该用', '图片类的案件怎么判断', '一致率低是不是说明我不适合', '练习场的题目难度', '遇到看不懂的梗怎么办', '关于回避规则的一点疑问', '观点区里被反驳了要不要回', '质控题会不会太明显', '每周定案数量的观察', '新委员第一周的感受'][index], createdAt: ago((12 + index) * DAY), updatedAt: ago((11 + index) * DAY) }))
  ];
}

const posts: StoredPost[] = seedPosts();

function toPost(item: StoredPost, full: boolean): HallPost {
  const mine = item.author.id === ME.id;
  const cast = item.vote ? item.vote.yes + item.vote.no : 0;
  const votingOpen = item.status === 'open' && Boolean(item.vote) && (item.closing || Date.parse(item.vote?.ends_at ?? '') > Date.now());
  const truncated = !full && !item.hidden && item.content.length > 200;
  const open = item.status === 'open';
  return {
    id: item.id, kind: item.kind, title: item.hidden ? '（内容已折叠）' : item.title, content: item.hidden ? null : full ? item.content : item.content.slice(0, 200),
    state: item.hidden ? 'hidden' : 'visible', content_truncated: truncated,
    author: item.author, author_tier: item.kind === 'announcement' || item.retired ? null : mine ? myTier() ?? item.authorTier : item.authorTier,
    status: item.status, pinned: item.pinned,
    vote: item.vote ? { yes: item.vote.yes, no: item.vote.no, ends_at: item.vote.ends_at, my_vote: item.myVote, can_vote: votingOpen && canSpeak(), quorum: item.vote.quorum, pass_num: hallRules.pass_num, pass_den: hallRules.pass_den } : null,
    admin_note: item.adminNote, comment_count: commentsOf(item.id).length,
    can_comment: canSpeak() && item.status !== 'closed' && !item.hidden, mine,
    // 提案：有人表决后不能改；还在表决时可以撤回，出结果后不能删。被折叠的帖子不能改
    can_edit: mine && canSpeak() && open && !item.hidden && !(item.kind === 'proposal' && cast > 0),
    can_delete: mine && isJuror() && (item.kind !== 'proposal' || open),
    reported: reportedKeys.has(`post:${item.id}`),
    created_at: item.createdAt, updated_at: item.updatedAt
  };
}

// ───────────────────────── 评论 ─────────────────────────

interface StoredComment {
  id: number;
  parentId: number | null;
  author: User;
  authorTier: JuryTier | null;
  content: string;
  state: HallComment['state'];
  createdAt: string;
  replyTo: User | null;
}

const comments = new Map<number, StoredComment[]>();

const LINES = ['同意，提醒确实没什么用。', '我担心调高之后会有人被误伤，比如只是连发了几张表情。', '可以在手册里写清楚「重复 + 打断」两个条件都满足才算。', '支持第 2 点，保留下调的空间很重要。', '见习的时候我也分不清刷屏和聊得多。', '记分会在 90 天后失效，所以调到一般也不算重。', '有没有数据：被提醒之后再犯的比例是多少？', '这个可以请管理员统计一下。', '反对。默认等级应该保守，让委员自己上调。', '+1', '我觉得应该区分群聊和动态，动态下面刷评论的影响更大。', '同上', `说一个长一点的看法：${'默认等级只是起点，真正决定结果的是委员的判断，所以更重要的是把判断标准写清楚。'.repeat(4)}`, '学到了。'];

function seedComments(postId: number, count: number): StoredComment[] {
  const list: StoredComment[] = [];
  const add = (index: number, extra: Partial<StoredComment> = {}): StoredComment => {
    const author = who(index + postId);
    nextCommentId += 1;
    const item: StoredComment = { id: nextCommentId, parentId: null, author: author.user, authorTier: author.tier, content: LINES[index % LINES.length], state: 'visible', createdAt: ago((count - index) * 47 * 60_000 + 20 * 60_000), replyTo: null, ...extra };
    list.push(item);
    return item;
  };
  for (let index = 0; index < count; index += 1) {
    const roots = list.filter((item) => item.parentId === null);
    // 每三条里有一条是回复；其中一部分是「回复别人的回复」
    if (index % 3 === 2 && roots.length > 0) {
      const root = roots[(index * 7) % roots.length];
      const siblings = list.filter((item) => item.parentId === root.id);
      add(index, { parentId: root.id, replyTo: index % 6 === 5 && siblings.length > 0 ? siblings[siblings.length - 1].author : null });
    } else {
      add(index);
    }
  }
  // 楼主自己、当前用户、已删除、已折叠各有一条
  if (list.length > 6) {
    Object.assign(list[1], { author: posts.find((item) => item.id === postId)?.author ?? list[1].author });
    Object.assign(list[3], { author: ME, authorTier: null, content: '我也遇到过，被提醒的第二天又来了。' });
    Object.assign(list[4], { state: 'deleted' });
    Object.assign(list[6], { state: 'hidden' });
  }
  return list;
}

const SEED_COUNTS: Record<number, number> = { 21: 5, 20: 47, 19: 2, 17: 9, 16: 4, 15: 6, 14: 12, 12: 8, 11: 3, 10: 7, 8: 1 };

function commentsOf(postId: number): StoredComment[] {
  let list = comments.get(postId);
  if (!list) {
    list = seedComments(postId, SEED_COUNTS[postId] ?? 0);
    comments.set(postId, list);
  }
  return list;
}

function toComment(item: StoredComment): HallComment {
  const mine = item.author.id === ME.id;
  const visible = item.state === 'visible';
  return { id: item.id, parent_id: item.parentId, author: item.author, author_tier: mine ? myTier() : item.authorTier, content: visible ? item.content : null, state: item.state, mine, reported: reportedKeys.has(`comment:${item.id}`), created_at: item.createdAt, reply_to: item.replyTo };
}

// ───────────────────────── 假接口 ─────────────────────────

const reportedKeys = new Set<string>();

function speakError(): Response | null {
  if (!isJuror()) return error(403, 'not_juror', '只有在任的风纪委员可以参与');
  if (isRestricted()) return error(403, 'juror_restricted', '受处罚期间不能参与评审');
  return null;
}

function contentError(text: string): Response | null {
  // 上限按最近 24 小时滚动；detail 里带下一个名额恢复的时间
  if (text.includes('频率')) return error(429, 'hall_rate_limited', '最近 24 小时内发得太多了', { resets_at: later(5 * HOUR + 12 * 60_000) });
  if (text.includes('违规词')) return error(422, 'content_rejected', '内容没有通过审核');
  return null;
}

/** 只处理 /jury/hall 开头的请求，其余返回 undefined */
export const hallMock: MockHandler = ({ path, url, method, body }) => {
  if (!path.startsWith('/jury/hall')) {
    return undefined;
  }
  const data = (body ?? {}) as Record<string, unknown>;
  const visible = (): StoredPost[] => (hallScenario.hall === 'empty' ? posts.filter((item) => item.id >= 40) : posts);

  if (path === '/jury/hall/posts' && method === 'GET') {
    const kind = url.searchParams.get('kind');
    const status = url.searchParams.get('status');
    const sort = url.searchParams.get('sort') === 'new' ? 'createdAt' : 'updatedAt';
    const all = visible().filter((item) => (!kind || item.kind === kind) && (!status || item.status === status))
      .sort((left, right) => Number(right.pinned) - Number(left.pinned) || Date.parse(right[sort]) - Date.parse(left[sort]));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 20);
    return json({ items: all.slice(offset, offset + limit).map((item) => toPost(item, false)), total: all.length });
  }
  if (path === '/jury/hall/posts' && method === 'POST') {
    const blocked = speakError();
    if (blocked) return blocked;
    if (myTier() === 'trainee') return error(403, 'tier_required', '见习委员还不能发帖');
    const title = String(data.title ?? '').trim();
    const content = String(data.content ?? '').trim();
    if (!title || !content || title.length > hallRules.title_max || content.length > hallRules.content_max || title.includes('无效')) return error(422, 'invalid_post', '标题或正文不符合要求');
    const rejected = contentError(`${title}${content}`);
    if (rejected) return rejected;
    const now = new Date().toISOString();
    const kind = data.kind === 'proposal' ? 'proposal' : 'discussion';
    const created: StoredPost = { id: (nextPostId += 1), kind, title, content, author: ME, authorTier: myTier(), status: 'open', pinned: false, vote: kind === 'proposal' ? { yes: 0, no: 0, ends_at: later(hallRules.vote_days * DAY), quorum: 4 } : null, myVote: null, adminNote: null, createdAt: now, updatedAt: now };
    posts.push(created);
    return json(toPost(created, true), 201);
  }
  if (path === '/jury/hall/reports' && method === 'POST') {
    const key = `${String(data.target_type)}:${String(data.target_id)}`;
    const own = data.target_type === 'post' ? posts.find((item) => item.id === data.target_id)?.author.id === ME.id : [...comments.values()].flat().find((item) => item.id === data.target_id)?.author.id === ME.id;
    if (own) return error(400, 'cannot_report_own', '不能举报自己发的内容');
    if (!hallRules.report_reasons.includes(String(data.reason))) return error(422, 'invalid_reason', '举报理由不在列表里');
    if (reportedKeys.has(key)) return error(409, 'already_reported', '你已经举报过了');
    // 举报也有 24 小时滚动的上限，和发帖 / 评论的限流是同一个错误码。补充说明里写「频率」来看这个提示
    if (String(data.details ?? '').includes('频率')) return error(429, 'hall_rate_limited', '最近 24 小时内举报得太多了', { resets_at: later(3 * HOUR + 40 * 60_000) });
    reportedKeys.add(key);
    // 自动折叠只数在任委员的举报；其他用户的举报只记录。公告不会被自动折叠
    const reportedPost = data.target_type === 'post' ? posts.find((item) => item.id === data.target_id) : undefined;
    if (reportedPost && isJuror() && reportedPost.kind !== 'announcement') {
      reportedPost.jurorReports = (reportedPost.jurorReports ?? 0) + 1;
      reportedPost.hidden = reportedPost.jurorReports >= hallRules.auto_hide_reports;
    }
    const reportedComment = data.target_type === 'comment' ? [...comments.values()].flat().find((item) => item.id === data.target_id) : undefined;
    return json({ target_type: data.target_type, target_id: data.target_id, state: reportedPost?.hidden ? 'hidden' : reportedComment?.state ?? 'visible' }, 201);
  }

  const postMatch = path.match(/^\/jury\/hall\/posts\/(\d+)(\/vote|\/comments)?$/);
  if (postMatch) {
    const target = visible().find((item) => item.id === Number(postMatch[1]));
    if (!target) return notFound();
    if (!postMatch[2]) {
      if (method === 'GET') {
        // 「打开之后会被删除」：第一次给，之后就当它已经被删了
        if (target.trap === 'vanishes' && target.opened) {
          posts.splice(posts.indexOf(target), 1);
          return notFound();
        }
        target.opened = true;
        return json(toPost(target, true));
      }
      if (target.author.id !== ME.id) return error(403, 'not_post_author', '只能修改自己的帖子');
      // 「刚出结果」：点下去的这一刻表决结束了
      if (target.trap === 'locks') {
        Object.assign(target, { status: 'rejected', trap: undefined, vote: target.vote ? { ...target.vote, ends_at: ago(30_000) } : null });
      }
      const settled = target.kind === 'proposal' && target.status !== 'open';
      if (method === 'DELETE') {
        if (settled) return error(409, 'post_locked', '提案已经出结果，不能再撤回');
        posts.splice(posts.indexOf(target), 1);
        return json({ id: target.id, state: 'deleted' });
      }
      const blocked = speakError();
      if (blocked) return blocked;
      if (settled || target.hidden || (target.vote && target.vote.yes + target.vote.no > 0)) return error(409, 'post_locked', '这个帖子现在不能修改');
      const title = String(data.title ?? '').trim();
      const content = String(data.content ?? '').trim();
      if (!title || !content || title.includes('无效')) return error(422, 'invalid_post', '标题或正文不符合要求');
      const rejected = contentError(`${title}${content}`);
      if (rejected) return rejected;
      Object.assign(target, { title, content, updatedAt: new Date().toISOString() });
      return json(toPost(target, true));
    }
    if (postMatch[2] === '/vote' && method === 'POST') {
      const blocked = speakError();
      if (blocked) return blocked;
      if (!target.vote || target.status !== 'open') return error(409, 'vote_closed', '表决已经结束');
      if (target.closing) {
        Object.assign(target, { status: 'passed', closing: false, vote: { ...target.vote, ends_at: ago(60_000) } });
        return error(409, 'vote_closed', '表决已经结束');
      }
      const ballot: HallBallot = data.vote === 'no' ? 'no' : 'yes';
      if (target.myVote) target.vote[target.myVote] -= 1;
      target.vote[ballot] += 1;
      target.myVote = ballot;
      return json(toPost(target, true));
    }
    if (postMatch[2] === '/comments') {
      const list = commentsOf(target.id);
      if (method === 'POST') {
        const blocked = speakError();
        if (blocked) return blocked;
        // 「刚被关闭」：发评论的这一刻帖子被关了
        if (target.trap === 'closes') {
          Object.assign(target, { status: 'closed', trap: undefined, adminNote: '讨论跑题了，先关闭。' });
        }
        if (target.status === 'closed' || target.hidden) return error(409, 'post_closed', '这个帖子已经关闭或被折叠，不能再评论');
        const content = String(data.content ?? '').trim();
        if (!content || content.length > hallRules.comment_max) return error(422, 'invalid_comment', '评论内容不能为空，也不能超过 1000 字');
        const rejected = contentError(content);
        if (rejected) return rejected;
        const parent = typeof data.parent_id === 'number' ? list.find((item) => item.id === data.parent_id) ?? null : null;
        const created: StoredComment = { id: (nextCommentId += 1), parentId: parent ? parent.parentId ?? parent.id : null, author: ME, authorTier: myTier(), content, state: 'visible', createdAt: new Date().toISOString(), replyTo: parent && parent.parentId !== null ? parent.author : null };
        list.push(created);
        target.updatedAt = created.createdAt;
        return json(toComment(created), 201);
      }
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 30);
      return json({ items: list.slice(offset, offset + limit).map(toComment), total: list.length });
    }
  }

  const commentMatch = path.match(/^\/jury\/hall\/comments\/(\d+)$/);
  if (commentMatch && method === 'DELETE') {
    const target = [...comments.values()].flat().find((item) => item.id === Number(commentMatch[1]));
    if (!target) return notFound('comment_not_found');
    if (target.author.id !== ME.id) return error(403, 'not_comment_author', '只能删除自己的评论');
    target.state = 'deleted';
    return json({ id: target.id, state: 'deleted' });
  }
  return notFound();
};
