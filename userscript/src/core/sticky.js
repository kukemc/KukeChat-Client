import { feedRoot, feedToolbarEl } from '../feed/index.js';
import { root, toolbarEl } from '../notice/view.js';

export function syncStickyTop() {
  const header = document.querySelector('#root header');
  if (!header) return;
  // 顶栏本身是 relative，真正吸顶的是它里面的某一层
  let hh = 0;
  const nodes = [header].concat(Array.from(header.querySelectorAll('*')).slice(0, 80));
  for (let n = header.parentElement; n && n.id !== 'root'; n = n.parentElement) nodes.push(n);
  for (const n of nodes) {
    const p = getComputedStyle(n).position;
    if (p === 'fixed' || p === 'sticky') {
      const r = n.getBoundingClientRect();
      if (r.top <= 1 && r.height < 200) hh = Math.max(hh, Math.round(r.bottom));
    }
  }
  [[root, toolbarEl], [feedRoot, feedToolbarEl]].forEach(([r, tb]) => {
    if (!r) return;
    r.style.setProperty('--top', hh + 'px');
    r.style.setProperty('--sec-top', (hh + (tb ? tb.offsetHeight : 0)) + 'px');
  });
}

export let watching = false;
export function watchHeader() {
  if (watching) return;
  watching = true;
  const t = setInterval(() => {
    const header = document.querySelector('#root header');
    if (!header) return;
    clearInterval(t);
    syncStickyTop();
    // 顶栏、工具栏高度变了（换分类、缩放、字体加载）就重新算吸顶位置
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => syncStickyTop());
      ro.observe(header);
      if (toolbarEl) ro.observe(toolbarEl);
      if (feedToolbarEl) ro.observe(feedToolbarEl);
    }
  }, 300);
}
