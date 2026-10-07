import { ForgeError } from './types'
import type { ChatDeltaEvent, ChatMessage, ChatResult, ChatUsage, ForgeProvider, ProviderConfig } from './types'

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
  const timeoutMs = config.timeoutMs ?? 300_000
  const jsonMode = config.jsonMode ?? 'auto'
  const url = chatCompletionsUrl(config.baseUrl)

  function request(messages: ChatMessage[], signal: AbortSignal, mode: { stream: boolean; json: boolean }): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`
    const body: Record<string, unknown> = { model: config.model, messages, temperature: 0.7, stream: mode.stream }
    if (mode.json) body.response_format = { type: 'json_object' }
    return fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  }

  return {
    id: 'openai',
    label: 'OpenAI 兼容',
    async chat(messages, opts): Promise<ChatResult> {
      if (!config.model.trim()) throw new ForgeError('config', '未填写模型名')
      const ctrl = new AbortController()
      // 有增量消费者才流式：没有 onDelta 时走久经考验的非流式路径
      const wantStream = opts?.onDelta !== undefined
      let timedOut = false
      let streamAlive = false
      const classify = (e: unknown): ForgeError => {
        if (opts?.signal?.aborted) return new ForgeError('aborted', '已取消')
        if (timedOut) return new ForgeError('timeout', `超过 ${timeoutMs}ms ${streamAlive ? '没有新数据' : '未响应'}`)
        if (e instanceof ForgeError) return e
        return new ForgeError('network', e instanceof Error ? e.message : String(e))
      }
      const onAbort = (): void => ctrl.abort()
      if (opts?.signal) {
        if (opts.signal.aborted) throw new ForgeError('aborted', '已取消')
        opts.signal.addEventListener('abort', onAbort, { once: true })
      }
      // 流式下超时 = 「无新数据」的空闲超时（每收到一帧重置）；非流式 = 整请求总时长（只设一次）
      let timer: ReturnType<typeof setTimeout> | null = null
      const arm = (): void => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timedOut = true
          ctrl.abort()
        }, timeoutMs)
      }
      try {
        arm()
        let res: Response
        try {
          res = await request(messages, ctrl.signal, { stream: wantStream, json: jsonMode !== 'off' })
        } catch (e) {
          throw classify(e)
        }
        // 部分兼容服务不认 response_format：摘掉重试一次（jsonMode=auto 时）
        if (!res.ok && jsonMode === 'auto' && (res.status === 400 || res.status === 422)) {
          arm()
          try {
            res = await request(messages, ctrl.signal, { stream: wantStream, json: false })
          } catch (e) {
            throw classify(e)
          }
        }
        if (!res.ok) throw await httpError(res)
        // 服务不理 stream 参数、整包 JSON 返回：content-type 嗅探后走非流式解析
        if (wantStream && res.body && (res.headers.get('content-type') ?? '').includes('text/event-stream')) {
          streamAlive = true
          try {
            return await readSseChat(res, opts!.onDelta!, arm)
          } catch (e) {
            throw classify(e)
          }
        }
        const data: unknown = await res.json().catch(() => null)
        const text = contentOf(data)
        if (text === null) throw new ForgeError('bad-response', '响应里没有 choices[0].message.content')
        return { text, usage: usageOf(data) }
      } finally {
        if (timer) clearTimeout(timer)
        opts?.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

/**
 * SSE 流式读取（PLAN §14.7，零依赖手写）：行缓冲容忍跨 chunk 的半行。
 * thinking 字段无行业标准：DeepSeek 系 reasoning_content、OpenRouter reasoning、
 * Ollama thinking——多字段尝试，取不到就不产生 thinking 增量（不作机制依赖）。
 */
async function readSseChat(
  res: Response,
  onDelta: (delta: ChatDeltaEvent) => void,
  onFrame: () => void,
): Promise<ChatResult> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let content = ''
  let usage: ChatUsage | undefined
  // 正文承载位置不一定在 delta.content（部分兼容层/legacy 网关用 message.content 或 completions 式 text）；
  // 首个出现正文的字段一经出现即锁定——防「delta 增量 + 尾帧 message 汇总」双计
  let contentField: 'delta' | 'message' | 'text' | null = null
  const handleLine = (line: string): void => {
    if (!line.startsWith('data:')) return // event:/id:/冒号注释行忽略
    const payload = line.slice(5).replace(/^ /, '')
    if (!payload || payload === '[DONE]') return
    let obj: unknown
    try {
      obj = JSON.parse(payload)
    } catch {
      return // 坏帧跳过，不毒化整次响应
    }
    const o = obj as {
      choices?: Array<{ delta?: Record<string, unknown>; message?: { content?: unknown }; text?: unknown }>
      error?: { message?: unknown }
    }
    // 部分服务出错不开 4xx：200 开流后在帧里塞 {"error":{…}}——透出真实原因，别落到「没有内容增量」
    if (o.error) throw new ForgeError('bad-response', firstString(o.error.message) ?? '服务在流式响应里报了错')
    const choice = o.choices?.[0]
    if (choice) {
      const delta = choice.delta
      if (delta) {
        const think = firstString(delta.reasoning_content, delta.reasoning, delta.thinking)
        if (think !== undefined) onDelta({ kind: 'thinking', text: think })
      }
      let out: string | undefined
      if (contentField === 'delta') out = firstString(delta?.content)
      else if (contentField === 'message') out = firstString(choice.message?.content)
      else if (contentField === 'text') out = firstString(choice.text)
      else {
        out = firstString(delta?.content) ?? firstString(choice.message?.content) ?? firstString(choice.text)
        if (out !== undefined) contentField = delta?.content !== undefined ? 'delta' : choice.message?.content !== undefined ? 'message' : 'text'
      }
      if (out !== undefined) {
        content += out
        onDelta({ kind: 'output', text: out })
      }
    }
    const u = usageOf(obj)
    if (u) usage = u // usage 常在尾帧（choices 为空数组）捎带
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    onFrame()
    buf += decoder.decode(value, { stream: true })
    let nl = buf.indexOf('\n')
    while (nl !== -1) {
      handleLine(buf.slice(0, nl).replace(/\r$/, ''))
      buf = buf.slice(nl + 1)
      nl = buf.indexOf('\n')
    }
  }
  handleLine(buf.replace(/\r$/, '') + decoder.decode()) // 尾行无换行 + 解码器余量
  if (content === '') throw new ForgeError('bad-response', '流式响应里没有内容增量')
  return { text: content, usage }
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v.length > 0) return v
  return undefined
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
