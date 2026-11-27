#!/usr/bin/env python3
"""Phone home: worship time inside the Sabbath card, one-line announcement under it, announcements expire after 7 days.
Usage: python3 tools/topcards_patch.py churches/apale/index.html ... /home/claude/tubod-sda/index.html"""
import re, sys
for p in sys.argv[1:]:
    s = open(p, encoding='utf-8').read()
    if 'annSlot' in s:
        print('already', p); continue
    # 1. Sabbath card: worship line (shown on phones only, by CSS)
    a = "  return `<div class=\"eyebrow\">${s.on ? 'Sabbath hours' : 'Next Sabbath'}</div><h2>${head}</h2><p>${line}</p><p style=\"margin-top:6px;"
    assert s.count(a) == 1, ('card', p)
    s = s.replace(a, "  const nw0 = nextWorships()[0], wl = nw0 && opts && opts.worship ? `<p class=\"sab-w\"><b>${esc(nw0.sv.name)}</b> \\u00b7 ${esc(whenText(nw0))}${nw0.on ? ' \\u00b7 Happening now' : ''}</p>` : '';\n" +
        "  return `<div class=\"eyebrow\">${s.on ? 'Sabbath hours' : 'Next Sabbath'}</div><h2>${head}</h2><p>${line}</p>${wl}<p style=\"margin-top:6px;")
    assert s.count("function sabbathCard(){") == 1
    s = s.replace("function sabbathCard(){", "function sabbathCard(opts){")
    # 2. side column: worship line + announcement slot
    b = "side.innerHTML = `<div class=\"card sabbath\" id=\"sabbathCard\">${sabbathCard()}</div>${birthdaysCard()}"
    assert s.count(b) == 1, ('side', p)
    s = s.replace(b, "side.innerHTML = `<div class=\"card sabbath\" id=\"sabbathCard\">${sabbathCard({worship: true})}</div><div id=\"annSlot\"></div>${birthdaysCard()}")
    # call renderStrip after the side is built so the slot fills
    c = "    <div class=\"card more mob-hide\"><h3>Our church family</h3>"
    assert s.count(c) == 1, ('fam', p)
    i = s.index(c); j = s.index("`;\n}", i)
    s = s[:j + 3] + "\n  renderStrip();" + s[j + 3:]
    # 3. 60 s refresh keeps the worship line
    d = "const c = $('#sabbathCard'); if (c) c.innerHTML = sabbathCard();"
    assert s.count(d) == 1, ('tick', p)
    s = s.replace(d, "const c = $('#sabbathCard'); if (c) c.innerHTML = sabbathCard({worship: true});")
    # 4. strip: phone shows only the LIVE row there; worship and announcement live in the page flow
    e = "  const list = livePosts().filter(p => p.cat === 'announcement').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));\n  const nw = nextWorships(), w = nw[0];"
    assert s.count(e) == 1, ('strip', p)
    s = s.replace(e, "  const ph = matchMedia('(max-width:900px)').matches;   /* on a phone the worship time sits in the Sabbath card and the announcement is one line under it */\n" +
        "  const list = livePosts().filter(p => p.cat === 'announcement' && Date.now() - (p.createdAt || 0) < 7 * 864e5).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));   /* older announcements stay in the Announcements page */\n  const nw = nextWorships(), w = nw[0];")
    f = "  if (w) rows += `<div class=\"wr\""
    assert s.count(f) == 1, ('wr', p)
    s = s.replace(f, "  if (w && !ph) rows += `<div class=\"wr\"")
    g = "  if (list.length && S.route === 'home'){\n    const p = list[0];\n    rows += `<a href=\"#news\""
    assert s.count(g) == 1, ('annrow', p)
    s = s.replace(g, "  const slot = $('#annSlot');\n  if (slot) slot.innerHTML = ph && list.length && S.route === 'home' ? `<a class=\"annline\" href=\"#news\" data-route=\"news\" aria-label=\"Open announcements\"><span class=\"iw\">${icon('bell')}</span><span class=\"al\"><b>${ago(list[0].createdAt)}</b> ${esc(list[0].text || 'Photo announcement')}</span>${list.length > 1 ? `<span class=\"more\">+${list.length - 1}</span>` : '<span class=\"more\">Read</span>'}</a>` : '';\n" +
        "  if (list.length && S.route === 'home' && !ph){\n    const p = list[0];\n    rows += `<a href=\"#news\"")
    # 5. CSS
    css = ".sab-w{display:none}\n@media (max-width:900px){.sab-w{display:block;margin-top:6px;padding-top:6px;border-top:1px solid #EBD59B;font-size:.88rem;color:#5E4710}.sab-w b{font-weight:700;color:#3d2f08}}\n" \
          ".annline{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink);background:var(--gold-soft);border:1px solid #EBD59B;border-radius:12px;padding:6px 12px;min-width:0}\n" \
          ".annline .iw{width:26px;height:26px;border-radius:50%;background:var(--gold);color:#fff;display:grid;place-items:center;flex:none}.annline .iw .ic{width:15px;height:15px}\n" \
          ".annline .al{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.9rem}.annline .al b{font-size:.7rem;letter-spacing:.05em;text-transform:uppercase;color:#7A5A12;margin-right:4px}\n" \
          ".annline .more{font-size:.78rem;font-weight:600;color:#7A5A12;white-space:nowrap}\n#annSlot:empty{display:none}\n"
    anchor = "/* announcements as a chat thread */\n.chat{"
    assert s.count(anchor) == 1, ('css', p)
    s = s.replace(anchor, css + anchor)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', p)
