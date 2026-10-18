import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getConversations } from '@/api/conversations';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalStatus, useIsDesktopLayout } from '@/components/ui/desktop/Modal';
import { useRedPacketMotion } from '@/components/redpacket/ui';
import { registerNativeBackHandler } from '@/native/back';
import { useKukeStore } from '@/store/kukeStore';
import type { Conversation } from '@/types/api';
import type { GroupFile, GroupFileFolder, GroupFilePage } from '@/types/groupPlus';
import { formatMessageDateTime } from '@/utils/dateTime';
import {
  describeFolderError, describeGroupPlusError, groupPlusErrorCode, isGroupStaff, useCreateGroupFolder, useDeleteGroupFile, useDeleteGroupFolder, useGroupFiles,
  useGroupPlusInfo, useGroupPlusPlans, useMoveGroupFiles, useRenameGroupFolder, useSetFileDefaultTtl, useSetFilePermanent
} from '../data';
import { formatFileSize, formatRemaining, TIER_META, ttlLabel } from '../tier';
import { useGroupFileUploads } from '../uploads';
import { useGroupPlusUi } from '../ui';
import { downloadAndSave, downloadErrorText, fileIconName, fileRules, isPlayableVideo } from './fileUtils';
import { DeleteFolderDialog, FolderMenu, FolderNameDialog, folderStats, MoveFileDialog } from './FolderParts';
import { queueGroupUploads } from './queue';

const EMPTY_CONVERSATIONS: Conversation[] = [];
const EMPTY_FOLDERS: GroupFileFolder[] = [];
/** 面板里把文件行拖到文件夹行上：dataTransfer 里带的类型（和系统拖进来的 Files 分开） */
const FILE_DRAG_TYPE = 'application/x-kukechat-group-file';

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

/** 列表回包里和文件夹有关的部分。换文件夹时新列表还没回来，先用上一次的，免得文件夹、按钮闪一下 */
type FolderMeta = Pick<GroupFilePage, 'folders' | 'folder' | 'folder_limit' | 'can_manage_folders' | 'can_tidy_folders'>;

type FolderDialogState =
  | { kind: 'create' }
  | { kind: 'rename'; folder: GroupFileFolder }
  | { kind: 'delete'; folder: GroupFileFolder }
  | { kind: 'move'; file: GroupFile };

interface PanelProps {
  conversationId: number;
  mobile: boolean;
}

