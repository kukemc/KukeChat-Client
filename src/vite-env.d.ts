/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 必填：后端 HTTP API 根地址，不含 `/api/v1`。 */
  readonly VITE_API_BASE_URL: string;
  /** 必填：实时消息 WebSocket 地址。 */
  readonly VITE_WS_URL: string;
  /** 可选：安全登录弹窗 postMessage 的可信来源，默认取 API origin。 */
  readonly VITE_SECURE_LOGIN_ORIGIN?: string;
  /** 可选：安卓客户端更新元数据地址，默认 `<API>/desktop-update.json`。 */
  readonly VITE_MOBILE_UPDATE_URL?: string;
  /** 可选：已发布的扩展文件地址，用于机器人接入说明。 */
  readonly VITE_EXTENSION_ASSET_URL?: string;
  /** 可选：机器人 API 文档地址，用于积木面板的文档入口。 */
  readonly VITE_BOT_API_DOCS_URL?: string;
}

interface KukeChatPreviewConfig {
  apiBaseUrl?: string;
  wsUrl?: string;
}

interface Window {
  __KukeChatPreviewConfig?: KukeChatPreviewConfig;
  __KukeChatAppMode?: 'native-mobile' | 'tauri-desktop';
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}
