import type { UserCosmetics } from './shop';

export type ConversationType = 'direct' | 'group';
export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';
export type GroupJoinRequestStatus = 'pending' | 'accepted' | 'rejected';
export type JoinMode = 'approval' | 'question' | 'invite_only' | 'open';
export type MemberRole = 'owner' | 'admin' | 'member';
export type MessageSetting = 'notify' | 'silent' | 'ignore';
export type MessageType = 'text' | 'image' | 'sticker' | 'voice' | 'forward_bundle' | 'system' | 'poll' | 'red_packet' | 'gift';
export type MessageSearchCategory = 'all' | 'text' | 'image' | 'sticker' | 'voice' | 'link' | 'forward_bundle' | 'system';
export type MessageSearchMatchType = Exclude<MessageSearchCategory, 'all'>;
export type ReportTargetType = 'message' | 'user' | 'conversation' | 'post';
export type InviteTargetType = 'group' | 'user';
export type PostVisibility = 'public' | 'friends' | 'private';
export type PostFeedScope = 'square' | 'friends' | 'mine';
export type PostFeedSort = 'latest' | 'hot';
export type PostModerationStatus = 'pending' | 'approved' | 'rejected';
export type PostNotificationType = 'like' | 'comment' | 'reply' | 'repost' | 'mention';
export type UnifiedNotificationCategory = 'all' | 'friend' | 'group' | 'post' | 'interact' | 'system';
export type UnifiedNotificationAction = 'friend_request' | 'group_join_request' | 'open_post' | 'open_conversation' | 'open_teamup' | 'open_bot' | 'none';
export type PresenceStatus = 'online' | 'away' | 'busy' | 'dnd' | 'creating' | 'gaming' | 'custom';
export type GroupLeaderboardType = 'activity' | 'level' | 'checkin_streak' | 'checkin_total' | 'message';
export type GroupLeaderboardPeriod = 'today' | 'week' | 'month' | 'all';

export interface User {
  id: number;
  username: string;
  email?: string | null;
  nickname?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  profile_title?: string | null;
  profile_tagline?: string | null;
  profile_status?: string | null;
  profile_location?: string | null;
  profile_interests?: string | null;
  profile_layout?: 'classic' | 'banner' | 'compact' | null;
  profile_card_style?: 'soft' | 'glass' | 'solid' | null;
  profile_accent_color?: string | null;
  profile_cover_url?: string | null;
  profile_cover_pending_url?: string | null;
  profile_cover_moderation_status?: PostModerationStatus;
  ccw_student_oid?: string | null;
  ccw_name?: string | null;
  ccw_avatar_url?: string | null;
  ccw_bio?: string | null;
  ccw_homepage_cover_url?: string | null;
  ccw_following_count?: number | null;
  ccw_follower_count?: number | null;
  ccw_like_count?: number | null;
  ccw_favorite_count?: number | null;
  ccw_comment_count?: number | null;
  ccw_creation_count?: number | null;
  ccw_view_count?: number | null;
  ccw_synced_at?: string | null;
  presence_status?: PresenceStatus | null;
  presence_text?: string | null;
  presence_updated_at?: string | null;
  is_bot?: boolean;
  bot_owner_id?: number | null;
  platform_role?: 'user' | 'admin';
  status?: 'active' | 'disabled';
  banned_until?: string | null;
  ban_reason?: string | null;
  /** 是否向他人显示「我正在输入」，缺省视为 true */
  share_typing?: boolean;
  /** 别人戳我时用的动作（预设里的一个字），缺省视为「戳」 */
  poke_action?: string;
  /** 戳一戳时接在我名字后面的文案，缺省为空 */
  poke_suffix?: string;
  /** 公开展示的风纪委员层级：只有在任、且本人选择公开时才有值（docs/jury-v2.md 2.9） */
  jury_badge?: 'trainee' | 'regular' | 'senior' | null;
  /** 装备着的装扮（docs/shop.md 2.3）：没装备时是 {}，旧后端没有这个字段。里面的 style 要先校验再用 */
  cosmetics?: UserCosmetics | null;
  /** 账号等级（docs/account-level.md），0–256。旧后端没有这个字段，按没有等级处理；画图标前先过 readAccountLevel */
  account_level?: number | null;
  /** 资料累计收到的赞（docs/chat-features.md 第 6 节）。旧后端没有这个字段，按没有资料点赞处理 */
  profile_like_count?: number | null;
  /** 收到礼物累计涨的「心意值」（叫法见 utils/gift.ts）。旧后端没有这个字段，按没有礼物功能处理 */
  charm?: number | null;
  /** 生日：没填是 null；year 只有本人选择公开时才给。用之前过 utils/birthday.ts 的 normalizeBirthday */
  birthday?: { month: number; day: number; year?: number | null } | null;
  /** 今天（北京时间）是不是这个人的生日 */
  is_birthday_today?: boolean;
  created_at?: string;
  updated_at?: string;
}

