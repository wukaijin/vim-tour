import { commandsUpTo } from '../content/commands'
import type { CommandMeta } from '../content/commands'
import { DIFFICULTY_LABEL, PAR_RANGE } from './types'
import type { ChatMessage, ForgeDifficulty, ForgeParams, ForgeTier } from './types'

export type { ChatMessage }

const SYSTEM_PROMPT = `你是 vim 教学游戏的出题人。你负责编一道「从起始文本改到目标文本」的练习题，并给出解法草稿；提示由本地引擎从解法自动生成，你不需要提供提示。

输出要求（必须严格遵守）：
- 只输出一个 JSON 对象，不要代码块、不要解释、不要多余文字。
- 字段：{"title": string, "brief": string, "start": string[], "target": string[], "cursor": {"line": number, "col": number}, "commands": string[], "parKeys": string}
- start / target 是逐行文本数组；target 必须能由 start 经真实 vim 按键到达。
- commands 是「解这道题需要的命令序列」数组，只能从下面列出的可用命令里选，且要精简——只列真正用到的（例如 ["w","dw","<Esc>"]）。它同时是本题的规则：玩家只能用这些命令。
- parKeys 是解法按键序列（把每个按键按顺序连成一个字符串，特殊键写 <Esc>、<CR> 等），必须只用 commands 里的命令、并精确到达 target。引擎会逐键回放验证，不符会被打回重做。
- 文本用 ASCII（代码、配置、命令行、清单），不要中文、不要控制字符。
- parKeys 的按键数要落在指定区间（会被本地引擎实算）。

质量要求：
- 题目要像真实编辑场景，brief 用一句话说清任务。
- 编辑的规模与题目结构按本次给出的「难度要求」「题型方向」来，不要自作主张缩小。
- 题材与文本结构要有变化：**不要每次都出「改配置里的端口/数值」这类题**；给出的题材若不好写，可以换成别的真实场景。
- cursor 是初始光标位置（line / col 从 0 起），请让起点合理：不要恰好停在要改的位置上，也别远到无聊。`

/**
 * 难度要求（按复杂度档分化注入 user 消息）：按键数区间只管解的长度，
 * 「难」得体现在解法的发现上——聪明解法明显短于笨办法，而不是移动键凑数。
 */
export const DIFFICULTY_BRIEF: Record<ForgeDifficulty, string> = {
  light: '一两处小编辑、改完就走；起点离目标不远，不要拉长光标路程凑按键数。',
  standard: '两到三处编辑，或一处需要组合移动才能精确定位的修改；最好让聪明的解法明显短于笨办法。',
  hardcore:
    '难度要体现在解法的发现上，不是移动键的数量：制造「聪明解法明显短于笨办法」的结构——分散的多处同类编辑、长距离调度、能整块处理的内容；绝不要用一串移动键把光标挪过去只改一个词来凑按键数。',
}

/**
 * 题型原型池：题材池管「写什么」，这里管「怎么个改法」——给结构方向，防模型
 * 永远出「走到位置改个词」。minTier = 该原型需要的命令至少教到第几章才成立
 * （文本对象 ch4、块操作 ch5、搜索替换 ch6）。文案只描述结构不点破命令：
 * 提示由引擎从解法推导，出题人也不该剧透解法。
 */
export const PATTERN_POOL: readonly { minTier: ForgeTier; text: string }[] = [
  { minTier: 1, text: '多处同类小改：同一个模式在文本里反复出现，任务要把它们全部改掉或删掉' },
  { minTier: 1, text: '行序调整：把某行挪到别处，或复制一行到新位置（删行与粘贴的往返）' },
  { minTier: 2, text: '远距离调度：要改的位置在文本另一头，起点故意放远' },
  { minTier: 3, text: '合并与拆分：几行内容要并成一行，或一行要拆成几行' },
  { minTier: 3, text: '成段删除：一段连续内容整体消失，边界要找得准' },
  { minTier: 4, text: '定界改写：要改的内容被括号、引号或标签包着，只动里面、边界原样保留' },
  { minTier: 5, text: '列的批量活：多行在同一个列位置要一起加点东西或一起删掉' },
  { minTier: 6, text: '查找定位：目标词在文本里多处出现，得先跳到对的那处再动手' },
  { minTier: 6, text: '批量换名：整个文本范围内把一个词统一换成另一个词' },
]

/**
 * 内置题材池：玩家没填题材时随机抽一个——否则模型每道题都会落在它自己的最爱
 * （实测就是「配置里的端口」），连出十关全是同一张脸。rg 注入以便单测确定性。
 */
export const THEME_POOL = [
  '服务器日志的一行错误',
  'Dockerfile 指令',
  'shell 脚本的变量',
  'JSON 配置对象',
  'YAML 缩进与键值',
  'CSV 数据行',
  'Markdown 表格',
  'SQL 查询条件',
  'gitignore 规则',
  'Makefile 目标',
  '正则表达式',
  '测试断言',
  '函数签名与参数',
  '环境变量列表',
  '文件路径清单',
  'TODO 注释',
  'CSS 选择器',
  'Kubernetes 清单片段',
  'crontab 任务行',
  'package.json 依赖项',
] as const

/**
 * 组装「生成候选题材」的两条消息（system + user）。纯函数，可单测。
 * 失败回喂由 appendRepair 追加，不在本函数里。
 */
export function buildDraftMessages(
  params: ForgeParams,
  commands: CommandMeta[] = commandsUpTo(params.tier),
  rng: () => number = Math.random,
): ChatMessage[] {
  const range = PAR_RANGE[params.difficulty]
  const allowed = commands.map((c) => `- ${c.keys}：${c.desc}`).join('\n')
  const typed = params.theme.trim()
  const rolled = THEME_POOL[Math.min(THEME_POOL.length - 1, Math.max(0, Math.floor(rng() * THEME_POOL.length)))]!
  const themeLine = typed
    ? `题材：${typed}`
    : `题材：${rolled}（若不好写可换成别的真实场景，但避免总出「改配置里的端口/数值」这类）`
  // 题型方向：先按命令档过滤出该档命令撑得起的原型，再随机抽一个（rng 注入以便单测）
  const tierPatterns = PATTERN_POOL.filter((p) => params.tier >= p.minTier)
  const pattern = tierPatterns[Math.min(tierPatterns.length - 1, Math.max(0, Math.floor(rng() * tierPatterns.length)))]!
  const user = [
    '请出一道 vim 练习关卡。',
    '',
    '可用命令（只能出一道用这些命令能解的题）：',
    allowed,
    '',
    `难度：${DIFFICULTY_LABEL[params.difficulty]}——最优解法大约需要 ${range.min}–${range.max} 次按键。`,
    `难度要求：${DIFFICULTY_BRIEF[params.difficulty]}`,
    `题型方向：${pattern.text}（与题材叠加考虑；确实不好写可换别的结构，但不要降低难度要求）`,
    `规模：最多 ${params.maxLines} 行、每行不超过 ${params.maxCols} 个字符。`,
    themeLine,
    '',
    '再次强调：只输出 JSON 对象。',
  ].join('\n')
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user },
  ]
}

/** 回喂重试（PLAN §14.2）：上一条回答 + 具体失败原因，作为新消息追加 */
export function appendRepair(messages: ChatMessage[], previousRaw: string, failure: string): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: previousRaw },
    {
      role: 'user',
      content: `上一条不满足要求，被本地校验拒绝：${failure}\n请修正后重新只输出一个 JSON 对象。`,
    },
  ]
}
