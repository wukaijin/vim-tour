import type { ForgeDifficulty, ForgeParams, ForgeTier, ProviderKind } from '../forge/types'
import type { StorageLike } from './progress'

/**
 * 工坊设置持久化（PLAN §14.6/§14.7）：只存**非机密**配置——服务类型、地址、模型名、生成旋钮。
 * key 另走 forge/keys.ts 的保管（默认仅内存、可选口令加密）；两者互不影响、也不含彼此。
 */
export const FORGE_SETTINGS_KEY = 'vim-tour:forge-settings'

export interface ForgeSettings {
  providerKind: ProviderKind
  baseUrl: string
  model: string
  params: ForgeParams
}

const TIERS: readonly number[] = [1, 2, 3, 4, 5, 6, 7]
const DIFFICULTIES: readonly string[] = ['light', 'standard', 'hardcore']

/** 读设置；缺字段/越界一律收敛到 defaults（手改 localStorage 不带毒进 UI） */
export function loadForgeSettings(storage: StorageLike, defaults: ForgeSettings): ForgeSettings {
  let raw: string | null = null
  try {
    raw = storage.getItem(FORGE_SETTINGS_KEY)
  } catch {
    raw = null
  }
  if (!raw) return structuredClone(defaults)
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return structuredClone(defaults)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return structuredClone(defaults)
  const r = parsed as Record<string, unknown>
  const p = (r.params ?? {}) as Record<string, unknown>
  return {
    providerKind: r.providerKind === 'openai' ? 'openai' : 'demo',
    baseUrl: str(r.baseUrl, 200) ?? defaults.baseUrl,
    model: str(r.model, 100) ?? defaults.model,
    params: {
      tier: TIERS.includes(p.tier as number) ? (p.tier as ForgeTier) : defaults.params.tier,
      difficulty: DIFFICULTIES.includes(p.difficulty as string)
        ? (p.difficulty as ForgeDifficulty)
        : defaults.params.difficulty,
      maxLines: intIn(p.maxLines, 1, 8, defaults.params.maxLines),
      maxCols: intIn(p.maxCols, 16, 64, defaults.params.maxCols),
      theme: str(p.theme, 120) ?? '',
    },
  }
}

export function saveForgeSettings(storage: StorageLike, settings: ForgeSettings): void {
  try {
    storage.setItem(FORGE_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式/满额：静默降级为会话内
  }
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length <= max ? s : null
}

function intIn(v: unknown, lo: number, hi: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(hi, Math.max(lo, Math.floor(v)))
}
