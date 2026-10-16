/**
 * 统一提示（toast）的本地预览：不连后端，直接把各种外观都点出来看。
 *
 *   npx vite --port 5186 --strictPort --host 127.0.0.1   →   http://127.0.0.1:5186/dev/toast-harness.html
 *
 * 初始状态可以写在地址里，方便截图：
 *   layout=desktop|mobile    theme=light|dark    font=0..4    perf=1（性能优先）
 *   local=1（外部主题变量缺失时也不塌）
 *
 * 控制条上每一组按钮对应一种外观：
 *   四种类型（info / success / warning / error）、堆叠（一次推 3 条、5 条看上限）、
 *   带动作（一个 / 两个、点了不关）、带 leading 图形（礼物、头像）、
 *   长文本、纯文字重复（看右侧的 ×N 计数）、清空。
 *
 * 这个文件只用于开发时看界面，不会进入任何构建产物（vite 的 lib 入口是 src/extension/index.ts）。
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/tailwind.css';
import { ToastHost, toast } from '@/components/ui/toast';
import { GiftThing } from '@/components/gifts/GiftThing';
import { useKukeStore, type UiFontScale } from '@/store/kukeStore';
import { useThemeStore } from '@/theme/themeStore';
import { DEFAULT_THEME_SETTINGS, type ThemeSettings } from '@/theme/themes';
import { useThemeRootProps } from '@/theme/useTheme';

const params = new URLSearchParams(window.location.search);

const LAYOUTS = ['desktop', 'mobile'] as const;
type Layout = (typeof LAYOUTS)[number];

const control: React.CSSProperties = {
  padding: '3px 7px',
  border: '1px solid #cbd5e1',
  borderRadius: 5,
  background: '#fff',
  color: '#0f172a',
  font: '12px/1.4 system-ui, sans-serif',
  cursor: 'pointer'
};
const label: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, font: '12px system-ui, sans-serif', color: '#334155' };

/** 一张假的礼物图形，用来看 leading 插槽和正文的排布。 */
const SAMPLE_GIFT = {
  gift: { key: 'rocket', name: '火箭', icon: '🚀', price: 100, tier: 3 as const },
  toUser: { id: 1, username: 'juror', display_name: '资深老周' }
};

