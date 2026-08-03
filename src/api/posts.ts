import type { CreatePostCommentPayload, CreatePostPayload, Post, PostComment, PostFeedScope, PostFeedSort, PostLike, PostLikeToggleRead, PostNotificationList, PostStats, PostTopic, UpdatePostPayload, UploadResponse } from '@/types/api';
import { apiRequest, uploadFile } from './client';
import { asList } from './normalizers';

export interface GetPostsOptions {
  scope?: PostFeedScope;
  beforeId?: number;
  limit?: number;
  topic?: string | null;
  sort?: PostFeedSort;
}

function buildPostQuery(options: GetPostsOptions = {}): string {
  const params = new URLSearchParams();
  if (options.scope) {
    params.set('scope', options.scope);
  }
  if (options.beforeId) {
    params.set('before_id', String(options.beforeId));
  }
  if (options.limit) {
    params.set('limit', String(options.limit));
  }
  if (options.topic) {
    params.set('topic', options.topic);
  }
  if (options.sort) {
    params.set('sort', options.sort);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getPostFeed(options: GetPostsOptions = {}): Promise<Post[]> {
  const response = await apiRequest<unknown>(`/posts/feed${buildPostQuery(options)}`);
  return asList<Post>(response);
}

export async function getPost(postId: number): Promise<Post> {
  return apiRequest<Post>(`/posts/${postId}`);
}

export async function getUserPosts(userId: number, options: Omit<GetPostsOptions, 'scope'> = {}): Promise<Post[]> {
  const response = await apiRequest<unknown>(`/posts/users/${userId}${buildPostQuery(options)}`);
  return asList<Post>(response);
}

export async function getUserPostStats(userId: number): Promise<PostStats> {
  return apiRequest<PostStats>(`/posts/users/${userId}/stats`);
}

export async function createPost(payload: CreatePostPayload): Promise<Post> {
  return apiRequest<Post>('/posts', { method: 'POST', body: payload });
}

export async function updatePost(postId: number, payload: UpdatePostPayload): Promise<Post> {
  return apiRequest<Post>(`/posts/${postId}`, { method: 'PATCH', body: payload });
}

export async function repostPost(postId: number, payload: Omit<CreatePostPayload, 'image_urls' | 'repost_of_id'>): Promise<Post> {
  return createPost({ ...payload, image_urls: [], repost_of_id: postId });
}

export async function deletePost(postId: number): Promise<void> {
  await apiRequest<unknown>(`/posts/${postId}`, { method: 'DELETE' });
}

export async function pinPost(postId: number): Promise<Post> {
  return apiRequest<Post>(`/posts/${postId}/pin`, { method: 'POST' });
}

export async function unpinPost(postId: number): Promise<Post> {
  return apiRequest<Post>(`/posts/${postId}/pin`, { method: 'DELETE' });
}

export async function getTrendingPostTopics(limit = 5): Promise<PostTopic[]> {
  const response = await apiRequest<unknown>(`/posts/topics/trending?limit=${limit}`);
  return asList<PostTopic>(response);
}

export async function searchPostTopics(query: string, limit = 8): Promise<PostTopic[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const response = await apiRequest<unknown>(`/posts/topics/search?${params.toString()}`);
  return asList<PostTopic>(response);
}

export async function getPostNotifications(limit = 30): Promise<PostNotificationList> {
  return apiRequest<PostNotificationList>(`/posts/notifications?limit=${limit}`);
}

export async function markPostNotificationsRead(): Promise<PostNotificationList> {
  return apiRequest<PostNotificationList>('/posts/notifications/read', { method: 'POST' });
}

export async function markPostNotificationRead(notificationId: number): Promise<PostNotificationList> {
  return apiRequest<PostNotificationList>(`/posts/notifications/${notificationId}/read`, { method: 'POST' });
}

export async function togglePostLike(postId: number): Promise<PostLikeToggleRead> {
  return apiRequest<PostLikeToggleRead>(`/posts/${postId}/like`, { method: 'POST' });
}

export async function getPostLikes(postId: number, limit = 100): Promise<PostLike[]> {
  const response = await apiRequest<unknown>(`/posts/${postId}/likes?limit=${limit}`);
  return asList<PostLike>(response);
}

export async function getPostComments(postId: number): Promise<PostComment[]> {
  const response = await apiRequest<unknown>(`/posts/${postId}/comments`);
  return asList<PostComment>(response);
}

export async function createPostComment(postId: number, payload: CreatePostCommentPayload): Promise<PostComment> {
  return apiRequest<PostComment>(`/posts/${postId}/comments`, { method: 'POST', body: payload });
}

export async function deletePostComment(postId: number, commentId: number): Promise<void> {
  await apiRequest<unknown>(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
}

export async function togglePostCommentLike(postId: number, commentId: number): Promise<PostLikeToggleRead> {
  return apiRequest<PostLikeToggleRead>(`/posts/${postId}/comments/${commentId}/like`, { method: 'POST' });
}

export async function uploadPostImage(file: File): Promise<UploadResponse> {
  return uploadFile<UploadResponse>('/uploads/post-image', file);
}
