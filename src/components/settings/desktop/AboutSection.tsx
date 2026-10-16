import { useState } from 'react';
import { APP_DEVELOPERS, APP_NAME, CCW_SUPPORT_URL, SPONSOR_URL } from '@/config';
import { UpdateProgressBar } from '@/components/desktop/DesktopUpdateDialog';
import { Icon } from '@/components/ui/Icon';
import { ReleaseNotesDialog } from '@/components/update/ReleaseNotes';
import { FORCED_UPDATE_TITLE } from '@/components/update/updateFormat';
import {
  cancelDesktopUpdateDownload, checkForDesktopUpdate, downloadDesktopUpdate, installDesktopUpdate, isDesktopUpdateSupported,
  setDesktopUpdateAutoCheck, setDesktopUpdateChannel, setDesktopUpdateDialogOpen, useDesktopUpdate
} from '@/native/desktopUpdate';
import { isTauriDesktopApp } from '@/utils/appMode';
import { openExternalUrl } from '@/utils/openExternalUrl';
import packageJson from '../../../../package.json';
import { Card, Notice, Row, SettingsPage, Toggle, btn } from './settingsUi';

function lastChecked(at: number | null): string {
  if (!at) return '本次启动还没有检查过';
  const minutes = Math.floor((Date.now() - at) / 60000);
  return minutes < 1 ? '刚刚检查过' : minutes < 60 ? `${minutes} 分钟前检查过` : `${Math.floor(minutes / 60)} 小时前检查过`;
}

function UpdateCard(): JSX.Element {
  const state = useDesktopUpdate();
  const { phase } = state;
  let status: JSX.Element;
  let action: JSX.Element | null;

  if (phase === 'checking') {
    status = <>正在检查更新…</>;
    action = <button type="button" className={btn.secondary} disabled><Icon name="refresh" className="h-4 w-4 animate-spin" />检查中</button>;
  } else if (phase === 'available') {
    status = <span className="font-semibold [color:var(--kc-text)]">发现新版本 v{state.latestVersion}{state.forced ? `（${FORCED_UPDATE_TITLE}）` : ''}</span>;
    action = <>
      {state.changelog ? <button type="button" className={btn.ghost} onClick={() => setDesktopUpdateDialogOpen(true)}>查看更新内容</button> : null}
      <button type="button" className={btn.primary} onClick={() => void downloadDesktopUpdate()}><Icon name="download" className="h-4 w-4" />下载并安装</button>
    </>;
  } else if (phase === 'downloading') {
    status = <>正在下载 v{state.latestVersion}</>;
    action = <button type="button" className={btn.ghost} onClick={cancelDesktopUpdateDownload}>取消</button>;
  } else if (phase === 'ready' || phase === 'installing') {
    status = <span className="font-semibold text-emerald-600">v{state.latestVersion} 已下载，重启即可完成更新</span>;
    action = <button type="button" className={btn.primary} disabled={phase === 'installing'} onClick={() => void installDesktopUpdate()}>{phase === 'installing' ? '正在启动安装…' : '安装并重启'}</button>;
  } else {
    status = phase === 'upToDate' ? <>{state.message === '已是最新版本' ? '已是最新版本' : state.message}</> : phase === 'error' ? <span className="text-red-500">检查失败</span> : <>{lastChecked(state.lastCheckedAt)}</>;
    action = <button type="button" className={btn.secondary} onClick={() => void checkForDesktopUpdate({ manual: true })}><Icon name="refresh" className="h-4 w-4" />检查更新</button>;
  }

  return (
    <Card title="软件更新">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl [background:var(--kc-accent-soft)] [color:var(--kc-accent)]"><Icon name="download" className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium [color:var(--kc-text)]">当前版本 v{state.currentVersion}</p>
          <p className="mt-0.5 text-xs [color:var(--kc-muted)]">{status}{phase !== 'idle' && phase !== 'checking' && state.lastCheckedAt ? ` · ${lastChecked(state.lastCheckedAt)}` : ''}</p>
        </div>
        {action}
      </div>
      {phase === 'downloading' ? <div className="px-4 pb-4"><UpdateProgressBar downloaded={state.downloaded} total={state.total} /></div> : null}
      {phase === 'error' && state.error ? <div className="px-4 pb-4"><Notice tone="error">{state.error}</Notice></div> : null}
      <Row title="自动检查更新" description="启动后和每隔几小时检查一次，有新版本时提醒你。不会在你不知情时安装。">
        <Toggle label="自动检查更新" checked={state.autoCheck} onChange={setDesktopUpdateAutoCheck} />
      </Row>
      <Row title="接收测试版" description="提前体验还在测试的新版本，可能不太稳定。关掉后只接收正式版。">
        <Toggle label="接收测试版" checked={state.channel === 'beta'} onChange={(on) => setDesktopUpdateChannel(on ? 'beta' : 'stable')} />
      </Row>
      {state.skippedVersion ? <Row title="已跳过的版本" description={`v${state.skippedVersion} 不会再自动提醒，手动检查仍然可以安装。`} /> : null}
    </Card>
  );
}

