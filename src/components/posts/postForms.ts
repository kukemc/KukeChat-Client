/**
 * 动态里几个表单的状态与提交：发布 / 编辑、转发与分享到聊天、发送个人名片、@ 和 # 的联想。
 * 只管数据，不管长什么样；移动端和桌面端各自拿去渲染。
 */
import { type ChangeEvent, type ClipboardEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import { sharePostToConversation, shareUserToConversation } from '@/api/messages';
import { createPost, repostPost, searchPostTopics, updatePost, uploadPostImage } from '@/api/posts';
import { userShareMetadata } from '@/components/chat/info/shared';
import { getDisplayName } from '@/components/ui/Avatar';
import type { Post, PostTopic, PostVisibility, User } from '@/types/api';
import { type ComposerImage, MAX_IMAGES, clearComposerDraft, conversationDisplayTitle, extractMentionUserIds, extractTopicNames, inputTrigger, legacyMentionToPlain, loadComposerDraft, mentionToken, mergeTopics, pickAcceptableImages, postShareMetadata, postShareText, randomId, replaceTriggerToken, saveComposerDraft, userCardShareText } from './postModel';
import { invalidatePosts, useFriendUsers, useTrendingPostTopics } from './postQueries';

/* ───────── 发布 / 编辑 ───────── */

export function usePostComposer({ currentUser, editingPost, onClose }: { currentUser: User; editingPost?: Post | null; onClose: () => void }) {
  const isEditing = Boolean(editingPost);
  // 草稿只在打开的那一刻读一次；编辑已有动态时不碰草稿
  const [savedDraft] = useState(() => (editingPost ? null : loadComposerDraft(currentUser.id)));
  const [content, setContent] = useState(editingPost?.content ?? savedDraft?.content ?? '');
  const [visibility, setVisibility] = useState<PostVisibility>(editingPost?.visibility ?? savedDraft?.visibility ?? 'public');
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>(editingPost?.image_urls ?? []);
  const [error, setError] = useState<string | null>(null);
  const imagesRef = useRef<ComposerImage[]>([]);
  const queryClient = useQueryClient();
  const friendUsers = useFriendUsers(currentUser.id);
  const topicOptions = useTrendingPostTopics().data ?? [];

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    if (!isEditing) {
      saveComposerDraft(currentUser.id, { content, visibility });
    }
  }, [content, currentUser.id, isEditing, visibility]);

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedUrls: string[] = [];
      for (const image of images) {
        const uploaded = await uploadPostImage(image.file);
        uploadedUrls.push(uploaded.url);
      }
      const payload = { content: legacyMentionToPlain(content.trim()), visibility, image_urls: [...existingImageUrls, ...uploadedUrls], mention_user_ids: extractMentionUserIds(content, friendUsers), topic_names: extractTopicNames(content) };
      return editingPost ? updatePost(editingPost.id, payload) : createPost(payload);
    },
    onSuccess: () => {
      if (!isEditing) {
        clearComposerDraft(currentUser.id);
      }
      invalidatePosts(queryClient);
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : (editingPost ? '编辑失败' : '发布失败'))
  });

  function stageFiles(files: FileList | File[]): void {
    const available = Math.max(0, MAX_IMAGES - existingImageUrls.length - imagesRef.current.length);
    if (available === 0) {
      setError(`最多只能上传 ${MAX_IMAGES} 张图片`);
      return;
    }
    const picked = pickAcceptableImages(Array.from(files).slice(0, available));
    setError(picked.error);
    if (picked.accepted.length > 0) {
      const staged = picked.accepted.map((file) => ({ id: `${file.name}-${file.size}-${randomId()}`, file, previewUrl: URL.createObjectURL(file) }));
      // ref 立刻跟上：同一轮里连着进来两批文件时，第二批要算上第一批占掉的名额
      imagesRef.current = [...imagesRef.current, ...staged];
      setImages((current) => [...current, ...staged]);
    }
  }

  function removeImage(id: string): void {
    setImages((current) => {
      const target = current.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((image) => image.id !== id);
    });
  }

  function removeExistingImage(url: string): void {
    setExistingImageUrls((current) => current.filter((item) => item !== url));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    const pastedFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'));
    if (pastedFiles.length === 0) {
      return;
    }
    event.preventDefault();
    stageFiles(pastedFiles);
  }

  /** 给 <input type="file"> 的 onChange 用；清空 value 是为了再选同一张图也能触发。 */
  function handleFileInput(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files) {
      stageFiles(event.target.files);
    }
    event.target.value = '';
  }

  const imageCount = existingImageUrls.length + images.length;
  return {
    isEditing,
    title: isEditing ? '编辑动态' : '发表动态',
    content,
    setContent,
    visibility,
    setVisibility,
    images,
    existingImageUrls,
    imageCount,
    error,
    friendUsers,
    topicOptions,
    isPending: mutation.isPending,
    canAddImage: imageCount < MAX_IMAGES && !mutation.isPending,
    // 转发来的动态可以不带任何自己的内容
    canSubmit: Boolean(content.trim() || imageCount > 0 || editingPost?.repost_of_id) && !mutation.isPending,
    submit: () => mutation.mutate(),
    removeImage,
    removeExistingImage,
    handlePaste,
    handleFileInput
  };
}

