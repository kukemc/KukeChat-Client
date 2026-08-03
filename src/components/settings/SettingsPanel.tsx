import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkCcwBindingChallenge, getMyCcwBindingChallenge, startCcwBindingChallenge, syncMyCcwProfile, unbindMyCcwProfile } from '@/api/ccw';
import { confirmPasswordChange, createPasswordChangeChallenge } from '@/api/auth';
import { APP_DEVELOPERS, APP_NAME, CCW_SUPPORT_URL, SPONSOR_URL, ccwStudentProfileUrl } from '@/config';
import { ApiError } from '@/api/client';
import { getMyReports } from '@/api/reports';
import { getDesktopAutostartEnabled, setDesktopAutostartEnabled } from '@/native/desktopAutostart';
import { requestDesktopNotificationPermission } from '@/native/desktopNotifications';
import { createUserInvite } from '@/api/invites';
import { getUserPostStats } from '@/api/posts';
import { getUserProfile, updateMyPresence, updateMyProfile, uploadAvatar, uploadProfileCover } from '@/api/users';
import { useKukeStore, type NotificationMode, type ThemeMode, type UiFontScale } from '@/store/kukeStore';
import { registerNativeBackHandler, requestNativeBack } from '@/native/back';
import { runNativeRouteTransition } from '@/native/transition';
import type { CcwPasswordChallengeInfo, PresenceStatus, ReportRead, User } from '@/types/api';
import { Avatar, getDisplayName } from '@/components/ui/Avatar';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { resolveAssetUrl, resolveThumbnailUrl } from '@/utils/assetUrl';
import { isTauriDesktopApp } from '@/utils/appMode';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { MobileUserProfilePage } from '@/components/ui/MobileUserProfilePage';
import { MobileProfileSummaryCard } from '@/components/profile/MobileProfileSummaryCard';
import { useResolvedThemeMode } from '@/utils/theme';
import { presenceLabel, presenceOptions } from '@/utils/presence';
import { getMobileBottomFeatureIds, getMobileFeatureDefinition, MOBILE_FEATURES, normalizeMobileFeatureOrder, type MobileSortableFeatureId } from '@/mobile/features';
import { MOBILE_APP_VERSION, isMobileUpdateSupported } from '@/native/appUpdate';
import { requestMobileUpdateCheck } from '@/components/settings/MobileUpdateModal';
import packageJson from '../../../package.json';

interface SettingsPanelProps {
  user: User;
  isMobile?: boolean;
  onMobileBack?: () => void;
  onLogout?: () => void;
  initialTab?: SettingsTab;
  initialMobilePage?: Exclude<MobileSettingsPage, null>;
  focusKey?: number;
  onMobileDetailActiveChange?: (active: boolean) => void;
}

function getKukePortalRoot(): Element {
  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root') ?? document.body;
}

type SettingsTab = 'account' | 'ccw' | 'appearance' | 'reports' | 'about' | 'support';
type MobileSettingsPage = SettingsTab | 'mobileMenu' | null;
type CcwConfirmAction = 'sync-profile' | 'unbind' | null;

type NotificationPermissionState = NotificationPermission | 'unsupported';

function getKukeWindowPortalRoot(): Element | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const host = document.getElementById('kukechat-shadow-host');
  return host?.shadowRoot?.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? document.querySelector('.kc-window-frame:not(.kc-window-minimized)') ?? host?.shadowRoot?.getElementById('kukechat-root') ?? document.getElementById('kukechat-root');
}

function MobileSettingsRow({ icon, label, detail, active, onClick }: { icon: IconName; label: string; detail: string; active?: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="kc-qq-settings-row">
      <span className={`kc-qq-settings-icon ${active ? '[color:var(--kc-accent)]' : ''}`}><Icon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold [color:var(--kc-text)]">{label}</span>
        <span className="mt-0.5 block truncate text-[12px] [color:var(--kc-muted)]">{detail}</span>
      </span>
      <Icon name="chevron" className="h-4 w-4 [color:var(--kc-muted)]" />
    </button>
  );
}

function MobileSwitchRow({ icon, label, detail, checked, onClick }: { icon: IconName; label: string; detail: string; checked: boolean; onClick: () => void }): JSX.Element {
  return (
    <button type="button" onClick={onClick} className="kc-qq-settings-row">
      <span className="kc-qq-settings-icon"><Icon name={icon} className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold [color:var(--kc-text)]">{label}</span>
        <span className="mt-0.5 block truncate text-[12px] [color:var(--kc-muted)]">{detail}</span>
      </span>
      <span className={`kc-qq-switch ${checked ? 'kc-qq-switch-on' : ''}`}><span /></span>
    </button>
  );
}

const APP_VERSION = packageJson.version;
const APP_DESCRIPTION = packageJson.description;
const APP_DEVELOPER = APP_DEVELOPERS.map((developer) => developer.name).join('、');
const profileAccentPresets = ['#168bff', '#7c3aed', '#ff4f86', '#f97316', '#10b981', '#111827'] as const;
const profileLayoutOptions = [
  { value: 'classic', label: '经典名片', detail: '平衡封面和资料卡' },
  { value: 'banner', label: '沉浸封面', detail: '更高头图和大头像' },
  { value: 'compact', label: '紧凑档案', detail: '压缩头图突出动态' }
] as const;
const profileCardStyleOptions = [
  { value: 'soft', label: '柔和', detail: '浅色卡片，适合默认封面' },
  { value: 'glass', label: '玻璃', detail: '半透明浮层，适合图片封面' },
  { value: 'solid', label: '纯色', detail: '高对比信息卡' }
] as const;
type ProfileLayout = (typeof profileLayoutOptions)[number]['value'];
type ProfileCardStyle = (typeof profileCardStyleOptions)[number]['value'];

function normalizeProfileLayout(value: User['profile_layout'] | ''): ProfileLayout {
  return profileLayoutOptions.some((option) => option.value === value) ? value as ProfileLayout : 'classic';
}

function normalizeProfileCardStyle(value: User['profile_card_style'] | ''): ProfileCardStyle {
  return profileCardStyleOptions.some((option) => option.value === value) ? value as ProfileCardStyle : 'soft';
}

const settingsTabs: Array<{ tab: SettingsTab; label: string; detail: string; icon: IconName }> = [
  { tab: 'account', label: '账号资料', detail: '昵称、头像、简介', icon: 'profile' },
  { tab: 'ccw', label: 'CCW 账号', detail: '绑定、同步、主页跳转', icon: 'ccw' },
  { tab: 'appearance', label: '通用外观', detail: '主题与显示', icon: 'settings' },
  { tab: 'reports', label: '举报中心', detail: '进度与处理结果', icon: 'flag' },
  { tab: 'about', label: '关于 KukeChat', detail: '版本、开发者、愿景', icon: 'sparkles' },
  { tab: 'support', label: '赞助支持', detail: '爱发电与作品投币', icon: 'star' }
];

const themeOptions: Array<{ mode: ThemeMode; label: string; detail: string; icon: IconName }> = [
  { mode: 'system', label: '跟随系统', detail: '自动匹配设备外观', icon: 'device' },
  { mode: 'light', label: '白天模式', detail: '清爽浅色面板', icon: 'sun' },
  { mode: 'dark', label: '夜间模式', detail: '适合夜间聊天的低亮度面板', icon: 'moon' }
];

const fontScaleOptions: Array<{ value: UiFontScale; label: string; preview: string }> = [
  { value: 0, label: '小', preview: '更紧凑' },
  { value: 1, label: '标准', preview: '默认' },
  { value: 2, label: '稍大', preview: '舒适' },
  { value: 3, label: '大', preview: '清晰' },
  { value: 4, label: '特大', preview: '更醒目' }
];

function themeModeLabel(themeMode: ThemeMode): string {
  return themeOptions.find((option) => option.mode === themeMode)?.label ?? '跟随系统';
}

function fontScaleLabel(uiFontScale: UiFontScale): string {
  return fontScaleOptions.find((option) => option.value === uiFontScale)?.label ?? '标准';
}

function formatCompact(value?: number | null): string {
  if (typeof value !== 'number') {
    return '-';
  }
  return Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatChinaTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' });
}

function formatChinaDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function toUiFontScale(value: number): UiFontScale {
  return Math.min(4, Math.max(0, Math.round(value))) as UiFontScale;
}

function parseInterestTags(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of value.split(/[，,\n]+/)) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) {
      continue;
    }
    tags.push(tag);
    seen.add(key);
  }
  return tags;
}

function serializeInterestTags(tags: string[]): string {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(', ');
}

