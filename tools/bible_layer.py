#!/usr/bin/env python3
"""Add the Bible reader (bible.html) to a site folder. Safe to run again.

The Bible text itself lives once, in the district repo: bible/<translation>/<book>.json plus bible/index.json.
Every site's bible.html reads it from there, so a new translation is added in one place.

Usage: python3 tools/bible_layer.py churches/apale [churches/isabel ... /path/to/tubod-sda .]
       (the district root is the folder ".")
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
tpl = open(os.path.join(HERE, 'district', 'bible.template.html'), encoding='utf-8').read()
idx = open(os.path.join(ROOT, 'bible', 'index.json'), encoding='utf-8').read()
json.loads(idx)
for d in sys.argv[1:]:
    is_root = os.path.abspath(d) == ROOT
    home = open(os.path.join(d, 'index.html'), encoding='utf-8').read()
    if is_root:
        name, key = 'Isabel–Merida District', 'district'
    else:
        name = re.search(r'<title>(.*?)</title>', home).group(1).strip()
        m = re.search(r"localStorage\.getItem\('(\w+)Look'", home)
        key = m.group(1) if m else os.path.basename(os.path.abspath(d))
    s = tpl.replace('__NAME__', name).replace('__KEY__', key).replace('__HOME__', 'index.html').replace('__ICON__', 'icon-192.png').replace('/*INDEX*/null', idx)
    open(os.path.join(d, 'bible.html'), 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js')
    w = open(sp, encoding='utf-8').read(); w0 = w
    if 'bible.html' not in w:
        w = w.replace("'./index.html',", "'./index.html', './bible.html',", 1)
        assert 'bible.html' in w, sp
    # keep the saved Bible when the site updates, and keep the big Bible files out of the site's own cache
    if "startsWith('bible-')" not in w:
        a = "k !== VERSION && k !== PICS"; b = "k !== VERSION && k !== PICS && !k.startsWith('bible-')"
        if a in w: w = w.replace(a, b, 1)
        else:
            a = "k.filter(x => x !== V)"; assert a in w, sp
            w = w.replace(a, "k.filter(x => x !== V && !x.startsWith('bible-'))", 1)
    if "'/bible/'" not in w:
        if "const url = new URL(req.url);" in w:
            w = w.replace("const url = new URL(req.url);", "const url = new URL(req.url);\n  if (url.pathname.indexOf('/bible/') !== -1 && /\\.json$/.test(url.pathname)) return; // the Bible files are saved by the Bible page itself", 1)
        else:
            a = "const u = new URL(r.url);"; assert a in w, sp
            w = w.replace(a, "const u = new URL(r.url); if (u.pathname.indexOf('/bible/') !== -1) return;", 1)
        assert "'/bible/'" in w, sp
    w = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
    w = re.sub(r"const V = '([a-z0-9-]+)-v(\d+)';", lambda m: "const V = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
    open(sp, 'w', encoding='utf-8', newline='\n').write(w)
    print('Bible added to', d, '(%s, key %s)' % (name, key))
