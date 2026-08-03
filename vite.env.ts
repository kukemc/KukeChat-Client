import { loadEnv } from 'vite';

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
