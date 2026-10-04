import { SCHEMA_VERSION } from '../game/types'
import type { LevelRecord, Stars } from '../game/types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** 进度存取抽象（PLAN §7）：首版 localStorage，后续可换后端 */
export interface ProgressRepository {
  get(levelId: string): LevelRecord | null
  put(record: LevelRecord): void
  all(): LevelRecord[]
  clear(): void
}

const STORAGE_KEY = 'vim-tour:progress'

interface Envelope {
  schemaVersion: number
  records: Partial<Record<string, LevelRecord>>
}

/** vN → vN+1 的迁移步骤登记处。v1 是首个版本，暂无步骤；新增字段时在此追加 */
const MIGRATIONS: Record<number, (e: Envelope) => Envelope> = {}

export function createProgressRepository(storage: StorageLike): ProgressRepository {
  let cache: Map<string, LevelRecord> | null = null

  function load(): Map<string, LevelRecord> {
    if (cache) return cache
    const records = new Map<string, LevelRecord>()
    let raw: string | null = null
    try {
      raw = storage.getItem(STORAGE_KEY)
    } catch {
      raw = null
    }
    if (raw) {
      try {
        const env = JSON.parse(raw) as Envelope
        const migrated = migrate(env)
        if (migrated) {
          for (const [id, rec] of Object.entries(migrated.records)) {
            const sane = sanitizeRecord(id, rec)
            if (sane) records.set(id, sane)
          }
        }
      } catch {
        // 损坏的 localStorage 不应崩游戏：从空进度开始
      }
    }
    cache = records
    return records
  }

  function persist(records: Map<string, LevelRecord>): void {
    const env: Envelope = {
      schemaVersion: SCHEMA_VERSION,
      records: Object.fromEntries(records.entries()),
    }
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(env))
    } catch {
      // 写失败（隐私模式/满额）：静默降级为会话内进度
    }
  }

  return {
    get(levelId) {
      return load().get(levelId) ?? null
    },
    put(record) {
      const records = load()
      records.set(record.levelId, sanitizeRecord(record.levelId, record) ?? {
        ...record,
        schemaVersion: SCHEMA_VERSION,
      })
      persist(records)
    },
    all() {
      return [...load().values()]
    },
    clear() {
      cache = new Map()
      try {
        storage.removeItem(STORAGE_KEY)
      } catch {
        // 同上：存储不可用时静默
      }
    },
  }
}

function migrate(env: Envelope): Envelope | null {
  if (typeof env?.schemaVersion !== 'number') return null
  let v = env.schemaVersion
  let e = env
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v]
    if (!step) return null
    e = step(e)
    v += 1
  }
  // 未来版本（用户降级应用）：不可解释，丢弃优于误读
  return v === SCHEMA_VERSION ? e : null
}

/** 防御手改 localStorage：字段类型/范围不合法时收敛到合法值，而不是带毒进游戏层 */
function sanitizeRecord(levelId: string, input: unknown): LevelRecord | null {
  if (input === null || typeof input !== 'object') return null
  const r = input as Record<string, unknown>
  if (typeof r.levelId !== 'string' || r.levelId !== levelId) return null
  const num = (x: unknown): number | null =>
    typeof x === 'number' && Number.isFinite(x) ? x : null
  const int = (x: unknown, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, Math.floor(num(x) ?? lo)))
  const stars = Math.min(3, Math.max(0, Math.floor(num(r.bestStars) ?? 0))) as 0 | Stars
  return {
    levelId,
    cleared: r.cleared === true,
    streak: int(r.streak, 0, Number.MAX_SAFE_INTEGER),
    bestStars: stars,
    bestKeys: int(r.bestKeys, 0, Number.MAX_SAFE_INTEGER),
    attempts: int(r.attempts, 0, Number.MAX_SAFE_INTEGER),
    lastPlayedAt: num(r.lastPlayedAt) ?? 0,
    srsStage: int(r.srsStage, 0, 4),
    schemaVersion: SCHEMA_VERSION,
  }
}

/** localStorage 不可用（隐私模式/被禁用/SSR）时的内存兜底：能玩，不持久 */
export function createMemoryStorage(): StorageLike {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  }
}

/** 探测可用的存储实现；结果缓存（UI 各处共享同一 localStorage） */
let detected: StorageLike | null = null
export function detectStorage(): StorageLike {
  if (detected) return detected
  detected = createMemoryStorage()
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__vim-tour-probe__'
      localStorage.setItem(probe, probe)
      localStorage.removeItem(probe)
      detected = localStorage
    }
  } catch {
    detected = createMemoryStorage()
  }
  return detected
}

/** 默认仓库：探测 localStorage 可用性，失败降级内存存储 */
export function defaultProgressRepository(): ProgressRepository {
  return createProgressRepository(detectStorage())
}
