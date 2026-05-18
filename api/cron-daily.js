// /api/cron-daily.js
// 每天 PST 7am 自动跑：RSS → Claude 选稿 → 生成 Founder Notes →
//   1) 调 Puppeteer 把每页排版截成 PNG
//   2) 打包 ZIP
//   3) Resend 邮件（带 ZIP 附件）
//
// 需要的 env vars:
//   ANTHROPIC_API_KEY      (已有)
//   RESEND_API_KEY         (已有)
//   RESEND_FROM            (可选)
//   AUTO_EMAIL_TO          (可选，默认 eason@jaguarai.ai)
//   CRON_SECRET            (Vercel cron 自动注入；用来防止外部滥用)
//   RSS_FEEDS              (可选 CSV，默认 HN + TechCrunch + a16z)
//   BASE_URL               (可选；不设的话用 VERCEL_PROJECT_PRODUCTION_URL)

import JSZip from 'jszip';
import { renderPagesToBuffers } from './_lib/render-pages.js';

export const config = { maxDuration: 300 };

const DEFAULT_FEEDS = [
  { url: 'https://hnrss.org/frontpage?points=100', source: 'HackerNews' },
  { url: 'https://techcrunch.com/feed/', source: 'TechCrunch' },
  { url: 'https://a16z.com/feed/', source: 'a16z' }
];

// 适合"基于新闻 + 视角生成评论文"的 prompt，与主 generate 的"原文复刻"不同
const NEWS_COMMENTARY_PROMPT = `你是 Will，硅谷连续创业者，专长是 AI / SaaS / 创业心理 / 融资节奏。
今天给你一条新闻 + 你想到的切入角度，请扩写成一篇 Founder Notes 风格的小红书长文。

# 风格
- 反共识、有冲突感、不像新闻报道
- 中英混排自然（VP / MD / runway / PMF / burn rate 等可直接英文）
- 有具体数字、人名、场景细节（可基于你对硅谷的常识合理想象）
- 1500-2500 字
- 6-8 个章节，每章 250-400 字

# 输出格式（严格 XML，必须以 </note> 结尾）

<note>
<series>FOUNDER NOTES · 0X</series>
<title_line_1>标题第 1 行（10-16 字，能放一行就一行）</title_line_1>
<title_line_2>(标题超长才用第 2 行)</title_line_2>
<title_line_3>(留空)</title_line_3>
<title_line_4>(留空)</title_line_4>
<word_count>稍后前端计算</word_count>
<read_time>稍后前端计算</read_time>

<social_title>小红书标题（14-20 字，1-2 个 emoji，有冲突）</social_title>
<social_body>小红书帖子正文 150-200 字：第一句 hook，中间 1-2 句具体数字或冲突，结尾"评论区聊聊"</social_body>
<social_tags>5-10 个标签，一行一个，不带 #</social_tags>

<hook>钩子句第 1 行
钩子句第 2 行（数字 + 反差）</hook>

<chapter>
<chapter_label>01 / 章节标号</chapter_label>
<chapter_title>**关键词**章节小标题（≤15 字）</chapter_title>
<chapter_quote>"该章里最有冲突感的一句话"</chapter_quote>
<chapter_body>这一章的正文 250-400 字，分段、断行、可用 **加粗** 和 *数字* 标记重点</chapter_body>
</chapter>

[共 6-8 个 chapter]

<cta_tag>BOTTOM LINE</cta_tag>
<cta_title>**关键词**核心观点</cta_title>
<cta_summary>2-3 句流畅总结全文，不分条</cta_summary>
<cta_text>软广文案（如"如果你也在 X，可以聊聊"）</cta_text>
</note>

# 严格要求
1. 必须输出 6-8 个完整 chapter
2. 所有 chapter_body 拼起来 ≥ 1500 字
3. title 优先 1 行装下
4. 不要凡尔赛，不要 LinkedIn 鸡汤体
`;

