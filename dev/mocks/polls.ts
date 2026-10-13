import { isRecord } from '@/api/normalizers';
import { emitRealtimeEvent } from '@/realtime/events';
import type { Message, User } from '@/types/api';
import type { Poll, PollState, PollSummary } from '@/types/polls';
import { json, type MockHandler } from './types';

/*
 * 投票接口的假实现，状态只存在内存里，刷新页面就没了。
 * 为了能看到实时更新和投票人分页：发起之后会有一批「群友」分几波来投票，每波之后推一次 poll.updated。
 */

interface MockPoll {
  id: number;
  conversationId: number;
  messageId: number;
  title: string;
  options: Array<{ id: number; text: string }>;
  multiple: boolean;
  anonymous: boolean;
  closesAt: string | null;
  closedAt: string | null;
  /** 用户 id → 他投的选项 */
  votes: Map<number, number[]>;
}

const ME: User = { id: 1, username: 'kuke', nickname: '酷可mc' };
const KNOWN_USERS: User[] = [{ id: 2, username: 'aqua', nickname: '阿夸' }, { id: 3, username: 'mint', nickname: '薄荷糖' }, { id: 5, username: 'long', nickname: '一个名字特别特别长的群友用来测试截断' }];
/** 预览页里 2 号会话是私聊，只有对方一个人会来投 */
const DIRECT_CONVERSATION_ID = 2;
const CROWD_SIZE = 72;
const CROWD_WAVES = 3;

const polls = new Map<number, MockPoll>();
let nextPollId = 1;
// 消息 id 取得很大：预览页自己的消息 id 从 5000 往上涨，投票消息要排在它们后面才看得见
let nextMessageId = 900_000;

function fail(status: number, code: string, message: string): Response {
  return json({ detail: { code, message } }, status);
}

function userOf(userId: number): User {
  return userId === ME.id ? ME : KNOWN_USERS.find((user) => user.id === userId) ?? { id: userId, username: `member${userId}`, nickname: `群友 ${userId - 100}` };
}

function isClosed(poll: MockPoll): boolean {
  return poll.closedAt !== null || (poll.closesAt !== null && new Date(poll.closesAt).getTime() <= Date.now());
}

function summaryOf(poll: MockPoll): PollSummary {
  const ballots = Array.from(poll.votes.values());
  return {
    conversation_id: poll.conversationId,
    message_id: poll.messageId,
    poll_id: poll.id,
    options: poll.options.map((option) => ({ id: option.id, votes: ballots.filter((ballot) => ballot.includes(option.id)).length })),
    total_voters: ballots.length,
    closed: isClosed(poll),
    closed_at: poll.closedAt
  };
}

function stateOf(poll: MockPoll): PollState {
  return { ...summaryOf(poll), my_option_ids: poll.votes.get(ME.id) ?? [] };
}

function push(poll: MockPoll): void {
  emitRealtimeEvent({ type: 'unknown', rawType: 'poll.updated', data: summaryOf(poll), receivedAt: new Date().toISOString() });
}

/** 让别人来投票：越靠前的选项越容易被选中，多选时有人会再多选一项。 */
function simulateCrowd(poll: MockPoll): void {
  const voterIds = poll.conversationId === DIRECT_CONVERSATION_ID ? [KNOWN_USERS[0].id] : [...KNOWN_USERS.map((user) => user.id), ...Array.from({ length: CROWD_SIZE }, (_, index) => 101 + index)];
  const perWave = Math.ceil(voterIds.length / CROWD_WAVES);
  for (let wave = 0; wave < CROWD_WAVES; wave += 1) {
    const batch = voterIds.slice(wave * perWave, (wave + 1) * perWave);
    window.setTimeout(() => {
      if (batch.length === 0 || isClosed(poll)) {
        return;
      }
      for (const voterId of batch) {
        const first = poll.options[Math.floor(Math.random() ** 2 * poll.options.length)].id;
        const second = poll.options[Math.floor(Math.random() * poll.options.length)].id;
        poll.votes.set(voterId, poll.multiple && second !== first && Math.random() < 0.4 ? [first, second] : [first]);
      }
      push(poll);
    }, 1200 * (wave + 1));
  }
}

