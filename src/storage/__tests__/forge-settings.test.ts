import { describe, expect, it } from 'vitest'
import { FORGE_SETTINGS_KEY, loadForgeSettings, saveForgeSettings } from '../forge-settings'
import type { ForgeSettings } from '../forge-settings'
import type { StorageLike } from '../progress'

function memStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Map<string, string> } {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => m,
  }
}

const defaults: ForgeSettings = {
  providerKind: 'demo',
  baseUrl: 'http://localhost:11434/v1',
  model: '',
  params: { tier: 3, difficulty: 'standard', maxLines: 4, maxCols: 40, theme: '' },
}

const custom: ForgeSettings = {
  providerKind: 'openai',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'qwen2.5-coder:7b',
  params: { tier: 6, difficulty: 'hardcore', maxLines: 6, maxCols: 56, theme: '日志排查' },
}

describe('forge 设置持久化（非机密配置）', () => {
  it('round trip：存什么读什么', () => {
    const storage = memStorage()
    saveForgeSettings(storage, custom)
    expect(loadForgeSettings(storage, defaults)).toEqual(custom)
  })

  it('「随机」命令档是合法设置值，round trip 不丢', () => {
    const storage = memStorage()
    saveForgeSettings(storage, { ...custom, params: { ...custom.params, tier: 'random' } })
    expect(loadForgeSettings(storage, defaults).params.tier).toBe('random')
  })

  it('只存非机密字段：不含 key/口令', () => {
    const storage = memStorage()
    saveForgeSettings(storage, custom)
    const raw = storage.dump().get(FORGE_SETTINGS_KEY)!
    expect(raw).not.toContain('apiKey')
    expect(raw).not.toContain('passphrase')
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['baseUrl', 'model', 'params', 'providerKind'])
  })

  it('缺失 / 损坏 / 非对象 → 回到默认值', () => {
    for (const raw of [undefined, '{oops', '"字符串"', '[]']) {
      const storage = memStorage(raw === undefined ? {} : { [FORGE_SETTINGS_KEY]: raw })
      expect(loadForgeSettings(storage, defaults)).toEqual(defaults)
    }
  })

  it('手改数据收敛：越界档位回默认、数值钳制、超长题材丢弃', () => {
    const storage = memStorage({
      [FORGE_SETTINGS_KEY]: JSON.stringify({
        providerKind: 'weird',
        baseUrl: 42,
        model: 'x'.repeat(200),
        params: { tier: 99, difficulty: 'nope', maxLines: 100, maxCols: 1, theme: 'y'.repeat(300) },
      }),
    })
    const got = loadForgeSettings(storage, defaults)
    expect(got.providerKind).toBe('demo')
    expect(got.baseUrl).toBe(defaults.baseUrl)
    expect(got.model).toBe('')
    expect(got.params).toEqual({ tier: 3, difficulty: 'standard', maxLines: 8, maxCols: 16, theme: '' })
  })

  it('读返回的是副本：改它不污染 defaults', () => {
    const storage = memStorage()
    const got = loadForgeSettings(storage, defaults)
    got.params.theme = '污染'
    expect(defaults.params.theme).toBe('')
  })
})
