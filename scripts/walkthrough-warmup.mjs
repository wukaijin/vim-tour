/* 热身场景走查：环境准备（注入隔天 due 记录）→ 黑盒验证热身条/跳过/热身对局 */
import { chromium } from 'playwright'
const BASE = 'http://localhost:5173'
const OUT = 'gui-test-screenshots'

const press = async (page, seq) => {
  let i = 0
  while (i < seq.length) {
    if (seq[i] === '<') {
      const close = seq.indexOf('>', i)
      const tok = seq.slice(i, close + 1)
      i = close + 1
      await page.keyboard.press({ '<Esc>': 'Escape', '<CR>': 'Enter', '<BS>': 'Backspace' }[tok] ?? tok)
    } else {
      await page.keyboard.press(seq[i])
      i++
    }
    await page.waitForTimeout(30)
  }
}

const results = []
const ok = (n) => results.push(['PASS', n])
const fail = (n, d) => results.push(['FAIL', `${n} :: ${d}`])

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => fail('页面异常', e.message))

  // ===== 环境准备：ch1-01/02 于 4 天前清关（stage0 间隔 1 天 → due），其余未清 =====
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chapter', { timeout: 8000 })
  await page.evaluate(() => {
    const stale = Date.now() - 4 * 86400_000
    const mk = (id) => ({ levelId: id, cleared: true, streak: 1, bestStars: 3, bestKeys: 5, attempts: 1, lastPlayedAt: stale, srsStage: 0, schemaVersion: 1 })
    localStorage.setItem('vim-tour:progress', JSON.stringify({ schemaVersion: 1, records: { 'ch1-01': mk('ch1-01'), 'ch1-02': mk('ch1-02') } }))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chapter')
  await page.waitForTimeout(600)
  console.log('环境准备完成；正式测试开始')

  // ===== T10 热身条与 due-review 节点 =====
  const bar = await page.locator('.warmup').innerText()
  bar.includes('2') && bar.includes('生疏') ? ok('T10 热身条显示 2 个生疏键帽') : fail('T10 热身条文案', bar)
  await page.screenshot({ path: `${OUT}/t20-warmup-bar.png` })
  const dueNode = await page.locator('.node.due-review').count()
  dueNode === 2 ? ok('T10 两个节点 due-review 态') : fail('T10 due-review 数', `${dueNode}`)
  await page.locator('.node.due-review').first().screenshot({ path: `${OUT}/t21-due-review-node.png` })

  // ===== T11 Esc 收起，当日不再出现 =====
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  ;(await page.locator('.warmup').count()) === 0 ? ok('T11 Esc 收起热身条') : fail('T11 Esc 收起', '仍显示')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chapter')
  await page.waitForTimeout(500)
  ;(await page.locator('.warmup').count()) === 0 ? ok('T11 收起后当日不再出现') : fail('T11 当日重现', '仍显示')

  // ===== 环境准备（第二轮）：清除 dismissed 标记，正式测热身对局 =====
  await page.evaluate(() => localStorage.removeItem('vim-tour:warmup-dismissed-at'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chapter')
  await page.waitForTimeout(500)

  // ===== T12 热身对局：开始 → 2 题 par 通关 → 回地图 =====
  await page.getByRole('button', { name: '开始热身' }).click()
  await page.waitForSelector('.play', { timeout: 3000 })
  const chip = await page.locator('.warmup-chip').innerText()
  chip.includes('1/2') ? ok('T12 热身 1/2 指示与计时') : fail('T12 热身指示', chip)
  ;(await page.locator('.card').count()) === 0 ? ok('T12 热身不弹教学卡') : fail('T12 教学卡', '出现了')
  await page.screenshot({ path: `${OUT}/t22-warmup-play.png` })
  await press(page, 'iq<Esc>')
  await page.waitForTimeout(700)
  const chip2 = await page.locator('.warmup-chip').innerText().catch(() => '')
  chip2.includes('2/2') ? ok('T12 首题成功进入第 2 题') : fail('T12 第 2 题', chip2)
  await press(page, 'xjxjx')
  await page.waitForSelector('.chapter', { timeout: 3000 })
  ok('T12 热身完成回到地图')
  await page.screenshot({ path: `${OUT}/t23-warmup-done.png` })

  // ===== T13 热身清关推进了 srs（DOM 只读验证：due 节点应减少） =====
  const dueAfter = await page.locator('.node.due-review').count()
  dueAfter === 0 ? ok('T13 热身后 due-review 节点清零（时钟刷新）') : fail('T13 due 残留', `${dueAfter}`)
} catch (e) {
  fail('脚本异常', e.message)
} finally {
  await browser.close()
}

console.log('\n===== 热身走查 =====')
for (const [s, n] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${n}`)
const f = results.filter(([s]) => s === 'FAIL').length
console.log(`${results.length - f}/${results.length} 通过`)
process.exit(f ? 1 : 0)
