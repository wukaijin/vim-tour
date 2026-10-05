import type { Level } from '../../game/types'

/**
 * 第 6 章 · 查找替换（PLAN §4）：/ ? n N * #、:s :%s 及 flags（g i）
 * 白名单放开档位（PLAN §2.5）——allowedKeys 不配置。
 * N=3；每关 2 个变体——逐词一对一替换、行数、逐行前导空白、光标行一致，parKeys 复用，
 * 因此两变体里被搜索/替换的词（todo、err、tmp、alpha、cat、aa、old）必须同构出现。
 */
const chapter6: Level[] = [
  {
    id: 'ch6-01',
    chapter: 6,
    title: '跳到它，删掉它',
    brief: '中间一行贴着 todo 草稿：按 / 输入 todo 回车，一步跳过去，dd 删掉整行。',
    hints: [
      '/ 打开搜索：输入要找的词，回车跳到光标之后第一处——跳到后 d、c、x 照常接着用。',
      '完整解：/ t o d o <CR> d d（搜索 todo，跳过去，整行删除）。',
    ],
    teaches: ['searchFwd'],
    texts: [
      {
        start: ['top a', 'mid b', 'todo c', 'bot d'],
        target: ['top a', 'mid b', 'bot d'],
        cursor: { line: 0, col: 0 },
        parKeys: '/todo<CR>dd',
      },
      {
        start: ['top q', 'mid w', 'todo e', 'bot r'],
        target: ['top q', 'mid w', 'bot r'],
        cursor: { line: 0, col: 0 },
        parKeys: '/todo<CR>dd',
      },
    ],
  },
  {
    id: 'ch6-02',
    chapter: 6,
    title: '下一个，再下一个',
    brief: '两行 err 要清理，但只有最后一行该删：/err 跳到第一处，n 跳到下一处，dd 删掉。',
    hints: [
      'n 重复上一次搜索（沿原方向下一处）、N 反方向——搜过的词 vim 一直记着。',
      '完整解：/ e r r <CR> n d d（跳到第一处 err，n 到第二处，删行）。',
    ],
    teaches: ['searchNext'],
    texts: [
      {
        start: ['go one', 'err aa', 'mid bb', 'err cc'],
        target: ['go one', 'err aa', 'mid bb'],
        cursor: { line: 0, col: 0 },
        parKeys: '/err<CR>ndd',
      },
      {
        start: ['go x', 'err q', 'mid y', 'err z'],
        target: ['go x', 'err q', 'mid y'],
        cursor: { line: 0, col: 0 },
        parKeys: '/err<CR>ndd',
      },
    ],
  },
  {
    id: 'ch6-03',
    chapter: 6,
    title: '往回找',
    brief: '光标在文件底部，要清理的 tmp 在最上面：? 向上搜索，跳回去 dd。',
    hints: [
      '? 与 / 一样搜索，只是方向向上——跳到光标之前最近的一处。',
      '完整解：? t m p <CR> d d（向上搜 tmp，跳回去，删行）。',
    ],
    teaches: ['searchBwd'],
    texts: [
      {
        start: ['tmp one', 'pad aa', 'go bb'],
        target: ['pad aa', 'go bb'],
        cursor: { line: 2, col: 0 },
        parKeys: '?tmp<CR>dd',
      },
      {
        start: ['tmp q', 'pad x', 'go y'],
        target: ['pad x', 'go y'],
        cursor: { line: 2, col: 0 },
        parKeys: '?tmp<CR>dd',
      },
    ],
  },
  {
    id: 'ch6-04',
    chapter: 6,
    title: '光标下是什么，就搜什么',
    brief: '末行的 alpha 要改名：光标停在 alpha 上，* 按整词跳到下一处，cw 改成 new。',
    hints: [
      '* 把光标下的词当搜索词，向前找下一个同名词（整词匹配，不会命中 alpha 里夹着的词）；# 向后。',
      '完整解：* c w n e w <Esc>（整词跳到下一处 alpha，改名 new）。',
    ],
    teaches: ['searchWord'],
    texts: [
      {
        start: ['alpha go', 'beta xx', 'alpha end'],
        target: ['alpha go', 'beta xx', 'new end'],
        cursor: { line: 0, col: 0 },
        parKeys: '*cwnew<Esc>',
      },
      {
        start: ['alpha go', 'beta yy', 'alpha end'],
        target: ['alpha go', 'beta yy', 'new end'],
        cursor: { line: 0, col: 0 },
        parKeys: '*cwnew<Esc>',
      },
    ],
  },
  {
    id: 'ch6-05',
    chapter: 6,
    title: '换掉当前行的第一个',
    brief: '第一行的 cat 要改成 ox：:s/旧词/新词/ 只动当前行、只换第一处。',
    hints: [
      '按 : 进入命令行，输入 s/cat/ox/ 后回车——分格里的内容不会被其他行碰。',
      '完整解：: s / c a t / o x / <CR>（当前行第一处 cat 换成 ox）。',
    ],
    teaches: ['substitute'],
    texts: [
      {
        start: ['cat dog cat', 'cat fish'],
        target: ['ox dog cat', 'cat fish'],
        cursor: { line: 0, col: 0 },
        parKeys: ':s/cat/ox/<CR>',
      },
      {
        start: ['cat dog cat', 'cat bird'],
        target: ['ox dog cat', 'cat bird'],
        cursor: { line: 0, col: 0 },
        parKeys: ':s/cat/ox/<CR>',
      },
    ],
  },
  {
    id: 'ch6-06',
    chapter: 6,
    title: '一行全换',
    brief: '当前行有两处 aa 要一起换成 zz：结尾加 g，一行内的旧词全部换掉。',
    hints: [
      ':s/旧/新/g 的 g = global：当前行所有匹配处都换，不只是第一处；i 则忽略大小写。',
      '完整解：: s / a a / z z / g <CR>（当前行所有 aa 都换成 zz）。',
    ],
    teaches: ['subGlobal'],
    texts: [
      {
        start: ['aa bb aa', 'aa cc'],
        target: ['zz bb zz', 'aa cc'],
        cursor: { line: 0, col: 0 },
        parKeys: ':s/aa/zz/g<CR>',
      },
      {
        start: ['aa dd aa', 'aa ee'],
        target: ['zz dd zz', 'aa ee'],
        cursor: { line: 0, col: 0 },
        parKeys: ':s/aa/zz/g<CR>',
      },
    ],
  },
  {
    id: 'ch6-07',
    chapter: 6,
    title: '整个文件一起换',
    brief: '全文件统一把 old 改成 fix：:%s 加 g，一次替换每一行的每一处。',
    hints: [
      ':%s/旧/新/g 的 % 表示全部行——批量改名、批量纠错的最快路径。',
      '完整解：: % s / o l d / f i x / g <CR>（全文件所有 old 换成 fix）。',
    ],
    teaches: ['subAll'],
    texts: [
      {
        start: ['old a', 'old b', 'new c'],
        target: ['fix a', 'fix b', 'new c'],
        cursor: { line: 0, col: 0 },
        parKeys: ':%s/old/fix/g<CR>',
      },
      {
        start: ['old d', 'old e', 'new f'],
        target: ['fix d', 'fix e', 'new f'],
        cursor: { line: 0, col: 0 },
        parKeys: ':%s/old/fix/g<CR>',
      },
    ],
  },
  {
    id: 'ch6-08',
    chapter: 6,
    title: '第 6 章毕业考',
    brief: '综合搜索与替换：先定位最后一处 todo 草稿删掉，再把剩下的 todo 全部改成 done。',
    hints: [
      '组合：/ 搜索定位、n 跳下一处、dd 删行、:%s//g 全文件替换；每步做完看 diff 再走下一步。',
      '完整解：/ t o d o <CR> j n d d 然后 : % s / t o d o / d o n e / g <CR>。',
    ],
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['keep a', 'todo drop', 'pad b', 'todo gone'],
        target: ['keep a', 'done drop', 'pad b'],
        cursor: { line: 0, col: 0 },
        parKeys: '/todo<CR>jndd:%s/todo/done/g<CR>',
      },
      {
        start: ['hold q', 'todo drop', 'day w', 'todo gone'],
        target: ['hold q', 'done drop', 'day w'],
        cursor: { line: 0, col: 0 },
        parKeys: '/todo<CR>jndd:%s/todo/done/g<CR>',
      },
    ],
  },
]

export default chapter6
