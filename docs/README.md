# 手机试玩入口

此目录供 GitHub Pages 从 `main` 分支的 `/docs` 目录发布，游戏无需登录。

| 入口 | 内容 |
| --- | --- |
| `index.html` | 三款游戏的手机入口页 |
| `elevator-horse/` | 《电梯里禁止变成马》的静态发布文件 |
| `xiaban/` | 《下班别散架》V012 的静态发布文件 |
| `thunderblade/` | 《惊雷·断潮》三境连战版的静态发布文件 |

`xiaban/` 由仓库根目录的 `dist/` 原样复制，包括 `vendor/matter.min.js` 和其 MIT 许可证。更新游戏后需再次同步对应发布目录；这里的复制不修改原游戏、存储键、物理规则或评级规则。电梯游戏的发布文件由该游戏当前已验证版本复制。`thunderblade/` 由仓库 `games/thunderblade/dist/` 的已验证三境连战版本原样复制，保留手机摇杆、斩击、格挡、闪避及全部资源指纹。

所有游戏资源使用目录内的相对路径加载，入口页没有外部字体、框架或网络接口依赖。复制验证按文件 SHA-256 进行，保证字节内容一致。

本机记录依赖浏览器的同源 localStorage。GitHub Pages 与原试玩站点的域名不同，原站存档不会自动迁移；更换浏览器、清理站点数据也可能清除本机记录。代码备份不等于玩家存档备份。

这是持续托管的正式静态地址，适合反复打开。链接持续可用仍取决于仓库与 GitHub Pages 服务保持启用，无法承诺永久可用。手机微信内置浏览器和不同地区网络仍需真实设备验证。

《惊雷·断潮》原公开试玩站点为 https://thunderblade-nightfall-1111.zishu41.chatgpt.site/ ，该域名的战绩不会自动转移到合集。

《下班别散架》另保留原公开试玩站点：https://xiaban-biesanjia-demo-1030.zishu41.chatgpt.site/ 。两处托管使用不同域名，存档互不迁移。

本地预览（从仓库根目录运行）：

```sh
python -m http.server 8765 --directory docs
```
