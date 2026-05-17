// /api/generate-cover-image.js
// Generate a cover image via fal.ai FLUX schnell for the article theme
// Requires env var: FAL_KEY (get from https://fal.ai/dashboard/keys)

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

  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'FAL_KEY not configured',
      hint: '请在 Vercel 环境变量里设置 FAL_KEY（从 https://fal.ai/dashboard/keys 获取）再使用 AI 封面图功能。'
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
    // fal.ai sync endpoint: https://fal.run/<model>
    const resp = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`
      },
      body: JSON.stringify({
        prompt,
        image_size: 'landscape_16_9',
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: true
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('fal.ai image gen error:', resp.status, errText);
      res.status(resp.status).json({
        error: `图片生成失败 (HTTP ${resp.status})`,
        debug: errText.slice(0, 500)
      });
      return;
    }

    const data = await resp.json();
    const url = data?.images?.[0]?.url;
    if (!url) {
      res.status(500).json({ error: '图片生成返回为空', debug: JSON.stringify(data).slice(0, 500) });
      return;
    }

    // Fetch the image from fal CDN and inline as base64 so frontend can embed and html2canvas can render
    const imgResp = await fetch(url);
    if (!imgResp.ok) {
      res.status(500).json({ error: '下载图片失败', debug: `image url HTTP ${imgResp.status}` });
      return;
    }
    const mimeType = imgResp.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await imgResp.arrayBuffer());
    const b64 = buf.toString('base64');

    res.status(200).json({
      dataUrl: `data:${mimeType};base64,${b64}`,
      prompt
    });
  } catch (err) {
    console.error('Cover image handler error:', err);
    res.status(500).json({ error: '服务出错: ' + err.message });
  }
}
