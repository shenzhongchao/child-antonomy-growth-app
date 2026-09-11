// WebView2 验证宿主：在真 Chromium（桌面端同款引擎）里加载页面，
// 等待指定毫秒后导出 DOM（outFile）并截图（outFile.png）。
// 可选第 4 个参数：导出前先执行一段 JS（用于触发交互/埋探针）。
// 由 scripts/verify.js 自动编译调用，无需手动操作。
using System;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

class Harness {
  [STAThread]
  static void Main(string[] args) {
    Application.Run(new HForm(args[0], args[1], int.Parse(args[2]), args.Length > 3 ? args[3] : null));
  }
}

class HForm : Form {
  WebView2 wv; string url, outFile, evalJs; int waitMs;
  public HForm(string u, string o, int w, string ev) {
    url = u; outFile = o; waitMs = w; evalJs = ev;
    Width = 480; Height = 900;
    StartPosition = FormStartPosition.Manual;
    Location = new Point(-2500, 100); // 移出屏幕，不打扰用户
    ShowInTaskbar = false;
    wv = new WebView2 { Dock = DockStyle.Fill };
    Controls.Add(wv);
    Load += OnLoad;
  }
  async void OnLoad(object s, EventArgs e) {
    try {
      var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "growth-verify-wv2"));
      await wv.EnsureCoreWebView2Async(env);
      wv.CoreWebView2.Navigate(url);
      await Task.Delay(waitMs);
      if (evalJs != null) {
        await wv.CoreWebView2.ExecuteScriptAsync(evalJs);
        await Task.Delay(1800);
      }
      string html = await wv.CoreWebView2.ExecuteScriptAsync("document.documentElement.outerHTML");
      File.WriteAllText(outFile, html);
      try {
        using (var fs = File.Create(outFile + ".png"))
          await wv.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, fs);
      } catch {}
    } catch (Exception ex) {
      File.WriteAllText(outFile, "\"ERROR: " + ex.Message.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"");
    }
    Application.Exit();
  }
}
