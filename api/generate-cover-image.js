// /api/generate-cover-image.js
// Generate a cover image via OpenAI DALL-E 3 for the article theme
// Requires env var: OPENAI_API_KEY

export const config = {
  maxDuration: 60
};

function buildPrompt(title, summary) {
  const base = (title || '').replace(/\*\*/g, '').replace(/\n/g, ' ').trim();
  const ctx = (summary || '').replace(/\n/g, ' ').slice(0, 200).trim();
  return [
    `Editorial cover illustration for a Chinese business journalism article titled: "${base}".`,
    ctx ? `Article context: ${ctx}.` : '',
    `Style: cinematic, sophisticated, photorealistic, evocative metaphor, muted color grading.`,
    `Composition: wide landscape framing, dramatic lighting, suitable as a banner image.`,
    `Important: NO TEXT, NO WORDS, NO LETTERS, NO LOGOS in the image.`
  ].filter(Boolean).join(' ');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'OPENAI_API_KEY not configured',
      hint: '请在 Vercel 环境变量里设置 OPENAI_API_KEY 再使用 AI 封面图功能。'
    });
    return;
  }

  try {
    const { title, summary } = req.body || {};
    if (!title || !title.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }

    const prompt = buildPrompt(title, summary);
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1536x1024',
        quality: 'medium'
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('OpenAI image gen error:', resp.status, errText);
      res.status(resp.status).json({
        error: `图片生成失败 (HTTP ${resp.status})`,
        debug: errText.slice(0, 500)
      });
      return;
    }

    const data = await resp.json();
    const url = data?.data?.[0]?.url;
    const b64Direct = data?.data?.[0]?.b64_json;
    let b64 = b64Direct;
    if (!b64 && url) {
      // dall-e-3 默认返回 url，server-side 拉一次再 base64，避免前端跨域 + URL 过期
      const imgResp = await fetch(url);
      if (!imgResp.ok) {
        res.status(500).json({ error: '下载图片失败', debug: `image url HTTP ${imgResp.status}` });
        return;
      }
      const buf = Buffer.from(await imgResp.arrayBuffer());
      b64 = buf.toString('base64');
    }
    if (!b64) {
      res.status(500).json({ error: '图片生成返回为空', debug: JSON.stringify(data).slice(0, 500) });
      return;
    }

    res.status(200).json({
      dataUrl: `data:image/png;base64,${b64}`,
      prompt
    });
  } catch (err) {
    console.error('Cover image handler error:', err);
    res.status(500).json({ error: '服务出错: ' + err.message });
  }
}
