import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/chat/desktop/runtime';
import { useRefreshBalance, useShop } from '@/components/shop/data';
import { describeRefreshError, formatCoins } from '@/components/shop/labels';
import { Icon } from '@/components/ui/Icon';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { Avatar } from '@/components/ui/Avatar';
import { useKukeStore } from '@/store/kukeStore';
import type { ConversationMember } from '@/types/api';
import type { RedPacketKind, RedPacketLimits, SendRedPacketPayload } from '@/types/redPacket';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { DEFAULT_RED_PACKET_GREETING, RED_PACKET_CHAIN_MAX, RED_PACKET_GREETING_MAX } from '@/utils/redPacket';
import { describeSendError, useRedPacketConfig, useRedPacketFeatures, useSendRedPacket } from './data';
import { RedPacketLayer } from './RedPacketLayer';
import { RedPacketRecords } from './RedPacketRecords';
import { RedPacketTargetPicker, type RedPacketTargetChoice } from './RedPacketTargetPicker';
import { openCcwBinding } from './ui';

const KINDS: Array<{ value: RedPacketKind; label: string; hint: string }> = [
  { value: 'lucky', label: '拼手气', hint: '总金额随机分给每个人，看谁手气好' },
  { value: 'normal', label: '普通', hint: '每个人领到的一样多' }
];

/** 输入框里的字读成正整数；空着、不是整数、不是正数都是 null。 */
function wholeNumber(value: string): number | null {
  const text = value.trim();
  return /^\d{1,9}$/.test(text) && Number(text) > 0 ? Number(text) : null;
}

interface Problem {
  field: 'amount' | 'count' | 'limit' | 'chain';
  text: string;
}

/** 按服务端的规则先查一遍（契约里的上限来自 GET /red-packets/config）。余额另算，它有自己的画面。 */
function validate(kind: RedPacketKind, amountText: string, countText: string, amount: number | null, count: number | null, limits: RedPacketLimits): Problem | null {
  if (amountText.trim() && amount === null) {
    return { field: 'amount', text: '金额要填正整数。' };
  }
  if (countText.trim() && count === null) {
    return { field: 'count', text: '个数要填正整数。' };
  }
  if (count !== null && count > limits.max_count) {
    return { field: 'count', text: `一个红包最多分成 ${limits.max_count} 个。` };
  }
  if (amount === null || count === null) {
    return null;
  }
  if (kind === 'normal' && amount < limits.min_each) {
    return { field: 'amount', text: `每个至少 ${formatCoins(limits.min_each)} 币。` };
  }
  if (kind === 'lucky' && amount < count * limits.min_each) {
    return { field: 'amount', text: `总金额太少：${count} 个红包至少要 ${formatCoins(count * limits.min_each)} 币（每个至少 ${formatCoins(limits.min_each)} 币）。` };
  }
  const total = kind === 'normal' ? amount * count : amount;
  if (total > limits.max_total) {
    return { field: 'amount', text: `一个红包的总额不能超过 ${formatCoins(limits.max_total)} 币，现在是 ${formatCoins(total)}。` };
  }
  return null;
}

