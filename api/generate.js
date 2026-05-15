// /api/generate.js - Claude 代理 + 限流 + 日志（Supabase 版）
import { createClient } from '@supabase/supabase-js';

// 创建 Supabase 客户端（使用 service_role key 绕过 RLS）
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false }
  }
);

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

输出格式（严格遵循 XML，必须以 </note> 结尾）：

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
<social_title>小红书帖子标题，带 1-2 个 emoji，14-20 字</social_title>
<social_body>小红书帖子正文（不是图片里的内容），150-200 字</social_body>
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
1. 封面 4 行标题：每行不超过 5 字，不要用 \*\*
2. <chapter> 标签 3-5 个，**每个 body 写 400-800 字**（内容要饱满，不要压缩）
3. **总字数控制在 3000-5000 中文字**（让内容有深度）
4. 章节标题、金句、结论用 \`**\` 突出关键词
5. social_title：必须有 1-2 个 emoji
6. social_tags：5-10 个

**关键：必须以 </note> 结尾！**

只输出 <note>...</note>，不要其他内容。`;

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

// 获取限流计数
async function getCount(scope, identifier, date) {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('scope', scope)
    .eq('identifier', identifier)
    .eq('date', date)
    .maybeSingle();
  
  if (error) {
    console.error('Supabase get count error:', error);
    return 0;
  }
  return data?.count || 0;
}

// 增加限流计数（upsert）
async function incrementCount(scope, identifier, date) {
  // 先尝试更新现有记录
  const { data: existing } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('scope', scope)
    .eq('identifier', identifier)
    .eq('date', date)
    .maybeSingle();
  
  if (existing) {
    const { error } = await supabase
      .from('rate_limits')
      .update({ count: existing.count + 1 })
      .eq('scope', scope)
      .eq('identifier', identifier)
      .eq('date', date);
    if (error) console.error('Supabase update error:', error);
  } else {
    const { error } = await supabase
      .from('rate_limits')
      .insert({ scope, identifier, date, count: 1 });
    if (error) console.error('Supabase insert error:', error);
  }
}

