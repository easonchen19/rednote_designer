# Founder Notes v3 · Supabase 版

一键生成 Will 风格的小红书笔记。

**v3 变化**：
- 🗄️ 数据库从 Vercel KV 换成 Supabase（PostgreSQL）
- 📈 数据永久保存（不再 90 天过期）
- 🔍 支持复杂 SQL 查询
- 🚀 为未来 SaaS 升级铺路（登录、付费、分析）

## 快速开始

阅读 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)。

## 项目结构

```
.
├── index.html              # 用户端（3 种输入：文字/图片/语音）
├── admin.html              # 管理员后台
├── api/
│   ├── generate.js         # Claude 代理（Supabase 限流 + 日志）
│   ├── extract-images.js   # 图片提取（独立限流）
│   └── admin-stats.js      # 后台数据（Supabase 查询）
├── supabase-schema.sql     # ⭐ 数据库建表脚本
├── package.json
├── vercel.json
├── .env.example
└── DEPLOY_GUIDE.md
```

## 环境变量

| 变量名 | 必填 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API Key |
| `ADMIN_PASSWORD` | ✅ | 后台密码 |
| `SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service_role key |
| `DAILY_IP_LIMIT` | ⬜ | 默认 10 |
| `DAILY_GLOBAL_LIMIT` | ⬜ | 默认 100 |
| `DAILY_EXTRACT_IP_LIMIT` | ⬜ | 默认 5 |

## 数据库表

- `rate_limits` - 限流计数
- `request_logs` - 请求日志（永久保存）

## 数据安全

- ✅ service_role key 只在服务端
- ✅ RLS 关闭（当前阶段只有后端访问）
- ✅ 管理员密码保护
- ✅ 双重限流防滥用
- ✅ 图片不写入数据库

## 升级路径

未来基于 Supabase 可以加：
- 用户登录（Supabase Auth）
- 付费订阅（Stripe + RLS）
- 数据分析（Supabase Reports）
