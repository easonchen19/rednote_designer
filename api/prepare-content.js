// /api/prepare-content.js
// GHA 调用：跑 RSS + Claude 选稿 + 生成 + 解析，返回结构化 JSON。
// 不渲染、不发邮件。Auth: Authorization: Bearer ${CRON_SECRET}

import {
  resolveFeeds, fetchFeed, pickBest, generateNoteText, parseResponse
} from './_lib/news.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(500).json({ error: 'CRON_SECRET not configured' });
    return;
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!claudeKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  try {
    const feedList = resolveFeeds();
    console.log(`[prepare-content] feeds=${feedList.length}`);

    const allItems = (await Promise.all(feedList.map(fetchFeed))).flat();
    if (allItems.length === 0) throw new Error('No RSS items fetched');
    console.log(`[prepare-content] items=${allItems.length}`);

    const pick = await pickBest(allItems, claudeKey);
    const seed = { ...allItems[pick.index - 1], angle: pick.angle };
    console.log(`[prepare-content] picked: ${seed.title}`);

    const xml = await generateNoteText(seed, claudeKey);
    const parsed = parseResponse(xml);
    const bodyChars = parsed.chapters.reduce((s, c) => s + (c.body || '').length, 0);
    console.log(`[prepare-content] generated ${parsed.chapters.length} chapters / ${bodyChars} chars`);

    res.status(200).json({ ok: true, parsed, seed });
  } catch (err) {
    console.error('[prepare-content] error:', err);
    res.status(500).json({ error: err.message });
  }
}
