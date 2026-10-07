import type { ForgeDifficulty, ForgeTier, SandboxLevel, SandboxStats } from '../forge/types'
import { FORGE_LIMITS } from '../forge/types'
import type { LevelText } from '../game/types'
import { detectStorage } from './progress'
import type { StorageLike } from './progress'

/**
 * 沙盒库（PLAN §14.4）：独立 localStorage 命名空间，与进度仓库零字段共享。
 * 本层不含时间读取（同 storage 层纪律）：createdAt 由调用方随数据传入。
 */
export const SANDBOX_STORAGE_KEY = 'vim-tour:sandbox'
/**
 * v2：白名单解耦（allowedKeys = 档位全部已教命令，solverKeys = 求解器窄集合）。
 * v1 数据（窄白名单当玩家规则）语义已不同——沙盒关卡一键可重建，直接丢弃不迁移。
 */
export const SANDBOX_SCHEMA_VERSION = 2
export const SANDBOX_MAX_ENTRIES = 50

export interface SandboxRepository {
  all(): SandboxLevel[]
  get(id: string): SandboxLevel | null
  /** 返回 false = 数据不合法被拒（不是静默丢弃） */
  put(level: SandboxLevel): boolean
  remove(id: string): boolean
  clear(): void
}

interface Envelope {
  schemaVersion: number
  levels: unknown[]
}

export function createSandboxRepository(storage: StorageLike): SandboxRepository {
  let cache: SandboxLevel[] | null = null

  function load(): SandboxLevel[] {
    if (cache) return cache
    const out: SandboxLevel[] = []
    let raw: string | null = null
    try {
      raw = storage.getItem(SANDBOX_STORAGE_KEY)
    } catch {
      raw = null
    }
    if (raw) {
      try {
        const env = JSON.parse(raw) as Envelope
        if (env?.schemaVersion === SANDBOX_SCHEMA_VERSION && Array.isArray(env.levels)) {
          for (const item of env.levels) {
            const sane = sanitizeSandboxLevel(item)
            if (sane) out.push(sane)
          }
        }
      } catch {
        // 损坏数据不崩游戏：从空库开始
      }
    }
    cache = out
    return out
  }

  function persist(levels: SandboxLevel[]): void {
    const env: Envelope = { schemaVersion: SANDBOX_SCHEMA_VERSION, levels }
    try {
      storage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(env))
    } catch {
      // 隐私模式/满额：静默降级为会话内
    }
  }

  return {
    all() {
      return structuredClone(load())
    },
    get(id) {
      const hit = load().find((l) => l.id === id)
      return hit ? structuredClone(hit) : null
    },
    put(level) {
      const sane = sanitizeSandboxLevel(level)
      if (!sane) return false
      const list = load().filter((l) => l.id !== sane.id)
      list.unshift(sane)
      if (list.length > SANDBOX_MAX_ENTRIES) list.length = SANDBOX_MAX_ENTRIES
      cache = list
      persist(list)
      return true
    },
    remove(id) {
      const list = load()
      const i = list.findIndex((l) => l.id === id)
      if (i === -1) return false
      list.splice(i, 1)
      persist(list)
      return true
    },
    clear() {
      cache = []
      try {
        storage.removeItem(SANDBOX_STORAGE_KEY)
      } catch {
        // 同上：存储不可用时静默
      }
    },
  }
}

const ID_RE = /^sbx-[A-Za-z0-9-]{6,60}$/
const TIERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]
const DIFFICULTIES: readonly string[] = ['light', 'standard', 'hardcore']

/** 防御手改/导入数据：字段类型范围不合法即整体拒绝（宁可少一条，不带毒进游戏层） */
export function sanitizeSandboxLevel(input: unknown): SandboxLevel | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return null
  const r = input as Record<string, unknown>
  const id = typeof r.id === 'string' && ID_RE.test(r.id) ? r.id : null
  if (!id) return null
  const title = str(r.title, 60)
  const brief = str(r.brief, 240)
  if (!title || !brief) return null
  const text = sanitizeText(r.text)
  if (!text) return null
  const allowedKeys = Array.isArray(r.allowedKeys)
    ? r.allowedKeys
        .filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 16)
        .slice(0, 200)
    : []
  if (allowedKeys.length === 0) return null
  // solverKeys（求解器字母表）：手改/旧数据缺失时回退到 allowedKeys（保守：按窄集合复算 par）
  const solverKeys = Array.isArray(r.solverKeys)
    ? r.solverKeys
        .filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 16)
        .slice(0, 60)
    : []
  const solver = solverKeys.length > 0 ? solverKeys : allowedKeys
  const p = (r.provenance ?? {}) as Record<string, unknown>
  const tier = TIERS.includes(p.tier as number) ? (p.tier as ForgeTier) : null
  const difficulty = DIFFICULTIES.includes(p.difficulty as string) ? (p.difficulty as ForgeDifficulty) : null
  if (tier === null || difficulty === null) return null
  return {
    id,
    title,
    brief,
    grid: r.grid !== false,
    allowedKeys,
    solverKeys: solver,
    text,
    provenance: {
      tier,
      difficulty,
      model: str(p.model, 64) ?? '未知',
      createdAt:
        typeof p.createdAt === 'number' && Number.isFinite(p.createdAt) && p.createdAt >= 0 ? p.createdAt : 0,
      // 手改/旧文件没有来源标记时按「已验证」处理（保守：不宣称最优）
      parSource: p.parSource === 'proven' ? 'proven' : 'verified',
    },
    stats: sanitizeStats(r.stats),
  }
}

