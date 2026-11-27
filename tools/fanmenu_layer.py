#!/usr/bin/env python3
"""Add the phone half-circle menu to a site folder. Safe to run again.

Usage: python3 tools/totop_layer.py churches/apale [churches/isabel ... /path/to/tubod-sda .]
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'district', 'fanmenu.js')
for d in sys.argv[1:]:
    dst = os.path.join(d, 'fanmenu.js')
    new_js = open(SRC, encoding='utf-8').read()
    changed = (not os.path.exists(dst)) or open(dst, encoding='utf-8').read() != new_js
    shutil.copyfile(SRC, dst)
    for page in ('index.html',):
        p = os.path.join(d, page)
        if not os.path.exists(p): continue
        s = open(p, encoding='utf-8').read()
        if 'fanmenu.js' not in s:
            assert s.count('</body>') == 1, p
            s = s.replace('</body>', '<script src="fanmenu.js" defer></script>\n</body>')
            open(p, 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js')
    w = open(sp, encoding='utf-8').read()
    if 'fanmenu.js' not in w or changed:
        if 'fanmenu.js' not in w:
            if "'./manifest.json'," in w:
                w = w.replace("'./manifest.json',", "'./manifest.json', './fanmenu.js',", 1)
            else:
                w = w.replace("'./index.html',", "'./index.html', './fanmenu.js',", 1)
            assert 'fanmenu.js' in w, sp
        w2 = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        if w2 == w:  # district sw uses const V = 'district-vN'
            w2 = re.sub(r"const V = '([a-z0-9-]+)-v(\d+)';", lambda m: "const V = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        open(sp, 'w', encoding='utf-8', newline='\n').write(w2)
    print('phone menu added to', d)
