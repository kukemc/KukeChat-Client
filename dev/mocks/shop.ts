import { isRecord } from '@/api/normalizers';
import { json, type MockHandler } from './types';

/*
 * 商店接口（docs/shop.md）的假实现，状态只存在内存里，刷新页面就没了。
 * 场景写在 shopScenario 上，预览页（dev/shop-harness.tsx）的控制条和地址参数改的就是它。
 * 几件示例皮肤是自己编的，用来看纹样、角饰、动效组合起来的样子；颜色都核对过对比度（预览页的「皮肤图鉴」里有读数）。
 * 头像框（FRAMES）同理：后端默认上架的八件在这里先拟了一份样式。
 *
 * 限时商品（duration_days）：「天使」120 币 / 30 天、「小恶魔」50 币 / 30 天，其余永久。到期时间记在 expiry 里，
 * 每次读取时现场判断（settleExpiry）：过了就不再拥有、装备着的卸下。已拥有、没到期的限时商品 obtainable 是 renew，
 * 再买一次在原到期时间上加 N 天。shopState.setExpiry / expire 给预览页摆布到期时间用。
 */

export interface ShopScenario {
  /** ok 正常；missing 服务端没有商店（404）；error 服务端出错（500） */
  backend: 'ok' | 'missing' | 'error';
  /** 是否已绑定 CCW */
  bound: boolean;
  donated: number;
  spent: number;
  level: number;
  /** 刷新余额时 CCW 核实失败：返回上次的数并带 stale */
  stale: boolean;
  /** 购买时强制返回的错误；none 表示按真实规则来（余额、等级、是否拥有） */
  purchaseError: 'none' | 'item_not_found' | 'item_unavailable' | 'already_owned' | 'ccw_not_bound' | 'item_locked' | 'insufficient_coins' | 'verification_unavailable' | 'server';
  /** 刷新余额时强制返回的错误 */
  refreshError: 'none' | 'refresh_too_fast' | 'ccw_not_bound' | 'server';
  /** 装备时返回 403 not_owned */
  equipFails: boolean;
  /** 「在 CCW 投了币、还没刷新」的数量：下一次刷新成功时加进累计投币 */
  pendingDonation: number;
  /** 绑定后从没核实过：verified_at 是 null、余额是 0，直到刷新成功一次 */
  neverVerified: boolean;
  /** 服务端没配置官方作品：donate_url 是 null，余额恒为 stale，购买返回 503 */
  noDonateUrl: boolean;
  delay: number;
}

export const shopScenario: ShopScenario = {
  backend: 'ok',
  bound: true,
  donated: 520,
  spent: 240,
  level: 23,
  stale: false,
  purchaseError: 'none',
  refreshError: 'none',
  equipFails: false,
  pendingDonation: 0,
  neverVerified: false,
  noDonateUrl: false,
  delay: 220
};

export const DONATE_URL = 'https://www.ccw.site/detail/6650a1b2c3d4e5f6a7b8c9d0';

interface MockItem {
  id: number;
  sku: string;
  category: 'bubble' | 'frame';
  name: string;
  description: string;
  price: number;
  unlock_level: number | null;
  style: unknown;
  preview_text: string;
  tag: 'new' | 'hot' | 'limited' | null;
  available_until: string | null;
  is_active: boolean;
  /** 有效期（天）；不写是永久 */
  duration_days?: number | null;
}

