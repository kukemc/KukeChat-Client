import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MobileStatusBar } from '@/components/mobile/MobileChrome';
import { MOBILE_APP_VERSION } from '@/native/appUpdate';
import { isNativeMobileApp, isTauriDesktopApp } from '@/utils/appMode';
import packageJson from '../../../../package.json';
import type { AuthForm } from '../authForms';
import { buttonPath } from '../blocks/motion';
import type { StageField, StageKind, StageVars } from '../blocks/blockStage';
import { Collapse, SwapText, useReducedMotion } from './motionHooks';
import { Wordmark, Workspace } from './Workspace';

/**
 * 登录 / 注册页（设计稿 dev/login-concepts/live/template.html）。
 * 表单的状态、校验、请求都在 useAuthForm 里，这里只管怎么画：左边（手机是上面）是跟着表单实时变化的 Scratch 积木，
 * 右边是带「登录 / 注册新账号」页签的表单。样式在 auth-login.css（klg-）。
 */

const USERNAME_HINT = '3–50 位，仅可使用字母、数字、下划线、点和短横线。';

function versionLine(): string {
  if (isNativeMobileApp()) return `NEXT · v${MOBILE_APP_VERSION} · Android`;
  return `NEXT · v${packageJson.version} · ${isTauriDesktopApp() ? '桌面版' : '扩展版'}`;
}

/** 当前焦点所在的元素；扩展挂在 Shadow DOM 里，document.activeElement 只会是宿主。 */
function activeIn(node: Node | null): Element | null {
  const root = node?.getRootNode() as Document | ShadowRoot | undefined;
  return root?.activeElement ?? null;
}

