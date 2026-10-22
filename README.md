# 余野和禾柚的小世界

Cocos Creator **3.8.8 LTS + TypeScript** 私人双人 H5 游戏。**当前只是第一阶段功能原型，两名角色都是占位角色，未加入余野、禾柚的正式形象。** 正式人物参考图由用户后续提供；本仓库没有生成或猜测两人的外观。

第一阶段只做一个竖屏小屋：两个固定身份、移动、远程联机、拥抱、家具摆放／整理／收起、离线留言与共享存档。无公共房间、匹配、排名或第三个身份。显示标题已更新；Worker、DO 房间键和协议中的内部技术标识保持稳定，避免改名导致存档切换。

当前交付是**待编辑器与真机验收的 MVP 源码**，不是已上线或已经构建的游戏。云环境没有 Creator 编辑器，也没有 Cloudflare 部署凭据；未执行 Web Mobile 构建、生产部署或手机验收。

## 实施方案与模块边界

1. **协议与存档**：`client/assets/scripts/shared/protocol.ts` 为客户端和服务端的同一份协议；一个固定 Durable Object，SQLite 保存共享状态与操作回执。
2. **私人联机服务**：Workers 校验 Cookie、来源和身份；Durable Object 串行裁决移动、互动、家具、留言。重连发送完整快照，移动期间只广播坐标增量。
3. **Cocos 客户端**：`Home.scene` → `Bootstrap/PlanetGame` 管理输入与玩法，`WorldView` 管理小屋／家具／角色显示，`CharacterView` 管理可替换角色贴图与动画。默认占位画面由 Graphics 自绘，不依赖外部素材。正式美术通过 Prefab 属性接入，不改变身份、网络协议或存档。
4. **发布与运维**：Pages 托管 Creator 的真实 Web Mobile 构建，Pages Functions 通过 Service Binding 转发 `/api/*` 到 Worker；支持加密异地备份、恢复和 GitHub 自动检查。

本阶段保持单小屋、两位玩家、三种家具。地图扩展、战斗、付费、复杂角色编辑和商业化不在范围内。后续先完成编辑器与两机验收，再迭代美术和体验。

## 目录

| 目录 | 内容 |
| --- | --- |
| `client/` | 可导入 Creator 的工程、场景、脚本及固定 UUID |
| `server/src/` | Worker 路由、认证、SQLite Durable Object |
| `pages/` | Pages Functions 同源 API 代理、托管配置 |
| `tests/` | 真正启动本地 workerd 的 HTTP／WebSocket／SQLite 集成测试 |
| `scripts/` | 配对凭证生成、开发代理、客户端类型检查、加密备份、Pages 发布 |
| `docs/` | 工程导入、部署、安全设计与验收记录 |

## 可以立即运行的检查

需要 Node.js 22 或更新版本（本环境为 24），在仓库根目录运行：

```sh
npm ci --ignore-scripts
npm run check
npm run check:client
npm run test:assets
npm run test:client
npm test
```

如果云环境默认 npm 缓存目录不可写，给安装命令加 `npm_config_cache=/tmp/planet-npm-cache`。测试自行生成临时凭证、选择端口并启动本地 Workers，不需要 Cloudflare 账号，不会读取生产存档；包含真实进程重启、SQLite 恢复、双连接和加密备份往返。

`check:client` 使用官方 `@cocos/creator-types@3.8.8` 检查 TypeScript，并审计全部资源元数据、UUID、场景节点／组件绑定、外部引用和竖屏配置；`test:assets` 用损坏工程副本确认这些检查确实会拒绝错误。两者**不等于编辑器导入、引擎运行或 Web Mobile 构建**。原有 15 项服务端／传输层集成测试保留，并加强了玩家二独立移动的断言。

## 本地开发

1. 按 [Cocos 工程操作](docs/COCOS.md) 导入 `client/`，启动编辑器浏览器预览。
2. 在私人终端运行 `npm run credentials`，将输出的服务器配置填入根目录 `.dev.vars`（参考 `.dev.vars.example`）。两份玩家配对凭证和管理员凭证分别保存在密码管理器中。不要提交、录屏或粘贴到聊天。
3. 分别运行 `npm run dev:server` 和 `npm run dev:gateway`。通过本机 `localhost` 的 8788 端口进入预览代理；不要直接使用编辑器的预览端口登录。默认编辑器端口为 7456，可用 `CREATOR_PREVIEW_URL` 调整。
4. 两个独立浏览器配置文件分别配对玩家一、二。同一身份的新连接会替换旧连接，旧页面停止自动抢占。

安全 Cookie 需要 HTTPS；部分浏览器允许本机 `localhost` 的开发例外。本地 HTTP 代理仅为桌面开发便利，若浏览器拒绝 Cookie，应使用受信任的本地 HTTPS 或部署后的 HTTPS 地址。两部手机验收使用 Pages HTTPS，不能把手机的 localhost 当作开发电脑。

## 验收与部署

- [Creator 导入、入口和 Web Mobile 构建步骤](docs/COCOS.md)
- [Cloudflare Pages／Workers 部署与备份](docs/DEPLOYMENT.md)
- [协议、身份与数据约束](docs/ARCHITECTURE.md)
- [自动检查与待执行的双机验收](docs/VALIDATION.md)
- [本轮完整性审查与阻塞清单](docs/AUDIT.md)
- [角色与场景素材接入规范](docs/ASSETS.md)
- [Phase 2 运行风险与验收边界](docs/PHASE2.md)
- [Windows 导入、预览与 Web Mobile 本地构建](docs/WINDOWS_PHASE2.md)

代码由 Git 管理，CI 随 push／PR 运行。GitHub 推送结果以本轮交付报告及远端提交为准；生产部署仍需真实构建与账号配置。自动 CI 不安装编辑器，也不会把类型检查报告成 Web Mobile 构建成功。