/** 示例皮肤的 style。预览页的图鉴、聊天预览里群友身上穿的，也是这几件。 */
export const SKINS = {
  starry: {
    version: 1,
    background: 'linear-gradient(160deg, #1b1f4b 0%, #2c2a72 55%, #4a2f86 100%)',
    text: '#f3f1ff',
    link: '#ffe9a8',
    border: { color: '#ffffff24', width: 1 },
    radius: 16,
    shadow: '0 3px 12px #3a2f8a66',
    animation: 'breathe',
    pattern: { key: 'stars', color: '#ffffff', opacity: 0.34, scale: 1 },
    ornaments: [{ key: 'moon', corner: 'tr', color: '#ffe9a8', size: 20, animated: true }, { key: 'sparkle', corner: 'bl', color: '#fff6c4', size: 14, animated: true }]
  },
  sakura: {
    version: 1,
    background: 'linear-gradient(135deg, #ffe6ee 0%, #ffd2e0 100%)',
    text: '#7a2c47',
    link: '#a82a5a',
    border: { color: '#f6a5bf', width: 1 },
    radius: 18,
    shadow: '0 2px 8px #f58fb04d',
    animation: 'shimmer',
    pattern: { key: 'petals', color: '#f47ea6', opacity: 0.34, scale: 1 },
    ornaments: [{ key: 'petal', corner: 'tr', color: '#ff8fb3', size: 20, animated: true }, { key: 'petal', corner: 'bl', color: '#ffb1c9', size: 14, animated: true }],
    dark: { background: 'linear-gradient(135deg, #55203a 0%, #6d2b49 100%)', text: '#ffe6ee', border: { color: '#ff9dbb55', width: 1 }, shadow: '0 2px 10px #00000055', pattern: { key: 'petals', color: '#ff9dbb', opacity: 0.26, scale: 1 } }
  },
  pixel: {
    version: 1,
    background: '#1d2333',
    text: '#a6f7b7',
    link: '#ffd866',
    border: { color: '#a6f7b7', width: 2 },
    radius: 4,
    shadow: '3px 3px 0 #0b0e18a6',
    animation: 'none',
    pattern: { key: 'pixels', color: '#a6f7b7', opacity: 0.13, scale: 1 },
    ornaments: [{ key: 'pixel_heart', corner: 'tr', color: '#ff6b8b', size: 18, animated: true }, { key: 'bolt', corner: 'bl', color: '#ffd866', size: 14 }]
  },
  aurora: {
    version: 1,
    background: 'linear-gradient(135deg, #4c3fd1 0%, #2f6fdd 48%, #0b7f78 100%)',
    text: '#ffffff',
    link: '#d9fbff',
    border: { color: '#ffffff2e', width: 1 },
    radius: 14,
    shadow: '0 3px 10px #2f6fdd59',
    animation: 'flow',
    pattern: { key: 'waves', color: '#ffffff', opacity: 0.1, scale: 1.4 },
    ornaments: [{ key: 'sparkle', corner: 'tr', color: '#e3fbff', size: 16, animated: true }]
  },
  sunny: {
    version: 1,
    background: 'linear-gradient(180deg, #e2f2ff 0%, #c4e3ff 100%)',
    text: '#12406b',
    link: '#0b5cad',
    radius: 16,
    shadow: '0 2px 8px #7fb5f540',
    pattern: { key: 'clouds', color: '#ffffff', opacity: 0.6, scale: 1 },
    ornaments: [{ key: 'sun', corner: 'tr', color: '#ffb52e', size: 22, animated: true }, { key: 'cloud', corner: 'bl', color: '#ffffff', size: 18, animated: true }],
    dark: { background: 'linear-gradient(180deg, #17365a 0%, #1f4a78 100%)', text: '#e3f2ff', pattern: { key: 'clouds', color: '#ffffff', opacity: 0.1, scale: 1 }, shadow: '0 2px 10px #00000055' }
  },
  mint: {
    version: 1,
    background: 'linear-gradient(180deg, #ecfff7 0%, #cdf7e5 100%)',
    text: '#14533c',
    link: '#0b7a52',
    border: { color: '#8fe3c0', width: 1 },
    pattern: { key: 'dots', color: '#2fb380', opacity: 0.2, scale: 1 },
    ornaments: [{ key: 'leaf', corner: 'br', color: '#37c488', size: 18, animated: true }],
    dark: { background: 'linear-gradient(180deg, #123b2e 0%, #0f3327 100%)', text: '#d7ffee', border: { color: '#54e0a84d', width: 1 }, pattern: { key: 'dots', color: '#54e0a8', opacity: 0.18, scale: 1 } }
  },
  candy: {
    version: 1,
    background: 'linear-gradient(135deg, #ffd9ea 0%, #ffe9cc 100%)',
    text: '#7c2d4f',
    link: '#b0306a',
    radius: 20,
    animation: 'shimmer',
    pattern: { key: 'hearts', color: '#ff6b9d', opacity: 0.24, scale: 1 },
    ornaments: [{ key: 'heart', corner: 'tr', color: '#ff5c8a', size: 18, animated: true }],
    dark: { background: 'linear-gradient(135deg, #5c2242 0%, #5e3a1c 100%)', text: '#ffe3ef', pattern: { key: 'hearts', color: '#ff8fb5', opacity: 0.2, scale: 1 } }
  },
  kitty: {
    version: 1,
    background: '#fff4e0',
    text: '#6b4423',
    link: '#a35a12',
    border: { color: '#f0c98a', width: 1.5 },
    radius: 18,
    pattern: { key: 'stripes', color: '#f3c98b', opacity: 0.22, scale: 1 },
    ornaments: [{ key: 'paw', corner: 'br', color: '#e8a04c', size: 20, animated: true }],
    dark: { background: '#3b2c1a', text: '#ffe9c9', border: { color: '#e8a04c66', width: 1.5 }, pattern: { key: 'stripes', color: '#e8a04c', opacity: 0.12, scale: 1 } }
  },
  royal: {
    version: 1,
    background: 'linear-gradient(135deg, #33240a 0%, #5f4210 50%, #33240a 100%)',
    text: '#ffe9a8',
    link: '#fff3cf',
    border: { color: '#e6b54a', width: 1.5 },
    radius: 12,
    shadow: '0 3px 10px #7a560f66',
    animation: 'shimmer',
    pattern: { key: 'grid', color: '#ffd76a', opacity: 0.12, scale: 1 },
    ornaments: [{ key: 'crown', corner: 'tr', color: '#ffd24a', size: 22, animated: true }]
  },
  snow: {
    version: 1,
    background: 'linear-gradient(180deg, #f6fbff 0%, #deedff 100%)',
    text: '#1e3a5f',
    link: '#1d5fae',
    border: { color: '#b9d6f7', width: 1 },
    pattern: { key: 'noise', color: '#5b8fd1', opacity: 0.5, scale: 1 },
    ornaments: [{ key: 'snow', corner: 'tr', color: '#6faaf0', size: 20, animated: true }, { key: 'snow', corner: 'bl', color: '#9cc6f7', size: 12, animated: true }],
    dark: { background: 'linear-gradient(180deg, #1a2d47 0%, #20395b 100%)', text: '#e6f1ff', border: { color: '#6faaf055', width: 1 }, pattern: { key: 'noise', color: '#cfe4ff', opacity: 0.4, scale: 1 } }
  },
  thunder: {
    version: 1,
    background: 'linear-gradient(135deg, #111827 0%, #312e81 100%)',
    text: '#e0e7ff',
    link: '#ffe14a',
    radius: 10,
    shadow: '0 3px 12px #312e8166',
    animation: 'breathe',
    pattern: { key: 'stripes', color: '#ffffff', opacity: 0.05, scale: 1.5 },
    ornaments: [{ key: 'bolt', corner: 'tr', color: '#ffe14a', size: 20, animated: true }]
  },
  ink: { version: 1, background: '#20232b', text: '#f2f3f5', radius: 8 },
  /** 这个版本的客户端不认识的皮肤（version 2）：按没装备处理，卡片上提示需要更新客户端 */
  future: { version: 2, background: 'conic-gradient(#f00, #00f)', text: '#ffffff' }
} satisfies Record<string, unknown>;

