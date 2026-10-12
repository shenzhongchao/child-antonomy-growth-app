# Agent Handoff

## Task
新功能「小心愿」（愿望池 + 孩子发起任务）：孩子可主动提议想要的奖励 / 想挑战的事，家长在 PIN 保护的「💌 小心愿」模块审批、定价后上架。方案：`docs/feature-wish-pool.md`。

## Current status
- Status: in_progress（代码全部完成并回归通过；**尚未提交 git、未执行云端 migration、未部署**）
- Last agent: 小布
- Branch: `main`（工作区有未提交改动）

## 已交付
- PR1（事件层）：`dist/growth-events.js` 新增 wishes/customCounts/day.customDone + 5 个新事件（wish.propose / wish.decide / custom.done / reward.custom.redeem / wish.retire）；`cloud/migrations/2026-10-12-wish-pool.sql` + `schema-v3.sql` 同步（函数体已 diff 确认一致）。
- PR2（UI）：
  - 孩子侧：奖励屋「我的小心愿」区块 + 两步许愿 modal；选挑战弹窗接入已批准自定义挑战（标「我自己想练的」）；自定义奖励卡片进奖励屋网格；完成流程复用二选一（self +1 星）；成长页「我的专属练习」区块（只显示累计次数，无徽章/进度条）。
  - 家长侧：家长中心首屏待审批提示（无需 PIN）+「💌 小心愿」PIN 模块（批准/定价/婉拒/下架/重新上架）；奖励规则页兼容自定义券名称。
  - `pick` 事件扩展：`selected` 允许数字 0–5 与 `w_` 字符串混合（events + 云端 trigger 同步）。
  - `dist/history.js`：daySummary/trend/openDay 计入 customDone，趋势聚合「我的专属练习」行，自定义券显示愿望标题；措辞遵守只陈述口径。
  - `dist/styles.css` 追加小心愿相关样式（.custom-art/.choice-tag/.parent-wish-row 等，含夜间模式）。
- 回归：verify.js 新增小心愿 UI 桩测试 + 事件层 16 组用例；verify-history.js / verify-security.js 同步扩展。`node scripts/verify.js` ALL_PASS（239 项 ok）。
- 版本：资源 `?v=21`，SW `growth-v20`；打包 `release/today-i-control-pwa.zip` 正常（index.html 在根）。
- 文档：AGENTS.md（事件账本节）、CLOUD.md（事件合并规则节）、`docs/pwa-device-checklist.md`（新增 5.5 小心愿实机清单）、feature-wish-pool.md 状态更新。

## Next steps（部署顺序，勿颠倒）
1. 提交 git（建议一个 commit 或按 PR1/PR2 两个）。
2. 在 CloudBase 生产库执行 `cloud/migrations/2026-10-12-wish-pool.sql`（可重复执行，不 DROP 任何对象）——**必须先于 dist 上传**，否则新事件被服务端拒收。
3. 上传 dist（MCP manageHosting 或 pack-web.zip），线上复核 ?v=21 / growth-v20 与关键资源字节数。
4. 手机端实机自检：`docs/pwa-device-checklist.md` 第 5.5 节。
5. 沿用提醒：SSL 证书 2026-12-21 到期需换绑。

## 产品边界（本次保持不变）
- local-first；孩子无需登录；历史只读；PIN 仅防误触；一个家长账号只对应一个孩子。
- 自定义挑战无徽章等级，只做次数陈述；愿望不产生打卡/排行榜/评分。
- 已接受风险：新旧版本混用时旧客户端丢弃新事件可能状态分叉，恢复路径为清本地重新登录全量重放。
