const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const out = process.env.THUNDERBLADE_OUTPUT_DIR ? path.resolve(process.env.THUNDERBLADE_OUTPUT_DIR) : path.resolve(__dirname, '../../outputs/惊雷断潮三境连战版');
const offlineName = '惊雷断潮-三境连战版.html';
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
fs.writeFileSync(path.join(out, '试玩说明.txt'), `惊雷 · 断潮 / 三境连战版 05

默认三位首领连续挑战，每场最多60秒，剩余血量带入下一场。
听雨庭：逐影剑客，金光满时弹反，等连段末刀后反攻。
青篁渡：鸣弦弓手，横移避开三弦箭道，换位穿林箭锁定后可侧移；弹反回箭重创，收弓时近身。
烬火炉：负岳巨像，两次接近满蓄的重斩击碎两层甲片，八秒弱点期间伤害增强；震环、重锤和地火需闪避。
胜场自动恢复最多8点气血，整备时可再恢复最多32点，或选择伤害强化12%（可叠至24%）。
整备期间计时冻结，选择后开启下一场。失败或中途重新挑战会从第一场重开；可先选单场练习。
挑战处决恢复最多10点气血；单场练习恢复最多14点。浮字只显示实际恢复量。

电脑：WASD/方向键移动；轻点J连斩，按住约半秒松开重斩；K格挡，空格闪避；E破防处决；P/Esc暂停。
手机：左下摇杆，右侧斩击/格挡/闪避三角按键；按住斩击蓄力，松开出刀。破防时点处决。
切换后台自动暂停；场间清空按键和多指输入，不会把上一场蓄力带入下一场。
声音默认关闭，可手动开启；柔和特效完整保留危险区和箭道预警。
近身有短步追击，后退不会自动拉回；收刀期间仅缓存下一刀，防御动作优先。

惊雷断潮-三境连战版.html：离线单文件试玩，直接浏览器打开。
浏览器源码/：静态页面源码；微信小游戏源码/：共用引擎和微信Canvas入口。
微信开发者工具导入微信小游戏源码，类型小游戏，实际预览需自己的AppID。
原型未接登录、支付、广告、运营服务；尚未微信真机验证或提审。

模拟只通过正常输入推进，用于发现节奏、流程与平衡问题，不代表真人胜率或留存。
程序绘制人物、首领、场景、动作和特效，程序合成音效；未使用《沧元图》人物、剧情、名称或素材。
`);
console.log('Deliverables written: ' + out);
module.exports = { out, offlineName };
