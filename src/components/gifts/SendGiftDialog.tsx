import { useEffect, useMemo, useRef, useState } from 'react';
import { CakeMark } from '@/components/birthday/BirthdayScene';
import { cx } from '@/components/chat/desktop/runtime';
import { RedPacketLayer } from '@/components/redpacket/RedPacketLayer';
import { openCcwBinding } from '@/components/redpacket/ui';
import { KNOWN_CATEGORIES, slotOfCategory, useRefreshBalance, useShop } from '@/components/shop/data';
import { describeRefreshError, formatCoins, termLabel } from '@/components/shop/labels';
import { parseAvatarFrame } from '@/components/shop/skin/avatarFrame';
import { parseBubbleSkin } from '@/components/shop/skin/bubbleSkin';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { useKukeStore } from '@/store/kukeStore';
import type { ConversationMember, User } from '@/types/api';
import type { Gift, GiftRecord } from '@/types/gift';
import type { ShopItem, ShopOverview } from '@/types/shop';
import { parseApiDate } from '@/utils/dateTime';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { describeSendGiftError, useCharmLabel, useGiftCatalog, useSendGift } from './data';
import { GiftGlyph } from './GiftGlyph';
import { GiftRecords } from './GiftRecords';
import { GiftThing } from './GiftThing';
import type { GiftSendTarget } from './ui';

type Tab = 'gift' | 'item';

/** 数量的几个快捷档；超过上限的不显示 */
const COUNT_PRESETS = [1, 5, 10, 66, 99];

/** 商店里现在能送的商品：有价格、在售（没下架、没过限时销售期）、这个版本画得出来的气泡和头像框。 */
function giftableItems(shop: ShopOverview | null | undefined, now: number): ShopItem[] {
  return (shop?.items ?? []).filter((item) => {
    if (!KNOWN_CATEGORIES.has(item.category) || item.price <= 0 || item.delisted) {
      return false;
    }
    const until = parseApiDate(item.available_until)?.getTime();
    if (until !== undefined && until <= now) {
      return false;
    }
    return (item.category === 'frame' ? parseAvatarFrame(item.style) : parseBubbleSkin(item.style)) !== null;
  });
}

/** 群里可以收礼的人：除了自己和机器人。今天过生日的排在最前面。 */
function pickable(candidates: ConversationMember[], meId: number): User[] {
  const users = candidates.map((member) => member.user).filter((user): user is User => Boolean(user) && user?.id !== meId && !user?.is_bot);
  const unique = users.filter((user, index) => users.findIndex((other) => other.id === user.id) === index);
  return unique.sort((left, right) => Number(Boolean(right.is_birthday_today)) - Number(Boolean(left.is_birthday_today)));
}

/**
 * 送礼面板。两个页签：「礼物」（目录里的礼物，选数量）和「装扮」（商店里能送的气泡、头像框，带小样，标明限时 / 永久）；
 * 下面是留言、花费、现在的余额、送完剩多少。超过上限、余额不够都当场说，不等接口报错。
 * 余额不够给「去投币」、没绑定 CCW 账号时整个面板换成去绑定的引导 —— 和发红包是同一套。
 *
 * 群里从工具栏进来时还没定送给谁（target.toUser 为 null），先选人；私聊、成员菜单、资料卡、个人空间进来的直接是对方。
 * 在会话里送会落一条礼物消息，送完面板直接关掉（卡片和动效在聊天里）；从资料卡 / 个人空间送（conversationId 为 null）不落消息，
 * 送完在面板里说一声「送到了」。
 */
