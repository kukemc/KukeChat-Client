import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Standalone apps own their page and can reload it; the extension shares the CCW page and must not. */
  allowReload?: boolean;
  /** Extension only: hide the chat window instead of leaving a card over the project. */
  onClose?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Last-resort fallback so a render error shows a recoverable card instead of unmounting the whole UI. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[KukeChat] UI crashed', error, info.componentStack);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  private close = (): void => {
    this.props.onClose?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { allowReload, onClose } = this.props;
    // Inline styles: the fallback must render even if the crash happened before styles or theme were applied,
    // and must accept clicks inside the extension host (pointer-events: none).
    return <div role="alert" style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16, pointerEvents: 'none', fontFamily: 'system-ui, -apple-system, "Microsoft YaHei", sans-serif' }}>
      <div style={{ pointerEvents: 'auto', width: 'min(360px, 100%)', boxSizing: 'border-box', padding: 20, borderRadius: 16, background: '#fff', color: '#151922', boxShadow: '0 12px 40px rgba(15, 23, 42, 0.22)', border: '1px solid rgba(15, 23, 42, 0.08)' }}>
        <div style={{ fontSize: 16, fontWeight: 600 }}>KukeChat 出了点问题</div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: '#5b6472' }}>界面遇到错误已暂停，你的消息不会丢失。可以先重试，还不行请截图反馈给我们。</div>
        <pre style={{ marginTop: 12, maxHeight: 96, overflow: 'auto', padding: 8, borderRadius: 8, background: '#f3f5f8', color: '#8b95a5', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error.message || String(error)}</pre>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {onClose ? <button type="button" onClick={this.close} style={buttonStyle(false)}>关闭</button> : null}
          {allowReload ? <button type="button" onClick={() => window.location.reload()} style={buttonStyle(false)}>重新加载</button> : null}
          <button type="button" onClick={this.retry} style={buttonStyle(true)}>重试</button>
        </div>
      </div>
    </div>;
  }
}

function buttonStyle(primary: boolean): CSSProperties {
  return { padding: '7px 14px', borderRadius: 8, border: primary ? 'none' : '1px solid rgba(15, 23, 42, 0.12)', background: primary ? '#168bff' : '#fff', color: primary ? '#fff' : '#151922', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
}
