import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { addFavoriteSticker, getFavoriteStickers, uploadMessageImage, type FavoriteStickerItem } from '@/api/messages';
import { toast } from '@/components/ui/toast';
import { MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES, MAX_IMAGE_UPLOAD_BYTES } from '../../message/constants';
import { useEvent } from '../runtime';

/** 和聊天图片右键「添加到表情」、移动端面板用的是同一份缓存。 */
export const favoriteStickersKey = ['favorite-stickers'] as const;

// 服务端的收藏表情只认这四种
export const FAVORITE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** 一次最多加这么多张，再多的忽略并提示。 */
const MAX_FILES_PER_BATCH = 20;

export function useFavoriteStickers(enabled: boolean): UseQueryResult<FavoriteStickerItem[]> {
  return useQuery({ queryKey: favoriteStickersKey, queryFn: getFavoriteStickers, enabled, staleTime: 30_000 });
}

/** 先走消息图片的上传通道拿到地址，再登记成收藏表情（和群表情的添加是同一条路）。 */
async function favoriteFromFile(file: File): Promise<FavoriteStickerItem> {
  const uploaded = await uploadMessageImage(file);
  return addFavoriteSticker(uploaded.url);
}

/** 和发图片同一套大小限制：能压缩的格式看原图，GIF 不压缩所以直接卡上传上限。 */
function fileProblem(file: File): string {
  if (!FAVORITE_IMAGE_TYPES.includes(file.type)) {
    return '只支持 PNG、JPG、WebP、GIF';
  }
  const limit = file.type === 'image/gif' ? MAX_IMAGE_UPLOAD_BYTES : MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES;
  return file.size > limit ? `超过 ${Math.round(limit / 1024 / 1024)}MB` : '';
}

export interface PendingFavorite {
  id: string;
  previewUrl: string;
}

export interface FavoriteUploads {
  /** 正在上传的图片，按加入顺序；面板里显示成半透明的格子 */
  pending: PendingFavorite[];
  error: string;
  clearError: () => void;
  /** 把本地图片加进收藏。一张一张传，传完一张就出现在列表最前面。 */
  addFiles: (files: File[]) => void;
}

/** 从本地图片添加收藏表情。状态放在面板外层，面板关了再打开还能看到进度和失败原因。 */
export function useFavoriteUploads(): FavoriteUploads {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingFavorite[]>([]);
  const [error, setError] = useState('');
  const nextIdRef = useRef(0);
  // 多次选图排成一条队，前一批传完再传后一批
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const previewUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrlsRef.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addFiles = useEvent((files: File[]) => {
    const problems: string[] = [];
    const accepted: Array<{ id: string; file: File; previewUrl: string }> = [];
    for (const file of files) {
      const problem = accepted.length >= MAX_FILES_PER_BATCH ? `一次最多添加 ${MAX_FILES_PER_BATCH} 张` : fileProblem(file);
      if (problem) {
        problems.push(`${file.name || '图片'}（${problem}）`);
        continue;
      }
      nextIdRef.current += 1;
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      accepted.push({ id: `upload-${nextIdRef.current}`, file, previewUrl });
    }
    setError('');
    setPending((current) => [...current, ...accepted.map(({ id, previewUrl }) => ({ id, previewUrl }))]);

    queueRef.current = queueRef.current.then(async () => {
      let added = 0;
      for (const item of accepted) {
        try {
          const sticker = await favoriteFromFile(item.file);
          added += 1;
          // 服务端按添加时间倒序返回；同一张图重复添加拿回来的是原来那条
          queryClient.setQueryData<FavoriteStickerItem[]>(favoriteStickersKey, (current) => (current ? [sticker, ...current.filter((existing) => existing.asset_id !== sticker.asset_id)] : current));
        } catch (failure) {
          // 服务端给的是可以直接展示的原因
          problems.push(`${item.file.name || '图片'}（${failure instanceof Error && failure.message ? failure.message : '上传失败'}）`);
        }
        previewUrlsRef.current.delete(item.previewUrl);
        URL.revokeObjectURL(item.previewUrl);
        setPending((current) => current.filter((entry) => entry.id !== item.id));
      }
      if (added > 0) {
        void queryClient.invalidateQueries({ queryKey: favoriteStickersKey });
        toast.info(added > 1 ? `已添加 ${added} 个收藏表情` : '已添加到收藏表情');
      }
      if (problems.length > 0) {
        setError(`${problems.length} 张没有添加：${problems.join('、')}`);
      }
    });
  });

  return { pending, error, clearError: () => setError(''), addFiles };
}
