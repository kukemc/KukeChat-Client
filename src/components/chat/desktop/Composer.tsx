import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getConversationBots } from '@/api/bots';
import { searchConversationMembers } from '@/api/conversations';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { ConversationMember, MemberRole, MessageMetadata, MessageQuoteMetadata, MessageType, User } from '@/types/api';
import { MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES, MAX_IMAGE_UPLOAD_BYTES, MAX_MESSAGE_CONTENT_LENGTH, MENTION_ALL_REMAINING } from '../message/constants';
import { formatBytes, formatVoiceDuration, matchesMember, memberUserId } from '../message/messageMeta';
import type { SendMessageVariables, StagedImage, StagedVoice } from '../message/types';
import { StagedVoicePreview } from '../message/VoiceMessage';
import { BotCommandHint } from './BotCommandHint';
import { BotCommandPanel, botCommandOptions } from './BotCommandPanel';
import { activeMentionQuery, composerText, focusAtEnd, insertMentionToken, insertText, readMentions, removeLeadingCommand, removeTokenBeforeCaret, selectionRange, type MentionQuery } from './composerDom';
import { EmojiPanel } from './emojis/EmojiPanel';
import { ImageSendDialog, MAX_IMAGES_PER_MESSAGE } from './dialogs/ImageSendDialog';
import { formatMuteEnd, useMuteStatus } from '@/store/moderationStore';
import { useComposerPrefs } from '@/store/composerPrefs';
import { matchBotCommandInput } from '@/utils/botCommands';
import { PollComposerButton } from './polls/PollComposerButton';
import { FileComposerButton, useChatFileSender } from '@/components/groupPlus/files/FileComposerButton';
import { GiftComposerButton } from '@/components/gifts/GiftEntry';
import { RedPacketComposerButton } from '@/components/redpacket/RedPacketEntry';
import { cx, readNumberPreference, writePreference } from './runtime';
import { reportTyping, resetTyping } from './typing/reportTyping';
import { useVoiceRecorder } from './useVoiceRecorder';

export interface ComposerHandle {
  insertQuote: (quote: MessageQuoteMetadata, mentionTarget?: { userId: number; name: string }) => void;
  insertMention: (member: ConversationMember) => void;
  insertTextAtStart: (text: string) => void;
  stageFiles: (files: File[]) => void;
  focus: () => void;
}

interface ComposerProps {
  conversationId: number;
  isGroup: boolean;
  currentRole: MemberRole;
  members: ConversationMember[];
  sending: boolean;
  canCreateTask: boolean;
  isTaskAssistantChat: boolean;
  /** 这个会话里能不能发红包（和机器人的私聊不能）。服务端关着红包时入口自己不出现 */
  canSendRedPacket: boolean;
  /** 私聊的对方：工具栏上的「送礼物」在私聊里直接送给 Ta（群里在面板里选人）。和机器人、任务助手的会话里礼物入口跟着红包一起不出现 */
  directUser?: User | null;
  /** 要不要上报「正在输入」。群主把这个群的提示关了（typing_indicator = off）就不发，省得白发；大群的「自动」由服务端判断，这里照发 */
  reportsTyping?: boolean;
  onSend: (variables: SendMessageVariables) => void;
  /** 不经过 onSend 发出去的消息（比如投票、红包）发成功后调用，让列表回到最新。 */
  onOwnMessageSent?: () => void;
  onMembersNeeded?: () => void;
  onCreateTask: () => void;
  onOpenTaskCenter: () => void;
  onOpenPenalties: () => void;
  setError: (message: string) => void;
}

const HEIGHT_PREFERENCE_KEY = 'kukechat.desktop.composerHeight';
const DEFAULT_HEIGHT = 168;
const MIN_HEIGHT = 132;
const MAX_HEIGHT = 420;
/** 没发出去的文字按会话暂存，切回来还在。只存纯文本，不落盘。 */
const drafts = new Map<number, string>();

function memberName(member: ConversationMember): string {
  const userId = memberUserId(member);
  return member.nickname?.trim() || getDisplayName(member.user, userId ? `用户 ${userId}` : '成员');
}

