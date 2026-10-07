import type { ChatMessage } from '../types'

export type { ChatMessage }

export interface ChatUsage {
  promptTokens?: number
  completionTokens?: number
}

export interface ChatResult {
  text: string
  usage?: ChatUsage
}

/** 流式增量种类：thinking = 推理段（各服务字段不一，尽力而为）；output = 正文段 */
export type ChatDeltaKind = 'thinking' | 'output'

export interface ChatDeltaEvent {
  kind: ChatDeltaKind
  text: string
}

export interface ChatOptions {
  signal?: AbortSignal
  /** 流式增量回调（PLAN §14.7）：provider 尽力而为，不保证被调用（服务不理 stream 参数 / 演示降级时静默） */
  onDelta?: (delta: ChatDeltaEvent) => void
}

/** provider 接口（PLAN §14.6）：OpenAI 兼容与离线演示都实现它 */
export interface ForgeProvider {
  readonly id: string
  readonly label: string
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>
}

export type ForgeErrorKind =
  | 'config'
  | 'network'
  | 'auth'
  | 'rate-limit'
  | 'http'
  | 'timeout'
  | 'aborted'
  | 'bad-response'
  | 'no-webcrypto'

export class ForgeError extends Error {
  readonly kind: ForgeErrorKind
  readonly status?: number

  constructor(kind: ForgeErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ForgeError'
    this.kind = kind
    this.status = status
  }
}

export interface ProviderConfig {
  baseUrl: string
  model: string
  apiKey?: string
  /** 默认 300s：本地模型慢（PLAN §14.7）。非流式 = 整请求总时长；流式 = 无新数据的空闲超时（每帧重置） */
  timeoutMs?: number
  /** response_format=json_object 的发送策略；auto = 先带，被 400/422 拒后去掉重试一次 */
  jsonMode?: 'auto' | 'on' | 'off'
}

/** 失败分类文案（PLAN §14.7）：给玩家看的一句话 */
export function forgeErrorText(e: unknown): string {
  if (!(e instanceof ForgeError)) return '未知错误'
  switch (e.kind) {
    case 'config':
      return `配置有误：${e.message}`
    case 'network':
      return '连接不上模型服务：检查地址与网络（本地模型需先启动服务）'
    case 'auth':
      return '鉴权失败：检查 API key'
    case 'rate-limit':
      return '被限流了：稍后再试或换个模型'
    case 'http':
      return `服务返回错误${e.status ? `（${e.status}）` : ''}：${e.message}`
    case 'timeout':
      return '模型超时未响应'
    case 'aborted':
      return '已取消'
    case 'bad-response':
      return `响应无法使用：${e.message}`
    case 'no-webcrypto':
      return '此环境不支持安全加密（crypto.subtle 不可用），key 只能保存在本次会话'
    default:
      return '未知错误'
  }
}