/* ───────── 选一个会话 ───────── */

export function useConversationPicker(currentUser: User, enabled = true) {
  const [query, setQuery] = useState('');
  const [targetId, setTargetId] = useState<number | null>(null);
  const conversationsQuery = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled });
  const cleanQuery = query.trim().toLowerCase();
  const all = conversationsQuery.data ?? [];
  const items = all
    .map((conversation) => ({ conversation, title: conversationDisplayTitle(conversation, currentUser) }))
    .filter(({ conversation, title }) => !cleanQuery || title.toLowerCase().includes(cleanQuery) || String(conversation.id).includes(cleanQuery));
  const selected = all.find((conversation) => conversation.id === targetId) ?? null;
  return { query, setQuery, targetId, setTargetId, isLoading: conversationsQuery.isLoading, items, selectedTitle: selected ? conversationDisplayTitle(selected, currentUser) : null };
}

/** 发完消息后，目标会话的消息和会话列表都要刷新。 */
function useRefreshConversation(): (conversationId: number) => void {
  const queryClient = useQueryClient();
  return (conversationId) => {
    void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };
}

/* ───────── 转发到动态 / 分享到聊天 ───────── */

export type RepostMode = 'zone' | 'chat';

export function useRepostForm({ post, currentUser, onClose }: { post: Post; currentUser: User; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('public');
  const [mode, setMode] = useState<RepostMode>('zone');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const refreshConversation = useRefreshConversation();
  const picker = useConversationPicker(currentUser, mode === 'chat');
  // 转发一条转发时，带出去的是最初那条
  const previewPost = post.repost_of ?? post;

  const mutation = useMutation<unknown, Error>({
    mutationFn: () => {
      if (mode === 'chat') {
        if (!picker.targetId) {
          throw new Error('请选择要发送的群聊或私聊');
        }
        return sharePostToConversation(picker.targetId, postShareText(previewPost, content), postShareMetadata(previewPost));
      }
      return repostPost(post.id, { content: content.trim(), visibility });
    },
    onSuccess: () => {
      if (mode === 'chat' && picker.targetId) {
        refreshConversation(picker.targetId);
      } else {
        invalidatePosts(queryClient);
      }
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : '转发失败')
  });

  return { content, setContent, visibility, setVisibility, mode, setMode, error, picker, previewPost, isPending: mutation.isPending, canSubmit: !mutation.isPending && (mode === 'zone' || Boolean(picker.targetId)), submit: () => mutation.mutate() };
}

/* ───────── 把某个人的名片发到聊天 ───────── */

export function useUserCardShare({ user, currentUser, onClose }: { user: User; currentUser: User; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refreshConversation = useRefreshConversation();
  const picker = useConversationPicker(currentUser);

  const mutation = useMutation({
    mutationFn: () => {
      if (!picker.targetId) {
        throw new Error('请选择要发送的群聊或私聊');
      }
      return shareUserToConversation(picker.targetId, userCardShareText(user, note), userShareMetadata(user));
    },
    onSuccess: () => {
      if (picker.targetId) {
        refreshConversation(picker.targetId);
      }
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : '发送名片失败')
  });

  return { note, setNote, error, picker, isPending: mutation.isPending, canSubmit: Boolean(picker.targetId) && !mutation.isPending, submit: () => mutation.mutate() };
}

/* ───────── @ 好友、# 话题的联想 ───────── */

type MentionField = HTMLInputElement | HTMLTextAreaElement;

/**
 * 输入框里敲 @ 或 # 时的联想：跟踪光标、算出候选、把选中的那一项写回去。
 * 返回的 fieldProps 直接摊到 input / textarea 上；候选怎么摆由调用方决定。
 */
export function useMentionInput({ value, onChange, friends, topics, onFocus }: { value: string; onChange: (value: string) => void; friends: User[]; topics: PostTopic[]; onFocus?: () => void }) {
  const inputRef = useRef<MentionField | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const trigger = inputTrigger(value, cursor);
  const query = trigger?.query.toLowerCase() ?? '';
  const topicSearchQuery = useQuery({
    queryKey: ['post-topics', 'search', query],
    queryFn: () => searchPostTopics(query, 8),
    enabled: focused && trigger?.type === 'topic',
    staleTime: 30_000
  });
  const friendMatches = trigger?.type === 'mention'
    ? friends.filter((user) => getDisplayName(user).toLowerCase().includes(query) || user.username.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const topicOptions = mergeTopics(topicSearchQuery.data, topics);
  const topicMatches = trigger?.type === 'topic' ? topicOptions.filter((topic) => topic.name.toLowerCase().includes(query)).slice(0, 8) : [];
  const exactTopicExists = trigger?.type === 'topic' && Boolean(query) && topicOptions.some((topic) => topic.name.toLowerCase() === query);
  const topicSearchPending = trigger?.type === 'topic' && topicSearchQuery.isFetching;

  function syncCursor(): void {
    setCursor(inputRef.current?.selectionStart ?? value.length);
  }

  function chooseMention(user: User): void {
    onChange(replaceTriggerToken(value, mentionToken(user), cursor));
    setCursor((current) => current + mentionToken(user).length);
  }

  function chooseTopic(name: string): void {
    const normalized = name.trim().replace(/^#/, '');
    if (normalized) {
      onChange(replaceTriggerToken(value, `#${normalized} `, cursor));
      setCursor((current) => current + normalized.length + 2);
    }
  }

  const fieldProps = {
    value,
    onChange: (event: ChangeEvent<MentionField>) => {
      onChange(event.target.value);
      setCursor(event.target.selectionStart ?? event.target.value.length);
    },
    onClick: syncCursor,
    onKeyUp: syncCursor,
    onSelect: syncCursor,
    onFocus: () => {
      setFocused(true);
      window.setTimeout(syncCursor, 0);
      onFocus?.();
    },
    // 晚一点再收起，候选项的点击才来得及触发
    onBlur: () => window.setTimeout(() => setFocused(false), 120)
  };

  return { inputRef, fieldProps, focused, trigger, query, friendMatches, topicMatches, exactTopicExists, topicSearchPending, chooseMention, chooseTopic };
}

export interface SuggestionRect {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

/** 候选列表挂在一个盖住整个弹层的容器里时，算它相对容器的位置：下面放不下就翻到输入框上面。 */
export function placeSuggestions(input: Element, layer: Element): SuggestionRect {
  const inputRect = input.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();
  const gap = 10;
  const edgePadding = 14;
  const spaceBelow = layerRect.bottom - inputRect.bottom - gap - edgePadding;
  const spaceAbove = inputRect.top - layerRect.top - gap - edgePadding;
  const placement: 'top' | 'bottom' = spaceBelow < 150 && spaceAbove > spaceBelow ? 'top' : 'bottom';
  const available = placement === 'top' ? spaceAbove : spaceBelow;
  return {
    left: Math.max(edgePadding, inputRect.left - layerRect.left),
    top: placement === 'top' ? inputRect.top - layerRect.top - gap : inputRect.bottom - layerRect.top + gap,
    width: Math.min(inputRect.width, layerRect.width - edgePadding * 2),
    maxHeight: Math.max(120, Math.min(220, available)),
    placement
  };
}
