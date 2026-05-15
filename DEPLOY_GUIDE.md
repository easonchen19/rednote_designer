# 🚀 Founder Notes v2 部署指南

完整部署到 Vercel 的图文教程，**包含图片提取 + 语音输入新功能**。

预计耗时：**30-45 分钟**（如果你之前部署过 v1，只需 10 分钟更新）

---

## 📋 如果你之前部署过 v1，看这里（10 分钟）

直接更新即可，不需要重新部署：

### 步骤
1. **替换 GitHub 仓库的文件**：
   - 用本 ZIP 里的 `index.html` 替换旧的
   - 用本 ZIP 里的 `api/generate.js` 替换旧的
   - 用本 ZIP 里的 `api/admin-stats.js` 替换旧的
   - **新增**：上传 `api/extract-images.js`（这是新功能）
2. **在 Vercel 加一个新环境变量**：
   - `DAILY_EXTRACT_IP_LIMIT` = `5`（每 IP 每天图片提取 5 次）
3. **等 Vercel 自动重新部署**（push 后约 30 秒）
4. 完成！访问网址试试新功能

---

## 📋 如果是首次部署，看下面完整流程

### 准备清单
- [ ] GitHub 账号
- [ ] Vercel 账号（免费，用 GitHub 登录）
- [ ] Anthropic API Key
- [ ] 一个强管理员密码

---

## Step 1：上传代码到 GitHub（10 分钟）

1. 打开 https://github.com/new
2. Repository name: `founder-notes`
3. 选 **Private**
4. 点 **Create repository**
5. 点 **uploading an existing file**
6. **解压本 ZIP，把所有文件拖进去**（不要拖外层文件夹本身）
7. Commit changes

---

## Step 2：创建 Vercel 项目（5 分钟）

1. 打开 https://vercel.com
2. 用 GitHub 登录
3. 点 **Add New... → Project**
4. 找到 `founder-notes`，点 **Import**
5. 点 **Deploy**
6. 等部署完成

---

## Step 3：创建 Vercel KV 数据库（5 分钟）

1. 项目页 → **Storage** → **Create Database**
2. 选 **KV (Redis)**
3. Database Name: `founder-notes-kv`
4. Region: 选离你最近的
5. 点 **Create**
6. 点 **Connect Project** → 选 `founder-notes` → **Connect**

---

## Step 4：配置环境变量（5 分钟）

Settings → Environment Variables，添加以下 **5 个变量**：

| Name | Value | 说明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-xxx...` | 你的 Claude Key |
| `ADMIN_PASSWORD` | 你的强密码 | 管理后台密码 ⚠️ 自己记好 |
| `DAILY_IP_LIMIT` | `10` | 每 IP 每天文字生成次数 |
| `DAILY_GLOBAL_LIMIT` | `100` | 全局每天文字生成上限 |
| `DAILY_EXTRACT_IP_LIMIT` | `5` | **新增**：每 IP 每天图片提取次数 |

每个变量都要勾选 **Production / Preview / Development**（全选）后 Save。

---

## Step 5：重新部署生效

1. Deployments → 最新的部署 → **⋯** → **Redeploy**
2. 勾选 **Use existing Build Cache** → **Redeploy**
3. 等 30 秒

---

## Step 6：测试 6 项功能（10 分钟）

### 用户端
访问 `https://你的项目-xxx.vercel.app`

#### ✅ 测试 1：文字输入
1. 默认 Tab 是「📝 文字」
2. 写一段想法
3. 点 **✨ 一键生成全套**
4. 看到 AI 流式输出 → 自动排版 → 显示发布文案

#### ✅ 测试 2：图片输入
1. 切到「🖼️ 图片」Tab
2. 上传 1-2 张文字截图
3. 点 **🔍 从图片提取文字**
4. 等 10-20 秒
5. 文字应该自动填到「📝 文字」Tab
6. 检查无误后点 **✨ 一键生成全套**

#### ✅ 测试 3：语音输入（用 Chrome）
1. 切到「🎤 语音」Tab
2. 点麦克风按钮
3. 浏览器问"允许麦克风"→ 允许
4. 说一段话（中文）
5. 看到实时识别
6. 再次点击麦克风停止
7. 文字自动填入文字框
8. 点 **✨ 一键生成全套**

#### ✅ 测试 4：限流（可选）
1. 用同一浏览器连续点 11 次生成
2. 第 11 次应报错"今日已使用 10/10 次"

#### ✅ 测试 5：图片限流（可选）
1. 连续点 6 次"图片提取"
2. 第 6 次应报错"今日图片提取已用 5/5 次"

### 管理端
访问 `https://你的项目-xxx.vercel.app/admin`

#### ✅ 测试 6：管理后台
1. 输入你设的管理员密码
2. ✅ 应该能看到：
   - 今日调用次数
   - 7 天趋势图
   - IP 排行（含图片调用）
   - 请求记录列表（类型区分 generate / extract-images）
3. 点任意记录看详情
4. 点 **📥 导出 CSV** 下载完整数据

---

## 🎉 上线成功！

### 你的两个网址
```
用户工具：https://你的项目-xxx.vercel.app
管理后台：https://你的项目-xxx.vercel.app/admin
```

### 三种输入方式
- 📝 **文字** - 直接打字
- 🖼️ **图片** - 上传截图，AI 自动 OCR + 理解
- 🎤 **语音** - Chrome 浏览器原生支持，免费

### 限流策略
- 文字生成：10 次/IP/天，100 次/全局/天
- 图片提取：5 次/IP/天（额外配额）
- 语音输入：无限制（不调用 API）

---

## 💰 成本估算

| 功能 | 每次成本 | 默认配额下月成本 |
|---|---|---|
| 文字生成（100次/天） | ~$0.03-0.05 | $90-150/月 |
| 图片提取（理论上 5x10=50次/天） | ~$0.05-0.10 | $75-150/月 |
| 语音输入 | $0 | $0 |
| **总计** | | **$165-300/月** |

**强烈建议**：在 [Anthropic Console](https://console.anthropic.com/settings/limits) 设月度预算上限（比如 $300），超过自动停。

---

## 🐛 常见问题

### Q: 图片提取报错 "服务出错"
**A**: 检查 Anthropic API Key 是否支持 Vision（claude-opus-4-5 支持）。

### Q: 语音识别没反应
**A**: 
- 必须用 Chrome 或 Safari
- 必须允许麦克风权限
- 不支持 Firefox

### Q: 图片提取很慢
**A**: 正常，每张图约 3-5 秒，5 张图 15-25 秒。

### Q: 想关闭图片功能
**A**: 把 `DAILY_EXTRACT_IP_LIMIT` 设为 `0`，重新部署。

### Q: 用户上传的图片会被保存吗？
**A**: **不会**。图片只在内存中传给 Claude，不存数据库。但**提取出的文字会保存到日志**（用于改进产品）。

---

## 🔒 隐私 + 安全

- ✅ API Key 只在服务端，永不暴露
- ✅ 图片不被保存（只传给 Claude 一次性使用）
- ✅ 提取的文字 + 生成的内容会保存 90 天（用于改进）
- ✅ 管理员密码加密对比
- ✅ 双重限流防滥用

---

## 🚀 部署后下一步

1. **本地测试一遍**：自己用每个功能至少一次
2. **发给铁朋友试用**：3-5 个人
3. **看一周数据**：管理后台看使用模式
4. **基于数据迭代**：
   - 数据好 → 加邀请码 / 付费
   - 数据一般 → 优化产品
   - 都可以来找我继续做

祝上线顺利！🎉
