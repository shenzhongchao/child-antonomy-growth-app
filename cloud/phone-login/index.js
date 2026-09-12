// 二期脚手架：微信小程序端手机号登录（未联调，上小程序时再接）。
//
// 用法（小程序端）：
//   <button open-type="getPhoneNumber" bindgetphonenumber="onPhone">登录</button>
//   async onPhone(e) {
//     const cloudID = e.detail.cloudID;              // 需要 <button> 带 cloudId 能力
//     const { result } = await wx.cloud.callFunction({ name: 'phone-login', data: { cloudID } });
//     await auth.signInWithCustomTicket(result.ticket);
//   }
//
// 部署：把这个目录上传到云开发 → 云函数 → 新建函数 phone-login，入口 index.main。
const cloudbase = require('@cloudbase/node-sdk');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const auth = app.auth();

exports.main = async (event = {}) => {
  const cloudID = event.cloudID;
  if (!cloudID) return { code: 'PARAM_ERROR', message: '缺少 cloudID' };

  // 用 cloudID 在云端换明文手机号（不会把敏感数据暴露到小程序端）
  const opened = await app.getOpenData({ oauthType: 'wechat-openapi', list: [cloudID] });
  const data = opened && opened.list && opened.list[0] && opened.list[0].data;
  const phoneNumber = data && data.phoneNumber;
  if (!phoneNumber) return { code: 'NO_PHONE', message: '未能获取手机号' };

  // uid 统一用手机号，这样和 Web 端短信登录的档案能按 phone 字段对上
  const uid = phoneNumber.replace(/^\+86/, '');
  const ticket = auth.createTicket(uid, { refresh: 60 * 60 * 1000 });

  return { code: 'OK', uid, phone: uid, ticket };
};
