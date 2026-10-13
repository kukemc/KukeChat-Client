import { Icon } from '@/components/ui/Icon';
import { ACCENT_SWATCHES, getThemePreset, resolveAccent, resolveBubbleStyle, type AvatarShape, type Density, type ThemeScheme } from '@/theme/themes';
import type { ThemeEditor } from '@/theme/useTheme';
import { Card, Choice, Toggle } from '../settingsUi';
import { ColorWell, Option, SectionReset, Slider } from './controls';

type OwnBubble = 'solid' | 'soft' | 'custom';
type OtherBubble = 'default' | 'custom';

const OWN_BUBBLES: Array<{ value: OwnBubble; label: string }> = [{ value: 'solid', label: '纯色' }, { value: 'soft', label: '柔和' }, { value: 'custom', label: '自选' }];
const OTHER_BUBBLES: Array<{ value: OtherBubble; label: string }> = [{ value: 'default', label: '默认' }, { value: 'custom', label: '自选' }];
const AVATARS: Array<{ value: AvatarShape; label: string }> = [{ value: 'circle', label: '圆形' }, { value: 'rounded', label: '圆角方形' }];
const DENSITIES: Array<{ value: Density; label: string }> = [{ value: 'cozy', label: '标准' }, { value: 'compact', label: '紧凑' }];

/** 颜色：强调色，以及两边气泡各自的颜色。未读的红色是固定的，不在这里。 */
export function ColorCard({ editor, scheme }: { editor: ThemeEditor; scheme: ThemeScheme }): JSX.Element {
  const { settings, update } = editor;
  const accent = resolveAccent(settings, scheme);
  const ownBubble: OwnBubble = settings.bubbleOutColor ? 'custom' : resolveBubbleStyle(settings);
  const customAccent = settings.accent !== null && !ACCENT_SWATCHES.includes(settings.accent);

  function setOwnBubble(value: OwnBubble): void {
    if (value === 'custom') {
      update({ bubbleOutColor: settings.bubbleOutColor ?? accent });
    } else {
      update({ bubbleOutColor: null, bubbleStyle: value === getThemePreset(settings.presetId).bubbleStyle ? null : value });
    }
  }

  return (
    <Card title="颜色" action={<SectionReset onClick={() => editor.resetSection('color')} />} padded>
      <div className="grid gap-4">
        <div>
          <p className="kth-label">强调色</p>
          <div className="kth-swatches">
            <button type="button" aria-pressed={settings.accent === null} onClick={() => update({ accent: null })} className={`kth-chip ${settings.accent === null ? 'is-active' : ''}`}>跟随预设</button>
            {ACCENT_SWATCHES.map((color) => (
              <button key={color} type="button" aria-label={`强调色 ${color}`} aria-pressed={settings.accent === color} onClick={() => update({ accent: color })} className={`kth-swatch ${settings.accent === color ? 'is-active' : ''}`} style={{ background: color }}>
                {settings.accent === color ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
              </button>
            ))}
            <ColorWell value={customAccent ? settings.accent : null} label="自选强调色" onChange={(color) => update({ accent: color })} />
          </div>
        </div>
        <Option title="我的气泡" description={ownBubble === 'custom' ? '自己挑一个颜色，字色会自动选深或浅。' : '纯色跟着强调色走，更醒目；柔和是一层淡淡的强调色，更耐看。'}>
          <div className="kth-option-controls">
            {ownBubble === 'custom' ? <ColorWell value={settings.bubbleOutColor} label="我的气泡颜色" onChange={(color) => update({ bubbleOutColor: color })} /> : null}
            <Choice value={ownBubble} options={OWN_BUBBLES} onChange={setOwnBubble} />
          </div>
        </Option>
        <Option title="收到的气泡" description="默认是白色（深色下是深灰）的面。">
          <div className="kth-option-controls">
            {settings.bubbleInColor ? <ColorWell value={settings.bubbleInColor} label="收到的气泡颜色" onChange={(color) => update({ bubbleInColor: color })} /> : null}
            <Choice<OtherBubble> value={settings.bubbleInColor ? 'custom' : 'default'} options={OTHER_BUBBLES} onChange={(value) => update({ bubbleInColor: value === 'custom' ? (scheme === 'dark' ? '#2b3140' : '#eef3ff') : null })} />
          </div>
        </Option>
      </div>
    </Card>
  );
}

/** 形状与密度：气泡的圆角和尖角、头像形状、行距。 */
export function ShapeCard({ editor }: { editor: ThemeEditor }): JSX.Element {
  const { settings, update } = editor;
  return (
    <Card title="形状与密度" action={<SectionReset onClick={() => editor.resetSection('shape')} />} padded>
      <div className="grid gap-4">
        <Slider label="气泡圆角" value={settings.radius} min={4} max={20} unit="px" onChange={(radius) => update({ radius })} />
        <Option title="气泡尖角" description="每组消息的第一条，朝头像的那个角收小。">
          <Toggle checked={settings.bubbleTail} onChange={(bubbleTail) => update({ bubbleTail })} label="气泡尖角" />
        </Option>
        <Option title="头像形状"><Choice value={settings.avatarShape} options={AVATARS} onChange={(avatarShape) => update({ avatarShape })} /></Option>
        <Option title="界面密度" description="紧凑会收窄消息之间和会话列表的行距，一屏能看到更多。">
          <Choice value={settings.density} options={DENSITIES} onChange={(density) => update({ density })} />
        </Option>
      </div>
    </Card>
  );
}
