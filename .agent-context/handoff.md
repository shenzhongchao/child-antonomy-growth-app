# Agent Handoff

## Task
奖励券核销入口与奖励屋列表精简。

## Current status
- Status: ready_for_review
- Last agent: Codex
- Branch: main
- 本地完成，未提交、推送或部署。

## Goal / acceptance criteria
- [x] 奖励券提供家长核销入口，保留 1234 防误触。
- [x] 已核销券从奖励屋与家长待核销列表隐藏；原始账本记录保留。
- [x] 移除奖励屋「我的小心愿」列表和重复许愿按钮，保留引导卡和审批功能。
- [x] node scripts/verify.js ALL_PASS；git diff --check 通过。

## Files touched
- dist/app.js：待用券过滤、核销入口、核销反馈、移除心愿列表及修正文案。
- dist/index.html / dist/auth.js：资源版本 v26。
- dist/sw.js：缓存 growth-v25。
- scripts/verify.js：同步版本断言，增加固定/自定义券核销、重复保护、家长门禁和页面列表回归。

## Confirmed facts
- 原有 reward.use 已支持核销，原入口位于家长中心奖励规则；复用原事件，不新增状态。
- 心愿列表原来显示审批状态；删除后奖励屋不再展示审批状态，仍可提议且家长可审批。
- 旧发布快照保存在 archived/handoff_2026-10-12_release-v1.0.0.md。

## Hypotheses / uncertain points
- 本轮没有进行真实浏览器或手机实测；回归为现有 Node 桩测试和纯逻辑检查。

## Next steps
- 用户审阅；按后续明确指令提交、推送或部署。
