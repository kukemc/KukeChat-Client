import type { MemberRole, User } from './api';

// 群公告 v2，契约见 KukeChat-Server/docs/group-announcements.md

export interface GroupAnnouncementImage {
  url: string;
  thumbnail_url?: string | null;
}

/** `GroupAnnouncementRead`（第 1 节）。旧后端缺的字段在 api/groupAnnouncements.ts 里补成默认值。 */
export interface GroupAnnouncement {
  id: number;
  conversation_id: number;
  author_id: number | null;
  /** 发布人已注销时为 null */
  author: User | null;
  /** 发布人在这个群的群昵称，没有就是昵称 / 用户名 */
  author_display_name: string | null;
  content: string;
  images: GroupAnnouncementImage[];
  pinned: boolean;
  pinned_at: string | null;
  popup: boolean;
  require_confirm: boolean;
  send_to_new_members: boolean;
  guide_nickname: boolean;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  confirmed_count: number;
  member_count: number;
  my_seen: boolean;
  my_confirmed: boolean;
}

/** 发布 / 修改的请求体（2.1）。PATCH 时省略的字段不改。 */
export interface GroupAnnouncementPayload {
  content?: string;
  images?: string[];
  pinned?: boolean;
  popup?: boolean;
  require_confirm?: boolean;
  send_to_new_members?: boolean;
  guide_nickname?: boolean;
}

export type AnnouncementConfirmStatus = 'confirmed' | 'unconfirmed';

export interface AnnouncementConfirmationItem {
  user: User | null;
  nickname: string | null;
  role: MemberRole;
  confirmed_at: string | null;
}

/** 确认统计（第 3 节） */
export interface AnnouncementConfirmations {
  announcement_id: number;
  status: AnnouncementConfirmStatus;
  member_count: number;
  confirmed_count: number;
  unconfirmed_count: number;
  items: AnnouncementConfirmationItem[];
  limit: number;
  offset: number;
  has_more: boolean;
}

/** 聊天里的公告卡片：type = system 且 metadata.system_event = group.announcement.card（第 5 节） */
export interface AnnouncementCardInfo {
  announcementId: number;
  action: 'created' | 'updated';
  summary: string;
  imageUrl: string | null;
  imageThumbnailUrl: string | null;
  imageCount: number;
  authorId: number | null;
  authorName: string;
  requireConfirm: boolean;
  deleted: boolean;
}
