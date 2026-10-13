import { formatBotCommandParam, type BotCommand } from '@/utils/botCommands';

interface BotCommandSignatureProps {
  command: BotCommand;
  /** 正在输入的那个参数的下标，只有输入框上方的提示条会传 */
  activeParam?: number;
}

/** 指令签名「/mc <玩家名> [版本]」。指令面板、参数提示条、编辑页预览、详情页都从这里出，字体和截断由外层容器决定。 */
export function BotCommandSignature({ command, activeParam }: BotCommandSignatureProps): JSX.Element {
  return (
    <>
      {command.command}
      {command.params.map((param, index) => (
        <span key={index} className={index === activeParam ? 'kcb-param is-active' : 'kcb-param'}> {formatBotCommandParam(param)}</span>
      ))}
    </>
  );
}

interface BotCommandHintProps {
  command: BotCommand;
  /** 必须是 command.params 里有的下标：参数填完之后由调用方收起提示条 */
  paramIndex: number;
}

/** 输入框上方的一行参数提示：完整签名，高亮正在输入的那个参数，后面跟它的说明。 */
export function BotCommandHint({ command, paramIndex }: BotCommandHintProps): JSX.Element {
  const hint = command.params[paramIndex].hint;
  return (
    <div className="kcb-hint" role="status">
      <span className="kcb-hint-signature"><BotCommandSignature command={command} activeParam={paramIndex} /></span>
      {hint ? <span className="kcb-hint-text">{hint}</span> : null}
    </div>
  );
}
