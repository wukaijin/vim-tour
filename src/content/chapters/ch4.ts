import type { Level } from '../../game/types'
import { keysOf } from '../commands'

/**
 * 第 4 章 · 文本对象（PLAN §4）：iw aw i( a( i" a" it ip × operator
 * N=3（PLAN §2.1 第 4 章起）；每关 2 个变体——逐词一对一替换、标点与插入文本不变、parKeys 复用
 * （PLAN §2.4B；M4 起各章全量配变体，校验器 variant-count 断言拦截）。
 */
const CH123 = [
  'esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq',
  'w', 'b', 'e', 'zero', 'caret', 'dollar', 'gg', 'G',
  'f', 'F', 't', 'T', 'semicolon', 'comma',
  'd', 'c', 'y', 'J', 'count', 'dot',
] as const

/** 本章已教文本对象（逐关累积） */
const OBJ = {
  1: ['iw'],
  2: ['iw', 'aw'],
  3: ['iw', 'aw', 'iparen'],
  4: ['iw', 'aw', 'iparen', 'aparen'],
  5: ['iw', 'aw', 'iparen', 'aparen', 'iquote', 'aquote'],
  6: ['iw', 'aw', 'iparen', 'aparen', 'iquote', 'aquote', 'it', 'ip'],
} as const

