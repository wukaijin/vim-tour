import type { LevelText } from '../game/types'

/**
 * 关卡工坊共享类型（PLAN §14）。
 * 分工硬条款：模型只产出「候选题材」（start/target/标题/题面）；
 * par、两级提示、命令清单全部由求解器从解推导（见 generate.ts）。
 */

/** 模型接入类型：离线演示 / OpenAI 兼容（PLAN §14.6） */
export type ProviderKind = 'demo' | 'openai'

/** 命令档：截至第 N 章的技能范围（ch1–ch7） */
export type ForgeTier = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const FORGE_TIERS: readonly ForgeTier[] = [1, 2, 3, 4, 5, 6, 7]

/**
 * 命令档的**设置值**：具体档（1–7）或「随机」。
 * 哨兵只存在于设置层（forge-settings / 工坊 UI），生成链路的 ForgeParams 只见具体档
 * ——「随机」在进入生成前就被 rollTier 解析掉，抽中的章自然进 provenance。
 */
export type ForgeTierSetting = ForgeTier | 'random'

/** 「随机」档解析成具体章：具体档原样返回；rng 注入以便单测确定性 */
export function rollTier(setting: ForgeTierSetting, rng: () => number = Math.random): ForgeTier {
  if (setting !== 'random') return setting
  const i = Math.min(FORGE_TIERS.length - 1, Math.max(0, Math.floor(rng() * FORGE_TIERS.length)))
  return FORGE_TIERS[i]!
}

/** 复杂度档 → par（最优按键数）区间；硬核上界待求解器实测校准（PLAN §13） */
export type ForgeDifficulty = 'light' | 'standard' | 'hardcore'

export const PAR_RANGE: Record<ForgeDifficulty, { min: number; max: number }> = {
  light: { min: 3, max: 6 },
  standard: { min: 7, max: 12 },
  hardcore: { min: 13, max: 18 },
}

export const DIFFICULTY_LABEL: Record<ForgeDifficulty, string> = {
  light: '轻松',
  standard: '标准',
  hardcore: '硬核',
}

/**
 * 关卡文本尺寸上限（单点定义）：旋钮 sanitize、UI input max、沙盒库入库 sanitize 三处同源。
 * 2026-10-08 曾因入库层硬编码 12 行/80 列 < 旋钮上限，闸门放行的关卡入库被拒（「生成结果不合法，已丢弃」）——口径分叉，收敛于此。
 */
export const FORGE_LIMITS = { lines: 20, cols: 120 } as const
export const FORGE_LIMITS_MIN = { lines: 1, cols: 16 } as const

/** 生成旋钮（PLAN §14.1 三段） */
export interface ForgeParams {
  tier: ForgeTier
  difficulty: ForgeDifficulty
  /** 起止文本行数上限（1–20，见 FORGE_LIMITS） */
  maxLines: number
  /** 每行字符上限（16–120，见 FORGE_LIMITS） */
  maxCols: number
  /** 题材自由文本（可空；不可验证但无害） */
  theme: string
}

export const DEFAULT_FORGE_PARAMS: ForgeParams = {
  tier: 2,
  difficulty: 'light',
  maxLines: 4,
  maxCols: 40,
  theme: '',
}

/** 模型产出（候选题材）：题目文本、初始光标、本关命令集与解法草稿；par 由引擎裁决 */
export interface CandidateDraft {
  title: string
  brief: string
  start: string[]
  target: string[]
  cursor: { line: number; col: number }
  /**
   * 本关命令集（沙盒白名单的来源）：只能取自「命令档」已教命令。
   * 玩家受限于这个集合，求解器也只在这个集合上搜索。
   */
  commands: string[]
  /** 解法草稿：必须只用 commands 里的命令、并在真引擎上收敛到 target（闸门逐键回放验证） */
  parKeys: string
}

/**
 * par 来源（provenance）：
 * - 'proven'   = 求解器在预算内找到的解（该搜索内的最短）
 * - 'verified' = 引擎验证通过的模型解（与正篇 52 关 parKeys 同一口径：可行解，未必全局最优）
 */
export type ParSource = 'proven' | 'verified'

/** 对话消息（provider 接口的公共形状） */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SandboxStats {
  bestStars: 0 | 1 | 2 | 3
  bestKeys: number
  attempts: number
}

export function emptyStats(): SandboxStats {
  return { bestStars: 0, bestKeys: 0, attempts: 0 }
}

/** 沙盒关卡（与 Level 同形，单变体 + 溯源 + 单关成绩；PLAN §14.4） */
export interface SandboxLevel {
  id: string
  title: string
  brief: string
  /** 含 CJK 自动 false（PLAN §9.3① 同款规则） */
  grid: boolean
  /** 玩家白名单 = 命令档内全部已教命令（PLAN §14.1：j 这类已教键永远可用） */
  allowedKeys: string[]
  /** 求解器字母表 = 模型声明的解法命令（窄集合，让「已证最优」可行；导入复算也用它） */
  solverKeys: string[]
  text: LevelText
  provenance: {
    tier: ForgeTier
    difficulty: ForgeDifficulty
    model: string
    createdAt: number
    /** par 来源：求解器证明最优 / 引擎验证过模型解（PLAN §14.3） */
    parSource: ParSource
  }
  stats: SandboxStats
}

/** Key[] → parKeys 记法（parseKeys 可逆：单字符原样、尖括号键整体拼接） */
export function toParKeys(keys: readonly string[]): string {
  return keys.join('')
}
