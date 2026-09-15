# Agent Handoff

## Task
执行上线前安全加固：修复备份输入导致的存储型 XSS 风险；对成长事件做客户端白名单/边界校验；在 PostgreSQL 层增加服务端事件校验并限制 `state.import` 只能作为首条初始化基线；补安全回归与上线安全清单。

## Current status
- Status: blocked
- Last agent: ChatGPT
- Branch: `security/hardening-v1`
- Base: `main@58e7f1c24d0214645a082a4e0e392076595ef5fd`

## ChatGPT 已完成
- [x] `dist/growth-events.js`
  - `norm()` 严格清洗日期、task/reward id、mood、name/note、计数、价格、奖励记录等
  - 新增 `validEvent()`，`replay/advance/apply` 忽略不合法事件
  - 恶意备份中的非法 `reward.date` 不再进入状态，从数据层封住已发现的存储型 XSS 路径
- [x] `cloud/migrations/2026-09-15-security-hardening.sql`
  - 普通事件 payload 上限 8 KiB；state.import 上限 512 KiB
  - 事件 type/字段白名单与范围校验
  - profile 级 `pg_advisory_xact_lock`
  - `state.import` 仅允许 profile 第一条事件，避免晚到 import 重置已有账本
- [x] `cloud/schema-v3.sql`
  - 新空环境安全 bootstrap（包含 RLS + 事件校验 trigger）
  - 顶部明确标记为破坏性，仅限全新空环境
- [x] `scripts/verify-security.js`
  - 覆盖恶意 reward.date、非法日期/任务、超长 note、非法价格、伪造 task.done 以及 SQL migration 关键约束
  - ChatGPT 本地等价代码执行结果：`SECURITY_ALL_PASS`
- [x] `SECURITY.md`
  - 生产安全边界、数据库迁移、安全来源、短信限频、HTTPS、PIN 边界、小程序禁上线说明
- [x] 已归档上一任务 handoff

## Blocker / local Agent must finish
当前修改了 `dist/growth-events.js`，但资源缓存版本尚未推进；另外主 `scripts/verify.js` 还没接入安全回归。合并前必须完成：

1. `dist/index.html`
   - 所有当前 `?v=16` 核心资源统一推进到 `?v=17`
2. `dist/sw.js`
   - `growth-v15` → `growth-v16`
3. `scripts/verify.js`
   - `APP_ASSET_V = 17`
   - `SW_CACHE_V = 'growth-v16'`
   - 在主流程执行 `scripts/verify-security.js`，失败必须计入 failures
4. `dist/app.js`
   - 奖励券历史日期渲染从 `${r.date}` 改为 `${esc(r.date)}`，作为 defense-in-depth；不要改其他业务逻辑
5. `AGENTS.md`
   - 回归命令补充 `node scripts/verify-security.js`
   - 新环境完整 SQL 改为 `cloud/schema-v3.sql`
   - 已有环境安全迁移指向 `cloud/migrations/2026-09-15-security-hardening.sql`
6. 运行：
   - `node --check dist/growth-events.js dist/app.js dist/auth.js dist/history.js dist/sw.js`
   - `node scripts/verify-security.js`
   - `node scripts/verify-history.js`
   - `node scripts/verify.js`
   - 必须全部 PASS
7. 浏览器 smoke test：恢复正常备份、奖励屋/历史页、正常完成任务/兑换，确认无回归
8. 更新本 handoff → `ready_for_review`，commit/push 同一分支，不要 merge

## CloudBase console manual step (cannot be executed by ChatGPT)
在当前已有数据库环境的 SQL 编辑器执行：
`cloud/migrations/2026-09-15-security-hardening.sql`

执行后再做一次真实手机号登录 + 正常 task.done 同步；若环境是全新空库则直接用 `cloud/schema-v3.sql`，不要两个都跑。

## Production console checklist
- 安全来源只允许正式精确域名 + 必要开发域名，不添加无关通配符
- 短信验证码每日单手机号上限设置为 5–10 条/天，保留平台频率限制/Captcha
- 正式域名只用 HTTPS
- `cloud/phone-login/` 仍是二期未联调脚手架，不部署生产

## Product/security boundaries
- `1234` PIN 仅防误触，不是认证密码
- `envId` 可公开；前端禁止 SecretId/SecretKey/service_role/数据库密码
- 浏览器不可信；账号隔离依赖 Auth + RLS，事件完整性依赖 client validation + DB trigger
