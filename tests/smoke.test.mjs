// Smoke tests for the static pages (no build step). Runs with Node 18+ or Bun.
//
//   npm install && npx playwright install chromium
//   npm test                     (or: bun tests/smoke.test.mjs)
//   CHROME=/usr/bin/google-chrome THREE_DIR=/dir/with/three.min.js+GLTFLoader.js npm test   # offline
//
// Checks every language version of the ski and snowboard pages (no JS errors, every level,
// carving angulation selector, mistake-flow drill button, no overflow at 390 px), the
// resort-skills page (every module, lesson and step, Prev/Next, illustration, completion,
// scenario quiz, language switch), the gym page (every move) and the landing pages.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['index.html', 'en.html', 'zh-tw.html', 'zh-cn.html'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const fails = [];
const check = (name, ok, msg = '') => { if (!ok) { fails.push(`${name}: ${msg}`); console.log('  FAIL', name, msg); } };

function serve() {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    try {
      const body = await readFile(join(ROOT, p));
      res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

async function openPage(b, url, { webgl = true } = {}) {
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e)));
  const td = process.env.THREE_DIR;
  if (td) {
    await pg.route('**/three.min.js', r => r.fulfill({ path: join(td, 'three.min.js') }));
    await pg.route('**/GLTFLoader.js', r => r.fulfill({ path: join(td, 'GLTFLoader.js') }));
  }
  await pg.goto(url);
  await pg.waitForTimeout(webgl ? 3500 : 400);
  return { pg, errs };
}
const overflow = pg => pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);

async function pick(pg, lv) {
  await pg.evaluate(l => {
    const b = document.querySelector(`[data-l="${l}"]`), box = b.closest('[data-tierbox]');
    if (box) document.querySelector(`[data-tier="${box.dataset.tierbox}"]`).click();
    b.click();
  }, lv);
  await pg.waitForTimeout(250);
}

async function coachPage(b, url, name) {
  const { pg, errs } = await openPage(b, url);
  const levels = await pg.evaluate(() => [...new Set([...document.querySelectorAll('[data-l]')].map(b => b.dataset.l))]);
  for (const lv of levels) await pick(pg, lv);
  check(name + ' levels', !errs.length, errs.slice(0, 2).join('; '));
  await pick(pg, 'carve'); await pg.waitForTimeout(600);
  const edge = async () => (await pg.innerText('#c4Tbl')).split('\n').filter(l => l.includes('Edge') && l.includes('°')).pop() || '';
  await pg.selectOption('#anguSel', '0'); await pg.waitForTimeout(900); const e0 = await edge();
  await pg.selectOption('#anguSel', '30'); await pg.waitForTimeout(900); const e30 = await edge();
  check(name + ' angulation', e0 && e30 && e0 !== e30, `${e0} vs ${e30}`);
  await pg.selectOption('#anguSel', '');
  const st = await pg.evaluate(() => [...document.querySelectorAll('[data-st]')].map(b => b.dataset.st).find(k => k !== 'ok'));
  await pg.click(`[data-st="${st}"]`); await pg.waitForTimeout(300);
  const fx = pg.locator('[data-fix]').first(), target = await fx.getAttribute('data-fix');
  await fx.click(); await pg.waitForTimeout(400);
  const on = await pg.evaluate(() => document.querySelector('[data-l].on')?.dataset.l);
  check(name + ' mistake flow', on === target, `${on} != ${target}`);
  const ov = await overflow(pg); check(name + ' overflow', ov <= 1, `${ov}px wider than the screen`);
  check(name + ' js errors', !errs.length, errs.slice(0, 2).join('; '));
  await pg.close();
}

