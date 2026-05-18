// scripts/run-daily.mjs
// 由 GitHub Actions 调用：
//   1. POST /api/prepare-content（拿到 parsed JSON）
//   2. Playwright 启动 Chromium，加载已部署的应用，注入内容，截图所有 .page
//   3. 打包 ZIP
//   4. POST /api/cron-daily-finish 带 ZIP 发邮件

import { chromium } from 'playwright';
import JSZip from 'jszip';

const APP_URL = (process.env.VERCEL_APP_URL || 'https://rednote123.vercel.app').replace(/\/$/, '');
const SECRET = process.env.CRON_SECRET;
const THEME = process.env.AUTO_THEME || 'article';

if (!SECRET) {
  console.error('❌ Missing CRON_SECRET');
  process.exit(1);
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  log(`🌅 启动每日生成 (theme=${THEME}, app=${APP_URL})`);

  // ─── 1. 准备内容 ─────────────────────────────
  log('📡 调 /api/prepare-content 拉新闻 + 生成文章...');
  const prepResp = await fetch(`${APP_URL}/api/prepare-content`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SECRET}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!prepResp.ok) {
    const t = await prepResp.text();
    throw new Error(`prepare-content ${prepResp.status}: ${t.slice(0, 400)}`);
  }
  const { parsed, seed } = await prepResp.json();
  const bodyChars = parsed.chapters.reduce((s, c) => s + (c.body || '').length, 0);
  log(`✅ 内容生成完成：${parsed.chapters.length} 章 / ${bodyChars} 字（选稿："${seed.title}"）`);

  // ─── 2. Playwright 渲染 ─────────────────────────
  log('🖼️ 启动 Chromium...');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({
    viewport: { width: 600, height: 900 },
    deviceScaleFactor: 3
  });
  const page = await context.newPage();
  page.on('pageerror', err => log(`⚠️ page error: ${err.message}`));

  log(`🌐 加载 ${APP_URL}/...`);
  await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });

  await page.waitForFunction(
    () => typeof window.fillFromAI === 'function' && typeof window.applyTheme === 'function',
    null,
    { timeout: 15000 }
  );

  log(`💉 注入内容（theme=${THEME}）...`);
  await page.evaluate(({ data, theme }) => {
    window.applyTheme(theme);
    window.fillFromAI(data);
  }, { data: parsed, theme: THEME });

  await page.waitForSelector('#pages-output .page', { timeout: 15000 });
  await page.waitForTimeout(2500); // 让分页算法跑完
  await page.evaluate(() => document.body.classList.add('exporting'));

  const handles = await page.$$('#pages-output .page');
  if (handles.length === 0) throw new Error('没找到 .page 元素');
  log(`📸 共 ${handles.length} 页，开始截图...`);

  const zip = new JSZip();
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    const pageType = (await h.getAttribute('data-page')) || `page_${String(i + 1).padStart(2, '0')}`;
    const buf = await h.screenshot({ type: 'png' });
    zip.file(`${pageType}.png`, buf);
    log(`   ${i + 1}/${handles.length} ${pageType}`);
  }

  await browser.close();
  log('🗜️ 打包 ZIP...');
  const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
  const zipBase64 = zipBuf.toString('base64');
  const zipFilename = `xiaohongshu_${new Date().toISOString().slice(0, 10)}.zip`;
  log(`📦 ZIP ${Math.round(zipBuf.length / 1024)} KB`);

  // ─── 3. 调 Vercel 发邮件（带 ZIP）────────────────
  log('📧 调 /api/cron-daily-finish 发邮件...');
  const sendResp = await fetch(`${APP_URL}/api/cron-daily-finish`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SECRET}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ parsed, seed, zipBase64, zipFilename })
  });
  if (!sendResp.ok) {
    const t = await sendResp.text();
    throw new Error(`cron-daily-finish ${sendResp.status}: ${t.slice(0, 400)}`);
  }
  const result = await sendResp.json();
  log(`🎉 邮件已发送到 ${result.emailedTo}`);
}

main().catch(err => {
  console.error('❌ 失败:', err);
  process.exit(1);
});
