import { loadEnv, type ProxyOptions } from 'vite';

/**
 * 三份 Vite 配置共用的环境变量校验。
 *
 * 本仓库不内置任何后端地址，所以必填项缺失时应当让构建立刻失败，
 * 而不是产出一个运行时才报错的坏包。
 */

const REQUIRED_KEYS = ['VITE_API_BASE_URL', 'VITE_WS_URL'] as const;

export function assertKukeEnv(mode: string): void {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const missing = REQUIRED_KEYS.filter((key) => !env[key]?.trim());

  if (missing.length) {
    throw new Error(
      [
        '',
        `缺少必填环境变量：${missing.join('、')}`,
        '',
        'KukeChat 不内置任何后端地址，你需要先指向自己的后端：',
        '  1. 复制 .env.example 为 .env',
        '  2. 填入 VITE_API_BASE_URL 和 VITE_WS_URL',
        '',
        '详见 README 的「配置」一节。',
        ''
      ].join('\n')
    );
  }
}

/**
 * 开发服务器的接口代理。
 *
 * 默认转到本机后端（127.0.0.1:8000）。设环境变量 `KUKE_DEV_REMOTE=1` 时改为转到 `.env` 里配置的后端，
 * 方便用真实数据调界面。此时 Origin 一并改写成后端自己的来源，免得服务端按来源拒绝 WebSocket。
 */
export function devBackendProxy(mode: string): Record<string, ProxyOptions> {
  const remote = process.env.KUKE_DEV_REMOTE === '1' ? loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL.replace(/\/+$/, '') : null;
  const backend = remote ?? 'http://127.0.0.1:8000';
  const headers = remote ? { origin: remote } : undefined;
  return {
    '/api': { target: backend, changeOrigin: true, headers },
    '/uploads': { target: backend, changeOrigin: true, headers },
    '/ws': { target: backend.replace(/^http/, 'ws'), ws: true, changeOrigin: true, headers }
  };
}
