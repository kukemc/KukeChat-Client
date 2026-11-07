/**
 * 没装的扩展积木（`myExt.doThing(1, "a")`）：从写法上猜出它长什么样，好让编译器先把它当成一块占位积木编下去。
 *
 * 编译器只认 schema 里有的积木，聊天里又不知道别人作品里装了什么扩展 —— 照搬的话一块不认识的扩展积木就让整张卡片退回代码。
 * 所以 engine.ts 在编译报 `E_UNKNOWN_BLOCK`（而且前缀不是核心分类、也不是认识的扩展）时，拿这里扫出来的用法
 * 现编一条 schema 再编一遍：
 *
 * - **形状看它写在哪**：单独成一句是指令（command）；写在 if / while 的条件里、`!` / `&&` / `||` 两边、
 *   或者认识的积木的布尔槽里是布尔（boolean）；别的表达式位置是报告（reporter）。
 *   顶层一句、名字以 when 开头、最后一个参数是 `() => { ... }` 的是帽子（hat），回调就是帽子下面那串。
 * - **参数**：每个位置参数一个输入 ARG1、ARG2…；`() => { ... }` 是 C 形口（SUBSTACK、SUBSTACK2…）；
 *   只有一个对象参数（`myExt.go({TEXT: "hi"})`）时键就是输入名 —— 这种写法拖进装了这个扩展的作品后参数也接得上。
 *   数字字面量给数字框，比较 / 逻辑表达式给布尔槽，其余给文字框。
 *
 * 只是给画图用的猜测：拖进 Gandi 的 XML 里仍是真操作码（`myExt_doThing`），装了那个扩展的作品里就是真积木。
 */
import { parse } from 'acorn';
import type { BlockSpec } from '@/vendor/gandi-dsl/compiler';

export type PlaceholderShape = 'command' | 'reporter' | 'boolean' | 'hat';

export interface PlaceholderInput {
  name: string;
  kind: 'string' | 'number' | 'boolean' | 'stack';
}

export interface PlaceholderSpec {
  opcode: string;
  /** 扩展 id（`myExt`、`a.b`、`my-ext`）。 */
  extensionId: string;
  /** 积木上的字：`myExt.doThing`。 */
  label: string;
  shape: PlaceholderShape;
  inputs: PlaceholderInput[];
}

/* acorn 的 ESTree 节点：只写用得到的字段 */
interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

type Context = 'statement' | 'value' | 'condition';

const isNode = (value: unknown): value is Node => Boolean(value) && typeof value === 'object' && typeof (value as Node).type === 'string';

/** 装饰器（`@at(10, 20)`、`@warp`）acorn 不认：换成等长的空格，位置不变。 */
function maskDecorators(source: string): string {
  return source.replace(/@[A-Za-z_]\w*(\s*\([^()\n]*\))?/g, (match) => match.replace(/[^\n]/g, ' '));
}

/** 成员链 → 扩展 id：`a` / `a.b` / `ext["my-ext"]`。认不出返回 null。 */
function extensionIdOf(object: Node): string | null {
  if (object.type === 'Identifier') return String(object.name);
  if (object.type === 'MemberExpression') {
    const inner = object.object as Node;
    const property = object.property as Node;
    if (object.computed) {
      if (inner.type === 'Identifier' && inner.name === 'ext' && property.type === 'Literal' && typeof property.value === 'string') return property.value;
      return null;
    }
    const head = extensionIdOf(inner);
    return head && property.type === 'Identifier' ? `${head}.${String(property.name)}` : null;
  }
  return null;
}

function calleeOf(call: Node): { extensionId: string; name: string } | null {
  const callee = call.callee as Node;
  if (!isNode(callee) || callee.type !== 'MemberExpression') return null;
  const property = callee.property as Node;
  const name = callee.computed
    ? property.type === 'Literal' && typeof property.value === 'string' ? property.value : null
    : property.type === 'Identifier' ? String(property.name) : null;
  const extensionId = extensionIdOf(callee.object as Node);
  return name && extensionId ? { extensionId, name } : null;
}

const COMPARISON = new Set(['<', '>', '<=', '>=', '==', '!=', '===', '!==']);

