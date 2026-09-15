# AGENTS.md

小体积原生 JS 项目「今天我做主」（儿童自主力成长应用）：纯 HTML/CSS/JS，无 npm、无构建步骤、无测试、无 CI、无 lint。所有 UI 文案均为简体中文。仓库中没有其他指令文件或 OpenCode 配置。

## 布局 — `dist/` 是源码，而非构建输出

- `dist/` (`index.html`, `app.js`, `styles.css`, 3 张 webp 插画, PWA 相关的 `sw.js`/`manifest.json`/6 个图标 png) 是 Web 应用的**可编辑源码**。尽管它叫 "dist"，但它必须被 git 追踪（已在 `.gitignore` 中修复）。
- `assets/` 存放插画的**原始高分辨率 PNG**，网页不会加载它们。改图后跑 `python scripts/optimize-images.py` 重新生成 `dist/*.webp`。原图必须留着：图标生成（`make-icons.py`）需要读 PNG。
- `release/` 是 `scripts/pack-web.py` 生成的部署 ZIP，属构建产物，已 gitignore。
- `.openai/hosting.json` 是已废弃的托管网站遗留配置；对本地运行无影响。

## 运行

- Web: `python -m http.server 8080 -d dist` (或 Windows 下使用 `py -m ...`)，打开 http://localhost:8080。localStorage 持久化需要同源，因此不能使用 `file://` 协议。

## Web 部署与 PWA

- 线上部署走腾讯云 **CloudBase 静态网站托管**（上传代码包），完整步骤见 `DEPLOY.md`。打包：`python scripts/pack-web.py` → `release/today-i-control-pwa.zip`（脚本会把 `dist/` 摊平到 ZIP 最外层并校验 `index.html` 在压缩包根目录——多套一层会 404）。控制台填：构建命令留空、构建产物目录 `.`、部署路径 `/`。
- **绑定自定义域名必须完成 ICP 备案**（CloudBase 强制，未备案绑不上也访问不通）。用 CloudBase 环境当备案资源需同时满足：套餐个人版及以上 + 剩余有效期 ≥ 6 个月 + 已开启云托管固定 IP；管局审核 1–20 个工作日。HTTPS 需自行在 SSL 控制台申请免费 DV 证书再绑定，证书 1 年有效会过期。
- CloudBase 默认域名 `*.tcloudbaseapp.com` **仅供测试**：浏览器直开会先跳「访问提示中间页」，有访问频率限制，且可能因风控被封禁。不要在文档或配置里把它写成长期入口（这一点曾写错过，务必保持）。
- PWA 三件套：`dist/manifest.json`、`dist/sw.js`、图标一律由 `python scripts/make-icons.py` 从 `assets/star-friend.png` 生成（含 maskable 安全区计算），不要手改图标。图标保持 PNG（iOS 的 apple-touch-icon 不认 WebP），插画才用 WebP。
- Service Worker 只在 `https:` / `localhost` 下注册，注册代码内联在 `index.html` 末尾——`app.js` 里没有任何 PWA 相关代码，保持这样。
- 导航请求为 network-first，但带 2.5s 超时回退缓存（`NAV_TIMEOUT_MS`）：弱网/断网时不会白屏干等。

## 架构（小型原生应用）

- `dist/app.js`：全局状态 `s` 是 `self-growth-v2.state` 的本机投影；每个业务动作同时更新投影并向 `pending` 追加事件。`render()` 通过字符串模板和内联 `onclick` 处理程序重新渲染四页面 UI（今天/计划/成长/奖励）。
- `dist/growth-events.js`：浏览器与 Node 共用的纯函数事件层，负责 `blank/norm/apply/replay/newId`。
- `dist/auth.js`：家长手机号登录、唯一孩子档案绑定、待上传事件补传和云端事件重放。

## 强约束与易踩坑点

