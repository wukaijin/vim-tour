/* vim-tour M5 关卡工坊无头走查（黑盒 GUI：真实点击/键盘，截图存证）
   运行：node scripts/walkthrough-forge.mjs [base]
   覆盖（PLAN §14.8）：入口 → 配置（离线演示）→ 生成（含回喂重试）→ 入库 → 命名空间隔离
                      → 开玩（#/forge/play/<id>）→ 通关结算（沙盒标识/三星）→ 成绩落库 → 删除 */
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
// 结算屏：星级 0/90/180ms 弹入 + 效率条 360ms 扫入，等满再截
const shotResult = async (page, name) => {
  await page.waitForTimeout(950)
  await shot(page, name)
}

const press = async (page, seq) => {
  let i = 0
  while (i < seq.length) {
    if (seq[i] === '<') {
      const close = seq.indexOf('>', i)
      if (close === -1) {
        await page.keyboard.press(seq[i])
        i++
        continue
      }
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

const ls = (page, key) => page.evaluate((k) => window.localStorage.getItem(k), key)

const run = async () => {
  // 全新环境：清空进度与沙盒库，让断言不受历史影响
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`)
  })

  await page.goto(BASE)
  await page.waitForSelector('.chapter', { timeout: 8000 })
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await page.waitForSelector('.chapter', { timeout: 8000 })

  // —— T1 入口：地图 footer → #/forge ——
  await page.getByRole('button', { name: '关卡工坊' }).click()
  const onForge = await page
    .waitForSelector('.forge', { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  onForge ? ok('T1 地图入口进入工坊') : fail('T1 工坊入口', '未渲染 .forge')
  ;(await page.evaluate(() => location.hash)) === '#/forge' ? ok('T1 路由 #/forge') : fail('T1 路由', 'hash 不符')
  const title = await page.locator('.f-title').textContent()
  title?.includes('关卡工坊') ? ok('T1 工坊标题') : fail('T1 工坊标题', String(title))
  const emptyCount = await page.locator('.empty').count()
  emptyCount === 1 ? ok('T1 空库提示') : fail('T1 空库提示', `empty 数 ${emptyCount}`)
  // 默认折叠态：多数人用离线演示，不需要看连接与 key
  const subOpen = await page.locator('.sub').evaluate((el) => el.hasAttribute('open'))
  !subOpen ? ok('T1 模型设置默认折叠') : fail('T1 模型设置默认折叠', 'details 默认展开')
  // 折叠标题行必须自报当前服务，不展开也知道在用哪个
  const serviceText = await page.locator('.sub-hint').textContent()
  serviceText?.includes('离线演示')
    ? ok('T1 折叠行速览当前服务')
    : fail('T1 折叠行速览', String(serviceText))
  const providerDefault = await page.locator('select').last().inputValue()
  providerDefault === 'demo' ? ok('T1 默认离线演示（无需 key）') : fail('T1 默认服务', providerDefault)
  await shot(page, 't50-forge-entry')

  // —— T2 生成：演示 provider（先坏后好 → 覆盖回喂重试）——
  await page.getByRole('button', { name: '生成关卡' }).click()
  const cardAppeared = await page
    .waitForSelector('.level', { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  cardAppeared ? ok('T2 生成后入库出现关卡卡片') : fail('T2 生成', '20s 内未出现 .level')
  const notice = await page.locator('.msg.ok').textContent().catch(() => null)
  notice?.includes('第 2 次尝试') ? ok('T2 回喂重试链路被真实走通（第 2 次成功）') : fail('T2 回喂提示', String(notice))
  const lvTitle = await page.locator('.lv-title').first().textContent()
  lvTitle?.includes('改掉写死的端口') ? ok('T2 关卡标题来自 fixture') : fail('T2 标题', String(lvTitle))
  const keycapTexts = await page.locator('.level .lv-keys .keycap .face').allTextContents()
  JSON.stringify(keycapTexts) === JSON.stringify(['f', 'cw', '<Esc>'])
    ? ok('T2 命令键帽 = 模型声明的命令集')
    : fail('T2 命令键帽', JSON.stringify(keycapTexts))
  const tags = await page.locator('.level .tag').allTextContents()
  tags.some((t) => t.includes('par 9')) ? ok('T2 par 由求解器算出（9 键）') : fail('T2 par 标签', JSON.stringify(tags))
  tags.some((t) => t.includes('已证最优')) ? ok('T2 标记「已证最优」') : fail('T2 最优标记', JSON.stringify(tags))
  await shot(page, 't51-forge-generated')

  // —— T3 命名空间隔离：沙盒不进进度仓库 ——
  const sandboxRaw = await ls(page, 'vim-tour:sandbox')
  const progressRaw = await ls(page, 'vim-tour:progress')
  sandboxRaw?.includes('sbx-') ? ok('T3 沙盒库写入独立命名空间') : fail('T3 沙盒库', String(sandboxRaw?.slice(0, 40)))
  ;(progressRaw === null || !progressRaw.includes('sbx-'))
    ? ok('T3 进度仓库无沙盒痕迹')
    : fail('T3 进度污染', String(progressRaw?.slice(0, 60)))

  // —— T4 开玩：独立对局路由 + 沙盒标识 ——
  await page.getByRole('button', { name: '开始' }).click()
  await page.waitForSelector('.editor', { timeout: 5000 })
  const hash = await page.evaluate(() => location.hash)
  ;/^#\/forge\/play\/sbx-/.test(hash) ? ok('T4 沙盒对局独立路由') : fail('T4 对局路由', hash)
  const chip = await page.locator('.warmup-chip .warmup-label').textContent()
  chip?.includes('沙盒') ? ok('T4 工具栏沙盒标识') : fail('T4 沙盒标识', String(chip))
  const backLabel = await page.locator('.tool.back .label').textContent()
  backLabel === '返回工坊' ? ok('T4 返回按钮文案随场景') : fail('T4 返回按钮', String(backLabel))
  // 光标字符走 data-ch（CSS ::after 渲染），故断言「行文本 + 光标字符」两段
  const lineText = await page.locator('.editor .buffer .line .text').first().innerText()
  lineText.includes('ort = 3000;') ? ok('T4 缓冲区为 fixture 起始文本') : fail('T4 缓冲区', lineText)
  const cursorCh = await page.locator('.editor .cursor').first().getAttribute('data-ch')
  cursorCh === 'p' ? ok('T4 初始光标在 col 0') : fail('T4 光标', String(cursorCh))

  // 白名单解耦（PLAN §14.1）：已教但模型没声明的键要能用；未教的键仍被拦
  await page.keyboard.press('l')
  await page.waitForTimeout(200)
  const afterL = await page.locator('.editor .cursor').first().getAttribute('data-ch')
  const toastAfterL = await page.locator('.toast').count()
  afterL === 'o' && toastAfterL === 0
    ? ok('T4 已教但未声明的键可用（l 移动光标，白名单=档位已教集）')
    : fail('T4 白名单解耦', `data-ch=${afterL} toast=${toastAfterL}`)
  await page.keyboard.press('V') // 第 5 章命令，第 3 章档未教
  await page.waitForTimeout(300)
  const toastText = await page.locator('.toast').allTextContents()
  toastText.some((t) => t.includes('还没教到'))
    ? ok('T4 未教的键仍被拦（文案准确）')
    : fail('T4 未教键', JSON.stringify(toastText))
  await page.keyboard.press('h') // 复位到 col 0
  await page.getByRole('button', { name: '重来' }).click() // 清掉探针按键，按 par 解通关（≤par 才三星）
  await page.waitForTimeout(200)
  await shot(page, 't52-forge-play')

  // —— T5 通关：par 解 → 三星 + 沙盒结算 ——
  await press(page, 'f3cw8080<Esc>')
  const resultShown = await page
    .waitForSelector('.ticket', { timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  resultShown ? ok('T5 par 解通关进结算屏') : fail('T5 通关', '未出现结算屏')
  const resultChip = await page.locator('.t-chip').textContent()
  resultChip?.includes('沙盒关卡') ? ok('T5 结算屏沙盒标识') : fail('T5 结算标识', String(resultChip))
  const litStars = await page.locator('.t-stars .star.lit').count()
  litStars === 3 ? ok('T5 击键 = par → 三星') : fail('T5 星级', `${litStars} 星`)
  const effNums = await page.locator('.eff-nums').innerText()
  effNums.includes('9') ? ok('T5 效率条 击键 9 / par 9') : fail('T5 效率条', effNums.replace(/\n/g, ' '))
  const actions = await page.locator('.t-actions button').allTextContents()
  actions.some((t) => t.includes('回到工坊')) ? ok('T5 结算按钮回工坊') : fail('T5 结算按钮', JSON.stringify(actions))
  await shotResult(page, 't53-forge-result')

  // —— T6 成绩落库 + 删除 ——
  await page.getByRole('button', { name: '回到工坊' }).click()
  await page.waitForSelector('.level', { timeout: 5000 })
  const litInLibrary = await page.locator('.level .lv-stars .lit').count()
  litInLibrary === 3 ? ok('T6 单关成绩写回沙盒库（3 星）') : fail('T6 成绩落库', `${litInLibrary} 星`)
  const staleNotice = await page.locator('.msg.ok, .msg.err').count()
  staleNotice === 0 ? ok('T6 重进工坊清掉过期提示') : fail('T6 过期提示', `仍有 ${staleNotice} 条`)
  const progressAfter = await ls(page, 'vim-tour:progress')
  ;(progressAfter === null || !progressAfter.includes('sbx-'))
    ? ok('T6 通关后进度仓库仍无沙盒痕迹')
    : fail('T6 进度污染', String(progressAfter?.slice(0, 60)))
  await shot(page, 't54-forge-library-scored')
  await page.getByRole('button', { name: '删除' }).click()
  await page.waitForTimeout(300)
  const levelsLeft = await page.locator('.level').count()
  const emptyBack = await page.locator('.empty').count()
  levelsLeft === 0 && emptyBack === 1 ? ok('T6 删除后回到空库') : fail('T6 删除', `剩 ${levelsLeft} 关`)

  // —— T7 设置持久化：模型设置与生成旋钮重载后不丢（非机密，透明存）——
  // 模型设置折叠在 <details> 里（ForgeScreen 生成台底部），先展开再操作——
  // 这也是真实用户路径：折叠态下 selectOption/fill 都会因不可见而超时
  await page.locator('.sub-sum').click()
  await page.waitForTimeout(200)
  await page.locator('select').last().selectOption('openai')
  await page.waitForTimeout(200)
  await page.getByPlaceholder('http://localhost:11434/v1').fill('http://127.0.0.1:11434/v1')
  await page.getByPlaceholder('qwen2.5-coder:7b').fill('my-test-model')
  await page.getByPlaceholder('例如：nginx 配置、日志排查').fill('日志排查')
  await page.waitForTimeout(250)
  await page.reload()
  await page.waitForSelector('.forge', { timeout: 8000 })
  await page.locator('.sub-sum').click()
  await page.waitForTimeout(200)
  const providerAfter = await page.locator('select').last().inputValue()
  const urlAfter = await page.getByPlaceholder('http://localhost:11434/v1').inputValue()
  const modelAfter = await page.getByPlaceholder('qwen2.5-coder:7b').inputValue()
  const themeAfter = await page.getByPlaceholder('例如：nginx 配置、日志排查').inputValue()
  providerAfter === 'openai' &&
  urlAfter === 'http://127.0.0.1:11434/v1' &&
  modelAfter === 'my-test-model' &&
  themeAfter === '日志排查'
    ? ok('T7 模型设置与生成旋钮重载后不丢')
    : fail('T7 设置持久化', `${providerAfter}|${urlAfter}|${modelAfter}|${themeAfter}`)
  await shot(page, 't55-forge-settings-persist')

  // —— T8 锁定态解锁：已存 key 重载后口令行常驻，不挂在「记住」勾选下 ——
  // （记住勾选是易失 UI 态，旧交互刷新后必须重勾才露出解锁框——把「是否持久化」
  //   和「本次解锁」两个意图拧在一起；此用例锁住拆分后的行为）
  await page.getByPlaceholder('API key（本地模型可留空）').fill('sk-test-key')
  await page.locator('.chk input').check()
  await page.getByPlaceholder('口令（≥6 位）').fill('pass123456')
  await page.getByRole('button', { name: '保存' }).click()
  await page.waitForTimeout(250)
  await page.reload()
  await page.waitForSelector('.forge', { timeout: 8000 })
  await page.locator('.sub-sum').click()
  await page.waitForTimeout(200)
  const unlockInput = page.getByPlaceholder('输入口令解锁已保存的 key')
  const unlockCount = await unlockInput.count()
  const chkCount = await page.locator('.chk').count()
  unlockCount === 1 && chkCount === 0
    ? ok('T8 锁定态口令行常驻（无需先勾记住）')
    : fail('T8 锁定态', `解锁框 ${unlockCount} 个、记住勾选 ${chkCount} 个`)
  await shot(page, 't56-forge-key-locked')
  await unlockInput.fill('wrong-pass')
  await page.getByRole('button', { name: '解锁' }).click()
  await page.waitForTimeout(250)
  ;(await page.locator('.msg.err').count()) === 1
    ? ok('T8 错口令被拒')
    : fail('T8 错口令', '未出现错误提示')
  await unlockInput.fill('pass123456')
  await unlockInput.press('Enter')
  await page.waitForTimeout(250)
  ;(await page.getByPlaceholder('API key（本地模型可留空）').count()) === 1
    ? ok('T8 对口令解锁回管理态')
    : fail('T8 解锁', '未回管理态')

  await browser.close()
}

await run()

// —— 汇总 ——
console.log('\n===== 工坊走查结果 =====')
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
