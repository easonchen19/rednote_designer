# 🚀 Founder Notes v3 部署指南（Supabase 版）

完整部署到 Vercel + Supabase。

预计耗时：
- **首次部署**：30-45 分钟
- **从 v2 (KV) 迁移**：15 分钟

---

## ⚠️ 在动手前必读：安全提醒

**永远不要把 service_role key 发到任何聊天/邮件**。它能完全控制你的数据库。

你的工作流应该是：
1. 在 Supabase 后台**复制** service_role key
2. **直接粘贴**到 Vercel 环境变量
3. 不在任何聊天/截图/笔记中出现

---

## 📋 部署清单

### Step 1：在 Supabase 创建表（5 分钟）

1. 打开你的 Supabase 项目
2. 左边菜单点 **SQL Editor**
3. 点 **New Query**
4. 复制 `supabase-schema.sql` 的**所有内容**，粘贴
5. 点右下角 **Run** 按钮
6. 应该看到 "Success. No rows returned"
7. 切到 **Table Editor**，应该看到 2 个新表：
   - ✅ `rate_limits`
   - ✅ `request_logs`

### Step 2：获取 Supabase 连接信息（2 分钟）

1. Supabase 项目 → **Settings** → **API**
2. 准备复制两个东西：
   - **Project URL**（如 `https://xxx.supabase.co`）
   - **service_role** key（点 "Reveal" 显示，⚠️ 这是机密的）

> 💡 **现在先别复制 service_role**，等下面 Step 4 时直接复制粘贴到 Vercel 即可，避免在剪贴板停留。

### Step 3：上传代码到 GitHub（10 分钟）

#### 如果是首次部署
1. https://github.com/new → 创建 `founder-notes` 仓库（Private）
2. 点 **uploading an existing file**
3. **解压本 ZIP，把所有文件拖进去**（不要拖外层文件夹）
4. Commit

#### 如果从 v2 迁移
直接**替换 GitHub 仓库的几个文件**：
- 替换 `api/generate.js`
- 替换 `api/extract-images.js`
- 替换 `api/admin-stats.js`
- 替换 `package.json`
- 替换 `admin.html`（如果有更新）
- **新增** `supabase-schema.sql`

### Step 4：在 Vercel 配置环境变量（10 分钟）

Vercel 项目 → **Settings** → **Environment Variables**

#### 删除旧的（如果存在）
- ❌ `KV_URL`
- ❌ `KV_REST_API_URL`
- ❌ `KV_REST_API_TOKEN`
- ❌ `KV_REST_API_READ_ONLY_TOKEN`

> 如果是首次部署，可以跳过删除。

#### 添加这些（共 5-6 个）

| 变量 | 值 | 备注 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-xxx` | 你的 Claude Key |
| `ADMIN_PASSWORD` | 你的强密码 | 后台密码 |
| `SUPABASE_URL` | `https://你的项目.supabase.co` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **从 Supabase Settings → API → service_role 复制** |
| `DAILY_IP_LIMIT` | `10` | 可选 |
| `DAILY_GLOBAL_LIMIT` | `100` | 可选 |
| `DAILY_EXTRACT_IP_LIMIT` | `5` | 可选 |

每个变量勾选 **Production / Preview / Development** 三个环境，Save。

### Step 5：（可选）删除 Vercel KV

如果之前创建过 Vercel KV，现在可以删了：
1. 项目 → **Storage**
2. KV 数据库 → **⋯** → **Disconnect**（不会删除数据）
3. 想彻底删 → **Delete**

### Step 6：重新部署

1. **Deployments** → 最新部署 → **⋯** → **Redeploy**
2. 等 30 秒
3. 部署完成

---

## 🧪 部署后测试（5 分钟）

### 测试 1：管理后台诊断
1. 访问 `https://你的网址/admin`
2. 输入管理员密码
3. **点 🔧 诊断按钮**
4. 应该全是 ✅：
   ```
   【数据库】
   Supabase: ✅ 已连接
   【环境变量】
   ANTHROPIC_API_KEY: ✅ 已设置
   ADMIN_PASSWORD: ✅ 已设置
   SUPABASE_URL: ✅ 已设置
   SUPABASE_SERVICE_ROLE_KEY: ✅ 已设置
   ```

### 测试 2：生成笔记
1. 访问 `https://你的网址/`
2. 写一段想法
3. 点 ✨ 生成
4. 应该正常工作（流式输出 + 自动排版）

