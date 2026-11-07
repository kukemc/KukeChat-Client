/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 必填：后端 HTTP API 根地址，不含 `/api/v1`。 */
  readonly VITE_API_BASE_URL: string;
  /** 必填：实时消息 WebSocket 地址。 */
  readonly VITE_WS_URL: string;
  /** 可选：安全登录弹窗 postMessage 的可信来源，默认取 API origin。 */
  readonly VITE_SECURE_LOGIN_ORIGIN?: string;
  /** 可选：桌面端更新元数据地址，默认 `<API>/desktop-update.json`。 */
  readonly VITE_DESKTOP_UPDATE_URL?: string;
  /** 可选：已发布的扩展文件地址，用于机器人接入说明。 */
  readonly VITE_EXTENSION_ASSET_URL?: string;
  /** 可选：机器人 API 文档地址，用于积木面板的文档入口。 */
  readonly VITE_BOT_API_DOCS_URL?: string;
  /** 可选：gandi-blocks 积木渲染库的目录地址（结尾带 /），扩展在播放器页渲染积木消息时懒加载。 */
  readonly VITE_GANDI_BLOCKS_BASE?: string;
}

/** 构建期注入：随包发布的 gandi-blocks 相对页面的目录（扩展构建为空串）。见 vite.gandiBlocks.ts。 */
declare const __KUKE_GANDI_BLOCKS_LOCAL__: string;
/** 构建期注入：gandi-blocks 文件内容的指纹，拼在脚本地址后面防缓存。 */
declare const __KUKE_GANDI_BLOCKS_VERSION__: string;

interface KukeChatPreviewConfig {
  apiBaseUrl?: string;
  wsUrl?: string;
}

interface Window {
  __KukeChatPreviewConfig?: KukeChatPreviewConfig;
  __KukeChatAppMode?: 'tauri-desktop';
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}
