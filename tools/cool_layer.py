#!/usr/bin/env python3
"""Add the shared polish layer (cool.css + cool.js) to one church folder. Safe to run again.

Usage: python3 tools/cool_layer.py churches/apale [churches/isabel ...]
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
for d in sys.argv[1:]:
    for f in ('cool.css', 'cool.js'):
        shutil.copyfile(os.path.join(HERE, 'cool', f), os.path.join(d, f))
    p = os.path.join(d, 'index.html')
    s = open(p, encoding='utf-8').read()
    if 'cool.css' not in s:
        head = ('<link rel="stylesheet" href="cool.css">\n'
                '<script>try{if(localStorage.getItem("coolTheme:"+location.pathname)==="dark")document.documentElement.classList.add("dk")}catch(e){}</script>\n')
        assert s.count('</head>') == 1
        s = s.replace('</head>', head + '</head>')
        assert s.count('</body>') == 1
        s = s.replace('</body>', '<script src="cool.js" defer></script>\n</body>')
        open(p, 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js')
    w = open(sp, encoding='utf-8').read()
    if 'cool.js' not in w:
        w = w.replace("'./manifest.json',", "'./manifest.json', './cool.css', './cool.js',", 1)
        w = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, 1)
        open(sp, 'w', encoding='utf-8', newline='\n').write(w)
    print('polished', d)
