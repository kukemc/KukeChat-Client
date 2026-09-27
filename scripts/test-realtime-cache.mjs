import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Compile the real production helpers in memory: no generated files, server, or production data.
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../src/realtime/cache.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) });
const { upsertMessageIntoFirstPage, patchMessageInPages, patchMemberPages, patchMembers, patchMemberPresence, applyCreatedMessageToConversations, patchConversation, recordReceivedMessage, shouldAlertIncomingMessage } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
const message = (id, conversation_id = 7) => ({ id, conversation_id, sender_id: 11, created_at: new Date(1_700_000_000_000 + id * 1000).toISOString(), content: `synthetic-${id}`, type: 'text' });
const messages = { pages: [Array.from({ length: 100 }, (_, i) => message(901 + i)), Array.from({ length: 100 }, (_, i) => message(801 + i)), Array.from({ length: 100 }, (_, i) => message(701 + i))], pageParams: [undefined, 901, 801] };
const append = upsertMessageIntoFirstPage(messages, message(1001));
assert.deepEqual(append.pages[0].slice(-2).map((item) => item.id), [1000, 1001]);
assert.strictEqual(append.pages[1], messages.pages[1]);
assert.strictEqual(append.pages[2], messages.pages[2]);
const existing = upsertMessageIntoFirstPage(append, { ...message(850), content: 'replayed' });
assert.equal(existing.pages[1][49].content, 'replayed');
assert.strictEqual(existing.pages[0], append.pages[0]);
assert.strictEqual(existing.pages[2], append.pages[2]);
assert.equal(existing.pages.flat().filter((item) => item.id === 850).length, 1);
assert.strictEqual(upsertMessageIntoFirstPage(existing, message(1)), existing, 'outside fetched window must not be appended');
const late = upsertMessageIntoFirstPage(existing, message(850.5));
assert.equal(late.pages[1].filter((item) => item.id === 850.5).length, 1, 'out-of-order unseen message must be inserted exactly once into the historical page');
assert.strictEqual(late.pages[0], existing.pages[0]);
assert.equal(upsertMessageIntoFirstPage(late, message(850.5)).pages[1].length, late.pages[1].length);
const patched = patchMessageInPages(existing, 750, (item) => ({ ...item, reactions: [{ emoji: '👍', count: 1 }] }));
assert.equal(patched.pages[2][49].reactions[0].count, 1);
assert.strictEqual(patched.pages[0], existing.pages[0]);
assert.strictEqual(patched.pages[1], existing.pages[1]);
assert.strictEqual(patchMessageInPages(patched, 123, () => { throw Error('not found'); }), patched);
const members = Array.from({ length: 3000 }, (_, id) => ({ id, user_id: id, user: { id, presence_status: null, presence_text: null, presence_updated_at: null } }));
const memberData = { pages: [{ items: members.slice(0, 1000) }, { items: members.slice(1000, 2000) }, { items: members.slice(2000) }], pageParams: [0, 1000, 2000] };
const memberUpdated = patchMemberPages(memberData, (item) => patchMemberPresence(item, 1500, true, { presence_status: 'busy', presence_updated_at: '2026-01-01' }));
assert.strictEqual(memberUpdated.pages[0], memberData.pages[0]);
assert.notStrictEqual(memberUpdated.pages[1], memberData.pages[1]);
assert.strictEqual(memberUpdated.pages[2], memberData.pages[2]);
assert.strictEqual(patchMemberPages(memberUpdated, (item) => patchMemberPresence(item, 1500, true, { presence_status: 'busy', presence_updated_at: '2026-01-01' })), memberUpdated);
assert.strictEqual(patchMembers(members, (item) => patchMemberPresence(item, -1, false, {})), members);
const conversations = Array.from({ length: 3000 }, (_, index) => ({ id: index + 1, type: 'group', updated_at: new Date(1_700_000_000_000 + (3000 - index) * 1000).toISOString(), unread_count: 0, last_message: message(3000 - index, index + 1) }));
const first = applyCreatedMessageToConversations(conversations, message(4000, 2000), null);
assert.equal(first[0].id, 2000);
assert.equal(first[0].unread_count, 1);
assert.strictEqual(first[1], conversations[0]);
const older = applyCreatedMessageToConversations(first, message(3500, 2000), null);
assert.equal(older[0].last_message.id, 4000, 'out-of-order event must not demote preview');
assert.equal(older[0].unread_count, 2, 'out-of-order new event still counts as unread');
const replayed = applyCreatedMessageToConversations(older, message(3500, 2000), null, true);
assert.equal(replayed[0].unread_count, 2);
assert.strictEqual(patchConversation(replayed, -1, () => { throw Error('not found'); }), replayed);

