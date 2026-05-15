# Founder Notes v2 · 多模态 AI 内容生成器

一键生成 Will 风格的小红书笔记。

**v2 新功能**：
- 🖼️ 图片输入（Claude Vision，自动 OCR + 理解）
- 🎤 语音输入（浏览器原生，免费）
- 🐛 修复"找不到 <note>" bug（容错解析）
- 📊 管理后台增加图片调用统计

## 快速开始

阅读 [DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md) 完成部署。

## 文件结构

```
.
├── index.html              # 用户端（3 种输入方式）
├── admin.html              # 管理员后台
├── api/
│   ├── generate.js         # Claude 代理 + 限流（文字 + 图片输入）
│   ├── extract-images.js   # 图片提取（独立 endpoint，单独限流）
│   └── admin-stats.js      # 后台数据接口（含图片统计）
├── package.json
├── vercel.json
├── .env.example            # 5 个环境变量模板
└── DEPLOY_GUIDE.md         # 完整部署文档
```

## 环境变量

| 变量名 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | - | Claude API Key |
| `ADMIN_PASSWORD` | ✅ | - | 后台密码 |
| `DAILY_IP_LIMIT` | ⬜ | 10 | 每 IP 每天文字生成次数 |
| `DAILY_GLOBAL_LIMIT` | ⬜ | 100 | 全局每天文字生成上限 |
| `DAILY_EXTRACT_IP_LIMIT` | ⬜ | 5 | 每 IP 每天图片提取次数（新增） |

## 三种输入方式

| 方式 | 实现 | 成本 | 限流 |
|---|---|---|---|
| 📝 文字 | 直接输入 | ~$0.05/次 | 10/IP/天 |
| 🖼️ 图片 | Claude Vision API | ~$0.05/次（额外） | 5/IP/天 |
| 🎤 语音 | Web Speech API | $0 | 无 |

## 安全特性

- API Key 只在服务端
- 图片不被保存（一次性传给 Claude）
- 提取文字 + 生成内容保存 90 天（改进产品用）
- 双重限流：IP + 全局
- 单独的图片提取配额
- 管理员密码保护
