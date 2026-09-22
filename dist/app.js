
const tasks=[['bag','自己整理书包','看看课表，把明天要用的装好','整理小达人'],['book','自己开始学习','到约好的时间，自己开始','自主学习者'],['clock','按计划完成','照着自己安排的顺序做','时间魔法师'],['star','做完自己检查','做完以后，再看一遍','检查小侦探'],['ball','自己收好玩具','玩完了，让玩具回家','物品管理师'],['heart','到点结束娱乐','约好的时间到了，自己停下来','约定守护者']];
const rewards=[['📖','故事我来选','选一本今晚想读的故事',5],['🎲','家庭游戏我来选','和家人约好一起玩的游戏',8],['🍜','晚饭我来选','从家长给出的三样中选择',10],['🌳','周末去哪里','一起选一次户外活动',15],['🎬','家庭电影之夜','从合适的影片里选一部',12],['🧭','专属活动我来定','和爸爸或妈妈一起安排',15]];
const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const blank=()=>GrowthEvents.blank();
const STORE_KEY='self-growth-v2';
const localId=p=>p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const freshStore=()=>({version:2,deviceId:localId('d'),profileId:localId('p'),userId:null,sequence:0,lastServerSeq:0,lastSync:0,confirmedState:null,state:blank(),pending:[]});
let growthStore;
try{growthStore=JSON.parse(localStorage.getItem(STORE_KEY));if(!growthStore||growthStore.version!==2||!growthStore.state||!Array.isArray(growthStore.pending))throw 0}catch{growthStore=freshStore()}
growthStore.deviceId=growthStore.deviceId||localId('d');growthStore.profileId=growthStore.profileId||localId('p');growthStore.sequence=Number(growthStore.sequence)||0;growthStore.lastServerSeq=Number(growthStore.lastServerSeq)||0;if(!growthStore.confirmedState)growthStore.confirmedState=null;
let s=GrowthEvents.norm(growthStore.state),page='today',picks=[],parentOpen=false,toastTimer;
const $=id=>document.getElementById(id);const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function persistStore(){growthStore.state=s;try{localStorage.setItem(STORE_KEY,JSON.stringify(growthStore))}catch{toast('未能保存，请检查浏览器存储空间')}}
function eventOf(type,data={}){growthStore.sequence++;return Object.assign({id:GrowthEvents.newId(growthStore.deviceId,growthStore.sequence),type,t:Date.now()},data)}
function save(events){let list=events?(Array.isArray(events)?events:[events]):[];list.forEach(e=>growthStore.pending.push(e.id?e:eventOf(e.type,e)));persistStore();try{if(list.length&&window.Cloud&&window.Cloud.markDirty)Cloud.markDirty()}catch(e){}return list}
function mergeGrowth(remote,ackIds,profileId,userId,lastServerSeq){const ack=new Set(ackIds||[]);growthStore.pending=growthStore.pending.filter(e=>!ack.has(e.id));const base=GrowthEvents.norm(growthStore.confirmedState||GrowthEvents.blank());growthStore.confirmedState=GrowthEvents.advance(base,remote||[]);const max=Math.max(Number(growthStore.lastServerSeq)||0,Number(lastServerSeq)||0);growthStore.profileId=profileId||growthStore.profileId;growthStore.userId=userId||growthStore.userId;growthStore.lastServerSeq=max;growthStore.lastSync=Date.now();s=GrowthEvents.project(growthStore.confirmedState,growthStore.pending.map((e,i)=>Object.assign({},e,{order:max+i+1})));persistStore();render()}
window.GrowthStore={read:()=>growthStore,eventOf,merge:mergeGrowth,persist:persistStore,dropPending:(ids)=>{const set=new Set(ids||[]);growthStore.pending=growthStore.pending.filter(e=>!set.has(String(e.id)));persistStore()},setAccount:(profileId,userId)=>{growthStore.profileId=profileId;growthStore.userId=userId;persistStore()}};
persistStore();
function today(){return s.days[dayKey()]??=( {selected:[],done:{},plan:['吃点心','玩20分钟','学习时间','自由时间','整理书包'],planned:false,mood:null,note:''})}function toast(t){$('notice').innerHTML='<div class="toast">'+esc(t)+'</div>';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('notice').innerHTML='',2600)}function art(k){return '<span aria-hidden="true" class="art '+k+'"></span>'}function show(html){$('modal').innerHTML='<button class="close" aria-label="关闭" onclick="closeModal()">×</button>'+html;if(!$('modal').open)$('modal').showModal()}function closeModal(){$('modal').close()}function go(p){page=p;render();window.scrollTo(0,0);const m=$('main');m.classList.remove('page-in');void m.offsetWidth;m.classList.add('page-in')}
const mascot = (cls='mascot') => `<img class="${cls}" src="star-friend.webp" alt="" decoding="async">`;
let starRollFrom=null;
const wallet = () => `<span class="balance" aria-label="${s.stars}颗星星">${mascot('wallet-star')} <span class="balance-num">${starRollFrom??s.stars}</span><small>颗星星</small></span>`;
const heading = (tag,title,desc) => `<div class="page-heading"><div><p class="eyebrow">${tag}</p><h1>${title}</h1><p class="sub">${desc}</p></div>${mascot()}</div>`;
const sticker = k => `<span class="sticker">${art(k)}</span>`;
const taskLabel = ['整理小达人','自主学习者','时间魔法师','检查小侦探','物品管理师','约定守护者'];
function render() {
  const d=today(), n=Object.keys(d.done).length;
  const tabs=[['today','☀️','今天'],['plan','🎒','我的一天'],['growth','🌱','成长'],['rewards','🎁','奖励屋']];
  $('nav').innerHTML=tabs.map(([id,icon,label])=>`<button class="${page===id?'active':''}" ${page===id?'aria-current="page"':''} onclick="go('${id}')"><span class="navicon" aria-hidden="true">${icon}</span>${label}</button>`).join('')+`<div class="navfriend">${mascot()}<p>我是小星星，<br>陪你练习自己做主！</p></div>`;
  let html='';
  if(page==='today'){
    html=`<div class="row"><p class="eyebrow">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</p>${wallet()}</div>
    <section class="story-hero"><img class="scene" src="storybook-scene.webp" alt="小星星和小兔背着书包，在开满花的小路上出发" fetchpriority="high"><div class="story-copy"><span class="story-tag">✦ 小小成长，大大本领</span><h1>今天，<br>我来做主！</h1><p>你好，${esc(s.name)}<br>和小星星一起，试试自己来。</p></div></section>
    <div class="row sectionhead"><h2><span class="sectionicon" aria-hidden="true">🎯</span>我的小挑战 <span class="count">${n} / ${d.selected.length}</span></h2><button class="link" onclick="choose()">${d.selected.length?'换一换':'自己选挑战'}</button></div>`;
    if(d.selected.length){
      html+=`<div class="cards">${d.selected.map((i,pos)=>`<article class="task ${d.done[i]?'done':''}">${sticker(tasks[i][0])}<div class="copy"><div class="task-kicker">挑战 ${String(pos+1).padStart(2,'0')} · ${taskLabel[i]}</div><h3>${tasks[i][1]}</h3><div class="sub">${d.done[i]?(d.done[i]==='self'?'自己想起来的 · 收获 1 颗星':'提醒后完成 · 今天也有练习'):tasks[i][2]}</div></div><button class="donebutton" aria-label="完成${tasks[i][1]}" ${d.done[i]?'disabled':''} onclick="complete(${i},event)"><span aria-hidden="true">${d.done[i]?'✓':'+'}</span><small>${d.done[i]?'完成啦':'我做完了'}</small></button></article>`).join('')}</div>`;
    }else{
      html+=`<div class="empty-challenges"><div class="sticker-trio" aria-hidden="true">${['bag','book','clock'].map(sticker).join('')}</div><h3>今天，想试试哪件事？</h3><p class="sub">从 1 个小挑战开始，最多选 3 个。</p><button class="primary gold" onclick="choose()">✦ 挑选我的小挑战</button></div>`;
    }
    html+=`<button class="plan-link" onclick="go('plan')"><span class="plan-mini" aria-hidden="true">🗓️</span><span class="copy"><strong>${d.planned?'我的一天，安排好啦':'我的一天，我来安排'}</strong><span class="sub">${d.planned?'点开看看今天的小计划':'先学习还是先玩？你来排一排'}</span></span><span aria-hidden="true">→</span></button>
    <div class="mood-panel"><div class="row sectionhead"><h2>今天的心情颜色</h2><span class="sub">想说就说</span></div><div class="moods">${['😄','🙂','😐','🙁','😴'].map((x,i)=>`<button class="${d.mood===i?'chosen':''}" aria-label="${['开心','不错','一般','有点烦','好累'][i]}" aria-pressed="${d.mood===i}" onclick="mood(${i})"><span style="font-size:inherit;line-height:1.2" aria-hidden="true">${x}</span><span>${['开心','不错','一般','有点烦','好累'][i]}</span></button>`).join('')}</div></div>
    ${d.note?`<div class="note"><h3>💌 给你的一句话</h3><p>${esc(d.note)}</p></div>`:''}<p class="footnote">每天一点点，慢慢来就很好。</p>`;
  }
  if(page==='plan'){
    const emojis={'吃点心':'🍎','玩20分钟':'⚽','学习时间':'📚','自由时间':'🪁','整理书包':'🎒'};
    html=heading('我的小小时间魔法','我的一天','先做什么？后做什么？')+`<div class="tip"><span aria-hidden="true">💡</span><span>点上下箭头换顺序，再和家长约好时间。</span></div><div class="planbook"><div class="pill">🏡 放学回家啦</div><div class="plan-path">${d.plan.map((x,i)=>`<div class="planrow"><span class="number">${i+1}</span><span class="plan-emoji" aria-hidden="true">${emojis[x]||'🌈'}</span><strong>${esc(x)}</strong><button class="move" aria-label="上移${esc(x)}" ${!i?'disabled':''} onclick="move(${i},-1)">↑</button><button class="move" aria-label="下移${esc(x)}" ${i===d.plan.length-1?'disabled':''} onclick="move(${i},1)">↓</button></div>`).join('')}</div><div class="pill">🌙 洗漱 · 睡觉</div></div><button class="primary gold" onclick="confirmPlan()">✓ 就这样安排！</button><p class="footnote">计划可以一起调整，睡觉时间要留够。</p>`;
  }
  if(page==='growth'){
    html=heading('我的成长徽章册','我正在长本领','星星花掉，本领还在。')+`<div class="tip"><span aria-hidden="true">🌱</span><span>自主完成 ${s.goal} 次，就有第一枚徽章。<br>不用连续，休息一天也没关系。</span></div><div class="grid skill-grid">${tasks.map((t,i)=>{
      const c=s.counts[i],lv=Math.min(3,Math.floor(c/s.goal));
      const nextTarget=Math.min(3,lv+1)*s.goal;
      return `<article class="tile"><div class="skill-badge">${art(t[0])}<span class="badge-level">${s.graduated.includes(i)?'已毕业':lv?'Lv. '+lv:'小小新芽'}</span></div><h3>${t[3]}</h3><span class="pill">${s.graduated.includes(i)?'学会啦 · 继续保持':lv?['','初次解锁','越来越熟练','稳定练习'][lv]:'正在练习中'}</span><div class="skill-stars" aria-label="已获得${lv}级徽章">${Array.from({length:3},(_,j)=>`<span class="${j>=lv?'unearned':''}" aria-hidden="true">${j<lv?'★':'☆'}</span>`).join('')}</div><div class="progress" role="progressbar" aria-label="${t[3]}三级进度" aria-valuemin="0" aria-valuemax="${s.goal*3}" aria-valuenow="${Math.min(c,s.goal*3)}"><span style="width:${Math.min(c/(s.goal*3)*100,100)}%"></span></div><p class="sub">自主完成 ${c} 次${lv<3?` · 再练 ${nextTarget-c} 次升级`:''}</p></article>`;
    }).join('')}</div><button class="primary" onclick="weekly()">📖 一起翻翻这一周</button><p class="footnote">真正学会了，再和家长一起毕业。</p>`;
  }
  if(page==='rewards'){
    const categories=['故事时光','一起玩耍','美味选择','周末探险','家庭时光','专属约定'];
    html=`<div class="row"><p class="eyebrow">我的小小选择权</p>${wallet()}</div><h1 style="margin-top:20px">欢迎来到奖励屋</h1><div class="reward-banner"><span class="rewardicon" aria-hidden="true">🎁</span><div><h3>把星星，变成好时光</h3><p class="sub">先和家长约好，再选一张喜欢的奖励券。</p></div></div><div class="grid reward-grid">${rewards.map((r,i)=>`<article class="tile"><div class="reward-top"><div class="rewardicon" aria-hidden="true">${r[0]}</div><div class="reward-category">${categories[i]}</div></div><div class="reward-body"><h3>${r[1]}</h3><p class="sub">${r[2]}</p><button class="primary gold" ${s.stars<s.prices[i]?'disabled':''} onclick="redeem(${i})">${s.stars<s.prices[i]?'还差 '+(s.prices[i]-s.stars)+' 颗星':'⭐ '+s.prices[i]+' 颗 · 兑换'}</button></div></article>`).join('')}</div><h2 class="sectionhead">🎟️ 我的奖励券</h2>${s.rewards.length?s.rewards.slice().reverse().map(r=>`<div class="receipt">${rewards[r.id][0]} <strong>${rewards[r.id][1]}</strong><div class="sub">${esc(r.date)} · ${r.used?'已一起享受':'已兑换，等家长安排'}</div></div>`).join(''):`<div class="empty-coupons"><span class="rewardicon" aria-hidden="true">🎟️</span><p class="sub">第一张奖励券，会在这里等你。</p></div>`}`;
  }
  $('main').innerHTML=html;
}
function celebrate(type){
  clearTimeout(toastTimer);
  const title=type==='self'?'我看到你的主动啦！':'今天也有小进步！';
  const description=type==='self'?'收好这颗星星，本领也长大一点。':'完成了一次练习，下次再试试。';
  const colors=['#ffc83d','#5db9e3','#ff9fbc','#80ba72','#b99ee1'];
  const confetti=Array.from({length:18},(_,i)=>`<i style="--confetti-color:${colors[i%5]};--dx:${Math.cos(i*2.4)*(80+i*9)}px;--dy:${Math.sin(i*2.4)*(75+i*8)+100}px;--spin:${i*53}deg"></i>`).join('');
  $('notice').innerHTML=`<div class="confetti" aria-hidden="true">${confetti}</div><div class="toast celebration">${mascot()}<div><strong>${title}</strong><small>${description}</small></div></div>`;
  toastTimer=setTimeout(()=>$('notice').innerHTML='',3000);
}