- 当前产品尚未上线，V2 明确不兼容旧存储。只使用 `self-growth-v2`；不要重新引入 `self-growth-v1`、`self-growth-cloud-v1` 或 `self-growth-archive-v1`。
- `dist/growth-art.webp` 是 CSS 雪碧图：`styles.css` 用 `background-size: 738.5px 1043.7px` 配合绝对像素 `background-position` 定位书包/图书/闹钟等图标，**它的像素尺寸不能改**，否则所有图标错位。`scripts/optimize-images.py` 已固定按原尺寸转换它。改过图片后务必肉眼核对首页与任务卡上的图标。
- 通过 PowerShell 读取文件时，请显式指定 `-Encoding UTF8`；文件为 UTF-8 编码，PS 5.1 控制台中显示的乱码仅仅是控制台显示问题（已使用 `node --check dist/app.js` 验证）。
- 编辑前请先运行 Node 语法检查：`node --check dist/app.js`。由于行很长，编辑时切勿使用贪心的全文匹配方式（即避免容易误匹配的多行编辑）。
- 家长面板 PIN 码为 1234——仅用于防误触，并非安全机制。需保留此行为。
- 回归验证：`node scripts/verify.js`（语法检查 + V2 本地账本 + 事件合并 + 既有产品行为）。改完 `dist/` 后必须跑一遍，全绿再提交。手动验证仍可运行服务器，检查四个页面 + 家长面板，并确认完成任务时会加分（重复完成会被阻止）。
- 改过 `dist/` 里任何 HTML/CSS/JS 后，务必把 `dist/sw.js` 顶部的 `VERSION` 加一，否则老用户浏览器的 Service Worker 缓存不会刷新。
- 线上域名与 `localhost` 是互不相通的存储源；绑定同一手机号后通过云端事件账本恢复。未登录时数据仍只在当前浏览器。

## 云端账号与同步（CloudBase）

- 产品边界是**一个家长账号只对应一个孩子**。`profiles.user_id` 有 UNIQUE 约束；不要重新增加档案列表、添加孩子、切换孩子或顶部当前孩子胶囊。
- 原则：本地优先、永不打扰。每次操作先写 `self-growth-v2.state + pending`；未配置 envId / 未登录 / 断网 / 报错时不弹窗阻断孩子。
- 云端 PostgreSQL 的 `profiles` 只保存孩子元数据，`growth_events` 只追加事件。普通用户对事件表只有 `SELECT, INSERT`，严禁恢复整包 `profiles.state` 或 last-write-wins。
- 本环境是 PG 模式，文档型数据库实测不可用。`auth.js` 使用 `app.rdb().from(...)`（PostgREST 风格，返回 `{data, error}`）。完整新建表 SQL 是 `cloud/schema-v2.sql`。
- `dist/cloudbase.esm.js` 是**内置的、真正自包含的** CloudBase JS SDK v3.9.3（785KB，用 esbuild 把 `@cloudbase/js-sdk` 连同依赖一起 bundle 成单文件 ESM，`export default`）。不要手改。
  ⚠️ **不要**再用 jsdelivr 的 `+esm` 产物覆盖它：那个文件开头有 8 条 `import * as X from "/npm/<pkg>@<ver>/+esm"` 的**根相对路径**，只有在 `cdn.jsdelivr.net` 域名下才解析得通，放到自有域名或 localhost 上必然 404（2026-09-14 踩过这个坑，此前的「自带依赖、无外部引用」说法是错的）。
  重新生成：临时目录 `npm i @cloudbase/js-sdk@<版本> esbuild`，入口文件写 `import cb from '@cloudbase/js-sdk'; export default cb;`，再 `esbuild --bundle --format=esm --minify --target=es2019`。生成后用 `grep -c '/npm/'` 确认结果为 0。
  它只在真正用到云端时才被动态 `import()` 加载（URL 带 `?v=` 防止 Service Worker 缓存旧版），不进首屏。
