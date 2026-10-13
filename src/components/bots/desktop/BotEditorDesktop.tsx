import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBot, updateBot } from '@/api/bots';
import { uploadAvatar } from '@/api/users';
import { BotCommandSignature } from '@/components/chat/desktop/BotCommandHint';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { Bot, BotCreateRead, BotPayload } from '@/types/api';
import { BOT_COMMANDS_MAX_LENGTH, normalizeBotCommandName, normalizeBotCommandParam, parseBotCommands, serializeBotCommands, type BotCommand, type BotCommandParam } from '@/utils/botCommands';
import { errorMessage, nonEmptyLines } from '../botShared';
import { KeyDialog } from './BotDialogs';

interface BotEditorDesktopProps {
  /** 要编辑的机器人；传 null 是新建。只在挂载时读一次，换一个机器人要重新挂载 */
  bot: Bot | null;
  onBack: () => void;
}

interface ParamRow extends BotCommandParam {
  id: number;
}

interface CommandRow extends BotCommand {
  id: number;
  params: ParamRow[];
}

// 与服务端 schema 的长度上限一致
const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const FUNCTIONS_MAX = 3000;

let idSeed = 0;

/** 指令行和参数行都可以上下挪动，要有一个不随位置变的 key */
function nextId(): number {
  idSeed += 1;
  return idSeed;
}

function createParam(param: BotCommandParam = { name: '', required: true, hint: '' }): ParamRow {
  return { ...param, id: nextId() };
}

function createRow(command = '', description = '', params: BotCommandParam[] = []): CommandRow {
  return { id: nextId(), command, description, params: params.map((param) => createParam(param)) };
}

function initialRows(text: string | null | undefined): CommandRow[] {
  // 说明在这里是单行输入框，旧数据里的多行说明并成一行
  const rows = parseBotCommands(text).map((item) => createRow(item.command, item.description.replace(/\n/g, ' '), item.params));
  return rows.length > 0 ? rows : [createRow()];
}

function moved<T>(list: T[], index: number, offset: -1 | 1): T[] {
  const next = [...list];
  next.splice(index + offset, 0, ...next.splice(index, 1));
  return next;
}

/** 参数标记的定界符写进参数名或参数说明，序列化时会被去掉；保存前拦下来，别让作者写的东西悄悄变样。 */
function paramError(rows: CommandRow[]): string {
  for (let index = 0; index < rows.length; index += 1) {
    for (const param of rows[index].params) {
      const name = param.name.trim();
      if (!name) {
        return `第 ${index + 1} 条指令有参数还没有填参数名。`;
      }
      const clean = normalizeBotCommandParam(param);
      if (clean.name !== name || clean.hint !== param.hint.trim()) {
        return `第 ${index + 1} 条指令的参数「${name}」：参数名不能有空格和 < > [ ] :，参数说明不能有 < > [ ]。`;
      }
    }
  }
  return '';
}

