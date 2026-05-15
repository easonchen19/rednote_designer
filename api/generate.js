// /api/generate.js - 后端代理：调用 Claude + 限流 + 记录
import { kv } from '@vercel/kv';

const SYSTEM_PROMPT = `你是一个小红书爆款内容编辑，专门写"Founder Notes"风格的笔记，并且懂小红书 SEO + 算法推荐。

风格参考：高常杰 Will（湾区猎头博主）
- 短句、句号断行
- 中英混杂（保留 TC、equity、PMF、seed、senior、Founder 等术语）
- 数字具体（金额、月数、人数、百分比）
- 反鸡汤、有立场、不客气

以"章节"为单位组织内容。前端会自动测量高度分页。

**金色高亮标记：**
- \`**关键词**\` → 金色加粗
- \`*数字*\` → 金色

输出格式（严格遵循 XML）：

<note>
<series>FOUNDER NOTES · 0X</series>
<title_line_1>第1行</title_line_1>
<title_line_2>第2行</title_line_2>
<title_line_3>第3行</title_line_3>
<title_line_4>第4行</title_line_4>
<word_count>X,XXX 字</word_count>
<read_time>X 分钟</read_time>
<hook>钩子句第1行
钩子句第2行</hook>
<chapter>
<chapter_label>01 / 主题</chapter_label>
<chapter_title>**关键词**对了，副标题</chapter_title>
<chapter_quote>"金句"</chapter_quote>
<chapter_body>正文内容...</chapter_body>
</chapter>
<cta_tag>BOTTOM LINE</cta_tag>
<cta_title>**关键词**...</cta_title>
<cta_summary>结论1
结论2
结论3</cta_summary>
<cta_text>软广文案</cta_text>

<social_title>小红书帖子标题，带 1-2 个 emoji，14-20 字，制造好奇 + 数字 + 反共识</social_title>
<social_body>小红书帖子正文（不是图片里的内容），150-200 字。结构：
1. 第一句重复或扩展标题里的钩子
2. 中间用问题或场景拉近距离  
3. 结尾引导评论或私信
可以用 emoji 但克制，每段一个 emoji 足够。</social_body>
<social_tags>Founder
创业
硅谷
科技
湾区
SaaS
AI创业
创业者日记
副业
独立开发</social_tags>
</note>

要求：
1. 封面 4 行标题：每行不超过 5 字，**不要用 \*\***
2. <chapter> 标签 3-5 个，每个 body 200-500 字
3. 章节标题、金句、结论用 \`**\` 突出关键词
4. social_title：必须有 1-2 个 emoji，要让人想点开
5. social_body：必须用第一人称，有"在场感"
6. social_tags：5-10 个，覆盖大词 + 中词 + 长尾词

只输出 <note>...</note>，不要其他内容。`;

// 获取客户端 IP
function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  if (forwarded) return forwarded.split(',')[0].trim();
  if (realIp) return realIp;
  return 'unknown';
}

// 获取今天的日期字符串
function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // 2026-05-14
}

// 检查 IP 限流
async function checkIpLimit(ip, limit) {
  const key = `rate:ip:${ip}:${getTodayKey()}`;
  const count = (await kv.get(key)) || 0;
  if (count >= limit) {
    return { allowed: false, current: count, limit };
  }
  return { allowed: true, current: count, limit };
}

// 检查全局限流
async function checkGlobalLimit(limit) {
  const key = `rate:global:${getTodayKey()}`;
  const count = (await kv.get(key)) || 0;
  if (count >= limit) {
    return { allowed: false, current: count, limit };
  }
  return { allowed: true, current: count, limit };
}

// 增加计数
async function incrementCounters(ip) {
  const today = getTodayKey();
  const ipKey = `rate:ip:${ip}:${today}`;
  const globalKey = `rate:global:${today}`;
  
  await kv.incr(ipKey);
  await kv.expire(ipKey, 86400 * 2); // 2 天后过期
  
  await kv.incr(globalKey);
  await kv.expire(globalKey, 86400 * 2);
}

// 记录请求日志
async function logRequest(data) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const logKey = `log:${id}`;
  
  await kv.set(logKey, JSON.stringify(data));
  await kv.expire(logKey, 86400 * 90); // 保留 90 天
  
  // 添加到当天的日志索引
  const today = getTodayKey();
  const indexKey = `log-index:${today}`;
  await kv.lpush(indexKey, id);
  await kv.expire(indexKey, 86400 * 90);
  
  // 全局日志索引（最近 1000 条）
  await kv.lpush('log-index:all', id);
  await kv.ltrim('log-index:all', 0, 999);
  
  return id;
}

export default async function handler(req, res) {
  // 只允许 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const startTime = Date.now();
  
  try {
    const { userInput } = req.body || {};
    
    if (!userInput || typeof userInput !== 'string') {
      return res.status(400).json({ error: '请输入你的想法' });
    }
    
    if (userInput.length > 5000) {
      return res.status(400).json({ error: '输入内容过长，请精简到 5000 字以内' });
    }
    
    // 限流配置
    const IP_LIMIT = parseInt(process.env.DAILY_IP_LIMIT || '10');
    const GLOBAL_LIMIT = parseInt(process.env.DAILY_GLOBAL_LIMIT || '100');
    
    // 检查全局限流
    const globalCheck = await checkGlobalLimit(GLOBAL_LIMIT);
    if (!globalCheck.allowed) {
      return res.status(429).json({
        error: `今日总使用次数已达上限（${globalCheck.current}/${globalCheck.limit}），请明天再来`,
        type: 'global_limit'
      });
    }
    
    // 检查 IP 限流
    const ipCheck = await checkIpLimit(ip, IP_LIMIT);
    if (!ipCheck.allowed) {
      return res.status(429).json({
        error: `你今日已使用 ${ipCheck.current}/${ipCheck.limit} 次，请明天再来`,
        type: 'ip_limit'
      });
    }
    
    // 调用 Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '服务未配置，请联系管理员' });
    }
    
    // 设置 SSE 响应头（流式传输）
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        stream: true,
        messages: [{ role: 'user', content: `把下面想法提炼成 Founder Notes 完整发布包：\n\n${userInput}` }]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI 服务暂时不可用' })}\n\n`);
      res.end();
      return;
    }
    
    // 增加计数（在成功调用 API 后）
    await incrementCounters(ip);
    
    // 转发 SSE 流给前端，同时收集完整内容
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let inputTokens = 0;
    let outputTokens = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      
      // 直接转发给前端
      res.write(chunk);
      
      // 同时解析以记录
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
            fullText += json.delta.text;
          }
          if (json.type === 'message_start' && json.message?.usage) {
            inputTokens = json.message.usage.input_tokens || 0;
          }
          if (json.type === 'message_delta' && json.usage) {
            outputTokens = json.usage.output_tokens || 0;
          }
        } catch (e) {}
      }
    }
    
    res.end();
    
    const duration = Date.now() - startTime;
    
    // 异步记录日志（不阻塞响应）
    logRequest({
      timestamp: new Date().toISOString(),
      ip,
      userAgent,
      userInput: userInput.slice(0, 5000),
      output: fullText.slice(0, 20000),
      duration,
      inputTokens,
      outputTokens,
      estimatedCost: (inputTokens * 0.000003 + outputTokens * 0.000015).toFixed(4)
    }).catch(err => console.error('Log error:', err));
    
  } catch (error) {
    console.error('Handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: '服务出错: ' + error.message });
    } else {
      res.end();
    }
  }
}

export const config = {
  maxDuration: 60
};
