import CSS from '../styles/app.css?raw';

export let styled = false;
export function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.id = 'ccwn-style';
  s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}

// 顶栏在 React 里，跟随它吸顶：读取顶栏高度
