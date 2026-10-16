import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalStatus, useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import { useRedPacketMotion } from '@/components/redpacket/ui';
import { registerNativeBackHandler } from '@/native/back';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { GroupFile } from '@/types/groupPlus';
import { formatMessageDateTime } from '@/utils/dateTime';
import {
  describeGroupPlusError, isGroupStaff, useDeleteGroupFile, useGroupFiles, useGroupPlusInfo, useGroupPlusPlans, useSetFileDefaultTtl, useSetFilePermanent
} from '../data';
import { formatFileSize, formatRemaining, TIER_META, ttlLabel } from '../tier';
import { useGroupFileUploads } from '../uploads';
import { useGroupPlusUi } from '../ui';
import { downloadAndSave, downloadErrorText, fileIconName, fileRules } from './fileUtils';
import { queueGroupUploads } from './queue';

const EMPTY_CONVERSATIONS: Conversation[] = [];

/** 搜索框防抖：每个字都发请求会把列表闪成空白 */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** 文件行上的有效期文字 */
function expiryLabel(file: GroupFile): string {
  if (file.permanent) {
    return '永久';
  }
  if (file.expired) {
    return '已过期';
  }
  const left = formatRemaining(file.expires_at);
  if (!left) {
    return '已过期';
  }
  return file.temporary ? `临时 · 还剩 ${left}` : `还剩 ${left}`;
}

interface PanelProps {
  conversationId: number;
  mobile: boolean;
}

