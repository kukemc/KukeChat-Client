import { useLayoutEffect, useRef, useState, type DragEvent } from 'react';
import type { DslDiagnostic, DslRenderResult } from '@/gandiDsl/pipeline';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import { saveBlob } from '@/components/groupPlus/files/fileUtils';
import { copyText } from '../message/chatDom';
import { gandiDslModule, useDslRender, type DslRenderState } from './useDslRender';

/** 卡片里积木图的最大高度，超过就折起来，点「展开」看全。 */
const COLLAPSED_HEIGHT = 320;
const FILE_NAME = 'KukeChat 积木.svg';

function stop(event: { stopPropagation: () => void }): void {
  event.stopPropagation();
}

/** 一条报错：第几行、说了什么、怎么改。 */
export function DslDiagnosticList({ diagnostics }: { diagnostics: DslDiagnostic[] }): JSX.Element | null {
  if (diagnostics.length === 0) return null;
  return (
    <ul className="kdsl-diags" role="list">
      {diagnostics.slice(0, 8).map((item, index) => (
        <li key={`${item.code}-${item.line ?? 0}-${item.column ?? 0}-${index}`} className="kdsl-diag">
          <span className="kdsl-diag-pos">{item.line ? `第 ${item.line} 行${item.column ? `:${item.column}` : ''}` : '整段'}</span>
          <span className="kdsl-diag-msg"><code>{item.code}</code> {item.message}</span>
          {item.fix ? <span className="kdsl-diag-fix">改法：{item.fix}</span> : null}
        </li>
      ))}
      {diagnostics.length > 8 ? <li className="kdsl-diag kdsl-diag--more">还有 {diagnostics.length - 8} 条</li> : null}
    </ul>
  );
}

/** 带行号的代码，出错的行标出来。 */
export function DslCodeView({ code, diagnostics = [] }: { code: string; diagnostics?: DslDiagnostic[] }): JSX.Element {
  const bad = new Set(diagnostics.map((item) => item.line).filter((line): line is number => typeof line === 'number'));
  const lines = code.split('\n');
  return (
    <pre className="kdsl-code" aria-label="积木文本">
      {lines.map((line, index) => (
        <span key={index} className={bad.has(index + 1) ? 'kdsl-line is-bad' : 'kdsl-line'}>
          <span className="kdsl-ln" aria-hidden="true">{index + 1}</span>
          <span className="kdsl-src">{line || ' '}</span>
        </span>
      ))}
    </pre>
  );
}

/** 「x、score 当作已有的变量」这类提示：聊天里没有作品，没声明的名字是自动补的。 */
export function autoDeclaredNote(result: DslRenderResult): string | null {
  const { variables, lists, broadcasts } = result.compile.autoDeclared;
  const parts: string[] = [];
  if (variables.length) parts.push(`变量 ${variables.slice(0, 4).join('、')}${variables.length > 4 ? ' 等' : ''}`);
  if (lists.length) parts.push(`列表 ${lists.slice(0, 4).join('、')}${lists.length > 4 ? ' 等' : ''}`);
  if (broadcasts.length) parts.push(`广播 ${broadcasts.slice(0, 4).join('、')}${broadcasts.length > 4 ? ' 等' : ''}`);
  return parts.length ? `${parts.join('，')} 没有声明，当作作品里已有的` : null;
}

/** 「扩展 myExt 没装」：没装（聊天里也不认识）的扩展积木画成了灰色占位块。 */
export function unknownExtensionNote(result: DslRenderResult): string | null {
  const ids = result.compile.unknownExtensions;
  if (!ids.length) return null;
  return `扩展 ${ids.slice(0, 4).join('、')}${ids.length > 4 ? ' 等' : ''} 这里不认识，灰色的是占位积木；拖进装了这个扩展的作品就是真积木`;
}

/** 拖动积木图：带上那张藏着积木的 SVG，拖进 Gandi 编辑器就是真积木。 */
function startDrag(event: DragEvent<HTMLElement>, result: DslRenderResult, code: string): void {
  const svg = result.rendered?.svg;
  if (!svg || !result.dataUrl) return;
  const transfer = event.dataTransfer;
  transfer.effectAllowed = 'copy';
  try {
    transfer.setData('text/plain', code);
    transfer.setData('image/svg+xml', svg);
    // Chrome / Edge：拖到桌面或文件夹直接存成 .svg 文件
    transfer.setData('DownloadURL', `image/svg+xml:${FILE_NAME}:${result.dataUrl}`);
  } catch {
    // 有的浏览器不让写自定义类型
  }
  try {
    // 当成文件拖：Gandi 3 编辑器按「拖进来的 .svg 文件」把积木长出来
    transfer.items.add(new File([svg], FILE_NAME, { type: 'image/svg+xml' }));
  } catch {
    // 不支持在 dragstart 里塞文件的浏览器：还有上面的数据可用
  }
}

