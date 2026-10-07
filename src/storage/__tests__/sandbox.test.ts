import { describe, expect, it } from 'vitest'
import {
  SANDBOX_MAX_ENTRIES,
  SANDBOX_SCHEMA_VERSION,
  SANDBOX_STORAGE_KEY,
  createSandboxRepository,
  parseSandboxExport,
  sanitizeSandboxLevel,
  serializeSandboxExport,
  withFreshIds,
} from '../sandbox'
import type { SandboxLevel } from '../../forge/types'
import { FORGE_LIMITS } from '../../forge/types'
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

const level = (over: Partial<SandboxLevel> = {}): SandboxLevel => ({
  id: 'sbx-test-0001',
  title: '改端口',
  brief: '把写死的端口改掉。',
  grid: true,
  allowedKeys: ['<Esc>', 'i', 'w', 'cw'],
  solverKeys: ['cw', '<Esc>'],
  text: { start: ['port = 3000;'], target: ['port = 8080;'], cursor: { line: 0, col: 0 }, parKeys: 'wcw8080<Esc>' },
  provenance: { tier: 3, difficulty: 'standard', model: 'demo', createdAt: 1_760_000_000_000, parSource: 'verified' },
  stats: { bestStars: 3, bestKeys: 9, attempts: 2 },
  ...over,
})

describe('createSandboxRepository（独立命名空间）', () => {
  it('CRUD：put/get/all/remove/clear', () => {
    const repo = createSandboxRepository(memStorage())
    expect(repo.put(level())).toBe(true)
    expect(repo.get('sbx-test-0001')?.title).toBe('改端口')
    expect(repo.all()).toHaveLength(1)
    expect(repo.remove('sbx-test-0001')).toBe(true)
    expect(repo.remove('sbx-test-0001')).toBe(false)
    expect(repo.all()).toHaveLength(0)
    repo.put(level())
    repo.clear()
    expect(repo.all()).toHaveLength(0)
  })

  it('不写进度仓库的 key：两个命名空间互不可见', () => {
    const storage = memStorage()
    const repo = createSandboxRepository(storage)
    repo.put(level())
    expect(storage.dump().has(SANDBOX_STORAGE_KEY)).toBe(true)
    expect(storage.dump().has('vim-tour:progress')).toBe(false)
  })

  it('非法数据被拒（put 返回 false，不是静默吞）', () => {
    const repo = createSandboxRepository(memStorage())
    expect(repo.put(level({ text: { ...level().text, target: ['port = 3000;'] } }))).toBe(false)
    expect(repo.put(level({ id: 'bad-id' }))).toBe(false)
    expect(repo.put(level({ allowedKeys: [] }))).toBe(false)
    expect(repo.all()).toHaveLength(0)
  })

  it('损坏 / 版本不符的存量数据 → 空库不崩', () => {
    for (const raw of ['{oops', JSON.stringify({ schemaVersion: 99, levels: [level()] })]) {
      const repo = createSandboxRepository(memStorage({ [SANDBOX_STORAGE_KEY]: raw }))
      expect(repo.all()).toHaveLength(0)
    }
  })

  it(`条数上限 ${SANDBOX_MAX_ENTRIES}：新的在前，旧的被挤掉`, () => {
    const repo = createSandboxRepository(memStorage())
    for (let i = 0; i < SANDBOX_MAX_ENTRIES + 5; i++) {
      repo.put(level({ id: `sbx-cap-${String(i).padStart(4, '0')}` }))
    }
    const all = repo.all()
    expect(all).toHaveLength(SANDBOX_MAX_ENTRIES)
    expect(all[0]!.id).toBe(`sbx-cap-${String(SANDBOX_MAX_ENTRIES + 4).padStart(4, '0')}`)
    expect(all.some((l) => l.id === 'sbx-cap-0000')).toBe(false)
  })

  it('返回副本：外部改动不污染仓库', () => {
    const repo = createSandboxRepository(memStorage())
    repo.put(level())
    repo.get('sbx-test-0001')!.title = '被改了'
    expect(repo.get('sbx-test-0001')!.title).toBe('改端口')
  })
})

