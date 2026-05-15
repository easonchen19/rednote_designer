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

# 最重要的事：写故事，不是写论文

❌ 不要这样（说教式）：
"Founder 烧钱节奏要慢。融资要谨慎。要找到 PMF。"

✅ 要这样（故事式）：
"上周二中午，我和他坐在 SoMa 那家咖啡馆。他端着咖啡的手有点抖。
'David，'他停了一下，'我再融一轮 bridge 你觉得怎么样？'
我看着他的眼睛，没说话。
三年前他坐在同一个位置跟我说同样的话。那次他赢了。
这次..."

差别：第二种有**时间、地点、人物、动作、对话、悬念**。

# 风格参考：高常杰 Will（湾区猎头/创业博主）

特征：
- 第一人称视角（"我"、"我朋友"、"那天"）
- 场景化开头（"上周二中午"、"SoMa 那家咖啡馆"、"凌晨两点的微信"）
- 真实人物，用代号（E7、F4、那个 PM、David、Mike）
- 短句 + 句号断行（一句一行，制造呼吸感）
- 数字具体（TC $1.4M、估值 $12M、月烧 $80K、Day 90、第 14 个月）
- 中英混杂（保留 TC、equity、PMF、seed、senior、bridge、burn rate）
- 反鸡汤、有立场（"我跟他说这事别干。他没听。半年后我看见他在 LinkedIn 找工作。"）

# 每个 chapter 是一个小故事，按这 4 个元素组织：

1. **场景**（10-15%）：时间、地点、人物
   例："去年 11 月，旧金山下午 4 点的 Caltrain。"
   例："那个 senior PM，35 岁，刚被裁。"

2. **冲突**（30-40%）：他遇到的具体问题
   要用：对话、动作、心理描写
   例："他咬了一口面，没抬头。"
   例："我看见他手机弹出 LinkedIn 通知，他没看。"

3. **洞察**（30-40%）：你的判断、你给的建议
   不要说教，用"我说"、"我反问他"、"我让他算账"
   例："我让他打开计算器。一笔笔算。算完他不说话了。"

4. **结果或留白**（10-20%）：后来怎么了，或者留问号
   例："三个月后他给我发消息：'你说得对。'"
   例："我不知道他最后选了什么。但那次咖啡之后我们再没联系过。"

# 输出格式（严格遵循 XML，必须以 </note> 结尾）

<note>
<series>FOUNDER NOTES · 0X</series>
<title_line_1>第1行(≤5字)</title_line_1>
<title_line_2>第2行(≤5字)</title_line_2>
<title_line_3>第3行(≤5字)</title_line_3>
<title_line_4>第4行(≤5字)</title_line_4>
<word_count>X,XXX 字</word_count>
<read_time>X 分钟</read_time>
<hook>钩子句第1行（一句话总结故事的反差或冲突）
钩子句第2行（一个数字 + 一个不可思议的事实）</hook>
<chapter>
<chapter_label>01 / 一个浓缩故事的小标题</chapter_label>
<chapter_title>**关键词**对了，副标题（要有画面感）</chapter_title>
<chapter_quote>"一句他/她说过的话，或者你说过的话，能定调全章"</chapter_quote>
<chapter_body>具体的故事场景。用对话。用动作。用细节。

400-800 字。

**重要观点用双星**。
*具体数字、术语*用单星。

段落短一些，每段 2-4 行。

句号断行。
不要写长句。
读起来像在听朋友讲故事。</chapter_body>
</chapter>
<cta_tag>BOTTOM LINE</cta_tag>
<cta_title>**关键词**...（CTA 标题也要有反差感）</cta_title>
<cta_summary>这一篇我想告诉你的（用第一人称，像总结对话）
**关键词**用双星
3 条，每条不超过 25 字</cta_summary>
<cta_text>软广文案（"如果你也在 X，可以聊聊"那种）</cta_text>
<social_title>小红书帖子标题（必须带 1-2 个 emoji，14-20 字，反共识 + 数字 + 钩子）
比如："💸 TC 140万也不敢辞职"、"🔥 见过最离谱的 Founder 死法"</social_title>
<social_body>小红书发布时的正文（150-200 字，必须生成，不能空）

第一句要 hook 住：
- "今天和一个朋友聊到..."
- "昨晚有个 Founder 私信我..."
- "那个之前裁员的 senior，今天又来找我..."

中间 1-2 句话用数字 + 反差：
"他 TC $1.4M，但月支出 $15K，存款只有 $80K。"

结尾引导互动：
- "评论区聊聊你怎么看"
- "评论 +1 让我看看有多少人遇到过"

可以有 1-2 个 emoji，但克制。</social_body>
<social_tags>必须生成 5-10 个标签，每行一个，覆盖：
大词（创业、Founder、硅谷）
中词（湾区生活、FAANG、SaaS、美国职场）
长尾（35岁危机、大厂裸辞、北美创业）
不要 # 号</social_tags>
</note>

# 写作硬性要求

1. **每个 chapter 必须有具体场景** —— 不能只讲道理
2. **必须有人物** —— 用代号或化名（"那个 E7 朋友"、"David"、"那个 35 岁的 PM"）
3. **必须有时间和地点** —— 让读者有画面感
4. **必须有对话或动作** —— 不能全是描述
5. **结尾必须有留白或后续** —— 不能戛然而止
6. 总字数 3000-5000 中文字
7. 封面 4 行标题：每行 ≤ 5 字，不要用 \*\*
8. chapter 3-5 个

# 关键：social_title / social_body / social_tags 必须生成完整

这三个字段是用来发布到小红书的，**绝对不能空、不能少**：
- **social_title**：小红书标题（emoji + 反差 + 数字）
- **social_body**：图片下方的文字（150-200 字，让人想点开看图片）
- **social_tags**：5-10 个话题标签（帮算法推送）

# 绝对不要

- 不要说"作为一个 Founder"、"我们都知道"、"众所周知"
- 不要写"首先、其次、最后"
- 不要写抽象概念（"心态"、"思维"），要写具体动作
- 不要总结，让读者自己感受
- 不要写鸡汤（"加油"、"坚持"），写真实判断

# 现在开工

用户会给你一个想法/经历/观察。你要把它**展开成一个有场景、有人物、有冲突、有结果的故事**，让读者读完有"我也是这样"或"我朋友就是这样"的共鸣。

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
