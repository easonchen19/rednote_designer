// 用 Puppeteer + @sparticuz/chromium 在 Vercel serverless 里把页面截成 PNG
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

/**
 * 拉起 Chromium，加载已部署的 index.html，通过 fillFromAI 注入内容，
 * 然后对 #pages-output 下每个 .page 元素做高分辨率截图。
 *
 * @param {object} parsed - parseXMLResponse 输出的同结构对象（title_lines / chapters / cta_* / social_* / hook 等）
 * @param {object} opts
 * @param {string} opts.baseUrl - 已部署的应用根 URL（如 https://rednote123.vercel.app）
 * @param {string} opts.theme   - 'article' | 'dark-gold' | 'notion'
 * @returns {Promise<Array<{filename: string, buffer: Buffer}>>}
 */
export async function renderPagesToBuffers(parsed, { baseUrl, theme = 'article' }) {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--font-render-hinting=none'],
    defaultViewport: { width: 600, height: 900, deviceScaleFactor: 3 },
    executablePath,
    headless: chromium.headless
  });

  try {
    const page = await browser.newPage();
    page.on('pageerror', err => console.warn('[puppeteer pageerror]', err.message));
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' || /warn/i.test(text)) console.warn('[puppeteer console]', text);
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 45000 });

    // 等待主脚本初始化（fillFromAI 是函数声明，挂在 window 上）
    await page.waitForFunction(
      () => typeof window.fillFromAI === 'function' && typeof window.applyTheme === 'function',
      { timeout: 15000 }
    );

    // 注入主题 + 内容
    await page.evaluate(({ data, theme }) => {
      window.applyTheme(theme);
      window.fillFromAI(data);
    }, { data: parsed, theme });

    // 等待 #pages-output 渲染完成
    await page.waitForSelector('#pages-output .page', { timeout: 15000 });
    // 给分页算法时间跑完
    await new Promise(r => setTimeout(r, 2000));

    // 关掉手机端缩放（exporting 类会取消 scale transform）
    await page.evaluate(() => document.body.classList.add('exporting'));

    const handles = await page.$$('#pages-output .page');
    if (handles.length === 0) throw new Error('Puppeteer 没找到 .page 元素');

    const buffers = [];
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      const pageType = (await h.evaluate(el => el.getAttribute('data-page'))) || `page_${String(i + 1).padStart(2, '0')}`;
      const buf = await h.screenshot({ type: 'png', omitBackground: false });
      buffers.push({ filename: `${pageType}.png`, buffer: buf });
    }
    return buffers;
  } finally {
    await browser.close();
  }
}
