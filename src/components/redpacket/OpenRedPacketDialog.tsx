import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { formatCoins, formatShopTime } from '@/components/shop/labels';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { User } from '@/types/api';
import type { RedPacket, RedPacketStatus } from '@/types/redPacket';
import { parseApiDate } from '@/utils/dateTime';
import { describeClaimError, redPacketErrorCode, useClaimRedPacket, useRedPacket, voiceMismatchOf, type RedPacketClaimRecording } from './data';
import { redPacketTargetName, useRedPacketExpired } from './RedPacketCard';
import { RedPacketLayer } from './RedPacketLayer';
import { useRedPacketMotion, useRedPacketUi, type RedPacketTarget } from './ui';
import { useFitText } from './useFitText';
import { useHoldToRecord, type HoldPhase } from './useHoldToRecord';

/** 「开」至少转这么久再出结果：接口很快的时候不至于一闪而过。不播动效时不等。 */
const OPEN_SPIN_MS = 720;

/** 拆不开的三种结局，各有一句话。 */
const ENDED_TEXT: Record<Exclude<RedPacketStatus, 'active'>, string> = {
  finished: '手慢了，红包派完了',
  expired: '红包已过期',
  revoked: '红包已被撤回'
};

function tookText(packet: RedPacket): string | null {
  const start = parseApiDate(packet.created_at)?.getTime();
  const end = parseApiDate(packet.finished_at)?.getTime();
  if (start === undefined || end === undefined || end < start) {
    return null;
  }
  const seconds = Math.max(1, Math.round((end - start) / 1000));
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟` : `${Math.round(minutes / 60)} 小时`;
}

/** 领取详情顶上那句概况：已领几个、共多少币、多久抢完。金额只有看得到的时候才写。 */
function summaryText(packet: RedPacket, expired: boolean, mine: boolean): string {
  const claimed = Math.min(packet.claimed_count, packet.count);
  const progress = packet.total !== null
    ? `已领 ${claimed}/${packet.count} 个，共 ${formatCoins(packet.claimed_amount ?? 0)}/${formatCoins(packet.total)} 币`
    : `已领 ${claimed}/${packet.count} 个`;
  if (packet.status === 'finished') {
    const took = tookText(packet);
    const total = packet.total !== null ? `共 ${formatCoins(packet.total)} 币` : '';
    // 只有一个的红包谈不上「抢完」
    if (packet.count === 1) {
      return `红包${total}，已被领取`;
    }
    return `${packet.count} 个红包${total}${took ? `，${took}被抢完` : '，已被抢完'}`;
  }
  if (packet.status === 'revoked') {
    return `红包已被撤回。${progress}${mine ? '，没领完的金币已退回余额' : ''}`;
  }
  if (expired) {
    return `红包已过期。${progress}${mine ? '，没领完的金币已退回余额' : ''}`;
  }
  return progress;
}

/** 还剩几秒（向上取整），只用来提示 */
function seconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}`;
}

/** 语音红包正面「按住说话」下面那一行字 */
function voiceStatusText(phase: HoldPhase, canceling: boolean, submitting: boolean, exhausted: boolean, elapsedMs: number, limitMs: number): string {
  if (exhausted) {
    return '尝试次数用完了';
  }
  if (submitting || phase === 'finishing') {
    return '识别中…';
  }
  if (phase === 'starting') {
    return '正在打开麦克风…';
  }
  if (phase === 'recording') {
    return canceling ? '松开手指，取消这次录音' : `松开领取，上滑取消 · 还能说 ${seconds(limitMs - elapsedMs)} 秒`;
  }
  return '按住说出口令领取';
}

/** 语音红包没念对：服务端听到了什么、还剩几次 */
interface VoiceMiss {
  recognized: string | null;
  attemptsLeft: number | null;
}

/**
 * 点开一个红包之后的弹层，按情况是两种画面之一：
 *   红包的正面   可以领：一个「开」；领不了（抢完 / 过期 / 被撤回）：一句结果，可以去看大家的手气
 *   领取详情     我抢到多少、谁抢了多少、手气最佳、已领几个、多久抢完。领过的、自己在私聊里发的，点开直接是它
 * 点「开」之后「开」字转起来，拿到结果再换成领取详情；抢完、过期、领过了都落到各自的画面上，不弹报错。
 * 能不能领只看红包自己的状态，不看总开关：开关关掉只是不能发新的，已经发出去的照常能领。
 * 给别人的专属红包（包括我发给别人的）领不了：点开直接是领取详情，按钮换成「专属红包，仅 xxx 可领」。
 * 接龙红包在正面提前说一声：领了会以我的名义发出口令。
 */
