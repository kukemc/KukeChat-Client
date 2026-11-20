import { api } from './api.js';
import { h } from './dom.js';
import { safeUrl } from './links.js';

/* ---------- 富文本：表情、图片、链接、系统消息里的 HTML ---------- */
export let emojiMap = null; // key(分类 id 或分类名) -> name -> url
export function loadEmojis() {
  if (emojiMap) return Promise.resolve();
  return api.emojis().then(([all, cats]) => {
    const map = {};
    const catById = {};
    (cats || []).forEach((c) => { catById[String(c.id)] = c.name; });
    (all || []).forEach((e) => {
      if (!e || !e.name || !e.imageUrl) return;
      const id = String(e.category);
      const keys = [id, catById[id]].filter(Boolean);
      keys.forEach((k) => { (map[k] = map[k] || {})[e.name] = e.imageUrl; });
    });
    emojiMap = map;
  }).catch(() => { emojiMap = {}; });
}
export const IMG_HOST = /^https:\/\/([a-z0-9-]+\.)*(ccw\.site|xiguacity\.cn|aliyuncs\.com|myqcloud\.com)\//i;

// 纯文本（评论）→ 节点：表情 (key_name)、图片 ![](url)、网址
export function richText(text) {
  const frag = document.createDocumentFragment();
  const re = /!\[[^\]]*\]\(([^)\s]+)\)|\(([^()_\s]+)_([^()]+)\)|(https?:\/\/[^\s<>"'，。！？、；：（）【】《》「」]+)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1] !== undefined) {
      if (IMG_HOST.test(m[1])) frag.appendChild(h('a', { class: 'ccwn-img', href: m[1], target: '_blank', rel: 'noreferrer' }, h('img', { src: m[1], loading: 'lazy', alt: '' })));
      else frag.appendChild(document.createTextNode(m[0]));
    } else if (m[2] !== undefined) {
      const url = emojiMap && emojiMap[m[2]] && emojiMap[m[2]][m[3]];
      if (url) frag.appendChild(h('img', { class: 'ccwn-emoji', src: url, alt: m[3], title: m[3] }));
      else frag.appendChild(document.createTextNode(m[2] === 'default' ? m[3] : m[0]));
    } else {
      const url = safeUrl(m[4]);
      frag.appendChild(url ? h('a', { href: url, target: '_blank', rel: 'noreferrer' }, m[4]) : document.createTextNode(m[4]));
    }
    last = re.lastIndex;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

// 系统/社区消息里的 HTML：只留链接、加粗和换行，其余标签展开成文字
export function safeHtml(html) {
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  const out = document.createDocumentFragment();
  const walk = (node, parent) => {
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) { parent.appendChild(document.createTextNode(c.textContent)); return; }
      if (c.nodeType !== 1) return;
      const tag = c.tagName.toLowerCase();
      if (tag === 'a') {
        const url = safeUrl(c.getAttribute('href'));
        const a = url ? h('a', { href: url, target: '_blank', rel: 'noreferrer' }) : h('span');
        walk(c, a); parent.appendChild(a);
      } else if (tag === 'b' || tag === 'strong') {
        const b = h('strong'); walk(c, b); parent.appendChild(b);
      } else if (tag === 'br') {
        parent.appendChild(document.createTextNode('\n'));
      } else if (tag === 'script' || tag === 'style') {
        /* drop */
      } else {
        const block = ['p', 'div', 'tr', 'li', 'table'].includes(tag);
        walk(c, parent);
        if (block) parent.appendChild(document.createTextNode('\n'));
      }
    });
  };
  walk(doc.body.firstChild, out);
  // 合并连续空行、去掉行首缩进
  const box = document.createElement('div'); box.appendChild(out);
  const tw = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  let nl = 2; const texts = []; while (tw.nextNode()) texts.push(tw.currentNode);
  texts.forEach((t) => {
    let r = '';
    for (const ch of t.textContent.replace(/\r/g, '')) {
      if (ch === '\n') { if (nl < 1) r += ch; nl++; }
      else if ((ch === ' ' || ch === '\t' || ch === '\u00a0') && nl > 0) { /* 行首空白 */ }
      else { r += ch; nl = 0; }
    }
    t.textContent = r;
  });
  while (box.firstChild) out.appendChild(box.firstChild);
  // 去掉首尾空行
  while (out.firstChild && out.firstChild.nodeType === 3 && !out.firstChild.textContent.trim()) out.removeChild(out.firstChild);
  while (out.lastChild && out.lastChild.nodeType === 3 && !out.lastChild.textContent.trim()) out.removeChild(out.lastChild);
  return out;
}
export const looksHtml = (s) => /<\/?[a-z][^>]*>/i.test(s);
export const plain = (s) => (looksHtml(s) ? new DOMParser().parseFromString(s, 'text/html').body.textContent : s);
