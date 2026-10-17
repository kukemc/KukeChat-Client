import { MATERIAL_PRESETS, MATERIAL_PRESET_LIST, MIN_OPACITY, SURFACE_IDS, materialBlocker, resolveMaterials, type MaterialKind, type MaterialMap, type MaterialPresetId, type SurfaceId, type SurfaceMaterial, type WallpaperMode } from '@/theme/themes';
import { useThemeStore } from '@/theme/themeStore';
import { useRealtimeBlurStatus, type ThemeEditor } from '@/theme/useTheme';
import { Card, Choice, Notice, Toggle } from '../settingsUi';
import { Option, SectionReset, Slider } from './controls';

const SURFACE_LABELS: Record<SurfaceId, { name: string; hint: string }> = {
  rail: { name: '导航栏', hint: '最左边那一列和窗口标题栏' },
  list: { name: '会话列表', hint: '聊天页左侧的列表栏' },
  header: { name: '顶栏', hint: '聊天顶栏，以及其它页面的顶栏和内容卡片' },
  composer: { name: '输入框', hint: '聊天底部的输入卡片' },
  sidebar: { name: '右侧栏', hint: '群公告和成员那一栏' },
  bubbleIn: { name: '收到的气泡', hint: '' },
  bubbleOut: { name: '我的气泡', hint: '' },
  overlay: { name: '浮层', hint: '右键菜单、弹出面板、对话框、抽屉' }
};

const KINDS: Array<{ value: MaterialKind; label: string }> = [{ value: 'solid', label: '实色' }, { value: 'translucent', label: '半透明' }, { value: 'glass', label: '毛玻璃' }];
const OVERLAY_KINDS = KINDS.filter((kind) => kind.value !== 'translucent');

const BLOCKED: Record<NonNullable<ReturnType<typeof materialBlocker>>, string> = {
  'no-wallpaper': '没有背景图，保持实色',
  'outside-wallpaper': '不在背景图上，保持实色',
  performance: '实时模糊已关闭'
};

/** 材质预设的小样：一条背景上压一块面，透明度和模糊照预设里「会话列表」那一档来画。 */
function Sample({ material }: { material: SurfaceMaterial }): JSX.Element {
  return (
    <span className="kth-sample">
      <span className="kth-sample-panel" style={{ opacity: material.kind === 'solid' ? 1 : material.opacity / 100 }} />
      {material.kind === 'glass' ? <span className="kth-sample-blur" /> : null}
    </span>
  );
}

