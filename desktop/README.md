# 桌面版（一键打开）

把 `dist` 网页应用打包成一个独立的小程序（Windows），双击 `GrowthApp.exe` 即可打开，不需要浏览器和本地服务器。

## 产物

- `GrowthApp/` 目录：完整可分发的 App（约 1.5 MB）
  - `GrowthApp.exe` 主程序（双击运行）
  - `www/` 就是 `dist` 的网页文件副本
  - `Microsoft.Web.WebView2.Core.dll`、`Microsoft.Web.WebView2.WinForms.dll`、`WebView2Loader.dll`：WebView2 运行时包装

把整个 `GrowthApp` 文件夹复制到任意 Windows 10/11 电脑，双击 exe 即可使用。之前已经打过一次包的话，也可运行 `.\build.ps1 -Shortcut` 在桌面创建"今天我做主"快捷方式。

## 数据保存位置

数据不放在浏览器里，而是保存在当前用户的本地目录：

- `~/.growth/data.json`：孩子的全部成长记录（JSON，可直接备份）
- `~/.growth/profile/`：WebView2 内部缓存

任何时候都可以备份/恢复：复制 `data.json` 即可。想完全恢复初始状态，删除整个 `C:\Users\<用户名>\.growth` 文件夹。

## 运行前提

Windows 10（21H2+）/ Windows 11 自带 Microsoft Edge WebView2 运行时。老系统若提示缺少，请安装免费 Evergreen 引导程序：https://go.microsoft.com/fwlink/p/?LinkId=2124703 （约 2 MB）

## 如何构建（开发者）

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1
```

流程：

1. 清空 `desktop\GrowthApp\www` 后复制 `dist\*` 过去（严格镜像，避免残留已从 `dist\` 删除的文件）
2. 下载/解压 WebView2 SDK 1.0.992.28（NuGet 包，仅含托管 DLL，缓存在 `desktop\packages`）
3. 用 `assets\star-friend.png` 生成 `app.ico`（16/32/48/256 多尺寸；GDI+ 解不了 WebP，故取 `assets` 中的 PNG 原图）
4. 用系统自带 `csc.exe`（.NET Framework 4.x，无需安装任何 SDK）编译 `Program.cs`

`Program.cs` 做了三件事（数据桥接）：

- 启动时读取 `~/.growth/data.json`，通过 `AddScriptToExecuteOnDocumentCreated` 预先写进页面 localStorage，所以 app.js 无需任何修改
- 包装 `localStorage.setItem`，页面每次 `save()` 都会原样把记录发送回主程序，写入 `data.json`
- 每次页面加载完成后读取一次 localStorage 回写 `data.json`

网页版（浏览器双击 index.html 或本地服务）保持原样可用，不受影响。
