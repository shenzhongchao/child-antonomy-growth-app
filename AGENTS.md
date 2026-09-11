# AGENTS.md

小体积原生 JS 项目「今天我做主」（儿童自主力成长应用）：纯 HTML/CSS/JS，无 npm、无构建步骤、无测试、无 CI、无 lint。所有 UI 文案均为简体中文。仓库中没有其他指令文件或 OpenCode 配置。

## 布局 — `dist/` 是源码，而非构建输出

- `dist/` (`index.html`, `app.js`, `styles.css`, 3 张 png) 是 Web 应用的**可编辑源码**。尽管它叫 "dist"，但它必须被 git 追踪（已在 `.gitignore` 中修复）。
- `desktop/GrowthApp/www/` 是 `dist/` 的生成副本（由桌面构建创建）——请勿编辑。
- `desktop/packages/` = 下载好的 WebView2 NuGet 缓存；`desktop/GrowthApp/` = 构建输出。两者均已被 gitignore。
- `.openai/hosting.json` 是已废弃的托管网站遗留配置；对本地运行无影响。

## 运行

- Web: `python -m http.server 8080 -d dist` (或 Windows 下使用 `py -m ...`)，打开 http://localhost:8080。localStorage 持久化需要同源，因此不能使用 `file://` 协议。
- 桌面端 (Windows, 从仓库根目录运行): `powershell -ExecutionPolicy Bypass -File desktop\build.ps1` (可加 `-Shortcut` 参数以创建桌面快捷方式)。

## 桌面构建 (`desktop/build.ps1`)

- 仅需系统自带的 .NET Framework 4.x `csc.exe`；无需 SDK/dotnet/MSBuild。可直接运行。
- 步骤：复制 `dist/*` → `desktop/GrowthApp/www`；将 WebView2 SDK 1.0.992.28 (nupkg) 下载至 `desktop/packages`；使用 `dist/star-friend.png` 在 `desktop/app.ico` 重新生成 `app.ico`；编译 `desktop/Program.cs`。因此，编辑 Web 应用时总是先修改 `dist/`，然后再重新构建；仅在需要更改 WebView 行为时才编辑 `desktop/Program.cs`。

## 架构（单应用文件）

- `dist/app.js` (~20KB, 65 行，行很长)：全局状态 `s` 从 localStorage 键 `self-growth-v1` 加载；`save()` 持久化该状态；`render()` 通过字符串模板和内联 `onclick` 处理程序重新渲染整个四页面 UI（今天/计划/成长/奖励）。
- 桌面桥接 (`Program.cs`)：启动时将 `~/.growth/data.json` 注入到页面的 localStorage 中，并挂钩 `save()` 以便将更改写回磁盘。此处 `app.js` 中**没有**任何针对桌面的代码——保持 `save()` 和 localStorage 键名不变。
- Web 应用数据存储在浏览器 localStorage 中；桌面端数据保存在 `~/.growth/data.json` 中。两者是独立的源（origin），因此记录不会互通。

## 强约束与易踩坑点

- 保持数据兼容性：基于键名 `self-growth-v1` 和由 `blank()` 定义的现有结构 (`days/stars/counts/rewards/name/goal/graduated/prices`)——真实的儿童记录依赖于此；没有迁移机制，请勿重命名或重构字段。
- 通过 PowerShell 读取文件时，请显式指定 `-Encoding UTF8`；文件为 UTF-8 编码，PS 5.1 控制台中显示的乱码仅仅是控制台显示问题（已使用 `node --check dist/app.js` 验证）。
- 编辑前请先运行 Node 语法检查：`node --check dist/app.js`。由于行很长，编辑时切勿使用贪心的全文匹配方式（即避免容易误匹配的多行编辑）。
- 家长面板 PIN 码为 1234——仅用于防误触，并非安全机制。需保留此行为。
- 回归验证：`node scripts/verify.js`（语法检查 + 桩测试 + WebView2 真实渲染验证，截图存 `scripts/shots/`；无 WebView2 环境时用 `node scripts/verify.js --stub`）。改完 `dist/` 后必须跑一遍，全绿再提交。手动验证仍可运行服务器，检查四个页面 + 家长面板，并确认完成任务时会加分（重复完成会被阻止）。
