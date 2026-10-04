import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Level } from '../../game/types'
import { loadAllLevels } from '../index'
import { validateLevels } from '../validate'

const here = dirname(fileURLToPath(import.meta.url))

/** 把 issue 定位到源文件行号（PLAN §9.3：信息指到行号） */
function withLineNumbers(levels: Level[], issues: ReturnType<typeof validateLevels>) {
  const chapterIds = [...new Set(levels.map((l) => l.chapter))].sort((a, b) => a - b)
  const sources = new Map(
    chapterIds.map((ch) => {
      const path = resolve(here, `../chapters/ch${ch}.ts`)
      return [path, readFileSync(path, 'utf8')] as const
    }),
  )
  for (const issue of issues) {
    const ch = issue.levelId.slice(0, 3)
    const path = resolve(here, `../chapters/${ch}.ts`)
    const src = sources.get(path)
    if (!src) continue
    const m = new RegExp(`id:\\s*['"]${issue.levelId}['"]`).exec(src)
    if (m) {
      issue.line = src.slice(0, m.index).split('\n').length
      issue.message = `${path}:${issue.line} ${issue.message}`
    }
  }
  return issues
}

describe('内容校验器（PLAN §9.3 构建期五断言）', async () => {
  const levels = await loadAllLevels()

  it('关卡总量 ≥ 10，每章 4–8 关 + 1 毕业考（PLAN §4）', () => {
    expect(levels.length).toBeGreaterThanOrEqual(10)
    const byChapter = new Map<number, Level[]>()
    for (const l of levels) byChapter.set(l.chapter, [...(byChapter.get(l.chapter) ?? []), l])
    for (const [ch, ls] of byChapter) {
      expect(ls.length, `ch${ch} 关数（含毕业考）`).toBeGreaterThanOrEqual(5)
      expect(ls.length, `ch${ch} 关数（含毕业考）`).toBeLessThanOrEqual(9)
    }
  })

  it('每章最后一关是毕业考，其余不是', () => {
    const byChapter = new Map<number, Level[]>()
    for (const l of levels) byChapter.set(l.chapter, [...(byChapter.get(l.chapter) ?? []), l])
    for (const [, ls] of byChapter) {
      expect(ls[ls.length - 1]!.graduation, `${ls[ls.length - 1]!.id} 应为毕业考`).toBe(true)
      for (const l of ls.slice(0, -1)) expect(l.graduation, `${l.id} 不应是毕业考`).toBeFalsy()
    }
  })

  it('五断言全部通过（含 parKeys 走真引擎收敛）', () => {
    const issues = withLineNumbers(levels, validateLevels(levels))
    expect(issues).toEqual([])
  })

  it('ch2 起每关恰好 2 个变体（不可砍，PLAN §11.2/§2.4B）', () => {
    for (const l of levels.filter((x) => x.chapter >= 2)) {
      expect(l.texts.length, `${l.id}`).toBe(2)
    }
  })
})
