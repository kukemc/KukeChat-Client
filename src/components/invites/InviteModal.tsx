import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptInvite, resolveInvite } from '@/api/invites';
import { useKukeStore } from '@/store/kukeStore';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';


interface InviteModalProps {
  token: string;
  onClose: () => void;
}


export function InviteModal({ token, onClose }: InviteModalProps): JSX.Element {
  const queryClient = useQueryClient();
  const setActiveConversationId = useKukeStore((state) => state.setActiveConversationId);
  const inviteQuery = useQuery({ queryKey: ['invite', token], queryFn: () => resolveInvite(token) });
  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['friends'] });
      if (result.conversation_id) {
        setActiveConversationId(result.conversation_id);
      }
      onClose();
    }
  });
  const invite = inviteQuery.data;
  const isGroup = invite?.target_type === 'group';
  const title = isGroup ? '邀请你加入群聊' : '邀请你添加好友';
  const group = invite?.group ?? null;
  const user = invite?.user ?? null;

  return (
    <div className="kc-mobile-overlay fixed inset-0 z-[70] grid place-items-center bg-black/35 p-4 backdrop-blur-sm">
      <div className="kc-mobile-dialog kc-mobile-scrollable-dialog w-full max-w-md rounded-[30px] border p-5 shadow-2xl [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] [color:var(--kc-accent)]">KukeChat Invite</p>
            <h3 className="mt-1 text-xl font-black">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="kc-icon-button h-9 w-9" aria-label="关闭"><Icon name="close" className="h-4 w-4" /></button>
        </div>
        {inviteQuery.isLoading ? <p className="mt-5 rounded-2xl p-4 text-sm [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">正在解析邀请链接...</p> : null}
        {inviteQuery.error ? <p className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">邀请链接无效或已不可用。</p> : null}
        {group ? (
          <div className="mt-5 rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="flex items-center gap-3">
              <Avatar label={group.title ?? '群聊'} avatarUrl={group.avatar_url} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black">{group.title || '未命名群聊'} ({group.member_count ?? 0})</p>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">群号 {group.id} · {group.category || '未设置'}</p>
              </div>
            </div>
            <p className="mt-4 rounded-2xl px-3 py-2 text-sm leading-6 [background:var(--kc-panel)] [color:var(--kc-muted)]">{group.description?.trim() || '这个群还没有简介。'}</p>
          </div>
        ) : null}
        {user ? (
          <div className="mt-5 rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
            <div className="flex items-center gap-3">
              <Avatar user={user} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-black">{getDisplayName(user)}</p>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">账号 {user.id} · @{user.username}</p>
              </div>
            </div>
            <p className="mt-4 rounded-2xl px-3 py-2 text-sm leading-6 [background:var(--kc-panel)] [color:var(--kc-muted)]">{user.bio?.trim() || '咕咕咕~'}</p>
          </div>
        ) : null}
        <div className="kc-mobile-actions mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl border px-4 py-2 text-sm font-bold [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">稍后再说</button>
          <button type="button" onClick={() => acceptMutation.mutate()} disabled={!invite || acceptMutation.isPending || invite.already_joined || invite.already_friends} className="liquid-button rounded-2xl px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">
            {invite?.already_joined ? '已加入' : invite?.already_friends ? '已是好友' : acceptMutation.isPending ? '处理中...' : isGroup ? '加入群聊' : '添加好友'}
          </button>
        </div>
      </div>
    </div>
  );
}
