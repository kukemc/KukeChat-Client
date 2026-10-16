// Run with: node --experimental-strip-types --test src/utils/mentions.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { messageMentionKind } from './mentions.ts';

const message = (metadata) => ({ id: 1, conversation_id: 7, type: 'text', content: 'hi', created_at: '2026-10-14T00:00:00Z', metadata });

test('a direct mention wins over @all, and other people being mentioned is not mine', () => {
  assert.equal(messageMentionKind(message({ mentions: [{ user_id: 5, name: 'me' }] }), 5), 'me');
  assert.equal(messageMentionKind(message({ mentions: [{ user_id: 5, name: 'me' }], mention_all: true }), 5), 'me');
  assert.equal(messageMentionKind(message({ mentions: [{ user_id: 6, name: 'other' }], mention_all: true }), 5), 'all');
  assert.equal(messageMentionKind(message({ mentions: [{ user_id: 6, name: 'other' }] }), 5), null);
});

test('missing or malformed metadata and an unknown current user are never a mention', () => {
  assert.equal(messageMentionKind(message(undefined), 5), null);
  assert.equal(messageMentionKind(message({ mentions: 'x', mention_all: 'yes' }), 5), null);
  assert.equal(messageMentionKind(message({ mention_all: true }), null), null);
  assert.equal(messageMentionKind(message({ mention_all: true }), undefined), null);
});
