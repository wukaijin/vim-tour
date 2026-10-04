import type { Cursor } from '../engine'

/** 星级：3 ≤par 且无提示无撤销；2 ≤1.5×par；1 完成即得（PLAN §2.2） */
export type Stars = 1 | 2 | 3

/** 进度存储 schema 版本；从第一天存在（PLAN §9.1） */
export const SCHEMA_VERSION = 1

/** 单个文本变体：起始/目标缓冲区 + 初始光标 + 最优解（PLAN §9.2） */
export interface LevelText {
  start: string[]
  target: string[]
  cursor: Cursor
  /** 最优解按键序列（parseKeys 记法）；内容校验器保证它在真引擎上收敛到 target */
  parKeys: string
}

/** 关卡数据（texts[] 变体 schema 先行，内容校验器与章节内容是 M3 的事） */
export interface Level {
  id: string
  chapter: number
  title: string
  /** 任务一句话描述 */
  brief: string
  /** 两级提示：[命令类别提示, 完整解法提示]；看任一级封顶 1 星（PLAN §6） */
  hints: [string, string]
  /** 按键白名单（normal/visual 命令序列；insert/cmdline 是文本输入态不走白名单） */
  allowedKeys: string[]
  /** 含 CJK 时置 false：栅格类线索退场（PLAN §9.2），默认 true */
  grid?: boolean
  /** 本关新教的命令（content/commands.ts 的 id）；教学卡据此渲染，可为空 */
  teaches?: string[]
  /** 毕业考：通过后对本章既往关卡批量执行清关更新（PLAN §2.3） */
  graduation?: boolean
  /** 文本变体 ×2（PLAN §2.4B），按日期种子轮换；运行时轮换在 variant.ts */
  texts: LevelText[]
  /** 连续成功 N 次清关；缺省按章节（PLAN §2.1） */
  requiredStreak?: number
}

/**
 * 进度记录（PLAN §9.1）。
 * srsStage 自 v1 冻结前加入：事后只能从 attempts 反推，
 * 而 attempts 混淆成功与失败，反推会精确复制「失败也延长间隔」的方向性错误。
 */
export interface LevelRecord {
  levelId: string
  /**
   * 是否曾达到 N 次连续成功（清关过）。只置 true、永不回退（锈蚀永不回收进度）。
   * 与 srsStage 同批加入：星级按 rep 发放（rep 2 拿 3 星），bestStars ≥ 1 不代表清过关，
   * 此标志事后无法从任何字段反推。
   */
  cleared: boolean
  /** 关内连续成功计数，跨会话持久；失败清零（PLAN §2.1） */
  streak: number
  /** 历史最优星级；0 = 从未清关 */
  bestStars: 0 | Stars
  /** 成功 rep 中的历史最少击键；0 = 尚无成功 rep */
  bestKeys: number
  /** rep 终局计数（成功与失败都算） */
  attempts: number
  /** 最近一次 rep 终局 / 清关更新的 epoch ms */
  lastPlayedAt: number
  /** 锈蚀阶梯档位 0–4 */
  srsStage: number
  schemaVersion: number
}
