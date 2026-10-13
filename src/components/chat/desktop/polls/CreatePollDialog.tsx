import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createPoll } from '@/api/polls';
import { Icon } from '@/components/ui/Icon';
import { upsertMessageIntoFirstPage, type MessagesInfiniteData } from '@/realtime/cache';
import { absorbMuteError } from '@/store/moderationStore';
import type { Conversation } from '@/types/api';
import type { CreatePollPayload } from '@/types/polls';
import { applyLatestMessageToConversations } from '@/utils/conversations';
import type { SelectOption } from '../../info/shared';
import { SegmentRow, SwitchRow } from '../info/controls';
import { PollDialog } from './PollDialog';

const TITLE_MAX = 80;
const OPTION_MAX = 40;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

type ChoiceMode = 'single' | 'multiple';
const MODE_OPTIONS: Array<SelectOption<ChoiceMode>> = [{ value: 'single', label: '单选' }, { value: 'multiple', label: '多选' }];

/** 值是从现在起多少小时后截止；'0' 表示不设截止时间。 */
type Deadline = '0' | '1' | '24' | '72' | '168';
const DEADLINE_OPTIONS: Array<SelectOption<Deadline>> = [
  { value: '0', label: '不限' },
  { value: '1', label: '1 小时' },
  { value: '24', label: '1 天' },
  { value: '72', label: '3 天' },
  { value: '168', label: '7 天' }
];

/** 按服务端的规则先查一遍（长度由输入框的 maxLength 卡住）。入参已经去掉首尾空格和空行。 */
function validate(title: string, options: string[]): string | null {
  if (!title) {
    return '请填写投票标题。';
  }
  if (options.length < MIN_OPTIONS) {
    return `至少要填 ${MIN_OPTIONS} 个选项。`;
  }
  const duplicate = options.find((text, index) => options.indexOf(text) !== index);
  return duplicate ? `选项「${duplicate}」重复了。` : null;
}

export function CreatePollDialog({ conversationId, onCreated, onClose }: { conversationId: number; onCreated?: () => void; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  // 选项带一个稳定的 key：从中间删掉一项时，后面输入框里的内容和焦点不会错位
  const [options, setOptions] = useState(() => [{ key: 0, text: '' }, { key: 1, text: '' }]);
  const nextKeyRef = useRef(MIN_OPTIONS);
  const optionListRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ChoiceMode>('single');
  const [anonymous, setAnonymous] = useState(false);
  const [deadline, setDeadline] = useState<Deadline>('0');
  // 第一次点「发起」之前不报错，之后随着修改实时更新
  const [attempted, setAttempted] = useState(false);

  const create = useMutation({
    mutationFn: (payload: CreatePollPayload) => createPoll(conversationId, payload),
    onSuccess: (message) => {
      // 和发普通消息一样直接写进缓存，不等实时事件
      // 先回到最新再写缓存：列表贴着底，新消息才会跟着露出来
      onCreated?.();
      queryClient.setQueryData<MessagesInfiniteData | undefined>(['messages', message.conversation_id], (current) => upsertMessageIntoFirstPage(current, message));
      queryClient.setQueryData<Conversation[] | undefined>(['conversations'], (current) => applyLatestMessageToConversations(current, message, { visibleConversationId: conversationId }));
      onClose();
    },
    // 期间被禁言的话，让输入框那边也换成锁定状态
    onError: (error) => {
      absorbMuteError(error);
    }
  });

  const cleanTitle = title.trim();
  const cleanOptions = options.map((option) => option.text.trim()).filter(Boolean);
  const problem = validate(cleanTitle, cleanOptions);
  const error = attempted ? problem ?? create.error?.message : null;

  function addOption(): void {
    setOptions((current) => [...current, { key: nextKeyRef.current, text: '' }]);
    nextKeyRef.current += 1;
  }

  function submit(): void {
    setAttempted(true);
    if (problem || create.isPending) {
      return;
    }
    const hours = Number(deadline);
    create.mutate({
      title: cleanTitle,
      options: cleanOptions,
      multiple: mode === 'multiple',
      anonymous,
      closes_at: hours > 0 ? new Date(Date.now() + hours * 3600_000).toISOString() : null
    });
  }

  return (
    <PollDialog
      title="发起投票"
      onClose={onClose}
      footer={(
        <>
          {error ? <p className="kcp-form-error" role="alert">{error}</p> : null}
          <button type="button" className="kui-btn" onClick={onClose}>取消</button>
          <button type="button" className="kui-btn kui-btn--primary" disabled={create.isPending} onClick={submit}>{create.isPending ? '发起中…' : '发起投票'}</button>
        </>
      )}
    >
      <label className="kcp-field">
        <span className="kcp-field-label">标题<span className="kcp-field-count">{title.length}/{TITLE_MAX}</span></span>
        <input className="kui-input" value={title} maxLength={TITLE_MAX} placeholder="想问大家什么？" autoFocus onChange={(event) => setTitle(event.target.value)} />
      </label>

      <div className="kcp-field">
        <span className="kcp-field-label">选项<span className="kcp-field-count">{options.length}/{MAX_OPTIONS}</span></span>
        <div ref={optionListRef} className="kcp-option-edits">
          {options.map((option, index) => (
            <div key={option.key} className="kcp-option-edit">
              <input
                className="kui-input"
                value={option.text}
                maxLength={OPTION_MAX}
                placeholder={`选项 ${index + 1}`}
                aria-label={`选项 ${index + 1}`}
                // 开头的两项是自带的，之后新增的一项出现时直接进入输入
                autoFocus={option.key >= MIN_OPTIONS}
                onChange={(event) => setOptions((current) => current.map((item) => (item.key === option.key ? { ...item, text: event.target.value } : item)))}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
                    return;
                  }
                  // 回车接着填下一项，填到最后一项就再加一项
                  const next = optionListRef.current?.querySelectorAll('input')[index + 1];
                  if (next) {
                    next.focus();
                  } else if (options.length < MAX_OPTIONS) {
                    addOption();
                  }
                }}
              />
              <button type="button" className="kui-icon-btn" title="删除这个选项" aria-label={`删除选项 ${index + 1}`} disabled={options.length <= MIN_OPTIONS} onClick={() => setOptions((current) => current.filter((item) => item.key !== option.key))}>
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {options.length < MAX_OPTIONS ? <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm kcp-add-option" onClick={addOption}><Icon name="plus" className="h-3.5 w-3.5" />添加选项</button> : null}
      </div>

      <div className="kcp-settings">
        <SegmentRow label="投票方式" value={mode} options={MODE_OPTIONS} onChange={setMode} />
        <SwitchRow label="匿名投票" hint="开启后，任何人都看不到谁投了哪一项" checked={anonymous} onChange={setAnonymous} />
        <SegmentRow label="截止时间" value={deadline} options={DEADLINE_OPTIONS} onChange={setDeadline} />
      </div>
    </PollDialog>
  );
}