function choose(){picks=[...today().selected];drawChoices()}function drawChoices(){show('<h2>今天想练哪几项？</h2><p class="sub">选 1–3 项。完成过的挑战会保留。</p>'+tasks.map((t,i)=>s.graduated.includes(i)&&!today().selected.includes(i)?'':'<button class="choice task-choice '+(picks.includes(i)?'selected':'')+'" aria-pressed="'+picks.includes(i)+'" onclick="pick('+i+')">'+art(t[0])+t[1]+'<span class="choice-check" aria-hidden="true">'+(picks.includes(i)?'✓':'＋')+'</span></button>').join('')+'<button class="primary" '+(!picks.length?'disabled':'')+' onclick="savePicks()">选好了（'+picks.length+'/3）</button>')}function pick(i){if(today().done[i])return toast('今天已经完成啦，明天再换');if(picks.includes(i))picks=picks.filter(x=>x!==i);else if(picks.length<3)picks.push(i);else return toast('每天最多 3 项，先取消一项吧');sfx.pop();drawChoices()}function savePicks(){today().selected=[...picks];save({type:'pick',day:dayKey(),selected:[...picks]});closeModal();render()}
function complete(i,ev){if(ev)lastClick={x:ev.clientX,y:ev.clientY};
  if(today().done[i]||!today().selected.includes(i))return;
  show(mascot('completion-art')+`<h2>${tasks[i][1]}</h2><p>这次是怎样开始的？</p><button class="choice self-choice" onclick="finish(${i},'self')"><span class="choice-title"><span class="choice-emoji" aria-hidden="true">⭐</span>我自己想起来的</span><span class="sub">记录自主完成，得到 1 颗星</span></button><button class="choice help-choice" onclick="finish(${i},'help')"><span class="choice-title"><span class="choice-emoji" aria-hidden="true">🌱</span>有人提醒我</span><span class="sub">记录这次练习，不扣星星</span></button><p class="sub">诚实记录，下次再试试自己想起来。</p>`);
}
function finish(i,type){if(today().done[i]||!today().selected.includes(i)||!['self','help'].includes(type))return;today().done[i]=type;let lvUp=0;if(type==='self'){const before=Math.min(3,Math.floor(s.counts[i]/s.goal));s.stars++;s.counts[i]++;if(!reducedMotion())starRollFrom=s.stars-1;if(Math.min(3,Math.floor(s.counts[i]/s.goal))>before)lvUp=Math.min(3,Math.floor(s.counts[i]/s.goal))}const grand=type==='self'&&today().selected.length>0&&today().selected.every(x=>today().done[x]==='self');save({type:'task.done',day:dayKey(),task:i,mode:type});closeModal();render();if(lvUp){levelUp(i,lvUp,grand)}else if(grand){grandSlam()}else{celebrate(type);if(type==='self'){sfx.star();flyStar()}else sfx.soft()}}
function levelUp(i,lv,grand){const names=['','初次解锁','越来越熟练','稳定练习'];sfx.levelup();bigBurst();flyStar();show('<div class="levelup">'+mascot('completion-art')+'<p class="eyebrow">徽章升级啦</p><h2>'+tasks[i][3]+' · Lv. '+lv+'</h2><div class="skill-stars big" aria-label="徽章升到 '+lv+' 级">'+Array.from({length:3},(_,j)=>'<span class="'+(j>=lv?'unearned':'')+'" aria-hidden="true">'+(j<lv?'★':'☆')+'</span>').join('')+'</div><p>「'+names[lv]+'」——'+tasks[i][1]+'，你已经自己想起来 '+s.counts[i]+' 次啦！</p><p class="sub">星星可以花掉，本领一直在你身上。</p><button class="primary" onclick="'+(grand?'closeModal();grandSlam()':'closeModal()')+'">太棒了！</button></div>')}
function grandSlam(){const n=today().selected.length;sfx.grandslam();bigBurst();setTimeout(bigBurst,450);flyStar();show('<div class="levelup grandslam">'+mascot('completion-art')+'<p class="eyebrow">今日大满贯</p><h2>全部自己想起来！</h2><div class="skill-stars big" aria-hidden="true"><span>★</span><span>★</span><span>★</span></div><p>今天 '+n+' 项挑战，每一次都是你自己想起来的。</p><p class="sub">这就是「我自己能做主」的样子，为自己鼓鼓掌吧！</p><button class="primary" onclick="closeModal()">为自己鼓掌 👏</button></div>')}
function confirmPlan(){let d=today();d.planned=true;save({type:'plan',day:dayKey(),plan:[...d.plan],planned:true});sfx.soft();toast('安排好了，去试试看！');go('today')}function move(i,k){let d=today();if(i+k<0||i+k>=d.plan.length)return;[d.plan[i],d.plan[i+k]]=[d.plan[i+k],d.plan[i]];d.planned=false;save({type:'plan',day:dayKey(),plan:[...d.plan],planned:false});render();sfx.move()}function mood(i){today().mood=i;save({type:'mood',day:dayKey(),mood:i});render();sfx.mood()}function redeem(i){if(s.stars<s.prices[i])return;show('<h2>'+rewards[i][1]+'</h2><p>使用 '+s.prices[i]+' 颗星星，换一张奖励券。</p><p class="sub">和家长一起约好兑现时间，成长进度不会减少。</p><button class="primary" onclick="confirmReward('+i+')">确定兑换</button>')}function confirmReward(i){if(s.stars<s.prices[i])return;let e=eventOf('reward.redeem',{day:dayKey(),reward:i,cost:s.prices[i]});s.stars-=s.prices[i];s.rewards.push({id:i,date:dayKey(),used:false,eventId:e.id});save(e);closeModal();render();toast('奖励券收好啦！');sfx.reward();bigBurst()}
function recent(){return Array.from({length:7},(_,i)=>{let d=new Date();d.setDate(d.getDate()-6+i);let key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return [key,s.days[key]]})}function weekly(){let rows=recent(),a=0,b=0;rows.forEach(([,d])=>Object.values(d?.done||{}).forEach(t=>t==='self'?a++:b++));show('<h2>这一周的小发现</h2><p class="sub">最近 7 天 · 只统计已记录的挑战</p><div class="grid"><div class="tile"><div class="metric">'+a+'</div><div class="sub">自主完成</div></div><div class="tile"><div class="metric">'+b+'</div><div class="sub">提醒后完成</div></div></div><div class="guide"><table><tr><th>日期</th><th>自己想起 / 提醒后</th></tr>'+rows.map(([k,d])=>'<tr><td>'+k.slice(5)+'</td><td>'+(d&&Object.keys(d.done).length?Object.values(d.done).filter(x=>x==='self').length+' / '+Object.values(d.done).filter(x=>x==='help').length:'未记录')+'</td></tr>').join('')+'</table></div><p>哪件事越来越熟练了？<br>明天想让哪件事更容易一点？</p><p class="sub">“提醒后完成”是任务次数，不是催促次数。未记录的日子不算失败。</p>')}
$('parent').onclick=()=>{parentOpen=false;parents()};
function parents(){
  const cloudState=growthStore.userId?'已开启云端同步':'不登录也能用';
  show('<div class="parent-center"><div class="parent-center-head"><p class="eyebrow">给家长</p><h2>家长中心</h2><p class="sub">先把最重要的三件事说清楚，再按需要调整成长规则。</p></div>'+
    '<section class="parent-hero"><div class="parent-hero-icon" aria-hidden="true">✓</div><div><strong>'+cloudState+'</strong><h3>孩子现在就可以开始使用</h3><p>未登录时，成长记录会保存在当前设备。为了长期保留记录、换设备也能恢复，建议家长登录并开启云端同步。</p><span class="parent-note">孩子不用登录 · 断网也能继续使用</span></div></section>'+
    '<section class="parent-card parent-cloud"><div class="parent-card-title"><span aria-hidden="true">☁️</span><div><h3>长期保存成长记录</h3><p class="sub">登录后自动同步，不需要手动操作。</p></div></div><div id="cloudBox"><p class="sub">正在读取云端同步状态…</p></div></section>'+
    '<section class="parent-card"><div class="parent-card-title"><span aria-hidden="true">📱</span><div><h3>像 App 一样放到手机桌面</h3><p class="sub">以后孩子点一下图标就能打开。</p></div></div><div id="pwaBox"><p class="sub">可将「今天我做主」添加到手机主屏幕。</p></div></section>'+
    '<div class="parent-section-title"><h3>日常设置</h3><span>修改时需要家长确认</span></div>'+
    '<div class="parent-module-grid">'+
      '<button class="parent-module" onclick="openParentSection(\'child\')"><span class="parent-module-icon" aria-hidden="true">👧</span><strong>孩子与成长</strong><small>小名、成长节奏、今日鼓励</small><b aria-hidden="true">›</b></button>'+
      '<button class="parent-module" onclick="openParentSection(\'rewards\')"><span class="parent-module-icon" aria-hidden="true">🎁</span><strong>奖励规则</strong><small>兑换星星与奖励兑现</small><b aria-hidden="true">›</b></button>'+
      '<button class="parent-module" onclick="openParentSection(\'skills\')"><span class="parent-module-icon" aria-hidden="true">🌱</span><strong>技能管理</strong><small>一起决定哪些技能毕业</small><b aria-hidden="true">›</b></button>'+
      '<button class="parent-module" onclick="openParentSection(\'prefs\')"><span class="parent-module-icon" aria-hidden="true">🔊</span><strong>使用偏好</strong><small>提示音等本机体验</small><b aria-hidden="true">›</b></button>'+
    '</div>'+
    '<div class="parent-links"><button class="parent-link-card" onclick="openParentSection(\'data\')"><span>🗂️</span><span><strong>记录与数据</strong><small>导出、恢复与账号退出</small></span><b aria-hidden="true">›</b></button><button class="parent-link-card" onclick="guide()"><span>📖</span><span><strong>使用说明</strong><small>每天怎么用、家长怎么陪</small></span><b aria-hidden="true">›</b></button></div></div>');
  if(window.Cloud&&Cloud.mount)Cloud.mount('cloudBox');
}
function parentSectionLabel(section){return ({child:'孩子与成长',rewards:'奖励规则',skills:'技能管理',prefs:'使用偏好',data:'记录与数据'})[section]||'家长设置'}
function parentGate(section){
  show('<button class="parent-back" onclick="parents()">← 返回家长中心</button><div class="parent-gate"><div class="parent-gate-icon" aria-hidden="true">👨‍👩‍👧</div><h2>请家长确认</h2><p class="sub">即将进入「'+parentSectionLabel(section)+'」。输入 1234 只是为了防止孩子误触，不是安全密码。</p><label>家长确认<input id="gate" inputmode="numeric" type="password" maxlength="4" autocomplete="off" placeholder="请输入 1234"></label><button class="primary" onclick="unlockParentSection(\''+section+'\')">进入设置</button></div>');
}
function unlockParentSection(section){if($('gate').value==='1234'){parentOpen=true;openParentSection(section)}else toast('请让家长输入 1234')}
function openParentSection(section){
  if(!parentOpen)return parentGate(section);
  if(section==='child')return parentChild();
  if(section==='rewards')return parentRewards();
  if(section==='skills')return parentSkills();
  if(section==='prefs')return parentPrefs();
  if(section==='data')return parentData();
}
function parentSectionShell(title,desc,body){
  show('<button class="parent-back" onclick="parents()">← 返回家长中心</button><div class="parent-subpage"><p class="eyebrow">家长设置</p><h2>'+title+'</h2><p class="sub">'+desc+'</p>'+body+'</div>');
}
function parentChild(){
  parentSectionShell('👧 孩子与成长','只调整真正会影响孩子日常体验的内容。','<label>孩子的小名<input id="kidName" maxlength="12" value="'+esc(s.name)+'" placeholder="例如 朵朵"></label><label>每级需要自主完成的次数<select id="goal">'+[3,5,7].map(v=>'<option '+(s.goal===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>今天的一句具体鼓励<input id="note" maxlength="80" value="'+esc(today().note)+'" placeholder="今天你自己想起了整理书包，我看到了"></label><button class="primary" onclick="saveParent()">保存孩子设置</button>');
}
function parentRewards(){
  parentSectionShell('🎁 奖励规则','奖励是选择权和一起相处的好时光，不影响能力成长。','<h3 class="parent-subtitle">兑换需要多少星星</h3>'+rewards.map((r,i)=>'<label>'+r[1]+'<input id="price'+i+'" type="number" min="1" max="99" value="'+s.prices[i]+'"></label>').join('')+'<button class="secondary parent-save-secondary" onclick="savePrices()">保存兑换规则</button><h3 class="parent-subtitle">待兑现奖励</h3>'+(s.rewards.map((r,i)=>'<div class="receipt">'+rewards[r.id][1]+' · '+(r.used?'已兑现':'<button class="link" onclick="useReward('+i+')">确认已兑现</button>')+'</div>').join('')||'<p class="sub">还没有兑换记录。</p>'));
}
function parentSkills(){
  parentSectionShell('🌱 技能管理','稳定两三周后再一起商量。毕业任务不再进入新挑战，历史成长会保留。',tasks.map((t,i)=>'<div class="receipt parent-skill-row"><span>'+t[3]+'</span><button class="link" onclick="graduate('+i+')">'+(s.graduated.includes(i)?'恢复练习':'一起毕业')+'</button></div>').join(''));
}
function parentPrefs(){
  parentSectionShell('🔊 使用偏好','这些设置只影响当前设备，不改变成长记录。','<label class="parent-toggle">提示音效（小喇叭）<input type="checkbox" '+(soundOn()?'checked':'')+' onchange="localStorage.setItem(\'growth-sound\',this.checked?\'on\':\'off\');if(this.checked)sfx.pop()"></label><p class="sub">夜间模式可在页面右上角直接切换；系统设置“减少动态效果”时，页面也会自动减少动画。</p>');
}
function parentData(){
  let restore=growthStore.userId?'':'<button class="secondary" onclick="$(\'restoreFile\').click()">从文件恢复</button><input id="restoreFile" type="file" accept=".json,application/json" style="display:none" onchange="restoreData(this)">';
  let account=growthStore.userId?'<div class="parent-data-status"><strong>☁️ 当前记录已绑定家长账号</strong><p class="sub">换设备登录同一手机号即可恢复。退出账号后，本机记录仍会保留。</p></div><button class="link danger-link" onclick="if(window.Cloud){Cloud.logout();closeModal()}">退出家长账号</button>':'<div class="parent-data-status"><strong>📱 当前仅保存在这台设备</strong><p class="sub">建议先回家长中心开启云端同步；也可以导出记录文件自行保存。</p></div>';
  parentSectionShell('🗂️ 记录与数据','这里放低频的数据维护操作。',account+'<div class="parent-data-actions"><button class="secondary" onclick="backupData()">导出记录文件</button>'+restore+'</div><p class="sub">文件恢复只在未绑定云端账号时提供，避免覆盖云端事件账本。</p>');
}
function saveParent(){if(!parentOpen)return;let name=$('kidName').value.trim(),goal=Number($('goal').value),note=$('note').value.trim(),events=[];if(!name)return toast('先填写孩子的小名');if(name!==s.name){s.name=name;events.push({type:'settings.name',value:name})}if(goal!==s.goal){s.goal=goal;events.push({type:'settings.goal',value:goal})}if(note!==today().note){today().note=note;events.push({type:'note',day:dayKey(),text:note})}save(events);render();parentChild();toast('孩子设置已保存')}
function savePrices(){if(!parentOpen)return;let p=rewards.map((_,i)=>Number($('price'+i).value));if(p.some(x=>!Number.isInteger(x)||x<1||x>99))return toast('星星数请填 1–99 的整数');s.prices=p;save({type:'settings.prices',value:[...p]});render();parentRewards();toast('兑换规则已保存')}
function graduate(i){if(!parentOpen)return;let on=!s.graduated.includes(i);if(on)s.graduated.push(i);else s.graduated=s.graduated.filter(x=>x!==i);save({type:'skill.graduate',task:i,on});render();parentSkills()}
function useReward(i){if(!parentOpen||!s.rewards[i]||s.rewards[i].used)return;let r=s.rewards[i];r.used=true;save({type:'reward.use',rewardId:r.eventId});render();parentRewards()}
function backupData(){if(!parentOpen)return;let out={version:2,exportedAt:new Date().toISOString(),state:GrowthEvents.norm(s)};let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)],{type:'application/json'}));a.download='今天我做主-完整记录-'+dayKey()+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('记录文件已导出，请收好')}
function restoreData(input){if(!parentOpen||growthStore.userId)return toast('已开启云端同步，记录会自动从云端恢复');let f=input.files&&input.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let d=JSON.parse(r.result),st=d&&d.version===2&&d.state;if(!st||typeof st!=='object'||Array.isArray(st)||!st.days||!Array.isArray(st.counts)||!Array.isArray(st.rewards)||typeof st.name!=='string')throw 0;s=GrowthEvents.norm(st);growthStore.pending=[];let e=eventOf('state.import',{payload:s});save(e);render();parentData();toast('记录已恢复，欢迎回来')}catch(e){toast('记录文件无法识别，原记录未改动')}input.value=''};r.readAsText(f)}
function guide(){show('<button class="parent-back" onclick="parents()">← 返回家长中心</button><h2>每天三分钟，一起试试看</h2><div class="guide"><p><strong>不用注册也能开始。</strong>孩子直接使用即可；未登录时记录保存在当前设备，家长登录后会自动同步到云端。</p><ol><li><b>放学后：</b>孩子自己选 1–3 个挑战，在“我的一天”排顺序，与家长一起约定。</li><li><b>完成后：</b>记录是自己想起来的，还是提醒后完成的。自主完成得 1 星，每项每天仅记一次。</li><li><b>积累后：</b>在奖励屋兑换选择权，再由家长安排兑现。兑换不减少能力成长。</li><li><b>睡前：</b>可选一个心情，家长写一句具体鼓励。</li><li><b>周末：</b>在成长页查看最近 7 天，一起想想哪件事需要更少提醒。</li></ol><h3>放到手机桌面</h3><p>回到家长中心的“像 App 一样放到手机桌面”模块，会根据当前手机和浏览器给出对应安装方法。安装后可以从主屏幕直接打开。</p><h3>一起约定</h3><p>奖励主动，不评价题目对错；不扣已经挣到的星星；不要求连续打卡；徽章代表练习积累，毕业由实际表现决定。亲子陪伴和基本关爱始终都有。</p></div>')}

