# 工程与美术接入审查

本文保留首次美术接口审查背景。Phase 2 的触摸／EditBox／生命周期修复与四方向接口详见 `PHASE2.md`；当前静态资产数量已从 17 增至 18，正式素材仍为零，编辑器验证状态没有改变。

## 结论

这是第一阶段功能原型，**两个可见角色都是程序绘制的占位角色**，不是余野、禾柚的正式形象。已具备通过 SpriteFrame／AnimationClip／Prefab 接入正式 2D 人物素材的源码接口；尚未导入任何正式素材，不含对用户人物外观的推断。

项目结构、脚本类型、元数据与场景引用通过静态检查。当前机器没有 Creator 3.8.8 编辑器，因此“编辑器能正确识别并运行”仍需本地验证，不能用本报告的静态结果代替。尚未构建 Web Mobile、部署真实 Cloudflare 服务或进行手机验收。

## 逐项检查

| 项目 | 结果／处理 |
| --- | --- |
| 工程入口 | `client/package.json` 有稳定项目 UUID、creator.version 3.8.8；仓库根目录是服务工具链，不能作为 Creator 工程导入。没有强写与 Node 模块语义冲突的 type=2d，2D 显示由 UI_2D 与正交相机确定 |
| 竖屏配置 | 补齐 `settings/v2/packages/project.json`，390×844、fitWidth／fitHeight；运行时同尺寸 SHOW_ALL |
| 场景 | 只有 Home 一个场景；SceneAsset → Scene → Bootstrap → PlanetGame 引用完整，节点父子和组件所属关系一致 |
| 元数据 | 所有 17 个资源／目录标识均有对应 `.meta`，UUID 无重复，无孤立 `.meta`；Home 的 `.json` 导入输出声明已补齐 |
| 脚本绑定 | PlanetGame 的压缩 UUID 与脚本元数据一致；新增 WorldView、CharacterView 有独立 UUID 和 ccclass；后两者运行时创建，不需要再手动挂到 Home |
| 外部资源 | 当前没有任何图片／动画／Prefab 外部引用，六个可选美术字段明确为 null；占位画面不依赖下载资源 |
| 类型与依赖 | 服务端严格类型检查及官方 Creator 3.8.8 类型声明检查通过；Node 锁文件固定依赖，Creator 提供真正引擎 |
| 构建链 | Worker dry-run、Pages Functions 编译是服务端／代理检查，不是 Creator 构建；发布脚本缺少 index.html／application.js 时会拒绝发布 |
| 编辑器生成目录 | library、temp、local、profiles、build 不提交；temp/tsconfig.cocos.json 由编辑器生成，不伪造该文件来宣称工程导入成功 |
| 正式美术边界 | 将原集中绘图整理到 WorldView／CharacterView，保留原输入、协议和权威状态；Prefab 字段替换显示，不修改玩法或存档 |

检查器会拒绝缺失 metadata、重复 UUID、错误的组件所属节点、悬空引用、缺少 CharacterView 的角色 Prefab 和缺失竖屏设置。新增 7 项实际文件变更的负向／完整性测试验证这些检查确实生效。它不解析引擎内部格式的全部语义，不替代资源导入器。

## 两个角色的逻辑完整性

| 路径 | 已有逻辑与证据 | 未验证部分 |
| --- | --- | --- |
| 身份 | Worker 从签名 Cookie 决定 one／two，只有两人；伪造身份头／作者无效 | 两部手机的 Cookie 保存与登录 UI |
| 移动 | PlanetGame 只对 net.player 发移动命令；服务端只更新发起者坐标、校验边界和速度；15 项测试中的移动项加强了双方分别移动且另一人的坐标不变的断言 | 真实触控、插值观感、帧率 |
| 显示同步 | 全量快照和 moved 增量更新各自玩家；两个 WorldView 子节点各自显示、独立位置与显示状态 | 引擎渲染与层级排序效果 |
| 互动 | 服务器要求两人在线、距离合法且未冷却，广播 hug；两个显示节点据此进入拥抱显示状态 | 正式人物拥抱动画／手机观感 |
| 持久化与重连 | SQLite 保存坐标／家具／留言；重连快照、待发送队列与去重回执；真实运行时重启测试通过 | 手机后台／网络切换的浏览器行为 |

这些构成了两个占位角色的现有移动、互动和同步逻辑闭环。不能由此得出两部手机上游戏已经正常运行的结论。

## 与 Creator 的核对依据

- `@cocos/creator-types@3.8.8` 官方声明用于真实类型检查，不使用自造的 cc 类型桩。
- 核对官方 `cocos/cocos-engine` **3.8.8** 标签，提交 `411f98df047c25902f93440d4b22925c2fb65461`：`cocos/scene-graph/scene.ts` 默认初始化 SceneGlobals；`cocos/core/data/class.ts` 使用脚本 UUID 注册组件；`cocos/serialization/deserialize-dynamic.ts` 缺省字段保留默认值；`cocos/2d/framework/canvas.ts` 支持当前动态相机绑定。
- 对照官方 `cocos/cocos-example-projects` 的 3.8 系列工程结构与项目设置格式，确认 `.scene`／`.meta` 分离、场景 `.json` 导入输出、settings/v2 结构。示例不是本工程的 3.8.8 导入结果，不能把对照检查写成编辑器验收通过。

## 尚存阻塞

1. **没有 Creator 编辑器**：无法在云机器完成资产导入、组件实际反序列化、编辑器预览和 Web Mobile 构建。本地操作见 `COCOS.md`。
2. **没有正式人物参考图／素材**：角色目录与接口就绪，但等待用户提供和确认。one／two 的人物对应也待确认；无需为了验证占位玩法先决定这一点。
3. **没有真机验收**：iOS Safari／Android Chrome 的触控、软键盘、断网恢复与实际美术表现尚未验证。
4. **没有生产配置／部署验证**：Cloudflare 身份、正式来源和服务绑定仍需配置；本地原型检查不需要这些生产凭据。

Git 提交与推送由本轮显式授权执行，结果以交付报告和远端 SHA 核对为准。本报告不包含凭据、生产数据或实际人物图片。
