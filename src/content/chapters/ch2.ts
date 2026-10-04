import type { Level } from '../../game/types'
import { keysOf } from '../commands'

/**
 * 第 2 章 · 词与行移动（PLAN §4）：w b e 0 ^ $ gg G {n}gg f F t T ; ,
 * N=2；每关 2 个变体——逐词一对一替换、标点与插入文本不变、parKeys 复用
 * （PLAN §2.4B：词数不变 ⇒ par 复用；ch2 变体不可砍，PLAN §11.2）。
 */
const chapter2: Level[] = [
  {
    id: 'ch2-01',
    chapter: 2,
    title: '词间跳跃',
    brief: '每个词开头误加了一个「-」：用 w 逐词前进，用 x 删掉。',
    hints: [
      'w 跳到下一个词的开头，b 往回跳；x 删光标处字符。',
      '完整解：x w x w x（删一个，跳一个词，再删）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b']),
    teaches: ['w', 'b'],
    texts: [
      {
        start: ['-tea -cake -jam'],
        target: ['tea cake jam'],
        cursor: { line: 0, col: 0 },
        parKeys: 'xwxwx',
      },
      {
        start: ['-sky -moon -star'],
        target: ['sky moon star'],
        cursor: { line: 0, col: 0 },
        parKeys: 'xwxwx',
      },
    ],
  },
  {
    id: 'ch2-02',
    chapter: 2,
    title: '词尾补字',
    brief: '给句中的名词补上复数 s：e 跳到词尾字母，a 在其后插入。',
    hints: [
      'e 跳到当前词的末字符，配合 a 正好在词尾补字。',
      '完整解：w e a s <Esc> w w w e a s <Esc>（跳到词、到词尾、补 s）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b', 'e']),
    teaches: ['e'],
    texts: [
      {
        start: ['one cat and two dog'],
        target: ['one cats and two dogs'],
        cursor: { line: 0, col: 0 },
        parKeys: 'weas<Esc>wwweas<Esc>',
      },
      {
        start: ['one bird and two frog'],
        target: ['one birds and two frogs'],
        cursor: { line: 0, col: 0 },
        parKeys: 'weas<Esc>wwweas<Esc>',
      },
    ],
  },
  {
    id: 'ch2-03',
    chapter: 2,
    title: '行首与行尾',
    brief: '第一行行首插入「- 」，并把两行行尾多余的「;」删掉。',
    hints: [
      '^ 跳到本行第一个非空白字符，$ 跳到行尾；x 删掉行尾的分号。',
      '完整解：^ i - space <Esc> $ x j x（$ 设过的行尾列会黏住：j 落在分号上，直接 x 删掉）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b', 'e', 'zero', 'caret', 'dollar']),
    teaches: ['zero', 'caret', 'dollar'],
    texts: [
      {
        start: ['  alpha;', '  beta;'],
        target: ['  - alpha', '  beta'],
        cursor: { line: 0, col: 0 },
        parKeys: '^i- <Esc>$xjx',
      },
      {
        start: ['  delta;', '  omega;'],
        target: ['  - delta', '  omega'],
        cursor: { line: 0, col: 0 },
        parKeys: '^i- <Esc>$xjx',
      },
    ],
  },
  {
    id: 'ch2-04',
    chapter: 2,
    title: '在文件里瞬移',
    brief: '把第 4 行复制到文件末尾，再删掉第 2 行。',
    hints: [
      '数字 + gg 跳到指定行（如 4gg），G 跳到最后一行；yy 复制、p 粘贴、dd 删行。',
      '完整解：4gg yy G p 2gg dd（跳第 4 行复制，去末尾粘贴，跳第 2 行删除）。',
    ],
    allowedKeys: [
      ...keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b', 'e', 'zero', 'caret', 'dollar', 'gg', 'G']),
      '2gg',
      '3gg',
      '4gg',
      '5gg',
    ],
    teaches: ['gg', 'G'],
    texts: [
      {
        start: ['1 first', '2 second', '3 third', '4 fourth', '5 fifth'],
        target: ['1 first', '3 third', '4 fourth', '5 fifth', '4 fourth'],
        cursor: { line: 0, col: 0 },
        parKeys: '4ggyyGp2ggdd',
      },
      {
        start: ['1 alpha', '2 bravo', '3 charlie', '4 delta', '5 echo'],
        target: ['1 alpha', '3 charlie', '4 delta', '5 echo', '4 delta'],
        cursor: { line: 0, col: 0 },
        parKeys: '4ggyyGp2ggdd',
      },
    ],
  },
  {
    id: 'ch2-05',
    chapter: 2,
    title: '行内找字符',
    brief: '每个词里都混进了一个「x」：用 f x 找到它删掉，用 ; 重复查找。',
    hints: [
      'f{char} 在本行向右查找字符并跳过去；; 重复上一次查找。',
      '完整解：f x x ; x ; x（找到删掉，再找下一个）。',
    ],
    allowedKeys: keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b', 'e', 'zero', 'caret', 'dollar', 'gg', 'G', 'f', 'F', 't', 'T', 'semicolon', 'comma']),
    teaches: ['f', 'F', 't', 'T', 'semicolon', 'comma'],
    texts: [
      {
        start: ['ax bxc dx'],
        target: ['a bc d'],
        cursor: { line: 0, col: 0 },
        parKeys: 'fxx;x;x',
      },
      {
        start: ['ox kxz mx'],
        target: ['o kz m'],
        cursor: { line: 0, col: 0 },
        parKeys: 'fxx;x;x',
      },
    ],
  },
  {
    id: 'ch2-06',
    chapter: 2,
    title: '综合练习',
    brief: '把第 1 行复制到末尾，删掉第 2 行，再给新的最后一行加上「!」。',
    hints: [
      '没有新命令：yy+p 复制、G 去末尾、2gg 跳行、dd 删除、$a 行尾追加。',
      '完整解：yy G p 2gg dd $ a ! <Esc>。',
    ],
    allowedKeys: [
      ...keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b', 'e', 'zero', 'caret', 'dollar', 'gg', 'G', 'f', 'F', 't', 'T', 'semicolon', 'comma']),
      '2gg',
      '3gg',
      '4gg',
      '5gg',
    ],
    teaches: [],
    texts: [
      {
        start: ['alpha beta', 'gamma delta', 'epsilon zeta'],
        target: ['alpha beta', 'epsilon zeta!', 'alpha beta'],
        cursor: { line: 0, col: 0 },
        parKeys: 'yyGp2ggdd$a!<Esc>',
      },
      {
        start: ['one two', 'three four', 'five six'],
        target: ['one two', 'five six!', 'one two'],
        cursor: { line: 0, col: 0 },
        parKeys: 'yyGp2ggdd$a!<Esc>',
      },
    ],
  },
  {
    id: 'ch2-07',
    chapter: 2,
    title: '第 2 章毕业考',
    brief: '毕业考：去掉第一行缩进和混入的「x」，给后两行行尾加标点。',
    hints: [
      '组合第 1–2 章所学：0 回行首、f x 定位杂字、$ a 行尾追加。',
      '完整解：0 x x f x x j $ a ; <Esc> j $ a ! <Esc>。',
    ],
    allowedKeys: [
      ...keysOf(['esc', 'i', 'hjkl', 'x', 'a', 'o', 'dd', 'yy', 'p', 'u', 'wq', 'w', 'b', 'e', 'zero', 'caret', 'dollar', 'gg', 'G', 'f', 'F', 't', 'T', 'semicolon', 'comma']),
      '2gg',
      '3gg',
      '4gg',
      '5gg',
    ],
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['  loaxd config', '  save state', 'the end'],
        target: ['load config', '  save state;', 'the end!'],
        cursor: { line: 0, col: 0 },
        parKeys: '0xxfxxj$a;<Esc>j$a!<Esc>',
      },
      {
        start: ['  boxst core', '  keep mode', 'the end'],
        target: ['bost core', '  keep mode;', 'the end!'],
        cursor: { line: 0, col: 0 },
        parKeys: '0xxfxxj$a;<Esc>j$a!<Esc>',
      },
    ],
  },
]

export default chapter2
