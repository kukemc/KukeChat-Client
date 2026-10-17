import { useContext } from 'react';
import { pokeVerb, type PokeInfo } from '@/utils/poke';
import { ChatRowContext } from '../runtime';

/**
 * 聊天记录里的一行戳一戳：「阿夸 拍了拍 你 的小脑袋」。
 * 自己显示成「你」，别人的名字可以点开名片。外层的居中和字号由 .kcd-notice 负责。
 * 也会出现在聊天页之外（合并转发的记录、收藏里），那里没有 ChatRowContext：只显示名字，不能点。
 */
export function PokeNotice({ info }: { info: PokeInfo }): JSX.Element {
  const context = useContext(ChatRowContext);
  if (!context) {
    return <>{info.actorName} {pokeVerb(info.action)} {info.userName}{info.suffix ? ` ${info.suffix}` : ''}</>;
  }
  const { actions, currentUser } = context;
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
