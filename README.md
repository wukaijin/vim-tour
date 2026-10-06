# vim-tour

在浏览器里通过实操闯关学会 vim——从零基础到能脱离鼠标完成日常编辑。

无后端、无账号、无同步，进度存在本机 localStorage；纯前端 SPA，桌面优先。

## 核心玩法

- **起始 → 目标 diff 制**：屏幕呈现起始文本（可编辑缓冲区）与目标文本的 diff 对照，成功判定 = 缓冲区内容与目标一致，不比对按键序列——`dw` 与 `de` 等等价解法天然被接受。
- **次数 + 效率双轨**：每关需连续成功 N 次（N 随章节递增）训练肌肉记忆；星级按击键数与 par 的比值评定（≤par 三星 / ≤1.5×par 二星 / 完成一星），驱动效率打磨。
- **变体轮换**：每关内置双文本变体，按日期做种子轮换——会话内稳定、隔天必换，测提取不测再认。
- **锈蚀与热身**：已通关技能按 1/3/7/14/30 天间隔进入「生疏」态，进章节地图时出现 ≤90 秒、可随时跳过的热身卡。锈蚀是邀请不是惩罚：永不摘星、永不锁章、热身永远不是门禁。
- **按键白名单**：第 1–4 章只允许已教按键（未教按键给轻提示），第 5 章起完全放开，等同真实 vim 自由度。

课程共 **7 章 56 关**（含每章毕业考）：生存 → 词与行移动 → 操作符+移动 → 文本对象 → Visual 模式 → 查找替换 → 综合实战。

## 关卡工坊（`#/forge`）

BYO 模型的无限练习场：接任意 OpenAI 兼容服务（默认指向本地 Ollama，无 key 即可用；另内置离线演示 provider），按「命令档（ch1–ch7）/ 复杂度 / 题材」三旋钮生成沙盒关卡。

- **引擎说了算，模型无权绕过验证**：候选关卡须过结构校验 → 解法命令集 ⊆ 该档已教集 → 真 `LevelRun` 逐键回放收敛到目标 → 求解器（真引擎状态空间 BFS）复算 par，失败原因回喂模型重试 ≤3 次。
- 沙盒与正篇**平行永不相交**：不进章节内容、不写进度仓库、不上章节地图。
- 关卡库可导出/导入 JSON；模型 key 默认仅内存，可选口令加密落盘。

## 快速开始

```bash
npm install
npm run dev        # 起 dev server（Vite；需 Node ^20.19 || >=22.12）
npm test           # vitest 全量单测（含内容构建期校验、引擎 golden tests）
npm run typecheck  # vue-tsc
npm run build      # vue-tsc -b && vite build
```

## 无头走查（黑盒验收）

改动 UI 或对局流程后，先起 dev server，再跑 Playwright 走查脚本（截图存证到 `gui-test-screenshots/`，不进 git）：

```bash
node scripts/walkthrough.mjs         # 主线：地图 → 对局 → 结算
node scripts/walkthrough-warmup.mjs  # 热身卡链路
node scripts/walkthrough-forge.mjs   # 工坊全链路（离线演示 provider，真实 API 永不进走查）
node scripts/block-insert-steps.mjs  # 块插入虚显逐步取证（按需）
```

## 代码结构

```
src/
  engine/    # vim 仿真状态机（纯 TS、零框架依赖）+ solver.ts 最短解 BFS（par 证明层）
  game/      # 关卡运行时：判定、连续计数、星级、白名单、变体、锈蚀、热身选题
  content/   # 章节关卡数据（声明式 TS）+ 命令元数据表 + 构建期校验器
  forge/     # 关卡工坊：prompt 构造/响应解析/验证闸门/回喂重试、provider 适配器、key 保管
  storage/   # 进度仓库（localStorage 经接口抽象）+ 沙盒库（独立命名空间）+ 工坊设置
  ui/        # Vue 组件：章节地图 / 对局 / 结算 / 工坊四屏与 Keycap 等组件
```

依赖面刻意收敛：仅 `vue` / `pinia` / `@fontsource` 字体包。零 CSS 框架、零图标库、零插画包、零光栅图（唯一例外 `favicon.svg`）——视觉母题是「键帽」，全部由参数化 `<Keycap>` 组件派生；中文走系统字体栈不上 webfont。

## 文档

**[docs/PLAN.md](docs/PLAN.md) 是唯一权威规格**：产品机制、视觉 token、资源红线、里程碑与验收口径、关卡工坊设计（§14）都在其中，实现与本文冲突时以 PLAN 为准。