async function resortPage(b, url, name) {
  const { pg, errs } = await openPage(b, url, { webgl: false });
  const mods = await pg.$$eval('[data-mod]', bs => bs.map(b => b.dataset.mod));
  check(name + ' modules', mods.length === 5, `${mods.length} modules`);
  for (const m of mods) {
    await pg.click(`[data-mod="${m}"]`);
    const lessons = await pg.$$eval('[data-les]', bs => bs.map(b => b.dataset.les));
    check(`${name} ${m} lessons`, lessons.length > 0, 'no lessons');
    for (const l of lessons) {
      await pg.click(`[data-les="${l}"]`);
      const n = await pg.$$eval('#dots span', s => s.length);
      const first = await pg.innerText('#stepTitle');
      const titles = new Set([first]);
      for (let i = 1; i < n; i++) { await pg.click('#next'); titles.add(await pg.innerText('#stepTitle')); }
      check(`${name} ${l} next`, titles.size === n, `${titles.size} distinct titles for ${n} steps`);
      await pg.waitForTimeout(150);
      check(`${name} ${l} illustration`, (await pg.$eval('#scene', s => s.childElementCount)) > 0, 'empty scene');
      for (let i = 1; i < n; i++) await pg.click('#prev');
      check(`${name} ${l} prev`, (await pg.innerText('#stepTitle')) === first, 'did not return to step 1');
      const lists = await pg.evaluate(() => ['okList', 'badList'].map(id => document.getElementById(id).children.length));
      check(`${name} ${l} content`, lists.every(x => x > 0) && (await pg.innerText('#why')).length > 0, 'missing correct/mistake/why');
      const done = await pg.$$eval('#dots span.done', s => s.length);
      check(`${name} ${l} completion`, done === n, `${done}/${n} marked done`);
    }
  }
  const answers = await pg.$$eval('[data-q]', bs => bs.length);
  check(name + ' quiz', answers >= 3, 'quiz missing');
  if (answers) { await pg.click('[data-q="1"]'); check(name + ' quiz feedback', (await pg.$('[data-q="1"].right')) !== null, 'answer 2 should be marked right'); }
  const ov = await overflow(pg); check(name + ' overflow', ov <= 1, `${ov}px wider than the screen`);
  // the language menu lists every language in its own script, so leave it out
  const txt = await pg.evaluate(() => { const c = document.body.cloneNode(true); c.querySelector('#langSel')?.remove(); c.querySelectorAll('script,style').forEach(e => e.remove()); return c.textContent; });
  check(name + ' no Japanese kana', !/[぀-ヿ]/.test(txt), 'kana found');
  if (name.endsWith('en.html')) {
    const left = txt.match(/[^\n]*[一-鿿][^\n]*/);
    check(name + ' english only', !left, 'Chinese left: ' + (left || [''])[0].slice(0, 60));
  }
  check(name + ' local-rules note', /staff|工作人員|工作人员/.test(txt), 'missing');
  check(name + ' js errors', !errs.length, errs.slice(0, 2).join('; '));
  await pg.close();
}

const srv = await serve();
const base = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
});
try {
  for (const l of LANGS) { console.log('checking resort', l); await resortPage(b, base + `resort/${l}`, `resort/${l}`); }
  {
    const { pg } = await openPage(b, base + 'resort/en.html', { webgl: false });
    await pg.selectOption('#langSel', 'zh-tw.html');
    await pg.waitForURL(/zh-tw\.html$/);
    const h1 = await pg.innerText('h1');
    check('resort language switch', h1.includes('雪場實用技能'), h1);
    await pg.close();
  }
  for (const d of ['ski', 'snowboard']) for (const l of LANGS) { console.log('checking', d, l); await coachPage(b, base + `${d}/${l}`, `${d}/${l}`); }
  console.log('checking gym');
  const { pg, errs } = await openPage(b, base + 'gym/index.html');
  for (const t of await pg.$$eval('[data-c]', bs => bs.map(b => b.dataset.c))) {
    await pg.click(`[data-c="${t}"]`); await pg.waitForTimeout(200);
    for (const m of await pg.$$eval('[data-m]', bs => bs.map(b => b.dataset.m))) { await pg.click(`[data-m="${m}"]`); await pg.waitForTimeout(120); }
  }
  check('gym js errors', !errs.length, errs.slice(0, 2).join('; '));
  check('gym overflow', (await overflow(pg)) <= 1);
  await pg.close();
  for (const l of LANGS) {
    console.log('checking landing', l);
    const { pg, errs } = await openPage(b, base + l, { webgl: false });
    check(l + ' landing', !errs.length, errs.slice(0, 2).join('; '));
    const href = await pg.getAttribute('a[href^="resort/"]', 'href');
    check(l + ' landing resort link', href === `resort/${l}`, String(href));
    await pg.close();
  }
} finally {
  await b.close();
  srv.close();
}
console.log('\n' + (fails.length ? `${fails.length} FAILED:\n` + fails.join('\n') : 'ALL PASSED'));
process.exit(fails.length ? 1 : 0);
