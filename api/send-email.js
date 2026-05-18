// /api/send-email.js
// Send generated content + ZIP attachment via Resend
// Requires env vars:
//   RESEND_API_KEY  - from https://resend.com/api-keys
//   RESEND_FROM     - (optional) verified sender, defaults to onboarding@resend.dev

export const config = {
  maxDuration: 60
};

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'RESEND_API_KEY 未配置',
      hint: '请在 Vercel 环境变量里设置 RESEND_API_KEY（从 https://resend.com/api-keys 获取）。'
    });
    return;
  }

  try {
    const { to, title, body, tags, zipBase64, zipFilename } = req.body || {};
    if (!to || !zipBase64) {
      res.status(400).json({ error: 'to 和 zipBase64 必填' });
      return;
    }

    const tagLine = Array.isArray(tags) && tags.length
      ? tags.map(t => '#' + String(t).replace(/^#+/, '')).join(' ')
      : '';

    const html = `<div style="font-family: -apple-system, 'PingFang SC', sans-serif; line-height: 1.7; color: #1a1a1a;">
      <h2 style="font-size: 20px; margin: 0 0 16px 0;">${escapeHtml(title || '你的 Founder Notes')}</h2>
      <pre style="white-space: pre-wrap; font-family: inherit; font-size: 15px; margin: 0 0 18px 0;">${escapeHtml(body || '')}</pre>
      ${tagLine ? `<p style="color: #b8862e; font-size: 14px;">${escapeHtml(tagLine)}</p>` : ''}
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
      <p style="font-size: 12px; color: #888;">附件包含小红书发布所需的全部图片（PNG）。</p>
    </div>`;

    const fromAddress = process.env.RESEND_FROM || 'Founder Notes <onboarding@resend.dev>';
    const filename = zipFilename || `xiaohongshu_${new Date().toISOString().slice(0, 10)}.zip`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: title || '你的 Founder Notes 发布包',
        html,
        attachments: [
          {
            filename,
            content: zipBase64
          }
        ]
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Resend error:', resp.status, errText);
      res.status(resp.status).json({
        error: `邮件发送失败 (HTTP ${resp.status})`,
        debug: errText.slice(0, 500)
      });
      return;
    }

    const data = await resp.json();
    res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('send-email handler error:', err);
    res.status(500).json({ error: '服务出错: ' + err.message });
  }
}
