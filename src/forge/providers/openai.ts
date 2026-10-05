import { ForgeError } from './types'
import type { ChatMessage, ChatResult, ChatUsage, ForgeProvider, ProviderConfig } from './types'

/** base URL 归一化：'…/v1' → '…/v1/chat/completions'（已是完整路径则原样） */
export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (!base) throw new ForgeError('config', '未填写服务地址')
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`
}

export interface OpenAIProviderDeps {
  /** 测试注入；默认全局 fetch */
  fetchImpl?: typeof fetch
}

/**
 * OpenAI 兼容 provider（PLAN §14.6）：零 SDK，平台 fetch 直连。
 * 默认 base URL 指向本地 Ollama（无 key 可用）；远端同形状。
 */
export function createOpenAIProvider(config: ProviderConfig, deps: OpenAIProviderDeps = {}): ForgeProvider {
  const fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
  const timeoutMs = config.timeoutMs ?? 120_000
  const jsonMode = config.jsonMode ?? 'auto'
  const url = chatCompletionsUrl(config.baseUrl)

  async function request(messages: ChatMessage[], signal: AbortSignal, withJsonMode: boolean): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`
    const body: Record<string, unknown> = { model: config.model, messages, temperature: 0.7, stream: false }
    if (withJsonMode) body.response_format = { type: 'json_object' }
    return fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  }

  return {
    id: 'openai',
    label: 'OpenAI 兼容',
    async chat(messages, opts): Promise<ChatResult> {
      if (!config.model.trim()) throw new ForgeError('config', '未填写模型名')
      const ctrl = new AbortController()
      let timedOut = false
      const classify = (e: unknown): ForgeError => {
        if (opts?.signal?.aborted) return new ForgeError('aborted', '已取消')
        if (timedOut) return new ForgeError('timeout', `超过 ${timeoutMs}ms 未响应`)
        if (e instanceof ForgeError) return e
        return new ForgeError('network', e instanceof Error ? e.message : String(e))
      }
      const onAbort = (): void => ctrl.abort()
      if (opts?.signal) {
        if (opts.signal.aborted) throw new ForgeError('aborted', '已取消')
        opts.signal.addEventListener('abort', onAbort, { once: true })
      }
      const timer = setTimeout(() => {
        timedOut = true
        ctrl.abort()
      }, timeoutMs)
      try {
        let res: Response
        try {
          res = await request(messages, ctrl.signal, jsonMode !== 'off')
        } catch (e) {
          throw classify(e)
        }
        // 部分兼容服务不认 response_format：摘掉重试一次（jsonMode=auto 时）
        if (!res.ok && jsonMode === 'auto' && (res.status === 400 || res.status === 422)) {
          try {
            res = await request(messages, ctrl.signal, false)
          } catch (e) {
            throw classify(e)
          }
        }
        if (!res.ok) throw await httpError(res)
        const data: unknown = await res.json().catch(() => null)
        const text = contentOf(data)
        if (text === null) throw new ForgeError('bad-response', '响应里没有 choices[0].message.content')
        return { text, usage: usageOf(data) }
      } finally {
        clearTimeout(timer)
        opts?.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

async function httpError(res: Response): Promise<ForgeError> {
  const body = await res.text().catch(() => '')
  const excerpt = body.replace(/\s+/g, ' ').slice(0, 200)
  if (res.status === 401 || res.status === 403) return new ForgeError('auth', excerpt || 'API key 被拒绝', res.status)
  if (res.status === 429) return new ForgeError('rate-limit', excerpt || '请求过于频繁', res.status)
  return new ForgeError('http', excerpt || res.statusText, res.status)
}

function contentOf(data: unknown): string | null {
  const d = data as { choices?: Array<{ message?: { content?: unknown } }> } | null
  const c = d?.choices?.[0]?.message?.content
  return typeof c === 'string' && c.length > 0 ? c : null
}

function usageOf(data: unknown): ChatUsage | undefined {
  const u = (data as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage
  if (!u) return undefined
  const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : undefined
  const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : undefined
  if (promptTokens === undefined && completionTokens === undefined) return undefined
  return { promptTokens, completionTokens }
}
