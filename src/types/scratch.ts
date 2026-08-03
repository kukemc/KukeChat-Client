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

export interface ScratchRuntime {
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