- 它是平铺在 `dist/` 根目录的，因为 `scripts/pack-web.py` **只收顶层文件且禁止嵌套目录**（EdgeOne 要求 index.html 在压缩包最外层）。别把它挪进子目录，否则打不进 ZIP。
- 家长面板只有「👧 孩子设置」和「🛡️ 记录保护」两个主要概念。手机号登录后自动同步，不提供“立即同步”按钮；文件导入导出收在「高级数据管理」。
- 登录 API 用的是 `auth.getVerification({phone_number})` + `auth.signInWithSms({verificationInfo, verificationCode, phoneNum})`（手机号要带 `+86 ` 前缀）。控制台开通步骤、数据库安全规则见 `CLOUD.md`。
- `cloud/phone-login/` 是**二期**小程序手机号登录的云函数脚手架，尚未联调。上小程序时要解决两端 uid 对齐问题（Web 短信登录 uid ≠ 自定义登录 uid），方案见 `CLOUD.md` 第五节。

## 事件账本（已接线）

- `dist/growth-events.js` 是正式运行时代码；`scripts/verify.js` 直接 require 同一文件，禁止再维护第二份 reducer。
- 云端 `server_seq` 是跨设备权威顺序；客户端 `t` 只用于展示和诊断。同步后按 `server_seq` 重放，未确认的本机事件临时排在已确认事件之后。
- `task.done` 在 reducer 中按日期+任务去重；`reward.redeem` 按权威顺序检查余额，余额不足的并发兑换不生效；`reward.use` 用兑换事件 ID 定位，不能依赖数组下标。
- 改动任何状态字段或新增业务动作时，必须同时更新 `app.js` 的事件产生点、`growth-events.js` 的 `norm/apply` 和 `scripts/verify.js`。

## Handoff Protocol

本仓库使用 `.agent-context/handoff.md` 保存最近任务的短期状态，格式参考
`.agent-context/handoff_template.md`。

**handoff.md 是当前工作流的最新快照，不是时间顺序日志。** 每次更新都替换全文，
不要追加。完成一次对话轮次、review、文档修改或中间子任务，不代表整个任务完成，
也不得因此清空 handoff。

历史快照保存在 `.agent-context/archived/handoff_<date_range>.md`。

### 如何判断任务是否完成

* “当前任务”指用户正在推进的完整目标或连续工作流，不是单个对话轮次。
* review、方案修改、实现切片、测试修复和用户反馈通常属于同一个持续任务。
* 只有在以下任一条件满足时，才把任务标记为 `done`：
  * 用户明确表示结束、放弃或切换到无关任务；
  * 完整目标和验收条件全部达成，且不存在合理的预期后续工作。
* 如果不确定任务是否真的结束，按 ongoing task 处理，不要提前归档或清空。

### Starting work

* Read `.agent-context/handoff.md` if it exists and the task appears to continue previous work.
* Treat `handoff.md` as current task state, not permanent project rules.
* Separate confirmed facts from assumptions before continuing.
* 如果 handoff 记录的是已完成任务，而用户开始了无关的新任务，先归档旧快照，再用新任务快照替换 handoff；归档和替换应在同一次操作中完成。

### Updating handoff

Update `.agent-context/handoff.md` before yielding control back to the user when
meaningful progress was made.

**How to update — the replace-not-append rule:**

* **Ongoing task**: Replace the file content with an updated snapshot following the
  template structure. Keep only the latest state — discard stale details.
* **Ready for review / paused / blocked**: Keep the latest substantive snapshot in
  `handoff.md` and set the corresponding status. Do not replace it with an empty skeleton.
* **Task completed**: Replace `handoff.md` with a final snapshot whose status is
  `done`. Do not immediately archive or clear it.
* **Starting a new unrelated task after completion**: Archive the previous `done`
  snapshot to `.agent-context/archived/handoff_<date_range>.md`, then replace
  `handoff.md` with the new active task snapshot.
* **File too long (> ~80 lines)**: Trim older sections. If all sections are still
  relevant, archive the oldest completed task block and keep the rest.

`handoff.md` 通常不应为空。空模板只允许出现在仓库尚未开始任何任务时，或归档旧任务并在同一次操作中写入新快照的极短过渡阶段。

Meaningful progress includes:

* changed files
* completed investigation
* completed implementation
* ran tests or checks
* found a blocker
* changed task scope
* discovered an important fact
* identified remaining risks
* received an explicit pause, stop, checkpoint, or handoff request

Do not update the handoff after every minor edit or command. Prefer concise checkpoint updates.