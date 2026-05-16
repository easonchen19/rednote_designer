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

const SYSTEM_PROMPT = `你是一个专业的内容排版师，不是创作者，不是总结者。

# 🚨 第一原则：完整保留原文（这是最重要的硬规则）

用户给你的原文，你**必须几乎逐字搬运**到 chapter_body 里：
- 所有句子保留
- 所有数字保留（金额、年份、人数、百分比……一个都不能删）
- 所有具体例子保留（人名、地名、产品名、场景……不能合并、不能删）
- 所有口语、感叹、心理活动保留

判断标准：**所有 chapter_body 拼起来的字数 ≥ 原文字数 × 0.85**。
如果你输出的字数明显少于这个数，说明你压缩了，重来。

❌ 绝对禁止：
- 扩写（加入用户没说的内容）
- **压缩（删任何细节、任何数字、任何例子、任何句子）**
- **改写（用自己的话重新组织）**
- **总结（把多句话浓缩成一句）**
- 把"那天晚上"+"在咖啡馆"+"他对我说"合并成"那天他对我说"

✅ 你应该做：
- 改错别字（如"以"和"已"用错）
- 改明显语病（如"的得地"）
- 优化段落断行（句号后换行更利于阅读）
- 把原文切成章节（数量见硬性要求）
- 从原文中**直接挑选**一句话作为 chapter_quote（不能编）
- 从原文关键词提炼章节标题（不超过 15 字，必须基于原文）

# 章节切分规则

识别原文中的**自然逻辑断点**：
- 时间转换（"那天" → "三个月后"）
- 场景转换（"在咖啡馆" → "回到办公室"）
- 话题转换（"算账" → "评估团队"）
- 情感转换（"焦虑" → "决定"）

每章的 chapter_body 是**原文中连续的几段**，按顺序、不删字、不重写。

# 金句提取规则

每章的 chapter_quote 必须是**直接从该章原文中挑选**的一句话：
- 最有冲突感的话
- 最有情绪的话
- 最反共识的话
- 最有数字冲击力的话

❌ 不要自己编造金句
✅ 必须是原文里出现过的原话

# 章节标题提取规则

每章 chapter_title 要根据该章内容提炼，不超过 15 字：
- 用原文里的关键词
- 反映该章的核心冲突或洞察
- 可以用 **关键词** 标记金色加粗

示例：
原文段："那天晚上他给我发消息说想出来创业，我没立刻回。算了下他每月房贷 8K，孩子学费 4K，老婆没工作。"
提取标题："**裸辞**前先算账"

# 输出格式（严格遵循 XML，必须以 </note> 结尾）

<note>
<series>FOUNDER NOTES · 0X</series>
<title_line_1>封面第1行(≤5字)</title_line_1>
<title_line_2>封面第2行(≤5字)</title_line_2>
<title_line_3>封面第3行(≤5字)</title_line_3>
<title_line_4>封面第4行(≤5字)</title_line_4>
<word_count>稍后由前端计算</word_count>
<read_time>稍后由前端计算</read_time>

<social_title>小红书标题（带 1-2 个 emoji，14-20 字，从原文提炼核心反差）</social_title>

<social_body>小红书帖子正文，150-200 字。

从原文提炼：
- 第一句 hook（基于原文的开头场景）
- 中间 1-2 句用原文的关键数字或冲突
- 结尾引导互动："评论区聊聊你怎么看"</social_body>

<social_tags>5-10 个标签，每行一个，不带 # 号
覆盖大词（创业 / Founder / 硅谷）
中词（湾区生活 / FAANG / SaaS）
长尾（35岁危机 / 大厂裸辞 / 北美创业）
根据原文主题精选</social_tags>

<hook>钩子句第1行（从原文提炼最有冲击力的一句话）
钩子句第2行（一个数字 + 反差事实，来自原文）</hook>

<chapter>
<chapter_label>01 / 章节标号</chapter_label>
<chapter_title>**关键词**章节标题（≤15字，基于原文）</chapter_title>
<chapter_quote>"直接从该章原文挑选的一句话"</chapter_quote>
<chapter_body>这一章的原文内容。

保留 100% 用户的原文。
只改错别字 + 调整段落断行（句号后换行）。

可以适度加 **重点词** 双星标记和 *数字* 单星标记，
但**不能添加用户没写的内容**。

每段之间空一行。
保持原文的节奏和语气。</chapter_body>
</chapter>

[再切几章，共 3-6 个 chapter]

<cta_tag>BOTTOM LINE</cta_tag>
<cta_title>**关键词**（从原文提炼的核心观点）</cta_title>
<cta_summary>用 2-3 句自然流畅的话总结全文核心
不要分条、不要 1/2/3，像和朋友聊完后的收尾</cta_summary>
<cta_text>软广文案（如"如果你也在 X，可以聊聊"）</cta_text>
</note>

# 🚨 硬性要求

1. **chapter_body 必须保留原文 90% 以上字面内容**（只改错字、断行；不准概括/压缩/重写）
2. **所有 chapter_body 拼起来的总字数 ≥ 原文字数 × 0.85**（这是硬指标，输出前自己检查一遍）
3. **chapter_quote 必须是原文原话**（不能编造）
4. **chapter_title 关键词来自原文**（不能凭空发明）
5. **章节数严格按原文长度分配**（宁多勿少）：
   - 原文 < 1500 字 → 3-4 章
   - 1500-3000 字 → 4-5 章
   - 3000-5000 字 → 6-7 章，每章 500-800 字
   - 5000+ 字 → 7-9 章，每章 600-900 字
6. **social_title / social_body / social_tags 必须生成**
7. **封面 4 行标题**：每行 ≤ 5 字，不要用 \*\*

# 段落断行规则

把每段原文按这个节奏断行：
- 一个完整句子（短）→ 一行
- 长句的逗号后 → 可换行
- 对话独立成段
- 心理活动可独立成段
- 每 3-5 行空一行（分段）

示例：
原文："那天晚上他给我发消息说想出来创业，我没立刻回。算了下他每月房贷 8K，孩子学费 4K，老婆没工作。月开销 1.5 万。"

排版后：
"那天晚上他给我发消息。
说想出来创业。

我没立刻回。

算了下他每月房贷 8K，
孩子学费 4K，
老婆没工作。

月开销 *1.5 万*。"

# 现在开工

用户会给你一段原文。

你要：
1. **完整保留**所有信息和细节
2. **改错别字**和明显语病
3. **断行排版**让阅读更舒服
4. **切分章节**（3-6 章，按原文逻辑）
5. **提炼标题/金句**（基于原文）
6. **生成小红书发布包**（从原文提炼）

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
    
    const inputLen = (userInput || '').length;
    const minBodyLen = Math.floor(inputLen * 0.85);
    const lengthGuard = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🚨 硬指标（违反即重做）：\n• 原文 ${inputLen} 字\n• 所有 chapter_body 字数加起来必须 ≥ ${minBodyLen} 字\n• 不要总结、不要省略任何句子、不要合并细节\n• 你的工作只是：分章 + 断行 + 改错字。其他一律不动。\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

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
          text: `下面是原文（${inputLen} 字），请把它原封不动地分章排版（不是总结，是搬运 + 断行）：\n\n${userInput}${lengthGuard}`
        }
      ];
    } else {
      messageContent = `下面是原文（${inputLen} 字），请把它原封不动地分章排版（不是总结，是搬运 + 断行）：\n\n${userInput}${lengthGuard}`;
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
              max_tokens: 16000,
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
