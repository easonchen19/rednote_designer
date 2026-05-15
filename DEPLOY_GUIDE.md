# 🚀 Founder Notes 部署上线指南

完整部署到 Vercel 的图文教程。**预计耗时：30-45 分钟**。

---

## 📋 准备清单

部署前请准备好：
- [ ] GitHub 账号（免费）
- [ ] Vercel 账号（免费，用 GitHub 登录）
- [ ] Anthropic API Key（你已有）
- [ ] 一个**安全的管理员密码**（部署时设置，不要告诉任何人）

---

## Step 1：上传代码到 GitHub（10 分钟）

### 方法 A：网页操作（推荐新手）

1. 打开 https://github.com/new
2. Repository name 填：`founder-notes`
3. 选 **Private**（私有仓库，免费）
4. 点 **Create repository**
5. 在新仓库页面，点 **uploading an existing file**
6. **把整个 `founder-notes-saas` 文件夹里的文件全部拖进去**（不要拖文件夹本身）
   - 包括：`index.html`、`admin.html`、`package.json`、`vercel.json`、`.env.example`、`api/` 文件夹及其内容
7. 底部填提交信息：`Initial commit`
8. 点 **Commit changes**

### 方法 B：用 Git 命令行（如果你会）

```bash
cd founder-notes-saas
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/founder-notes.git
git push -u origin main
```

---

## Step 2：创建 Vercel 项目（5 分钟）

1. 打开 https://vercel.com
2. 用 GitHub 登录
3. 点首页 **Add New... → Project**
4. 找到你的 `founder-notes` 仓库，点 **Import**
5. **保持默认设置不要改**，直接点 **Deploy**
6. 等 30 秒 - 1 分钟，Vercel 会自动部署

> ⚠️ **此时部署会成功但功能不能用**，因为还没设置环境变量。下一步配置。

---

## Step 3：创建 Vercel KV 数据库（5 分钟）

KV 是 Vercel 自己的数据库，用来存使用记录和限流计数。

1. 在你的 Vercel 项目页，顶部菜单点 **Storage**
2. 点 **Create Database**
3. 选 **KV (Redis)**
4. Database Name：`founder-notes-kv`
5. Region：选择**离你最近的**（美国选 `iad1`，亚洲选 `sin1`）
6. 点 **Create**
7. 创建完成后，点 **Connect Project**
8. 选 `founder-notes` 项目，点 **Connect**
9. ✅ KV 的 4 个环境变量会**自动注入**到你的项目

---

## Step 4：配置环境变量（5 分钟）

1. 在 Vercel 项目页，点 **Settings → Environment Variables**
2. 添加以下 4 个变量（**每个变量都要点 Add 添加**）：

### 变量 1：Anthropic API Key
- **Name**: `ANTHROPIC_API_KEY`
- **Value**: `sk-ant-xxxxx...`（你的 Claude API Key）
- **Environments**: 勾选 Production、Preview、Development（全选）
- 点 **Save**

### 变量 2：管理员密码 🔐
- **Name**: `ADMIN_PASSWORD`
- **Value**: 设置一个**强密码**（至少 12 位，字母+数字+符号）
  - 例子：`MyAdmin#Notes2026!xyz`
  - ⚠️ **写下来记好，丢了进不去管理后台**
- **Environments**: 全选
- 点 **Save**

### 变量 3：每 IP 每日限制
- **Name**: `DAILY_IP_LIMIT`
- **Value**: `10`
- 全选环境，Save

### 变量 4：全局每日限制
- **Name**: `DAILY_GLOBAL_LIMIT`
- **Value**: `100`
- 全选环境，Save

---

## Step 5：重新部署（让环境变量生效）

1. 在 Vercel 项目页，点 **Deployments**
2. 找到最新的部署，点右边的 **⋯ (三个点)**
3. 点 **Redeploy**
4. 弹窗里勾选 **Use existing Build Cache**
5. 点 **Redeploy**
6. 等 30 秒部署完成

