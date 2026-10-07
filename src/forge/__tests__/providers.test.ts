import { describe, expect, it, vi } from 'vitest'
import { chatCompletionsUrl, createOpenAIProvider } from '../providers/openai'
import { createDemoProvider, DEMO_DRAFT } from '../providers/demo'
import { ForgeError } from '../providers/types'
import type { ChatDeltaEvent, ProviderConfig } from '../providers/types'
import { extractJson, parseDraft } from '../parse'

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  baseUrl: 'http://localhost:11434/v1',
  model: 'qwen2.5-coder',
  ...over,
})

const okBody = (content: string, usage?: Record<string, number>): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content } }], ...(usage ? { usage } : {}) }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const hang = (init?: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })

describe('chatCompletionsUrl', () => {
  it('base 补全到 /chat/completions，已是完整路径不重复', () => {
    expect(chatCompletionsUrl(' http://localhost:11434/v1/ ')).toBe('http://localhost:11434/v1/chat/completions')
    expect(chatCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1/chat/completions',
    )
  })

  it('空地址 → config 错误', () => {
    expect(() => chatCompletionsUrl('  ')).toThrowError(ForgeError)
  })
})

describe('createOpenAIProvider（OpenAI 兼容）', () => {
  it('成功：带 Authorization 与 response_format，解析文本与 usage', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      okBody('{"title":"x"}', { prompt_tokens: 11, completion_tokens: 22 }),
    )
    const p = createOpenAIProvider(cfg({ apiKey: 'sk-1' }), { fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await p.chat([{ role: 'user', content: 'hi' }])
    expect(r.text).toBe('{"title":"x"}')
    expect(r.usage).toEqual({ promptTokens: 11, completionTokens: 22 })
    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-1')
    expect(JSON.parse(String(init.body))).toMatchObject({ model: 'qwen2.5-coder', response_format: { type: 'json_object' } })
  })

  it('无 key 时不带 Authorization（本地模型）', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => okBody('{}'))
    const p = createOpenAIProvider(cfg(), { fetchImpl: fetchImpl as unknown as typeof fetch })
    await p.chat([{ role: 'user', content: 'hi' }])
    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('错误分类：401→auth、429→rate-limit、500→http', async () => {
    const mk = (status: number) =>
      createOpenAIProvider(cfg(), {
        fetchImpl: (async () => new Response('boom', { status })) as unknown as typeof fetch,
      })
    await expect(mk(401).chat([])).rejects.toMatchObject({ kind: 'auth' })
    await expect(mk(429).chat([])).rejects.toMatchObject({ kind: 'rate-limit' })
    await expect(mk(500).chat([])).rejects.toMatchObject({ kind: 'http', status: 500 })
  })

  it('网络异常 → network', async () => {
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    await expect(p.chat([])).rejects.toMatchObject({ kind: 'network' })
  })

  it('超时 → timeout（默认 300s，测试注入短超时）', async () => {
    const p = createOpenAIProvider(cfg({ timeoutMs: 20 }), {
      fetchImpl: ((_url: string, init?: RequestInit) => hang(init)) as unknown as typeof fetch,
    })
    await expect(p.chat([])).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('外部取消 → aborted', async () => {
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: ((_url: string, init?: RequestInit) => hang(init)) as unknown as typeof fetch,
    })
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 10)
    await expect(p.chat([], { signal: ctrl.signal })).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('jsonMode=auto：400 拒绝 response_format 后摘掉重试一次', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(String(init?.body))
      return calls.length === 1 ? new Response('bad', { status: 400 }) : okBody('{"ok":1}')
    })
    const p = createOpenAIProvider(cfg(), { fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await p.chat([])
    expect(r.text).toBe('{"ok":1}')
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[1]!)).not.toHaveProperty('response_format')
  })

  it('jsonMode=on：服务不认则如实报错，不偷偷降级', async () => {
    const p = createOpenAIProvider(cfg({ jsonMode: 'on' }), {
      fetchImpl: (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch,
    })
    await expect(p.chat([])).rejects.toMatchObject({ kind: 'http', status: 400 })
  })

  it('200 但结构不对 → bad-response', async () => {
    const p = createOpenAIProvider(cfg(), { fetchImpl: (async () => okBody('')) as unknown as typeof fetch })
    await expect(p.chat([])).rejects.toMatchObject({ kind: 'bad-response' })
  })

  it('缺模型名 → config', async () => {
    const p = createOpenAIProvider(cfg({ model: ' ' }))
    await expect(p.chat([])).rejects.toMatchObject({ kind: 'config' })
  })
})

