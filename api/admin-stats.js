// /api/admin-stats.js - 管理员查看用户数据
import { kv } from '@vercel/kv';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  // 验证密码
  const auth = req.headers.authorization || req.query.password;
  const password = auth ? (auth.startsWith('Bearer ') ? auth.slice(7) : auth) : '';
  
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const action = req.query.action || 'overview';
    
    if (action === 'overview') {
      // 概览：总数、今日数、限额
      const today = getTodayKey();
      const todayCount = (await kv.get(`rate:global:${today}`)) || 0;
      const globalLimit = parseInt(process.env.DAILY_GLOBAL_LIMIT || '100');
      const ipLimit = parseInt(process.env.DAILY_IP_LIMIT || '10');
      
      // 获取最近 7 天每日计数
      const dailyCounts = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().slice(0, 10);
        const count = (await kv.get(`rate:global:${dateKey}`)) || 0;
        dailyCounts.push({ date: dateKey, count });
      }
      
      // 总日志数（用 list length 估算）
      let totalLogs = 0;
      try {
        totalLogs = await kv.llen('log-index:all') || 0;
      } catch (e) {}
      
      return res.status(200).json({
        today: today,
        todayCount,
        globalLimit,
        ipLimit,
        todayRemaining: Math.max(0, globalLimit - todayCount),
        dailyCounts,
        totalLogs
      });
    }
    
    if (action === 'logs') {
      // 最近的日志
      const limit = parseInt(req.query.limit || '50');
      const offset = parseInt(req.query.offset || '0');
      
      const indexKey = req.query.date ? `log-index:${req.query.date}` : 'log-index:all';
      const ids = await kv.lrange(indexKey, offset, offset + limit - 1) || [];
      
      const logs = [];
      for (const id of ids) {
        try {
          const data = await kv.get(`log:${id}`);
          if (data) {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            logs.push({ id, ...parsed });
          }
        } catch (e) {
          console.error('Parse log error:', e);
        }
      }
      
      return res.status(200).json({ logs, total: ids.length });
    }
    
    if (action === 'ips') {
      // 按 IP 统计
      const today = getTodayKey();
      // 扫描所有 IP 计数
      const ipsData = [];
      try {
        let cursor = 0;
        do {
          const result = await kv.scan(cursor, { match: `rate:ip:*:${today}`, count: 100 });
          cursor = result[0];
          const keys = result[1] || [];
          for (const key of keys) {
            const ip = key.split(':')[2];
            const count = (await kv.get(key)) || 0;
            ipsData.push({ ip, count });
          }
        } while (cursor !== 0);
      } catch (e) {
        console.error('Scan error:', e);
      }
      
      ipsData.sort((a, b) => b.count - a.count);
      return res.status(200).json({ ips: ipsData });
    }
    
    if (action === 'export') {
      // 导出 CSV
      const ids = await kv.lrange('log-index:all', 0, 9999) || [];
      const rows = [['时间', 'IP', '用户代理', '输入', '输出预览', '耗时(ms)', '输入Token', '输出Token', '估算成本($)']];
      
      for (const id of ids) {
        try {
          const data = await kv.get(`log:${id}`);
          if (data) {
            const log = typeof data === 'string' ? JSON.parse(data) : data;
            rows.push([
              log.timestamp || '',
              log.ip || '',
              (log.userAgent || '').slice(0, 50),
              (log.userInput || '').replace(/[\n\r,"]/g, ' ').slice(0, 500),
              (log.output || '').replace(/[\n\r,"]/g, ' ').slice(0, 500),
              log.duration || 0,
              log.inputTokens || 0,
              log.outputTokens || 0,
              log.estimatedCost || '0'
            ]);
          }
        } catch (e) {}
      }
      
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=logs-${getTodayKey()}.csv`);
      // BOM for Excel
      return res.status(200).send('\uFEFF' + csv);
    }
    
    return res.status(400).json({ error: 'Unknown action' });
    
  } catch (error) {
    console.error('Admin error:', error);
    return res.status(500).json({ error: error.message });
  }
}
