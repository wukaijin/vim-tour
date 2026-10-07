import type { ForgeDifficulty, ForgeParams, ForgeTierSetting, ProviderKind } from '../forge/types'
import { FORGE_LIMITS, FORGE_LIMITS_MIN } from '../forge/types'
import type { StorageLike } from './progress'

/**
 * 工坊设置持久化（PLAN §14.6/§14.7）：只存**非机密**配置——服务类型、地址、模型名、生成旋钮。
 * key 另走 forge/keys.ts 的保管（默认仅内存、可选口令加密）；两者互不影响、也不含彼此。
 */
export const FORGE_SETTINGS_KEY = 'vim-tour:forge-settings'

/** 设置层的生成旋钮：命令档允许「随机」（forge 核心的 ForgeParams 只收具体档，生成前解析） */
export type ForgeSettingsParams = Omit<ForgeParams, 'tier'> & { tier: ForgeTierSetting }

export interface ForgeSettings {
  providerKind: ProviderKind
  baseUrl: string
  model: string
  /** 输出上限（max_tokens）：>0 显式发送；0 = 不发送交给服务端默认（PLAN §14.6 非机密设置） */
  maxTokens: number
  params: ForgeSettingsParams
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
    maxTokens: intIn(r.maxTokens, 0, 1_000_000, defaults.maxTokens),
    params: {
      tier: p.tier === 'random' || TIERS.includes(p.tier as number) ? (p.tier as ForgeTierSetting) : defaults.params.tier,
      difficulty: DIFFICULTIES.includes(p.difficulty as string)
        ? (p.difficulty as ForgeDifficulty)
        : defaults.params.difficulty,
      maxLines: intIn(p.maxLines, FORGE_LIMITS_MIN.lines, FORGE_LIMITS.lines, defaults.params.maxLines),
      maxCols: intIn(p.maxCols, FORGE_LIMITS_MIN.cols, FORGE_LIMITS.cols, defaults.params.maxCols),
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
