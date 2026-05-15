// /api/extract-images.js - 图片文字提取（独立 endpoint）
import { kv } from '@vercel/kv';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  if (forwarded) return forwarded.split(',')[0].trim();
  if (realIp) return realIp;
  return 'unknown';
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const ip = getClientIp(req);
  const startTime = Date.now();
  
  try {
    const { images } = req.body || {};
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: '请上传图片' });
    }
    if (images.length > 5) {
      return res.status(400).json({ error: '最多 5 张图片' });
    }
    
    // 图片提取限流：单独计数（占用一次"图片配额"）
    const today = getTodayKey();
    const ipExtractKey = `rate:extract:ip:${ip}:${today}`;
    const ipExtractCount = (await kv.get(ipExtractKey)) || 0;
    const EXTRACT_IP_LIMIT = parseInt(process.env.DAILY_EXTRACT_IP_LIMIT || '5');
    
    if (ipExtractCount >= EXTRACT_IP_LIMIT) {
      return res.status(429).json({
        error: `你今日图片提取已用 ${ipExtractCount}/${EXTRACT_IP_LIMIT} 次，请明天再来`,
        type: 'extract_limit'
      });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '服务未配置' });
    }
    
    const messageContent = [
      ...images.map(img => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType || 'image/jpeg',
          data: img.base64
        }
      })),
      {
        type: 'text',
        text: `请仔细看这些图片，把里面的所有文字内容**完整提取**出来。

要求：
1. 保留原文的结构、段落、换行
2. 不要总结、不要改写，原样提取
3. 如果是对话截图，标明发言人
4. 如果是多张图片，按顺序拼接
5. 如果有相关上下文（比如帖子标题、时间），也一并提取

直接输出提取的文字，不要加任何解释或前缀。`
      }
    ];
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8000,  // 图片提取最多 8000 token，足够长文档
        messages: [{ role: 'user', content: messageContent }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude Vision error:', response.status, errorText);
      return res.status(500).json({ error: '图片识别失败，请重试' });
    }
    
    const data = await response.json();
    const extractedText = data.content[0].text;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    
    // 增加计数
    await kv.incr(ipExtractKey);
    await kv.expire(ipExtractKey, 86400 * 2);
    await kv.incr(`rate:extract:global:${today}`);
    await kv.expire(`rate:extract:global:${today}`, 86400 * 2);
    
    // 日志
    const duration = Date.now() - startTime;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await kv.set(`log:${id}`, JSON.stringify({
      timestamp: new Date().toISOString(),
      ip,
      userAgent: req.headers['user-agent'] || '',
      type: 'extract-images',
      imageCount: images.length,
      output: extractedText.slice(0, 10000),
      duration,
      inputTokens,
      outputTokens,
      estimatedCost: (inputTokens * 0.000003 + outputTokens * 0.000015).toFixed(4)
    }));
    await kv.expire(`log:${id}`, 86400 * 90);
    await kv.lpush(`log-index:${today}`, id);
    await kv.expire(`log-index:${today}`, 86400 * 90);
    await kv.lpush('log-index:all', id);
    await kv.ltrim('log-index:all', 0, 999);
    
    return res.status(200).json({
      text: extractedText,
      stats: {
        imageCount: images.length,
        duration,
        remaining: EXTRACT_IP_LIMIT - ipExtractCount - 1
      }
    });
    
  } catch (error) {
    console.error('Extract error:', error);
    return res.status(500).json({ error: '提取失败: ' + error.message });
  }
}

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '30mb'
    }
  }
};
