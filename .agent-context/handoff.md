# Agent Handoff

## Task
上线前稳定性修复（不加新功能、不改核心逻辑/视觉）：
1) PWA 首装后离线打开缓存 miss；2) 「恢复旧备份→登录已有云账号」覆盖云端；3) 同步全量拉两遍改增量；4) 分页查询显式按 server_seq 排序。
另做一个小 reducer 修复：pick 保留当天已完成任务。

## Current status
- Status: ready_for_review
- Last agent: opencode
- Branch: 非 git 仓库（无分支）
- Related: docs/development/child-antonomy-growth-app 上线前稳定性修复指令.md

## Goal / acceptance criteria（全部达成）
- [x] 带 `?v=xx` 的核心静态资源可命中预缓存；首次在线打开后断网可完整启动；导航 network-first + 2.5s 兜底逻辑未动；CloudBase SDK 不进 precache
- [x] 云端有历史时本机 state.import 不上传、云端为权威、给家长明确提示；云端无历史时可作为初始基线（新账号迁移）
- [x] pending 上传失败不丢失，恢复后自动重传
- [x] 正常同步只拉 `server_seq > lastServerSeq` 增量；首次登录/旧数据包自动全量
- [x] 事件查询显式 `.order('server_seq', {ascending:true})`；1001 条事件分页无漏、无重复、升序
- [x] pick 保留当天已完成任务（selected = done ∪ 新选择，≤3）
- [x] `node scripts/verify.js` → ALL_PASS（71 项 ok，0 FAIL）

## Files touched
- `dist/growth-events.js`
  - 新增纯函数 `advance(confirmed, newEvents)`（对确认投影按 server_seq 应用增量、id 幂等）、`project(confirmed, pending)`（把 confirmed 打包为基线事件 + pending 重放）、`syncPlan(remote, pending)`（backup 冲突决策）
  - `pick` reducer：selected = 当天已 done 任务 ∪ 新选择（done 优先），上限 3
- `dist/app.js`
  - 数据包新增 `confirmedState` 字段；旧数据包兼容（缺省置 null → 下次同步自动全量重建）
  - `mergeGrowth` 重写：先 advance confirmedState，再 project 出最终 `s`；`GrowthStore` 增加 `dropPending(ids)`
- `dist/auth.js`
  - `listEvents(profileId, afterSeq)` 增量查询 + 显式 `.order('server_seq',{ascending:true})`（分页 size 1000 不变，JS 侧最终 sort 保留为防御）
  - `uploadMissing` 不再依赖全量 remote 去重，upsert `ignoreDuplicates` 保证幂等
  - `syncNow`：fromSeq=lastServerSeq（confirmedState 缺失→0 全量）；首拉后用 `GrowthEvents.syncPlan` 决策；云端有历史 + 本机 pending 含 import → 整体丢弃该批 pending（保守）、toast 提示、云端不受影响；否则正常上传→再拉 delta→merge
  - `ensure()` 支持注入测试桩；`Cloud.__test(app, uid)` 为 verify 钩子
- `dist/sw.js`
  - VERSION → growth-v13；`serveStatic()`：精确匹配 → CORE 白名单文件 `cache.match(req,{ignoreSearch:true})` → fetch + 运行时缓存；SDK 等 ?v=xx 资源不受 ignoreSearch 兜底
- `dist/index.html`
  - 资源引用 `?v=14` → `?v=13` 与 SW VERSION 统一；修复了过程中误写入的 UTF-8 BOM
- `scripts/verify.js`
  - PostgREST 风格假 rdb 桩（profiles/growth_events、server_seq 自增、强制断言显式 order、ignoreDuplicates upsert、可模拟上传失败）
  - 新增回归：分批 merge 与全量 replay 逐字段一致、空增量幂等、场景 A（云端 1001 条历史 + 本机旧备份 → 云端权威、不上传、家长提示）、分页无漏无重复升序、场景 B（增量只命中 3 条、lastServerSeq=1004）、场景 C（新账号备份初始化）、场景 D（上传失败 pending 不丢+重传）、syncPlan 纯策略 ×3、pick 一致性、SW ignoreSearch 命中 ×4（vm 沙盒模拟 Cache API）+ 离线导航兜底

## Confirmed facts
- 增量模型成立：`s = project(advance(上一 confirmedState, delta), pending)` 与全量 `replay(all)` 逐字段一致（verify 实测）
- 1001 条事件分页 = 2 页（1000+1）；假 rdb 强制要求 `.order('server_seq',{ascending:true})`，缺失会抛错（测试曾以此抓住过桩的旧写法）
- `python(-m ...) / py -m http.server` 200 服务 `/` 与 `/app.js`
- 老数据包无 confirmedState 时自动走全量拉取路径，兼容旧设备

## Hypotheses / uncertain points（review 需关注的剩余风险）
- `.order('server_seq', { ascending: true })` 选项对象按 Supabase 风格写，真实 CloudBase rdb 未联调；若签名不同只需改 auth.js 一行
- 云端有历史 + 本机「恢复后的真实新操作」pending 会被整体丢弃（保守策略，家长需重新操作）；toast 只能提示这一次
- 事件顺序内的 pick 兜底假设已被 verify 覆盖，但无双真机验收
- SW 忽略 query 只对 CORE 白名单生效；若未来新增需带 query 缓存的核心文件，记得同步加进 CORE_FILES

## Commands run
```bash
node --check dist/app.js dist/auth.js dist/growth-events.js dist/sw.js
node scripts/verify.js
py -m http.server 8080 -d dist   # 首页 / app.js 均 200
```

## Next steps for reviewer
- 真机联调：CloudBase envId + 手机号登录 + 双设备恢复（重点：场景 A 提示文案、场景 B 增量行为）
- 确认 CloudBase rdb `.order` 签名；必要时改 auth.js 一行
- 建议 commit message：`fix: PWA 旧版本参数缓存兜底；同步改增量；旧备份不覆盖云端；分页显式 server_seq 排序`
