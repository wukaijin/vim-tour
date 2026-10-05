<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGameStore } from '../stores/game'
import { useForgeStore } from '../stores/forge'
import Keycap from '../components/Keycap.vue'
import KeyGlyph from '../components/KeyGlyph.vue'
import { DIFFICULTY_LABEL, FORGE_TIERS, PAR_RANGE } from '../../forge/types'
import { parseKeys } from '../../engine'

const game = useGameStore()
const forge = useForgeStore()
const fileInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  forge.refreshLibrary()
  forge.dismissNotice()
})

const parHint = computed(() => {
  const r = PAR_RANGE[forge.params.difficulty]
  return `${r.min}–${r.max} 键`
})

const parOf = (parKeys: string): number => parseKeys(parKeys).length

/** 折叠标题行上的当前服务速览：不展开也能知道在用哪个 provider */
const serviceLabel = computed(() =>
  forge.providerKind === 'openai' ? `${forge.model || '未填模型'} · ${forge.baseUrl || '未填地址'}` : '离线演示 · 无需 key',
)

function onImportFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  file
    .text()
    .then((text) => forge.importLibrary(text))
    .catch(() => (forge.errorText = '读取文件失败'))
  input.value = ''
}
</script>

<template>
  <div class="forge">
    <header class="f-head">
      <div>
        <h1 class="f-title">关卡工坊</h1>
        <p class="f-sub">用自己的模型出题，本地引擎验证后开玩；与正篇进度互不影响。</p>
      </div>
      <button class="btn ghost" @click="game.gotoMap()">返回地图</button>
    </header>

    <section class="card">
      <h2 class="c-title">生成台</h2>
      <div class="knobs">
        <label class="knob">
          <span>命令档</span>
          <select v-model.number="forge.params.tier">
            <option v-for="t in FORGE_TIERS" :key="t" :value="t">第 {{ t }} 章</option>
          </select>
        </label>
        <label class="knob">
          <span>难度</span>
          <select v-model="forge.params.difficulty">
            <option v-for="(label, key) in DIFFICULTY_LABEL" :key="key" :value="key">
              {{ label }}（{{ PAR_RANGE[key].min }}–{{ PAR_RANGE[key].max }} 键）
            </option>
          </select>
        </label>
        <label class="knob">
          <span>行数上限</span>
          <input v-model.number="forge.params.maxLines" type="number" min="1" max="8" />
        </label>
        <label class="knob">
          <span>每行字符上限</span>
          <input v-model.number="forge.params.maxCols" type="number" min="16" max="64" />
        </label>
        <label class="knob wide">
          <span>题材（可空）</span>
          <input v-model="forge.params.theme" type="text" placeholder="例如：nginx 配置、日志排查" />
        </label>
      </div>
      <div class="row">
        <button class="btn primary" :disabled="forge.running" @click="forge.generate()">
          {{ forge.running ? `生成中… 第 ${forge.attempt}/${forge.maxAttempts} 次尝试` : '生成关卡' }}
        </button>
        <button v-if="forge.running" class="btn" @click="forge.cancel()">取消</button>
        <span class="hint">目标复杂度 {{ parHint }}，由本地求解器实算并验证</span>
      </div>
      <p v-if="forge.errorText" class="msg err">{{ forge.errorText }}</p>
      <p v-else-if="forge.notice" class="msg ok">{{ forge.notice }}</p>
      <p v-if="forge.usageText" class="hint">{{ forge.usageText }}</p>

      <!-- 模型设置折叠为生成台的次级区块：默认服务是离线演示，多数人不需要改；
           展开后才露出连接与 key。三张卡压成两张，一屏装得下（PLAN §10.3 插画与控件皆组件派生） -->
      <details class="sub">
        <summary class="sub-sum">
          <span class="sub-title">模型设置</span>
          <span class="sub-hint mono">{{ serviceLabel }}</span>
        </summary>
        <div class="knobs">
          <label class="knob wide">
            <span>服务</span>
            <select v-model="forge.providerKind">
              <option value="demo">离线演示（无需 key）</option>
              <option value="openai">OpenAI 兼容（本地 / 远端）</option>
            </select>
          </label>
          <template v-if="forge.providerKind === 'openai'">
            <label class="knob wide">
              <span>服务地址</span>
              <input v-model="forge.baseUrl" type="text" placeholder="http://localhost:11434/v1" />
            </label>
            <label class="knob wide">
              <span>模型名</span>
              <input v-model="forge.model" type="text" placeholder="qwen2.5-coder:7b" />
            </label>
          </template>
        </div>

        <template v-if="forge.providerKind === 'openai'">
          <div class="row">
            <input v-model="forge.keyInput" type="password" class="grow" placeholder="API key（本地模型可留空）" />
            <button class="btn small" @click="forge.saveKey()">保存</button>
            <button v-if="forge.keyStored" class="btn small ghost" @click="forge.forgetKey()">清除</button>
          </div>
          <div class="row">
            <label class="chk">
              <input v-model="forge.rememberKey" type="checkbox" :disabled="!forge.canRemember" />
              记住（口令加密）
            </label>
            <input
              v-if="forge.rememberKey"
              v-model="forge.passphrase"
              type="password"
              class="grow"
              :placeholder="forge.keyStored && !forge.keyUnlocked ? '输入口令解锁' : '口令（≥6 位）'"
            />
            <button v-if="forge.keyStored && !forge.keyUnlocked" class="btn small" @click="forge.unlockKey()">
              解锁
            </button>
          </div>
          <p class="hint">
            <template v-if="!forge.canRemember">
              当前环境不支持加密存储（crypto.subtle 不可用），key 只能保存在本次会话。
            </template>
            <template v-else>
              默认只放内存、关页即忘；勾选「记住」用口令派生的密钥加密后落本机（防的是顺手翻看与备份泄露，防不了页面被注入）。
            </template>
          </p>
        </template>
        <p v-else class="hint">离线演示用内置 fixture 跑完整链路（解析 → 校验 → 求解 → 入库），不联网、不花 token。</p>
      </details>
    </section>

    <section class="card">
      <div class="lib-head">
        <h2 class="c-title">我的关卡库（{{ forge.library.length }}）</h2>
        <div class="row">
          <button class="btn small" :disabled="forge.library.length === 0" @click="forge.exportLibrary()">导出 JSON</button>
          <button class="btn small" @click="fileInput?.click()">导入 JSON</button>
          <input ref="fileInput" class="hidden-file" type="file" accept="application/json" @change="onImportFile" />
          <button v-if="forge.library.length > 0" class="btn small ghost" @click="forge.clearLibrary()">清空</button>
        </div>
      </div>
      <div v-if="forge.library.length === 0" class="empty">
        <!-- 空态插画：一排空键帽（PLAN §10.3 插画由组件派生，零资源） -->
        <div class="empty-keys" aria-hidden="true">
          <Keycap v-for="i in 6" :key="i" label="" size="lg" :class="{ ghost: i % 2 === 0 }" />
        </div>
        <p class="empty-text">还没有关卡。生成一关，或导入别人分享的 JSON（导入会重算 par）。</p>
      </div>
      <ul class="levels">
        <li v-for="lv in forge.library" :key="lv.id" class="level">
          <div class="lv-main">
            <div class="lv-title">{{ lv.title }}</div>
            <div class="lv-brief">{{ lv.brief }}</div>
            <div class="lv-meta">
              <span class="tag">第 {{ lv.provenance.tier }} 章</span>
              <span class="tag">{{ DIFFICULTY_LABEL[lv.provenance.difficulty] }}</span>
              <span class="tag mono">{{ lv.provenance.model }}</span>
              <span class="tag mono">par {{ parOf(lv.text.parKeys) }}</span>
              <span v-if="lv.provenance.parSource === 'proven'" class="tag">已证最优</span>
              <span class="lv-stars" :aria-label="`最好 ${lv.stats.bestStars} 星`">
                <KeyGlyph v-for="i in 3" :key="i" name="star" :size="13" :class="{ lit: i <= lv.stats.bestStars }" />
              </span>
            </div>
            <div class="lv-keys">
              <span class="lv-keys-cap">解法命令</span>
              <Keycap v-for="(k, i) in lv.solverKeys" :key="`${k}-${i}`" :label="k" size="xs" />
            </div>
          </div>
          <div class="lv-actions">
            <button class="btn primary small" @click="game.openSandboxLevel(lv.id)">开始</button>
            <button class="btn small ghost" @click="forge.removeLevel(lv.id)">删除</button>
          </div>
        </li>
      </ul>
    </section>

    </div>
