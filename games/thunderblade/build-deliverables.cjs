const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const out = process.env.THUNDERBLADE_OUTPUT_DIR ? path.resolve(process.env.THUNDERBLADE_OUTPUT_DIR) : path.resolve(__dirname, '../../outputs/惊雷断潮连战完善版');
const offlineName = '惊雷断潮-连战完善版.html';
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'dist/engine.js'), path.join(__dirname, 'wechat/engine.js'));
fs.copyFileSync(path.join(__dirname, 'dist/duel-art.js'), path.join(__dirname, 'wechat/duel-art.js'));
const indexPath = path.join(__dirname, 'dist/index.html');
let index = fs.readFileSync(indexPath, 'utf8');
for (const asset of ['style.css', 'duel-art.js', 'engine.js', 'ui.js']) {
  const digest = createHash('sha256').update(fs.readFileSync(path.join(__dirname, 'dist', asset))).digest('hex').slice(0, 12);
  index = index.replace(new RegExp(asset.replace('.', '\\.') + '(?:\\?[^\"]*)?(?=\")', 'g'), asset + '?v=' + digest);
}
fs.writeFileSync(indexPath, index);
const html = index
  .replace(/<link rel="stylesheet" href="style\.css(?:\?[^\"]*)?">/, () => '<style>' + fs.readFileSync(path.join(__dirname, 'dist/style.css'), 'utf8') + '</style>')
  .replace(/<script src="duel-art\.js(?:\?[^\"]*)?"><\/script>/, () => '<script>' + fs.readFileSync(path.join(__dirname, 'dist/duel-art.js'), 'utf8') + '</script>')
  .replace(/<script src="engine\.js(?:\?[^\"]*)?"><\/script>/, () => '<script>' + fs.readFileSync(path.join(__dirname, 'dist/engine.js'), 'utf8') + '</script>')
  .replace(/<script src="ui\.js(?:\?[^\"]*)?"><\/script>/, () => '<script>' + fs.readFileSync(path.join(__dirname, 'dist/ui.js'), 'utf8') + '</script>');
fs.writeFileSync(path.join(out, offlineName), html);
fs.cpSync(path.join(__dirname, 'dist'), path.join(out, '浏览器源码'), { recursive: true });
fs.cpSync(path.join(__dirname, 'wechat'), path.join(out, '微信小游戏源码'), { recursive: true });
fs.writeFileSync(path.join(out, '试玩说明.txt'), `惊雷 · 断潮 / 连战完善版 04

连续对局与手感调整
仅首次开局固定横斩教学，后续按刀路使用横斩、直刺或迟刃开场。
收刀期间可以预存下一刀，界面显示「续招待发」，不会累积自动连打；格挡、闪避仍优先取消续招。
短步追身只在能接上命中时发生，后撤时不再被拉回；远处空刀不再强行向前吸附。
蓄力、格挡时持刀朝向首领，冲刺朝位移方向；受击姿势不会被蓄力动作盖住。
轻斩第三刀命中返还最多0.35秒闪避冷却，收势重斩有更强爆发。
收势提示随实际窗口结束，不再在下一招起手时遗留旧通知。
处决浮字只展示实际伤害与实际回血。

变招与打击演出
三种首领刀路：逐影刀偏突进追击、镇潮势偏范围镇场、迟刃式偏快慢交错。
同一页面连续三局轮换三种刀路；每种根据距离、阶段与近期招式选择不同组合。
九类招式包含横斩、直刺、交错斩、迟刃蓄斩、逐影突进、坠潮、裂地重劈、潮环、三叠潮涌。
连段最多三刀，各段有独立预警；红招间留足闪避时间，潮环期间不会再叠一条强制闪避危招。
首领连段后有明确收势窗口，不会继续追身，此时追击额外伤害和架势收益。
人物有三段轻斩、蓄刀重斩、格挡、弹反、冲刺、受击与处决动作；首领会提刀、挥刀、收势和受击回摆。
命中加入定向火花、切口与冲击环，三段轻斩及重击、弹反、处决使用不同层次音效。
声音默认关闭，可手动开启；柔和特效保留关键预警与刀路。

本轮调整
左下固定摇杆、右侧紧凑三角按键，长屏控制区下移，短屏按高度适配。
格挡和闪避按下立即触发；增加摇杆死区及回中，多指取消互不打断。
蓄力伤害连续增长，蓄力时走位更轻快；轻斩三连与重斩收益更接近。
格挡与闪避支持冷却结束前0.14秒内的输入缓冲。
保留处决前持续按住的移动；金色攻击前排队的斩击会在防御后追击。
完美弹反后1.2秒内下一刀强化，亮键提示格挡/闪避时机。
人物视觉略放大，减少界面双重震动。

目标
60秒内击败首领。所有出刀由玩家操作，无自动攻击、刷怪或数值升级。
首领有单刃、连刃、狂澜三个阶段，随血量和时间推进。

电脑
WASD / 方向键：走位。
J：点击轻斩，连续三刀；按住约半秒，松开重斩。
K：格挡。金色攻击命中前一瞬触发完美弹反，并立即刷新格挡，可接双连刀。
空格：闪避。红色危招不可格挡，需走出范围或利用闪避穿过。
E / 斩击：首领破防时处决。处决造成爆发伤害并恢复14点气血。
P / Esc：暂停；切换后台自动暂停。

手机
左下固定摇杆走位，松手回中；右侧「斩击」轻点连斩、按住蓄力后松开重斩。
「格挡」「闪避」按下立即触发。支持左手持续走位、右手操作动作键。
破防后「斩击」变为「处决」，点击处决；保持左摇杆，处决后继续原方向走位。

玩法重点
金色刀芒可弹反，红色危险区要闪避；观察预警收满的一瞬。
轻斩衔接快，三连最后一刀更强；重斩更快积累架势。
架势满后有4秒处决窗口；处决后首领会迅速反扑，短暂不积累架势。
近距离出刀带短距追击，仍需留意是否命中。
声音默认关闭，可以手动开启；特效可切换柔和。
最佳战绩保存在当前浏览器，独立于旧版记录。

文件
惊雷断潮-连战完善版.html：无需安装和联网的单文件浏览器试玩。
浏览器源码/：静态网页源码。
微信小游戏源码/：共用引擎与微信Canvas适配入口。
在线地址沿用上一版试玩站，已更新为本版；访问需相应账号。

微信开发者工具
导入「微信小游戏源码」目录，类型选择小游戏。
project.config.json为游客占位AppID；实际开发预览需自己的小游戏AppID。
未接入登录、支付、广告、云存档或运营系统，未做微信真机验证或提审。

验证说明
核心机制与合法控制策略模拟用于发现流程和平衡问题，不能代表真人胜率或留存。
浏览器桌面及手机尺寸检查与微信mock检查不代替真实设备验证。
人物、首领、场景与特效均为原创程序绘制，音效程序合成。
未使用《沧元图》人物、剧情、名称或素材。
`);
console.log('Deliverables written: ' + out);
module.exports = { out, offlineName };