### 测试 3：检查数据写入
1. 打开 Supabase → **Table Editor**
2. 看 `request_logs` 表 → 应该有 1 条记录
3. 看 `rate_limits` 表 → 应该有 IP 和 global 计数

✅ 全部通过 = 上线成功！

---

## 📊 Supabase 数据库结构

### `rate_limits` 表（限流计数）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigserial | 主键 |
| scope | text | `global` / `ip` / `extract-ip` / `extract-global` |
| identifier | text | IP 地址 或 'global' |
| date | text | `2026-05-15` |
| count | integer | 当天次数 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### `request_logs` 表（请求日志）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | bigserial | 主键 |
| timestamp | timestamptz | 请求时间 |
| ip | text | 用户 IP |
| user_agent | text | 浏览器信息 |
| type | text | `generate` / `generate-with-images` / `extract-images` |
| user_input | text | 用户输入 |
| image_count | integer | 图片数 |
| output | text | AI 输出 |
| duration_ms | integer | 耗时 |
| input_tokens | integer | 输入 token |
| output_tokens | integer | 输出 token |
| estimated_cost | numeric | 估算成本（美元） |

---

## 💡 Supabase 直接查询数据

在 Supabase Dashboard 里你可以**直接用 SQL 查数据**：

### 查看今天的所有请求
```sql
SELECT * FROM request_logs 
WHERE DATE(timestamp) = CURRENT_DATE 
ORDER BY timestamp DESC;
```

### 统计每天的成本
```sql
SELECT 
  DATE(timestamp) as day,
  COUNT(*) as requests,
  SUM(estimated_cost) as total_cost
FROM request_logs 
GROUP BY DATE(timestamp) 
ORDER BY day DESC;
```

### 查看 Top IP 用户
```sql
SELECT ip, COUNT(*) as requests, SUM(estimated_cost) as cost
FROM request_logs
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY ip
ORDER BY requests DESC
LIMIT 20;
```

### 清理 90 天前的旧数据
```sql
DELETE FROM request_logs 
WHERE timestamp < NOW() - INTERVAL '90 days';
```

---

## 🐛 常见问题

### Q: 诊断显示 "SUPABASE_URL: ❌ 未设置"
**A**: 检查 Vercel Environment Variables，重新部署。

### Q: 报错 "Invalid API key"
**A**: 用错 key 了。要的是 `service_role` 不是 `anon` / `publishable`。

### Q: 数据库连接失败
**A**: 
1. 看 Supabase 项目是否处于 "Paused" 状态（免费版超过 1 周不用会暂停，访问一次就恢复）
2. 检查 Project URL 是否正确

### Q: 数据没写入
**A**: 
1. 看 Vercel **Deployments → Logs** 找错误
2. 在 Supabase **SQL Editor** 执行：`SELECT * FROM request_logs ORDER BY id DESC LIMIT 5;`
3. 用 Supabase 管理面板手动插一条测试数据

### Q: 想要更精确的限流（不是按 IP，而是按用户）
**A**: 以后做用户登录后再改 — 把 `identifier` 字段从 IP 改成 user_id 即可。

---

## 🔒 安全提醒

### 当前设置的安全保障
- ✅ service_role key 只在 Vercel 服务端，前端永远碰不到
- ✅ RLS 关闭，但因为只有 service_role 能访问，所以安全
- ✅ 管理员后台密码保护
- ✅ 双重限流防滥用
- ✅ 图片不被保存到数据库

### 如果哪天泄露了 service_role key
1. 立刻去 Supabase **Settings → API → Rotate service_role key**
2. 用新 key 更新 Vercel 环境变量
3. 重新部署

---

## 🚀 未来扩展方向

Supabase 比 Vercel KV 强大太多，可以做：

### 阶段 2：用户登录（1-2 个月后）
- Supabase 自带 Auth（Google / GitHub / Email）
- 用 `auth.users` 表关联数据
- 开启 RLS，每个用户只能看自己的数据

### 阶段 3：付费墙
- 加 `subscriptions` 表
- 集成 Stripe
- 不同套餐对应不同限额

### 阶段 4：数据分析
- 用 Supabase 内置的 Reports
- 或者接入 Metabase / Grafana
- 看用户行为、内容偏好

我可以一步一步帮你做。

---

## 🎉 部署完成！

部署成功后告诉我，我们继续做下一步。

祝上线顺利！🚀
