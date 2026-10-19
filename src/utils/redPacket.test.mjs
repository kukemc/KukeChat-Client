// Run with: node --experimental-strip-types --test src/utils/redPacket.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isRedPacketMessage, normalizeRedPacketMeta, redPacketGreeting, redPacketOf, redPacketPreview, redPacketVoiceOf } from './redPacket.ts';

const message = (extra = {}) => ({ id: 1, conversation_id: 7, type: 'red_packet', content: '[红包] 给旧客户端的兜底文字', created_at: '2026-10-14T00:00:00Z', metadata: { red_packet: { id: 12, kind: 'lucky', greeting: '新年快乐', count: 5 } }, ...extra });

test('metadata.red_packet is read as-is and falls back on missing optional fields', () => {
  assert.deepEqual(normalizeRedPacketMeta({ id: 12, kind: 'lucky', greeting: '新年快乐', count: 5 }), { id: 12, kind: 'lucky', greeting: '新年快乐', count: 5 });
  assert.deepEqual(normalizeRedPacketMeta({ id: 9 }), { id: 9, kind: 'normal', greeting: '恭喜发财', count: 1 });
  assert.deepEqual(normalizeRedPacketMeta({ id: 3, kind: 'weird', greeting: '   ', count: 0 }), { id: 3, kind: 'normal', greeting: '恭喜发财', count: 1 });
});

test('malformed metadata is rejected so the message renders as plain text', () => {
  for (const bad of [null, undefined, 'x', [], {}, { id: null }, { id: '' }, { id: 'rp_1' }, { id: 1.5 }, { id: Number.NaN }]) {
    assert.equal(normalizeRedPacketMeta(bad), null);
  }
  assert.equal(redPacketOf(message({ metadata: {} })), null);
  assert.equal(redPacketOf(message({ metadata: undefined })), null);
});

test('only live red_packet messages carry a packet', () => {
  assert.equal(redPacketOf(message())?.id, 12);
  assert.equal(redPacketOf(message({ type: 'text' })), null);
  assert.equal(redPacketOf(message({ recalled_at: '2026-10-14T00:01:00Z' })), null);
  assert.equal(redPacketOf(null), null);
  assert.equal(isRedPacketMessage(message()), true);
  assert.equal(isRedPacketMessage(message({ type: 'poll' })), false);
  assert.equal(isRedPacketMessage(undefined), false);
});

test('previews read "[红包] greeting" and never leak the legacy fallback content', () => {
  assert.equal(redPacketPreview(message()), '[红包] 新年快乐');
  assert.equal(redPacketPreview(message({ metadata: {} })), '[红包] 恭喜发财');
  assert.equal(redPacketPreview(message({ type: 'text' })), null);
});

test('the bare greeting is available for lists that already show a "[有红包]" prefix', () => {
  assert.equal(redPacketGreeting(message()), '新年快乐');
  assert.equal(redPacketGreeting(message({ metadata: {} })), '恭喜发财');
  assert.equal(redPacketGreeting(message({ type: 'text' })), null);
});

test('voice packets keep their phrase, and previews say "[语音红包]"', () => {
  const voice = message({ metadata: { red_packet: { id: 12, kind: 'normal', greeting: '新年快乐', count: 1, voice: true, voice_text: ' 恭喜发财 ' } } });
  assert.deepEqual(normalizeRedPacketMeta(voice.metadata.red_packet), { id: 12, kind: 'normal', greeting: '新年快乐', count: 1, voice: true, voice_text: '恭喜发财' });
  assert.equal(normalizeRedPacketMeta({ id: 3, voice: true })?.voice, true);
  assert.equal(normalizeRedPacketMeta({ id: 3, voice: false, voice_text: '' })?.voice, undefined);
  assert.equal(redPacketPreview(voice), '[语音红包] 新年快乐');
  assert.equal(redPacketPreview(message({ metadata: { red_packet: { id: 1, voice: true, target_user_id: 5 } } })), '[专属语音红包] 恭喜发财');
});

test('the voice message sent by claiming a voice packet points back to the packet', () => {
  const sent = { id: 2, conversation_id: 7, type: 'voice', content: 'https://x/v.webm', created_at: '', metadata: { voice: { duration_ms: 2000 }, red_packet_voice: { red_packet_id: 12 } } };
  assert.equal(redPacketVoiceOf(sent), 12);
  assert.equal(redPacketVoiceOf({ ...sent, metadata: { voice: { duration_ms: 2000 } } }), null);
  assert.equal(redPacketVoiceOf({ ...sent, type: 'text' }), null);
  assert.equal(redPacketVoiceOf(null), null);
});
