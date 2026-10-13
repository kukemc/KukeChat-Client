import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { confirmPasswordChange, createPasswordChangeChallenge } from '@/api/auth';
import { checkCcwBindingChallenge, getMyCcwBindingChallenge, startCcwBindingChallenge, syncMyCcwProfile, unbindMyCcwProfile } from '@/api/ccw';
import { ccwStudentProfileUrl } from '@/config';
import { Icon } from '@/components/ui/Icon';
import { useKukeStore } from '@/store/kukeStore';
import type { CcwPasswordChallengeInfo, User } from '@/types/api';
import { resolveThumbnailUrl } from '@/utils/assetUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { Card, ConfirmLayer, Notice, Row, SettingsPage, btn, formatChinaDateTime, inputClass } from './settingsUi';

function compact(value?: number | null): string {
  return typeof value === 'number' ? Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : '—';
}

function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

function CopyCode({ code }: { code: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" title="点击复制" onClick={() => void navigator.clipboard?.writeText(code).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); })}
      className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-mono text-2xl font-bold tracking-[0.14em] transition [background:var(--kc-panel-muted)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]">
      {code}<span className="text-xs font-sans font-semibold tracking-normal [color:var(--kc-muted)]">{copied ? '已复制' : '复制'}</span>
    </button>
  );
}

