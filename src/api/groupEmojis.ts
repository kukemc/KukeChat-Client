import { apiRequest } from './client';
import { uploadMessageImage } from './messages';
import { asList } from './normalizers';

export interface GroupEmoji {
  id: number;
  conversation_id: number;
  name: string;
  url: string;
  content_type: string;
  created_by_id: number;
  created_at: string;
}

// 和服务端同一套限制，本地先拦一遍；最终以服务端的校验为准
export const MAX_GROUP_EMOJIS = 60;
export const MAX_GROUP_EMOJI_NAME_LENGTH = 12;
export const MAX_GROUP_EMOJI_BYTES = 512 * 1024;
export const GROUP_EMOJI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export async function getGroupEmojis(conversationId: number): Promise<GroupEmoji[]> {
  return asList<GroupEmoji>(await apiRequest<unknown>(`/conversations/${conversationId}/emojis`));
}

/** 先走消息图片的上传通道拿到地址，再登记成群表情；服务端会把图片另存一份。 */
export async function createGroupEmoji(conversationId: number, name: string, file: File): Promise<GroupEmoji> {
  const uploaded = await uploadMessageImage(file);
  return apiRequest<GroupEmoji>(`/conversations/${conversationId}/emojis`, { method: 'POST', body: { name, image_url: uploaded.url } });
}

export async function renameGroupEmoji(conversationId: number, emojiId: number, name: string): Promise<GroupEmoji> {
  return apiRequest<GroupEmoji>(`/conversations/${conversationId}/emojis/${emojiId}`, { method: 'PATCH', body: { name } });
}

export async function deleteGroupEmoji(conversationId: number, emojiId: number): Promise<void> {
  await apiRequest<unknown>(`/conversations/${conversationId}/emojis/${emojiId}`, { method: 'DELETE' });
}