/** GET /users/poke-options：戳一戳的预设动作和后缀长度上限。 */
export interface PokeOptions {
  actions: string[];
  default_action: string;
  suffix_max_length: number;
}

export interface AuthToken {
  access_token: string;
  token_type?: string;
  user?: User;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface IpLoginStatus {
  client_ip: string;
  registration_ip?: string | null;
  ip_login_expires_at?: string | null;
  ip_login_available: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterPayload extends LoginPayload {
  nickname?: string;
}


export interface PasswordResetRequestPayload {
  username: string;
  ccw_profile_url: string;
  requested_password: string;
  reason: string;
}


export interface AccountLookup {
  exists: boolean;
  ccw_bound: boolean;
}


export interface CcwPasswordChallengeInfo {
  code: string;
  comment_url: string;
  expires_in: number;
}


export interface PasswordResetRequestRead {
  id: number;
  username: string;
  ccw_profile_url: string;
  reason: string;
  status: string;
  created_at: string;
  reviewed_at?: string | null;
  review_note?: string | null;
}

export interface ProfileUpdatePayload {
  nickname?: string;
  avatar_url?: string;
  bio?: string;
  profile_title?: string;
  profile_tagline?: string;
  profile_status?: string;
  profile_location?: string;
  profile_interests?: string;
  profile_layout?: 'classic' | 'banner' | 'compact' | '';
  profile_card_style?: 'soft' | 'glass' | 'solid' | '';
  profile_accent_color?: string;
  profile_cover_url?: string;
  share_typing?: boolean;
  /** 传 null 或空串恢复默认 */
  poke_action?: string | null;
  poke_suffix?: string | null;
}

export interface OnlineCountRead {
  online_count: number;
}

export interface OnlineUsersRead {
  online_count: number;
  users: User[];
}

export interface UserOnlineStatusRead {
  user_id: number;
  online: boolean;
  presence_status?: PresenceStatus | 'offline';
  presence_text?: string | null;
  presence_updated_at?: string | null;
}

export interface UpdatePresencePayload {
  presence_status: PresenceStatus;
  presence_text?: string | null;
}

export interface InviteLinkRead {
  token: string;
  url: string;
  target_type: InviteTargetType;
  target_id: number;
  created_at: string;
}

export interface InviteResolveRead {
  token: string;
  target_type: InviteTargetType;
  target_id: number;
  group?: Conversation | null;
  user?: User | null;
  already_joined?: boolean;
  already_friends?: boolean;
}

export interface InviteAcceptRead {
  target_type: InviteTargetType;
  target_id: number;
  conversation_id?: number | null;
  friend_request_id?: number | null;
  status: string;
}

export interface UploadResponse {
  url: string;
  filename?: string;
  content_type?: string;
  thumbnail_url?: string;
}

export interface CcwCreationPreview {
  oid: string;
  access_key?: string | null;
  url: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  author_name: string;
  author_avatar_url?: string | null;
  author_oid?: string | null;
  view_count?: number | null;
  like_count?: number | null;
  favorite_count?: number | null;
  comment_count?: number | null;
  version?: string | null;
  status?: string | null;
  screen_mode?: string | null;
  keyboard_layout?: string | null;
  updated_at?: number | null;
  tags?: string[];
}

export interface CcwBindingChallenge {
  id: number;
  code: string;
  status: 'pending' | 'verified' | 'expired' | 'conflict' | string;
  subject_oid: string;
  creation_url: string;
  expires_at: string;
  verified_at?: string | null;
  last_checked_at?: string | null;
  matched_student_oid?: string | null;
  matched_name?: string | null;
  matched_avatar_url?: string | null;
}

export interface MessageReactionSummary {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
  users?: User[];
  names?: string[];
  user_names?: string[];
}

export interface MessageQuoteMetadata {
  message_id?: number;
  sender_id?: number;
  sender_name: string;
  preview: string;
  type?: MessageType;
  content?: string;
  created_at?: string;
}

export interface MessageMentionMetadata {
  user_id: number;
  name: string;
}

export interface GroupShareCardMetadata {
  type: 'group';
  conversation_id: number;
  title: string;
  avatar_url?: string | null;
  description?: string | null;
  category?: string | null;
  member_count?: number;
  join_mode?: JoinMode | null;
  auto_approve?: boolean;
  invite_token?: string;
  invite_url?: string;
}

export interface PostShareCardMetadata {
  type: 'post';
  post_id: number;
  author_id: number;
  author_name: string;
  author_avatar_url?: string | null;
  content?: string | null;
  image_urls?: string[];
  ccw_creations?: CcwCreationPreview[];
  created_at?: string;
}

export interface BotShareCardMetadata {
  type: 'bot';
  bot_id: number;
  user_id: number;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  commands?: string | null;
  rating_average?: number | null;
  review_count?: number;
  install_count?: number;
  online?: boolean;
}

export interface UserShareCardMetadata {
  type: 'user';
  user_id: number;
  name: string;
  username?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  profile_title?: string | null;
  profile_tagline?: string | null;
  profile_status?: string | null;
  ccw_name?: string | null;
  ccw_avatar_url?: string | null;
  ccw_student_oid?: string | null;
}

export interface TeamupShareCardMetadata {
  type: 'teamup';
  profile_id: number;
  user_id: number;
  name: string;
  avatar_url?: string | null;
  headline?: string | null;
  status?: TeamupProfileStatus | null;
  skills?: TeamupSkill[];
  looking_for?: TeamupSkill[];
  creation_count?: number;
  cover_url?: string | null;
}

export interface TaskCardAssignee {
  id: number;
  name: string;
  avatar_url?: string | null;
}

export interface TaskShareCardMetadata {
  type: 'task';
  task_id: number;
  conversation_id?: number;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_at?: string | null;
  assignee_count?: number;
  assignees?: TaskCardAssignee[];
  creator_name?: string | null;
}

export interface TaskEventCardMetadata {
  type: TaskEventType;
  task_id: number;
  conversation_id?: number;
  title: string;
  status?: TaskStatus;
  due_at?: string | null;
  actor_name?: string | null;
  user_id?: number;
  fields?: string[];
}

export interface VoiceMessageMetadata {
  duration_ms?: number;
  content_type?: string;
  size?: number;
  waveform?: number[];
}

export type MessageElementType = 'text' | 'markdown' | 'at' | 'at_all' | 'quote' | 'img' | 'audio' | 'sticker' | 'br' | string;

export interface MessageElement {
  type: MessageElementType;
  attrs?: Record<string, unknown>;
  content?: string;
}

export interface MessageComponentState {
  label?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'primary';
  border_color?: string;
  text_color?: string;
  background_color?: string;
  disabled?: boolean;
}

export interface MessageMetadata {
  quote?: MessageQuoteMetadata;
  mentions?: MessageMentionMetadata[];
  mention_all?: boolean;
  markdown?: boolean;
  images?: string[];
  elements?: MessageElement[];
  component_state?: Record<string, MessageComponentState>;
  share_card?: GroupShareCardMetadata | PostShareCardMetadata | BotShareCardMetadata | UserShareCardMetadata | TeamupShareCardMetadata | TaskShareCardMetadata;
  task_event?: TaskEventCardMetadata;
  ccw_creations?: CcwCreationPreview[];
  voice?: VoiceMessageMetadata;
  poll?: import('./polls').Poll;
  /** type 为 red_packet 的消息带的红包信息，只有不会变的字段 */
  red_packet?: import('./redPacket').RedPacketMeta;
  /** type 为 gift 的消息带的礼物信息：谁收、送的什么、留言。用之前过 utils/gift.ts 的 normalizeGiftMeta */
  gift?: import('./gift').GiftMeta;
  [key: string]: unknown;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id?: number;
  sender?: User | null;
  type: MessageType;
  sender_title?: string | null;
  sender_level?: number | null;
  content: string;
  metadata?: MessageMetadata | null;
  created_at: string;
  recalled_at?: string | null;
  recalled_by_id?: number | null;
  bookmarked_by_me?: boolean;
  featured?: boolean;
  reactions?: MessageReactionSummary[];
  sender_display_name?: string | null;
  conversation?: Conversation | null;
}

export interface MessageSearchResult {
  message: Message;
  match_type: MessageSearchMatchType;
  snippet?: string | null;
}

export interface MessageSearchResponse {
  items: MessageSearchResult[];
  total: number;
  limit: number;
  has_more: boolean;
  next_before_id?: number | null;
}

export interface MessageBookmarkToggleRead {
  bookmarked: boolean;
}

export interface MessageFeatureToggleRead {
  featured: boolean;
}

export interface FeaturedMessageRead {
  id: number;
  conversation_id: number;
  message_id: number;
  set_by_id?: number | null;
  set_by?: User | null;
  created_at: string;
  message: Message;
}

export interface BookmarkedMessageRead {
  conversation_id: number;
  conversation?: Conversation | null;
  message: Message;
  created_at?: string;
}

export interface PostComment {
  id: number;
  post_id: number;
  author_id: number;
  author?: User | null;
  parent_id?: number | null;
  parent_author?: User | null;
  content: string;
  moderation_status: PostModerationStatus;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
}

export interface PostTopic {
  id: number;
  name: string;
  post_count: number;
  moderation_status?: PostModerationStatus;
}

export interface PostLike {
  id: number;
  post_id: number;
  user_id: number;
  user?: User | null;
  created_at: string;
}

export interface Post {
  id: number;
  author_id: number;
  author?: User | null;
  content: string;
  ccw_creations?: CcwCreationPreview[];
  visibility: PostVisibility;
  moderation_status: PostModerationStatus;
  image_urls: string[];
  repost_of_id?: number | null;
  repost_of?: PostReference | null;
  pinned_at?: string | null;
  topics?: PostTopic[];
  created_at: string;
  updated_at: string;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  recent_likes?: User[];
  recent_comments?: PostComment[];
}

export interface PostReference {
  id: number;
  author_id: number;
  author?: User | null;
  content: string;
  ccw_creations?: CcwCreationPreview[];
  visibility: PostVisibility;
  moderation_status: PostModerationStatus;
  image_urls: string[];
  pinned_at?: string | null;
  topics?: PostTopic[];
  created_at: string;
  updated_at: string;
}

export interface PostStats {
  post_count: number;
  like_count: number;
  comment_count: number;
}

export interface CreatePostPayload {
  content: string;
  visibility: PostVisibility;
  image_urls: string[];
  repost_of_id?: number | null;
  mention_user_ids?: number[];
  topic_names?: string[];
}

export interface CreatePostCommentPayload {
  content: string;
  parent_id?: number | null;
  mention_user_ids?: number[];
}

export interface UpdatePostPayload {
  content?: string;
  visibility?: PostVisibility;
  image_urls?: string[];
  mention_user_ids?: number[];
  topic_names?: string[];
}

export interface PostNotification {
  id: number;
  recipient_id: number;
  actor_id: number;
  actor?: User | null;
  post_id: number;
  comment_id?: number | null;
  type: PostNotificationType;
  read_at?: string | null;
  created_at: string;
  post?: PostReference | null;
  comment?: PostComment | null;
}

export interface PostNotificationList {
  items: PostNotification[];
  unread_count: number;
}

export interface UnifiedNotification {
  id: string;
  category: UnifiedNotificationCategory;
  type: string;
  title: string;
  body?: string | null;
  time: string;
  unread: boolean;
  pending: boolean;
  actor?: User | null;
  conversation_id?: number | null;
  conversation_title?: string | null;
  conversation_avatar_url?: string | null;
  post_id?: number | null;
  friend_request_id?: number | null;
  group_join_request_id?: number | null;
  action: UnifiedNotificationAction;
  payload?: Record<string, unknown>;
}

export interface UnifiedNotificationList {
  items: UnifiedNotification[];
  /** 兼容旧字段，和 new_count 相同 */
  unread_count: number;
  pending_count: number;
  counts: Record<string, number>;
  /** 上次打开通知中心的时间（POST /notifications/seen），从没打开过为 null */
  seen_at?: string | null;
  /** 角标数：seen_at 之后来的非动态通知 + 未读动态通知 */
  new_count?: number;
}

export interface PostLikeToggleRead {
  liked: boolean;
  like_count: number;
}

export type TeamupSkill = 'program' | 'art' | 'design' | 'music' | 'writing' | 'test' | 'other';
export type TeamupSkillLevel = 'beginner' | 'skilled' | 'expert';
export type TeamupProfileStatus = 'recruiting' | 'closed';
export type TeamupProfileScope = 'square' | 'mine';

export interface TeamupSkillItem {
  skill: TeamupSkill;
  level: TeamupSkillLevel;
}

export interface TeamupComment {
  id: number;
  profile_id: number;
  author_id: number;
  author?: User | null;
  parent_id?: number | null;
  parent_author?: User | null;
  content: string;
  moderation_status: PostModerationStatus;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
}

export interface TeamupProfile {
  id: number;
  user_id: number;
  author?: User | null;
  event_id?: number | null;
  headline: string;
  intro: string;
  skills: TeamupSkillItem[];
  looking_for: TeamupSkill[];
  image_urls: string[];
  background_url?: string | null;
  ccw_creations?: CcwCreationPreview[];
  contact_note?: string | null;
  status: TeamupProfileStatus;
  moderation_status: PostModerationStatus;
  view_count: number;
  pinned_at?: string | null;
  created_at: string;
  updated_at: string;
  comment_count: number;
  recent_comments?: TeamupComment[];
  is_friend: boolean;
  is_self: boolean;
}

export interface TeamupEvent {
  id: number;
  title: string;
  theme: string;
  cover_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
  seconds_remaining?: number | null;
  profile_count: number;
  recruiting_count: number;
  total_profile_count: number;
  total_recruiting_count: number;
}

export interface CcwCreator extends Pick<User, 'id' | 'username' | 'nickname' | 'avatar_url' | 'bio' | 'profile_title' | 'profile_tagline' | 'profile_cover_url' | 'ccw_student_oid' | 'ccw_name' | 'ccw_avatar_url' | 'ccw_bio' | 'ccw_homepage_cover_url' | 'ccw_following_count' | 'ccw_follower_count' | 'ccw_like_count' | 'ccw_creation_count' | 'ccw_view_count' | 'ccw_synced_at'> {
  ccw_student_oid: string;
  ccw_follower_count: number;
}

export interface CcwCreatorPage {
  items: CcwCreator[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface HomeStats {
  registered_users: number;
  messages: number;
  messages_last_7_days: number;
  groups: number;
  public_groups: number;
  public_posts: number;
  friendships: number;
  post_likes: number;
}

export interface HomeGroup extends Conversation {
  recent_message_count: number;
  heat_score: number;
}

export interface HomeData {
  stats: HomeStats;
  groups: HomeGroup[];
  creators: CcwCreator[];
  creator_total: number;
  recommendation_seed: number;
}

export interface AccountSuspension {
  code: 'account_suspended';
  reason?: string | null;
  banned_until?: string | null;
  permanent: boolean;
  /** 密码登录被拒时才有：30 分钟内可用它查看处罚并申诉 */
  appeal_token?: string | null;
}

export interface TeamupSkillStat {
  skill: TeamupSkill;
  count: number;
}

/** 组队广场的统计，有没有进行中的赛季都返回。 */
export interface TeamupStats {
  /** 广场当前在展示的那一批（有赛季是本赛季的名片，没赛季是不属于任何赛季的），和广场列表、技能统计同一个范围 */
  profile_count: number;
  recruiting_count: number;
  /** 以下是全部赛季合计，只算未删除、已通过审核的 */
  total_profile_count: number;
  total_recruiting_count: number;
  total_view_count: number;
  total_comment_count: number;
}

export interface TeamupCommentToggleRead {
  liked: boolean;
  like_count: number;
}

export interface SaveTeamupProfilePayload {
  headline: string;
  intro: string;
  skills: TeamupSkillItem[];
  looking_for: TeamupSkill[];
  image_urls: string[];
  background_url?: string | null;
  contact_note?: string | null;
  status: TeamupProfileStatus;
}

export interface CreateTeamupCommentPayload {
  content: string;
  parent_id?: number | null;
}

export interface UpsertTeamupEventPayload {
  title: string;
  theme: string;
  cover_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active: boolean;
}

export interface CreateReportPayload {
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  description?: string;
  /** 与 description 同义，新接口用这个名字 */
  details?: string;
  conversation_id?: number;
  message_id?: number;
  reported_user_id?: number;
  attachments?: string[];
  /** 举报用户时选中的证据消息 */
  evidence_message_ids?: number[];
}

export interface ReportRead {
  id: number;
  reporter_id?: number | null;
  target_type: ReportTargetType;
  target_id: number;
  reason: string;
  description?: string | null;
  details?: string | null;
  attachments?: string[];
  conversation_id?: number | null;
  message_id?: number | null;
  reported_user_id?: number | null;
  evidence_hash?: string | null;
  status?: string;
  review_note?: string | null;
  action?: string | null;
  reviewed_at?: string | null;
  created_at?: string;
  case_id?: number | null;
  /** 结案后给举报人看的结果，未结案时为 null */
  result_title?: string | null;
  result_text?: string | null;
  /** 风纪 v2 三期（docs/jury-v2.md 3.7）：现在能不能对「不违规」的结论申请复议；后端没有复议能力时没有这两个字段 */
  can_reconsider?: boolean;
  /** none / pending 复议中 / upheld 维持原结论 / overturned 改判为违规 */
  reconsider_status?: 'none' | 'pending' | 'upheld' | 'overturned' | (string & {}) | null;
}

export interface ConversationMember {
  id: number;
  conversation_id: number;
  user_id: number;
  role: MemberRole;
  joined_at?: string;
  last_read_message_id?: number | null;
  last_read_at?: string | null;
  muted?: boolean;
  muted_until?: string | null;
  nickname?: string | null;
  remark?: string | null;
  title?: string | null;
  pinned?: boolean;
  do_not_disturb?: boolean;
  message_setting?: MessageSetting | null;
  cleared_before_message_id?: number | null;
  level?: number;
  level_exp?: number;
  next_level_exp?: number;
  activity_score?: number;
  total_checkins?: number;
  current_checkin_streak?: number;
  best_checkin_streak?: number;
  last_checkin_date?: string | null;
  last_active_at?: string | null;
  user?: User | null;
}

export interface GroupCheckin {
  id: number;
  conversation_id: number;
  user_id: number;
  user?: User | null;
  checkin_date: string;
  streak_days: number;
  exp_awarded: number;
  message?: string | null;
  created_at: string;
}

export interface GroupCheckinStatus {
  conversation_id: number;
  checked_in_today: boolean;
  today_checkin?: GroupCheckin | null;
  total_checkins: number;
  current_streak: number;
  best_streak: number;
  level: number;
  level_exp: number;
  next_level_exp: number;
}

export interface GroupLeaderboardItem {
  rank: number;
  user_id: number;
  user: User;
  member: ConversationMember;
  level: number;
  level_exp: number;
  activity_score: number;
  total_checkins: number;
  current_checkin_streak: number;
  best_checkin_streak: number;
  message_count: number;
  checkin_count: number;
}

export interface GroupLeaderboard {
  conversation_id: number;
  type: GroupLeaderboardType;
  period: GroupLeaderboardPeriod;
  items: GroupLeaderboardItem[];
  my_rank?: GroupLeaderboardItem | null;
}

export interface GroupAnnouncement {
  id: number;
  conversation_id: number;
  author_id: number | null;
  author?: User | null;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskScope = 'assigned' | 'watching' | 'created' | 'all';
export type TaskEventType =
  | 'assigned'
  | 'assignee_added'
  | 'assignee_removed'
  | 'completed'
  | 'reopened'
  | 'updated'
  | 'due_changed'
  | 'due_reminder'
  | 'due_soon'
  | 'remind';
export type TaskCreationPermission = 'members' | 'admins';

export interface TaskGroup {
  id: number;
  name: string;
  sort_order?: number;
  created_at?: string;
}

export interface Task {
  id: number;
  conversation_id: number;
  conversation_title?: string | null;
  creator_id: number;
  creator?: User | null;
  group_id?: number | null;
  group_name?: string | null;
  parent_id?: number | null;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  start_at?: string | null;
  due_at?: string | null;
  remind_at?: string | null;
  completed_at?: string | null;
  sort_order?: number;
  assignees: User[];
  watchers: User[];
  subtask_total?: number;
  subtask_done?: number;
  comment_count?: number;
  created_at: string;
  updated_at: string;
  is_creator?: boolean;
  is_assignee?: boolean;
  is_watcher?: boolean;
  can_edit?: boolean;
}

export interface TaskActivity {
  id: number;
  task_id: number;
  task_title?: string | null;
  actor?: User | null;
  type: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  author?: User | null;
  content: string;
  created_at: string;
}

export interface TaskDashboard {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  due_today: number;
  due_soon: number;
}

export interface CreateTaskPayload {
  conversation_id: number;
  title: string;
  description?: string;
  group_id?: number | null;
  parent_id?: number | null;
  priority?: TaskPriority;
  start_at?: string | null;
  due_at?: string | null;
  remind_at?: string | null;
  assignee_ids?: number[];
  watcher_ids?: number[];
  send_to_conversation?: boolean;
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  list_id?: number;
  priority?: TaskPriority;
  status?: TaskStatus;
  start_at?: string | null;
  due_at?: string | null;
  remind_at?: string | null;
  assignee_ids?: number[];
  watcher_ids?: number[];
  sort_order?: number;
  clear_start_at?: boolean;
  clear_due_at?: boolean;
  clear_remind_at?: boolean;
  clear_list?: boolean;
}

/** 公告下面的一种回应。只有数量，不展示是谁回应的。 */
export interface AnnouncementReaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

/** 回应 / 取消回应之后服务端给的最新状态。 */
export interface AnnouncementReactionState {
  id: number;
  reactions: AnnouncementReaction[];
}

/** `GET /announcements/reaction-options`：快捷回应和各项上限。 */
export interface AnnouncementReactionOptions {
  quick: string[];
  per_user: number;
  per_announcement: number;
  per_minute: number;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  cover_url?: string | null;
  is_active?: boolean;
  pinned?: boolean;
  author?: User | null;
  /** 按数量从多到少。还没上这个功能的服务端不带这个字段，按空数组处理 */
  reactions?: AnnouncementReaction[];
  created_at: string;
  updated_at: string;
}

export interface LevelTitleTier {
  min_level: number;
  title: string;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  title?: string | null;
  display_title?: string | null;
  avatar_url?: string | null;
  description?: string | null;
  category?: string | null;
  direct_key?: string | null;
  announcement?: string | null;
  all_muted?: boolean;
  slow_mode_seconds?: number;
  message_rate_limit_per_minute?: number;
  join_mode?: JoinMode | null;
  auto_approve?: boolean;
  join_question?: string | null;
  tasks_enabled?: boolean;
  task_creation_permission?: TaskCreationPermission;
  is_temporary?: boolean;
  temporary_initiator_id?: number | null;
  temporary_target_id?: number | null;
  is_friend?: boolean;
  join_request_status?: GroupJoinRequestStatus | null;
  created_by_id?: number | null;
  created_at?: string;
  updated_at?: string;
  unread_count?: number;
  /** 我在这个会话里读到的最后一条消息（成员表上的 last_read_message_id）。聊天区据此精确定位「以下是新消息」；后端没给时退回按 unread_count 从末尾往前数 */
  last_read_message_id?: number | null;
  member_count?: number;
  last_message?: Message | null;
  members?: ConversationMember[];
  direct_user?: User | null;
  my_role?: MemberRole;
  my_nickname?: string | null;
  my_remark?: string | null;
  my_pinned?: boolean;
  my_do_not_disturb?: boolean;
  my_message_setting?: MessageSetting | null;
  pending_join_request_count?: number;
  /** 我未读的消息里有没有 @我：me 有人点名 @我；all 没有点名、但有 @全体成员；null 都没有。自己发的不算，读过之后变回 null。旧后端没有这个字段，按 null */
  mention_pending?: 'me' | 'all' | null;
  /** 这个会话里有我还能领的红包（active、没过期、我没领过、不是私聊里我自己发的）。旧后端没有这个字段，按 false */
  red_packet_pending?: boolean;
  /** 是否在昵称旁显示等级头衔。由群主/管理员开启 */
  level_titles_enabled?: boolean;
  /** 生效的等级头衔分档，按 min_level 升序；群没自定义时是服务端的默认分档 */
  level_titles?: LevelTitleTier[];
  joined?: boolean;
  /** 群升级的有效档位（记录的档位已过期就是 free）。私聊恒为 free；旧后端没有这个字段，按 free */
  plus_tier?: import('./groupPlus').GroupPlusTier;
  /** 档位到期时间；免费为 null */
  plus_expires_at?: string | null;
  /** 永久档位（后台给的，plus_expires_at 是 2999 年的哨兵值）；旧后端没有这个字段，按到期年份判断（tier.ts 的 isPermanentPlus） */
  plus_permanent?: boolean;
  /** 群文件默认保留时长（小时）：24 / 168 / 720 */
  file_default_ttl_hours?: number;
  /** 群待办；没有为 null。旧后端没有这个字段，按 null */
  group_todo?: import('./groupPlus').GroupTodo | null;
}

export interface Bot {
  id: number;
  user_id: number;
  owner_id: number;
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  functions?: string | null;
  commands?: string | null;
  is_public: boolean;
  status: 'active' | 'disabled' | string;
  created_at: string;
  updated_at: string;
  user?: User | null;
  owner?: User | null;
  online?: boolean;
  rating_average?: number | null;
  review_count?: number;
  install_count?: number;
  my_review?: BotReview | null;
}

export interface BotSquareStats {
  total_bots: number;
  online_bots: number;
  installed_groups: number;
  total_installs: number;
  total_reviews: number;
}

export interface BotSquarePage {
  items: Bot[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
  stats: BotSquareStats;
}

export interface BotDashboardMetrics {
  total_sent_messages: number;
  total_received_messages: number;
  today_sent_messages: number;
  today_received_messages: number;
  active_installs: number;
  disabled_installs: number;
  installed_groups: number;
  total_members_reached: number;
  review_count: number;
  rating_average?: number | null;
  reaction_count: number;
}

export interface BotDashboardTrendPoint {
  date: string;
  sent: number;
  received: number;
}

export interface BotDashboardRatingBucket {
  rating: number;
  count: number;
}

export interface BotDashboardInstallation {
  conversation_id: number;
  title: string;
  avatar_url?: string | null;
  enabled: boolean;
  receive_messages: boolean;
  receive_member_events: boolean;
  installed_at: string;
  updated_at: string;
  sent_messages: number;
  received_messages: number;
  member_count: number;
}

export interface BotDashboard {
  bot: Bot;
  metrics: BotDashboardMetrics;
  trend: BotDashboardTrendPoint[];
  rating_distribution: BotDashboardRatingBucket[];
  installations: BotDashboardInstallation[];
}

export interface BotReview {
  id: number;
  bot_id: number;
  user_id: number;
  rating: number;
  content?: string | null;
  moderation_status?: PostModerationStatus;
  created_at: string;
  updated_at: string;
  user?: User | null;
  like_count: number;
  liked_by_me: boolean;
  replies: BotReviewReply[];
}

export interface BotReviewReply {
  id: number;
  review_id: number;
  user_id: number;
  parent_id?: number | null;
  parent_author?: User | null;
  content: string;
  moderation_status?: PostModerationStatus;
  created_at: string;
  updated_at: string;
  user?: User | null;
  like_count: number;
  liked_by_me: boolean;
}

export interface BotCreateRead {
  bot: Bot;
  key: string;
}

export interface BotInstallation {
  id: number;
  bot_id: number;
  conversation_id: number;
  installed_by_id?: number | null;
  enabled: boolean;
  receive_messages: boolean;
  receive_member_events: boolean;
  created_at: string;
  updated_at: string;
  bot?: Bot | null;
}

export interface BotPayload {
  name: string;
  avatar_url?: string | null;
  description?: string | null;
  functions?: string | null;
  commands?: string | null;
  is_public?: boolean;
}

export interface GroupJoinRequest {
  id: number;
  conversation_id: number;
  conversation_title?: string | null;
  conversation_display_title?: string | null;
  conversation_avatar_url?: string | null;
  conversation_member_count?: number;
  requester_id: number;
  reviewer_id?: number | null;
  status: GroupJoinRequestStatus;
  message?: string | null;
  answer?: string | null;
  decision_note?: string | null;
  created_at: string;
  updated_at: string;
  requester?: User | null;
  reviewer?: User | null;
}

export interface FriendRequest {
  id: number;
  requester_id: number;
  receiver_id: number;
  status: FriendRequestStatus;
  created_at?: string;
  updated_at?: string;
  requester?: User | null;
  receiver?: User | null;
}

export interface Friendship {
  id?: number;
  user_id?: number;
  friend_id?: number;
  created_at?: string;
  user: User;
  friend?: User | null;
}

export interface TemporaryConversationBlock {
  id: number;
  blocked_user_id: number;
  blocked_user: User;
  created_at: string;
}

export interface CreateGroupPayload {
  title: string;
  member_ids: number[];
}

export interface CreateDirectPayload {
  user_id: number;
  temporary?: boolean;
}

export interface CreateGroupAnnouncementPayload {
  content: string;
  pinned?: boolean;
}

export interface UpdateGroupAnnouncementPayload {
  content: string;
  pinned?: boolean;
}

export interface UpdateConversationProfilePayload {
  title?: string;
  avatar_url?: string;
  description?: string;
  category?: string | null;
}

export interface UpdateGroupSettingsPayload {
  all_muted?: boolean;
  slow_mode_seconds?: number;
  message_rate_limit_per_minute?: number;
  join_mode?: JoinMode;
  auto_approve?: boolean;
  join_question?: string | null;
  tasks_enabled?: boolean;
  task_creation_permission?: TaskCreationPermission;
  level_titles_enabled?: boolean;
  /** 整体替换；传空数组恢复默认分档 */
  level_titles?: LevelTitleTier[];
  /** 群文件默认保留时长（小时），只能是 24 / 168 / 720，只影响之后上传的文件 */
  file_default_ttl_hours?: number;
}

export interface UpdateMyConversationSettingsPayload {
  nickname?: string;
  remark?: string;
  pinned?: boolean;
  do_not_disturb?: boolean;
  message_setting?: MessageSetting;
}

export interface CreateGroupJoinRequestPayload {
  message?: string;
  answer?: string;
}

export interface GroupJoinRequestDecisionPayload {
  decision_note?: string;
}
