import { useEffect } from 'react';
import { type FeaturedMessageItem } from '@/api/messages';
import type { Message } from '@/types/api';
import { Icon } from '@/components/ui/Icon';
import { registerNativeBackHandler } from '@/native/back';
import { FeaturedMessagesDialog } from './desktop/FeaturedMessagesDialog';
import { featuredItemMessage, formatMessageTime, messageSenderLabel } from './messageMeta';
import { renderMessageContentPreview } from './messageContent';

export interface FeaturedMessagesModalProps {
  items: FeaturedMessageItem[];
  isLoading: boolean;
  error: unknown;
  canManage: boolean;
  isToggling: boolean;
  onToggleFeature: (message: Message) => void;
  onOpenForwardBundle: (message: Message) => void;
  onClose: () => void;
}

/** 群精华消息。桌面布局是对话框，手机布局是整页。 */
export function FeaturedMessagesModal({ mobile = false, ...props }: FeaturedMessagesModalProps & { mobile?: boolean }): JSX.Element {
  return mobile ? <MobileFeaturedMessages {...props} /> : <FeaturedMessagesDialog {...props} />;
}

function MobileFeaturedMessages({ items, isLoading, error, canManage, isToggling, onToggleFeature, onOpenForwardBundle, onClose }: FeaturedMessagesModalProps): JSX.Element {
  const messages = items.map(featuredItemMessage).filter((message): message is Message => message !== null);

  useEffect(() => registerNativeBackHandler(() => {
    onClose();
    return true;
  }, 170), [onClose]);

  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]">
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回聊天">
          <Icon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-[18px] font-black">群精华消息</h2>
          <p className="mt-1 truncate text-[12px] font-medium [color:var(--kc-muted)]">集中查看群主或管理员设为精华的消息。</p>
        </div>
        <span className="h-10 w-10 shrink-0" />
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto p-4 [background:var(--kc-mobile-chat)]">
        {isLoading ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">正在加载精华消息...</p> : null}
        {error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">精华消息加载失败，请稍后重试。</p> : null}
        {!isLoading && !error && messages.length === 0 ? <p className="rounded-2xl p-4 text-sm [background:var(--kc-panel)] [color:var(--kc-muted)]">暂无精华消息。</p> : null}
        <div className="grid gap-3">
          {messages.map((message) => (
            <article key={message.id} className="rounded-2xl border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs [color:var(--kc-muted)]">
                    <span className="font-semibold [color:var(--kc-text)]">{messageSenderLabel(message)}</span>
                    <span>{formatMessageTime(message.created_at)}</span>
                  </div>
                  <div className="mt-2">{renderMessageContentPreview(message, onOpenForwardBundle)}</div>
                </div>
                {canManage ? (
                  <button type="button" disabled={isToggling} onClick={() => onToggleFeature(message)} className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-45">
                    移出精华
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
