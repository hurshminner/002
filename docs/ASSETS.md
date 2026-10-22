# 角色与场景美术管理规范

## 当前状态与命名边界

目前只有功能原型的程序绘制占位角色。**它们不是余野、禾柚的正式形象，也不是对两人外观的提案。** 仓库没有正式人物图片或动画；正式外观必须以用户提供、确认的参考图为准。不得自行推断发型、服装、体型、颜色、性别表现或装饰。

`one`、`two` 是永久身份槽位。余野与禾柚各对应哪个槽位，留到用户确认后再绑定；目录名不是默认的身份对应关系。素材文件名、显示名称、贴图尺寸均不能更改服务端身份。

## 已预留目录

| 目录 | 用途 |
| --- | --- |
| `client/assets/art/characters/yuye/` | 用户确认后的余野贴图、帧序列、动画 |
| `client/assets/art/characters/heyou/` | 用户确认后的禾柚贴图、帧序列、动画 |
| `client/assets/art/characters/shared/` | 经确认可共用的角色美术资源 |
| `client/assets/art/environment/` | 小屋背景、家具贴图与动画 |
| `client/assets/prefabs/characters/` | 正式角色 Prefab |
| `client/assets/prefabs/environment/` | 小屋及家具 Prefab |

空目录以 `.gitkeep` 保留，每个目录已有稳定 `.meta`。不要将参考图原稿、临时导出、大型源文件或私人照片默认放到可发布的 `assets/` 中；只导入用户确认可随游戏发布的导出素材。原稿与参考图由用户选择保管位置。

素材登记表为 `docs/asset-register.json`，只供审阅管理，不会被客户端或服务端加载。当前槽位对应、正式 Prefab 和文件清单均为空。

## 文件与导入规范

- 文件名使用小写 ASCII、下划线和稳定名称，如 `<人物键>_<动作>_<方向>_<三位帧号>.png`。示例格式不代表已经要求或生成任何具体动作／外观。人物键为 `yuye`、`heyou`，动作接口为 `idle`、`walk`、`hug`。
- 优先使用带 Alpha 的 PNG；单帧尺寸、角色比例和美术风格由正式素材决定。本轮不预设人物形象或固定身高。动画各帧使用一致画布与落脚点，避免位置抖动；原始透明边距可保留。
- 在 Creator 资源面板导入和移动素材；由编辑器生成图像、SpriteFrame、AnimationClip 和 Prefab 的 `.meta`。**提交资源时连同 `.meta` 一起提交**，不要手动更换已有 UUID 或只复制图片而丢失元数据。
- 图片使用 2D SpriteFrame 导入方式；绑定 SpriteFrame 子资源，而不是 Texture2D。滤波方式由正式美术风格确认后统一，不能凭占位画面决定像素风／平滑风。
- 多人共同修改时，不要同时覆盖同一个 `.scene`／`.prefab`。先同步 Git，再在编辑器改引用。提交前运行 `npm run check:client`、`npm run test:assets`、`npm test`，再做实际预览与构建。

## 角色 Prefab 接口

建议层级：

```text
CharacterRoot        UITransform + CharacterView（逻辑落脚点为本地 0,0）
└── Visual           Sprite + 可选 Animation（动画只控制此节点或其子节点）
```

所有节点均为 UI_2D，不能带新的 Canvas、Camera、网络连接或移动控制器。WorldView 实例化时会设置 UI_2D 层。根节点位置由显示层维护，不允许动画修改根节点的位置、世界坐标或所属玩家。

在 `CharacterView` Inspector 中绑定：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `body` | Sprite | Visual 节点上的 Sprite 组件 |
| `idleFrame` | SpriteFrame，可空 | 静止／缺少对应动画时的默认图 |
| `animator` | Animation，可空 | Visual 节点上的帧动画播放器 |
| `idleClip` | AnimationClip，可空 | 静止动画 |
| `walkClip` | AnimationClip，可空 | 移动动画 |
| `hugClip` | AnimationClip，可空 | 收到服务器拥抱事件后的动画 |
| `markerHeight` | number | 自己角色头顶标记的显示高度，随美术调整 |

Clip 使用不同名称；idle／walk 在编辑器中设循环，hug 设单次播放。缺少 walk／hug 时退回 idle；只提供静止贴图也可以接入。未绑定可用贴图／动画时继续显示占位角色。运行时动画状态只来自已同步的位置变化与拥抱事件，不决定是否移动或拥抱成功。

`CharacterPose` 同时预留 `facing`（up/down/left/right）、online、isSelf 信号。当前通用组件使用一套 idle／walk／hug，不自动生成四方向贴图、不擅自镜像。若正式素材采用四方向／骨骼动画，只需扩展或替换 `CharacterView` 的显示适配，不需要改写服务端、输入、互动规则或存档；骨骼动画运行时接入尚未实现。

完成 Prefab 后，打开 `Home.scene`，选择 `Bootstrap`，在 `PlanetGame` 的 `playerOneVisual`／`playerTwoVisual` 中分别拖入已经确认身份对应的 Prefab。**不要删除 Bootstrap、PlanetGame，或把 CharacterView 当成另一个玩家控制器。** 场景会建立资源依赖，构建器据此包含贴图和动画；不需要改成 resources 动态加载，也不需要把图片 UUID 写入存档。

## 场景和家具接口

`PlanetGame.roomVisual` 是小屋背景 Prefab；`plantVisual`、`stoolVisual`、`tableVisual` 是现有三类家具的 Prefab。全部为空时使用原占位图形。背景只包含显示内容；房间原点与触控坐标不变，家具以本地 0,0 为放置点，角色和家具按落脚点 Y 排序。

替换美术时保留现有房间坐标范围 `x: -150…150, y: -210…130`。缩放或偏移美术子节点来对齐；图片变大不能改变移动速度、拥抱距离、家具间距或数量限制。改动地图范围／碰撞规则属于另一个玩法任务，不在此次换素材流程中进行。

## 正式接入验收

1. 用户确认参考图、导出素材以及 one／two 对应关系，更新素材登记表。
2. 在 Creator 3.8.8 导入，确认透明通道、SpriteFrame、落脚点、统一帧画布和无丢失资源警告。
3. 制作 Prefab，设置 body／idleFrame／可选动画，绑定到 Home 的两个角色槽位。
4. 静止、移动、拥抱、离线显示均预览检查，确认动画不改变根坐标、不改变碰撞／距离判定。
5. 跑原有 15 项测试和 7 项资源审计测试，执行真实 Web Mobile 构建与两部手机检查，记录实际结果。

接口与目录已经准备好，**不代表正式素材已经导入，更不代表素材可以未经编辑器配置直接变成完整角色动画**。当前等待用户参考图，另有编辑器导入、渲染、构建和真机验收尚未执行。
