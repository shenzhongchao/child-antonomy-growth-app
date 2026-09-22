# Agent Handoff

## Task
重构家长入口为分层「家长中心」：首屏尽早说明不登录也能用、建议登录长期保存，并提供 PWA 安装引导；把孩子设置、奖励、技能、偏好和数据维护拆到二级模块。

## Current status
- Status: ready for validation
- Last agent: ChatGPT
- Branch: `feat/parent-center-restructure`
- Base: `main@d3a9bd6`
- Related issue/PR: 待创建

## Implemented
- 家长入口改名「家长中心」，移除齿轮式“设置页”心智。
- 家长中心首屏新增：
  - 「不登录也能用」local-first 说明；
  - 云端同步登录区（无需 PIN）；
  - PWA 安装/主屏幕引导（无需 PIN，按 standalone / 微信 / iOS / Android / beforeinstallprompt 动态展示）。
- PIN `1234` 从总入口下沉到会修改内容的二级模块前，仍仅用于防误触。
- 二级模块：孩子与成长 / 奖励规则 / 技能管理 / 使用偏好 / 记录与数据。
- 登录后的退出账号移到受 PIN 保护的「记录与数据」。
- 备份恢复规则保持：已绑定云端账号时不提供文件恢复。
- 版本推进：资源 `?v=19`；Service Worker `growth-v18`；新增 `dist/pwa.js` 进入预缓存。
- `scripts/verify.js` 已补家长中心结构、PIN 下沉、备份恢复回归用例。

## Validation pending
- `node --check` 与 `node scripts/verify.js` 待在分支代码上执行。
- 通过后创建 PR，并根据结果决定是否合并。

## Product boundaries preserved
- local-first；孩子无需登录；断网不阻断使用。
- 一个家长账号只对应一个孩子。
- 云端后台自动同步，不新增“立即同步”按钮。
- PIN 仅防误触，不作为安全机制。
