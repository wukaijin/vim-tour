import type { CandidateDraft } from '../types'
import type { ChatResult, ForgeProvider } from './types'

/**
 * 离线演示 provider（PLAN §14.8）：无头走查与「没有模型也想看形态」的入口。
 * 固定 fixture 走真实链路（解析 → 结构校验 → 求解器算 par → 闸门），零真实网络。
 * fixture 与工坊的演示预设（tier 3 / 标准）配套；是否落在 par 区间由闸门实测决定。
 */
export const DEMO_DRAFT: CandidateDraft = {
  title: '改掉写死的端口',
  brief: '服务端口写成了 3000，把它改成 8080。',
  start: ['port = 3000;'],
  target: ['port = 8080;'],
  cursor: { line: 0, col: 0 },
  commands: ['f', 'cw', '<Esc>'],
  parKeys: 'f3cw8080<Esc>',
}

export const DEMO_MODEL = 'demo'

/** 演示 fixture 配套的旋钮：第 3 章命令集（f/cw/<Esc>）、par 9 落在标准档 */
export const DEMO_PARAMS = { tier: 3, difficulty: 'standard' } as const

/** 坏示例：有 JSON 形状但 start 不是数组，走查用 failFirst 覆盖「解析失败 → 回喂重试」链路 */
const BAD_PAYLOAD =
  '好的，这是你要的关卡：{"title":"占位","brief":"占位","start":"不是数组","target":[],"cursor":{"line":0,"col":0}}'

export interface DemoProviderOptions {
  /** 第一次调用先返回坏数据（默认 false；无头走查传 true） */
  failFirst?: boolean
}

export function createDemoProvider(opts: DemoProviderOptions = {}): ForgeProvider {
  let calls = 0
  return {
    id: 'demo',
    label: '离线演示',
    async chat(_messages, chatOpts): Promise<ChatResult> {
      calls += 1
      const bad = opts.failFirst === true && calls === 1
      const text = bad ? BAD_PAYLOAD : JSON.stringify(DEMO_DRAFT)
      // 有增量消费者时模拟流式节奏：一段 thinking + 三片 output，让进度 UI 与走查有中间态可断言
      if (chatOpts?.onDelta) {
        chatOpts.onDelta({ kind: 'thinking', text: '演示模型正在出题' })
        const third = Math.ceil(text.length / 3)
        for (let i = 0; i < text.length; i += third) {
          chatOpts.onDelta({ kind: 'output', text: text.slice(i, i + third) })
          await new Promise((resolve) => setTimeout(resolve, 15))
        }
      }
      return { text }
    },
  }
}
