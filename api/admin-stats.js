// /api/admin-stats.js - 管理后台（Supabase 版）
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

// 检查 Supabase 连接
async function checkSupabase() {
  try {
    const { error } = await supabase.from('rate_limits').select('id').limit(1);
    if (error) return { available: false, error: error.message };
    return { available: true };
  } catch (error) {
    return { available: false, error: error.message };
  }
}

async function getCount(scope, identifier, date) {
  const { data } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('scope', scope)
    .eq('identifier', identifier)
    .eq('date', date)
    .maybeSingle();
  return data?.count || 0;
}

export default async function handler(req, res) {
  const auth = req.headers.authorization || req.query.password;
  const password = auth ? (auth.startsWith('Bearer ') ? auth.slice(7) : auth) : '';
  
  if (!password) {
    return res.status(401).json({ error: '请输入密码' });
  }
  
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ 
      error: '服务端未设置 ADMIN_PASSWORD',
      hint: '请在 Vercel Settings → Environment Variables 添加 ADMIN_PASSWORD'
    });
  }
  
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '密码错误' });
  }
  
  try {
    const action = req.query.action || 'overview';
    
    // 诊断 endpoint
    if (action === 'diagnose') {
      const supabaseStatus = await checkSupabase();
      return res.status(200).json({
        database: {
          type: 'Supabase',
          status: supabaseStatus.available ? '✅ 已连接' : '❌ 连接失败',
          error: supabaseStatus.error || null
        },
        env: {
          ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY ? '✅ 已设置' : '❌ 未设置',
          ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD ? '✅ 已设置' : '❌ 未设置',
          SUPABASE_URL: !!process.env.SUPABASE_URL ? '✅ 已设置' : '❌ 未设置',
          SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ 已设置' : '❌ 未设置',
          DAILY_IP_LIMIT: process.env.DAILY_IP_LIMIT || '(默认10)',
          DAILY_GLOBAL_LIMIT: process.env.DAILY_GLOBAL_LIMIT || '(默认100)',
          DAILY_EXTRACT_IP_LIMIT: process.env.DAILY_EXTRACT_IP_LIMIT || '(默认5)'
        }
      });
    }
    
    if (action === 'overview') {
      const today = getTodayKey();
      
      const todayCount = await getCount('global', 'global', today);
      const todayExtractCount = await getCount('extract-global', 'global', today);
      const globalLimit = parseInt(process.env.DAILY_GLOBAL_LIMIT || '100');
      const ipLimit = parseInt(process.env.DAILY_IP_LIMIT || '10');
      const extractIpLimit = parseInt(process.env.DAILY_EXTRACT_IP_LIMIT || '5');
      
      // 7 天趋势
      const dailyCounts = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().slice(0, 10);
        const count = await getCount('global', 'global', dateKey);
        const extractCount = await getCount('extract-global', 'global', dateKey);
        dailyCounts.push({ date: dateKey, count, extractCount });
      }
      
      // 总日志数
      const { count: totalLogs } = await supabase
        .from('request_logs')
        .select('id', { count: 'exact', head: true });
      
      return res.status(200).json({
        today,
        todayCount,
        todayExtractCount,
        globalLimit,
        ipLimit,
        extractIpLimit,
        todayRemaining: Math.max(0, globalLimit - todayCount),
        dailyCounts,
        totalLogs: totalLogs || 0
      });
    }
    
    if (action === 'logs') {
      const limit = parseInt(req.query.limit || '50');
      const offset = parseInt(req.query.offset || '0');
      
      let query = supabase
        .from('request_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);
      
      if (req.query.date) {
        const date = req.query.date;
        query = query.gte('timestamp', date + 'T00:00:00').lt('timestamp', date + 'T23:59:59');
      }
      
      const { data, error } = await query;
      if (error) {
        console.error('Logs query error:', error);
        return res.status(500).json({ error: error.message });
      }
      
      const logs = (data || []).map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        ip: log.ip,
        userAgent: log.user_agent,
        type: log.type,
        userInput: log.user_input,
        imageCount: log.image_count,
        output: log.output,
        duration: log.duration_ms,
        inputTokens: log.input_tokens,
        outputTokens: log.output_tokens,
        estimatedCost: log.estimated_cost
      }));
      
      return res.status(200).json({ logs, total: logs.length });
    }
    
    if (action === 'ips') {
      const today = getTodayKey();
      const { data, error } = await supabase
        .from('rate_limits')
        .select('identifier, count, scope')
        .in('scope', ['ip', 'extract-ip'])
        .eq('date', today);
      
      if (error) {
        console.error('IPs query error:', error);
        return res.status(500).json({ error: error.message });
      }
      
      // 聚合：把同一个 IP 的 generate + extract 合并
      const ipMap = {};
      for (const row of data || []) {
        if (!ipMap[row.identifier]) {
          ipMap[row.identifier] = { ip: row.identifier, count: 0, extractCount: 0 };
        }
        if (row.scope === 'ip') ipMap[row.identifier].count = row.count;
        else if (row.scope === 'extract-ip') ipMap[row.identifier].extractCount = row.count;
      }
      
      const ipsData = Object.values(ipMap)
        .sort((a, b) => (b.count + b.extractCount) - (a.count + a.extractCount));
      
      return res.status(200).json({ ips: ipsData });
    }
    
    if (action === 'export') {
      const { data, error } = await supabase
        .from('request_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10000);
      
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      
      const rows = [['时间', 'IP', '类型', '图片数', '输入', '输出预览', '耗时(ms)', '输入Token', '输出Token', '估算成本($)']];
      for (const log of data || []) {
        rows.push([
          log.timestamp || '',
          log.ip || '',
          log.type || 'generate',
          log.image_count || 0,
          (log.user_input || '').replace(/[\n\r,"]/g, ' ').slice(0, 500),
          (log.output || '').replace(/[\n\r,"]/g, ' ').slice(0, 500),
          log.duration_ms || 0,
          log.input_tokens || 0,
          log.output_tokens || 0,
          log.estimated_cost || '0'
        ]);
      }
      
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=logs-${getTodayKey()}.csv`);
      return res.status(200).send('\uFEFF' + csv);
    }
    
    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Admin error:', error);
    return res.status(500).json({ error: error.message });
  }
}
