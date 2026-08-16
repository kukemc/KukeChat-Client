import { useKukeStore } from '@/store/kukeStore';
import { closeKukeChatWindow, ensureKukeChatWindow, minimizeKukeChatWindow, toggleKukeChatFullscreen } from '@/app/windowManager';
import { getConversations } from '@/api/conversations';
import { botApiGetConversationInfo, botApiGetConversations, botApiGetMembers, botApiGetMessages, botApiGetUserInfo, botApiRecallMessage, botApiSendDirectMessage, botApiSendMessage, botApiToggleReaction, botApiUpdateMessageComponent, botWebSocketUrl } from '@/api/bots';
import { getOnlineCount, getOnlineUsers } from '@/api/users';
import type { RealtimeEvent } from '@/types/realtime';
import type { ScratchBlockDefinition, ScratchFormatMessage, ScratchInfo, ScratchLike, ScratchRuntime } from '@/types/scratch';
import { BOT_API_DOCS_URL } from '@/config';
import { Icon, extensionId } from './assets';
import { subscribeExtensionEvents } from './bridge';
import { authorizeGameMode, isGameAuthorized, restoreGameAuth, getGameAuth } from './gameMode/auth';
import {
  detectCreationOid,
  getGameChatState,
  refreshGameSession,
  sendGameChatMessage,
  startGameChat,
  stopGameChat,
  subscribeGameMessages,
  type GameChatMessage
} from './gameMode/session';
import {
  DEFAULT_OVERLAY_STYLE,
  focusGameOverlayInput,
  mountGameOverlay,
  resetGameOverlayStyle,
  setGameOverlayVisible,
  unmountGameOverlay,
  updateGameOverlayStyle,
  type OverlayCorner,
  type OverlayStyle
} from './gameMode/overlay';
import { updateToLatestExtensionUrl } from './extensionUrlUpdater';
import packageInfo from '../../package.json';

const fallbackScratch: ScratchLike = {
  BlockType: {
    COMMAND: 'command',
    REPORTER: 'reporter',
    BOOLEAN: 'Boolean',
    HAT: 'hat',
    BUTTON: 'button'
  },
  ArgumentType: {
    STRING: 'string',
    NUMBER: 'number',
    BOOLEAN: 'Boolean'
  }
};

