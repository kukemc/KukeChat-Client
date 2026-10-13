import { useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { getDisplayName } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import type { HallPost, HallPostDraft } from '@/types/juryHall';
import { useJury } from '../context';
import { useHallPostActions, useHallRules } from '../data/hall';
import { formatDateTime } from '../labels';
import { Card, SectionFrame, StateBlock } from '../widgets/Frame';
import { RealNameNotice, useHallRole } from './HallGuide';
import { guidelineLines, HALL_KIND_LABEL, hallErrorText, proposalRuleText } from './labels';

type DraftKind = HallPostDraft['kind'];

const KIND_HINT: Record<DraftKind, string> = {
  proposal: '想改一条规则、一个数字或一个流程。发出后由在任委员表决，通过的交给管理员决定是否采纳。',
  discussion: '评审里遇到的共性问题、对尺度的疑惑、经验分享。不表决，只讨论。'
};

/**
 * 发帖 / 编辑帖子：整页的表单（标题、正文），右边是守则。
 * 发帖权限由服务端判断（403 tier_required 等）；这里按身份提前把入口收起来，免得写完才被拒绝。
 */
export function HallEditor({ post, onDone, onCancel }: { post?: HallPost; onDone: (post: HallPost) => void; onCancel: () => void }): JSX.Element {
  const { identity, nav, openPenalties } = useJury();
  const me = useKukeStore((state) => state.currentUser);
  const rules = useHallRules();
  const role = useHallRole();
  const actions = useHallPostActions();
  const [kind, setKind] = useState<DraftKind>(post && post.kind !== 'announcement' ? post.kind : 'proposal');
  const [title, setTitle] = useState(post?.title ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [leaving, setLeaving] = useState(false);
  const editing = Boolean(post);
  const mutation = editing ? actions.update : actions.create;
  const cleanTitle = title.trim();
  const cleanContent = content.trim();
  const dirty = editing ? cleanTitle !== post?.title || cleanContent !== post?.content : Boolean(cleanTitle || cleanContent);
  const valid = cleanTitle.length > 0 && cleanContent.length > 0;
  const pending = mutation.isPending;
  const guidelines = guidelineLines(rules);

  const back = (): void => {
    if (dirty && !pending) {
      setLeaving(true);
    } else {
      onCancel();
    }
  };
  const submit = (): void => {
    if (!valid || pending) {
      return;
    }
    if (post) {
      actions.update.mutate({ postId: post.id, title: cleanTitle, content: cleanContent }, { onSuccess: onDone });
    } else {
      actions.create.mutate({ kind, title: cleanTitle, content: cleanContent }, { onSuccess: onDone });
    }
  };

  const heading = editing ? `编辑${HALL_KIND_LABEL[kind]}` : '发帖';
  if (role !== 'member') {
    return (
      <SectionFrame title={heading} subtitle="议事厅" onBack={onCancel}>
        {role === 'restricted' ? (
          <StateBlock icon="lock" title="受处罚期间不能发帖" actions={<button type="button" className="kui-btn" onClick={openPenalties}>处罚与申诉</button>}>
            你的账号目前有生效中的处罚{identity.restriction?.until ? `，${formatDateTime(identity.restriction.until)} 恢复` : ''}。期间可以正常阅读议事厅。
          </StateBlock>
        ) : role === 'trainee' ? (
          <StateBlock icon="edit" title="晋升为正式委员后可以发帖" actions={<button type="button" className="kui-btn" onClick={onCancel}>回到议事厅</button>}>见习委员可以评论和参与提案表决。发起提案和讨论需要正式或资深委员。</StateBlock>
        ) : (
          <StateBlock icon="edit" title="发帖限在任的风纪委员" actions={<button type="button" className="kui-btn kui-btn--primary" onClick={() => nav.goSection('overview')}>看看怎样成为委员</button>}>议事厅对所有人公开可读；发起提案和讨论需要是在任的正式或资深委员。</StateBlock>
        )}
      </SectionFrame>
    );
  }

  return (
    <SectionFrame title={heading} subtitle="议事厅 · 实名公开讨论" onBack={back} actions={(
      <>
        <button type="button" className="kui-btn" disabled={pending} onClick={back}>取消</button>
        <button type="button" className="kui-btn kui-btn--primary" data-action="hall-submit-post" disabled={!valid || pending || (editing && !dirty)} onClick={submit}>{pending ? '提交中…' : editing ? '保存修改' : kind === 'proposal' ? '发起提案' : '发布讨论'}</button>
      </>
    )}>
      <div className="kjr-hall-layout is-editor">
        <div className="kjr-hall-main">
          {leaving ? (
            <p className="kui-note kui-note--warn kjr-hall-leave" role="alertdialog" aria-label="放弃草稿">
              <span>{editing ? '修改还没有保存，确定离开吗？' : '草稿还没有发布，离开后不会保留。'}</span>
              <span className="kjr-btn-row">
                <button type="button" className="kui-btn kui-btn--sm" onClick={() => setLeaving(false)}>继续写</button>
                <button type="button" className="kui-btn kui-btn--sm kui-btn--danger" data-action="hall-discard" onClick={onCancel}>放弃并离开</button>
              </span>
            </p>
          ) : null}
          <Card className="kjr-hall-form">
            {editing ? null : (
              <div className="kjr-hall-kinds" role="radiogroup" aria-label="帖子类型">
                {(['proposal', 'discussion'] as DraftKind[]).map((item) => (
                  <button key={item} type="button" role="radio" aria-checked={kind === item} data-kind={item} disabled={pending} className={cx('kjr-opt', kind === item && 'is-selected')} onClick={() => setKind(item)}>
                    <span className="kjr-opt-main">
                      <span className="kjr-opt-label">{HALL_KIND_LABEL[item]}</span>
                      <span className="kjr-opt-hint">{KIND_HINT[item]}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <label className="kjr-hall-field">
              <span className="kjr-h">标题<span>{title.length}/{rules.title_max}</span></span>
              <input className="kui-input" value={title} disabled={pending} maxLength={rules.title_max} aria-label="标题" placeholder={kind === 'proposal' ? '一句话说清想改什么，例如「建议把刷屏的默认等级从轻微调到一般」' : '一句话说清想讨论什么'} onChange={(event) => setTitle(event.target.value.slice(0, rules.title_max))} />
            </label>
            <label className="kjr-hall-field">
              <span className="kjr-h">正文<span>{content.length}/{rules.content_max}</span></span>
              <textarea className="kui-textarea kui-scroll kjr-hall-textarea" value={content} disabled={pending} rows={14} aria-label="正文" placeholder={kind === 'proposal' ? '现在的规则是什么、哪里不合适、想改成什么、为什么。可以举类型化的例子，但不要引用具体的未结案件。' : '把问题或想法讲清楚。可以举类型化的例子，但不要引用具体的未结案件。'} onChange={(event) => setContent(event.target.value.slice(0, rules.content_max))} />
            </label>
            {mutation.error ? <p className="kui-note kui-note--danger" role="alert">{hallErrorText(mutation.error, rules, '提交失败，请稍后再试。')}</p> : null}
            <p className="kjr-meta">以「{getDisplayName(me, '我')}」的名义公开发表{editing ? '' : `。每人 24 小时内最多发 ${rules.posts_per_day} 个帖子`}{kind === 'proposal' ? '；提案一旦有人表决就不能再修改，表决结束前可以撤回，出结果后不能删。' : '。'}</p>
          </Card>
        </div>
        <aside className="kjr-hall-side">
          <RealNameNotice />
          <Card className="kjr-hall-guide">
            <section className="kjr-hall-guide-block">
              <h3 className="kjr-h">发帖之前</h3>
              <p className="kui-note kui-note--warn" data-role="open-case-rule"><b>禁止讨论具体的未结案件。</b>还在评审中的案件只能在它自己的观点区里说；在这里提到会破坏盲审，帖子会被删除。</p>
              {guidelines.length > 0 ? <ul className="kjr-doc-list">{guidelines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
            </section>
            {kind === 'proposal' ? (
              <section className="kjr-hall-guide-block">
                <h3 className="kjr-h">提案怎么算</h3>
                <p className="kjr-quiet">{proposalRuleText(rules)}</p>
              </section>
            ) : null}
          </Card>
        </aside>
      </div>
    </SectionFrame>
  );
}
