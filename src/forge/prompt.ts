import { commandsUpTo } from '../content/commands'
import type { CommandMeta } from '../content/commands'
import { DIFFICULTY_LABEL, PAR_RANGE } from './types'
import type { ChatMessage, ForgeParams } from './types'

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
- 修改要小而明确：一到两处编辑，不要大段重写。
- 题材与文本结构要有变化：**不要每次都出「改配置里的端口/数值」这类题**；给出的题材若不好写，可以换成别的真实场景。
- cursor 是初始光标位置（line / col 从 0 起），请让起点合理：不要恰好停在要改的位置上，也别远到无聊。`

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
  const user = [
    '请出一道 vim 练习关卡。',
    '',
    '可用命令（只能出一道用这些命令能解的题）：',
    allowed,
    '',
    `难度：${DIFFICULTY_LABEL[params.difficulty]}——最优解法大约需要 ${range.min}–${range.max} 次按键。`,
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