/**
 * 头像框的示例 style（docs/shop.md 头像框一节）。前八件对应后端默认上架的那八件，样式是照着名字先拟的，以后以后端的为准；
 * 后面几件是为了把每个头像框专用的装饰、每种动效都看一遍。
 */
export const FRAMES = {
  mint: {
    version: 1,
    ring: { background: 'linear-gradient(140deg, #a8f5d8 0%, #3ecfa0 55%, #8ff0cf 100%)', width: 3, gap: 1 },
    ornaments: [{ key: 'leaf', position: 'br', color: '#37c488', size: 14, animated: true }],
    dark: { ring: { background: 'linear-gradient(140deg, #7fe6c2 0%, #2bb389 55%, #6fdcb8 100%)' } }
  },
  sakura: {
    version: 1,
    ring: { background: 'linear-gradient(160deg, #ffd9e6 0%, #ff8fb3 55%, #ffc4d8 100%)', width: 3, gap: 1 },
    glow: { color: '#ff8fb355', blur: 6 },
    ornaments: [{ key: 'petal', position: 'tr', color: '#ff8fb3', size: 15, animated: true }, { key: 'petal', position: 'bl', color: '#ffb7cd', size: 11, animated: true }]
  },
  seasalt: {
    version: 1,
    ring: { background: 'linear-gradient(180deg, #d6f1ff 0%, #6bbcf7 60%, #a9dcff 100%)', width: 3, gap: 1 },
    animation: 'shimmer',
    ornaments: [{ key: 'sparkle', position: 'tr', color: '#ffffff', size: 12, animated: true }],
    dark: { ring: { background: 'linear-gradient(180deg, #a9dcff 0%, #3f96dc 60%, #7cc4f5 100%)' } }
  },
  cat: {
    version: 1,
    ring: { background: 'linear-gradient(180deg, #ffd9a0 0%, #f2a954 100%)', width: 3, gap: 0 },
    ornaments: [{ key: 'cat_ears', position: 'top', color: '#f5b160', size: 20, animated: true }, { key: 'paw', position: 'br', color: '#e8944a', size: 13 }]
  },
  starring: {
    version: 1,
    ring: { background: 'conic-gradient(from 0deg, #7f7fd5, #91eae4, #ffe9a8, #b08cf0, #7f7fd5)', width: 3, gap: 1 },
    glow: { color: '#7f7fd566', blur: 8 },
    animation: 'spin',
    ornaments: [{ key: 'star', position: 'tr', color: '#ffd76a', size: 15, animated: true }, { key: 'sparkle', position: 'bl', color: '#fff6c4', size: 11, animated: true }]
  },
  aurora: {
    version: 1,
    ring: { background: 'conic-gradient(from 90deg, #4c3fd1, #2fb6dd, #3ddc97, #b05cff, #4c3fd1)', width: 4, gap: 1 },
    glow: { color: '#3ddc9750', blur: 10 },
    animation: 'spin'
  },
  halo: {
    version: 1,
    ring: { background: 'linear-gradient(180deg, #fff6d0 0%, #ffd76a 100%)', width: 2, gap: 1 },
    glow: { color: '#ffd76a88', blur: 9 },
    animation: 'pulse',
    ornaments: [{ key: 'halo', position: 'top', color: '#ffdf7a', size: 22, animated: true }]
  },
  crowned: {
    version: 1,
    ring: { background: 'conic-gradient(from 0deg, #f7d774, #b8862b, #fff1b8, #c9962f, #f7d774)', width: 4, gap: 1 },
    glow: { color: '#f2c14e66', blur: 8 },
    animation: 'shimmer',
    ornaments: [{ key: 'crown', position: 'top', color: '#ffd24a', size: 18 }, { key: 'laurel', position: 'bottom', color: '#e0ae3e', size: 15 }]
  },
  angel: {
    version: 1,
    ring: { background: 'linear-gradient(180deg, #ffffff 0%, #cfe4ff 100%)', width: 2, gap: 1 },
    glow: { color: '#a9cfff77', blur: 8 },
    ornaments: [{ key: 'wings', position: 'right', color: '#f4f8ff', size: 24, animated: true }, { key: 'halo', position: 'top', color: '#ffe38a', size: 18, animated: true }]
  },
  imp: {
    version: 1,
    ring: { background: 'linear-gradient(160deg, #ff6b7d 0%, #8a1f3d 100%)', width: 3, gap: 0 },
    glow: { color: '#ff3b5c55', blur: 8 },
    animation: 'pulse',
    ornaments: [{ key: 'horns', position: 'top', color: '#d8314f', size: 18, animated: true }, { key: 'bolt', position: 'br', color: '#ffd34a', size: 13 }]
  },
  ribbon: {
    version: 1,
    ring: { background: '#ff9ec0', width: 3, gap: 1 },
    ornaments: [{ key: 'bow', position: 'tr', color: '#ff5c8a', size: 18, animated: true }, { key: 'heart', position: 'bl', color: '#ff7aa5', size: 11, animated: true }]
  },
  /** 这个版本不认识的头像框（version 2） */
  future: { version: 2, ring: { background: '#ffffff', width: 3 } }
} satisfies Record<string, unknown>;

