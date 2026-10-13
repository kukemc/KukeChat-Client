import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pokeOptionsQuery, updateMyProfile } from '@/api/users';
import { useKukeStore } from '@/store/kukeStore';
import type { User } from '@/types/api';
import { pokeActionLabel, pokeVerb } from '@/utils/poke';
import { Card, Choice, Field, Notice, btn, inputClass } from './settingsUi';

interface Draft {
  action: string;
  suffix: string;
}

/**
 * 「别人戳我时」的动作和后缀：聊天里显示成「某某 拍了拍 你 的小脑袋」。
 * 这一项自己保存，不跟资料页底部的保存条走 —— 后缀要过文本审核，被拒时错误得落在这张卡片里。
 */
export function PokeSetting({ user }: { user: User }): JSX.Element {
  const queryClient = useQueryClient();
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const options = useQuery(pokeOptionsQuery);
  const actions = options.data?.actions ?? [];
  const defaultAction = options.data?.default_action ?? '';
  const maxLength = options.data?.suffix_max_length ?? 16;

  // 预设调整后，资料里存的旧动作可能已经不在表里，服务端会按默认动作处理，这里也一样
  const saved: Draft = { action: user.poke_action && actions.includes(user.poke_action) ? user.poke_action : defaultAction, suffix: user.poke_suffix ?? '' };
  // 没动过就跟着已保存的值走（别处改了资料、动作列表晚到都不用同步）
  const [draft, setDraft] = useState<Draft | null>(null);
  const current = draft ?? saved;
  const suffix = current.suffix.trim();
  const dirty = current.action !== saved.action || suffix !== saved.suffix;
  const isDefault = current.action === defaultAction && !suffix;

  const save = useMutation({
    mutationFn: () => updateMyProfile({ poke_action: current.action, poke_suffix: suffix }),
    onSuccess: (updated) => {
      setCurrentUser(updated);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
  const edit = (patch: Partial<Draft>): void => {
    setDraft({ ...current, ...patch });
    save.reset();
  };

  return (
    <Card title="戳一戳" description="别人双击你的头像，聊天里会留下一行字。用哪个动作、名字后面接什么话，由你来定。" padded>
      {options.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><Notice tone="info">动作列表暂时加载不出来，稍后再试。</Notice></div>
          <button type="button" className={btn.secondary} onClick={() => void options.refetch()}>重试</button>
        </div>
      ) : (
        <div className="grid gap-3">
          {/* 不用 Field：它是 <label>，点到按钮之间的空隙会选中第一个动作 */}
          <div className="grid min-w-0 gap-1.5">
            <span className="text-xs font-semibold [color:var(--kc-muted)]">动作</span>
            {options.data
              ? <div><Choice value={current.action} options={actions.map((action) => ({ value: action, label: pokeActionLabel(action) }))} onChange={(action) => edit({ action })} /></div>
              : <span className="text-[13px] [color:var(--kc-muted)]">正在加载…</span>}
          </div>
          <Field label="名字后面接的话" hint={`${Array.from(current.suffix).length}/${maxLength}，留空就只显示动作。保存时会过一遍文本审核。`}>
            <input className={inputClass} value={current.suffix} maxLength={maxLength} placeholder="例如：的小脑袋" onChange={(event) => edit({ suffix: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && dirty && !save.isPending) save.mutate(); }} />
          </Field>
          <div className="grid min-w-0 gap-1.5">
            <span className="text-xs font-semibold [color:var(--kc-muted)]">预览</span>
            <p className="break-words rounded-xl px-3 py-3 text-center text-xs [background:var(--kc-panel-muted)] [color:var(--kc-muted)]" aria-live="polite">
              某某 {pokeVerb(current.action)} 你{suffix ? ` ${suffix}` : ''}
            </p>
          </div>
          {save.isError ? <Notice tone="error">{save.error instanceof Error && save.error.message ? save.error.message : '保存失败，请稍后再试'}</Notice> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {save.isSuccess && !dirty ? <span className="mr-auto text-xs [color:var(--kc-muted)]">已保存</span> : null}
            {isDefault ? null : <button type="button" className={btn.ghost} disabled={save.isPending} onClick={() => edit({ action: defaultAction, suffix: '' })}>恢复默认</button>}
            <button type="button" className={btn.primary} disabled={!dirty || save.isPending || !options.data} onClick={() => save.mutate()}>{save.isPending ? '保存中…' : '保存'}</button>
          </div>
        </div>
      )}
    </Card>
  );
}
