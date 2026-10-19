import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clearConversationHistory, updateMyConversationSettings } from '@/api/conversations';
import { getSelfTransfers } from '@/api/selfChat';
import { fileIconName } from '@/components/groupPlus/files/fileUtils';
import { formatFileSize } from '@/components/groupPlus/tier';
import { useGroupPlusUi } from '@/components/groupPlus/ui';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import type { Conversation, SelfTransfer } from '@/types/api';
import { sortConversationsByActivity } from '@/utils/conversations';
import { LOCAL_DEVICE_CLASS, SELF_CHAT_TITLE, middleEllipsis, transferRemainingText } from '@/utils/selfChat';
import { DeviceAvatar } from './DeviceAvatar';
import { downloadSelfTransfer, isTransferGoneError, transferDownloadErrorText } from './download';
import { selfTransferKeys } from './transfers';

/**
 * 「我的设备」的会话资料（替换群聊 / 私聊的资料侧栏，self-chat.md 1.3 / 7.5）：
 * 只留置顶、免打扰、查找聊天记录、清空聊天记录，加一块「临时文件」—— 还能下载的文件、剩余有效期、额度。
 * 没有成员、资料、举报、退出：这个会话里只有自己，也不能删除。
 */
export function SelfChatInfoDrawer({ conversation, onClose }: { conversation: Conversation; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const conversationId = conversation.id;
  const transfersQuery = useQuery({ queryKey: selfTransferKeys.list(conversationId), queryFn: () => getSelfTransfers(conversationId), staleTime: 10_000 });
  const [pinned, setPinned] = useState(Boolean(conversation.my_pinned));
  const [muted, setMuted] = useState(Boolean(conversation.my_do_not_disturb || conversation.my_message_setting === 'silent'));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    const close = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', close);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('keydown', close);
    };
  }, [onClose]);

  const settings = useMutation({
    mutationFn: (payload: { pinned?: boolean; do_not_disturb?: boolean; message_setting?: 'notify' | 'silent' }) => updateMyConversationSettings(conversationId, payload),
    onMutate: (payload) => {
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => current && sortConversationsByActivity(current.map((item) => (item.id === conversationId ? {
        ...item,
        ...('pinned' in payload ? { my_pinned: payload.pinned } : {}),
        ...('do_not_disturb' in payload ? { my_do_not_disturb: payload.do_not_disturb } : {}),
        ...('message_setting' in payload ? { my_message_setting: payload.message_setting } : {})
      } : item))));
    },
    onError: () => {
      setPinned(Boolean(conversation.my_pinned));
      setMuted(Boolean(conversation.my_do_not_disturb));
      toast.error('设置没有保存，请稍后重试。');
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  });

  const clear = useMutation({
    mutationFn: () => clearConversationHistory(conversationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('聊天记录已清空', { subtitle: '临时文件不受影响，24 小时内仍可在这里下载' });
    },
    onError: () => toast.error('清空聊天记录失败，请稍后重试。')
  });

  const data = transfersQuery.data;
  const usedRatio = data && data.quota_bytes > 0 ? Math.min(1, data.used_bytes / data.quota_bytes) : 0;

  return (
    <div className="kci kself-info">
      <div className="kui-drawer-backdrop" aria-hidden="true" onClick={onClose} />
      <aside className="kui-drawer" aria-label="聊天资料">
        <header className="kci-bar">
          <h2>聊天资料</h2>
          <button type="button" className="kui-icon-btn" aria-label="关闭聊天资料" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kci-body kui-scroll">
          <section className="kui-group">
            <div className="kci-head">
              <DeviceAvatar kind={LOCAL_DEVICE_CLASS === 'computer' ? 'phone' : 'computer'} size="lg" />
              <div className="kci-head-text">
                <h3 className="kci-head-name">{SELF_CHAT_TITLE}</h3>
                <p className="kci-head-meta">只有你自己 · 手机和电脑互传</p>
              </div>
            </div>
          </section>

          <section className="kui-group">
            <div className="kui-group-title"><span>临时文件</span>{transfersQuery.isFetching ? <span className="kself-info-muted">刷新中…</span> : null}</div>
            <p className="kci-hint">文件发出后保留 24 小时，到期自动删除，过期后不能再下载；临时文件不能收藏、不能转发，撤回文件消息会立刻删掉文件。</p>
            {data && data.quota_bytes > 0 ? (
              <div className="kself-quota">
                <div className="kself-quota-line">
                  <span>已用 {formatFileSize(data.used_bytes)} / {formatFileSize(data.quota_bytes)}</span>
                  <span>单个最大 {formatFileSize(data.max_file_bytes)}</span>
                </div>
                <span className="kself-quota-bar" role="progressbar" aria-label="临时文件空间" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedRatio * 100)}>
                  <span className={usedRatio >= 0.9 ? 'is-full' : undefined} style={{ transform: `scaleX(${usedRatio})` }} />
                </span>
              </div>
            ) : null}
            {transfersQuery.isLoading ? <p className="kself-info-empty">正在加载…</p> : null}
            {transfersQuery.isError ? <p className="kself-info-empty">临时文件列表加载失败，<button type="button" className="kself-link" onClick={() => void transfersQuery.refetch()}>重试</button></p> : null}
            {data && data.items.length === 0 ? <p className="kself-info-empty">现在没有有效的临时文件</p> : null}
            {data && data.items.length > 0 ? (
              <ul className="kself-transfer-list">
                {data.items.map((item) => <TransferRow key={item.id} item={item} now={now} onGone={() => void transfersQuery.refetch()} />)}
              </ul>
            ) : null}
          </section>

          <section className="kui-group">
            <label className="kui-row">
              <span className="kui-row-label">设为置顶</span>
              <input type="checkbox" role="switch" className="kui-switch" checked={pinned} disabled={settings.isPending} onChange={(event) => {
                setPinned(event.target.checked);
                settings.mutate({ pinned: event.target.checked });
              }} />
            </label>
            <label className="kui-row">
              <span className="kui-row-label">消息免打扰<span className="kui-row-hint">手机发来的消息不响、不弹通知</span></span>
              <input type="checkbox" role="switch" className="kui-switch" checked={muted} disabled={settings.isPending} onChange={(event) => {
                setMuted(event.target.checked);
                settings.mutate({ do_not_disturb: event.target.checked, message_setting: event.target.checked ? 'silent' : 'notify' });
              }} />
            </label>
          </section>

          <section className="kui-group">
            <button type="button" className="kui-row" onClick={() => {
              useGroupPlusUi.getState().openChatSearch({ conversationId, title: SELF_CHAT_TITLE });
              onClose();
            }}>
              <span className="kui-row-label">查找聊天记录</span>
              <Icon name="chevron" className="kci-row-arrow" />
            </button>
            <button type="button" className="kui-row kci-row--danger" disabled={clear.isPending} onClick={() => {
              if (window.confirm('清空「我的手机」的聊天记录？只影响这个账号自己看到的记录，临时文件照常保留到过期。')) {
                clear.mutate();
              }
            }}>
              <span className="kui-row-label">{clear.isPending ? '正在清空…' : '清空聊天记录'}</span>
            </button>
          </section>
        </div>
      </aside>
    </div>
  );
}

function TransferRow({ item, now, onGone }: { item: SelfTransfer; now: number; onGone: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const remaining = transferRemainingText(item.expires_at, now);
  return (
    <li>
      <button type="button" className="kself-transfer-row" title={`下载 ${item.name}`} disabled={busy || !remaining} onClick={() => {
        setBusy(true);
        downloadSelfTransfer(item.conversation_id, item.id, item.name).catch((error: unknown) => {
          toast.error(transferDownloadErrorText(error));
          if (isTransferGoneError(error)) {
            onGone();
          }
        }).finally(() => setBusy(false));
      }}>
        <span className="kself-transfer-icon"><Icon name={fileIconName(item.content_type, item.name)} className="h-4 w-4" /></span>
        <span className="kself-transfer-main">
          <span className="kself-transfer-name">{middleEllipsis(item.name, 32)}</span>
          <span className="kself-transfer-sub">{formatFileSize(item.size)} · {item.device === 'android' || item.device === 'ios' ? '手机' : '电脑'}发送 · {remaining ?? '已过期'}</span>
        </span>
        <Icon name={busy ? 'refresh' : 'download'} className={`h-4 w-4 kself-transfer-dl${busy ? ' kgp-file-spin' : ''}`} />
      </button>
    </li>
  );
}
