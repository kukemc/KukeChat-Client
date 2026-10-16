import { useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBilibiliPreview, type BilibiliVideoPreview } from '@/api/linkPreview';
import { Icon } from '@/components/ui/Icon';
import { extractBilibiliLinks, formatVideoDuration, formatViewCount, type BilibiliLinkRef } from '@/utils/bilibiliLinks';
import { openExternalUrl } from '@/utils/openExternalUrl';

/**
 * 消息里 B 站视频链接下面的卡片：封面（右下角时长）、标题（最多两行）、UP 主、播放量。点一下在浏览器里打开。
 *
 * 数据来自 GET /link-preview/bilibili（服务端去问 B 站，进程内缓存一小时）。前端按链接缓存：
 * 同一个视频不管在多少条消息里、滚出去再滚回来，都只问一次；问不到（不是视频、B 站拿不到、旧后端没有这个接口、断网）
 * 记成 null，不画卡片，原来的文字链接照常能点，这次会话里也不再问。
 *
 * 封面在 i*.hdslb.com 上，B 站按 Referer 防盗链：带着我们的页面地址去要是 403，不带 Referer 就能拿到，
 * 所以 <img> 一律 referrerPolicy="no-referrer"。封面还是加载失败时换成一块占位，卡片照常显示。
 */

/** 封面要个和卡片差不多大的缩略图（B 站图床支持在地址后面接 @宽w_高h_1c.webp），省流量 */
function thumbnail(cover: string): string {
  try {
    const url = new URL(cover);
    if (/(^|\.)hdslb\.com$/i.test(url.hostname) && !url.pathname.includes('@')) {
      return `${cover}@336w_189h_1c.webp`;
    }
  } catch {
    return cover;
  }
  return cover;
}

async function fetchPreview(url: string): Promise<BilibiliVideoPreview | null> {
  try {
    return await getBilibiliPreview(url);
  } catch {
    // 422 unsupported_link / 502 preview_unavailable / 404 旧后端 / 断网：都不画卡片
    return null;
  }
}

function useBilibiliPreview(link: BilibiliLinkRef): BilibiliVideoPreview | null | undefined {
  return useQuery({
    queryKey: ['link-preview', 'bilibili', link.key],
    queryFn: () => fetchPreview(link.url),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  }).data;
}

function BilibiliVideoCard({ link }: { link: BilibiliLinkRef }): JSX.Element | null {
  const preview = useBilibiliPreview(link);
  const [coverFailed, setCoverFailed] = useState(false);
  if (!preview) {
    return null;
  }
  const href = preview.url;
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(href);
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="kc-bili-card kcsk-keep"
      data-bilibili={preview.bvid || link.key}
      title={preview.title}
      onClick={open}
      // 行上的双击是「引用」
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="kc-bili-cover">
        {preview.cover && !coverFailed
          ? <img src={thumbnail(preview.cover)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setCoverFailed(true)} />
          : <span className="kc-bili-cover-empty" aria-hidden="true"><Icon name="play" className="h-5 w-5" /></span>}
        {preview.duration > 0 ? <span className="kc-bili-duration">{formatVideoDuration(preview.duration)}</span> : null}
      </span>
      <span className="kc-bili-body">
        <span className="kc-bili-title">{preview.title}</span>
        <span className="kc-bili-meta">
          {preview.owner_name ? <span className="kc-bili-owner"><span className="kc-bili-up">UP</span>{preview.owner_name}</span> : null}
          <span className="kc-bili-views" title={`${preview.views} 次播放`}><Icon name="play" className="h-3 w-3" />{formatViewCount(preview.views)}</span>
          <span className="kc-bili-brand" aria-label="哔哩哔哩">bilibili</span>
        </span>
      </span>
    </a>
  );
}

/** 一条消息文字里的 B 站视频链接（最多两个），一个链接一张卡片；一个都没认出来就什么都不画。 */
export function BilibiliVideoCards({ text }: { text: string | null | undefined }): JSX.Element | null {
  const links = text ? extractBilibiliLinks(text) : [];
  if (links.length === 0) {
    return null;
  }
  return <div className="kc-bili-cards">{links.map((link) => <BilibiliVideoCard key={link.key} link={link} />)}</div>;
}
