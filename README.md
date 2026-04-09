# CPAs

多站点 `CLIProxyAPI` / `CPA-backend` 配额总览面板。

## 功能

- 在管理面板 `/admin` 中集中维护多个 CPA 站点
- 每个站点通过 `地址 + 管理密钥` 建立连接，保存到服务端 `.data/site-connections.json`
- 服务端并行抓取所有已启用站点的数据，并聚合成单个总览
- 公开页 `/` 展示最近一次成功聚合的快照
- 支持配额告警：飞书、Telegram、Qmsg、通用 Webhook

线上域名预期为 `cpas.02370237.xyz`。

## 开发

```bash
npm install
SESSION_SECRET=dev-secret npm run dev
```

- 前端：`http://localhost:4178`
- 后端：`http://localhost:4179`

## 生产

```bash
npm install
npm run build
SESSION_SECRET=prod-secret NODE_ENV=production npm start
```

首次访问 `/admin` 后，直接在页面中新增站点即可，无需再通过登录态注入单个 CPA 凭据。

## 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `PORT` | 服务端口 | `4179` |
| `SESSION_SECRET` | 基础服务密钥 | - |
| `ADMIN_PASSWORD` | 管理面板密码，留空则不启用额外登录 | - |
| `USAGE_TTL_SECONDS` | 使用量缓存 TTL | `30` |
| `QUOTA_TTL_SECONDS` | 配额缓存 TTL | `300` |

## 持久化文件

- `.data/site-connections.json`
  保存管理面板维护的站点地址、管理密钥和启用状态

## 部署文件

- [deploy/cpa-quota.service](/home/cc-dan/cc/CPAs/deploy/cpa-quota.service)
- [deploy/nginx.quota.bbroot.com.conf](/home/cc-dan/cc/CPAs/deploy/nginx.quota.bbroot.com.conf)

## 说明

- 站点保存时会先调用 CPA 管理 API 校验地址和管理密钥
- 聚合总览允许部分站点失败，失败信息会显示在站点状态卡片中
- 定时器会持续刷新公开快照，并基于聚合结果触发告警