/** 旧的自由文本里排在第一条指令之前的内容。它们解析不成指令，保存后就没了，得提前告诉作者。 */
function legacyLines(text: string | null | undefined): string[] {
  const lines = (text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const first = lines.findIndex((line) => parseBotCommands(line).length > 0);
  return first < 0 ? lines : lines.slice(0, first);
}

/** 桌面端的机器人资料编辑页：左边填资料和指令，右边实时预览别人看到的样子。 */
export function BotEditorDesktop({ bot, onBack }: BotEditorDesktopProps): JSX.Element {
  const queryClient = useQueryClient();
  const [name, setName] = useState(bot?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(bot?.avatar_url ?? '');
  const [description, setDescription] = useState(bot?.description ?? '');
  const [functions, setFunctions] = useState(bot?.functions ?? '');
  const [isPublic, setIsPublic] = useState(bot?.is_public ?? true);
  const [rows, setRows] = useState(() => initialRows(bot?.commands));
  const [legacy] = useState(() => legacyLines(bot?.commands));
  const [addedId, setAddedId] = useState<number | null>(null);
  const [formError, setFormError] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (payload: BotPayload): Promise<Bot | BotCreateRead> => (bot ? updateBot(bot.id, payload) : createBot(payload)),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['bots'] });
      // 群聊输入框的指令面板读的是这份缓存
      void queryClient.invalidateQueries({ queryKey: ['conversation-bots'] });
      if ('key' in result) {
        setNewKey(result.key);
      } else {
        onBack();
      }
    }
  });
  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (result) => setAvatarUrl(result.url)
  });

  const commandsText = serializeBotCommands(rows);
  // 预览走一遍「存下去再读回来」，看到的就是保存之后的结果
  const previewCommands = parseBotCommands(commandsText);
  const functionLines = nonEmptyLines(functions);
  const requestError = saveMutation.error ?? avatarMutation.error;
  const error = formError || (requestError ? errorMessage(requestError) : '');

  function updateRow(id: number, patch: Partial<CommandRow>): void {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    const row = createRow();
    setAddedId(row.id);
    setRows((current) => [...current, row]);
  }

  function addParam(row: CommandRow): void {
    const param = createParam();
    setAddedId(param.id);
    updateRow(row.id, { params: [...row.params, param] });
  }

  function updateParam(row: CommandRow, id: number, patch: Partial<BotCommandParam>): void {
    updateRow(row.id, { params: row.params.map((param) => (param.id === id ? { ...param, ...patch } : param)) });
  }

  function submit(): void {
    // 没有指令名的行在序列化时会被丢掉，不能让写好的说明和参数悄悄消失
    const unnamed = rows.findIndex((row) => (row.description.trim() || row.params.length > 0) && !normalizeBotCommandName(row.command));
    if (unnamed >= 0) {
      setFormError(`第 ${unnamed + 1} 条指令还没有填指令名。`);
      return;
    }
    const invalidParam = paramError(rows);
    if (invalidParam) {
      setFormError(invalidParam);
      return;
    }
    if (commandsText.length > BOT_COMMANDS_MAX_LENGTH) {
      setFormError(`指令、参数和说明加起来有 ${commandsText.length} 个字符，超过了 ${BOT_COMMANDS_MAX_LENGTH} 的上限，请删减后再保存。`);
      return;
    }
    setFormError('');
    saveMutation.mutate({
      name: name.trim(),
      avatar_url: avatarUrl || null,
      description: description.trim() || null,
      functions: functions.trim() || null,
      commands: commandsText || null,
      is_public: isPublic
    });
  }

  return (
    <section className="kui kcb-editor">
      <header className="kcb-editor-header">
        <button type="button" className="kui-icon-btn" aria-label="返回" onClick={onBack}><Icon name="chevronLeft" className="h-[18px] w-[18px]" /></button>
        <h2 className="kcb-editor-title">{bot ? '编辑机器人' : '新建机器人'}</h2>
        <button type="button" className="kui-btn" onClick={onBack}>取消</button>
        <button type="button" className="kui-btn kui-btn--primary" disabled={!name.trim() || saveMutation.isPending || avatarMutation.isPending} onClick={submit}>{saveMutation.isPending ? '保存中…' : bot ? '保存' : '创建'}</button>
      </header>

      {error ? <p className="kui-note kui-note--danger kcb-editor-error" role="alert">{error}</p> : null}

      <div className="kcb-editor-body kui-scroll">
        <div className="kcb-editor-form kui-scroll">
          <div className="kui-group">
            <div className="kui-group-title">基础资料</div>
            <div className="kcb-avatar-row">
              <Avatar label={name.trim() || '机器人'} avatarUrl={avatarUrl} size="lg" />
              <label className="kui-btn kui-btn--sm">
                {avatarMutation.isPending ? '上传中…' : '上传头像'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={avatarMutation.isPending} onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    avatarMutation.mutate(file);
                  }
                  event.target.value = '';
                }} />
              </label>
              <span className="kui-row-hint">png、jpg、webp 或 gif</span>
            </div>
            <label className="kcb-field">
              <span className="kcb-field-label">名称<span className="kcb-count">{name.length}/{NAME_MAX}</span></span>
              <input className="kui-input" value={name} maxLength={NAME_MAX} placeholder="例如：答疑机器人" onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="kcb-field">
              <span className="kcb-field-label">简介<span className="kcb-count">{description.length}/{DESCRIPTION_MAX}</span></span>
              <textarea className="kui-textarea kui-scroll" rows={4} value={description} maxLength={DESCRIPTION_MAX} placeholder="用一两句话说清它是做什么的" onChange={(event) => setDescription(event.target.value)} />
              <span className="kui-row-hint">显示在机器人广场的卡片、详情页顶部和分享出去的名片上，可以换行。</span>
            </label>
          </div>

          <div className="kui-group">
            <label className="kcb-field">
              <span className="kui-group-title">功能介绍<span className="kcb-count">{functions.length}/{FUNCTIONS_MAX}</span></span>
              <textarea className="kui-textarea kui-scroll" rows={6} value={functions} maxLength={FUNCTIONS_MAX} placeholder={'自动回复常见问题\n每日签到、查询在线人数\n在群里 @ 它就能用'} onChange={(event) => setFunctions(event.target.value)} />
              <span className="kui-row-hint">一行写一个功能点，详情页会排成列表。</span>
            </label>
          </div>

          <div className="kui-group">
            <div className="kui-group-title">指令<span className={commandsText.length > BOT_COMMANDS_MAX_LENGTH ? 'kcb-count is-over' : 'kcb-count'}>{commandsText.length}/{BOT_COMMANDS_MAX_LENGTH}</span></div>
            <span className="kui-row-hint">左边填指令名，右边写它是做什么的。指令统一以 / 开头，没写会自动补上。要用户跟着填内容的指令可以加参数，输入时会提示该填什么。</span>
            {legacy.length > 0 ? <p className="kui-note kui-note--warn kcb-legacy">{`原来的指令里有 ${legacy.length} 行不是「/指令 说明」的格式，保存后不会保留，需要的话请改写成下面的指令：\n${legacy.join('\n')}`}</p> : null}
            {rows.map((row, index) => (
              <div key={row.id}>
                <div className="kcb-cmd-row">
                  <input
                    className="kui-input kcb-cmd-name"
                    value={row.command}
                    placeholder="/help"
                    aria-label={`第 ${index + 1} 条指令`}
                    spellCheck={false}
                    autoFocus={row.id === addedId}
                    onChange={(event) => updateRow(row.id, { command: event.target.value })}
                    onBlur={() => updateRow(row.id, { command: normalizeBotCommandName(row.command) })}
                  />
                  <input className="kui-input" value={row.description} placeholder="这条指令是做什么的" aria-label={`第 ${index + 1} 条指令的说明`} onChange={(event) => updateRow(row.id, { description: event.target.value })} />
                  <button type="button" className="kui-btn kui-btn--ghost kui-btn--sm" title="给这条指令加一个参数" onClick={() => addParam(row)}><Icon name="plus" className="h-3.5 w-3.5" />参数</button>
                  <button type="button" className="kui-icon-btn kcb-cmd-up" title="上移" aria-label="上移" disabled={index === 0} onClick={() => setRows((current) => moved(current, index, -1))}><Icon name="chevron" className="h-4 w-4" /></button>
                  <button type="button" className="kui-icon-btn kcb-cmd-down" title="下移" aria-label="下移" disabled={index === rows.length - 1} onClick={() => setRows((current) => moved(current, index, 1))}><Icon name="chevron" className="h-4 w-4" /></button>
                  <button type="button" className="kui-icon-btn" title="删除" aria-label="删除这条指令" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}><Icon name="trash" className="h-4 w-4" /></button>
                </div>
                {row.params.length > 0 ? (
                  <div className="kcb-cmd-params">
                    {row.params.map((param, paramIndex) => (
                      <div key={param.id} className="kcb-cmd-row">
                        <div className="kui-segment" role="group" aria-label={`第 ${paramIndex + 1} 个参数是否必填`}>
                          <button type="button" className={param.required ? 'is-active' : undefined} aria-pressed={param.required} onClick={() => updateParam(row, param.id, { required: true })}>必填</button>
                          <button type="button" className={param.required ? undefined : 'is-active'} aria-pressed={!param.required} onClick={() => updateParam(row, param.id, { required: false })}>可选</button>
                        </div>
                        <input className="kui-input kcb-cmd-name" value={param.name} placeholder="参数名" aria-label={`第 ${paramIndex + 1} 个参数的名字`} spellCheck={false} autoFocus={param.id === addedId} onChange={(event) => updateParam(row, param.id, { name: event.target.value })} />
                        <input className="kui-input" value={param.hint} placeholder="参数说明，输入到这个参数时显示，可以不填" aria-label={`第 ${paramIndex + 1} 个参数的说明`} onChange={(event) => updateParam(row, param.id, { hint: event.target.value })} />
                        <button type="button" className="kui-icon-btn kcb-cmd-up" title="上移" aria-label="上移参数" disabled={paramIndex === 0} onClick={() => updateRow(row.id, { params: moved(row.params, paramIndex, -1) })}><Icon name="chevron" className="h-4 w-4" /></button>
                        <button type="button" className="kui-icon-btn kcb-cmd-down" title="下移" aria-label="下移参数" disabled={paramIndex === row.params.length - 1} onClick={() => updateRow(row.id, { params: moved(row.params, paramIndex, 1) })}><Icon name="chevron" className="h-4 w-4" /></button>
                        <button type="button" className="kui-icon-btn" title="删除" aria-label="删除这个参数" onClick={() => updateRow(row.id, { params: row.params.filter((item) => item.id !== param.id) })}><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <button type="button" className="kui-btn kui-btn--sm kcb-cmd-add" onClick={addRow}><Icon name="plus" className="h-3.5 w-3.5" />添加指令</button>
          </div>

          <div className="kui-group">
            <label className="kui-row">
              <span className="kui-row-label">
                公开到机器人广场
                <span className="kui-row-hint">公开后，其他群的群主和管理员也能把它加进自己的群。</span>
              </span>
              <input type="checkbox" role="switch" className="kui-switch" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            </label>
          </div>
        </div>

        <aside className="kcb-editor-preview kui-scroll" aria-label="预览">
          <div className="kui-group-title">用户看到的样子</div>
          <div className="kcb-preview-head">
            <Avatar label={name.trim() || '机器人'} avatarUrl={avatarUrl} size="lg" />
            <span className="kcb-preview-name">{name.trim() || '机器人名称'}</span>
            <span className="kui-tag">{isPublic ? '公开' : '私有'}</span>
          </div>
          <p className="kcb-preview-text">{description.trim() || '这个机器人还没有写介绍'}</p>

          <div className="kui-group-title">功能介绍</div>
          {functionLines.length > 0 ? (
            <ul className="kcb-preview-list">{functionLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
          ) : <p className="kui-muted">暂无功能说明</p>}

          <div className="kui-group-title">指令</div>
          <span className="kui-row-hint">群成员点输入框上的机器人按钮，或者输入 / 时，看到的就是这份列表。</span>
          {previewCommands.length > 0 ? (
            <div className="kcb-preview-commands">
              {previewCommands.map((item, index) => (
                <div key={index} className="kcb-command">
                  <span className="kcb-command-name"><BotCommandSignature command={item} /></span>
                  {item.description ? <span className="kcb-command-desc" title={item.description}>{item.description}</span> : null}
                </div>
              ))}
            </div>
          ) : <p className="kui-muted">暂无指令</p>}
        </aside>
      </div>

      {newKey ? <KeyDialog botKey={newKey} onClose={onBack} /> : null}
    </section>
  );
}
