import { isRecord } from '@/api/normalizers';
import { emitRealtimeEvent } from '@/realtime/events';
import type { Announcement, AnnouncementReaction } from '@/types/api';
import { json, type MockHandler } from './types';

/*
 * 公告回应接口的假实现（契约见后端 docs/chat-features.md 第 5 节），状态只存在内存里，刷新页面就没了。
 * 公告本身的假数据在各预览页自己手里，这里只管回应：预览页返回公告列表前用 withAnnouncementReactions 把回应挂上去。
 */

interface MockReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

const OPTIONS = { quick: ['👍', '❤️', '😂', '😮', '😢', '🎉', '👀', '🔥'], per_user: 5, per_announcement: 30, per_minute: 20 };

const MANY = ['😀', '😃', '😄', '😁', '🤣', '😊', '😍', '😘', '😎', '😋', '😜', '🤔', '😭', '😡', '👎', '👏', '🙏', '💪', '✨', '⭐', '🌙', '☀️', '🍀', '🐱', '🐶', '🐧', '🍉', '🍜', '🎮', '📷'];

/** 公告 id → 它的回应，按第一次出现的先后存。没列出来的公告就是还没人回应。 */
const store = new Map<number, MockReaction[]>([
  // 数量跨了几个量级，看缩写
  [3, [{ emoji: '👀', count: 37, mine: true }, { emoji: '🔥', count: 12, mine: false }, { emoji: '🎉', count: 1234, mine: false }, { emoji: '❤️', count: 15800, mine: true }, { emoji: '😂', count: 999, mine: false }, { emoji: '✅', count: 1, mine: false }]],
  // 种类很多，但还没到上限
  [2, MANY.slice(0, 24).map((emoji, index) => ({ emoji, count: 1 + ((index * 37) % 211), mine: index === 4 }))],
  // 种类到了每条公告的上限：不能再出现新的 emoji
  [4, MANY.map((emoji, index) => ({ emoji, count: 3 + ((index * 53) % 97), mine: index === 0 || index === 7 }))]
]);

/**
 * 预览页上可以切换的情形。
 *   unsupported  服务端还没上这个功能：公告不带 reactions，三个接口都不存在
 *   muted        被平台禁言：不能回应，但还能取消
 *   rate         操作太快
 *   offline      公告已经下线
 */
export const announcementReactionScenario: { mode: 'normal' | 'unsupported' | 'muted' | 'rate' | 'offline' } = { mode: 'normal' };

function fail(status: number, code: string, message: string): Response {
  return json({ detail: { code, message } }, status);
}

function sorted(announcementId: number): MockReaction[] {
  // sort 是稳定的：数量相同的先出现的在前
  return [...(store.get(announcementId) ?? [])].sort((left, right) => right.count - left.count);
}

function readOf(announcementId: number): AnnouncementReaction[] {
  return sorted(announcementId).map((reaction) => ({ emoji: reaction.emoji, count: reaction.count, reacted_by_me: reaction.mine }));
}

function push(announcementId: number): void {
  // 事件里没有 reacted_by_me
  const reactions = sorted(announcementId).map((reaction) => ({ emoji: reaction.emoji, count: reaction.count }));
  emitRealtimeEvent({ type: 'unknown', rawType: 'announcement.reaction.updated', data: { id: announcementId, reactions }, receivedAt: new Date().toISOString() });
}

/** 给公告列表挂上回应。「服务端不支持」的情形下原样返回（没有 reactions 字段）。 */
export function withAnnouncementReactions(announcements: Announcement[]): Announcement[] {
  return announcementReactionScenario.mode === 'unsupported' ? announcements : announcements.map((announcement) => ({ ...announcement, reactions: readOf(announcement.id) }));
}

