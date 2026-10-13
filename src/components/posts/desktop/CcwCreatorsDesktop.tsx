import type { OpenUserSpace } from '../postModel';
import { CcwCreatorsView } from './creators/CreatorsView';

export { CcwCreatorsView };

/** 「大佬入住」单独成页时用（主页的入口）。页面本身在 creators/ 下。 */
export function CcwCreatorsDesktop(props: { onBack: () => void; onOpenUserSpace: OpenUserSpace }): JSX.Element {
  return <section className="kpo"><CcwCreatorsView {...props} /></section>;
}
