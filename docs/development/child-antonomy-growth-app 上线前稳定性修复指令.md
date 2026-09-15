你现在负责仓库：

`shenzhongchao/child-antonomy-growth-app`

目标：完成一次「上线前稳定性修复」，不要新增产品功能，不要改变当前产品核心逻辑和视觉设计。

开始前必须先阅读：

- `AGENTS.md`
- `.agent-context/handoff.md`（如果存在）
- `README.md`
- `dist/app.js`
- `dist/growth-events.js`
- `dist/auth.js`
- `dist/sw.js`
- `scripts/verify.js`
- `cloud/schema-v2.sql`

然后执行现有验证：

```bash
node scripts/verify.js
```

确认当前 baseline 后再修改。

---

# 一、修复范围

本轮只处理以下 4 个问题，按优先级执行：

## P1-1：修复 PWA 首次安装后离线打开时静态资源缓存可能 miss

当前 `index.html` 请求：

```text
styles.css?v=14
growth-events.js?v=14
app.js?v=14
config.js?v=14
auth.js?v=14
```

但 `sw.js` CORE 预缓存的是不带 query 的：

```text
styles.css
growth-events.js
app.js
config.js
auth.js
```

这可能导致：

```text
首次在线打开
→ Service Worker 安装
→ 用户断网
→ 再次打开
→ index.html 命中缓存
→ app.js?v=14 等请求无法匹配 app.js 缓存
→ 页面 JS/CSS 加载失败
```

### 要求

选择一种简单、稳定、容易维护的方案解决，不要同时保留两套互相打架的版本机制。

优先考虑：

**方案 A：Service Worker 对同源静态资源 cache.match 时忽略 query。**

例如在适当位置使用等价于：

```js
cache.match(req, { ignoreSearch: true })
```

或设计一个统一的 canonical cache lookup。

也可以选择更干净的方案，但必须满足：

1. 带 `?v=xx` 的请求可以正确命中预缓存。
2. 在线时仍能正确取得新版。
3. 离线时核心 HTML/CSS/JS 可以完整启动。
4. 不破坏导航请求目前的 network-first + 2.5s fallback 逻辑。
5. 不把 785KB `cloudbase.esm.js` 加进首屏预缓存。

修改 `dist/` 后记得按照仓库规则升级：

```js
const VERSION = 'growth-vXX';
```

同时保持相关资源版本策略一致。

### 必须增加回归测试

至少覆盖：

```text
precache /app.js
runtime request /app.js?v=XX
→ 可以命中同一份缓存
```

以及：

```text
离线状态
index.html + styles.css?v=XX + app.js?v=XX
→ 核心资源均有缓存 fallback
```

如果现有 `verify.js` 不适合真实模拟 Cache API，可以增加针对缓存匹配策略的纯逻辑测试，不要引入大型依赖。

---

# P1-2：修复「恢复旧备份 → 登录已有云账号」覆盖较新云端状态的问题

当前潜在流程：

```text
设备 B 未登录
↓
从旧 JSON 文件恢复
↓
本地产生 state.import
↓
登录已有成长历史的手机号
↓
state.import 上传到云端
↓
获得最新 server_seq
↓
replay 时 state.import 成为新的基线
↓
较新的云端成长状态被逻辑覆盖
```

注意：

这不是数据库事件被删除，而是 projection 被旧 `state.import` 重置。

### 产品规则

必须实现以下规则：

#### 情况 A：云端没有任何历史事件

允许：

```text
本地 state.import
→ 作为账号初始基线上传
```

例如：

```text
新账号
+
本地已有记录
```

这是正常迁移场景。

#### 情况 B：云端已经有历史事件

禁止静默上传本地 `state.import`。

此时必须保护云端已有数据。

最简单安全的策略：

```text
云端有历史
+
pending 中存在 state.import
→ 默认采用云端
→ 不自动把本地 import 上传
```

如果实现用户选择会明显增加复杂度，本轮不要做复杂 UI。

