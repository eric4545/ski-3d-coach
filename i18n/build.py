"""Build localized copies (en, zh-tw, zh-cn) of the HK-Cantonese source pages.

Usage: python3 build.py OUTDIR
Writes OUTDIR/ski/{index,en,zh-tw,zh-cn}.html, OUTDIR/snowboard/..., OUTDIR/{index,en,zh-tw,zh-cn}.html
"""
import json
import re
import sys

import opencc

ROOT = '/home/claude'
OUT = sys.argv[1]
RX = re.compile(r"[A-Za-z0-9 .,+/\-×%°→↓▲:：$()（）]*[^\x00-\x7f][^<>'\"`\n]*")
PH = re.compile(r"\$\{[^}]*\}?")

segs = json.load(open(f'{ROOT}/i18n/segments.json'))
tr = {}
for fn in ('tr1', 'tr2', 'tr3'):
    for line in open(f'{ROOT}/i18n/{fn}.jsonl'):
        line = line.strip()
        if line:
            d = json.loads(line)
            tr[d['i']] = d

# trailing spaces where English labels get concatenated with a following word
for d in tr.values():
    d['en'] = d['en'].replace("'", '’')
    d['tw'] = d['tw'].replace('「Toeside」', '「前刃」').replace('「Heelside」', '「後刃」')
for i in (419, 367, 392, 442, 109, 150, 107, 148):
    tr[i]['en'] = tr[i]['en'].rstrip() + ' '

cc = opencc.OpenCC('tw2sp')
CN_FIX = [('蘑菇', '猫跳'), ('腘旁肌', '腘绳肌'), ('胫前肌', '胫骨前肌'), ('缺省', '默认'), ('雪靴', '雪鞋'),
          ('煞停', '刹停'), ('凹槽', '雪沟'), ('板子', '雪板'), ('程式', '程序'), ('点一列', '点击一行'),
          ('高背板', '高背')]


def to_cn(t):
    s = cc.convert(t)
    for a, b in CN_FIX:
        s = s.replace(a, b)
    return s


table = {'en': {}, 'tw': {}, 'cn': {}}
missing, bad = [], []
for sg in segs:
    i, src = sg['id'], sg['src']
    if i not in tr:
        missing.append(i)
        continue
    for lang in ('en', 'tw'):
        if sorted(PH.findall(src)) != sorted(PH.findall(tr[i][lang])):
            bad.append((i, lang))
    table['en'][src] = tr[i]['en']
    table['tw'][src] = tr[i]['tw']
    table['cn'][src] = to_cn(tr[i]['tw'])
assert not missing, missing
for line in open(f'{ROOT}/i18n/tr4.jsonl'):
    line = line.strip()
    if not line:
        continue
    d = json.loads(line)
    d['en'] = d['en'].replace("'", '’')
    assert sorted(PH.findall(d['src'])) == sorted(PH.findall(d['en'])) == sorted(PH.findall(d['tw'])), d['src']
    table['en'][d['src']] = d['en']; table['tw'][d['src']] = d['tw']; table['cn'][d['src']] = to_cn(d['tw'])

assert not bad, bad

LANGS = [('hk', 'index.html', 'zh-Hant-HK', '廣東話（香港）'), ('tw', 'zh-tw.html', 'zh-Hant-TW', '繁體中文（台灣）'),
         ('cn', 'zh-cn.html', 'zh-Hans-CN', '简体中文（中国大陆）'), ('en', 'en.html', 'en', 'English')]


EXTRA_TW = [("'Toeside Apex'", "'前刃 Apex'"), ("'Heelside Apex'", "'後刃 Apex'"), ("'Toeside'", "'前刃'"), ("'Heelside'", "'後刃'"),
            ('>Toeside<', '>前刃<'), ('>Heelside<', '>後刃<'), ('>Carving<', '>刻滑<'), ('>Pivot slip<', '>側滑轉向<'),
            ('>Side slip<', '>推坡<'), ('>Ollie／Nollie<', '>豚跳 Ollie／Nollie<'), ('>Butter／Press<', '>平花 Butter／Press<')]


def translate(src, lang):
    if lang == 'hk':
        return src
    if lang in ('tw', 'cn'):
        for a, b in EXTRA_TW:
            src = src.replace(a, b if lang == 'tw' else to_cn(b))

    def rep(m):
        raw = m.group(0)
        t = raw.strip()
        if t not in table[lang]:
            return raw
        lead = raw[:len(raw) - len(raw.lstrip())]
        trail = raw[len(raw.rstrip()):]
        return lead + table[lang][t] + trail
    return RX.sub(rep, src)


def switcher(cur):
    opts = ''.join(f'<option value="{f}"{" selected" if c == cur else ""}>{n}</option>' for c, f, _, n in LANGS)
    return ('<select id="langSel" aria-label="Language" style="float:right;margin-left:8px;background:#171e26;color:#e6edf3;'
            'border:1px solid #2a3440;border-radius:8px;padding:4px 6px;font-size:12px">' + opts + '</select>')


REDIRECT = '''<script>
(function(){
  var file = location.pathname.split('/').pop() || 'index.html';
  var sel = document.getElementById('langSel');
  if (sel) sel.onchange = function(){ try { localStorage.setItem('lang', sel.value); } catch(e){} location.href = sel.value; };
  if (file !== 'index.html' && file !== '') return;
  var saved = null; try { saved = localStorage.getItem('lang'); } catch(e){}
  var target = saved;
  if (!target){
    var l = (navigator.language || '').toLowerCase();
    if (/^zh-(hk|mo)/.test(l) || /yue/.test(l)) target = 'index.html';
    else if (/^zh-(tw|hant)/.test(l)) target = 'zh-tw.html';
    else if (/^zh/.test(l)) target = 'zh-cn.html';
  }
  if (target && target !== 'index.html') location.replace(target);
})();
</script>
'''


def build_page(src_path, out_dir, is_landing=False):
    src = open(src_path).read()
    for code, fname, htmllang, _ in LANGS:
        s = translate(src, code)
        s = re.sub(r'<html lang="[^"]*">', f'<html lang="{htmllang}">', s, count=1)
        if is_landing:
            s = s.replace('href="ski/"', f'href="ski/{fname}"').replace('href="snowboard/"', f'href="snowboard/{fname}"')
            s = s.replace('<main>\n', '<main>\n  ' + switcher(code) + '\n', 1)
        else:
            s = re.sub(r'(<header>\s*)', lambda m: m.group(1) + switcher(code) + '\n  ', s, count=1)
        s = s.replace('</body>', REDIRECT + '</body>', 1)
        open(f'{out_dir}/{fname}', 'w').write(s)
        # leftover Cantonese markers check (non-HK only)
        if code != 'hk':
            left = sorted(set(m.group(0).strip() for m in RX.finditer(s) if re.search('[嘅咗唔係喺嚟啲睇㩒冇噉嗰]', m.group(0))))
            if left:
                print(f'  {out_dir}/{fname}: {len(left)} untranslated', left[:5])


import os
for d in ('ski', 'snowboard'):
    os.makedirs(f'{OUT}/{d}', exist_ok=True)
build_page(f'{ROOT}/ski3d/index.html', f'{OUT}/ski')
build_page(f'{ROOT}/board3d/index.html', f'{OUT}/snowboard')
build_page(f'{ROOT}/ski-3d-coach/index.html', OUT, is_landing=True)
print('built', OUT)
