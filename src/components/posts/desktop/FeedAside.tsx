import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import type { PostTopic, User } from '@/types/api';
import { useUserPostStats } from '../postQueries';

/** 帖子流右边的侧栏：自己的概况、热门话题、几句发布须知。 */
export function FeedAside({ currentUser, topics, selectedTopic, onSelectTopic, onOpenMySpace }: { currentUser: User; topics: PostTopic[]; selectedTopic: string | null; onSelectTopic: (topic: string) => void; onOpenMySpace: () => void }): JSX.Element {
  const stats = useUserPostStats(currentUser.id);

  return (
    <aside className="kpo-aside kui-scroll">
      <section className="kpo-block kpo-card">
        <div className="kpo-me">
          <Avatar user={currentUser} size="lg" />
          <div className="kpo-me-text">
            <strong>{getDisplayName(currentUser)}</strong>
            <span>{currentUser.bio || '还没有填写空间签名'}</span>
          </div>
        </div>
        <div className="kpo-stats">
          <div><strong>{stats.post_count}</strong>动态</div>
          <div><strong>{stats.like_count}</strong>获赞</div>
          <div><strong>{stats.comment_count}</strong>评论</div>
        </div>
        <button type="button" className="kui-btn kui-btn--block" onClick={onOpenMySpace}>进入我的空间</button>
      </section>

      <section className="kpo-block kpo-card">
        <h2 className="kpo-card-title">热门话题</h2>
        {topics.length === 0 ? <p className="kpo-tips">还没有热门话题</p> : topics.map((topic, index) => (
          <button key={topic.id} type="button" aria-pressed={selectedTopic === topic.name} className={`kpo-topic ${index < 3 ? 'is-top' : ''} ${selectedTopic === topic.name ? 'is-active' : ''}`} onClick={() => onSelectTopic(topic.name)}>
            <span className="kpo-topic-rank">{index + 1}</span>
            <span className="kpo-clip">#{topic.name}</span>
            <span className="kpo-topic-count">{topic.post_count}</span>
          </button>
        ))}
      </section>

      <section className="kpo-block kpo-card">
        <h2 className="kpo-card-title">发布须知</h2>
        <div className="kpo-tips">
          <p>公开动态会展示在广场中。</p>
          <p>好友可见只会出现在好友动态里。</p>
          <p>审核通过后，其他用户才能互动。</p>
        </div>
      </section>
    </aside>
  );
}
