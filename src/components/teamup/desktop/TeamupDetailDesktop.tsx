import type { ReactNode } from 'react';
import { ccwStudentProfileUrl } from '@/config';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { Icon } from '@/components/ui/Icon';
import { ImageViewer } from '@/components/ui/ImageViewer';
import { Markdown } from '@/components/ui/Markdown';
import { useKukeStore } from '@/store/kukeStore';
import type { TeamupProfile, User } from '@/types/api';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { SKILL_LEVEL_LABEL, skillMeta } from '../teamupConstants';
import { formatCcwCount, profileUser, stripCcwLinks } from '../teamupModel';
import { useTeamupDetail, type TeamupDetailState } from '../useTeamupDetail';
import { TeamupComments } from './TeamupComments';
import { TeamupShareDialog } from './TeamupShareDialog';
import { SkillTag, statusLabel } from './teamupUi';

interface TeamupDetailDesktopProps {
  profileId: number;
  initialProfile?: TeamupProfile | null;
  currentUser: User;
  isFriend: boolean;
  hasPendingRequest: boolean;
  incomingRequestId: number | null;
  onBack: () => void;
  onEdit: (profile: TeamupProfile) => void;
  onFriendRequested: (profile: TeamupProfile) => void;
  /** 从这一页打开的对话框（编辑器、申请已发送的提示），由组队中心传进来 */
  children?: ReactNode;
}

/** 对这张名片的主人能做的事：发组队申请（其实就是好友申请）、通过对方发来的申请，或者只是告诉你现在是什么关系。 */
function RelationAction({ detail, profile, isFriend, hasPendingRequest, incomingRequestId }: { detail: TeamupDetailState; profile: TeamupProfile; isFriend: boolean; hasPendingRequest: boolean; incomingRequestId: number | null }): JSX.Element {
  const { friendMutation, acceptMutation } = detail;
  if (isFriend || profile.is_friend || acceptMutation.isSuccess) {
    return <span className="ktu-relation is-friend"><Icon name="check" />已是好友</span>;
  }
  if (incomingRequestId) {
    return <button type="button" className="kui-btn kui-btn--primary" disabled={acceptMutation.isPending} onClick={() => acceptMutation.mutate(incomingRequestId)}><Icon name="userPlus" className="h-3.5 w-3.5" />{acceptMutation.isPending ? '处理中…' : '接受组队'}</button>;
  }
  if (hasPendingRequest || friendMutation.isSuccess) {
    return <span className="ktu-relation"><Icon name="clock" />申请已发送</span>;
  }
  return <button type="button" className="kui-btn kui-btn--primary" disabled={friendMutation.isPending} onClick={() => friendMutation.mutate(profile.user_id)}><Icon name="userPlus" className="h-3.5 w-3.5" />{friendMutation.isPending ? '发送中…' : '组队'}</button>;
}

const CCW_STATS: Array<{ key: 'ccw_following_count' | 'ccw_follower_count' | 'ccw_like_count' | 'ccw_creation_count' | 'ccw_favorite_count' | 'ccw_view_count'; label: string }> = [
  { key: 'ccw_following_count', label: '关注' },
  { key: 'ccw_follower_count', label: '粉丝' },
  { key: 'ccw_like_count', label: '获赞' },
  { key: 'ccw_creation_count', label: '作品' },
  { key: 'ccw_favorite_count', label: '收藏' },
  { key: 'ccw_view_count', label: '浏览' }
];

