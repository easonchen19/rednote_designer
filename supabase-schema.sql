-- ============================================
-- Founder Notes SaaS · Supabase Schema (FIXED)
-- ============================================
-- 在 Supabase SQL Editor 整段粘贴并 Run
-- ============================================

-- 1. 限流计数表
-- 用途：记录每个 IP / 全局每天调用次数
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,           -- 'global' | 'ip' | 'extract-global' | 'extract-ip'
  identifier TEXT NOT NULL,      -- IP 地址 或 'global'
  date TEXT NOT NULL,            -- '2026-05-15' 格式
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scope, identifier, date)
);

-- 优化查询性能的索引
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits (scope, identifier, date);
CREATE INDEX IF NOT EXISTS idx_rate_limits_date ON rate_limits (date);

-- 2. 请求日志表
-- 用途：保存每次用户请求的完整信息（用于改进产品 + 未来 SaaS 用户数据）
CREATE TABLE IF NOT EXISTS request_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  ip TEXT,
  user_agent TEXT,
  type TEXT,                     -- 'generate' | 'generate-with-images' | 'extract-images'
  user_input TEXT,               -- 用户输入（最多 5000 字）
  image_count INTEGER DEFAULT 0, -- 图片数量
  output TEXT,                   -- AI 生成的内容（最多 20000 字）
  duration_ms INTEGER,           -- 耗时
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10, 6) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 查询优化索引
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_ip ON request_logs (ip);
CREATE INDEX IF NOT EXISTS idx_logs_type ON request_logs (type);
-- 注意：原本有一个 DATE(timestamp) 的索引，但 PostgreSQL 不允许在索引中使用非 IMMUTABLE 函数
-- timestamp 的索引（idx_logs_timestamp）已经足够覆盖按天查询的需求

-- 3. 自动更新 updated_at 的 trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER update_rate_limits_updated_at
BEFORE UPDATE ON rate_limits
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. 关闭 RLS（当前阶段不需要，只有后端 service_role 访问）
ALTER TABLE rate_limits DISABLE ROW LEVEL SECURITY;
ALTER TABLE request_logs DISABLE ROW LEVEL SECURITY;

-- 5. （可选）自动清理 90 天前的日志
-- 注意：Supabase 免费版可能不支持 pg_cron，可以手动定期执行：
-- DELETE FROM request_logs WHERE timestamp < NOW() - INTERVAL '90 days';

-- ============================================
-- 完成！现在你可以：
-- 1. 在 Table Editor 看到两个新表
-- 2. 部署 Vercel 后，让后端连接这个数据库
-- ============================================
