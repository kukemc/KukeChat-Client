/**
 * 舞台几何诊断
 *
 * 在 CCW 编辑器或作品页的控制台里整段粘贴执行。它复现游戏模式定位覆盖层的
 * 全部计算，把每一步的结果打印出来，用于排查「聊天框位置/大小不对」。
 */
(async () => {
  // ---- 找 vm / runtime（与 ccw-api-probe.js 同一套） ----
  const isVM = (o) =>
    o && typeof o === 'object' && o.runtime && typeof o.runtime === 'object' &&
    (typeof o.toJSON === 'function' || typeof o.setEditingTarget === 'function' || o.extensionManager);

  function findVM() {
    for (const c of [window.vm, window.Scratch && window.Scratch.vm, window.__vm__]) {
      if (isVM(c)) return c;
    }
    const canvas = document.querySelector('canvas');
    let fiber = canvas && canvas[Object.keys(canvas).find((k) => k.startsWith('__reactFiber$'))];
    while (fiber) {
      const bag = fiber.memoizedProps;
      if (bag && isVM(bag.vm)) return bag.vm;
      fiber = fiber.return;
    }
    return null;
  }

  const vm = findVM();
  if (!vm) { console.error('没找到 VM'); return; }
  const runtime = vm.runtime;

  // ---- 1. 页面上所有 canvas ----
  console.log('%c 页面上的 canvas ', 'background:#5b8cff;color:#fff;font-weight:bold');
  const all = Array.from(document.querySelectorAll('canvas')).map((c, i) => ({
    序号: i,
    'CSS宽x高': `${c.offsetWidth}x${c.offsetHeight}`,
    '内部宽x高': `${c.width}x${c.height}`,
    可见: c.offsetParent !== null,
    父容器: c.parentElement ? `${c.parentElement.tagName}.${(c.parentElement.className || '').toString().slice(0, 30)}` : '-',
  }));
  console.table(all);

  // ---- 2. 扩展会选中哪个 ----
  const renderer = runtime.renderer;
  const fromRenderer = renderer && (renderer.canvas || (renderer.gl && renderer.gl.canvas));
  let picked = fromRenderer instanceof HTMLCanvasElement && fromRenderer.isConnected ? fromRenderer : null;
  console.log('从渲染器取到 canvas:', picked ? '是' : '否（将退回“最大可见 canvas”）');
  if (!picked) {
    let bestArea = 0;
    for (const c of document.querySelectorAll('canvas')) {
      if (c.offsetParent === null) continue;
      const area = c.offsetWidth * c.offsetHeight;
      if (area > bestArea) { bestArea = area; picked = c; }
    }
  }
  if (!picked) { console.error('没找到可用 canvas'); return; }
  console.log('选中的 canvas:', picked, `CSS ${picked.offsetWidth}x${picked.offsetHeight}`);

  // ---- 3. 舞台逻辑尺寸 ----
  const native = renderer && renderer._nativeSize;
  const logical = Array.isArray(native) && native.length >= 2 && native[0] > 0
    ? { width: native[0], height: native[1] }
    : { width: runtime.stageWidth || 480, height: runtime.stageHeight || 360 };
  console.log('舞台逻辑尺寸:', logical, native ? '(来自 renderer._nativeSize)' : '(来自默认值)');

  // ---- 4. 挂载容器 ----
  const parent = picked.parentElement;
  const parentPos = parent ? getComputedStyle(parent).position : '-';
  const parentDisplay = parent ? getComputedStyle(parent).display : '-';
  console.log('挂载容器:', parent, `position=${parentPos} display=${parentDisplay}`);
  if (parentPos === 'static') console.log('  → 扩展会把它临时改成 relative（必须，否则定位基准会跑到更上层祖先）');
  if (parentDisplay === 'contents') console.log('  → display:contents 无法定位，扩展会退回 body');

  // ---- 5. 覆盖层盒子 ----
  const usesLayoutBox = parent && picked.offsetParent === parent;
  let box;
  if (usesLayoutBox) {
    box = { left: picked.offsetLeft, top: picked.offsetTop, width: picked.offsetWidth, height: picked.offsetHeight };
    console.log('定位方式: 布局盒 offsetLeft/offsetTop（推荐路径）');
  } else {
    const cr = picked.getBoundingClientRect();
    const pr = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };
    box = { left: cr.left - pr.left, top: cr.top - pr.top, width: cr.width, height: cr.height };
    console.log('定位方式: getBoundingClientRect 差值（回退路径，canvas.offsetParent 不是父容器）');
  }
  console.log('覆盖层盒子:', box);

  // ---- 6. 缩放 ----
  const scale = Math.min(box.width / logical.width, box.height / logical.height) || 1;
  console.log('%c缩放系数: ' + scale.toFixed(3), 'font-weight:bold;color:#30a46c');
  console.log('  聊天框默认 190x118 逻辑 → 屏幕上约',
    Math.round(190 * scale) + 'x' + Math.round(118 * scale), 'px');
  if (Math.abs(scale - 1) < 0.02 && box.width > logical.width * 1.1) {
    console.warn('  ⚠ 缩放接近 1 但舞台明显更大 —— 说明选错了 canvas 或逻辑尺寸不对');
  }

  // ---- 7. 检查页面上真实存在的覆盖层 ----
  console.log('%c 真实覆盖层状态 ', 'background:#f5a524;color:#000;font-weight:bold');
  const live = document.getElementById('kukechat-game-overlay');
  if (!live) {
    console.log('页面上没有覆盖层元素 —— 还没执行「接入游戏聊天」积木，或已断开。');
  } else {
    const cs = getComputedStyle(live);
    console.table([{
      position: cs.position,
      left: cs.left, top: cs.top,
      width: cs.width, height: cs.height,
      overflow: cs.overflow,
      zIndex: cs.zIndex,
      display: cs.display,
    }]);
    console.log('挂载在:', live.parentElement, live.parentElement === parent ? '(舞台容器，正确)' : '(不是舞台容器！)');

    // overflow 是判断新旧版本最快的标志：旧版没有这行
    if (cs.overflow !== 'hidden') {
      console.warn('%c⚠ overflow 不是 hidden —— 加载的应该是旧版扩展。', 'color:#e5484d;font-weight:bold');
      console.warn('  社区侧有扩展缓存：请先在扩展列表里卸载 KukeChat，再重新加载新的 KukeChat.js。');
    } else {
      console.log('overflow=hidden，是新版代码。');
    }

    const lr = live.getBoundingClientRect();
    const cr = picked.getBoundingClientRect();
    console.log('覆盖层屏幕矩形:', { left: Math.round(lr.left), top: Math.round(lr.top), w: Math.round(lr.width), h: Math.round(lr.height) });
    console.log('舞台屏幕矩形:  ', { left: Math.round(cr.left), top: Math.round(cr.top), w: Math.round(cr.width), h: Math.round(cr.height) });
    const dx = Math.round(lr.left - cr.left), dy = Math.round(lr.top - cr.top);
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2 || Math.abs(lr.width - cr.width) > 2) {
      console.warn(`%c⚠ 覆盖层与舞台没对齐：偏移 (${dx}, ${dy})，宽度差 ${Math.round(lr.width - cr.width)}`, 'color:#e5484d;font-weight:bold');
    } else {
      console.log('%c覆盖层与舞台已对齐。', 'color:#30a46c');
    }
  }

  console.log('%c把以上输出整段截图发回即可定位问题。', 'color:#5b8cff;font-weight:bold');
})();
