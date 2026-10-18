import { useEffect, useRef, useState } from 'react';
import { ANNOUNCEMENT_MAX_IMAGES, ANNOUNCEMENT_MAX_LENGTH, describeAnnouncementError } from '@/api/groupAnnouncements';
import { uploadMessageImage } from '@/api/messages';
import { cx } from '@/components/chat/desktop/runtime';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/toast';
import type { GroupAnnouncement } from '@/types/groupAnnouncement';
import { useSaveAnnouncement } from './data';
import { imageThumb, PageShell } from './parts';

interface DraftImage {
  key: string;
  /** 上传完成后的地址；还在传时为 null */
  url: string | null;
  /** 显示用：本地预览或缩略图 */
  preview: string | undefined;
}

let draftKey = 0;

function nextKey(): string {
  draftKey += 1;
  return `img-${draftKey}`;
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps): JSX.Element {
  return (
    <label className="kga-toggle">
      <span className="kga-toggle-text">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input type="checkbox" role="switch" className="kui-switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export interface AnnouncementEditorProps {
  conversationId: number;
  mobile: boolean;
  /** 修改时传原公告；发布新公告为 null */
  announcement: GroupAnnouncement | null;
  onBack: () => void;
  onClose: () => void;
  onSaved: (announcement: GroupAnnouncement) => void;
}

/** 发布 / 修改公告：正文、图片、弹窗与确认，「高级设置」里是置顶、发给新成员、引导改群昵称。 */
export function AnnouncementEditor({ conversationId, mobile, announcement, onBack, onClose, onSaved }: AnnouncementEditorProps): JSX.Element {
  const isEdit = announcement !== null;
  const [content, setContent] = useState(announcement?.content ?? '');
  const [images, setImages] = useState<DraftImage[]>(() => (announcement?.images ?? []).map((image) => ({ key: nextKey(), url: image.url, preview: imageThumb(image) })));
  const [popup, setPopup] = useState(announcement?.popup ?? false);
  const [requireConfirm, setRequireConfirm] = useState(announcement?.require_confirm ?? false);
  const [pinned, setPinned] = useState(announcement?.pinned ?? false);
  const [sendToNewMembers, setSendToNewMembers] = useState(announcement?.send_to_new_members ?? false);
  const [guideNickname, setGuideNickname] = useState(announcement?.guide_nickname ?? false);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(announcement && (announcement.pinned || announcement.send_to_new_members || announcement.guide_nickname)));
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const save = useSaveAnnouncement(conversationId);

  // 本地预览用的 blob 地址，离开编辑页时释放
  useEffect(() => () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const length = content.trim().length;
  const uploading = images.some((image) => image.url === null);
  const canSubmit = length > 0 && length <= ANNOUNCEMENT_MAX_LENGTH && !uploading && !save.isPending;
  const remaining = ANNOUNCEMENT_MAX_IMAGES - images.length;

  function addFiles(fileList: FileList | null): void {
    const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      return;
    }
    if (files.length > remaining) {
      toast.info(`最多 ${ANNOUNCEMENT_MAX_IMAGES} 张图片，多出的没有加上`);
    }
    for (const file of files.slice(0, Math.max(0, remaining))) {
      const key = nextKey();
      const preview = URL.createObjectURL(file);
      objectUrlsRef.current.push(preview);
      setImages((current) => [...current, { key, url: null, preview }]);
      uploadMessageImage(file).then((uploaded) => {
        setImages((current) => current.map((image) => (image.key === key ? { ...image, url: uploaded.url } : image)));
      }).catch((error: unknown) => {
        setImages((current) => current.filter((image) => image.key !== key));
        toast.error(error instanceof Error && /[一-龥]/.test(error.message) ? error.message : '图片上传失败，请稍后重试。');
      });
    }
  }

  function submit(): void {
    if (!canSubmit) {
      return;
    }
    save.mutate({
      id: announcement?.id ?? null,
      payload: {
        content: content.trim(),
        images: images.map((image) => image.url).filter((url): url is string => Boolean(url)),
        pinned,
        popup,
        require_confirm: requireConfirm,
        send_to_new_members: sendToNewMembers,
        guide_nickname: guideNickname
      }
    }, {
      onSuccess: (saved) => {
        toast.success(isEdit ? '公告已修改' : '公告已发布');
        onSaved(saved);
      }
    });
  }

  const footer = (
    <>
      {save.error ? <p className="kga-foot-error" role="alert">{describeAnnouncementError(save.error, '公告保存失败，请稍后重试。')}</p> : null}
      {mobile ? null : <button type="button" className="kga-btn is-ghost" onClick={onBack}>取消</button>}
      <button type="submit" className={cx('kga-btn is-ink', mobile && 'is-block')} disabled={!canSubmit}>
        {save.isPending ? (isEdit ? '保存中…' : '发布中…') : uploading ? '图片上传中…' : (isEdit ? '保存' : '发布')}
      </button>
    </>
  );

  return (
    <PageShell mobile={mobile} title={isEdit ? '编辑群公告' : '发布群公告'} onBack={onBack} onClose={onClose} footer={footer} guard onSubmit={submit}>
      <div className="kga-editor">
        <div className="kga-compose">
          <textarea
            className="kga-textarea"
            value={content}
            rows={mobile ? 8 : 9}
            maxLength={ANNOUNCEMENT_MAX_LENGTH + 200}
            placeholder={`填写公告内容，1–${ANNOUNCEMENT_MAX_LENGTH} 字`}
            aria-label="公告内容"
            autoFocus={!mobile}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="kga-compose-images">
            {images.map((image, index) => (
              <div key={image.key} className={cx('kga-image is-draft', image.url === null && 'is-uploading')}>
                {image.preview ? <img src={image.preview} alt={`第 ${index + 1} 张图片`} draggable={false} /> : <Icon name="image" className="h-5 w-5" />}
                {image.url === null ? <span className="kga-image-mask"><Icon name="loader" className="h-4 w-4 animate-spin" /></span> : null}
                <button type="button" className="kga-image-remove" aria-label="移除这张图片" onClick={() => setImages((current) => current.filter((item) => item.key !== image.key))}>
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </div>
            ))}
            {remaining > 0 ? (
              <button type="button" className="kga-image is-add" aria-label="添加图片" onClick={() => inputRef.current?.click()}>
                <Icon name="plus" className="h-5 w-5" />
                <small>{images.length}/{ANNOUNCEMENT_MAX_IMAGES}</small>
              </button>
            ) : null}
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }} />
          </div>
          <span className={cx('kga-count', length > ANNOUNCEMENT_MAX_LENGTH && 'is-over')}>{length}/{ANNOUNCEMENT_MAX_LENGTH}</span>
        </div>

        <div className="kga-options">
          <Toggle label="使用弹窗展示" hint="群成员进入群聊时弹出这条公告" checked={popup} onChange={setPopup} />
          <Toggle label="需群成员确认收到" hint="成员要点「确认收到」，管理员可以查看谁还没确认" checked={requireConfirm} onChange={setRequireConfirm} />
        </div>

        <button type="button" className={cx('kga-advanced-toggle', advancedOpen && 'is-open')} aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}>
          <span>高级设置</span>
          <Icon name="chevron" className="h-3.5 w-3.5" />
        </button>
        {advancedOpen ? (
          <div className="kga-options">
            <Toggle label="设为置顶" hint="置顶的公告排在列表最前面" checked={pinned} onChange={setPinned} />
            <Toggle label="发送给新成员" hint="新成员入群后弹出这条公告。全群只能有一条，开启后会取消其它公告的这一项" checked={sendToNewMembers} onChange={setSendToNewMembers} />
            <Toggle label="引导群成员修改群昵称" hint="公告底部出现「修改群昵称」按钮" checked={guideNickname} onChange={setGuideNickname} />
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
