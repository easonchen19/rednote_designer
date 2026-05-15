// /api/extract-images.js - 图片文字提取（Supabase 版）
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

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

async function getCount(scope, identifier, date) {
  const { data, error } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('scope', scope)
    .eq('identifier', identifier)
    .eq('date', date)
    .maybeSingle();
  if (error) {
    console.error('Get count error:', error);
    return 0;
  }
  return data?.count || 0;
}

async function incrementCount(scope, identifier, date) {
  const { data: existing } = await supabase
    .from('rate_limits')
    .select('count')
    .eq('scope', scope)
    .eq('identifier', identifier)
    .eq('date', date)
    .maybeSingle();
  
  if (existing) {
    await supabase
      .from('rate_limits')
      .update({ count: existing.count + 1 })
      .eq('scope', scope)
      .eq('identifier', identifier)
      .eq('date', date);
  } else {
    await supabase
      .from('rate_limits')
      .insert({ scope, identifier, date, count: 1 });
  }
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
    
    const today = getTodayKey();
    const EXTRACT_IP_LIMIT = parseInt(process.env.DAILY_EXTRACT_IP_LIMIT || '5');
    const extractCount = await getCount('extract-ip', ip, today);
    
    if (extractCount >= EXTRACT_IP_LIMIT) {
      return res.status(429).json({
        error: `你今日图片提取已用 ${extractCount}/${EXTRACT_IP_LIMIT} 次，请明天再来`,
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
    
    // ⭐ 三层 Fallback：Haiku → Sonnet → Opus
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
              max_tokens: 8000,
              messages: [{ role: 'user', content: messageContent }]
            })
          });
          
          if (resp.ok) {
            response = resp;
            usedModel = model.name;
            success = true;
            console.log(`✅ 使用 ${model.name}`);
            break;
          }
          
          if (resp.status === 529) {
            console.log(`⚠️ ${model.name} 过载，第 ${attempt}/${model.maxRetries} 次`);
            lastError = { status: 529, model: model.name };
            if (attempt < model.maxRetries) {
              await new Promise(r => setTimeout(r, 1500 * attempt));
              continue;
            }
            break;
          }
          
          const errorText = await resp.text();
          lastError = { status: resp.status, errorText, model: model.name };
          
          if (resp.status === 401 || resp.status === 400) {
            // 严重错误，不切换模型
            response = resp;
            break;
          }
          
          if (attempt < model.maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
            continue;
          }
          
        } catch (err) {
          console.error(`❌ ${model.name} 网络错误:`, err.message);
          lastError = { status: 0, errorText: err.message, model: model.name };
          if (attempt < model.maxRetries) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
            continue;
          }
        }
      }
      
      if (success) break;
      
      if (lastError && (lastError.status === 401 || lastError.status === 400)) {
        break;
      }
    }
    
    if (!response || !response.ok) {
      let errorMsg = '图片识别失败';
      let userHint = '';
      
      if (lastError) {
        if (lastError.status === 529) {
          errorMsg = '所有 AI 模型都繁忙';
          userHint = '已尝试 Haiku/Sonnet/Opus 都返回过载，请等 1-2 分钟再试';
        } else if (lastError.status === 401) {
          errorMsg = 'API Key 无效';
          userHint = '请联系管理员';
        } else if (lastError.status === 429) {
          errorMsg = '请求频率超限';
          userHint = '请稍等几分钟再试';
        } else {
          try {
            const errJson = JSON.parse(lastError.errorText || '{}');
            if (errJson.error?.message) errorMsg += ': ' + errJson.error.message;
          } catch (e) {
            errorMsg += `: HTTP ${lastError.status}`;
          }
        }
      }
      
      return res.status(lastError?.status === 529 ? 503 : 500).json({ 
        error: errorMsg,
        hint: userHint,
        debug: {
          model: lastError?.model,
          claudeStatus: lastError?.status,
          claudeError: (lastError?.errorText || '').slice(0, 500)
        }
      });
    }
    
    const data = await response.json();
    const extractedText = data.content[0].text;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    
    // 增加计数
    await incrementCount('extract-ip', ip, today);
    await incrementCount('extract-global', 'global', today);
    
    // 根据实际使用的模型计算成本
    const PRICING = {
      'Haiku 4.5':  { input: 0.000001, output: 0.000005 },
      'Sonnet 4.6': { input: 0.000003, output: 0.000015 },
      'Opus 4.7':   { input: 0.000005, output: 0.000025 }
    };
    const pricing = PRICING[usedModel] || PRICING['Opus 4.7'];
    
    // 写日志
    const duration = Date.now() - startTime;
    await supabase.from('request_logs').insert({
      ip,
      user_agent: req.headers['user-agent'] || '',
      type: 'extract-images',
      image_count: images.length,
      output: extractedText.slice(0, 10000),
      duration_ms: duration,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost: parseFloat((inputTokens * pricing.input + outputTokens * pricing.output).toFixed(6)),
      model: usedModel
    });
    
    return res.status(200).json({
      text: extractedText,
      model: usedModel,
      stats: {
        imageCount: images.length,
        duration,
        remaining: EXTRACT_IP_LIMIT - extractCount - 1
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
