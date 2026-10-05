import type { Level } from '../../game/types'

/**
 * 第 7 章 · 综合实战（PLAN §4/§2.3）：真实场景综合所有前六章技能，无新命令。
 * 白名单放开档位（PLAN §2.5）——allowedKeys 不配置。N=3；每关 2 个变体——
 * 逐词一对一替换、行数、逐行前导空白、光标行一致，parKeys 复用，
 * 因此被搜索/替换的核心词（user、log、cue、size）与 cw 新词（data、9000、fall、new、big）
 * 在两变体字面一致，变化的只是陪衬词（brief 提到的词 = 玩家在两种变体里都看到的词）。
 * 08 毕业考用全库 fresh 文本；cue 两处之间垫一行非匹配行——dd 后 n 从光标列之后起搜，
 * 相邻的两处目标词会让 n 错过新行首的匹配。
 */
const chapter7: Level[] = [
  {
    id: 'ch7-01',
    chapter: 7,
    title: '上线前，统一改名',
    brief: '脚本里三处 user 全要改成 data——别一处一处 cw，:%s 加 g 一次换完。',
    hints: [
      '批量改名是 :%s 最日常的用法：旧词写 user，新词写 data，别忘 % 和 g。',
      '完整解：: % s / u s e r / d a t a / g <CR>（全文件所有 user 换成 data）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['const user = 1;', 'load(user);', 'save(user);', 'end();'],
        target: ['const data = 1;', 'load(data);', 'save(data);', 'end();'],
        cursor: { line: 0, col: 0 },
        parKeys: ':%s/user/data/g<CR>',
      },
      {
        start: ['let user = 2;', 'fetch(user);', 'keep(user);', 'fin();'],
        target: ['let data = 2;', 'fetch(data);', 'keep(data);', 'fin();'],
        cursor: { line: 0, col: 0 },
        parKeys: ':%s/user/data/g<CR>',
      },
    ],
  },
  {
    id: 'ch7-02',
    chapter: 7,
    title: '清掉调试输出',
    brief: '提交前要把两行 log 调用清掉：/ 跳到第一处删行，n 到第二处再删。',
    hints: [
      '/ 定位、n 沿同方向到下一处、dd 删整行——三步串起来就是日常的「搜到就删」。',
      '完整解：/ l o g <CR> d d n d d（跳到第一行 log 删掉，n 到第二行再删）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['go();', 'log(a);', 'run();', 'log(b);'],
        target: ['go();', 'run();'],
        cursor: { line: 0, col: 0 },
        parKeys: '/log<CR>ddndd',
      },
      {
        start: ['use();', 'log(x);', 'step();', 'log(y);'],
        target: ['use();', 'step();'],
        cursor: { line: 0, col: 0 },
        parKeys: '/log<CR>ddndd',
      },
    ],
  },
  {
    id: 'ch7-03',
    chapter: 7,
    title: '改两个配置值',
    brief: '开头的 8000 要改成 9000，末行的 dev 改成 prod：w 跳到值直接改，行尾 $ 落位、b 回词首再改。',
    hints: [
      'cw 只改到词尾：光标得先落在值的词首上（w 跳两次）；改行尾的词，$ 落到行尾再 b 回词首。',
      '完整解：w w c w 9 0 0 0 <Esc> j j $ b c w p r o d <Esc>（跳到 8000 改 9000；$ 落行尾、b 回词首改 dev）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['port = 8000', 'host = loc', 'mode = dev'],
        target: ['port = 9000', 'host = loc', 'mode = prod'],
        cursor: { line: 0, col: 0 },
        parKeys: 'wwcw9000<Esc>jj$bcwprod<Esc>',
      },
      {
        start: ['gate = 8000', 'node = site', 'flag = dev'],
        target: ['gate = 9000', 'node = site', 'flag = prod'],
        cursor: { line: 0, col: 0 },
        parKeys: 'wwcw9000<Esc>jj$bcwprod<Esc>',
      },
    ],
  },
  {
    id: 'ch7-04',
    chapter: 7,
    title: '给函数补个参数',
    brief: '函数定义和调用都要补上第三个参数 c：f) 落到右括号，i 在括号里插入「, c」。',
    hints: [
      'f) 把光标送到右括号上，i 在光标前插入——改括号内内容时比逐词跳转更直接；跨行后列会保持，先 0 回行首。',
      '完整解：f ) i , 空格 c <Esc> j 0 f ) i , 空格 c <Esc>（两行各在 ) 前插入 , c）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['function go(a, b) {', '  use(a, b);', '}'],
        target: ['function go(a, b, c) {', '  use(a, b, c);', '}'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f)i, c<Esc>j0f)i, c<Esc>',
      },
      {
        start: ['handler run(a, b) {', '  call(a, b);', '}'],
        target: ['handler run(a, b, c) {', '  call(a, b, c);', '}'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f)i, c<Esc>j0f)i, c<Esc>',
      },
    ],
  },
  {
    id: 'ch7-05',
    chapter: 7,
    title: '先注释掉这段',
    brief: '排查问题要暂时关掉前三行配置：块选行首，I 打 // 加空格，Esc 三行齐生效。',
    hints: [
      'C-v 竖着框住三行的行首，I 在块左缘插入：首行输入的文本 Esc 后套用到每一行。',
      '完整解：<C-v> j j I / / 空格 <Esc>（三行行首同时加 // 前缀）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['level = 3', 'trace = on', 'debug = 9', 'save = ok'],
        target: ['// level = 3', '// trace = on', '// debug = 9', 'save = ok'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjI// <Esc>',
      },
      {
        start: ['noise = 4', 'stack = 9', 'probe = 2', 'save = ok'],
        target: ['// noise = 4', '// stack = 9', '// probe = 2', 'save = ok'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjI// <Esc>',
      },
    ],
  },
  {
    id: 'ch7-06',
    chapter: 7,
    title: '照着首行抄一份',
    brief: '末尾要补一条与首行同款的后备配置，值改成 fall：yy 复制、G 到末尾粘贴，再改值。',
    hints: [
      'yy 整行复制、G 跳到文件末行、p 粘贴在下一行——复制粘贴三键走完，w 两次跳到值再 cw 改。',
      '完整解：y y G p w w c w f a l l <Esc>（复制首行贴到末尾，值改为 fall）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['host = loc', 'port = 8000', 'mode = dev'],
        target: ['host = loc', 'port = 8000', 'mode = dev', 'host = fall'],
        cursor: { line: 0, col: 0 },
        parKeys: 'yyGpwwcwfall<Esc>',
      },
      {
        start: ['main = site', 'rank = 3000', 'type = test'],
        target: ['main = site', 'rank = 3000', 'type = test', 'main = fall'],
        cursor: { line: 0, col: 0 },
        parKeys: 'yyGpwwcwfall<Esc>',
      },
    ],
  },
  {
    id: 'ch7-07',
    chapter: 7,
    title: '粘进来就乱了',
    brief: '粘贴的代码头前混进一行废稿，函数体也丢了缩进：先 dd 删废行，再 V 选整段缩进。',
    hints: [
      'V 按行选择、j 向下扩一行、> 对整个选块加一级缩进（2 空格）——修粘贴代码的标配。',
      '完整解：d d j V j >（删掉首行废稿；选中两行函数体，整体右移一级）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['junk = 1', 'if ok {', 'run(x);', 'end(y);', '}'],
        target: ['if ok {', '  run(x);', '  end(y);', '}'],
        cursor: { line: 0, col: 0 },
        parKeys: 'ddjVj>',
      },
      {
        start: ['dead = 2', 'when yes {', 'use(z);', 'fin(w);', '}'],
        target: ['when yes {', '  use(z);', '  fin(w);', '}'],
        cursor: { line: 0, col: 0 },
        parKeys: 'ddjVj>',
      },
    ],
  },
  {
    id: 'ch7-08',
    chapter: 7,
    title: '第 7 章毕业考',
    brief: '一次真实的提交前清理：改引号里的文案、删两处调试调用、把 size 配置统一改名。',
    hints: [
      '组合：f" 落到引号上、ci" 改引号内、/ 与 n 定位删除、:%s//g 批量替换；每步做完看 diff 再走下一步。',
      '完整解：f " c i " n e w <Esc> / c u e <CR> d d n d d : % s / s i z e / b i g / g <CR>。',
    ],
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['name = "quick"', 'cue(1);', 'warm mm;', 'cue(2);', 'size = 9;', 'size = 8;'],
        target: ['name = "new"', 'warm mm;', 'big = 9;', 'big = 8;'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f"ci"new<Esc>/cue<CR>ddndd:%s/size/big/g<CR>',
      },
      {
        start: ['brand = "wide"', 'cue(x);', 'cool nn;', 'cue(y);', 'size = 3;', 'size = 4;'],
        target: ['brand = "new"', 'cool nn;', 'big = 3;', 'big = 4;'],
        cursor: { line: 0, col: 0 },
        parKeys: 'f"ci"new<Esc>/cue<CR>ddndd:%s/size/big/g<CR>',
      },
    ],
  },
]

export default chapter7
