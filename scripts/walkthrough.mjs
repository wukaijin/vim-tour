/* vim-tour M3 无头走查（黑盒 GUI：真实键盘与点击，截图存证）
   运行：node scripts/walkthrough.mjs [base]
   输出：gui-test-screenshots/*.png + PASS/FAIL 清单 */
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5173'
const OUT = 'gui-test-screenshots'
mkdirSync(OUT, { recursive: true })

const results = []
const consoleErrors = []
const ok = (name) => results.push(['PASS', name])
const fail = (name, detail) => results.push(['FAIL', `${name} :: ${detail}`])
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })

const press = async (page, seq) => {
  // seq: 'iq<Esc>' 之类的 parseKeys 记法
  let i = 0
  while (i < seq.length) {
    if (seq[i] === '<') {
      const close = seq.indexOf('>', i)
      const tok = seq.slice(i, close + 1)
      i = close + 1
      const map = { '<Esc>': 'Escape', '<CR>': 'Enter', '<BS>': 'Backspace' }
      await page.keyboard.press(map[tok] ?? tok)
    } else {
      await page.keyboard.press(seq[i])
      i++
    }
    await page.waitForTimeout(30)
  }
}

const run = async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`)
  })

  // —— T1 首屏：章节地图 ——
  await page.goto(BASE)
  await page.waitForSelector('.chapter', { timeout: 8000 })
  await page.waitForTimeout(600)
  const nodeCount = await page.locator('.node').count()
  nodeCount === 28 ? ok('T1 地图渲染 28 个节点') : fail('T1 地图渲染', `节点数 ${nodeCount}`)
  const currentCount = await page.locator('.node.current').count()
  currentCount === 1 && (await page.locator('.node.current .n-no').textContent()) === '1'
    ? ok('T1 ch1-01 为 current')
    : fail('T1 current 节点', `current 数 ${currentCount}`)
  const lockCount = await page.locator('.ch-lock').count()
  lockCount === 3 ? ok('T1 ch2/ch3/ch4 整章锁定提示') : fail('T1 章节锁定提示', `ch-lock 数 ${lockCount}`)
  const warmupBar = await page.locator('.warmup').count()
  warmupBar === 0 ? ok('T1 无 due 时不出热身条') : fail('T1 热身条', '不应出现')
  await shot(page, 't01-map-initial')

  // —— T2 ch1-01：教学卡 → Esc 跳过 → par 通关 ——
  await page.locator('.node.current').click()
  await page.waitForSelector('.card', { timeout: 3000 })
  const cardKeys = await page.locator('.card .cmds > li').count()
  cardKeys === 2 ? ok('T2 教学卡展示 2 个新命令(i/Esc)') : fail('T2 教学卡命令数', `${cardKeys}`)
  await shot(page, 't02-teaching-card')
  await page.keyboard.press('Escape') // 跳过教学卡
  await page.waitForSelector('.card', { state: 'detached', timeout: 2000 })
  ok('T2 Esc 跳过教学卡')
  await shot(page, 't03-play-empty')
  await press(page, 'iq<Esc>')
  await page.waitForSelector('.ticket', { timeout: 3000 })
  await shot(page, 't04-result-ch1-01')
  const starsText = await page.locator('.t-stars .stars').getAttribute('aria-label')
  starsText === '3 星' ? ok('T2 ch1-01 par 通关 3★') : fail('T2 星级', starsText)
  const eff = await page.locator('.eff-nums').innerText()
  eff.includes('3') && eff.includes('3') ? ok(`T2 效率数字 ${eff.replace(/\n/g, ' ')}`) : fail('T2 效率数字', eff)

  // —— T3 回地图：节点态推进 ——
  await page.getByRole('button', { name: '回到地图' }).click()
  await page.waitForSelector('.chapter', { timeout: 3000 })
  const doneCount = await page.locator('.node.done').count()
  doneCount === 1 ? ok('T3 ch1-01 done ✓') : fail('T3 done 节点数', `${doneCount}`)
  const cur2 = await page.locator('.node.current .n-no').textContent()
  cur2 === '2' ? ok('T3 ch1-02 变为 current') : fail('T3 current', cur2)
  await shot(page, 't05-map-after-01')

  // —— T4 未教键反馈 + 键帽回显 ——
  await page.locator('.node.current').click()
  await page.waitForSelector('.card', { timeout: 3000 })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  await page.keyboard.press('w') // ch1 未教
  await page.waitForTimeout(300)
  const toast = await page.locator('.toast').innerText().catch(() => '')
  toast.includes('还没教到') ? ok('T4 未教键轻提示') : fail('T4 未教键提示', toast)
  await shot(page, 't06-untaught-toast')
  await page.keyboard.press('j')
  await page.keyboard.press('k')
  await page.waitForTimeout(250)
  await shot(page, 't07-echo-trail')
  const trail = await page.locator('.trail .keycap').count()
  trail >= 1 ? ok(`T4 回显栏 trail 键帽 ${trail} 个`) : fail('T4 trail', '无键帽')

  // —— T5 重来：streak 清零提示 ——
  await page.keyboard.press('x') // 已按过键，concede 生效
  await page.getByRole('button', { name: '重来' }).click()
  await page.waitForTimeout(300)
  const toast2 = await page.locator('.toast').innerText().catch(() => '')
  toast2.includes('清零') ? ok('T5 重来失败反馈') : fail('T5 重来反馈', toast2)

  // —— T6 ch1-02..06 par 连续通关（教学卡逐关跳过） ——
  await press(page, 'xjxjx') // ch1-02 完成（重来后 buffer 复位）
  await page.waitForSelector('.ticket', { timeout: 3000 })
  await shot(page, 't08-result-ch1-02')

  const pars = {
    'ch1-03': 'as<Esc>jas<Esc>',
    'ch1-04': 'Ozero<Esc>josecond<Esc>',
    'ch1-05': 'ddkkyyjjp',
    'ch1-06': 'ostay foolish<Esc>',
    'ch1-07': 'a list<Esc>jjddyyp',
  }
  for (const [id, par] of Object.entries(pars)) {
    // 从结算屏或地图进入
    if (await page.locator('.ticket').count()) {
      await page.getByRole('button', { name: '下一关' }).click()
    } else {
      await page.locator('.node.current').click()
    }
    await page.waitForSelector('.play', { timeout: 3000 })
    if (await page.locator('.card').count()) {
      await shot(page, `t09-card-${id}`)
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(150)
    await press(page, par)
    const cleared = await page
      .waitForSelector('.ticket', { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    cleared ? ok(`T6 ${id} par 通关`) : fail(`T6 ${id}`, '未出现结算屏')
  }
  await shot(page, 't10-result-graduation')
  const gradNote = await page.locator('.t-grad').count()
  gradNote === 1 ? ok('T6 毕业考结算含批量清关说明') : fail('T6 毕业考说明', '缺失')

  // —— T7 ch2 解锁（ch3/ch4 仍锁定） ——
  await page.getByRole('button', { name: '回到地图' }).click()
  await page.waitForSelector('.chapter', { timeout: 3000 })
  await page.waitForTimeout(300)
  const locks = await page.locator('.ch-lock').count()
  locks === 2 ? ok('T7 ch2 已解锁，ch3/ch4 仍锁定') : fail('T7 章节锁', `ch-lock 数 ${locks}`)
  const doneAll = await page.locator('.node.done').count()
  doneAll === 7 ? ok('T7 ch1 全部 7 关 done') : fail('T7 ch1 done 数', `${doneAll}`)
  await shot(page, 't11-map-ch2-unlocked')

  // —— T8 ch2-01：N=2 双 rep ——
  await page.locator('.node.current').click()
  await page.waitForSelector('.play', { timeout: 3000 })
  if (await page.locator('.card').count()) await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await press(page, 'xwxwx')
  await page.waitForTimeout(600)
  const midToast = await page.locator('.toast').innerText().catch(() => '')
  midToast.includes('1/2') ? ok('T8 ch2 首轮成功显示 1/2') : fail('T8 首轮反馈', midToast)
  await shot(page, 't12-ch2-rep1')
  await press(page, 'xwxwx')
  await page.waitForSelector('.ticket', { timeout: 3000 })
  await shot(page, 't13-result-ch2-01')
  ok('T8 ch2-01 两轮连击通关')

  // —— T9 提示两级 ——
  await page.getByRole('button', { name: '回到地图' }).click()
  await page.waitForSelector('.chapter')
  await page.locator('.node.current').click() // ch2-02
  await page.waitForSelector('.play')
  if (await page.locator('.card').count()) await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /提示 · 方向/ }).click()
  await page.waitForTimeout(200)
  const hint1 = await page.locator('.hint-panel').innerText()
  hint1.includes('e') ? ok('T9 提示①显示方向提示') : fail('T9 提示①', hint1)
  const hint2Disabled = await page.getByRole('button', { name: /提示 · 解法/ }).isDisabled()
  hint2Disabled === false ? ok('T9 看过提示①后提示②解锁') : fail('T9 提示②', '仍禁用')
  await page.getByRole('button', { name: /提示 · 解法/ }).click()
  await page.waitForTimeout(200)
  const hint2text = await page.locator('.hint-panel').innerText()
  hint2text.includes('完整解') || hint2text.includes('w e a s')
    ? ok('T9 提示②显示完整解法')
    : fail('T9 提示②', hint2text)
  await shot(page, 't14-hints')

  // —— T10 ch2-02..07 双 rep 连续通关（N=2） ——
  const ch2Pars = {
    'ch2-02': 'weas<Esc>wwweas<Esc>',
    'ch2-03': '^i- <Esc>$xjx',
    'ch2-04': '4ggyyGp2ggdd',
    'ch2-05': 'fxx;x;x',
    'ch2-06': 'yyGp2ggdd$a!<Esc>',
    'ch2-07': '0xxfxxj$a;<Esc>j$a!<Esc>',
  }
  for (const [id, par] of Object.entries(ch2Pars)) {
    await press(page, par)
    await page.waitForTimeout(500)
    await press(page, par)
    const cleared = await page
      .waitForSelector('.ticket', { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    cleared ? ok(`T10 ${id} 双 rep 通关`) : fail(`T10 ${id}`, '未出现结算屏')
    if (id !== 'ch2-07') {
      await page.getByRole('button', { name: '下一关' }).click()
      await page.waitForSelector('.play', { timeout: 3000 })
      if (await page.locator('.card').count()) await page.keyboard.press('Escape')
      await page.waitForTimeout(150)
    }
  }
  await shot(page, 't15-result-ch2-grad')

  // —— T11 ch3 解锁（ch4 仍锁定）+ ch3-01 教学卡与双 rep ——
  await page.getByRole('button', { name: '回到地图' }).click()
  await page.waitForSelector('.chapter', { timeout: 3000 })
  await page.waitForTimeout(300)
  const locks2 = await page.locator('.ch-lock').count()
  locks2 === 1 ? ok('T11 ch3 已解锁（ch4 仍锁定）') : fail('T11 ch3 解锁', `ch-lock 数 ${locks2}`)
  const doneAll2 = await page.locator('.node.done').count()
  doneAll2 === 14 ? ok('T11 ch1+ch2 全部 14 关 done') : fail('T11 done 数', `${doneAll2}`)
  await shot(page, 't16-map-ch3-unlocked')

  await page.locator('.node.current').click()
  await page.waitForSelector('.card', { timeout: 3000 })
  const ch3Card = await page.locator('.card .cmds > li').count()
  ch3Card === 1 ? ok('T11 ch3-01 教学卡展示 1 个新命令(d)') : fail('T11 ch3-01 卡命令数', `${ch3Card}`)
  await shot(page, 't17-card-ch3-d')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await press(page, 'dwdw')
  await page.waitForTimeout(500)
  await press(page, 'dwdw')
  await page.waitForSelector('.ticket', { timeout: 3000 })
  await shot(page, 't18-result-ch3-01')
  ok('T11 ch3-01 两轮连击通关')

  // —— T12 ch3-02..07 双 rep 连续通关（N=2） ——
  const ch3Pars = {
    'ch3-02': 'f/hd$j0wd0',
    'ch3-03': 'wcwnew<Esc>',
    'ch3-04': 'wyw$a <Esc>p',
    'ch3-05': 'Jj2dd',
    'ch3-06': 'd2w.',
    'ch3-07': 'ddwcwnew<Esc>jJ',
  }
  for (const [id, par] of Object.entries(ch3Pars)) {
    if (await page.locator('.ticket').count()) {
      await page.getByRole('button', { name: '下一关' }).click()
    } else {
      await page.locator('.node.current').click()
    }
    await page.waitForSelector('.play', { timeout: 3000 })
    if (await page.locator('.card').count()) await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    await press(page, par)
    await page.waitForTimeout(500)
    await press(page, par)
    const cleared = await page
      .waitForSelector('.ticket', { timeout: 3000 })
      .then(() => true)
      .catch(() => false)
    cleared ? ok(`T12 ${id} 双 rep 通关`) : fail(`T12 ${id}`, '未出现结算屏')
  }
  await shot(page, 't19-result-ch3-grad')

  // —— T13 ch4 解锁 + ch4-01 教学卡与 N=3 三连击 ——
  await page.getByRole('button', { name: '回到地图' }).click()
  await page.waitForSelector('.chapter', { timeout: 3000 })
  await page.waitForTimeout(300)
  const locks3 = await page.locator('.ch-lock').count()
  locks3 === 0 ? ok('T13 ch4 已解锁（锁定提示消失）') : fail('T13 ch4 解锁', `ch-lock 数 ${locks3}`)
  const doneAll3 = await page.locator('.node.done').count()
  doneAll3 === 21 ? ok('T13 ch1–ch3 全部 21 关 done') : fail('T13 done 数', `${doneAll3}`)
  await shot(page, 't20-map-ch4-unlocked')

  await page.locator('.node.current').click()
  await page.waitForSelector('.card', { timeout: 3000 })
  const ch4Card = await page.locator('.card .cmds > li').count()
  ch4Card === 1 ? ok('T13 ch4-01 教学卡展示 1 个新命令(iw)') : fail('T13 ch4-01 卡命令数', `${ch4Card}`)
  await shot(page, 't21-card-ch4-iw')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await press(page, 'ciwnew<Esc>')
  await page.waitForTimeout(600)
  const rep1 = await page.locator('.toast').innerText().catch(() => '')
  rep1.includes('1/3') ? ok('T13 ch4 首轮成功显示 1/3（N=3）') : fail('T13 首轮反馈', rep1)
  await shot(page, 't22-ch4-rep1')
  await press(page, 'ciwnew<Esc>')
  await page.waitForTimeout(500)
  await press(page, 'ciwnew<Esc>')
  await page.waitForSelector('.ticket', { timeout: 3000 })
  await shot(page, 't23-result-ch4-01')
  ok('T13 ch4-01 三轮连击通关')

  await browser.close()
}

await run()

// —— 汇总 ——
console.log('\n===== 走查结果 =====')
for (const [s, name] of results) console.log(`${s === 'PASS' ? '✓' : '✗'} ${name}`)
const fails = results.filter(([s]) => s === 'FAIL').length
console.log(`\n${results.length - fails}/${results.length} 通过`)
if (consoleErrors.length) {
  console.log('\n===== 页面错误 =====')
  for (const e of consoleErrors) console.log(e)
} else {
  console.log('页面错误：无')
}
process.exit(fails > 0 ? 1 : 0)
