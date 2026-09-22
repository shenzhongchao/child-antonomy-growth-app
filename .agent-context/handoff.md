# Agent Handoff

## Task
重构家长入口为分层「家长中心」：首屏尽早说明不登录也能用、建议登录长期保存，并提供 PWA 安装引导；把孩子设置、奖励、技能、偏好和数据维护拆到二级模块。

## Current status
- Status: done
- Last agent: ChatGPT
- Branch: `feat/parent-center-restructure`
- PR: #4
- Base: `main@d3a9bd6`

## Delivered
- 家长入口改名为「家长中心」，去掉齿轮式“设置页”心智。
- 家长中心首屏优先说明：
  - 不登录也能用，未登录记录保存在当前设备；
  - 为长期保留和换设备恢复，建议家长登录并开启云端同步；
  - 孩子无需登录，断网仍可使用。
- 云端同步登录默认只展示「登录并开启云端同步」CTA，点击后才展开手机号 / 验证码表单。
- 新增 `dist/pwa.js`：按 standalone / 微信 / iOS / Android / `beforeinstallprompt` 动态展示安装到手机桌面的指引。
- PIN `1234` 从家长总入口下沉到会修改内容的二级模块前，仍仅用于防误触。
- 二级模块拆分为：孩子与成长 / 奖励规则 / 技能管理 / 使用偏好 / 记录与数据。
- 退出家长账号移入受 PIN 保护的「记录与数据」；已绑定云端账号时继续隐藏文件恢复。
- `scripts/verify.js` 新增家长中心层级、PIN 下沉、折叠登录、PWA 资源版本与既有备份恢复的回归覆盖。
- 资源版本推进为 `?v=19`；Service Worker Cache Storage 推进为 `growth-v18`，并预缓存 `pwa.js`。
- 更新 `AGENTS.md` 的家长中心和 PWA 架构说明。

## Validation
- GitHub Actions 临时验证运行 `node scripts/verify.js`：**ALL_PASS**。
- 核心 JS `node --check`：PASS（含新增 `pwa.js`）。
- `verify-history.js`：ALL_PASS。
- `verify-security.js`：SECURITY_ALL_PASS。
- V2 本地账本、云端增量同步、验证码 UX、事件账本、Service Worker 缓存回归：PASS。
- 家长中心运行时 smoke：首屏信息层级、PIN 下沉、记录与数据页：PASS。
- PWA 多环境 smoke：iOS / Android / 微信 / standalone / 可直接安装：PASS。
- 临时 GitHub Actions workflow 已从功能分支删除，不会进入最终 `main`。

## Product boundaries preserved
- local-first；孩子无需登录；断网不阻断使用。
- 一个家长账号只对应一个孩子。
- 云端后台自动同步，不新增“立即同步”按钮。
- PIN 仅防误触，不作为安全机制。