function isFunction(node: Node): boolean {
  return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function argKind(node: Node): PlaceholderInput['kind'] {
  if (isFunction(node) && (node.body as Node)?.type === 'BlockStatement') return 'stack';
  if (node.type === 'Literal' && typeof node.value === 'number') return 'number';
  if (node.type === 'UnaryExpression' && node.operator === '-' && (node.argument as Node)?.type === 'Literal') return 'number';
  if (node.type === 'Literal' && typeof node.value === 'boolean') return 'boolean';
  if (node.type === 'LogicalExpression' || (node.type === 'UnaryExpression' && node.operator === '!')) return 'boolean';
  if (node.type === 'BinaryExpression' && COMPARISON.has(String(node.operator))) return 'boolean';
  return 'string';
}

/** 括号（preserveParens 下的 ParenthesizedExpression）剥掉。 */
function unparen(node: Node): Node {
  let current = node;
  while (current.type === 'ParenthesizedExpression' && isNode(current.expression)) current = current.expression;
  return current;
}

export interface ScanOptions {
  /** 认识的积木的布尔槽：`control.wait_until(myExt.ready())` 里的 myExt.ready 是布尔。 */
  booleanSlot?: (opcode: string, index: number) => boolean;
}

/**
 * 扫一遍源文里所有 `扩展.积木(...)` 调用的用法，按操作码（`扩展id_积木名`）记第一次的形状和最多的参数。
 * 解析不了（语法错）返回空表：那种情况编译器自己会报 E_PARSE。
 */
export function scanExtensionCalls(source: string, options: ScanOptions = {}): Map<string, PlaceholderSpec> {
  const found = new Map<string, PlaceholderSpec>();
  let program: Node;
  try {
    program = parse(maskDecorators(source), { ecmaVersion: 2020, preserveParens: true, allowReturnOutsideFunction: true }) as unknown as Node;
  } catch {
    return found;
  }

  const record = (call: Node, context: Context, topLevel: boolean): void => {
    const callee = calleeOf(call);
    if (!callee) return;
    const opcode = `${callee.extensionId}_${callee.name}`;
    const args = (call.arguments as Node[]).map(unparen);
    let inputs: PlaceholderInput[];
    let shape: PlaceholderShape = context === 'statement' ? 'command' : context === 'condition' ? 'boolean' : 'reporter';
    const last = args[args.length - 1];
    let positional = args;
    if (context === 'statement' && topLevel && /^when/i.test(callee.name) && last && isFunction(last)) {
      shape = 'hat';
      positional = args.slice(0, -1);
    }
    if (positional.length === 1 && positional[0].type === 'ObjectExpression') {
      inputs = [];
      for (const property of positional[0].properties as Node[]) {
        const key = property.key as Node | undefined;
        const name = key?.type === 'Identifier' ? String(key.name) : key?.type === 'Literal' ? String(key.value) : null;
        if (name && property.type === 'Property') inputs.push({ name, kind: argKind(unparen(property.value as Node)) });
      }
    } else {
      let values = 0;
      let stacks = 0;
      inputs = positional.map((arg) => {
        const kind = argKind(arg);
        if (kind === 'stack') {
          stacks += 1;
          return { name: stacks === 1 ? 'SUBSTACK' : `SUBSTACK${stacks}`, kind };
        }
        values += 1;
        return { name: `ARG${values}`, kind };
      });
    }
    const label = `${/^[A-Za-z_$][\w$.]*$/.test(callee.extensionId) ? callee.extensionId : `ext[${JSON.stringify(callee.extensionId)}]`}.${callee.name}`;
    const prior = found.get(opcode);
    if (!prior) {
      found.set(opcode, { opcode, extensionId: callee.extensionId, label, shape, inputs });
    } else if (inputs.length > prior.inputs.length && inputs.every((input, index) => !prior.inputs[index] || prior.inputs[index].name === input.name)) {
      // 后面的写法参数更多（第一次少写了几个）：形状不动，参数按多的来
      prior.inputs = [...prior.inputs, ...inputs.slice(prior.inputs.length)];
    }
  };

  const walk = (value: unknown, context: Context, topLevel = false): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, context, topLevel);
      return;
    }
    if (!isNode(value)) return;
    const node = value;
    switch (node.type) {
      case 'Program':
        walk(node.body, 'statement', true);
        return;
      case 'ExpressionStatement': {
        const expression = unparen(node.expression as Node);
        if (expression.type === 'CallExpression') {
          record(expression, 'statement', topLevel);
          walkCall(expression);
        } else {
          walk(expression, 'value');
        }
        return;
      }
      case 'BlockStatement':
        walk(node.body, 'statement');
        return;
      case 'IfStatement':
        walk(node.test, 'condition');
        walk(node.consequent, 'statement');
        walk(node.alternate, 'statement');
        return;
      case 'WhileStatement':
      case 'DoWhileStatement':
        walk(node.test, 'condition');
        walk(node.body, 'statement');
        return;
      case 'ForStatement':
        walk(node.init, 'value');
        walk(node.test, 'condition');
        walk(node.update, 'value');
        walk(node.body, 'statement');
        return;
      case 'ConditionalExpression':
        walk(node.test, 'condition');
        walk(node.consequent, 'value');
        walk(node.alternate, 'value');
        return;
      case 'LogicalExpression':
        walk(node.left, 'condition');
        walk(node.right, 'condition');
        return;
      case 'UnaryExpression':
        walk(node.argument, node.operator === '!' ? 'condition' : 'value');
        return;
      case 'ParenthesizedExpression':
        walk(node.expression, context);
        return;
      case 'CallExpression':
        record(node, context, false);
        walkCall(node);
        return;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        walk(node.body, (node.body as Node)?.type === 'BlockStatement' ? 'statement' : 'value');
        return;
      default:
        for (const [key, child] of Object.entries(node)) {
          if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
          if (isNode(child) || Array.isArray(child)) walk(child, 'value');
        }
    }
  };

  const walkCall = (call: Node): void => {
    const callee = calleeOf(call);
    const opcode = callee ? `${callee.extensionId}_${callee.name}` : '';
    (call.arguments as Node[]).forEach((arg, index) => {
      walk(arg, opcode && options.booleanSlot?.(opcode, index) ? 'condition' : 'value');
    });
    const target = call.callee as Node;
    if (isNode(target) && target.type !== 'MemberExpression') walk(target, 'value');
  };

  walk(program, 'statement', true);
  return found;
}

/** 占位积木的 schema 条目（编译器的 BlockSpec 形状）。 */
export function placeholderSchema(spec: PlaceholderSpec): BlockSpec {
  const inputs: BlockSpec['inputs'] = {};
  for (const input of spec.inputs) {
    inputs[input.name] = input.kind === 'stack' ? { type: 'stack' }
      : input.kind === 'boolean' ? { type: 'boolean' }
      : input.kind === 'number' ? { type: 'number', shadowOpcode: 'math_number' }
      : { type: 'string', shadowOpcode: 'text' };
  }
  const branchCount = spec.inputs.filter((input) => input.kind === 'stack').length;
  return {
    shape: spec.shape,
    inputs,
    fields: {},
    parameters: spec.inputs.map((input) => input.name),
    category: spec.extensionId,
    ...(branchCount ? { branchCount } : {}),
    text: { en: spec.label },
    extension: { id: spec.extensionId }
  };
}
