using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace GrowthApp
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            bool createdNew;
            using (Mutex mutex = new Mutex(true, "GrowthApp.SingleInstance", out createdNew))
            {
                if (!createdNew)
                {
                    MessageBox.Show("程序已经在运行，请查看任务栏。", "今天我做主");
                    return;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            }
        }
    }

    internal class MainForm : Form
    {
        private readonly WebView2 browser = new WebView2();
        private readonly string growthDir;
        private readonly string dataFile;

        public MainForm()
        {
            string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            growthDir = Path.Combine(home, ".growth");
            dataFile = Path.Combine(growthDir, "data.json");

            Text = "今天我做主 · 自主力成长";
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new System.Drawing.Size(1060, 720);
            MinimumSize = new System.Drawing.Size(860, 560);

            browser.Dock = DockStyle.Fill;
            Controls.Add(browser);

            try
            {
                Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch
            {
            }

            Load += OnLoad;
        }

        private async void OnLoad(object sender, EventArgs e)
        {
            try { Directory.CreateDirectory(growthDir); } catch { }

            CoreWebView2Environment env;
            try
            {
                env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(growthDir, "profile"));
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "未检测到 Microsoft Edge WebView2 运行时，无法显示应用。\n\n"
                    + "请先免费安装（约 2 MB，需要网络）：\n"
                    + "https://go.microsoft.com/fwlink/p/?LinkId=2124703\n\n"
                    + "详细信息：" + ex.Message,
                    Text);
                Close();
                return;
            }

            await browser.EnsureCoreWebView2Async(env);
            CoreWebView2 core = browser.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;
            core.WebMessageReceived += OnWebMessage;
            core.DocumentTitleChanged += delegate { Text = core.DocumentTitle; };
            core.NavigationCompleted += async (s2, e2) => await MirrorToDataFileAsync();
            await core.AddScriptToExecuteOnDocumentCreatedAsync(BuildPreloadScript());

            string entry = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www", "index.html");
            if (!File.Exists(entry))
            {
                MessageBox.Show("未找到 www\\index.html。\n请保持 www 文件夹与 GrowthApp.exe 在同一目录内。", Text);
                Close();
                return;
            }
            core.Navigate(new Uri(entry).AbsoluteUri);
        }

        // 把 .growth/data.json 里保存的记录恢复进 localStorage，让页面正常读取
        private string BuildPreloadScript()
        {
            string data = "null";
            try
            {
                if (File.Exists(dataFile))
                {
                    string text = File.ReadAllText(dataFile).Trim();
                    if (text.StartsWith("{")) data = text;
                }
            }
            catch { }
            return "(function(){var orig=localStorage.setItem.bind(localStorage);"
                + "try{var d=" + data + ";if(d&&typeof d==='object'){orig('self-growth-v1',JSON.stringify(d))}}catch(e){}"
                + "localStorage.setItem=function(k,v){if(k==='self-growth-v1'){try{window.chrome.webview.postMessage(v)}catch(e){}}orig(k,v)};"
                + "})();";
        }

        // 页面每次保存时接收数据并落盘
        private void OnWebMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string value = e.TryGetWebMessageAsString();
                if (!string.IsNullOrEmpty(value) && value.TrimStart(new[] { ' ', '\r', '\n', '\t' }).StartsWith("{"))
                {
                    try { Directory.CreateDirectory(growthDir); } catch { }
                    File.WriteAllText(dataFile, value);
                }
            }
            catch { }
        }

        // 页面加载完成后读取一次当前数据并写入文件（首次运行也会生成 data.json）
        private async Task MirrorToDataFileAsync()
        {
            try
            {
                string raw = await browser.CoreWebView2.ExecuteScriptAsync("localStorage.getItem('self-growth-v1')");
                string value = null;
                try { value = new JavaScriptSerializer().Deserialize<string>(raw); } catch { }
                if (!string.IsNullOrEmpty(value) && value.TrimStart(new[] { ' ', '\r', '\n', '\t' }).StartsWith("{"))
                {
                    try { Directory.CreateDirectory(growthDir); } catch { }
                    File.WriteAllText(dataFile, value);
                }
            }
            catch { }
        }
    }
}
