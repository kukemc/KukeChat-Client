import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getDesktopPortalRoot, Modal } from '@/components/ui/desktop/Modal';
import type { Precedent } from '@/types/jurySenior';
import { PRECEDENT_SUMMARY_MAX, PRECEDENT_TITLE_MAX, usePrecedentActions } from '../data/precedents';
import { errorText } from '../data/queries';
import { publicCaseNo, reviewNo } from '../labels';

/** 标题至少要写几个字才像一句话（服务端只限上限，这里防的是手滑） */
const TITLE_MIN = 4;
const SUMMARY_MIN = 20;

/**
 * 写裁判要旨：把一个已定案件标为判例，或修改自己标过的判例。
 * 判例直接生效、全站可读，所以这里把「该写什么、不该写什么」说在前面。
 */
export function PrecedentEditor({ caseId, precedent, onClose, onSaved }: {
  /** 新标注时给案件编号 */
  caseId?: number;
  /** 修改时给已有的判例 */
  precedent?: Pick<Precedent, 'id' | 'title' | 'summary' | 'case_id'>;
  onClose: () => void;
  onSaved?: (precedent: Precedent) => void;
}): JSX.Element {
  const { save } = usePrecedentActions();
  const [title, setTitle] = useState(precedent?.title ?? '');
  const [summary, setSummary] = useState(precedent?.summary ?? '');
  const cleanTitle = title.trim();
  const cleanSummary = summary.trim();
  const dirty = cleanTitle !== (precedent?.title ?? '') || cleanSummary !== (precedent?.summary ?? '');
  const valid = cleanTitle.length >= TITLE_MIN && cleanSummary.length >= SUMMARY_MIN && dirty;
  const target = precedent?.case_id ?? caseId ?? 0;

  const submit = (): void => {
    if (!valid || save.isPending) {
      return;
    }
    const draft = { title: cleanTitle, summary: cleanSummary };
    save.mutate(precedent ? { ...draft, precedentId: precedent.id } : { ...draft, caseId: target }, { onSuccess: (saved) => {
      onSaved?.(saved);
      onClose();
    } });
  };

  // 风纪页的外层是容器查询的基准，对话框要挂到窗口根上
  return createPortal(
    <Modal
      title={precedent ? '修改判例' : '标为判例'}
      // 新标注是从我投过票的案件详情进来的，手里是评审编号；修改时用的是判例自带的公开编号
      subtitle={precedent ? publicCaseNo(target) : reviewNo(target)}
      className="kmd-modal--md"
      dismissOnBackdrop={!dirty}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="kui-btn kui-btn--ghost" disabled={save.isPending} onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" data-action="save-precedent" disabled={!valid || save.isPending} onClick={submit}>{save.isPending ? '保存中…' : precedent ? '保存修改' : '标为判例'}</button>
        </>
      )}
    >
      <div className="kjr-prec-editor">
        <p className="kui-note">判例保存后直接生效，进入规则手册的判例库，所有人都能读到标题和裁判要旨；它也会进练习场的题库。管理员可以修改或撤下。</p>
        <label className="kjr-prec-field">
          <span>标题<small>{title.length}/{PRECEDENT_TITLE_MAX}</small></span>
          <input className="kui-input" value={title} maxLength={PRECEDENT_TITLE_MAX} autoFocus aria-label="判例标题" placeholder="一句话说清这个案件确立的尺度" onChange={(event) => setTitle(event.target.value.slice(0, PRECEDENT_TITLE_MAX))} />
        </label>
        <label className="kjr-prec-field">
          <span>裁判要旨<small>{summary.length}/{PRECEDENT_SUMMARY_MAX}</small></span>
          <textarea className="kui-textarea kui-scroll" rows={9} value={summary} aria-label="裁判要旨" placeholder={'这类情况怎么判、看的是哪几点、什么时候该加重或从轻。\n以后遇到类似案件的委员会照着它来对尺度。'} onChange={(event) => setSummary(event.target.value.slice(0, PRECEDENT_SUMMARY_MAX))} />
        </label>
        <ul className="kjr-doc-list">
          <li><b>写尺度，不写经过。</b>不要复述案件里的原话，更不要写任何能认出当事人、群聊的信息。</li>
          <li><b>写得能直接用。</b>「重复三次及以上、且有人提醒过」比「情节较重」有用。</li>
          <li>至少 {SUMMARY_MIN} 个字。结论被改判的案件不能作为判例。</li>
        </ul>
        {save.error ? <p className="kui-note kui-note--danger" role="alert">{errorText(save.error, '保存失败，请稍后再试。')}</p> : null}
      </div>
    </Modal>,
    getDesktopPortalRoot()
  );
}
