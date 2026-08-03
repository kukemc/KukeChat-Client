import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createGroupConversation } from '@/api/conversations';
import { useKukeStore } from '@/store/kukeStore';
import type { Friendship } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { registerNativeBackHandler } from '@/native/back';

interface CreateGroupModalProps {
  friends: Friendship[];
  mobile?: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ friends, mobile = false, onClose }: CreateGroupModalProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);

  const mutation = useMutation({
    mutationFn: createGroupConversation,
    onSuccess: (conversation) => {
      setActiveConversationId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    }
  });

  function toggle(friendId: number): void {
    setSelectedIds((current) => (current.includes(friendId) ? current.filter((id) => id !== friendId) : [...current, friendId]));
  }

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    mutation.mutate({ title: title.trim(), member_ids: selectedIds });
  }

  useEffect(() => {
    if (!mobile) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      onClose();
      return true;
    }, 160);
  }, [mobile, onClose]);

  const formContent = (
    <>
      <header className={`${mobile ? 'shrink-0 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))] [background:var(--kc-mobile-chat)]' : 'mb-5 w-full'}`}>
        <div className={mobile ? 'flex min-h-[58px] items-end justify-between gap-3' : 'flex w-full items-start justify-between gap-3'}>
          {mobile ? (
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回">
              <Icon name="chevronLeft" className="h-6 w-6" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 text-left">
            <h3 className={`${mobile ? 'text-[22px] font-black' : 'text-xl font-semibold'} [color:var(--kc-text)]`}>创建群聊</h3>
            <p className="mt-1 text-sm [color:var(--kc-muted)]">选择好友并设置一个群聊名称。</p>
          </div>
          {mobile ? <span className="h-10 w-10 shrink-0" /> : (
            <button type="button" onClick={onClose} className="ghost-button ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full p-0 transition" aria-label="关闭创建群聊">
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className={`scroll-soft min-h-0 flex-1 overflow-y-auto ${mobile ? 'px-4 pb-6 pt-2' : ''}`}>
        <label className="mb-4 block">
          <span className="mb-2 block text-sm font-bold [color:var(--kc-text)]">群聊名称</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} required className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="例如：项目讨论组" />
        </label>

        <div className={`${mobile ? 'min-h-[45vh] max-h-none' : 'max-h-72'} scroll-soft overflow-y-auto rounded-3xl border p-2 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]`}>
          {friends.length === 0 ? <p className="p-4 text-sm [color:var(--kc-muted)]">暂无好友可选。</p> : null}
          {friends.map((friendship) => {
            const user = friendship.friend ?? friendship.user;
            const friendId = user?.id;
            if (!friendId) {
              return null;
            }
            const selected = selectedIds.includes(friendId);
            return (
              <button key={friendship.id ?? friendId} type="button" onClick={() => toggle(friendId)} className={`mb-2 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${selected ? 'border [background:var(--kc-accent-soft)] [border-color:var(--kc-accent)] [color:var(--kc-text)] shadow-none' : 'border border-transparent bg-transparent [color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`}>
                <Avatar user={user} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{getDisplayName(user, `用户 ${friendId}`)}</span>
                  <span className="block truncate text-xs [color:var(--kc-muted)]">{user?.email || '好友'}</span>
                </span>
                <span className={`grid h-5 w-5 place-items-center rounded-full border ${selected ? '[background:var(--kc-accent)] [border-color:var(--kc-accent)] text-white' : '[border-color:var(--kc-border)] [color:var(--kc-muted)]'}`}>{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>

        {mutation.error ? <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">创建失败，请稍后重试。</p> : null}
      </main>

      <footer className={`${mobile ? 'shrink-0 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 [background:var(--kc-mobile-chat)]' : 'kc-mobile-actions mt-5 flex justify-end gap-3'}`}>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="ghost-button rounded-2xl px-4 py-3 text-sm font-bold transition">取消</button>
          <button type="submit" disabled={!title.trim() || mutation.isPending} className="liquid-button rounded-2xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50">创建</button>
        </div>
      </footer>
    </>
  );

  if (mobile) {
    return (
      <form onSubmit={submit} className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
        {formContent}
      </form>
    );
  }

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[2147483646] grid place-items-center p-4 backdrop-blur-sm [background:rgba(0,0,0,0.35)]">
      <form onSubmit={submit} className="kc-mobile-dialog kc-mobile-scrollable-dialog glass-panel flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[28px] p-5 [color:var(--kc-text)] shadow-none">
        {formContent}
      </form>
    </div>
  );
}
