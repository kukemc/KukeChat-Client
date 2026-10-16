import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useEscapeLayer } from '@/components/ui/desktop/Modal';
import type { GroupFile, GroupFileFolder } from '@/types/groupPlus';
import { folderNameProblem } from '../data';
import { formatFileSize } from '../tier';

/**
 * 群文件夹（docs/group-plus.md 5.5）的小部件：面板里叠一层的小对话框、文件夹的「…」菜单、「移动到」选择器。
 * 都画在 .kgp-files 里面，用同一套墨色 / 灰阶令牌（group-files.css）；Esc 只关最上面这一层。
 */

/** 文件夹行、面包屑上的一行小字：N 个文件 · 总大小 */
export function folderStats(folder: Pick<GroupFileFolder, 'file_count' | 'total_size'>): string {
  return folder.file_count > 0 ? `${folder.file_count} 个文件 · ${formatFileSize(folder.total_size)}` : '空文件夹';
}

/** 叠在群文件面板上面的小对话框。点遮罩、按 Esc 关闭；正文是表单，回车提交。 */
export function FolderDialog({ title, description, children, actions, busy = false, onSubmit, onClose }: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions: ReactNode;
  busy?: boolean;
  onSubmit?: () => void;
  onClose: () => void;
}): JSX.Element {
  // 提交中不让 Esc / 点遮罩关掉，免得结果回来时界面已经没了
  useEscapeLayer(busy ? () => undefined : onClose);
  return (
    <div className="kgp-folder-layer" onMouseDown={(event) => {
      event.stopPropagation();
      if (!busy && event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <form className="kgp-folder-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}>
        <h3>{title}</h3>
        {description ? <p className="kgp-folder-dialog-desc">{description}</p> : null}
        {children}
        <div className="kgp-folder-dialog-actions">{actions}</div>
      </form>
    </div>
  );
}

/** 新建 / 重命名文件夹：一个输入框，本地先按服务端的规则查一遍，服务端的错误（重名、满了、档位不够）由外面传进来。 */
export function FolderNameDialog({ mode, initial = '', busy, error, onUpgrade, remaining, onSubmit, onClose }: {
  mode: 'create' | 'rename';
  initial?: string;
  busy: boolean;
  /** 服务端返回的错误说明；输入框一改就清掉 */
  error: string | null;
  /** 档位不够时给「去升级」 */
  onUpgrade?: (() => void) | null;
  /** 还能建几个（新建时显示在说明里） */
  remaining?: number | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [name, setName] = useState(initial);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState(error);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setServerError(error), [error]);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const problem = folderNameProblem(name);
  const unchanged = mode === 'rename' && name.trim() === initial.trim();
  const shown = serverError ?? (touched && name.length > 0 ? problem : null);
  const length = [...name.trim()].length;
  return (
    <FolderDialog
      title={mode === 'create' ? '新建文件夹' : '重命名文件夹'}
      description={mode === 'create' ? `只有一层。所有能上传的成员都能把文件传进来，群主和管理员负责整理${remaining !== null && remaining !== undefined && remaining <= 10 ? `；还能再建 ${remaining} 个` : ''}。` : undefined}
      busy={busy}
      onClose={onClose}
      onSubmit={() => {
        setTouched(true);
        if (!problem && !unchanged && !busy) {
          onSubmit(name.trim());
        }
      }}
      actions={(
        <>
          <button type="button" className="kgp-files-ghost" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="kgp-files-cta" disabled={busy || problem !== null || unchanged}>{busy ? '请稍候…' : mode === 'create' ? '新建' : '保存'}</button>
        </>
      )}
    >
      <label className={`kgp-folder-field${shown ? ' is-error' : ''}`}>
        <Icon name="folder" className="h-4 w-4" />
        <input
          ref={inputRef}
          value={name}
          maxLength={60}
          placeholder="文件夹名字"
          aria-label="文件夹名字"
          aria-invalid={shown ? true : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setTouched(true);
            setServerError(null);
          }}
        />
        <small className={length > 40 ? 'is-over' : undefined}>{length}/40</small>
      </label>
      {shown ? (
        <p className="kgp-folder-error" role="alert">
          {shown}
          {onUpgrade && serverError ? <button type="button" className="kgp-files-link" onClick={onUpgrade}>去升级 ›</button> : null}
        </p>
      ) : null}
    </FolderDialog>
  );
}

/** 删除文件夹的二次确认：说清楚文件不会被删，只是回到根目录。 */
export function DeleteFolderDialog({ folder, busy, error, onConfirm, onClose }: {
  folder: GroupFileFolder;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}): JSX.Element {
  return (
    <FolderDialog
      title={`删除文件夹「${folder.name}」？`}
      description={folder.file_count > 0 ? `里面的 ${folder.file_count} 个文件会移回根目录，文件本身不会被删除。` : '这是个空文件夹。里面要是有文件，也只会移回根目录，不会被删除。'}
      busy={busy}
      onClose={onClose}
      onSubmit={() => {
        if (!busy) {
          onConfirm();
        }
      }}
      actions={(
        <>
          <button type="button" className="kgp-files-ghost" disabled={busy} onClick={onClose}>取消</button>
          <button type="submit" className="kgp-files-cta" disabled={busy} autoFocus>{busy ? '正在删除…' : '删除文件夹'}</button>
        </>
      )}
    >
      {error ? <p className="kgp-folder-error" role="alert">{error}</p> : null}
    </FolderDialog>
  );
}

/** 「移动到…」：根目录 + 全部文件夹。现在所在的位置、不能去的地方置灰并说明原因；点一下就移动。 */
export function MoveFileDialog({ file, folders, canManage, canTidy, busy, error, onPick, onClose }: {
  file: GroupFile;
  folders: GroupFileFolder[];
  canManage: boolean;
  canTidy: boolean;
  busy: boolean;
  error: string | null;
  onPick: (folderId: number | null) => void;
  onClose: () => void;
}): JSX.Element {
  const here = file.folder_id ?? null;
  const stuck = file.temporary === true || file.expired;
  const reason = file.expired ? '已过期的文件不能放进文件夹。' : file.temporary ? '24 小时临时文件不能放进文件夹，只能留在根目录。转为永久后就可以移动。' : null;
  const option = (key: string, folderId: number | null, name: string, sub: string, enabled: boolean, note: string | null): JSX.Element => (
    <li key={key}>
      <button type="button" className={`kgp-folder-option${folderId === here ? ' is-here' : ''}`} disabled={!enabled || busy} onClick={() => onPick(folderId)}>
        <span className={`kgp-folder-glyph${folderId === null ? ' is-root' : ''}`}><Icon name={folderId === null ? 'home' : 'folder'} className="h-4 w-4" /></span>
        <span className="kgp-folder-option-text">
          <b>{name}</b>
          <small>{sub}</small>
        </span>
        {note ? <em>{note}</em> : enabled ? <Icon name="chevron" className="h-4 w-4 kgp-folder-option-go" /> : null}
      </button>
    </li>
  );
  return (
    <FolderDialog
      title="移动到"
      description={<>把「<b>{file.name}</b>」放到：</>}
      busy={busy}
      onClose={onClose}
      actions={<button type="button" className="kgp-files-ghost" disabled={busy} onClick={onClose}>取消</button>}
    >
      {reason ? <p className="kgp-folder-note">{reason}</p> : null}
      <ul className="kgp-folder-options" aria-label="目标位置">
        {option('root', null, '根目录', '不在任何文件夹里', here !== null && (canTidy || canManage), here === null ? '当前位置' : null)}
        {folders.map((folder) => option(
          String(folder.id),
          folder.id,
          folder.name,
          folderStats(folder),
          folder.id !== here && canManage && !stuck,
          folder.id === here ? '当前位置' : null
        ))}
      </ul>
      {folders.length === 0 ? <p className="kgp-folder-note">还没有文件夹。</p> : null}
      {!canManage && canTidy && folders.length > 0 ? <p className="kgp-folder-note">群档位已不是 Pro+ / MAX：只能把文件移回根目录。</p> : null}
      {error ? <p className="kgp-folder-error" role="alert">{error}</p> : null}
    </FolderDialog>
  );
}

/** 文件夹行 / 面包屑上的「…」菜单：重命名、删除。点外面、按 Esc 关闭。 */
export function FolderMenu({ canRename, canDelete, onRename, onDelete, onClose }: {
  canRename: boolean;
  canDelete: boolean;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEscapeLayer(onClose);
  useEffect(() => {
    const onPointer = (event: PointerEvent): void => {
      // 面板可能在 shadow root 里：用 composedPath 判断点的是不是菜单自己
      if (ref.current && !event.composedPath().includes(ref.current)) {
        onClose();
      }
    };
    // 下一拍再挂：打开菜单的这次点击不能马上把它关掉
    const timer = window.setTimeout(() => window.addEventListener('pointerdown', onPointer, true), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);
  return (
    <div ref={ref} className="kgp-folder-menu" role="menu" onClick={(event) => event.stopPropagation()} onContextMenu={(event) => event.preventDefault()}>
      {canRename ? (
        <button type="button" role="menuitem" onClick={() => {
          onClose();
          onRename();
        }}><Icon name="edit" className="h-3.5 w-3.5" />重命名</button>
      ) : null}
      {canDelete ? (
        <button type="button" role="menuitem" className="is-danger" onClick={() => {
          onClose();
          onDelete();
        }}><Icon name="trash" className="h-3.5 w-3.5" />删除文件夹</button>
      ) : null}
    </div>
  );
}