export function SendGiftDialog({ target, onClose }: { target: GiftSendTarget; onClose: () => void }): JSX.Element {
  const me = useKukeStore((state) => state.currentUser);
  const catalog = useGiftCatalog().data;
  const charmLabel = useCharmLabel();
  // 开着面板的时候开关被关掉了，或者连的服务端根本没有礼物：面板留着，说明送不了
  const closed = catalog === null || catalog?.enabled === false;
  const shop = useShop().data;
  const refresh = useRefreshBalance();
  const send = useSendGift();
  const candidates = useMemo(() => (target.candidates ? pickable(target.candidates, me?.id ?? 0) : []), [me?.id, target.candidates]);
  const [toUser, setToUser] = useState<User | null>(target.toUser);
  const [picking, setPicking] = useState(target.toUser === null);
  const [keyword, setKeyword] = useState('');
  const [tab, setTab] = useState<Tab>(target.itemSku ? 'item' : 'gift');
  const [giftKey, setGiftKey] = useState<string | null>(null);
  const [itemSku, setItemSku] = useState<string | null>(target.itemSku ?? null);
  const [count, setCount] = useState(1);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState<{ code: string | null; message: string } | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [donated, setDonated] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [sent, setSent] = useState<GiftRecord | null>(null);
  // 服务端说「对方已经永久拥有」的那几件（409 recipient_owns）：记下来置灰，不让人再点一次
  const [ownedByRecipient, setOwnedByRecipient] = useState<Record<number, string[]>>({});
  const [now] = useState(() => Date.now());

  const gifts = catalog?.gifts ?? [];
  const items = useMemo(() => giftableItems(shop, now), [now, shop]);
  const limits = catalog?.limits ?? null;
  const countMax = limits?.count_max ?? 99;
  const messageMax = limits?.message_max ?? 60;
  const gift: Gift | null = gifts.find((item) => item.key === giftKey) ?? gifts[0] ?? null;
  const item: ShopItem | null = items.find((entry) => entry.sku === itemSku) ?? null;
  const targetName = getDisplayName(toUser, '对方');

  /** 能提前看出来的「对方已经永久拥有」：对方身上正装备着这一件永久商品；再加上服务端明确说过的 */
  const recipientOwns = (entry: ShopItem): boolean => {
    if (!toUser) {
      return false;
    }
    if (ownedByRecipient[toUser.id]?.includes(entry.sku)) {
      return true;
    }
    const worn = toUser.cosmetics?.[slotOfCategory(shop?.categories ?? [], entry.category)];
    return entry.duration_days === null && worn?.sku === entry.sku;
  };

  const balance = shop?.balance ?? null;
  const bound = balance?.bound ?? false;
  const total = tab === 'gift' ? (gift ? gift.price * count : null) : item ? item.price : null;
  // 余额不够：手头算出来的，或者服务端刚说的（它扣之前重新核实过）。服务端说了之后，直到余额或选的东西有变化都按不够算
  const localShort = balance && total !== null ? Math.max(0, total - balance.balance) : 0;
  const short = localShort > 0 || failure?.code === 'insufficient_balance';
  const unbound = (balance !== null && !bound) || failure?.code === 'ccw_not_bound';
  const donateUrl = shop?.donate_url ?? '';
  const after = balance && total !== null ? balance.balance - total : null;
  const blockedItem = tab === 'item' && item !== null && recipientOwns(item);
  const ready = Boolean(catalog) && !closed && toUser !== null && total !== null && !short && !blockedItem && count >= 1 && count <= countMax;

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
    if (send.isPending || !ready || !toUser || (tab === 'gift' && !gift) || (tab === 'item' && !item)) {
      return;
    }
    setFailure(null);
    const sku = item?.sku;
    send.mutate({
      to_user_id: toUser.id,
      conversation_id: target.conversationId,
      kind: tab,
      ...(tab === 'gift' ? { gift_key: gift?.key, count } : { item_sku: sku, count: 1 }),
      message: message.trim()
    }, {
      onSuccess: (result) => {
        if (result.message) {
          // 先回到最新再关：列表贴着底，礼物卡片才会跟着露出来
          target.onSent?.();
          onClose();
          return;
        }
        if (result.record) {
          setSent(result.record);
        } else {
          onClose();
        }
      },
      onError: (error) => {
        const described = describeSendGiftError(error, targetName);
        if (described.code === 'recipient_owns' && sku) {
          setOwnedByRecipient((current) => ({ ...current, [toUser.id]: [...(current[toUser.id] ?? []), sku] }));
        }
        setFailure(described);
      }
    });
  }

  function refreshNow(): void {
    setRefreshError(null);
    setFailure(null);
    refresh.mutate(undefined, { onError: (error) => setRefreshError(describeRefreshError(error).message) });
  }

  if (recordsOpen) {
    return <GiftRecords onClose={() => setRecordsOpen(false)} />;
  }

  const header = (title: string, back?: () => void): JSX.Element => (
    <header className="krp-panel-head">
      {back ? <button type="button" className="kui-icon-btn" aria-label="返回" onClick={back}><Icon name="chevronLeft" className="h-4 w-4" /></button> : <span className="krp-panel-icon kgf-panel-icon"><Icon name="gift" className="h-4 w-4" /></span>}
      <h2>{title}</h2>
      {back ? null : <button type="button" className="krp-link kgf-link" data-action="gift-records" onClick={() => setRecordsOpen(true)}>礼物记录</button>}
      <button type="button" className="kui-icon-btn" aria-label="关闭" disabled={send.isPending} onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
    </header>
  );

  if (unbound) {
    return (
      <RedPacketLayer label="送礼物" onClose={onClose} className="kgf-layer">
        <section className="krp-panel kgf-panel" data-gift-view="send" data-state="unbound">
          {header('送礼物')}
          <div className="krp-panel-body">
            <p className="krp-lead">礼物是用金币送的：你在 CCW 给 KukeChat 官方作品投过多少币，这里就有多少，按绑定的 CCW 账号核实。绑定之后，以前投过的也算数。</p>
          </div>
          <footer className="krp-panel-foot">
            <button type="button" className="kui-btn kui-btn--ghost" onClick={onClose}>取消</button>
            <button type="button" className="kgf-btn" data-action="bind-ccw" onClick={() => {
              onClose();
              openCcwBinding();
            }}>去绑定 CCW 账号</button>
          </footer>
        </section>
      </RedPacketLayer>
    );
  }

  // 群里先选送给谁
  if (picking || !toUser) {
    const needle = keyword.trim().toLowerCase();
    const shown = needle ? candidates.filter((user) => getDisplayName(user, '').toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle)) : candidates;
    return (
      <RedPacketLayer label="选择收礼人" onClose={onClose} className="kgf-layer">
        <section className="krp-panel krp-panel--tall kgf-panel" data-gift-view="pick">
          {header('送给谁', toUser ? () => setPicking(false) : undefined)}
          <div className="kgf-pick-search">
            <Icon name="search" className="h-4 w-4" />
            <input value={keyword} placeholder="搜索群成员" aria-label="搜索群成员" autoFocus onChange={(event) => setKeyword(event.target.value)} />
          </div>
          <div className="krp-panel-body krp-panel-body--flush kui-scroll">
            {shown.length === 0 ? <p className="krp-empty">{candidates.length === 0 ? '这个群里还没有可以送礼的人（成员列表可能还在加载）。' : '没有找到这个人。'}</p> : (
              <ul className="kgf-pick" data-gift="candidates">
                {shown.map((user) => (
                  <li key={user.id}>
                    <button type="button" className={cx('kgf-pick-row', toUser?.id === user.id && 'is-active')} data-user={user.id} onClick={() => {
                      edit(() => setToUser(user));
                      setPicking(false);
                    }}>
                      <Avatar user={user} size="message" />
                      <span className="kgf-pick-name">{getDisplayName(user, `用户 ${user.id}`)}</span>
                      {user.is_birthday_today ? <span className="kgf-birthday-chip"><CakeMark size={13} />今天生日</span> : null}
                      <Icon name="chevron" className="h-3.5 w-3.5 kgf-pick-go" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </RedPacketLayer>
    );
  }

  // 没落聊天消息的那种，送完在面板里说一声
  if (sent) {
    return (
      <RedPacketLayer label="礼物已送达" onClose={onClose} className="kgf-layer">
        <section className="krp-panel kgf-panel" data-gift-view="sent">
          {header('送到了')}
          <div className="krp-panel-body kgf-sent">
            <GiftThing gift={sent.gift} item={sent.item} wearer={toUser} size={84} avatarSize="xl" className="kgf-sent-thing" />
            <p className="kgf-sent-title">{sent.item ? `「${sent.item.name}」已经送给 ${targetName}` : `${sent.gift?.name ?? '礼物'}${sent.count > 1 ? ` ×${sent.count}` : ''} 已经送给 ${targetName}`}</p>
            <p className="kgf-sent-note">{sent.item ? `已经放进 Ta 的装扮里。` : ''}Ta 的{charmLabel} +{formatCoins(sent.amount)}，礼物会出现在 Ta 的礼物墙上。</p>
          </div>
          <footer className="krp-panel-foot">
            <button type="button" className="kui-btn kui-btn--ghost" data-action="gift-again" onClick={() => setSent(null)}>再送一个</button>
            <button type="button" className="kgf-btn" onClick={onClose}>完成</button>
          </footer>
        </section>
      </RedPacketLayer>
    );
  }

  const showItems = shop !== null && shop !== undefined;
  return (
    <RedPacketLayer label="送礼物" onClose={onClose} locked={send.isPending} className="kgf-layer">
      <form className="krp-panel kgf-panel kgf-panel--send" data-gift-view="send" data-state={short ? 'short' : 'form'} data-tab={tab} onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}>
        {header('送礼物')}
        <div className="krp-panel-body kui-scroll">
          <div className="kgf-to" data-gift="recipient" data-user={toUser.id}>
            <Avatar user={toUser} size="message" frame />
            <span className="kgf-to-text"><small>送给</small><b>{targetName}</b></span>
            {toUser.is_birthday_today ? <span className="kgf-birthday-chip"><CakeMark size={13} />今天生日</span> : null}
            {candidates.length > 1 ? <button type="button" className="krp-link kgf-link" data-action="gift-change-recipient" onClick={() => setPicking(true)}>换一个人</button> : null}
          </div>

          {showItems ? (
            <div className="kui-segment krp-kinds" role="tablist" aria-label="送什么">
              <button type="button" role="tab" aria-selected={tab === 'gift'} data-tab="gift" className={cx(tab === 'gift' && 'is-active')} onClick={() => edit(() => setTab('gift'))}>礼物</button>
              <button type="button" role="tab" aria-selected={tab === 'item'} data-tab="item" className={cx(tab === 'item' && 'is-active')} onClick={() => edit(() => setTab('item'))}>装扮</button>
            </div>
          ) : null}

          {tab === 'gift' ? (
            gifts.length === 0 ? <p className="krp-empty">{catalog === undefined ? '加载中…' : '现在没有上架的礼物。'}</p> : (
              <>
                <div className="kgf-grid" role="radiogroup" aria-label="礼物" data-gift="catalog">
                  {gifts.map((entry) => (
                    <button key={entry.key} type="button" role="radio" aria-checked={gift?.key === entry.key} className={cx('kgf-tile', gift?.key === entry.key && 'is-active')} data-gift-key={entry.key} data-tier={entry.tier} onClick={() => edit(() => setGiftKey(entry.key))}>
                      <GiftGlyph icon={entry.icon} size={46} />
                      <span className="kgf-tile-name">{entry.name}</span>
                      <span className="kgf-tile-price"><CoinIcon size={12} className="h-3 w-3" />{formatCoins(entry.price)}</span>
                      {entry.tier > 1 ? <span className="kgf-tile-flag" title={entry.tier === 3 ? '带全屏动效' : '带聊天区动效'}>{entry.tier === 3 ? '全屏' : '动效'}</span> : null}
                    </button>
                  ))}
                </div>
                <div className="kgf-count" data-gift="count">
                  <span className="kgf-count-label">数量</span>
                  <div className="kgf-stepper">
                    <button type="button" aria-label="减一个" disabled={count <= 1} onClick={() => edit(() => setCount(Math.max(1, count - 1)))}><Icon name="minus" className="h-3.5 w-3.5" /></button>
                    <input data-field="count" inputMode="numeric" aria-label="数量" value={String(count)} maxLength={3} onChange={(event) => {
                      const value = Number(event.target.value.replace(/[^\d]/g, ''));
                      edit(() => setCount(Math.min(countMax, Math.max(1, Number.isFinite(value) && value > 0 ? value : 1))));
                    }} />
                    <button type="button" aria-label="加一个" disabled={count >= countMax} onClick={() => edit(() => setCount(Math.min(countMax, count + 1)))}><Icon name="plus" className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="kgf-presets">
                    {COUNT_PRESETS.filter((value) => value <= countMax).map((value) => <button key={value} type="button" className={cx(count === value && 'is-active')} onClick={() => edit(() => setCount(value))}>×{value}</button>)}
                  </div>
                </div>
              </>
            )
          ) : items.length === 0 ? <p className="krp-empty">商店里现在没有可以送的装扮。</p> : (
            <div className="kgf-grid kgf-grid--items" role="radiogroup" aria-label="装扮" data-gift="items">
              {items.map((entry) => {
                const owns = recipientOwns(entry);
                return (
                  <button key={entry.sku} type="button" role="radio" aria-checked={item?.sku === entry.sku} aria-disabled={owns} className={cx('kgf-tile kgf-tile--item', item?.sku === entry.sku && 'is-active', owns && 'is-owned')} data-sku={entry.sku} title={owns ? `${targetName} 已经永久拥有这一件` : entry.description || undefined} onClick={() => edit(() => setItemSku(entry.sku))}>
                    <span className="kgf-tile-preview"><GiftThing gift={null} item={{ sku: entry.sku, name: entry.name, category: entry.category, style: entry.style, duration_days: entry.duration_days }} wearer={toUser} avatarSize="lg" sampleText={entry.preview_text.trim() || '你好呀'} /></span>
                    <span className="kgf-tile-name">{entry.name}</span>
                    <span className="kgf-tile-meta">
                      <span className={cx('kgf-term', entry.duration_days !== null && 'is-limited')}>{termLabel(entry)}</span>
                      <span className="kgf-tile-price"><CoinIcon size={12} className="h-3 w-3" />{formatCoins(entry.price)}</span>
                    </span>
                    {owns ? <span className="kgf-tile-owned">Ta 已拥有</span> : null}
                  </button>
                );
              })}
            </div>
          )}
          {tab === 'item' && item ? (
            <p className="kui-note" data-gift="item-note">
              {blockedItem ? `${targetName} 已经永久拥有「${item.name}」了，换一件送吧。`
                : item.duration_days !== null ? `「${item.name}」是限时装扮：送出后 ${targetName} 拥有 ${item.duration_days} 天；Ta 已经有的话在原来的到期时间上再加 ${item.duration_days} 天。不会自动换上。`
                : `「${item.name}」送出后 ${targetName} 永久拥有，不会自动换上。Ta 已经有了的话送不出去，不会扣币。`}
            </p>
          ) : null}

          <label className="krp-row krp-row--text">
            <span className="krp-row-label">留言</span>
            <input className="krp-row-input" data-field="message" value={message} maxLength={messageMax} placeholder={toUser.is_birthday_today ? '生日快乐！' : '说点什么（可以不写）'} onChange={(event) => edit(() => setMessage(event.target.value))} />
            <span className="krp-row-unit">{message.length}/{messageMax}</span>
          </label>

          {closed ? <p className="kui-note kui-note--danger" role="alert" data-gift="closed">礼物功能现在关着，暂时送不了。</p> : null}

          <dl className="krp-bill kgf-bill">
            <div className="is-cost"><dt>花费</dt><dd data-gift="total">{total !== null ? <><CoinIcon size={14} className="h-3.5 w-3.5" />{formatCoins(total)}{tab === 'gift' && gift && count > 1 ? <small>{formatCoins(gift.price)} × {count}</small> : null}</> : '—'}</dd></div>
            <div><dt>现在的余额</dt><dd data-gift="balance">{balance ? formatCoins(balance.balance) : shop === null ? '—' : '加载中…'}</dd></div>
            <div className={cx(after !== null && after < 0 && 'is-bad')}><dt>送完剩下</dt><dd data-gift="after">{after === null ? '—' : after < 0 ? `不够，还差 ${formatCoins(-after)}` : formatCoins(after)}</dd></div>
          </dl>

          {short ? (
            <div className="krp-short" data-gift="short">
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
          {failure && failure.code !== 'insufficient_balance' && !(closed && failure.code === 'disabled') && !(blockedItem && failure.code === 'recipient_owns') ? <p className="kui-note kui-note--danger" role="alert" data-gift="send-error">{failure.message}</p> : null}
          <p className="krp-fineprint">送出的金币是花掉了，对方得到的是礼物和等量的{charmLabel}，不是金币。{target.conversationId === null ? '从这里送不会发聊天消息，礼物直接出现在 Ta 的礼物墙上。' : '送出后会在聊天里发一条礼物消息；撤回那条消息不会把礼物和金币退回来。'}</p>
        </div>
        <footer className="krp-panel-foot">
          <button type="button" className="kui-btn kui-btn--ghost" disabled={send.isPending} onClick={onClose}>取消</button>
          <button type="submit" className="kgf-btn" data-action="send-gift" disabled={!ready || send.isPending}>{send.isPending ? '正在送出…' : total !== null && ready ? `送出（${formatCoins(total)} 币）` : '送出'}</button>
        </footer>
      </form>
    </RedPacketLayer>
  );
}