const soon = (hours: number): string => new Date(Date.now() + hours * 3600_000).toISOString();

const BUBBLE_CATALOG: Array<Omit<MockItem, 'category'>> = [
  { id: 1, sku: 'bubble.aurora', name: '极光', description: '会缓缓流动的渐变气泡，角上一点闪光。', price: 200, unlock_level: null, style: SKINS.aurora, preview_text: '今天也要开心呀', tag: 'hot', available_until: null, is_active: true },
  { id: 2, sku: 'bubble.starry', name: '星空', description: '深蓝的夜，星点和一弯新月，光晕慢慢呼吸。', price: 320, unlock_level: null, style: SKINS.starry, preview_text: '晚安，好梦', tag: 'new', available_until: null, is_active: true },
  { id: 3, sku: 'bubble.sakura', name: '樱花', description: '粉色的底上飘着花瓣，春天限定。', price: 260, unlock_level: null, style: SKINS.sakura, preview_text: '一起去看樱花吧', tag: 'limited', available_until: soon(51), is_active: true },
  { id: 4, sku: 'bubble.pixel', name: '像素', description: '硬边、方角、像素爱心，复古游戏机的味道。', price: 180, unlock_level: null, style: SKINS.pixel, preview_text: 'PRESS START', tag: null, available_until: null, is_active: true },
  { id: 5, sku: 'bubble.sunny', name: '晴天', description: '蓝天白云，角上挂着一个小太阳。', price: 120, unlock_level: null, style: SKINS.sunny, preview_text: '今天天气真好', tag: null, available_until: null, is_active: true },
  { id: 6, sku: 'bubble.candy', name: '糖果', description: '甜甜的粉橘色，撒了一把小爱心。', price: 150, unlock_level: 40, style: SKINS.candy, preview_text: '给你一颗糖', tag: 'limited', available_until: soon(0.6), is_active: true },
  { id: 7, sku: 'bubble.mint', name: '薄荷', description: '清爽的薄荷绿。账号等级 20 免费解锁。', price: 0, unlock_level: 20, style: SKINS.mint, preview_text: '来一杯薄荷汽水', tag: null, available_until: null, is_active: true },
  { id: 8, sku: 'bubble.kitty', name: '猫爪', description: '奶油色配一只小猫爪。账号等级 5 免费解锁。', price: 0, unlock_level: 5, style: SKINS.kitty, preview_text: '喵～', tag: null, available_until: null, is_active: true },
  { id: 9, sku: 'bubble.royal', name: '王冠', description: '黑金配色。不出售，账号等级 60 解锁。', price: 0, unlock_level: 60, style: SKINS.royal, preview_text: '朕知道了', tag: null, available_until: null, is_active: true },
  { id: 10, sku: 'bubble.thunder', name: '雷霆', description: '活动限定，只在活动里送出。', price: 0, unlock_level: null, style: SKINS.thunder, preview_text: '冲！', tag: null, available_until: null, is_active: true },
  { id: 11, sku: 'bubble.snow', name: '初雪', description: '去年冬天的限定款，已经下架。', price: 220, unlock_level: null, style: SKINS.snow, preview_text: '下雪啦', tag: null, available_until: null, is_active: false },
  { id: 12, sku: 'bubble.ink', name: '墨', description: '什么装饰都没有的一块深色。', price: 60, unlock_level: null, style: SKINS.ink, preview_text: '嗯', tag: null, available_until: null, is_active: true },
  { id: 13, sku: 'bubble.future', name: '全息', description: '用了这个版本还不认识的新效果。', price: 500, unlock_level: null, style: SKINS.future, preview_text: '未来已来', tag: 'new', available_until: null, is_active: true }
];

