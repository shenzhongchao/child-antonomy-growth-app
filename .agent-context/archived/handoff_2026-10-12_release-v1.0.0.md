# Agent Handoff

## Task
「小心愿」入口引导优化 + 挑战区小清理：① 奖励屋奖励列表底部引导卡；② 挑选挑战弹窗列表末尾许愿按钮（可交互样式）。今天页引导卡按用户要求已撤掉。另：空状态下隐藏与大按钮重复的「自己选挑战」链接。

## Current status
- Status: released（`v1.0.0` 已打 tag 并推送；`?v=25` / `growth-v24` 已上线并通过线上复核）
- Last agent: 小布（部署 / 发版）/ Kimi（改动）
- Branch: `main`（与 origin/main 同步）
- 发布提交：`06e6488`，tag `v1.0.0`（annotated）

## 改动内容
- `dist/app.js`
  - 奖励屋奖励网格底部（「我的奖励券」之前）新增 `plan-link wish-hint` 引导卡：「✦ 没找到想要的奖励？自己许个愿，家长看过之后就会上架」，`onclick="wishModal()"` 直接打开许愿弹窗。
  - 挑选弹窗 `drawChoices()`：列表末尾、「选好了」按钮之前新增 `.wish-choice` 许愿按钮「✦ 想练的不在上面？许个愿，告诉家长你想挑战的事」，点击直接进「我想挑战的事」表单（`wishKind='task';wishFrom='picker'`），跳过种类二选一。
  - 新增 `wishFrom` 变量：`proposeWish()` 成功时若来自挑选弹窗（`wishFrom==='picker'`），调 `drawChoices()` 返回挑选列表且 `picks` 已选保留，而非关闭弹窗；`wishModal()` 入口会重置 `wishFrom=null`。
  - 「我的小挑战」标题栏右侧链接：空状态下不再渲染（与大按钮重复），已选挑战时仍显示「换一换」（唯一修改入口，保留）。
  - 今天页的 wish-hint 引导卡已按用户反馈移除（2026-10-12 第三轮）。
- `dist/styles.css` 末尾追加：`.wish-hint`（暖黄 #fff6de + 夜间 #453a1c/#a8813a）；`.wish-choice`（实心粉底 #fff0f2 + 粉边 #f0b9c4 + 3px 底部厚边，符合 App 按钮交互语言，与黄色已选挑战区分；夜间 #4a2a33/#a85a6a）。
- 版本：资源 `?v=25`（index.html ×8、auth.js ×1），SW Cache `growth-v24`；`scripts/verify.js` 的 `APP_ASSET_V=25`、`SW_CACHE_V='growth-v24'` 已同步。

## 验证
- `node scripts/verify.js` ALL_PASS。
- 浏览器实测（DOM 级）：奖励屋引导卡直开许愿窗 ✓；挑战区链接空状态隐藏、已选显示「换一换」✓；挑选弹窗许愿按钮 → 挑战许愿表单 → 提交入库（kind=task/pending）→ 返回挑选列表、已选保留 ✓；今天页已无许愿引导卡 ✓；`.wish-choice` 计算样式确认为粉底+厚边 ✓。
- 注意：本地预览时旧 Service Worker 曾拦截新版 app.js 返回旧缓存，清 SW + Cache Storage 后正常——线上靠版本号纪律规避，部署后复核即可。

## 部署结果（2026-10-12 16:3x）
- 回归：`node scripts/verify.js` EXIT=0 / ALL_PASS。
- 部署：`tcb hosting deploy dist -e itonghao-d5gv3zqpl9f36e109` → 21 个文件进根目录 `/`。
- 线上复核（Node fetch no-cache，自定义域名 + 默认域名都比对）：
  - `index.html` 2097 B、`?v=25` × 8、旧版本号 0 处
  - `app.js` 48931 / `styles.css` 41389 / `auth.js` 14916 / `sw.js` 3769 —— 与本地逐字节一致
  - `sw.js` VERSION = `growth-v24`；新文案「没找到想要的奖励？」「想练的不在上面？」均已上线
  - 已删的 `/today/` 仍为 404，无回归。

## Next steps
1. 沿用提醒：手机端实机自检 `docs/pwa-device-checklist.md`；SSL 证书 2026-12-21 到期需换绑。
2. 提示：部署后用手机打开若仍是旧版，清一次浏览器的 Service Worker / 站点数据（本地预览时出现过 SW 返回旧 app.js 的情况）。
3. 后续迭代从这里起：`v1.0.0` 已冻结为功能完善基线，改动务必继续保持 `?v` 与 SW `VERSION` 双递增。

## 产品边界（保持不变）
- 纯 UI 引导与流程衔接，不产生新事件类型、不改状态字段；local-first；历史只读；PIN 仅防误触。
