import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { JuryCaseDetail } from '@/types/jury';
import { useJury } from '../context';
import { PrecedentEditor } from './PrecedentEditor';

// 判例在别处露出的几个小入口：公示栏的标记、案件详情里的「本案是判例 / 标为判例」。
// 后端没有 precedents 能力时全部不出现。

/** 列表里的小标记 */
export function PrecedentTag({ precedentId }: { precedentId: number | null | undefined }): JSX.Element | null {
  const { config } = useJury();
  return precedentId && config.has('precedents') ? <span className="kui-tag kui-tag--accent" data-precedent={precedentId}>判例</span> : null;
}

/** 「这个案件是判例」+ 去看裁判要旨。用在公示栏的案件详情里。 */
export function PrecedentNotice({ precedentId, title }: { precedentId: number | null | undefined; title?: string | null }): JSX.Element | null {
  const { config, nav } = useJury();
  if (!precedentId || !config.has('precedents')) {
    return null;
  }
  return (
    <section className="kjr-vs-block" data-block="precedent">
      <h3 className="kjr-h">判例</h3>
      <p className="kjr-meta">这个案件被标为判例，附有一段裁判要旨，说明同类情况该怎么判。</p>
      <button type="button" className="kui-btn kui-btn--sm kjr-prec-link" data-action="open-precedent" onClick={() => nav.goSection('handbook', { tab: 'precedents', itemId: precedentId })}>
        <Icon name="bookmark" className="h-3.5 w-3.5" /><span>{title ?? '查看裁判要旨'}</span>
      </button>
    </section>
  );
}

/**
 * 我投过票的案件详情里的判例入口：已经是判例就指过去；还不是、而我有资格标（资深、已定案、未改判 —— 由服务端判断）就给「标为判例」。
 * 修改和撤销在判例自己的页面上做。
 */
export function CasePrecedent({ detail }: { detail: JuryCaseDetail }): JSX.Element | null {
  const { config } = useJury();
  const [writing, setWriting] = useState(false);
  if (!config.has('precedents')) {
    return null;
  }
  if (detail.precedent) {
    return <PrecedentNotice precedentId={detail.precedent.id} title={detail.precedent.title} />;
  }
  if (!detail.can_mark_precedent) {
    return null;
  }
  return (
    <section className="kjr-vs-block" data-block="precedent">
      <h3 className="kjr-h">判例</h3>
      <p className="kjr-meta">如果这个案件的结论能帮大家对齐同类情况的尺度，可以把它标为判例，并写一段裁判要旨。</p>
      <div><button type="button" className="kui-btn kui-btn--sm" data-action="mark-precedent" onClick={() => setWriting(true)}><Icon name="bookmark" className="h-3.5 w-3.5" />标为判例</button></div>
      {/* 保存后案件详情会重新拉取，这一块自己变成「这个案件被标为判例」 */}
      {writing ? <PrecedentEditor caseId={detail.case_id} onClose={() => setWriting(false)} /> : null}
    </section>
  );
}
