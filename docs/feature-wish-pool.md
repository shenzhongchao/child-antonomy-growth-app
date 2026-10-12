# 功能方案：小心愿（愿望池 + 孩子发起任务）

状态：已实现（PR1 事件层 + PR2 UI 均完成，verify 全绿）· 2026-10-12

> 一句话：孩子可以主动提出「想要的奖励」和「想挑战的事」，家长在家长中心审批、定价后上架；
> 把「提议」本身纳入自主力培养闭环，而不只奖励「完成」。
>
> 实现备注：`pick` 事件的 `selected` 已扩展为允许 `w_` 自定义挑战 id 混入（云端 trigger 同步放宽）；家长侧模块名为「💌 小心愿」。

## 1. 目标与产品边界

- 孩子侧新增两个入口：许愿（提议奖励 / 提议挑战）、完成自己提议的挑战。
- 家长侧新增一个 PIN 保护的二级模块「💌 小心愿」：查看、批准（奖励需定价）、婉拒、下架。
- 沿用成长足迹口径：只陈述「记录到的自主完成」，不做能力断言；不产生连续打卡、完成率、排行榜、红黄绿警告。
- 历史只读；孩子不能修改已提交的愿望内容（只能再提一个新的）。
- local-first 不变：所有动作先写本地 `pending`，云端只追加事件。

## 2. 现状约束盘点（设计前提）

实现前必须知道的硬约束：

1. **任务与奖励都是定长 6 的索引数组**：`taskId` 校验 `0–5`，`counts`/`prices` 长度固定 6；云端 trigger 用 `'^[0-5]$'` 正则校验。自定义任务/奖励**不能复用现有数字 id**，必须用字符串 id 走新事件类型。
2. **云端服务端校验白名单**：`cloud/schema-v3.sql` 的 `validate_growth_event_v1()` 对事件类型和 payload 形状逐字段校验，新事件类型不上白名单会被直接拒收。
3. **三件套同步**：改 `growth-events.js` 的 `norm/apply/validEvent` 时，必须同步 `app.js` 事件产生点与 `scripts/verify.js`；涉及历史展示还要动 `history.js` + `verify-history.js`。
4. **版本纪律**：`?v=20`（资源）与 `growth-v19`（SW 缓存）同步递增，更新 `verify.js` 版本断言。

## 3. 数据模型

`blank()` 新增三个字段（`norm` 负责清洗，旧记录无这些字段时取默认空值，天然向后兼容）：

```js
wishes: [],        // 愿望（含自定义任务/奖励的"提案+审批"单）
customCounts: {},  // { wishId: 自主完成次数 }，仅自定义挑战用，不进徽章体系
// day 级新增：
day.customDone = {} // { wishId: 'self' | 'help' }
```

愿望条目结构：

```js
{
  id: 'w_<eventId>',        // 用 wish.propose 事件 id 生成，字符串 ≤200
  kind: 'task' | 'reward',
  title: string,            // ≤16 字
  desc: string,             // ≤24 字，可空
  status: 'pending' | 'approved' | 'declined' | 'retired',
  price: number | null,     // 仅 kind=reward 且批准时必填，1–99
  proposedDay: 'YYYY-MM-DD',
  decidedDay: 'YYYY-MM-DD' | null,
}
```

`norm` 清洗规则：

- `wishes` 上限 200 条；`customCounts` 键 ≤200 字符、值为 `0–1000000` 整数；`customDone` 值仅 `'self'|'help'`。
- `s.rewards`（已兑换券）的 `id` 从「仅 0–5 整数」放宽为「0–5 整数 **或** 以 `w_` 开头的字符串（≤200）」，用于自定义奖励券。
- 所有非法条目静默丢弃（与现有 norm 风格一致）。

## 4. 事件协议

新增 4 个事件类型，全部进 `EVENT_TYPES` 与云端白名单：