const CATALOG: MockItem[] = [
  ...BUBBLE_CATALOG.map((item): MockItem => ({ ...item, category: 'bubble' })),
  { id: 101, sku: 'frame.mint', category: 'frame', name: '薄荷', description: '清爽的薄荷绿，角上一片小叶子。', price: 80, unlock_level: null, style: FRAMES.mint, preview_text: '', tag: null, available_until: null, is_active: true },
  { id: 102, sku: 'frame.sakura', category: 'frame', name: '樱花', description: '粉色的环，飘着两片花瓣。', price: 120, unlock_level: null, style: FRAMES.sakura, preview_text: '', tag: 'new', available_until: null, is_active: true },
  { id: 103, sku: 'frame.seasalt', category: 'frame', name: '海盐', description: '浅浅的海蓝，偶尔一道光扫过去。', price: 100, unlock_level: null, style: FRAMES.seasalt, preview_text: '', tag: null, available_until: null, is_active: true },
  { id: 104, sku: 'frame.cat', category: 'frame', name: '猫耳', description: '头顶一对猫耳，偶尔会抖一下。', price: 180, unlock_level: null, style: FRAMES.cat, preview_text: '', tag: 'hot', available_until: null, is_active: true },
  { id: 105, sku: 'frame.starring', category: 'frame', name: '星环', description: '缓缓旋转的渐变，挂着一颗星星。', price: 260, unlock_level: null, style: FRAMES.starring, preview_text: '', tag: null, available_until: null, is_active: true },
  { id: 106, sku: 'frame.aurora', category: 'frame', name: '极光', description: '极光的颜色绕着头像慢慢转。', price: 300, unlock_level: null, style: FRAMES.aurora, preview_text: '', tag: null, available_until: null, is_active: true },
  { id: 107, sku: 'frame.halo', category: 'frame', name: '光环', description: '头顶一圈光环。账号等级 4 免费解锁。', price: 0, unlock_level: 4, style: FRAMES.halo, preview_text: '', tag: null, available_until: null, is_active: true },
  { id: 108, sku: 'frame.crowned', category: 'frame', name: '加冕', description: '金环、皇冠和月桂。账号等级 16 免费解锁。', price: 0, unlock_level: 16, style: FRAMES.crowned, preview_text: '', tag: null, available_until: null, is_active: true },
  { id: 110, sku: 'frame.angel', category: 'frame', name: '天使', description: '一对翅膀和头顶的光环。限时 30 天，到期可以续。', price: 120, unlock_level: null, style: FRAMES.angel, preview_text: '', tag: 'new', available_until: null, is_active: true, duration_days: 30 },
  { id: 111, sku: 'frame.devil', category: 'frame', name: '小恶魔', description: '两只小角，一闪一闪的红光。限时 30 天。', price: 50, unlock_level: null, style: FRAMES.imp, preview_text: '', tag: null, available_until: null, is_active: true, duration_days: 30 },
  { id: 109, sku: 'frame.future', category: 'frame', name: '全息框', description: '用了这个版本还不认识的新效果。', price: 500, unlock_level: null, style: FRAMES.future, preview_text: '', tag: 'new', available_until: null, is_active: true }
];

interface MockRecord {
  id: number;
  item: { sku: string; name: string; category: string };
  price: number;
  source: 'purchase' | 'level' | 'grant';
  created_at: string;
  revoked_at?: string | null;
  refunded?: boolean;
  duration_days?: number | null;
  expires_at?: string | null;
}

const DAY_MS = 86400_000;
const owned = new Set<string>(['bubble.snow', 'bubble.sunny', 'frame.mint']);
/** 限时商品的到期时间（毫秒）。只有拥有着的限时商品才有 */
const expiry = new Map<string, number>();
/** 到期了、还没发过 shop.item.expired 的那些：预览页轮询 takeExpired() 取走并发事件 */
const justExpired: string[] = [];