function stripHTML(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchFeed({ url, source }) {
  try {
    const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 FounderNotesBot' } });
    if (!resp.ok) {
      console.warn(`RSS ${url} HTTP ${resp.status}`);
      return [];
    }
    const xml = await resp.text();
    const items = [];
    const blocks = xml.match(/<item[\s\S]*?<\/item>/g) || xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
    for (const block of blocks.slice(0, 8)) {
      const title = stripHTML((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
      const desc = stripHTML((block.match(/<(?:description|summary)[^>]*>([\s\S]*?)<\/(?:description|summary)>/) || [])[1] || '');
      const linkMatch = block.match(/<link[^>]*?>([^<]+)<\/link>/) || block.match(/<link[^>]*?href="([^"]+)"/);
      const link = linkMatch ? linkMatch[1] : '';
      if (title) items.push({ title, desc: desc.slice(0, 400), link, source });
    }
    return items;
  } catch (err) {
    console.error(`RSS fetch failed for ${url}:`, err.message);
    return [];
  }
}

async function pickBest(items, apiKey) {
  const list = items.map((it, i) => `${i + 1}. [${it.source}] ${it.title}\n   ${it.desc.slice(0, 200)}`).join('\n\n');
  const prompt = `下面是今天的 ${items.length} 条新闻。你是 Will，硅谷连续创业者，专长 AI / SaaS / 创业心理。

从里面挑出 1 条最值得你写一篇深度评论的（要有反共识、创业心理、不能是普通报道型新闻）：

${list}

只输出 JSON（不要别的）：
{"index": N, "angle": "你打算怎么切（1-2 句独特视角）"}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!resp.ok) {
    console.error('pickBest err:', await resp.text());
    return { index: 1, angle: '' };
  }
  const data = await resp.json();
  const text = data?.content?.[0]?.text || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      const idx = Math.max(1, Math.min(items.length, parseInt(obj.index) || 1));
      return { index: idx, angle: String(obj.angle || '').slice(0, 500) };
    } catch (err) {
      console.warn('pickBest JSON parse failed:', err.message, m[0].slice(0, 200));
    }
  }
  return { index: 1, angle: '' };
}

async function generateNote(seed, apiKey) {
  const userMessage = `今天看到一条新闻：

标题：${seed.title}
摘要：${seed.desc}
来源：${seed.source}${seed.link ? '\n链接：' + seed.link : ''}

我想从这个角度切入：${seed.angle || '（自由发挥，找最有反共识的角度）'}

请基于这个新闻 + 我的视角，写一篇 1500-2500 字的 Founder Notes 长文。完整输出 XML 格式。`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 16000,
      system: NEWS_COMMENTARY_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude generate err ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data?.content?.[0]?.text || '';
}

function ext(content, tag) {
  const m = content.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  return m[1].replace(/<\/?[a-zA-Z_][\w_]*>/g, '').trim();
}

// 返回前端 fillFromAI 兼容的完整结构
function parseResponse(xml) {
  const noteMatch = xml.match(/<note>([\s\S]*?)<\/note>/) || xml.match(/<note>([\s\S]*)/);
  const content = noteMatch ? noteMatch[1] : xml;

  const title_lines = [1, 2, 3, 4].map(i => ext(content, `title_line_${i}`));
  const chapters = [];
  const re = /<chapter>([\s\S]*?)<\/chapter>/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const c = m[1];
    chapters.push({
      label: ext(c, 'chapter_label'),
      title: ext(c, 'chapter_title'),
      quote: ext(c, 'chapter_quote'),
      body: ext(c, 'chapter_body')
    });
  }

  return {
    series: ext(content, 'series') || 'FOUNDER NOTES · 01',
    title_lines,
    word_count: ext(content, 'word_count') || '',
    read_time: ext(content, 'read_time') || '',
    hook: ext(content, 'hook'),
    cta_tag: ext(content, 'cta_tag') || 'BOTTOM LINE',
    cta_title: ext(content, 'cta_title'),
    cta_summary: ext(content, 'cta_summary').split('\n').filter(x => x.trim()),
    cta_text: ext(content, 'cta_text'),
    social_title: ext(content, 'social_title'),
    social_body: ext(content, 'social_body'),
    social_tags: ext(content, 'social_tags').split('\n').map(t => t.trim().replace(/^#+/, '')).filter(Boolean),
    chapters
  };
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail({ to, parsed, seed, zipBase64, zipFilename }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const rawFrom = process.env.RESEND_FROM || 'Founder Notes <onboarding@resend.dev>';
  const fromAddress = rawFrom.replace(/<([^>]+)>/, (_, email) => {
    const at = email.lastIndexOf('@');
    return at < 0 ? `<${email.toLowerCase()}>` : `<${email.slice(0, at)}@${email.slice(at + 1).toLowerCase()}>`;
  });

  const title = (parsed.title_lines || []).filter(Boolean).join('').replace(/\*\*/g, '');
  const subject = (parsed.social_title || title || '今日 Founder Notes').replace(/\n/g, ' ');
  const tagLine = (parsed.social_tags || []).map(t => '#' + t).join(' ');

  const html = `<div style="font-family: -apple-system, 'PingFang SC', sans-serif; line-height: 1.7; color: #1a1a1a; max-width: 640px;">
    <p style="font-size: 12px; color: #888; margin: 0 0 16px 0;">🌅 自动生成 · 基于今日新闻：<a href="${escapeHtml(seed.link)}" style="color: #888;">${escapeHtml(seed.title)}</a> · ${escapeHtml(seed.source)}</p>
    <h2 style="font-size: 20px; margin: 0 0 12px 0;">${escapeHtml(subject)}</h2>
    <pre style="white-space: pre-wrap; font-family: inherit; font-size: 15px; margin: 0 0 18px 0;">${escapeHtml(parsed.social_body || parsed.hook || '')}</pre>
    ${tagLine ? `<p style="color: #b8862e; font-size: 14px;">${escapeHtml(tagLine)}</p>` : ''}
    <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
    <h3 style="font-size: 14px; color: #888; margin: 0 0 14px 0; letter-spacing: 1px;">— 全文（按章节）—</h3>
    ${(parsed.chapters || []).map(c => `
      <div style="margin-bottom: 22px;">
        <div style="font-weight: 700; font-size: 16px; color: #1a1a1a; margin-bottom: 6px; padding-left: 8px; border-left: 3px solid #b8945c;">${escapeHtml(c.label || '')} · ${escapeHtml((c.title || '').replace(/\*\*/g, ''))}</div>
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14.5px; line-height: 1.7; margin: 0; color: #333;">${escapeHtml(c.body || '')}</pre>
      </div>
    `).join('')}
    ${zipBase64 ? `<p style="font-size: 12px; color: #888; margin-top: 16px;">📦 附件 ${escapeHtml(zipFilename || 'images.zip')} 包含全部排版图（PNG）。</p>` : ''}
  </div>`;

  const body = { from: fromAddress, to: [to], subject, html };
  if (zipBase64) {
    body.attachments = [{ filename: zipFilename || 'images.zip', content: zipBase64 }];
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Resend ${resp.status}: ${t.slice(0, 300)}`);
  }
  return await resp.json();
}

