import { isTauriDesktopApp } from '@/utils/appMode';
import { openExternalUrl } from '@/utils/openExternalUrl';

function nearestHttpLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor) {
    return null;
  }

  const href = anchor.href.trim();
  if (!/^https?:\/\//i.test(href)) {
    return null;
  }

  return anchor;
}

export function installDesktopExternalLinkHandler(): () => void {
  if (!isTauriDesktopApp()) {
    return () => undefined;
  }

  const onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }

    const anchor = nearestHttpLink(event.target);
    if (!anchor) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(anchor.href);
  };

  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}
