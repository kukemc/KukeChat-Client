/**
 * 部署相关配置的唯一来源。
 *
 * 所有值都由 Vite 在构建期从 `.env` 注入，仓库里不保留任何服务器地址。
 * 必填项缺失时，构建会被 `vite.env.ts` 提前拦下并给出提示；这里的运行期
 * 检查只是兜底，避免极端情况下静默产出一个连不上后端的包。
 */

function readEnv(key: string): string | undefined {
  const value = (import.meta.env as Record<string, string | boolean | undefined>)[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requireEnv(key: string): string {
  const value = readEnv(key);
  if (!value) {
    throw new Error(`[KukeChat] 缺少必填环境变量 ${key}。请复制 .env.example 为 .env 并填入你自己的后端地址。`);
  }
  return value;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function originOf(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return stripTrailingSlash(value);
  }
}

/** 后端 HTTP API 根地址，例如 `https://chat.example.com`，不包含 `/api/v1`。 */
export const API_BASE_URL = stripTrailingSlash(requireEnv('VITE_API_BASE_URL'));

/** 实时消息 WebSocket 地址，例如 `wss://chat.example.com/ws`。 */
export const WS_URL = requireEnv('VITE_WS_URL');

/** 后端来源，用于把相对的上传路径解析成绝对地址。 */
export const API_ORIGIN = originOf(API_BASE_URL);

/**
 * 安全登录弹窗回传 `postMessage` 时的可信来源。
 * 默认取 API 的 origin；登录页与 API 不同域时用 `VITE_SECURE_LOGIN_ORIGIN` 覆盖。
 */
export const SECURE_LOGIN_ORIGIN = readEnv('VITE_SECURE_LOGIN_ORIGIN') ?? API_ORIGIN;

/**
 * 安卓客户端检查更新用的元数据地址，需返回 `{ mobile_version, android_url }`。
 * 默认为 API 根目录下的 `/desktop-update.json`。
 */
export const MOBILE_UPDATE_METADATA_URL =
  readEnv('VITE_MOBILE_UPDATE_URL') ?? `${API_BASE_URL}/desktop-update.json`;

/**
 * 已发布的扩展文件地址，展示在机器人接入说明里，供用户在 CCW/Gandi 中加载。
 * 未配置时相关入口自动隐藏。
 */
export const EXTENSION_ASSET_URL = readEnv('VITE_EXTENSION_ASSET_URL') ?? null;

/**
 * 积木面板「查看文档」跳转的机器人 API 文档地址（对应本仓库 `docs/bot-api.md`）。
 * 未配置时不展示文档入口。
 */
export const BOT_API_DOCS_URL = readEnv('VITE_BOT_API_DOCS_URL') ?? null;