export function OpenRedPacketDialog({ target, isGroup, currentUser, initialDetail = false, onClose }: { target: RedPacketTarget; isGroup: boolean; currentUser: User; /** 直接看领取详情，不经过「开」的那一面（从红包记录里点开） */ initialDetail?: boolean; onClose: () => void }): JSX.Element {
  const { meta } = target;
  const query = useRedPacket(meta.id, true);
  const refetch = query.refetch;
  const packet = query.data;
  const claim = useClaimRedPacket();
  const motion = useRedPacketMotion();
  const expired = useRedPacketExpired(packet);
  // 正在拆：从点「开」到结果亮出来
  const [opening, setOpening] = useState(false);
  // 这次打开之后刚抢到的（区别于打开时就已经领过）
  const [justClaimed, setJustClaimed] = useState(false);
  // 从正面点了「看看大家的手气 / 查看领取进度」
  const [wantDetail, setWantDetail] = useState(initialDetail);
  // 接口说领不了的原因：手头的状态还没跟上之前，先按它显示
  const [endedBy, setEndedBy] = useState<Exclude<RedPacketStatus, 'active'> | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 语音红包：上一次没念对时听到的、还剩几次；次数用完了就不能再按
  const [voiceMiss, setVoiceMiss] = useState<VoiceMiss | null>(null);
  const [voiceExhausted, setVoiceExhausted] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 卡片的缓存里可能没有金额（事件不带），谁领了多少也可能是旧的：打开时重取一次。正在取就不重复发
  useEffect(() => {
    void refetch({ cancelRefetch: false });
  }, [refetch]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  const sender = packet?.sender ?? target.sender;
  const senderName = getDisplayName(sender, '有人');
  const mine = sender?.id === currentUser.id;
  const ownDirect = mine && !isGroup;
  const ended: Exclude<RedPacketStatus, 'active'> | null = packet && packet.status !== 'active' ? packet.status : expired ? 'expired' : endedBy;
  const claimed = packet?.my_claim ?? null;
  const targetId = meta.target_user_id ?? packet?.target_user_id ?? null;
  const forMe = targetId !== null && targetId === currentUser.id;
  const forOther = targetId !== null && !forMe;
  const targetName = redPacketTargetName(meta, packet);
  const chainText = meta.chain_text ?? packet?.chain_text ?? null;
  const voiceText = packet?.voice_text ?? meta.voice_text ?? null;
  const isVoice = Boolean(meta.voice || packet?.voice || voiceText);
  const showDetail = !opening && (wantDetail || Boolean(claimed) || ownDirect || forOther);
  // 领取名单看不看得到：我领过、我发的、或者已经不是 active
  const canSeeClaims = Boolean(packet && (packet.claims !== null || claimed || mine || ended));

  // 开着详情的时候有人又领了（事件已经把 claimed_count 补进缓存）：名单对不上就重取。每个「领了几个 + 状态」只取一次，名单被服务端截断也不会循环
  const syncedRef = useRef('');
  const syncKey = packet ? `${packet.claimed_count}:${packet.status}` : '';
  const listStale = Boolean(packet && showDetail && canSeeClaims && (packet.claims?.length ?? -1) !== packet.claimed_count);
  useEffect(() => {
    if (!listStale || syncedRef.current === syncKey) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      syncedRef.current = syncKey;
      void refetch({ cancelRefetch: false });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [listStale, refetch, syncKey]);

  function reveal(startedAt: number, done: () => void): void {
    const wait = motion ? Math.max(0, OPEN_SPIN_MS - (Date.now() - startedAt)) : 0;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      done();
      setOpening(false);
    }, wait);
  }

  /** 开红包；语音红包带上刚录的那段（上传、识别都在这一步里，转圈一直转到结果出来） */
  function open(voice?: RedPacketClaimRecording): void {
    if (opening || claim.isPending) {
      return;
    }
    const startedAt = Date.now();
    setError(null);
    setVoiceMiss(null);
    setOpening(true);
    claim.mutate({ id: meta.id, voice }, {
      onSuccess: () => reveal(startedAt, () => setJustClaimed(true)),
      onError: (failure) => reveal(startedAt, () => {
        const code = redPacketErrorCode(failure);
        if (code === 'voice_mismatch') {
          const miss = voiceMismatchOf(failure);
          setError(describeClaimError(failure).message);
          setVoiceMiss(miss);
          if (miss.attemptsLeft === 0) {
            setVoiceExhausted(true);
          }
        } else if (code === 'voice_attempts_exhausted') {
          setError(describeClaimError(failure).message);
          setVoiceExhausted(true);
        } else if (code === 'finished' || code === 'expired' || code === 'revoked') {
          setEndedBy(code);
        } else if (code === 'already_claimed' || code === 'own_packet') {
          // 其实领过了 / 是自己在私聊里发的：直接看详情
          setWantDetail(true);
        } else if (code === 'not_target') {
          // 是给别人的专属红包（手头的数据没跟上）：红包状态重取之后会自己换成「仅 xxx 可领」
          setError(describeClaimError(failure).message);
          setWantDetail(true);
        } else {
          setError(describeClaimError(failure).message);
        }
      })
    });
  }

  const canOpen = Boolean(packet) && !ended;
  const hold = useHoldToRecord({
    disabled: !isVoice || !canOpen || opening || claim.isPending || voiceExhausted,
    onStart: () => setError(null),
    onRecorded: (recording) => open(recording),
    onError: (message) => setError(message)
  });
  const holding = hold.phase !== 'idle';

  const closeButton = <button type="button" className="krp-close" aria-label="关闭" disabled={opening || holding} onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>;

  if (showDetail) {
    const kindText = targetId !== null ? '专属红包' : isGroup ? (meta.kind === 'lucky' ? '拼手气红包' : '普通红包') : null;
    return (
      <RedPacketLayer label="红包领取详情" onClose={onClose}>
        <section className="krp-panel krp-detail" data-red-packet-view="detail" data-status={ended ?? 'active'}>
          <header className="krp-detail-head">
            {closeButton}
            <span className="krp-detail-avatar"><Avatar user={sender} size="md" /></span>
            <p className="krp-detail-from">{senderName} 的红包{kindText ? <span className="krp-chip">{kindText}</span> : null}{chainText ? <span className="krp-chip">接龙</span> : null}{isVoice ? <span className="krp-chip">语音</span> : null}</p>
            <p className="krp-detail-greeting">{packet?.greeting ?? meta.greeting}</p>
            {targetId !== null || chainText || voiceText ? (
              <p className="krp-detail-extra" data-red-packet="detail-extra">
                {targetId !== null ? <span>{forMe ? '给你的专属红包' : `给 ${targetName} 的专属红包`}</span> : null}
                {chainText ? <span>接龙口令「{chainText}」</span> : null}
                {voiceText ? <span>语音口令「{voiceText}」</span> : null}
              </p>
            ) : null}
          </header>
          <div className="krp-detail-body kui-scroll">
            {claimed ? (
              <div className={cx('krp-amount', justClaimed && 'is-fresh')} data-red-packet="my-amount">
                <p className="krp-amount-number"><b>{formatCoins(claimed.amount)}</b><span>币</span></p>
                <p className="krp-amount-note">{justClaimed ? `${isGroup ? '抢到了' : '收下了'}，已存入金币余额` : '已存入金币余额'}</p>
              </div>
            ) : ownDirect && packet ? (
              <div className="krp-amount" data-red-packet="own-amount">
                {packet.total !== null ? <p className="krp-amount-number"><b>{formatCoins(packet.total)}</b><span>币</span></p> : null}
                <p className="krp-amount-note">{packet.status === 'finished' ? '对方已领取' : ended ? ENDED_TEXT[ended] : '等待对方领取'}</p>
              </div>
            ) : forOther && !ended ? (
              <div className="krp-amount" data-red-packet="reserved">
                <button type="button" className="krp-btn-red" disabled data-action="reserved">专属红包，仅 {targetName} 可领</button>
                {error ? <p className="krp-amount-note" role="alert">{error}</p> : null}
              </div>
            ) : ended ? (
              <div className="krp-amount" data-red-packet="ended"><p className="krp-amount-note is-strong">{ENDED_TEXT[ended]}</p></div>
            ) : packet ? (
              // 群里发的人自己也能抢：从「查看领取进度」进来的，给一条回去开的路
              <div className="krp-amount" data-red-packet="can-open"><button type="button" className="krp-btn-red" data-action="back-to-open" onClick={() => setWantDetail(false)}>{isVoice ? '我也领一个' : '我也开一个'}</button></div>
            ) : null}

            {packet ? <p className="krp-summary" data-red-packet="summary">{summaryText(packet, ended === 'expired', mine)}</p> : null}

            {!packet ? (
              <p className="krp-empty" role={query.error ? 'alert' : 'status'}>
                {query.error ? <>领取详情没有加载出来。<button type="button" className="krp-link" onClick={() => void refetch()}>重试</button></> : '加载中…'}
              </p>
            ) : !canSeeClaims || packet.claims === null ? (
              <p className="krp-empty">{forOther ? `${targetName} 领取之后才能看到金额。` : '领取之后才能看到大家的手气。'}</p>
            ) : packet.claims.length === 0 ? (
              <p className="krp-empty">{ended ? '没有人领取。' : '还没有人领取。'}</p>
            ) : (
              <ul className="krp-claims" data-red-packet="claims">
                {packet.claims.map((item, index) => (
                  <li key={`${item.user.id}-${index}`} className={cx(item.user.id === currentUser.id && 'is-me')}>
                    <Avatar user={item.user} size="sm" />
                    <span className="krp-claim-main">
                      <span className="krp-claim-name">{getDisplayName(item.user, `用户 ${item.user.id}`)}</span>
                      <time className="krp-claim-time">{formatShopTime(item.created_at)}</time>
                    </span>
                    <span className="krp-claim-side">
                      <span className="krp-claim-amount">{formatCoins(item.amount)} 币</span>
                      {item.is_luckiest ? <span className="krp-luck"><Icon name="sparkles" className="h-3 w-3" />手气最佳</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </RedPacketLayer>
    );
  }

  const loading = !packet && !query.error;
  const voiceFace = isVoice && !ended;
  const greeting = packet?.greeting ?? meta.greeting;
  const recordingNow = hold.phase === 'recording';
  const kindWord = isVoice ? '语音红包' : '红包';
  return (
    <RedPacketLayer label={kindWord} onClose={onClose} locked={opening || holding}>
      <section className={cx('krp-envelope', ended && 'is-ended', opening && 'is-opening', voiceFace && 'is-voice is-compact')} data-red-packet-view="face" data-status={ended ?? 'active'}>
        {closeButton}
        {/* 封口上的字只占「开」以上那一截：祝福语 / 口令太长就缩字号（22px 到 14px，最多三行），不会压到「开」底下 */}
        <div className="krp-envelope-top">
          <span className="krp-envelope-avatar"><Avatar user={sender} size={voiceFace ? 'md' : 'lg'} /></span>
          <p className="krp-envelope-from">{forMe ? `${senderName} 给你的专属${kindWord}` : `${senderName} 发出的${kindWord}`}</p>
          {voiceFace ? (
            // 语音红包：口令是大字，祝福语退成下面一行小字。「按住说出口令领取」写在「开」下面，这里不再重复
            <EnvelopeFit voice text={voiceText ? `「${voiceText}」` : packet ? '口令没有读出来' : '…'} sub={greeting} />
          ) : (
            <EnvelopeFit voice={false} text={ended ? ENDED_TEXT[ended] : greeting} />
          )}
        </div>
        {canOpen && isVoice ? (
          <button
            type="button"
            className={cx('krp-open krp-voice-hold', recordingNow && 'is-recording', hold.canceling && 'is-canceling')}
            data-action="hold-to-claim"
            data-phase={hold.phase}
            disabled={opening || voiceExhausted}
            aria-label="按住说出口令领取"
            aria-pressed={holding}
            {...hold.bind}
          >
            <Icon name="mic" className="h-9 w-9" />
          </button>
        ) : canOpen ? (
          <button type="button" className="krp-open" data-action="open-red-packet" disabled={opening} aria-label="开红包" onClick={() => open()}>
            <span>{opening && !motion ? '…' : '开'}</span>
          </button>
        ) : null}
        <div className="krp-envelope-foot">
          {voiceFace && canOpen ? (
            <p className={cx('krp-voice-status', recordingNow && 'is-live', hold.canceling && 'is-canceling')} role="status" data-red-packet="voice-status">
              {recordingNow && !hold.canceling ? <span className="krp-voice-bars" aria-hidden="true"><i /><i /><i /><i /></span> : null}
              {voiceStatusText(hold.phase, hold.canceling, opening, voiceExhausted, hold.elapsedMs, hold.limitMs)}
            </p>
          ) : null}
          {chainText && !ended ? <p className="krp-envelope-chain" data-red-packet="chain-hint">接龙红包：领取后会以你的名义发出「{chainText}」</p> : null}
          {error ? (
            <p className="krp-envelope-error" role="alert">
              {error}
              {voiceMiss?.recognized ? <small className="krp-voice-heard">听到的是：{voiceMiss.recognized}</small> : null}
              {voiceMiss && voiceMiss.attemptsLeft !== null && voiceMiss.attemptsLeft > 0 ? <small className="krp-voice-heard">还能再试 {voiceMiss.attemptsLeft} 次</small> : null}
            </p>
          ) : null}
          {voiceFace && canOpen && !error && !holding && !opening && !voiceExhausted ? <p className="krp-envelope-hint">领到后，这段录音会以你的名义发到会话里</p> : null}
          {loading ? <p className="krp-envelope-hint" role="status">正在看看还有没有…</p> : null}
          {!packet && query.error ? <p className="krp-envelope-error" role="alert">红包没有加载出来。<button type="button" className="krp-link" onClick={() => void refetch()}>重试</button></p> : null}
          {ended === 'expired' && mine ? <p className="krp-envelope-hint">没领完的金币已退回余额</p> : null}
          {/* 没领的人在红包还能领的时候看不到名单；领不了了、或者是我发的，才给入口 */}
          {packet && (ended || mine) ? <button type="button" className="krp-link" data-action="view-claims" disabled={opening} onClick={() => setWantDetail(true)}>{mine && !ended ? '查看领取进度' : '看看大家的手气'}<Icon name="chevron" className="h-3.5 w-3.5" /></button> : null}
        </div>
      </section>
    </RedPacketLayer>
  );
}

/**
 * 红包正面封口上的那段大字：祝福语，或者语音红包的口令（下面跟一行祝福语小字）。
 * 占满「谁发的」到「开」之间剩下的高度，放不下就从 22px 往下缩到 14px（最多三行），还放不下才截断。
 * 单独拆成一个组件：它在 RedPacketLayer 的 portal 里挂载，挂上的那一刻 ref 就都在，useFitText 能在第一帧之前量完。
 */
function EnvelopeFit({ text, sub = null, voice }: { text: string; sub?: string | null; voice: boolean }): JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  useFitText({ box: boxRef, inner: innerRef, text: textRef, maxPx: 22, minPx: 14, maxLines: 3, content: `${voice ? 'voice' : 'plain'}:${text}:${sub ?? ''}` });
  return (
    <div className="krp-envelope-fit" ref={boxRef}>
      <div className="krp-envelope-fit-inner" ref={innerRef}>
        <p ref={textRef} className={cx('krp-fit', voice ? 'krp-envelope-phrase' : 'krp-envelope-greeting')} data-red-packet={voice ? 'voice-text' : undefined}>{text}</p>
        {sub !== null ? <p className="krp-envelope-sub" title={sub}>{sub}</p> : null}
      </div>
    </div>
  );
}

/**
 * 聊天面板里放一个：有红包被点开、并且是这个会话的，就画它的弹层。
 * 弹层的状态不放在消息行里 —— 行会被虚拟列表卸载（新消息把它顶出去），弹层不能跟着没。
 */
export function RedPacketHost({ conversationId, isGroup, currentUser }: { conversationId: number; isGroup: boolean; currentUser: User }): JSX.Element | null {
  const target = useRedPacketUi((state) => state.target);
  const close = useRedPacketUi((state) => state.close);
  // 面板卸载（切走会话）时把开着的红包收掉，免得切回来又弹出来
  useEffect(() => () => {
    if (useRedPacketUi.getState().target?.conversationId === conversationId) {
      useRedPacketUi.getState().close();
    }
  }, [conversationId]);
  if (!target || target.conversationId !== conversationId) {
    return null;
  }
  return <OpenRedPacketDialog key={String(target.meta.id)} target={target} isGroup={isGroup} currentUser={currentUser} onClose={close} />;
}
