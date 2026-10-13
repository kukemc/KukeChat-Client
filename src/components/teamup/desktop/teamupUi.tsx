import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { TeamupProfile, TeamupProfileStatus, TeamupSkill } from '@/types/api';
import { skillMeta } from '../teamupConstants';
import { profileUser } from '../teamupModel';

export function statusLabel(status: TeamupProfileStatus): string {
  return status === 'recruiting' ? '招募中' : '已满员';
}

export function moderationLabel(status: TeamupProfile['moderation_status']): string {
  return status === 'approved' ? '已通过' : status === 'pending' ? '审核中' : '未通过';
}

/** 名片的状态标记。审核没过的优先显示审核状态，别人看不到这张名片时招募状态没有意义。 */
export function StatusTag({ profile }: { profile: TeamupProfile }): JSX.Element {
  if (profile.moderation_status === 'pending') {
    return <span className="kui-tag kui-tag--warn">审核中</span>;
  }
  if (profile.moderation_status === 'rejected') {
    return <span className="kui-tag kui-tag--danger">未通过</span>;
  }
  return profile.status === 'closed' ? <span className="kui-tag">已满员</span> : <span className="kui-tag kui-tag--ok">招募中</span>;
}

/** 一个技能方向：图标 + 名称，后面可以跟熟练度之类的补充。 */
export function SkillTag({ skill, suffix, outlined = false }: { skill: TeamupSkill; suffix?: string; outlined?: boolean }): JSX.Element {
  const meta = skillMeta(skill);
  return (
    <span className={`ktu-skill ${outlined ? 'is-outlined' : ''}`}>
      <Icon name={meta.icon} />
      {meta.label}
      {suffix ? <small>{suffix}</small> : null}
    </span>
  );
}

/** 推荐列表里的一行：头像、名字、招募标题，右边一个说明这行为什么在这里的标签。 */
export function PersonRow({ profile, label, accent = false, onOpen }: { profile: TeamupProfile; label: string; accent?: boolean; onOpen: (profile: TeamupProfile) => void }): JSX.Element {
  const user = profileUser(profile);
  return (
    <button type="button" className="ktu-person" onClick={() => onOpen(profile)}>
      <Avatar user={user} size="md" />
      <span className="ktu-person-text">
        <span className="ktu-person-name">
          <strong>{getDisplayName(user)}</strong>
          {profile.status === 'recruiting' ? <i className="ktu-live" title="招募中" /> : null}
        </span>
        <span className="ktu-person-headline">{profile.headline}</span>
      </span>
      <span className="ktu-person-meta">
        <span className={`kui-tag ${accent ? 'kui-tag--accent' : ''}`}>{label}</span>
        <span>{profile.view_count} 浏览 · {profile.comment_count} 讨论</span>
      </span>
    </button>
  );
}
