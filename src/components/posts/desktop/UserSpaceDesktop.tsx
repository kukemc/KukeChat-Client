import { type CSSProperties, useState } from 'react';
import { BirthdayToday, useBirthdayFact } from '@/components/birthday/BirthdayBits';
import { SendGiftButton } from '@/components/gifts/GiftEntry';
import { GiftWall } from '@/components/gifts/GiftWall';
import { UserLevelIcons } from '@/components/level/LevelIcons';
import { UserLevelCard } from '@/components/level/UserLevelCard';
import { MyLikesEntry } from '@/components/likes/MyLikesEntry';
import { ProfileLikeButton } from '@/components/likes/ProfileLikeButton';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { Post, User } from '@/types/api';
import { resolveAssetUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { type OpenUserSpace, feedSortTabs, formatCompact, userHandle } from '../postModel';
import { useFriendUsers, useTrendingPostTopics } from '../postQueries';
import { useUserSpace } from '../userSpaceData';
import { PostItem } from './PostItem';
import { ProfileEditor } from './ProfileEditor';
import { UserCardShareDialog } from './ShareDialogs';

interface UserSpaceDesktopProps {
  profileUser: User | null | undefined;
  fallbackId: number;
  currentUser: User;
  /** 正在和别的页做衔接转场：这时它叠在那一页上面，而不是占着版面 */
  overlay?: boolean;
  onClose: () => void;
  onOpenUserSpace: OpenUserSpace;
  onOpenPost: (postId: number) => void;
  onEditPost: (post: Post) => void;
}

/** 某个人的空间：主页头部、资料、Ta 发过的动态。看自己的时候可以改主页。 */
export function UserSpaceDesktop({ profileUser, fallbackId, currentUser, overlay = false, onClose, onOpenUserSpace, onOpenPost, onEditPost }: UserSpaceDesktopProps): JSX.Element {
  const space = useUserSpace({ profileUser, fallbackId, currentUser, onClose });
  const { isSelf, displayUser, displayName, editingProfile } = space;
  const [shareOpen, setShareOpen] = useState(false);
  const friendUsers = useFriendUsers(currentUser.id);
  const topicOptions = useTrendingPostTopics().data ?? [];
  const cover = resolveAssetUrl(space.coverUrl);
  const birthday = useBirthdayFact(displayUser);
  const heroStyle = { '--kpo-accent': space.accent } as CSSProperties;

  return (
    <div className={overlay ? 'kpo-page is-over' : 'kpo-page'}>
      <div className="kpo-main">
        <header className="kpo-bar has-back">
          <button type="button" className="kui-icon-btn" aria-label="返回动态" title="返回动态" onClick={onClose}><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <h1 className="kpo-bar-title">{space.profileTitle}</h1>
          <span className="kpo-bar-space" />
          {displayUser ? <button type="button" className="kui-btn" onClick={() => setShareOpen(true)}><Icon name="send" className="h-3.5 w-3.5" />分享</button> : null}
          {/* 送礼物：从个人空间送不落聊天消息。礼物功能关着、看的是自己或机器人时不出现 */}
          {isSelf ? null : <SendGiftButton user={displayUser} className="kui-btn"><Icon name="gift" className="h-3.5 w-3.5" />送礼物</SendGiftButton>}
          {isSelf
            ? <button type="button" className="kui-btn" onClick={() => space.setEditingProfile((value) => !value)}><Icon name="edit" className="h-3.5 w-3.5" />{editingProfile ? '收起编辑' : '编辑主页'}</button>
            : <button type="button" className="kui-btn kui-btn--primary" disabled={space.friendButtonDisabled} onClick={space.handleFriendAction}><Icon name={space.isFriend ? 'message' : 'userPlus'} className="h-3.5 w-3.5" />{space.friendButtonLabel}</button>}
        </header>

        <div className="kpo-scroll kui-scroll">
          <div className="kpo-space">
            <section className="kpo-block kpo-hero" data-layout={space.profileLayout} data-card={space.profileCardStyle} style={heroStyle}>
              <div className="kpo-hero-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
                <div className="kpo-hero-stats">
                  {space.metricCards.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}
                </div>
              </div>
              <div className="kpo-hero-info">
                <div className="kpo-hero-avatar"><Avatar user={displayUser} label={displayName} size={space.profileLayout === 'compact' ? 'lg' : 'xl'} frame /></div>
                <div className="kpo-hero-text">
                  <div className="kpo-hero-name">
                    <h1>{displayName}</h1>
                    <UserLevelIcons user={displayUser} variant="full" self={isSelf} size={16} />
                    {isSelf ? <span className="kui-tag">我的空间</span> : null}
                    {/* 今天生日：小蛋糕 + 「今天生日」，旁边是送礼入口 */}
                    <BirthdayToday user={displayUser} gift={!isSelf} />
                    {/* 资料点赞（docs/chat-features.md 第 6 节）：别人的是点赞按钮，自己的是总赞数 + 今天的 +N，点了看「谁赞了我」。服务端没有这个功能时不出现 */}
                    {isSelf
                      ? <MyLikesEntry user={displayUser} className="kpo-hero-like" onOpenUser={(target) => onOpenUserSpace(target, target.id)} />
                      : <ProfileLikeButton user={displayUser} className="kpo-hero-like" />}
                  </div>
                  <p className="kpo-hero-handle">{space.profileTitle} · {userHandle(displayUser, fallbackId)}</p>
                  {space.profileTagline || space.profileStatus ? (
                    <div className="kpo-hero-chips">
                      {space.profileTagline ? <span className="kpo-chip">{space.profileTagline}</span> : null}
                      {space.profileStatus ? <span className="kpo-chip is-quiet">{space.profileStatus}</span> : null}
                    </div>
                  ) : null}
                  <p className={`kpo-hero-bio ${space.profileBio ? '' : 'is-empty'}`}>{space.profileBio || (isSelf ? '还没有填写简介' : '这个人还没有写简介')}</p>
                  {space.coverModeration === 'pending' ? <p className="kui-note kui-note--warn">封面审核中，仅自己可见</p> : null}
                  {space.coverModeration === 'rejected' ? <p className="kui-note kui-note--danger">封面审核未通过，请重新上传</p> : null}
                </div>
              </div>
            </section>

            {isSelf && editingProfile ? <ProfileEditor space={space} /> : null}
            {space.friendError ? <p className="kui-note kui-note--danger" role="alert">{space.friendError}</p> : null}

            <div className="kpo-space-grid">
              <aside className="kpo-space-side">
                <section className="kpo-block kpo-card" style={heroStyle}>
                  <h2 className="kpo-card-title">空间名片</h2>
                  <dl className="kpo-facts">
                    <div><dt>状态</dt><dd>{space.profileStatus || (isSelf ? '写一句状态，让主页更有现场感。' : 'Ta 暂时没有写状态。')}</dd></div>
                    {space.profileLocation ? <div><dt>所在地</dt><dd>{space.profileLocation}</dd></div> : null}
                    {birthday ? <div data-birthday="fact"><dt>生日</dt><dd>{birthday}</dd></div> : null}
                    {space.interests.length > 0 ? <div><dt>兴趣</dt><dd>{space.interests.map((item) => <span key={item} className="kpo-chip">{item}</span>)}</dd></div> : null}
                  </dl>
                  {!space.profileLocation && space.interests.length === 0 ? <p className="kpo-hint">{isSelf ? '编辑主页后，这里会展示所在地和兴趣标签。' : '这个人还没有公开更多资料。'}</p> : null}
                </section>

                <UserLevelCard user={displayUser} variant="block" frame={(card) => (
                  <section className="kpo-block kpo-card" data-level="space-card">
                    <h2 className="kpo-card-title">账号等级</h2>
                    {card}
                  </section>
                )} />

                {/* 礼物墙：收到过的礼物按种类摆出来，心意值是小标题旁的一个数字。礼物功能关着时整块不出现 */}
                <GiftWall user={displayUser} isSelf={isSelf} frame={(wall, charm) => (
                  <section className="kpo-block kpo-card" data-gift="space-wall">
                    <div className="kgf-wall-title"><h2 className="kpo-card-title">礼物墙</h2>{charm}</div>
                    {wall}
                  </section>
                )} />

                {space.ccwProfileUrl ? (
                  <section className="kpo-block kpo-card">
                    <div className="kpo-ccw-head">
                      {space.ccwAvatarUrl ? <img src={space.ccwAvatarUrl} alt={displayUser?.ccw_name ?? 'CCW'} /> : <span className="kpo-ccw-mark"><Icon name="ccw" className="h-5 w-5" /></span>}
                      <div className="min-w-0 flex-1">
                        <strong>{displayUser?.ccw_name || '已绑定 CCW'}</strong>
                        <span className="kui-tag kui-tag--accent">CCW</span>
                      </div>
                    </div>
                    <p className="kpo-ccw-bio">{displayUser?.ccw_bio || '这个 CCW 用户暂时没有公开简介。'}</p>
                    <div className="kpo-stats">
                      {space.ccwPrimaryStats.map((stat) => <div key={stat.label}><strong>{formatCompact(stat.value)}</strong>{stat.label}</div>)}
                    </div>
                    <p className="kpo-ccw-more">{space.ccwSecondaryStats.map((stat) => <span key={stat.label}>{stat.label}<b>{formatCompact(stat.value)}</b></span>)}</p>
                    <button type="button" className="kui-btn kui-btn--block" onClick={() => space.ccwProfileUrl && void openExternalUrl(space.ccwProfileUrl)}><Icon name="external" className="h-3.5 w-3.5" />打开 CCW 主页</button>
                  </section>
                ) : null}
              </aside>

              <main className="kpo-space-main">
                <div className="kpo-section-head">
                  <h2>{isSelf ? '我的动态' : 'Ta 的动态'}</h2>
                  <span>共 {space.stats.post_count} 条可见动态</span>
                  <div className="kui-segment" role="radiogroup" aria-label="排序">
                    {feedSortTabs.map((tab) => <button key={tab.value} type="button" role="radio" aria-checked={space.postSort === tab.value} title={tab.description} className={space.postSort === tab.value ? 'is-active' : undefined} onClick={() => space.setPostSort(tab.value)}>{tab.label}</button>)}
                  </div>
                </div>
                {space.postsLoading ? <p className="kpo-block kui-empty kpo-state">正在打开个人主页…</p> : null}
                {!space.postsLoading && space.posts.length === 0 ? <p className="kpo-block kui-empty kpo-state">暂无可见动态，新的动态会展示在这里。</p> : null}
                {space.posts.map((post) => <PostItem key={post.id} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} onOpenUserSpace={onOpenUserSpace} onOpenPost={onOpenPost} onEditPost={onEditPost} />)}
                {space.hasMorePosts ? <button type="button" className="kui-btn kpo-more" onClick={space.loadMorePosts}>加载更多</button> : null}
              </main>
            </div>
          </div>
        </div>
      </div>
      {shareOpen && displayUser ? <UserCardShareDialog user={displayUser} currentUser={currentUser} onClose={() => setShareOpen(false)} /> : null}
    </div>
  );
}
