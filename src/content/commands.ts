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
  {
    id: 'replace',
    keys: 'r',
    mode: 'normal',
    desc: 'r{字符}：把光标处字符换成它，不进插入模式',
    example: { keys: 'rx', effect: '光标处字符原地替换成 x' },
    chapter: 1,
  },
  {
    id: 'redo',
    keys: '<C-r>',
    mode: 'normal',
    desc: '重做：u 撤销多了，按它把撤销掉的重做回来',
    example: { keys: 'xu<C-r>', effect: '删一个字符，撤销，再重做回来' },
    chapter: 1,
  },
  {
    id: 'appendEol',
    keys: 'A',
    mode: 'normal',
    desc: '行尾进入插入模式（$a 的合体键），行尾补字符首选',
    example: { keys: 'A;<Esc>', effect: '行尾补一个分号' },
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
  {
    id: 'matchparen',
    keys: '%',
    mode: 'normal',
    desc: '跳到配对括号：光标在 ( ) [ ] { } 上（或行内向后找第一个）时跳到另一半',
    example: { keys: '%', effect: '从 ( 直接跳到配对的 ) 上' },
    chapter: 2,
  },
  {
    id: 'para',
    keys: '{ }',
    mode: 'normal',
    desc: '} 跳到下一段落首行，{ 跳回上一段（段落 = 空行分隔的行块）',
    example: { keys: '}', effect: '光标移到下一个空行之后的段首' },
    chapter: 2,
  },

  // ========== 第 3 章 · 操作符+移动（PLAN §4） ==========
  {
    id: 'd',
    keys: 'd{motion}',
    mode: 'normal',
    desc: '删除操作符：d 后面接一个移动命令，删掉从光标到目标的文本。dw 删一个词，d$ 删到行尾。',
    example: { keys: 'dw', effect: '删掉光标所在的整个词（含词尾空格）' },
    seqs: ['dw', 'de', 'db', 'd0', 'd$', 'd^', 'dj', 'dk', 'dG', 'dgg', 'df', 'dF', 'dt', 'dT', 'd%', 'd}', 'd{'],
    pattern: /^(?:[1-9][0-9]*)?d(?:[1-9][0-9]*)?(?:dd|w|e|b|0|\$|\^|j|k|G|gg|f|F|t|T|%|}|{)/,
    chapter: 3,
  },
  {
    id: 'c',
    keys: 'c{motion}',
    mode: 'normal',
    desc: '修改操作符：像 d 一样删到目标，但删完直接进入插入模式。cw = 改一个词。',
    example: { keys: 'cwnew<Esc>', effect: '把当前词改成 new' },
    seqs: ['cw', 'ce', 'cb', 'c0', 'c$', 'c^', 'cj', 'ck', 'cc', 'cG', 'cgg', 'cf', 'cF', 'ct', 'cT', 'c%', 'c}', 'c{'],
    pattern: /^(?:[1-9][0-9]*)?c(?:[1-9][0-9]*)?(?:cc|w|e|b|0|\$|\^|j|k|G|gg|f|F|t|T)/,
    chapter: 3,
  },
  {
    id: 'y',
    keys: 'y{motion}',
    mode: 'normal',
    desc: '复制操作符（yank）：像 d 一样圈定范围，但不删，抄进寄存器。yw 复制一个词。',
    example: { keys: 'ywp', effect: '复制当前词并贴在后面' },
    seqs: ['yw', 'ye', 'yb', 'y0', 'y$', 'y^', 'yj', 'yk', 'yG', 'ygg', 'yf', 'yF', 'yt', 'yT', 'y%', 'y}', 'y{'],
    pattern: /^(?:[1-9][0-9]*)?y(?:[1-9][0-9]*)?(?:yy|w|e|b|0|\$|\^|j|k|G|gg|f|F|t|T)/,
    chapter: 3,
  },
  {
    id: 'J',
    keys: 'J',
    mode: 'normal',
    desc: '把下一行接到本行末尾（join），两行变一行，中间自动补一个空格。',
    example: { keys: 'J', effect: '当前行与下一行合并成一行' },
    chapter: 3,
  },
  {
    id: 'dot',
    keys: '.',
    mode: 'normal',
    desc: '重复上一次修改。同样的修改要做几次：做一次，然后按 . 就好。',
    example: { keys: 'dw..', effect: '删一个词，再连删两个（共三个）' },
    chapter: 3,
  },
  {
    id: 'count',
    keys: '2dd',
    // 两个形态样本（前缀/中缀）；KeyFilter 把数字段通配为任意 [1-9][0-9]*，样本只锚形态不锚数值
    seqs: ['2dd', 'd2w'],
    mode: 'normal',
    desc: '计数前缀：数字放在命令前让它重复 n 次——2dd 删两行、3w 跳三个词、d2w 删两个词。',
    example: { keys: '2dd', effect: '一次删掉两行' },
    pattern: /^[1-9][0-9]*(?:dd|dw|de|cw|cc|yy|yw|j|k|w|b|e|x|gg|G|J)$/,
    chapter: 3,
  },
  {
    id: 'putBefore',
    keys: 'P',
    mode: 'normal',
    desc: '粘贴到当前位置之前：行寄存器贴到上一行，字符寄存器贴到光标前（p 的反向）。',
    example: { keys: 'yyP', effect: '复制当前行并贴到上一行' },
    chapter: 3,
  },
  {
    id: 'eolops',
    keys: 'D C',
    mode: 'normal',
    desc: 'D 删到行尾（d$ 的快捷键），C 改到行尾直接输入（c$ 的快捷键）。',
    example: { keys: 'Cnew<Esc>', effect: '删掉光标起到行尾并输入 new' },
    chapter: 3,
  },
  {
    id: 'chgenter',
    keys: 's S',
    mode: 'normal',
    desc: 's 删当前字符进插入（= cl），S 清空整行进插入（= cc）。',
    example: { keys: 'sx<Esc>', effect: '当前字符原地换成 x' },
    chapter: 3,
  },
  {
    id: 'insdelword',
    keys: '<C-w>',
    mode: 'insert',
    desc: '插入模式里删掉光标前的一个词——整个词打错时比重敲退格快得多。',
    example: { keys: 'ihello<C-w>hi<Esc>', effect: '输入 hello 后整词删掉，改输 hi' },
    chapter: 3,
  },

  // ========== 第 4 章 · 文本对象（PLAN §4） ==========
  {
    id: 'iw',
    keys: 'iw',
    mode: 'normal',
    desc: 'inner word：光标所在的整个词（不含空格）。配操作符整词作用：ciw 改词、diw 删词——光标在词里任意位置都行。',
    example: { keys: 'ciwnew<Esc>', effect: '把光标所在的词整个替换成 new' },
    seqs: ['iw', 'diw', 'ciw', 'yiw'],
    chapter: 4,
  },
  {
    id: 'aw',
    keys: 'aw',
    mode: 'normal',
    desc: 'a word：词本身 + 相邻的一个空格。daw 删中间的词不留双空格；删行尾的词连前面的空格一起收走。',
    example: { keys: 'daw', effect: '删掉词和它旁边的一个空格' },
    seqs: ['aw', 'daw', 'caw', 'yaw'],
    chapter: 4,
  },
  {
    id: 'iparen',
    keys: 'i(',
    mode: 'normal',
    desc: '括号里的内容（不含括号）：光标放在括号内或括号上都行，嵌套时取最内层。ci( 清空重填、di( 清空。',
    example: { keys: 'ci(x<Esc>', effect: '把括号里的内容换成 x' },
    seqs: ['i(', 'i)', 'di(', 'di)', 'ci(', 'ci)', 'yi(', 'yi)', 'ib', 'dib', 'cib', 'yib'],
    chapter: 4,
  },
  {
    id: 'aparen',
    keys: 'a(',
    mode: 'normal',
    desc: '括号和括号里的内容一起：da( 把整段括号删掉。别名 b；中括号大括号同理。',
    example: { keys: 'da(', effect: '连括号带内容整段删除' },
    seqs: ['a(', 'a)', 'da(', 'da)', 'ca(', 'ca)', 'ya(', 'ya)', 'ab', 'dab', 'cab', 'yab'],
    chapter: 4,
  },
  {
    id: 'iquote',
    keys: 'i"',
    mode: 'normal',
    desc: '一对引号里的内容（不含引号）：光标在引号内或引号上都行。ci" 改字符串内容，引号原样保留。',
    example: { keys: 'ci"new<Esc>', effect: '把字符串内容换成 new' },
    seqs: ['i"', 'di"', 'ci"', 'yi"'],
    chapter: 4,
  },
  {
    id: 'aquote',
    keys: 'a"',
    mode: 'normal',
    desc: '一对引号和里面的内容一起：da" 把 "..." 整段删掉。',
    example: { keys: 'da"', effect: '连引号带内容删除整个字符串' },
    seqs: ['a"', 'da"', 'ca"', 'ya"'],
    chapter: 4,
  },
  {
    id: 'it',
    keys: 'it',
    mode: 'normal',
    desc: '一对 HTML/XML 标签里的内容（不含标签本身）：dit 清空内容、标签对保留；嵌套时取最内层。',
    example: { keys: 'dit', effect: '清空 <p>...</p> 标签里的内容' },
    seqs: ['it', 'dit', 'cit', 'yit'],
    chapter: 4,
  },
  {
    id: 'ip',
    keys: 'ip',
    mode: 'normal',
    desc: 'paragraph：光标所在的段落（连续非空行）。dip 删掉一整段，cip 整段重写。',
    example: { keys: 'dip', effect: '删掉光标所在的整个段落' },
    seqs: ['ip', 'dip', 'cip', 'yip'],
    chapter: 4,
  },
  {
    id: 'ibrace',
    keys: 'i{ a{',
    mode: 'normal',
    desc: '花括号文本对象：i{ 是 { … } 内部（不含括号），a{ 连花括号一起。',
    example: { keys: 'ci{x<Esc>', effect: '把 { … } 里的内容换成 x' },
    seqs: ['i{', 'i}', 'a{', 'a}', 'di{', 'di}', 'da{', 'da}', 'ci{', 'ci}', 'ca{', 'ca}', 'yi{', 'yi}', 'ya{', 'ya}', 'iB', 'diB', 'ciB', 'yiB'],
    chapter: 4,
  },
  {
    id: 'ibrack',
    keys: 'i[ a[',
    mode: 'normal',
    desc: '方括号文本对象：i[ 是 [ … ] 内部（不含括号），a[ 连方括号一起。',
    example: { keys: 'ci[x<Esc>', effect: '把 [ … ] 里的内容换成 x' },
    seqs: ['i[', 'i]', 'a[', 'a]', 'di[', 'di]', 'da[', 'da]', 'ci[', 'ci]', 'ca[', 'ca]', 'yi[', 'yi]', 'ya[', 'ya]'],
    chapter: 4,
  },

  // ========== 第 5 章 · Visual 模式（PLAN §4；本章起按键白名单完全放开 §2.5） ==========
  {
    id: 'v',
    keys: 'v',
    mode: 'visual',
    desc: '进入字符可视化：用移动命令扩大选区，再按 d/c/y/J 作用在选区上；v 或 Esc 退出。',
    example: { keys: 'vlld', effect: '向右选 4 个字符后删掉' },
    seqs: ['v'],
    chapter: 5,
  },
  {
    id: 'V',
    keys: 'V',
    mode: 'visual',
    desc: '进入行可视化：以整行为单位选择，Vj 多选一行；Vd 删整段、Vy 复制整段、Vc 整块重写。',
    example: { keys: 'Vjd', effect: '选中两行一起删掉' },
    seqs: ['V'],
    chapter: 5,
  },
  {
    id: 'C-v',
    keys: '<C-v>',
    mode: 'visual',
    desc: '进入块可视化：按列选出一个矩形，跨行作用在同一列上——批量删列、加前缀、补行尾全靠它。',
    example: { keys: '<C-v>jjld', effect: '三行的前两列一起删掉' },
    seqs: ['<C-v>'],
    chapter: 5,
  },
  {
    id: 'indent',
    keys: '> <',
    mode: 'any',
    desc: '缩进：> 右移一级（2 空格），< 左移一级。可视化下 Vj> 两行一起缩进。',
    example: { keys: 'Vj>', effect: '选中两行整体右移一级缩进' },
    seqs: ['>', '<'],
    chapter: 5,
  },
  {
    id: 'blockI',
    keys: 'I',
    mode: 'visual',
    desc: '块可视化下按 I：在块的左缘插入——首行输入的文本，Esc 后套用到块的每一行。',
    example: { keys: '<C-v>jjI# <Esc>', effect: '三行行首都加上 # ' },
    seqs: ['I'],
    chapter: 5,
  },
  {
    id: 'blockA',
    keys: 'A',
    mode: 'visual',
    desc: '块可视化下按 A：在块的右缘之后追加——首行输入的文本，Esc 后套用到块的每一行；太短的行跳过。',
    example: { keys: '<C-v>jjllllA;<Esc>', effect: '三行行尾都补上分号' },
    seqs: ['A'],
    chapter: 5,
  },
  {
    id: 'vswap',
    keys: 'o',
    mode: 'visual',
    desc: 'Visual 选区中按 o：光标跳到选区另一端——选过头不用退出重来。',
    example: { keys: 'vjlo', effect: '选中两行后光标跳回选区首端' },
    seqs: ['o'],
    chapter: 5,
  },

  // ========== 第 6 章 · 查找替换（PLAN §4） ==========
  {
    id: 'searchFwd',
    keys: '/',
    mode: 'normal',
    desc: '按 / 输入要找的词再回车：跳到光标之后的第一处——跳到后 d、c、x 照常接着用。',
    example: { keys: '/todo<CR>dd', effect: '跳到 todo 所在行，整行删掉' },
    seqs: ['/'],
    chapter: 6,
  },
  {
    id: 'searchBwd',
    keys: '?',
    mode: 'normal',
    desc: '按 ? 向上找：输入词回车，跳到光标之前最近的一处；配合 n 一路往回跳。',
    example: { keys: '?tmp<CR>dd', effect: '向上找到 tmp，整行删掉' },
    seqs: ['?'],
    chapter: 6,
  },
  {
    id: 'searchNext',
    keys: 'n N',
    mode: 'normal',
    desc: '重复上一次搜索：n 沿原方向下一处、N 反方向——搜过的词 vim 一直记着，直到下次搜索。',
    example: { keys: '/err<CR>ndd', effect: '跳到第一处 err，n 到第二处，删行' },
    seqs: ['n', 'N'],
    chapter: 6,
  },
  {
    id: 'searchWord',
    keys: '* #',
    mode: 'normal',
    desc: '光标停在词上按 *：把这个词当搜索词，向前找下一个同名词（整词匹配）；# 向后找。改名三连：* c w 新词 <Esc>。',
    example: { keys: '*cwnew<Esc>', effect: '跳到下一个同名整词并改名' },
    seqs: ['*', '#'],
    chapter: 6,
  },
  {
    id: 'substitute',
    keys: ':s',
    mode: 'cmdline',
    desc: '按 :s/旧词/新词/ 回车：把当前行的第一处旧词换成新词——只动一行、只换第一处。',
    example: { keys: ':s/cat/ox/<CR>', effect: '当前行第一处 cat 变 ox' },
    seqs: [':'],
    chapter: 6,
  },
  {
    id: 'subGlobal',
    keys: 'g',
    mode: 'cmdline',
    desc: '结尾加 g 就不止第一处：:s/旧/新/g 换掉当前行所有的旧词；i 表示忽略大小写。',
    example: { keys: ':s/aa/zz/g<CR>', effect: '当前行所有 aa 都变 zz' },
    seqs: ['g', 'i'],
    chapter: 6,
  },
  {
    id: 'subAll',
    keys: ':%s',
    mode: 'cmdline',
    desc: ':%s/旧/新/g 一次换掉全文件的旧词——批量改名、批量纠错的最快路径。',
    example: { keys: ':%s/old/fix/g<CR>', effect: '整个文件所有 old 都变 fix' },
    seqs: [':', '%'],
    chapter: 6,
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
