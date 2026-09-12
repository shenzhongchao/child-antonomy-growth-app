// 云端配置：只需要改这里。
//
// envId 在腾讯云 CloudBase 控制台 → 环境 → 环境总览 里复制（长得像 today-i-control-1g8xxxx）。
// 还没开通时保持 'YOUR-ENV-ID' 即可，应用会照常以本地模式运行，只是没有云同步。
//
// 完整开通步骤见仓库根目录的 CLOUD.md。
window.GROWTH_CLOUD = {
  envId: 'YOUR-ENV-ID',

  // 云数据库里存孩子档案的集合名。改了这里，控制台也要建同名集合。
  profiles: 'profiles',

  // 保存后多久上传一次（毫秒）。孩子连续点按时会合并成一次上传。
  pushDelay: 1500,
};