/** 读取时现场判断到期：过了的不再拥有，装备着的卸下 */
function settleExpiry(): void {
  for (const [sku, at] of expiry) {
    if (at <= Date.now()) {
      expiry.delete(sku);
      owned.delete(sku);
      justExpired.push(sku);
      for (const slot of Object.keys(equipped)) {
        if (equipped[slot] === sku) {
          equipped[slot] = null;
        }
      }
    }
  }
}

/** 让某人（这里只有「我」）得到一件：限时商品从现在起算 N 天，已拥有没到期的在原到期时间上再加 N 天。返回新的到期时间 */
function obtain(item: MockItem, days: number | null | undefined = item.duration_days): string | null {
  settleExpiry();
  if (days) {
    const base = owned.has(item.sku) ? Math.max(expiry.get(item.sku) ?? 0, Date.now()) : Date.now();
    expiry.set(item.sku, base + days * DAY_MS);
  } else {
    expiry.delete(item.sku);
  }
  owned.add(item.sku);
  const at = expiry.get(item.sku);
  return at ? new Date(at).toISOString() : null;
}
/** 每个槽装备的 sku（槽名和类别名相同） */
const equipped: Record<string, string | null> = { bubble: 'bubble.sunny', frame: null };
const categoryOf = (sku: string): string => CATALOG.find((item) => item.sku === sku)?.category ?? 'bubble';
let lastRefreshAt = 0;
let verifiedAt: string | null = new Date(Date.now() - 5 * 60_000).toISOString();
let nextRecordId = 100;
const records: MockRecord[] = [
  { id: 2, item: { sku: 'bubble.sunny', name: '晴天', category: 'bubble' }, price: 120, source: 'purchase', created_at: new Date(Date.now() - 3 * 86400_000).toISOString() },
  { id: 1, item: { sku: 'bubble.snow', name: '初雪', category: 'bubble' }, price: 120, source: 'purchase', created_at: new Date(Date.now() - 300 * 86400_000).toISOString() },
  // 被后台收回的两条：一条退了币，一条没退
  { id: 4, item: { sku: 'bubble.pixel', name: '像素', category: 'bubble' }, price: 180, source: 'purchase', created_at: new Date(Date.now() - 20 * 86400_000).toISOString(), revoked_at: new Date(Date.now() - 18 * 86400_000).toISOString(), refunded: true },
  { id: 3, item: { sku: 'bubble.thunder', name: '雷霆', category: 'bubble' }, price: 0, source: 'grant', created_at: new Date(Date.now() - 40 * 86400_000).toISOString(), revoked_at: new Date(Date.now() - 30 * 86400_000).toISOString(), refunded: false }
];

/** 预览页用：直接改「拥有 / 装备」的状态 */
export const shopState = {
  setOwned(skus: string[]): void {
    owned.clear();
    skus.forEach((sku) => owned.add(sku));
    for (const slot of Object.keys(equipped)) {
      const sku = equipped[slot];
      if (sku && !owned.has(sku)) {
        equipped[slot] = null;
      }
    }
  },
  /** sku 传 null 是卸下 slot 这个槽；传了 sku 就装到它所属类别的槽上 */
  setEquipped(sku: string | null, slot = 'bubble'): void {
    equipped[sku ? categoryOf(sku) : slot] = sku;
    if (sku) {
      owned.add(sku);
    }
  },
  /** 往购买记录里塞很多条，看分页 */
  fillRecords(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const item = CATALOG[index % CATALOG.length];
      records.push({ id: nextRecordId++, item: { sku: item.sku, name: item.name, category: item.category }, price: index % 3 === 0 ? 0 : item.price, source: index % 3 === 0 ? 'level' : index % 5 === 0 ? 'grant' : 'purchase', created_at: new Date(Date.now() - (index + 4) * 86400_000).toISOString() });
    }
  },
  /** 模拟被赠送 / 升级解锁：让这件变成已拥有（限时商品按它的 duration_days 计期），返回事件里要带的商品摘要 */
  grant(sku: string, source: 'grant' | 'level'): { sku: string; name: string; category: string } | null {
    const item = CATALOG.find((candidate) => candidate.sku === sku);
    if (!item) {
      return null;
    }
    const expiresAt = obtain(item);
    records.unshift({ id: nextRecordId++, item: { sku, name: item.name, category: item.category }, price: 0, source, created_at: new Date().toISOString(), duration_days: item.duration_days ?? null, expires_at: expiresAt });
    return { sku, name: item.name, category: item.category };
  },
  /** 我已经拥有一件限时商品，还剩 days 天（可以是小数）到期。装备与否另外用 setEquipped */
  setExpiry(sku: string, days: number): { item: { sku: string; name: string; category: string }; expires_at: string } | null {
    const item = CATALOG.find((candidate) => candidate.sku === sku);
    if (!item) {
      return null;
    }
    owned.add(sku);
    expiry.set(sku, Date.now() + days * DAY_MS);
    return { item: { sku, name: item.name, category: item.category }, expires_at: new Date(expiry.get(sku) ?? 0).toISOString() };
  },
  /** 到期了、还没发过事件的商品：取走，预览页拿去发 shop.item.expired 和 user.cosmetics.updated */
  takeExpired(): Array<{ sku: string; name: string; category: string }> {
    settleExpiry();
    return justExpired.splice(0).map((sku) => {
      const item = CATALOG.find((candidate) => candidate.sku === sku);
      return { sku, name: item?.name ?? sku, category: item?.category ?? 'bubble' };
    });
  },
  /** 送礼的假后端要用：目录、某件现在是不是我的、把一件给我 */
  find(sku: string): MockItem | undefined {
    return CATALOG.find((candidate) => candidate.sku === sku);
  },
  owns(sku: string): boolean {
    settleExpiry();
    return owned.has(sku);
  },
  giveMe(sku: string): string | null {
    const item = CATALOG.find((candidate) => candidate.sku === sku);
    return item ? obtain(item) : null;
  },
  /** 模拟后台下架一件商品（目录变化） */
  delist(sku: string): void {
    const item = CATALOG.find((candidate) => candidate.sku === sku);
    if (item) {
      item.is_active = false;
    }
  },
  /** 用户对象上的 cosmetics 应该是什么样：每个装备着的槽一项 */
  cosmetics(): Record<string, { sku: string; style: unknown }> {
    settleExpiry();
    const result: Record<string, { sku: string; style: unknown }> = {};
    for (const [slot, sku] of Object.entries(equipped)) {
      const item = sku ? CATALOG.find((candidate) => candidate.sku === sku) : undefined;
      if (item) {
        result[slot] = { sku: item.sku, style: item.style };
      }
    }
    return result;
  }
};

