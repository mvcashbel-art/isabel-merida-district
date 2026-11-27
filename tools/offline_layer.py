#!/usr/bin/env python3
"""Add "Use offline" (save the app, Bible, church data and photos on the phone) to a site. Safe to run again.

Usage: python3 tools/offline_layer.py churches/apale [churches/isabel ... /path/to/tubod-sda .]
Church sites get a "Use offline" button on the member's own profile; the district site gets a header button.
"""
import os, re, shutil, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'district', 'offline.js')
APP = r"""window.__offlineApp = { sync: () => sync(), pics: () => {   /* what "Use offline" saves besides the pages: the church data and recent pictures */
  const u = [], seen = new Set(), add = (id, w) => { const x = imgUrl(id, w); if (x && !seen.has(x)){ seen.add(x); u.push(x); } };
  if (S.settings && S.settings.logoId) add(S.settings.logoId, 400);
  Object.values(S.profiles || {}).forEach(p => { if (p && p.avatar) add(p.avatar, 200); });
  (S.posts || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 25).forEach(p => (Array.isArray(p.photos) ? p.photos.slice(0, 10) : []).forEach(id => add(id, 1600)));
  (S.files || []).filter(f => /^image\//.test(String(f.mime || ''))).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0)).slice(0, 30).forEach(f => { add(f.driveId, 400); add(f.driveId, 700); });
  return u.slice(0, 220);
} };
"""
for d in sys.argv[1:]:
    new_js = open(SRC, encoding='utf-8').read(); dst = os.path.join(d, 'offline.js')
    changed = (not os.path.exists(dst)) or open(dst, encoding='utf-8').read() != new_js
    shutil.copyfile(SRC, dst)
    p = os.path.join(d, 'index.html'); s = s0 = open(p, encoding='utf-8').read()
    if 'offline.js' not in s:
        assert s.count('</body>') == 1, p
        s = s.replace('</body>', '<script src="offline.js" defer></script>\n</body>')
    if os.path.abspath(d) == os.path.dirname(HERE):   # the district site
        if 'id="offlineBtn"' not in s:
            a = '<button class="icon-btn" id="installBtn"'
            assert s.count(a) == 1, p
            s = s.replace(a, '<button class="icon-btn" id="offlineBtn" type="button" data-offline title="Use offline" aria-label="Use offline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg></button>\n      ' + a)
    else:   # a church site
        if 'window.__offlineApp' not in s:
            a = "const photoImg = id => "
            assert s.count(a) == 1, p
            s = s.replace(a, APP + a)
        if 'data-offline' not in s:
            b = '<button class="btn quiet" data-act="chpw">Password</button>'
            assert s.count(b) == 1, p
            s = s.replace(b, '<button class="btn quiet" data-offline>Use offline</button>' + b)
            k = "'Groups':'Mga grupo',"
            if k in s and "'Use offline'" not in s: s = s.replace(k, k + " 'Use offline':'Gamita nga walay internet',", 1)
    if s != s0: open(p, 'w', encoding='utf-8', newline='\n').write(s)
    sp = os.path.join(d, 'sw.js'); w = w0 = open(sp, encoding='utf-8').read()
    if 'offline.js' not in w:
        if "'./installtip.js'," in w: w = w.replace("'./installtip.js',", "'./installtip.js', './offline.js',", 1)
        else: w = w.replace("'./index.html',", "'./index.html', './offline.js',", 1)
        assert 'offline.js' in w, sp
    w = w.replace('const MAX_PICS = 250;', 'const MAX_PICS = 500;')   # room for the photos saved for offline use
    if w != w0 or changed:
        w = re.sub(r"const VERSION = '([a-z0-9-]+)-v(\d+)';", lambda m: "const VERSION = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        w = re.sub(r"const V = '([a-z0-9-]+)-v(\d+)';", lambda m: "const V = '%s-v%d';" % (m.group(1), int(m.group(2)) + 1), w, count=1)
        open(sp, 'w', encoding='utf-8', newline='\n').write(w)
    print('offline added to', d)
