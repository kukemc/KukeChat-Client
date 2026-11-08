import { DSL_DOCS_URL, looksLikeDsl, splitDslFences, wrapDslFence } from '@/gandiDsl';
import { Icon } from '@/components/ui/Icon';
import { MAX_MESSAGE_CONTENT_LENGTH } from '../message/constants';
import { DslDiagnosticList, autoDeclaredNote, unknownExtensionNote } from './DslBlockCard';
import { gandiDslModule, useDslRender } from './useDslRender';

/** 停手 300 毫秒再画，打字时不一直重画。 */
const PREVIEW_DEBOUNCE_MS = 300;

/**
 * 输入框里要预览的积木文本：写了积木围栏的取第一段，没有围栏、看着像积木的取整段。都不是 → null。
 * 只做字符串判断（预筛），真正算不算积木由编译器决定（预览里的结果、发送时的 {@link dslContentForSend}）。
 */
export function composerDslCode(text: string): string | null {
  const segments = splitDslFences(text);
  if (segments) {
    const fence = segments.find((segment) => segment.kind === 'dsl');
    return fence && fence.kind === 'dsl' && fence.code.trim() ? fence.code : null;
  }
  return looksLikeDsl(text) ? text.trim() : null;
}

/**
 * 发送前：整条消息就是一段积木文本（编译器认了）→ 包成 ```gandi-dsl 围栏发出去。
 * 收消息的一方没有围栏也能认出来，包一层是为了在认不全的地方（比如作品里装了第三方扩展、对方没装）也一定显示成积木。
 * 编译器还没加载好、认不出、包了超长 → 原样发。
 */
export function dslContentForSend(content: string): string {
  if (splitDslFences(content) || !looksLikeDsl(content)) return content;
  const module = gandiDslModule();
  if (!module || !module.detectDsl(content)) return content;
  const wrapped = wrapDslFence(content.trim());
  return wrapped.length <= MAX_MESSAGE_CONTENT_LENGTH ? wrapped : content;
}

/** 输入框上方的积木预览：写着积木文本时实时显示积木，有错标出来。点 × 这条按普通文字发。 */
export function DslComposerPreview({ code, onDismiss }: { code: string; onDismiss: () => void }): JSX.Element | null {
  const state = useDslRender(code, PREVIEW_DEBOUNCE_MS);
  if (state.phase === 'failed') return null;

  let title = '正在识别积木…';
  let body: JSX.Element | null = null;
  let tone: 'ok' | 'error' | 'muted' = 'muted';
  if (state.phase === 'done') {
    const { result } = state;
    if (result.status === 'ok' && result.dataUrl && result.rendered) {
      tone = 'ok';
      title = '积木预览 · 发出去对方看到的就是积木';
      const notes = [unknownExtensionNote(result), autoDeclaredNote(result)].filter((text): text is string => Boolean(text));
      body = (
        <>
          <img className="kdsl-image" src={result.dataUrl} alt="积木预览" style={{ width: result.rendered.width, maxWidth: '100%', height: 'auto' }} draggable={false} />
          {notes.map((text) => <p key={text} className="kdsl-foot">{text}</p>)}
        </>
      );
    } else if (result.status === 'compile-error') {
      tone = 'error';
      title = '积木文本有错，改好之前发出去是普通文字';
      body = <DslDiagnosticList diagnostics={result.compile.diagnostics} />;
    } else if (result.compile.ok) {
      title = '识别为积木（这里画不了预览，对方能看到积木）';
    } else {
      return null;
    }
  }

  return (
    <div className={`kcd-popover kdsl-composer-preview is-${tone}`} role="status" onMouseDown={(event) => event.preventDefault()}>
      <div className="kdsl-composer-preview-head">
        <Icon name={state.phase === 'loading' ? 'loader' : 'blocks'} className={`h-3.5 w-3.5${state.phase === 'loading' ? ' animate-spin' : ''}`} />
        <span>{title}</span>
        <a className="kdsl-composer-preview-doc" href={DSL_DOCS_URL} target="_blank" rel="noreferrer" title="Gandi 3.0 DSL 语法文档">语法文档</a>
        <button type="button" className="kui-icon-btn" title="不当积木，按普通文字发" aria-label="不当积木，按普通文字发" onClick={onDismiss}><Icon name="close" className="h-3 w-3" /></button>
      </div>
      {body ? <div className="kdsl-composer-preview-body scroll-soft">{body}</div> : null}
    </div>
  );
}
