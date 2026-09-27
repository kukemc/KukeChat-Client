// Run with: node --experimental-strip-types --test src/components/chat/virtualConversationScroll.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { instantScroll, restoreScrollBehavior } from './virtualConversationScroll.ts';

function harness(behavior = '', priority = '') {
  let frameId = 0;
  const queued = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    requestAnimationFrame(callback) { queued.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { queued.delete(id); }
  };
  const declarations = new Map(behavior ? [['scroll-behavior', { value: behavior, priority }]] : []);
  const scroll = {
    scrollTop: 0,
    style: {
      getPropertyValue(name) { return declarations.get(name)?.value ?? ''; },
      getPropertyPriority(name) { return declarations.get(name)?.priority ?? ''; },
      setProperty(name, value, declarationPriority = '') { declarations.set(name, { value, priority: declarationPriority }); },
      removeProperty(name) { declarations.delete(name); }
    }
  };
  const state = { frame: null, originalBehavior: '', originalPriority: '' };
  return {
    scroll, state, queued,
    flush() { const callbacks = [...queued.values()]; queued.clear(); for (const callback of callbacks) callback(); },
    close() { globalThis.window = previousWindow; }
  };
}

test('CSS smooth is overridden until next paint, with exact inline declaration restored', () => {
  const env = harness();
  try {
    instantScroll(env.scroll, 900, env.state);
    assert.equal(env.scroll.scrollTop, 900);
    assert.equal(env.scroll.style.getPropertyValue('scroll-behavior'), 'auto');
    assert.equal(env.scroll.style.getPropertyPriority('scroll-behavior'), 'important');
    env.flush();
    assert.equal(env.scroll.style.getPropertyValue('scroll-behavior'), '');
    assert.equal(env.state.frame, null);
  } finally { env.close(); }
});

test('rapid repositioning replaces restoration frame instead of racing', () => {
  const env = harness('smooth', 'important');
  try {
    instantScroll(env.scroll, 100, env.state);
    instantScroll(env.scroll, 800, env.state);
    instantScroll(env.scroll, -20, env.state);
    assert.equal(env.queued.size, 1);
    assert.equal(env.scroll.scrollTop, 0);
    assert.equal(env.scroll.style.getPropertyValue('scroll-behavior'), 'auto');
    env.flush();
    assert.equal(env.scroll.style.getPropertyValue('scroll-behavior'), 'smooth');
    assert.equal(env.scroll.style.getPropertyPriority('scroll-behavior'), 'important');
  } finally { env.close(); }
});

test('unmount cancels pending frame and restores behavior', () => {
  const env = harness('instant');
  try {
    instantScroll(env.scroll, 1000, env.state);
    restoreScrollBehavior(env.scroll, env.state);
    assert.equal(env.queued.size, 0);
    assert.equal(env.scroll.style.getPropertyValue('scroll-behavior'), 'instant');
    assert.equal(env.state.frame, null);
  } finally { env.close(); }
});
