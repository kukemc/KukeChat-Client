// Run with: node --experimental-strip-types --test src/utils/botCommands.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBotCommandParam, matchBotCommandInput, normalizeBotCommandName, normalizeBotCommandParam, parseBotCommands, serializeBotCommands } from './botCommands.ts';

const cmd = (command, description = '', params = []) => ({ command, params, description });
const required = (name, hint = '') => ({ name, required: true, hint });
const optional = (name, hint = '') => ({ name, required: false, hint });

test('empty input yields no commands and an empty string', () => {
  assert.deepEqual(parseBotCommands(null), []);
  assert.deepEqual(parseBotCommands(undefined), []);
  assert.deepEqual(parseBotCommands(''), []);
  assert.deepEqual(parseBotCommands(' \n\n  \n'), []);
  assert.equal(serializeBotCommands([]), '');
});

test('one line per command: first token is the command, the rest is the description', () => {
  assert.deepEqual(parseBotCommands('/help 查看帮助\n/ping\n/weather   北京 今天的天气  '), [
    cmd('/help', '查看帮助'),
    cmd('/ping'),
    cmd('/weather', '北京 今天的天气')
  ]);
  // 全角空格、制表符、CRLF 都算分隔
  assert.deepEqual(parseBotCommands('/签到　每日签到\r\n/rank\t排行榜\r\n'), [
    cmd('/签到', '每日签到'),
    cmd('/rank', '排行榜')
  ]);
});

test('legacy free text: orphan lines are dropped, later ones continue the previous description', () => {
  const legacy = '本机器人支持以下指令：\n\n/help 查看帮助\n  也可以直接 @ 我\n\n/roll\n掷一个骰子\n/ 不是指令';
  assert.deepEqual(parseBotCommands(legacy), [
    cmd('/help', '查看帮助\n也可以直接 @ 我'),
    cmd('/roll', '掷一个骰子\n/ 不是指令')
  ]);
  assert.deepEqual(parseBotCommands('签到\n菜单\n没有任何斜杠指令'), []);
});

test('params: <required> and [optional] tokens right after the command, with an optional hint', () => {
  assert.deepEqual(parseBotCommands('/mc <玩家名:要查的玩家> [版本] 查询原版信息数据'), [
    cmd('/mc', '查询原版信息数据', [required('玩家名', '要查的玩家'), optional('版本')])
  ]);
  // 没有说明、说明里带空格和冒号、标记之间多个空白
  assert.deepEqual(parseBotCommands('/ban   <用户>\t[时长: 例如 1h30m 或 12:00 ]\n/say [内容:] '), [
    cmd('/ban', '', [required('用户'), optional('时长', '例如 1h30m 或 12:00')]),
    cmd('/say', '', [optional('内容')])
  ]);
  // 续行不找参数，原样并进说明
  assert.deepEqual(parseBotCommands('/mc <玩家名>\n<版本> 这是续行'), [
    cmd('/mc', '<版本> 这是续行', [required('玩家名')])
  ]);
});

test('params: anything that is not a clean token stays in the description', () => {
  const kept = [
    '<b>粗体</b> 标记后面紧跟文字',
    '[文档](https://example.com) 链接',
    '<玩家 名> 名字里有空格',
    '<> 空名字',
    '<:说明> 只有说明',
    '<a] 括号不成对',
    '[a> 括号不成对',
    '<a<b>> 嵌套',
    '< 5 人时不可用',
    '说明在前 <玩家名> 就不再是参数'
  ];
  for (const description of kept) {
    assert.deepEqual(parseBotCommands(`/x ${description}`), [cmd('/x', description)]);
  }
  // 参数和指令名之间必须有空白，否则整段都是指令名（和加参数之前一样）
  assert.deepEqual(parseBotCommands('/x<a> 说明'), [cmd('/x<a>', '说明')]);
  // 中间隔了一段说明，后面的标记不算
  assert.deepEqual(parseBotCommands('/x <a> 说明 [b]'), [cmd('/x', '说明 [b]', [required('a')])]);
});

test('params: a description that looks like a param token is escaped with a backslash', () => {
  const rows = [
    cmd('/x', '[测试版] 仅管理员可用'),
    cmd('/y', '<必看>', [required('a')]),
    cmd('/z', '\\[已经带反斜杠] 的说明'),
    cmd('/w', '\\\\<a> 两个反斜杠'),
    cmd('/v', '\\不像参数的反斜杠开头'),
    cmd('/u', '第一行\n[第二行] 不在指令行上，不用转义')
  ];
  const text = serializeBotCommands(rows);
  assert.equal(text, '/x \\[测试版] 仅管理员可用\n/y <a> \\<必看>\n/z \\\\[已经带反斜杠] 的说明\n/w \\\\\\<a> 两个反斜杠\n/v \\不像参数的反斜杠开头\n/u 第一行\n[第二行] 不在指令行上，不用转义');
  assert.deepEqual(parseBotCommands(text), rows);
});