const messages = {
  'zh-cn': {
    'kukechat.div.window': '🪟 KukeChat 窗口',
    'kukechat.div.state': '📊 KukeChat 状态',
    'kukechat.div.groups': '👥 KukeChat 群聊',
    'kukechat.div.friends': '🤝 KukeChat 好友',
    'kukechat.div.botConfig': '🤖 KukeChat 机器人配置',
    'kukechat.div.botEvents': '📡 KukeChat 机器人事件',
    'kukechat.div.botMessages': '💬 KukeChat 机器人消息',
    'kukechat.div.botQuery': '🔎 KukeChat 机器人查询',
    'kukechat.notice.update2': `🏷️ 当前版本：v${packageInfo.version}`,
    'kukechat.button.updateExtension': '🔄 检查并更新扩展到最新版',
    'kukechat.notice.botKey': '🔐 安全提醒：任何情况下都不要把机器人 Key 放到公开作品中，防止泄露；如果已经泄露，请立即到机器人中心重置密钥。',
    'kukechat.block.windowAction': '将 KukeChat 窗口 [ACTION]',
    'kukechat.block.isLoggedIn': '当前是否已登录',
    'kukechat.block.kukeInfo': '获取 KukeChat 信息 [FIELD]',
    'kukechat.block.whenNewMessage': '当收到新消息时',
    'kukechat.block.recommendJoinGroup': '推荐添加群聊 [GROUP_ID] 附加消息 [EXTRA_MESSAGE]',
    'kukechat.block.isJoinedGroup': '是否已加入群聊 [GROUP_ID]',
    'kukechat.block.recommendFriend': '推荐添加好友 [USER_ID] 附加消息 [EXTRA_MESSAGE]',
    'kukechat.block.setBotKey': '设置机器人 Key [KEY]',
    'kukechat.block.connectBot': '连接机器人实时消息',
    'kukechat.block.disconnectBot': '断开机器人实时消息',
    'kukechat.block.isBotConnected': '机器人是否已连接',
    'kukechat.block.whenBotEvent': '当机器人收到事件 类型=[EVENT_TYPE] 数据=[EVENT_JSON]',
    'kukechat.block.whenBotMessage': '当机器人收到消息 会话=[GROUP_ID] 消息=[MESSAGE_ID] 发送者ID=[SENDER_ID] 发送者=[SENDER_NAME] 类型=[MESSAGE_TYPE] 内容=[CONTENT]',
    'kukechat.block.whenBotMentioned': '当机器人被@ 会话=[GROUP_ID] 消息=[MESSAGE_ID] 发送者ID=[SENDER_ID] 发送者=[SENDER_NAME] 类型=[MESSAGE_TYPE] 内容=[CONTENT]',
    'kukechat.block.lastBotField': '机器人最近事件字段 [FIELD]',
    'kukechat.block.lastBotJson': '机器人最近事件JSON',
    'kukechat.block.lastBotOk': '机器人最近操作是否成功',
    'kukechat.block.lastBotResult': '机器人最近操作结果JSON',
    'kukechat.block.lastBotError': '机器人最近错误',
    'kukechat.block.botSendMessage': '机器人向会话 [GROUP_ID] 发送消息 [MESSAGE]',
    'kukechat.block.botSendDirectMessage': '机器人向用户 [USER_ID] 发送私信 [MESSAGE]',
    'kukechat.block.botSendMedia': '机器人向群 [GROUP_ID] 发送 [MEDIA_TYPE] URL [URL]',
    'kukechat.block.botSendVoice': '机器人向群 [GROUP_ID] 发送语音 URL [URL] 时长毫秒 [DURATION]',
    'kukechat.block.botReactMessage': '机器人给群 [GROUP_ID] 消息 [MESSAGE_ID] 添加/取消表情 [EMOJI]',
    'kukechat.block.botRecallMessage': '机器人撤回群 [GROUP_ID] 消息 [MESSAGE_ID]',
    'kukechat.block.botUpdateButton': '机器人更新会话 [GROUP_ID] 消息 [MESSAGE_ID] 按钮 [BUTTON_ID] 文案 [LABEL] 样式 [VARIANT] 禁用 [DISABLED] 范围 [SCOPE]',
    'kukechat.block.botConversations': '机器人会话列表JSON',
    'kukechat.block.botUserInfo': '获取用户 [USER_ID] 公开信息 [FIELD]',
    'kukechat.block.botGroupInfo': '获取群 [GROUP_ID] 信息 [FIELD]',
    'kukechat.block.botMembers': '机器人群 [GROUP_ID] 成员列表JSON',
    'kukechat.block.botMessages': '机器人会话 [GROUP_ID] 最近 [LIMIT] 条消息JSON',
    'kukechat.div.game': '🎮 KukeChat 游戏模式',
    'kukechat.div.gameStyle': '🎨 游戏模式外观',
    'kukechat.div.gameEvents': '📨 游戏模式事件',
    'kukechat.block.gameConnect': '接入游戏聊天 群号 [GROUP_ID]',
    'kukechat.block.gameDisconnect': '断开游戏聊天',
    'kukechat.block.gameOverlay': '[ACTION] 舞台聊天框',
    'kukechat.block.gameAuthorize': '请求玩家授权 KukeChat 账号',
    'kukechat.block.gameIsAuthorized': '玩家是否已授权',
    'kukechat.block.gameCanSend': '玩家当前能否发言',
    'kukechat.block.gameSend': '以玩家身份发送消息 [MESSAGE]',
    'kukechat.block.gameInfo': '游戏聊天信息 [FIELD]',
    'kukechat.block.gameSetCorner': '把聊天框放到 [CORNER]',
    'kukechat.block.gameSetSize': '设置聊天框宽 [WIDTH] 高 [HEIGHT]',
    'kukechat.block.gameSetStyle': '设置聊天框 [FIELD] 为 [VALUE]',
    'kukechat.block.gameResetStyle': '恢复聊天框默认外观',
    'kukechat.block.whenGameMessage': '当游戏模式收到消息 发送者=[SENDER_NAME] 发送者ID=[SENDER_ID] 内容=[CONTENT] 是否自己=[IS_SELF]',
    'kukechat.block.gameLastMessage': '最近一条游戏消息 [FIELD]'
  },
  en: {
    'kukechat.div.window': '🪟 KukeChat Window',
    'kukechat.div.state': '📊 KukeChat State',
    'kukechat.div.groups': '👥 KukeChat Groups',
    'kukechat.div.friends': '🤝 KukeChat Friends',
    'kukechat.div.botConfig': '🤖 KukeChat Bot Config',
    'kukechat.div.botEvents': '📡 KukeChat Bot Events',
    'kukechat.div.botMessages': '💬 KukeChat Bot Messages',
    'kukechat.div.botQuery': '🔎 KukeChat Bot Query',
    'kukechat.notice.update2': `🏷️ Current version: v${packageInfo.version}`,
    'kukechat.button.updateExtension': '🔄 Check and update extension',
    'kukechat.notice.botKey': '🔐 Security: never put your bot key in public projects. If it leaks, rotate the key immediately in Bot Center.',
    'kukechat.block.windowAction': '[ACTION] KukeChat window',
    'kukechat.block.isLoggedIn': 'Is logged in?',
    'kukechat.block.kukeInfo': 'Get KukeChat info [FIELD]',
    'kukechat.block.whenNewMessage': 'When a new message arrives',
    'kukechat.block.recommendJoinGroup': 'Recommend joining group [GROUP_ID] with message [EXTRA_MESSAGE]',
    'kukechat.block.isJoinedGroup': 'Joined group [GROUP_ID]?',
    'kukechat.block.recommendFriend': 'Recommend friend [USER_ID] with message [EXTRA_MESSAGE]',
    'kukechat.block.setBotKey': 'Set bot key [KEY]',
    'kukechat.block.connectBot': 'Connect bot realtime',
    'kukechat.block.disconnectBot': 'Disconnect bot realtime',
    'kukechat.block.isBotConnected': 'Is bot connected?',
    'kukechat.block.whenBotEvent': 'When bot receives event type=[EVENT_TYPE] data=[EVENT_JSON]',
    'kukechat.block.whenBotMessage': 'When bot receives message conversation=[GROUP_ID] message=[MESSAGE_ID] sender id=[SENDER_ID] sender=[SENDER_NAME] type=[MESSAGE_TYPE] content=[CONTENT]',
    'kukechat.block.whenBotMentioned': 'When bot is mentioned conversation=[GROUP_ID] message=[MESSAGE_ID] sender id=[SENDER_ID] sender=[SENDER_NAME] type=[MESSAGE_TYPE] content=[CONTENT]',
    'kukechat.block.lastBotField': 'Last bot event field [FIELD]',
    'kukechat.block.lastBotJson': 'Last bot event JSON',
    'kukechat.block.lastBotOk': 'Last bot operation succeeded?',
    'kukechat.block.lastBotResult': 'Last bot operation result JSON',
    'kukechat.block.lastBotError': 'Last bot error',
    'kukechat.block.botSendMessage': 'Bot send message [MESSAGE] to conversation [GROUP_ID]',
    'kukechat.block.botSendDirectMessage': 'Bot send direct message [MESSAGE] to user [USER_ID]',
    'kukechat.block.botSendMedia': 'Bot send [MEDIA_TYPE] URL [URL] to group [GROUP_ID]',
    'kukechat.block.botSendVoice': 'Bot send voice URL [URL] duration ms [DURATION] to group [GROUP_ID]',
    'kukechat.block.botReactMessage': 'Bot toggle emoji [EMOJI] on group [GROUP_ID] message [MESSAGE_ID]',
    'kukechat.block.botRecallMessage': 'Bot recall message [MESSAGE_ID] in group [GROUP_ID]',
    'kukechat.block.botUpdateButton': 'Bot update conversation [GROUP_ID] message [MESSAGE_ID] button [BUTTON_ID] label [LABEL] style [VARIANT] disabled [DISABLED] scope [SCOPE]',
    'kukechat.block.botConversations': 'Bot conversation list JSON',
    'kukechat.block.botUserInfo': 'Get user [USER_ID] public info [FIELD]',
    'kukechat.block.botGroupInfo': 'Get group [GROUP_ID] info [FIELD]',
    'kukechat.block.botMembers': 'Bot group [GROUP_ID] members JSON',
    'kukechat.block.botMessages': 'Bot conversation [GROUP_ID] latest [LIMIT] messages JSON',
    'kukechat.div.game': '🎮 KukeChat Game Mode',
    'kukechat.div.gameStyle': '🎨 Game Mode Appearance',
    'kukechat.div.gameEvents': '📨 Game Mode Events',
    'kukechat.block.gameConnect': 'Connect game chat to group [GROUP_ID]',
    'kukechat.block.gameDisconnect': 'Disconnect game chat',
    'kukechat.block.gameOverlay': '[ACTION] stage chat box',
    'kukechat.block.gameAuthorize': 'Ask player to authorize KukeChat account',
    'kukechat.block.gameIsAuthorized': 'Player authorized?',
    'kukechat.block.gameCanSend': 'Player can send messages?',
    'kukechat.block.gameSend': 'Send message as player [MESSAGE]',
    'kukechat.block.gameInfo': 'Game chat info [FIELD]',
    'kukechat.block.gameSetCorner': 'Move chat box to [CORNER]',
    'kukechat.block.gameSetSize': 'Set chat box width [WIDTH] height [HEIGHT]',
    'kukechat.block.gameSetStyle': 'Set chat box [FIELD] to [VALUE]',
    'kukechat.block.gameResetStyle': 'Reset chat box appearance',
    'kukechat.block.whenGameMessage': 'When game mode receives message sender=[SENDER_NAME] sender id=[SENDER_ID] content=[CONTENT] is self=[IS_SELF]',
    'kukechat.block.gameLastMessage': 'Latest game message [FIELD]'
  }
};

function parseGroupId(value: number | string | undefined): number | null {
  const groupId = Number(value);
  return Number.isInteger(groupId) && groupId > 0 ? groupId : null;
}