function CardBody({ state, code, view, expanded, onOverflow }: { state: DslRenderState; code: string; view: 'blocks' | 'code'; expanded: boolean; onOverflow: (value: boolean) => void }): JSX.Element {
  const bodyRef = useRef<HTMLDivElement>(null);
  const result = state.phase === 'done' ? state.result : null;
  const showImage = view === 'blocks' && result?.status === 'ok' && result.dataUrl && result.rendered;

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    // 折起来时内容比可视高度高才算溢出（不能拿常量比：图片恰好在上限附近时会多出一个没用的「展开」）
    const measure = (): void => onOverflow(element.scrollHeight > element.clientHeight + 2);
    measure();
    const image = element.querySelector('img');
    image?.addEventListener('load', measure);
    return () => image?.removeEventListener('load', measure);
  });

  let content: JSX.Element;
  if (state.phase === 'loading') {
    content = <div className="kdsl-placeholder"><Icon name="loader" className="h-4 w-4 animate-spin" />正在生成积木…</div>;
  } else if (state.phase === 'failed') {
    content = <><DslCodeView code={code} /><p className="kdsl-note">{state.message}</p></>;
  } else if (showImage && result.rendered && result.dataUrl) {
    content = (
      <img
        className="kdsl-image"
        src={result.dataUrl}
        alt="积木"
        width={result.rendered.width}
        height={result.rendered.height}
        style={{ width: result.rendered.width, maxWidth: '100%', height: 'auto' }}
        draggable
        title="拖进 Gandi 编辑器就是真积木"
        onDragStart={(event) => startDrag(event, result, code)}
      />
    );
  } else if (result && result.status === 'compile-error') {
    content = <><DslCodeView code={code} diagnostics={result.compile.diagnostics} /><DslDiagnosticList diagnostics={result.compile.diagnostics} /></>;
  } else {
    content = (
      <>
        <DslCodeView code={code} />
        {view === 'blocks' && result?.renderError ? <p className="kdsl-note">{result.status === 'unavailable' ? '这里画不了积木，先显示代码' : result.renderError}</p> : null}
      </>
    );
  }

  return (
    <div ref={bodyRef} className="kdsl-body" style={expanded ? undefined : { maxHeight: COLLAPSED_HEIGHT }}>
      {content}
    </div>
  );
}

/**
 * 消息里的一块积木：默认显示积木图，可切到代码；复制代码、下载 SVG、（在 Gandi 编辑器里）放进编辑器。
 * 编译出错时显示代码和报错（第几行、原因、改法），不画半截的图。
 */
export function DslBlockCard({ code }: { code: string }): JSX.Element {
  const state = useDslRender(code);
  const [view, setView] = useState<'blocks' | 'code'>('blocks');
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const result = state.phase === 'done' ? state.result : null;
  const ok = result?.status === 'ok';
  const compileError = result?.status === 'compile-error';
  const canInsert = ok && Boolean(gandiDslModule()?.canInsertIntoEditor());
  const notes = ok && result ? [unknownExtensionNote(result), autoDeclaredNote(result)].filter((text): text is string => Boolean(text)) : [];

  return (
    <div className={`kdsl-card${compileError ? ' is-error' : ''}`} onDoubleClick={stop} onClick={stop}>
      <div className="kdsl-head">
        <span className="kdsl-title"><Icon name="blocks" className="h-3.5 w-3.5" />{compileError ? '积木文本有错误' : ok ? null : '积木'}</span>
        {ok ? (
          <div className="kui-segment kdsl-seg" role="tablist" aria-label="显示方式">
            <button type="button" role="tab" aria-selected={view === 'blocks'} className={view === 'blocks' ? 'is-active' : ''} onClick={() => setView('blocks')}>积木</button>
            <button type="button" role="tab" aria-selected={view === 'code'} className={view === 'code' ? 'is-active' : ''} onClick={() => setView('code')}>代码</button>
          </div>
        ) : null}
        <span className="kdsl-spacer" />
        <button type="button" className="kui-icon-btn kdsl-act" title="复制代码" aria-label="复制代码" onClick={() => {
          copyText(code);
          toast.success('已复制积木代码');
        }}><Icon name="copy" className="h-3.5 w-3.5" /></button>
        {ok && result?.rendered ? (
          <button type="button" className="kui-icon-btn kdsl-act" title="下载 SVG（拖进 Gandi 编辑器就是真积木）" aria-label="下载 SVG" onClick={() => {
            if (result.rendered) saveBlob(new Blob([result.rendered.svg], { type: 'image/svg+xml' }), FILE_NAME);
          }}><Icon name="download" className="h-3.5 w-3.5" /></button>
        ) : null}
        {canInsert && result ? (
          <button type="button" className="kui-btn kui-btn--sm kdsl-insert" title="把这段积木放进当前角色的代码区" onClick={() => {
            const outcome = gandiDslModule()?.insertIntoEditor(result.compile);
            if (outcome?.ok) toast.success(outcome.message);
            else toast.error(outcome?.message ?? '放进编辑器失败');
          }}>放进编辑器</button>
        ) : null}
      </div>
      <CardBody state={state} code={code} view={view} expanded={expanded} onOverflow={setOverflow} />
      {overflow || expanded ? (
        <button type="button" className="kdsl-expand" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : '展开全部'}
          <Icon name="chevron" className={`h-3 w-3 ${expanded ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      ) : null}
      {view === 'blocks' ? notes.map((text) => <p key={text} className="kdsl-foot">{text}</p>) : null}
    </div>
  );
}
