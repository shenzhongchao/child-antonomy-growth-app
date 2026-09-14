# 开通云端账号与同步（腾讯云 CloudBase）

应用默认是**纯本地**的：记录存在浏览器里，换设备就没了。开通云端后，家长用手机号登录一次，
之后记录会自动备份到云数据库，换手机、换浏览器、重装 PWA 都能恢复。

> 孩子不需要登录。登录只发生在**家长面板 → 🛡️ 记录安全 → 方式一：自动同步到云端**里，孩子点开应用照常直接用。

---

## 一、控制台要做的四件事

1. **开通云开发环境**
   <https://console.cloud.tencent.com/tcb> → 新建环境（**个人版**约 ¥19.9/月）→ 复制**环境 ID**
   （长得像 `today-i-control-1g8xxxx`）。

   > 如果你打算把这个 Web 应用也放上云（见 [DEPLOY.md](DEPLOY.md)，走 CloudBase 静态网站托管），
   > 就用**同一个环境**，托管和同步共用一份配额，不用买两次。
   > 备案要求「个人版及以上 + 剩余有效期 ≥ 6 个月 + 已开启云托管固定 IP」，
   > 建环境时直接买 6 个月以上更省事。

2. **开启短信验证码登录**
   环境 → **登录授权** → 打开「短信验证码登录」。
   短信签名要审核（1~2 天），签名内容建议填你的小程序名或应用名。

3. **加 Web 安全域名**
   控制台 → **环境配置 → 安全来源**（旧版界面叫「安全配置」）→ 在「安全域名」区域点 **【添加域名】** →
   填**你实际访问用的那个域名**，例如 `today.itonghao.cn`（本地调试再加一条 `localhost:8080`）。
   支持端口号（`localhost:8080`）和通配符（`*.example.com`），每个环境上限 50 条，**约 1~2 分钟生效**。
   系统默认已给 `localhost`、`xxx.tcloudbaseapp.com` 等；带端口的地址建议显式加一条。
   不加的话浏览器请求会被直接拒绝，表现为点登录没反应。

   > ⚠️ 这里填的是「用户浏览器地址栏里的域名」，不是平台分配的默认域名。
   > 按 [DEPLOY.md](DEPLOY.md) 绑定自定义域名后，**必须回来把你自己的域名加上**，
   > 否则换域名后登录和同步会失败（控制台报「安全域名不允许」）。
   >
   > 还没绑自定义域名的备案等待期，可以先临时加 CloudBase 默认域名 `xxx.tcloudbaseapp.com`，
   > 但默认域名仅供测试（有访问提示中间页、访问频率限制，可能被风控封禁），
   > **别把它当长期入口**。

4. **建 PostgreSQL 表 `profiles`**（本项目只走 PostgreSQL）

   > ⚠️ 文档型数据库在 PG 模式环境下**实测不可用**：`tcb db nosql execute` 取不到 Mongo 连接器
   > （`getMongoConnector` 返回 null），控制台也没有「新建集合」入口。早先依据官方文档写下的
   > 「PG 模式下文档库仍默认初始化、代码不用改」**与实环境不符，已废弃**。

   环境 → **数据库 → PostgreSQL** → SQL 编辑器，执行：

   ```sql
   CREATE SCHEMA IF NOT EXISTS public;

   CREATE TABLE IF NOT EXISTS public.profiles (
     id         text PRIMARY KEY,
     user_id    text NOT NULL,
     name       text,
     phone      text,
     state      jsonb,
     updated_at bigint,
     created_at timestamptz NOT NULL DEFAULT now()
   );

   CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON public.profiles (user_id);

   GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
   GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
   GRANT ALL ON public.profiles TO service_role;

   ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

   CREATE POLICY profiles_own ON public.profiles
     FOR ALL TO authenticated
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```

   要点：
   - `state` 是 jsonb，**原样**存 `blank()` 的结构，不做字段拆分
   - **`user_id` 必须是 `text`，不能用 `uuid`** —— CloudBase 的 uid 是 `2099425768869199872`
     这种 19 位数字串，不是 UUID；建成 uuid 会报 `invalid input syntax for type uuid`
   - `auth.uid()` 的返回类型就是 **text**，所以 RLS 里 `auth.uid() = user_id` 两边类型天然一致
   - `updated_at` 用**毫秒时间戳（bigint）**，与前端 `Date.now()` 对齐
   - **RLS 策略必须建**：开了 RLS 却不建策略 = 拒绝所有访问。前端请求会带用户身份，靠 `auth.uid()` 匹配
   - 改表名的话，同步改 `dist/config.js` 里的 `profiles`
   - CLI 能执行建表／授权／开 RLS，但 **`CREATE POLICY` 会被 CLI 的身份校验拦下**
     （报 `No valid identity information, please use cloudbase login to login`）——
     **这一条必须到控制台 SQL 编辑器里跑**

