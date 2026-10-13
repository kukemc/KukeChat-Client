/**
 * 机器人的指令清单存在 Bot.commands 这个自由文本字段里，约定一行一条：「/指令 <必填参数> [可选参数] 说明」。
 * 后端不认识这个结构，老数据也可能是随手写的一段话，所以解析要容得下不合约定的行。
 */

export interface BotCommandParam {
  name: string;
  /** 必填写作 <名字>，可选写作 [名字] */
  required: boolean;
  /** 写在标记里冒号后面的参数说明，没有就是空串 */
  hint: string;
}

export interface BotCommand {
  /** 含开头的「/」 */
  command: string;
  params: BotCommandParam[];
  description: string;
}

/** 服务端对 commands 字段的长度上限 */
export const BOT_COMMANDS_MAX_LENGTH = 3000;

/*
 * 参数标记：<名字>、[名字]，或带说明的 <名字:说明>。
 * 名字里不能有空白，标记后面必须是空白或行尾 —— 「<b>粗体</b>」「[文档](链接)」这类以括号开头的说明就不会被吞成参数。
 */
const PARAM_TOKEN = /^([<[])([^\s<>[\]:]+)(?::([^<>[\]]*))?([>\]])(?=\s|$)/;
const PARAM_NAME_FORBIDDEN = /[\s<>[\]:]/g;
const PARAM_HINT_FORBIDDEN = /[<>[\]\n]/g;

/** 去掉空白并补上开头的「/」。只剩斜杠或什么都没有时返回空串。 */
export function normalizeBotCommandName(value: string): string {
  const name = value.replace(/\s+/g, '');
  if (!name.replace(/\//g, '')) {
    return '';
  }
  return name.startsWith('/') ? name : `/${name}`;
}

/** 去掉参数名和参数说明里会破坏标记的字符。结果和原值不一样，就说明原值里有不能用的字符。 */
export function normalizeBotCommandParam(param: BotCommandParam): BotCommandParam {
  return {
    name: param.name.replace(PARAM_NAME_FORBIDDEN, ''),
    required: param.required,
    hint: param.hint.replace(PARAM_HINT_FORBIDDEN, ' ').trim()
  };
}

/** 参数在签名里的写法；withHint 是存进文本字段时带上说明的完整标记。 */
export function formatBotCommandParam(param: BotCommandParam, withHint = false): string {
  const body = withHint && param.hint ? `${param.name}:${param.hint}` : param.name;
  return param.required ? `<${body}>` : `[${body}]`;
}

/** 这一行开头的指令名；不是指令行时返回空串。 */
function leadingCommand(line: string): string {
  return line.startsWith('/') ? normalizeBotCommandName(/^\S+/.exec(line)?.[0] ?? '') : '';
}

function leadingParam(text: string): { param: BotCommandParam; length: number } | null {
  const match = PARAM_TOKEN.exec(text);
  // 括号要成对：「<a]」不算
  if (!match || (match[1] === '<') !== (match[4] === '>')) {
    return null;
  }
  return { param: { name: match[2], required: match[1] === '<', hint: (match[3] ?? '').trim() }, length: match[0].length };
}

/** 说明恰好长得像参数标记时，存的时候在前面垫一个反斜杠；已经带反斜杠的再垫一个，读回来才分得清。 */
function needsEscape(description: string): boolean {
  return leadingParam(description.replace(/^\\+/, '')) !== null;
}

export function parseBotCommands(text: string | null | undefined): BotCommand[] {
  const commands: BotCommand[] = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    const command = leadingCommand(line);
    if (command) {
      // 参数必须紧跟在指令名后面，碰到第一段不是参数标记的文字，后面就全是说明
      const params: BotCommandParam[] = [];
      let rest = line.slice(command.length).trimStart();
      for (let next = leadingParam(rest); next; next = leadingParam(rest)) {
        params.push(next.param);
        rest = rest.slice(next.length).trimStart();
      }
      commands.push({ command, params, description: rest.startsWith('\\') && needsEscape(rest) ? rest.slice(1) : rest });
      continue;
    }
    // 不以「/」开头的行算作上一条指令说明的续行；排在所有指令之前的无处可归，丢弃
    const previous = commands[commands.length - 1];
    if (line && previous) {
      previous.description = previous.description ? `${previous.description}\n${line}` : line;
    }
  }
  return commands;
}

export function serializeBotCommands(commands: BotCommand[]): string {
  const lines: string[] = [];
  for (const item of commands) {
    const command = normalizeBotCommandName(item.command);
    if (!command) {
      continue;
    }
    const head = [command];
    for (const raw of item.params) {
      const param = normalizeBotCommandParam(raw);
      if (param.name) {
        head.push(formatBotCommandParam(param, true));
      }
    }
    const description: string[] = [];
    for (const raw of item.description.split('\n')) {
      const line = raw.trim();
      if (!line) {
        continue;
      }
      // 说明的续行如果长得像指令，再解析时会被拆成新的一条；并回上一行才能原样读回来
      if (description.length > 0 && leadingCommand(line)) {
        description[description.length - 1] += ` ${line}`;
      } else {
        description.push(line);
      }
    }
    if (description.length > 0) {
      head.push(needsEscape(description[0]) ? `\\${description[0]}` : description[0]);
    }
    lines.push(head.join(' '), ...description.slice(1));
  }
  return lines.join('\n');
}

/**
 * 输入框里的文字对应哪条指令、正在填第几个参数（按已经敲下的空白分隔的段数算）。
 * 不是已知指令、指令没有参数、或参数都填完了，返回 null。同名指令取排在前面的那条。
 */
export function matchBotCommandInput<T extends BotCommand>(text: string, commands: readonly T[]): { command: T; paramIndex: number } | null {
  const typed = /^\/\S*/.exec(text)?.[0];
  if (!typed) {
    return null;
  }
  const name = typed.toLowerCase();
  const command = commands.find((item) => item.command.toLowerCase() === name);
  if (!command) {
    return null;
  }
  const paramIndex = text.slice(typed.length).trimStart().split(/\s+/).length - 1;
  return paramIndex < command.params.length ? { command, paramIndex } : null;
}