function CcwCard({ user }: { user: User }): JSX.Element {
  const queryClient = useQueryClient();
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const [confirm, setConfirm] = useState<'sync' | 'unbind' | null>(null);
  const bound = Boolean(user.ccw_student_oid);
  const challengeQuery = useQuery({
    queryKey: ['ccw-binding', 'me'],
    queryFn: getMyCcwBindingChallenge,
    enabled: !bound,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 5_000 : false)
  });
  const challenge = challengeQuery.data ?? null;
  const applyUser = (updated: User): void => { setConfirm(null); setCurrentUser(updated); queryClient.setQueryData(['me'], updated); void queryClient.invalidateQueries({ queryKey: ['me'] }); };
  const start = useMutation({ mutationFn: startCcwBindingChallenge, onSuccess: (data) => queryClient.setQueryData(['ccw-binding', 'me'], data) });
  const check = useMutation({
    mutationFn: checkCcwBindingChallenge,
    onSuccess: (data) => { queryClient.setQueryData(['ccw-binding', 'me'], data); if (data?.status === 'verified') void queryClient.invalidateQueries({ queryKey: ['me'] }); }
  });
  const sync = useMutation({ mutationFn: syncMyCcwProfile, onSuccess: applyUser });
  const unbind = useMutation({ mutationFn: unbindMyCcwProfile, onSuccess: (updated) => { applyUser(updated); queryClient.setQueryData(['ccw-binding', 'me'], null); } });
  const error = errorMessage(start.error) ?? errorMessage(check.error) ?? errorMessage(sync.error) ?? errorMessage(unbind.error);

  if (bound) {
    const avatar = resolveThumbnailUrl(user.ccw_avatar_url);
    const profileUrl = ccwStudentProfileUrl(user.ccw_student_oid as string);
    return (
      <Card title="CCW 账号" description={`已绑定，资料同步于 ${formatChinaDateTime(user.ccw_synced_at)}`} padded>
        <div className="flex items-center gap-3">
          {avatar ? <img src={avatar} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-white [background:var(--kc-accent)]"><Icon name="ccw" className="h-6 w-6" /></span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold [color:var(--kc-text)]">{user.ccw_name || user.ccw_student_oid}</p>
            <p className="line-clamp-1 text-xs [color:var(--kc-muted)]">{user.ccw_bio || '没有公开简介'}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[['粉丝', user.ccw_follower_count], ['获赞', user.ccw_like_count], ['作品', user.ccw_creation_count], ['浏览', user.ccw_view_count]].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl py-2 [background:var(--kc-panel-muted)]"><p className="text-sm font-semibold tabular-nums [color:var(--kc-text)]">{compact(value as number)}</p><p className="text-[11px] [color:var(--kc-muted)]">{label}</p></div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={btn.secondary} onClick={() => void openExternalUrl(profileUrl)}><Icon name="external" className="h-4 w-4" />打开 CCW 主页</button>
          <button type="button" className={btn.secondary} disabled={sync.isPending} onClick={() => sync.mutate(false)}><Icon name="refresh" className="h-4 w-4" />{sync.isPending && !confirm ? '刷新中…' : '刷新数据'}</button>
          <button type="button" className={btn.secondary} onClick={() => setConfirm('sync')}><Icon name="sparkles" className="h-4 w-4" />用 CCW 资料覆盖</button>
          <button type="button" className={`${btn.danger} ml-auto`} onClick={() => setConfirm('unbind')}>解绑</button>
        </div>
        {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
        {confirm === 'sync' ? <ConfirmLayer title="用 CCW 资料覆盖？" message="会用 CCW 上的昵称、头像、简介和封面覆盖你现在的 KukeChat 资料。账号、密码和聊天记录不受影响。" confirmText="覆盖" pending={sync.isPending} onCancel={() => setConfirm(null)} onConfirm={() => sync.mutate(true)} /> : null}
        {confirm === 'unbind' ? <ConfirmLayer title="解绑 CCW 账号？" message="解绑后主页不再展示 CCW 资料，也不能再通过 CCW 验证码修改密码。之后可以重新绑定。" confirmText="解绑" danger pending={unbind.isPending} onCancel={() => setConfirm(null)} onConfirm={() => unbind.mutate()} /> : null}
      </Card>
    );
  }

  return (
    <Card title="绑定 CCW 账号" description="绑定后可以同步 CCW 资料，并在忘记密码时自助找回。" padded>
      <ol className="grid gap-2 text-[13px] [color:var(--kc-text)]">
        {['生成验证码', '用你的 CCW 账号，把验证码发到指定作品的评论区', '系统每 5 秒自动检查一次，检测到就绑定成功'].map((step, index) => (
          <li key={step} className="flex gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{index + 1}</span>{step}</li>
        ))}
      </ol>
      {challenge && challenge.status !== 'expired' ? (
        <div className="mt-4 grid gap-2">
          <CopyCode code={challenge.code} />
          <p className="text-center text-xs [color:var(--kc-muted)]">{challenge.status === 'verified' ? '绑定成功，资料马上刷新' : `${formatChinaDateTime(challenge.expires_at)} 前有效 · 正在自动检查`}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn.primary} disabled={start.isPending} onClick={() => start.mutate()}>{start.isPending ? '生成中…' : challenge ? '重新生成验证码' : '生成验证码'}</button>
        {challenge?.creation_url ? <button type="button" className={btn.secondary} onClick={() => void openExternalUrl(challenge.creation_url)}><Icon name="external" className="h-4 w-4" />打开评论作品</button> : null}
        {challenge ? <button type="button" className={btn.secondary} disabled={check.isPending} onClick={() => check.mutate()}>{check.isPending ? '检查中…' : '立即检查'}</button> : null}
      </div>
      {challenge?.status === 'conflict' ? <div className="mt-3"><Notice tone="warning">这个 CCW 账号已经绑定了其他 KukeChat 账号。</Notice></div> : null}
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}
    </Card>
  );
}

function PasswordCard({ user }: { user: User }): JSX.Element {
  const [challenge, setChallenge] = useState<CcwPasswordChallengeInfo | null>(null);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [autoRetry, setAutoRetry] = useState(false);
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: createPasswordChangeChallenge,
    onSuccess: (info) => { setChallenge(info); setError(''); setDone(false); },
    onError: (err) => setError(errorMessage(err) ?? '生成验证码失败')
  });
  const confirm = useMutation({
    mutationFn: () => confirmPasswordChange({ code: challenge?.code ?? '', new_password: password }),
    onSuccess: () => { setDone(true); setAutoRetry(false); setError(''); setPassword(''); },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) { setAutoRetry(true); setError('还没在评论区看到验证码，每 5 秒自动重试，评论发出后会自动完成。'); }
      else { setAutoRetry(false); setError(errorMessage(err) ?? '修改失败，请稍后再试'); }
    }
  });
  useEffect(() => {
    if (!autoRetry || done) return undefined;
    const timer = window.setInterval(() => { if (!confirm.isPending) confirm.mutate(); }, 5000);
    return () => window.clearInterval(timer);
  }, [autoRetry, done, confirm]);

  if (!user.ccw_student_oid) {
    return <Card title="修改密码" padded><Notice tone="info">修改密码需要先绑定 CCW 账号，用来验证是你本人。</Notice></Card>;
  }
  return (
    <Card title="修改密码" description="通过 CCW 评论验证码确认是本人，不需要旧密码。" padded>
      {done ? (
        <div className="grid gap-3"><Notice tone="success">密码已修改，下次登录请使用新密码。</Notice><div><button type="button" className={btn.secondary} onClick={() => { setDone(false); setChallenge(null); }}>再次修改</button></div></div>
      ) : challenge ? (
        <div className="grid gap-3">
          <CopyCode code={challenge.code} />
          <p className="text-xs leading-5 [color:var(--kc-muted)]">10 分钟内有效。用已绑定的 CCW 账号把验证码发到<button type="button" onClick={() => void openExternalUrl(challenge.comment_url)} className="mx-1 font-semibold underline [color:var(--kc-accent)]">这个作品的评论区</button>，然后填写新密码提交。</p>
          <div className="flex gap-2">
            <input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="新密码，至少 6 位" />
            <button type="button" className={btn.primary} disabled={password.length < 6 || confirm.isPending} onClick={() => { setError(''); confirm.mutate(); }}>{confirm.isPending ? '验证中…' : '提交'}</button>
          </div>
        </div>
      ) : (
        <button type="button" className={btn.primary} disabled={create.isPending} onClick={() => create.mutate()}><Icon name="lock" className="h-4 w-4" />{create.isPending ? '生成中…' : '开始修改密码'}</button>
      )}
      {error ? <div className="mt-3"><Notice tone={autoRetry ? 'warning' : 'error'}>{error}</Notice></div> : null}
    </Card>
  );
}

export function AccountSection({ user, onLogout }: { user: User; onLogout?: () => void }): JSX.Element {
  return (
    <SettingsPage title="账号与安全" description="登录信息、CCW 绑定和密码。">
      <Card>
        <Row icon="profile" title="用户名" description={`@${user.username}`} />
        <Row icon="info" title="用户 ID" description={String(user.id)}>
          <button type="button" className={btn.ghost} onClick={() => void navigator.clipboard?.writeText(String(user.id))}>复制</button>
        </Row>
      </Card>
      <CcwCard user={user} />
      <PasswordCard user={user} />
      {onLogout ? (
        <Card>
          <Row icon="logout" title="退出登录" description="退出当前账号，回到登录页。">
            <button type="button" className={btn.danger} onClick={onLogout}>退出登录</button>
          </Row>
        </Card>
      ) : null}
    </SettingsPage>
  );
}
