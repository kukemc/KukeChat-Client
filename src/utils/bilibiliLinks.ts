/**
 * 消息文字里的 B 站视频链接。认这几种（和后端 app/services/link_preview.py 认的一样）：
 *   bilibili.com/video/BV…、bilibili.com/video/av…、m.bilibili.com/video/…（带不带 www.、带不带 https:// 都行）
 *   b23.tv/…（短链，指向哪个视频要服务端去解析）
 * 纯函数，不发请求；卡片见 components/chat/message/BilibiliVideoCard.tsx。
 */

export interface BilibiliLinkRef {
  /** 缓存用的键：同一个视频不管写成哪种链接都是同一个（短链只能按短链本身算） */
  key: string;
  /** 交给 GET /link-preview/bilibili 的原链接 */
  url: string;
}

const BILIBILI_LINK_PATTERN = /(?:https?:\/\/)?(?:(?:www\.|m\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]{10}|av\d{1,12})|(?:www\.)?b23\.tv\/([0-9A-Za-z]{4,16}))(?:[/?#][^\s]*)?/gi;

/** 链接后面紧跟着的中英文标点不算链接的一部分 */
const TRAILING_PUNCTUATION = /[，。！？；：、,.!?;:)\]}）】》"'”’]+$/;

/** 前一个字符是字母数字（比如 xbilibili.com），说明它是别的域名的一部分，不认 */
function glued(text: string, index: number): boolean {
  return index > 0 && /[0-9A-Za-z.\-_/@]/.test(text[index - 1]);
}

export function extractBilibiliLinks(text: string, limit = 2): BilibiliLinkRef[] {
  const refs: BilibiliLinkRef[] = [];
  const seen = new Set<string>();
  if (!text || !/bilibili\.com|b23\.tv/i.test(text)) {
    return refs;
  }
  BILIBILI_LINK_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(BILIBILI_LINK_PATTERN)) {
    const raw = match[0];
    const start = match.index ?? 0;
    // 带了协议头的前面可以是任何东西；不带的要是一个独立的词
    if (!/^https?:\/\//i.test(raw) && glued(text, start)) {
      continue;
    }
    const video = match[1];
    const short = match[2];
    let key: string;
    if (video) {
      // BV 号大小写敏感（是 base58），av 号不是
      key = /^av/i.test(video) ? `av:${video.slice(2)}` : `bv:${video}`;
    } else if (short) {
      key = `b23:${short}`;
    } else {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const cleaned = raw.replace(TRAILING_PUNCTUATION, '');
    refs.push({ key, url: /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}` });
    if (refs.length >= limit) {
      break;
    }
  }
  BILIBILI_LINK_PATTERN.lastIndex = 0;
  return refs;
}

/** 秒数写成「3:25」「1:02:03」 */
export function formatVideoDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** 播放量写成「9876」「1.2万」「3.4亿」 */
export function formatViewCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '0';
  }
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿`;
  }
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1).replace(/\.0$/, '')}万`;
  }
  return String(Math.floor(value));
}
