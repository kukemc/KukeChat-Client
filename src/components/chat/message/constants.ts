import type { MuteMenuOption } from './types';

export const MAX_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024;

export const MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES = 12 * 1024 * 1024;

export const MAX_VOICE_UPLOAD_BYTES = 2 * 1024 * 1024;

export const MAX_VOICE_RECORDING_MS = 3 * 60 * 1000;

export const MOBILE_VOICE_CANCEL_DISTANCE = 56;

export const MAX_MESSAGE_CONTENT_LENGTH = 2000;

export const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export const EMOJIS = ['😀', '😄', '😂', '🤣', '😊', '😍', '😘', '😎', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '✨', '❤️', '💔', '🔥', '⭐', '🌙', '☀️', '🍀', '🐱', '🐶', '🐧', '🍉', '🍜', '🎮', '📷', '💬'];

export const QUICK_REACTION_EMOJIS = ['😂', '😘', '❔', '🤔', '😡', '😭'];

export const FULL_REACTION_EMOJIS = ['😀', '😃', '😄', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '😋', '😜', '🤔', '😮', '😢', '😭', '😡', '👍', '👎', '👏', '🙏', '💪', '🎉', '✨', '❤️', '🔥', '⭐', '🌙', '☀️', '🍀', '🐱', '🐶', '🐧', '🍉', '🍜', '🎮', '📷', '💬', '✅', '❌'];

// 太长的消息复读出去就是刷屏，卡在这个长度以内
export const REPEAT_MAX_LENGTH = 200;

// 头像双击的判定窗口，同时也是单击开名片的延迟
export const AVATAR_DOUBLE_TAP_MS = 300;

export const MESSAGE_MENU_WIDTH = 252;

export const MESSAGE_MENU_HEIGHT = 416;

export const MEMBER_MENU_WIDTH = 220;

export const MEMBER_MENU_HEIGHT = 356;

export const REACTION_PICKER_WIDTH = 320;

export const REACTION_PICKER_HEIGHT = 320;

export const FORWARD_PREVIEW_LIMIT = 3;

export const MENTION_ALL_REMAINING = 20;

export const WRAP_ANYWHERE_CLASS = '[overflow-wrap:anywhere]';

export const MESSAGE_PAGE_SIZE = 50;

export const MOBILE_ENTER_LONG_PRESS_MS = 420;

export const EDITABLE_BLOCK_TAGS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL']);

export const EDITABLE_TRAILING_BREAK_TAGS = new Set(['DIV', 'P', 'LI']);

export const MUTE_MENU_OPTIONS: MuteMenuOption[] = [
  { label: '10分钟', minutes: 10 },
  { label: '1小时', minutes: 60 },
  { label: '12小时', minutes: 720 },
  { label: '1天', minutes: 1440 },
  { label: '自定义时长', custom: true }
];
