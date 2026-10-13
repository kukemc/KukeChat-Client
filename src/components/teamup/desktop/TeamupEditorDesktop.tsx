import { CcwCreationCard } from '@/components/ui/CcwCreationCard';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/ui/Markdown';
import type { TeamupProfile } from '@/types/api';
import { SKILL_LEVEL_LABEL, SKILL_META } from '../teamupConstants';
import { MARKDOWN_TOOLS, MAX_IMAGES, MAX_WORKS, useTeamupEditor, type StagedImage, type TeamupEditorState } from '../useTeamupEditor';

// 与服务端 schema 的长度上限一致
const HEADLINE_MAX = 120;
const INTRO_MAX = 2000;
const CONTACT_MAX = 200;
const IMAGE_TYPES = 'image/png,image/jpeg,image/webp,image/gif';

/** 一张待上传 / 已上传的图片：上传中和失败都盖在图上说明。 */
function ImageTile({ image, className, children }: { image: StagedImage; className: string; children: JSX.Element }): JSX.Element {
  return (
    <div className={`ktu-tile ${className}`}>
      {image.previewUrl ? <img src={image.previewUrl} alt="" /> : null}
      {image.uploading ? <span className="ktu-tile-state">上传中…</span> : null}
      {image.error ? <span className="ktu-tile-state is-error">{image.error}</span> : null}
      <span className="ktu-tile-actions">{children}</span>
    </div>
  );
}

function IntroField({ editor }: { editor: TeamupEditorState }): JSX.Element {
  const { intro, introPreview, setIntroPreview } = editor;
  return (
    <div className="ktu-field">
      <div className="ktu-field-label">
        <span>个人介绍<small>支持 Markdown</small></span>
        <div className="kui-segment" role="radiogroup" aria-label="介绍的显示方式">
          <button type="button" role="radio" aria-checked={!introPreview} className={introPreview ? undefined : 'is-active'} onClick={() => setIntroPreview(false)}>编辑</button>
          <button type="button" role="radio" aria-checked={introPreview} className={introPreview ? 'is-active' : undefined} onClick={() => setIntroPreview(true)}>预览</button>
        </div>
      </div>
      {introPreview ? (
        <div className="ktu-md-preview">
          {intro.trim() ? <Markdown content={intro} /> : <span className="kui-muted">暂无内容，切换到“编辑”开始撰写。</span>}
        </div>
      ) : (
        <div className="ktu-md">
          <div className="ktu-md-tools">
            {MARKDOWN_TOOLS.map((tool) => (
              <button key={tool.kind} type="button" className="kui-icon-btn" title={tool.label} aria-label={tool.label} onClick={() => editor.applyMarkdown(tool.kind)}><Icon name={tool.icon} className="h-3.5 w-3.5" /></button>
            ))}
            <span className="ktu-count">{intro.length}/{INTRO_MAX}</span>
          </div>
          <textarea ref={editor.introRef} className="kui-scroll" value={intro} maxLength={INTRO_MAX} aria-label="个人介绍" placeholder={'介绍你的经验、风格、可投入时间和期待的合作方式。\n\n支持 **加粗**、*斜体*、## 标题、- 列表、> 引用、`代码` 等 Markdown 语法。'} onChange={(event) => editor.setIntro(event.target.value)} />
        </div>
      )}
    </div>
  );
}

