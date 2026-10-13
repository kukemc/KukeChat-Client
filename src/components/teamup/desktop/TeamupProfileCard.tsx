import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { TeamupProfile } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { SKILL_LEVEL_LABEL } from '../teamupConstants';
import { buildShowcase, compactCount, introPlainText, profileUser } from '../teamupModel';
import { SkillTag, StatusTag } from './teamupUi';

const MAX_SKILLS = 4;
const MAX_LOOKING_FOR = 3;
const MAX_SHOWCASE = 3;

/** 广场里的一张名片：谁、想做什么、会什么、想找什么，下面带最多三张作品图。 */
export function TeamupProfileCard({ profile, onOpen }: { profile: TeamupProfile; onOpen: (profile: TeamupProfile) => void }): JSX.Element {
  const user = profileUser(profile);
  const intro = introPlainText(profile.intro);
  const creationCount = (profile.ccw_creations ?? []).length;
  const showcase = buildShowcase(profile);
  const cover = profile.background_url ? resolveThumbnailUrl(profile.background_url) ?? profile.background_url : null;

  return (
    <button type="button" className="ktu-card" onClick={() => onOpen(profile)}>
      {cover ? <img src={cover} alt="" loading="lazy" className="ktu-card-cover" /> : null}
      <span className="ktu-card-body">
        <span className="ktu-card-head">
          <Avatar user={user} size="md" />
          <span className="ktu-card-who">
            <strong>{getDisplayName(user)}</strong>
            <span className={profile.is_friend ? 'is-friend' : undefined}>{profile.is_friend ? '已是好友' : '寻找队友中'}</span>
          </span>
          <StatusTag profile={profile} />
        </span>

        <span className="ktu-card-headline">{profile.headline}</span>
        {intro ? <span className="ktu-card-intro">{intro}</span> : null}

        {profile.skills.length > 0 ? (
          <span className="ktu-card-tags">
            {profile.skills.slice(0, MAX_SKILLS).map((item) => <SkillTag key={item.skill} skill={item.skill} suffix={SKILL_LEVEL_LABEL[item.level]} />)}
            {profile.skills.length > MAX_SKILLS ? <span className="ktu-skill">+{profile.skills.length - MAX_SKILLS}</span> : null}
          </span>
        ) : null}

        {profile.looking_for.length > 0 ? (
          <span className="ktu-card-tags">
            <em>想找</em>
            {profile.looking_for.slice(0, MAX_LOOKING_FOR).map((skill) => <SkillTag key={skill} skill={skill} outlined />)}
          </span>
        ) : null}

        {showcase.length > 0 ? (
          <span className="ktu-card-showcase">
            {showcase.slice(0, MAX_SHOWCASE).map((item, index) => {
              const extra = index === MAX_SHOWCASE - 1 ? showcase.length - MAX_SHOWCASE : 0;
              return (
                <span key={item.key} className="ktu-thumb">
                  <img src={item.cover} alt="" loading="lazy" />
                  {item.kind === 'work' ? (
                    <span className="ktu-thumb-caption">
                      <b>{item.title}</b>
                      <span><Icon name="heart" />{compactCount(item.likeCount)}<Icon name="eye" />{compactCount(item.viewCount)}</span>
                    </span>
                  ) : null}
                  {extra > 0 ? <span className="ktu-thumb-more">+{extra}</span> : null}
                </span>
              );
            })}
          </span>
        ) : null}

        <span className="ktu-card-foot">
          {creationCount > 0 ? <span><Icon name="sparkles" />{creationCount} 代表作</span> : null}
          <span><Icon name="eye" />{profile.view_count}</span>
          <span><Icon name="message" />{profile.comment_count}</span>
        </span>
      </span>
    </button>
  );
}
