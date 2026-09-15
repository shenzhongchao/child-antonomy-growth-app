# Agent Handoff

## Task
优化家长区云端同步 UX：验证码发送成功后提供面板内可见反馈和重发倒计时；将用户可见的“记录保护 / 自动保护 / 保护记录”统一改成常见的“云端同步 / 自动同步 / 已同步到云端”表达，不修改同步架构。

## Current status
- Status: blocked
- Last agent: ChatGPT
- Branch: `ux/cloud-sync-feedback`
- Base: `main@9408dd14c954f4845d49e453093d7f607a4ed2ee`

## ChatGPT 已完成
- [x] `dist/auth.js`
  - 用户可见同步状态改为：尚未开启云端同步 / 正在同步到云端 / 已同步到云端 / 等待同步。
  - 登录按钮改为“开启云端同步”。
  - 验证码发送不再只依赖 toast：面板内新增 `clCodeStatus`，成功显示脱敏手机号。
  - 获取验证码按钮状态：发送中… → 重新发送（60s） → 重新发送验证码。
  - 倒计时只更新按钮/状态节点，不重绘手机号和验证码输入框，避免输入被清空。
  - SDK 资源 query 已推进为 `cloudbase.esm.js?v=18`。
- [x] `dist/index.html`：7 个核心资源 `?v=17 → ?v=18`。
- [x] `dist/sw.js`：`growth-v16 → growth-v17`。

## Product decisions
- 家长区 section 标题：`☁️ 云端同步`
- 未登录说明：绑定家长手机号后，记录自动同步到云端；同手机号可在其他设备恢复；孩子不用登录。
- 保持 local-first、后台自动同步、一个家长账号一个孩子、无“立即同步”按钮。

## Local Agent must finish
1. `dist/app.js`
   - `<summary>🛡️ 记录保护</summary>` → `<summary>☁️ 云端同步</summary>`
   - 文件恢复已绑定提示：`已开启自动保护，请直接从云端恢复` → `已开启云端同步，记录会自动从云端恢复`
   - 使用说明中“记录保护”统一为“云端同步”
   - `一个家长账号只保护一个孩子的记录` → `一个家长账号只同步一个孩子的记录`
   - 只改这些文案，不重构 app.js。
2. `scripts/verify.js`
   - `APP_ASSET_V = 18`
   - `SW_CACHE_V = 'growth-v17'`
   - 增加验证码 UX 回归：发送成功后 `clCodeStatus` 有可见文案，按钮 disabled 且显示重发倒计时。
   - 增加文案回归：家长区不再出现 `记录保护` / `自动保护` / `保护记录`。
3. 全量验证：
   - `node --check dist/app.js dist/auth.js dist/history.js dist/growth-events.js dist/sw.js dist/config.js`
   - `node scripts/verify-security.js`
   - `node scripts/verify-history.js`
   - `node scripts/verify.js`
4. 浏览器 smoke：家长区标题、获取验证码成功反馈、60 秒倒计时、验证码输入不被倒计时清空、登录后“已同步到云端”。
5. 完成后更新本 handoff 为 `ready_for_review`，commit/push 到同一分支，不要 merge。

## Version discipline
本任务最终版本固定为：
- `?v=18`
- `growth-v17`
- `scripts/verify.js` 对应断言必须同步
