import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getPost } from '@/api/posts';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { CcwCreator, Post, User } from '@/types/api';
import { creatorAsUser } from '../ccwCreatorsData';
import { feedSortTabs, feedTabs } from '../postModel';
import { useFriendUsers, usePostFeedState, usePostNotifications, useTrendingPostTopics } from '../postQueries';
import { CcwCreatorsView } from './CcwCreatorsDesktop';
import { ComposerDialog } from './ComposerDialog';
import { prefersReducedMotion } from './creators/motion';
import { playSpaceTransition } from './creators/spaceTransition';
import { FeedAside } from './FeedAside';
import { NotificationsDialog } from './FeedDialogs';
import { PostItem } from './PostItem';
import { UserSpaceDesktop } from './UserSpaceDesktop';

/**
 * 桌面端的动态页。
 *
 * 帖子流是底下常驻的一页；个人空间、大佬入住是盖在它上面的整页。盖住的时候帖子流只是藏起来，
 * 不卸载，所以返回时还停在原来滚到的地方。
 */
export function PostsDesktop({ currentUser }: { currentUser: User }): JSX.Element {
  const pendingUserSpaceId = useKukeStore((state) => state.pendingUserSpaceId);
  const pendingPostId = useKukeStore((state) => state.pendingPostId);
  const clearPendingUserSpace = useKukeStore((state) => state.clearPendingUserSpace);
  const clearPendingPost = useKukeStore((state) => state.clearPendingPost);
  const feed = usePostFeedState();
  const { scope, feedSort, selectedTopic, feedQuery, posts } = feed;
  const [composer, setComposer] = useState<{ editing: Post | null } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [creatorsOpen, setCreatorsOpen] = useState(false);
  // creatorId：这个空间是从大佬入住的哪张卡片点进来的，返回时要收回到那张卡片上
  const [spaceTarget, setSpaceTarget] = useState<{ user: User | null | undefined; fallbackId: number; creatorId?: number } | null>(null);
  // 名单页和主页之间的衔接转场正在播：这期间两页同时在场
  const [transit, setTransit] = useState<'open' | 'close' | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const topicOptions = useTrendingPostTopics().data ?? [];
  const unreadCount = usePostNotifications(10).data?.unread_count ?? 0;
  const friendUsers = useFriendUsers(currentUser.id);

  function openUserSpace(user: User | null | undefined, fallbackId: number): void {
    setSpaceTarget({ user: user ?? null, fallbackId });
  }

  /** 从大佬入住点一张卡片：卡片的题图和头像飞到主页上对应的位置。 */
  function openCreator(creator: CcwCreator, card: HTMLElement): void {
    const root = rootRef.current;
    if (!root || transit || prefersReducedMotion()) {
      openUserSpace(creatorAsUser(creator), creator.id);
      return;
    }
    flushSync(() => {
      setTransit('open');
      setSpaceTarget({ user: creatorAsUser(creator), fallbackId: creator.id, creatorId: creator.id });
    });
    void playSpaceTransition(root, card, 'open').then((cleanup) => {
      flushSync(() => setTransit(null));
      cleanup();
    });
  }

  function closeUserSpace(): void {
    const root = rootRef.current;
    const card = spaceTarget?.creatorId && creatorsOpen ? root?.querySelector<HTMLElement>(`[data-creator-id="${spaceTarget.creatorId}"]`) ?? null : null;
    if (!root || !card || transit || prefersReducedMotion()) {
      setSpaceTarget(null);
      return;
    }
    // 原路返回：先让名单页回到主页底下，再把封面和头像收回那张卡片
    flushSync(() => setTransit('close'));
    void playSpaceTransition(root, card, 'close').then((cleanup) => {
      flushSync(() => {
        setTransit(null);
        setSpaceTarget(null);
      });
      cleanup();
    });
  }

  /** 跳到某条动态：回到帖子流，不在当前这页里就单独取回来顶在最前面，然后滚过去描一圈。 */
  async function openPost(postId: number): Promise<void> {
    feed.clearOpenPostError();
    setSpaceTarget(null);
    setCreatorsOpen(false);
    if (!posts.some((post) => post.id === postId)) {
      try {
        feed.setPinnedPost(await getPost(postId));
      } catch {
        feed.showOpenPostError();
        return;
      }
    }
    feed.focusPost(postId);
  }

  // 别处（名片、聊天里的分享卡片、通知）要求打开某人的空间或某条动态
  useEffect(() => {
    if (!pendingUserSpaceId) {
      return;
    }
    setSpaceTarget({ user: null, fallbackId: pendingUserSpaceId });
    clearPendingUserSpace(pendingUserSpaceId);
  }, [clearPendingUserSpace, pendingUserSpaceId]);

  useEffect(() => {
    if (!pendingPostId) {
      return;
    }
    void openPost(pendingPostId);
    clearPendingPost(pendingPostId);
    // 只在收到新的跳转请求时执行，所以 openPost 不进依赖
  }, [clearPendingPost, pendingPostId]);

  const covered = Boolean(spaceTarget) || creatorsOpen;

  return (
    <section ref={rootRef} className="kpo">
      <div className="kpo-page" hidden={covered}>
        <div className="kpo-main">
          <header className="kpo-bar">
            <nav className="kpo-tabs" aria-label="动态分区">
              {feedTabs.map((tab) => <button key={tab.scope} type="button" title={tab.description} aria-current={scope === tab.scope ? 'page' : undefined} className={`kpo-tab ${scope === tab.scope ? 'is-active' : ''}`} onClick={() => feed.selectScope(tab.scope)}>{tab.label}</button>)}
              <button type="button" className="kpo-tab" onClick={() => setCreatorsOpen(true)}><Icon name="sparkles" />大佬入住</button>
            </nav>
            <span className="kpo-bar-space" />
            <div className="kui-segment" role="radiogroup" aria-label="排序">
              {feedSortTabs.map((tab) => <button key={tab.value} type="button" role="radio" aria-checked={feedSort === tab.value} title={tab.description} className={feedSort === tab.value ? 'is-active' : undefined} onClick={() => feed.selectSort(tab.value)}>{tab.label}</button>)}
            </div>
            <button type="button" className="kui-icon-btn kpo-bell" aria-label="动态互动" title="动态互动" onClick={() => setNotificationsOpen(true)}>
              <Icon name="bell" className="h-4 w-4" />
              {unreadCount > 0 ? <span className="kui-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
            </button>
            <button type="button" className="kui-btn kui-btn--primary" onClick={() => setComposer({ editing: null })}><Icon name="plus" className="h-3.5 w-3.5" />发布动态</button>
          </header>

          <div className="kpo-scroll kui-scroll">
            <div className="kpo-column">
              {selectedTopic ? (
                <div className="kpo-filter">
                  <strong>#{selectedTopic}</strong>
                  <span>话题下的动态</span>
                  <button type="button" className="kui-btn kui-btn--sm" onClick={() => feed.selectTopic(null)}><Icon name="close" className="h-3 w-3" />退出话题</button>
                </div>
              ) : null}
              <button type="button" className="kpo-block kpo-entry" onClick={() => setComposer({ editing: null })}>
                <Avatar user={currentUser} size="sm" />
                <span className="kpo-entry-field">分享你的新鲜事…</span>
                <Icon name="image" className="h-[18px] w-[18px]" />
              </button>
              {feed.openPostError ? <p className="kui-note kui-note--warn" role="alert">{feed.openPostError}</p> : null}
              {feedQuery.isLoading ? <p className="kpo-block kui-empty kpo-state">正在加载动态…</p> : null}
              {!feedQuery.isLoading && posts.length === 0 ? <p className="kpo-block kui-empty kpo-state">这里还没有动态，发一条点亮空间吧</p> : null}
              {posts.map((post) => <PostItem key={post.id} post={post} currentUser={currentUser} friendUsers={friendUsers} topicOptions={topicOptions} highlighted={feed.focusedPostId === post.id} onPostRef={feed.setPostRef} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} onEditPost={(target) => setComposer({ editing: target })} onSelectTopic={feed.selectTopic} />)}
              {feedQuery.hasNextPage ? <button type="button" className="kui-btn kpo-more" disabled={feedQuery.isFetchingNextPage} onClick={() => void feedQuery.fetchNextPage()}>{feedQuery.isFetchingNextPage ? '正在加载…' : '加载更多'}</button> : null}
            </div>
          </div>
        </div>
        <FeedAside currentUser={currentUser} topics={topicOptions} selectedTopic={selectedTopic} onSelectTopic={feed.selectTopic} onOpenMySpace={() => openUserSpace(currentUser, currentUser.id)} />
      </div>

      {spaceTarget ? (
        <UserSpaceDesktop
          key={spaceTarget.fallbackId}
          profileUser={spaceTarget.user}
          fallbackId={spaceTarget.fallbackId}
          currentUser={currentUser}
          overlay={transit !== null}
          onClose={closeUserSpace}
          onOpenUserSpace={openUserSpace}
          onOpenPost={(postId) => void openPost(postId)}
          onEditPost={(post) => {
            setSpaceTarget(null);
            setComposer({ editing: post });
          }}
        />
      ) : null}
      {creatorsOpen ? <CcwCreatorsView hidden={Boolean(spaceTarget) && transit === null} onBack={() => setCreatorsOpen(false)} onOpenUserSpace={openUserSpace} onOpenCreator={openCreator} /> : null}

      {composer ? <ComposerDialog key={composer.editing?.id ?? 'new'} currentUser={currentUser} editingPost={composer.editing} onClose={() => setComposer(null)} /> : null}
      {notificationsOpen ? <NotificationsDialog onClose={() => setNotificationsOpen(false)} onOpenUserSpace={openUserSpace} onOpenPost={(postId) => void openPost(postId)} /> : null}
    </section>
  );
}
