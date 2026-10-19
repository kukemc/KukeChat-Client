import { create } from 'zustand';
import type { GroupPlusTier, GroupTodo } from '@/types/groupPlus';

/**
 * 群升级 / 群文件 / 聊天记录搜索 / 待办全文 / 视频播放这几个全局浮层的「开着哪个」。
 *
 * 入口散在群资料页、聊天头部、全局搜索、精华超限提示、群人数提示、文件卡片上，它们只管把「哪个群」交出来，
 * 面板由主界面上的 GroupPlusHosts 画（和 GiftSendHost 一个做法）。这样入口不用关心自己在桌面还是移动布局里。
 */

/** 为什么打开升级面板：决定面板顶部那一句话（「精华已满，升级后可以存更多」） */
export type UpgradeReason = 'manual' | 'members' | 'featured' | 'files' | 'messages';

export interface UpgradeTarget {
  conversationId: number;
  reason?: UpgradeReason;
  /** 打开时先选中的档位（比如文件入口直接定位到 Pro+） */
  focusTier?: Exclude<GroupPlusTier, 'free'>;
}

export interface ChatSearchTarget {
  /** 限定在哪个会话里搜；null 是全局搜索（先按会话聚合） */
  conversationId: number | null;
  /** 会话标题，用在弹窗副标题上 */
  title?: string;
  /** 一打开就带上的关键词（全局搜索里点「聊天记录」分区时带过来） */
  keyword?: string;
}

/** 应用内播放的群文件视频（聊天里的文件卡片、群文件列表都从这里打开） */
export interface VideoTarget {
  conversationId: number;
  fileId: number;
  name: string;
  size: number;
  /** 打开时发现文件已过期 / 已删除：让入口（文件卡片）跟着变灰 */
  onUnavailable?: (text: string) => void;
}

interface GroupPlusUiState {
  upgrade: UpgradeTarget | null;
  openUpgrade: (target: UpgradeTarget) => void;
  closeUpgrade: () => void;
  files: { conversationId: number } | null;
  openFiles: (conversationId: number) => void;
  closeFiles: () => void;
  chatSearch: ChatSearchTarget | null;
  openChatSearch: (target: ChatSearchTarget) => void;
  closeChatSearch: () => void;
  /** 待办「查看全文」（原消息已经不在了） */
  todoDetail: GroupTodo | null;
  openTodoDetail: (todo: GroupTodo) => void;
  closeTodoDetail: () => void;
  video: VideoTarget | null;
  openVideo: (target: VideoTarget) => void;
  closeVideo: () => void;
}

export const useGroupPlusUi = create<GroupPlusUiState>((set) => ({
  upgrade: null,
  openUpgrade: (target) => set({ upgrade: target }),
  closeUpgrade: () => set({ upgrade: null }),
  files: null,
  openFiles: (conversationId) => set({ files: { conversationId } }),
  closeFiles: () => set({ files: null }),
  chatSearch: null,
  openChatSearch: (target) => set({ chatSearch: target }),
  closeChatSearch: () => set({ chatSearch: null }),
  todoDetail: null,
  openTodoDetail: (todo) => set({ todoDetail: todo }),
  closeTodoDetail: () => set({ todoDetail: null }),
  video: null,
  openVideo: (target) => set({ video: target }),
  closeVideo: () => set({ video: null })
}));
