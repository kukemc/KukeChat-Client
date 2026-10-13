import { DesktopSettingsPanel } from './desktop/DesktopSettingsPanel';
import { MobileSettingsPanel, type SettingsPanelProps } from './MobileSettingsPanel';

/** Mobile keeps its native-style page stack; desktop and the extension share the redesigned panel. */
export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  if (props.isMobile) return <MobileSettingsPanel {...props} />;
  return <DesktopSettingsPanel user={props.user} initialTab={props.initialTab} focusKey={props.focusKey} onLogout={props.onLogout} />;
}
