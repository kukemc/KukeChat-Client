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

  // ---------------------------------------------------------------- 找 runtime
  function findRuntime() {
    const candidates = [
      window.vm,
      window.__vm__,
      window.scratchVM,
      window.Scratch && window.Scratch.vm,
      window.ScratchVM,
    ];
    for (const vm of candidates) {
      if (vm && vm.runtime) return { runtime: vm.runtime, from: 'window.vm.runtime' };
      if (vm && vm.ccwAPI) return { runtime: vm, from: 'window.vm' };
    }
    // 兜底：遍历 window 上的对象，找带 ccwAPI 或 extensionManager 的
    for (const key of Object.keys(window)) {
      let value;
      try { value = window[key]; } catch { continue; }
      if (!value || typeof value !== 'object') continue;
      if (value.ccwAPI) return { runtime: value, from: `window.${key}` };
      if (value.runtime && value.runtime.ccwAPI) return { runtime: value.runtime, from: `window.${key}.runtime` };
    }
    return null;
  }

  const found = findRuntime();
  if (!found) {
    console.error('%c✗ 没找到 Scratch runtime', 'color:#e5484d;font-weight:bold');
    console.info('请确认这个页面确实加载了 CCW 作品（编辑器或播放页），并且已经完全加载完毕。');
    return;
  }

  const { runtime, from } = found;
  console.log('%c✓ 找到 runtime', 'color:#30a46c;font-weight:bold', `来源: ${from}`);

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

  // runtime 本身也扫一遍
  const runtimeIdLike = [];
  for (const key of Object.getOwnPropertyNames(runtime)) {
    if (/oid|projectid|project_id|creationid/i.test(key)) {
      let v;
      try { v = runtime[key]; } catch { v = '<读取失败>'; }
      runtimeIdLike.push({ 路径: `runtime.${key}`, 值: String(v).slice(0, 80) });
    }
  }
  if (runtimeIdLike.length) {
    console.log('%c⚠ runtime 上的疑似字段：', 'color:#f5a524;font-weight:bold');
    console.table(runtimeIdLike);
  } else {
    console.log('runtime 顶层也没有 oid / projectId 字段。');
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
