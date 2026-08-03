import type { RealtimeEvent, RealtimeEventType } from '@/types/realtime';

type RealtimeListener = (event: RealtimeEvent) => void;

const listeners = new Set<RealtimeListener>();

const eventTypeMap: Record<string, RealtimeEventType> = {
  'connection.ready': 'connection.ready',
  'account.suspended': 'account.suspended',
  'message.created': 'message.created',
  'message.recalled': 'message.recalled',
  'message.reaction.updated': 'message.reaction.updated',
  'message.featured.updated': 'message.featured.updated',
  'message.component.updated': 'message.component.updated',
  'conversation.updated': 'conversation.updated',
  'conversation.read': 'conversation.read',
  'group.announcement.created': 'group.announcement.created',
  'group.announcement.updated': 'group.announcement.updated',
  'group.announcement.deleted': 'group.announcement.deleted',
  'friend_request.created': 'friend.request.created',
  'friend_request.accepted': 'friend.request.accepted',
  'friend_request.rejected': 'friend.request.rejected',
  'friend.request.created': 'friend.request.created',
  'friend.request.accepted': 'friend.request.accepted',
  'friend.request.rejected': 'friend.request.rejected',
  'friendship.deleted': 'friendship.deleted',
  'group.member.invited': 'group.member.invited',
  'group.join_request.created': 'group.join_request.created',
  'group.join_request.accepted': 'group.join_request.accepted',
  'group.join_request.rejected': 'group.join_request.rejected',
  'group.member.joined': 'group.member.joined',
  'group.member.role_updated': 'group.member.role_updated',
  'group.member.mute_updated': 'group.member.mute_updated',
  'group.member.title_updated': 'group.member.title_updated',
  'group.checkin.created': 'group.checkin.created',
  'group.member.level_updated': 'group.member.level_updated',
  'group.member.left': 'group.member.left',
  'group.member.removed': 'group.member.removed',
  'conversation.deleted': 'conversation.deleted',
  'conversation.temporary.closed': 'conversation.temporary.closed',
  'conversation.temporary.blocked': 'conversation.temporary.blocked',
  'temporary_block.deleted': 'temporary_block.deleted',
  'presence.updated': 'presence.updated',
  'post.created': 'post.created',
  'post.deleted': 'post.deleted',
  'post.like.updated': 'post.like.updated',
  'post.comment.created': 'post.comment.created',
  'post.comment.like.updated': 'post.comment.like.updated',
  'post.comment.deleted': 'post.comment.deleted'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeRealtimeType(type: string): RealtimeEventType {
  return eventTypeMap[type] ?? 'unknown';
}

export function parseRealtimePayload(payload: string): RealtimeEvent | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isRecord(parsed) || typeof parsed.type !== 'string') {
      return null;
    }

    return {
      type: normalizeRealtimeType(parsed.type),
      rawType: parsed.type,
      data: parsed.data,
      receivedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export function subscribeRealtimeEvents(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRealtimeEvent(event: RealtimeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}
