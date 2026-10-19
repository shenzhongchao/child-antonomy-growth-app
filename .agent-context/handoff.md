# Agent Handoff

## Task
奖励券核销体验修正：当前券独立弹窗，不跳转家长设置。

## Current status
- Status: in_progress
- Last agent: Codex
- Branch: main
- 本地实现与浏览器实测完成，正在按此前授权提交、推送、部署。

## Goal / acceptance criteria
- [x] 点击当前券「请家长核销」直接打开专属弹窗，展示券名与兑换日期。
- [x] 在弹窗输入 1234 并确认已使用；关闭后仍停留在奖励屋。
- [x] 按兑换事件 ID 定位，避免同步重排后核销错券；取消、错误 PIN、重复提交不写事件。
- [x] 复用 reward.use，保留账本、不重复扣星、不解锁家长设置。
- [x] node scripts/verify.js ALL_PASS；git diff --check 通过。
- [ ] 提交推送、部署与线上文件比对。

## Files touched
- dist/app.js：rewardUseModal / confirmCouponUse，弹窗目标 ID 随打开其他弹窗或关闭清空。
- dist/index.html / dist/auth.js：资源 v27。
- dist/sw.js：growth-v26。
- scripts/verify.js：独立核销、取消、错误 PIN、同步重排/已使用、重复提交、自定义券回归。

## Confirmed facts
- Playwright 实际点击：奖励屋兑换固定券 → 请家长核销 → 专属弹窗 → 0000 被拒 → 1234 确认 → 券消失、弹窗关闭、仍在奖励屋。
- 本地独立浏览器测试，人工注入 30 星测试余额；兑换后 25 星，核销后仍为 25 星，存储 used=true。
- 浏览器无 JS 错误，仅密码输入框不在 form 内的 verbose 提示。
- pack-web.py：21 文件，ZIP 根目录校验通过。

## Hypotheses / uncertain points
- 未实测手机或跨设备同步；同步重排与已使用保护已有桩测试。

## Next steps
- 提交推送与 CloudBase 部署，然后逐字节核验正式域名文件。
