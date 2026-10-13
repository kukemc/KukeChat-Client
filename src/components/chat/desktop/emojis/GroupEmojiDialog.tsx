import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createGroupEmoji, deleteGroupEmoji, GROUP_EMOJI_IMAGE_TYPES, MAX_GROUP_EMOJI_BYTES, MAX_GROUP_EMOJI_NAME_LENGTH, MAX_GROUP_EMOJIS, renameGroupEmoji, type GroupEmoji } from '@/api/groupEmojis';
import { Icon } from '@/components/ui/Icon';
import { resolveMessageImagePreviewUrl } from '../../message/messageMeta';
import { groupEmojisKey, useGroupEmojis } from './useGroupEmojis';

interface GroupEmojiDialogProps {
  conversationId: number;
  /** 群主和管理员；其他成员只能看 */
  canManage: boolean;
  onClose: () => void;
}

/** 服务端会去掉名称里的所有空白，本地先去掉，查重才对得上。 */
function cleanName(value: string): string {
  return value.replace(/\s+/g, '');
}

function nameProblem(name: string, others: GroupEmoji[]): string {
  if (!name) return '表情名称不能为空。';
  if (others.some((emoji) => emoji.name === name)) return '这个群里已经有同名的表情。';
  return '';
}

function onEscape(event: React.KeyboardEvent, cancel: () => void): void {
  if (event.key === 'Escape') {
    // 这里的 Esc 只退出编辑，不让它冒到侧栏把整个对话框关掉
    event.stopPropagation();
    cancel();
  }
}

/** 名称就地编辑：点一下变成输入框，回车或失焦保存，Esc 放弃。 */
function EmojiName({ name, disabled, onSave }: { name: string; disabled: boolean; onSave: (name: string) => void }): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  // 回车保存后输入框被卸载，有的浏览器还会补发一次 blur；用它挡掉重复提交
  const settledRef = useRef(false);

  function finish(save: boolean): void {
    if (settledRef.current || draft === null) {
      return;
    }
    settledRef.current = true;
    setDraft(null);
    const next = cleanName(draft);
    if (save && next !== name) {
      onSave(next);
    }
  }

  if (draft === null) {
    return (
      <button type="button" className="kce-name" title={`${name}（点击改名）`} disabled={disabled} onClick={() => {
        settledRef.current = false;
        setDraft(name);
      }}>{name}</button>
    );
  }
  return (
    <input
      className="kui-input kce-name-input"
      value={draft}
      maxLength={MAX_GROUP_EMOJI_NAME_LENGTH}
      aria-label={`修改表情 ${name} 的名称`}
      autoFocus
      onFocus={(event) => event.target.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          finish(true);
        } else {
          onEscape(event, () => finish(false));
        }
      }}
    />
  );
}

/** 选好图片之后、提交之前：看一眼预览，起个名字。 */
function NewEmojiForm({ file, pending, onSubmit, onCancel }: { file: File; pending: boolean; onSubmit: (name: string) => void; onCancel: () => void }): JSX.Element {
  const [name, setName] = useState(() => cleanName(file.name.replace(/\.[^.]+$/, '')).slice(0, MAX_GROUP_EMOJI_NAME_LENGTH));
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // 不能用 <form>：从输入框的表情面板打开时，这个对话框在输入框那个表单里面，提交会一路冒上去把消息发出去
  return (
    <div className="kce-draft">
      <span className="kce-cell">{previewUrl ? <img src={previewUrl} alt="" /> : null}</span>
      <input className="kui-input" value={name} maxLength={MAX_GROUP_EMOJI_NAME_LENGTH} placeholder={`表情名称，最多 ${MAX_GROUP_EMOJI_NAME_LENGTH} 个字`} aria-label="表情名称" autoFocus disabled={pending} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          onSubmit(cleanName(name));
        } else {
          onEscape(event, onCancel);
        }
      }} />
      <button type="button" className="kui-btn kui-btn--primary" disabled={pending} onClick={() => onSubmit(cleanName(name))}>{pending ? '上传中…' : '添加'}</button>
      <button type="button" className="kui-btn" disabled={pending} onClick={onCancel}>取消</button>
    </div>
  );
}

/**
 * 群表情：全体成员能看，群主和管理员可以上传、改名、删除。
 * 群资料侧栏和输入框的表情面板都会打开它，所以不依赖侧栏的上下文；Esc 由打开它的一方处理。
 */