// —— SSE 流式（PLAN §14.7）：手写解析器的行为锁定 ——
const enc = new TextEncoder()

const sseResponse = (chunks: string[]): Response => {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const frame = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`
const contentFrame = (text: string): string => frame({ choices: [{ delta: { content: text } }] })
const DONE = 'data: [DONE]\n\n'

/** 首帧后停住不关流；abort 时 error 掉 controller——模拟真 fetch body 随 signal 取消 */
const stalledSse = (init?: RequestInit): Response => {
  let rc: ReadableStreamDefaultController<Uint8Array> | null = null
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      rc = c
      c.enqueue(enc.encode(contentFrame('x')))
    },
  })
  init?.signal?.addEventListener('abort', () => rc?.error(new DOMException('aborted', 'AbortError')))
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

describe('createOpenAIProvider（SSE 流式）', () => {
  it('增量累积成完整文本；thinking 多字段不进正文；尾帧 usage 被拾取', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse([
        frame({ choices: [{ delta: { reasoning_content: '想一想' } }] }), // DeepSeek 系
        frame({ choices: [{ delta: { thinking: '再想想' } }] }), // Ollama
        contentFrame('{"a"'),
        contentFrame(':1}'),
        frame({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 7 } }),
        DONE,
      ]),
    )
    const p = createOpenAIProvider(cfg(), { fetchImpl: fetchImpl as unknown as typeof fetch })
    const deltas: ChatDeltaEvent[] = []
    const r = await p.chat([{ role: 'user', content: 'hi' }], { onDelta: (d) => deltas.push(d) })
    expect(r.text).toBe('{"a":1}')
    expect(r.usage).toEqual({ promptTokens: 5, completionTokens: 7 })
    expect(deltas.map((d) => d.kind)).toEqual(['thinking', 'thinking', 'output', 'output'])
    expect(deltas.filter((d) => d.kind === 'thinking').map((d) => d.text).join('')).toBe('想一想再想想')
  })

  it('跨 chunk 半行、注释行、坏 JSON 帧都不炸', async () => {
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: (async () =>
        sseResponse([
          ': keep-alive\n\n',
          'data: {"choices":[{"del', // 半行切断
          'ta":{"content":"hi"}}]}\n\n',
          'data: {broken\n\n',
          DONE,
        ])) as unknown as typeof fetch,
    })
    const deltas: ChatDeltaEvent[] = []
    const r = await p.chat([], { onDelta: (d) => deltas.push(d) })
    expect(r.text).toBe('hi')
    expect(deltas).toEqual([{ kind: 'output', text: 'hi' }])
  })

  it('请求体带 stream:true；jsonMode=auto 的 400 重试仍保持流式', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(String(init?.body))
      return bodies.length === 1 ? new Response('bad', { status: 400 }) : sseResponse([contentFrame('{"ok":1}'), DONE])
    })
    const p = createOpenAIProvider(cfg(), { fetchImpl: fetchImpl as unknown as typeof fetch })
    const r = await p.chat([], { onDelta: () => {} })
    expect(r.text).toBe('{"ok":1}')
    expect(JSON.parse(bodies[0]!)).toMatchObject({ stream: true, response_format: { type: 'json_object' } })
    const retry = JSON.parse(bodies[1]!)
    expect(retry.stream).toBe(true)
    expect(retry).not.toHaveProperty('response_format')
  })

  it('服务不理 stream 回整包 JSON：content-type 嗅探降级非流式解析', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => okBody('{"x":9}'))
    const p = createOpenAIProvider(cfg(), { fetchImpl: fetchImpl as unknown as typeof fetch })
    const deltas: ChatDeltaEvent[] = []
    const r = await p.chat([], { onDelta: (d) => deltas.push(d) })
    expect(r.text).toBe('{"x":9}')
    expect(deltas).toEqual([]) // 降级路径不产生增量，UI 只显示「等待模型响应」
    const init = fetchImpl.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(String(init.body)).stream).toBe(true) // 但请求确实要了流式
  })

  it('首帧后停住 → timeout（空闲语义：首帧已收到，超时按「没有新数据」计）', async () => {
    const p = createOpenAIProvider(cfg({ timeoutMs: 40 }), {
      fetchImpl: ((_url: string, init?: RequestInit) => stalledSse(init)) as unknown as typeof fetch,
    })
    const deltas: ChatDeltaEvent[] = []
    await expect(p.chat([], { onDelta: (d) => deltas.push(d) })).rejects.toMatchObject({ kind: 'timeout' })
    expect(deltas.length).toBe(1)
  })

  it('流式中途外部取消 → aborted', async () => {
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: ((_url: string, init?: RequestInit) => stalledSse(init)) as unknown as typeof fetch,
    })
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 10)
    await expect(p.chat([], { signal: ctrl.signal, onDelta: () => {} })).rejects.toMatchObject({ kind: 'aborted' })
  })

  it('200 流式但只有 thinking、无内容增量 → bad-response', async () => {
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: (async () => sseResponse([frame({ choices: [{ delta: { reasoning_content: '只想不说' } }] }), DONE])) as unknown as typeof fetch,
    })
    await expect(p.chat([], { onDelta: () => {} })).rejects.toMatchObject({ kind: 'bad-response' })
  })

  it('正文承载不在 delta.content：message.content / text 形状都能累积', async () => {
    const mk = (chunks: string[]) =>
      createOpenAIProvider(cfg(), { fetchImpl: (async () => sseResponse(chunks)) as unknown as typeof fetch })
    const msgStyle = await mk([
      frame({ choices: [{ message: { content: '{"b":' } }] }),
      frame({ choices: [{ message: { content: '2}' } }] }),
      DONE,
    ]).chat([], { onDelta: () => {} })
    expect(msgStyle.text).toBe('{"b":2}')
    const textStyle = await mk([
      frame({ choices: [{ text: '{"c":' }] }), // legacy completions 式
      frame({ choices: [{ text: '3}' }] }),
      DONE,
    ]).chat([], { onDelta: () => {} })
    expect(textStyle.text).toBe('{"c":3}')
  })

  it('正文字段一经出现即锁定：尾帧 message 汇总不与 delta 增量双计', async () => {
    const deltas: ChatDeltaEvent[] = []
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: (async () =>
        sseResponse([
          frame({ choices: [{ delta: { role: 'assistant', content: '' } }] }), // 空串 role 首帧即锁定 delta
          contentFrame('{"d":4}'),
          frame({ choices: [{ message: { content: '{"d":4}' } }] }), // 汇总帧，应被忽略
          DONE,
        ])) as unknown as typeof fetch,
    })
    const r = await p.chat([], { onDelta: (d) => deltas.push(d) })
    expect(r.text).toBe('{"d":4}')
    expect(deltas.filter((d) => d.kind === 'output')).toHaveLength(1)
  })

  it('error 帧（200 开流后塞 {"error":{…}}）→ bad-response 且透出服务给的原因', async () => {
    const p = createOpenAIProvider(cfg(), {
      fetchImpl: (async () =>
        sseResponse([frame({ error: { message: 'model not found: qwen99', code: 404 } }), DONE])) as unknown as typeof fetch,
    })
    const err = await p.chat([], { onDelta: () => {} }).catch((e: unknown) => e)
    expect(err).toMatchObject({ kind: 'bad-response' })
    expect((err as Error).message).toContain('model not found')
  })

  it('max_tokens 三态：默认显式 65536（救 Ollama 落 num_predict=128）；0 不发送；自定义透传', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      bodies.push(String(_init?.body))
      return okBody('{}')
    })
    const mk = (over: Partial<ProviderConfig>) =>
      createOpenAIProvider(over as ProviderConfig, { fetchImpl: fetchImpl as unknown as typeof fetch })
    await mk(cfg()).chat([])
    await mk(cfg({ maxTokens: 0 })).chat([])
    await mk(cfg({ maxTokens: 1_000_000 })).chat([])
    expect(JSON.parse(bodies[0]!).max_tokens).toBe(65_536)
    expect(JSON.parse(bodies[1]!)).not.toHaveProperty('max_tokens')
    expect(JSON.parse(bodies[2]!).max_tokens).toBe(1_000_000)
  })

  it('流式撞输出上限（finish_reason=length）→ 如实报截断，不当「题目不合格」回喂重试', async () => {
    const p = createOpenAIProvider(cfg({ maxTokens: 512 }), {
      fetchImpl: (async () =>
        sseResponse([
          contentFrame('{"title":"断在半截'),
          frame({ choices: [{ delta: {}, finish_reason: 'length' }] }),
          DONE,
        ])) as unknown as typeof fetch,
    })
    const err = await p.chat([], { onDelta: () => {} }).catch((e: unknown) => e)
    expect(err).toMatchObject({ kind: 'bad-response' })
    expect((err as Error).message).toContain('512')
    expect((err as Error).message).toContain('length')
  })

  it('非流式 finish_reason=length 同样检测（0 = 未发送上限时文案指向服务端）', async () => {
    const mk = (maxTokens: number) =>
      createOpenAIProvider(cfg({ maxTokens }), {
        fetchImpl: (async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: 'x' }, finish_reason: 'length' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })) as unknown as typeof fetch,
      })
    const withCap = await mk(4096).chat([]).catch((e: unknown) => e)
    expect((withCap as Error).message).toContain('4096')
    const noCap = await mk(0).chat([]).catch((e: unknown) => e)
    expect((noCap as Error).message).toContain('服务端')
    expect(noCap).toMatchObject({ kind: 'bad-response' })
  })
})

describe('createDemoProvider（离线演示）', () => {
  it('默认直接给合规 fixture', async () => {
    const p = createDemoProvider()
    const r = await p.chat([])
    const raw = extractJson(r.text)
    expect(parseDraft(raw, { maxLines: 8, maxCols: 64 }).ok).toBe(true)
  })

  it('onDelta：一段 thinking + 切片 output，拼回完整正文', async () => {
    const p = createDemoProvider()
    const deltas: ChatDeltaEvent[] = []
    const r = await p.chat([{ role: 'user', content: '出题' }], { onDelta: (d) => deltas.push(d) })
    expect(deltas[0]?.kind).toBe('thinking')
    expect(deltas.filter((d) => d.kind === 'output').map((d) => d.text).join('')).toBe(r.text)
    expect(r.text).toBe(JSON.stringify(DEMO_DRAFT))
  })

  it('failFirst：第一次坏数据、第二次合规（覆盖回喂链路）', async () => {
    const p = createDemoProvider({ failFirst: true })
    const first = extractJson((await p.chat([])).text)
    expect(parseDraft(first, { maxLines: 8, maxCols: 64 }).ok).toBe(false)
    const second = parseDraft(extractJson((await p.chat([])).text), { maxLines: 8, maxCols: 64 })
    expect(second.ok).toBe(true)
  })
})