function SkillFields({ editor }: { editor: TeamupEditorState }): JSX.Element {
  return (
    <>
      <div className="ktu-field">
        <div className="ktu-field-label"><span>我擅长<small>点击已选的标签切换熟练度</small></span></div>
        <div className="ktu-picks">
          {SKILL_META.map((meta) => {
            const item = editor.skills.find((entry) => entry.skill === meta.key);
            return (
              <span key={meta.key} className={`ktu-pick ${item ? 'is-active' : ''}`}>
                <button type="button" aria-pressed={Boolean(item)} onClick={() => (item ? editor.cycleSkillLevel(meta.key) : editor.toggleSkill(meta.key))}>
                  <Icon name={meta.icon} />
                  {meta.label}
                  {item ? <small>{SKILL_LEVEL_LABEL[item.level]}</small> : null}
                </button>
                {item ? <button type="button" aria-label={`取消${meta.label}`} onClick={() => editor.toggleSkill(meta.key)}><Icon name="close" /></button> : null}
              </span>
            );
          })}
        </div>
      </div>
      <div className="ktu-field">
        <div className="ktu-field-label"><span>我想找</span></div>
        <div className="ktu-picks">
          {SKILL_META.map((meta) => {
            const active = editor.lookingFor.includes(meta.key);
            return (
              <span key={meta.key} className={`ktu-pick ${active ? 'is-active' : ''}`}>
                <button type="button" aria-pressed={active} onClick={() => editor.toggleLookingFor(meta.key)}><Icon name={meta.icon} />{meta.label}</button>
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ImageFields({ editor }: { editor: TeamupEditorState }): JSX.Element {
  const { background, images, backgroundInputRef, fileInputRef } = editor;
  return (
    <>
      <div className="ktu-field">
        <div className="ktu-field-label"><span>名片背景图<small>显示在名片详情页，经过审核</small></span></div>
        {background ? (
          <ImageTile image={background} className="ktu-tile--wide">
            <>
              <button type="button" onClick={() => backgroundInputRef.current?.click()}>更换</button>
              <button type="button" aria-label="移除背景图" onClick={() => editor.setBackground(null)}><Icon name="close" /></button>
            </>
          </ImageTile>
        ) : (
          <button type="button" className="ktu-drop ktu-tile--wide" onClick={() => backgroundInputRef.current?.click()}><Icon name="image" className="h-4 w-4" />上传背景图</button>
        )}
        <input ref={backgroundInputRef} type="file" accept={IMAGE_TYPES} hidden onChange={(event) => editor.uploadBackground(event.target.files)} />
      </div>

      <div className="ktu-field">
        <div className="ktu-field-label"><span>配图<small>图片会经过审核，通过后才会公开展示</small></span><span className="ktu-count">{images.length}/{MAX_IMAGES}</span></div>
        <div className="ktu-tiles">
          {images.map((image) => (
            <ImageTile key={image.id} image={image} className="ktu-tile--square">
              <button type="button" aria-label="移除这张配图" onClick={() => editor.removeImage(image.id)}><Icon name="close" /></button>
            </ImageTile>
          ))}
          {images.length < MAX_IMAGES ? <button type="button" className="ktu-drop ktu-tile--square" onClick={() => fileInputRef.current?.click()}><Icon name="plus" className="h-4 w-4" />添加</button> : null}
        </div>
        <input ref={fileInputRef} type="file" accept={IMAGE_TYPES} multiple hidden onChange={(event) => editor.uploadImages(event.target.files)} />
      </div>
    </>
  );
}

function WorksField({ editor }: { editor: TeamupEditorState }): JSX.Element {
  const { works } = editor;
  return (
    <div className="ktu-field">
      <div className="ktu-field-label"><span>代表作<small>粘贴 CCW 作品链接，自动解析为作品卡片</small></span><span className="ktu-count">{works.length}/{MAX_WORKS}</span></div>
      <div className="ktu-work-add">
        <input
          className="kui-input"
          value={editor.workInput}
          placeholder="https://www.ccw.site/detail/..."
          aria-label="CCW 作品链接"
          onChange={(event) => editor.setWorkInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              editor.addWork();
            }
          }}
        />
        <button type="button" className="kui-btn" onClick={editor.addWork}><Icon name="plus" className="h-3.5 w-3.5" />添加</button>
      </div>
      {works.map((work) => (
        <div key={work.oid} className="ktu-work">
          {work.loading ? (
            <p className="ktu-work-state">正在解析作品 {work.oid}…</p>
          ) : work.error ? (
            <p className="ktu-work-state is-error">
              <span>作品解析失败：{work.oid}</span>
              <button type="button" className="kui-btn kui-btn--sm" onClick={() => editor.removeWork(work.oid)}>移除</button>
            </p>
          ) : (
            <>
              <CcwCreationCard oid={work.oid} accessKey={work.accessKey} preview={work.preview} />
              <button type="button" className="kui-icon-btn" aria-label="移除这个代表作" title="移除" onClick={() => editor.removeWork(work.oid)}><Icon name="close" className="h-4 w-4" /></button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** 桌面端的名片编辑器。保存后名片重新进入审核。 */
export function TeamupEditorDesktop({ profile, onClose, onSaved }: { profile: TeamupProfile | null; onClose: () => void; onSaved: (profile: TeamupProfile) => void }): JSX.Element {
  const editor = useTeamupEditor(profile, onSaved);
  const { headline, contactNote, saveMutation } = editor;
  const title = profile ? '编辑组队名片' : '发布组队名片';

  return (
    <div className="kui-backdrop">
      <div role="dialog" aria-modal="true" aria-label={title} className="kui-dialog ktu-editor">
        <header className="kui-dialog-header">
          <span>{title}</span>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kui-dialog-body kui-scroll ktu-editor-body">
          {editor.formError ? <p className="kui-note kui-note--danger" role="alert">{editor.formError}</p> : null}

          <label className="ktu-field">
            <span className="ktu-field-label"><span>一句话招募标题<i>*</i></span><span className="ktu-count">{headline.length}/{HEADLINE_MAX}</span></span>
            <input className="kui-input" value={headline} maxLength={HEADLINE_MAX} placeholder="例如：寻找擅长像素美术的搭档，一起做 Roguelike" onChange={(event) => editor.setHeadline(event.target.value)} />
          </label>

          <IntroField editor={editor} />
          <SkillFields editor={editor} />
          <ImageFields editor={editor} />
          <WorksField editor={editor} />

          <label className="ktu-field">
            <span className="ktu-field-label"><span>联系备注</span><span className="ktu-count">{contactNote.length}/{CONTACT_MAX}</span></span>
            <input className="kui-input" value={contactNote} maxLength={CONTACT_MAX} placeholder="例如：优先加好友私聊，或说明你的时区/在线时间" onChange={(event) => editor.setContactNote(event.target.value)} />
          </label>
        </div>
        <footer className="kui-dialog-footer">
          <span className="ktu-editor-hint">{editor.parsingWorks ? '正在解析代表作…' : '保存后会重新进入审核，通过后展示在组队广场。'}</span>
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={!headline.trim() || editor.uploading || saveMutation.isPending} onClick={editor.submit}>{saveMutation.isPending ? '提交中…' : profile ? '保存名片' : '发布名片'}</button>
        </footer>
      </div>
    </div>
  );
}