## 二、改一行代码

打开 `dist/config.js`，把环境 ID 填进去：

```js
window.GROWTH_CLOUD = {
  envId: 'today-i-control-1g8xxxx',   // ← 换成你的
  profiles: 'profiles',
  pushDelay: 1500,
};
```

然后照常打包部署：

```bash
node scripts/verify.js          # 必须全绿
python scripts/pack-web.py      # 生成 release/today-i-control-pwa.zip
```

> `envId` 保持 `YOUR-ENV-ID` 时，应用完全不联网、不会报错，就是纯本地模式。

## 三、同步是怎么工作的

- **本地优先**：`localStorage` 里的 `self-growth-v1` 始终是孩子正在用的那份数据，云端只是备份。
  断网、请求失败、没登录，都只影响备份，不影响使用。
- **上传时机**：每次操作后 1.5 秒合并上传一次（孩子连点不会刷屏）。
- **拉取时机**：打开应用时、从后台切回来时、家长面板点「立即同步」时。
- **冲突处理**（整包 last-write-wins）：
  | 情况 | 行为 |
  |---|---|
  | 本地有记录、云端空 | 上传本地 |
  | 本地空、云端有记录 | 下载云端（换设备恢复就是走这条） |
  | 云端比上次同步新 | 下载云端 |
  | 都有记录且判不出新旧 | **弹窗让家长选**，选「留本机」时会自动把云端那份另存为 `xxx_old` 档案 |
- **存的数据结构**：`state` 字段原样沿用 `blank()` 的结构（`days/stars/counts/rewards/name/goal/graduated/prices`），
  没有做任何字段改名或拆分，老记录直接可用。

## 四、多个孩子

一台设备可以放多个孩子的记录，**不需要登录云端**（云端只是多一份保险）。

- 入口：家长面板 →「👧 孩子档案」。里面有改名、档案列表、切换、添加。云端登录在下面的「🛡️ 记录安全 → 方式一：自动同步到云端」，两者互不阻塞。
- 孩子端：有 2 个以上档案时，顶部会出现一块写着自己名字的小牌子，点一下弹出「今天是谁呀？」，选自己的名字即可换过来（不需要家长 PIN）。
- **本机同一时刻只有一份活动数据**：`self-growth-v1` 是「正在用的那个孩子」，其余孩子缓存在 `self-growth-archive-v1`。两份的 `state` 结构完全一样。
- 切换前会先把当前记录上传云端并写进本机缓存；**上传失败会弹窗让家长选**「再试一次同步 / 不等了直接继续 / 先不换了」，不会静默覆盖。断网也能在本机档案之间切换。

> 说人话：一个档案 = 一本自己的本子。孩子的星星、徽章、奖励券都算在各自那本上，不会串。

## 五、以后上微信小程序（二期）

企业主体小程序可以用 `getPhoneNumber` 一键拿到手机号，和 Web 端账号天然对应。仓库里已经放了
云函数脚手架：`cloud/phone-login/`（未联调，上小程序时再接）。

要点：

1. 小程序端 `<button open-type="getPhoneNumber">` 拿到 `cloudID`，调云函数换成明文手机号；
2. 云函数用 `auth.createTicket(uid)` 签发**自定义登录票据**，小程序端 `signInWithCustomTicket` 登录；
3. **两端的 uid 要对齐**：Web 端短信登录出来的 uid 和自定义登录的 uid 不是同一个。
   推荐做法是自定义登录的 `uid` 直接用手机号，并把 `profiles` 的安全规则改成按 `phone` 字段匹配
   （集合权限「仅创建者可读写」在跨端场景下会失效，因为两端 `_openid` 不同）。
   这也是为什么每条档案都冗余存了 `phone` 字段。
4. 小程序端不需要重写逻辑，直接用同一份 `state` 结构渲染即可。

## 六、费用与限额