function parseUserId(value: number | string | undefined): number | null {
  const userId = Number(value);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

const zhCnMessages: Record<string, string> = messages['zh-cn'];

export default class KukeChatExtension {
  private readonly runtime?: ScratchRuntime;
  private readonly formatMessageFn: ScratchFormatMessage;
  private unsubscribeEvents?: () => void;
  private botKey = '';
  private botSocket?: WebSocket;
  private botConnected = false;
  private botUserId = 0;
  private lastBotEvent: Record<string, unknown> = {};
  private lastBotOperationResult: unknown = null;
  private lastBotOperationError = '';
  private lastBotOperationOk = false;
  private lastGameMessage: GameChatMessage | null = null;
  private gameMessageUnsubscribe?: () => void;

  constructor(runtime?: ScratchRuntime) {
    this.runtime = runtime;
    this.formatMessageFn = runtime?.getFormatMessage?.(messages) ?? ((message) => zhCnMessages[message.id] ?? message.default);
    this.unsubscribeEvents = subscribeExtensionEvents((event) => this.handleRealtimeEvent(event));
  }

  getInfo(): ScratchInfo {
    const scratch = window.Scratch ?? fallbackScratch;
    const block = (opcode: string, blockType: string, textKey: string, args?: ScratchBlockDefinition['arguments']): ScratchBlockDefinition => ({
      opcode,
      blockType,
      text: this.formatMessage(textKey),
      ...(args ? { arguments: args } : {})
    });

    return {
      id: extensionId,
      name: 'KukeChat',
      blockIconURI: Icon,
      menuIconURI: Icon,
      color1: '#27272a',
      color2: '#18181b',
      color3: '#171717',
      ...(BOT_API_DOCS_URL ? { docsURI: BOT_API_DOCS_URL } : {}),
      blocks: [
        `---${this.formatMessage('kukechat.notice.update2')}`,
        { blockType: scratch.BlockType.BUTTON, text: this.formatMessage('kukechat.button.updateExtension'), func: 'updateToLatestVersion' },
        `---${this.formatMessage('kukechat.div.window')}`,
        block('windowAction', scratch.BlockType.COMMAND, 'kukechat.block.windowAction', {
          ACTION: { type: scratch.ArgumentType.STRING, menu: 'WINDOW_ACTION', defaultValue: 'open' }
        }),
        `---${this.formatMessage('kukechat.div.state')}`,
        block('isLoggedIn', scratch.BlockType.BOOLEAN, 'kukechat.block.isLoggedIn'),
        block('kukeInfo', scratch.BlockType.REPORTER, 'kukechat.block.kukeInfo', {
          FIELD: { type: scratch.ArgumentType.STRING, menu: 'KUKE_INFO_FIELD', defaultValue: 'user_display_name' }
        }),
        {
          opcode: 'whenNewMessage',
          blockType: scratch.BlockType.HAT,
          isEdgeActivated: false,
          text: this.formatMessage('kukechat.block.whenNewMessage')
        },
        `---${this.formatMessage('kukechat.div.groups')}`,
        block('recommendJoinGroup', scratch.BlockType.COMMAND, 'kukechat.block.recommendJoinGroup', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          EXTRA_MESSAGE: { type: scratch.ArgumentType.STRING, defaultValue: '' }
        }),
        block('isJoinedGroup', scratch.BlockType.BOOLEAN, 'kukechat.block.isJoinedGroup', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 }
        }),
        `---${this.formatMessage('kukechat.div.friends')}`,
        block('recommendFriend', scratch.BlockType.COMMAND, 'kukechat.block.recommendFriend', {
          USER_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          EXTRA_MESSAGE: { type: scratch.ArgumentType.STRING, defaultValue: '' }
        }),
        `---${this.formatMessage('kukechat.div.botConfig')}`,
        `---${this.formatMessage('kukechat.notice.botKey')}`,
        block('setBotKey', scratch.BlockType.COMMAND, 'kukechat.block.setBotKey', { KEY: { type: scratch.ArgumentType.STRING, defaultValue: 'kcb_live_xxx' } }),
        block('connectBot', scratch.BlockType.COMMAND, 'kukechat.block.connectBot'),
        block('disconnectBot', scratch.BlockType.COMMAND, 'kukechat.block.disconnectBot'),
        block('isBotConnected', scratch.BlockType.BOOLEAN, 'kukechat.block.isBotConnected'),
        `---${this.formatMessage('kukechat.div.botEvents')}`,
        { opcode: 'whenBotEvent', blockType: scratch.BlockType.HAT, isEdgeActivated: false, text: this.formatMessage('kukechat.block.whenBotEvent'), arguments: this.botGenericEventHatParameters() },
        { opcode: 'whenBotMessage', blockType: scratch.BlockType.HAT, isEdgeActivated: false, text: this.formatMessage('kukechat.block.whenBotMessage'), arguments: this.botEventHatParameters() },
        { opcode: 'whenBotMentioned', blockType: scratch.BlockType.HAT, isEdgeActivated: false, text: this.formatMessage('kukechat.block.whenBotMentioned'), arguments: this.botEventHatParameters() },
        block('lastBotField', scratch.BlockType.REPORTER, 'kukechat.block.lastBotField', { FIELD: { type: scratch.ArgumentType.STRING, defaultValue: 'content' } }),
        block('lastBotJson', scratch.BlockType.REPORTER, 'kukechat.block.lastBotJson'),
        block('lastBotOk', scratch.BlockType.BOOLEAN, 'kukechat.block.lastBotOk'),
        block('lastBotResult', scratch.BlockType.REPORTER, 'kukechat.block.lastBotResult'),
        block('lastBotError', scratch.BlockType.REPORTER, 'kukechat.block.lastBotError'),
        `---${this.formatMessage('kukechat.div.botMessages')}`,
        block('botSendMessage', scratch.BlockType.COMMAND, 'kukechat.block.botSendMessage', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          MESSAGE: { type: scratch.ArgumentType.STRING, defaultValue: '欢迎 <at id="12"/> 入群！' }
        }),
        block('botSendDirectMessage', scratch.BlockType.COMMAND, 'kukechat.block.botSendDirectMessage', {
          USER_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          MESSAGE: { type: scratch.ArgumentType.STRING, defaultValue: '你好，我是机器人助手。' }
        }),
        block('botSendMedia', scratch.BlockType.COMMAND, 'kukechat.block.botSendMedia', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          MEDIA_TYPE: { type: scratch.ArgumentType.STRING, menu: 'BOT_MEDIA_TYPE', defaultValue: 'image' },
          URL: { type: scratch.ArgumentType.STRING, defaultValue: '/uploads/messages/example.webp' }
        }),
        block('botSendVoice', scratch.BlockType.COMMAND, 'kukechat.block.botSendVoice', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          URL: { type: scratch.ArgumentType.STRING, defaultValue: '/uploads/messages/example.webm' },
          DURATION: { type: scratch.ArgumentType.NUMBER, defaultValue: 1000 }
        }),
        block('botReactMessage', scratch.BlockType.COMMAND, 'kukechat.block.botReactMessage', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          MESSAGE_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          EMOJI: { type: scratch.ArgumentType.STRING, defaultValue: '👍' }
        }),
        block('botRecallMessage', scratch.BlockType.COMMAND, 'kukechat.block.botRecallMessage', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          MESSAGE_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 }
        }),
        block('botUpdateButton', scratch.BlockType.COMMAND, 'kukechat.block.botUpdateButton', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          MESSAGE_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          BUTTON_ID: { type: scratch.ArgumentType.STRING, defaultValue: 'checkin' },
          LABEL: { type: scratch.ArgumentType.STRING, defaultValue: '已完成' },
          VARIANT: { type: scratch.ArgumentType.STRING, menu: 'BOT_BUTTON_VARIANT', defaultValue: 'success' },
          DISABLED: { type: scratch.ArgumentType.STRING, menu: 'BOT_BOOLEAN', defaultValue: 'true' },
          SCOPE: { type: scratch.ArgumentType.STRING, menu: 'BOT_COMPONENT_SCOPE', defaultValue: 'global' }
        }),
        `---${this.formatMessage('kukechat.div.botQuery')}`,
        block('botConversations', scratch.BlockType.REPORTER, 'kukechat.block.botConversations'),
        block('botUserInfo', scratch.BlockType.REPORTER, 'kukechat.block.botUserInfo', {
          USER_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          FIELD: { type: scratch.ArgumentType.STRING, menu: 'BOT_USER_INFO_FIELD', defaultValue: 'nickname' }
        }),
        block('botGroupInfo', scratch.BlockType.REPORTER, 'kukechat.block.botGroupInfo', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 },
          FIELD: { type: scratch.ArgumentType.STRING, menu: 'BOT_GROUP_INFO_FIELD', defaultValue: 'title' }
        }),
        block('botMembers', scratch.BlockType.REPORTER, 'kukechat.block.botMembers', { GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 } }),
        block('botMessages', scratch.BlockType.REPORTER, 'kukechat.block.botMessages', { GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 }, LIMIT: { type: scratch.ArgumentType.NUMBER, defaultValue: 20 } }),
        `---${this.formatMessage('kukechat.div.game')}`,
        block('gameConnect', scratch.BlockType.COMMAND, 'kukechat.block.gameConnect', {
          GROUP_ID: { type: scratch.ArgumentType.NUMBER, defaultValue: 1 }
        }),
        block('gameDisconnect', scratch.BlockType.COMMAND, 'kukechat.block.gameDisconnect'),
        block('gameOverlay', scratch.BlockType.COMMAND, 'kukechat.block.gameOverlay', {
          ACTION: { type: scratch.ArgumentType.STRING, menu: 'GAME_OVERLAY_ACTION', defaultValue: 'show' }
        }),
        block('gameAuthorize', scratch.BlockType.COMMAND, 'kukechat.block.gameAuthorize'),
        block('gameIsAuthorized', scratch.BlockType.BOOLEAN, 'kukechat.block.gameIsAuthorized'),
        block('gameCanSend', scratch.BlockType.BOOLEAN, 'kukechat.block.gameCanSend'),
        block('gameSend', scratch.BlockType.COMMAND, 'kukechat.block.gameSend', {
          MESSAGE: { type: scratch.ArgumentType.STRING, defaultValue: '大家好！' }
        }),
        block('gameInfo', scratch.BlockType.REPORTER, 'kukechat.block.gameInfo', {
          FIELD: { type: scratch.ArgumentType.STRING, menu: 'GAME_INFO_FIELD', defaultValue: 'status' }
        }),
        `---${this.formatMessage('kukechat.div.gameStyle')}`,
        block('gameSetCorner', scratch.BlockType.COMMAND, 'kukechat.block.gameSetCorner', {
          CORNER: { type: scratch.ArgumentType.STRING, menu: 'GAME_CORNER', defaultValue: 'bottom-left' }
        }),
        block('gameSetSize', scratch.BlockType.COMMAND, 'kukechat.block.gameSetSize', {
          WIDTH: { type: scratch.ArgumentType.NUMBER, defaultValue: 300 },
          HEIGHT: { type: scratch.ArgumentType.NUMBER, defaultValue: 220 }
        }),
        block('gameSetStyle', scratch.BlockType.COMMAND, 'kukechat.block.gameSetStyle', {
          FIELD: { type: scratch.ArgumentType.STRING, menu: 'GAME_STYLE_FIELD', defaultValue: 'accent' },
          VALUE: { type: scratch.ArgumentType.STRING, defaultValue: '#5b8cff' }
        }),
        block('gameResetStyle', scratch.BlockType.COMMAND, 'kukechat.block.gameResetStyle'),
        `---${this.formatMessage('kukechat.div.gameEvents')}`,
        {
          opcode: 'whenGameMessage',
          blockType: scratch.BlockType.HAT,
          isEdgeActivated: false,
          text: this.formatMessage('kukechat.block.whenGameMessage'),
          arguments: {
            SENDER_NAME: { type: scratch.ArgumentType.STRING },
            SENDER_ID: { type: scratch.ArgumentType.NUMBER },
            CONTENT: { type: scratch.ArgumentType.STRING },
            IS_SELF: { type: scratch.ArgumentType.STRING }
          }
        },
        block('gameLastMessage', scratch.BlockType.REPORTER, 'kukechat.block.gameLastMessage', {
          FIELD: { type: scratch.ArgumentType.STRING, menu: 'GAME_MESSAGE_FIELD', defaultValue: 'content' }
        })
      ],
      menus: {
        WINDOW_ACTION: [
          { text: '打开', value: 'open' },
          { text: '关闭', value: 'close' },
          { text: '最小化', value: 'minimize' },
          { text: '全屏/还原', value: 'fullscreen' }
        ],
        KUKE_INFO_FIELD: [
          { text: '用户显示名', value: 'user_display_name' },
          { text: '用户ID', value: 'user_id' },
          { text: '用户名', value: 'username' },
          { text: '用户昵称', value: 'nickname' },
          { text: '用户简介', value: 'bio' },
          { text: '头像URL', value: 'avatar_url' },
          { text: '是否已登录', value: 'is_logged_in' },
          { text: '未读消息数', value: 'unread_count' },
          { text: '在线玩家数', value: 'online_count' },
          { text: '在线用户列表JSON', value: 'online_users_json' },
          { text: '扩展版本', value: 'extension_version' }
        ],
        BOT_MEDIA_TYPE: [
          { text: '图片', value: 'image' },
          { text: '表情包', value: 'sticker' }
        ],
        BOT_BUTTON_VARIANT: [
          { text: '默认', value: 'default' },
          { text: '成功', value: 'success' },
          { text: '失败', value: 'danger' },
          { text: '警告', value: 'warning' },
          { text: '主要', value: 'primary' }
        ],
        BOT_BOOLEAN: [
          { text: '是', value: 'true' },
          { text: '否', value: 'false' }
        ],
        BOT_COMPONENT_SCOPE: [
          { text: '全局', value: 'global' },
          { text: '仅点击者', value: 'user' }
        ],
        BOT_USER_INFO_FIELD: [
          { text: '用户名', value: 'username' },
          { text: '昵称', value: 'nickname' },
          { text: '头像URL', value: 'avatar_url' },
          { text: '简介', value: 'bio' },
          { text: '是否在线', value: 'online' },
          { text: '是否机器人', value: 'is_bot' }
        ],
        BOT_GROUP_INFO_FIELD: [
          { text: '群名', value: 'title' },
          { text: '群头像', value: 'avatar_url' },
          { text: '成员数', value: 'member_count' },
          { text: '公告', value: 'announcement' },
          { text: '机器人是否启用', value: 'bot_enabled' }
        ],
        GAME_OVERLAY_ACTION: [
          { text: '显示', value: 'show' },
          { text: '隐藏', value: 'hide' },
          { text: '聚焦输入框', value: 'focus' }
        ],
        GAME_CORNER: [
          { text: '左上角', value: 'top-left' },
          { text: '右上角', value: 'top-right' },
          { text: '左下角', value: 'bottom-left' },
          { text: '右下角', value: 'bottom-right' }
        ],
        GAME_STYLE_FIELD: [
          { text: '主题色', value: 'accent' },
          { text: '背景色', value: 'background' },
          { text: '文字色', value: 'textColor' },
          { text: '不透明度(0-100)', value: 'opacity' },
          { text: '字号', value: 'fontSize' },
          { text: '圆角', value: 'radius' },
          { text: '显示头像(true/false)', value: 'showAvatars' },
          { text: '显示标题栏(true/false)', value: 'showTitle' }
        ],
        GAME_INFO_FIELD: [
          { text: '连接状态', value: 'status' },
          { text: '群名', value: 'title' },
          { text: '群号', value: 'conversation_id' },
          { text: '成员数', value: 'member_count' },
          { text: '当前作品ID', value: 'creation_oid' },
          { text: '玩家昵称', value: 'player_name' },
          { text: '玩家ID', value: 'player_id' },
          { text: '消息条数', value: 'message_count' },
          { text: '错误信息', value: 'error' }
        ],
        GAME_MESSAGE_FIELD: [
          { text: '内容', value: 'content' },
          { text: '发送者', value: 'sender_name' },
          { text: '发送者ID', value: 'sender_id' },
          { text: '消息ID', value: 'id' },
          { text: '是否自己', value: 'is_self' },
          { text: '发送时间', value: 'created_at' }
        ]
      }
    };
  }

  async updateToLatestVersion(): Promise<void> {
    await updateToLatestExtensionUrl(this.runtime);
  }

  windowAction(args: { ACTION?: string }): void {
    const action = String(args.ACTION ?? 'open');
    if (action === 'close') {
      closeKukeChatWindow();
      return;
    }
    if (action === 'minimize') {
      minimizeKukeChatWindow();
      return;
    }
    if (action === 'fullscreen') {
      toggleKukeChatFullscreen();
      return;
    }
    ensureKukeChatWindow();
  }

  isLoggedIn(): boolean {
    return Boolean(useKukeStore.getState().token && useKukeStore.getState().currentUser);
  }

  async kukeInfo(args: { FIELD?: string }): Promise<string> {
    const state = useKukeStore.getState();
    const user = state.currentUser;
    const field = String(args.FIELD ?? 'user_display_name');
    if (field === 'user_id') {
      return user ? String(user.id ?? '') : '';
    }
    if (field === 'username') {
      return user?.username ?? '';
    }
    if (field === 'nickname') {
      return user?.nickname ?? '';
    }
    if (field === 'bio') {
      return user?.bio ?? '';
    }
    if (field === 'avatar_url') {
      return user?.avatar_url ?? '';
    }
    if (field === 'is_logged_in') {
      return String(Boolean(state.token && state.currentUser));
    }
    if (field === 'unread_count') {
      return String(state.unreadCount);
    }
    if (field === 'online_count') {
      if (state.token) {
        void getOnlineCount().then((count) => useKukeStore.getState().setOnlineCount(count)).catch(() => undefined);
      }
      return String(state.onlineCount);
    }
    if (field === 'online_users_json') {
      return await this.getOnlineUsersJson();
    }
    if (field === 'extension_version') {
      return packageInfo.version;
    }
    return user ? user.nickname || user.username || `用户 ${user.id}` : '';
  }

  private async getOnlineUsersJson(): Promise<string> {
    const state = useKukeStore.getState();
    if (!state.token || !state.currentUser) {
      return '[]';
    }
    try {
      const response = await getOnlineUsers();
      const users = response.users.map((user) => ({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        display_name: user.nickname || user.username || `用户 ${user.id}`,
        avatar_url: user.avatar_url,
        bio: user.bio,
        presence_status: user.presence_status,
        presence_text: user.presence_text,
        is_bot: user.is_bot
      }));
      useKukeStore.getState().setOnlineCount(response.online_count);
      return JSON.stringify(users);
    } catch {
      return '[]';
    }
  }

  whenNewMessage(): boolean {
    return true;
  }

  recommendJoinGroup(args: { GROUP_ID?: number | string; EXTRA_MESSAGE?: string }): void {
    const groupId = parseGroupId(args.GROUP_ID);
    ensureKukeChatWindow();
    if (!groupId) {
      this.runtime?.scratchBlocks?.utils?.toast?.('群号无效');
      return;
    }

    const state = useKukeStore.getState();
    if (!state.token || !state.currentUser) {
      this.runtime?.scratchBlocks?.utils?.toast?.('请先登录 KukeChat');
      return;
    }

    state.openRecommendedGroupJoinRequest(groupId, String(args.EXTRA_MESSAGE ?? ''));
  }

  async isJoinedGroup(args: { GROUP_ID?: number | string }): Promise<boolean> {
    const groupId = parseGroupId(args.GROUP_ID);
    const state = useKukeStore.getState();
    if (!groupId || !state.token || !state.currentUser) {
      return false;
    }

    try {
      const conversations = await getConversations();
      return conversations.some((conversation) => conversation.type === 'group' && conversation.id === groupId);
    } catch {
      return false;
    }
  }

  recommendFriend(args: { USER_ID?: number | string; EXTRA_MESSAGE?: string }): void {
    const userId = parseUserId(args.USER_ID);
    ensureKukeChatWindow();
    if (!userId) {
      this.runtime?.scratchBlocks?.utils?.toast?.('用户 ID 无效');
      return;
    }

    const state = useKukeStore.getState();
    if (!state.token || !state.currentUser) {
      this.runtime?.scratchBlocks?.utils?.toast?.('请先登录 KukeChat');
      return;
    }

    state.openRecommendedFriendRequest(userId, String(args.EXTRA_MESSAGE ?? ''));
  }

  setBotKey(args: { KEY?: string }): void {
    this.botKey = String(args.KEY ?? '').trim();
  }

  connectBot(): void {
    if (!this.botKey) {
      this.runtime?.scratchBlocks?.utils?.toast?.('请先设置机器人 Key');
      return;
    }
    this.disconnectBot();
    this.botSocket = new WebSocket(botWebSocketUrl(this.botKey));
    this.botSocket.addEventListener('open', () => { this.botConnected = true; });
    this.botSocket.addEventListener('close', (event) => {
      this.botConnected = false;
      if (!event.wasClean) {
        this.setBotError(`实时连接已断开：${event.code || 'unknown'}`);
      }
    });
    this.botSocket.addEventListener('error', () => {
      this.botConnected = false;
      this.setBotError('实时连接失败，请检查机器人 Key 和服务地址');
    });
    this.botSocket.addEventListener('message', (event) => this.handleBotSocketMessage(event.data));
  }

  disconnectBot(): void {
    this.botSocket?.close();
    this.botSocket = undefined;
    this.botConnected = false;
  }

  isBotConnected(): boolean {
    return this.botConnected;
  }

  private toast(message: string): void {
    this.runtime?.scratchBlocks?.utils?.toast?.(message);
  }

  whenBotMessage(): boolean { return true; }

  // ---------------------------------------------------------------- 游戏模式

  /** hat 积木本身恒真，实际触发由 startHatsWithParams 驱动。 */
  whenGameMessage(): boolean { return true; }

  async gameConnect(args: { GROUP_ID: number | string }): Promise<void> {
    const groupId = parseGroupId(args.GROUP_ID);
    if (groupId === null) {
      this.toast('游戏模式：群号无效');
      return;
    }
    // 先恢复上次的授权，玩家在同一次游玩里不需要反复授权
    restoreGameAuth();
    this.ensureGameMessageBridge();
    const error = await startGameChat(groupId);
    if (error) {
      this.toast(`游戏模式：${error}`);
      return;
    }
    mountGameOverlay();
  }

  gameDisconnect(): void {
    stopGameChat();
    unmountGameOverlay();
  }

  gameOverlay(args: { ACTION: string }): void {
    const action = String(args.ACTION ?? 'show');
    if (action === 'hide') {
      setGameOverlayVisible(false);
      return;
    }
    if (action === 'focus') {
      focusGameOverlayInput();
      return;
    }
    mountGameOverlay();
    setGameOverlayVisible(true);
  }

  async gameAuthorize(): Promise<void> {
    const result = await authorizeGameMode();
    if (result === 'authorized') {
      await refreshGameSession();
      return;
    }
    this.toast(result === 'blocked' ? '游戏模式：登录窗口被浏览器拦截，请放行弹窗' : '游戏模式：授权已取消');
  }

  gameIsAuthorized(): boolean {
    return isGameAuthorized();
  }

  gameCanSend(): boolean {
    return isGameAuthorized() && getGameChatState().status === 'connected';
  }

  async gameSend(args: { MESSAGE: string }): Promise<void> {
    const result = await sendGameChatMessage(String(args.MESSAGE ?? ''));
    if (result === 'unauthorized') {
      this.toast('游戏模式：需要先授权 KukeChat 账号');
    } else if (result === 'not-connected') {
      this.toast('游戏模式：尚未接入群聊');
    } else if (result === 'failed') {
      this.toast('游戏模式：消息发送失败');
    }
  }

  gameInfo(args: { FIELD: string }): string | number {
    const state = getGameChatState();
    const auth = getGameAuth();
    switch (String(args.FIELD ?? 'status')) {
      case 'title': return state.title ?? '';
      case 'conversation_id': return state.conversationId ?? 0;
      case 'member_count': return state.memberCount;
      case 'creation_oid': return state.creationOid ?? detectCreationOid() ?? '';
      case 'player_name': return auth.displayName ?? '';
      case 'player_id': return auth.userId ?? 0;
      case 'message_count': return state.messages.length;
      case 'error': return state.error ?? '';
      case 'status':
      default: return state.status;
    }
  }

  gameSetCorner(args: { CORNER: string }): void {
    const corner = String(args.CORNER ?? 'bottom-left') as OverlayCorner;
    const allowed: OverlayCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    if (!allowed.includes(corner)) {
      return;
    }
    updateGameOverlayStyle({ corner });
  }

  gameSetSize(args: { WIDTH: number | string; HEIGHT: number | string }): void {
    const width = Number(args.WIDTH);
    const height = Number(args.HEIGHT);
    const patch: Partial<OverlayStyle> = {};
    // 限制在合理范围，避免作品把聊天框拉到看不见或盖满舞台
    if (Number.isFinite(width)) {
      patch.width = Math.min(Math.max(Math.round(width), 160), 900);
    }
    if (Number.isFinite(height)) {
      patch.height = Math.min(Math.max(Math.round(height), 100), 700);
    }
    updateGameOverlayStyle(patch);
  }

  gameSetStyle(args: { FIELD: string; VALUE: string | number }): void {
    const field = String(args.FIELD ?? '');
    const raw = args.VALUE;
    const text = String(raw ?? '').trim();
    const numeric = Number(raw);

    switch (field) {
      case 'accent':
      case 'background':
      case 'textColor':
        if (text) {
          updateGameOverlayStyle({ [field]: text } as Partial<OverlayStyle>);
        }
        return;
      case 'opacity':
        if (Number.isFinite(numeric)) {
          updateGameOverlayStyle({ opacity: Math.min(Math.max(numeric, 0), 100) });
        }
        return;
      case 'fontSize':
        if (Number.isFinite(numeric)) {
          updateGameOverlayStyle({ fontSize: Math.min(Math.max(Math.round(numeric), 9), 28) });
        }
        return;
      case 'radius':
        if (Number.isFinite(numeric)) {
          updateGameOverlayStyle({ radius: Math.min(Math.max(Math.round(numeric), 0), 40) });
        }
        return;
      case 'showAvatars':
      case 'showTitle':
        updateGameOverlayStyle({ [field]: text === 'true' || text === '1' || text === '是' } as Partial<OverlayStyle>);
        return;
      default:
        return;
    }
  }

  gameResetStyle(): void {
    resetGameOverlayStyle();
    updateGameOverlayStyle(DEFAULT_OVERLAY_STYLE);
  }

  gameLastMessage(args: { FIELD: string }): string | number {
    const message = this.lastGameMessage;
    if (!message) {
      return '';
    }
    switch (String(args.FIELD ?? 'content')) {
      case 'sender_name': return message.senderName;
      case 'sender_id': return message.senderId ?? 0;
      case 'id': return message.id;
      case 'is_self': return message.own ? 'true' : 'false';
      case 'created_at': return message.createdAt;
      case 'content':
      default: return message.content;
    }
  }

  /** 把游戏模式的新消息接到 hat 积木上，只订阅一次。 */
  private ensureGameMessageBridge(): void {
    if (this.gameMessageUnsubscribe) {
      return;
    }
    this.gameMessageUnsubscribe = subscribeGameMessages((message) => {
      this.lastGameMessage = message;
      const parameters = {
        SENDER_NAME: message.senderName,
        SENDER_ID: message.senderId ?? 0,
        CONTENT: message.content,
        IS_SELF: message.own ? 'true' : 'false'
      };
      this.runtime?.startHatsWithParams?.(`${extensionId}_whenGameMessage`, { parameters });
      this.runtime?.startHats?.(`${extensionId}_whenGameMessage`);
    });
  }
  whenBotEvent(): boolean { return true; }
  whenBotMentioned(): boolean { return true; }

  lastBotField(args: { FIELD?: string }): string {
    const field = String(args.FIELD ?? '').trim();
    const value = field ? this.lastBotEvent[field] : undefined;
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value ?? '');
  }

  lastBotJson(): string { return JSON.stringify(this.lastBotEvent); }

  lastBotOk(): boolean { return this.lastBotOperationOk; }

  lastBotResult(): string { return JSON.stringify(this.lastBotOperationResult ?? null); }

  lastBotError(): string { return this.lastBotOperationError; }

  async botSendMessage(args: { GROUP_ID?: number | string; MESSAGE?: string }): Promise<void> {
    const message = String(args.MESSAGE ?? '');
    const normalizedMessage = this.normalizeBotMessageInput(message);
    await this.sendBotMessage(args.GROUP_ID, { content: this.elementMessageTextFallback(normalizedMessage), message: normalizedMessage });
  }

  async botSendDirectMessage(args: { USER_ID?: number | string; MESSAGE?: string }): Promise<void> {
    const userId = parseUserId(args.USER_ID);
    const message = String(args.MESSAGE ?? '');
    if (!this.botKey || !userId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '用户 ID 无效');
      return;
    }
    const normalizedMessage = this.normalizeBotMessageInput(message);
    await this.runBotOperation(() => botApiSendDirectMessage(this.botKey, userId, { content: this.elementMessageTextFallback(normalizedMessage), message: normalizedMessage }));
  }

  async botSendMedia(args: { GROUP_ID?: number | string; MEDIA_TYPE?: string; URL?: string }): Promise<void> {
    const mediaType = String(args.MEDIA_TYPE ?? 'image').toLowerCase();
    const tag = mediaType === 'sticker' ? 'sticker' : 'img';
    await this.sendBotMessage(args.GROUP_ID, { content: '', message: `<${tag} src="${this.escapeElementAttribute(String(args.URL ?? ''))}"/>` });
  }

  async botSendVoice(args: { GROUP_ID?: number | string; URL?: string; DURATION?: number | string }): Promise<void> {
    await this.sendBotMessage(args.GROUP_ID, { content: '', message: `<audio src="${this.escapeElementAttribute(String(args.URL ?? ''))}" duration_ms="${Number(args.DURATION ?? 0) || 0}"/>` });
  }

  async botReactMessage(args: { GROUP_ID?: number | string; MESSAGE_ID?: number | string; EMOJI?: string }): Promise<void> {
    const groupId = parseGroupId(args.GROUP_ID);
    const messageId = Number(args.MESSAGE_ID ?? 0);
    if (!this.botKey || !groupId || !messageId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '群 ID 或消息 ID 无效');
      return;
    }
    await this.runBotOperation(() => botApiToggleReaction(this.botKey, groupId, messageId, String(args.EMOJI ?? '')));
  }

  async botRecallMessage(args: { GROUP_ID?: number | string; MESSAGE_ID?: number | string }): Promise<void> {
    const groupId = parseGroupId(args.GROUP_ID);
    const messageId = Number(args.MESSAGE_ID ?? 0);
    if (!this.botKey || !groupId || !messageId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '群 ID 或消息 ID 无效');
      return;
    }
    await this.runBotOperation(() => botApiRecallMessage(this.botKey, groupId, messageId));
  }

  async botUpdateButton(args: { GROUP_ID?: number | string; MESSAGE_ID?: number | string; BUTTON_ID?: string; LABEL?: string; VARIANT?: string; DISABLED?: string | boolean; SCOPE?: string }): Promise<void> {
    const groupId = parseGroupId(args.GROUP_ID);
    const messageId = Number(args.MESSAGE_ID ?? 0);
    const buttonId = String(args.BUTTON_ID ?? '').trim();
    const scope = String(args.SCOPE ?? 'global') === 'user' ? 'user' : 'global';
    const label = String(args.LABEL ?? '').trim();
    const variant = String(args.VARIANT ?? 'default');
    if (!this.botKey || !groupId || !messageId || !buttonId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '会话 ID、消息 ID 或按钮 ID 无效');
      return;
    }
    const payload: Record<string, unknown> = {
      label,
      variant,
      disabled: String(args.DISABLED ?? 'false') === 'true',
      scope
    };
    if (scope === 'user') {
      const userId = Number(this.lastBotEvent.user_id ?? 0);
      if (!Number.isInteger(userId) || userId <= 0) {
        this.setBotError('仅点击者范围需要先收到 message.interaction 事件');
        return;
      }
      payload.user_id = userId;
    }
    await this.runBotOperation(() => botApiUpdateMessageComponent(this.botKey, groupId, messageId, buttonId, payload));
  }

  async botConversations(): Promise<string> {
    if (!this.botKey) {
      this.setBotError('请先设置机器人 Key');
      return '[]';
    }
    const result = await this.runBotOperation(() => botApiGetConversations(this.botKey));
    return JSON.stringify(result ?? []);
  }

  async botUserInfo(args: { USER_ID?: number | string; FIELD?: string }): Promise<string> {
    const userId = parseUserId(args.USER_ID);
    if (!this.botKey || !userId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '用户 ID 无效');
      return '';
    }
    const result = await this.runBotOperation(() => botApiGetUserInfo(this.botKey, userId));
    if (!result) {
      return '';
    }
    const user = result.user ?? {};
    const field = String(args.FIELD ?? 'nickname');
    if (field === 'online') {
      return String(Boolean(result.online));
    }
    if (field === 'is_bot') {
      return String(Boolean(user.is_bot));
    }
    return this.stringifyBotField(user[field]);
  }

  async botGroupInfo(args: { GROUP_ID?: number | string; FIELD?: string }): Promise<string> {
    const groupId = parseGroupId(args.GROUP_ID);
    if (!this.botKey || !groupId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '群 ID 无效');
      return '';
    }
    const result = await this.runBotOperation(() => botApiGetConversationInfo(this.botKey, groupId));
    if (!result) {
      return '';
    }
    const field = String(args.FIELD ?? 'title');
    return this.stringifyBotField(result[field]);
  }

  async botMembers(args: { GROUP_ID?: number | string }): Promise<string> {
    const groupId = parseGroupId(args.GROUP_ID);
    if (!this.botKey || !groupId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '群 ID 无效');
      return '[]';
    }
    const result = await this.runBotOperation(() => botApiGetMembers(this.botKey, groupId));
    return JSON.stringify(result ?? []);
  }

  async botMessages(args: { GROUP_ID?: number | string; LIMIT?: number | string }): Promise<string> {
    const groupId = parseGroupId(args.GROUP_ID);
    if (!this.botKey || !groupId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '群 ID 无效');
      return '[]';
    }
    const result = await this.runBotOperation(() => botApiGetMessages(this.botKey, groupId, { limit: Number(args.LIMIT ?? 20) || 20 }));
    return JSON.stringify(result ?? []);
  }

  dispose(): void {
    this.unsubscribeEvents?.();
    this.unsubscribeEvents = undefined;
    this.disconnectBot();
  }

  private formatMessage(id: string): string {
    return this.formatMessageFn({ id, default: id, description: id });
  }

  private botEventHatParameters(): ScratchBlockDefinition['arguments'] {
    return {
      GROUP_ID: { type: 'ccw_hat_parameter' },
      MESSAGE_ID: { type: 'ccw_hat_parameter' },
      SENDER_ID: { type: 'ccw_hat_parameter' },
      SENDER_NAME: { type: 'ccw_hat_parameter' },
      MESSAGE_TYPE: { type: 'ccw_hat_parameter' },
      CONTENT: { type: 'ccw_hat_parameter' },
      EVENT_JSON: { type: 'ccw_hat_parameter' }
    };
  }

  private botGenericEventHatParameters(): ScratchBlockDefinition['arguments'] {
    return {
      EVENT_TYPE: { type: 'ccw_hat_parameter' },
      EVENT_JSON: { type: 'ccw_hat_parameter' }
    };
  }

  private handleRealtimeEvent(event: RealtimeEvent): void {
    if (event.type !== 'message.created') {
      return;
    }

    const opcode = `${extensionId}_whenNewMessage`;
    this.runtime?.startHatsWithParams?.(opcode, { parameters: {} });
    this.runtime?.startHats?.(opcode);
  }

  private async sendBotMessage(groupIdValue: number | string | undefined, payload: { type?: 'text' | 'image' | 'voice'; content: string; message?: string; metadata?: Record<string, unknown>; elements?: Array<{ type: string; attrs?: Record<string, unknown>; content?: string }> }): Promise<void> {
    const groupId = parseGroupId(groupIdValue);
    if (!this.botKey || !groupId) {
      this.setBotError(!this.botKey ? '请先设置机器人 Key' : '群 ID 无效');
      return;
    }
    await this.runBotOperation(() => botApiSendMessage(this.botKey, groupId, { type: payload.type ?? 'text', content: payload.content, message: payload.message, metadata: payload.metadata, elements: payload.elements }));
  }

  private async runBotOperation<T>(operation: () => Promise<T>): Promise<T | null> {
    try {
      const result = await operation();
      this.lastBotOperationResult = result ?? null;
      this.lastBotOperationError = '';
      this.lastBotOperationOk = true;
      return result;
    } catch (error) {
      this.lastBotOperationResult = null;
      this.lastBotOperationOk = false;
      this.setBotError(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private setBotError(message: string): void {
    this.lastBotOperationError = message;
    this.lastBotOperationOk = false;
    this.runtime?.scratchBlocks?.utils?.toast?.(`机器人操作失败：${message}`);
  }

  private stringifyBotField(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  }

  private elementMessageTextFallback(message: string): string {
    return message.replace(/<\s*at\b([^>]*)\/\s*>/gi, (_match, attrs: string) => {
      const name = /\bname\s*=\s*"([^"]*)"/.exec(String(attrs))?.[1];
      const id = /\bid\s*=\s*"?([^"\s]*)"?/.exec(String(attrs))?.[1];
      return `@${name || id || ''}`;
    }).replace(/<\s*at_all\s*\/\s*>/gi, '@全体').replace(/<\s*br\s*\/\s*>/gi, '\n').replace(/<\s*markdown\b[^>]*>([\s\S]*?)<\s*\/\s*markdown\s*>/gi, '$1').replace(/<\s*md\b[^>]*>([\s\S]*?)<\s*\/\s*md\s*>/gi, '$1').replace(/<[^>]+>/g, '').trim();
  }

  private normalizeBotMessageInput(message: string): string {
    const trimmed = message.trim();
    if (!trimmed) {
      return '';
    }
    const hasStructuralElement = /<\s*(at|at_all|quote|img|audio|sticker|br|markdown|md)\b/i.test(trimmed);
    if (hasStructuralElement) {
      return message;
    }
    if (/<\s*(button|btn|link)\b/i.test(trimmed) && this.looksLikeMarkdown(trimmed)) {
      return `<markdown>${this.escapeMarkdownElementContent(message)}</markdown>`;
    }
    if (/<\s*(button|btn|link)\b/i.test(trimmed)) {
      return message;
    }
    return this.looksLikeMarkdown(trimmed) ? `<markdown>${this.escapeMarkdownElementContent(message)}</markdown>` : message;
  }

  private looksLikeMarkdown(value: string): boolean {
    return /(^|\n)\s{0,3}#{1,3}\s+\S/.test(value)
      || /(^|\n)\s{0,3}[-*]\s+\S/.test(value)
      || /(^|\n)\s{0,3}>\s*\S/.test(value)
      || /(^|\n)\s*```/.test(value)
      || /\*\*[^*\n]+\*\*/.test(value)
      || /`[^`\n]+`/.test(value)
      || /!\[[^\]\n]{0,80}\]\([^\s)<>]{1,500}\)/.test(value)
      || /\[[^\]\n]{1,80}\]\(https?:\/\/[^\s)<>]{1,500}\)/.test(value);
  }

  private escapeMarkdownElementContent(value: string): string {
    return value.replace(/<\s*\/\s*(markdown|md)\s*>/gi, '&lt;/$1&gt;');
  }

  private escapeElementAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private handleBotSocketMessage(raw: string): void {
    try {
      const payload = JSON.parse(raw) as { type?: string; data?: Record<string, unknown> };
      const data = payload.data ?? {};
      if (payload.type === 'bot.connection.ready') {
        this.botUserId = Number(data.user_id ?? 0) || 0;
        this.lastBotOperationResult = data;
        this.lastBotOperationError = '';
        this.lastBotOperationOk = true;
      }
      this.lastBotEvent = { event_type: payload.type ?? '', ...data };
      if (payload.type && payload.type !== 'bot.connection.ready') {
        const eventParameters = {
          EVENT_TYPE: payload.type,
          EVENT_JSON: JSON.stringify(this.lastBotEvent)
        };
        this.runtime?.startHatsWithParams?.(`${extensionId}_whenBotEvent`, { parameters: eventParameters });
        this.runtime?.startHats?.(`${extensionId}_whenBotEvent`);
      }
      if (payload.type !== 'message.created') {
        return;
      }
      if (this.botUserId && Number(data.sender_id ?? 0) === this.botUserId) {
        return;
      }
      const parameters = {
        GROUP_ID: Number(data.conversation_id ?? 0),
        MESSAGE_ID: Number(data.id ?? data.message_id ?? 0),
        SENDER_ID: Number(data.sender_id ?? 0),
        SENDER_NAME: this.botSenderName(data),
        MESSAGE_TYPE: String(data.type ?? ''),
        CONTENT: String(data.content ?? ''),
        EVENT_JSON: JSON.stringify(this.lastBotEvent)
      };
      this.runtime?.startHatsWithParams?.(`${extensionId}_whenBotMessage`, { parameters });
      this.runtime?.startHats?.(`${extensionId}_whenBotMessage`);
      const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata as Record<string, unknown> : {};
      const mentions = Array.isArray(metadata.mentions) ? metadata.mentions : [];
      const mentioned = metadata.mention_all === true || mentions.some((item) => typeof item === 'object' && item !== null && Number((item as Record<string, unknown>).user_id) === this.botUserId);
      if (mentioned) {
        this.runtime?.startHatsWithParams?.(`${extensionId}_whenBotMentioned`, { parameters });
        this.runtime?.startHats?.(`${extensionId}_whenBotMentioned`);
      }
    } catch {
      this.lastBotEvent = { event_type: 'parse_error', raw };
    }
  }

  private botSenderName(data: Record<string, unknown>): string {
    const direct = data.sender_display_name ?? data.sender_name;
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }
    const sender = data.sender;
    if (sender && typeof sender === 'object') {
      const record = sender as Record<string, unknown>;
      for (const key of ['nickname', 'username', 'name']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
    }
    const senderId = Number(data.sender_id ?? 0);
    return senderId ? `用户 ${senderId}` : '';
  }
}
