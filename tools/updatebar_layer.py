#!/usr/bin/env python3
"""Add the "New version, tap to refresh" bar to a site folder, and make the service worker ask the server before it trusts the phone's cache. Safe to run again.

Usage: python3 tools/updatebar_layer.py churches/apale [churches/isabel ... /path/to/tubod-sda .]
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'district', 'updatebar.js')
for d in sys.argv[1:]:
    new_js = open(SRC, encoding='utf-8').read(); dst = os.path.join(d, 'updatebar.js')
    changed = (not os.path.exists(dst)) or open(dst, encoding='utf-8').read() != new_js
    shutil.copyfile(SRC, dst)
    for page in ('index.html', 'bible.html', 'bible-game.html'):
        p = os.path.join(d, page)
        if not os.path.exists(p): continue
        s = open(p, encoding='utf-8').read()
        if 'updatebar.js' not in s:
            assert s.count('</body>') == 1, p
            s = s.replace('</body>', '<script src="updatebar.js" defer></script>\n</body>')
            open(p, 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js'); w = w0 = open(sp, encoding='utf-8').read()
    if 'updatebar.js' not in w:
        if "'./fanmenu.js'," in w: w = w.replace("'./fanmenu.js',", "'./fanmenu.js', './updatebar.js',", 1)
        else: w = w.replace("'./index.html',", "'./index.html', './updatebar.js',", 1)
        assert 'updatebar.js' in w, sp
    if "{cache: 'no-cache'}" not in w:
        a1 = "fetch(req).then(res => {\n      if (res && res.ok){ const copy"
        a2 = "e.respondWith(fetch(r).then("
        if a1 in w: w = w.replace(a1, a1.replace('fetch(req)', "fetch(req, {cache: 'no-cache'})"), 1)
        elif a2 in w: w = w.replace(a2, "e.respondWith(fetch(r, {cache: 'no-cache'}).then(", 1)
        else: raise SystemExit('cannot find the page fetch in ' + sp)
    if w != w0:
        w = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        w = re.sub(r"const V = '([a-z0-9-]+)-v(\d+)';", lambda m: "const V = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        open(sp, 'w', encoding='utf-8', newline='\n').write(w)
    print('update bar added to', d)
