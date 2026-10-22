# Windows：Creator 3.8.8 导入、预览与 Web Mobile 本地构建

以下是待本地执行的操作手册，**不是已运行成功的记录**。目标 Windows 10/11 x64、Creator 3.8.8、Node.js 24 LTS、Git、桌面 Chrome。本轮不部署生产服务。

## 1. 获取待审查代码

新建一个较短的英文目录，如 `C:\dev`。已有工程请先保留本地改动，不能用 reset 覆盖。

```powershell
Set-Location C:\dev
git clone https://github.com/hurshminner/002.git
Set-Location .\002
git fetch origin
git switch phase2/cocos-runtime-art-preparation
git log -1 --oneline
npm ci --ignore-scripts
npm run check
npm run check:client
npm run test:assets
npm run test:client
npm test
```

所有 npm 命令在 `C:\dev\002` 执行。若 PowerShell 的执行策略阻止 npm.ps1，使用 `npm.cmd`／`npx.cmd`，无需为了本项目放宽系统执行策略。运行记录包括当前 Git SHA；测试通过不代表 Creator 已导入。

## 2. 导入并核对场景

1. Dashboard 安装并选择精确的 **3.8.8**，导入 `C:\dev\002\client`。不选择仓库根目录，不先迁移到另一版本。
2. 等待资源扫描、脚本编译结束。允许编辑器生成 `library`、`temp`、`local`，不要复制自造 `temp/tsconfig.cocos.json`。
3. 打开 `assets/Home.scene`，场景树应有 Home／Bootstrap；Bootstrap 上应有唯一、启用的 PlanetGame，没有 Missing Script。
4. 六个 Prefab 属性保持空值。WorldView 与 CharacterView 是运行时创建，**不用手动再挂一套组件、Canvas 或相机**。此时两个角色仍是占位形象。
5. 项目设置应为 390×844；保留 UI、Graphics、Sprite、Animation、EditBox、Label、Canvas 模块。项目预览的场景视图可切为 2D，不能靠修改角色根节点缩放调整整体地图。
6. 若失败，先保存控制台**最早**错误、Creator 完整版本和导入 SHA。不要直接删除 `.meta`；优先核对路径、版本、脚本编译，再定位丢失的组件。当前没有证据要求重建 Home。

## 3. 准备本地配对配置

在 PowerShell 的仓库根目录：

```powershell
if (-not (Test-Path .dev.vars)) { Copy-Item .dev.vars.example .dev.vars }
npm run credentials
notepad .dev.vars
```

生成器在本地打印敏感内容。用输出中的四项服务器配置替换 `.dev.vars` 的占位文本：PLAYER_ONE_HASH、PLAYER_TWO_HASH、SESSION_SECRET、ADMIN_TOKEN_HASH。两份配对**明文**留在本地密码管理器中，稍后填到页面；HASH 字段填摘要。不要提交、截图传播或发到聊天。已有配置不需要重新生成或覆盖。

## 4. 联调编辑器预览

1. Creator 打开 Home，点浏览器预览，记录其端口，通常 7456。这个来源只有编辑器预览服务，不含本项目 `/api`。
2. 终端 A 在根目录运行：

   ```powershell
   npm run dev:server
   ```

3. 终端 B 在根目录运行：

   ```powershell
   $env:CREATOR_PREVIEW_URL = 'http://127.0.0.1:7456'
   npm run dev:gateway
   ```

   如果 Creator 端口不同，改这里的 7456，保留 8788 作为浏览器入口。三个服务都需要保持运行。
4. 从 Chrome 手动打开 `http://localhost:8788`。如果 Creator 给出的预览 URL 带路径和查询参数，保留路径／参数，只替换来源。不要用 `127.0.0.1:8788` 或直接使用 7456，否则与默认 ALLOWED_ORIGIN 不一致。
5. 通过相同来源请求 `/api/health` 应为 configured=true；配对后 `/api/me` 应返回所选身份，WebSocket 应收到 state。它们是不同检查，health 不能代替联机成功。
6. 普通 Chrome 与独立配置文件／隐身窗口分别使用自己的配对码，选择玩家一／二；不要用共享 Cookie 的两个普通标签页模拟双方。one／two 此时没有正式人物对应。

安全 Cookie 的 localhost HTTP 例外依赖浏览器；如果登录 200 但 me 401，请查看 Chrome 的 Cookie 拒绝原因，使用受信任本地 HTTPS，不能删除 Secure／HttpOnly。手机的 localhost 不是这台电脑。

