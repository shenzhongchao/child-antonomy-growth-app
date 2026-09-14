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

## 架构（单应用文件）

- `dist/app.js` (~20KB, 65 行，行很长)：全局状态 `s` 从 localStorage 键 `self-growth-v1` 加载；`save()` 持久化该状态；`render()` 通过字符串模板和内联 `onclick` 处理程序重新渲染整个四页面 UI（今天/计划/成长/奖励）。

## 强约束与易踩坑点

- 保持数据兼容性：基于键名 `self-growth-v1` 和由 `blank()` 定义的现有结构 (`days/stars/counts/rewards/name/goal/graduated/prices`)——真实的儿童记录依赖于此；没有迁移机制，请勿重命名或重构字段。
- `dist/growth-art.webp` 是 CSS 雪碧图：`styles.css` 用 `background-size: 738.5px 1043.7px` 配合绝对像素 `background-position` 定位书包/图书/闹钟等图标，**它的像素尺寸不能改**，否则所有图标错位。`scripts/optimize-images.py` 已固定按原尺寸转换它。改过图片后务必肉眼核对首页与任务卡上的图标。
- 通过 PowerShell 读取文件时，请显式指定 `-Encoding UTF8`；文件为 UTF-8 编码，PS 5.1 控制台中显示的乱码仅仅是控制台显示问题（已使用 `node --check dist/app.js` 验证）。
- 编辑前请先运行 Node 语法检查：`node --check dist/app.js`。由于行很长，编辑时切勿使用贪心的全文匹配方式（即避免容易误匹配的多行编辑）。
- 家长面板 PIN 码为 1234——仅用于防误触，并非安全机制。需保留此行为。
- 回归验证：`node scripts/verify.js`（语法检查 + 桩测试，含 `auth.js` 的多孩子档案用例）。改完 `dist/` 后必须跑一遍，全绿再提交。手动验证仍可运行服务器，检查四个页面 + 家长面板，并确认完成任务时会加分（重复完成会被阻止）。
- 改过 `dist/` 里任何 HTML/CSS/JS 后，务必把 `dist/sw.js` 顶部的 `VERSION` 加一，否则老用户浏览器的 Service Worker 缓存不会刷新。
- 线上域名与 `localhost` 是互不相通的存储源；网页端数据只存在浏览器本地，家长面板的「备份与恢复」是唯一的迁移手段（已登录云端账号时除外，见下）。

## 云端账号与同步（CloudBase）

- Web 应用的云端能力在 `dist/auth.js`（账号/同步/多孩子档案）+ `dist/config.js`（只填 envId）里。`app.js` 里只有两处钩子：`save()` 末尾调用 `Cloud.markDirty()`，`render()` 末尾调用 `whoChip()`（顶部「当前是谁」胶囊，只在 ≥2 个档案时显示，档案清单由 `Cloud.kids()` 提供）。**不要**把登录或云存储逻辑塞进 `app.js`；`auth.js` 需要重绘孩子界面时走 `window.render()`（本文件内同名函数会遮蔽它，见 `paintApp()`）。
- 原则：本地优先、永不打扰。`localStorage` 的 `self-growth-v1` 是孩子正在用的数据，云端只是备份；未配置 envId / 未登录 / 断网 / 报错时一律静默降级，不弹错打断孩子。
- 同步粒度是**整包**：云端 **PostgreSQL** `profiles` 表里每一行 = 一个孩子档案，`state` 字段（jsonb）原样存 `blank()` 的结构，不改名不拆分。冲突走 last-write-wins，判不出新旧时弹窗让家长选（选「留本机」会把云端那份另存为 `xxx_old`）。
- **本环境是 PG 模式，文档型数据库实测不可用**（`tcb db nosql execute` 取不到 Mongo 连接器，控制台无「新建集合」入口）—— 别再照官方文档想当然。`auth.js` 的数据层用 `app.rdb().from('profiles')`（PostgREST 风格，返回 `{data, error}`），字段映射集中在 `rowOf()` / `writeProfile()` 里：表列 `id/user_id/name/phone/state/updated_at` ↔ 上层沿用的 `_id/userId/.../updatedAt`。改数据层不要动上层命名。
- `dist/cloudbase.esm.js` 是**内置的、真正自包含的** CloudBase JS SDK v3.9.3（785KB，用 esbuild 把 `@cloudbase/js-sdk` 连同依赖一起 bundle 成单文件 ESM，`export default`）。不要手改。
  ⚠️ **不要**再用 jsdelivr 的 `+esm` 产物覆盖它：那个文件开头有 8 条 `import * as X from "/npm/<pkg>@<ver>/+esm"` 的**根相对路径**，只有在 `cdn.jsdelivr.net` 域名下才解析得通，放到自有域名或 localhost 上必然 404（2026-09-14 踩过这个坑，此前的「自带依赖、无外部引用」说法是错的）。
  重新生成：临时目录 `npm i @cloudbase/js-sdk@<版本> esbuild`，入口文件写 `import cb from '@cloudbase/js-sdk'; export default cb;`，再 `esbuild --bundle --format=esm --minify --target=es2019`。生成后用 `grep -c '/npm/'` 确认结果为 0。
  它只在真正用到云端时才被动态 `import()` 加载（URL 带 `?v=` 防止 Service Worker 缓存旧版），不进首屏。
- 它是平铺在 `dist/` 根目录的，因为 `scripts/pack-web.py` **只收顶层文件且禁止嵌套目录**（EdgeOne 要求 index.html 在压缩包最外层）。别把它挪进子目录，否则打不进 ZIP。
- 家长面板 →「👧 孩子档案」是档案的唯一入口（改名 / 列表 / 切换 / 添加），不依赖登录；「☁️ 云端备份」只管登录与同步状态。孩子不登录。
- 登录 API 用的是 `auth.getVerification({phone_number})` + `auth.signInWithSms({verificationInfo, verificationCode, phoneNum})`（手机号要带 `+86 ` 前缀）。控制台开通步骤、数据库安全规则见 `CLOUD.md`。
- `cloud/phone-login/` 是**二期**小程序手机号登录的云函数脚手架，尚未联调。上小程序时要解决两端 uid 对齐问题（Web 短信登录 uid ≠ 自定义登录 uid），方案见 `CLOUD.md` 第五节。

## 多个孩子（一台设备）

- **本机同时只有一份活动数据**：`self-growth-v1` 永远是「正在用的那个孩子」；其余孩子的记录缓存在 `self-growth-archive-v1`（`{ [档案id]: { name, state, updatedAt } }`），由 `auth.js` 的 `keep()` 维护。**两份数据的 state 结构完全一致**，都来自 `blank()`。
- 档案清单 = 本机缓存 ∪ 云端返回（`kids()`）；当前那份以本机内容为准（昵称可能刚改过）。有 ≥2 份时顶部出现胶囊，点开就是孩子端的「今天是谁呀？」（`openKidPicker()`，不需要家长 PIN）。
- **换孩子前必须先 `push()` 成功**（`guardLocal()`）。上传失败要在弹窗里让家长选「再试一次 / 不等了直接继续 / 先不换了」，绝不静默用云端那份覆盖本机。`switchChild()` / `addChild()` 都走这条路径，新增类似动作时也要走。
- 未配置 envId 时也能多孩子（纯本机档案），此时 `guardLocal()` 直接放行 —— 别让它去 `import()` 那个 785KB 的 SDK。
- 云端 `profiles` 一行 = 一个孩子；`listProfiles()` 按 `user_id` 取，`switchChild` 切换的是 `meta.profileId`。
