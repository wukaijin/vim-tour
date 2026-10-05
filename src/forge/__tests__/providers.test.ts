import { describe, expect, it, vi } from 'vitest'
import { chatCompletionsUrl, createOpenAIProvider } from '../providers/openai'
import { createDemoProvider } from '../providers/demo'
import { ForgeError } from '../providers/types'
import type { ProviderConfig } from '../providers/types'
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

  it('超时 → timeout（默认 120s，测试注入短超时）', async () => {
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

describe('createDemoProvider（离线演示）', () => {
  it('默认直接给合规 fixture', async () => {
    const p = createDemoProvider()
    const r = await p.chat([])
    const raw = extractJson(r.text)
    expect(parseDraft(raw, { maxLines: 8, maxCols: 64 }).ok).toBe(true)
  })

  it('failFirst：第一次坏数据、第二次合规（覆盖回喂链路）', async () => {
    const p = createDemoProvider({ failFirst: true })
    const first = extractJson((await p.chat([])).text)
    expect(parseDraft(first, { maxLines: 8, maxCols: 64 }).ok).toBe(false)
    const second = parseDraft(extractJson((await p.chat([])).text), { maxLines: 8, maxCols: 64 })
    expect(second.ok).toBe(true)
  })
})
