# 云端账号与记录保护 V2

本应用使用腾讯云 CloudBase：家长用手机号开启记录保护，孩子始终直接使用，不需要登录。

V2 的产品边界是**一个家长账号只对应一个孩子**。云端不再保存整包 `state`，只保存孩子档案元数据和不可变的成长事件，因此两台设备不会互相覆盖最终状态。

## 一、开通 CloudBase

1. 创建按量计费的云开发环境，并记下环境 ID。
2. 静态网站托管添加正式域名和安全域名。
3. 身份认证中启用短信验证码登录。
4. PostgreSQL 控制台 SQL 编辑器执行 [`cloud/schema-v2.sql`](cloud/schema-v2.sql)。

`schema-v2.sql` 会删除同名旧表后重建，只适用于当前尚未上线、无需兼容历史数据的项目。

RLS 策略必须在控制台 SQL 编辑器中创建；CLI 执行 `CREATE POLICY` 可能因身份校验失败。CloudBase 用户 ID 是数字字符串，但字段类型必须使用 `text`，不能使用 PostgreSQL `uuid`。

## 二、前端配置

编辑 `dist/config.js`：

```js
window.GROWTH_CLOUD = {
  envId: 'today-i-control-1g8xxxx',
  profiles: 'profiles',
  events: 'growth_events',
  pushDelay: 1500,
};
```

保持 `YOUR-ENV-ID` 或空值时，应用完全按本机模式运行，不加载 CloudBase SDK。

`dist/cloudbase.esm.js` 是自包含的 CloudBase JS SDK。不要用 jsdelivr 的 `+esm` 文件覆盖；其根相对依赖放到自有域名会 404。

## 三、数据模型

### `profiles`

每个账号只能有一行孩子档案，数据库通过 `user_id UNIQUE` 强制保证：

- `id`：孩子档案 ID
- `user_id`：CloudBase 家长账号 ID
- `name`：孩子小名
- `phone`：手机号冗余字段，供未来跨端账号对齐
- `updated_at`：元数据更新时间

### `growth_events`

每次业务操作只追加一行：

- `id`：设备生成的全局唯一事件 ID，也是重复上传的幂等键
- `server_seq`：数据库生成的权威顺序
- `profile_id`：唯一孩子档案
- `device_id`：产生操作的设备
- `type/day/payload`：操作语义
- `t`：客户端发生时间，只用于展示和诊断，不决定跨设备权威顺序

事件表只向普通登录用户授予 `SELECT` 和 `INSERT`，不允许修改或删除历史事件。

## 四、本机数据

浏览器只使用一个 localStorage 键 `self-growth-v2`：

```json
{
  "version": 2,
  "deviceId": "d_xxx",
  "profileId": "p_xxx",
  "userId": null,
  "sequence": 0,
  "lastServerSeq": 0,
  "lastSync": 0,
  "state": {},
  "pending": []
}
```

- `state` 是当前可直接渲染的状态投影。
- `pending` 是尚未被云端确认的事件队列。
- 每次操作先同时更新 `state` 和 `pending`，所以断网不影响孩子使用。
- 登录后后台先补传 `pending`，再按 `server_seq` 重放云端事件并清理已确认队列。
- 文件恢复只允许在尚未绑定账号时使用，并会清空旧待上传队列后建立一条新的本机基线；账号已绑定时直接从云端恢复，避免文件覆盖共享账本。

项目不再读取或生成 `self-growth-v1`、`self-growth-cloud-v1`、`self-growth-archive-v1`。

## 五、实际使用流程

### 第一次使用

应用立即创建一个本机孩子档案。家长可在家长入口填写小名；不登录也可以完成全部成长操作。

### 开启记录保护

家长入口 →「🛡️ 记录保护」→ 手机号验证码 →「开启自动保护」。

- 账号没有档案：将本机唯一档案绑定到该账号。
- 账号已有档案：使用云端档案 ID，把本机尚未上传的事件追加进去，然后统一重放。
- 设备已绑定其他账号：停止同步，不把两个孩子的数据混到一起。

### 日常使用

孩子的操作先保存本机，1.5 秒后后台合并上传。同步失败时只显示“已存本机，等待网络恢复”，不弹窗、不阻断操作，也没有“立即同步”按钮。

### 新设备恢复

新设备登录同一手机号后直接加载该账号唯一档案，不出现孩子选择或“保留本机/云端”冲突弹窗。

## 六、事件合并规则

- `task.done`：同一天同一任务只生效一次；两台设备重复记录不会重复加星。
- `pick/plan/mood/note/settings.*`：按云端 `server_seq` 后写生效。
- `reward.redeem`：按云端顺序逐条校验余额；余额不足的并发兑换事件不会生效，状态不会变成负数。
- `reward.use`：用兑换事件 ID 定位奖励券，不依赖数组下标。
- 未知事件被忽略，旧客户端不会因为新增事件类型崩溃。
- 同一个事件重复上传由主键去重，结果保持幂等。

## 七、部署与验证

修改 `dist/` 中的 HTML/CSS/JS 后必须增加 `dist/sw.js` 的 `VERSION`。

```bash
node scripts/verify.js
python scripts/pack-web.py
```

打包脚本会将 `dist/` 平铺到 ZIP 根目录。部署后检查：

1. 四个孩子页面都能正常操作。
2. 家长页只有一个孩子设置和一张记录保护卡。
3. 断网操作进入 `pending`，恢复网络后自动清空。
4. 两台设备分别完成不同任务，最终两项都保留。
5. 重复上传同一事件不会重复加星。
6. 两台设备同时兑换时，最终余额不为负数。

CloudBase 默认域名 `*.tcloudbaseapp.com` 只适合测试，有访问提示、频率限制和风控风险，不应作为长期入口。正式自定义域名必须完成 ICP 备案并配置 HTTPS 证书。

## 八、未来小程序

`cloud/phone-login/` 仍是二期脚手架，尚未联调。小程序自定义登录 UID 必须与 Web 短信登录 UID 对齐后才能共用 `profiles` 和 `growth_events`，不要仅凭手机号字段绕过 RLS。
