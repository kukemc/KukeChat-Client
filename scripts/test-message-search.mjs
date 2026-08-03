import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/api/messages.ts', import.meta.url), 'utf8');
assert.match(source, /export async function searchConversationMessages/);
assert.match(source, /\/conversations\/\$\{conversationId\}\/messages\/search/);
assert.match(source, /export async function searchAllMessages/);
assert.match(source, /\/conversations\/messages\/search/);
assert.match(source, /params\.set\('q', options\.query\)/);
assert.match(source, /appendPagingParams\(params, options\)/);

const params = new URLSearchParams();
params.set('q', '历史 消息');
params.set('before_id', '123');
params.set('limit', '50');
assert.equal(params.toString(), 'q=%E5%8E%86%E5%8F%B2+%E6%B6%88%E6%81%AF&before_id=123&limit=50');
console.log('message search API contract ok');
