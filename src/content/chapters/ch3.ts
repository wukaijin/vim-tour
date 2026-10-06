import type { Level } from '../../game/types'
import { keysOf } from '../commands'

/**
 * 第 3 章 · 操作符+移动（PLAN §4）：d c y × motion、counts（2dd）、重复 `.`、J
 * N=2；每关 2 个变体——逐词一对一替换、标点与插入文本不变、parKeys 复用
 * （PLAN §2.4B；M4 起各章全量配变体，校验器 variant-count 断言拦截）。
 */
const CH12 = [
  'esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq',
  'replace', 'redo', 'appendEol',
  'w', 'b', 'e', 'zero', 'caret', 'dollar', 'gg', 'G',
  'f', 'F', 't', 'T', 'semicolon', 'comma',
  'matchparen', 'para',
] as const

const chapter3: Level[] = [
  {
    id: 'ch3-01',
    chapter: 3,
    title: '整词删除',
    brief: '行首混进两个杂词，光标正停在第一个上：用 dw 整词删掉。',
    hints: [
      'd 是「删到」操作符，后面接一个移动命令：dw = 删到下一个词首 = 整个词。',
      '完整解：dw dw（删完光标正好落在下一个杂词上）。',
    ],
    allowedKeys: keysOf([...CH12, 'd']),
    teaches: ['d'],
    texts: [
      {
        start: ['tmp log keep'],
        target: ['keep'],
        cursor: { line: 0, col: 0 },
        parKeys: 'dwdw',
      },
      {
        start: ['xx yy data'],
        target: ['data'],
        cursor: { line: 0, col: 0 },
        parKeys: 'dwdw',
      },
    ],
  },
  {
    id: 'ch3-02',
    chapter: 3,
    title: '删到行尾行首',
    brief: '第一行行尾挂着废注释，第二行行首压着杂词：d$ 删到行尾，d0 删到行首。',
    hints: [
      'd$ 删到行尾，d0 删到行首；先用 f / 定位，h 退一格把空格也吞进去。',
      '完整解：f / h d $ j 0 w d 0（定位注释删行尾；下一行回行首跳到保留词，删掉行首杂词）。',
    ],
    allowedKeys: keysOf([...CH12, 'd']),
    teaches: [],
    texts: [
      {
        start: ['keep tail // rm', 'zz keep'],
        target: ['keep tail', 'keep'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f/hd$j0wd0',
      },
      {
        start: ['hold end // xx', 'yy hold'],
        target: ['hold end', 'hold'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f/hd$j0wd0',
      },
    ],
  },
  {
    id: 'ch3-03',
    chapter: 3,
    title: '一个键改词',
    brief: '把句子里的 old 换成 new：cw 删掉旧词并直接开始输入新词。',
    hints: [
      'c 是「改到」操作符：cw 删掉这个词并进入插入模式，改词一键开始。',
      '完整解：w cw new <Esc>（跳到 old，改词，输入 new，退出）。',
    ],
    allowedKeys: keysOf([...CH12, 'd', 'c']),
    teaches: ['c'],
    texts: [
      {
        start: ['use old now'],
        target: ['use new now'],
        cursor: { line: 0, col: 0 },
        parKeys: 'wcwnew<Esc>',
      },
      {
        start: ['map old key'],
        target: ['map new key'],
        cursor: { line: 0, col: 0 },
        parKeys: 'wcwnew<Esc>',
      },
    ],
  },
  {
    id: 'ch3-04',
    chapter: 3,
    title: '抄一个词',
    brief: '把第二个词原样复制到行尾：yw 抄词，行尾补个空格，p 贴出来。',
    hints: [
      'y 是「复制到」操作符：yw 把当前词抄进寄存器，光标不动；p 贴出来。',
      '完整解：w yw $ a ␣ <Esc> p（跳到词上复制，行尾补空格再粘贴）。',
    ],
    allowedKeys: keysOf([...CH12, 'd', 'c', 'y']),
    teaches: ['y'],
    texts: [
      {
        start: ['one two'],
        target: ['one two two'],
        cursor: { line: 0, col: 0 },
        parKeys: 'wyw$a <Esc>p',
      },
      {
        start: ['hi yo'],
        target: ['hi yo yo'],
        cursor: { line: 0, col: 0 },
        parKeys: 'wyw$a <Esc>p',
      },
    ],
  },
  {
    id: 'ch3-05',
    chapter: 3,
    title: '合并与连删',
    brief: '前两行本是一句话：J 合并；中间两行废行：2dd 连删。',
    hints: [
      'J 把下一行接到本行尾，自动补空格；命令前加数字表示重复，2dd 一次删两行。',
      '完整解：J j 2dd（先合并前两行，下移到废行，连删两行）。',
    ],
    allowedKeys: keysOf([...CH12, 'd', 'c', 'y', 'J', 'count']),
    teaches: ['J', 'count'],
    texts: [
      {
        start: ['merge a', 'merge b', 'zz1', 'zz2', 'tail'],
        target: ['merge a merge b', 'tail'],
        cursor: { line: 0, col: 0 },
        parKeys: 'Jj2dd',
      },
      {
        start: ['link p', 'link q', 'yy1', 'yy2', 'end'],
        target: ['link p link q', 'end'],
        cursor: { line: 0, col: 0 },
        parKeys: 'Jj2dd',
      },
    ],
  },
  {
    id: 'ch3-06',
    chapter: 3,
    title: '再来一次',
    brief: '左边四个杂词两两一组：d2w 删掉前两个，再按 . 重复一次删掉后两个。',
    hints: [
      '数字可以插在中间：d2w 删两个词；. 重复上一次修改，同样的动作不用再敲一遍。',
      '完整解：d 2 w .（删两个词，再重复一次）。',
    ],
    allowedKeys: keysOf([...CH12, 'd', 'c', 'y', 'J', 'count', 'dot']),
    teaches: ['dot'],
    texts: [
      {
        start: ['q1 q2 q3 q4 go'],
        target: ['go'],
        cursor: { line: 0, col: 0 },
        parKeys: 'd2w.',
      },
      {
        start: ['w1 w2 w3 w4 ok'],
        target: ['ok'],
        cursor: { line: 0, col: 0 },
        parKeys: 'd2w.',
      },
    ],
  },
  {
    id: 'ch3-06a',
    chapter: 3,
    title: '快捷键三连',
    brief: 'D 删到行尾、C 改到行尾、P 贴到上一行——d$、c$、行粘贴的高频合体键。（s/S 与插入模式 <C-w> 见教学卡。）',
    hints: [
      'D = d$ 删光标起到行尾；C = c$ 删到行尾直接开输；yyP 把整行贴到上一行。j 会带着列走，换行后按 0 回行首。',
      '完整解：f / D j 0 C new <Esc> j 0 f / D y y P（两行删注释，中间行改写，复制末行贴上去）。',
    ],
    allowedKeys: keysOf([
      ...CH12,
      'd', 'c', 'y', 'J', 'count', 'dot',
      'putBefore', 'eolops', 'chgenter', 'insdelword',
    ]),
    teaches: ['putBefore', 'eolops', 'chgenter', 'insdelword'],
    texts: [
      {
        start: ['keep me//junk', 'old aaa bbb', 'hold//junk'],
        target: ['keep me', 'new', 'hold', 'hold'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f/Dj0Cnew<Esc>j0f/DyyP',
      },
      {
        start: ['stay ok//junk', 'old x y', 'keep//junk'],
        target: ['stay ok', 'new', 'keep', 'keep'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f/Dj0Cnew<Esc>j0f/DyyP',
      },
    ],
  },
  {
    id: 'ch3-07',
    chapter: 3,
    title: '第 3 章毕业考',
    brief: '毕业考：删注释行、把 old 改成 new、把最后一行并上来。',
    hints: [
      '组合第 1–3 章：dd 删行、cw 改词、J 并行。',
      '完整解：dd w cw new <Esc> j J。',
    ],
    allowedKeys: keysOf([...CH12, 'd', 'c', 'y', 'J', 'count', 'dot', 'putBefore', 'eolops', 'chgenter', 'insdelword']),
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['-- kill', 'let old = 1', 'let two = 2', 'end'],
        target: ['let new = 1', 'let two = 2 end'],
        cursor: { line: 0, col: 0 },
        parKeys: 'ddwcwnew<Esc>jJ',
      },
      {
        start: ['// drop', 'var old = 9', 'var two = 3', 'fin'],
        target: ['var new = 9', 'var two = 3 fin'],
        cursor: { line: 0, col: 0 },
        parKeys: 'ddwcwnew<Esc>jJ',
      },
    ],
  },
]

export default chapter3
