import { useState } from 'react';
import { wrapDslFence } from '@/gandiDsl';
import { Icon } from '@/components/ui/Icon';
import { useMuteStatus } from '@/store/moderationStore';
import { MAX_MESSAGE_CONTENT_LENGTH } from '../message/constants';
import type { SendMessageVariables } from '../message/types';
import { PollDialog } from '../desktop/polls/PollDialog';
import { DslCodeView, DslDiagnosticList, autoDeclaredNote, unknownExtensionNote } from './DslBlockCard';
import { useDslRender } from './useDslRender';

const PLACEHOLDER = `when.flagclicked(() => {
  looks.say("你好！");
  repeat(10, () => {
    motion.movesteps(10);
    motion.turnright(15);
  });
});`;

/** 输入框里实时预览：停手 300 毫秒再画。 */
const PREVIEW_DEBOUNCE_MS = 300;

/** 只画预览，不带操作按钮（那些在发出去的消息上）。 */
function DslPreview({ code }: { code: string }): JSX.Element {
  const state = useDslRender(code, PREVIEW_DEBOUNCE_MS);
  if (!code.trim()) {
    return <div className="kdsl-preview-empty">在上面写积木文本，这里实时显示积木</div>;
  }
  if (state.phase === 'loading') {
    return <div className="kdsl-placeholder"><Icon name="loader" className="h-4 w-4 animate-spin" />正在生成积木…</div>;
  }
  if (state.phase === 'failed') {
    return <p className="kdsl-note">{state.message}</p>;
  }
  const { result } = state;
  if (result.status === 'ok' && result.dataUrl && result.rendered) {
    const notes = [unknownExtensionNote(result), autoDeclaredNote(result)].filter((text): text is string => Boolean(text));
    return (
      <>
        <img className="kdsl-image" src={result.dataUrl} alt="积木预览" style={{ width: result.rendered.width, maxWidth: '100%', height: 'auto' }} draggable={false} />
        {notes.map((text) => <p key={text} className="kdsl-foot">{text}</p>)}
      </>
    );
  }
  if (result.status === 'compile-error') {
    return <DslDiagnosticList diagnostics={result.compile.diagnostics} />;
  }
  return (
    <>
      <p className="kdsl-note">{result.status === 'unavailable' ? '这里画不了积木，发出去以后对方在能画积木的地方会看到积木' : result.renderError}</p>
      <DslCodeView code={code} />
    </>
  );
}

function DslEditorDialog({ onSend, onClose }: { onSend: (variables: SendMessageVariables) => void; onClose: () => void }): JSX.Element {
  const [code, setCode] = useState('');
  const content = wrapDslFence(code);
  const length = code.trim() ? content.length : 0;
  const overLimit = length > MAX_MESSAGE_CONTENT_LENGTH;
  const empty = !code.trim();

  function send(): void {
    if (empty || overLimit) return;
    onSend({ content, type: 'text', files: [] });
    onClose();
  }

  return (
    <PollDialog
      title="发送积木"
      onClose={onClose}
      footer={(
        <>
          <span className={`kdsl-count${overLimit ? ' is-over' : ''}`}>{length}/{MAX_MESSAGE_CONTENT_LENGTH}</span>
          {overLimit ? <p className="kcp-form-error" role="alert">太长了，消息最多 {MAX_MESSAGE_CONTENT_LENGTH} 字（含围栏）</p> : null}
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={empty || overLimit} onClick={send}>发送</button>
        </>
      )}
    >
      <div className="kdsl-editor">
        <label className="kcp-field">
          <span className="kcp-field-label">积木文本（Gandi 3.0 DSL）<span className="kcp-field-count">Ctrl+Enter 发送</span></span>
          <textarea
            className="kui-input kdsl-textarea"
            value={code}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            autoFocus
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              } else if (event.key === 'Tab' && !event.shiftKey) {
                // Tab 缩进两格，不跳出输入框
                event.preventDefault();
                const target = event.currentTarget;
                const { selectionStart, selectionEnd } = target;
                const next = `${code.slice(0, selectionStart)}  ${code.slice(selectionEnd)}`;
                setCode(next);
                window.requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
              }
            }}
          />
        </label>
        <div className="kcp-field">
          <span className="kcp-field-label">预览</span>
          <div className="kdsl-preview">
            <DslPreview code={code} />
          </div>
        </div>
      </div>
    </PollDialog>
  );
}

/** 输入框工具栏上的「积木」：写一段积木文本，边写边看积木，发成 ```gandi-dsl 围栏。 */
export function DslComposerButton({ disabled, onSend }: { disabled?: boolean; onSend: (variables: SendMessageVariables) => void }): JSX.Element {
  const { muted } = useMuteStatus();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="kcd-tool" title="发送积木（Gandi 积木文本）" aria-label="发送积木" disabled={disabled || muted} onClick={() => setOpen(true)}><Icon name="blocks" className="h-[18px] w-[18px]" /></button>
      {open ? <DslEditorDialog onSend={onSend} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