/** 右栏：会什么、想找什么、怎么联系，以及绑定的 CCW 账号。 */
function Aside({ profile, user }: { profile: TeamupProfile; user: User }): JSX.Element {
  const ccwAvatar = resolveThumbnailUrl(user.ccw_avatar_url);
  const ccwOid = user.ccw_student_oid;
  return (
    <aside className="ktu-panel ktu-detail-aside">
      {profile.skills.length > 0 ? (
        <section className="kui-group">
          <div className="kui-group-title"><span>擅长</span></div>
          {profile.skills.map((item) => {
            const meta = skillMeta(item.skill);
            return (
              <div key={item.skill} className="kui-row">
                <Icon name={meta.icon} className="h-4 w-4" />
                <span className="kui-row-label">{meta.label}</span>
                <span className="kui-row-value">{SKILL_LEVEL_LABEL[item.level]}</span>
              </div>
            );
          })}
        </section>
      ) : null}

      {profile.looking_for.length > 0 ? (
        <section className="kui-group">
          <div className="kui-group-title"><span>想找队友</span></div>
          <div className="ktu-tags">{profile.looking_for.map((skill) => <SkillTag key={skill} skill={skill} outlined />)}</div>
        </section>
      ) : null}

      {profile.contact_note ? (
        <section className="kui-group">
          <div className="kui-group-title"><span>联系备注</span></div>
          <p className="kui-note ktu-contact">{profile.contact_note}</p>
        </section>
      ) : null}

      {ccwOid ? (
        <section className="kui-group ktu-ccw">
          <div className="kui-group-title"><span>CCW 已绑定</span></div>
          <div className="ktu-ccw-head">
            {ccwAvatar ? <img src={ccwAvatar} alt={user.ccw_name ?? 'CCW'} /> : <Avatar label={user.ccw_name || 'CCW'} toneKey={ccwOid} size="md" />}
            <strong>{user.ccw_name || ccwOid}</strong>
          </div>
          {user.ccw_bio ? <p className="ktu-ccw-bio">{user.ccw_bio}</p> : null}
          <div className="ktu-ccw-stats">
            {CCW_STATS.map((stat) => (
              <div key={stat.key}>
                <strong>{formatCcwCount(user[stat.key])}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
          <button type="button" className="kui-btn kui-btn--block" onClick={() => void openExternalUrl(ccwStudentProfileUrl(ccwOid))}><Icon name="external" className="h-3.5 w-3.5" />打开 CCW 主页</button>
        </section>
      ) : null}

      {profile.skills.length === 0 && profile.looking_for.length === 0 && !profile.contact_note && !ccwOid ? <p className="kui-empty">暂未填写技能与招募偏好</p> : null}
    </aside>
  );
}

/** 桌面端的名片详情页：名片头、介绍和作品、右栏的技能与 CCW 资料，最下面是留言板。 */
export function TeamupDetailDesktop({ profileId, initialProfile, currentUser, isFriend, hasPendingRequest, incomingRequestId, onBack, onEdit, onFriendRequested, children }: TeamupDetailDesktopProps): JSX.Element {
  const openUserSpace = useKukeStore((state) => state.openUserSpace);
  const detail = useTeamupDetail({ profileId, initialProfile, onFriendRequested });
  const { profile, galleryImages, viewer, setViewer } = detail;

  const user = profile ? profileUser(profile) : null;
  const isSelf = profile ? profile.is_self || profile.user_id === currentUser.id : false;
  const intro = profile ? stripCcwLinks(profile.intro) : '';
  const creations = profile?.ccw_creations ?? [];
  const coverUrl = profile?.background_url ? resolveAssetUrl(profile.background_url) ?? profile.background_url : null;

  return (
    <section className="ktu">
      <div className="ktu-shell">
        <div className="ktu-main">
          <header className="ktu-bar">
            <button type="button" className="kui-icon-btn" aria-label="返回" onClick={onBack}><Icon name="chevronLeft" className="h-4 w-4" /></button>
            <h2>组队名片</h2>
            {profile ? <button type="button" className="kui-btn" onClick={detail.openShare}><Icon name="share" className="h-3.5 w-3.5" />分享</button> : null}
            {profile && isSelf ? <button type="button" className="kui-btn kui-btn--primary" onClick={() => onEdit(profile)}><Icon name="edit" className="h-3.5 w-3.5" />编辑</button> : null}
          </header>

          {!profile || !user ? (
            <p className="kui-empty ktu-detail-state">{detail.profileQuery.isLoading ? '加载中…' : '名片不存在或已下架'}</p>
          ) : (
            <div className="ktu-body kui-scroll">
              <div className="ktu-page ktu-page--detail">
                <section className="ktu-panel ktu-hero">
                  {coverUrl ? <img src={coverUrl} alt="" className="ktu-hero-cover" /> : null}
                  <div className="ktu-hero-main">
                    <button type="button" className="ktu-hero-avatar" onClick={() => openUserSpace(user.id)} aria-label="查看个人主页"><Avatar user={user} size="lg" /></button>
                    <div className="ktu-hero-text">
                      <div className="ktu-hero-name">
                        <button type="button" onClick={() => openUserSpace(user.id)}>{getDisplayName(user)}</button>
                        <span className={`kui-tag ${profile.status === 'recruiting' ? 'kui-tag--ok' : ''}`}>{statusLabel(profile.status)}</span>
                        {profile.moderation_status === 'pending' ? <span className="kui-tag kui-tag--warn">审核中</span> : null}
                        {profile.moderation_status === 'rejected' ? <span className="kui-tag kui-tag--danger">未通过</span> : null}
                      </div>
                      <p className="ktu-hero-headline">{profile.headline}</p>
                      <p className="ktu-hero-meta">
                        <span><b>{profile.view_count}</b> 浏览</span>
                        <span><b>{profile.comment_count}</b> 留言</span>
                        {creations.length > 0 ? <span><b>{creations.length}</b> 代表作</span> : null}
                      </p>
                    </div>
                    {isSelf ? null : (
                      <div className="ktu-hero-actions">
                        <RelationAction detail={detail} profile={profile} isFriend={isFriend} hasPendingRequest={hasPendingRequest} incomingRequestId={incomingRequestId} />
                        <button type="button" className="kui-btn" onClick={() => openUserSpace(user.id)}><Icon name="profile" className="h-3.5 w-3.5" />主页</button>
                      </div>
                    )}
                  </div>
                </section>

                {detail.actionError ? <p className="kui-note kui-note--danger" role="alert">{detail.actionError}</p> : null}

                <div className="ktu-detail-grid">
                  <div className="ktu-panel ktu-detail-main">
                    {intro ? (
                      <section className="kui-group">
                        <div className="kui-group-title"><span>个人介绍</span></div>
                        <Markdown content={intro} className="ktu-intro" />
                      </section>
                    ) : null}

                    {galleryImages.length > 0 ? (
                      <section className="kui-group">
                        <div className="kui-group-title"><span>作品配图</span><span>{galleryImages.length} 张</span></div>
                        <div className="ktu-gallery">
                          {profile.image_urls.map((url, index) => (
                            <button key={url} type="button" onClick={() => setViewer({ images: galleryImages, index })} aria-label={`查看第 ${index + 1} 张配图`}>
                              <img src={resolveThumbnailUrl(url) ?? url} alt="" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {creations.length > 0 ? (
                      <section className="kui-group">
                        <div className="kui-group-title"><span>共创代表作</span><span>{creations.length} 个</span></div>
                        <div className="ktu-works">
                          {creations.map((preview) => <CcwCreationCard key={preview.oid} oid={preview.oid} accessKey={preview.access_key ?? ''} preview={preview} />)}
                        </div>
                      </section>
                    ) : null}

                    {!intro && galleryImages.length === 0 && creations.length === 0 ? <p className="kui-empty">这位肝酱还没有填写详细介绍</p> : null}
                  </div>

                  <Aside profile={profile} user={user} />
                </div>

                <TeamupComments detail={detail} count={profile.comment_count} currentUser={currentUser} canModerate={isSelf} onOpenUser={openUserSpace} />
              </div>
            </div>
          )}
        </div>
      </div>

      {viewer ? <ImageViewer viewer={viewer} onClose={() => setViewer(null)} onNavigate={(index) => setViewer((previous) => (previous ? { ...previous, index } : previous))} /> : null}
      {detail.shareOpen ? <TeamupShareDialog detail={detail} currentUser={currentUser} /> : null}
      {children}
    </section>
  );
}
