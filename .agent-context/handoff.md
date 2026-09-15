# Agent Handoff

## Task
上线前安全加固收尾（承接 ChatGPT 已完成的 `security/hardening-v1` 核心实现）：推进缓存版本、奖励日期 defense-in-depth escape、主回归接入安全测试、文档与验证。

## Current status
- Status: ready_for_review
- Last agent: opencode (GLM)
- Branch: `security/hardening-v1`（已 commit + push，未 merge PR #2）

## 本轮完成
- [x] `dist/index.html`：7 个核心资源 `?v=16` → `?v=17`
- [x] `dist/auth.js`：`cloudbase.esm.js?v=16` → `?v=17`（verify.js 要求与 APP_ASSET_V 一致，必须同步）
- [x] `dist/sw.js`：`growth-v15` → `growth-v16`（其余 SW 逻辑未动）
- [x] `dist/app.js`：奖励券历史日期渲染 `${r.date}` → `${esc(r.date)}`（仅此一处，未做其他重构）
- [x] `scripts/verify.js`：`APP_ASSET_V=17`、`SW_CACHE_V='growth-v16'`；在 `== 快速回归 ==` 后新增 `== 安全回归 ==` 段，通过 `execFileSync` 执行 `scripts/verify-security.js`，失败计入 failures
- [x] `AGENTS.md`：回归命令补充 `node scripts/verify-security.js`；新空库用 `cloud/schema-v3.sql`、已有库用 `cloud/migrations/2026-09-15-security-hardening.sql`；注明两个 schema 会 DROP 表、已有数据只能跑 migrations

## 测试结果（全部通过）
- `node scripts/verify-security.js` → **SECURITY_ALL_PASS**（15项：恶意 reward.date 丢弃、非法日期/任务、done/mood 白名单、字符串/数值边界、伪造事件 replay 忽略、DB 迁移关键约束）
- `node scripts/verify-history.js` → **ALL_PASS**（10项）
- `node scripts/verify.js` → **ALL_PASS**（含 growth-events/app/auth/config/sw 语法检查、备份恢复/徽章/大满贯/夜间/飞星/合并桩测试、成长足迹回归、**安全回归（SECURITY_ALL_PASS 内嵌）**、V2 本地账本、云同步 4 场景、SW 缓存、事件账本）
- 6 个 dist 文件 `node --check` 全部通过

## 恶意备份测试结果
Node 桩环境（同 verify.js harness）恢复恶意备份 JSON（reward.date = `<img src=x onerror=alert(1)>`）：
- **SMOKE_MALICIOUS_PASS**：未触发 alert；恶意 reward 记录不进入状态（`GrowthEvents.norm` 丢弃）；其余合法字段正常保留；奖励屋渲染日期已转义

## 浏览器 smoke test 结果说明
- 本地环境无浏览器自动化工具，交互式 UI 冒烟（导出/恢复/奖励屋/足迹/任务/兑换/家长设置/刷新）通过以下两层覆盖：
  1. verify.js 的桩测试（家长面板备份导出/恢复、restore 非法输入不动数据、完成任务加分、兑换余额、家长设置写入、localStorage 持久化）均 PASS；
  2. `python -m http.server 8080 -d dist` 启动正常，index.html / app.js 均返回 200。
- 上线合入前建议真机再点一遍关键路径（尤其奖励券日期为转义文本）。

## 未完成 / 后续
- CloudBase 控制台手动步骤（本地无法执行）：已有数据库执行 `cloud/migrations/2026-09-15-security-hardening.sql`；全新空库才可用 `cloud/schema-v3.sql`，不要两个都跑。
- 生产控制台 checklist（安全来源、短信限频、HTTPS）见 SECURITY.md，仍未动。
- PR #2 未 merge，等待 review。

## Product/security boundaries
- `1234` PIN 仅防误触，不是认证密码
- `envId` 可公开；前端禁止 SecretId/SecretKey/service_role/数据库密码
- 浏览器不可信；账号隔离依赖 Auth + RLS，事件完整性依赖 client validation + DB trigger