| 类型 | 字段 | 校验 | apply 语义 |
|---|---|---|---|
| `wish.propose` | `day`, `kind`, `title`(1–16), `desc`(0–24) | 同名字段合法；`pending` 中同 kind 愿望 <20 | 追加一条 `status:'pending'` 愿望，`id='w_'+e.id` |
| `wish.decide` | `wishId`, `approve`(bool), `price?`(1–99), `day` | wishId 存在于 wishes 且为 pending；奖励批准必须带 price | 置 `approved/declined` + `decidedDay`；并发重复审批按 server_seq 首个生效 |
| `custom.done` | `day`, `task`(wishId 字符串), `mode`('self'/'help') | wishId 是 approved 的 task 愿望 | 按 日期+task 去重（同 `task.done`）；`self` 时 `stars++`、`customCounts[wishId]++`，写 `day.customDone`；不进 `counts`、无徽章 |
| `reward.custom.redeem` | `day`, `reward`(wishId), `cost`(1–99) | wishId 是 approved 的 reward 愿望 | 与 `reward.redeem` 相同的余额检查（余额不足不生效）；`s.rewards.push({id: wishId, ...})` |

复用不变的事件：

- `reward.use`：按兑换事件 id 定位，对自定义券天然适用，**不改**。
- `wish.retire`（下架）：`{wishId, on:boolean}`。下架的 task 不再出现在挑战选择中、reward 不再出现在奖励屋；**已兑换的券和历史记录保留**（同毕业语义）。

并发与顺序：

- 所有状态判定都以权威 `server_seq` 顺序重放为准，与现有 `task.done` 去重、`reward.redeem` 余额检查同一套纪律。
- 孩子提议与家长审批在两个设备并发提交时无需特殊处理：审批按 wishId 定位，不依赖数组下标。

## 5. 页面流程

### 5.1 孩子侧

**许愿入口（奖励屋底部新增区块「我的小心愿」）**

- 列表展示孩子的愿望，状态文案：
  - `pending` →「小星星会帮你告诉家长」
  - `approved` → 任务：「已经可以去挑战啦」；奖励：跳到奖励屋对应卡片
  - `declined` →「这次先不了，可以再想想别的」
- 「✦ 许个愿」按钮 → modal 两步：
  1. 选类型：「🎁 我想要的奖励」/「💪 我想挑战的事」
  2. 输入标题（≤16 字，奖励可补 ≤24 字说明）→ 提交 toast：「愿望告诉小星星啦」
- 不设撤回、不设催促按钮（不打扰家长）。

**自定义挑战（已批准的 task 愿望）**

- 出现在 `choose()` 挑战选择弹窗中，位于 6 个固定挑战之后，标注「我自己想练的」；占用每日 1/3 名额。
- 完成流程完全复用 `complete()`：同样二选一（自己想起来 / 有人提醒），`self` +1 星。
- 成长页新增「我的专属练习」区块：列出已批准的自定义挑战 + 累计自主完成次数（**无徽章等级、无进度条**，避免暗示评价体系）。

**自定义奖励（已批准的 reward 愿望）**

- 作为第 7+ 张卡片出现在奖励屋网格，标注「我的愿望」；兑换/确认弹窗、券列表、`reward.use` 兑现流程与固定奖励一致。

### 5.2 家长侧

- 家长中心模块网格新增「💌 小心愿」；有待审批愿望时，家长中心**首屏**（无需 PIN）显示一个温和提示：「孩子许了 N 个小心愿，等您看看」——查看与审批本身进 PIN 保护模块。
- 「小心愿」二级页：
  - 待审批列表：孩子原文 +「批准」/「这次先不了」。批准奖励时必填价格（1–99，给建议值 10）。
  - 已上架列表：可「下架」（`wish.retire`）。
  - 婉拒不写理由输入框——鼓励家长线下当面说，产品不替代表达。
- 「孩子与成长」的今日鼓励、周报等文案不涉及愿望数据，保持不变。

## 6. 云端变更

新增 `cloud/migrations/2026-10-XX-wish-pool.sql`（不 DROP 表、可重复执行）：

