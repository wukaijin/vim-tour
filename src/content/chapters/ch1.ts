import type { Level } from '../../game/types'
import { keysOf } from '../commands'

/**
 * 第 1 章 · 生存（PLAN §4）：i a o O Esc hjkl x dd yy p u :wq，模式概念。
 * N=1（defaultRequiredStreak）。ch1 变体延后为已知妥协（PLAN §2.4B / §13）。
 */
const chapter1: Level[] = [
  {
    id: 'ch1-01',
    chapter: 1,
    title: '进入插入模式',
    brief: '少打了开头的 q：按 i 在光标前进入插入模式，补上它，再按 Esc 退出。',
    hints: [
      'i 进入插入模式开始打字，<Esc> 退出。',
      '完整解：i q <Esc>（在光标前插入 q，然后退出插入模式）。',
    ],
    allowedKeys: keysOf(['esc', 'i']),
    teaches: ['esc', 'i'],
    texts: [
      {
        start: ['vim is uick'],
        target: ['vim is quick'],
        cursor: { line: 0, col: 7 },
        parKeys: 'iq<Esc>',
      },
    ],
  },
  {
    id: 'ch1-02',
    chapter: 1,
    title: '移动与删除',
    brief: '每行开头误加了一个「-」：用 h j k l 移动，用 x 删掉它们。',
    hints: [
      'x 删除光标处字符；j 下一行。删完一行按 j 再删下一行。',
      '完整解：x j x j x（删、下移、删、下移、删）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x']),
    teaches: ['hjkl', 'x'],
    texts: [
      {
        start: ['-red', '-green', '-blue'],
        target: ['red', 'green', 'blue'],
        cursor: { line: 0, col: 0 },
        parKeys: 'xjxjx',
      },
    ],
  },
  {
    id: 'ch1-03',
    chapter: 1,
    title: '光标后插入',
    brief: '给每个动物补上复数 s：光标落在词尾字母上时，用 a 在它后面插入。',
    hints: [
      'a 在光标字符之后进入插入模式——比 i 更适合往词尾补字。',
      '完整解：a s <Esc> j a s <Esc>（补 s，下移一行，再补 s）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a']),
    teaches: ['a'],
    texts: [
      {
        start: ['three cat', 'two dog'],
        target: ['three cats', 'two dogs'],
        cursor: { line: 0, col: 8 },
        parKeys: 'as<Esc>jas<Esc>',
      },
    ],
  },
  {
    id: 'ch1-04',
    chapter: 1,
    title: '开新行',
    brief: '列表缺了两行：用 O 在上面插入 zero，用 o 在 first 下面插入 second。',
    hints: [
      'O 在当前行上方开新行，o 在下方开新行，都会直接进入插入模式。',
      '完整解：O zero <Esc>（上插 zero）j o second <Esc>（下移后下插 second）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o']),
    teaches: ['o'],
    texts: [
      {
        start: ['first', 'third'],
        target: ['zero', 'first', 'second', 'third'],
        cursor: { line: 0, col: 4 },
        parKeys: 'Ozero<Esc>josecond<Esc>',
      },
    ],
  },
  {
    id: 'ch1-05',
    chapter: 1,
    title: '整行三件套',
    brief: '删掉多余的 beta 行，再把 alpha 复制到末尾。手滑了就按 u 撤销。',
    hints: [
      'dd 删整行，yy 复制整行，p 粘贴到下一行；u 撤销上一步。',
      '完整解：dd k k yy j j p（删 beta，回到顶部复制 alpha，去末尾粘贴）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u']),
    teaches: ['dd', 'yy', 'p', 'u'],
    texts: [
      {
        start: ['alpha', 'beta', 'gamma', 'beta'],
        target: ['alpha', 'beta', 'gamma', 'alpha'],
        cursor: { line: 3, col: 0 },
        parKeys: 'ddkkyyjjp',
      },
    ],
  },
  {
    id: 'ch1-06',
    chapter: 1,
    title: '收工仪式',
    brief: '在下一行补上「stay foolish」，然后按 :wq 保存退出。',
    hints: [
      'o 开新行输入；完成后按 : 进入命令行，wq 回车即保存退出。',
      '完整解：o stay foolish <Esc>，然后 : w q <CR>。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq']),
    teaches: ['wq'],
    texts: [
      {
        start: ['stay hungry'],
        target: ['stay hungry', 'stay foolish'],
        cursor: { line: 0, col: 4 },
        parKeys: 'ostay foolish<Esc>',
        // par 不含 :wq<CR>：success 在 buffer 达标瞬间触发，仪式键不参与星级经济
      },
    ],
  },
  {
    id: 'ch1-06a',
    chapter: 1,
    title: '一键换字',
    brief: 'vsn 两个字母打错了，行尾还漏了感叹号：r 原地换字不进插入模式，A 直接跳行尾补写。（u 撤多了？<C-r> 重做回来。）',
    hints: [
      'r{字符} 把光标处字符原地换掉，光标不动；A 跳到行尾进入插入模式。',
      '完整解：l r i l r m A ! <Esc>（右移到 s，换成 i；再右移换 n 为 m，行尾补 !）。',
    ],
    allowedKeys: keysOf([
      'esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq',
      'replace', 'redo', 'appendEol',
    ]),
    teaches: ['replace', 'redo', 'appendEol'],
    texts: [
      {
        start: ['vsn is fun'],
        target: ['vim is fun!'],
        cursor: { line: 0, col: 0 },
        parKeys: 'lrilrmA!<Esc>',
      },
    ],
  },
  {
    id: 'ch1-07',
    chapter: 1,
    title: '第 1 章毕业考',
    brief: '毕业考：标题补成「todo list」，删掉 fold 行，再把 call mom 复制到末尾。',
    hints: [
      '这关没有新命令——把本章学的组合起来：a 插入、dd 删行、yy+p 复制行。',
      '完整解：a space l i s t <Esc> j j dd yy p（补标题，删 fold，复制 call mom）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq']),
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['todo', '- wash', '- fold', '- call mom'],
        target: ['todo list', '- wash', '- call mom', '- call mom'],
        cursor: { line: 0, col: 3 },
        parKeys: 'a list<Esc>jjddyyp',
      },
    ],
  },
]

export default chapter1