export function GroupEmojiDialog({ conversationId, canManage, onClose }: GroupEmojiDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const query = useGroupEmojis(conversationId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const emojis = query.data ?? [];
  const full = emojis.length >= MAX_GROUP_EMOJIS;

  // 自己的改动直接写进缓存，不等实时事件；事件到了会再重拉一遍对齐
  const patch = (update: (list: GroupEmoji[]) => GroupEmoji[]): void => {
    queryClient.setQueryData<GroupEmoji[]>(groupEmojisKey(conversationId), (current) => update(current ?? []));
  };
  // 服务端给的是可以直接展示的中文原因
  const onError = (failure: Error): void => setError(failure.message);

  const createMutation = useMutation({
    mutationFn: ({ name, file }: { name: string; file: File }) => createGroupEmoji(conversationId, name, file),
    onSuccess: (created) => {
      // 实时事件触发的重拉可能先一步把它带回来了
      patch((list) => [...list.filter((emoji) => emoji.id !== created.id), created]);
      setNewFile(null);
    },
    onError
  });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => renameGroupEmoji(conversationId, id, name),
    onSuccess: (updated) => patch((list) => list.map((emoji) => (emoji.id === updated.id ? updated : emoji))),
    onError
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteGroupEmoji(conversationId, id),
    onSuccess: (_result, id) => patch((list) => list.filter((emoji) => emoji.id !== id)),
    onError
  });
  const busy = createMutation.isPending || renameMutation.isPending || deleteMutation.isPending;

  function pickFile(file: File): void {
    if (!GROUP_EMOJI_IMAGE_TYPES.includes(file.type)) {
      setError('只支持 PNG、JPG、WebP、GIF 图片。');
    } else if (file.size > MAX_GROUP_EMOJI_BYTES) {
      setError(`图片不能超过 512KB，这张有 ${Math.ceil(file.size / 1024)}KB。`);
    } else {
      setError('');
      setNewFile(file);
    }
  }

  /** 名称过了本地检查才发请求。 */
  function withName(name: string, others: GroupEmoji[], run: () => void): void {
    const problem = nameProblem(name, others);
    setError(problem);
    if (!problem) {
      run();
    }
  }

  return (
    // 粘贴不往外冒：输入框的表单会把它当成往消息里粘贴
    <div className="kui-backdrop" onMouseDown={onClose} onPaste={(event) => event.stopPropagation()}>
      <div role="dialog" aria-modal="true" aria-label="群表情" className="kui-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <header className="kui-dialog-header">
          <span>群表情（{emojis.length} / {MAX_GROUP_EMOJIS}）</span>
          <button type="button" className="kui-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </header>
        <div className="kui-dialog-body kce-dialog-body kui-scroll">
          {canManage ? <p className="kui-note">支持 PNG、JPG、WebP、GIF，单张不超过 512KB。非动图会被转成 JPG，透明底会丢失；GIF 动图保持原样。点名称可以改名。</p> : null}
          {error ? <p className="kui-note kui-note--danger" role="alert">{error}</p> : null}
          {newFile ? (
            <NewEmojiForm
              file={newFile}
              pending={createMutation.isPending}
              onSubmit={(name) => withName(name, emojis, () => createMutation.mutate({ name, file: newFile }))}
              onCancel={() => {
                setError('');
                setNewFile(null);
              }}
            />
          ) : null}
          {!query.data ? (
            <p className="kui-empty">{query.isError ? '群表情加载失败，请稍后再试' : '正在加载…'}</p>
          ) : !canManage && emojis.length === 0 ? (
            <p className="kui-empty">本群还没有群表情</p>
          ) : (
            <div className="kce-grid">
              {canManage ? (
                <div className="kce-item">
                  <input ref={fileInputRef} type="file" accept={GROUP_EMOJI_IMAGE_TYPES.join(',')} hidden onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      pickFile(file);
                    }
                    // 清空后再选同一张图也能触发 change
                    event.target.value = '';
                  }} />
                  <button type="button" className="kce-cell kce-cell--add" aria-label="上传表情" title={full ? `已经有 ${MAX_GROUP_EMOJIS} 个了，先删掉一些再添加` : '上传表情'} disabled={full || Boolean(newFile)} onClick={() => fileInputRef.current?.click()}>
                    <Icon name="plus" className="h-5 w-5" />
                  </button>
                  <span className="kce-name">上传</span>
                </div>
              ) : null}
              {emojis.map((emoji) => (
                <div key={emoji.id} className="kce-item">
                  <span className="kce-cell"><img src={resolveMessageImagePreviewUrl(emoji.url)} alt={emoji.name} loading="lazy" /></span>
                  {canManage ? (
                    <>
                      <EmojiName name={emoji.name} disabled={busy} onSave={(name) => withName(name, emojis.filter((item) => item.id !== emoji.id), () => renameMutation.mutate({ id: emoji.id, name }))} />
                      <button type="button" className="kce-remove" title="删除" aria-label={`删除表情 ${emoji.name}`} disabled={busy} onClick={() => {
                        if (window.confirm(`确定要删除表情「${emoji.name}」吗？已经发出去的消息不受影响。`)) {
                          setError('');
                          deleteMutation.mutate(emoji.id);
                        }
                      }}>
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : <span className="kce-name" title={emoji.name}>{emoji.name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
