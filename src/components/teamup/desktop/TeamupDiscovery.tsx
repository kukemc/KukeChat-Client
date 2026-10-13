import { Icon } from '@/components/ui/Icon';
import type { TeamupProfile } from '@/types/api';
import { skillLabel } from '../teamupConstants';
import { formatCountdown, relativePublishedAt } from '../teamupModel';
import type { TeamupCenterState } from '../useTeamupCenter';
import { PersonRow } from './teamupUi';

const RECOMMEND_LABELS = ['最佳匹配', '高潜搭档'];
/** 统计接口还没返回或失败时，数字的位置放这个 */
const PENDING = '—';

function Figure({ label, value, detail }: { label: string; value: string | number; detail: string }): JSX.Element {
  return (
    <div className="ktu-figure">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function Column({ title, hint, action, profiles, label, onOpen }: { title: string; hint: string; action?: JSX.Element; profiles: TeamupProfile[]; label: (profile: TeamupProfile, index: number) => string; onOpen: (profile: TeamupProfile) => void }): JSX.Element {
  return (
    <section className="ktu-column">
      <header className="ktu-section-head">
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        {action}
      </header>
      {profiles.length === 0 ? <p className="ktu-column-empty">暂时没有可以展示的名片</p> : null}
      {profiles.map((profile, index) => <PersonRow key={profile.id} profile={profile} label={label(profile, index)} onOpen={onOpen} />)}
    </section>
  );
}

/** 广场首屏（没有搜索、没有筛选时）：社区概况、按互补程度推荐的人，以及随机 / 最新 / 最热三列。 */
export function TeamupDiscovery({ center }: { center: TeamupCenterState }): JSX.Element {
  const { event, discoveryPool, overview, topSkill, recommendedProfiles, openProfile } = center;
  const others = discoveryPool.some((profile) => !profile.is_self);
  return (
    <>
      <div className="ktu-figures">
        <Figure label="社区名片" value={overview.profileCount ?? PENDING} detail={`${overview.recruitingCount ?? PENDING} 位仍在招募`} />
        <Figure label="技能信号" value={center.totalSkillProfiles} detail={topSkill ? `${skillLabel(topSkill.skill)}最活跃 · ${topSkill.count} 人` : '等待更多技能名片'} />
        <Figure label="探索热度" value={overview.engagement ?? PENDING} detail="浏览与讨论加权热度" />
        <Figure label="赛季进度" value={typeof event?.seconds_remaining === 'number' ? formatCountdown(event.seconds_remaining) : '长期开放'} detail="推荐随时间和互动实时变化" />
      </div>

      {recommendedProfiles.length > 0 ? (
        <section className="ktu-panel ktu-recommend">
          <header className="ktu-section-head">
            <div>
              <h3>此刻值得认识的人</h3>
              <p>综合技能互补、招募状态、发布时间与互动热度动态排序</p>
            </div>
            <span className="ktu-section-aside">每次刷新都会重新计算</span>
          </header>
          <div className="ktu-recommend-grid">
            {recommendedProfiles.map((profile, index) => <PersonRow key={profile.id} profile={profile} label={RECOMMEND_LABELS[index] ?? '动态推荐'} accent={index === 0} onOpen={openProfile} />)}
          </div>
        </section>
      ) : null}

      {others ? (
        <div className="ktu-panel ktu-columns">
          <Column
            title="随机发现"
            hint="跳出算法，遇见意料之外的队友"
            action={<button type="button" className="kui-icon-btn" aria-label="换一批随机推荐" title="换一批" onClick={center.shuffleRandom}><Icon name="recall" className="h-4 w-4" /></button>}
            profiles={center.randomProfiles}
            label={() => '随机相遇'}
            onOpen={openProfile}
          />
          <Column title="刚刚加入" hint="最新发布和更新的招募信号" profiles={center.latestProfiles.slice(0, 3)} label={(profile) => relativePublishedAt(profile.updated_at || profile.created_at)} onOpen={openProfile} />
          <Column title="热度上升" hint="近期浏览与讨论增长更快" profiles={center.hotProfiles.slice(0, 3)} label={(_profile, index) => `热力 TOP ${index + 1}`} onOpen={openProfile} />
        </div>
      ) : null}
    </>
  );
}