function InterestTagManager({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }): JSX.Element {
  const [draft, setDraft] = useState('');
  const tags = parseInterestTags(value);

  function addDraftTags(): void {
    const nextTags = parseInterestTags(serializeInterestTags([...tags, ...parseInterestTags(draft)]));
    onChange(serializeInterestTags(nextTags));
    setDraft('');
  }

  function removeTag(index: number): void {
    onChange(serializeInterestTags(tags.filter((_, currentIndex) => currentIndex !== index)));
  }

  return (
    <section className="grid gap-2">
      <div>
        <span className={compact ? 'text-[13px] font-bold text-[#526070]' : 'mb-2 block text-sm font-bold'}>兴趣标签</span>
        <p className={compact ? 'mt-1 text-[12px] font-medium text-[#8b95a5]' : 'mt-1 text-xs [color:var(--kc-muted)]'}>添加或删除标签，可一次输入多个。</p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-[20px] bg-[#f6f8fc] p-3 sm:[background:var(--kc-panel-muted)]">
        {tags.length > 0 ? tags.map((tag, index) => <button key={`${tag}-${index}`} type="button" onClick={() => removeTag(index)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-black text-white active:scale-[0.98] [background:var(--kc-accent)]"><span>{tag}</span><Icon name="close" className="h-3.5 w-3.5" /></button>) : <span className="text-[12px] font-bold text-[#8b95a5]">还没有兴趣标签</span>}
      </div>
      <div className="flex gap-2">
        <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDraftTags(); } }} className={compact ? 'kc-qq-input min-w-0 flex-1' : 'glass-input min-w-0 flex-1 rounded-2xl px-4 py-3 text-sm outline-none transition'} placeholder="例如：聊天、编程、音乐" />
        <button type="button" onClick={addDraftTags} disabled={!draft.trim()} className="shrink-0 rounded-[18px] px-4 text-[13px] font-black text-white disabled:opacity-50 [background:var(--kc-accent)]">添加</button>
      </div>
    </section>
  );
}

function FontSizeControl({ value, onChange, compact = false }: { value: UiFontScale; onChange: (value: UiFontScale) => void; compact?: boolean }): JSX.Element {
  const progress = `${(value / 4) * 100}%`;
  const current = fontScaleOptions.find((option) => option.value === value) ?? fontScaleOptions[1];

  return (
    <section className={compact ? 'kc-qq-card p-4' : 'glass-panel rounded-[30px] p-5'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className={compact ? 'text-[16px] font-black text-[#111827]' : 'text-sm font-semibold'}>字体大小</h4>
          <p className={compact ? 'mt-1 text-[12px] text-[#8b95a5]' : 'mt-1 text-xs [color:var(--kc-muted)]'}>调节聊天、列表、设置等界面的整体文字大小。</p>
        </div>
        <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{current.label}</span>
      </div>
      <div className="mt-4 rounded-[18px] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] dark:bg-transparent sm:rounded-2xl sm:[background:var(--kc-panel-muted)]">
        <div className="relative">
          <div className="kc-font-size-ticks pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2" aria-hidden="true">
            {fontScaleOptions.map((option) => <span key={option.value} />)}
          </div>
          <input type="range" min={0} max={4} step={1} value={value} onChange={(event) => onChange(toUiFontScale(Number(event.target.value)))} style={{ '--kc-range-progress': progress } as React.CSSProperties} className="kc-font-size-range relative z-10 w-full" aria-label="字体大小" />
        </div>
        <div className="mt-1 flex items-center justify-between text-[13px] font-bold text-[#111827] sm:text-xs sm:[color:var(--kc-muted)]">
          <span>小</span>
          <span>标准</span>
          <span>大</span>
        </div>
        <div className="mt-3 rounded-[16px] px-3 py-2 [background:var(--kc-panel)]">
          <p className="truncate text-sm font-semibold [color:var(--kc-text)]">预览文字 · {current.preview}</p>
          <p className="mt-1 truncate text-xs [color:var(--kc-muted)]">KukeChat 会根据你的偏好调整整体字号。</p>
        </div>
      </div>
    </section>
  );
}

export function SettingsPanel({ user, isMobile = false, onMobileBack, onLogout, initialTab = 'account', initialMobilePage, focusKey = 0, onMobileDetailActiveChange }: SettingsPanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [mobileSettingsPage, setMobileSettingsPage] = useState<MobileSettingsPage>(isMobile ? initialMobilePage ?? (initialTab !== 'account' ? initialTab : null) : null);
  const [nickname, setNickname] = useState(user.nickname ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>(user.presence_status ?? 'online');
  const [presenceText, setPresenceText] = useState(user.presence_text ?? '');
  const [profileTitle, setProfileTitle] = useState(user.profile_title ?? '');
  const [profileTagline, setProfileTagline] = useState(user.profile_tagline ?? '');
  const [profileStatus, setProfileStatus] = useState(user.profile_status ?? '');
  const [profileLocation, setProfileLocation] = useState(user.profile_location ?? '');
  const [profileInterests, setProfileInterests] = useState(user.profile_interests ?? '');
  const [profileLayout, setProfileLayout] = useState<ProfileLayout>(() => normalizeProfileLayout(user.profile_layout ?? ''));
  const [profileCardStyle, setProfileCardStyle] = useState<ProfileCardStyle>(() => normalizeProfileCardStyle(user.profile_card_style ?? ''));
  const [profileAccentColor, setProfileAccentColor] = useState(user.profile_accent_color ?? '#168bff');
  const [profileCoverUrl, setProfileCoverUrl] = useState(user.profile_cover_pending_url ?? user.profile_cover_url ?? '');
  const [mobileSelfProfileOpen, setMobileSelfProfileOpen] = useState(false);
  const [mobileAccountScrollResetKey, setMobileAccountScrollResetKey] = useState(0);
  const [draggingMobileFeatureId, setDraggingMobileFeatureId] = useState<MobileSortableFeatureId | null>(null);
  const [dragOverMobileFeatureId, setDragOverMobileFeatureId] = useState<MobileSortableFeatureId | null>(null);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [profileInviteCopied, setProfileInviteCopied] = useState(false);
  const [profileInviteError, setProfileInviteError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const mobileFeatureListRef = useRef<HTMLElement | null>(null);
  const mobileFeatureRectsRef = useRef(new Map<MobileSortableFeatureId, DOMRect>());
  const themeMode = useKukeStore((state) => state.themeMode);
  const resolvedThemeMode = useResolvedThemeMode(themeMode);
  const setThemeMode = useKukeStore((state) => state.setThemeMode);
  const uiFontScale = useKukeStore((state) => state.uiFontScale);
  const setUiFontScale = useKukeStore((state) => state.setUiFontScale);
  const browserNotificationMode = useKukeStore((state) => state.browserNotificationMode);
  const setBrowserNotificationMode = useKukeStore((state) => state.setBrowserNotificationMode);
  const soundNotificationMode = useKukeStore((state) => state.soundNotificationMode);
  const setSoundNotificationMode = useKukeStore((state) => state.setSoundNotificationMode);
  const mobileFeatureOrder = useKukeStore((state) => state.mobileFeatureOrder);
  const setMobileFeatureOrder = useKukeStore((state) => state.setMobileFeatureOrder);
  const setCurrentUser = useKukeStore((state) => state.setCurrentUser);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>(() => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'));
  const [ccwConfirmAction, setCcwConfirmAction] = useState<CcwConfirmAction>(null);
  const isDesktopApp = isTauriDesktopApp();
  const queryClient = useQueryClient();
  const reportsQuery = useQuery({
    queryKey: ['my-reports'],
    queryFn: getMyReports,
    enabled: activeTab === 'reports'
  });
  const ccwBindingQuery = useQuery({
    queryKey: ['ccw-binding', 'me'],
    queryFn: getMyCcwBindingChallenge,
    enabled: activeTab === 'ccw' || mobileSettingsPage === 'ccw',
    refetchInterval: (query) => query.state.data?.status === 'pending' ? 5_000 : false
  });
  const profileStatsQuery = useQuery({
    queryKey: ['posts', 'user', user.id, 'stats'],
    queryFn: () => getUserPostStats(user.id),
    enabled: isMobile
  });

  useEffect(() => {
    setNickname(user.nickname ?? '');
    setAvatarUrl(user.avatar_url ?? '');
    setBio(user.bio ?? '');
    setPresenceStatus(user.presence_status ?? 'online');
    setPresenceText(user.presence_text ?? '');
    setProfileTitle(user.profile_title ?? '');
    setProfileTagline(user.profile_tagline ?? '');
    setProfileStatus(user.profile_status ?? '');
    setProfileLocation(user.profile_location ?? '');
    setProfileInterests(user.profile_interests ?? '');
    setProfileLayout(normalizeProfileLayout(user.profile_layout ?? ''));
    setProfileCardStyle(normalizeProfileCardStyle(user.profile_card_style ?? ''));
    setProfileAccentColor(user.profile_accent_color ?? '#168bff');
    setProfileCoverUrl(user.profile_cover_pending_url ?? user.profile_cover_url ?? '');
  }, [user]);

  useEffect(() => {
    setActiveTab(initialTab);
    if (isMobile) {
      setMobileSettingsPage(initialMobilePage ?? (initialTab !== 'account' ? initialTab : null));
    }
  }, [focusKey, initialMobilePage, initialTab, isMobile]);

  useLayoutEffect(() => {
    if (!isMobile || mobileSettingsPage !== 'mobileMenu') {
      return;
    }
    const list = mobileFeatureListRef.current;
    if (!list) {
      return;
    }
    const previous = mobileFeatureRectsRef.current;
    const next = new Map<MobileSortableFeatureId, DOMRect>();
    list.querySelectorAll<HTMLElement>('[data-mobile-feature-id]').forEach((element) => {
      const id = element.dataset.mobileFeatureId as MobileSortableFeatureId | undefined;
      if (!id) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const before = previous.get(id);
      next.set(id, rect);
      if (!before) {
        return;
      }
      const deltaY = before.top - rect.top;
      if (Math.abs(deltaY) < 1) {
        return;
      }
      element.animate([
        { transform: `translate3d(0, ${deltaY}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' }
      ], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    });
    mobileFeatureRectsRef.current = next;
  }, [isMobile, mobileFeatureOrder, mobileSettingsPage]);

  useEffect(() => {
    if (mobileSettingsPage === 'account') {
      setMobileSettingsScrollTop(0);
    }
  }, [mobileSettingsPage]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }

    return registerNativeBackHandler(() => {
      if (mobileSelfProfileOpen) {
        runNativeRouteTransition('secondary-back', closeMobileSelfProfile, isMobile);
        return true;
      }
      if (mobileSettingsPage) {
        runNativeRouteTransition('secondary-back', () => closeMobileSettingsPage(), isMobile);
        return true;
      }
      return false;
    }, 50);
  }, [isMobile, mobileSelfProfileOpen, mobileSettingsPage]);

  useEffect(() => {
    if (!isMobile) {
      return undefined;
    }
    return () => onMobileDetailActiveChange?.(false);
  }, [isMobile, onMobileDetailActiveChange]);

  function resetProfileDraftFields(): void {
    setNickname(user.nickname ?? '');
    setAvatarUrl(user.avatar_url ?? '');
    setBio(user.bio ?? '');
    setProfileTitle(user.profile_title ?? '');
    setProfileTagline(user.profile_tagline ?? '');
    setProfileStatus(user.profile_status ?? '');
    setProfileLocation(user.profile_location ?? '');
    setProfileInterests(user.profile_interests ?? '');
    setProfileLayout(normalizeProfileLayout(user.profile_layout ?? ''));
    setProfileCardStyle(normalizeProfileCardStyle(user.profile_card_style ?? ''));
    setProfileAccentColor(user.profile_accent_color ?? '#168bff');
    setProfileCoverUrl(user.profile_cover_pending_url ?? user.profile_cover_url ?? '');
  }

  function closeMobileSettingsPage(resetDraft = false): void {
    setMobileSettingsScrollTop(0);
    setMobileAccountScrollResetKey((value) => value + 1);
    if (resetDraft) {
      resetProfileDraftFields();
    }
    setMobileSelfProfileOpen(false);
    setMobileSettingsPage(null);
    onMobileDetailActiveChange?.(false);
  }

  function closeMobileSelfProfile(): void {
    setMobileSettingsScrollTop(0);
    setMobileAccountScrollResetKey((value) => value + 1);
    setMobileSelfProfileOpen(false);
    onMobileDetailActiveChange?.(mobileSettingsPage !== null);
  }

  const profileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (response) => setAvatarUrl(response.url)
  });
  const startCcwBindingMutation = useMutation({
    mutationFn: startCcwBindingChallenge,
    onSuccess: (challenge) => queryClient.setQueryData(['ccw-binding', 'me'], challenge)
  });
  const checkCcwBindingMutation = useMutation({
    mutationFn: checkCcwBindingChallenge,
    onSuccess: (challenge) => {
      queryClient.setQueryData(['ccw-binding', 'me'], challenge);
      if (challenge?.status === 'verified') {
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      }
    }
  });
  const syncCcwProfileMutation = useMutation({
    mutationFn: syncMyCcwProfile,
    onSuccess: (updatedUser) => {
      setCcwConfirmAction(null);
      setCurrentUser(updatedUser);
      setNickname(updatedUser.nickname ?? '');
      setAvatarUrl(updatedUser.avatar_url ?? '');
      setBio(updatedUser.bio ?? '');
      queryClient.setQueryData(['me'], updatedUser);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    }
  });
  const unbindCcwProfileMutation = useMutation({
    mutationFn: unbindMyCcwProfile,
    onSuccess: (updatedUser) => {
      setCcwConfirmAction(null);
      setCurrentUser(updatedUser);
      queryClient.setQueryData(['me'], updatedUser);
      queryClient.setQueryData(['ccw-binding', 'me'], null);
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['ccw-binding', 'me'] });
    }
  });
  const [pwdChallenge, setPwdChallenge] = useState<CcwPasswordChallengeInfo | null>(null);
  const [pwdNew, setPwdNew] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdDone, setPwdDone] = useState(false);
  const [pwdAutoVerify, setPwdAutoVerify] = useState(false);
  const [pwdCopied, setPwdCopied] = useState(false);
  const pwdChallengeMutation = useMutation({
    mutationFn: createPasswordChangeChallenge,
    onSuccess: (info) => {
      setPwdChallenge(info);
      setPwdError('');
      setPwdDone(false);
    },
    onError: (error) => setPwdError(error instanceof Error ? error.message : 'failed to create challenge')
  });
  const pwdConfirmMutation = useMutation({
    mutationFn: () => confirmPasswordChange({ code: pwdChallenge?.code ?? '', new_password: pwdNew }),
    onSuccess: () => {
      setPwdAutoVerify(false);
      setPwdDone(true);
      setPwdError('');
      setPwdNew('');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404 && pwdChallenge) {
        setPwdError('暂未在评论区检测到验证码，已开启每 5 秒自动重试；评论发送成功后会自动完成修改。');
        setPwdAutoVerify(true);
      } else {
        setPwdAutoVerify(false);
        setPwdError(error instanceof Error ? error.message : '修改密码失败，请稍后重试');
      }
    }
  });
  useEffect(() => {
    if (!pwdAutoVerify || !pwdChallenge || pwdDone) return undefined;
    const timer = window.setInterval(() => {
      if (!pwdConfirmMutation.isPending) pwdConfirmMutation.mutate();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [pwdAutoVerify, pwdChallenge, pwdDone, pwdConfirmMutation]);
  const desktopAutostartQuery = useQuery({
    queryKey: ['desktop-autostart'],
    queryFn: getDesktopAutostartEnabled,
    enabled: isDesktopApp,
    retry: false
  });

  const desktopAutostartMutation = useMutation({
    mutationFn: setDesktopAutostartEnabled,
    onSuccess: (enabled) => {
      queryClient.setQueryData(['desktop-autostart'], enabled);
    }
  });

  const coverMutation = useMutation({
    mutationFn: uploadProfileCover,
    onSuccess: (response) => setProfileCoverUrl(response.url)
  });

  const presenceMutation = useMutation({
    mutationFn: updateMyPresence,
    onSuccess: (updatedUser) => {
      setCurrentUser(updatedUser);
      setPresenceStatus(updatedUser.presence_status ?? 'online');
      setPresenceText(updatedUser.presence_text ?? '');
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      void queryClient.invalidateQueries({ queryKey: ['user-online'] });
      void queryClient.invalidateQueries({ queryKey: ['online-users'] });
    }
  });

  function submit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    profileMutation.mutate({
      nickname,
      avatar_url: avatarUrl,
      bio,
      profile_title: profileTitle,
      profile_tagline: profileTagline,
      profile_status: profileStatus,
      profile_location: profileLocation,
      profile_interests: profileInterests,
      profile_layout: profileLayout,
      profile_card_style: profileCardStyle,
      profile_accent_color: profileAccentColor,
      profile_cover_url: profileCoverUrl
    });
  }

  function chooseAvatar(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    avatarMutation.mutate(file);
    event.target.value = '';
  }

  function chooseProfileCover(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    coverMutation.mutate(file);
    event.target.value = '';
  }

  function savePresence(nextStatus = presenceStatus, nextText = presenceText): void {
    const text = nextText.trim();
    presenceMutation.mutate({ presence_status: nextStatus, presence_text: text || null });
  }

  function selectPresence(status: PresenceStatus): void {
    setPresenceStatus(status);
    if (status === 'custom') {
      if (presenceText.trim()) {
        savePresence(status, presenceText);
      }
    } else {
      setPresenceText('');
      savePresence(status, '');
    }
  }

  function moveMobileFeature(featureId: MobileSortableFeatureId, direction: -1 | 1): void {
    const order = normalizeMobileFeatureOrder(mobileFeatureOrder);
    const index = order.indexOf(featureId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
      return;
    }
    const next = [...order];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setMobileFeatureOrder(next);
  }

  function moveMobileFeatureTo(featureId: MobileSortableFeatureId, targetId: MobileSortableFeatureId): void {
    if (featureId === targetId) {
      return;
    }
    const order = normalizeMobileFeatureOrder(mobileFeatureOrder);
    const fromIndex = order.indexOf(featureId);
    const toIndex = order.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }
    const next = [...order];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    setMobileFeatureOrder(next);
  }

  function getMobileFeatureIdFromPoint(clientX: number, clientY: number): MobileSortableFeatureId | null {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-mobile-feature-id]');
    const value = element?.dataset.mobileFeatureId;
    return value && MOBILE_FEATURES.some((item) => item.id === value) ? value as MobileSortableFeatureId : null;
  }

  function handleMobileFeatureTouchEnd(event: React.TouchEvent, featureId: MobileSortableFeatureId): void {
    const touch = event.changedTouches[0];
    setDraggingMobileFeatureId(null);
    setDragOverMobileFeatureId(null);
    if (!touch) {
      return;
    }
    const targetId = getMobileFeatureIdFromPoint(touch.clientX, touch.clientY);
    if (targetId) {
      moveMobileFeatureTo(featureId, targetId);
    }
  }

  function handleMobileFeatureTouchMove(event: React.TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    setDragOverMobileFeatureId(getMobileFeatureIdFromPoint(touch.clientX, touch.clientY));
  }

  async function shareMyProfile(): Promise<void> {
    setProfileInviteError(null);
    try {
      const invite = await createUserInvite(user.id);
      const url = `${window.location.origin}/?invite=${invite.token}`;
      await navigator.clipboard.writeText(url);
      setProfileInviteCopied(true);
      window.setTimeout(() => setProfileInviteCopied(false), 1800);
    } catch (error) {
      setProfileInviteError(error instanceof Error ? error.message : '分享链接生成失败，请稍后重试。');
    }
  }

  function confirmCcwAction(): void {
    if (ccwConfirmAction === 'sync-profile') {
      syncCcwProfileMutation.mutate(true);
    } else if (ccwConfirmAction === 'unbind') {
      unbindCcwProfileMutation.mutate();
    }
  }

  function renderPresenceSettings(compact = false): JSX.Element {
    const currentLabel = presenceLabel(presenceStatus, presenceText, true);
    return (
      <section className={compact ? 'kc-qq-card grid gap-3 p-4' : 'glass-panel rounded-[30px] p-5 sm:p-6'}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className={compact ? 'text-[16px] font-black text-[#111827]' : 'text-lg font-semibold'}>在线状态</h4>
            <p className={compact ? 'mt-1 text-[12px] text-[#8b95a5]' : 'mt-1 text-sm [color:var(--kc-muted)]'}>展示“正在创作”“忙碌”等实时状态。</p>
          </div>
          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">{currentLabel}</span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {presenceOptions.map((option) => (
            <button key={option.value} type="button" onClick={() => selectPresence(option.value)} disabled={presenceMutation.isPending} className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${presenceStatus === option.value ? '[border-color:var(--kc-accent)] [background:var(--kc-accent-soft)]' : '[border-color:var(--kc-border)] [background:var(--kc-panel-muted)] hover:[background:var(--kc-hover)]'}`}>
              <span className="block text-sm font-bold [color:var(--kc-text)]">{option.label}</span>
              <span className="mt-1 block text-xs [color:var(--kc-muted)]">{option.detail}</span>
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-bold">自定义文案</span>
          <input value={presenceText} onChange={(event) => setPresenceText(event.target.value)} onBlur={() => savePresence(presenceStatus === 'custom' ? 'custom' : presenceStatus, presenceText)} maxLength={40} placeholder="例如：正在画新角色" className={compact ? 'kc-qq-input w-full' : 'glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition'} />
        </label>
        {presenceMutation.error ? <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">在线状态保存失败，自定义状态不能为空。</p> : null}
      </section>
    );
  }

  function renderCcwSettings(compact = false): JSX.Element {
    const challenge = ccwBindingQuery.data ?? null;
    const ccwProfileUrl = user.ccw_student_oid ? ccwStudentProfileUrl(user.ccw_student_oid) : null;
    const bindingError = startCcwBindingMutation.error instanceof Error ? startCcwBindingMutation.error.message : checkCcwBindingMutation.error instanceof Error ? checkCcwBindingMutation.error.message : null;
    const syncError = syncCcwProfileMutation.error instanceof Error ? syncCcwProfileMutation.error.message : unbindCcwProfileMutation.error instanceof Error ? unbindCcwProfileMutation.error.message : null;
    const surface = compact ? 'kc-qq-card grid gap-4 p-4' : 'glass-panel kc-pc-card-motion grid gap-5 rounded-[30px] p-5 sm:p-6';
    const mutedClass = '[color:var(--kc-muted)]';
    const ccwAvatarUrl = resolveThumbnailUrl(user.ccw_avatar_url);
    const ccwPrimaryStats = [
      { label: '粉丝', value: user.ccw_follower_count },
      { label: '获赞', value: user.ccw_like_count },
      { label: '浏览', value: user.ccw_view_count }
    ];
    const ccwSecondaryStats = [
      { label: '关注', value: user.ccw_following_count },
      { label: '收藏', value: user.ccw_favorite_count },
      { label: '作品', value: user.ccw_creation_count },
      { label: '评论', value: user.ccw_comment_count }
    ];
    const confirmIsSync = ccwConfirmAction === 'sync-profile';
    const confirmPending = syncCcwProfileMutation.isPending || unbindCcwProfileMutation.isPending;

    const confirmDialog = ccwConfirmAction ? (
      <div className="absolute inset-0 z-[90] grid place-items-center bg-black/30 px-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[28px] border p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)] [background:var(--kc-panel)] [border-color:var(--kc-border)]">
          <span className={confirmIsSync ? 'grid h-12 w-12 place-items-center rounded-[20px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'grid h-12 w-12 place-items-center rounded-[20px] [background:color-mix(in_srgb,#ef4444_10%,var(--kc-panel))] text-red-500'}><Icon name={confirmIsSync ? 'sparkles' : 'trash'} className="h-6 w-6" /></span>
          <h3 className="mt-4 text-xl font-black [color:var(--kc-text)]">{confirmIsSync ? '确认同步 CCW 资料？' : '确认解绑 CCW 账号？'}</h3>
          <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">{confirmIsSync ? '这会用当前 CCW 公开资料覆盖你的 KukeChat 昵称、头像、简介和个人主页封面。不会修改账号、密码或聊天记录。' : '解绑后你的 KukeChat 资料不会被恢复，但个人主页和用户卡片将不再展示这个 CCW 账号，可之后重新绑定。'}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setCcwConfirmAction(null)} disabled={confirmPending} className="rounded-2xl border px-4 py-2.5 text-sm font-black [border-color:var(--kc-border)] [color:var(--kc-text)] disabled:opacity-50">取消</button>
            <button type="button" onClick={confirmCcwAction} disabled={confirmPending} className={confirmIsSync ? 'rounded-2xl bg-[#168bff] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50' : 'rounded-2xl bg-red-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50'}>{confirmPending ? '处理中...' : '确认'}</button>
          </div>
        </div>
      </div>
    ) : null;
    const portalRoot = ccwConfirmAction ? getKukeWindowPortalRoot() : null;

    return (
      <>
        <section className={surface}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={compact ? 'text-[12px] font-black uppercase tracking-[0.18em] [color:var(--kc-accent)]' : 'text-xs font-black uppercase tracking-[0.18em] [color:var(--kc-accent)]'}>CCW Account</p>
              <h3 className={compact ? 'mt-1 text-[24px] font-black [color:var(--kc-text)]' : 'mt-1 text-2xl font-black [color:var(--kc-text)]'}>{user.ccw_student_oid ? '已绑定 CCW 账号' : '绑定 CCW 账号'}</h3>
              <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedClass}`}>{user.ccw_student_oid ? '这里展示从 CCW 拉取的公开资料。刷新只更新 CCW 数据；一键同步资料会修改 KukeChat 头像、昵称、简介和主页封面。' : '生成验证码后，前往指定 CCW 作品评论区发送验证码。服务器会自动轮询评论，也可以手动立即检查。'}</p>
            </div>
            <span className={compact ? 'grid h-[52px] w-[52px] place-items-center rounded-[24px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'grid h-14 w-14 place-items-center rounded-[24px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]'}><Icon name="ccw" className="h-7 w-7" /></span>
          </div>

          {user.ccw_student_oid ? (
            <div className={compact ? 'rounded-[30px] border p-4 shadow-[0_18px_44px_rgba(22,139,255,.10)] [background:linear-gradient(145deg,color-mix(in_srgb,var(--kc-accent)_9%,transparent),var(--kc-panel)_48%)] [border-color:color-mix(in_srgb,var(--kc-accent)_24%,var(--kc-border))]' : 'rounded-[30px] border p-5 shadow-[0_18px_54px_rgba(15,23,42,.06)] [background:linear-gradient(145deg,color-mix(in_srgb,var(--kc-accent)_9%,transparent),var(--kc-panel)_48%)] [border-color:color-mix(in_srgb,var(--kc-accent)_24%,var(--kc-border))]'}>
              <div className="flex items-start gap-4">
                {ccwAvatarUrl ? <img src={ccwAvatarUrl} alt={user.ccw_name ?? 'CCW'} className={compact ? 'h-[72px] w-[72px] rounded-[26px] object-cover shadow-[0_12px_28px_rgba(22,139,255,.16)]' : 'h-20 w-20 rounded-[28px] object-cover shadow-[0_16px_38px_rgba(15,23,42,.14)]'} /> : <span className={compact ? 'grid h-[72px] w-[72px] place-items-center rounded-[26px] bg-[#168bff] text-white' : 'grid h-20 w-20 place-items-center rounded-[28px] text-white [background:var(--kc-accent)]'}><Icon name="ccw" className="h-8 w-8" /></span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={compact ? 'rounded-full bg-[#168bff] px-2.5 py-1 text-[12px] font-black text-white' : 'rounded-full px-2.5 py-1 text-xs font-black text-white [background:var(--kc-accent)]'}>已绑定</span>
                    <span className={`max-w-full truncate rounded-full px-2.5 py-1 text-xs font-bold ${compact ? '[background:var(--kc-panel)] [color:var(--kc-muted)]' : '[background:var(--kc-panel)] [color:var(--kc-muted)]'}`}>{user.ccw_student_oid}</span>
                  </div>
                  <h4 className={compact ? 'mt-2 truncate text-[24px] font-black [color:var(--kc-text)]' : 'mt-2 truncate text-3xl font-black leading-tight [color:var(--kc-text)]'}>{user.ccw_name || user.ccw_student_oid}</h4>
                  <p className={`mt-1 line-clamp-2 text-sm leading-6 ${mutedClass}`}>{user.ccw_bio || '这个 CCW 用户暂时没有公开简介。'}</p>
                </div>
              </div>

              <div className={compact ? 'mt-4 grid grid-cols-3 gap-2' : 'mt-5 grid grid-cols-3 gap-3'}>
                {ccwPrimaryStats.map((stat, index) => (
                  <div key={stat.label} className={compact ? 'rounded-[22px] border px-3 py-3 text-center shadow-[0_10px_24px_rgba(15,23,42,.05)] [background:var(--kc-panel)] [border-color:var(--kc-border)]' : 'rounded-[22px] border px-4 py-4 text-center [background:var(--kc-panel)] [border-color:var(--kc-border)]'}>
                    <p className={compact ? `text-[22px] font-black leading-none ${index === 0 ? '[color:var(--kc-accent)]' : '[color:var(--kc-text)]'}` : `text-2xl font-black leading-none ${index === 0 ? '[color:var(--kc-accent)]' : '[color:var(--kc-text)]'}`}>{formatCompact(stat.value)}</p>
                    <p className={compact ? 'mt-1 text-[12px] font-black [color:var(--kc-muted)]' : 'mt-1 text-xs font-black [color:var(--kc-muted)]'}>{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {ccwSecondaryStats.map((stat) => (
                  <span key={stat.label} className={compact ? 'rounded-full border px-3 py-1.5 text-[12px] font-black shadow-[0_8px_18px_rgba(15,23,42,.04)] [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]' : 'rounded-full border px-3 py-1.5 text-xs font-black [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-muted)]'}>{stat.label} <strong className={compact ? 'ml-1 [color:var(--kc-text)]' : 'ml-1 [color:var(--kc-text)]'}>{formatCompact(stat.value)}</strong></span>
                ))}
              </div>

              <p className={`mt-4 text-xs ${mutedClass}`}>同步时间：{user.ccw_synced_at ? formatChinaDateTime(user.ccw_synced_at) : '尚未同步'}</p>
            </div>
          ) : (
            <div className={compact ? 'grid gap-3 rounded-[28px] border p-4 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]' : 'grid gap-3 rounded-[28px] border p-5 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
              <div className="grid gap-2 sm:grid-cols-3">
                {['生成验证码', '评论到指定作品', '自动检查并绑定'].map((label, index) => <div key={label} className={compact ? 'rounded-[22px] border p-3 [background:var(--kc-panel)] [border-color:var(--kc-border)]' : 'rounded-2xl [background:var(--kc-panel)] p-4'}><span className={compact ? 'grid h-8 w-8 place-items-center rounded-full text-[13px] font-black [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'grid h-8 w-8 place-items-center rounded-full text-sm font-black [background:var(--kc-accent-soft)] [color:var(--kc-accent)]'}>{index + 1}</span><p className={compact ? 'mt-3 text-[14px] font-black [color:var(--kc-text)]' : 'mt-3 text-sm font-black [color:var(--kc-text)]'}>{label}</p></div>)}
              </div>
            </div>
          )}
          {!user.ccw_student_oid ? (
            <div className={compact ? 'rounded-[28px] border p-4 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]' : 'rounded-[28px] border p-5 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
              <p className={`text-xs font-black uppercase tracking-[0.18em] ${mutedClass}`}>验证码</p>
              <p className={compact ? 'mt-3 select-all rounded-[20px] px-4 py-5 font-mono text-3xl font-black tracking-[0.12em] [background:var(--kc-panel)] [color:var(--kc-accent)]' : 'mt-3 select-all rounded-[20px] px-4 py-5 font-mono text-3xl font-black tracking-[0.12em] [background:var(--kc-panel)] [color:var(--kc-accent)]'}>{challenge?.code ?? '---- ----'}</p>
              <p className={`mt-3 text-xs ${mutedClass}`}>{challenge ? challenge.status === 'verified' ? '绑定成功，资料即将刷新' : challenge.status === 'expired' ? '验证码已过期，请重新生成' : `有效期至 ${formatChinaTime(challenge.expires_at)}` : '还没有生成验证码'}</p>
            </div>
          ) : null}
          <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4'}>
            {!user.ccw_student_oid ? <button type="button" onClick={() => startCcwBindingMutation.mutate()} disabled={startCcwBindingMutation.isPending} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] bg-[#168bff] px-4 text-[14px] font-black text-white shadow-[0_12px_26px_rgba(22,139,255,.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(22,139,255,.22)] transition hover:-translate-y-0.5 [background:linear-gradient(135deg,var(--kc-accent),#42a5ff)] disabled:translate-y-0 disabled:opacity-50'}><Icon name="ccw" className="h-4 w-4" />{startCcwBindingMutation.isPending ? '生成中...' : challenge?.status === 'expired' ? '重新生成' : '生成验证码'}</button> : null}
            {!user.ccw_student_oid ? <button type="button" onClick={() => checkCcwBindingMutation.mutate()} disabled={!challenge || checkCcwBindingMutation.isPending} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-4 text-[14px] font-black shadow-[0_8px_18px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-accent)] disabled:translate-y-0 disabled:opacity-50' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-5 text-sm font-black transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[border-color:color-mix(in_srgb,var(--kc-accent)_36%,var(--kc-border))] hover:[color:var(--kc-accent)] disabled:translate-y-0 disabled:opacity-50'}><Icon name="check" className="h-4 w-4" />{checkCcwBindingMutation.isPending ? '检查中...' : '立即检查'}</button> : null}
            {challenge?.creation_url && !user.ccw_student_oid ? <button type="button" onClick={() => void openExternalUrl(challenge.creation_url)} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-4 text-[14px] font-black transition hover:-translate-y-0.5 [background:var(--kc-accent-soft)] [border-color:color-mix(in_srgb,var(--kc-accent)_20%,var(--kc-border))] [color:var(--kc-accent)]' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-5 text-sm font-black transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]'}><Icon name="external" className="h-4 w-4" />打开作品</button> : null}
            {ccwProfileUrl ? <button type="button" onClick={() => void openExternalUrl(ccwProfileUrl)} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-4 text-[14px] font-black shadow-[0_8px_18px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-accent)]' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-5 text-sm font-black transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]'}><Icon name="external" className="h-4 w-4" />打开主页</button> : null}
            {user.ccw_student_oid ? <button type="button" onClick={() => syncCcwProfileMutation.mutate(false)} disabled={syncCcwProfileMutation.isPending} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-4 text-[14px] font-black shadow-[0_8px_18px_rgba(15,23,42,.05)] transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] disabled:translate-y-0 disabled:opacity-50' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-5 text-sm font-black transition hover:-translate-y-0.5 [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[border-color:color-mix(in_srgb,var(--kc-accent)_28%,var(--kc-border))] hover:[color:var(--kc-accent)] disabled:translate-y-0 disabled:opacity-50'}><Icon name="recall" className="h-4 w-4" />{syncCcwProfileMutation.isPending ? '同步中...' : '刷新数据'}</button> : null}
            {user.ccw_student_oid ? <button type="button" onClick={() => setCcwConfirmAction('sync-profile')} disabled={syncCcwProfileMutation.isPending} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] bg-[#168bff] px-4 text-[14px] font-black text-white shadow-[0_12px_26px_rgba(22,139,255,.24)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(22,139,255,.24)] transition hover:-translate-y-0.5 [background:linear-gradient(135deg,var(--kc-accent),#3aa2ff)] disabled:translate-y-0 disabled:opacity-50'}><Icon name="sparkles" className="h-4 w-4" />一键同步</button> : null}
            {user.ccw_student_oid ? <button type="button" onClick={() => setCcwConfirmAction('unbind')} disabled={unbindCcwProfileMutation.isPending} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-4 text-[14px] font-black text-red-500 transition hover:-translate-y-0.5 [background:color-mix(in_srgb,#ef4444_7%,var(--kc-panel))] [border-color:rgba(239,68,68,.24)] disabled:translate-y-0 disabled:opacity-50' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] border px-5 text-sm font-black text-red-500 transition hover:-translate-y-0.5 hover:bg-red-500/10 [background:color-mix(in_srgb,#ef4444_5%,var(--kc-panel))] [border-color:rgba(239,68,68,.24)] disabled:translate-y-0 disabled:opacity-50'}><Icon name="trash" className="h-4 w-4" />解绑账号</button> : null}
          </div>
          {bindingError ? <p className={compact ? 'rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-500' : 'rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500'}>{bindingError}</p> : null}
          {challenge?.status === 'conflict' ? <p className={compact ? 'rounded-[18px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-600' : 'rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600'}>这个 CCW 账号已经绑定到其他 KukeChat 用户。</p> : null}
          {syncError ? <p className={compact ? 'rounded-[18px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-500' : 'rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500'}>{syncError}</p> : null}
        </section>
        {user.ccw_student_oid ? (
          <section className={surface}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] [color:var(--kc-accent)]">Password</p>
                <h3 className={compact ? 'mt-1 text-[24px] font-black [color:var(--kc-text)]' : 'mt-1 text-2xl font-black [color:var(--kc-text)]'}>修改密码</h3>
                <p className={`mt-2 max-w-2xl text-sm leading-6 ${mutedClass}`}>通过 CCW 评论验证码核实账号归属后即可设置新密码，无需输入旧密码。</p>
              </div>
              <span className={compact ? 'grid h-[52px] w-[52px] place-items-center rounded-[24px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]' : 'grid h-14 w-14 place-items-center rounded-[24px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]'}><Icon name="shield" className="h-7 w-7" /></span>
            </div>
            {pwdDone ? (
              <div className={compact ? 'rounded-[28px] border p-4 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]' : 'rounded-[28px] border p-5 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
                <p className="text-sm font-black text-emerald-500">密码已修改成功，下次登录请使用新密码。</p>
                <button type="button" onClick={() => { setPwdDone(false); setPwdChallenge(null); }} className="mt-3 rounded-2xl border px-4 py-2 text-sm font-black [border-color:var(--kc-border)] [color:var(--kc-accent)]">再次修改</button>
              </div>
            ) : pwdChallenge ? (
              <>
                <div className={compact ? 'rounded-[28px] border p-4 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]' : 'rounded-[28px] border p-5 text-center [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]'}>
                  <p className={`text-xs font-black uppercase tracking-[0.18em] ${mutedClass}`}>验证码（10 分钟内有效）</p>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(pwdChallenge.code).then(() => { setPwdCopied(true); window.setTimeout(() => setPwdCopied(false), 2000); }); }} title="点击复制验证码" className="mt-3 flex w-full select-all items-center justify-center gap-2 rounded-[20px] px-4 py-5 font-mono text-3xl font-black tracking-[0.12em] transition [background:var(--kc-panel)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]">{pwdChallenge.code}<Icon name="copy" className="h-5 w-5 opacity-60" /></button>
                  <p className={`mt-2 text-[11px] ${mutedClass}`}>{pwdCopied ? '已复制到剪贴板' : '点击验证码即可复制'}</p>
                  <p className={`mt-3 text-xs leading-5 ${mutedClass}`}>请用已绑定的 CCW 账号前往<a href={pwdChallenge.comment_url} target="_blank" rel="noreferrer" className="mx-1 font-bold underline [color:var(--kc-accent)]">指定作品评论区</a>发送该验证码，然后在下方输入新密码并完成验证。</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input value={pwdNew} onChange={(event) => setPwdNew(event.target.value)} type="text" placeholder="输入新密码（至少 6 位）" className="h-12 min-w-0 rounded-[20px] border px-4 text-sm outline-none [background:var(--kc-panel)] [border-color:var(--kc-border)] [color:var(--kc-text)]" />
                  <button type="button" onClick={() => { setPwdError(''); pwdConfirmMutation.mutate(); }} disabled={pwdNew.length < 6 || pwdConfirmMutation.isPending} className="inline-flex h-12 items-center justify-center gap-2 rounded-[20px] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(22,139,255,.22)] transition hover:-translate-y-0.5 [background:linear-gradient(135deg,var(--kc-accent),#42a5ff)] disabled:translate-y-0 disabled:opacity-50"><Icon name="check" className="h-4 w-4" />{pwdConfirmMutation.isPending ? '验证中...' : pwdAutoVerify ? '自动重试中，点击手动验证' : '验证评论并修改密码'}</button>
                </div>
              </>
            ) : (
              <div>
                <button type="button" onClick={() => pwdChallengeMutation.mutate()} disabled={pwdChallengeMutation.isPending} className={compact ? 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] bg-[#168bff] px-4 text-[14px] font-black text-white shadow-[0_12px_26px_rgba(22,139,255,.22)] transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50' : 'inline-flex h-12 items-center justify-center gap-2 rounded-[20px] px-5 text-sm font-black text-white shadow-[0_14px_30px_rgba(22,139,255,.22)] transition hover:-translate-y-0.5 [background:linear-gradient(135deg,var(--kc-accent),#42a5ff)] disabled:translate-y-0 disabled:opacity-50'}><Icon name="shield" className="h-4 w-4" />{pwdChallengeMutation.isPending ? '生成中...' : '生成验证码'}</button>
              </div>
            )}
            {pwdError ? <p className={compact ? 'rounded-[18px] border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-600' : 'rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600'}>{pwdError}</p> : null}
          </section>
        ) : null}
        {confirmDialog && portalRoot ? createPortal(confirmDialog, portalRoot) : confirmDialog}
      </>
    );
  }

  async function updateBrowserNotifications(mode: NotificationMode): Promise<void> {
    if (mode === 'off') {
      setBrowserNotificationMode('off');
      return;
    }

    if (isDesktopApp) {
      const permission = await requestDesktopNotificationPermission();
      setNotificationPermission(permission);
      setBrowserNotificationMode(permission === 'granted' ? 'on' : 'off');
      return;
    }

    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
      setBrowserNotificationMode('off');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationPermission('granted');
      setBrowserNotificationMode('on');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    setBrowserNotificationMode(permission === 'granted' ? 'on' : 'off');
  }

  const notificationPermissionLabel = notificationPermission === 'unsupported'
    ? isDesktopApp ? '当前桌面端不支持系统通知，请更新客户端。' : '当前浏览器不支持系统通知。'
    : notificationPermission === 'granted'
      ? isDesktopApp ? 'Windows 系统通知权限已允许。' : '系统通知权限已允许。'
      : notificationPermission === 'denied'
        ? isDesktopApp ? '系统通知权限已被 Windows 拒绝，请在系统设置中开启。' : '系统通知权限已被浏览器拒绝，请在浏览器站点设置中开启。'
        : isDesktopApp ? '开启后会请求 Windows 系统通知权限。' : '开启后会先请求浏览器通知权限。';
  const systemNotificationLabel = isDesktopApp ? 'Windows 系统通知' : '浏览器系统通知';
  const desktopAutostartEnabled = Boolean(desktopAutostartQuery.data);
  const desktopAutostartLabel = desktopAutostartMutation.isPending
    ? '正在保存自启动设置...'
    : desktopAutostartMutation.error
      ? '自启动设置保存失败，请重试。'
      : desktopAutostartQuery.isLoading
        ? '正在读取桌面端启动设置...'
        : '开机登录后自动启动 KukeChat 桌面端。';
  const profilePreviewCover = profileCoverUrl ? resolveAssetUrl(profileCoverUrl) : null;
  const normalizedProfileAccent = /^#[0-9a-fA-F]{6}$/.test(profileAccentColor) ? profileAccentColor : '#168bff';
  const profileCoverBackground = profilePreviewCover ? `linear-gradient(135deg,rgba(6,10,20,.68),rgba(6,10,20,.18)),url(${profilePreviewCover}) center/cover` : `radial-gradient(circle at 15% 20%,rgba(255,255,255,.34),transparent 30%),radial-gradient(circle at 82% 12%,rgba(255,255,255,.22),transparent 24%),linear-gradient(135deg,${normalizedProfileAccent} 0%,#7c8cff 48%,#ff7eb3 100%)`;
  const mobileSettingsFixedCoverBackground = profilePreviewCover ? `url(${profilePreviewCover}) center top/cover no-repeat` : `radial-gradient(circle at 15% 20%,rgba(255,255,255,.34),transparent 30%),radial-gradient(circle at 82% 12%,rgba(255,255,255,.22),transparent 24%),linear-gradient(135deg,${normalizedProfileAccent} 0%,#7c8cff 48%,#ff7eb3 100%)`;
  const [mobileSettingsScrollTop, setMobileSettingsScrollTop] = useState(0);
  const mobileSettingsStatusSurfaceOpacity = Math.min(1, Math.max(0, (mobileSettingsScrollTop - 206) / 42));
  const mobileSettingsStatusSurfaceStyle: CSSProperties = { opacity: mobileSettingsStatusSurfaceOpacity };
  const mobileAccountCoverShift = Math.min(1, Math.max(0, (mobileSettingsScrollTop - 148) / 160)) * 104;
  const mobileAccountTitleOpacity = Math.min(1, Math.max(0, (mobileSettingsScrollTop - 84) / 64));
  const mobileAccountHeaderOnSurface = mobileSettingsStatusSurfaceOpacity > 0.56;
  const mobileAccountNavClass = resolvedThemeMode === 'dark' ? 'text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,.36)] active:bg-white/10' : mobileAccountHeaderOnSurface ? 'text-[rgba(17,24,39,.92)] [text-shadow:0_1px_8px_rgba(255,255,255,.22)] active:bg-slate-900/10' : 'text-white/95 [text-shadow:0_1px_8px_rgba(0,0,0,.28)] active:bg-white/15';
  const mobileAccountCoverStyle: CSSProperties = { background: mobileSettingsFixedCoverBackground, height: 'calc(320px + max(44px, env(safe-area-inset-top)))', transform: `translate3d(0, ${mobileAccountCoverShift}px, 0)` };
  const profileStats = profileStatsQuery.data ?? { post_count: 0, like_count: 0, comment_count: 0 };
  const previewUser: User = { ...user, nickname: nickname || user.nickname, avatar_url: avatarUrl || user.avatar_url, bio, profile_title: profileTitle, profile_tagline: profileTagline, profile_status: profileStatus, profile_location: profileLocation, profile_interests: profileInterests, profile_layout: profileLayout, profile_card_style: profileCardStyle, profile_accent_color: profileAccentColor, profile_cover_url: profileCoverUrl };

  const mobileSecondaryRouteTransitionStyle: CSSProperties | undefined = isMobile ? { viewTransitionName: 'kc-mobile-route' } : undefined;

  if (isMobile && mobileSelfProfileOpen) {
    const mobileSelfProfileNode = <MobileUserProfilePage user={previewUser} currentUserId={user.id} currentUser={previewUser} transitionStyle={mobileSecondaryRouteTransitionStyle} onClose={() => runNativeRouteTransition('secondary-back', closeMobileSelfProfile, isMobile)} />;
    return createPortal(mobileSelfProfileNode, getKukePortalRoot(), 'mobile-self-profile-page');
  }

  if (isMobile) {
    const openMobileSettingsPage = (page: Exclude<MobileSettingsPage, null>): void => {
      runNativeRouteTransition('secondary-forward', () => {
        onMobileDetailActiveChange?.(true);
        setMobileSettingsScrollTop(0);
        if (page !== 'mobileMenu') {
          setActiveTab(page);
        }
        setMobileSettingsPage(page);
      }, isMobile);
    };
    const normalizedSettingsSearch = settingsSearchQuery.trim().toLocaleLowerCase();
    const settingMatches = (...values: string[]): boolean => !normalizedSettingsSearch || values.some((value) => value.toLocaleLowerCase().includes(normalizedSettingsSearch));
    const showAccountSettings = settingMatches('账号资料', '昵称、简介、头像', 'account profile avatar bio');
    const showCcwSettings = settingMatches('CCW 账号', user.ccw_student_oid ? `已绑定 ${user.ccw_name || 'CCW'}` : '绑定与同步资料', 'ccw account bind sync');
    const showAppearanceSettings = settingMatches('通用外观', `${themeModeLabel(themeMode)} · 字体${fontScaleLabel(uiFontScale)}`, '主题 显示 字体 通知 音效 appearance theme font');
    const showReportsSettings = settingMatches('举报中心', '进度与处理结果', 'reports report moderation');
    const showMobileMenuSettings = settingMatches('空间菜单', '底栏图标 空间入口 排序', 'mobile menu nav order space');
    const showAboutSettings = settingMatches('关于 KukeChat', `v${APP_VERSION}`, 'about version 版本');
    const showSupportSettings = settingMatches('赞助支持', '爱发电与作品投币', 'support afdian sponsor');
    const showDeveloperSettings = settingMatches('开发者', APP_DEVELOPER, 'developer author');
    const hasSettingsSearchResults = showAccountSettings || showCcwSettings || showAppearanceSettings || showReportsSettings || showMobileMenuSettings || showAboutSettings || showSupportSettings || showDeveloperSettings;

    if (mobileSettingsPage) {
      const title = mobileSettingsPage === 'mobileMenu' ? '空间菜单' : settingsTabs.find((item) => item.tab === mobileSettingsPage)?.label ?? '设置';
      const mobileSettingsPageNode = (
        <section data-theme={resolvedThemeMode} data-layout="mobile" data-font-scale={uiFontScale} className={mobileSettingsPage === 'account' ? 'kc-qq-page kc-mobile-profile-page kc-mobile-account-profile-page fixed inset-0 z-[2147483646] flex min-h-0 w-screen max-w-[100vw] flex-col overflow-hidden [background:var(--kc-mobile-bg,#f1f3f8)] [color:var(--kc-text)]' : 'kc-qq-page relative h-full min-h-0 overflow-hidden'} style={mobileSecondaryRouteTransitionStyle}>
          {mobileSettingsPage === 'account' ? <div className="kc-mobile-profile-fixed-cover fixed inset-x-0 top-0" style={mobileAccountCoverStyle} aria-hidden="true" /> : null}
          {mobileSettingsPage === 'account' ? <div className="kc-mobile-profile-scroll-status-surface fixed inset-x-0 top-0" style={mobileSettingsStatusSurfaceStyle} aria-hidden="true" /> : null}
          {mobileSettingsPage !== 'account' ? <MobileStatusBar /> : null}
          {mobileSettingsPage === 'account' ? (
            <header className="kc-mobile-profile-cover-header flex min-h-[calc(max(44px,env(safe-area-inset-top))+58px)] shrink-0 items-end justify-between gap-3 px-4 pb-3 pt-[max(44px,env(safe-area-inset-top))]">
              <button type="button" onClick={() => runNativeRouteTransition('secondary-back', () => closeMobileSettingsPage(), isMobile)} className={`kc-mobile-profile-cover-button grid h-10 w-10 shrink-0 place-items-center rounded-full ${mobileAccountNavClass}`} aria-label="返回设置"><Icon name="chevronLeft" className="h-6 w-6" /></button>
              <h1 className={`kc-mobile-profile-cover-title min-w-0 flex-1 truncate text-center text-[18px] font-black ${mobileAccountNavClass}`} style={{ opacity: mobileAccountTitleOpacity }}>账号资料</h1>
              <span className="h-10 w-10 shrink-0" />
            </header>
          ) : null}
          <div key={mobileSettingsPage === 'account' ? `account-scroll-${mobileAccountScrollResetKey}` : mobileSettingsPage} className={`kc-qq-scroll scroll-soft relative overflow-y-auto px-4 pb-6 ${mobileSettingsPage === 'account' ? 'kc-mobile-profile-scroll kc-mobile-account-profile-scroll min-h-0 flex-1 bg-transparent pt-[clamp(120px,25vh,190px)]' : 'h-[calc(100%-30px)]'}`} onScroll={mobileSettingsPage === 'account' ? (event) => setMobileSettingsScrollTop(event.currentTarget.scrollTop) : undefined}>
            {mobileSettingsPage !== 'account' ? <header className="kc-qq-nav-header">
              <button type="button" onClick={() => runNativeRouteTransition('secondary-back', () => closeMobileSettingsPage(), isMobile)} className="grid h-9 w-9 place-items-center rounded-full [color:var(--kc-text)] active:[background:var(--kc-hover)]" aria-label="返回设置"><Icon name="chevronLeft" className="h-6 w-6" /></button>
              <h1 className="text-[18px] font-bold [color:var(--kc-text)]">{title}</h1>
              <span className="h-9 w-9" />
            </header> : null}

            {mobileSettingsPage === 'account' ? (
              <form id="mobile-account-profile-form" onSubmit={submit} className="relative mt-3 grid gap-4">
                <button type="button" onClick={() => runNativeRouteTransition('secondary-forward', () => { onMobileDetailActiveChange?.(true); setMobileSelfProfileOpen(true); }, isMobile)} className="relative min-h-[214px] overflow-visible rounded-[30px] p-0 text-left text-[#111827]">
                  <div className="relative flex min-h-[214px] items-end px-3 pb-3 pt-12">
                    <MobileProfileSummaryCard user={previewUser} name={nickname || getDisplayName(user)} handle={`@${user.username}`} userId={user.id} bio={bio || '点击进入自己的个人主页预览。'} statusLabel={presenceLabel(presenceStatus, presenceText, true)} online stats={profileStats} profileCardStyle={profileCardStyle} />
                  </div>
                </button>

                <section className="kc-qq-card grid gap-3 p-4">
                  <p className="kc-qq-section-title">资料编辑</p>
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={chooseAvatar} className="hidden" />
                  <input ref={coverInputRef} type="file" accept="image/*" onChange={chooseProfileCover} className="hidden" />
                  <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarMutation.isPending} className="flex items-center gap-3 rounded-[22px] bg-[#f6f8fc] px-4 py-3.5 text-left disabled:opacity-50">
                    <span className="grid h-10 w-10 place-items-center rounded-[16px] bg-[#e8f4ff] text-[#168bff]"><Icon name="upload" className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-[#111827]">更换头像</span><span className="mt-0.5 block text-[12px] text-[#8b95a5]">{avatarMutation.isPending ? '上传中...' : '支持图片格式上传'}</span></span>
                    <Icon name="chevron" className="h-4 w-4 text-[#c3c8d1]" />
                  </button>
                  <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverMutation.isPending} className="flex items-center gap-3 rounded-[22px] bg-[#f6f8fc] px-4 py-3.5 text-left disabled:opacity-50">
                    <span className="grid h-10 w-10 place-items-center rounded-[16px] bg-[#fff3d6] text-[#f59e0b]"><Icon name="image" className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-[#111827]">主页背景图</span><span className="mt-0.5 block text-[12px] text-[#8b95a5]">{coverMutation.isPending ? '上传中...' : '同步到自己的个人主页封面'}</span></span>
                    <Icon name="chevron" className="h-4 w-4 text-[#c3c8d1]" />
                  </button>
                  <label className="grid gap-2">
                    <span className="text-[13px] font-bold text-[#526070]">昵称</span>
                    <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="kc-qq-input" placeholder="昵称" />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-[13px] font-bold text-[#526070]">简介</span>
                    <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} className="kc-qq-input scroll-soft resize-none" placeholder="咕咕咕~" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-2"><span className="text-[13px] font-bold text-[#526070]">主页标题</span><input value={profileTitle} onChange={(event) => setProfileTitle(event.target.value)} className="kc-qq-input" placeholder="我的空间" /></label>
                    <label className="grid gap-2"><span className="text-[13px] font-bold text-[#526070]">当前状态</span><input value={profileStatus} onChange={(event) => setProfileStatus(event.target.value)} className="kc-qq-input" placeholder="今天在线" /></label>
                  </div>
                  <label className="grid gap-2"><span className="text-[13px] font-bold text-[#526070]">主页标签</span><input value={profileTagline} onChange={(event) => setProfileTagline(event.target.value)} className="kc-qq-input" placeholder="一句话介绍自己" /></label>
                  <label className="grid gap-2"><span className="text-[13px] font-bold text-[#526070]">所在地</span><input value={profileLocation} onChange={(event) => setProfileLocation(event.target.value)} className="kc-qq-input" placeholder="可选" /></label>
                  <InterestTagManager value={profileInterests} onChange={setProfileInterests} compact />
                  <section className="grid gap-3 rounded-[24px] bg-[#f6f8fc] p-3">
                    <div>
                      <h3 className="text-[15px] font-black text-[#111827]">视觉系统</h3>
                      <p className="mt-1 text-[12px] font-medium text-[#8b95a5]">手机版可保存全部选项，页面宽度效果请在电脑端个人主页查看。</p>
                    </div>
                    <div className="grid gap-2">
                      <span className="text-[13px] font-bold text-[#526070]">页面宽度</span>
                      <div className="grid grid-cols-3 gap-2">
                        {profileLayoutOptions.map((option) => {
                          const active = profileLayout === option.value;
                          return <button key={option.value} type="button" onClick={() => setProfileLayout(option.value)} className={`rounded-[18px] px-2 py-3 text-center text-[12px] font-black ${active ? 'text-white shadow-[0_10px_24px_rgba(22,139,255,.2)]' : 'bg-white text-[#526070]'}`} style={active ? { background: normalizedProfileAccent } : undefined}>{option.label}</button>;
                        })}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <span className="text-[13px] font-bold text-[#526070]">卡片风格</span>
                      <div className="grid gap-2">
                        {profileCardStyleOptions.map((option) => {
                          const active = profileCardStyle === option.value;
                          return <button key={option.value} type="button" onClick={() => setProfileCardStyle(option.value)} className={`rounded-[18px] px-3 py-3 text-left ${active ? 'bg-[#111827] text-white shadow-[0_10px_24px_rgba(17,24,39,.18)]' : 'bg-white text-[#111827]'}`}><span className="block text-[13px] font-black">{option.label}</span><span className="mt-1 block text-[11px] font-bold opacity-70">{option.detail}</span></button>;
                        })}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <span className="text-[13px] font-bold text-[#526070]">主页强调色</span>
                      <p className="text-[12px] font-medium text-[#8b95a5]">用于兴趣标签、资料按钮和个人主页重点色。</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {profileAccentPresets.map((color) => <button key={color} type="button" onClick={() => setProfileAccentColor(color)} className={`grid h-9 w-9 place-items-center rounded-full border-2 ${profileAccentColor === color ? 'border-white shadow-[0_0_0_3px_rgba(22,139,255,.22)]' : 'border-transparent'}`} style={{ background: color }}>{profileAccentColor === color ? <Icon name="check" className="h-4 w-4 text-white" /> : null}</button>)}
                        <input type="color" value={normalizedProfileAccent} onChange={(event) => setProfileAccentColor(event.target.value)} className="h-9 w-14 rounded-full border-0 bg-white px-1 py-1" aria-label="自定义主页强调色" />
                      </div>
                    </div>
                  </section>
                </section>

                {renderPresenceSettings(true)}

                <section className="kc-qq-card grid gap-3 p-4">
                  <p className="kc-qq-section-title">操作</p>
                  {avatarMutation.error ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">头像上传失败，请稍后重试。</p> : null}
                  {coverMutation.error ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">主页背景上传失败，请稍后重试。</p> : null}
                  {profileMutation.error ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">保存失败，请稍后重试。</p> : null}
                  {profileMutation.isSuccess ? <p className="rounded-[18px] bg-blue-50 px-4 py-3 text-[13px] text-[#168bff]">资料已保存。</p> : null}
                  <button type="submit" disabled={profileMutation.isPending} className="kc-qq-primary-button disabled:opacity-50">保存资料</button>
                  {onLogout ? (
                    <button type="button" onClick={onLogout} className="flex items-center justify-center gap-2 rounded-[18px] bg-red-50 px-4 py-3.5 text-[15px] font-bold text-red-500">
                      <Icon name="logout" className="h-4 w-4" /> 退出登录
                    </button>
                  ) : null}
                  <button type="button" onClick={shareMyProfile} className="rounded-[18px] bg-[#f6f8fc] px-4 py-4 text-[15px] font-semibold text-[#168bff]">{profileInviteCopied ? '已复制分享链接' : '分享个人主页'}</button>
                  {profileInviteError ? <p className="rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">{profileInviteError}</p> : null}
                </section>
              </form>
            ) : null}

            {mobileSettingsPage === 'ccw' ? (
              <div className="mt-3 grid gap-4">
                {renderCcwSettings(true)}
              </div>
            ) : null}

            {mobileSettingsPage === 'mobileMenu' ? (
              <div className="mt-3 grid gap-4">
                <section className="kc-qq-card grid gap-2 p-4">
                  <p className="kc-qq-section-title">排序规则</p>
                  <p className="text-[13px] font-semibold leading-6 [color:var(--kc-muted)]">聊天和空间固定在底栏。下面列表的前两个会作为底部菜单按钮，剩余功能会显示在空间页的二级入口里。</p>
                </section>
                <section ref={mobileFeatureListRef} className="grid gap-2">
                  {normalizeMobileFeatureOrder(mobileFeatureOrder).map((featureId, index) => {
                    const feature = getMobileFeatureDefinition(featureId);
                    const inBottom = getMobileBottomFeatureIds(mobileFeatureOrder).includes(featureId);
                    return (
                      <div key={featureId} data-mobile-feature-id={featureId} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverMobileFeatureId(featureId); }} onDragEnter={() => setDragOverMobileFeatureId(featureId)} onDragLeave={() => setDragOverMobileFeatureId((current) => current === featureId ? null : current)} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData('text/plain') as MobileSortableFeatureId; setDraggingMobileFeatureId(null); setDragOverMobileFeatureId(null); moveMobileFeatureTo(source, featureId); }} className={`kc-mobile-feature-sort-item kc-qq-card flex items-center gap-3 p-3 ${draggingMobileFeatureId === featureId ? 'kc-mobile-feature-sort-dragging' : ''} ${dragOverMobileFeatureId === featureId && draggingMobileFeatureId !== featureId ? 'kc-mobile-feature-sort-over' : ''}`}>
                        <span draggable onDragStart={(event) => { setDraggingMobileFeatureId(featureId); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', featureId); }} onDragEnd={() => { setDraggingMobileFeatureId(null); setDragOverMobileFeatureId(null); }} onTouchStart={() => setDraggingMobileFeatureId(featureId)} onTouchMove={handleMobileFeatureTouchMove} onTouchEnd={(event) => handleMobileFeatureTouchEnd(event, featureId)} className="kc-mobile-feature-drag-handle grid h-10 w-8 shrink-0 place-items-center rounded-full [color:var(--kc-muted)] active:[background:var(--kc-hover)]" role="button" aria-label={`拖拽排序 ${feature.label}`}>
                          <Icon name="menu" className="h-4 w-4" />
                        </span>
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[18px] ${inBottom ? 'text-white [background:var(--kc-accent)]' : '[background:var(--kc-accent-soft)] [color:var(--kc-accent)]'}`}><Icon name={feature.icon} className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-[15px] font-black [color:var(--kc-text)]">{index + 1}. {feature.label}</span><span className="mt-0.5 block truncate text-[12px] [color:var(--kc-muted)]">{inBottom ? '底部菜单按钮' : '空间页二级入口'} · 长按拖到目标项排序</span></span>
                      </div>
                    );
                  })}
                </section>
              </div>
            ) : null}

            {mobileSettingsPage === 'appearance' ? (
              <div className="mt-3 grid gap-4">
                <section className="rounded-[30px] bg-[#111827] p-5 text-white shadow-[0_18px_38px_rgba(15,23,42,0.18)]">
                  <span className="grid h-14 w-14 place-items-center rounded-[22px] bg-white/12 text-white"><Icon name={themeMode === 'system' ? 'device' : resolvedThemeMode === 'light' ? 'sun' : 'moon'} className="h-7 w-7" /></span>
                  <h2 className="mt-4 text-[24px] font-black">通用外观</h2>
                  <p className="mt-2 text-[13px] leading-6 text-white/72">主题、字体大小、系统通知和提示音都会在这里集中管理。</p>
                </section>
                <section className="kc-qq-card p-4">
                  <p className="kc-qq-section-title">主题模式</p>
                  <div className="mt-3 grid gap-2">
                    {themeOptions.map(({ mode, label, detail, icon }) => (
                      <button key={mode} type="button" onClick={() => setThemeMode(mode)} className="kc-qq-settings-row rounded-[18px] [background:var(--kc-panel-muted)]">
                        <span className="kc-qq-settings-icon"><Icon name={icon} className="h-5 w-5" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold [color:var(--kc-text)]">{label}</span><span className="mt-0.5 block truncate text-[12px] [color:var(--kc-muted)]">{detail}</span></span>
                        {themeMode === mode ? <Icon name="check" className="h-5 w-5 [color:var(--kc-accent)]" /> : null}
                      </button>
                    ))}
                  </div>
                </section>
                <FontSizeControl value={uiFontScale} onChange={setUiFontScale} compact />
                <section className="kc-qq-card p-0">
                  <MobileSwitchRow icon="bell" label={systemNotificationLabel} detail={notificationPermissionLabel} checked={browserNotificationMode === 'on'} onClick={() => void updateBrowserNotifications(browserNotificationMode === 'on' ? 'off' : 'on')} />
                  <MobileSwitchRow icon="volume" label="消息提示音效" detail="普通消息、@ 提醒和成员进出提示" checked={soundNotificationMode === 'on'} onClick={() => setSoundNotificationMode(soundNotificationMode === 'on' ? 'off' : 'on')} />
                  {isDesktopApp ? <MobileSwitchRow icon="device" label="开机自启动" detail={desktopAutostartLabel} checked={desktopAutostartEnabled} onClick={() => desktopAutostartMutation.mutate(!desktopAutostartEnabled)} /> : null}
                </section>
              </div>
            ) : null}

            {mobileSettingsPage === 'reports' ? (
              <div className="mt-3 grid gap-4">
                <section className="kc-mobile-settings-hero rounded-[30px] bg-[linear-gradient(135deg,#fff7ed,#ffe6c7)] p-5 shadow-[0_12px_30px_rgba(249,115,22,0.12)]">
                  <span className="grid h-14 w-14 place-items-center rounded-[22px] bg-white/70 text-orange-500"><Icon name="flag" className="h-7 w-7" /></span>
                  <h2 className="mt-4 text-[24px] font-black text-[#111827]">举报中心</h2>
                  <p className="mt-2 text-[13px] leading-6 text-[#7c5d3a]">查看提交记录、处理进度和管理员备注。</p>
                </section>
                <ReportCenter reports={reportsQuery.data ?? []} loading={reportsQuery.isLoading} error={reportsQuery.error} onRefresh={() => void reportsQuery.refetch()} />
              </div>
            ) : null}

            {mobileSettingsPage === 'about' ? (
              <div className="mt-3 grid gap-4">
                <section className="kc-mobile-settings-hero rounded-[30px] bg-[linear-gradient(135deg,#edf6ff,#ffffff)] p-5 shadow-[0_12px_30px_rgba(22,139,255,0.12)]">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#168bff]">About KukeChat</p>
                  <h2 className="mt-3 text-[26px] font-black text-[#111827]">关于 KukeChat</h2>
                  <p className="mt-3 text-[14px] leading-7 text-[#526070]">{APP_NAME} 想为 Scratcher 提供一个可以实时沟通、交流想法、分享日常、认识同好的地方。</p>
                </section>
                <section className="kc-qq-card overflow-hidden p-0">
                  {isMobileUpdateSupported() ? (
                    <button type="button" onClick={() => requestMobileUpdateCheck()} className="kc-qq-settings-row w-full text-left">
                      <span className="kc-qq-settings-icon"><Icon name="sparkles" className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-[#111827]">检查更新</span><span className="mt-0.5 block text-[12px] text-[#9aa3af]">当前版本 v{MOBILE_APP_VERSION}</span></span>
                      <Icon name="chevron" className="h-4 w-4 text-[#c3c8d1]" />
                    </button>
                  ) : (
                    <div className="kc-qq-settings-row">
                      <span className="kc-qq-settings-icon"><Icon name="sparkles" className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-[#111827]">版本号</span><span className="mt-0.5 block text-[12px] text-[#9aa3af]">v{APP_VERSION}</span></span>
                    </div>
                  )}
                  {APP_DEVELOPERS.map((developer) => (
                    <a key={developer.profileUrl} href={developer.profileUrl} target="_blank" rel="noreferrer" className="kc-qq-settings-row">
                      <span className="kc-qq-settings-icon"><Icon name="profile" className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold text-[#111827]">开发者</span><span className="mt-0.5 block text-[12px] text-[#9aa3af]">{developer.name}</span></span>
                      <Icon name="chevron" className="h-4 w-4 text-[#c3c8d1]" />
                    </a>
                  ))}
                </section>
                <section className="kc-qq-card grid gap-3 p-4">
                  <p className="kc-qq-section-title">项目愿景</p>
                  <div className="rounded-[22px] bg-[#f6f8fc] p-4"><p className="text-[15px] font-bold text-[#111827]">Made For Scratchers</p><p className="mt-2 text-[13px] leading-6 text-[#526070]">实时聊天、群聊交流、交友互动、创作讨论，都应该有一个更方便开始的地方。</p></div>
                </section>
              </div>
            ) : null}

            {mobileSettingsPage === 'support' ? (
              <div className="mt-3 grid gap-4">
                <section className="kc-mobile-settings-hero rounded-[30px] bg-[linear-gradient(135deg,#ffedd5,#fff7ed)] p-5 shadow-[0_14px_34px_rgba(249,115,22,0.16)]">
                  <span className="grid h-14 w-14 place-items-center rounded-[22px] bg-white/70 text-orange-500"><Icon name="star" className="h-7 w-7" /></span>
                  <h2 className="mt-4 text-[26px] font-black text-[#111827]">赞助支持</h2>
                  <p className="mt-3 text-[14px] leading-7 text-orange-900/75">如果你喜欢 {APP_NAME}，可以通过爱发电或 CCW 作品页支持项目继续维护。</p>
                </section>
                <section className="kc-qq-card grid gap-3 p-4">
                  <p className="kc-qq-section-title">支持方式</p>
                  {SPONSOR_URL ? (
                    <a href={SPONSOR_URL} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[22px] bg-[#fff4e8] px-4 py-4 text-left text-orange-700">
                      <span className="grid h-11 w-11 place-items-center rounded-[17px] bg-white/80"><Icon name="star" className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold">爱发电赞助</span><span className="mt-1 block text-[12px] text-orange-900/65">支持开发、维护和长期更新</span></span>
                      <Icon name="chevron" className="h-4 w-4" />
                    </a>
                  ) : null}
                  <a href={CCW_SUPPORT_URL} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[22px] bg-[#f6f8fc] px-4 py-4 text-left text-[#168bff]">
                    <span className="grid h-11 w-11 place-items-center rounded-[17px] bg-white"><Icon name="sparkles" className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold text-[#111827]">作品页投币支持</span><span className="mt-1 block text-[12px] text-[#8b95a5]">不方便赞助时也可以投币鼓励</span></span>
                    <Icon name="chevron" className="h-4 w-4" />
                  </a>
                </section>
              </div>
            ) : null}
          </div>
          {mobileSettingsPage === 'account' ? (
            <footer className="kc-mobile-profile-action-footer shrink-0 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
              <div className="grid grid-cols-[0.86fr_1.14fr] gap-3">
                <button type="button" onClick={() => runNativeRouteTransition('secondary-back', () => closeMobileSettingsPage(true), isMobile)} className="h-12 rounded-[18px] text-[16px] font-black shadow-sm active:scale-[0.99] [background:var(--kc-mobile-card,#fff)] [color:var(--kc-mobile-muted,#526070)]">取消</button>
                <button type="submit" form="mobile-account-profile-form" disabled={profileMutation.isPending} className="h-12 rounded-[18px] text-[16px] font-black text-white shadow-[0_12px_28px_rgba(22,139,255,.26)] active:scale-[0.99] disabled:opacity-50 [background:var(--kc-accent,#168bff)]">{profileMutation.isPending ? '保存中' : '保存资料'}</button>
              </div>
            </footer>
          ) : null}
        </section>
      );
      return mobileSettingsPage === 'account' ? createPortal(mobileSettingsPageNode, getKukePortalRoot(), 'mobile-account-settings-page') : mobileSettingsPageNode;
    }

    return (
      <section className="kc-qq-page kc-mobile-settings-home relative h-full min-h-0 overflow-hidden">
        <div className="kc-mobile-settings-fixed-cover fixed inset-x-0 top-0" style={{ background: mobileSettingsFixedCoverBackground }} aria-hidden="true" />
        <div className="kc-mobile-settings-scroll-status-surface fixed inset-x-0 top-0" style={mobileSettingsStatusSurfaceStyle} aria-hidden="true" />
        <div className="kc-qq-scroll kc-mobile-settings-scroll scroll-soft relative h-full overflow-y-auto pb-6" onScroll={(event) => setMobileSettingsScrollTop(event.currentTarget.scrollTop)}>
          <div className="kc-mobile-settings-cover-gradient relative min-h-[244px] overflow-hidden px-4 pb-6 pt-[calc(max(44px,env(safe-area-inset-top))+14px)] text-white">
            <div className="relative flex items-center justify-between">
              <button type="button" onClick={() => {
                requestNativeBack();
              }} className="grid h-10 w-10 place-items-center rounded-full bg-black/18 text-white backdrop-blur" aria-label="返回上一页"><Icon name="chevronLeft" className="h-6 w-6" /></button>
              <button type="button" onClick={shareMyProfile} className="grid h-10 w-10 place-items-center rounded-full bg-black/18 text-white backdrop-blur" aria-label="分享个人主页"><Icon name="copy" className="h-5 w-5" /></button>
            </div>
          </div>

          <div className="kc-mobile-settings-content-surface relative -mt-[34px] px-4">
            <section className="kc-mobile-settings-profile-card p-0 shadow-[0_20px_46px_rgba(15,23,42,0.16)]">
              <button type="button" onClick={() => runNativeRouteTransition('secondary-forward', () => setMobileSelfProfileOpen(true), isMobile)} className="block w-full p-4 text-left">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 rounded-[24px] bg-white p-1 shadow-[0_8px_24px_rgba(15,23,42,0.14)] [&>*]:h-20 [&>*]:w-20 [&>*]:text-2xl"><Avatar user={previewUser} size="lg" /></span>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <h2 className="truncate text-[22px] font-black leading-tight text-[#111827]">{nickname || getDisplayName(user)}</h2>
                        <p className="mt-1 truncate text-[13px] font-semibold text-[#8b95a5]">@{user.username} · ID {user.id}</p>
                      </span>
                      <Icon name="chevron" className="mt-1 h-4 w-4 shrink-0 text-[#c3c8d1]" />
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#526070]">{bio || '填写简介后，它会显示在资料卡片和个人主页中。'}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <span className="rounded-[18px] bg-[#f6f8fc] px-3 py-2"><span className="block text-[11px] font-bold text-[#8b95a5]">主页标题</span><span className="mt-0.5 block truncate text-[13px] font-black text-[#111827]">{profileTitle || '我的空间'}</span></span>
                  <span className="rounded-[18px] bg-[#f6f8fc] px-3 py-2"><span className="block text-[11px] font-bold text-[#8b95a5]">状态</span><span className="mt-0.5 block truncate text-[13px] font-black text-[#111827]">{profileStatus || presenceLabel(presenceStatus, presenceText, true)}</span></span>
                </div>
              </button>
              <div className="grid grid-cols-2 overflow-hidden rounded-b-[30px] border-t border-black/[0.04]">
                <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarMutation.isPending} className="px-4 py-3 text-[13px] font-black text-[#168bff] disabled:opacity-50">{avatarMutation.isPending ? '上传中...' : '更换头像'}</button>
                <button type="button" onClick={() => openMobileSettingsPage('account')} className="border-l border-black/[0.04] px-4 py-3 text-[13px] font-black text-[#168bff]">编辑资料</button>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={chooseAvatar} className="hidden" />
            </section>
          </div>

          <div className="kc-mobile-settings-list-surface px-4">
            <label className="kc-qq-search-pill mt-4">
              <Icon name="search" className="h-5 w-5 shrink-0 text-[#a4adba]" />
              <input value={settingsSearchQuery} onChange={(event) => setSettingsSearchQuery(event.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium outline-none text-[#111827] placeholder:text-[#a4adba]" placeholder="搜索设置项" />
            </label>

            {showAccountSettings || showAppearanceSettings || showReportsSettings || showCcwSettings || showMobileMenuSettings ? (
              <section className="mt-5">
                <p className="kc-qq-section-title">功能</p>
                <div className="kc-qq-card overflow-hidden p-0">
                  {showAccountSettings ? <MobileSettingsRow icon="profile" label="账号资料" detail="昵称、简介、头像" active={activeTab === 'account'} onClick={() => openMobileSettingsPage('account')} /> : null}
                  {showCcwSettings ? <MobileSettingsRow icon="ccw" label="CCW 账号" detail={user.ccw_student_oid ? `已绑定 ${user.ccw_name || 'CCW'}` : '绑定与同步资料'} active={activeTab === 'ccw'} onClick={() => openMobileSettingsPage('ccw')} /> : null}
                  {showMobileMenuSettings ? <MobileSettingsRow icon="mobileMode" label="空间菜单" detail="底栏图标与空间入口排序" active={mobileSettingsPage === 'mobileMenu'} onClick={() => openMobileSettingsPage('mobileMenu')} /> : null}
                  {showAppearanceSettings ? <MobileSettingsRow icon="settings" label="通用外观" detail={`${themeModeLabel(themeMode)} · 字体${fontScaleLabel(uiFontScale)}`} active={activeTab === 'appearance'} onClick={() => openMobileSettingsPage('appearance')} /> : null}
                  {showReportsSettings ? <MobileSettingsRow icon="flag" label="举报中心" detail="进度与处理结果" active={activeTab === 'reports'} onClick={() => openMobileSettingsPage('reports')} /> : null}
                </div>
              </section>
            ) : null}

            {showAboutSettings || showSupportSettings || showDeveloperSettings ? (
              <section className="mt-5">
                <p className="kc-qq-section-title">about</p>
                <div className="kc-qq-card overflow-hidden p-0">
                  {showAboutSettings ? <MobileSettingsRow icon="sparkles" label="关于 KukeChat" detail={`v${APP_VERSION}`} active={activeTab === 'about'} onClick={() => openMobileSettingsPage('about')} /> : null}
                  {showSupportSettings ? <MobileSettingsRow icon="star" label="赞助支持" detail="爱发电与作品投币" active={activeTab === 'support'} onClick={() => openMobileSettingsPage('support')} /> : null}
                  {showDeveloperSettings ? <MobileSettingsRow icon="profile" label="开发者" detail={APP_DEVELOPER} active={activeTab === 'about'} onClick={() => openMobileSettingsPage('about')} /> : null}
                </div>
              </section>
            ) : null}

            {!hasSettingsSearchResults ? <section className="kc-qq-card mt-5 grid place-items-center gap-2 px-5 py-8 text-center"><Icon name="search" className="h-7 w-7 text-[#a4adba]" /><p className="text-[15px] font-black text-[#111827]">没有找到设置项</p><p className="text-[12px] font-medium text-[#8b95a5]">换个关键词再试试。</p></section> : null}

            <button type="button" onClick={shareMyProfile} className="mt-4 w-full rounded-[18px] bg-white px-4 py-4 text-[15px] font-semibold text-[#168bff] shadow-[0_1px_0_rgba(15,23,42,0.04)]">{profileInviteCopied ? '已复制分享链接' : '分享个人主页'}</button>
            {profileInviteError ? <p className="mt-3 rounded-[18px] bg-red-50 px-4 py-3 text-[13px] text-red-500">{profileInviteError}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="kc-mobile-split kc-pc-page-shell grid h-full min-h-0 grid-cols-[232px_minmax(0,1fr)] items-stretch overflow-hidden [background:var(--kc-chat)] [color:var(--kc-text)] max-md:grid-cols-1 max-md:overflow-y-auto">
      <aside className="kc-mobile-sidebar kc-pc-page-sidebar h-full min-h-0 self-stretch border-r px-3 py-4 [background:var(--kc-list)] [border-color:var(--kc-border)] max-md:h-auto max-md:border-b max-md:border-r-0">
        <div className="mb-5 flex items-center gap-3 px-2">
          <Avatar user={{ ...user, avatar_url: avatarUrl || user.avatar_url, nickname: nickname || user.nickname }} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">设置</h3>
            <p className="truncate text-xs [color:var(--kc-muted)]">{getDisplayName(user)}</p>
          </div>
        </div>
        <nav className="grid gap-1">
          {settingsTabs.map((item) => (
            <button key={item.tab} type="button" onClick={() => setActiveTab(item.tab)} className={`kc-pc-nav-row flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${activeTab === item.tab ? 'kc-pc-nav-row-active [background:var(--kc-active)] [color:var(--kc-text)]' : '[color:var(--kc-muted)] hover:[background:var(--kc-hover)] hover:[color:var(--kc-text)]'}`}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                <Icon name={item.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-0.5 block truncate text-xs [color:var(--kc-muted)]">{item.detail}</span>
              </span>
              <Icon name="chevron" className="h-4 w-4" />
            </button>
          ))}
        </nav>
      </aside>

      <main className="kc-mobile-content kc-pc-page-main scroll-soft min-h-0 overflow-y-auto p-4 sm:p-6">
        {activeTab === 'account' ? (
          <form key="settings-account" onSubmit={submit} className="kc-pc-tab-content kc-pc-stagger mx-auto grid max-w-4xl gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <section className="glass-panel kc-pc-card-motion rounded-[30px] p-5">
              <div className="relative overflow-hidden rounded-[24px] p-4 text-white" style={{ background: profileCoverBackground }}>
                <Avatar user={previewUser} size="lg" />
                <h3 className="mt-4 text-2xl font-semibold">{nickname || getDisplayName(user)}</h3>
                <p className="mt-1 text-sm text-white/78">@{user.username}</p>
              </div>
              <p className="mt-3 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold [background:var(--kc-panel-muted)] [border-color:var(--kc-border)] [color:var(--kc-muted)]">ID {user.id}</p>
              <p className="mt-4 min-h-12 text-sm leading-6 [color:var(--kc-muted)]">{bio || '填写简介后，它会显示在资料卡片和个人主页中。'}</p>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={chooseAvatar} className="hidden" />
              <input ref={coverInputRef} type="file" accept="image/*" onChange={chooseProfileCover} className="hidden" />
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarMutation.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                <Icon name="upload" className="h-4 w-4" />
                {avatarMutation.isPending ? '上传中...' : '上传头像'}
              </button>
              <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverMutation.isPending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition [border-color:var(--kc-border)] [color:var(--kc-text)] hover:[background:var(--kc-hover)] disabled:cursor-not-allowed disabled:opacity-50">
                <Icon name="image" className="h-4 w-4" />
                {coverMutation.isPending ? '上传中...' : '主页背景图'}
              </button>
              <button type="button" onClick={shareMyProfile} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition [border-color:var(--kc-border)] [color:var(--kc-accent)] hover:[background:var(--kc-hover)]">
                <Icon name="copy" className="h-4 w-4" />
                {profileInviteCopied ? '已复制分享链接' : '分享个人主页'}
              </button>
              {profileInviteError ? <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">{profileInviteError}</p> : null}
              {avatarMutation.error ? <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">头像上传失败，请稍后重试。</p> : null}
              {coverMutation.error ? <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">主页背景上传失败，请稍后重试。</p> : null}
              {avatarMutation.isSuccess ? <p className="glass-card-quiet mt-3 rounded-2xl p-3 text-sm [color:var(--kc-text)]">头像已上传，保存资料后生效。</p> : null}
            </section>

            <section className="glass-panel kc-pc-card-motion rounded-[30px] p-5 sm:p-6">
              <h3 className="text-2xl font-semibold">账号资料</h3>
              <p className="mt-1 text-sm [color:var(--kc-muted)]">更新你的名片信息。</p>
              <div className="mt-6 grid gap-4">
                <div className="rounded-2xl border px-4 py-3 [background:var(--kc-panel-muted)] [border-color:var(--kc-border)]">
                  <span className="block text-xs font-bold [color:var(--kc-muted)]">用户 ID</span>
                  <span className="mt-1 block font-mono text-sm font-semibold">{user.id}</span>
                </div>
                <label>
                  <span className="mb-2 block text-sm font-bold">昵称</span>
                  <input value={nickname} onChange={(event) => setNickname(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" />
                </label>
                <label>
                  <span className="mb-2 block text-sm font-bold">简介</span>
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={5} className="glass-input scroll-soft w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="咕咕咕~" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="mb-2 block text-sm font-bold">主页标题</span><input value={profileTitle} onChange={(event) => setProfileTitle(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="我的空间" /></label>
                  <label><span className="mb-2 block text-sm font-bold">主页状态</span><input value={profileStatus} onChange={(event) => setProfileStatus(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="今天在线" /></label>
                </div>
                <label><span className="mb-2 block text-sm font-bold">主页标签</span><input value={profileTagline} onChange={(event) => setProfileTagline(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="一句话介绍自己" /></label>
                <label><span className="mb-2 block text-sm font-bold">所在地</span><input value={profileLocation} onChange={(event) => setProfileLocation(event.target.value)} className="glass-input w-full rounded-2xl px-4 py-3 text-sm outline-none transition" placeholder="可选" /></label>
                <InterestTagManager value={profileInterests} onChange={setProfileInterests} />
                <div className="flex flex-wrap items-center gap-2">
                  {profileAccentPresets.map((color) => <button key={color} type="button" onClick={() => setProfileAccentColor(color)} className={`grid h-9 w-9 place-items-center rounded-full border-2 ${profileAccentColor === color ? 'border-white shadow-[0_0_0_3px_rgba(22,139,255,.22)]' : 'border-transparent'}`} style={{ background: color }}>{profileAccentColor === color ? <Icon name="check" className="h-4 w-4 text-white" /> : null}</button>)}
                  <input type="color" value={normalizedProfileAccent} onChange={(event) => setProfileAccentColor(event.target.value)} className="h-9 w-14 rounded-full border-0 bg-white px-1 py-1" aria-label="自定义主页强调色" />
                </div>
              </div>
              {profileMutation.error ? <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">保存失败，请稍后重试。</p> : null}
              {profileMutation.isSuccess ? <p className="glass-card-quiet mt-4 rounded-2xl p-3 text-sm [color:var(--kc-text)]">资料已保存。</p> : null}
              <button type="submit" disabled={profileMutation.isPending} className="liquid-button mt-6 rounded-2xl px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50">保存资料</button>
            </section>

            <section className="lg:col-span-2">
              {renderPresenceSettings()}
            </section>

            {onLogout ? (
              <section className="lg:col-span-2">
                <div className="glass-panel kc-pc-card-motion flex flex-wrap items-center justify-between gap-3 rounded-[30px] p-5">
                  <div>
                    <h4 className="text-sm font-semibold [color:var(--kc-text)]">退出登录</h4>
                    <p className="mt-1 text-xs [color:var(--kc-muted)]">退出当前账号并返回登录页。</p>
                  </div>
                  <button type="button" onClick={onLogout} className="flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold text-red-500 transition [border-color:rgba(239,68,68,0.3)] hover:bg-red-500/10">
                    <Icon name="logout" className="h-4 w-4" /> 退出登录
                  </button>
                </div>
              </section>
            ) : null}
          </form>
        ) : null}

        {activeTab === 'ccw' ? (
          <div key="settings-ccw" className="kc-pc-tab-content mx-auto max-w-4xl">
            {renderCcwSettings()}
          </div>
        ) : null}

        {activeTab === 'appearance' ? (
          <div key="settings-appearance" className="kc-pc-tab-content mx-auto max-w-4xl">
            <div className="mb-5">
              <h3 className="text-2xl font-semibold">通用外观</h3>
              <p className="mt-1 text-sm [color:var(--kc-muted)]">窗口标题栏不再放主题按钮，主题在这里统一管理。</p>
            </div>
            <section className="glass-panel kc-pc-card-motion rounded-[30px] p-5">
              <h4 className="text-sm font-semibold">主题模式</h4>
              <div className="kc-pc-stagger mt-4 grid gap-3 sm:grid-cols-3">
                {themeOptions.map(({ mode, label, detail, icon }) => (
                  <button key={mode} type="button" onClick={() => setThemeMode(mode)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${themeMode === mode ? '[border-color:var(--kc-accent)] [background:var(--kc-accent-soft)] [color:var(--kc-text)]' : '[border-color:var(--kc-border)] hover:[background:var(--kc-hover)]'}`}>
                    <span className="grid h-10 w-10 place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                      <Icon name={icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{label}</span>
                      <span className="mt-1 block text-xs [color:var(--kc-muted)]">{detail}</span>
                    </span>
                    {themeMode === mode ? <Icon name="check" className="h-5 w-5 [color:var(--kc-accent)]" /> : null}
                  </button>
                ))}
              </div>
            </section>

            <FontSizeControl value={uiFontScale} onChange={setUiFontScale} />

            <section className="glass-panel kc-pc-card-motion mt-5 rounded-[30px] p-5">
              <h4 className="text-sm font-semibold">消息提醒</h4>
              <p className="mt-1 text-xs [color:var(--kc-muted)]">系统通知和提示音会遵守每个聊天里的消息设置，不提醒或屏蔽消息时不会弹通知也不会播放声音。</p>
              <div className="kc-pc-stagger mt-4 grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => void updateBrowserNotifications(browserNotificationMode === 'on' ? 'off' : 'on')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${browserNotificationMode === 'on' ? '[border-color:var(--kc-accent)] [background:var(--kc-accent-soft)] [color:var(--kc-text)]' : '[border-color:var(--kc-border)] hover:[background:var(--kc-hover)]'}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                    <Icon name="bell" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{systemNotificationLabel}</span>
                    <span className="mt-1 block text-xs [color:var(--kc-muted)]">{notificationPermissionLabel}</span>
                  </span>
                  {browserNotificationMode === 'on' ? <Icon name="check" className="h-5 w-5 [color:var(--kc-accent)]" /> : null}
                </button>
                <button type="button" onClick={() => setSoundNotificationMode(soundNotificationMode === 'on' ? 'off' : 'on')} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition ${soundNotificationMode === 'on' ? '[border-color:var(--kc-accent)] [background:var(--kc-accent-soft)] [color:var(--kc-text)]' : '[border-color:var(--kc-border)] hover:[background:var(--kc-hover)]'}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                    <Icon name="volume" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">消息提示音效</span>
                    <span className="mt-1 block text-xs [color:var(--kc-muted)]">开启后普通消息、@ 提醒和成员进出会播放对应音效。</span>
                  </span>
                  {soundNotificationMode === 'on' ? <Icon name="check" className="h-5 w-5 [color:var(--kc-accent)]" /> : null}
                </button>
                {isDesktopApp ? (
                  <button type="button" disabled={desktopAutostartMutation.isPending || desktopAutostartQuery.isLoading} onClick={() => desktopAutostartMutation.mutate(!desktopAutostartEnabled)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${desktopAutostartEnabled ? '[border-color:var(--kc-accent)] [background:var(--kc-accent-soft)] [color:var(--kc-text)]' : '[border-color:var(--kc-border)] hover:[background:var(--kc-hover)]'}`}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl [background:var(--kc-panel-muted)]">
                      <Icon name="device" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">开机自启动</span>
                      <span className="mt-1 block text-xs [color:var(--kc-muted)]">{desktopAutostartLabel}</span>
                    </span>
                    {desktopAutostartEnabled ? <Icon name="check" className="h-5 w-5 [color:var(--kc-accent)]" /> : null}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === 'reports' ? (
          <div key="settings-reports" className="kc-pc-tab-content"><ReportCenter reports={reportsQuery.data ?? []} loading={reportsQuery.isLoading} error={reportsQuery.error} onRefresh={() => void reportsQuery.refetch()} /></div>
        ) : null}

        {activeTab === 'about' ? (
          <div key="settings-about" className="kc-pc-tab-content kc-pc-stagger mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.25fr)_340px]">
            <section className="glass-panel kc-pc-card-motion rounded-[30px] p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.24em] [color:var(--kc-accent)]">About KukeChat</p>
              <h3 className="mt-3 text-3xl font-semibold">关于 KukeChat</h3>
              <p className="mt-4 text-sm leading-7 [color:var(--kc-muted)]">
                {APP_NAME} 想做的不只是一个聊天窗口，而是一个真正属于 Scratcher 的即时交流空间。它希望把分散在评论区、作品页、社群帖和私下联系里的沟通需求，集中到一个更轻盈、更直接、也更有陪伴感的地方，让大家可以随时聊天、讨论创作、交换灵感、结识朋友。
              </p>
              <p className="mt-4 text-sm leading-7 [color:var(--kc-muted)]">
                这个项目的初衷，是为所有 Scratcher 提供一个可以实时沟通、交流想法、分享日常、认识同好的地方。无论你是刚开始接触 Scratch 的新人，还是已经在社区里持续创作很久的老朋友，都能在这里更快地找到愿意回应你的人，找到一起做项目、一起玩、一起成长的伙伴。
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="glass-card-quiet kc-pc-card-motion rounded-[24px] p-4">
                  <p className="text-sm font-bold">项目初衷</p>
                  <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">给所有 Scratcher 一个真正可以实时沟通交流交友的地方，让灵感和回应不再总是慢半拍。</p>
                </div>
                <div className="glass-card-quiet kc-pc-card-motion rounded-[24px] p-4">
                  <p className="text-sm font-bold">希望带来的体验</p>
                  <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">更顺手的聊天、更自然的群聊、更直接的联系，让创作者之间的距离更近一点。</p>
                </div>
                <div className="glass-card-quiet kc-pc-card-motion rounded-[24px] p-4">
                  <p className="text-sm font-bold">适合谁</p>
                  <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">适合想聊天、想找朋友、想讨论作品、想拉人一起做项目的每一位 Scratcher。</p>
                </div>
                <div className="glass-card-quiet kc-pc-card-motion rounded-[24px] p-4">
                  <p className="text-sm font-bold">KukeChat 想成为</p>
                  <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">一个有温度、有回应、能让创作和社交同时发生的小社区入口。</p>
                </div>
              </div>
            </section>

            <aside className="kc-pc-page-aside grid gap-5">
              <section className="glass-panel rounded-[30px] p-5">
                <div className="grid h-14 w-14 place-items-center rounded-[20px] [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
                  <Icon name="sparkles" className="h-7 w-7" />
                </div>
                <h4 className="mt-4 text-2xl font-semibold">{APP_NAME}</h4>
                <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">{APP_DESCRIPTION}</p>
                <div className="mt-5 rounded-[24px] border p-4 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] [color:var(--kc-muted)]">Made For Scratchers</p>
                  <p className="mt-2 text-sm leading-6 [color:var(--kc-text)]">实时聊天、群聊交流、交友互动、创作讨论，都应该有一个更方便开始的地方。</p>
                </div>
              </section>

              <section className="glass-panel rounded-[30px] p-5">
                <h4 className="text-lg font-semibold">项目信息</h4>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] [color:var(--kc-muted)]">版本号</p>
                    <p className="mt-1 text-sm font-semibold">v{APP_VERSION}</p>
                  </div>
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] [color:var(--kc-muted)]">开发者</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {APP_DEVELOPERS.map((developer) => (
                        <a key={developer.profileUrl} href={developer.profileUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-full px-3 py-1 text-sm font-semibold underline-offset-4 transition hover:underline [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
                          {developer.name}
                        </a>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] [color:var(--kc-muted)]">面向群体</p>
                    <p className="mt-1 text-sm font-semibold">所有 Scratcher</p>
                  </div>
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] [color:var(--kc-muted)]">关键词</p>
                    <p className="mt-1 text-sm font-semibold">实时沟通 · 交流 · 交友 · 创作陪伴</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        ) : null}

        {activeTab === 'support' ? (
          <div key="settings-support" className="kc-pc-tab-content kc-pc-stagger mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1.2fr)_340px]">
            <section className="glass-panel kc-pc-card-motion rounded-[30px] p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.24em] [color:#f97316]">Support KukeChat</p>
              <h3 className="mt-3 text-3xl font-semibold">赞助支持</h3>
              <p className="mt-4 text-sm leading-7 [color:var(--kc-muted)]">
                {APP_NAME} 从零开始完全由我个人独立开发，后续的功能迭代、日常维护、问题修复，以及服务运行需要承担的服务器等成本，也都由我持续投入时间和精力来完成。
              </p>
              <p className="mt-4 text-sm leading-7 [color:var(--kc-muted)]">
                如果你喜欢 {APP_NAME}，也认可它想为 Scratcher 提供一个实时沟通、交流和交友空间的想法，并且你目前有能力支持一下，我会非常感谢你的帮助。每一份支持，都会直接变成这个项目继续更新、继续维护、继续运行下去的动力。
              </p>
              <p className="mt-4 text-sm leading-7 [color:var(--kc-muted)]">
                如果暂时不方便赞助，也完全没关系。你也可以通过作品页投币的方式支持一下，这同样是非常实在、也很珍贵的鼓励。
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {SPONSOR_URL ? (
                  <a href={SPONSOR_URL} target="_blank" rel="noreferrer" className="kc-support-card rounded-[26px] border p-5 text-left transition hover:-translate-y-1 hover:shadow-lg [border-color:rgba(249,115,22,0.24)] [background:linear-gradient(180deg,rgba(255,237,213,0.96),rgba(255,247,237,0.92))]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-semibold text-orange-600">爱发电赞助</p>
                        <p className="mt-2 text-sm leading-6 text-orange-900/80">适合想直接支持项目开发、维护与服务器成本的朋友。</p>
                      </div>
                      <span className="kc-support-icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/70 text-orange-500">
                        <Icon name="star" className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="mt-5 flex items-center justify-between text-sm font-semibold text-orange-700">
                      <span>前往爱发电</span>
                      <Icon name="chevron" className="h-4 w-4" />
                    </div>
                  </a>
                ) : null}

                <a href={CCW_SUPPORT_URL} target="_blank" rel="noreferrer" className="kc-support-card kc-support-card-blue rounded-[26px] border p-5 text-left transition hover:-translate-y-1 hover:shadow-lg [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">作品页投币支持</p>
                      <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">如果不方便赞助，也可以去 CCW 作品页投币支持一下即可。</p>
                    </div>
                    <span className="kc-support-icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl [background:var(--kc-panel)] [color:var(--kc-accent)]">
                      <Icon name="sparkles" className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="mt-5 flex items-center justify-between text-sm font-semibold [color:var(--kc-text)]">
                    <span>打开 CCW 作品</span>
                    <Icon name="chevron" className="h-4 w-4" />
                  </div>
                </a>
              </div>
            </section>

            <aside className="kc-pc-page-aside grid gap-5">
              <section className="glass-panel rounded-[30px] p-5">
                <div className="kc-support-icon grid h-14 w-14 place-items-center rounded-[20px] bg-orange-100 text-orange-500">
                  <Icon name="star" className="h-7 w-7" />
                </div>
                <h4 className="mt-4 text-2xl font-semibold">支持这个项目</h4>
                <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">你的支持会帮助 {APP_NAME} 持续开发、修复问题、维护服务，并把更多想法真正做出来。</p>
                <div className="mt-5 rounded-[24px] border p-4 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] [color:var(--kc-muted)]">Developer</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {APP_DEVELOPERS.map((developer) => (
                      <a key={developer.profileUrl} href={developer.profileUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold underline-offset-4 transition hover:underline [color:var(--kc-accent)]">
                        {developer.name}
                      </a>
                    ))}
                  </div>
                  <p className="mt-2 text-sm leading-6 [color:var(--kc-muted)]">共同参与项目开发、维护和长期更新。</p>
                </div>
              </section>

              <section className="glass-panel rounded-[30px] p-5">
                <h4 className="text-lg font-semibold">支持会用于</h4>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-sm font-semibold">持续开发新功能</p>
                    <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">把聊天、群聊、互动体验继续打磨得更完整。</p>
                  </div>
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-sm font-semibold">长期维护与修复</p>
                    <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">及时处理 bug、优化使用体验、保持项目可用。</p>
                  </div>
                  <div className="rounded-[22px] border px-4 py-3 [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                    <p className="text-sm font-semibold">服务器与运行成本</p>
                    <p className="mt-1 text-xs leading-5 [color:var(--kc-muted)]">为后续服务运行、部署和相关支出提供支持。</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </main>
    </section>
  );
}

function ReportCenter({ reports, loading, error, onRefresh }: { reports: ReportRead[]; loading: boolean; error: unknown; onRefresh: () => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] [color:var(--kc-accent)]">Report Center</p>
          <h3 className="mt-2 text-2xl font-semibold">举报中心</h3>
          <p className="mt-1 text-sm [color:var(--kc-muted)]">查看你提交过的举报、管理员处理进度和处理备注。</p>
        </div>
        <button type="button" onClick={onRefresh} className="rounded-2xl border px-4 py-2 text-sm font-bold transition [border-color:var(--kc-border)] hover:[background:var(--kc-hover)]">刷新</button>
      </div>

      {error ? <p className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">举报记录加载失败，请稍后重试。</p> : null}

      {loading ? (
        <div className="glass-panel rounded-[28px] p-6 text-sm [color:var(--kc-muted)]">正在加载举报记录...</div>
      ) : reports.length === 0 ? (
        <div className="glass-panel rounded-[28px] p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]">
            <Icon name="flag" className="h-7 w-7" />
          </div>
          <h4 className="mt-4 text-lg font-semibold">暂无举报记录</h4>
          <p className="mt-2 text-sm [color:var(--kc-muted)]">你提交举报后，会在这里看到处理进度。</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {reports.map((report) => (
            <article key={report.id} className="glass-panel rounded-[26px] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${report.status === 'pending' ? 'bg-amber-500/15 text-amber-600' : report.status === 'rejected' ? 'bg-slate-500/20 [color:var(--kc-muted)]' : 'bg-emerald-500/15 text-emerald-600'}`}>{formatReportStatus(report.status)}</span>
                    <span className="text-xs [color:var(--kc-muted)]">#{report.id} · {formatDate(report.created_at)}</span>
                  </div>
                  <h4 className="mt-3 text-base font-semibold">{report.reason}</h4>
                  <p className="mt-1 text-sm leading-6 [color:var(--kc-muted)]">{report.description || report.details || '无补充说明'}</p>
                </div>
                <div className="rounded-2xl border px-3 py-2 text-xs [border-color:var(--kc-border)] [background:var(--kc-panel-muted)] [color:var(--kc-muted)]">
                  {formatTargetType(report.target_type)} #{report.target_id}
                </div>
              </div>

              {report.attachments && report.attachments.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {report.attachments.map((url, index) => {
                    const imageUrl = resolveAssetUrl(url);
                    return imageUrl ? (
                      <a key={`${url}-${index}`} href={imageUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border [border-color:var(--kc-border)]">
                        <img src={imageUrl} alt={`举报凭证 ${index + 1}`} className="h-20 w-24 object-cover" />
                      </a>
                    ) : null;
                  })}
                </div>
              ) : null}

              <div className="mt-3 rounded-2xl border p-3 text-sm [border-color:var(--kc-border)] [background:var(--kc-panel-muted)]">
                <p className="font-bold">处理结果</p>
                <p className="mt-1 leading-6 [color:var(--kc-muted)]">{report.review_note || (report.status === 'pending' ? '管理员尚未处理，请耐心等待。' : '管理员未填写处理备注。')}</p>
                {report.reviewed_at ? <p className="mt-2 text-xs [color:var(--kc-muted)]">处理时间：{formatDate(report.reviewed_at)}</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function formatReportStatus(status?: string): string {
  if (status === 'pending') return '待处理';
  if (status === 'reviewed') return '已处理';
  if (status === 'rejected') return '已驳回';
  return '未知状态';
}

function formatTargetType(type: string): string {
  if (type === 'message') return '消息';
  if (type === 'user') return '用户';
  if (type === 'conversation') return '会话';
  if (type === 'post') return '动态';
  return type;
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return formatChinaDateTime(value);
}