| 项 | 说明 |
|---|---|
| 云开发环境 | 个人版约 ¥19.9/月（[DEPLOY.md](DEPLOY.md) 的静态托管共用这一份配额，不额外收费） |
| 短信 | 同一号码 30 秒 1 条、每天上限 100 条（可在控制台调整），超出需买资源包 |
| 数据库 | 这个应用数据量极小（每个孩子一条文档、几 KB），读写次数远低于免费额度 |

## 七、出问题先看这里

| 现象 | 原因 |
|---|---|
| 面板显示「未配置云端」 | `dist/config.js` 里还是 `YOUR-ENV-ID` |
| 点获取验证码没反应/报错 | 安全域名没加，或「身份认证 → 登录方式」里短信验证码登录没开启 |
| 登录成功但同步报错／读不到档案 | `profiles` 表或 RLS 策略没建好（见第一节第 4 步）；**开了 RLS 却没建策略 = 拒绝所有访问** |
| 显示「同步有问题」 | 看后面的错误文案；多数是网络或权限问题 |
| 部署后没生效 | `dist/sw.js` 的 `VERSION` 没加一，浏览器还在用旧缓存 |

## 八、换孩子 / 记录安全 的排错

| 现象 | 原因 |
|---|---|
| 切孩子时弹「本机记录还没备份上云」 | `push()` 没成功（断网或权限）。这是**故意的保护**：点了「不等了，直接继续」才会用云端那份覆盖本机 |
| 面板里只看到「备份与恢复」，没有「方式一：自动同步」 | `dist/config.js` 的 `envId` 还是占位符，云端没开通 |
| 手机上登录后看到的是别的孩子 | `profileId` 是本机各自记的。新设备首次登录若本机没有档案指针，会落到云端列表的第一份 → 去「👧 孩子档案」切到对的那个 |
| 两台设备记录不一致 | 同步是**整包 last-write-wins**：两台都改时后写赢，先写的会丢。固定一台设备为主记录，换设备前先在旧设备点「立即同步」 |

---

## 附：事件账本（二期，**尚未接线**）

> 现状：只建了表、写好了纯逻辑和测试，`dist/` 里**没有一行代码用它**，应用行为与之前完全一致。
> 目的是替换掉上面那条容易被误解的「整包 last-write-wins」。

**为什么**：两台设备各自把「最终状态」写回 `profiles.state`，后端无法判断谁对，只能后写赢 → 先写那一边改动丢失。
改成只记「做了什么」（只增不改），后端只追加、不覆盖，就没有「覆盖」这回事。

### 表（已建好）

```sql
CREATE TABLE IF NOT EXISTS public.growth_events (
  id text PRIMARY KEY,          -- 操作 id：跨设备唯一，主键去重保证重发只算一次
  user_id text NOT NULL,
  profile_id text NOT NULL,     -- 哪个孩子
  type text NOT NULL,           -- task.done / pick / plan / mood / note / reward.redeem / ...
  day text,                     -- 'YYYY-MM-DD'，设置类事件为空
  t bigint NOT NULL,            -- 客户端毫秒时间戳，重放排序用
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS growth_events_profile_idx ON public.growth_events (profile_id, t);
GRANT SELECT, INSERT ON public.growth_events TO authenticated;   -- 刻意不给 UPDATE/DELETE
GRANT ALL ON public.growth_events TO service_role;
ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;
```

**RLS 策略（必须在控制台 SQL 编辑器里跑，CLI 身份校验过不去）**：

```sql
CREATE POLICY growth_events_read ON public.growth_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY growth_events_append ON public.growth_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

### 逻辑（`scripts/growth-events.js`）

纯函数，无副作用，Node 与浏览器都能用：`blank() / blankDay() / norm() / apply() / replay() / toEvents()`。

- **迁移**：现有 `profiles.state` 用 `toEvents()` 压成**一条 `state.import` 事件**（原样携带），保证逐字段无损。
- **日常**：每次操作产生一条细粒度事件，本机立刻重放（孩子看到即时反馈），后台补传。
- **重放**：按 `(t, id)` 排序，按 `id` 去重，`state.import` 出现的位置即基线；未知 `type` 忽略（向前兼容）。
- 产出的 state 与 `blank()` **完全同构**，所以切换时 `app.js` 一行都不用改。

已验证（`node scripts/verify.js` 的「事件账本」段，共 19 项）：
迁移无损逐字段相同、`blank()`/`blankDay()` 与 `app.js` 默认值不许漂移、
批量重发幂等、乱序到达收敛、未知事件忽略、**两台设备各自追加互不覆盖**。