const ComposerInner = forwardRef<ComposerHandle, ComposerProps>(function Composer({ conversationId, isGroup, currentRole, members, sending, canCreateTask, isTaskAssistantChat, canSendRedPacket, directUser, reportsTyping = true, onSend, onOwnMessageSent, onMembersNeeded, onCreateTask, onOpenTaskCenter, onOpenPenalties, setError }, ref) {
  const mute = useMuteStatus();
  // 群文件开着时，拖进来 / 粘贴进来的非图片文件直接当文件发（带进度的上传卡片）；私聊和没开群文件的群是 null
  const sendFiles = useChatFileSender(conversationId, isGroup);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  // 参数提示看的是已经上屏的文字：组词期间编辑器里是带空格的拼音，按它数参数个数会让提示条来回跳
  const [committedText, setCommittedText] = useState('');
  const [quote, setQuote] = useState<MessageQuoteMetadata | null>(null);
  // 选好、拖进来、粘贴进来的图：「放进输入框」模式下显示在输入框里，和文字一起发；
  // 「弹出确认框」模式下进「发送图片」确认框（ImageSendDialog），点发送才发。模式记在本机（store/composerPrefs）
  const pasteImageMode = useComposerPrefs((state) => state.pasteImageMode);
  const setPasteImageMode = useComposerPrefs((state) => state.setPasteImageMode);
  const inlineImages = pasteImageMode === 'inline';
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [imageNotice, setImageNotice] = useState('');
  const [stagedVoice, setStagedVoice] = useState<StagedVoice | null>(null);
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // query 为 null 是从工具栏按钮打开、浏览全部指令；否则是输入框里正在敲的「/前缀」，按它过滤
  const [botPanel, setBotPanel] = useState<{ query: string | null; index: number } | null>(null);
  const [height, setHeight] = useState(() => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, readNumberPreference(HEIGHT_PREFERENCE_KEY, DEFAULT_HEIGHT))));
  const canMentionAll = isGroup && (currentRole === 'owner' || currentRole === 'admin');

  const voice = useVoiceRecorder({
    onRecorded: (recorded) => {
      setError('');
      setStagedVoice(recorded);
    },
    onError: setError
  });

  const mentionKeyword = mention?.query.trim() ?? '';
  const mentionMembersQuery = useQuery({
    queryKey: ['conversation-members', conversationId, 'mention-search', mentionKeyword],
    queryFn: () => searchConversationMembers(conversationId, mentionKeyword, 8),
    enabled: Boolean(isGroup && mention),
    staleTime: 15_000
  });
  const fallbackMentionMembers = members.filter((member) => !mentionKeyword || matchesMember(member, mentionKeyword.toLowerCase())).slice(0, 8);
  const mentionMembers = mention ? mentionMembersQuery.data ?? fallbackMentionMembers : [];
  const mentionOptionCount = mentionMembers.length + (canMentionAll ? 1 : 0);

  const botsQuery = useQuery({
    queryKey: ['conversation-bots', conversationId],
    queryFn: () => getConversationBots(conversationId),
    enabled: isGroup,
    // 群里装了哪些机器人很少变，进会话取一次就够；装卸机器人的地方会让这份缓存失效
    staleTime: 60_000
  });
  const botCommands = useMemo(() => botCommandOptions(botsQuery.data), [botsQuery.data]);
  const botPrefix = botPanel?.query?.toLowerCase();
  const botOptions = useMemo(() => (botPrefix ? botCommands.filter((option) => option.command.toLowerCase().startsWith(botPrefix)) : botCommands), [botCommands, botPrefix]);
  // @ 成员面板占着同一块位置，它开着的时候让给它；过滤后一条不剩也不显示，回车照常发送
  const openBotPanel = botPanel && !mention && botOptions.length > 0 ? botPanel : null;
  const botIndex = Math.min(openBotPanel?.index ?? 0, botOptions.length - 1);
  const closeBotPanel = useCallback(() => setBotPanel(null), []);
  const paramHint = useMemo(() => matchBotCommandInput(committedText, botCommands), [committedText, botCommands]);

  // 待发送的图片和语音各自持有 object URL，离开时要释放
  const stagedRef = useRef({ stagedImages, stagedVoice });
  stagedRef.current = { stagedImages, stagedVoice };
  useEffect(() => () => {
    stagedRef.current.stagedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    if (stagedRef.current.stagedVoice) {
      URL.revokeObjectURL(stagedRef.current.stagedVoice.previewUrl);
    }
  }, []);

  // 放进输入框的图多了一行缩略图，把输入框滚到底，正在打的那行别被挤出视野
  const inlineImageCount = inlineImages ? stagedImages.length : 0;
  useEffect(() => {
    const body = editorRef.current?.closest('.kcd-composer-body');
    if (inlineImageCount > 0 && body) {
      body.scrollTop = body.scrollHeight;
    }
  }, [inlineImageCount]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const draft = drafts.get(conversationId);
    if (draft) {
      editor.textContent = draft;
      setText(draft);
      setCommittedText(draft);
    }
    focusAtEnd(editor);
    return () => {
      const pending = composerText(editor);
      if (pending.trim()) {
        drafts.set(conversationId, pending);
      } else {
        drafts.delete(conversationId);
      }
    };
  }, [conversationId]);

  function syncText(composing = false): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const next = composerText(editor);
    if (!next.trim() && editor.innerHTML === '<br>') {
      editor.innerHTML = '';
    }
    setText(next);
    if (!composing) {
      setCommittedText(next);
    }
    if (reportsTyping) {
      reportTyping(conversationId, next);
    }
  }

  function refreshMention(): void {
    const editor = editorRef.current;
    const next = isGroup && editor ? activeMentionQuery(editor) : null;
    if (next && !mention) {
      onMembersNeeded?.();
    }
    setMention(next);
    setMentionIndex(0);
  }

  /** 整个输入框只有一个「/前缀」时按它过滤机器人指令，删掉「/」或敲了空格就收起。从按钮打开的面板不受打字影响。 */
  function refreshSlashCommand(): void {
    const editor = editorRef.current;
    if (!editor || botCommands.length === 0) {
      return;
    }
    const value = composerText(editor);
    const query = /^\/\S*$/.test(value) ? value : null;
    setBotPanel((current) => {
      if (query !== null) {
        return current?.query === query ? current : { query, index: 0 };
      }
      return current && current.query !== null ? null : current;
    });
  }

  function pickBotCommand(command: string): void {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    removeLeadingCommand(editor);
    insertText(editor, `${command} `, 'start');
    setBotPanel(null);
    syncText();
  }

  function clearStagedVoice(): void {
    setStagedVoice((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  }

  function stageFiles(files: File[]): void {
    const others = files.filter((file) => !file.type.startsWith('image/'));
    if (others.length > 0) {
      if (mute.muted) {
        return;
      }
      if (sendFiles) {
        sendFiles(others);
        onOwnMessageSent?.();
      } else {
        setError(isGroup ? '这个群还没有开通群文件，只能发送图片。' : '私聊暂时只能发送图片。');
      }
    }
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) {
      return;
    }
    if (stagedVoice || voice.recording) {
      setError('语音消息不能和图片一起发送。');
      return;
    }
    const oversized = images.filter((file) => file.size > (/^(image\/jpeg|image\/png|image\/webp)$/i.test(file.type) ? MAX_COMPRESSIBLE_IMAGE_ORIGINAL_BYTES : MAX_IMAGE_UPLOAD_BYTES));
    const valid = images.filter((file) => !oversized.includes(file));
    const already = stagedRef.current.stagedImages.length;
    const room = Math.max(0, MAX_IMAGES_PER_MESSAGE - already);
    const accepted = valid.slice(0, room);
    const notes: string[] = [];
    if (oversized.length > 0) {
      notes.push(`JPEG/PNG/WEBP 原图不能超过 12MB，GIF 及其他图片原图不能超过 3MB；压缩后不能超过 3MB。已忽略：${oversized.map((file) => `${file.name} (${formatBytes(file.size)})`).join('、')}`);
    }
    if (valid.length > room) {
      notes.push(`一次最多发送 ${MAX_IMAGES_PER_MESSAGE} 张图片，多出的 ${valid.length - room} 张没有加进来。`);
    }
    const note = notes.join(' ');
    if (inlineImages) {
      // 放进输入框：提示都放到输入框上方的错误条里
      setError(note);
      setImageNotice('');
    } else if (accepted.length === 0) {
      // 确认框还没开：提示放到输入框上方；开着就放在框里
      if (already > 0) {
        setImageNotice(note);
      } else {
        setError(note);
      }
    }
    if (accepted.length === 0) {
      return;
    }
    if (!inlineImages) {
      setError('');
      setImageNotice(note);
    }
    setStagedImages((current) => [
      ...current,
      ...accepted.map((file, index) => ({ id: `${Date.now()}-${current.length + index}-${file.name}`, file, previewUrl: URL.createObjectURL(file) }))
    ]);
    // 从工具栏选图或拖进来时焦点不在输入框里，放进输入框后接着就能打字
    const editor = editorRef.current;
    if (inlineImages && editor && document.activeElement !== editor) {
      focusAtEnd(editor);
    }
  }

  function clearStagedImages(): void {
    setImageNotice('');
    setStagedImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }

  /** 确认框里点了「发送」：图（和说明）合成一条消息，带上输入框里正在引用的那条。 */
  function sendStagedImages(caption: string): void {
    const files = stagedImages.map((item) => item.file);
    if (files.length === 0 || mute.muted) {
      return;
    }
    const metadata: MessageMetadata = {};
    if (quote) metadata.quote = quote;
    const nextMetadata = Object.keys(metadata).length > 0 ? metadata : undefined;
    setQuote(null);
    clearStagedImages();
    setError('');
    onSend({ content: caption, type: files.length === 1 && !caption ? 'image' : 'text', metadata: nextMetadata, files });
    editorRef.current?.focus({ preventScroll: true });
  }

  /** 输入框里缩略图那一行末尾的「改为确认后发送」：记住新模式，已经放进来的图直接进确认框（输入框里的文字不动）。 */
  function switchToConfirm(): void {
    setError('');
    setImageNotice('');
    setPasteImageMode('confirm');
  }

  /** 确认框里的「改为放进输入框」：记住新模式，图回到输入框，已经写的说明接到输入框末尾。 */
  function switchToInline(caption: string): void {
    setImageNotice('');
    setPasteImageMode('inline');
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    focusAtEnd(editor);
    if (caption) {
      insertText(editor, composerText(editor).trim() ? ` ${caption}` : caption);
      syncText();
    }
  }

  function removeStagedImage(id: string): void {
    setStagedImages((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function pickMention(index: number): void {
    const editor = editorRef.current;
    if (!editor || !mention) {
      return;
    }
    if (canMentionAll && index === 0) {
      insertMentionToken(editor, '全体成员', { mentionAll: true, range: mention.range });
    } else {
      const member = mentionMembers[index - (canMentionAll ? 1 : 0)];
      const userId = member ? memberUserId(member) : null;
      if (!member || !userId) {
        return;
      }
      insertMentionToken(editor, memberName(member), { userId, range: mention.range });
    }
    setMention(null);
    syncText();
  }

  function submit(): void {
    const editor = editorRef.current;
    if (!editor || sending || mute.muted) {
      return;
    }
    const raw = composerText(editor);
    const content = raw.trim();
    const files = stagedImages.map((item) => item.file);
    if (!content && files.length === 0 && !stagedVoice) {
      return;
    }
    if (stagedVoice && (content || files.length > 0)) {
      setError('语音消息不能和文字或图片一起发送。');
      return;
    }
    if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
      setError(`消息内容不能超过 ${MAX_MESSAGE_CONTENT_LENGTH} 字。`);
      return;
    }
    const mentionData = readMentions(editor);
    const metadata: MessageMetadata = {};
    if (quote) metadata.quote = quote;
    if (mentionData.mentions.length > 0) metadata.mentions = mentionData.mentions;
    if (mentionData.mentionAll) metadata.mention_all = true;
    const nextMetadata = Object.keys(metadata).length > 0 ? metadata : undefined;
    const type: MessageType = stagedVoice ? 'voice' : files.length === 1 && !content ? 'image' : 'text';
    const variables: SendMessageVariables = stagedVoice
      ? { content: '', type: 'voice', metadata: nextMetadata, voiceFile: stagedVoice.file, voiceDurationMs: stagedVoice.durationMs, voiceWaveform: stagedVoice.waveform }
      : { content: content ? raw.trimEnd() : '', type, metadata: nextMetadata, files };

    editor.innerHTML = '';
    drafts.delete(conversationId);
    resetTyping(conversationId);
    setText('');
    setCommittedText('');
    setQuote(null);
    setMention(null);
    setBotPanel(null);
    setStagedImages((current) => {
      current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    clearStagedVoice();
    setError('');
    onSend(variables);
    editor.focus({ preventScroll: true });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    // 输入法组词期间的回车是「上屏」，不能当成发送
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (mention && mentionOptionCount > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex((current) => (current + (event.key === 'ArrowDown' ? 1 : mentionOptionCount - 1)) % mentionOptionCount);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pickMention(mentionIndex);
        return;
      }
    }
    if (openBotPanel) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setBotPanel({ ...openBotPanel, index: (botIndex + (event.key === 'ArrowDown' ? 1 : botOptions.length - 1)) % botOptions.length });
        return;
      }
      // 已经完整敲出这条指令时，回车就是发送，不再多按一次
      const typedInFull = event.key === 'Enter' && openBotPanel.query?.toLowerCase() === botOptions[botIndex].command.toLowerCase();
      if ((event.key === 'Enter' || event.key === 'Tab') && !typedInFull) {
        event.preventDefault();
        pickBotCommand(botOptions[botIndex].command);
        return;
      }
    }
    if (event.key === 'Escape') {
      if (mention) {
        event.preventDefault();
        setMention(null);
      } else if (openBotPanel) {
        event.preventDefault();
        setBotPanel(null);
      } else if (emojiOpen) {
        event.preventDefault();
        setEmojiOpen(false);
      } else if (quote) {
        event.preventDefault();
        setQuote(null);
      }
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      insertText(event.currentTarget, '\n');
      syncText();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Backspace' && removeTokenBeforeCaret(event.currentTarget)) {
      event.preventDefault();
      syncText();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>): void {
    // 复制的文件：图片照旧放进输入框 / 确认框，其他文件在群里直接发（stageFiles 里分）
    const pastedFiles = Array.from(event.clipboardData.files);
    if (pastedFiles.length > 0) {
      event.preventDefault();
      stageFiles(pastedFiles);
      return;
    }
    const pasted = event.clipboardData.getData('text/plain');
    const editor = editorRef.current;
    if (pasted && editor) {
      event.preventDefault();
      insertText(editor, pasted);
      syncText();
      refreshMention();
      refreshSlashCommand();
    }
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    const startY = event.clientY;
    const handle = event.currentTarget;
    // 内容多时卡片会比设定的高度高：从眼前的实际高度开始拖，不然一按下去会先跳回设定值
    const shown = handle.parentElement?.getBoundingClientRect().height ?? height;
    const startHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(shown)));
    handle.setPointerCapture(event.pointerId);
    let latest = startHeight;
    const move = (moveEvent: PointerEvent): void => {
      latest = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + startY - moveEvent.clientY));
      setHeight(latest);
    };
    const end = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      writePreference(HEIGHT_PREFERENCE_KEY, String(Math.round(latest)));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  useImperativeHandle(ref, () => ({
    insertQuote: (quoteData, mentionTarget) => {
      const editor = editorRef.current;
      setQuote(quoteData);
      if (!editor) {
        return;
      }
      focusAtEnd(editor);
      if (mentionTarget && !readMentions(editor).mentions.some((item) => item.user_id === mentionTarget.userId)) {
        insertMentionToken(editor, mentionTarget.name, { userId: mentionTarget.userId });
        syncText();
      }
    },
    insertMention: (member) => {
      const editor = editorRef.current;
      const userId = memberUserId(member);
      if (!editor || !userId) {
        return;
      }
      focusAtEnd(editor);
      insertMentionToken(editor, memberName(member), { userId });
      syncText();
    },
    insertTextAtStart: (value) => {
      const editor = editorRef.current;
      if (editor) {
        insertText(editor, value, 'start');
        syncText();
      }
    },
    stageFiles,
    focus: () => {
      if (editorRef.current) {
        focusAtEnd(editorRef.current);
      }
    }
  }));

  const overLimit = text.length > MAX_MESSAGE_CONTENT_LENGTH;
  const sendDisabled = (!text.trim() && stagedImages.length === 0 && !stagedVoice) || voice.recording || overLimit || sending;

  return (
    <form
      className={cx('kcd-composer', mute.muted && 'is-muted')}
      // 拖出来的高度是下限：引用、待发图片、多行文字放不下时整张卡片往上长（到样式表里的上限为止），而不是把编辑器挤成一行
      style={{ '--kcd-composer-h': `${height}px` } as React.CSSProperties}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onPaste={handlePaste}
    >
      <div className="kcd-composer-resize" onPointerDown={startResize} role="separator" aria-orientation="horizontal" aria-label="拖动调整输入框高度" />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => {
        if (event.target.files) {
          stageFiles(Array.from(event.target.files));
        }
        event.target.value = '';
      }} />

      <EmojiPanel
        open={emojiOpen}
        conversationId={conversationId}
        isGroup={isGroup}
        currentRole={currentRole}
        sending={sending}
        onInsert={(emoji) => {
          const editor = editorRef.current;
          if (editor) {
            // 焦点在面板的搜索框里时输入框里已经没有光标了，接到末尾；不然会被插到最前面
            if (!selectionRange(editor)) {
              focusAtEnd(editor);
            }
            insertText(editor, emoji);
            syncText();
          }
        }}
        onSend={(variables) => {
          setEmojiOpen(false);
          setError('');
          onSend(variables);
        }}
        onClose={(refocus) => {
          setEmojiOpen(false);
          if (refocus) {
            editorRef.current?.focus({ preventScroll: true });
          }
        }}
      />

      {mention ? (
        <div className="kcd-popover kcd-mention-picker scroll-soft" role="listbox" aria-label="选择要 @ 的成员">
          {canMentionAll ? (
            <button type="button" role="option" aria-selected={mentionIndex === 0} className={cx('kcd-mention-option', mentionIndex === 0 && 'is-active')} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMentionIndex(0)} onClick={() => pickMention(0)}>
              <span className="kcd-mention-all-icon"><Icon name="users" className="h-4 w-4" /></span>
              <span className="kcd-mention-name">全体成员</span>
              <span className="kcd-mention-hint">剩余 {MENTION_ALL_REMAINING} 次</span>
            </button>
          ) : null}
          {mentionMembers.map((member, memberIndex) => {
            const index = memberIndex + (canMentionAll ? 1 : 0);
            return (
              <button key={member.id} type="button" role="option" aria-selected={mentionIndex === index} className={cx('kcd-mention-option', mentionIndex === index && 'is-active')} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMentionIndex(index)} onClick={() => pickMention(index)}>
                <Avatar user={member.user} label={memberName(member)} size="sm" />
                <span className="kcd-mention-name">{memberName(member)}</span>
              </button>
            );
          })}
          {mentionMembers.length === 0 ? <p className="kcd-popover-empty">{mentionMembersQuery.isFetching ? '正在搜索成员…' : '没有匹配的成员'}</p> : null}
        </div>
      ) : null}

      {openBotPanel ? (
        <BotCommandPanel options={botOptions} activeIndex={botIndex} onActiveChange={(index) => setBotPanel({ ...openBotPanel, index })} onPick={(option) => pickBotCommand(option.command)} onClose={closeBotPanel} />
      ) : paramHint && !mention && !emojiOpen ? (
        // 和几个浮层占同一块位置，它们开着的时候不出现
        <BotCommandHint command={paramHint.command} paramIndex={paramHint.paramIndex} />
      ) : null}

      {mute.muted && mute.until ? (
        <div className="kcd-composer-muted" role="status">
          <Icon name="lock" className="h-5 w-5" />
          <p className="kcd-composer-muted-title">禁言中，{formatMuteEnd(mute.until)} 解除</p>
          <p className="kcd-composer-muted-text">{mute.reason ? `原因：${mute.reason}。` : ''}期间可以正常查看消息，但不能发言。</p>
          <button type="button" className="kcd-link-button" onClick={onOpenPenalties}>查看处罚详情 / 申诉</button>
        </div>
      ) : null}

      <div className="kcd-composer-toolbar">
        <button type="button" className={cx('kcd-tool', emojiOpen && 'is-active')} title="表情" aria-label="选择表情" aria-expanded={emojiOpen} onMouseDown={(event) => event.stopPropagation()} onClick={() => {
          setBotPanel(null);
          setEmojiOpen((current) => !current);
        }}><Icon name="emoji" className="h-[18px] w-[18px]" /></button>
        <button type="button" className="kcd-tool" title="图片（也可以直接粘贴或拖进来）" aria-label="发送图片" disabled={sending} onClick={() => imageInputRef.current?.click()}><Icon name="image" className="h-[18px] w-[18px]" /></button>
        {isGroup ? <FileComposerButton conversationId={conversationId} disabled={sending || mute.muted} onQueued={onOwnMessageSent} /> : null}
        <button type="button" className={cx('kcd-tool', voice.recording && 'is-recording')} title={voice.recording ? '结束录音' : '语音消息'} aria-label={voice.recording ? '结束录音' : '录制语音'} disabled={sending || stagedImages.length > 0} onClick={() => {
          if (voice.recording) {
            voice.stop();
          } else {
            clearStagedVoice();
            void voice.start();
          }
        }}><Icon name="mic" className="h-[18px] w-[18px]" /></button>
        {isGroup ? <button type="button" className="kcd-tool" title="@ 群成员" aria-label="@ 群成员" onMouseDown={(event) => event.preventDefault()} onClick={() => {
          const editor = editorRef.current;
          if (editor) {
            // 「@」前面得是空白才会触发成员选择
            insertText(editor, /(^|\s)$/.test(composerText(editor)) ? '@' : ' @');
            syncText();
            refreshMention();
          }
        }}><Icon name="atSign" className="h-[18px] w-[18px]" /></button> : null}
        <PollComposerButton conversationId={conversationId} onCreated={onOwnMessageSent} />
        {canSendRedPacket ? <RedPacketComposerButton conversationId={conversationId} isGroup={isGroup} members={members} variant="desktop" onCreated={onOwnMessageSent} /> : null}
        {canSendRedPacket ? <GiftComposerButton conversationId={conversationId} isGroup={isGroup} members={members} directUser={directUser} variant="desktop" onCreated={onOwnMessageSent} onMembersNeeded={onMembersNeeded} /> : null}
        {botCommands.length > 0 ? <button type="button" className={cx('kcd-tool', openBotPanel && 'is-active')} title="机器人指令" aria-label="机器人指令" aria-expanded={Boolean(openBotPanel)} onMouseDown={(event) => {
          // 面板的上下键和回车是输入框接的，焦点不能被按钮拿走；也不让这次按下被面板当成「点了外面」
          event.preventDefault();
          event.stopPropagation();
        }} onClick={() => {
          setEmojiOpen(false);
          setMention(null);
          setBotPanel(openBotPanel ? null : { query: null, index: 0 });
          editorRef.current?.focus({ preventScroll: true });
        }}><Icon name="bot" className="h-[18px] w-[18px]" /></button> : null}
        {canCreateTask ? <button type="button" className="kcd-tool" title="创建任务" aria-label="创建任务" onClick={onCreateTask}><Icon name="checkSquare" className="h-[18px] w-[18px]" /></button> : null}
        {isTaskAssistantChat ? (
          <>
            <button type="button" className="kcd-chip" onClick={onOpenTaskCenter}><Icon name="checkSquare" className="h-3.5 w-3.5" />创建任务</button>
            <button type="button" className="kcd-chip" onClick={onOpenTaskCenter}><Icon name="list" className="h-3.5 w-3.5" />我的任务</button>
          </>
        ) : null}
        {voice.recording ? (
          <span className="kcd-recording">
            <span className="kcd-recording-dot" />
            录音中 {formatVoiceDuration(voice.elapsedMs)}
            <button type="button" onClick={voice.cancel}>取消</button>
          </span>
        ) : null}
        {sending && (stagedImages.length > 0 || stagedVoice) ? <span className="kcd-composer-status">上传中…</span> : null}
      </div>

      <div className="kcd-composer-body scroll-soft" onClick={(event) => {
        if (event.target === event.currentTarget) {
          editorRef.current?.focus();
        }
      }}>
        {quote ? (
          <div className="kcd-composer-quote">
            <div className="kcd-composer-quote-text">
              <span className="kcd-quote-name">回复 {quote.sender_name}</span>
              <span className="kcd-quote-text">{quote.preview}</span>
            </div>
            <button type="button" aria-label="取消引用" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuote(null)}><Icon name="close" className="h-3 w-3" /></button>
          </div>
        ) : null}
        {stagedImages.length > 0 && inlineImages ? (
          <div className="kcd-staged-images">
            {stagedImages.map((image) => (
              <div key={image.id} className="kcd-staged-image">
                <img src={image.previewUrl} alt={image.file.name || '待发送图片'} draggable={false} />
                <button type="button" aria-label="移除图片" title="移除" onMouseDown={(event) => event.preventDefault()} onClick={() => removeStagedImage(image.id)}><Icon name="close" className="h-3 w-3" /></button>
              </div>
            ))}
            <div className="kcd-staged-side">
              <span className="kcd-staged-count">{stagedImages.length} / {MAX_IMAGES_PER_MESSAGE}</span>
              <button type="button" className="kcd-staged-mode" title="以后粘贴、拖进来的图片先弹确认框再发，可以在 设置 › 通用 里改回" onMouseDown={(event) => event.preventDefault()} onClick={switchToConfirm}>改为确认后发送</button>
            </div>
          </div>
        ) : null}
        {stagedImages.length > 0 && !inlineImages ? <ImageSendDialog images={stagedImages} notice={imageNotice} onAdd={stageFiles} onRemove={removeStagedImage} onCancel={clearStagedImages} onSend={sendStagedImages} onSwitchToInline={switchToInline} /> : null}
        {stagedVoice ? <StagedVoicePreview voice={stagedVoice} onRemove={clearStagedVoice} /> : null}
        <div className="kcd-editor-wrap">
          {!text && !quote ? <span className="kcd-editor-placeholder">{isGroup ? '发消息，@ 可以提醒群成员' : '发消息'}</span> : null}
          <div
            ref={editorRef}
            className="kcd-editor"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="输入消息"
            aria-multiline="true"
            spellCheck={false}
            onInput={(event) => {
              // 输入法组词期间编辑器里是还没上屏的拼音，等 compositionend 再看
              const composing = (event.nativeEvent as InputEvent).isComposing;
              syncText(composing);
              refreshMention();
              if (!composing) {
                refreshSlashCommand();
              }
            }}
            onCompositionEnd={() => {
              syncText();
              refreshSlashCommand();
            }}
            onClick={refreshMention}
            onKeyUp={(event) => {
              if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
                refreshMention();
              }
            }}
            onBlur={() => setMention(null)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <div className="kcd-composer-footer">
        <span className="kcd-composer-hint">Enter 发送 · Shift+Enter 换行</span>
        {text.length > MAX_MESSAGE_CONTENT_LENGTH * 0.8 ? <span className={cx('kcd-composer-count', overLimit && 'is-over')}>{text.length}/{MAX_MESSAGE_CONTENT_LENGTH}</span> : null}
        <button type="submit" className="kcd-send" disabled={sendDisabled}>{sending ? '发送中' : '发送'}</button>
      </div>
    </form>
  );
});

export const Composer = memo(ComposerInner);
