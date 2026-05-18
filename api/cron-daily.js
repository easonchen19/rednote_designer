// /api/cron-daily.js
// 手动按钮入口（SSE 流式展示），也兼容 Vercel cron。
// 仅发文字邮件 — 图片版走 GitHub Actions（cron-daily-finish 接收 zip）

import {
  resolveFeeds, fetchFeed, pickBest, generateNoteStreaming,
  parseResponse, sendDailyEmail
} from './_lib/news.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && req.headers.authorization === `Bearer ${cronSecret}`;
  const isManualPost = req.method === 'POST';
  if (!isCron && !isManualPost) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const to = process.env.AUTO_EMAIL_TO || 'eason@jaguarai.ai';
  if (!claudeKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  const emit = (type, data = {}) => {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  };

  const feedList = resolveFeeds();

  try {
    emit('step', { name: 'rss', msg: `📡 拉取 ${feedList.length} 个 RSS 源...` });
    const allItems = (await Promise.all(feedList.map(fetchFeed))).flat();
    if (allItems.length === 0) throw new Error('No RSS items fetched from any feed');
    emit('step', { name: 'rss-done', msg: `📥 收到 ${allItems.length} 条候选` });

    emit('step', { name: 'pick', msg: '🎯 让 Claude 选稿...' });
    const pick = await pickBest(allItems, claudeKey);
    const seed = { ...allItems[pick.index - 1], angle: pick.angle };
    emit('step', { name: 'picked', msg: `✍️ 选中：${seed.title}（${seed.source}）` });
    if (seed.angle) emit('step', { name: 'angle', msg: `💡 切入角度：${seed.angle}` });

    emit('step', { name: 'generate-start', msg: '📝 流式生成文章...' });
    let streamedChars = 0;
    const xml = await generateNoteStreaming(seed, claudeKey, (chunk) => {
      streamedChars += chunk.length;
      emit('token', { chunk, chars: streamedChars });
    });
    const parsed = parseResponse(xml);
    const bodyChars = parsed.chapters.reduce((s, c) => s + (c.body || '').length, 0);
    emit('step', { name: 'generated', msg: `✅ 生成完成：${parsed.chapters.length} 章 / ${bodyChars} 字` });

    emit('step', { name: 'email', msg: `📧 发送邮件到 ${to}（文字版）...` });
    await sendDailyEmail({ to, parsed, seed });

    const titleStr = (parsed.title_lines || []).filter(Boolean).join('').replace(/\*\*/g, '');
    emit('done', {
      ok: true,
      seed: { title: seed.title, source: seed.source, link: seed.link },
      title: titleStr,
      chapters: parsed.chapters.length,
      bodyChars,
      emailedTo: to,
      msg: `🎉 完成！文字版已发到 ${to}（带图版由 GitHub Actions 定时跑）`
    });
  } catch (err) {
    console.error('[cron-daily] error:', err);
    emit('error', { message: err.message });
  } finally {
    try { res.end(); } catch {}
  }
}
