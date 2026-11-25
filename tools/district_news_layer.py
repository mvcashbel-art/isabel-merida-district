#!/usr/bin/env python3
"""Add the "From the district" announcements card to a church site folder. Safe to run again.

Usage: python3 tools/district_news_layer.py churches/apale [churches/isabel ... /path/to/tubod-sda]
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for d in sys.argv[1:]:
    shutil.copyfile(os.path.join(HERE, 'district', 'district-news.js'), os.path.join(d, 'district-news.js'))
    p = os.path.join(d, 'index.html')
    s = open(p, encoding='utf-8').read()
    if 'district-news.js' not in s:
        assert s.count('</body>') == 1
        s = s.replace('</body>', '<script src="district-news.js" defer></script>\n</body>')
        open(p, 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js')
    w = open(sp, encoding='utf-8').read()
    if 'district-news.js' not in w:
        assert "'./manifest.json'," in w
        w = w.replace("'./manifest.json',", "'./manifest.json', './district-news.js',", 1)
        w = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        open(sp, 'w', encoding='utf-8', newline='\n').write(w)
    print('district news added to', d)