function PrimaryButton({ disabled, loading, children }: { disabled: boolean; loading: boolean; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLButtonElement | null>(null);
  const pathRef = useRef<SVGPathElement | null>(null);
  useLayoutEffect(() => {
    const btn = ref.current;
    const path = pathRef.current;
    if (!btn || !path) return undefined;
    const draw = (): void => {
      if (btn.offsetWidth) path.setAttribute('d', buttonPath(btn.offsetWidth, btn.offsetHeight || 44));
    };
    draw();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(draw);
    observer.observe(btn);
    return () => observer.disconnect();
  }, []);
  return (
    <button ref={ref} type="submit" className={`klg-btn klg-btn--pri ${loading ? 'is-loading' : ''}`} disabled={disabled} aria-busy={loading || undefined}>
      <svg className="klg-btn-bg" aria-hidden="true"><path ref={pathRef} /></svg>
      {children}
    </button>
  );
}

interface FieldProps {
  field: StageField;
  label: string;
  optional?: boolean;
  icon: IconName;
  error?: string;
  children: ReactNode;
  after?: ReactNode;
}

function Field({ field, label, optional, icon, error, children, after }: FieldProps): JSX.Element {
  return (
    <div className={`klg-f ${error ? 'is-err' : ''}`} data-field={field}>
      <div className="klg-label">{label}{optional ? <em>选填</em> : null}</div>
      <label className="klg-box">
        <Icon name={icon} />
        {children}
      </label>
      {after}
    </div>
  );
}

function EyeButton({ visible, onToggle }: { visible: boolean; onToggle: () => void }): JSX.Element {
  return (
    <button type="button" className="klg-eye" onClick={onToggle} aria-label={visible ? '隐藏密码' : '显示密码'}>
      <Icon name={visible ? 'eyeOff' : 'eye'} />
    </button>
  );
}

interface AuthScreenProps {
  form: AuthForm;
  kind: StageKind;
  /** 找回密码这类盖在页面上的东西。桌面盖在表单那一面上，手机盖住整页。 */
  overlay?: ReactNode;
}

export function AuthScreen({ form, kind, overlay }: AuthScreenProps): JSX.Element {
  const { isRegister, isNativeApp } = form;
  const desk = kind === 'desk';
  const still = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const inkRef = useRef<HTMLElement | null>(null);
  const userRef = useRef<HTMLInputElement | null>(null);
  const [focus, setFocus] = useState<StageField | null>(null);
  const [kb, setKb] = useState(false);
  const [runToken, setRunToken] = useState(0);
  const blurTimer = useRef(0);

  const vars = useMemo<StageVars>(() => ({
    mode: isRegister ? 'reg' : 'login',
    name: form.username,
    nick: form.nickname,
    pw: form.password,
    conf: form.confirmPassword
  }), [isRegister, form.username, form.nickname, form.password, form.confirmPassword]);

  // 按钮文字：切换模式时交叉淡入；进入 / 离开「正在登录」时直接换
  const pendingRef = useRef(form.isPending);
  const pendingFlip = pendingRef.current !== form.isPending;
  useEffect(() => {
    pendingRef.current = form.isPending;
  }, [form.isPending]);

  /* 页签下划线：滑到当前页签下面；第一次摆放不要动画 */
  const inkPlaced = useRef(false);
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const ink = inkRef.current;
    if (!tabs || !ink) return undefined;
    const place = (instant: boolean): void => {
      const on = tabs.querySelector<HTMLElement>('button.is-on');
      if (!on) return;
      if (instant) ink.style.transition = 'none';
      ink.style.width = `${on.offsetWidth}px`;
      ink.style.transform = `translateX(${on.offsetLeft}px)`;
      if (instant) {
        void ink.offsetWidth;
        ink.style.transition = '';
      }
    };
    place(!inkPlaced.current || still);
    inkPlaced.current = true;
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => place(true));
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [isRegister, still]);

  /* 切换模式后焦点要是落在被收起的输入框里，挪回用户名 */
  useEffect(() => {
    const active = activeIn(rootRef.current);
    if (active && rootRef.current?.contains(active) && active.closest('.klg-clp:not(.is-open)')) userRef.current?.focus({ preventScroll: true });
  }, [isRegister]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  function handleFocus(event: FocusEvent<HTMLFormElement>): void {
    window.clearTimeout(blurTimer.current);
    const field = (event.target as HTMLElement).closest<HTMLElement>('[data-field]')?.dataset.field as StageField | undefined;
    if (!desk) {
      setKb(true);
      if (field) setFocus(field);
    }
  }

  function handleBlur(): void {
    if (desk) return;
    window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => {
      const active = activeIn(rootRef.current);
      const form = rootRef.current?.querySelector('form');
      if (!active || !form?.contains(active)) {
        setKb(false);
        setFocus(null);
      }
    }, 60);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    form.submit(event);
    if (!form.validationError && !form.isPending) setRunToken((value) => value + 1);
  }

  // 两种模式下各块展开 / 收起的先后：去注册时 提示 → 昵称 → 确认密码；回登录时反过来
  const d = (toReg: number, toLogin: number): number => (isRegister ? toReg : toLogin);
  const showSecure = !isRegister && !isNativeApp;
  const loginLabel = <>登录<Icon name="arrowRight" className="klg-arrow" /></>;
  const goKey = form.isPending ? `pending-${vars.mode}` : vars.mode;
  const goLabel = form.isPending ? <><Icon name="loader" className="klg-spin" />{isRegister ? '正在创建…' : '正在登录…'}</> : isRegister ? '创建账号' : loginLabel;

  const formEl = (
    <form className="klg-form" onSubmit={handleSubmit} onFocus={handleFocus} onBlur={handleBlur} autoComplete="on">
      <div className="klg-form-in">
        {desk ? <div className="klg-form-brand"><Wordmark /></div> : null}
        <div ref={tabsRef} className="klg-tabs" role="tablist">
          <button type="button" role="tab" className={isRegister ? '' : 'is-on'} aria-selected={!isRegister} onClick={() => isRegister && form.switchMode('login')}>登录</button>
          <button type="button" role="tab" className={isRegister ? 'is-on' : ''} aria-selected={isRegister} onClick={() => !isRegister && form.switchMode('register')}>注册新账号</button>
          <i ref={inkRef} className="klg-tab-ink" aria-hidden="true" />
        </div>
        {desk ? (
          <>
            <h1 className="klg-h1"><SwapText swapKey={vars.mode} instant={still}>{isRegister ? '创建账号' : '欢迎回来'}</SwapText></h1>
            <p className="klg-sub"><SwapText swapKey={vars.mode} instant={still}>{isRegister ? '起个名字，几秒钟就好。' : '登录后继续你的 Scratch 社交空间。'}</SwapText></p>
          </>
        ) : null}

        <div className="klg-fields">
          <Field
            field="u"
            label="用户名"
            icon="profile"
            error={form.usernameError}
            after={(
              <Collapse open={isRegister} delay={d(40, 90)} instant={still}>
                <div className={`klg-hint ${form.usernameError ? 'is-err' : ''}`}>{form.usernameError || USERNAME_HINT}</div>
              </Collapse>
            )}
          >
            <input ref={userRef} className="kc-allow-focus-border" value={form.username} onChange={(event) => form.setUsername(event.target.value)} required autoComplete="username" autoCapitalize="off" spellCheck={false} aria-invalid={form.usernameError ? true : undefined} placeholder={isRegister ? '字母、数字、_ . -' : '输入用户名'} />
          </Field>

          <Collapse open={isRegister} delay={d(70, 50)} instant={still}>
            <Field field="n" label="昵称" optional icon="smile">
              <input className="kc-allow-focus-border" value={form.nickname} onChange={(event) => form.setNickname(event.target.value)} autoComplete="nickname" placeholder="显示给别人看的名字" />
            </Field>
          </Collapse>

          <Field
            field="p"
            label="密码"
            icon="lock"
            error={form.passwordLengthError}
            after={<Collapse open={Boolean(form.passwordLengthError)} instant={still}><div className="klg-hint is-err">{form.passwordLengthError}</div></Collapse>}
          >
            <input className="kc-allow-focus-border" value={form.password} onChange={(event) => form.setPassword(event.target.value)} required type={form.showPassword ? 'text' : 'password'} autoComplete={isRegister ? 'new-password' : 'current-password'} aria-invalid={form.passwordLengthError ? true : undefined} placeholder={isRegister ? '至少 6 位' : '输入密码'} />
            <EyeButton visible={form.showPassword} onToggle={form.toggleShowPassword} />
          </Field>

          <Collapse open={isRegister} delay={d(140, 0)} instant={still}>
            <Field
              field="c"
              label="确认密码"
              icon="lock"
              error={form.confirmPasswordError}
              after={<Collapse open={Boolean(form.confirmPasswordError)} instant={still}><div className="klg-hint is-err">{form.confirmPasswordError}</div></Collapse>}
            >
              <input className="kc-allow-focus-border" value={form.confirmPassword} onChange={(event) => form.setConfirmPassword(event.target.value)} required={isRegister} type={form.showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" aria-invalid={form.confirmPasswordError ? true : undefined} placeholder="再输入一次" />
              <EyeButton visible={form.showConfirmPassword} onToggle={form.toggleShowConfirmPassword} />
            </Field>
          </Collapse>
        </div>

        <Collapse open={!isRegister} delay={d(0, 110)} instant={still}>
          <div className="klg-row">
            <span>{isNativeApp ? '登录后会自动保存登录状态' : '普通登录不会保存登录状态'}</span>
            <button type="button" className="klg-link" onClick={() => form.setShowForgotPassword(true)}>忘记密码？</button>
          </div>
        </Collapse>

        {form.error ? <p className="klg-alert" role="alert"><Icon name="alertCircle" /><span>{form.error}</span></p> : null}

        <PrimaryButton disabled={form.isPending || Boolean(form.validationError)} loading={form.isPending}>
          <SwapText swapKey={goKey} instant={still || pendingFlip}>{goLabel}</SwapText>
        </PrimaryButton>

        {!isNativeApp ? (
          <Collapse open={showSecure} delay={d(0, 150)} instant={still}>
            <div className="klg-or">或</div>
            <button type="button" className="klg-btn klg-btn--sec" onClick={form.startSecureLogin}>
              <span className="klg-swap"><Icon name="shieldCheck" />安全登录<span className="klg-badge">推荐</span></span>
            </button>
            <p className="klg-note">安全登录后，下次打开会自动同步登录状态</p>
            {form.secureLoginMessage ? <p className="klg-alert klg-alert--info" role="status"><Icon name="info" /><span>{form.secureLoginMessage}</span></p> : null}
          </Collapse>
        ) : null}

        {!desk ? <p className="klg-foot">{versionLine()}</p> : null}
      </div>
    </form>
  );

  const rootClass = `klg klg--${kind} ${isRegister ? 'is-reg' : ''} ${kb ? 'is-kb' : ''} ${still ? 'is-still' : ''}`;

  if (desk) {
    return (
      <div ref={rootRef} className={rootClass}>
        <Workspace kind="desk" vars={vars} still={still} runToken={runToken}>
          <p className="klg-claim">给 Scratcher 的聊天室：<br /><span>做作品、找队友、交朋友。</span></p>
          <p className="klg-meta">{versionLine()}</p>
        </Workspace>
        <div className="klg-side">
          {formEl}
          {overlay}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={rootClass}>
      {!isNativeMobileApp() ? <MobileStatusBar title="" /> : null}
      <Workspace kind="phone" vars={vars} focus={focus} kb={kb} still={still} runToken={runToken} />
      {formEl}
      {overlay}
    </div>
  );
}

/** 启动时等待恢复上次的登录状态：同一套工作区，表单那一面换成转圈。 */
export function AuthRestoringScreen(): JSX.Element {
  const still = useReducedMotion();
  const vars = useMemo<StageVars>(() => ({ mode: 'login', name: '', nick: '', pw: '', conf: '' }), []);
  return (
    <div className={`klg klg--desk ${still ? 'is-still' : ''}`}>
      <Workspace kind="desk" vars={vars} still={still}>
        <p className="klg-claim">给 Scratcher 的聊天室：<br /><span>做作品、找队友、交朋友。</span></p>
        <p className="klg-meta">{versionLine()}</p>
      </Workspace>
      <div className="klg-side">
        <div className="klg-restoring" role="status">
          <Icon name="loader" className="klg-spin" />
          <h2>正在恢复登录</h2>
          <p>正在检测本地登录状态…</p>
        </div>
      </div>
    </div>
  );
}
