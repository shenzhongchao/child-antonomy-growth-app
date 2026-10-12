# Agent Handoff

## Task
新功能「小心愿」（愿望池 + 孩子发起任务）：孩子可主动提议想要的奖励 / 想挑战的事，家长在 PIN 保护的「💌 小心愿」模块审批、定价后上架。方案：`docs/feature-wish-pool.md`。

## Current status
- Status: deployed（代码 `ba2e461` 已推送；云函数白名单已生效；`dist/` 已部署到静态托管根目录，自定义域名已校验）
- Last agent: 小布
- Branch: `main`（与 origin/main 同步）

## 已交付
- PR1（事件层）：`dist/growth-events.js` 新增 wishes/customCounts/day.customDone + 5 个新事件（wish.propose / wish.decide / custom.done / reward.custom.redeem / wish.retire）；`cloud/migrations/2026-10-12-wish-pool.sql` + `schema-v3.sql` 同步。
- PR2（UI）：孩子侧「我的小心愿」+ 两步许愿 modal、自定义挑战/奖励卡、成长页「我的专属练习」；家长侧待审批提示 + PIN 模块（批准/定价/婉拒/下架）。
- 回归：`node scripts/verify.js` ALL_PASS（语法 + 家长中心 + 徽章 + 大满贯 + 夜间 + 星滚 + 增量合并 + 小心愿 + 历史 + 安全 + 本地账本 + 云同步 + SW 缓存 + 事件账本）。
- 版本：资源 `?v=21`，SW Cache Storage `growth-v20`。

## 本次部署结果（2026-10-12）
1. 云函数白名单：线上 `public.validate_growth_event_v1()` 实测已含全部 5 个新事件类型（`wish.propose / wish.decide / custom.done / reward.custom.redeem / wish.retire`）+ pick 支持 `w_` 前缀 → **migration 已生效，无需再跑**。
2. 静态托管：`tcb hosting deploy dist -e itonghao-d5gv3zqpl9f36e109` → 21 个文件上传到根目录 `/`。
3. 线上复核（Node fetch，no-cache）：
   - `today.itonghao.cn/index.html` 2097 B、`?v=21` × 8、无旧版本号
   - `sw.js` 3874 B、VERSION=`growth-v20`
   - `app.js` 48262 / `growth-events.js` 16400 / `history.js` 16866 / `styles.css` 41046（与本地逐字节一致）
   - 默认域名同版本，一致。
4. 本地 `dist/` 全量 MD5 已与线上 `today/` 目录比对 → 逐文件相同（见下条）。

## 已完成的清理：线上 `today/` 冗余目录
静态托管里曾有 `today/` 前缀目录（21 个文件，2026-10-12 14:07:55 上传，MD5 与本版 dist 完全相同），
是此前某次部署把 `cloudPath` 写成 `/today/` 的产物，**不是正式入口**。
已用 `tcb hosting delete today --dir --yes` 删除，托管文件数 49 → 28。
复核：`/today/` 与 `/today/app.js` 均返回 404；`/` 仍 200、2097 B、`?v=21` × 8；`/app.js` 48262 B。

## Next steps
1. 手机端实机自检：`docs/pwa-device-checklist.md` 第 5.5 节（小心愿）。
2. 沿用提醒：SSL 证书 2026-12-21 到期需换绑。

## 产品边界（保持不变）
- local-first；孩子无需登录；历史只读；PIN 仅防误触；一个家长账号只对应一个孩子。
- 自定义挑战无徽章等级，只做次数陈述；愿望不产生打卡/排行榜/评分。
- 已接受风险：新旧版本混用时旧客户端丢弃新事件可能状态分叉，恢复路径为清本地重新登录全量重放。
