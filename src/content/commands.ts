/**
 * 命令元数据表（PLAN §9.4）：教学卡、两级提示、按键白名单、内容校验器的
 * 「已教集」都引用这里。MVP 覆盖第 1–2 章；后续章节在此追加。
 */

export type CommandMode = 'normal' | 'insert' | 'visual' | 'cmdline' | 'any'

export interface CommandMeta {
  /** 唯一 id，Level.teaches 引用它 */
  id: string
  /** 展示记法：空格分隔多个独立按键（'h j k l'），特殊键用尖括号（'<Esc>'） */
  keys: string
  mode: CommandMode
  desc: string
  /** 教学卡示例：按键序列 + 一句话效果 */
  example: { keys: string; effect: string }
  /** 白名单可用的等价序列；缺省 = keys 按空白拆分 */
  seqs?: string[]
  /** 计数形态（如 {n}gg）：allowedKeys 里的序列匹配它即视为已教 */
  pattern?: RegExp
  chapter: number
}

export const COMMANDS: CommandMeta[] = [
  // ========== 第 1 章 · 生存 ==========
  {
    id: 'esc',
    keys: '<Esc>',
    mode: 'any',
    desc: '回到普通模式；也用来取消敲了一半的命令。',
    example: { keys: '<Esc>', effect: '从插入模式退回普通模式' },
    chapter: 1,
  },
  {
    id: 'i',
    keys: 'i',
    mode: 'normal',
    desc: '在光标前进入插入模式，开始打字。',
    example: { keys: 'im_<Esc>', effect: '在光标处插入字母 m 后退出插入模式' },
    chapter: 1,
  },
  {
    id: 'hjkl',
    keys: 'h j k l',
    mode: 'normal',
    desc: '移动光标：左 / 下 / 上 / 右。vim 不用方向键。',
    example: { keys: 'jl', effect: '下移一行，再右移一格' },
    chapter: 1,
  },
  {
    id: 'x',
    keys: 'x',
    mode: 'normal',
    desc: '删除光标处的一个字符。',
    example: { keys: 'x', effect: '删掉光标所在字符' },
    chapter: 1,
  },
  {
    id: 'a',
    keys: 'a',
    mode: 'normal',
    desc: '在光标后进入插入模式（append）——往单词末尾补字用 a 而不是 i。',
    example: { keys: 'as<Esc>', effect: '在光标字符后面补一个 s' },
    chapter: 1,
  },
  {
    id: 'o',
    keys: 'o O',
    mode: 'normal',
    desc: '在下方 / 上方开一个新行并进入插入模式。',
    example: { keys: 'onew line<Esc>', effect: '在当前行下面新增一行并输入文字' },
    chapter: 1,
  },
  {
    id: 'dd',
    keys: 'dd',
    mode: 'normal',
    desc: '删除整行（删除的内容进寄存器，可以粘贴回来）。',
    example: { keys: 'dd', effect: '删掉光标所在行' },
    chapter: 1,
  },
  {
    id: 'yy',
    keys: 'yy',
    mode: 'normal',
    desc: '复制（yank）整行到寄存器。',
    example: { keys: 'yyp', effect: '复制当前行并粘贴到下一行' },
    chapter: 1,
  },
  {
    id: 'p',
    keys: 'p',
    mode: 'normal',
    desc: '粘贴寄存器内容：整行内容贴到当前行下方。',
    example: { keys: 'p', effect: '把最近复制/删除的行贴到下面' },
    chapter: 1,
  },
  {
    id: 'u',
    keys: 'u',
    mode: 'normal',
    desc: '撤销上一次修改。手滑了就按 u，随时反悔。',
    example: { keys: 'u', effect: '撤销刚才的修改' },
    chapter: 1,
  },
  {
    id: 'wq',
    keys: ':wq',
    mode: 'cmdline',
    desc: '保存并退出（write & quit）——vim 的「收工」仪式。',
    example: { keys: ':wq<CR>', effect: '保存文件并退出 vim' },
    seqs: [':wq', ':w', ':q'],
    chapter: 1,
  },

  // ========== 第 2 章 · 词与行移动 ==========
  {
    id: 'w',
    keys: 'w',
    mode: 'normal',
    desc: '跳到下一个词的开头（word）。',
    example: { keys: 'w', effect: '光标移到下一个词的首字符' },
    chapter: 2,
  },
  {
    id: 'b',
    keys: 'b',
    mode: 'normal',
    desc: '跳回上一个词的开头（back）。',
    example: { keys: 'b', effect: '光标移到上一个词的首字符' },
    chapter: 2,
  },
  {
    id: 'e',
    keys: 'e',
    mode: 'normal',
    desc: '跳到当前（或下一个）词的末字符（end）。',
    example: { keys: 'ea!<Esc>', effect: '在单词末尾接一个感叹号' },
    chapter: 2,
  },
  {
    id: 'zero',
    keys: '0',
    mode: 'normal',
    desc: '跳到行首第一列（含缩进空白之前）。',
    example: { keys: '0', effect: '光标移到第 0 列' },
    chapter: 2,
  },
  {
    id: 'caret',
    keys: '^',
    mode: 'normal',
    desc: '跳到本行第一个非空白字符——缩进代码的「有效行首」。',
    example: { keys: '^', effect: '光标移到本行第一个非空格字符' },
    chapter: 2,
  },
  {
    id: 'dollar',
    keys: '$',
    mode: 'normal',
    desc: '跳到本行最后一个字符。',
    example: { keys: '$a;<Esc>', effect: '在行尾补一个分号' },
    chapter: 2,
  },
  {
    id: 'gg',
    keys: 'gg',
    mode: 'normal',
    desc: '跳到文件第一行；前面加数字（如 3gg）跳到第 3 行。',
    example: { keys: '5gg', effect: '光标移到第 5 行行首' },
    pattern: /^(?:[1-9][0-9]*)?gg$/,
    chapter: 2,
  },
  {
    id: 'G',
    keys: 'G',
    mode: 'normal',
    desc: '跳到文件最后一行。',
    example: { keys: 'G', effect: '光标移到最后一行' },
    chapter: 2,
  },
  {
    id: 'f',
    keys: 'f{char}',
    mode: 'normal',
    desc: '在本行内向右查找字符 {char} 并跳过去（find）。',
    example: { keys: 'f,', effect: '跳到本行下一个逗号上' },
    seqs: ['f'],
    chapter: 2,
  },
  {
    id: 'F',
    keys: 'F{char}',
    mode: 'normal',
    desc: '像 f 一样，但向左查找。',
    example: { keys: 'F,', effect: '跳到本行左边一个逗号上' },
    seqs: ['F'],
    chapter: 2,
  },
  {
    id: 't',
    keys: 't{char}',
    mode: 'normal',
    desc: '跳到 {char} 的前一个字符（till）——停在目标前面。',
    example: { keys: 't,', effect: '跳到逗号左侧一格' },
    seqs: ['t'],
    chapter: 2,
  },
  {
    id: 'T',
    keys: 'T{char}',
    mode: 'normal',
    desc: '像 t 一样，但向左停在目标字符右侧一格。',
    example: { keys: 'T,', effect: '停在逗号右侧一格' },
    seqs: ['T'],
    chapter: 2,
  },
  {
    id: 'semicolon',
    keys: ';',
    mode: 'normal',
    desc: '重复上一次 f/F/t/T 查找，同方向下一个。',
    example: { keys: 'f,;', effect: '跳到下一个逗号，再下一个' },
    chapter: 2,
  },
  {
    id: 'comma',
    keys: ',',
    mode: 'normal',
    desc: '重复上一次 f/F/t/T 查找，但反方向。',
    example: { keys: ',', effect: '往回找上一个匹配字符' },
    chapter: 2,
  },
]

const byId = new Map(COMMANDS.map((c) => [c.id, c]))

export function commandById(id: string): CommandMeta {
  const c = byId.get(id)
  if (!c) throw new Error(`unknown command id: ${id}`)
  return c
}

/** 命令的白名单序列（缺省 = keys 按空白拆分） */
export function seqsOf(cmd: CommandMeta): string[] {
  return cmd.seqs ?? cmd.keys.split(/\s+/)
}

/** 截至某章（含）已教的全部命令 */
export function commandsUpTo(chapter: number): CommandMeta[] {
  return COMMANDS.filter((c) => c.chapter <= chapter)
}

/**
 * 序列是否属于截至某章的已教集（PLAN §9.3④）。
 * 先按字面序列比对，再按命令的计数形态 pattern 比对。
 */
export function isTaughtSeq(seq: string, chapter: number): boolean {
  return commandsUpTo(chapter).some((c) => seqsOf(c).includes(seq) || c.pattern?.test(seq) === true)
}

/** 由命令 id 列表展开白名单序列（关卡作者用） */
export function keysOf(ids: string[]): string[] {
  return ids.flatMap((id) => seqsOf(commandById(id)))
}
