# Agent Handoff

## Task
优化家长区云端同步 UX：验证码发送成功后提供面板内可见反馈和重发倒计时；将用户可见的“记录保护 / 自动保护 / 保护记录”统一改成常见的“云端同步 / 自动同步 / 已同步到云端”表达，不修改同步架构。

## Current status
- Status: in_progress
- Last agent: ChatGPT
- Branch: `ux/cloud-sync-feedback`
- Base: `main@9408dd14c954f4845d49e453093d7f607a4ed2ee`

## Product decisions
- 家长区 section 标题：`☁️ 云端同步`
- 未登录说明：绑定家长手机号后，记录自动同步到云端；同手机号可在其他设备恢复；孩子不用登录。
- 状态文案使用：尚未开启云端同步 / 正在同步到云端 / 已同步到云端 / 等待同步。
- 登录按钮：`开启云端同步`
- 验证码成功后必须在当前面板内显示确认信息，不能只依赖 toast。
- 验证码按钮：发送中 → 已发送并显示 60 秒重发倒计时；成功文案显示脱敏手机号。
- 保持 local-first、后台自动同步、一个家长账号一个孩子、无“立即同步”按钮。

## Required changes
- `dist/auth.js`：验证码可见反馈 + 倒计时 + 云端同步文案统一。
- `dist/app.js`：家长面板 summary、文件恢复提示、使用说明中的“记录保护”统一为“云端同步”。
- 因修改 dist：资源 query `?v=17 → ?v=18`；SW `growth-v16 → growth-v17`；同步更新 `scripts/verify.js`。
- 补回归：验证发送验证码后面板显示反馈/倒计时，且用户可见文案不再出现“记录保护/自动保护/保护记录”。

## Validation required
- `node --check`：app/auth/history/growth-events/sw/config
- `node scripts/verify-security.js`
- `node scripts/verify-history.js`
- `node scripts/verify.js`
- 浏览器 smoke：家长区、验证码发送反馈、倒计时、登录、正常同步状态。

## Version discipline
本任务修改 dist，完成时必须为：
- `?v=18`
- `growth-v17`
- `scripts/verify.js` 对应断言同步更新
