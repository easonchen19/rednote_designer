# Founder Notes · 小红书 AI 内容生成器

一键生成 Will 风格的小红书笔记（图片 + 标题 + 正文 + 标签）。

## 快速开始

1. 阅读 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) 完成部署
2. 访问你的 Vercel 网址开始使用

## 文件结构

```
.
├── index.html              # 用户端工具
├── admin.html              # 管理员后台
├── api/
│   ├── generate.js         # Claude API 代理 + 限流 + 日志
│   └── admin-stats.js      # 管理后台数据接口
├── package.json
├── vercel.json
├── .env.example            # 环境变量模板
└── DEPLOY_GUIDE.md         # 完整部署文档
```

## 环境变量

| 变量名 | 必填 | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Claude API Key |
| `ADMIN_PASSWORD` | ✅ | 管理后台密码 |
| `DAILY_IP_LIMIT` | ⬜ | 每 IP 每天上限，默认 10 |
| `DAILY_GLOBAL_LIMIT` | ⬜ | 全局每天上限，默认 100 |
| `KV_*` | ✅ | Vercel KV 自动注入，不用手动设置 |

## 成本估算

按默认限制（100 次/天）：
- Claude API: ~$3-5/天 = $90-150/月
- Vercel: $0（免费额度足够）
- 总成本：$90-150/月

## 安全特性

- ✅ API Key 只在服务端，不暴露给前端
- ✅ 双重限流：IP + 全局
- ✅ 管理后台密码保护
- ✅ 所有请求记录保留 90 天
- ✅ 输入长度限制 5000 字
# rednote_designer
