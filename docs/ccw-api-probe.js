/**
 * CCW / Gandi 运行时接口探测脚本
 *
 * 在 CCW 作品页（或编辑器）的浏览器控制台里整段粘贴执行，用来列出
 * `runtime.ccwAPI` 实际暴露的全部成员，并顺带搜索疑似作品 ID 的字段。
 *
 * 安全说明：脚本只会调用「零参数且不会弹窗」的只读方法（getUserInfo /
 * getProjectStats / isMyFans / isLiked / getCoinCount）。像 requestCoins、
 * setAvatar、commentWithStageSnapshot 这类会打扰用户的接口一律跳过，
 * 只打印签名，不实际调用。
 */
(async () => {
  // 零参数、语义上只读的接口才试调。
  // 明确排除：preActionInterceptor（用途不明，可能有副作用）、
  // sendPlayEventCode（会上报事件）、uploadAssetToCloud（会写云端）、
  // 以及所有需要参数或会弹确认框的接口。
  const SAFE_TO_CALL = new Set([
    'getUserInfo',
    'getProjectStats',
    'getProjectUUID',
    'getProjectSb3Id',
    'getProjectDonateRanking',
    'getDeviceType',
    'getOnlineExtensionsConfig',
    'isMyFans',
    'isLiked',
    'getCoinCount',
  ]);

  // ---------------------------------------------------------------- 找 vm / runtime
  //
  // 解析顺序参考 kukemc/WebDev 扩展里经过实战验证的链路。要点是**按能力判断**
  // 而不是盲信引用：不同版本的编辑器 / 播放器挂载位置不一样，光看名字会拿到
  // 半成品对象。`runtime.extensionManager.vm` 是被验证最可靠的一条。

  // 判据要足够严：VM 必须同时带 runtime 和序列化能力，runtime 必须带 targets +
  // extensionManager。之前只判 `o.gandi || o.targets` 会把 window 自身也匹配进去
  // （window.window === window），导致误报「找到 runtime」。
  const isVM = (o) =>
    o && typeof o === 'object' &&
    o.runtime && typeof o.runtime === 'object' &&
    (typeof o.toJSON === 'function' || typeof o.setEditingTarget === 'function' || o.extensionManager);

  const isRuntime = (o) =>
    o && typeof o === 'object' && o !== window &&
    Array.isArray(o.targets) &&
    (o.extensionManager || o.ccwAPI || o._primitives);

  // 这些是 window 的自引用，扫描时必须跳过，否则会陷进自身
  const SELF_REFS = new Set(['window', 'self', 'globalThis', 'top', 'parent', 'frames', 'document']);

  const wrap = (vm) => ({ runtime: vm.runtime, vm, from: '' });

  // ---- React fiber 工具 ----
  const fiberKey = (node, prefix) => Object.keys(node).find((k) => k.startsWith(prefix));

  function fiberOf(node) {
    const k = fiberKey(node, '__reactFiber$') || fiberKey(node, '__reactInternalInstance$');
    return k ? node[k] : null;
  }

  function rootFiberOf(node) {
    const k = fiberKey(node, '__reactContainer$');
    if (k) return node[k];
    const legacy = node._reactRootContainer;
    return (legacy && legacy._internalRoot && legacy._internalRoot.current) || null;
  }

  /** 在一个对象的浅层属性里找 VM（组件 props / state 常见形态）。 */
  function vmInBag(bag) {
    if (!bag || typeof bag !== 'object') return null;
    if (isVM(bag.vm)) return bag.vm;
    if (isVM(bag)) return bag;
    // redux: props.store.getState().scratchGui.vm
    try {
      if (bag.store && typeof bag.store.getState === 'function') {
        const state = bag.store.getState();
        if (state && state.scratchGui && isVM(state.scratchGui.vm)) return state.scratchGui.vm;
      }
    } catch { /* store 可能未就绪 */ }
    return null;
  }

  function searchFiberTree(startFiber, maxNodes) {
    const queue = [startFiber];
    let visited = 0;
    while (queue.length && visited < maxNodes) {
      const fiber = queue.shift();
      if (!fiber) continue;
      visited += 1;
      const hit = vmInBag(fiber.memoizedProps) || vmInBag(fiber.memoizedState) || vmInBag(fiber.stateNode);
      if (hit) return { vm: hit, visited };
      if (fiber.child) queue.push(fiber.child);
      if (fiber.sibling) queue.push(fiber.sibling);
    }
    return { vm: null, visited };
  }

  function findRuntime() {
    const tried = [];
    const attempt = (label, resolver) => {
      let vm = null;
      try { vm = resolver(); } catch { vm = null; }
      tried.push({ 路径: label, 命中: Boolean(vm) });
      return vm;
    };

    // 1) 全局直挂（旧版编辑器 / 部分播放器）
    let vm =
      attempt('window.vm', () => (isVM(window.vm) ? window.vm : null)) ||
      attempt('window.Scratch.vm', () => (window.Scratch && isVM(window.Scratch.vm) ? window.Scratch.vm : null)) ||
      attempt('window.__vm__', () => (isVM(window.__vm__) ? window.__vm__ : null)) ||
      attempt('window.scratchVM', () => (isVM(window.scratchVM) ? window.scratchVM : null));
    if (vm) { console.table(tried); return { ...wrap(vm), from: tried[tried.length - 1].路径 }; }

    // 2) 从舞台 canvas 的 fiber 往上找 —— scratch-gui 里大量组件都把 vm 当 prop 传
    vm = attempt('舞台 canvas 的 React 祖先链', () => {
      const canvas = document.querySelector('canvas');
      let fiber = canvas ? fiberOf(canvas) : null;
      let depth = 0;
      while (fiber && depth < 60) {
        const hit = vmInBag(fiber.memoizedProps) || vmInBag(fiber.memoizedState) || vmInBag(fiber.stateNode);
        if (hit) return hit;
        fiber = fiber.return;
        depth += 1;
      }
      return null;
    });
    if (vm) { console.table(tried); return { ...wrap(vm), from: '舞台 canvas 的 React 祖先链' }; }

    // 3) 从 React 根节点广度优先扫整棵树
    vm = attempt('React 根节点遍历', () => {
      const roots = [document.getElementById('app'), document.getElementById('root'), ...document.body.children];
      for (const node of roots) {
        if (!node || node.nodeType !== 1) continue;
        const root = rootFiberOf(node) || fiberOf(node);
        if (!root) continue;
        const { vm: hit } = searchFiberTree(root, 8000);
        if (hit) return hit;
      }
      return null;
    });
    if (vm) { console.table(tried); return { ...wrap(vm), from: 'React 根节点遍历' }; }

    // 4) 兜底：扫 window 自有属性（跳过自引用，判据从严）
    vm = attempt('window 属性扫描', () => {
      for (const key of Object.keys(window)) {
        if (SELF_REFS.has(key)) continue;
        let value;
        try { value = window[key]; } catch { continue; }
        if (isVM(value)) return value;
        if (isRuntime(value) && isVM(value.extensionManager && value.extensionManager.vm)) {
          return value.extensionManager.vm;
        }
      }
      return null;
    });
    if (vm) { console.table(tried); return { ...wrap(vm), from: 'window 属性扫描' }; }

    console.table(tried);
    return null;
  }

  const found = findRuntime();
  if (!found) {
    console.error('%c✗ 没找到 Scratch runtime', 'color:#e5484d;font-weight:bold');
    console.info('请确认这个页面确实加载了 CCW 作品（编辑器或播放页），并且已经完全加载完毕。');
    return;
  }

  const { runtime, from } = found;
  // runtime.extensionManager.vm 是被验证最可靠的反查路径，优先用它回补 vm
  const vm = (runtime.extensionManager && runtime.extensionManager.vm) || runtime.vm || runtime._vm || found.vm || null;
  console.log('%c✓ 找到 runtime', 'color:#30a46c;font-weight:bold', `来源: ${from}`);
  console.log('  runtime =', runtime);
  console.log('  vm =', vm, vm ? '' : '（没找到，不影响 ccwAPI 探测）');

  // ccwAPI 不一定叫这个名字，也不一定挂在 runtime 上，先四处找一下
  let api = runtime.ccwAPI;
  let apiPath = 'runtime.ccwAPI';
  if (!api) {
    const searchIn = [['runtime', runtime], ['vm', vm]].filter(([, o]) => o);
    outer: for (const [label, obj] of searchIn) {
      for (const key of Object.getOwnPropertyNames(obj)) {
        if (!/ccw|community|kontakt|platform/i.test(key)) continue;
        let value;
        try { value = obj[key]; } catch { continue; }
        if (value && typeof value === 'object') {
          api = value;
          apiPath = `${label}.${key}`;
          break outer;
        }
      }
    }
  }

  if (!api) {
    console.error('%c✗ 没找到 ccwAPI', 'color:#e5484d;font-weight:bold');
    console.info('runtime 上与社区相关的属性一个都没有。下面把 runtime 的全部属性列出来，请截图发回：');
    const keys = Object.getOwnPropertyNames(runtime).filter((k) => !k.startsWith('_'));
    console.log('runtime 自有属性（%d 个）:', keys.length, keys);
    if (vm) {
      const vmKeys = Object.getOwnPropertyNames(vm).filter((k) => !k.startsWith('_'));
      console.log('vm 自有属性（%d 个）:', vmKeys.length, vmKeys);
    }
    console.log('提示：如果这是作品播放页而不是编辑器，社区能力也可能确实不下发。');
    return;
  }

  if (apiPath !== 'runtime.ccwAPI') {
    console.log('%c⚠ ccwAPI 不在预期位置', 'color:#f5a524;font-weight:bold', `实际路径: ${apiPath}`);
  }

  // ---------------------------------------------------------------- 列出成员
  const names = new Set();
  for (let obj = api; obj && obj !== Object.prototype; obj = Object.getPrototypeOf(obj)) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key !== 'constructor') names.add(key);
    }
  }

  const rows = [...names].sort().map((name) => {
    let value;
    try { value = api[name]; } catch { return { 成员: name, 类型: '<读取失败>', 参数个数: '', 值: '' }; }
    const type = typeof value;
    return {
      成员: name,
      类型: type,
      参数个数: type === 'function' ? value.length : '',
      值: type === 'function' ? '' : String(value).slice(0, 60),
    };
  });

  console.log(`%c runtime.ccwAPI 共 ${rows.length} 个成员 `, 'background:#5b8cff;color:#fff;font-weight:bold');
  console.table(rows);

  // ---------------------------------------------------------------- 搜索作品 ID
  console.log('%c 搜索疑似作品 ID 的接口 ', 'background:#f5a524;color:#000;font-weight:bold');
  const idLike = [...names].filter((n) => /oid|projectid|project_id|creation|workid|work_id|getproject|currentproject/i.test(n));
  if (idLike.length) {
    console.log('%c⚠ 发现可能相关的成员：', 'color:#f5a524;font-weight:bold', idLike);
  } else {
    console.log('ccwAPI 上没有名字含 oid / projectId / creation 的成员。');
  }

  // runtime / vm / gandi / 已加载扩展实例，全都扫一遍
  const ID_RX = /oid|projectid|project_id|creationid|creation_id|workid|work_id/i;
  const hits = [];
  const seenPaths = new Set();
  const seenObjects = new WeakSet();

  function scanObject(label, obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 2) return;
    // 同一个对象可能从多条路径到达（例如 runtime.gandi 既被递归也被显式扫描）
    if (seenObjects.has(obj)) return;
    seenObjects.add(obj);
    let keys;
    try { keys = Object.getOwnPropertyNames(obj); } catch { return; }
    for (const key of keys) {
      if (key.startsWith('_') && depth > 0) continue;
      let value;
      try { value = obj[key]; } catch { continue; }
      if (ID_RX.test(key) && !seenPaths.has(`${label}.${key}`)) {
        seenPaths.add(`${label}.${key}`);
        const preview = typeof value === 'function' ? `<function/${value.length}>` : String(value).slice(0, 80);
        hits.push({ 路径: `${label}.${key}`, 值: preview });
      }
      // 只对少量已知容器再下钻一层，避免遍历整棵对象树
      if (depth < 2 && value && typeof value === 'object' && /gandi|project|meta|config|info/i.test(key)) {
        scanObject(`${label}.${key}`, value, depth + 1);
      }
    }
  }

  scanObject('runtime', runtime, 0);
  if (vm) scanObject('vm', vm, 0);
  if (runtime.gandi) scanObject('runtime.gandi', runtime.gandi, 1);

  // 已加载的扩展实例（其中可能有别的扩展已经拿到了作品信息）
  const extBag = runtime.ext || (vm && vm.runtime && vm.runtime.ext);
  if (extBag && typeof extBag === 'object') {
    console.log('已加载的扩展实例:', Object.keys(extBag));
    for (const extId of Object.keys(extBag)) {
      scanObject(`runtime.ext.${extId}`, extBag[extId], 1);
    }
  }

  if (hits.length) {
    console.log('%c⚠ 疑似作品 ID 的字段：', 'color:#f5a524;font-weight:bold');
    console.table(hits);
  } else {
    console.log('runtime / vm / 扩展实例上都没有 oid / projectId 字段。');
  }

  console.log('当前地址:', window.location.href);
  const urlOid = window.location.pathname.match(/\/detail\/([0-9a-fA-F]{24})/);
  console.log('从 URL 解析到的作品 oid:', urlOid ? urlOid[1] : '（不在作品播放页，解析不到）');

  // ---------------------------------------------------------------- 试调只读接口
  console.log('%c 试调只读接口（不会弹窗） ', 'background:#30a46c;color:#fff;font-weight:bold');
  for (const name of [...names].sort()) {
    if (typeof api[name] !== 'function') continue;
    if (!SAFE_TO_CALL.has(name)) {
      console.log(`· ${name}() —— 跳过（会打扰用户或需要参数）`);
      continue;
    }
    try {
      const result = await api[name]();
      console.log(`· ${name}() →`, result);
    } catch (error) {
      console.log(`· ${name}() 抛错:`, error && error.message);
    }
  }

  console.log('%c完成。如果上面出现了能拿到作品 oid 的接口，请把它贴出来。', 'color:#5b8cff;font-weight:bold');
})();