document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();syncTheme()}});render();

// ===== 交互特效：Web Audio 合成音效 + 飞星/彩带动效（无外部资源，遵守系统减少动态设置） =====
let audioCtx,lastClick=null;
const soundOn=()=>localStorage.getItem('growth-sound')!=='off';
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function ac(){if(!audioCtx){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)()}catch{return null}}if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();return audioCtx}
function tone(freq,delay,dur,type,vol){const c=ac();if(!c||!soundOn())return;const o=c.createOscillator(),g=c.createGain();o.type=type||'sine';o.frequency.value=freq;o.connect(g);g.connect(c.destination);const t=c.currentTime+delay;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol||.15,t+.02);g.gain.exponentialRampToValueAtTime(.001,t+dur);o.start(t);o.stop(t+dur+.05)}
const sfx={pop(){tone(660,0,.09,'triangle',.1)},move(){tone(440,0,.07,'triangle',.08)},mood(){tone(520,0,.14,'sine',.1)},soft(){tone(392,0,.22,'sine',.13);tone(523,.13,.3,'sine',.11)},star(){[523,659,784,1047].forEach((f,i)=>tone(f,i*.07,.26,'sine',.15));tone(1568,.3,.4,'sine',.09)},reward(){[523,659,784].forEach((f,i)=>tone(f,i*.09,.2,'triangle',.14));[1047,1319,1568].forEach((f,i)=>tone(f,.28+i*.09,.4,'sine',.12))},night(){tone(523,0,.35,'sine',.12);tone(392,.2,.5,'sine',.1)},day(){tone(392,0,.25,'sine',.1);tone(523,.12,.35,'sine',.12)},levelup(){[392,523,659,784].forEach((f,i)=>tone(f,i*.09,.22,'triangle',.14));[1047,1319,1568].forEach((f,i)=>tone(f,.42+i*.09,.45,'sine',.12));tone(2093,.7,.6,'sine',.07)},grandslam(){tone(262,0,.7,'triangle',.09);[523,659,784,1047].forEach((f,i)=>tone(f,i*.08,.26,'triangle',.15));[1319,1568,2093].forEach((f,i)=>tone(f,.38+i*.1,.55,'sine',.11));tone(1047,.75,.8,'sine',.08)}};
function flyStar(){if(reducedMotion())return;const from=lastClick||{x:innerWidth/2,y:innerHeight/2};const bal=document.querySelector('.balance');const r=bal?bal.getBoundingClientRect():null;const to=r?{x:r.left+22,y:r.top+r.height/2}:{x:innerWidth-70,y:50};const el=document.createElement('img');el.src='star-friend.webp';el.alt='';el.className='fly-star';el.style.left=from.x+'px';el.style.top=from.y+'px';document.body.appendChild(el);const dx=to.x-from.x,dy=to.y-from.y;el.animate([{transform:'translate(-50%,-50%) scale(.4)',opacity:0},{transform:'translate(calc(-50% + '+(dx*.45).toFixed(0)+'px),calc(-50% + '+(dy*.25-90).toFixed(0)+'px)) scale(1.15)',opacity:1,offset:.45},{transform:'translate(calc(-50% + '+dx.toFixed(0)+'px),calc(-50% + '+dy.toFixed(0)+'px)) scale(.85)',opacity:1}],{duration:750,easing:'cubic-bezier(.3,.7,.4,1)'}).onfinish=()=>{el.remove();if(bal){bal.classList.remove('bump');void bal.offsetWidth;bal.classList.add('bump')}rollStars()};setTimeout(()=>{if(starRollFrom!==null)rollStars()},900)}
function rollStars(){const from=starRollFrom;starRollFrom=null;const num=document.querySelector('.balance-num');if(!num)return;const to=s.stars;if(from==null||from===to){num.textContent=to;return}const roll=document.createElement('span');roll.className='num-roll';roll.innerHTML='<span>'+from+'</span><span>'+to+'</span>';num.textContent='';num.appendChild(roll);setTimeout(()=>{num.textContent=to},480)}
function bigBurst(){if(reducedMotion())return;const box=document.createElement('div');box.className='burst';box.setAttribute('aria-hidden','true');const colors=['#ffc83d','#5db9e3','#ff9fbc','#80ba72','#b99ee1','#ff8a5c'];let html='';for(let i=0;i<70;i++){const a=Math.random()*Math.PI*2,r=120+Math.random()*Math.min(innerWidth,innerHeight)*.42;html+='<i style="--confetti-color:'+colors[i%6]+';--dx:'+(Math.cos(a)*r).toFixed(0)+'px;--dy:'+(Math.sin(a)*r+140).toFixed(0)+'px;--spin:'+(Math.random()*720-360).toFixed(0)+'deg;--dur:'+(.9+Math.random()*.7).toFixed(2)+'s"></i>'}box.innerHTML=html;document.body.appendChild(box);setTimeout(()=>box.remove(),1800)}

