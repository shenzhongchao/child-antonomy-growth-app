# Agent Handoff

## Task
上线前安全加固：修复恶意备份存储型 XSS 风险；增加客户端事件白名单/边界校验；在 PostgreSQL 层增加服务端事件校验并限制 `state.import` 只能作为首条初始化基线；补安全回归与生产安全文档。

## Current status
- Status: done
- Last agent: ChatGPT
- Branch: `main`
- PR: #2（已 squash merge）
- Merge commit: `635f30fd7ffba4dea66ee1e4f2532bdef0986e7b`

## Delivered
- `dist/growth-events.js`：严格清洗备份/状态输入；新增 `validEvent()`，非法日期、越界 task/reward、非法 mood、超长文本、非法价格与伪造事件不会进入状态或重放结果。
- `dist/app.js`：奖励日期渲染增加 `esc()`，形成 defense-in-depth。
- `cloud/migrations/2026-09-15-security-hardening.sql`：已有数据库的非破坏性安全迁移，增加事件类型/字段/大小校验、profile 级 advisory lock，并限制 `state.import` 只能作为首条事件。
- `cloud/schema-v3.sql`：全新空环境安全 bootstrap（RLS + trigger）；仅限空库，禁止用于已有数据环境。
- `scripts/verify-security.js`：安全回归已接入主 `scripts/verify.js`。
- `SECURITY.md`：记录生产安全边界与控制台检查事项。
- PWA 资源版本：`?v=17`；Service Worker Cache Storage：`growth-v16`。

## Validation
- `node --check`（growth-events/app/auth/history/sw/config）：PASS
- `node scripts/verify-security.js`：`SECURITY_ALL_PASS`（15 项）
- `node scripts/verify-history.js`：`ALL_PASS`（10 项）
- `node scripts/verify.js`：`ALL_PASS`
- 恶意备份 smoke：`SMOKE_MALICIOUS_PASS`，无 alert、恶意 reward 不进入状态、页面正常
- 用户已在真实 CloudBase 数据库执行 `cloud/migrations/2026-09-15-security-hardening.sql`
- 用户已完成真实手机号登录 + 正常同步 smoke test，迁移后事件可正常上传并同步

## Production security boundaries
- `1234` PIN 仅防误触，不是认证密码。
- `envId` 可公开；前端禁止出现 SecretId / SecretKey / service_role / 数据库密码。
- 浏览器是不可信环境；账号隔离依赖 Auth + RLS，事件完整性依赖 client validation + DB trigger。
- 已有数据环境只能跑 `cloud/migrations/*`；`schema-v2.sql` / `schema-v3.sql` 都会 DROP 表，只能用于全新空环境。
- 生产控制台仍应持续保持：精确安全来源、短信限频、HTTPS；具体见 `SECURITY.md`。

## Version discipline
后续只要修改 `dist/` 中任何 HTML/CSS/JS：
- 资源 query 必须从 `?v=17` 继续递增，绝不复用历史版本号；
- `dist/sw.js` 的 `VERSION` 必须从 `growth-v16` 继续递增；
- 同步更新 `scripts/verify.js` 中版本断言。
