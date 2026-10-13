import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getGameModeSettings, updateGameModeSettings } from '@/api/game';
import { normalizeCreationOid } from '../../info/shared';
import { EditableRow, Section, SwitchRow } from './controls';
import { useInfo } from './infoContext';
import { useDraft } from './infoData';

const CREATION_OID_PATTERN = /^[0-9a-f]{24}$/;

/** 游戏模式：把本群绑定到一个作品。只有群主能配置，后端也只放行群主。 */
export function GameModeSection(): JSX.Element {
  const { conversation } = useInfo();
  const queryClient = useQueryClient();
  const conversationId = conversation.id;
  const [error, setError] = useState('');

  const settingsQuery = useQuery({
    queryKey: ['game-mode', conversationId],
    queryFn: () => getGameModeSettings(conversationId)
  });
  const enabled = Boolean(settingsQuery.data?.enabled);
  const savedOid = settingsQuery.data?.creation_oid ?? '';
  // 没开启时作品 ID 只留在本地，等打开开关时一起提交
  const [oid, setOid] = useDraft(savedOid);

  const mutation = useMutation({
    mutationFn: ({ enabled: nextEnabled, creationOid }: { enabled: boolean; creationOid: string | null }) => updateGameModeSettings(conversationId, nextEnabled, creationOid),
    onSuccess: (result) => {
      setError('');
      setOid(result.creation_oid ?? '');
      void queryClient.invalidateQueries({ queryKey: ['game-mode', conversationId] });
    },
    // 后端会明确说明拒绝原因（非公开群、缺作品 ID 等），直接透传给群主
    onError: (cause: unknown) => setError(cause instanceof Error ? cause.message : '保存失败，请稍后重试。')
  });

  function toggle(next: boolean): void {
    if (!next) {
      mutation.mutate({ enabled: false, creationOid: null });
      return;
    }
    const creationOid = normalizeCreationOid(oid);
    if (!CREATION_OID_PATTERN.test(creationOid)) {
      setError('请先填写要绑定的作品 ID（24 位，可直接粘贴作品链接）。');
      return;
    }
    mutation.mutate({ enabled: true, creationOid });
  }

  function saveOid(value: string): void {
    setOid(value);
    if (!enabled) {
      return;
    }
    const creationOid = normalizeCreationOid(value);
    if (!CREATION_OID_PATTERN.test(creationOid)) {
      setError('作品 ID 应为 24 位十六进制，可直接粘贴作品链接。');
      return;
    }
    if (creationOid !== savedOid) {
      mutation.mutate({ enabled: true, creationOid });
    }
  }

  return (
    <Section title="游戏模式">
      <EditableRow label="绑定作品 ID" value={oid} placeholder="粘贴作品链接或 ID" disabled={mutation.isPending} onSave={saveOid} />
      <SwitchRow label="开启游戏模式" checked={enabled} disabled={mutation.isPending || settingsQuery.isLoading} onChange={toggle} />
      {error ? <p className="kui-note kui-note--danger kci-note" role="alert">{error}</p> : null}
      <p className="kui-note kui-note--warn kci-note">
        开启后，绑定作品里的玩家可以直接收发本群消息。<strong>本群近期聊天记录会对所有游玩该作品的人可见，包括未登录访客</strong>，因此仅公开群可以开启。玩家发言时会自动入群，你原有的禁言与成员管理照常生效。
      </p>
    </Section>
  );
}