function fail(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ detail: { code, message, ...extra } }, status);
}

function balance(): Record<string, unknown> {
  if (shopScenario.bound && shopScenario.neverVerified) {
    return { bound: true, donated: 0, spent: 0, balance: 0, verified_at: null, stale: shopScenario.stale || shopScenario.noDonateUrl };
  }
  return { bound: shopScenario.bound, donated: shopScenario.bound ? shopScenario.donated : 0, spent: shopScenario.spent, balance: shopScenario.bound ? shopScenario.donated - shopScenario.spent : 0, verified_at: shopScenario.bound ? verifiedAt : null, stale: shopScenario.stale || shopScenario.noDonateUrl };
}

function obtainable(item: MockItem): string {
  if (owned.has(item.sku)) {
    // 限时商品没到期：可以再买来续期（下架了、不卖的不行）
    return expiry.has(item.sku) && item.is_active && item.price > 0 ? 'renew' : 'owned';
  }
  if (item.unlock_level !== null && shopScenario.level >= item.unlock_level) {
    return 'level';
  }
  return item.price > 0 ? 'buy' : 'locked';
}

function view(item: MockItem): Record<string, unknown> {
  const expiresAt = expiry.get(item.sku);
  return { duration_days: item.duration_days ?? null, expires_at: owned.has(item.sku) && expiresAt ? new Date(expiresAt).toISOString() : null, id: item.id, sku: item.sku, category: item.category, name: item.name, description: item.description, price: item.price, unlock_level: item.unlock_level, style: item.style, preview_text: item.preview_text, tag: item.tag, available_until: item.available_until, owned: owned.has(item.sku), equipped: equipped[item.category] === item.sku, obtainable: obtainable(item), is_active: item.is_active };
}

