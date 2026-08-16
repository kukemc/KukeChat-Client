import type { RealtimeEvent } from './realtime';

export type ScratchBlockTypeValue = string;
export type ScratchArgumentTypeValue = string;

export interface ScratchLike {
  BlockType: {
    COMMAND: ScratchBlockTypeValue;
    REPORTER: ScratchBlockTypeValue;
    BOOLEAN: ScratchBlockTypeValue;
    HAT: ScratchBlockTypeValue;
    BUTTON: ScratchBlockTypeValue;
  };
  ArgumentType: {
    STRING: ScratchArgumentTypeValue;
    NUMBER: ScratchArgumentTypeValue;
    BOOLEAN: ScratchArgumentTypeValue;
  };
}

export interface ScratchFormatMessageInput {
  id: string;
  default: string;
  description: string;
}

export type ScratchFormatMessage = (message: ScratchFormatMessageInput) => string;

/**
 * CCW / Gandi 社区平台向扩展开放的能力。完整清单见 docs/ccw-runtime-api.md。
 *
 * 这些成员在编辑器 / 播放器 / 离线运行时的可用集合不同，调用前必须逐个检测。
 * 注意：返回值来自页面，可被篡改，只能用于展示，不能作为身份或权限依据。
 */
export interface CcwPlatformApi {
  getUserInfo?: () => Promise<{
    userId?: string | number;
    userName?: string;
    uuid?: string;
    /** 24 位十六进制，等同于 KukeChat 的 ccw_student_oid。 */
    oid?: string;
    avatar?: string;
    following?: number;
    followers?: number;
    liked?: number;
    gender?: string;
    constellation?: string;
  } | null>;
  /** 设备类型，实测返回 'PC'。 */
  getDeviceType?: () => Promise<string>;
  /** 当前作品 UUID。Kontakt 扩展未使用，实测存在，无官方文档。 */
  getProjectUUID?: () => Promise<string>;
  /** 当前作品的 sb3 资源 ID。同样无官方文档。 */
  getProjectSb3Id?: () => Promise<string>;
  getProjectStats?: () => Promise<{
    commentCount?: number;
    likeCount?: number;
    favoriteCount?: number;
    totalBucks?: number;
  }>;
  isMyFans?: () => Promise<boolean>;
  isLiked?: () => Promise<boolean>;
  getCoinCount?: () => Promise<number>;
  isFollowed?: (userId: string) => Promise<boolean>;
  isLikedProject?: (oid: string) => Promise<boolean>;
  isFavoriteProject?: (oid: string) => Promise<boolean>;
  redirect?: (path: string) => void;
  setAvatar?: (...args: unknown[]) => Promise<boolean>;
  insertCoin?: (count: number) => void;
  requestCoins?: (count: number) => Promise<boolean>;
  requestFollow?: () => Promise<boolean>;
  commentWithStageSnapshot?: (content: string, withScreenshot: boolean) => Promise<boolean>;
  showShare?: (encodedData: string, desc: string) => Promise<unknown>;
}

export interface ScratchRuntime {
  ccwAPI?: CcwPlatformApi;
  /** 渲染器，用于精确定位舞台 canvas（编辑器里存在多个 canvas）。 */
  renderer?: { canvas?: unknown; gl?: { canvas?: unknown }; _nativeSize?: unknown };
  /** Gandi 支持自定义舞台尺寸。 */
  stageWidth?: number;
  stageHeight?: number;
  gandi?: {
    wildExtensions?: Record<string, { id: string; url: string }>;
    addWildExtension?: (extension: { id: string; url: string }) => void;
  };
  extensionManager?: {
    vm?: {
      toJSON?: (...args: unknown[]) => string;
    };
    _customExtensionInfo?: Record<string, { url?: string }>;
    _officialExtensionInfo?: Record<string, { url?: string }>;
    saveWildExtensionsURL?: (id: string, url: string) => void;
  };
  emitProjectChanged?: () => void;
  getFormatMessage?: (messages: Record<string, Record<string, string>>) => ScratchFormatMessage;
  startHats?: (opcode: string) => void;
  startHatsWithParams?: (opcode: string, params: { parameters?: Record<string, string | number | boolean> }) => void;
  scratchBlocks?: {
    utils?: {
      toast?: (message: string) => void;
    };
  };
}

export interface ScratchBlockArgument {
  type: ScratchArgumentTypeValue;
  defaultValue?: string | number | boolean;
  menu?: string;
}

export interface ScratchBlockDefinition {
  opcode?: string;
  blockType: ScratchBlockTypeValue;
  text: string;
  func?: string;
  isEdgeActivated?: boolean;
  arguments?: Record<string, ScratchBlockArgument>;
}

export interface ScratchInfo {
  id: string;
  name: string;
  blockIconURI: string;
  menuIconURI: string;
  color1: string;
  color2: string;
  color3?: string;
  docsURI?: string;
  blocks: Array<string | ScratchBlockDefinition>;
  menus?: Record<string, Array<string | { text: string; value: string }>>;
}

export interface TempExtensionInfo {
  name: string;
  description: string;
  extensionId: string;
  iconURL: string;
  insetIconURL: string;
  featured: boolean;
  disabled: boolean;
  collaborator: string;
  collaboratorURL?: string;
}

export interface TempExtensionRegistration {
  Extension: new (runtime: ScratchRuntime) => unknown;
  info: TempExtensionInfo;
  l10n: Record<string, Record<string, string>>;
}

export interface KukeChatExtensionBridge {
  openWindow: () => void;
  closeWindow: () => void;
  minimizeWindow: () => void;
  toggleFullscreen: () => void;
  notifyRealtimeEvent: (event: RealtimeEvent) => void;
}

declare global {
  interface Window {
    Scratch?: ScratchLike;
    tempExt?: TempExtensionRegistration;
    __KukeChatExtensionBridge?: KukeChatExtensionBridge;
  }
}

export {};
