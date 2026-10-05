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
      <p v-if="forge.library.length === 0" class="empty">还没有关卡。生成一关，或导入别人分享的 JSON（导入会重算 par）。</p>
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

    <section class="card">
      <h2 class="c-title">模型设置</h2>
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
          <button v-if="forge.keyStored && !forge.keyUnlocked" class="btn small" @click="forge.unlockKey()">解锁</button>
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

.knobs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3) var(--sp-4);
}

.knob {
  display: grid;
  gap: var(--sp-1);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}

.knob.wide {
  flex: 1 1 260px;
}

.knob input,
.knob select {
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--edge);
  border-radius: var(--r-input);
  padding: 8px 10px;
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
  margin: 0;
  color: var(--ink-2);
  font-size: var(--fs-sm);
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