function equippedMap(): Record<string, string> {
  return Object.fromEntries(Object.entries(equipped).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

function purchase(item: MockItem | undefined): Response {
  const forced = shopScenario.purchaseError;
  if (forced === 'server') {
    return json({ detail: 'Internal Server Error' }, 500);
  }
  if (!item || forced === 'item_not_found') {
    return fail(404, 'item_not_found', '商品不存在');
  }
  settleExpiry();
  // 检查顺序照 docs/shop.md 3.6：not_found → already_owned → unavailable → 等级免费领 / locked → ccw_not_bound → 503 → 402
  // 永久商品重复购买是 409；限时商品已拥有没到期时可以再买（续期）
  const renewing = owned.has(item.sku) && expiry.has(item.sku);
  if (forced === 'already_owned' || (owned.has(item.sku) && !renewing)) {
    owned.add(item.sku);
    return fail(409, 'already_owned', '已经拥有这件商品');
  }
  if (forced === 'item_unavailable' || !item.is_active) {
    return fail(409, 'item_unavailable', '商品已下架或已过期');
  }
  const how = renewing ? 'buy' : obtainable(item);
  if (forced === 'item_locked' || how === 'locked') {
    return fail(409, 'item_locked', '这件商品不出售，等级也还不够');
  }
  const free = how === 'level';
  // 等级够了的免费领取不要求绑定 CCW，也不用核实余额
  if (!free) {
    if (forced === 'ccw_not_bound' || !shopScenario.bound) {
      shopScenario.bound = false;
      return fail(409, 'ccw_not_bound', '还没有绑定 CCW 账号');
    }
    if (forced === 'verification_unavailable' || shopScenario.noDonateUrl) {
      return fail(503, 'verification_unavailable', 'CCW 接口暂时不通，稍后再试');
    }
  }
  const current = shopScenario.donated - shopScenario.spent;
  if (forced === 'insufficient_coins' || (!free && current < item.price)) {
    // 强制「余额不够」时模拟的是：服务端重新核实后发现币比客户端以为的少
    const actual = forced === 'insufficient_coins' ? Math.min(current, Math.max(0, item.price - 40)) : current;
    return fail(402, 'insufficient_coins', '金币不够', { balance: actual, price: item.price, shortfall: item.price - actual, donate_url: DONATE_URL });
  }
  if (!free) {
    shopScenario.spent += item.price;
  }
  const expiresAt = obtain(item);
  verifiedAt = new Date().toISOString();
  records.unshift({ id: nextRecordId++, item: { sku: item.sku, name: item.name, category: item.category }, price: free ? 0 : item.price, source: free ? 'level' : 'purchase', created_at: new Date().toISOString(), duration_days: item.duration_days ?? null, expires_at: expiresAt });
  return json({ item: view(item), balance: balance(), equipped: equippedMap() });
}

/** 发过哪些商店请求，给自动化脚本核对用 */
export const shopRequests: Array<{ method: string; path: string; body: unknown }> = [];

export const shopMock: MockHandler = async ({ path, url, method, body }) => {
  if (!path.startsWith('/shop')) {
    return undefined;
  }
  shopRequests.push({ method, path, body });
  await new Promise((resolve) => window.setTimeout(resolve, shopScenario.delay));
  if (shopScenario.backend === 'missing') {
    return json({ detail: 'Not Found' }, 404);
  }
  if (shopScenario.backend === 'error') {
    return json({ detail: 'Internal Server Error' }, 500);
  }
  settleExpiry();
  if (path === '/shop' && method === 'GET') {
    return json({
      categories: [{ key: 'bubble', label: '气泡', slot: 'bubble' }, { key: 'frame', label: '头像框', slot: 'frame' }, { key: 'nameplate', label: '铭牌', slot: 'nameplate' }],
      // 一件这个版本不认识的类别的商品：不应该显示出来
      items: [...CATALOG.filter((item) => item.is_active || owned.has(item.sku)).map(view), { id: 99, sku: 'nameplate.gold', category: 'nameplate', name: '金色铭牌', description: '', price: 100, unlock_level: null, style: {}, preview_text: '', tag: null, available_until: null, owned: false, equipped: false, obtainable: 'buy' }],
      balance: balance(),
      equipped: equippedMap(),
      donate_url: shopScenario.noDonateUrl ? null : DONATE_URL,
      level: shopScenario.level
    });
  }
  if (path === '/shop/balance/refresh' && method === 'POST') {
    if (shopScenario.refreshError === 'server') {
      return json({ detail: 'Internal Server Error' }, 500);
    }
    if (shopScenario.refreshError === 'ccw_not_bound' || !shopScenario.bound) {
      shopScenario.bound = false;
      return fail(409, 'ccw_not_bound', '还没有绑定 CCW 账号');
    }
    const wait = Math.ceil((lastRefreshAt + 20_000 - Date.now()) / 1000);
    if (shopScenario.refreshError === 'refresh_too_fast' || wait > 0) {
      return fail(429, 'refresh_too_fast', '刷新得太快了', { retry_after: wait > 0 ? wait : 13 });
    }
    lastRefreshAt = Date.now();
    if (!shopScenario.stale && !shopScenario.noDonateUrl) {
      shopScenario.neverVerified = false;
      shopScenario.donated += shopScenario.pendingDonation;
      shopScenario.pendingDonation = 0;
      verifiedAt = new Date().toISOString();
    }
    return json(balance());
  }
  const purchaseMatch = path.match(/^\/shop\/items\/(\d+)\/purchase$/);
  if (purchaseMatch && method === 'POST') {
    return purchase(CATALOG.find((item) => item.id === Number(purchaseMatch[1])));
  }
  if (path === '/shop/equipped' && method === 'PUT') {
    const sku = isRecord(body) && typeof body.sku === 'string' ? body.sku : null;
    const slot = isRecord(body) && typeof body.slot === 'string' ? body.slot : '';
    if (!(slot in equipped) || (sku !== null && categoryOf(sku) !== slot)) {
      return fail(422, 'invalid_slot', '没有这个装备槽');
    }
    if (shopScenario.equipFails || (sku !== null && !owned.has(sku))) {
      return fail(403, 'not_owned', '只能装备自己拥有的装扮');
    }
    equipped[slot] = sku;
    return json({ equipped: equippedMap() });
  }
  if (path === '/shop/purchases' && method === 'GET') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    return json({ items: records.slice(offset, offset + limit), total: records.length });
  }
  return json({ detail: 'Not Found' }, 404);
};
