import { describe, it } from 'vitest'
import process from 'node:process'
import { loadAllLevels } from '../../content'
import { commandsUpTo, keysOf } from '../../content/commands'
import { parseKeys } from '../types'
import { solve } from '../solver'

/**
 * 求解器实测标定（PLAN §13 待校准项）：默认跳过，需显式开启。
 *   SOLVER_BENCH=1 npx vitest run src/engine/__tests__/solver.bench.test.ts
 * 输出：每关 par / 解长 / 访问状态数 / 耗时 / 结果，以及三档人造用例的成功率与耗时量级。
 */

const RUN = process.env.SOLVER_BENCH === '1'
const bench = RUN ? describe : describe.skip

interface Row {
  label: string
  par: number
  solved: number | null
  explored: number
  ms: number
  outcome: string
}

function allowedFor(chapter: number, allowedKeys: string[] | undefined, whitelistFor: (n: number) => string[]): string[] {
  return allowedKeys ?? whitelistFor(chapter)
}

const BUDGET = Number(process.env.SOLVER_BUDGET ?? 60_000)
const MAXKEYS = Number(process.env.SOLVER_MAXKEYS ?? 20)

function measure(label: string, input: Parameters<typeof solve>[0], par: number, opts?: Parameters<typeof solve>[1]): Row {
  const t0 = performance.now()
  const r = solve(input, { maxStates: BUDGET, maxKeys: MAXKEYS, ...opts })
  const ms = performance.now() - t0
  if (!r.ok) return { label, par, solved: null, explored: r.explored, ms, outcome: r.reason }
  return { label, par, solved: r.keys.length, explored: -1, ms, outcome: 'ok' }
}

/** 档位白名单（ch5+ 正篇无白名单：用已教集合成，等价于沙盒的行为） */
const synth = (chapter: number): string[] => keysOf(commandsUpTo(chapter).map((c) => c.id))

bench('solver benchmark（全量变体）', () => {
  it('52 关全部变体', async () => {
    const levels = await loadAllLevels()
    const rows: Row[] = []
    for (const level of levels) {
      const wl = allowedFor(level.chapter, level.allowedKeys, synth)
      level.texts.forEach((t, i) => {
        rows.push(
          measure(`${level.id} v${i + 1}`, { start: t.start, cursor: t.cursor, target: t.target, allowedKeys: wl }, parseKeys(t.parKeys).length),
        )
      })
    }
    const ok = rows.filter((r) => r.outcome === 'ok')
    const over = ok.filter((r) => (r.solved ?? Infinity) > r.par)
    console.log('\n| level | par | solver | states | ms | outcome |')
    console.log('|---|---|---|---|---|---|')
    for (const r of rows) {
      console.log(`| ${r.label} | ${r.par} | ${r.solved ?? '-'} | ${r.explored < 0 ? '-' : r.explored} | ${r.ms.toFixed(0)} | ${r.outcome} |`)
    }
    console.log(
      `\n总结：解出 ${ok.length}/${rows.length}，超 par ${over.length}，预算/无解 ${rows.length - ok.length}` +
        `；成功用例中位耗时 ${median(ok.map((r) => r.ms)).toFixed(0)}ms，最长 ${Math.max(0, ...ok.map((r) => r.ms)).toFixed(0)}ms`,
    )
  }, 600_000)

  it('三档人造用例（轻 3–6 / 标准 7–12 / 硬核 13–18）', () => {
    const cases: Array<{ name: string; start: string[]; target: string[]; cursor: { line: number; col: number }; keys: string; wl: string[] }> = [
      {
        name: '轻-单点改名（窄声明集）',
        start: ['port = 3000;'],
        target: ['port = 8080;'],
        cursor: { line: 0, col: 0 },
        keys: 'f3cw8080<Esc>',
        wl: ['f', 'cw', '<Esc>'],
      },
      {
        name: '标准-两处替换（窄声明集）',
        start: ['let host = "localhost";', 'let port = 3000;'],
        target: ['let host = "127.0.0.1";', 'let port = 8080;'],
        cursor: { line: 0, col: 0 },
        keys: '',
        wl: ['f', 'cw', 'l', 'w', '<Esc>'],
      },
      {
        name: '标准-删行改词（窄声明集）',
        start: ['name = "app";', 'port = 3000;', 'debug = true;'],
        target: ['name = "svc";', 'port = 8080;'],
        cursor: { line: 0, col: 0 },
        keys: '',
        wl: ['f', 'cw', 'j', 'dd', '<Esc>'],
      },
      {
        name: '硬核-四行多改（窄声明集）',
        start: ['name = "app";', 'port = 3000;', 'debug = true;', 'retries = 3;'],
        target: ['name = "svc";', 'port = 8080;', 'debug = false;', 'retries = 5;'],
        cursor: { line: 0, col: 0 },
        keys: '',
        wl: ['f', 'cw', 'j', 'l', '<Esc>'],
      },
    ]
    const rows: Row[] = []
    for (const c of cases) {
      rows.push(measure(c.name, { start: c.start, cursor: c.cursor, target: c.target, allowedKeys: c.wl }, c.keys ? parseKeys(c.keys).length : 0))
    }
    console.log('\n人造用例：')
    for (const r of rows) console.log(`- ${r.label}: par=${r.par} solved=${r.solved ?? '-'} states=${r.explored} ${r.ms.toFixed(0)}ms ${r.outcome}`)
  }, 600_000)
})

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]!
}
