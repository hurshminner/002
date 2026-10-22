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
- Phase 2 统一交付画布为 **256×256 像素、8-bit RGBA PNG、sRGB、透明背景**。技术画布不规定人物外形、身材或服饰；人物内容必须以用户参考图为准。所有方向／动作共用画布，禁止逐帧裁切、缩放或烘焙底色。
- 统一落脚点为图片左上角计数的 **(128,224)**，即底边上方 32px。接地位置对齐这一点，不能用可见包围盒中心对齐。保留透明边距，SpriteFrame 关闭自动裁边，Sprite 的 Trim 关闭、Size Mode 选 CUSTOM。
- 统一初始显示画布为 64×64 游戏单位：Visual 的 UITransform 设置 256×256，锚点 **(0.5,0.125)**，本地位置 **(0,0,0)**，缩放 **(0.25,0.25,1)**。角色根节点和 WorldView 容器保持缩放 1；此数值是导入基准，不代表人物实际身高。若最终素材需要校准，只调整 Visual，记录缩放，不能改逻辑坐标或放大整间小屋。
- 在 Creator 资源面板导入和移动素材；由编辑器生成图像、SpriteFrame、AnimationClip 和 Prefab 的 `.meta`。**提交资源时连同 `.meta` 一起提交**，不要手动更换已有 UUID 或只复制图片而丢失元数据。
- 图片使用 2D SpriteFrame 导入方式；绑定 SpriteFrame 子资源，而不是 Texture2D。滤波方式由正式美术风格确认后统一，不能凭占位画面决定像素风／平滑风。
- 多人共同修改时，不要同时覆盖同一个 `.scene`／`.prefab`。先同步 Git，再在编辑器改引用。提交前运行 `npm run check:client`、`npm run test:assets`、`npm test`，再做实际预览与构建。

## 角色 Prefab 接口

建议层级：

```text
CharacterRoot        UITransform + CharacterView（逻辑落脚点为本地 0,0）
└── Visual           Sprite + 可选 Animation（只设置 SpriteFrame，不动画根节点）
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
| `idleUpClip` / `idleDownClip` / `idleLeftClip` / `idleRightClip` | AnimationClip，可空 | 四方向静止动画 |
| `walkUpClip` / `walkDownClip` / `walkLeftClip` / `walkRightClip` | AnimationClip，可空 | 四方向行走动画 |
| `markerHeight` | number | 自己角色头顶标记的显示高度，随美术调整 |

Clip 文件建议使用人物／动作／方向的唯一名称；组件内部按属性槽位建立动画别名，因此不同资源的内部名称相同也不会互相覆盖。idle／walk 在编辑器中设循环，hug 设单次播放。关闭 Play On Load，组件会按显示状态显式播放。只提供静止贴图也可以接入；未绑定可用贴图／动画时继续显示占位角色。

`CharacterPose` 提供 facing（up/down/left/right）、online、isSelf 信号。WorldView 从已经同步的位置变化选取主移动轴；停止后保持上一次方向，首次默认 down。不自动生成、镜像或推断人物外观。四方向动画选择逻辑已实现并通过纯逻辑测试，但真实 Animation 播放未在编辑器验证。骨骼动画适配尚未实现。

四方向回退顺序：idle 优先当前方向 idle，再通用 idle；walk 优先当前方向 walk、通用 walk、当前方向 idle、通用 idle；hug 优先通用 hug，再当前方向 idle、通用 idle。原 `idleClip`／`walkClip`／`hugClip` 字段保留，旧 Prefab 不需要迁移。所有方向只影响显示，服务端不新增朝向字段。

## 四方向动作交付与导入

每人独立一套，不由 one／two 决定人物；人物键只用于文件管理，尚未绑定身份。

| 动作 | 方向 | 帧数／采样 | 命名示例格式 |
| --- | --- | --- | --- |
| idle | up/down/left/right，各一套 | 每方向 4 帧，6fps，循环 | `yuye_idle_down_000.png` … `_003.png` |
| walk | up/down/left/right，各一套 | 每方向 6 帧，10fps，循环 | `heyou_walk_left_000.png` … `_005.png` |

这是正式序列帧的统一交付约定，不表示图片已制作或人物会怎样运动。首轮静态校准可以先提供一张确认过的 idleFrame；不能用镜像补出用户尚未确认的方向。现有 hugClip 为可选接口，不要求本轮制作拥抱美术。

在 Creator Animation 面板中，为 Visual 新建各方向 `.anim`，只建立 **Sprite.spriteFrame** 轨道，按三位帧号顺序放置帧；不要放 Position／Scale／根节点轨道。idle 的完整循环周期为 4/6 秒，walk 为 6/10 秒，检查最后一帧显示时长，不要因时间轴首尾少一帧造成播放过快。将八个 `.anim` 拖入对应字段，再将静态默认图放入 idleFrame。具体面板保存和实际周期仍须本地编辑器确认。

完成 Prefab 后，打开 `Home.scene`，选择 `Bootstrap`，在 `PlanetGame` 的 `playerOneVisual`／`playerTwoVisual` 中分别拖入已经确认身份对应的 Prefab。**不要删除 Bootstrap、PlanetGame，或把 CharacterView 当成另一个玩家控制器。** 场景会建立资源依赖，构建器据此包含贴图和动画；不需要改成 resources 动态加载，也不需要把图片 UUID 写入存档。

## 场景和家具接口

`PlanetGame.roomVisual` 是小屋背景 Prefab；`plantVisual`、`stoolVisual`、`tableVisual` 是现有三类家具的 Prefab。全部为空时使用原占位图形。背景只包含显示内容；房间原点与触控坐标不变，家具以本地 0,0 为放置点，角色和家具按落脚点 Y 排序。

替换美术时保留现有房间坐标范围 `x: -150…150, y: -210…130`。缩放或偏移美术子节点来对齐；图片变大不能改变移动速度、拥抱距离、家具间距或数量限制。改动地图范围／碰撞规则属于另一个玩法任务，不在此次换素材流程中进行。

遮挡排序按**逻辑容器落脚点 Y**，不按贴图高度、裁切包围盒或 Sprite 子节点的本地偏移。Y 较大先绘制，同 Y 按稳定名字排序；角色、家具处于同一排序层。当前 roomVisual 是后景层，没有复杂前景墙体分层／自动遮挡系统。正式素材在房间四边、家具前后和同 Y 交叉时需要手工检查；64×64 显示画布可能超出旧占位画面的边缘留白，不能在没有实际美术时保证遮挡自然。

## 正式接入验收

1. 用户确认参考图、导出素材以及 one／two 对应关系，更新素材登记表。
2. 在 Creator 3.8.8 导入，确认透明通道、SpriteFrame、落脚点、统一帧画布和无丢失资源警告。
3. 制作 Prefab，设置 body／idleFrame／可选动画，绑定到 Home 的两个角色槽位。
4. 静止、移动、拥抱、离线显示均预览检查，确认动画不改变根坐标、不改变碰撞／距离判定。
5. 跑原有 15 项测试、7 项资源审计测试和 `npm run test:client`；在四方向启动／停止、同名 Clip、家具前后穿过、房间四角、离线显示等情形实际预览，再执行真实 Web Mobile 构建与两部手机检查，记录实际结果。

接口与目录已经准备好，**不代表正式素材已经导入，更不代表素材可以未经编辑器配置直接变成完整角色动画**。当前等待用户参考图，另有编辑器导入、渲染、构建和真机验收尚未执行。
