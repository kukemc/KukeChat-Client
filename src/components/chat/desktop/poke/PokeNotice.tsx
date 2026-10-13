import { pokeVerb, type PokeInfo } from '@/utils/poke';
import { useChatRow } from '../runtime';

/**
 * 聊天记录里的一行戳一戳：「阿夸 拍了拍 你 的小脑袋」。
 * 自己显示成「你」，别人的名字可以点开名片。外层的居中和字号由 .kcd-notice 负责。
 */
export function PokeNotice({ info }: { info: PokeInfo }): JSX.Element {
  const { actions, currentUser } = useChatRow();
  const person = (userId: number, name: string): JSX.Element | string => (userId === currentUser.id ? '你' : (
    <button
      type="button"
      className="kcd-notice-name"
      onClick={(event) => {
        event.stopPropagation();
        actions.openUser(event.currentTarget, userId, name);
      }}
    >
      {name}
    </button>
  ));
  return (
    <>
      {person(info.actorId, info.actorName)} {pokeVerb(info.action)} {person(info.userId, info.userName)}{info.suffix ? ` ${info.suffix}` : ''}
    </>
  );
}