## 5. 必须看的运行检查

- 看见原型标题、小屋、两个占位角色，层级与颜色正常，控制台无首条异常。
- 点击可见地板中心及四个内缩角点，角色应走向实际点击位置，不能总被夹到右上角。该项验证本轮相机坐标修复。
- 点击配对及留言输入框，文字／占位符留在框内，密码遮挡正常，焦点与中文输入正常。留意背景没有消失、额外空标签或文字偏出输入框。
- 两个窗口分别移动、靠近拥抱，检查各自控制和同步。打开留言簿后，背景不继续接受旧目标；关闭后恢复操作。
- 使用 Chrome 网络限速制造慢请求，连续停止／启动 Creator 预览；检查返回的请求没有访问已销毁节点，也没有多出 Canvas 或持续自动重连。
- 正式素材提供后，按 `ASSETS.md` 绑定并检查四方向启动／停止、脚底不漂移、不同方向不跳位置、家具前后排序和四角边缘留白。

每项记录实际结果与截图／日志，不把本手册中的“应”写成“已通过”。

## 6. Web Mobile 构建

1. Creator“项目 → 构建发布”，新建 **Web Mobile** 任务；不要选择微信小游戏或原生平台。
2. 初始场景设置 Home，构建场景列表勾选 `db://assets/Home.scene`；保持 390×844 竖屏。
3. 构建输出基础路径选 `project://build`，输出名称选 `web-mobile`，最终目录应为 `C:\dev\002\client\build\web-mobile`。
4. 首轮选择调试构建；保留 Sprite／Animation／Graphics／EditBox 等模块。先关闭 MD5 缓存以便核对文件名，不启用远程主包或外部服务。
5. 点击构建，等待明确的成功／失败结果，保存该次构建配置与完整日志。核对 index.html、application.js、引擎及资源文件。**目录存在、JSON 可解析或 npm 检查通过都不能代替构建成功。**
6. 当前没有真实编辑器导出的构建配置，因此不提供一个声称已验证的 Creator CLI 命令；完成此轮 UI 构建后再将配置保存给后续自动化使用。

## 7. 本地运行构建产物（不部署）

不要直接双击 index.html 使用 file 协议。可以使用 Creator 构建任务的本地“运行”入口；若需要固定端口，可另开终端 C 在根目录运行一个固定版本的本地静态服务器：

```powershell
npx --yes http-server@14.1.1 .\client\build\web-mobile -a 127.0.0.1 -p 8080 -c-1
```

该命令首次需访问 npm 下载工具，不修改项目依赖，不是生产部署。保留终端 A 的 Worker，停止旧终端 B 的代理后重启：

```powershell
$env:CREATOR_PREVIEW_URL = 'http://127.0.0.1:8080'
npm run dev:gateway
```

浏览器仍从 localhost 的 8788 端口进入，页面资源来自真实构建目录，API 来自本地 Worker。此时可停止编辑器预览服务，确认运行的是构建产物。重新执行上方运行检查，保存浏览器控制台／网络结果。

此静态服务器与实际构建产物的组合尚未在本环境执行；本环境没有构建文件。两部手机的 HTTPS 测试另行安排，本轮不部署生产服务；手机渲染、软键盘、后台挂起及网络切换仍未验证。

## 8. 问题定位与提交记录

| 现象 | 优先检查 |
| --- | --- |
| 502 | Worker、代理、Creator 或静态服务器是否在线，代理目标端口是否正确 |
| 503／configured=false | .dev.vars 的路径与配置格式，修改后重启 Worker |
| 登录 403 | 浏览器来源是否精确等于 ALLOWED_ORIGIN |
| 登录 200 后仍 401 | Secure Cookie 是否被浏览器拒绝，Cookie 是否在同一来源 |
| Missing Script | 精确引擎版本、首次编译错误、脚本与 .meta 是否一起获取 |
| 正式图漂移／变大／遮挡不自然 | 根节点保持原点与缩放 1，Visual 锚点／256px 画布／0.25 缩放／Trim 设置是否一致 |

反馈模板：Git SHA、Creator 版本、Windows／Chrome 版本、使用编辑器预览还是构建产物、复现操作、预期与实际结果、控制台首条错误、构建日志位置。凭证、Cookie、私人参考图原稿不要放入公开 issue。
