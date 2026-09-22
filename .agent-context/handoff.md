# Agent Handoff

## Task
重构家长入口为分层「家长中心」：首屏尽早说明不登录也能用、建议登录长期保存，并提供 PWA 安装引导；把孩子设置、奖励、技能、偏好和数据维护拆到二级模块。
**该功能已合并进 `main` 并部署上线。**

## Current status
- Status: done
- Last agent: 小布
- Branch: `main`（功能分支 `feat/parent-center-restructure` 已合入）
- Merge commit: `9a887e8`
- Base 之前: `d3a9bd6`

## Delivered
- 家长入口改名为「家长中心」，去掉齿轮式“设置页”心智。
- 家长中心首屏优先说明：不登录也能用（记录保存在当前设备）；建议登录并开启云端同步以长期保存/换设备恢复；孩子无需登录，断网仍可用。
- 云端同步登录默认只展示「登录并开启云端同步」CTA，点击后才展开手机号 / 验证码表单。
- 新增 `dist/pwa.js`：按 standalone / 微信 / iOS / Android / `beforeinstallprompt` 动态展示安装到手机桌面的指引。
- PIN `1234` 从家长总入口下沉到会修改内容的二级模块前，仍仅用于防误触。
- 二级模块拆分为：孩子与成长 / 奖励规则 / 技能管理 / 使用偏好 / 记录与数据。
- 退出家长账号移入受 PIN 保护的「记录与数据」；已绑定云端账号时继续隐藏文件恢复。
- `scripts/verify.js` 新增家长中心层级、PIN 下沉、折叠登录、PWA 资源版本与既有备份恢复的回归覆盖。
- 资源版本推进为 `?v=19`；Service Worker Cache Storage 推进为 `growth-v18`，并预缓存 `pwa.js`。
- 更新 `AGENTS.md` 的家长中心和 PWA 架构说明。

## Validation
- `node scripts/verify.js`：**ALL_PASS**（208 行，含 verify-history / verify-security）。
- 核心 JS `node --check`：PASS（含新增 `pwa.js`）。
- 打包 `python scripts/pack-web.py`：`release/today-i-control-pwa.zip` 21 文件 / 1,170,387 B，`index.html` 在根。

## Deployment（2026-09-22 20:05）
- 部署方式：MCP `manageHosting(action="upload", localPath=dist, cloudPath="/")`。
  ⚠️ 其返回 `totalFiles: 1` 是误导字段，实际用 `queryHosting(action="listFiles")` 复核确认 **21 个文件全部到位**（时间戳 12:05:42Z）。
- 线上 `https://today.itonghao.cn` 核对：11 个关键资源本地/线上字节数逐一对上
  （app.js 37265 / styles.css 40201 / index.html 2097 / pwa.js 3061 / sw.js 3874）；
  `index.html` 内 `?v=19` × 8、`?v=18` × 0；含「家长中心」与 `pwa.js?v=19`；
  `sw.js` = `growth-v18` 且预缓存含 `./pwa.js`。

## Product boundaries preserved
- local-first；孩子无需登录；断网不阻断使用。
- 一个家长账号只对应一个孩子。
- 云端后台自动同步，不新增“立即同步”按钮。
- PIN 仅防误触，不作为安全机制。

## Follow-ups
- 手机端 PWA 实机自检待用户确认：四页面可用 / 家长中心分层与 PIN 下沉 / 安装引导（iOS 与安卓各测一次）/ 完成挑战加分且不可重复 / 云同步跑通（表权限刚收窄过）。
- 免费 SSL 证书 `b01svyHU` **2026-12-21 到期**，届时重新申请并换绑。
- 远端仍有分支 `feat/parent-center-restructure` 未删除，可按需清理。

## Version discipline
后续只要修改 `dist/` 中任何 HTML/CSS/JS：
- 资源 query 必须从 `?v=19` 继续递增，绝不复用历史版本号；
- `dist/sw.js` 的 `VERSION` 必须从 `growth-v18` 继续递增；
- 同步更新 `scripts/verify.js` 中版本断言。