</template>

<style scoped>
.forge {
  max-width: 880px;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-4) 96px;
  display: grid;
  gap: var(--sp-6);
}

.f-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
}

.f-title {
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  margin: 0 0 var(--sp-1);
}

.f-sub {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

.card {
  background: var(--surface);
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-1);
  padding: var(--sp-6);
  display: grid;
  gap: var(--sp-4);
}

.c-title {
  margin: 0;
  font-size: var(--fs-lg);
}

/* 生成台旋钮：定宽栅格而非裸 flex——裸排时「命令档」95px、「题材」310px，
   字段宽度与内容语义零关联，读起来像没排版 */
.knobs {
  display: grid;
  grid-template-columns: 104px 176px 88px 112px 1fr;
  gap: var(--sp-3);
}

.knob {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

/* 模型设置里的字段跨多列：地址与模型名需要横向空间 */
.knob.wide {
  grid-column: span 2;
}

@media (max-width: 720px) {
  .knobs {
    grid-template-columns: 1fr 1fr;
  }
  .knob.wide {
    grid-column: span 2;
  }
}

.knob input,
.knob select {
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--edge);
  border-radius: var(--r-input);
  padding: 8px 10px;
  min-height: 36px;
}

/* select 去掉平台原生外观与箭头：默认填充色 + 系统箭头与纸面质感脱节，
   是全页最「没装修」的两块。chevron 用内联 SVG 画出（零资源，见 §10.2） */