// Regression: an HTTP message page can contain N while the conversations query
// still has unread=0 and previews N-1. The first WS N must count and alert once.
const clientSource = readFileSync(new URL('../src/realtime/client.ts', import.meta.url), 'utf8');
assert.match(clientSource, /const firstDelivery = recordReceivedMessage\(recentlyReceivedMessages, conversationId, message\.id\)/);
assert.match(clientSource, /const shouldNotify = shouldAlertIncomingMessage\(firstDelivery, message, currentUser\?\.id \?\? null, lastReadMessageIds\.get\(conversationId\) \?\? 0\)/);
assert.match(clientSource, /const shouldIncrementUnread = shouldNotify && currentConversation\?\.last_message\?\.id !== message\.id/);
assert.match(clientSource, /if \(shouldIncrementUnread\)\s*\{\s*notifyIncomingMessage\(message, currentConversation\)/);
assert.doesNotMatch(clientSource, /recentlyReceivedMessages\.has\(messageKey\)\s*\|\|\s*hasMessageInPages/);
const wsSeen = new Set();
const incoming = message(1001, 7);
const httpCached = { pages: [[incoming]], pageParams: [undefined] };
let staleRoomList = [{ id: 7, type: 'group', unread_count: 0, last_message: message(1000), updated_at: message(1000).created_at }];
let alerts = 0;
function receiveFromWs(item, senderIsMe = false) {
  const firstDelivery = recordReceivedMessage(wsSeen, item.conversation_id, item.id);
  const shouldNotify = shouldAlertIncomingMessage(firstDelivery, item, senderIsMe ? 11 : 42, 0);
  const shouldIncrementUnread = shouldNotify && staleRoomList[0].last_message?.id !== item.id;
  if (firstDelivery && !senderIsMe) alerts += 1;
  staleRoomList = applyCreatedMessageToConversations(staleRoomList, item, null, !shouldIncrementUnread);
  return upsertMessageIntoFirstPage(httpCached, item);
}
const afterFirstWs = receiveFromWs(incoming);
assert.equal(staleRoomList[0].unread_count, 1, 'first WS delivery counts even if HTTP page already contains N');
assert.equal(alerts, 1, 'first WS delivery still alerts');
assert.equal(afterFirstWs.pages[0].length, 1, 'HTTP-preloaded message does not get reinserted');
receiveFromWs(incoming);
assert.equal(staleRoomList[0].unread_count, 1, 'duplicate WS delivery does not double count');
assert.equal(alerts, 1, 'duplicate WS delivery does not alert twice');
assert.equal(recordReceivedMessage(wsSeen, 7, 1002), true);
assert.equal(recordReceivedMessage(wsSeen, 7, 1002), false, 'WS events are recorded independently of HTTP cache');
const own = message(1003, 7);
receiveFromWs(own, true);
receiveFromWs(own, true);
assert.equal(staleRoomList[0].unread_count, 1, 'sender echo and its replay never count unread');
assert.equal(shouldAlertIncomingMessage(true, message(1001), 42, 1001), false, 'late WS message at read watermark cannot notify or count unread');
assert.equal(shouldAlertIncomingMessage(true, message(1000), 42, 1001), false, 'late WS message before read watermark cannot notify');
assert.equal(shouldAlertIncomingMessage(true, message(1002), 42, 1001), true, 'new WS message after read watermark still notifies');
// Reverse race: HTTP conversations snapshot contains N and unread=1 first.
const alreadyListed = [{ id: 7, type: 'group', unread_count: 1, last_message: incoming, updated_at: incoming.created_at }];
const freshDelivery = recordReceivedMessage(new Set(), 7, incoming.id);
const notify = shouldAlertIncomingMessage(freshDelivery, incoming, 42, 0);
const increment = notify && alreadyListed[0].last_message?.id !== incoming.id;
const reverseRace = applyCreatedMessageToConversations(alreadyListed, incoming, null, !increment);
assert.equal(increment, false, 'WS first delivery after HTTP conversations snapshot must not count the same message twice');
assert.equal(reverseRace[0].unread_count, 1);
console.log('realtime semantic tests ok: HTTP-first races in both directions, read watermark, multi-page replay, ordering, unread, reactions and presence');

if (process.argv.includes('--bench')) {
  // Synthetic stress: 3k rooms, 3k members and 5k incoming events.
  const N = 5000;
  let current = conversations;
  let pages = messages;
  const start = performance.now();
  for (let id = 0; id < N; id += 1) {
    const roomId = 1 + (id % 3000);
    current = applyCreatedMessageToConversations(current, message(10_000 + id, roomId), null);
    pages = upsertMessageIntoFirstPage(pages, message(10_000 + id));
  }
  const elapsed = performance.now() - start;
  const referencePage = messages.pages[1];
  let baseline = messages;
  let baselineRooms = conversations;
  const baselineStart = performance.now();
  for (let id = 0; id < N; id += 1) {
    const roomId = 1 + (id % 3000);
    const received = message(10_000 + id, roomId);
    const allPages = baseline.pages.map((page) => page.map((item) => item.id === received.id ? { ...item, ...received } : item));
    baseline = { ...baseline, pages: [[...allPages[0], received].sort((a, b) => a.id - b.id), ...allPages.slice(1)] };
    baselineRooms = baselineRooms.map((room) => room.id === roomId ? { ...room, last_message: received, unread_count: (room.unread_count ?? 0) + 1, updated_at: received.created_at } : room).sort((left, right) => Date.parse(right.last_message?.created_at ?? '') - Date.parse(left.last_message?.created_at ?? ''));
  }
  const baselineElapsed = performance.now() - baselineStart;
  assert.strictEqual(pages.pages[1], referencePage, 'the untouched history page retains its original reference');
  console.log(`synthetic benchmark: ${N} message events / 3000 rooms / 300 cached messages: optimized ${elapsed.toFixed(0)}ms vs original full-page-clone baseline ${baselineElapsed.toFixed(0)}ms (${(baselineElapsed / elapsed).toFixed(1)}x); untouched history pages stable for all events`);
}
