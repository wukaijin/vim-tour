# AGENTS.md — vim-tour 项目规约

任何 agent 在本仓库工作前必读。用简体中文交流，代码标识符保持英文。

## 项目与规格

vim-tour：教零基础玩家 vim 的 Vue3 SPA 闯关游戏（零基础 → 日常编辑熟练）。
**docs/PLAN.md 是唯一权威规格**（产品机制、视觉 token、资源红线、里程碑、验收口径），一切实现细节以它为准，冲突时不许凭感觉改。里程碑进度、待拍板项见 PLAN §11/§13。

代码分层：`src/engine/`（vim 仿真，纯 TS 零框架依赖；含 `solver.ts` 最短解 BFS——沙盒 par 的证明层）→ `src/game/`（关卡运行时/判定/星级/变体/锈蚀/热身选题）→ `src/storage/`（进度 localStorage 经接口抽象；含 `sandbox.ts` 沙盒库与 `forge-settings.ts`，均为独立命名空间）→ `src/content/`（章节关卡数据 + 命令元数据表 + 构建期校验器）→ `src/forge/`（关卡工坊：prompt/解析/验证闸门/回喂重试、provider 适配器、key 保管，纯 TS 零 UI 依赖）→ `src/ui/`（Vue 组件与四屏：地图/对局/结算/工坊）。

## 完成定义（缺一不算完成）

1. `npm test` / `npm run typecheck` / `npm run build` 三者全绿。
2. 改动关卡内容必须过 `src/content/validate.ts` 构建期五断言（挂在测试里，自动执行）。
3. 改动 UI/对局流程后跑无头走查：先起 dev server，再 `node scripts/walkthrough.mjs` 与 `node scripts/walkthrough-warmup.mjs`；改动工坊/沙盒链路时另跑 `node scripts/walkthrough-forge.mjs`（Playwright 黑盒，截图存证到 `gui-test-screenshots/`，该目录不进 git）。

## 硬约束（不要"顺手修复"或违反）

- **引擎已定案的 vim 简化**：Tab 插 2 空格、shiftwidth=2、`:s` 按 JS 正则语义（仅转译 `\(` `\<`）、visual 下 `:` 无范围、块插入按首行文本套用所有行。这些是有意决策，改前先问用户。
- **时间注入**：`src/game/`、`src/storage/` 内禁止调用 `Date.now()`，时间一律走注入 clock（`retentionOf(record, now)` 的 now 从参数进）——假时钟属性测试依赖此条。
- **资产棘轮**（PLAN §10）：仓库禁光栅图（唯一例外 `public/favicon.svg`）、零图标库、零插画包；插画由参数化 `<Keycap>` 组件派生；中文不上 webfont（CJK 系统栈）；woff2 硬上限 120KB。
- **锈蚀是邀请不是惩罚**：永不摘星、永不回退进度、永不锁下一章；热身永远不是门禁。
- **掉期砍单顺序**按 PLAN §11.2：先砍热身卡 UI（保字段与纯函数），再砍 ch1 变体；**ch2 变体与毕业考 fresh 文本不可砍**。
- 新关卡变体必须逐词一对一替换（行数、逐行前导空白、光标行一致，parKeys 复用）——校验器会拦，别绕。
- **沙盒与正篇永不相交**（PLAN §14）：生成的关卡不进 `src/content`、不写 `ProgressRepository`、不上章节地图、不参与 §11.3 试玩读数；沙盒库/工坊设置用独立 localStorage 命名空间，不与进度仓库共享字段。
- **真实模型 API 永不进 CI 与走查**：走查只走内置离线演示 provider，真实 API 仅作者手动抽查。
- **forge 零新增依赖**：模型接入选 `fetch`/`WebCrypto` 平台能力，不引任何 SDK 或第三方脚本；key 不进导出/日志/URL。
- **求解器与闸门不可砍**（PLAN §14.9）：M5 掉期时按 §14.9 顺序砍，砍掉求解器/闸门等于把「引擎说了算」换成「模型说了算」。

## 工作方式

- 引擎行为有疑问，以"真实 vim 会怎么做"为准：先写 golden test 锁预期，再改实现。
- 按 PLAN 推进，不要事事向用户确认；真正的范围变更（砍里程碑、改机制、动 PLAN 硬条款）先停下来问。
- git 提交需用户明确要求，不擅自 commit/push。
- 走查/验收结论先行给出，再附证据。