// ===== 夜间模式：小星星的夜空（手动选择存独立键 growth-theme 并优先；未手动选过时，19:00–7:00 或系统深色自动进入夜间） =====
const themeKey='growth-theme';
function autoTheme(){const h=new Date().getHours();return (h>=19||h<7)||matchMedia('(prefers-color-scheme: dark)').matches?'night':'day'}
function currentTheme(){return localStorage.getItem(themeKey)||autoTheme()}
function applyTheme(t){document.body.classList.toggle('night',t==='night');const b=$('themeBtn');if(b){b.textContent=t==='night'?'☀️':'🌙';b.setAttribute('aria-label',t==='night'?'切换到白天模式':'切换到夜间模式')}const m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='night'?'#1a2350':'#e6f6ff')}
function syncTheme(){const t=currentTheme(),now=document.body.classList.contains('night')?'night':'day';if(t===now)return;applyTheme(t);if(!document.hidden)toast(t==='night'?'天黑啦，小星星出来陪你啦 🌙':'天亮啦，新的一天加油 ☀️')}
function toggleTheme(){const t=document.body.classList.contains('night')?'day':'night';localStorage.setItem(themeKey,t);if(!reducedMotion()){document.body.classList.add('theme-anim');setTimeout(()=>document.body.classList.remove('theme-anim'),650)}applyTheme(t);if(t==='night'){sfx.night();toast('天黑啦，小星星把夜空点亮了 🌙')}else{sfx.day();toast('太阳出来啦 ☀️')}}
if($('themeBtn')){$('themeBtn').onclick=toggleTheme;applyTheme(currentTheme());setInterval(syncTheme,60000)}
