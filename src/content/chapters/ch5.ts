import type { Level } from '../../game/types'

/**
 * 第 5 章 · Visual 模式（PLAN §4）：v V C-v、缩进 > <、块插入 A I
 * 本章起按键白名单完全放开（PLAN §2.5）——allowedKeys 不配置，未教键不再拦截。
 * N=3；每关 2 个变体——逐词一对一替换、行数、逐行前导空白、光标行一致，parKeys 复用；
 * 块操作关（05/06/07/08）两变体参与块的行必须逐行等长（A 按块右缘列对齐行插入）。
 */
const chapter5: Level[] = [
  {
    id: 'ch5-01',
    chapter: 5,
    title: '选一段，一次删',
    brief: '行尾粘着一段废注释，光标停在注释前：v 进入字符选择，$ 扩到行尾，d 整段带走。',
    hints: [
      'v 开启选区：用移动命令扩大它，再按操作键（d/c/y）作用其上；Esc 或再按 v 取消。',
      '完整解：v $ d（字符选择，扩到行尾，删除）。',
    ],
    teaches: ['v'],
    texts: [
      {
        start: ['keep go // xx'],
        target: ['keep go'],
        cursor: { line: 0, col: 7 },
        parKeys: 'v$d',
      },
      {
        start: ['keep go // yy'],
        target: ['keep go'],
        cursor: { line: 0, col: 7 },
        parKeys: 'v$d',
      },
    ],
  },
  {
    id: 'ch5-02',
    chapter: 5,
    title: '整行整行地拿',
    brief: '中间两行草稿要整段删除：V 按行选择，j 多拿一行，d 一次删两行。',
    hints: [
      'V 是行选择：以整行为单位，Vj 向下多选一行；Vy 整段复制、Vd 整段删除。',
      '完整解：V j d（选中两行，删除）。',
    ],
    teaches: ['V'],
    texts: [
      {
        start: ['top', 'old one', 'old two', 'tail'],
        target: ['top', 'tail'],
        cursor: { line: 1, col: 0 },
        parKeys: 'Vjd',
      },
      {
        start: ['top', 'tmp x', 'tmp y', 'tail'],
        target: ['top', 'tail'],
        cursor: { line: 1, col: 0 },
        parKeys: 'Vjd',
      },
    ],
  },
  {
    id: 'ch5-03',
    chapter: 5,
    title: '整块重写',
    brief: '两行草稿直接重写成一句新话：V 选中两行，c 整块清空进入插入，打完 Esc。',
    hints: [
      'V 选区 + c：选中的行整块删除并进入插入模式（一次重写多行）。',
      '完整解：V j c fresh <Esc>（选中两行，整块重写为 fresh）。',
    ],
    teaches: [],
    texts: [
      {
        start: ['draft a', 'draft b', 'final c'],
        target: ['fresh', 'final c'],
        cursor: { line: 0, col: 0 },
        parKeys: 'Vjcfresh<Esc>',
      },
      {
        start: ['sketch x', 'sketch y', 'final z'],
        target: ['fresh', 'final z'],
        cursor: { line: 0, col: 0 },
        parKeys: 'Vjcfresh<Esc>',
      },
    ],
  },
  {
    id: 'ch5-04',
    chapter: 5,
    title: '该缩的缩，该退的退',
    brief: '前两行少了一级缩进，后两行多了一级：V 选块后 > 右移一级（2 空格），< 左移一级。',
    hints: [
      '可视化下 > 与 < 对整个选块生效，一级缩进 = 2 空格。',
      '完整解：V j > j j j V j <（前两行右移；下移三行，末两行左移）。',
    ],
    teaches: ['indent'],
    texts: [
      {
        start: ['go x', 'go y', 'mid', '  deep a', '  deep b'],
        target: ['  go x', '  go y', 'mid', 'deep a', 'deep b'],
        cursor: { line: 0, col: 0 },
        parKeys: 'Vj>jjjVj<',
      },
      {
        start: ['run 1', 'run 2', 'mid', '  deep c', '  deep d'],
        target: ['  run 1', '  run 2', 'mid', 'deep c', 'deep d'],
        cursor: { line: 0, col: 0 },
        parKeys: 'Vj>jjjVj<',
      },
    ],
  },
  {
    id: 'ch5-05',
    chapter: 5,
    title: '按列删除',
    brief: '三行行首都挂着同一个标记列：C-v 进入块选择，竖着框住前两列，d 三行一起删。',
    hints: [
      'C-v 按列选择：j / l 扩大矩形块，操作键作用在每一行的同一列上。',
      '完整解：<C-v> j j l d（块选三行的前两列，删除）。',
    ],
    teaches: ['C-v'],
    texts: [
      {
        start: ['x one', 'x two', 'x end'],
        target: ['one', 'two', 'end'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjld',
      },
      {
        start: ['q aa', 'q bb', 'q cc'],
        target: ['aa', 'bb', 'cc'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjld',
      },
    ],
  },
  {
    id: 'ch5-06',
    chapter: 5,
    title: '每行开头补前缀',
    brief: '三行笔记要变成注释：块选行首，I 在块的左缘插入，# 加空格打完 Esc，三行同时生效。',
    hints: [
      '块选择下 I 在块左缘插入：首行输入的文本，Esc 后套用到块的每一行。',
      '完整解：<C-v> j j I # 空格 <Esc>（三行行首同时加 # ）。',
    ],
    teaches: ['blockI'],
    texts: [
      {
        start: ['one', 'two', 'end'],
        target: ['# one', '# two', '# end'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjI# <Esc>',
      },
      {
        start: ['aa', 'bb', 'cc'],
        target: ['# aa', '# bb', '# cc'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjI# <Esc>',
      },
    ],
  },
  {
    id: 'ch5-07',
    chapter: 5,
    title: '每行行尾补分号',
    brief: '三行赋值都缺分号：块选到行尾字符，A 在块右缘之后追加，分号打完 Esc 三行齐补。',
    hints: [
      '块选择下 A 在块右缘之后追加：首行输入套用到每一行——所以各行要对齐到同一列。',
      '完整解：<C-v> j j l l l l A ; <Esc>（块右缘扩到行尾，追加分号）。',
    ],
    teaches: ['blockA'],
    texts: [
      {
        start: ['a = 1', 'b = 2', 'c = 3'],
        target: ['a = 1;', 'b = 2;', 'c = 3;'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjllllA;<Esc>',
      },
      {
        start: ['x = 4', 'y = 5', 'z = 6'],
        target: ['x = 4;', 'y = 5;', 'z = 6;'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjllllA;<Esc>',
      },
    ],
  },
  {
    id: 'ch5-08',
    chapter: 5,
    title: '第 5 章毕业考',
    brief: '综合块操作：行尾补分号、删标记列、整体缩进，最后清掉尾部两行废稿。',
    hints: [
      '组合：C-v 块追加、C-v 块删除、V 缩进、V 整行删；每步做完看 diff 再走下一步。',
      '完整解：<C-v>jjllllA;<Esc> 0 <C-v>jjld Vjj> jjj Vjd。',
    ],
    teaches: [],
    graduation: true,
    texts: [
      {
        start: ['x one', 'x two', 'x end', 'junk a', 'junk b'],
        target: ['  one;', '  two;', '  end;'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjllllA;<Esc>0<C-v>jjldVjj>jjjVjd',
      },
      {
        start: ['x red', 'x ink', 'x end', 'note 1', 'note 2'],
        target: ['  red;', '  ink;', '  end;'],
        cursor: { line: 0, col: 0 },
        parKeys: '<C-v>jjllllA;<Esc>0<C-v>jjldVjj>jjjVjd',
      },
    ],
  },
]

export default chapter5
