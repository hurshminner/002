# 本地 Creator 3.8.8 导入与预览

本工程是《余野和禾柚的小世界》的第一阶段功能原型，**两名角色均为占位角色**。以下步骤需要在本地实际执行；当前云环境没有 Creator 编辑器，不能预先将它们标为通过。

## 1. 获取工程与安装工具

安装 Git、Node.js 22 或更新版本、Cocos Dashboard 和 **Cocos Creator 3.8.8**。优先按固定版本导入，不要先用另一版本自动升级项目。

首次从 GitHub 获取代码：

```sh
git clone https://github.com/hurshminner/002.git
cd 002
npm ci --ignore-scripts
npm run check
npm run check:client
npm run test:assets
npm test
```

如果已有本地 checkout，先保存自己的改动再同步 `main`，不要用 reset 覆盖本地文件。所有 npm 命令在仓库根目录 `002/` 运行，**不要在 client/ 里执行安装**。这里通过类型检查只说明源码／引用检查通过，不表示 Creator 预览成功。

## 2. 在 Dashboard 导入正确目录

1. Dashboard 的项目列表选择“导入”，选择 `002/client/`；其中有 `package.json`、`assets/`、`settings/`。不要选择 `002/`。
2. 确认使用 3.8.8 打开。项目内部英文名为 `yuye-heyou-little-world`，游戏内显示中文名。
3. 等待资源导入及脚本编译完成。首次生成 `library/`、`temp/`、`local/` 是正常的，这些目录不提交 Git。
4. 打开资源管理器中的 `assets/Home.scene`。场景树应为 `Home → Bootstrap`，选择 Bootstrap，Inspector 中应有启用的 `PlanetGame`，没有 Missing Script。
5. 确认 PlanetGame 的 `playerOneVisual`、`playerTwoVisual`、`roomVisual`、`plantVisual`、`stoolVisual`、`tableVisual` 都是空。**原型阶段保持空值即可**；WorldView、CharacterView 会在运行时自动创建，不要再手动添加第二套控制组件。
6. 项目设置的设计尺寸应为 390×844。保留 UI、Graphics、Sprite、Animation、Label、EditBox、Canvas 所需模块。不要为“精简包体”裁掉这些模块。

如果 Missing Script 或资源导入失败：先核对脚本 `.meta` 是否完整、是不是误导入仓库根目录、是否为 3.8.8、控制台最早一条编译错误是什么。不要删 `.meta` 让 UUID 重生，也不要把新增组件重复挂上去。

如果 3.8.8 仍明确报告场景序列化不兼容，保存原文件和错误信息，另建一个空场景，创建空节点 Bootstrap，添加 PlanetGame，保存为 Home.scene，再审阅编辑器产生的差异并重跑资源检查。这个回退办法尚未执行，不能作为原场景已成功导入的证据。

## 3. 配置仅供本地使用的凭证

在仓库根目录，将 `.dev.vars.example` 复制为 `.dev.vars`，仅在不存在时新建，**不要覆盖自己已有的密钥文件**。在私人本地终端运行：

```sh
npm run credentials
```

生成器会输出两人的私人配对明文、管理员明文，以及四项服务器配置。将四项配置填入 `.dev.vars`：

```dotenv
PLAYER_ONE_HASH=<生成器给出的玩家一摘要>
PLAYER_TWO_HASH=<生成器给出的玩家二摘要>
SESSION_SECRET=<生成器给出的会话密钥>
ADMIN_TOKEN_HASH=<生成器给出的管理员摘要>
```

保留两份配对**明文**用于稍后在页面登录。HASH 字段填摘要，不填明文。上方是格式说明，不能把尖括号占位文本当作真实配置。`.dev.vars` 已被 Git 忽略；不要提交、截图传播或发到聊天。首次本地预览无需 Cloudflare 账号或生产凭据。

## 4. 同时启动编辑器预览、Worker 和同源代理

1. 在 Creator 中打开 Home，点击浏览器预览。记下编辑器给出的本机地址及端口，通常是 7456。可先确认没有引擎错误；直接访问该地址的登录界面此时没有 API 代理，不能用于联机验收。
2. 新开终端 A，进入仓库根目录，运行并保持：

   ```sh
   npm run dev:server
   ```

   本地 Worker 监听 127.0.0.1 的 8787 端口，SQLite 存在本地 `.wrangler/`，不触碰生产存档。
3. 新开终端 B，同样在根目录运行并保持：

   ```sh
   npm run dev:gateway
   ```

   同源代理监听 8788，游戏页面请求转给 Creator，`/api/*` 转给 Worker。
