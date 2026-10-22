# Cloudflare 部署与私有数据操作

本文件是可执行部署说明，**不代表已经执行部署**。当前没有 Cloudflare 凭据、公开域名或 Creator 构建产物。生产部署前先完成 `COCOS.md` 中的工程导入与构建。

## 一、准备独立凭证

在私人终端运行 `npm run credentials`，将两人的配对明文与管理员备份明文保存到密码管理器，服务器只接收三份摘要和会话密钥。此命令会输出敏感内容，不要放入 CI 日志或共享聊天。

需要在 Worker 中设置以下四项 Secrets，逐项使用 Wrangler 的交互输入，避免密钥进入 shell 历史：

```sh
npx wrangler secret put PLAYER_ONE_HASH
npx wrangler secret put PLAYER_TWO_HASH
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_TOKEN_HASH
```

`PLAYER_ONE_HASH`、`PLAYER_TWO_HASH`、`ADMIN_TOKEN_HASH` 是生成器给出的 SHA-256 十六进制摘要；`SESSION_SECRET` 是独立 32 字节随机密钥的 64 位十六进制值。不要把玩家配对明文填到 HASH 字段。服务端缺配置时 API 返回 503，不会使用内置默认凭证。

部署机器通过 `wrangler login` 或最小权限 Cloudflare API Token 认证，Token 只放在部署机器／GitHub Secrets。日常本地集成测试完全不需要此 Token。

## 二、Worker 与 Durable Object

1. 为自己的账号确认 Workers 和 SQLite-backed Durable Objects 可用，并检查免费层限额。
2. 保留 `wrangler.jsonc` 的 SQLite migration `new_sqlite_classes: ["Planet"]`；不要把它改成旧版 KV-backed DO。
3. 将 `vars.ALLOWED_ORIGIN` 改成唯一正式 Pages 来源，例如 `https://<你的项目>.pages.dev`，不能带尾部 `/`；绑定自定义域名后必须与用户实际访问的来源一致。保持 `PLANET_ID` 稳定。
4. 在根目录执行 `npm run deploy:server`。设置前述四项 Secrets，再检查 Worker 的 `/api/health` 返回 `configured: true`。只查看健康结果，不要输出 Secret。
5. `Planet` 命名空间只通过 Worker 访问。默认 workers.dev 地址仍存在，但共享状态需要有效会话，升级 WebSocket 也需要正确来源。

生产和测试应使用不同 Worker 名称、不同 DO 命名空间与不同凭证。不要将 Pages 临时预览绑定生产存档。

## 三、Pages 与同源 API

1. 在账号中创建名为 `our-private-planet-web` 的 Pages 项目，正式分支设为 `main`。如更名，同步修改 `pages/wrangler.jsonc`。
2. 构建 Cocos Web Mobile，确认目录为 `client/build/web-mobile`。
3. `pages/wrangler.jsonc` 的 `PLANET_SERVICE` Service Binding 必须指向刚部署的 Worker `our-private-planet`；如 Worker 更名也要同步修改。
4. 根目录运行 `npm run deploy:client`。脚本在 `pages/` 工作目录运行 Wrangler，让其打包 `functions/api/[[path]].js`；复制托管头，并生成只把 `/api/*` 交给 Functions 的路由配置，其他资源由 Pages 静态托管。
5. 在 Pages 控制台确认正式环境的 Service Binding 有效；使用正式域名检查 `/api/health`、配对和 WebSocket。未配置绑定时不能仅凭静态首页加载成功声称联机可用。

第一阶段先手动发布真实编辑器构建，GitHub CI 只验证源码；尚未实现安装 Creator 的自动构建流水线。不要用普通静态测试页面冒充 Creator 构建。

## 四、备份与恢复

管理员 API 使用独立的 **管理员明文凭证**作为 Bearer Token，不接受玩家 Cookie：

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/admin/backup` | GET | 导出当前世界和去重回执 |
| `/api/admin/snapshot` | POST | 创建 SQLite 滚动快照 |
| `/api/admin/snapshots` | GET | 列出最近 14 份快照的编号和时间 |
| `/api/admin/backup?snapshot=<编号>` | GET | 获取指定快照 |
| `/api/admin/restore` | POST | 仅双方离线时恢复完整导出文件 |

这些原始接口不输出到公共日志。优先用加密 CLI：在受保护环境设置 `PLANET_URL` 为正式站点来源，`PLANET_ADMIN_TOKEN` 为管理员明文，`PLANET_BACKUP_KEY` 为独立的 32 字节随机密钥（64 位十六进制），然后执行：

```sh
npm run backup -- export backups/home.planet
# 双方关闭所有游戏页面后：
npm run backup -- restore backups/home.planet
```

导出文件以 AES-256-GCM 加密；已有同名文件会拒绝覆盖。加密密钥不要放进备份文件、仓库或同一个归档。错误密钥／被篡改的文件会在请求恢复之前失败。恢复前自动保留当前状态快照，并一次性恢复世界与操作去重回执。

本地滚动快照不能防止整个 DO 或账号被删除；需要独立异地导出。`.github/workflows/backup.yml` 提供每日及手动加密备份：设置仓库变量 `PLANET_URL`，Secrets `PLANET_ADMIN_TOKEN` 与 `PLANET_BACKUP_KEY` 后启用，确认首次运行成功并下载验证。产物保留 30 天；应另存长期备份并定期演练恢复。未配置站点变量时任务跳过，不能把跳过当成备份成功。

由于当前没有生产账号和密钥，自动备份任务尚未在 GitHub 执行，也没有真实生产数据备份。集成测试已覆盖 CLI 加密往返和篡改拒绝。

## 五、凭证丢失和泄露

- 玩家清理 Cookie 或换设备：重新输入自己的长期私人配对凭证。
- 玩家配对凭证泄露：离线生成新凭证，仅替换该玩家的 HASH Secret，撤销旧配对码和旧 Cookie；让该玩家重新配对。已在线连接在后续事件／心跳检查到摘要变化后断开。
- 会话密钥泄露：轮换 `SESSION_SECRET`，旧 Cookie 失效，已连接客户端在下一次事件／心跳检查密钥指纹时断开；让双方重新配对。不要只清除自己浏览器里的 Cookie。
- 管理员凭证泄露：轮换 `ADMIN_TOKEN_HASH` 和异地任务里的 `PLANET_ADMIN_TOKEN`，审查备份访问。备份加密密钥泄露还需要轮换加密密钥；旧备份不能因此重新获得保密性。

第一次发布前务必完成 `VALIDATION.md` 的 HTTPS、备份恢复与双机验收。Cloudflare 免费额度不等于无限用量，需要在控制台配置适当的额度监控。
