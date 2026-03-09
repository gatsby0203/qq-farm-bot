<div align="center">
  <img src="web/public/main.svg" alt="QQ-FARM-BOT Logo" width="120" />

  # QQ-FARM-BOT

  [![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  [![release](https://img.shields.io/badge/release-v3.0.1-green.svg)](package.json)
  [![node](https://img.shields.io/badge/node-20%2B-brightgreen.svg)](https://nodejs.org)
  [![vue](https://img.shields.io/badge/vue-3.5-42b883.svg)](https://vuejs.org)

  QQ 农场全自动挂机管理平台（多账号、可视化、实时控制）
  **Briefing:** 基于 Node.js + Vue 3 构建，覆盖种植、收获、偷菜、任务、仓库与定时汇报的全流程自动化管理。

</div>

---

## 功能特性

### 农场自动化

- **自动收获** — 成熟作物即时收取
- **智能种植** — 根据经验/小时效率排名自动选择最优种子
- **自动施肥** — 种植后自动购买并施加肥料加速生长
- **自动除草 / 除虫 / 浇水** — 保持农场健康状态
- **自动任务** — 自动领取已完成的成长任务和每日任务奖励
- **自动出售** — 定时清理背包果实换取金币

### 好友系统

- **自动偷菜** — 智能检测好友成熟作物并偷取
- **智能预筛选** — 跳过无事可做的好友，减少无效请求
- **跨平台支持** — 适配微信与 QQ 平台

### 定时汇报系统

- **整点汇报** — 每小时整点自动发送最近 1 小时收成统计
- **每日日报** — 每天 8:00 发送昨日经营汇总
- **多维统计** — 包含收获排行、偷菜排行、账号资产概览
- **失败重试** — 邮件发送失败自动进行 3 次阶梯式重试

### 多用户权限

- **管理员 / 普通用户** 两级角色
- 管理员可管理所有账号，普通用户仅能操作被授权的账号号
- JWT 认证，Session 数据 AES-256-CBC 加密存储

### 可视化面板

- **仪表盘** — 总览所有账号状态（运行中 / 停止 / 异常）
- **账号主页** — 等级、金币、经验、今日统计、功能开关实时切换
- **统计图表** — 最近 24 小时收成走势图 & 最近 7 天经营日报表
- **土地详情** — 每块地的植物、生长阶段、剩余时间
- **种植效率排行** — 根据等级动态计算作物经验/小时排名（含多季作物）
- **实时日志** — WebSocket 推送 Bot 运行日志
- **深色 / 浅色主题** 一键切换
- **移动端适配** — 手机也能正常使用

---

## 技术栈

| 层 | 技术 |
| :--- | :--- |
| 后端 | Node.js + Express + Socket.io + WebSocket (ws) |
| 前端 | Vue 3 + Vite 6 + Element Plus + Vue Router + Pinia |
| 协议 | Protobuf (protobufjs) 编解码游戏消息 |
| 数据库 | SQLite (sql.js) |
| 邮件服务 | Nodemailer (支持 SMTP 发送通知) |
| 认证 | 自实现 JWT (HMAC-SHA256) + SHA-256 密码哈希 |
| 加密 | AES-256-CBC 加密 Session 存储 |
| 实时通信 | Socket.io + WebSocket |

---

## 项目结构

```plain-text
qq-farm-bot/
├── server/                  # 后端服务与 Bot 运行时
├── src/                     # 公共配置/协议加载
├── proto/                   # Protobuf 协议定义
├── gameConfig/              # 游戏配置数据与静态资源
├── web/                     # 前端管理面板 (Vue 3 + Vite)
│   ├── src/                 # 页面、组件、状态、API、路由
│   └── public/              # 品牌静态资源（main.svg / favicon.svg）
├── data/                    # 运行时数据（SQLite 文件）
├── docker-compose.yml       # 统一部署编排文件
├── Dockerfile               # 镜像构建文件
├── CHANGE.log               # 变更日志
└── README.md                # 项目说明

```

---

## 快速开始

### 环境要求

- **Node.js** >= 22

### 安装

```bash
git clone https://github.com/gatsby/qq-farm-bot.git
cd qq-farm-bot

# 一键安装所有依赖
npm run setup
```

### 构建前端

```bash
npm run build:web
```

### 启动服务

```bash
npm start
```

服务器默认运行在 `http://localhost:3000`。

### 初始管理员

首次启动时系统没有任何用户，有两种方式创建初始管理员：

**方式一：页面注册（推荐）**

打开 Web 面板后会自动进入「系统初始化」界面，第一个注册的用户将自动成为管理员。

**方式二：环境变量预设**

在启动前设置环境变量，服务启动时自动创建管理员（适用于 Docker / CI 场景）：

```bash
ADMIN_USER=myadmin ADMIN_PASS=mypassword npm start
```

> 管理员账户会在首次启动时固化到数据库，后续启动不再重复创建。

### 添加账号

1. 登录 Web 管理面板
2. 点击「添加账号」
3. **扫码登录**：使用手机 QQ 扫描生成的二维码
4. **Code 登录**：抓取 WSS `code` 手动填入
5. 添加成功后 Bot 自动启动，配置将持久化到数据库

---

## Docker 部署

项目当前统一使用一个 `docker-compose.yml`，支持本地和服务器部署。

### 启动

```bash
docker compose up -d
```

默认访问 `http://你的IP:3000`。

### 更新（重新构建镜像并启动）

```bash
docker compose up -d --build
```

### 建议的生产配置

1. 修改 `BOT_ENCRYPT_KEY` 为 32 字符随机密钥
   生成命令：`openssl rand -hex 16`
2. 使用 `./data:/app/data` 保留持久化数据
3. 如需邮件通知，按需填入 SMTP 环境变量

### 停止与清理

```bash
docker compose down
```

## 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 服务端口 |
| `TZ` | `Asia/Shanghai` | 容器时区（影响日志与统计时间） |
| `JWT_SECRET` | 内置随机值 | JWT 签名密钥 |
| `BOT_ENCRYPT_KEY` | 内置默认值 | Session 加密密钥 |
| `ADMIN_USER` | — | 初始管理员用户名（首次启动时生效） |
| `ADMIN_PASS` | — | 初始管理员密码（首次启动时生效） |

## 邮件汇报配置 (SMTP)

| 变量 | 示例 | 说明 |
| :--- | :--- | :--- |
| `MAIL_HOST` | `smtp.qq.com` | SMTP 服务器地址 |
| `MAIL_PORT` | `465` | SMTP 端口 |
| `MAIL_USER` | `your-email@qq.com` | 发件人邮箱 |
| `MAIL_PASS` | `xxxx-xxxx-xxxx` | 邮箱授权码/密码 |

---

## 致谢

本项目在学习和开发过程中参考了以下优秀的开源项目，在此表示感谢：

- [linguo2625469/qq-farm-bot](https://github.com/linguo2625469/qq-farm-bot) — QQ 农场 Bot 核心实现
- [QianChenJun/qq-farm-bot](https://github.com/QianChenJun/qq-farm-bot) — QQ 农场 Bot 参考实现
- [Penty-d/qq-farm-bot-ui](https://github.com/Penty-d/qq-farm-bot-ui) — QQ 农场 Bot 多功能参考实现
- [maile456/qq-farm-bot](https://github.com/maile456/qq-farm-bot) — 本项目基于其开源实现进行重构与功能扩展

---

## 免责声明

本项目仅供学习和研究用途，请勿用于任何商业用途或违反服务条款的行为。使用本项目造成的任何后果由使用者自行承担。

---

## 许可证

[MIT License](LICENSE)