const chapter4: Level[] = [
  {
    id: 'ch4-01',
    chapter: 4,
    title: '光标在词里也能整词改',
    brief: '句中有个错词，光标落在词中间：cw 只删到词尾，ciw 不看光标位置、整词替换。',
    hints: [
      'iw 是「光标所在的词」这个对象（不含空格）：操作符 + iw 整词作用，光标在词里哪都行。',
      '完整解：c i w new <Esc>（整词改成 new，退出插入）。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[1]]),
    teaches: ['iw'],
    texts: [
      {
        start: ['use oldval now'],
        target: ['use new now'],
        cursor: { line: 0, col: 6 },
        parKeys: 'ciwnew<Esc>',
      },
      {
        start: ['run badval go'],
        target: ['run new go'],
        cursor: { line: 0, col: 6 },
        parKeys: 'ciwnew<Esc>',
      },
    ],
  },
  {
    id: 'ch4-02',
    chapter: 4,
    title: '删词连空格',
    brief: '一头一尾各挂一个废词：daw 把词和相邻的空格一并删掉——行首吞后面的空格，行尾吞前面的。',
    hints: [
      'aw = 词 + 相邻一个空格；diw 只删词会在行尾留下多余的空格。',
      '完整解：d a w $ d a w（删行首废词，跳行尾，再删一个）。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[2]]),
    teaches: ['aw'],
    texts: [
      {
        start: ['junk one two junk'],
        target: ['one two'],
        cursor: { line: 0, col: 0 },
        parKeys: 'daw$daw',
      },
      {
        start: ['dud day sky dud'],
        target: ['day sky'],
        cursor: { line: 0, col: 0 },
        parKeys: 'daw$daw',
      },
    ],
  },
  {
    id: 'ch4-03',
    chapter: 4,
    title: '改括号里的',
    brief: '函数调用的参数换新：光标放进括号里（放在括号字符上也行），ci( 替换括号内的全部内容，括号保留。',
    hints: [
      'i( 是「这对括号里的内容」：光标在括号内或括号上都行。',
      '完整解：c i ( new <Esc>（括号里全部换成 new）。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[3]]),
    teaches: ['iparen'],
    texts: [
      {
        start: ['load(old)'],
        target: ['load(new)'],
        cursor: { line: 0, col: 5 },
        parKeys: 'ci(new<Esc>',
      },
      {
        start: ['call(bad)'],
        target: ['call(new)'],
        cursor: { line: 0, col: 5 },
        parKeys: 'ci(new<Esc>',
      },
    ],
  },
  {
    id: 'ch4-04',
    chapter: 4,
    title: '内层与整段',
    brief: '两层任务：第一行清空最内层括号里的内容（di(），第二行把括号连同内容整段删掉（da(）。',
    hints: [
      '嵌套时 i( 取包裹光标的最内层；a( 把括号本身也包进去。下一行用 F( 向左找到括号。',
      '完整解：d i ( j F ( d a (（清内层；下移，向左找 ( ，整段删）。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[4]]),
    teaches: ['aparen'],
    texts: [
      {
        start: ['go(fn(x), 1)', 'say(a) ok'],
        target: ['go(fn(), 1)', 'say ok'],
        cursor: { line: 0, col: 6 },
        parKeys: 'di(jF(da(',
      },
      {
        start: ['run(map(y), 2)', 'log(b) hi'],
        target: ['run(map(), 2)', 'log hi'],
        cursor: { line: 0, col: 8 },
        parKeys: 'di(jF(da(',
      },
    ],
  },
  {
    id: 'ch4-05',
    chapter: 4,
    title: '改与删字符串',
    brief: '两行各一个字符串任务：第一行 ci" 只换引号里的内容，第二行 da" 连引号一起删。',
    hints: [
      'i" 是引号里的内容、a" 连引号一起；光标在引号内或引号上都行。',
      '完整解：c i " new <Esc> j d a "（改第一行字符串；下移，整段删第二行的）。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[5]]),
    teaches: ['iquote', 'aquote'],
    texts: [
      {
        start: ['say("old")', 'drop("junk")'],
        target: ['say("new")', 'drop()'],
        cursor: { line: 0, col: 6 },
        parKeys: 'ci"new<Esc>jda"',
      },
      {
        start: ['log("bad")', 'cut("zz")'],
        target: ['log("new")', 'cut()'],
        cursor: { line: 0, col: 6 },
        parKeys: 'ci"new<Esc>jda"',
      },
    ],
  },
  {
    id: 'ch4-06',
    chapter: 4,
    title: '标签与段落',
    brief: '清理 HTML 草稿：dit 清空标签里的内容（标签对保留），dip 删掉一整个段落（空行分隔符留着）。',
    hints: [
      'it 是标签对里的内容，ip 是光标所在的段落（连续非空行）。',
      '完整解：d i t 2 j d i p（清空标题；下移两行到段落，整段删掉）。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[6]]),
    teaches: ['it', 'ip'],
    texts: [
      {
        start: ['<h1>old</h1>', '', 'para one', 'para two', '', 'tail end'],
        target: ['<h1></h1>', '', '', 'tail end'],
        cursor: { line: 0, col: 4 },
        parKeys: 'dit2jdip',
      },
      {
        start: ['<h1>bad</h1>', '', 'data x', 'data y', '', 'last row'],
        target: ['<h1></h1>', '', '', 'last row'],
        cursor: { line: 0, col: 4 },
        parKeys: 'dit2jdip',
      },
    ],
  },
  {
    id: 'ch4-07',
    chapter: 4,
    title: '第 4 章毕业考',
    brief: '毕业考：删注释行、改词、改字符串，再把两行并成一句。',
    hints: [
      '组合第 1–4 章：dd 删行、ciw 改词、ci" 改字符串、J 并行、f" 定位引号。',
      '完整解：d d w c i w new <Esc> J f " c i " z <Esc>。',
    ],
    allowedKeys: keysOf([...CH123, ...OBJ[6]]),
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['-- top', 'let old = 5', 'say("a") ok'],
        target: ['let new = 5 say("z") ok'],
        cursor: { line: 0, col: 0 },
        parKeys: 'ddwciwnew<Esc>Jf"ci"z<Esc>',
      },
      {
        start: ['// tip', 'var odd = 8', 'log("b") hi'],
        target: ['var new = 8 log("z") hi'],
        cursor: { line: 0, col: 0 },
        parKeys: 'ddwciwnew<Esc>Jf"ci"z<Esc>',
      },
    ],
  },
]

export default chapter4
