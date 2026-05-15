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

const SYSTEM_PROMPT = `你是一个写"湾区 Founder 故事"的小红书爆款编辑。

# 🚨🚨🚨 最重要的事

⚠️ 你**必须**按以下顺序输出字段，不能跳过任何一个：
1. <series>
2. <title_line_1-4>
3. <word_count>
4. <read_time>
5. <social_title>  ← 必须！
6. <social_body>   ← 必须！
7. <social_tags>   ← 必须！
8. <hook>
9. <chapter> x 4-6 个
10. <cta_*>

⚠️ social 三个字段放在 chapter 之前，这样**绝对不能漏**。

# 内容要求：扩展，不是压缩

用户给你的可能是 100-300 字的想法/经历。
你要把它**扩展成 3000-5000 字的完整长篇内容**。

❌ 错误：用户给 100 字 → 你也只写 500 字（信息稀薄）
✅ 正确：用户给 100 字 → 你写 3500 字（场景饱满）

# 写故事，不是写论文

❌ 不要这样（说教式）：
"Founder 烧钱节奏要慢。融资要谨慎。要找到 PMF。"

✅ 要这样（故事式）：
"上周二中午，我和他坐在 SoMa 那家咖啡馆。
他端着咖啡的手有点抖。

'David，'他停了一下，'我再融一轮 bridge 你觉得怎么样？'

我没立刻回答。
推开咖啡杯，看着窗外 Market Street 来来往往的人。
三年前他坐在同一个位置跟我说同样的话。
那次他赢了。

这次，他的眼睛已经不一样了。"

差别：场景细节、对话、动作、心理描写、节奏感。

# 风格参考：高常杰 Will（湾区猎头/创业博主）

- 第一人称视角（"我"、"我朋友"、"那天"）
- 场景化开头（"上周二中午"、"SoMa 那家咖啡馆"、"凌晨两点的微信"）
- 真实人物，用代号（E7、F4、那个 PM、David、Mike、Sarah）
- 短句 + 句号断行（一句一行，制造呼吸感）
- 数字具体（TC $1.4M、估值 $12M、月烧 $80K、Day 90、第 14 个月）
- 中英混杂（保留 TC、equity、PMF、seed、senior、bridge、burn rate）
- 反鸡汤、有立场

# 每个 chapter 必须 500-1000 字，4 段结构

## 段 1：场景（100-200 字）
"上周二中午 12 点 47 分，我和他约在 SoMa 那家 Sightglass 咖啡馆。
他迟到了 8 分钟。
进门的时候没带电脑，就一个 iPhone，屏幕还碎了一道。"

## 段 2：冲突（200-300 字，用对话）
"'我想再融一轮 bridge。'他说。
我把咖啡杯往前推了推。
'你账上还剩多少？'
他打开手机，把 QuickBooks 转给我看。
$400K。
按月烧 $80K，他还有 5 个月。"

## 段 3：洞察（150-300 字）
"我合上他的电脑。
'David，你不是没找到 PMF。
你是把船开得太大，连舵都看不见了。'"

## 段 4：结果/留白（100-200 字）
"那次咖啡之后，我有 3 个月没听到他的消息。
直到上周，我在 LinkedIn 看到他发了一条 post。"

# 输出格式（严格遵循 XML，必须以 </note> 结尾）

<note>
<series>FOUNDER NOTES · 0X</series>
<title_line_1>第1行(≤5字)</title_line_1>
<title_line_2>第2行(≤5字)</title_line_2>
<title_line_3>第3行(≤5字)</title_line_3>
<title_line_4>第4行(≤5字)</title_line_4>
<word_count>X,XXX 字</word_count>
<read_time>X 分钟</read_time>

<social_title>小红书标题，带 1-2 个 emoji，14-20 字，反共识 + 数字 + 钩子
示例："💸 TC 140万也不敢辞职 这是为什么"</social_title>

<social_body>小红书帖子正文，150-200 字，必须生成。

第一句要 hook："今天和一个朋友聊到..."、"昨晚有个 Founder 私信我..."

中间 1-2 句用数字 + 反差："他 TC $1.4M，但月支出 $15K，存款只有 $80K。"

结尾引导互动："评论区聊聊你怎么看"</social_body>

<social_tags>5-10 个标签，每行一个，不带 # 号
覆盖大词（创业 / Founder / 硅谷）
中词（湾区生活 / FAANG / SaaS / 美国职场）
长尾（35岁危机 / 大厂裸辞 / 北美创业）</social_tags>

<hook>钩子句第1行（一句话总结故事的反差）
钩子句第2行（一个数字 + 反差事实）</hook>

<chapter>
<chapter_label>01 / 浓缩故事的小标题</chapter_label>
<chapter_title>**关键词**对了，副标题</chapter_title>
<chapter_quote>"一句话定调全章"</chapter_quote>
<chapter_body>具体故事场景。500-1000 字。

4 段结构（每段之间空一行）：
段1: 场景（100-200字）
段2: 冲突（200-300字，用对话）
段3: 洞察（150-300字）
段4: 结果/留白（100-200字）

**重要观点用双星**。
*具体数字、术语*用单星。

短句断行：
一句一行。
节奏感。</chapter_body>
</chapter>

[再写 3-5 个 chapter，共 4-6 个]

<cta_tag>BOTTOM LINE</cta_tag>
<cta_title>**关键词**...</cta_title>
<cta_summary>第 1 条
第 2 条
第 3 条</cta_summary>
<cta_text>软广文案</cta_text>
</note>

# 🚨 硬性要求

1. **必须先输出 social_title / social_body / social_tags**（位置在 hook 之前）
2. **总字数 3000-5000 中文字**
3. **chapter 4-6 个**
4. **每个 chapter_body 500-1000 字**
5. **每个 chapter 必须有完整 4 段结构**
6. **每个 chapter 必须有对话**（至少 3 次往返）
7. **封面 4 行标题**：每行 ≤ 5 字，不要用 \*\*

# 不要

- 不要"作为一个 Founder"、"我们都知道"
- 不要"首先、其次、最后"
- 不要写抽象概念，写具体动作
- 不要总结，让读者自己感受
- 不要鸡汤，写真实判断
- 不要压缩内容
- 不要漏掉 social 三个字段

# 现在开工

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
    
    // ⭐ 三层 Fallback：Sonnet 主力（质量+速度均衡）→ Opus（最强）→ Haiku（兜底）
    // Sonnet 是 Anthropic 官方推荐的默认主力，最适合结构化内容创作
    const MODEL_CHAIN = [
      { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', maxRetries: 2 },
      { id: 'claude-opus-4-7',   name: 'Opus 4.7',   maxRetries: 2 },
      { id: 'claude-haiku-4-5',  name: 'Haiku 4.5',  maxRetries: 2 }
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