export default async function handler(req, res) {
  // Auth：Vercel cron 会带 Authorization: Bearer <CRON_SECRET>；手动 POST 不强制
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

  const feeds = (process.env.RSS_FEEDS || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(url => ({ url, source: new URL(url).hostname }));
  const feedList = feeds.length ? feeds : DEFAULT_FEEDS;

  // 决定渲染时用的应用根 URL
  const baseUrl = process.env.BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || 'https://rednote123.vercel.app';

  const theme = process.env.AUTO_THEME || 'article';

  try {
    console.log(`[cron-daily] 拉取 ${feedList.length} 个 RSS 源...`);
    const allItems = (await Promise.all(feedList.map(fetchFeed))).flat();
    if (allItems.length === 0) throw new Error('No RSS items fetched from any feed');
    console.log(`[cron-daily] 收到 ${allItems.length} 条候选`);

    const pick = await pickBest(allItems, claudeKey);
    const seed = { ...allItems[pick.index - 1], angle: pick.angle };
    console.log(`[cron-daily] 选中：${seed.title} (${seed.source})`);

    const xml = await generateNote(seed, claudeKey);
    const parsed = parseResponse(xml);
    const bodyChars = parsed.chapters.reduce((s, c) => s + (c.body || '').length, 0);
    console.log(`[cron-daily] 生成 ${parsed.chapters.length} 章 / ${bodyChars} 字`);

    // 渲染图片 + 打包 ZIP
    let zipBase64;
    let zipFilename;
    let imageCount = 0;
    try {
      console.log(`[cron-daily] 启动 Puppeteer 截图，baseUrl=${baseUrl}, theme=${theme}`);
      const buffers = await renderPagesToBuffers(parsed, { baseUrl, theme });
      imageCount = buffers.length;
      console.log(`[cron-daily] 截图完成 ${imageCount} 张，正在打包 ZIP`);
      const zip = new JSZip();
      for (const { filename, buffer } of buffers) zip.file(filename, buffer);
      const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
      zipBase64 = zipBuf.toString('base64');
      zipFilename = `xiaohongshu_${new Date().toISOString().slice(0, 10)}.zip`;
    } catch (renderErr) {
      console.error('[cron-daily] 渲染/打包失败，邮件改为只发文字：', renderErr);
    }

    await sendEmail({ to, parsed, seed, zipBase64, zipFilename });
    console.log(`[cron-daily] 邮件发送到 ${to}`);

    const titleStr = (parsed.title_lines || []).filter(Boolean).join('').replace(/\*\*/g, '');
    res.status(200).json({
      ok: true,
      seed: { title: seed.title, source: seed.source, link: seed.link },
      title: titleStr,
      chapters: parsed.chapters.length,
      bodyChars,
      images: imageCount,
      emailedTo: to
    });
  } catch (err) {
    console.error('[cron-daily] error:', err);
    res.status(500).json({ error: err.message });
  }
}