// 记录请求日志
async function logRequest(data) {
  const { error } = await supabase
    .from('request_logs')
    .insert({
      ip: data.ip,
      user_agent: data.userAgent,
      type: data.type,
      user_input: data.userInput,
      image_count: data.imageCount || 0,
      output: data.output,
      duration_ms: data.duration,
      input_tokens: data.inputTokens || 0,
      output_tokens: data.outputTokens || 0,
      estimated_cost: parseFloat(data.estimatedCost || 0),
      model: data.model || null
    });
  if (error) console.error('Log insert error:', error);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const ip = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const startTime = Date.now();
  
  try {
    const { userInput, images } = req.body || {};
    
    if (!userInput || typeof userInput !== 'string') {
      return res.status(400).json({ error: '请输入想法' });
    }
    if (userInput.length > 8000) {
      return res.status(400).json({ error: '输入过长，请精简到 8000 字以内' });
    }
    
    const hasImages = images && Array.isArray(images) && images.length > 0;
    if (hasImages && images.length > 5) {
      return res.status(400).json({ error: '最多 5 张图片' });
    }
    
    const today = getTodayKey();
    const IP_LIMIT = parseInt(process.env.DAILY_IP_LIMIT || '10');
    const GLOBAL_LIMIT = parseInt(process.env.DAILY_GLOBAL_LIMIT || '100');
    
    // 全局限流检查
    const globalCount = await getCount('global', 'global', today);
    if (globalCount >= GLOBAL_LIMIT) {
      return res.status(429).json({
        error: `今日总使用次数已达上限（${globalCount}/${GLOBAL_LIMIT}），请明天再来`,
        type: 'global_limit'
      });
    }
    
    // IP 限流检查
    const ipCount = await getCount('ip', ip, today);
    if (ipCount >= IP_LIMIT) {
      return res.status(429).json({
        error: `你今日已使用 ${ipCount}/${IP_LIMIT} 次，请明天再来`,
        type: 'ip_limit'
      });
    }
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '服务未配置' });
    }
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let messageContent;
    if (hasImages) {
      messageContent = [
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
          text: `请参考这些图片的内容，结合下面我的想法，提炼成 Founder Notes：\n\n${userInput}`
        }
      ];
    } else {
      messageContent = `把下面想法提炼成 Founder Notes 完整发布包：\n\n${userInput}`;
    }
    
    // ⭐ 三层 Fallback：Haiku 主力 → Sonnet 备用 → Opus 终极保底
    // 每个模型最多重试 2 次，总共 6 次尝试，但实际只用 1-3 次就成
    const MODEL_CHAIN = [
      { id: 'claude-haiku-4-5',  name: 'Haiku 4.5',  maxRetries: 2 },
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', maxRetries: 2 },
      { id: 'claude-opus-4-7',   name: 'Opus 4.7',   maxRetries: 2 }
    ];
    
    let response = null;
    let usedModel = null;
    let lastError = null;
    
    for (const model of MODEL_CHAIN) {
      let success = false;
      
      for (let attempt = 1; attempt <= model.maxRetries; attempt++) {
        try {
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: model.id,
              max_tokens: 12000,
              system: SYSTEM_PROMPT,
              stream: true,
              messages: [{ role: 'user', content: messageContent }]
            })
          });
          
          if (resp.ok) {
            response = resp;
            usedModel = model.name;
            success = true;
            console.log(`✅ 使用 ${model.name}（第 ${attempt} 次尝试成功）`);
            break;
          }
          
          // 529 过载：在当前模型内重试
          if (resp.status === 529) {
            console.log(`⚠️ ${model.name} 过载，第 ${attempt}/${model.maxRetries} 次`);
            lastError = { status: 529, model: model.name };
            if (attempt < model.maxRetries) {
              // 短延迟后重试同一模型
              await new Promise(r => setTimeout(r, 1500 * attempt));
              continue;
            }
            // 用完当前模型重试次数，跳到下一个模型
            break;
          }
          
          // 其他错误（如 401/400），不是过载，不要切换模型
          const errorText = await resp.text();
          console.error(`❌ ${model.name} 错误:`, resp.status, errorText);
          lastError = { status: resp.status, errorText, model: model.name };
          
          // 严重错误（如 401 API Key 错），直接退出，不切换模型
          if (resp.status === 401 || resp.status === 400) {
            response = resp;
            response._errorText = errorText;
            success = false;
            break;
          }
          
          // 其他错误，也算失败，继续重试当前模型
          if (attempt < model.maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
            continue;
          }
          
        } catch (err) {
          // 网络错误
          console.error(`❌ ${model.name} 网络错误:`, err.message);
          lastError = { status: 0, errorText: err.message, model: model.name };
          if (attempt < model.maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
            continue;
          }
        }
      }
      
      if (success) break;
      
      // 如果是 401/400 这种严重错误，直接退出整个循环
      if (lastError && (lastError.status === 401 || lastError.status === 400)) {
        console.log('严重错误，停止 fallback');
        break;
      }
      
      // 否则继续下一个模型
      console.log(`➡️ 降级到下一个模型`);
    }
    
    // 如果所有模型都失败
    if (!response || !response.ok) {
      let errorMsg = 'AI 服务暂时不可用';
      
      if (lastError) {
        if (lastError.status === 529) {
          errorMsg = `所有 AI 模型都繁忙（已尝试 Haiku/Sonnet/Opus）。请等 1-2 分钟再试。这是 Anthropic 服务端的临时高负载，不是你的问题。`;
        } else if (lastError.status === 401) {
          errorMsg = 'API Key 无效，请联系管理员';
        } else if (lastError.status === 400) {
          // 解析 400 错误的具体信息
          try {
            const errJson = JSON.parse(lastError.errorText || '{}');
            errorMsg = '请求错误: ' + (errJson.error?.message || lastError.errorText);
          } catch (e) {
            errorMsg = '请求错误: ' + (lastError.errorText || '未知');
          }
        } else if (lastError.status === 429) {
          errorMsg = '请求频率超限，请等几分钟再试';
        } else {
          errorMsg = `AI 服务出错（${lastError.model} HTTP ${lastError.status}）`;
        }
      }
      
      res.write(`data: ${JSON.stringify({ type: 'error', message: errorMsg })}\n\n`);
      res.end();
      return;
    }
    
    // 告诉前端用的哪个模型（透明给用户）
    res.write(`data: ${JSON.stringify({ type: 'model_info', model: usedModel })}\n\n`);
    
    // 增加计数（成功调用 API 后）
    await incrementCount('ip', ip, today);
    await incrementCount('global', 'global', today);
    
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
      res.write(chunk);
      
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
    
    // 根据实际使用的模型计算成本（不同模型价格不同）
    const PRICING = {
      'Haiku 4.5':  { input: 0.000001, output: 0.000005 },   // $1/$5 per MTok
      'Sonnet 4.6': { input: 0.000003, output: 0.000015 },   // $3/$15 per MTok
      'Opus 4.7':   { input: 0.000005, output: 0.000025 }    // $5/$25 per MTok
    };
    const pricing = PRICING[usedModel] || PRICING['Opus 4.7'];
    const estimatedCost = (inputTokens * pricing.input + outputTokens * pricing.output).toFixed(6);
    
    // 异步写日志（不阻塞响应）
    logRequest({
      ip,
      userAgent,
      type: hasImages ? 'generate-with-images' : 'generate',
      userInput: userInput.slice(0, 5000),
      imageCount: hasImages ? images.length : 0,
      output: fullText.slice(0, 20000),
      duration,
      inputTokens,
      outputTokens,
      estimatedCost,
      model: usedModel  // 记录用的哪个模型
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
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '30mb'
    }
  }
};