当前版本优先采用：

**云端已有历史时，云端为权威；本地 state.import 不上传。**

但要：

1. 给家长明确提示，例如：
   `发现账号已有成长记录，已恢复云端记录；本机导入的旧备份未覆盖云端。`
2. 清理或隔离对应的本地 `state.import` pending，避免下一轮再次上传。
3. 不影响普通 pending 的正常上传。
4. 如果本地存在 `state.import + 后续真实新操作`，要谨慎处理。

建议安全处理规则：

```text
云端已有历史
如果 pending 中含 state.import：
    丢弃 state.import
    state.import 之前的本地历史不进入云端
    state.import 之后的增量事件：
        只有能够明确证明是恢复之后产生的日常事件时才允许继续上传
```

如果当前事件结构无法安全区分，则本轮宁可保守：

```text
清除整个由该本地恢复基线衍生的 pending
恢复云端状态
提醒家长重新操作
```

不要为了“尽量合并”制造错误状态。

### 必须增加测试

测试：

```text
remote:
server_seq 1..10，已有成长记录

local pending:
state.import(oldBackup)

同步后：
云端状态保持原来的最新状态
旧 backup 不成为新的 projection
```

再测试：

```text
remote = []

local pending:
state.import(localBackup)

同步后：
localBackup 成功成为初始云端状态
```

---

# P2-1：把云同步从「每次全量历史下载两遍」改成增量同步

当前 `syncNow()` 大致：

```text
listEvents(all)
→ uploadMissing()
→ listEvents(all)
→ replay(all)
```

而 `growthStore` 已经存在：

```js
lastServerSeq
```

但目前没有真正利用。

目标：

**正常同步只拉取 `server_seq > lastServerSeq` 的新事件。**

不要每次都下载完整历史。

---

## 推荐实现结构

可以把本地数据包扩展成：

```js
{
  version: 2,
  ...
  lastServerSeq,
  state,
  pending
}
```

现有 `state` 即：

> 已确认云事件 + 当前本机 pending 的 projection

但要特别注意 pending 被 ack 后的重算。

建议采用清晰模型：

```text
confirmedState
+
remoteDelta
+
pending
=
current state
```

如果引入 `confirmedState` 会导致本轮改动过大，可以选择较小改法。

一个可接受的折中：

### 首次登录 / 新设备

```text
lastServerSeq = 0
→ 拉取全部云事件
→ replay
```

### 后续同步

```text
SELECT events
WHERE profile_id = ?
AND server_seq > lastServerSeq
ORDER BY server_seq ASC
```

先上传本机 pending，再拉：

```text
server_seq > oldLastServerSeq
```

将远端增量和仍未确认 pending 合成新投影。

关键要求：

1. 正常同步不能全量拉历史两次。
2. `lastServerSeq` 只在成功拿到并应用远端事件后推进。
3. pending 上传失败时不能丢。
4. 同一事件重复收到仍保持幂等。
5. 换设备第一次登录仍能从 0 正确恢复全部状态。
6. server_seq 仍是跨设备唯一权威顺序。

---

# P2-2：分页查询必须显式按 server_seq 排序

当前类似：

```js
events()
  .select('*')
  .eq('profile_id', profileId)
  .range(...)
```

不要依赖 PostgreSQL 默认返回顺序。

必须修改成显式：

```text
ORDER BY server_seq ASC
```

具体使用 CloudBase/PostgREST SDK 支持的 `.order(...)` API。

对于增量查询，应等价于：

```text
profile_id = ?
server_seq > lastServerSeq
ORDER BY server_seq ASC
range(...)
```

必须保证：

- 分页稳定
- 不因不同页默认排序变化而漏数据
- JS 侧最后 sort 可以保留作防御，但不能把它当数据库分页排序的替代品

### 增加测试

至少构造：

```text
1001+ events
```

验证：

```text
第一页 1000
第二页剩余事件
最终无遗漏
无重复
server_seq 顺序正确
```

