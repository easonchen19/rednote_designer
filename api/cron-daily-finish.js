// /api/cron-daily-finish.js
// GHA 渲染完成后调用：接收 parsed + seed + zipBase64，调 Resend 发邮件。
// Auth: Authorization: Bearer ${CRON_SECRET}

import { sendDailyEmail } from './_lib/news.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

  try {
    const { parsed, seed, zipBase64, zipFilename, to: overrideTo } = req.body || {};
    if (!parsed || !parsed.chapters) {
      res.status(400).json({ error: 'parsed.chapters required' });
      return;
    }
    const to = overrideTo || process.env.AUTO_EMAIL_TO || 'eason@jaguarai.ai';

    const result = await sendDailyEmail({ to, parsed, seed: seed || {}, zipBase64, zipFilename });
    res.status(200).json({ ok: true, id: result?.id, emailedTo: to });
  } catch (err) {
    console.error('[cron-daily-finish] error:', err);
    res.status(500).json({ error: err.message });
  }
}