/** 口令只能一行：粘贴进来的换行折成空格（服务端见到换行会拒：chain_text_rejected） */
function singleLine(value: string): string {
  return value.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

/**
 * 发红包。群里可以选拼手气 / 普通，私聊只有普通、个数固定 1。
 * 群里还有两种玩法（服务端 config.features 里有才出现，可以一起用）：
 *   专属   选一个群成员，只有他能领；选了之后种类固定为普通、个数固定为 1
 *   接龙   打开后填一句口令，谁领了就自动以谁的身份把这句话发到群里
 * 总额、现在的余额、发完剩多少随着输入实时算出来；超过上限、余额不够都当场说，不等接口报错。
 * 余额不够给「去投币」（和商店的充值是同一个地方）；没绑定 CCW 账号时整个表单换成去绑定的引导。
 */
export function SendRedPacketDialog({ conversationId, isGroup, members = [], onCreated, onClose }: { conversationId: number; isGroup: boolean; /** 手头的群成员，专属红包选人时先列它们 */ members?: ConversationMember[]; onCreated?: () => void; onClose: () => void }): JSX.Element {
  const config = useRedPacketConfig().data;
  const features = useRedPacketFeatures();
  const meId = useKukeStore((state) => state.currentUser?.id ?? 0);
  const canChain = isGroup && features.chain;
  const canExclusive = isGroup && features.exclusive;
  // 开着弹窗的时候开关被关掉了，或者连的服务端根本没有红包：表单留着，说明发不了
  const closed = config === null || config?.enabled === false;
  const shop = useShop().data;
  const refresh = useRefreshBalance();
  const send = useSendRedPacket();
  const [kind, setKind] = useState<RedPacketKind>(isGroup ? 'lucky' : 'normal');
  const [amountText, setAmountText] = useState('');
  const [countText, setCountText] = useState(isGroup ? '' : '1');
  const [greeting, setGreeting] = useState('');
  const [failure, setFailure] = useState<{ code: string | null; message: string } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [donated, setDonated] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [chainOn, setChainOn] = useState(false);
  const [chainText, setChainText] = useState('');
  const [target, setTarget] = useState<RedPacketTargetChoice | null>(null);
  const [picking, setPicking] = useState(false);

  // 专属红包：种类固定为普通、个数固定为 1（服务端也只接受这样：invalid_kind / invalid_count）
  const exclusive = canExclusive && target !== null;
  const chain = canChain && chainOn;
  const effectiveKind: RedPacketKind = exclusive ? 'normal' : kind;
  const fixedCount = !isGroup || exclusive;
  const balance = shop?.balance ?? null;
  const bound = balance?.bound ?? false;
  const amount = wholeNumber(amountText);
  const count = fixedCount ? 1 : wholeNumber(countText);
  const total = amount === null || count === null ? null : effectiveKind === 'normal' ? amount * count : amount;
  const limits = config?.limits ?? null;
  // 开了接龙就得有口令（空口令服务端当成没开，那就不是接龙红包了）
  const chainMissing = chain && !chainText.trim();
  const problem = limits ? validate(effectiveKind, amountText, fixedCount ? '1' : countText, amount, count, limits) : null;
  const dailyLeft = config ? Math.max(0, config.limits.daily_send_limit - config.sent_today) : null;
  const dailyUsedUp = dailyLeft === 0;
  // 余额不够：手头算出来的，或者服务端刚说的（它扣之前重新核实过）。服务端说了之后，直到余额或金额有变化都按不够算
  const localShort = balance && total !== null ? Math.max(0, total - balance.balance) : 0;
  const short = localShort > 0 || failure?.code === 'insufficient_balance';
  const unbound = (balance !== null && !bound) || failure?.code === 'ccw_not_bound';
  const donateUrl = shop?.donate_url ?? '';

  // 绑定后从没核实过的人余额是 0（docs/shop.md 3.6）：替他核实一次，免得一打开就说余额不够
  const triedVerifyRef = useRef(false);
  const neverVerified = Boolean(balance && balance.bound && balance.verified_at === null);
  const refreshBalance = refresh.mutate;
  useEffect(() => {
    if (neverVerified && !triedVerifyRef.current) {
      triedVerifyRef.current = true;
      refreshBalance(undefined, { onError: (error) => setRefreshError(describeRefreshError(error).message) });
    }
  }, [neverVerified, refreshBalance]);

  function edit(apply: () => void): void {
    apply();
    setFailure(null);
  }

  function submit(): void {
    if (send.isPending || !config || closed || amount === null || count === null || problem || chainMissing || short || unbound || dailyUsedUp) {
      return;
    }
    setFailure(null);
    const payload: SendRedPacketPayload = { conversation_id: conversationId, kind: effectiveKind, amount, count, greeting: greeting.trim() };
    if (chain) {
      payload.chain_text = chainText.trim();
    }
    if (exclusive && target) {
      payload.target_user_id = target.user.id;
    }
    send.mutate(payload, {
      onSuccess: () => {
        // 先回到最新再关：列表贴着底，新消息才会跟着露出来
        onCreated?.();
        onClose();
      },
      onError: (error) => {
        const described = describeSendError(error);
        setFailure(described);
        // 选的人不能当目标了（退群了之类）：清掉，让他重新选
        if (described.code === 'invalid_target') {
          setTarget(null);
        }
      }
    });
  }

  function refreshNow(): void {
    setRefreshError(null);
    setFailure(null);
    refresh.mutate(undefined, { onError: (error) => setRefreshError(describeRefreshError(error).message) });
  }

  if (recordsOpen) {
    return <RedPacketRecords onClose={() => setRecordsOpen(false)} />;
  }

  if (picking && canExclusive) {
    return (
      <RedPacketTargetPicker
        conversationId={conversationId}
        meId={meId}
        members={members}
        selectedId={target?.user.id ?? null}
        onPick={(choice) => {
          edit(() => setTarget(choice));
          setPicking(false);
        }}
        onBack={() => setPicking(false)}
        onClose={onClose}
      />
    );
  }

  const header = (
    <header className="krp-panel-head">
      <span className="krp-panel-icon"><Icon name="redPacket" className="h-4 w-4" /></span>
      <h2>发红包</h2>
      <button type="button" className="krp-link" data-action="red-packet-records" onClick={() => setRecordsOpen(true)}>红包记录</button>
      <button type="button" className="kui-icon-btn" aria-label="关闭" disabled={send.isPending} onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
    </header>
  );

  if (unbound) {
    return (
      <RedPacketLayer label="发红包" onClose={onClose}>
        <section className="krp-panel" data-red-packet-view="send" data-state="unbound">
          {header}
          <div className="krp-panel-body">
            <p className="krp-lead">红包里装的是金币：你在 CCW 给 KukeChat 官方作品投过多少币，这里就有多少，按绑定的 CCW 账号核实。绑定之后，以前投过的也算数。</p>
          </div>
          <footer className="krp-panel-foot">
            <button type="button" className="kui-btn kui-btn--ghost" onClick={onClose}>取消</button>
            <button type="button" className="krp-btn-red" data-action="bind-ccw" onClick={() => {
              onClose();
              openCcwBinding();
            }}>去绑定 CCW 账号</button>
          </footer>
        </section>
      </RedPacketLayer>
    );
  }

  const after = balance && total !== null ? balance.balance - total : null;
  const ready = Boolean(config) && !closed && amount !== null && count !== null && !problem && !chainMissing && !short && !dailyUsedUp;
  const kindHint = exclusive ? '专属红包只能是普通红包，个数固定为 1 个' : KINDS.find((item) => item.value === kind)?.hint;
  return (
    <RedPacketLayer label="发红包" onClose={onClose} locked={send.isPending}>
      <form className="krp-panel" data-red-packet-view="send" data-state={short ? 'short' : 'form'} onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}>
        {header}
        <div className="krp-panel-body kui-scroll">
          {isGroup ? (
            <div className="krp-field">
              <div className={cx('kui-segment krp-kinds', exclusive && 'is-locked')} role="radiogroup" aria-label="红包种类" aria-disabled={exclusive}>
                {KINDS.map((item) => <button key={item.value} type="button" role="radio" disabled={exclusive} aria-checked={effectiveKind === item.value} className={cx(effectiveKind === item.value && 'is-active')} onClick={() => edit(() => setKind(item.value))}>{item.label}</button>)}
              </div>
              <p className="krp-field-hint" data-red-packet="kind-hint">{kindHint}</p>
            </div>
          ) : null}

          <label className={cx('krp-row', problem?.field === 'amount' && 'is-bad')}>
            <span className="krp-row-label">{effectiveKind === 'lucky' ? '总金额' : isGroup && !exclusive ? '单个金额' : '金额'}</span>
            <input className="krp-row-input" data-field="amount" inputMode="numeric" autoComplete="off" autoFocus value={amountText} maxLength={7} placeholder="0" aria-invalid={problem?.field === 'amount'} onChange={(event) => edit(() => setAmountText(event.target.value.replace(/[^\d]/g, '')))} />
            <span className="krp-row-unit">币</span>
          </label>
          {isGroup ? (
            <label className={cx('krp-row', problem?.field === 'count' && 'is-bad', exclusive && 'is-locked')} title={exclusive ? '专属红包只能发 1 个' : undefined}>
              <span className="krp-row-label">红包个数</span>
              <input className="krp-row-input" data-field="count" inputMode="numeric" autoComplete="off" value={exclusive ? '1' : countText} disabled={exclusive} maxLength={4} placeholder={limits ? `最多 ${limits.max_count}` : '1'} aria-invalid={problem?.field === 'count'} onChange={(event) => edit(() => setCountText(event.target.value.replace(/[^\d]/g, '')))} />
              <span className="krp-row-unit">个</span>
            </label>
          ) : null}
          <label className="krp-row krp-row--text">
            <span className="krp-row-label">祝福语</span>
            <input className="krp-row-input" data-field="greeting" value={greeting} maxLength={RED_PACKET_GREETING_MAX} placeholder={DEFAULT_RED_PACKET_GREETING} onChange={(event) => edit(() => setGreeting(event.target.value))} />
            <span className="krp-row-unit">{greeting.length}/{RED_PACKET_GREETING_MAX}</span>
          </label>

          {canChain || canExclusive ? (
            <div className="krp-modes" data-red-packet="modes">
              {canExclusive ? (
                <div className={cx('krp-mode', exclusive && 'is-on')} data-red-packet-mode="exclusive">
                  <span className="krp-mode-text">
                    <span className="krp-mode-title">专属</span>
                    <span className="krp-mode-hint">只有选中的那个人能领</span>
                  </span>
                  {target ? (
                    <span className="krp-mode-target" data-red-packet="target" data-user={target.user.id}>
                      <button type="button" className="krp-mode-person" title="换一个人" onClick={() => setPicking(true)}>
                        <Avatar user={target.user} size="sm" />
                        <span>{target.name}</span>
                      </button>
                      <button type="button" className="kui-icon-btn krp-mode-clear" aria-label="取消专属" title="取消专属" onClick={() => edit(() => setTarget(null))}><Icon name="close" className="h-3.5 w-3.5" /></button>
                    </span>
                  ) : (
                    <button type="button" className="krp-mode-pick" data-action="pick-red-packet-target" onClick={() => setPicking(true)}>选择成员<Icon name="chevron" className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ) : null}
              {canChain ? (
                <>
                  <label className={cx('krp-mode', chain && 'is-on')} data-red-packet-mode="chain">
                    <span className="krp-mode-text">
                      <span className="krp-mode-title">接龙</span>
                      <span className="krp-mode-hint">领取的人会自动发出一句口令</span>
                    </span>
                    <input type="checkbox" role="switch" className="kui-switch" data-field="chain" aria-label="接龙" checked={chainOn} onChange={(event) => edit(() => setChainOn(event.target.checked))} />
                  </label>
                  {chain ? (
                    <div className="krp-mode-extra">
                      <label className="krp-row krp-row--text">
                        <span className="krp-row-label">口令</span>
                        <input className="krp-row-input" data-field="chain-text" value={chainText} maxLength={RED_PACKET_CHAIN_MAX} autoFocus placeholder="比如：谢谢老板" onChange={(event) => edit(() => setChainText(singleLine(event.target.value)))} />
                        <span className="krp-row-unit">{chainText.length}/{RED_PACKET_CHAIN_MAX}</span>
                      </label>
                      <p className="krp-field-hint">领取时会自动发出这句话</p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {problem ? <p className="kui-note kui-note--danger" role="alert" data-red-packet="problem">{problem.text}</p> : null}
          {closed ? <p className="kui-note kui-note--danger" role="alert" data-red-packet="closed">红包功能现在关着，暂时发不了。</p> : null}
          {dailyUsedUp && config ? <p className="kui-note kui-note--danger" role="alert" data-red-packet="daily-limit">今天已经发了 {config.sent_today} 个红包，到每天 {config.limits.daily_send_limit} 个的上限了，明天再来。</p> : null}

          <div className="krp-total" data-red-packet="total">
            <p className="krp-total-number"><b>{total !== null ? formatCoins(total) : '0'}</b><span>币</span></p>
            <p className="krp-total-note">{exclusive && target ? `给 ${target.name} 的专属红包` : effectiveKind === 'normal' && isGroup && amount !== null && count !== null ? `${formatCoins(amount)} 币 × ${count} 个` : '红包总额'}</p>
          </div>

          <dl className="krp-bill">
            <div><dt>现在的余额</dt><dd data-red-packet="balance">{balance ? <><CoinIcon size={14} className="h-3.5 w-3.5" />{formatCoins(balance.balance)}</> : shop === null ? '—' : '加载中…'}</dd></div>
            <div className={cx(after !== null && after < 0 && 'is-bad')}><dt>发完剩下</dt><dd data-red-packet="after">{after === null ? '—' : after < 0 ? `不够，还差 ${formatCoins(-after)}` : formatCoins(after)}</dd></div>
          </dl>

          {short ? (
            <div className="krp-short" data-red-packet="short">
              <p className="kui-note kui-note--warn">{localShort > 0 ? `金币不够，还差 ${formatCoins(localShort)} 个。` : failure?.message ?? '金币不够。'}{donated ? '投完了吗？回来点「刷新余额」。' : '去 KukeChat 官方作品页投币，回来点「刷新余额」。'}</p>
              <div className="krp-short-actions">
                <button type="button" className="kui-btn kui-btn--sm" data-action="refresh-balance" disabled={refresh.isPending} onClick={refreshNow}><Icon name="refresh" className={cx('h-3.5 w-3.5', refresh.isPending && 'animate-spin')} />{refresh.isPending ? '核实中…' : '刷新余额'}</button>
                <button type="button" className="kui-btn kui-btn--sm kui-btn--primary" data-action="donate" disabled={!donateUrl} title={donateUrl ? undefined : '暂时不能充值'} onClick={() => {
                  setDonated(true);
                  void openExternalUrl(donateUrl);
                }}><Icon name="external" className="h-3.5 w-3.5" />去投币</button>
              </div>
            </div>
          ) : null}
          {balance?.stale ? <p className="kui-note kui-note--warn">上次向 CCW 核实没有成功，余额可能不是最新的。</p> : null}
          {refreshError ? <p className="kui-note kui-note--danger" role="alert">{refreshError}</p> : null}
          {failure && failure.code !== 'insufficient_balance' && !(closed && failure.code === 'disabled') ? <p className="kui-note kui-note--danger" role="alert" data-red-packet="send-error">{failure.message}</p> : null}
          {config ? <p className="krp-fineprint">{config.limits.expire_hours} 小时没领完，剩下的金币退回余额{dailyLeft !== null && !dailyUsedUp ? `；今天还能发 ${dailyLeft} 个` : ''}。金币没有现金价值。</p> : null}
        </div>
        <footer className="krp-panel-foot">
          <button type="button" className="kui-btn kui-btn--ghost" disabled={send.isPending} onClick={onClose}>取消</button>
          <button type="submit" className="krp-btn-red" data-action="send-red-packet" disabled={!ready || send.isPending}>{send.isPending ? '正在塞进红包…' : total !== null && ready ? `塞进红包（${formatCoins(total)} 币）` : '塞进红包'}</button>
        </footer>
      </form>
    </RedPacketLayer>
  );
}