.knob select {
  appearance: none;
  -webkit-appearance: none;
  padding-right: 30px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%236B675C' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 11px center;
  cursor: pointer;
}

/* 数字值走等宽是既定语言（§8.3）：Nunito 的 1/7 与 0/8 难分辨，
   而这里恰是要盯着改的数字 */
.knob input[type='number'],
.row input[type='password'].mono {
  font-family: var(--font-mono);
}

/* —— 模型设置：生成台的次级折叠区块 —— */
.sub {
  border-top: 1px solid var(--edge);
  padding-top: var(--sp-3);
}

.sub-sum {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  cursor: pointer;
  list-style: none;
  padding: var(--sp-1) 0;
}

.sub-sum::-webkit-details-marker {
  display: none;
}

/* 展开箭头：CSS 三角，零资源 */
.sub-sum::before {
  content: '';
  width: 0;
  height: 0;
  border-left: 5px solid var(--ink-2);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform var(--dur-fast) var(--ease-out);
  flex: none;
}

.sub[open] > .sub-sum::before {
  transform: rotate(90deg) translateX(-1px);
}

.sub-title {
  font-size: var(--fs-sm);
  font-weight: 700;
}

.sub-hint {
  margin-left: auto;
  font-size: var(--fs-xs);
  color: var(--ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub[open] > .sub-sum {
  margin-bottom: var(--sp-3);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.row .grow {
  flex: 1 1 220px;
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--edge);
  border-radius: var(--r-input);
  padding: 8px 10px;
}

.hint {
  margin: 0;
  color: var(--ink-2);
  font-size: var(--fs-xs);
}

.msg {
  margin: 0;
  font-size: var(--fs-sm);
  border-radius: var(--r-input);
  padding: 8px 12px;
}

.msg.err {
  color: var(--err-ink);
  background: var(--err-fill);
}

.msg.ok {
  color: var(--ok-ink);
  background: var(--ok-fill);
}

.btn {
  font: inherit;
  cursor: pointer;
  border: 1px solid var(--edge);
  border-radius: var(--r-input);
  background: var(--surface);
  color: var(--ink);
  padding: 10px 16px;
  box-shadow: var(--shadow-1);
  transition: transform var(--dur-fast) var(--ease-out);
}

.btn:hover:not(:disabled) {
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: default;
  box-shadow: none;
}

.btn.primary {
  background: var(--brand);
  border-color: var(--brand-ink);
  color: #fff;
}

.btn.ghost {
  background: transparent;
  box-shadow: none;
}

.btn.small {
  padding: 6px 12px;
  border-radius: var(--r-keycap);
  font-size: var(--fs-sm);
}

.lib-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.empty {
  display: grid;
  justify-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6) var(--sp-4);
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

/* 空态插画：一排空键帽。键帽是全站母题，空键帽即「还没有按键」的字面说法；
   奇偶错落 + 递进退让模拟键帽墙的散落排布（§8.1 禁 hero，用排布不用插画）。
   .keycap 是 Keycap 组件的 scoped 类，需 :deep 穿透 */
.empty-keys {
  display: flex;
  gap: var(--sp-2);
  opacity: 0.55;
}

.empty-keys :deep(.keycap:nth-child(2n)) {
  transform: translateY(-4px);
}

.empty-keys :deep(.keycap:nth-child(3n)) {
  transform: translateY(3px);
}

.empty-text {
  margin: 0;
  text-align: center;
}

.levels {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-3);
}

.level {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-4);
  border: 1px solid var(--edge);
  border-radius: var(--r-card);
  background: var(--paper);
  padding: var(--sp-4);
}

.lv-main {
  display: grid;
  gap: var(--sp-2);
  min-width: 0;
}

.lv-title {
  font-weight: 700;
}

.lv-brief {
  color: var(--ink-2);
  font-size: var(--fs-sm);
}

.lv-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  font-size: var(--fs-xs);
  color: var(--ink-2);
}

.tag {
  border: 1px solid var(--edge);
  border-radius: 999px;
  padding: 2px 8px;
  background: var(--surface);
}

.tag.mono {
  font-family: var(--font-mono);
}

.lv-stars {
  display: inline-flex;
  gap: 2px;
  color: var(--edge);
}

.lv-stars .lit {
  color: var(--star);
}

.lv-keys {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  flex-wrap: wrap;
}

.lv-keys-cap {
  font-size: var(--fs-xs);
  color: var(--ink-2);
  margin-right: var(--sp-1);
}

.lv-actions {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
}

.chk {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

.hidden-file {
  display: none;
}
</style>
