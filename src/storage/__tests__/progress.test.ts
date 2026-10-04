import { describe, expect, it } from 'vitest'
import {
  defaultProgressRepository,
  createProgressRepository,
  createMemoryStorage,
} from '../progress'
import type { StorageLike } from '../progress'
import { freshRecord } from '../../game/retention'
import { SCHEMA_VERSION } from '../../game/types'
import type { LevelRecord } from '../../game/types'

function memStorage(initial: Record<string, string> = {}): StorageLike & { dump(): Map<string, string> } {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => m,
  }
}

const rec = (id: string, over: Partial<LevelRecord> = {}): LevelRecord => ({
  ...freshRecord(id),
  cleared: true,
  streak: 1,
  bestStars: 3,
  bestKeys: 4,
  attempts: 1,
  lastPlayedAt: 1_760_000_000_000,
  ...over,
})

describe('ProgressRepository：localStorage 实现', () => {
  it('put/get/all 往返一致', () => {
    const storage = memStorage()
    const repo = createProgressRepository(storage)
    expect(repo.get('a')).toBeNull()
    repo.put(rec('a'))
    repo.put(rec('b', { bestStars: 2 }))
    expect(repo.get('a')).toEqual(rec('a'))
    expect(repo.all()).toHaveLength(2)
  })

  it('put 持久化到 storage，重建仓库可加载', () => {
    const storage = memStorage()
    const repo = createProgressRepository(storage)
    repo.put(rec('a'))
    expect(storage.dump().get('vim-tour:progress')).toBeTruthy()
    const reloaded = createProgressRepository(storage)
    expect(reloaded.get('a')).toEqual(rec('a'))
  })

  it('clear 清空进度并同步 storage', () => {
    const storage = memStorage()
    const repo = createProgressRepository(storage)
    repo.put(rec('a'))
    repo.clear()
    expect(repo.all()).toEqual([])
    expect(createProgressRepository(storage).all()).toEqual([])
  })

  it('损坏的 JSON：从空进度开始，不抛错', () => {
    const storage = memStorage({ 'vim-tour:progress': '{oops' })
    const repo = createProgressRepository(storage)
    expect(repo.all()).toEqual([])
    repo.put(rec('a'))
    expect(repo.get('a')).toEqual(rec('a'))
  })

  it('缺 schemaVersion 或未来版本：整包丢弃（不误读）', () => {
    const bad1 = memStorage({ 'vim-tour:progress': JSON.stringify({ records: { a: rec('a') } }) })
    expect(createProgressRepository(bad1).all()).toEqual([])
    const bad2 = memStorage({
      'vim-tour:progress': JSON.stringify({ schemaVersion: 99, records: { a: rec('a') } }),
    })
    expect(createProgressRepository(bad2).all()).toEqual([])
  })

  it('手改字段被收敛：srsStage 越界 clamp、非法数值落默认', () => {
    const poisoned = {
      schemaVersion: SCHEMA_VERSION,
      records: {
        a: { ...rec('a'), srsStage: 9, streak: -3, bestStars: 5, bestKeys: 'x', lastPlayedAt: NaN, cleared: 'yes' },
        b: { garbage: true },
        c: rec('c'),
      },
    }
    const storage = memStorage({ 'vim-tour:progress': JSON.stringify(poisoned) })
    const repo = createProgressRepository(storage)
    expect(repo.get('a')).toMatchObject({
      srsStage: 4,
      streak: 0,
      bestStars: 3,
      bestKeys: 0,
      lastPlayedAt: 0,
      cleared: false,
    })
    expect(repo.get('b')).toBeNull()
    expect(repo.get('c')).toEqual(rec('c'))
  })

  it('storage 抛异常时静默降级（读失败→空，写失败→会话内进度）', () => {
    const hostile: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    }
    const repo = createProgressRepository(hostile)
    expect(repo.all()).toEqual([])
    repo.put(rec('a'))
    expect(repo.get('a')).toEqual(rec('a')) // 缓存内仍可用
  })

  it('node 环境无 localStorage：默认仓库降级为内存存储仍可用', () => {
    expect(typeof localStorage).toBe('undefined')
    const repo = defaultProgressRepository()
    repo.put(rec('a'))
    expect(repo.get('a')).toEqual(rec('a'))
    expect(createMemoryStorage().getItem('x')).toBeNull()
  })
})
