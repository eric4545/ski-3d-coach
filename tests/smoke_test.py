"""Smoke tests for the static pages (no build step).

Run from the repo root:
    pip install playwright && playwright install chromium
    python3 tests/smoke_test.py            # uses the CDN for three.js
    THREE_DIR=/path/with/three.min.js+GLTFLoader.js python3 tests/smoke_test.py   # offline

Checks, for every language version of the ski and snowboard pages:
  * the page loads with no JavaScript errors
  * every level button can be selected
  * the carving angulation selector changes the displayed edge angle
  * a mistake-flow drill button jumps to its drill
  * no horizontal overflow at a 390 px phone width
plus the gym page (every move) and the landing pages.
"""
import functools, http.server, os, socketserver, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LANGS = ['index.html', 'en.html', 'zh-tw.html', 'zh-cn.html']
fails = []

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    h = functools.partial(Quiet, directory=ROOT)
    srv = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]

def check(name, cond, msg=''):
    if not cond: fails.append(f'{name}: {msg}'); print('  FAIL', name, msg)

def open_page(b, url):
    pg = b.new_page(viewport={'width': 390, 'height': 844}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    td = os.environ.get('THREE_DIR')
    if td:
        pg.route('**/three.min.js', lambda r: r.fulfill(path=os.path.join(td, 'three.min.js')))
        pg.route('**/GLTFLoader.js', lambda r: r.fulfill(path=os.path.join(td, 'GLTFLoader.js')))
    pg.goto(url); pg.wait_for_timeout(3500)
    return pg, errs

def pick(pg, lv):
    pg.evaluate("l => { const b = document.querySelector(`[data-l=\"${l}\"]`); const box = b.closest('[data-tierbox]'); if (box) document.querySelector(`[data-tier=\"${box.dataset.tierbox}\"]`).click(); b.click(); }", lv)
    pg.wait_for_timeout(250)

def coach_page(b, url, name):
    pg, errs = open_page(b, url)
    levels = pg.evaluate("[...new Set([...document.querySelectorAll('[data-l]')].map(b => b.dataset.l))]")
    for lv in levels: pick(pg, lv)
    check(name + ' levels', not errs, '; '.join(errs[:2]))
    pick(pg, 'carve'); pg.wait_for_timeout(600)
    def edge():
        t = pg.inner_text('#c4Tbl'); line = [l for l in t.split('\n') if 'Edge' in l and '°' in l]
        return line[-1] if line else ''
    pg.select_option('#anguSel', '0'); pg.wait_for_timeout(900); e0 = edge()
    pg.select_option('#anguSel', '30'); pg.wait_for_timeout(900); e30 = edge()
    check(name + ' angulation', e0 and e30 and e0 != e30, f'{e0!r} vs {e30!r}')
    pg.select_option('#anguSel', '')
    st = pg.evaluate("[...document.querySelectorAll('[data-st]')].map(b => b.dataset.st).find(k => k !== 'ok')")
    pg.click(f'[data-st="{st}"]'); pg.wait_for_timeout(300)
    fx = pg.locator('[data-fix]').first; target = fx.get_attribute('data-fix'); fx.click(); pg.wait_for_timeout(400)
    on = pg.evaluate("document.querySelector('[data-l].on') && document.querySelector('[data-l].on').dataset.l")
    check(name + ' mistake flow', on == target, f'{on} != {target}')
    ov = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
    check(name + ' overflow', ov <= 1, f'{ov}px wider than the screen')
    check(name + ' js errors', not errs, '; '.join(errs[:2]))
    pg.close()

def main():
    port = serve(); base = f'http://127.0.0.1:{port}/'
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'], **({'executable_path': os.environ['CHROME']} if os.environ.get('CHROME') else {}))
        for d in ['ski', 'snowboard']:
            for l in LANGS:
                print('checking', d, l); coach_page(b, base + f'{d}/{l}', f'{d}/{l}')
        print('checking gym')
        pg, errs = open_page(b, base + 'gym/index.html')
        for t in pg.evaluate("[...document.querySelectorAll('[data-c]')].map(b => b.dataset.c)"):
            pg.click(f'[data-c="{t}"]'); pg.wait_for_timeout(200)
            for m in pg.evaluate("[...document.querySelectorAll('[data-m]')].map(b => b.dataset.m)"):
                pg.click(f'[data-m="{m}"]'); pg.wait_for_timeout(120)
        check('gym js errors', not errs, '; '.join(errs[:2]))
        check('gym overflow', pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        for l in LANGS:
            pg, errs = open_page(b, base + l); check(l + ' landing', not errs, '; '.join(errs[:2]))
        b.close()
    print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED:\n' + '\n'.join(fails)))
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
