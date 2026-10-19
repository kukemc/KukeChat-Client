import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { sendSelfTransfers } from './transfers';

/** 「我的设备」里发文件（任意类型，24 小时临时文件）。不是这个会话时返回 null */
export function useSelfFileSender(conversationId: number, enabled: boolean): ((files: File[]) => void) | null {
  const queryClient = useQueryClient();
  const send = useCallback((files: File[]) => {
    void sendSelfTransfers(queryClient, conversationId, files);
  }, [conversationId, queryClient]);
  return enabled ? send : null;
}

/**
 * 输入框工具栏上的「文件」：选任意文件，在「我的设备」里发成 24 小时临时文件（self-chat.md 第 5 节）。
 * variant 决定按钮长相：桌面工具栏的小图标 / 手机工具栏的大图标。
 */
export function SelfFileComposerButton({ conversationId, disabled = false, variant = 'desktop', onQueued }: { conversationId: number; disabled?: boolean; variant?: 'desktop' | 'mobile'; onQueued?: () => void }): JSX.Element {
  const send = useSelfFileSender(conversationId, true);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={inputRef} type="file" multiple hidden onChange={(event) => {
        const list = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (list.length > 0 && send) {
          send(list);
          onQueued?.();
        }
      }} />
      {variant === 'mobile' ? (
        <button type="button" className="kc-mobile-composer-tool kself-tool disabled:cursor-not-allowed disabled:opacity-45" aria-label="发送文件" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Icon name="folder" className="h-6 w-6" />
        </button>
      ) : (
        <button type="button" className="kcd-tool" title="文件（任意类型，24 小时内有效；也可以直接拖进来、粘贴）" aria-label="发送文件" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <Icon name="folder" className="h-[18px] w-[18px]" />
        </button>
      )}
    </>
  );
}