/** 面板正文：配额条、上传、文件列表、默认保留时长。桌面弹窗和移动整页共用，差别只在外壳。 */
function FilesBody({ conversationId, mobile }: PanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const motion = useRedPacketMotion();
  const me = useKukeStore((state) => state.currentUser);
  const openUpgrade = useGroupPlusUi((state) => state.openUpgrade);
  const { data: conversations } = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false });
  const conversation = (conversations ?? EMPTY_CONVERSATIONS).find((item) => item.id === conversationId) ?? null;
  const infoQuery = useGroupPlusInfo(conversationId);
  const info = infoQuery.data ?? null;
  const plans = useGroupPlusPlans().data ?? null;
  const staff = info?.can_purchase ?? isGroupStaff(conversation);

  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword.trim(), 250);
  const filesQuery = useGroupFiles(conversationId, q, null, true);
  const pages = filesQuery.data?.pages ?? [];
  const files = pages.flatMap((page) => page.items);
  const total = pages[0]?.total ?? 0;
  const quota = info?.files ?? pages[0]?.quota ?? null;

  const uploads = useGroupFileUploads((state) => state.tasks).filter((task) => task.conversationId === conversationId);
  const cancelUpload = useGroupFileUploads((state) => state.cancel);
  const dismissUpload = useGroupFileUploads((state) => state.dismiss);
  const retryUpload = useGroupFileUploads((state) => state.retry);

  const deleteMutation = useDeleteGroupFile(conversationId);
  const permanentMutation = useSetFilePermanent(conversationId);
  const ttlMutation = useSetFileDefaultTtl(conversationId);

  const [permanent, setPermanent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const state = quota?.state ?? 'locked';
  const canUpload = state === 'active';
  const hasHistory = total > 0 || q.length > 0;
  const locked = state === 'locked' && !hasHistory && !filesQuery.isLoading;
  const rules = quota ? fileRules(quota) : null;
  const usedRatio = quota && quota.quota_bytes > 0 ? Math.min(1, quota.used_bytes / quota.quota_bytes) : 0;
  // 「满了」：剩下的放不下一个临时文件那么大的东西，新文件基本都会变成临时文件
  const spaceFull = Boolean(rules && rules.hasSpace && rules.modern && rules.free < Math.max(1, rules.tempMax));
  const nearFull = usedRatio >= 0.9;
  const ttlOptions = plans?.file_ttl_options_hours ?? [24, 168, 720];
  const defaultTtl = quota?.default_ttl_hours ?? conversation?.file_default_ttl_hours ?? 24;
  const plusPlan = plans?.tiers.find((tier) => tier.key === 'pro_plus') ?? null;

  function pick(list: File[]): void {
    setNotice(quota ? queueGroupUploads(queryClient, conversationId, quota, list, { permanent: staff && permanent }) : '这个群还没有解锁群文件。');
  }

  async function download(file: GroupFile): Promise<void> {
    setRowBusy(file.id);
    setNotice(null);
    try {
      await downloadAndSave(conversationId, file.id, file.name);
    } catch (error) {
      setNotice(downloadErrorText(error));
      void filesQuery.refetch();
    } finally {
      setRowBusy(null);
    }
  }

  function remove(file: GroupFile): void {
    if (!window.confirm(`删除「${file.name}」？删除后文件和配额立即释放，群里已发的文件消息会显示文件已不存在。`)) {
      return;
    }
    setNotice(null);
    deleteMutation.mutate(file.id, { onError: (error) => setNotice(describeGroupPlusError(error).message) });
  }

  function togglePermanent(file: GroupFile): void {
    setNotice(null);
    permanentMutation.mutate({ fileId: file.id, permanent: !file.permanent }, { onError: (error) => setNotice(describeGroupPlusError(error).message) });
  }

  const upgradeButton = (label: string, focusTier: 'pro' | 'pro_plus' = 'pro_plus'): JSX.Element | null => (staff ? (
    <button type="button" className="kgp-files-cta" onClick={() => openUpgrade({ conversationId, reason: 'files', focusTier })}>{label}</button>
  ) : null);

  if (infoQuery.isLoading && filesQuery.isLoading) {
    return <ModalStatus>正在加载群文件…</ModalStatus>;
  }
  if (filesQuery.error && files.length === 0) {
    return (
      <div className="kui-empty">
        <p>群文件加载失败，请稍后重试。</p>
        <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" onClick={() => void filesQuery.refetch()}>重试</button>
      </div>
    );
  }

  if (locked) {
    const tiers = (plans?.tiers ?? []).filter((tier) => tier.key !== 'free' && tier.file_enabled);
    return (
      <div className={`kgp-files kgp-files-lock${mobile ? ' is-mobile' : ''}`} data-files-state="locked">
        <span className="kgp-files-lock-icon"><Icon name="folder" className="h-6 w-6" /></span>
        <h3>升级到 Pro 解锁群文件</h3>
        <p>所有成员都能往群里传文件；有群空间的档位，重要文件还可以永久保存。</p>
        <ul className="kgp-files-lock-list">
          {tiers.map((tier) => (
            <li key={tier.key}>
              <strong>{TIER_META[tier.key].label}</strong>
              <span>{tier.file_quota_bytes ? `${formatFileSize(tier.file_quota_bytes)} 群空间` : `24 小时临时文件${tier.file_temp_max_bytes ? ` · 单个 ${formatFileSize(tier.file_temp_max_bytes)}` : ''}`}</span>
            </li>
          ))}
        </ul>
        {staff ? upgradeButton('去升级', 'pro') : <p className="kgp-files-hint">请群主或管理员升级这个群。</p>}
      </div>
    );
  }

  // 上传区下面那一行说明：只说这次上传会怎样，空间够的时候不提单个大小
  const ruleLine = !rules ? '' : !rules.modern
    ? `单个最大 ${formatFileSize(rules.legacyMax)}，上传后会在群里发一条文件消息。`
    : !rules.hasSpace
      ? `文件保存 ${rules.tempTtlHours} 小时 · 单个最大 ${formatFileSize(rules.tempMax)}`
      : spaceFull
        ? `空间已满，新文件存为 ${rules.tempTtlHours} 小时临时文件 · 单个最大 ${formatFileSize(rules.tempMax)}`
        : `新文件保留 ${staff && permanent ? '永久' : ttlLabel(defaultTtl)}，同时在群里发一条文件消息`;

  return (
    <div
      className={`kgp-files${mobile ? ' is-mobile' : ''}${motion ? '' : ' is-still'}${dragging ? ' is-dragging' : ''}`}
      data-files-state={state}
      onDragOver={mobile ? undefined : (event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={mobile ? undefined : (event) => {
        if (event.currentTarget === event.target) {
          setDragging(false);
        }
      }}
      onDrop={mobile ? undefined : (event) => {
        event.preventDefault();
        setDragging(false);
        pick(Array.from(event.dataTransfer.files));
      }}
    >
      {quota && rules ? (
        rules.hasSpace || !rules.modern ? (
          <section className={`kgp-files-quota${nearFull ? ' is-warn' : ''}`} aria-label="群文件空间">
            <div className="kgp-files-quota-head">
              <span className="kgp-files-quota-num"><b>{formatFileSize(quota.used_bytes)}</b> / {formatFileSize(quota.quota_bytes)}</span>
              <em>{quota.file_count} 个文件</em>
            </div>
            <div className="kgp-files-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedRatio * 100)}>
              <span className="kgp-files-bar-fill" style={{ width: `${Math.max(Math.round(usedRatio * 100), quota.used_bytes > 0 ? 1 : 0)}%` }} />
            </div>
            {nearFull && state === 'active' ? (
              <p className="kgp-files-hint">{spaceFull ? '空间已满，之后上传的会是临时文件。' : '空间快满了。'}{staff ? '可以删掉不需要的文件，或升级档位。' : '请清理不需要的文件。'}</p>
            ) : null}
          </section>
        ) : (
          <section className="kgp-files-quota kgp-files-quota--temp" aria-label="群文件">
            <div className="kgp-files-quota-head">
              <span className="kgp-files-quota-num"><b>临时文件</b></span>
              <em>{quota.file_count} 个文件</em>
            </div>
            <p className="kgp-files-hint">这一档没有群空间：文件保存 {rules.tempTtlHours} 小时后自动清理。</p>
            {staff && plusPlan?.file_quota_bytes ? <button type="button" className="kgp-files-link" onClick={() => openUpgrade({ conversationId, reason: 'files', focusTier: 'pro_plus' })}>升级到 Pro+，获得 {formatFileSize(plusPlan.file_quota_bytes)} 群空间 ›</button> : null}
          </section>
        )
      ) : null}

      {state === 'grace' ? (
        <div className="kgp-files-grace" role="status">
          <span>宽限期内只读：可以查看、下载和删除，不能上传。{quota?.grace_until ? `${formatRemaining(quota.grace_until) ?? '不久'}后文件将被清理，` : ''}续费或重新开通后可恢复。</span>
          {upgradeButton('去续费')}
        </div>
      ) : null}

      {canUpload ? (
        <section className={`kgp-files-drop${dragging ? ' is-over' : ''}`}>
          <input ref={inputRef} type="file" multiple hidden onChange={(event) => {
            pick(Array.from(event.target.files ?? []));
            event.target.value = '';
          }} />
          <span className="kgp-files-drop-icon"><Icon name="upload" className="h-5 w-5" /></span>
          <span className="kgp-files-drop-text">
            <b>{mobile ? '上传文件' : '把文件拖到这里'}</b>
            <small>{ruleLine}</small>
          </span>
          {staff && rules?.hasSpace && !spaceFull ? (
            <label className="kgp-files-check" title="存为永久文件：不会到期清理，占群空间">
              <input type="checkbox" role="switch" className="kui-switch" checked={permanent} onChange={(event) => setPermanent(event.target.checked)} />
              <span>永久</span>
            </label>
          ) : null}
          <button type="button" className="kgp-files-cta" onClick={() => inputRef.current?.click()}>选择文件</button>
        </section>
      ) : null}

      {notice ? <p className="kgp-files-notice" role="alert">{notice}</p> : null}

      {uploads.length > 0 ? (
        <ul className="kgp-files-tasks" aria-label="上传任务">
          {uploads.map((task) => {
            const ratio = task.size > 0 ? Math.min(1, task.loaded / task.size) : 0;
            return (
              <li key={task.id} className={`kgp-files-task is-${task.status}`}>
                <div className="kgp-files-task-head">
                  <span className="kgp-files-task-name">{task.name}</span>
                  <span className="kgp-files-task-state">
                    {task.status === 'uploading' ? `${Math.round(ratio * 100)}%` : task.status === 'done' ? (task.temporary ? '已上传 · 临时文件' : '已上传') : task.status === 'canceled' ? '已取消' : '失败'}
                  </span>
                  {task.status === 'uploading' ? <button type="button" className="kgp-files-btn" onClick={() => cancelUpload(task.id)}>取消</button> : null}
                  {task.status === 'failed' ? <button type="button" className="kgp-files-btn" onClick={() => retryUpload(queryClient, task.id)}>重试</button> : null}
                  {task.status === 'failed' || task.status === 'canceled' ? <button type="button" className="kui-icon-btn" aria-label="移除" onClick={() => dismissUpload(task.id)}><Icon name="close" className="h-3.5 w-3.5" /></button> : null}
                </div>
                {task.status === 'uploading' ? <div className="kgp-files-bar"><span className="kgp-files-bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} /></div> : null}
                {task.status === 'failed' && task.error ? (
                  <p className="kgp-files-task-error" role="alert">{task.error}{task.code === 'quota_exceeded' || task.code === 'file_too_large' ? upgradeButton('去升级') : null}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="kgp-files-toolbar">
        <label className="kgp-files-search">
          <Icon name="search" className="h-3.5 w-3.5" />
          <input value={keyword} placeholder="搜索文件名" aria-label="搜索文件名" onChange={(event) => setKeyword(event.target.value)} />
        </label>
      </div>

      {files.length === 0 && !filesQuery.isLoading ? (
        <div className="kgp-files-empty">
          <Icon name="folder" className="h-6 w-6" />
          <p>{q ? '没有找到匹配的文件。' : '还没有文件，传第一个吧。'}</p>
        </div>
      ) : null}
      {filesQuery.isLoading ? <ModalStatus>正在加载文件…</ModalStatus> : null}

      <ul className="kgp-files-list">
        {files.map((file) => {
          const mine = me !== null && file.uploader_id === me.id;
          const canDelete = staff || mine;
          const urgent = !file.permanent && !file.expired && file.expires_at !== null && new Date(file.expires_at).getTime() - Date.now() < 6 * 3_600_000;
          const canPin = staff && (file.permanent || !rules || rules.hasSpace);
          return (
            <li key={file.id} className="kgp-files-row">
              <span className="kgp-file-icon"><Icon name={fileIconName(file.content_type, file.name)} className="h-5 w-5" /></span>
              <div className="kgp-files-row-main">
                <span className="kgp-file-name" title={file.name}>{file.name}</span>
                <span className="kgp-file-sub">
                  <span>{formatFileSize(file.size)}</span>
                  <span className={`kgp-files-expiry${file.permanent ? ' is-permanent' : ''}${file.temporary ? ' is-temp' : ''}${urgent ? ' is-urgent' : ''}`}>{expiryLabel(file)}</span>
                  <span className="kgp-files-uploader">
                    {file.uploader ? <Avatar user={file.uploader} size="sm" /> : null}
                    {file.uploader ? (file.uploader.nickname || file.uploader.username) : '已注销用户'}
                  </span>
                  <time>{formatMessageDateTime(file.created_at)}</time>
                </span>
              </div>
              <div className="kgp-files-row-actions">
                <button type="button" className="kui-icon-btn" title="下载" aria-label={`下载 ${file.name}`} disabled={rowBusy === file.id || file.expired} onClick={() => void download(file)}>
                  <Icon name={rowBusy === file.id ? 'refresh' : 'download'} className="h-4 w-4" />
                </button>
                {canPin ? (
                  <button type="button" className={`kui-icon-btn${file.permanent ? ' is-active' : ''}`} title={file.permanent ? '转回限时' : '转为永久'} aria-label={file.permanent ? '转回限时' : '转为永久'} aria-pressed={file.permanent} disabled={permanentMutation.isPending} onClick={() => togglePermanent(file)}>
                    <Icon name="pin" className="h-4 w-4" />
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className="kui-icon-btn kgp-files-del" title="删除" aria-label={`删除 ${file.name}`} disabled={deleteMutation.isPending} onClick={() => remove(file)}>
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {filesQuery.hasNextPage ? (
        <button type="button" className="kgp-files-more" disabled={filesQuery.isFetchingNextPage} onClick={() => void filesQuery.fetchNextPage()}>
          {filesQuery.isFetchingNextPage ? '加载中…' : '加载更多'}
        </button>
      ) : null}

      {staff && state !== 'locked' && (!rules || rules.hasSpace) ? (
        <section className="kgp-files-ttl">
          <div className="kgp-files-ttl-text">
            <h4>默认保留时长</h4>
            <p>只影响之后放进群空间的文件；永久文件和临时文件不受影响。</p>
          </div>
          <div className="kgp-files-seg" role="radiogroup" aria-label="默认保留时长">
            {ttlOptions.map((hours) => (
              <button key={hours} type="button" role="radio" aria-checked={defaultTtl === hours} disabled={ttlMutation.isPending} className={defaultTtl === hours ? 'is-active' : undefined} onClick={() => {
                if (hours !== defaultTtl) {
                  setNotice(null);
                  ttlMutation.mutate(hours, { onError: (error) => setNotice(describeGroupPlusError(error).message) });
                }
              }}>{ttlLabel(hours)}</button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function MobileFilesPage({ conversationId, onClose }: { conversationId: number; onClose: () => void }): JSX.Element {
  useEffect(() => registerNativeBackHandler(() => {
    onClose();
    return true;
  }, 170), [onClose]);
  return (
    <div className="fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-chat)] [color:var(--kc-text)]">
      <header className="flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full active:[background:var(--kc-hover)]" aria-label="返回聊天">
          <Icon name="chevronLeft" className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-[18px] font-semibold">群文件</h2>
          <p className="mt-1 truncate text-[12px] font-medium [color:var(--kc-muted)]">所有成员都能上传</p>
        </div>
        <span className="h-10 w-10 shrink-0" />
      </header>
      <main className="scroll-soft min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(var(--kc-native-safe-bottom,env(safe-area-inset-bottom))+16px)]">
        <FilesBody conversationId={conversationId} mobile />
      </main>
    </div>
  );
}

/** 群文件面板的宿主：读 useGroupPlusUi().files，桌面是弹窗，移动是整页。入口只管 openFiles(conversationId)。 */
export function GroupFilesHost(): JSX.Element | null {
  const target = useGroupPlusUi((state) => state.files);
  const close = useGroupPlusUi((state) => state.closeFiles);
  const desktop = useIsDesktopLayout();
  const { data: conversations } = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false });
  const title = useMemo(() => {
    const conversation = conversations?.find((item) => item.id === target?.conversationId);
    return conversation?.display_title?.trim() || conversation?.title || null;
  }, [conversations, target?.conversationId]);
  if (!target) {
    return null;
  }
  // key：换了群就是新的面板，搜索词、勾选都不带过去
  if (!desktop) {
    return <MobileFilesPage key={target.conversationId} conversationId={target.conversationId} onClose={close} />;
  }
  return (
    <Modal title="群文件" subtitle={title} className="kmd-modal--lg kmd-modal--tall" bodyClassName="kgp-files-modal" onClose={close}>
      <FilesBody key={target.conversationId} conversationId={target.conversationId} mobile={false} />
    </Modal>
  );
}
