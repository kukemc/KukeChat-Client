import { loadLanguages, parse } from 'scratchblocks/syntax/index.js';
import { init, makeStyle, newView } from 'scratchblocks/scratch3/index.js';
import zhCn from 'scratchblocks/locales/zh-cn.json';

/**
 * 登录页积木的渲染器（scratchblocks@3.7.1，scratch3 主题）。这个文件只被动态 import，单独成块，
 * 登录页先出表单、积木随后补上。只装中文一种语言包，不带 translations.js 那一大包。
 */

init(window);
loadLanguages({ zh_cn: zhCn });

export interface SbRenderer {
  /** 把一段 scratchblocks 代码渲染成 SVG（没有挂到页面上）。 */
  render(code: string, languages: string[]): SVGSVGElement;
  /** scratch3 主题的样式表文本，由调用方塞进自己所在的 document 或 ShadowRoot。 */
  cssText: string;
}

const cssText = makeStyle().textContent ?? '';

export const renderer: SbRenderer = {
  render(code, languages) {
    return newView(parse(code, { languages }), { style: 'scratch3', scale: 1 }).render();
  },
  cssText
};