function Harness(): JSX.Element {
  const [layout, setLayout] = useState<Layout>(() => (params.get('layout') === 'mobile' ? 'mobile' : 'desktop'));
  const [dark, setDark] = useState(() => params.get('theme') === 'dark');
  const [fontScale, setFontScale] = useState<UiFontScale>(() => {
    const value = Number(params.get('font') ?? 1);
    return (Number.isFinite(value) ? Math.min(4, Math.max(0, value)) : 1) as UiFontScale;
  });
  const performance = useThemeStore((state) => state.performance);
  const theme = dark ? 'dark' : 'light';
  const themeRoot = useThemeRootProps(theme);
  const isMobile = layout === 'mobile';

  // ToastHost 靠 layoutMode 决定手机样式，所以这里也跟着切
  if (useKukeStore.getState().layoutMode !== layout) {
    useKukeStore.setState({ layoutMode: layout });
  }

  const frameClass = isMobile ? 'kc-window-frame' : 'kc-desktop-app kc-window-frame';
  const frameStyle: React.CSSProperties = isMobile
    ? { position: 'relative', width: 390, height: 'min(100%, 760px)', overflow: 'hidden', borderRadius: 28, transform: 'translateZ(0)', animation: 'none' }
    : { position: 'relative', width: '100%', height: '100%', overflow: 'hidden', animation: 'none' };

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0, flexDirection: 'column', background: '#eef1f6' }}>
      <aside style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #d7dce5', background: '#f8fafc' }}>
        <strong style={{ font: '600 12px system-ui, sans-serif', color: '#0f172a' }}>统一提示</strong>

        <button type="button" style={control} data-harness="info" onClick={() => toast.info('已复制')}>info</button>
        <button type="button" style={control} data-harness="success" onClick={() => toast.success('已保存')}>success</button>
        <button type="button" style={control} data-harness="warning" onClick={() => toast.warning('「天使」快到期了')}>warning</button>
        <button type="button" style={control} data-harness="error" onClick={() => toast.error('发送失败，请稍后重试。')}>error</button>

        <button type="button" style={control} data-harness="subtitle" onClick={() => toast.success('好友申请已发送', { subtitle: '等待对方通过' })}>带副标题</button>
        <button type="button" style={control} data-harness="stack3" onClick={() => {
          toast.info('第一条：已复制');
          toast.success('第二条：已保存');
          toast.warning('第三条：快到期了');
        }}>堆叠 3 条</button>
        <button type="button" style={control} data-harness="stack5" onClick={() => {
          [1, 2, 3, 4, 5].forEach((n) => toast.info(`第 ${n} 条消息`));
        }}>堆叠 5 条（看上限）</button>
        <button type="button" style={control} data-harness="repeat" onClick={() => toast.info('已复制')}>重复同一条（×N）</button>

        <button type="button" style={control} data-harness="action1" onClick={() => toast.warning('「天使」还有 1 天到期', { actions: [{ label: '去续期', onClick: () => toast.success('已续期') }] })}>一个动作</button>
        <button type="button" style={control} data-harness="action2" onClick={() => toast.info('收到一条好友申请', { actions: [{ label: '同意', onClick: () => toast.success('已同意') }, { label: '拒绝', keepOpen: true, onClick: () => toast.info('已拒绝') }] })}>两个动作</button>

        <button type="button" style={control} data-harness="leading" onClick={() => toast.show({ tone: 'info', message: '阿夸 送了你 火箭', subtitle: '魅力值 +50', leading: <GiftThing gift={SAMPLE_GIFT.gift} item={null} wearer={SAMPLE_GIFT.toUser} size={40} avatarSize="md" />, duration: 10000, actions: [{ label: '去看看', keepOpen: true, onClick: () => undefined }] })}>带 leading 图形</button>
        <button type="button" style={control} data-harness="long" onClick={() => toast.error('这条消息特别长，用来看换行和右边关闭按钮的位置：搜索不到你要找的那条消息，可能是它已经被清除，或者当前账号看不到它所在的会话。')}>长文本</button>
        <button type="button" style={control} data-harness="clear" onClick={() => toast.clear()}>清空</button>

        <span style={{ width: 12 }} />
        <label style={label}>布局
          <select data-harness="layout" value={layout} style={{ font: '12px system-ui, sans-serif' }} onChange={(event) => setLayout(event.target.value as Layout)}>
            {LAYOUTS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label style={label}><input type="checkbox" data-harness="dark" checked={dark} onChange={(event) => setDark(event.target.checked)} />深色</label>
        <label style={label}>字号
          <input type="range" min={0} max={4} value={fontScale} data-harness="font" onChange={(event) => setFontScale(Number(event.target.value) as UiFontScale)} />
        </label>
        <label style={label}><input type="checkbox" data-harness="perf" checked={performance} onChange={(event) => useThemeStore.getState().setPerformance(event.target.checked)} />性能优先</label>
      </aside>

      <div style={{ position: 'relative', display: 'grid', minHeight: 0, flex: 1, placeItems: isMobile ? 'center' : 'stretch', background: '#cfd3dd' }}>
        <main
          data-theme={theme}
          data-layout={layout}
          data-font-scale={fontScale}
          data-kc-wallpaper={isMobile ? 'none' : themeRoot['data-kc-wallpaper']}
          style={{ ...(isMobile ? undefined : themeRoot.style), ...frameStyle }}
          className={frameClass}
        >
          <div style={{ display: 'grid', height: '100%', placeItems: 'center', background: 'var(--kc-window, #fff)', color: 'var(--kc-muted, #64748b)', font: '13px system-ui, sans-serif' }}>
            页面内容（提示浮在这里）
          </div>
        </main>
      </div>
      <ToastHost />
    </div>
  );
}

const darkSettings: ThemeSettings | null = params.get('theme') === 'dark' ? DEFAULT_THEME_SETTINGS : null;
useThemeStore.setState({
  dark: darkSettings,
  performance: params.get('perf') === '1',
  saved: [],
  activeSavedId: null
});
useKukeStore.setState({
  layoutMode: params.get('layout') === 'mobile' ? 'mobile' : 'desktop',
  themeSettings: DEFAULT_THEME_SETTINGS
});

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
