// Run with: node --experimental-strip-types --test src/utils/gift.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { charmBoardLabel, giftOf, giftPreview, giftThingLabel, giftTierOf, isGiftMessage, normalizeGiftMeta } from './gift.ts';

const cake = { key: 'cake', name: '蛋糕', icon: 'cake', price: 20, tier: 2 };
const angel = { sku: 'frame.angel', name: '天使', category: 'frame', style: { version: 1 }, duration_days: 30 };
const to = { id: 42, display_name: '阿夸', avatar_url: null };
const meta = (extra = {}) => ({ id: 7, kind: 'gift', gift: cake, item: null, count: 3, to_user: to, message: '生日快乐！', ...extra });
const message = (extra = {}) => ({ id: 1, conversation_id: 7, type: 'gift', content: '[礼物] 给旧客户端的兜底文字', created_at: '2026-10-14T00:00:00Z', metadata: { gift: meta() }, ...extra });

test('metadata.gift is read as-is for a catalogue gift', () => {
  assert.deepEqual(normalizeGiftMeta(meta()), { id: 7, kind: 'gift', gift: cake, item: null, count: 3, to_user: to, message: '生日快乐！' });
});

test('a shop item gift always has count 1 and keeps the untrusted style untouched', () => {
  const result = normalizeGiftMeta(meta({ kind: 'item', gift: null, item: angel, count: 9, message: '  ' }));
  assert.equal(result.kind, 'item');
  assert.equal(result.count, 1);
  assert.equal(result.gift, null);
  assert.deepEqual(result.item, angel);
  assert.equal(result.message, '');
  assert.equal(normalizeGiftMeta(meta({ kind: 'item', gift: null, item: { ...angel, duration_days: 0 } })).item.duration_days, null);
});

test('missing optional fields fall back, unknown tiers become 1', () => {
  const result = normalizeGiftMeta({ id: 3, kind: 'gift', gift: { key: 'x', tier: 9 }, to_user: { id: 5 } });
  assert.deepEqual(result, { id: 3, kind: 'gift', gift: { key: 'x', name: '礼物', icon: '', price: 0, tier: 1 }, item: null, count: 1, to_user: { id: 5, display_name: '用户 5', avatar_url: null }, message: '' });
});

test('malformed metadata is rejected so the message renders as plain text', () => {
  for (const bad of [null, undefined, 'x', [], {}, { id: 'g1', kind: 'gift', gift: cake, to_user: to }, { id: 1.5, gift: cake, to_user: to }, meta({ to_user: null }), meta({ to_user: { id: '42' } }), meta({ gift: null }), meta({ kind: 'item' }), meta({ kind: 'item', gift: null, item: { name: 'x' } })]) {
    assert.equal(normalizeGiftMeta(bad), null);
  }
  assert.equal(giftOf(message({ metadata: {} })), null);
  assert.equal(giftOf(message({ metadata: undefined })), null);
});

test('only live gift messages carry a gift', () => {
  assert.equal(giftOf(message())?.id, 7);
  assert.equal(giftOf(message({ type: 'text' })), null);
  assert.equal(giftOf(message({ recalled_at: '2026-10-14T00:01:00Z' })), null);
  assert.equal(giftOf(null), null);
  assert.equal(isGiftMessage(message()), true);
  assert.equal(isGiftMessage(message({ type: 'red_packet' })), false);
  assert.equal(isGiftMessage(undefined), false);
});

test('previews read "[礼物] 送给 X Y ×N" and never leak the legacy fallback content', () => {
  assert.equal(giftPreview(message()), '[礼物] 送给 阿夸 蛋糕 ×3');
  assert.equal(giftPreview(message({ metadata: { gift: meta({ count: 1 }) } })), '[礼物] 送给 阿夸 蛋糕');
  assert.equal(giftPreview(message({ metadata: { gift: meta({ kind: 'item', gift: null, item: angel }) } })), '[礼物] 送给 阿夸 头像框「天使」');
  assert.equal(giftPreview(message({ metadata: {} })), '[礼物]');
  assert.equal(giftPreview(message({ type: 'text' })), null);
  assert.equal(giftPreview(null), null);
});

test('what was given is labelled by kind and category', () => {
  assert.equal(giftThingLabel({ kind: 'gift', gift: cake, item: null, count: 1 }), '蛋糕');
  assert.equal(giftThingLabel({ kind: 'gift', gift: cake, item: null, count: 99 }), '蛋糕 ×99');
  assert.equal(giftThingLabel({ kind: 'item', gift: null, item: { ...angel, category: 'bubble', name: '星空' }, count: 1 }), '气泡「星空」');
  assert.equal(giftThingLabel({ kind: 'item', gift: null, item: { ...angel, category: 'nameplate', name: '金牌' }, count: 1 }), '装扮「金牌」');
});

test('the effect tier comes from the gift; shop items have none and count as tier 1', () => {
  assert.equal(giftTierOf({ gift: cake }), 2);
  assert.equal(giftTierOf({ gift: { ...cake, tier: 3 } }), 3);
  assert.equal(giftTierOf({ gift: null }), 1);
});

test('the leaderboard name follows whatever the charm value is called', () => {
  assert.equal(charmBoardLabel('心意值'), '心意榜');
  assert.equal(charmBoardLabel('人气值'), '人气榜');
  assert.equal(charmBoardLabel('魅力'), '魅力榜');
  assert.equal(charmBoardLabel('值'), '值榜');
});
