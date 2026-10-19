import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

// Exercise the production TS helper itself, not a copied implementation.
const source = readFileSync(new URL('../src/utils/conversations.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { projectDashboardConversations, sameConversationMembership } = await import(`data:text/javascript,${encodeURIComponent(compiled)}`);

const initial = [
  { id: 1, type: 'group', title: 'Group', unread_count: 8 },
  { id: 2, type: 'direct', unread_count: 3, my_message_setting: 'silent' },
  { id: 3, type: 'group', unread_count: 4, my_message_setting: 'ignore' },
  { id: 4, type: 'group', unread_count: 6, my_do_not_disturb: true }
];
const original = projectDashboardConversations(initial);
assert.deepEqual(original.ids, [1, 2, 3, 4]);
assert.equal(original.unread, 8);
assert.equal(original.unread - original.unreadById.get(1), 0, 'visible group unread is excluded');
assert.equal(original.byId.get(2), initial[1]);
assert.equal(sameConversationMembership(original.ids, [4, 3, 2, 1]), true, 'reorder should not refetch bookmarks or rewrite IDs');
assert.equal(sameConversationMembership(original.ids, [1, 2, 3, 5]), false, 'same-size membership replacement must be noticed');
const messagePatch = initial.map((item) => item.id === 1 ? { ...item, last_message: { id: 123 }, unread_count: 9 } : item);
const patched = projectDashboardConversations(messagePatch);
assert.equal(patched.unread, 9);
const incremental = projectDashboardConversations(messagePatch, original);
assert.equal(incremental.unread, 9);
assert.equal(incremental.byId.get(2), original.byId.get(2));
assert.equal(incremental.ids, original.ids, 'message-only updates retain searchable IDs');
const replaced = projectDashboardConversations([initial[0], initial[1], initial[2], { id: 5, type: 'group', unread_count: 2 }], incremental);
assert.equal(replaced.unread, 10);
assert.equal(replaced.byId.has(4), false);
assert.equal(replaced.byId.has(5), true);
const muted = initial.map((item) => item.id === 1 ? { ...item, my_message_setting: 'ignore' } : item);
assert.equal(projectDashboardConversations(muted).unread, 0);

// Message-heavy workload: immutable array patches for 1,000 conversations and 1,000 events.
const base = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, type: 'group', title: `group-${index}`, unread_count: 0 }));
let latest = base;
const updates = Array.from({ length: 1000 }, (_, index) => {
  const list = latest.slice();
  list[index] = { ...list[index], unread_count: index + 1, last_message: { id: index + 1 } };
  latest = list;
  return list;
});
function measure(fn) {
  const start = performance.now();
  fn();
  return Math.round((performance.now() - start) * 10) / 10;
}
const old = measure(() => {
  for (const list of updates) {
    list.map((item) => item.id).join(',');
    list.reduce((sum, item) => sum + item.unread_count, 0);
    list.map((item) => item.id);
  }
});
let membershipChanges = 0;
const improved = measure(() => {
  let previous = null;
  let ids = [];
  for (const list of updates) {
    const view = projectDashboardConversations(list, previous ?? undefined);
    if (!sameConversationMembership(ids, view.ids)) {
      ids = view.ids;
      membershipChanges++;
    }
    previous = view;
  }
});
assert.equal(membershipChanges, 1);
console.log(`ChatDashboard projection regression OK; 1000 conversations × 1000 message patches: old ${old} ms; new ${improved} ms. (CPU microbenchmark)`);
