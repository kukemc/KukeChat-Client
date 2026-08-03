import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface CcwBindingPromptModalProps {
  mobile?: boolean;
  onClose: () => void;
  onOpenBinding: () => void;
}

type ExitMode = 'close' | 'open-binding';

export function CcwBindingPromptModal({ mobile = false, onClose, onOpenBinding }: CcwBindingPromptModalProps): JSX.Element {
  const [exitMode, setExitMode] = useState<ExitMode | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  function finishExit(mode: ExitMode): void {
    if (exitMode) {
      return;
    }
    setExitMode(mode);
    timeoutRef.current = window.setTimeout(() => {
      if (mode === 'open-binding') {
        onOpenBinding();
      } else {
        onClose();
      }
    }, mode === 'open-binding' ? 360 : 260);
  }

  return (
    <div className={`kc-ccw-bind-prompt-overlay ${exitMode ? 'kc-ccw-bind-prompt-overlay-leave' : ''} ${exitMode === 'open-binding' ? 'kc-ccw-bind-prompt-overlay-launch' : ''}`} role="dialog" aria-modal="true" aria-labelledby="kc-ccw-bind-prompt-title">
      <div className={`kc-ccw-bind-prompt ${mobile ? 'kc-ccw-bind-prompt-mobile' : ''} ${exitMode ? 'kc-ccw-bind-prompt-leave' : ''} ${exitMode === 'open-binding' ? 'kc-ccw-bind-prompt-launch' : ''}`}>
        <button type="button" onClick={() => finishExit('close')} className="kc-ccw-bind-prompt-close" aria-label="关闭绑定推荐">
          <Icon name="close" className="h-4 w-4" />
        </button>

        <div className="kc-ccw-bind-prompt-content">
          <div className="kc-ccw-bind-prompt-visual" aria-hidden="true">
            <div className="kc-ccw-bind-prompt-token kc-ccw-bind-prompt-token-ccw">
              <Icon name="ccw" className="h-6 w-6" />
              <span>CCW</span>
            </div>
            <div className="kc-ccw-bind-prompt-link">
              <span />
              <span />
              <span />
            </div>
            <div className="kc-ccw-bind-prompt-token kc-ccw-bind-prompt-token-kuke">
              <span className="kc-ccw-bind-prompt-avatar">K</span>
              <span>KukeChat</span>
            </div>
          </div>
          <p className="kc-ccw-bind-prompt-kicker">CCW Account</p>
          <h2 id="kc-ccw-bind-prompt-title" className="kc-ccw-bind-prompt-title">推荐绑定你的 CCW 账号</h2>
          <p className="kc-ccw-bind-prompt-text">绑定后可以展示 CCW 主页资料、同步头像昵称与简介，也能让朋友更快确认这是你的创作账号。</p>

          <div className="kc-ccw-bind-prompt-features" aria-label="绑定优势">
            <span><Icon name="shieldCheck" className="h-4 w-4" />身份更可信</span>
            <span><Icon name="sparkles" className="h-4 w-4" />资料可同步</span>
            <span><Icon name="external" className="h-4 w-4" />主页可跳转</span>
          </div>

          <div className="kc-ccw-bind-prompt-actions">
            <button type="button" onClick={() => finishExit('close')} className="kc-ccw-bind-prompt-secondary">稍后再说</button>
            <button type="button" onClick={() => finishExit('open-binding')} className="kc-ccw-bind-prompt-primary">
              <span>前往绑定</span>
              <Icon name="chevron" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