/** 让「别人」来回应一轮：几个已有的涨一点、掉一点，偶尔冒出一个新的，然后推一次实时事件。 */
export function simulateAnnouncementReactions(announcementId: number): void {
  const reactions = store.get(announcementId) ?? [];
  for (const reaction of reactions) {
    const others = reaction.count - Number(reaction.mine);
    reaction.count = Math.max(0, others + Math.floor(Math.random() * 9) - 2) + Number(reaction.mine);
  }
  const fresh = MANY.find((emoji) => !reactions.some((reaction) => reaction.emoji === emoji));
  if (fresh && reactions.length < OPTIONS.per_announcement && Math.random() < 0.6) {
    reactions.push({ emoji: fresh, count: 1 + Math.floor(Math.random() * 40), mine: false });
  }
  store.set(announcementId, reactions.filter((reaction) => reaction.count > 0));
  push(announcementId);
}

function setMine(announcementId: number, emoji: string, on: boolean): Response {
  const reactions = store.get(announcementId) ?? [];
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (on) {
    if (announcementReactionScenario.mode === 'muted') {
      return json({ detail: { code: 'account_muted', message: '你已被禁言至 10月13日 08:00，期间不能回应公告', muted_until: new Date(Date.now() + 3600_000).toISOString(), reason: '预览页模拟的禁言' } }, 403);
    }
    if (reactions.filter((reaction) => reaction.mine).length >= OPTIONS.per_user) {
      return fail(409, 'reaction_limit', `每条公告最多用 ${OPTIONS.per_user} 种表情回应`);
    }
    if (!existing && reactions.length >= OPTIONS.per_announcement) {
      return fail(409, 'reaction_limit', `这条公告的回应已经有 ${OPTIONS.per_announcement} 种了，选一个已有的吧`);
    }
    if (existing) {
      existing.count += 1;
      existing.mine = true;
    } else {
      reactions.push({ emoji, count: 1, mine: true });
    }
  } else if (existing?.mine) {
    existing.count -= 1;
    existing.mine = false;
  }
  store.set(announcementId, reactions.filter((reaction) => reaction.count > 0));
  // 真实的服务端会把同一条公告的事件合并到最多每秒一次，这里晚一点推，顺便看「接口先回、事件后到」
  window.setTimeout(() => push(announcementId), 600);
  return json({ id: announcementId, reactions: readOf(announcementId) });
}

export const announcementReactionsMock: MockHandler = ({ path, method, body }) => {
  const unsupported = announcementReactionScenario.mode === 'unsupported';
  if (path === '/announcements/reaction-options') {
    return unsupported ? json({ detail: 'Not Found' }, 404) : json(OPTIONS);
  }
  const match = path.match(/^\/announcements\/(\d+)\/reactions(?:\/(.+))?$/);
  if (!match) {
    return undefined;
  }
  if (unsupported) {
    return json({ detail: match[2] ? 'Not Found' : 'Method Not Allowed' }, match[2] ? 404 : 405);
  }
  const announcementId = Number(match[1]);
  if (announcementReactionScenario.mode === 'offline') {
    return fail(404, 'announcement_not_found', '公告不存在或已下线');
  }
  if (announcementReactionScenario.mode === 'rate') {
    return fail(429, 'reaction_rate_limited', '操作太快了，歇一会儿再试');
  }
  if (method === 'DELETE' && match[2]) {
    // 没回应过也是 200
    return setMine(announcementId, decodeURIComponent(match[2]), false);
  }
  if (method === 'POST' && !match[2]) {
    const emoji = isRecord(body) && typeof body.emoji === 'string' ? body.emoji : '';
    if (!emoji || /[\w一-鿿]/.test(emoji)) {
      return json({ detail: [{ loc: ['body', 'emoji'], msg: 'Value error, not an emoji', type: 'value_error' }] }, 422);
    }
    // 开关语义
    const mine = (store.get(announcementId) ?? []).some((reaction) => reaction.emoji === emoji && reaction.mine);
    return setMine(announcementId, emoji, !mine);
  }
  return json({ detail: 'Method Not Allowed' }, 405);
};