---

## Step 6：测试上线效果（5 分钟)

### 测试 1：用户端
1. 访问你的 Vercel 网址：`https://你的项目名-xxx.vercel.app`
2. 在输入框填一段话
3. 点 **✨ 一键生成全套**
4. ✅ 应该看到 AI 流式输出，生成完整笔记 + 小红书发布包

### 测试 2：管理员端
1. 访问：`https://你的项目名-xxx.vercel.app/admin`
2. 输入你刚才设置的管理员密码
3. ✅ 应该能看到：
   - 今日调用次数
   - 7 天趋势图
   - IP 排行
   - 请求记录列表
4. 点任意一条记录 → 看到详细的输入/输出内容

### 测试 3：限流（可选）
1. 用同一个浏览器连续点 11 次生成
2. ✅ 第 11 次应该报错"你今日已使用 10/10 次"

---

## 🎉 上线成功！

你的网址是：
```
用户端：https://你的项目名-xxx.vercel.app
管理后台：https://你的项目名-xxx.vercel.app/admin
```

把用户端网址发给朋友，让他们试用。

---

## 📊 之后怎么用

### 日常监控
- 每天去管理后台看一眼**今日调用次数**
- 看 7 天趋势，了解使用频率
- 看 IP 排行，发现谁在频繁使用

### 调整限制（如果需要）
1. Vercel → Settings → Environment Variables
2. 修改 `DAILY_IP_LIMIT` 或 `DAILY_GLOBAL_LIMIT`
3. 重新部署（Step 5 那样）

### 导出用户数据
- 管理后台点 **📥 导出 CSV**
- 下载完整的用户记录用于分析

### 防止过度烧钱
- Anthropic Console 设置**每月预算上限**：https://console.anthropic.com/settings/limits
- 设置一个邮件提醒，超过 $50/月就发邮件

---

## 🐛 常见问题

### Q: 用户端报错 "服务未配置"
**A**: 检查 `ANTHROPIC_API_KEY` 是否正确设置，并重新部署。

### Q: 管理后台一直提示密码错误
**A**: 检查 `ADMIN_PASSWORD` 设置时是否多了空格，重新设置并重新部署。

### Q: 限流不生效
**A**: 检查 Vercel KV 是否成功连接到项目（Storage 页面应该显示 Connected）。

### Q: 想绑定自己的域名
**A**: Vercel → Settings → Domains → 添加你的域名 → 按提示配置 DNS。

### Q: 不想让别人发现 /admin 怎么办
**A**: 改 `admin.html` 文件名为复杂随机串，比如 `mgmt-xyz-secret-2026.html`。访问时用这个新名字。

### Q: 想限制只有特定人能用怎么办
**A**: 在 `api/generate.js` 加一个"邀请码"参数检查。需要的话告诉我，我帮你加。

---

## 🚀 升级路线（未来）

当你有一定用户后，可以这样升级：

### 阶段 1：开放试用（现在）
- 无登录、限流防滥用
- 适合 5-20 个朋友试用

### 阶段 2：加邀请码（1-2 周后）
- 加一个邀请码字段
- 你给精选用户发邀请码
- 防止陌生人滥用

### 阶段 3：加登录（1-2 月后）
- 用 Clerk / Auth.js 加 Google 登录
- 每个用户独立计数
- 用户能看到自己的历史记录

### 阶段 4：加付费墙（数据好的话）
- 用 Stripe 加订阅
- 免费用户 3 次/天，付费 100 次/天
- 真正做成 SaaS

每一步我都可以帮你做，记得回来找我。

---

## 📞 出问题怎么办

1. 看 Vercel **Deployments → Logs** 找错误信息
2. 看浏览器 **F12 → Console** 找错误
3. 把错误截图发给我，我帮你排查

祝上线顺利！🎉