4. 若 Creator 预览端口不是 7456，先在终端 B 设置 `CREATOR_PREVIEW_URL`。macOS／Linux 示例：

   ```sh
   CREATOR_PREVIEW_URL=http://127.0.0.1:7457 npm run dev:gateway
   ```

   Windows PowerShell 示例：

   ```powershell
   $env:CREATOR_PREVIEW_URL = 'http://127.0.0.1:7457'
   npm run dev:gateway
   ```

5. 在本机桌面 Chrome 中访问 `http://localhost:8788`；如果编辑器预览地址带路径／查询参数，保留相同路径／参数，只将来源替换为该代理来源。不要绕回 7456，也不要用 `127.0.0.1:8788` 替换 localhost，否则不匹配默认的 `ALLOWED_ORIGIN`。
6. 通过代理请求 `/api/health`，应得到 `configured: true`。这只证明服务器读到配置；配对后 `/api/me` 返回正确玩家，WebSocket 收到 state，才算连上服务。

若云端／受限终端提示无法写入 Wrangler 用户配置目录，可在该终端设置 `WRANGLER_SEND_METRICS=false`、`XDG_CONFIG_HOME=/tmp/planet-wrangler-config` 后重试。本地正常机器一般不需要此设置。

## 5. 两个独立浏览器身份预览

使用两个独立 Chrome 配置文件，或普通窗口与隐身窗口，分别打开代理来源。同一配置文件的两个普通标签页共享 Cookie，不适合用来模拟两位玩家。

1. 窗口 A 选“我是玩家一”，输入玩家一配对明文；窗口 B 选“我是玩家二”，输入玩家二配对明文。它们暂不代表已绑定余野或禾柚。
2. 成功后应看到中文标题、原型／占位提示、一个小屋、两个占位角色；本机角色头顶有小点。界面显示“两个人都在家”。这是**预期验收标准，尚未在本环境看到实际画面**。
3. 双方分别点地板，检查只控制自己的角色且另一窗口能看到坐标变化；走近后点抱抱，两边应有占位互动反馈。
4. 摆放／整理／收起现有家具，发送留言并打开留言簿。关闭 B，A 应能继续操作；重新打开 B 应看到共享存档。
5. 暂停网络、刷新后恢复网络，核对提示和待发送操作；同一身份另开连接时，旧连接应被替换而不是出现第三位玩家。

常见故障：

| 现象 | 检查 |
| --- | --- |
| 502 | Creator 浏览器预览、Worker、代理是否都在运行；预览端口是否正确 |
| health configured=false／503 | `.dev.vars` 是否在仓库根目录，四项是否为真实生成值；配置后重启 Worker |
| 登录 403 | 当前浏览器 Origin 是否精确等于 `wrangler.jsonc` 的 ALLOWED_ORIGIN，是否错用 IP、端口或尾部斜杠 |
| 登录 200，me 仍 401 | 浏览器是否接受本机 Secure Cookie；检查 Cookie 被拒绝的具体原因 |
| 同时登录后相互替换 | 两页是否共用浏览器配置／Cookie，或重复使用同一个玩家身份 |
| 看不到场景／控件 | 先查编辑器首条错误、Home 初始场景、Bootstrap 组件和被裁剪的引擎模块 |

Cookie 使用 Secure／HttpOnly；本机 HTTP 的 localhost 例外因浏览器而异。优先用桌面 Chrome 做该本地流程；如果浏览器明确拒绝 Cookie，改用受信任的本地 HTTPS 或正式 HTTPS 部署，**不要移除 Cookie 安全属性**。手机上的 localhost 指手机自身，不能当作电脑的代理地址。

## 6. Web Mobile 构建与真机

在“项目 → 构建发布”新建 **Web Mobile** 任务：初始场景和构建列表包含 `db://assets/Home.scene`，选择竖屏，输出目录为 `client/build/web-mobile/`，先使用调试构建。保留 Sprite／Animation 相关模块，不启用远程主包。运行构建并保存真实日志，确认有 `index.html`、`application.js` 及完整引擎／资源文件。

首次没有导出过 3.8.8 的构建配置，因此不提供一个假称已验证的 Creator CLI 命令。构建完成后，按 `DEPLOYMENT.md` 配置 Pages／Worker／Service Binding，再在正式 HTTPS 来源上使用 iOS Safari 和 Android Chrome 执行 `VALIDATION.md` 的双机检查。

正式人物素材接入另见 `ASSETS.md`。本地工程导入、可视预览、真实构建和双机验收必须分别记录实际结果，不能用上述命令检查通过来替代。
