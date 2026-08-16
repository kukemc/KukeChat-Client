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
  const SAFE_TO_CALL = new Set(['getUserInfo', 'getProjectStats', 'isMyFans', 'isLiked', 'getCoinCount']);

  // ---------------------------------------------------------------- 找 vm / runtime
  //
  // 解析顺序参考 kukemc/WebDev 扩展里经过实战验证的链路。要点是**按能力判断**
  // 而不是盲信引用：不同版本的编辑器 / 播放器挂载位置不一样，光看名字会拿到
  // 半成品对象。`runtime.extensionManager.vm` 是被验证最可靠的一条。

  const isVM = (o) => o && typeof o === 'object' && (typeof o.toJSON === 'function' || typeof o.setEditingTarget === 'function');
  const isRuntime = (o) => o && typeof o === 'object' && (o.ccwAPI || o.extensionManager || o.targets || o.gandi);

  function findRuntime() {
    const tried = [];

    const push = (label, value) => { tried.push({ 路径: label, 命中: Boolean(value) }); return value; };

    // 1) 直接挂在 window 上的 VM
    const vmCandidates = [
      ['window.vm', window.vm],
      ['window.Scratch?.vm', window.Scratch && window.Scratch.vm],
      ['window.__vm__', window.__vm__],
      ['window.scratchVM', window.scratchVM],
    ];
    for (const [label, vm] of vmCandidates) {
      push(label, vm);
      if (isVM(vm) && isRuntime(vm.runtime)) {
        console.table(tried);
        return { runtime: vm.runtime, vm, from: `${label}.runtime` };
      }
    }

    // 2) 直接挂在 window 上的 runtime
    const runtimeCandidates = [
      ['window.runtime', window.runtime],
      ['window.Scratch?.vm?.runtime', window.Scratch && window.Scratch.vm && window.Scratch.vm.runtime],
    ];
    for (const [label, rt] of runtimeCandidates) {
      push(label, rt);
      if (isRuntime(rt)) {
        console.table(tried);
        return { runtime: rt, vm: rt.extensionManager && rt.extensionManager.vm, from: label };
      }
    }

    // 3) 兜底：扫一遍 window，找带 runtime 特征的对象
    for (const key of Object.keys(window)) {
      let value;
      try { value = window[key]; } catch { continue; }
      if (!value || typeof value !== 'object') continue;
      if (isRuntime(value)) {
        console.table(tried);
        return { runtime: value, vm: value.extensionManager && value.extensionManager.vm, from: `window.${key}（扫描命中）` };
      }
      if (isVM(value) && isRuntime(value.runtime)) {
        console.table(tried);
        return { runtime: value.runtime, vm: value, from: `window.${key}.runtime（扫描命中）` };
      }
    }

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

  const api = runtime.ccwAPI;
  if (!api) {
    console.error('%c✗ runtime.ccwAPI 不存在', 'color:#e5484d;font-weight:bold');
    console.info('这个环境可能不提供社区能力（例如离线运行时）。');
    return;
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
