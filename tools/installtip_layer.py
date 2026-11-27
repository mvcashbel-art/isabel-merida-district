#!/usr/bin/env python3
"""Add the one-time "Add to Home screen" message to a site's home page. Safe to run again.

Usage: python3 tools/installtip_layer.py churches/apale [churches/isabel ... /path/to/tubod-sda .]
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'district', 'installtip.js')
for d in sys.argv[1:]:
    new_js = open(SRC, encoding='utf-8').read(); dst = os.path.join(d, 'installtip.js')
    changed = (not os.path.exists(dst)) or open(dst, encoding='utf-8').read() != new_js
    shutil.copyfile(SRC, dst)
    p = os.path.join(d, 'index.html'); s = open(p, encoding='utf-8').read()
    if 'installtip.js' not in s:
        assert s.count('</body>') == 1, p
        s = s.replace('</body>', '<script src="installtip.js" defer></script>\n</body>')
        open(p, 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js'); w = w0 = open(sp, encoding='utf-8').read()
    if 'installtip.js' not in w:
        if "'./updatebar.js'," in w: w = w.replace("'./updatebar.js',", "'./updatebar.js', './installtip.js',", 1)
        else: w = w.replace("'./index.html',", "'./index.html', './installtip.js',", 1)
        assert 'installtip.js' in w, sp
    if w != w0 or changed:
        w = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        w = re.sub(r"const V = '([a-z0-9-]+)-v(\d+)';", lambda m: "const V = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        open(sp, 'w', encoding='utf-8', newline='\n').write(w)
    print('home screen message added to', d)
