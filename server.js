const express   = require('express');
const puppeteer = require('puppeteer');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/ping', (req, res) => res.send('OK'));

const cache = new Map();
function cacheGet(id) {
  const e = cache.get(id);
  if (!e) return null;
  if (Date.now() > e.exp) { cache.delete(id); return null; }
  return e.data;
}
function cacheSet(id, data) {
  cache.set(id, { data, exp: Date.now() + 6 * 60 * 60 * 1000 });
}

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  browserInstance = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1366,768',
    ],
    defaultViewport: { width: 1366, height: 768 },
  });
  browserInstance.on('disconnected', () => { browserInstance = null; });
  return browserInstance;
}

const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

app.get('/', async (req, res) => {
  const workId = req.query.id;

  if (!workId || !/^\d+$/.test(workId)) {
    return res.status(400).json({ error: 'Missing or invalid work ID.' });
  }

  const cached = cacheGet(workId);
  if (cached) return res.json(cached);

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver',  { get: () => undefined });
      Object.defineProperty(navigator, 'plugins',    { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages',  { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
      const origQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : origQuery(params);
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language':    'en-US,en;q=0.9',
      'Accept-Encoding':    'gzip, deflate, br',
      'sec-ch-ua':          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile':   '?0',
      'sec-ch-ua-platform': '"Windows"',
    });

    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (['image', 'media', 'font'].includes(r.resourceType())) r.abort();
      else r.continue();
    });

    await page.goto('https://archiveofourown.org', {
      waitUntil: 'domcontentloaded',
      timeout:   15000,
    });

    await sleep(jitter(800, 2000));

    const response = await page.goto(
      `https://archiveofourown.org/works/${workId}?view_adult=true`,
      { waitUntil: 'domcontentloaded', timeout: 20000 }
    );

    const status = response.status();

    if (status === 429) {
      return res.json({
        error:   'rate_limited',
        message: 'AO3 is rate limiting. Wait a few minutes before trying again.',
      });
    }
    if (status === 403) {
      return res.json({ error: 'This work is restricted to registered users.' });
    }
    if (status !== 200) {
      return res.json({ error: `AO3 returned HTTP ${status}.` });
    }

    await sleep(jitter(300, 800));
    await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 300) + 100));
    await sleep(jitter(200, 500));

    const meta = await page.evaluate((id) => {

      function tagList(label) {
        for (const dt of document.querySelectorAll('dt')) {
          if (dt.textContent.replace(/:$/, '').trim() === label) {
            const dd = dt.nextElementSibling;
            if (!dd) continue;
            const links = [...dd.querySelectorAll('a')].map(a =>
              a.textContent.replace(/\s+/g, ' ').trim()
            ).filter(Boolean);
            if (links.length) return links.join(', ');
            return dd.textContent.replace(/\s+/g, ' ').trim() || 'N/A';
          }
        }
        return 'N/A';
      }

      function stat(label) {
        for (const dt of document.querySelectorAll('.stats dt')) {
          if (dt.textContent.replace(/:$/, '').trim() === label) {
            const dd = dt.nextElementSibling;
            return dd ? dd.textContent.trim() : 'N/A';
          }
        }
        return 'N/A';
      }

      const bodyText = document.body.innerText;
      if (bodyText.includes('This work is only available to registered users') ||
          bodyText.includes('You need to be logged in')) {
        return { error: 'This work is restricted to registered users.' };
      }

      const titleEl  = document.querySelector('h2.title');
      const authorEl = document.querySelector('a[rel="author"]');
      const sumEl    = document.querySelector('.summary.module blockquote');
      const seriesEl = document.querySelector('dd.series');

      return {
        title:         titleEl  ? titleEl.textContent.replace(/\s+/g, ' ').trim()  : 'N/A',
        author:        authorEl ? authorEl.textContent.trim()                       : 'N/A',
        fandom:        tagList('Fandom'),
        relationships: tagList('Relationship'),
        characters:    tagList('Characters'),
        tags:          tagList('Additional Tags'),
        warning:       tagList('Archive Warning'),
        category:      tagList('Category'),
        rating:        tagList('Rating'),
        words:         stat('Words'),
        datePosted:    stat('Published'),
        summary:       sumEl    ? sumEl.textContent.replace(/\s+/g, ' ').trim()    : 'N/A',
        series:        seriesEl ? seriesEl.textContent.replace(/\s+/g, ' ').trim() : 'N/A',
        ao3Link:       `https://archiveofourown.org/works/${id}`,
      };
    }, workId);

    if (meta.error) return res.json(meta);

    cacheSet(workId, meta);
    return res.json(meta);

  } catch (err) {
    return res.status(500).json({ error: `Server error: ${err.message}` });
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
});

app.listen(PORT, async () => {
  try { await getBrowser(); } catch (e) {}
});
