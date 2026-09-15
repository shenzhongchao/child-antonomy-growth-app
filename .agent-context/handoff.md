# Agent Handoff

## Task
新增「成长足迹」V1：在成长页提供历史记录入口，支持月历、单日详情、近 4 周自主/提醒趋势；历史只读，不新增业务事件、不改同步账本。

## Current status
- Status: blocked
- Last agent: ChatGPT
- Branch: `feature/growth-history-v1`
- Base: `main@dc4715696984351799e47ee0220dc600ba509e94`

## Goal / acceptance criteria
- [x] 成长页出现「成长足迹」入口，不增加第五个底部导航
- [x] 月历展示有记录日期，并区分「自己想起来 / 提醒后完成」
- [x] 点日期可查看当天挑战、完成方式、计划、心情、家长鼓励、奖励兑换
- [x] 展示近 28 天自主/提醒总量及各能力练习分布
- [x] 空白日明确表达“只是没记录，不代表没做好”
- [x] 历史面板只读，不产生新事件、不新增数据库表
- [x] 新模块已加入 PWA CORE 预缓存；资源 query 升至 `?v=16`，SW Cache Storage 升至 `growth-v15`
- [x] 新增 `scripts/verify-history.js`，本地沙盒执行 `ALL_PASS`
- [ ] 更新 `scripts/verify.js` 的资源版本常量（15→16、growth-v14→growth-v15）并把 `history.js` 纳入语法检查；运行完整 `node scripts/verify.js`
- [ ] 浏览器手动检查成长页入口、月历前后翻月、日期详情、手机窄屏、离线启动

## Files touched
- `dist/history.js`
  - 新增只读历史数据聚合与 UI；不依赖 CloudBase、不写状态
  - 纯函数：`daySummary / monthModel / trend`
  - UI：成长页入口、月历、单日详情、近 4 周趋势
- `dist/history.css`
  - 成长足迹面板与移动端样式
- `dist/index.html`
  - 引入 `history.css?v=16`、`history.js?v=16`；其余核心资源统一升到 `?v=16`
- `dist/sw.js`
  - `VERSION` 升至 `growth-v15`
  - `history.css/history.js` 加入 CORE/CORE_FILES，确保 PWA 离线可用
- `dist/auth.js`
  - 仅将 CloudBase SDK query 从 `?v=15` 升至 `?v=16`，同步逻辑未改
- `scripts/verify-history.js`
  - 覆盖单日统计、空白日、月历、28 天趋势、按能力拆分

## Confirmed facts
- `history.js` 已在沙盒通过 `node --check`
- `scripts/verify-history.js` 在沙盒运行 `ALL_PASS`（10 项）
- 浏览器脚本模型已用 VM 桩验证：可包装现有 `render()`，进入 growth 页后注入入口；`open()` 与 `openDay()` 能生成月历/详情 HTML
- `main...feature/growth-history-v1` 当前仅改历史功能相关文件、缓存接线和资源版本；未改 `app.js/growth-events.js` 业务语义

## Blocker / local Agent must finish
当前 `scripts/verify.js` 仍固定 `APP_ASSET_V=15` / `SW_CACHE_V='growth-v14'`，所以完整回归在版本断言处会失败。GitHub 连接器只支持整文件替换，无法安全做小范围补丁；请本地 Agent 完成下面最小修改后推到同一分支：

1. `scripts/verify.js`
   - `APP_ASSET_V = 16`
   - `SW_CACHE_V = 'growth-v15'`
   - 资源版本断言列表加入 `history.css`、`history.js`
   - 语法检查列表加入 `history.js`
   - 可选：在主流程调用或等价覆盖 `scripts/verify-history.js`
2. `AGENTS.md`
   - 架构中补充 `dist/history.js`：成长足迹只读派生层，不产生事件
   - 回归命令补充 `node scripts/verify-history.js`
3. 运行：
   ```bash
   node --check dist/history.js
   node scripts/verify-history.js
   node scripts/verify.js
   ```
   必须全部通过。
4. 浏览器本地启动：
   ```bash
   py -m http.server 8080 -d dist
   ```
   检查成长页入口、月历翻月、日期详情、移动端宽度、离线重开。

完成后把本 handoff 改为 `ready_for_review`，并保留测试结果。

## Product boundaries
- 不做连续打卡、排行榜、红黄绿评分、AI 评价
- 不允许编辑历史
- “提醒后完成”不扣分、不用负面颜色
- 趋势表达的是“记录到的练习”，不要把原始次数直接解释为能力提升