function createPoll(conversationId: number, body: unknown): Response {
  if (!isRecord(body) || typeof body.title !== 'string' || !Array.isArray(body.options)) {
    return fail(422, 'invalid_poll', '投票内容格式不正确');
  }
  const title = body.title.trim();
  const texts = body.options.map((text) => String(text).trim());
  const closesAt = typeof body.closes_at === 'string' ? body.closes_at : null;
  const remaining = closesAt ? new Date(closesAt).getTime() - Date.now() : null;
  if (title.length < 1 || title.length > 80) {
    return fail(422, 'invalid_poll', '标题需要 1–80 个字');
  }
  if (texts.length < 2 || texts.length > 10 || texts.some((text) => text.length < 1 || text.length > 40)) {
    return fail(422, 'invalid_poll', '需要 2–10 个选项，每个 1–40 个字');
  }
  if (new Set(texts).size !== texts.length) {
    return fail(422, 'invalid_poll', '选项不能重复');
  }
  if (remaining !== null && (remaining < 60_000 || remaining > 30 * 86400_000)) {
    return fail(422, 'invalid_poll', '截止时间必须在一分钟之后、30 天之内');
  }
  // 留一个能触发服务端报错的口子，用来看对话框里的错误提示
  if ([title, ...texts].some((text) => text.includes('违规'))) {
    return fail(422, 'poll_rejected', '标题或选项未通过文本审核');
  }

  const poll: MockPoll = {
    id: nextPollId,
    conversationId,
    messageId: nextMessageId,
    title,
    options: texts.map((text, index) => ({ id: index + 1, text })),
    multiple: body.multiple === true,
    anonymous: body.anonymous === true,
    closesAt,
    closedAt: null,
    votes: new Map()
  };
  nextPollId += 1;
  nextMessageId += 1;
  polls.set(poll.id, poll);
  simulateCrowd(poll);

  const metadata: Poll = {
    id: poll.id,
    title,
    options: poll.options.map((option) => ({ ...option, votes: 0 })),
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    closes_at: closesAt,
    closed: false,
    closed_at: null,
    total_voters: 0,
    my_option_ids: []
  };
  const message: Message = {
    id: poll.messageId,
    conversation_id: conversationId,
    sender_id: ME.id,
    sender: ME,
    type: 'poll',
    content: [`[投票] ${title}`, ...texts.map((text, index) => `${index + 1}. ${text}`)].join('\n'),
    metadata: { poll: metadata },
    created_at: new Date().toISOString()
  };
  return json(message);
}

function vote(poll: MockPoll, body: unknown): Response {
  const optionIds = isRecord(body) && Array.isArray(body.option_ids) ? body.option_ids.map(Number) : [];
  if (isClosed(poll)) {
    return fail(409, 'poll_closed', '投票已结束');
  }
  if (optionIds.some((id) => !poll.options.some((option) => option.id === id))) {
    return fail(422, 'invalid_poll_option', '选项不存在');
  }
  if (!poll.multiple && optionIds.length > 1) {
    return fail(422, 'poll_single_choice', '这是单选投票，只能选一项');
  }
  if (optionIds.length > 0) {
    poll.votes.set(ME.id, optionIds);
  } else {
    poll.votes.delete(ME.id);
  }
  window.setTimeout(() => push(poll), 400);
  return json(stateOf(poll));
}

function voters(poll: MockPoll, optionId: number, url: URL): Response {
  if (poll.anonymous) {
    return fail(403, 'poll_anonymous', '匿名投票不能查看投票人');
  }
  const limit = Math.min(100, Number(url.searchParams.get('limit') ?? 50));
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const all = Array.from(poll.votes.entries()).filter(([, ballot]) => ballot.includes(optionId)).map(([userId]) => userOf(userId));
  return json({ items: all.slice(offset, offset + limit), total: all.length });
}

/** 投票 相关接口的假数据。 */
export const pollsMock: MockHandler = ({ path, url, method, body }) => {
  const match = path.match(/^\/conversations\/(\d+)\/polls(?:\/(\d+)(?:\/(vote|close)|\/options\/(\d+)\/voters)?)?$/);
  if (!match) {
    return undefined;
  }
  const [, conversationId, pollId, action, optionId] = match;
  if (!pollId) {
    return method === 'POST' ? createPoll(Number(conversationId), body) : undefined;
  }
  const poll = polls.get(Number(pollId));
  if (!poll || poll.conversationId !== Number(conversationId)) {
    return json({ detail: '投票不存在' }, 404);
  }
  if (optionId) {
    return voters(poll, Number(optionId), url);
  }
  if (action === 'vote' && method === 'PUT') {
    return vote(poll, body);
  }
  if (action === 'close' && method === 'POST') {
    if (!isClosed(poll)) {
      poll.closedAt = new Date().toISOString();
      push(poll);
    }
    return json(stateOf(poll));
  }
  return !action && method === 'GET' ? json(stateOf(poll)) : undefined;
};
