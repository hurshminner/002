# Phase 2 工程检查与本地验收交接

基线为 GitHub `hurshminner/002` main 的 `30e10fc6772f954371b6582058fd4b502380ea22`。开发分支 `phase2/cocos-runtime-art-preparation`，不合并 main，不部署生产服务。两个人物仍为占位角色；正式素材、角色设定与 one／two 对应关系都未绑定。

## 当前结论

工程具备 Dashboard 导入所需结构，Home／Bootstrap／PlanetGame 的 UUID、组件所属和资源引用通过静态检查，可以在本地尝试直接导入。**云端没有 Creator 3.8.8 编辑器；本报告不能确认实际导入成功、场景正常渲染或 Web Mobile 构建成功。**

静态结构未发现需要重建 Home.scene 的证据，保留原场景、脚本 UUID 和六个空美术槽位。WorldView／CharacterView 架构保留；服务端、共享协议、身份和存档字段没有改动。

## 有证据的运行风险与处理

核对官方 Cocos 3.8.8 引擎标签提交 `411f98df047c25902f93440d4b22925c2fb65461`。下列是源码契约与修复，**不是实际运行录像／编辑器复现结果**。

| 问题 | 证据 | 本轮处理与仍需验证部分 |
| --- | --- | --- |
| 触摸坐标空间混用 | `touch.ts:getUILocation` 做 UI 缩放转换；本工程 Canvas／相机中心为世界 0，而 `UITransform.convertToNodeSpaceAR` 要世界坐标；引擎 `UITransform.hitTest` 使用相机 screenToWorld | 改为 `getLocation → 当前 UI Camera.screenToWorld → room.convertToNodeSpaceAR`。本地需点中心与四角确认实际落点 |
| EditBox 与背景 Graphics 争用同一渲染入口 | `edit-box.ts:onEnable/_ensureBackgroundSprite` 自动在输入节点加 Sprite；`ui-renderer.ts:__preload` 将 renderer 写到唯一 `node._uiProps.uiComp` | Graphics 移到独立背景子节点，避免被后加的 Sprite 覆盖。背景在节点激活后绘制；实际颜色和输入焦点待验证 |
| 输入标签初始化与锚点不匹配 | `EditBox.__preload` 初始化标签和尺寸；`_updateLabelPosition` 把标签定位到输入框左上角，原标签使用中心锚点 | 在节点 inactive 时绑定自定义标签，设置 (0,1) 锚点，激活后让引擎统一布局，避免自动创建多余标签。桌面和软键盘布局待验证 |
| 组件构造时访问浏览器状态 | `Node.addComponent` 先执行构造函数再绑定 node 和激活；原 `PlanetGame` 字段初始化创建网络对象并立即读取 localStorage | 网络初始化移入 start，localStorage 延迟到既有 try/catch 内读取，防止受限存储 getter 使组件构造失败 |
| 异步返回晚于场景销毁 | resume／login 含 await，原 dispose 后仍可更新 player，UI Promise 仍引用旧节点 | disposed／stopped 守卫，dispose 清除当前连接与在线标志；异步登录回调检查节点。新增真实传输代码的延迟返回回归测试；Play/Stop 编辑器生命周期仍待人工验证 |
| 模态留言簿期间旧移动目标残留 | 原打开留言簿不清目标，touch 也只检测登录层 | 清目标并显式追踪留言层，避免背后继续接受目标／重复叠加同一面板 |
| 同名动画资源选错 | 原初始化按 Clip.name 去重，播放也使用 name；不同文件可有同名内部 Clip | 按属性槽位注册别名，方向选择不依赖素材内部名称；Animation.addClip(clip, alias) 为 3.8.8 支持的 API |

其余核对：Camera.onLoad 会创建相机；现有正交投影、UI_2D 可见层、Canvas.cameraComponent 用法符合公开接口；Graphics 构造和 fill 初始化路径存在；Scene 默认创建 SceneGlobals，缺省字段由反序列化保留默认值；组件按脚本 UUID 注册。未基于猜测重写相机、场景、地图或核心玩法。

## 正式美术接入

`CharacterView` 增加可选四方向 idle／walk Clip，旧三个通用 Clip 继续可用；纯函数负责方向回退，WorldView 继续根据同步后的位移确定朝向。根容器只接收逻辑落脚点坐标，Sprite 子节点负责 (256×256、透明 RGBA、固定落脚点) 素材与缩放。具体字段、帧数、命名及遮挡边界见 `ASSETS.md`。

已有二维 SpriteFrame／帧动画接入条件，不等于已经导入人物，也不保证任意大图或骨骼动画可直接使用。复杂前景墙遮挡尚无素材可确认；本轮不添加该系统。等待用户提供参考图、确认素材及身份对应；目前所有正式美术绑定仍为空。

## 自动检查

- `npm run check`：服务端／共享协议严格类型检查。
- `npm run check:client`：官方 Creator 3.8.8 声明，18 个资产／目录标识、3 个组件类与场景结构静态审计。
- `npm run test:assets`：保留 7 项资源审计测试。
- `npm run test:client`：12 项纯显示决策／真实客户端传输生命周期测试，不加载或模拟 Cocos 引擎。
- `npm test`：保留 15 项真实本地 workerd／WebSocket／SQLite 集成测试。

以上最后一轮均通过，无跳过。没有调用 Creator 命令行、运行 WebGL 页面或部署 Cloudflare。触摸、EditBox 和动画真正播放的检查仍未自动执行，不能由这些 Node 测试替代。

## Windows 人工验收记录（全部待执行）

完整操作见 `WINDOWS_PHASE2.md`。验收时填写：Creator 精确版本、Windows／浏览器版本、Git SHA、编辑器首条错误（如有）、构建日志路径、设备／网络状态、结果及证据。

| 项目 | 实际结果 |
| --- | --- |
| Dashboard 导入 client，Home 不丢脚本 | 未验证 |
| 正交相机显示、UI 层、Graphics 背景 | 未验证 |
| 地板中心／四角触摸落点与画面一致 | 未验证 |
| 配对及留言 EditBox 输入、密码掩码、标签与焦点 | 未验证 |
| 两个浏览器身份的移动、拥抱、断线重连 | 未验证 |
| 连续 Play/Stop，慢请求返回不访问已销毁节点 | 未验证 |
| 素材固定脚点、四方向启动／停止、家具遮挡排序 | 未验证；正式素材未提供 |
| Web Mobile 真实构建、构建产物本地运行 | 未验证 |
| 两部手机 HTTPS 真机测试 | 未验证；本轮不部署生产 |

## 分支与审查入口

分支已推送，草稿 PR 为 [#1](https://github.com/hurshminner/002/pull/1)，目标 main。PR 保持草稿以清楚标识真实引擎验收尚未完成；可直接审查代码、测试和文档，不代表已经合并或发布游戏。

创建 PR 使用了现有 GitHub 认证。为 GitHub API 保存的环境网络草稿增加了 api.github.com，未替换其他域名或凭据配置；保存环境草稿与实际创建 PR 是分别核验的操作。当前 API 可访问，PR 已通过查询确认存在。
