import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ccwStudentProfileUrl } from '@/config';
import { checkCcwBindingChallenge, getMyCcwBindingChallenge, startCcwBindingChallenge, syncMyCcwProfile } from '@/api/ccw';
import { updateMyProfile, uploadAvatar } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

interface ProfilePanelProps {
  user: User;
}

export function ProfilePanel({ user }: ProfilePanelProps): JSX.Element {
  const [nickname, setNickname] = useState(user.nickname ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const queryClient = useQueryClient();
  const ccwProfileUrl = user.ccw_student_oid ? ccwStudentProfileUrl(user.ccw_student_oid) : null;
  const challengeQuery = useQuery({
    queryKey: ['ccw-binding', 'me'],
    queryFn: getMyCcwBindingChallenge,
    refetchInterval: (query) => query.state.data?.status === 'pending' ? 5_000 : false
  });

  const mutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (response) => setAvatarUrl(response.url)
  });
  const startBindingMutation = useMutation({
    mutationFn: startCcwBindingChallenge,
    onSuccess: (challenge) => queryClient.setQueryData(['ccw-binding', 'me'], challenge)
  });
  const checkBindingMutation = useMutation({
    mutationFn: checkCcwBindingChallenge,
    onSuccess: (challenge) => {
      queryClient.setQueryData(['ccw-binding', 'me'], challenge);
      if (challenge?.status === 'verified') {
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    }
  });
  const syncCcwMutation = useMutation({
    mutationFn: syncMyCcwProfile,
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      setNickname(updatedUser.nickname ?? '');
      setAvatarUrl(updatedUser.avatar_url ?? '');
      setBio(updatedUser.bio ?? '');
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    mutation.mutate({ nickname, avatar_url: avatarUrl, bio });
  }

  function chooseAvatar(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      avatarMutation.mutate(file);
    }
    event.target.value = '';
  }

  const challenge = challengeQuery.data ?? null;
  const challengeExpired = challenge?.status === 'expired';
  const challengeVerified = challenge?.status === 'verified';
  const bindError = startBindingMutation.error instanceof Error ? startBindingMutation.error.message : checkBindingMutation.error instanceof Error ? checkBindingMutation.error.message : null;
  const ccwAvatarUrl = resolveThumbnailUrl(user.ccw_avatar_url);

  useEffect(() => {
    if (challengeVerified) {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  }, [challengeVerified, queryClient]);

  return (
    <section className="scroll-soft h-full overflow-y-auto p-4 [background:var(--kc-chat)] [color:var(--kc-text)] sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="glass-panel rounded-[32px] p-6 [color:var(--kc-text)]">
          <Avatar user={{ ...user, avatar_url: avatarUrl || user.avatar_url, nickname: nickname || user.nickname }} size="lg" />
          <h3 className="mt-4 text-2xl font-semibold [color:var(--kc-text)]">{nickname || getDisplayName(user)}</h3>
          <p className="mt-1 text-sm [color:var(--kc-muted)]">@{user.username}</p>
          <input ref={avatarInputRef} type="file" accept="image/*" onChange={chooseAvatar} className="hidden" />
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarMutation.isPending} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition [border-color:var(--kc-border)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-50">
            <Icon name="upload" className="h-4 w-4" />
            {avatarMutation.isPending ? '上传中...' : '上传头像'}
          </button>
          {user.ccw_student_oid ? (
            <div className="mt-5 overflow-hidden rounded-[24px] border [background:linear-gradient(135deg,color-mix(in_srgb,var(--kc-accent)_14%,transparent),var(--kc-panel-muted))] [border-color:color-mix(in_srgb,var(--kc-accent)_28%,var(--kc-border))]">
              <div className="flex items-center gap-3 p-4">
                {ccwAvatarUrl ? <img src={ccwAvatarUrl} alt={user.ccw_name ?? 'CCW'} className="h-12 w-12 rounded-2xl object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl text-white [background:var(--kc-accent)]"><Icon name="ccw" className="h-6 w-6" /></span>}
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.16em] [color:var(--kc-accent)]">CCW 已绑定</p>
                  <h4 className="truncate text-base font-black [color:var(--kc-text)]">{user.ccw_name || user.ccw_student_oid}</h4>
                </div>
              </div>
              <div className="grid grid-cols-3 border-t text-center text-xs font-bold [border-color:var(--kc-border)]">
                <span className="px-2 py-3"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_following_count)}</strong><span className="[color:var(--kc-muted)]">关注</span></span>
                <span className="border-x px-2 py-3 [border-color:var(--kc-border)]"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_follower_count)}</strong><span className="[color:var(--kc-muted)]">粉丝</span></span>
                <span className="px-2 py-3"><strong className="block text-base [color:var(--kc-text)]">{formatCompact(user.ccw_like_count)}</strong><span className="[color:var(--kc-muted)]">获赞</span></span>
              </div>
              <div className="grid gap-2 p-3">
                {ccwProfileUrl ? <button type="button" onClick={() => void openExternalUrl(ccwProfileUrl)} className="inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-white [background:var(--kc-accent)]"><Icon name="external" className="h-4 w-4" />打开 CCW 主页</button> : null}
                <button type="button" onClick={() => syncCcwMutation.mutate(false)} disabled={syncCcwMutation.isPending} className="rounded-2xl px-3 py-2 text-sm font-bold [background:var(--kc-panel)] [color:var(--kc-text)] disabled:opacity-50">{syncCcwMutation.isPending ? '同步中...' : '刷新 CCW 数据'}</button>
                <button type="button" onClick={() => syncCcwMutation.mutate(true)} disabled={syncCcwMutation.isPending} className="rounded-2xl px-3 py-2 text-sm font-bold [background:var(--kc-panel)] [color:var(--kc-text)] disabled:opacity-50">一键同步头像昵称签名</button>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="grid gap-5">
        <form onSubmit={submit} className="glass-panel rounded-[32px] p-5 sm:p-6">
          <h3 className="text-2xl font-semibold [color:var(--kc-text)]">个人资料</h3>
          <p className="mt-1 text-sm [color:var(--kc-muted)]">修改昵称、头像和简介。</p>

          <div className="mt-6 grid gap-4">
            <label>
              <span className="mb-2 block text-sm font-bold [color:var(--kc-text)]">昵称</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" />
            </label>
            <label>
              <span className="mb-2 block text-sm font-bold [color:var(--kc-text)]">简介</span>
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} className="glass-input scroll-soft w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="介绍一下自己" />
            </label>
          </div>

          {mutation.error ? <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">保存失败，请稍后重试。</p> : null}
          {mutation.isSuccess ? <p className="glass-card-quiet mt-4 rounded-2xl p-3 text-sm [color:var(--kc-text)]">资料已保存。</p> : null}

          <button type="submit" disabled={mutation.isPending} className="liquid-button mt-6 rounded-2xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50">保存资料</button>
        </form>
        <section className="glass-panel overflow-hidden rounded-[32px] p-0">
          <div className="relative overflow-hidden px-5 py-6 text-white sm:px-6 [background:linear-gradient(135deg,#168bff,#7c3aed_58%,#ff4f86)]">
            <div className="absolute -right-12 -top-16 h-36 w-36 rounded-full bg-white/20 blur-2xl" />
            <div className="absolute bottom-0 left-1/3 h-20 w-20 rounded-full bg-white/10 blur-xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 rounded-full bg-white/16 px-3 py-1 text-xs font-black uppercase tracking-[0.16em]"><Icon name="ccw" className="h-4 w-4" /> CCW Account</p>
                <h3 className="mt-4 text-2xl font-black">绑定 CCW 账号</h3>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-white/82">生成验证码后，前往指定 CCW 作品评论区发布验证码。服务器会自动轮询最新评论并把验证码对应的 CCW 账号绑定到你的 KukeChat 资料。</p>
              </div>
              {user.ccw_student_oid ? <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#168bff]">已绑定</span> : <span className="rounded-full bg-white/16 px-4 py-2 text-sm font-black">等待验证</span>}
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:p-6">
            {user.ccw_student_oid ? (
              <div className="rounded-[24px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                <p className="text-sm font-bold [color:var(--kc-text)]">当前绑定：{user.ccw_name || user.ccw_student_oid}</p>
                <p className="mt-1 text-xs [color:var(--kc-muted)]">同步时间：{user.ccw_synced_at ? new Date(user.ccw_synced_at).toLocaleString('zh-CN') : '尚未同步'}</p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className="rounded-[26px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                  <p className="text-sm font-black [color:var(--kc-text)]">操作步骤</p>
                  <div className="mt-3 grid gap-3 text-sm [color:var(--kc-muted)]">
                    <p><span className="font-black [color:var(--kc-accent)]">1.</span> 点击生成验证码，得到类似 <span className="font-mono font-black [color:var(--kc-text)]">ABCD-2345</span> 的验证码。</p>
                    <p><span className="font-black [color:var(--kc-accent)]">2.</span> 打开指定 CCW 作品页面，在评论区发送验证码。</p>
                    <p><span className="font-black [color:var(--kc-accent)]">3.</span> 等待服务器自动检查，或点击“我已评论，立即检查”。</p>
                  </div>
                </div>
                <div className="rounded-[26px] border p-4 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                  <p className="text-xs font-black uppercase tracking-[0.16em] [color:var(--kc-muted)]">验证码</p>
                  <p className="mt-3 select-all rounded-[20px] px-4 py-5 font-mono text-3xl font-black tracking-[0.12em] [background:var(--kc-panel)] [color:var(--kc-accent)]">{challenge?.code ?? '---- ----'}</p>
                  <p className="mt-3 text-xs [color:var(--kc-muted)]">{challenge ? challengeVerified ? '绑定成功，请刷新资料' : challengeExpired ? '验证码已过期，请重新生成' : `有效期至 ${formatChinaTime(challenge.expires_at)}` : '还没有生成验证码'}</p>
                </div>
              </div>
            )}
            {challenge?.creation_url ? <button type="button" onClick={() => void openExternalUrl(challenge.creation_url)} className="inline-flex w-fit items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white [background:var(--kc-accent)]"><Icon name="external" className="h-4 w-4" />打开指定 CCW 作品</button> : null}
            {!user.ccw_student_oid ? <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => startBindingMutation.mutate()} disabled={startBindingMutation.isPending} className="rounded-2xl px-5 py-3 text-sm font-black text-white [background:var(--kc-accent)] disabled:opacity-50">{startBindingMutation.isPending ? '生成中...' : challengeExpired ? '重新生成验证码' : '生成绑定验证码'}</button>
              <button type="button" onClick={() => checkBindingMutation.mutate()} disabled={!challenge || checkBindingMutation.isPending} className="rounded-2xl border px-5 py-3 text-sm font-black [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[background:var(--kc-hover)] disabled:opacity-50">{checkBindingMutation.isPending ? '检查中...' : '我已评论，立即检查'}</button>
            </div> : null}
            {bindError ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{bindError}</p> : null}
            {challenge?.status === 'conflict' ? <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">这个 CCW 账号已经绑定到其他 KukeChat 用户。</p> : null}
            {challengeVerified ? <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">绑定成功，资料正在同步。</p> : null}
            {syncCcwMutation.error ? <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{syncCcwMutation.error instanceof Error ? syncCcwMutation.error.message : '同步失败'}</p> : null}
          </div>
        </section>
        </div>
      </div>
    </section>
  );
}

function formatCompact(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatChinaTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
}