/** 材质：一键套用的几档，加上逐面细调。 */
export function MaterialCard({ editor, mode }: { editor: ThemeEditor; mode: WallpaperMode }): JSX.Element {
  const { settings, update } = editor;
  const performance = useThemeStore((state) => state.performance);
  const setPerformance = useThemeStore((state) => state.setPerformance);
  const realtime = useRealtimeBlurStatus();
  const environment = { performance: !realtime.enabled };
  const materials = resolveMaterials(settings);
  const usesGlass = SURFACE_IDS.some((id) => materials[id].kind === 'glass');

  function setSurface(id: SurfaceId, next: Partial<SurfaceMaterial>): void {
    const current = materials[id];
    // 从实色切到别的档时，透明度给一个看得出效果的起点，而不是 100%
    const opacity = next.opacity ?? (current.kind === 'solid' && next.kind && next.kind !== 'solid' ? MATERIAL_PRESETS.frost[id].opacity : current.opacity);
    update({ material: 'custom', materials: { ...materials, [id]: { kind: next.kind ?? current.kind, opacity } } as MaterialMap });
  }

  function pick(id: MaterialPresetId): void {
    // 进「自定义」时把眼前这一档的数值带过去，从它开始改
    update(id === 'custom' ? { material: 'custom', materials } : { material: id });
  }

  return (
    <Card title="材质" description="侧栏、顶栏这些面透出多少背景。先选一档，需要的话再逐面细调。" action={<SectionReset onClick={() => editor.resetSection('material')} />} padded>
      <div className="grid gap-4">
        {mode === 'none' ? <Notice tone="info">现在没有背景图，各个面会保持实色。先在上面选一张背景，材质才看得出来。</Notice> : null}
        {mode === 'chat' ? (
          <Notice tone="info">
            背景只铺在聊天区：顶栏、输入框和气泡会跟着材质变，导航栏、会话列表和右侧栏不在背景上，保持实色。
            <button type="button" className="kth-inline-link" onClick={() => update({ wallpaperScope: 'window' })}>改成铺满整个窗口</button>
          </Notice>
        ) : null}
        <div className="kth-materials" role="radiogroup" aria-label="材质预设">
          {MATERIAL_PRESET_LIST.map((preset) => (
            <button key={preset.id} type="button" role="radio" aria-checked={settings.material === preset.id} onClick={() => pick(preset.id)} className={`kth-material ${settings.material === preset.id ? 'is-active' : ''}`}>
              <Sample material={MATERIAL_PRESETS[preset.id].list} />
              <span className="kth-material-name">{preset.name}</span>
              <span className="kth-material-hint">{preset.hint}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={settings.material === 'custom'} onClick={() => pick('custom')} className={`kth-material ${settings.material === 'custom' ? 'is-active' : ''}`}>
            <span className="kth-sample kth-sample--custom" />
            <span className="kth-material-name">自定义</span>
            <span className="kth-material-hint">每个面单独设置</span>
          </button>
        </div>
        <Slider label="玻璃模糊" value={settings.glassBlur} min={4} max={40} unit="px" disabled={!usesGlass} onChange={(glassBlur) => update({ glassBlur })} />
        <Option title="性能优先" description={
          realtime.reason === 'reduced-transparency' ? '系统开着「减少透明度」，实时模糊已经自动关闭。'
            : realtime.reason === 'unsupported' ? '当前环境不支持实时模糊，已经自动关闭。'
            : '省电模式：关掉所有实时模糊（浮层和气泡），聊天里的气泡皮肤、头像框也不再播放动效（样子照旧，只是不动）。侧栏、顶栏的毛玻璃用的是预先算好的模糊图，本来就不耗性能，不受影响。'
        }>
          <Toggle checked={performance || realtime.reason === 'reduced-transparency' || realtime.reason === 'unsupported'} disabled={realtime.reason === 'reduced-transparency' || realtime.reason === 'unsupported'} onChange={setPerformance} label="性能优先" />
        </Option>
        <details className="kth-advanced" open={settings.material === 'custom'}>
          <summary>逐面调整</summary>
          <div className="kth-surfaces">
            {SURFACE_IDS.map((id) => {
              const material = materials[id];
              const blocker = materialBlocker(id, mode, settings, environment);
              const bubble = id === 'bubbleIn' || id === 'bubbleOut';
              const label = SURFACE_LABELS[id];
              return (
                <div key={id} className="kth-surface">
                  <div className="kth-surface-name">
                    <p>{label.name}</p>
                    {blocker ? <p className="kth-surface-note is-blocked">{BLOCKED[blocker]}</p> : label.hint ? <p className="kth-surface-note">{label.hint}</p> : null}
                  </div>
                  <Choice value={material.kind} options={id === 'overlay' ? OVERLAY_KINDS : KINDS} onChange={(kind) => setSurface(id, { kind })} />
                  <Slider label="不透明度" value={material.opacity} min={MIN_OPACITY[id]} max={100} unit="%" disabled={material.kind === 'solid'} onChange={(opacity) => setSurface(id, { opacity })} />
                  {bubble && material.kind === 'glass' ? <p className="kth-surface-warning">气泡在滚动的消息里，毛玻璃只能靠实时模糊，消息多时滚动会变卡。想要玻璃感又不想卡：把气泡设成「半透明」，再把上面背景的「模糊」调高。</p> : null}
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </Card>
  );
}
