import { useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatCompact } from '../postModel';
import { profileAccentPresets, profileCardStyleOptions, profileLayoutOptions, type useUserSpace } from '../userSpaceData';

const BIO_MAX_LENGTH = 1000;

/** 主页自定义。改动直接反映在上面的主页头部，保存后才生效；封面要过审才对别人可见。 */
export function ProfileEditor({ space }: { space: ReturnType<typeof useUserSpace> }): JSX.Element {
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const { profileDraft: draft, updateDraft, displayUser } = space;
  const layoutDetail = profileLayoutOptions.find((option) => option.value === draft.profile_layout)?.detail;
  const cardDetail = profileCardStyleOptions.find((option) => option.value === draft.profile_card_style)?.detail;

  return (
    <section className="kpo-block">
      <header className="kpo-editor-head">
        <div>
          <h2>主页自定义</h2>
          <p>封面、文案、版式和强调色的改动会立刻显示在上面；封面审核通过后才公开展示。</p>
        </div>
        <button type="button" className="kui-btn kui-btn--ghost" onClick={() => space.setEditingProfile(false)}>取消</button>
        <button type="button" className="kui-btn kui-btn--primary" disabled={space.savePending || space.coverPending} onClick={space.saveProfile}>{space.savePending ? '保存中…' : '保存主页'}</button>
      </header>

      <div className="kpo-form">
        <div className="kpo-field is-wide">
          <span className="kpo-field-label">主页封面</span>
          <div className="kpo-field-row">
            <button type="button" className="kui-btn" disabled={space.coverPending} onClick={() => coverInputRef.current?.click()}><Icon name="upload" className="h-3.5 w-3.5" />{space.coverPending ? '封面上传中…' : '更换封面'}</button>
            <span className="kpo-hint">建议使用横向图片，留出头像和文字的位置。</span>
          </div>
          <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={space.chooseCover} />
        </div>

        <label className="kpo-field">
          <span className="kpo-field-label">主页标题</span>
          <input className="kui-input" value={draft.profile_title} onChange={(event) => updateDraft('profile_title', event.target.value)} placeholder="我的空间" />
        </label>
        <label className="kpo-field">
          <span className="kpo-field-label">主页标签</span>
          <input className="kui-input" value={draft.profile_tagline} onChange={(event) => updateDraft('profile_tagline', event.target.value)} placeholder="今天也要开心聊天" />
        </label>
        <label className="kpo-field">
          <span className="kpo-field-label">当前状态</span>
          <input className="kui-input" value={draft.profile_status} onChange={(event) => updateDraft('profile_status', event.target.value)} placeholder="在线摸鱼中" />
        </label>
        <label className="kpo-field">
          <span className="kpo-field-label">所在地</span>
          <input className="kui-input" value={draft.profile_location} onChange={(event) => updateDraft('profile_location', event.target.value)} placeholder="互联网角落" />
        </label>
        <label className="kpo-field is-wide">
          <span className="kpo-field-label">兴趣标签</span>
          <input className="kui-input" value={draft.profile_interests} onChange={(event) => updateDraft('profile_interests', event.target.value)} placeholder="聊天, 编程, 音乐" />
        </label>
        <label className="kpo-field is-wide">
          <span className="kpo-field-label">个人简介<span>{draft.bio.length}/{BIO_MAX_LENGTH}</span></span>
          <textarea className="kui-textarea kui-scroll" rows={3} maxLength={BIO_MAX_LENGTH} value={draft.bio} onChange={(event) => updateDraft('bio', event.target.value)} placeholder="写一段会展示在主页上的简介" />
        </label>

        <div className="kpo-field">
          <span className="kpo-field-label">版式</span>
          <div className="kui-segment" role="radiogroup" aria-label="版式">
            {profileLayoutOptions.map((option) => <button key={option.value} type="button" role="radio" aria-checked={draft.profile_layout === option.value} className={draft.profile_layout === option.value ? 'is-active' : undefined} onClick={() => updateDraft('profile_layout', option.value)}>{option.label}</button>)}
          </div>
          <span className="kpo-hint">{layoutDetail}</span>
        </div>
        <div className="kpo-field">
          <span className="kpo-field-label">卡片风格</span>
          <div className="kui-segment" role="radiogroup" aria-label="卡片风格">
            {profileCardStyleOptions.map((option) => <button key={option.value} type="button" role="radio" aria-checked={draft.profile_card_style === option.value} className={draft.profile_card_style === option.value ? 'is-active' : undefined} onClick={() => updateDraft('profile_card_style', option.value)}>{option.label}</button>)}
          </div>
          <span className="kpo-hint">{cardDetail}</span>
        </div>
        <div className="kpo-field is-wide">
          <span className="kpo-field-label">强调色</span>
          <div className="kpo-field-row">
            {profileAccentPresets.map((color) => (
              <button key={color} type="button" aria-label={`选择强调色 ${color}`} aria-pressed={draft.profile_accent_color === color} className={`kpo-swatch ${draft.profile_accent_color === color ? 'is-active' : ''}`} style={{ background: color }} onClick={() => updateDraft('profile_accent_color', color)}>
                {draft.profile_accent_color === color ? <Icon name="check" /> : null}
              </button>
            ))}
            <input type="color" className="kpo-color" aria-label="自定义强调色" value={draft.profile_accent_color} onChange={(event) => updateDraft('profile_accent_color', event.target.value)} />
          </div>
        </div>

        <p className="kpo-hint is-wide">
          {displayUser?.ccw_student_oid
            ? `已绑定 CCW 账号 ${displayUser.ccw_name || ''}（关注 ${formatCompact(displayUser.ccw_following_count)} · 粉丝 ${formatCompact(displayUser.ccw_follower_count)} · 获赞 ${formatCompact(displayUser.ccw_like_count)}），可在设置中刷新或同步资料。`
            : 'CCW 账号的绑定入口在 设置 > CCW 账号，绑定后主页会展示关注、粉丝和获赞。'}
        </p>
        {space.coverError ? <p className="kui-note kui-note--danger is-wide" role="alert">{space.coverError}</p> : null}
        {space.saveError ? <p className="kui-note kui-note--danger is-wide" role="alert">{space.saveError}</p> : null}
      </div>
    </section>
  );
}