1. `CREATE OR REPLACE` 校验函数（或直接新建 `validate_growth_event_v2` + 重建 trigger）：
   - 白名单加入 `wish.propose / wish.decide / custom.done / reward.custom.redeem / wish.retire`；
   - 逐字段校验同上表；`title/desc` 用 `char_length` 限制；
   - `state.import` 的 state 校验同步放宽：`rewards[].id` 允许 `w_` 前缀字符串；新增 `wishes/customCounts` 结构校验（旧备份无这两个字段必须仍能通过——校验逻辑对缺失字段按默认处理）。
2. `cloud/schema-v3.sql` 同步修改（仅影响全新环境），与 migration 保持一致。

## 7. 已知风险：新旧版本混用的状态分叉

旧版客户端的 `validEvent` 会**丢弃**不认识的事件类型。若同一账号两台设备一新一旧：

- 旧设备会永久漏算新事件带来的星星变化（`confirmedState` 是增量推进的，`lastServerSeq` 已越过这些事件）；
- 旧设备自身产生的事件仍能正常上传，不会造成数据损坏。

缓解与恢复：

- 家庭场景通常 1–2 台设备，SW 会在数天内完成更新，分叉窗口短；
- 恢复路径已存在：旧设备更新到新版本后，在「记录与数据」退出账号、清除本机存储、重新登录，即按完整事件日志重放收敛；
- 上线公告文案（家长中心使用说明里加一句）：「本次更新后，请把家里所有设备都打开一次以完成升级」。

如评审认为不可接受，备选方案是先上一个「双写过渡版」（新事件同时产生等效的旧事件），复杂度明显上升，**不推荐**。

## 8. 测试与回归

- `scripts/verify.js`：
  - 新事件的 `validEvent` 正/反例（长度越界、price 缺失、未知 wishId、重复审批）；
  - `apply` 语义：`custom.done` 去重与加星、`reward.custom.redeem` 余额不足不生效、并发审批首个生效；
  - `norm` 清洗：非法 wishes 条目丢弃、旧格式 state（无新字段）归一化；
  - `replay`：乱序 + 重复 id 下结果确定；
  - 版本断言更新为 `?v=20` / `growth-v19`。
- `scripts/verify-history.js`：`customDone` 计入单日自主完成统计；措辞口径回归（无评价性词汇）。
- `scripts/verify-security.js`：确认新事件类型不经 PIN 的孩子侧入口只能产生 `wish.propose / custom.done / reward.custom.redeem`，不能产生 `wish.decide / wish.retire`。
- 手动清单（并入 `docs/pwa-device-checklist.md`）：许愿 → 家长审批 → 挑战完成加星 / 奖励兑换兑现全链路；断网许愿后恢复同步；下架后历史保留。

## 9. 实施拆解（可直接动工）

| # | 内容 | 文件 |
|---|---|---|
| 1 | 数据模型 + 4+1 个新事件（norm/validEvent/apply/replay） | `dist/growth-events.js` |
| 2 | 孩子侧：许愿 modal、奖励屋自定义卡片、choose/complete 接入自定义挑战 | `dist/app.js` |
| 3 | 家长侧：「小心愿」模块（审批/定价/下架）、首屏待审批提示 | `dist/app.js` |
| 4 | 成长页「我的专属练习」+ 历史层计入 customDone | `dist/app.js`、`dist/history.js` |
| 5 | 云端 migration + schema-v3 同步 | `cloud/` |
| 6 | 三套 verify 更新 | `scripts/` |
| 7 | 版本递增 `?v=20` / `growth-v19`，verify 版本断言 | `dist/index.html`、`dist/sw.js`、`dist/auth.js` |
| 8 | 文档：AGENTS.md 架构节、CLOUD.md 白名单说明、PWA 检查清单 | `AGENTS.md`、`CLOUD.md`、`docs/` |

建议切两个 PR：PR1 = 事件层 + 云端 migration + verify（无 UI，先保证协议落地）；PR2 = UI 与文档。
