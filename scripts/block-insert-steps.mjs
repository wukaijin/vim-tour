/* 块选+块插入逐步取证：直达 ch5-06，每按一步截图 + 断言 sel/phantom 段数。
   用法：先起 dev server，再 node scripts/block-insert-steps.mjs [base]（默认 5173）
   输出：gui-test-screenshots/blk-*.png + PASS/FAIL 清单 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = 'gui-test-screenshots'

const results = []
const ok = (n) => results.push(['PASS', n])
const fail = (n, d) => results.push(['FAIL', `${n} :: ${d}`])

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => fail('页面异常', e.message))
  page.on('console', (m) => m.type() === 'error' && fail('console.error', m.text()))

  // 预置 ch1-01..ch5-05 全清（ch1–ch4 各 7 关 + ch5 前 5 关），绕过 levelLocked；now 不 due 无热身条
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chapter', { timeout: 8000 })
  await page.evaluate(() => {
    const now = Date.now()
    const records = {}
    const ids = []
    for (let ch = 1; ch <= 4; ch++) for (let i = 1; i <= 7; i++) ids.push(`ch${ch}-${String(i).padStart(2, '0')}`)
    for (let i = 1; i <= 5; i++) ids.push(`ch5-${String(i).padStart(2, '0')}`)
    for (const id of ids)
      records[id] = { levelId: id, cleared: true, streak: 1, bestStars: 3, bestKeys: 7, attempts: 1, lastPlayedAt: now, srsStage: 0, schemaVersion: 1 }
    localStorage.setItem('vim-tour:progress', JSON.stringify({ schemaVersion: 1, records }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chapter', { timeout: 8000 })

  // hash 直达对局屏；教学卡跳过
  await page.goto(`${BASE}/#/level/ch5-06`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.play', { timeout: 5000 })
  if (await page.locator('.card').count()) {
    await page.keyboard.press('Escape')
    await page.waitForSelector('.card', { state: 'detached', timeout: 2000 })
  }

  const step = async (key, name, { sel = null, phantom = null, cursor = null } = {}) => {
    if (key) await page.keyboard.press(key)
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${OUT}/blk-${name}.png`, fullPage: false })
    if (sel !== null) {
      const n = await page.locator('.buffer .seg.sel').count()
      n === sel ? ok(`${name}: sel 段 ${n}`) : fail(`${name}: sel 段`, `期望 ${sel} 实得 ${n}`)
    }
    if (phantom !== null) {
      const n = await page.locator('.buffer .seg.phantom').count()
      n === phantom ? ok(`${name}: phantom 段 ${n}`) : fail(`${name}: phantom 段`, `期望 ${phantom} 实得 ${n}`)
    }
    if (cursor !== null) {
      const n = await page.locator('.buffer .cursor').count()
      n === cursor ? ok(`${name}: 光标 ${n} 个`) : fail(`${name}: 光标`, `期望 ${cursor} 实得 ${n}`)
    }
  }

  await step(null, '00-initial', { sel: 0, phantom: 0, cursor: 1 })
  // sel 段期望不含光标行被光标格吞掉的段：光标格渲染为 .cursor（vim 中亦为反白光标），
  // 01 时光标行=唯一选中行 → 0 段；02/03 光标在末行 → 前面的行各 1 段
  await step('Control+v', '01-block-1row', { sel: 0, cursor: 1 })
  await step('j', '02-block-2rows', { sel: 1, cursor: 1 })
  await step('j', '03-block-3rows', { sel: 2, cursor: 1 })
  await step('l', '04-block-3rows-w2', { sel: 3, cursor: 1 })
  // I 进入块插入：块内每行插入点都有光标（真实 vim 8.0.1609+ 多行虚显光标）
  await step('I', '05-insert-entered', { sel: 0, phantom: 0, cursor: 3 })
  await step('#', '06-typed-hash', { sel: 0, phantom: 2, cursor: 3 })
  await step(' ', '07-typed-hash-space', { sel: 0, phantom: 2, cursor: 3 })
  // 多光标位置锚定：二三行光标必须紧跟虚显段之后（列对齐），而非被顶到行尾
  const anchored = await page.$$eval('.buffer .cursor', (els) =>
    els.map((e) => e.previousElementSibling?.classList.contains('phantom') ?? false),
  )
  anchored.length === 3 && anchored[1] && anchored[2]
    ? ok('07: 二三行光标紧跟虚显段（多光标列对齐）')
    : fail('07: 光标锚定', JSON.stringify(anchored))
  await step('Escape', '08-esc-applied', { sel: 0, phantom: 0, cursor: 1 })

  // Esc 应用后 buffer==target → game 层判 rep-success：toast 1/3 并重置缓冲区开下一轮 rep。
  // 故此处断言成功反馈+新 rep 初始态，而非直接读 buffer（那读到的是重置后的原文）。
  const rowTexts = await page.$$eval('.buffer .line .text', (els) =>
    els.map((el) =>
      Array.from(el.children)
        .map((n) => (n.classList.contains('cursor') ? n.dataset.ch ?? '' : n.textContent))
        .join(''),
    ),
  )
  const repToast = await page.locator('.toast').innerText().catch(() => '')
  repToast.includes('1/3')
    ? ok('08: Esc 套用达标，首轮成功反馈 1/3')
    : fail('08: 首轮成功反馈', repToast || '（无 toast）')
  JSON.stringify(rowTexts) === JSON.stringify(['one', 'two', 'end'])
    ? ok('08: 新 rep 已重置缓冲区为原文')
    : fail('08: 新 rep 缓冲区', JSON.stringify(rowTexts))
} finally {
  await browser.close()
}

for (const [s, n] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}`)
const fails = results.filter(([s]) => s === 'FAIL').length
console.log(`\n${results.length - fails}/${results.length} 通过`)
process.exit(fails ? 1 : 0)