export function AboutSection(): JSX.Element {
  const desktop = isTauriDesktopApp();
  const [notesOpen, setNotesOpen] = useState(false);
  return (
    <SettingsPage title={desktop ? '关于与更新' : '关于'}>
      {isDesktopUpdateSupported() ? <UpdateCard /> : null}
      <Card>
        <Row icon="fileText" title="更新日志" description={desktop ? '每个版本更新了什么' : '桌面端和安卓端每个版本更新了什么'} onClick={() => setNotesOpen(true)}>
          <Icon name="chevron" className="h-4 w-4 [color:var(--kc-muted)]" />
        </Row>
      </Card>
      <ReleaseNotesDialog open={notesOpen} onClose={() => setNotesOpen(false)} platforms={desktop ? ['windows'] : ['windows', 'android']} currentVersion={desktop ? packageJson.version : null} />
      <Card padded>
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl text-white [background:var(--kc-accent)]"><Icon name="message" className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="text-base font-semibold [color:var(--kc-text)]">{APP_NAME} <span className="text-sm font-normal [color:var(--kc-muted)]">v{packageJson.version}</span></p>
            <p className="text-xs [color:var(--kc-muted)]">{packageJson.description}</p>
          </div>
        </div>
        <p className="mt-4 text-[13px] leading-6 [color:var(--kc-muted)]">
          {APP_NAME} 想为 Scratcher 提供一个可以实时沟通、交流想法、分享日常、认识同好的地方。无论刚接触 Scratch 还是已经创作很久，都能在这里更快找到回应你的人，找到一起做项目、一起成长的伙伴。
        </p>
      </Card>
      <Card title="开发者">
        {APP_DEVELOPERS.map((developer) => (
          <Row key={developer.profileUrl} icon="profile" title={developer.name} onClick={() => void openExternalUrl(developer.profileUrl)}>
            <Icon name="external" className="h-4 w-4 [color:var(--kc-muted)]" />
          </Row>
        ))}
      </Card>
      <Card title="支持 KukeChat" description="KukeChat 由个人独立开发和维护，服务器等费用也由开发者承担。如果你喜欢它，可以支持一下。">
        {SPONSOR_URL ? (
          <Row icon="heart" title="爱发电赞助" description="直接支持开发、维护和服务器费用" onClick={() => void openExternalUrl(SPONSOR_URL as string)}>
            <Icon name="external" className="h-4 w-4 [color:var(--kc-muted)]" />
          </Row>
        ) : null}
        <Row icon="star" title="CCW 作品投币" description="不方便赞助的话，去作品页投个币也是很大的鼓励" onClick={() => void openExternalUrl(CCW_SUPPORT_URL)}>
          <Icon name="external" className="h-4 w-4 [color:var(--kc-muted)]" />
        </Row>
      </Card>
    </SettingsPage>
  );
}
