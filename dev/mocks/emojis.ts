import type { GroupEmoji } from '@/api/groupEmojis';
import type { FavoriteStickerItem } from '@/api/messages';
import { json, type MockHandler } from './types';

const MAX_EMOJIS = 60;
const MAX_NAME_LENGTH = 12;
const SEED: Array<[name: string, glyph: string]> = [['狗头', '🐶'], ['笑哭', '😂'], ['点赞', '👍'], ['撒花', '🎉'], ['让我想想', '🤔'], ['名字写满十二个字的群表情', '🫡'], ['收到', '👌']];

/** resolveAssetUrl 只放行 http(s) 和 blob:，所以假图片画在 canvas 上再转成 blob 地址。 */
function picture(glyph: string, hue: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = `hsl(${hue} 70% 88%)`;
    context.fillRect(0, 0, 160, 160);
    context.font = '96px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(glyph, 80, 88);
  }
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ''), 'image/png'));
}

let nextId = 1;

function emoji(conversationId: number, name: string, url: string): GroupEmoji {
  nextId += 1;
  return { id: nextId, conversation_id: conversationId, name, url, content_type: 'image/png', created_by_id: 1, created_at: new Date().toISOString() };
}

/**
 * 预览页地址上的开关：
 *   ?stickers=0 / 80     收藏表情的数量（默认 9；0 看空状态，大一点看滚动）
 *   ?stickers=error      收藏表情加载失败
 *   ?groupEmojis=60      群 1 的表情数量（默认 7）
 *   ?upload=fail         从本地添加收藏时上传失败
 */
const params = new URLSearchParams(window.location.search);
const GLYPHS = ['🐶', '😂', '👍', '🎉', '🤔', '🫡', '👌', '🦆', '🐱', '🔥', '😭', '🥳', '🙏', '😎', '🍉', '🌙', '💤', '🐧', '🍜', '🎮'];

// 只有群 1 预置了表情，其它群是空的，用来看空状态
const store = new Map<number, GroupEmoji[]>();
const groupCount = Math.min(MAX_EMOJIS, Number(params.get('groupEmojis') ?? SEED.length) || 0);
const seeded = Promise.all(Array.from({ length: groupCount }, (_, index) => picture(SEED[index]?.[1] ?? GLYPHS[index % GLYPHS.length], index * 50))).then((urls) => {
  store.set(1, urls.map((url, index) => emoji(1, SEED[index]?.[0] ?? `表情${index + 1}`, url)));
});

// 收藏表情：和服务端一样按添加时间倒序返回
let nextAssetId = 100;
let favorites: FavoriteStickerItem[] = [];
let uploadCount = 0;

function favorite(url: string): FavoriteStickerItem {
  nextAssetId += 1;
  return { asset_id: nextAssetId, url, content_type: 'image/png', created_at: new Date().toISOString() };
}

const favoritesSeeded = Promise.all(Array.from({ length: Number(params.get('stickers') ?? 9) || 0 }, (_, index) => picture(GLYPHS[(index * 7 + 3) % GLYPHS.length], index * 37))).then((urls) => {
  favorites = urls.map(favorite).reverse();
});

async function favoritesMock(path: string, method: string, body: unknown): Promise<Response | undefined> {
  if (path === '/stickers/favorites' && method === 'GET') {
    await favoritesSeeded;
    return params.get('stickers') === 'error' ? json({ detail: 'Internal Server Error' }, 500) : json(favorites);
  }
  if (path === '/stickers/favorites' && method === 'POST') {
    const url = (body as { source_url?: string } | undefined)?.source_url ?? '';
    // 同一张图再加一次，拿回来的还是原来那条
    const existing = favorites.find((item) => item.url === url);
    if (existing) {
      return json(existing, 201);
    }
    const created = favorite(url);
    favorites = [created, ...favorites];
    return json(created, 201);
  }
  const removal = path.match(/^\/stickers\/favorites\/(\d+)$/);
  if (removal && method === 'DELETE') {
    favorites = favorites.filter((item) => item.asset_id !== Number(removal[1]));
    return json(null);
  }
  return undefined;
}

function fail(status: number, code: string, message: string): Response {
  return json({ detail: { code, message } }, status);
}

function nameError(list: GroupEmoji[], name: string, selfId?: number): Response | undefined {
  if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
    return fail(422, 'invalid_emoji_name', `表情名称需要 1 到 ${MAX_NAME_LENGTH} 个字，不能有空格`);
  }
  return list.some((item) => item.name === name && item.id !== selfId) ? fail(409, 'emoji_name_taken', '这个群里已经有同名的表情') : undefined;
}

/** 群表情、收藏表情 相关接口的假数据。 */
export const emojisMock: MockHandler = async ({ path, method, body }) => {
  if (path === '/uploads/message-image' && method === 'POST') {
    if (params.get('upload') === 'fail') {
      return json({ detail: '图片压缩后不能超过 3MB' }, 413);
    }
    // 预览页拿不到表单里的文件，随手画一张顶替；每次换一个，连着加几张能分得开
    uploadCount += 1;
    return json({ url: await picture(GLYPHS[(uploadCount * 3 + 7) % GLYPHS.length], 280 + uploadCount * 47), content_type: 'image/png' });
  }
  const favoriteResponse = await favoritesMock(path, method, body);
  if (favoriteResponse) {
    return favoriteResponse;
  }
  const match = path.match(/^\/conversations\/(\d+)\/emojis(?:\/(\d+))?$/);
  if (!match) {
    return undefined;
  }
  await seeded;
  const conversationId = Number(match[1]);
  const list = store.get(conversationId) ?? [];
  const payload = (body ?? {}) as { name?: string; image_url?: string };
  const name = (payload.name ?? '').replace(/\s+/g, '');

  if (!match[2]) {
    if (method === 'GET') {
      return json(list);
    }
    if (method !== 'POST') {
      return undefined;
    }
    if (list.length >= MAX_EMOJIS) {
      return fail(409, 'emoji_limit_reached', `每个群最多 ${MAX_EMOJIS} 个表情`);
    }
    const rejected = nameError(list, name);
    if (rejected) {
      return rejected;
    }
    const created = emoji(conversationId, name, payload.image_url ?? '');
    store.set(conversationId, [...list, created]);
    return json(created);
  }

  const target = list.find((item) => item.id === Number(match[2]));
  if (!target) {
    return json({ detail: 'Emoji not found' }, 404);
  }
  if (method === 'PATCH') {
    const rejected = nameError(list, name, target.id);
    if (rejected) {
      return rejected;
    }
    const renamed = { ...target, name };
    store.set(conversationId, list.map((item) => (item === target ? renamed : item)));
    return json(renamed);
  }
  if (method === 'DELETE') {
    store.set(conversationId, list.filter((item) => item !== target));
    return json(null);
  }
  return undefined;
};
