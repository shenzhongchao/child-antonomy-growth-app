# Agent Handoff

## Task
产品上线 CloudBase：静态托管部署 + 自定义域名 `today.itonghao.cn` 绑定，**已全部完成并验证通过**。

## Current status
- Status: done
- Last agent: 小布
- Branch: `main`
- Related issue/PR: —

## Delivered
- 正式入口 **https://today.itonghao.cn** 已生效：证书 `b01svyHU`（TrustAsia DV，90 天，至 2026-12-21）、
  AccessType=DIRECT、Status=SUCCESS、DNSStatus=OK、路由 `/` → `STATIC_STORE`(staticstore)。
- `dist/` 20 文件已部署到静态托管；全量探测 14 个关键资源**全部 200**，尺寸与默认域名一致，
  `?v=18` 版本一致，`ssl_verify=0`（证书有效）。
- 环境安全域名含 `today.itonghao.cn`；归属权 TXT `_cloudbase-challenge.today`（值 = envId）由用户配置。
- 用户另有一张证书 `b010udZw` = `itonghao.cn` + `www.itonghao.cn`，与本站点无关，留作他用。
- **表权限已收紧**（2026-09-22）：实测 ACL `growth_events → authenticated=ar`、`profiles → authenticated=arw`，
  `anon` 已移除；RLS 策略（2 / 1）与 `growth_events_validate_v1` 触发器未受影响。
  落库：新增 `cloud/migrations/2026-09-22-tighten-table-grants.sql`，并在 `cloud/schema-v3.sql` 的 GRANT 段后补了 REVOKE。

## Key facts / 踩坑
- 自定义域名**必须走 `manageGateway`**：`manageHosting(action="bindDomain")` 已废弃，报
  「静态托管域名不支持绑定，请通过 HTTP 访问服务绑定域名」。
- 绑定顺序：`bindCustomDomain`（需 certificateId，且域名归属权 TXT 已就位）
  → `createRoute`（`path=/`、上游 `STATIC_STORE`/`staticstore`、`enablePathTransmission=false`）
  → 用户在 DNSPod 加 CNAME `today.itonghao.cn.tcbaccess.tencentcloudbase.com`。
- 归属权校验只在**绑定那一刻**做一次；绑好后删掉 TXT 不影响已有绑定（但不建议删）。
- 当前 MCP 登录身份只有 TCB 权限，`ssl:*` / `dnspod:*` 被拒 —— 证书申请与 DNS 改动只能用户做
  （`ssl DescribeCertificates` 只读可调，可用来核对 CertId 对应哪个域名）。
- 本机 DNS 被本地代理劫持（A 查询恒返回 fake-IP `198.18.1.1`），**A 记录不能从本机核实**；
  TXT/CNAME 类查询仍可信。据此曾误判一次「`today` 下有旧 A 记录」。

## Follow-ups
- 免费证书 **2026-12-21 到期**，到期前重新申请并换绑（免费证书不支持续费）。
- 手机端 PWA 实机自检待用户确认：四页面可用 / 家长面板 PIN `1234` / 完成挑战加分且不可重复 /
  绑定测试手机号后云端同步成功（表权限收紧后，需再跑一次同步确认链路正常）。
- `.agent-context/handoff.md` 与 `DEPLOY.md` 的变更尚未提交 git。

## Version discipline
本轮未改动 `dist/`，`?v=18` 与 `growth-v17` 保持不变。下次改 `dist/` 再各自递增并同步 `scripts/verify.js` 断言。