describe('导出 / 导入（PLAN §14.4）', () => {
  it('round trip：结构保留，导出不含 key/配置字段', () => {
    const text = serializeSandboxExport([level()], { exportedAt: 1_760_000_000_000 })
    expect(text).not.toContain('apiKey')
    expect(text).not.toContain('keyring')
    const r = parseSandboxExport(text)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.levels).toHaveLength(1)
      expect(r.levels[0]!.text.start).toEqual(['port = 3000;'])
      expect(r.skipped).toBe(0)
    }
  })

  it('导入拒绝：非 JSON / 不是沙盒文件 / 版本不符 / 没有可用关卡', () => {
    expect(parseSandboxExport('nope').ok).toBe(false)
    expect(parseSandboxExport(JSON.stringify({ kind: 'other' })).ok).toBe(false)
    expect(
      parseSandboxExport(JSON.stringify({ kind: 'sandbox', schemaVersion: 99, levels: [level()] })).ok,
    ).toBe(false)
    expect(
      parseSandboxExport(JSON.stringify({ kind: 'sandbox', schemaVersion: SANDBOX_SCHEMA_VERSION, levels: [{}] })).ok,
    ).toBe(false)
  })

  it('导入部分损坏：可用的留下，坏的计入 skipped', () => {
    const env = {
      kind: 'sandbox',
      schemaVersion: SANDBOX_SCHEMA_VERSION,
      levels: [level(), { id: 'bad' }],
    }
    const r = parseSandboxExport(JSON.stringify(env))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.levels).toHaveLength(1)
      expect(r.skipped).toBe(1)
    }
  })

  it('withFreshIds：换 id 且清空成绩（别人的星不算你的）', () => {
    let n = 0
    const out = withFreshIds([level()], () => `sbx-new-${String(n++).padStart(4, '0')}`)
    expect(out[0]!.id).toBe('sbx-new-0000')
    expect(out[0]!.stats).toEqual({ bestStars: 0, bestKeys: 0, attempts: 0 })
  })
})

describe('sanitizeSandboxLevel', () => {
  it('上限与生成旋钮同源（FORGE_LIMITS）：满尺寸关卡入库放行，超一被拒——锁「闸门放行、入库被拒」的分叉不再犯', () => {
    // 2026-10-08 实犯：入库层硬编码 12 行/80 列 < 旋钮上限，17 行 YAML 关过闸门后入库被拒
    const mk = (lines: number, cols: number): SandboxLevel => {
      const row = 'x'.repeat(cols)
      const start = Array.from({ length: lines }, () => row)
      const target = [...start]
      target[lines - 1] = 'y'.repeat(cols)
      return level({ text: { start, target, cursor: { line: 0, col: 0 }, parKeys: 'x' } })
    }
    expect(sanitizeSandboxLevel(mk(FORGE_LIMITS.lines, FORGE_LIMITS.cols))).not.toBeNull()
    expect(sanitizeSandboxLevel(mk(FORGE_LIMITS.lines + 1, FORGE_LIMITS.cols))).toBeNull()
    expect(sanitizeSandboxLevel(mk(FORGE_LIMITS.lines, FORGE_LIMITS.cols + 1))).toBeNull()
    const repo = createSandboxRepository(memStorage())
    expect(repo.put(mk(FORGE_LIMITS.lines, FORGE_LIMITS.cols))).toBe(true)
  })

  it('裁剪越界数值而不是整体拒绝（光标/成绩）', () => {
    const sane = sanitizeSandboxLevel(
      level({
        text: { start: ['abc'], target: ['abd'], cursor: { line: 5, col: 9 }, parKeys: 'x' },
        stats: { bestStars: 7 as 0, bestKeys: -3, attempts: 2 },
      }),
    )
    expect(sane?.text.cursor).toEqual({ line: 0, col: 2 })
    expect(sane?.stats).toEqual({ bestStars: 3, bestKeys: 0, attempts: 2 })
  })
})