/** 面板正文：配额条、上传、文件夹、文件列表、默认保留时长。桌面弹窗和移动整页共用，差别只在外壳。 */
function FilesBody({ conversationId, mobile }: PanelProps): JSX.Element {
  const queryClient = useQueryClient();
  const motion = useRedPacketMotion();
  const me = useKukeStore((state) => state.currentUser);
  const openUpgrade = useGroupPlusUi((state) => state.openUpgrade);
  const openVideo = useGroupPlusUi((state) => state.openVideo);
  const { data: conversations } = useQuery({ queryKey: ['conversations'], queryFn: getConversations, enabled: false });
  const conversation = (conversations ?? EMPTY_CONVERSATIONS).find((item) => item.id === conversationId) ?? null;
  const infoQuery = useGroupPlusInfo(conversationId);
  const info = infoQuery.data ?? null;
  const plans = useGroupPlusPlans().data ?? null;
  const staff = info?.can_purchase ?? isGroupStaff(conversation);

  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword.trim(), 250);
  const searching = q.length > 0;
  // 现在看的文件夹（null 是根目录）。搜索时跨所有文件夹，不看它，但退出搜索后回到原来的位置
  const [folderId, setFolderId] = useState<number | null>(null);
  const filesQuery = useGroupFiles(conversationId, q, null, true, folderId);
  const pages = filesQuery.data?.pages ?? [];
  const files = pages.flatMap((page) => page.items);
  const total = pages[0]?.total ?? 0;
  const quota = info?.files ?? pages[0]?.quota ?? null;

  const lastMeta = useRef<FolderMeta | null>(null);
  if (pages[0]) {
    lastMeta.current = pages[0];
  }
  const meta = pages[0] ?? lastMeta.current;
  // 旧服务端的列表没有 folders：没有文件夹功能，界面和以前一样
  const folderFeature = Array.isArray(meta?.folders);
  const folders = meta?.folders ?? EMPTY_FOLDERS;
  const canManage = folderFeature && meta?.can_manage_folders === true;
  const canTidy = folderFeature && meta?.can_tidy_folders === true;
  const folderLimit = meta?.folder_limit ?? 50;
  const currentFolder = folderId === null ? null : (pages[0]?.folder?.id === folderId ? pages[0].folder : null) ?? folders.find((item) => item.id === folderId) ?? null;
  const inFolder = folderId !== null && !searching;

  const uploads = useGroupFileUploads((state) => state.tasks).filter((task) => task.conversationId === conversationId);
  const cancelUpload = useGroupFileUploads((state) => state.cancel);
  const dismissUpload = useGroupFileUploads((state) => state.dismiss);
  const retryUpload = useGroupFileUploads((state) => state.retry);

  const deleteMutation = useDeleteGroupFile(conversationId);
  const permanentMutation = useSetFilePermanent(conversationId);
  const ttlMutation = useSetFileDefaultTtl(conversationId);
  const createFolderMutation = useCreateGroupFolder(conversationId);
  const renameFolderMutation = useRenameGroupFolder(conversationId);
  const deleteFolderMutation = useDeleteGroupFolder(conversationId);
  const moveMutation = useMoveGroupFiles(conversationId);

  const [permanent, setPermanent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeUpgrade, setNoticeUpgrade] = useState(false);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dialog, setDialog] = useState<FolderDialogState | null>(null);
  const [dialogError, setDialogError] = useState<{ message: string; upgrade: boolean } | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  // 正在拖的面板里的文件、悬停在哪个放置目标上（文件夹 id；'root' 是面包屑上的「群文件」）
  const [draggingFile, setDraggingFile] = useState<GroupFile | null>(null);
  const [dropTarget, setDropTarget] = useState<number | 'root' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const say = useCallback((text: string | null, upgrade = false): void => {
    setNotice(text);
    setNoticeUpgrade(upgrade);
  }, []);

  // 正在看的文件夹没了（别人删了，实时事件触发重拉后 404 folder_not_found）：回到根目录
  const listErrorCode = groupPlusErrorCode(filesQuery.error);
  useEffect(() => {
    if (folderId !== null && listErrorCode === 'folder_not_found') {
      setFolderId(null);
      setMenuFor(null);
      say('这个文件夹刚被删除了，里面的文件已移回根目录。');
    }
  }, [folderId, listErrorCode, say]);

  // 移动端的系统返回键：在文件夹里先回根目录，再交给外层关面板
  useEffect(() => {
    if (!mobile || !inFolder) {
      return undefined;
    }
    return registerNativeBackHandler(() => {
      setFolderId(null);
      return true;
    }, 175);
  }, [mobile, inFolder]);

  const state = quota?.state ?? 'locked';
  const canUpload = state === 'active';
  const hasHistory = total > 0 || q.length > 0 || folderId !== null || folders.length > 0;
  const locked = state === 'locked' && !hasHistory && !filesQuery.isLoading;
  const rules = quota ? fileRules(quota) : null;
  const usedRatio = quota && quota.quota_bytes > 0 ? Math.min(1, quota.used_bytes / quota.quota_bytes) : 0;
  // 「满了」：剩下的放不下一个临时文件那么大的东西，新文件基本都会变成临时文件
  const spaceFull = Boolean(rules && rules.hasSpace && rules.modern && rules.free < Math.max(1, rules.tempMax));
  const nearFull = usedRatio >= 0.9;
  const ttlOptions = plans?.file_ttl_options_hours ?? [24, 168, 720];
  const defaultTtl = quota?.default_ttl_hours ?? conversation?.file_default_ttl_hours ?? 24;
  const plusPlan = plans?.tiers.find((tier) => tier.key === 'pro_plus') ?? null;
  // 降档后（folders_enabled = false）不能传进文件夹：在文件夹里上传的放根目录
  const foldersWritable = quota?.folders_enabled !== false;
  const uploadFolder = inFolder && foldersWritable && currentFolder ? currentFolder : null;

  function openFolder(id: number | null): void {
    setMenuFor(null);
    setFolderId(id);
    setKeyword('');
    say(null);
  }

  function pick(list: File[], target: GroupFileFolder | null = uploadFolder): void {
    if (list.length === 0) {
      return;
    }
    say(quota ? queueGroupUploads(queryClient, conversationId, quota, list, { permanent: staff && permanent, folderId: target?.id ?? null }) : '这个群还没有解锁群文件。');
  }

  async function download(file: GroupFile): Promise<void> {
    setRowBusy(file.id);
    say(null);
    try {
      await downloadAndSave(conversationId, file.id, file.name);
    } catch (error) {
      say(downloadErrorText(error));
      void filesQuery.refetch();
    } finally {
      setRowBusy(null);
    }
  }

  function play(file: GroupFile): void {
    say(null);
    openVideo({
      conversationId,
      fileId: file.id,
      name: file.name,
      size: file.size,
      // 打开时才发现过期 / 被删了：刷新列表，让这一行消失或变成已过期
      onUnavailable: () => void filesQuery.refetch()
    });
  }

  function remove(file: GroupFile): void {
    if (!window.confirm(`删除「${file.name}」？删除后文件和配额立即释放，群里已发的文件消息会显示文件已不存在。`)) {
      return;
    }
    say(null);
    deleteMutation.mutate(file.id, { onError: (error) => say(describeGroupPlusError(error).message) });
  }

  function togglePermanent(file: GroupFile): void {
    say(null);
    permanentMutation.mutate({ fileId: file.id, permanent: !file.permanent }, { onError: (error) => say(describeGroupPlusError(error).message) });
  }

  function openDialog(next: FolderDialogState): void {
    setMenuFor(null);
    setDialogError(null);
    setDialog(next);
  }

  function closeDialog(): void {
    setDialog(null);
    setDialogError(null);
  }

  function failDialog(error: unknown): void {
    const failure = describeFolderError(error);
    setDialogError({ message: failure.message, upgrade: failure.upgrade });
  }

  function submitName(name: string): void {
    if (!dialog) {
      return;
    }
    setDialogError(null);
    if (dialog.kind === 'create') {
      createFolderMutation.mutate(name, {
        onSuccess: () => {
          closeDialog();
          say(`已新建文件夹「${name}」。`);
        },
        onError: failDialog
      });
    } else if (dialog.kind === 'rename') {
      const target = dialog.folder;
      renameFolderMutation.mutate({ folderId: target.id, name }, {
        onSuccess: () => {
          closeDialog();
          say(`已改名为「${name}」。`);
        },
        onError: failDialog
      });
    }
  }

  function confirmDeleteFolder(target: GroupFileFolder): void {
    setDialogError(null);
    deleteFolderMutation.mutate(target.id, {
      onSuccess: (moved) => {
        closeDialog();
        if (folderId === target.id) {
          setFolderId(null);
        }
        say(moved > 0 ? `已删除文件夹「${target.name}」，${moved} 个文件移回了根目录。` : `已删除文件夹「${target.name}」。`);
      },
      onError: (error) => {
        if (groupPlusErrorCode(error) === 'folder_not_found') {
          closeDialog();
          if (folderId === target.id) {
            setFolderId(null);
          }
          say('这个文件夹已经被删除了。');
          return;
        }
        failDialog(error);
      }
    });
  }

  /** 移动一个文件。fromDialog：从「移动到」对话框发起的，失败时错误写在对话框里 */
  function move(file: GroupFile, target: number | null, fromDialog: boolean): void {
    if ((file.folder_id ?? null) === target) {
      return;
    }
    const name = target === null ? '根目录' : folders.find((item) => item.id === target)?.name ?? '文件夹';
    setDialogError(null);
    if (!fromDialog) {
      say(null);
    }
    moveMutation.mutate({ fileIds: [file.id], folderId: target }, {
      onSuccess: () => {
        if (fromDialog) {
          closeDialog();
        }
        say(target === null ? `「${file.name}」已移回根目录。` : `「${file.name}」已移到「${name}」。`);
      },
      onError: (error) => {
        const failure = describeFolderError(error);
        if (fromDialog) {
          setDialogError({ message: failure.message, upgrade: failure.upgrade });
        } else {
          say(failure.message, failure.upgrade);
        }
      }
    });
  }

  /** 这个文件能不能拖进文件夹 / 能不能点「移动到」 */
  function movable(file: GroupFile): { show: boolean; blocked: string | null } {
    if (!folderFeature || (!canManage && !canTidy)) {
      return { show: false, blocked: null };
    }
    const inSomeFolder = (file.folder_id ?? null) !== null;
    // 降档后只能移回根目录：根目录的文件没地方去
    if (!canManage && !inSomeFolder) {
      return { show: false, blocked: null };
    }
    if (!inSomeFolder && file.expired) {
      return { show: true, blocked: '已过期的文件不能放进文件夹。' };
    }
    if (!inSomeFolder && file.temporary) {
      return { show: true, blocked: '24 小时临时文件不能放进文件夹，转为永久后就可以移动。' };
    }
    if (!inSomeFolder && folders.length === 0) {
      return { show: true, blocked: '还没有文件夹，先新建一个。' };
    }
    return { show: true, blocked: null };
  }

  function draggable(file: GroupFile): boolean {
    return !mobile && canManage && !file.temporary && !file.expired && folders.length > 0;
  }

  function isFileDrag(event: DragEvent): boolean {
    return draggingFile !== null && event.dataTransfer.types.includes(FILE_DRAG_TYPE);
  }

  /** 文件夹行 / 面包屑上的放置：面板里拖来的文件 → 移动；系统里拖来的文件 → 直接传进这个文件夹 */
  function dropHandlers(target: GroupFileFolder | null): Record<string, (event: DragEvent) => void> {
    const key = target ? target.id : 'root';
    const acceptsFile = (): boolean => {
      if (!draggingFile) {
        return false;
      }
      const from = draggingFile.folder_id ?? null;
      return target === null ? from !== null && (canTidy || canManage) : canManage && from !== target.id;
    };
    const acceptsUpload = (event: DragEvent): boolean => target !== null && canUpload && foldersWritable && event.dataTransfer.types.includes('Files');
    return {
      onDragOver: (event) => {
        if ((isFileDrag(event) && acceptsFile()) || acceptsUpload(event)) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = isFileDrag(event) ? 'move' : 'copy';
          setDropTarget(key);
          setDragging(false);
        }
      },
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropTarget((current) => (current === key ? null : current));
        }
      },
      onDrop: (event) => {
        setDropTarget(null);
        if (isFileDrag(event) && acceptsFile() && draggingFile) {
          event.preventDefault();
          event.stopPropagation();
          move(draggingFile, target ? target.id : null, false);
        } else if (acceptsUpload(event)) {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          pick(Array.from(event.dataTransfer.files), target);
        }
        setDraggingFile(null);
      }
    };
  }

  const upgradeButton = (label: string, focusTier: 'pro' | 'pro_plus' = 'pro_plus'): JSX.Element | null => (staff ? (
    <button type="button" className="kgp-files-cta" onClick={() => openUpgrade({ conversationId, reason: 'files', focusTier })}>{label}</button>
  ) : null);

  if (infoQuery.isLoading && filesQuery.isLoading) {
    return <ModalStatus>正在加载群文件…</ModalStatus>;
  }
  if (filesQuery.error && files.length === 0 && listErrorCode !== 'folder_not_found') {
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
        ? `空间已满，新文件存为 ${rules.tempTtlHours} 小时临时文件${uploadFolder ? '，放在根目录' : ''} · 单个最大 ${formatFileSize(rules.tempMax)}`
        : `新文件保留 ${staff && permanent ? '永久' : ttlLabel(defaultTtl)}，同时在群里发一条文件消息`;
  const dropTitle = uploadFolder
    ? <>{mobile ? '上传到' : '把文件拖到这里，放进'}「<span className="kgp-files-drop-folder">{uploadFolder.name}</span>」</>
    : inFolder && !foldersWritable
      ? (mobile ? '上传文件（放在根目录）' : '把文件拖到这里（放在根目录）')
      : (mobile ? '上传文件' : '把文件拖到这里');

  const showFolders = folderFeature && !searching && folderId === null && folders.length > 0;
  const menuFolder = menuFor === null ? null : folders.find((item) => item.id === menuFor) ?? null;
  const folderMenu = (folder: GroupFileFolder): JSX.Element | null => (menuFolder?.id === folder.id ? (
    <FolderMenu
      canRename={canManage}
      canDelete={canTidy}
      onClose={() => setMenuFor(null)}
      onRename={() => openDialog({ kind: 'rename', folder })}
      onDelete={() => openDialog({ kind: 'delete', folder })}
    />
  ) : null);
  const hasFolderMenu = canManage || canTidy;
  const pendingFolderOp = createFolderMutation.isPending || renameFolderMutation.isPending || deleteFolderMutation.isPending;

  return (
    <div
      className={`kgp-files${mobile ? ' is-mobile' : ''}${motion ? '' : ' is-still'}${dragging ? ' is-dragging' : ''}${draggingFile ? ' is-moving' : ''}`}
      data-files-state={state}
      data-files-folder={inFolder ? folderId : undefined}
      onDragOver={mobile ? undefined : (event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
          setDropTarget(null);
        }
      }}
      onDragLeave={mobile ? undefined : (event) => {
        if (event.currentTarget === event.target) {
          setDragging(false);
        }
      }}
      onDrop={mobile ? undefined : (event) => {
        setDragging(false);
        if (!event.dataTransfer.types.includes('Files')) {
          return;
        }
        event.preventDefault();
        pick(Array.from(event.dataTransfer.files));
      }}
    >
      {inFolder ? (
        <nav className="kgp-files-crumbs" aria-label="当前位置">
          <button type="button" className="kui-icon-btn kgp-files-crumbs-back" aria-label="返回群文件根目录" title="返回" onClick={() => openFolder(null)}>
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <span className="kgp-files-crumbs-path">
            <button type="button" className={`kgp-files-crumb${dropTarget === 'root' ? ' is-drop' : ''}`} onClick={() => openFolder(null)} {...dropHandlers(null)}>群文件</button>
            <Icon name="chevron" className="h-3.5 w-3.5 kgp-files-crumbs-sep" />
            <b className="kgp-files-crumb-current" title={currentFolder?.name}>{currentFolder?.name ?? '文件夹'}</b>
          </span>
          {currentFolder ? <em className="kgp-files-crumbs-stat">{folderStats(currentFolder)}</em> : null}
          {currentFolder && hasFolderMenu ? (
            <span className="kgp-files-menu-anchor">
              <button type="button" className="kui-icon-btn" aria-label={`管理文件夹 ${currentFolder.name}`} aria-haspopup="menu" aria-expanded={menuFor === currentFolder.id} onClick={() => setMenuFor((current) => (current === currentFolder.id ? null : currentFolder.id))}>
                <Icon name="more" className="h-4 w-4" />
              </button>
              {folderMenu(currentFolder)}
            </span>
          ) : null}
        </nav>
      ) : null}

      {quota && rules ? (
        rules.hasSpace || !rules.modern ? (
          <section className={`kgp-files-quota${nearFull ? ' is-warn' : ''}`} aria-label="群文件空间">
            <div className="kgp-files-quota-head">
              <span className="kgp-files-quota-num"><b>{formatFileSize(quota.used_bytes)}</b> / {formatFileSize(quota.quota_bytes)}</span>
              <em>{quota.file_count} 个文件{folderFeature && folders.length > 0 ? ` · ${folders.length} 个文件夹` : ''}</em>
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
            <b>{dropTitle}</b>
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

      {notice ? (
        <p className="kgp-files-notice" role="alert">
          {notice}
          {noticeUpgrade && staff ? <button type="button" className="kgp-files-link" onClick={() => openUpgrade({ conversationId, reason: 'files', focusTier: 'pro_plus' })}>去升级 ›</button> : null}
        </p>
      ) : null}

      {uploads.length > 0 ? (
        <ul className="kgp-files-tasks" aria-label="上传任务">
          {uploads.map((task) => {
            const ratio = task.size > 0 ? Math.min(1, task.loaded / task.size) : 0;
            const doneText = task.temporary ? (task.landedInRoot ? '已上传 · 临时文件，放在根目录' : '已上传 · 临时文件') : task.landedInRoot ? '已上传 · 放在根目录' : '已上传';
            return (
              <li key={task.id} className={`kgp-files-task is-${task.status}`}>
                <div className="kgp-files-task-head">
                  <span className="kgp-files-task-name">{task.name}</span>
                  <span className="kgp-files-task-state">
                    {task.status === 'uploading' ? `${Math.round(ratio * 100)}%` : task.status === 'done' ? doneText : task.status === 'canceled' ? '已取消' : '失败'}
                  </span>
                  {task.status === 'uploading' ? <button type="button" className="kgp-files-btn" onClick={() => cancelUpload(task.id)}>取消</button> : null}
                  {task.status === 'failed' ? <button type="button" className="kgp-files-btn" onClick={() => retryUpload(queryClient, task.id)}>重试</button> : null}
                  {task.status === 'failed' || task.status === 'canceled' ? <button type="button" className="kui-icon-btn" aria-label="移除" onClick={() => dismissUpload(task.id)}><Icon name="close" className="h-3.5 w-3.5" /></button> : null}
                </div>
                {task.status === 'uploading' ? <div className="kgp-files-bar"><span className="kgp-files-bar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} /></div> : null}
                {task.status === 'failed' && task.error ? (
                  <p className="kgp-files-task-error" role="alert">{task.error}{task.code === 'quota_exceeded' || task.code === 'file_too_large' || task.code === 'folders_require_plus' ? upgradeButton('去升级') : null}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="kgp-files-toolbar">
        <label className="kgp-files-search">
          <Icon name="search" className="h-3.5 w-3.5" />
          <input value={keyword} placeholder={folderFeature ? '搜索全部文件' : '搜索文件名'} aria-label="搜索文件名" onChange={(event) => setKeyword(event.target.value)} />
          {keyword ? <button type="button" className="kgp-files-search-clear" aria-label="清除搜索" onClick={() => setKeyword('')}><Icon name="close" className="h-3 w-3" /></button> : null}
        </label>
        {canManage && folderId === null && !searching ? (
          <button
            type="button"
            className="kgp-files-ghost"
            disabled={folders.length >= folderLimit}
            title={folders.length >= folderLimit ? `最多 ${folderLimit} 个文件夹` : '新建文件夹'}
            onClick={() => openDialog({ kind: 'create' })}
          >
            <Icon name="plus" className="h-3.5 w-3.5" />新建文件夹
          </button>
        ) : null}
      </div>

      {searching && folderFeature && files.length > 0 ? <p className="kgp-files-scope">在全部文件夹里找到 {total} 个文件</p> : null}

      {showFolders ? (
        <ul className="kgp-files-list kgp-files-folders" aria-label="文件夹">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className={`kgp-files-row kgp-files-folder${dropTarget === folder.id ? ' is-drop' : ''}${menuFor === folder.id ? ' is-menu' : ''}`}
              onContextMenu={hasFolderMenu ? (event) => {
                event.preventDefault();
                setMenuFor(folder.id);
              } : undefined}
              {...dropHandlers(folder)}
            >
              <button type="button" className="kgp-files-folder-open" aria-label={`打开文件夹 ${folder.name}`} onClick={() => openFolder(folder.id)}>
                <span className="kgp-file-icon kgp-folder-icon"><Icon name="folder" className="h-5 w-5" /></span>
                <span className="kgp-files-row-main">
                  <span className="kgp-file-name" title={folder.name}>{folder.name}</span>
                  <span className="kgp-file-sub"><span>{folderStats(folder)}</span></span>
                </span>
              </button>
              <div className="kgp-files-row-actions">
                {hasFolderMenu ? (
                  <span className="kgp-files-menu-anchor">
                    <button type="button" className="kui-icon-btn" title="更多" aria-label={`管理文件夹 ${folder.name}`} aria-haspopup="menu" aria-expanded={menuFor === folder.id} onClick={() => setMenuFor((current) => (current === folder.id ? null : folder.id))}>
                      <Icon name="more" className="h-4 w-4" />
                    </button>
                    {folderMenu(folder)}
                  </span>
                ) : null}
                <Icon name="chevron" className="h-4 w-4 kgp-files-folder-go" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {files.length === 0 && !filesQuery.isLoading && !(showFolders && !searching) ? (
        <div className="kgp-files-empty">
          <Icon name="folder" className="h-6 w-6" />
          <p>{q ? '没有找到匹配的文件。' : inFolder ? `这个文件夹还是空的${canUpload ? '，传一个进来吧' : ''}。` : '还没有文件，传第一个吧。'}</p>
        </div>
      ) : null}
      {filesQuery.isLoading ? <ModalStatus>正在加载文件…</ModalStatus> : null}

      <ul className={`kgp-files-list${showFolders && files.length > 0 ? ' is-after-folders' : ''}`}>
        {files.map((file) => {
          const mine = me !== null && file.uploader_id === me.id;
          const canDelete = staff || mine;
          const urgent = !file.permanent && !file.expired && file.expires_at !== null && new Date(file.expires_at).getTime() - Date.now() < 6 * 3_600_000;
          const canPin = staff && (file.permanent || !rules || rules.hasSpace);
          const moveState = movable(file);
          const dragOk = draggable(file);
          const playable = !file.expired && isPlayableVideo(file.content_type, file.name);
          return (
            <li
              key={file.id}
              className={`kgp-files-row${draggingFile?.id === file.id ? ' is-dragged' : ''}`}
              draggable={dragOk || undefined}
              onDragStart={dragOk ? (event) => {
                event.dataTransfer.setData(FILE_DRAG_TYPE, String(file.id));
                event.dataTransfer.effectAllowed = 'move';
                setDraggingFile(file);
                setMenuFor(null);
              } : undefined}
              onDragEnd={dragOk ? () => {
                setDraggingFile(null);
                setDropTarget(null);
              } : undefined}
            >
              {playable ? (
                <button type="button" className="kgp-file-icon kgp-file-play" title={`播放 ${file.name}`} aria-label={`播放 ${file.name}`} onClick={() => play(file)}>
                  <Icon name="play" className="h-5 w-5" />
                </button>
              ) : <span className="kgp-file-icon"><Icon name={fileIconName(file.content_type, file.name)} className="h-5 w-5" /></span>}
              <div className="kgp-files-row-main">
                <span className="kgp-file-name" title={file.name}>{file.name}</span>
                <span className="kgp-file-sub">
                  {searching && file.folder_id !== undefined ? (
                    file.folder_id !== null ? (
                      <button type="button" className="kgp-files-where" title={`打开文件夹 ${file.folder_name ?? ''}`} onClick={() => openFolder(file.folder_id ?? null)}>
                        <Icon name="folder" className="h-3 w-3" />{file.folder_name ?? '文件夹'}
                      </button>
                    ) : <span className="kgp-files-where is-root"><Icon name="home" className="h-3 w-3" />根目录</span>
                  ) : null}
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
                {playable ? (
                  <button type="button" className="kui-icon-btn" title="播放" aria-label={`播放 ${file.name}`} onClick={() => play(file)}>
                    <Icon name="play" className="h-4 w-4" />
                  </button>
                ) : null}
                <button type="button" className="kui-icon-btn" title="下载" aria-label={`下载 ${file.name}`} disabled={rowBusy === file.id || file.expired} onClick={() => void download(file)}>
                  <Icon name={rowBusy === file.id ? 'refresh' : 'download'} className="h-4 w-4" />
                </button>
                {moveState.show ? (
                  <button
                    type="button"
                    className={`kui-icon-btn${moveState.blocked ? ' is-blocked' : ''}`}
                    title={moveState.blocked ?? (canManage ? '移动到…' : '移回根目录')}
                    aria-label={`移动 ${file.name}`}
                    aria-disabled={moveState.blocked ? true : undefined}
                    disabled={moveMutation.isPending}
                    onClick={() => {
                      if (moveState.blocked) {
                        say(moveState.blocked);
                        return;
                      }
                      openDialog({ kind: 'move', file });
                    }}
                  >
                    <Icon name="folder" className="h-4 w-4" />
                  </button>
                ) : null}
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

      {staff && state !== 'locked' && (!rules || rules.hasSpace) && !inFolder ? (
        <section className="kgp-files-ttl">
          <div className="kgp-files-ttl-text">
            <h4>默认保留时长</h4>
            <p>只影响之后放进群空间的文件；永久文件和临时文件不受影响。</p>
          </div>
          <div className="kgp-files-seg" role="radiogroup" aria-label="默认保留时长">
            {ttlOptions.map((hours) => (
              <button key={hours} type="button" role="radio" aria-checked={defaultTtl === hours} disabled={ttlMutation.isPending} className={defaultTtl === hours ? 'is-active' : undefined} onClick={() => {
                if (hours !== defaultTtl) {
                  say(null);
                  ttlMutation.mutate(hours, { onError: (error) => say(describeGroupPlusError(error).message) });
                }
              }}>{ttlLabel(hours)}</button>
            ))}
          </div>
        </section>
      ) : null}

      {dialog?.kind === 'create' || dialog?.kind === 'rename' ? (
        <FolderNameDialog
          key={dialog.kind === 'rename' ? `rename-${dialog.folder.id}` : 'create'}
          mode={dialog.kind}
          initial={dialog.kind === 'rename' ? dialog.folder.name : ''}
          busy={pendingFolderOp}
          error={dialogError?.message ?? null}
          onUpgrade={dialogError?.upgrade && staff ? () => {
            closeDialog();
            openUpgrade({ conversationId, reason: 'files', focusTier: 'pro_plus' });
          } : null}
          remaining={dialog.kind === 'create' ? Math.max(0, folderLimit - folders.length) : null}
          onSubmit={submitName}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <DeleteFolderDialog folder={dialog.folder} busy={deleteFolderMutation.isPending} error={dialogError?.message ?? null} onConfirm={() => confirmDeleteFolder(dialog.folder)} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === 'move' ? (
        <MoveFileDialog
          file={dialog.file}
          folders={folders}
          canManage={canManage}
          canTidy={canTidy}
          busy={moveMutation.isPending}
          error={dialogError?.message ?? null}
          onPick={(target) => move(dialog.file, target, true)}
          onClose={closeDialog}
        />
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
  // key：换了群就是新的面板，搜索词、勾选、所在文件夹都不带过去
  if (!desktop) {
    return <MobileFilesPage key={target.conversationId} conversationId={target.conversationId} onClose={close} />;
  }
  return (
    <Modal title="群文件" subtitle={title} className="kmd-modal--lg kmd-modal--tall" bodyClassName="kgp-files-modal" onClose={close}>
      <FilesBody key={target.conversationId} conversationId={target.conversationId} mobile={false} />
    </Modal>
  );
}