function sanitizeText(v: unknown): LevelText | null {
  if (v === null || typeof v !== 'object') return null
  const t = v as Record<string, unknown>
  const start = readLines(t.start)
  const target = readLines(t.target)
  if (!start || !target) return null
  if (start.every((l) => l === '') || target.every((l) => l === '')) return null
  if (start.join('\n') === target.join('\n')) return null
  const parKeys = typeof t.parKeys === 'string' ? t.parKeys : ''
  if (!parKeys || parKeys.length > 200) return null
  const c = (t.cursor ?? {}) as Record<string, unknown>
  const line = intIn(c.line, 0, start.length - 1)
  const col = intIn(c.col, 0, Math.max(0, (start[line] ?? '').length - 1))
  return { start, target, cursor: { line, col }, parKeys }
}

function readLines(v: unknown): string[] | null {
  // 上限与生成旋钮同源（FORGE_LIMITS）：入库层比闸门窄会重演「闸门放行、入库被拒」的分叉
  if (!Array.isArray(v) || v.length < 1 || v.length > FORGE_LIMITS.lines) return null
  const out: string[] = []
  for (const l of v) {
    if (typeof l !== 'string' || l.length > FORGE_LIMITS.cols) return null
    if (/[\u0000-\u001f\u007f]/.test(l)) return null
    out.push(l)
  }
  return out
}

function sanitizeStats(v: unknown): SandboxStats {
  const s = (v ?? {}) as Record<string, unknown>
  const stars = intIn(s.bestStars, 0, 3)
  return {
    bestStars: stars as SandboxStats['bestStars'],
    bestKeys: intIn(s.bestKeys, 0, 100_000),
    attempts: intIn(s.attempts, 0, 100_000),
  }
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > 0 && s.length <= max ? s : null
}

function intIn(v: unknown, lo: number, hi: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : lo
  return Math.min(hi, Math.max(lo, n))
}

// ========== 导出 / 导入（PLAN §14.4） ==========

export interface SandboxExportFile {
  app: 'vim-tour'
  kind: 'sandbox'
  schemaVersion: number
  exportedAt?: number
  levels: SandboxLevel[]
}

/** 导出只含关卡数据：不含任何 key 与配置（PLAN §14.4 硬条款） */
export function serializeSandboxExport(levels: SandboxLevel[], opts: { exportedAt?: number } = {}): string {
  const env: SandboxExportFile = { app: 'vim-tour', kind: 'sandbox', schemaVersion: SANDBOX_SCHEMA_VERSION, levels }
  if (typeof opts.exportedAt === 'number') env.exportedAt = opts.exportedAt
  return JSON.stringify(env, null, 2)
}

export type SandboxImportResult =
  | { ok: true; levels: SandboxLevel[]; skipped: number }
  | { ok: false; reason: string }

/** 结构解析 + sanitize；par 复算在 forge 层做（导入即不可信，PLAN §14.4） */
export function parseSandboxExport(text: string): SandboxImportResult {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, reason: '不是合法 JSON 文件' }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: '文件结构不认识' }
  const env = raw as Record<string, unknown>
  if (env.kind !== 'sandbox') return { ok: false, reason: '不是 vim-tour 沙盒导出文件' }
  if (env.schemaVersion !== SANDBOX_SCHEMA_VERSION) {
    return { ok: false, reason: `版本不匹配（文件 ${String(env.schemaVersion)}，当前 ${SANDBOX_SCHEMA_VERSION}）` }
  }
  if (!Array.isArray(env.levels)) return { ok: false, reason: 'levels 字段缺失' }
  const levels: SandboxLevel[] = []
  let skipped = 0
  for (const item of env.levels) {
    const sane = sanitizeSandboxLevel(item)
    if (sane) levels.push(sane)
    else skipped += 1
  }
  if (levels.length === 0) return { ok: false, reason: '没有可用的关卡' }
  return { ok: true, levels, skipped }
}

/** 导入落库前换新 id 并清空成绩：别人的星不算你的（调用方提供 id 生成器，本层不取时间） */
export function withFreshIds(levels: SandboxLevel[], makeId: () => string): SandboxLevel[] {
  return levels.map((l) => ({ ...l, id: makeId(), stats: { bestStars: 0, bestKeys: 0, attempts: 0 } }))
}

/** 默认仓库：全 App 共享同一实例（多处各建会各自缓存，落库后另一处读不到） */
let shared: SandboxRepository | null = null
export function defaultSandboxRepository(): SandboxRepository {
  if (!shared) shared = createSandboxRepository(detectStorage())
  return shared
}
