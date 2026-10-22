居中 UI 相机下，地板触摸曾把 UI 坐标直接当作世界坐标；动态 EditBox 的自动 Sprite 又与同节点 Graphics 争用 UI 渲染入口。本次通过实际相机转换触摸坐标，将输入背景移到子节点，在 inactive 状态绑定标签并按左上锚点初始化。

将联网初始化放到组件 start，防止组件构造期间读取受限浏览器存储；销毁后拒绝延迟请求／消息更新，留言层显式停止背后移动目标。

保留 CharacterView／WorldView，在显示层增加可选四方向 idle／walk Clip 和旧通用动画回退；动画按槽位别名注册，避免同名 Clip 混用。按落脚点 Y 排序并使用稳定名字打破同 Y 平局。统一 256×256 透明 RGBA 素材、落脚点、帧命名与导入说明。

服务端、身份、共享协议、存档、Home 场景 UUID 与空人物绑定保持不变。没有人物图片、人物设定变更、新玩法、地图扩展或生产部署。

验证已在 Linux / Node.js 24 完成：

- `npm run check`、`npm run check:client`：通过。
- `npm test`：原有 15 项真实本地 workerd／WebSocket／SQLite 集成测试通过。
- `npm run test:assets`：原有 7 项资源审计测试通过。
- `npm run test:client`：12 项显示决策与连接生命周期回归测试通过；未加载或模拟 Cocos 引擎。
- `git diff --check`：通过。

**没有运行 Creator 3.8.8 编辑器，未验证实际导入、WebGL 渲染、触摸、EditBox、Animation 播放或 Web Mobile 构建。** Windows 完整操作与待验证清单见 `docs/WINDOWS_PHASE2.md`；源码证据与验收边界见 `docs/PHASE2.md`。需要本地完成这些检查后再作运行验收，静态／Node 测试不代表引擎运行成功。