test('serialize normalizes command names and drops rows without one', () => {
  assert.equal(normalizeBotCommandName(' he lp '), '/help');
  assert.equal(normalizeBotCommandName('/help'), '/help');
  assert.equal(normalizeBotCommandName(' // '), '');
  assert.equal(
    serializeBotCommands([
      cmd('help', ' 查看帮助 '),
      cmd('  ', '没有指令名的说明'),
      cmd('/', ''),
      cmd('/ro ll', '')
    ]),
    '/help 查看帮助\n/roll'
  );
});

test('serialize strips delimiter characters from params and drops unnamed ones', () => {
  assert.deepEqual(normalizeBotCommandParam(required(' 玩 家:<名> ', ' 要查的[玩家]\n ')), required('玩家名', '要查的 玩家'));
  assert.equal(formatBotCommandParam(required('a', '说明')), '<a>');
  assert.equal(formatBotCommandParam(optional('a', '说明'), true), '[a:说明]');
  assert.equal(formatBotCommandParam(optional('a'), true), '[a]');
  const rows = [cmd('mc', '查询', [required(' 玩 家 名 ', '要查的<玩家>'), optional(' : '), optional('版本', '  ')])];
  assert.equal(serializeBotCommands(rows), '/mc <玩家名:要查的 玩家> [版本] 查询');
});

test('parse(serialize(x)) round-trips anything parse can produce', () => {
  const samples = [
    '/help 查看帮助\n/ping',
    '/help\n第一行说明\n第二行说明\n/ping pong',
    '前言\n/a /b 不是两条\n续行\n\n/c',
    '/签到　每日签到\r\n/rank\t排行榜',
    '/mc <玩家名:要查的玩家> [版本] 查询原版信息数据\n/ban <用户> [时长:例如 1h 或 12:00]\n/say [内容]',
    '/mc <玩家名>\n<版本> 续行长得像参数\n/x <b>粗体</b>\n/y \\[转义] 说明\n/z [a] \\<b> 说明'
  ];
  for (const sample of samples) {
    const parsed = parseBotCommands(sample);
    assert.deepEqual(parseBotCommands(serializeBotCommands(parsed)), parsed);
  }
});

test('serialize keeps hand-built rows stable across a second round trip', () => {
  const rows = [
    cmd('help', '查看帮助\n\n/像指令的续行 会并回上一行\n普通续行'),
    cmd('/say', '/开头的说明留在同一行'),
    cmd('', '被丢弃'),
    cmd('/mc', '\n<版本> 首行为空时顶上来的续行', [required('玩 家', '说明\n换行'), optional('')])
  ];
  const once = parseBotCommands(serializeBotCommands(rows));
  assert.deepEqual(once, [
    cmd('/help', '查看帮助 /像指令的续行 会并回上一行\n普通续行'),
    cmd('/say', '/开头的说明留在同一行'),
    cmd('/mc', '<版本> 首行为空时顶上来的续行', [required('玩家', '说明 换行')])
  ]);
  assert.deepEqual(parseBotCommands(serializeBotCommands(once)), once);
});

test('matchBotCommandInput: which command is being typed and which param the caret is on', () => {
  const commands = parseBotCommands('/help 帮助\n/mc <玩家名> [版本] 查询\n/MC <别的> 同名的排在后面\n/roll [面数]');
  const at = (text) => {
    const match = matchBotCommandInput(text, commands);
    return match ? [match.command.command, match.paramIndex] : null;
  };
  assert.deepEqual(at('/mc'), ['/mc', 0]);
  assert.deepEqual(at('/mc '), ['/mc', 0]);
  assert.deepEqual(at('/mc Ste'), ['/mc', 0]);
  assert.deepEqual(at('/mc Steve '), ['/mc', 1]);
  assert.deepEqual(at('/mc  Steve \t 1.2'), ['/mc', 1]);
  // 指令名不分大小写，和面板的前缀过滤一致
  assert.deepEqual(at('/Mc Steve'), ['/mc', 0]);
  assert.deepEqual(at('/roll'), ['/roll', 0]);
  // 参数填完了
  assert.equal(at('/mc Steve 1.20 '), null);
  assert.equal(at('/mc Steve 1.20 多出来的'), null);
  assert.equal(at('/roll 6 '), null);
  // 没有参数的指令、不认识的指令、不在开头的指令
  assert.equal(at('/help'), null);
  assert.equal(at('/m'), null);
  assert.equal(at('/mcc Steve'), null);
  assert.equal(at(' /mc'), null);
  assert.equal(at('看 /mc Steve'), null);
  assert.equal(at(''), null);
  assert.equal(at('/'), null);
});
