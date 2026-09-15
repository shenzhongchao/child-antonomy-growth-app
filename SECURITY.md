# 安全说明与上线检查

本项目是浏览器端 PWA + CloudBase PostgreSQL。**浏览器端代码始终视为不可信环境**：用户可以查看/修改前端 JS、localStorage 和请求参数，因此真正的数据隔离必须依赖 CloudBase 身份认证 + PostgreSQL RLS + 服务端事件校验。

## 已有安全边界

- `envId` 是前端公开标识，不是密钥；前端不得出现 SecretId / SecretKey / service_role 凭据 / 数据库密码。
- `profiles` 与 `growth_events` 启用 RLS；普通登录用户只能读写 `auth.uid() = user_id` 的数据。
- `growth_events` 对普通用户只有 `SELECT + INSERT`，没有 UPDATE/DELETE，保持 append-only。
- `dist/growth-events.js` 对备份状态和事件做白名单/边界清洗；非法日期、越界 task/reward、异常 mood、超长文本、非法价格不会进入投影。
- `cloud/migrations/2026-09-15-security-hardening.sql` 在数据库层再次校验事件类型/字段/大小，并用 profile 级 advisory lock 保证 `state.import` 只能作为首条初始化基线。

## 现有环境必须执行的数据库迁移

已有 `profiles/growth_events` 数据时，**只执行**：

```sql
cloud/migrations/2026-09-15-security-hardening.sql
```

该迁移不会 DROP 表，不删除历史数据，可重复执行。

不要对已有真实数据的环境再次执行 `schema-v2.sql` 或 `schema-v3.sql`，它们都是新环境 bootstrap，会 DROP 同名表。

## 新环境

全新空环境使用：

```text
cloud/schema-v3.sql
```

它包含 RLS 和服务端事件校验。仅第一次初始化空环境时使用。

## CloudBase 控制台上线检查

### 1. 安全来源

环境配置 → 安全来源：

- 添加正式线上完整域名（优先精确域名，例如 `today.example.cn`）。
- 不要为了省事添加无关通配域名。
- `localhost/127.0.0.1` 仅在需要本地开发时保留。
- 发布后确认从非白名单域名无法通过 Web SDK 调用 CloudBase。

### 2. 短信登录防滥用

身份认证 → 登录方式 → 短信验证码：

- 保留平台的单号码发送频率限制。
- 将“单手机号每日发送上限”设置为产品实际需要的较低值；本项目家庭/小规模使用建议 5–10 条/天，而不是放大额度。
- 确认触发限流后验证码/Captcha 防护正常。
- 观察短信发送量和异常峰值，避免资源被刷。

### 3. HTTPS

正式域名只使用 HTTPS；证书到期前续签。不要在 HTTP 页面启用家长登录或云同步。

## 家长 PIN 的边界

`1234` 只用于防止孩子误触，**不是身份认证，也不是安全密码**。真正的云端身份边界是手机号验证码登录 + CloudBase session + RLS。

不要把任何“只有知道 1234 才能访问”的功能当成敏感数据保护措施。

## 备份文件

备份文件属于用户可控输入。恢复时必须先经过 `GrowthEvents.norm()` 清洗；UI 渲染仍应尽量对所有文本执行 HTML escape，避免未来新增字段绕过清洗。

## 二期小程序

`cloud/phone-login/` 仍是未联调脚手架，不应直接部署到生产。Web 短信登录 UID 与小程序自定义登录 UID 的统一方案未完成前，不允许通过 `phone` 字段绕过 RLS 做账号拼接。

## 后续安全债务（非本轮 blocker）

- 当前 UI 大量使用 inline `onclick`/`innerHTML`，暂时无法启用严格 CSP；未来重构事件绑定后应增加 CSP，并逐步减少 HTML 字符串拼接。
- `profiles.phone` 目前是冗余字段；跨端账号方案稳定后应评估删除，遵循最小化保存个人信息原则。
- 公网用户规模扩大后，应考虑把关键事件写入迁移到 Cloud Function / RPC，由服务端生成和验证关键字段，而不是长期依赖浏览器直接 INSERT。
