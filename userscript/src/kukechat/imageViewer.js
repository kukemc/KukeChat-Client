// 图片查看器：全屏遮罩里看大图。多图左右翻（← →、两侧按钮、底部缩略图），滚轮缩放、拖动，双击在「适应屏幕 / 原始大小」之间切换，
// Esc 或点空白处关闭。右上角「原图」在新标签页打开。
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';

let current = null;

export function openImageViewer(urls, start = 0) {
  if (!urls || !urls.length) return;
  if (current) current.close();
  let index = Math.max(0, Math.min(start, urls.length - 1));
  let scale = 1;
  let x = 0;
  let y = 0;

  const img = h('img', { class: 'ccwk-iv-img', alt: '', draggable: 'false' });
  const stage = h('div', { class: 'ccwk-iv-stage' }, img);
  const counter = h('span', { class: 'ccwk-iv-count' });
  const original = h('a', { class: 'ccwk-iv-btn', target: '_blank', rel: 'noreferrer', title: '在新标签页打开原图' }, '原图');
  const closeBtn = h('button', { type: 'button', class: 'ccwk-iv-btn is-icon', title: '关闭（Esc）' }, icon('close', 16));
  const prev = h('button', { type: 'button', class: 'ccwk-iv-nav is-prev', title: '上一张（←）' }, icon('arrow', 20));
  const next = h('button', { type: 'button', class: 'ccwk-iv-nav is-next', title: '下一张（→）' }, icon('arrow', 20));
  const strip = h('div', { class: 'ccwk-iv-strip' }, urls.map((src, i) => {
    const t = h('button', { type: 'button', class: 'ccwk-iv-thumb' }, h('img', { src, alt: '', loading: 'lazy' }));
    t.addEventListener('click', (e) => { e.stopPropagation(); show(i); });
    return t;
  }));
  const root = h('div', { class: 'ccwk-iv', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'ccwk-iv-top' }, counter, h('span', { class: 'ccwk-iv-tools' }, original, closeBtn)),
    stage,
    urls.length > 1 ? prev : null,
    urls.length > 1 ? next : null,
    urls.length > 1 ? strip : null);

  const apply = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    img.classList.toggle('is-zoomed', scale > 1);
  };
  const reset = () => { scale = 1; x = 0; y = 0; apply(); };
  function show(i) {
    index = (i + urls.length) % urls.length;
    img.classList.remove('is-ready');
    img.onload = () => img.classList.add('is-ready');
    img.src = urls[index];
    original.href = urls[index];
    counter.textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : '';
    strip.querySelectorAll('.ccwk-iv-thumb').forEach((t, k) => t.classList.toggle('is-on', k === index));
    reset();
  }

  // 双击：适应屏幕 ↔ 原始大小（图本来就比屏幕小时放大到 2 倍）
  img.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (scale > 1) { reset(); return; }
    const fit = img.getBoundingClientRect().width / (img.naturalWidth || 1);
    scale = Math.max(2, 1 / fit);
    apply();
  });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const next = Math.min(8, Math.max(1, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (next === 1) { reset(); return; }
    scale = next;
    apply();
  }, { passive: false });
  let drag = null;
  img.addEventListener('pointerdown', (e) => {
    if (scale <= 1) return;
    e.preventDefault();
    drag = { sx: e.clientX - x, sy: e.clientY - y, moved: false };
    img.setPointerCapture(e.pointerId);
  });
  img.addEventListener('pointermove', (e) => {
    if (!drag) return;
    x = e.clientX - drag.sx;
    y = e.clientY - drag.sy;
    drag.moved = true;
    apply();
  });
  img.addEventListener('pointerup', () => { setTimeout(() => { drag = null; }, 0); });
  img.addEventListener('click', (e) => e.stopPropagation());
  // 点图片以外的地方关闭（拖动松手不算）
  stage.addEventListener('click', () => { if (!drag) close(); });
  prev.addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
  next.addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
  closeBtn.addEventListener('click', () => close());

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft' && urls.length > 1) show(index - 1);
    else if (e.key === 'ArrowRight' && urls.length > 1) show(index + 1);
  };
  const prevOverflow = document.documentElement.style.overflow;
  function close() {
    document.removeEventListener('keydown', onKey, true);
    document.documentElement.style.overflow = prevOverflow;
    root.classList.add('is-out');
    setTimeout(() => root.remove(), 150);
    current = null;
  }
  document.addEventListener('keydown', onKey, true);
  document.documentElement.style.overflow = 'hidden';
  document.body.appendChild(root);
  current = { close };
  show(index);
}

/** 给一组图片链接接上查看器：点击不再跳转，打开查看器（Ctrl / ⌘ / 中键点击照旧在新标签页打开） */
export function bindGallery(anchors, urls) {
  anchors.forEach((a, i) => a.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openImageViewer(urls, i);
  }));
}

/**
 * 消息中心、动态页里 CCW 内容中的图片（评论、回复里贴的图，系统通知里嵌的图）：点了不再跳到图片地址，打开查看器。
 * 同一条消息里的几张图可以一起翻。表情、头像、作品封面不算。
 */
const CONTENT_IMG = '.ccwn-body img:not(.ccwn-emoji):not(.ccwn-avatar)';
export function installContentImageViewer() {
  document.addEventListener('click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const img = e.target.closest && e.target.closest(CONTENT_IMG);
    if (!img) return;
    const body = img.closest('.ccwn-body');
    const imgs = [...body.querySelectorAll(CONTENT_IMG)];
    const urls = imgs.map((x) => (x.closest('a.ccwn-img') && x.closest('a.ccwn-img').href) || x.currentSrc || x.src);
    e.preventDefault();
    e.stopPropagation();
    openImageViewer(urls, Math.max(0, imgs.indexOf(img)));
  }, true);
}