测试不一定需要真的连 CloudBase，可以测试分页/查询逻辑抽象。

---

# 二、本轮不要处理的东西

不要顺手增加：

- 排行榜
- 签到
- 新任务
- 更多徽章
- AI 分析
- 家长报告
- 多孩子账号
- 新奖励系统
- UI 大改
- framework
- npm 构建体系
- TypeScript
- React/Vue
- 数据库大重构

不要重写现有原生 JS 架构。

本轮目标只有：

> **保证数据不丢、离线可靠、同步可长期运行。**

---

# 三、同时检查一个次要一致性问题

检查以下场景，但除非修复非常简单，否则只记录到 handoff，不要扩大本轮范围：

```text
设备 A:
task.done(task=0)

设备 B:
pick([1,2])

云端顺序：
task.done(0)
pick([1,2])
```

当前可能得到：

```js
done = {0:'self'}
selected = [1,2]
```

从而出现：

```text
完成数 = 1
选中任务 = 2
但两个可见任务都没完成
```

判断：

`pick` reducer 是否应该强制保留当天已经 `done` 的 task。

如果可以用非常小且明确的 reducer invariant 修复：

```text
selected = union(doneTasks, newSelected)
```

同时遵守最多 3 个任务的产品约束，则可以修。

如果规则存在歧义，本轮只写入 handoff，先不要自行扩展产品语义。

---

# 四、代码质量要求

保持当前架构：

```text
app.js
→ UI + 产生业务 event

growth-events.js
→ 唯一 reducer / replay 语义

auth.js
→ 登录 + 云同步

sw.js
→ PWA
```

不能在 `auth.js` 里复制 reducer 逻辑。

不能维护第二份 event apply。

新增业务事件语义必须进入：

```text
growth-events.js
```

测试必须直接使用正式 reducer。

---

# 五、完成后必须执行

至少运行：

```bash
node --check dist/app.js
node --check dist/auth.js
node --check dist/growth-events.js
node --check dist/sw.js
node scripts/verify.js
```

如果环境允许，再本地启动：

```bash
python -m http.server 8080 -d dist
```

手动检查：

```text
1. 今天
2. 我的一天
3. 成长
4. 奖励屋
5. 家长入口
6. 本地记录
7. 登录/退出
8. 离线重新打开
```

不要因为修同步破坏孩子端正常操作。

---

# 六、验收标准

只有以下全部满足才算完成。

### 数据安全

- 云端已有历史时，旧 `state.import` 不会静默覆盖云状态。
- 新账号仍可以从本地备份初始化。
- pending 网络失败不丢失。
- 并发 reward redeem 仍不会出现负余额。

### 同步

- 第一次登录可以恢复完整云记录。
- 后续只获取 `server_seq > lastServerSeq` 的增量。
- 数据库查询显式 `ORDER BY server_seq ASC`。
- 1000+ 事件分页无漏、无重复。
- 多设备最终 replay 状态一致。

### PWA

- 首次在线打开后，即使立即断网，下一次仍能完整启动。
- 带 query version 的核心静态资源可以命中缓存。
- Service Worker VERSION 已更新。
- 不把大型 CloudBase SDK 放入首屏 precache。

### 回归

```bash
node scripts/verify.js
```

必须全部通过。

---

# 七、最终提交要求

完成后给出：

1. 修改了哪些文件。
2. 每个问题的根因。
3. 实际采用的修复策略。
4. 新增了哪些测试。
5. `node scripts/verify.js` 的最终结果。
6. 是否发现额外风险。
7. 是否修改了 `cloud/schema-v2.sql`；如果修改，说明是否需要人工去 CloudBase 控制台执行 SQL。
8. 给出建议 commit message。

最后按照 `AGENTS.md` 的 Handoff Protocol 更新：

```text
.agent-context/handoff.md
```

只保留当前最新快照，不追加流水账。

本任务状态如果上述验收全部完成：

```text
status: ready_for_review
```

不要直接把任务标记为 done，我还需要进行最终 review。