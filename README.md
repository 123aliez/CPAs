# CPAs

多站点 `CLIProxyAPI` / `CPA-backend` 配额总览面板。

## 功能

- 在管理面板 `/admin` 中集中维护多个 CPA 站点
- 每个站点通过 `地址 + 管理密钥` 建立连接，Docker 部署下持久化保存到宿主机 `data/site-connections.json`（容器内路径 `/app/.data/site-connections.json`）
- 服务端并行抓取所有已启用站点的数据，并聚合成单个总览
- 公开页 `/` 展示最近一次成功聚合的快照
- 支持配额告警：飞书、Telegram、Qmsg、通用 Webhook

线上域名由宿主机 Nginx 站点配置决定。

## 开发

```bash
npm install
SESSION_SECRET=dev-secret npm run dev
```

- 前端：`http://localhost:4178`
- 后端：`http://localhost:4179`

## 生产部署（Docker + 宿主机 Nginx）

当前生产形态参考 `vps-manager` 中 `new-api + nginx` 的方式：

- **应用本体** 使用 Docker Compose 运行
- **宿主机 Nginx** 继续负责 `80/443`、证书和域名入口
- 宿主机 Nginx 将站点域名反代到 `127.0.0.1:4179`
- Docker 容器将 `127.0.0.1:4179` 映射到容器内应用端口 `4179`

### 首次部署

```bash
cp .env.production.example .env.production
# 填写 SESSION_SECRET / ADMIN_PASSWORD 等配置

docker compose build
docker compose up -d
```

### 更新部署

```bash
docker compose build
docker compose up -d
```

### 常用运维命令

```bash
# 查看容器状态
docker compose ps

# 查看日志
docker compose logs -f app

# 重启应用
docker compose restart app

# 停止服务
docker compose down
```

首次访问 `/admin` 后，直接在页面中新增站点即可，无需再通过登录态注入单个 CPA 凭据。

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `HOST` | 服务监听地址 | `127.0.0.1` |
| `PORT` | 服务端口 | `4179` |
| `SESSION_SECRET` | 基础服务密钥 | - |
| `ADMIN_PASSWORD` | 管理面板密码，留空则不启用额外登录 | - |
| `USAGE_TTL_SECONDS` | 使用量缓存 TTL | `30` |
| `QUOTA_TTL_SECONDS` | 配额缓存 TTL | `300` |
| `COOKIE_NAME` | Cookie 名称 | `cpas_session` |

## 数据持久化

### 会持久化的数据

Docker Compose 默认将宿主机目录 `./data` 挂载到容器内 `/app/.data`，因此以下文件会保留：

- `data/site-connections.json`
  - 保存站点地址、管理密钥、启用状态
- `data/alert-config.json`
  - 保存告警渠道、Webhook/Token、规则配置

### 不会持久化的数据

以下状态仍是内存级，容器重启后会丢失：

- 管理后台登录会话
- usage / quota 缓存
- 最近一次公开快照 `publicOverview`

这意味着重启后需要重新登录，首次请求会重新预热缓存，公开页在调度器或手动刷新前可能暂时没有快照。

## 部署文件

- `Dockerfile`
- `docker-compose.yml`
- `deploy/cpas.nginx.conf.example`（宿主机 Nginx 站点配置示例）
- `.env.production.example`

## 说明

- 站点保存时会先调用 CPA 管理 API 校验地址和管理密钥
- 聚合总览允许部分站点失败，失败信息会显示在站点状态卡片中
- 定时器会持续刷新公开快照，并基于聚合结果触发告警
- 生产证书和 80/443 入口由宿主机 Nginx 管理，不在 Docker 容器中重复维护

---

> 本项目由 [AiCarrox](https://github.com/AiCarrox) 维护
