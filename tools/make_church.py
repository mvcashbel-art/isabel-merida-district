#!/usr/bin/env python3
"""Make one church site (same app as the Tubod SDA Church site) inside the district repo.

Usage:
  python3 tools/make_church.py --template /path/to/Tubod-SDA --slug isabel-2 \
      --name "Isabel Church 2" --place Isabel --tagline "Isabel, Leyte" --code ISABEL2SDA

Output: churches/<slug>/ with index.html, bible-game.html, sw.js, manifest.json, config.js,
icons, and Code.gs (the Google Sheet backend for that church).

What changes from the Tubod files:
  - church name, place and tagline
  - the join code
  - browser storage keys and cache names get a per-church prefix, so two church sites on the
    same github.io address never share sign-ins or saved data
  - config.js starts empty (the church's own web app link goes there)
Nothing secret is written. Passwords are never part of these files.
"""
import argparse, os, re, shutil, sys

p = argparse.ArgumentParser()
p.add_argument('--template', required=True)
p.add_argument('--slug', required=True)
p.add_argument('--name', required=True)
p.add_argument('--place', required=True)
p.add_argument('--tagline', required=True)
p.add_argument('--code', required=True)
p.add_argument('--out', default='churches')
a = p.parse_args()

key = re.sub(r'[^a-z0-9]', '', a.slug.lower())          # storage prefix, e.g. isabel2
short = a.name if len(a.name) <= 12 else a.name[:12].rstrip()
site = 'https://mvcashbel-art.github.io/isabel-merida-district/churches/%s/' % a.slug
dest = os.path.join(a.out, a.slug)
os.makedirs(dest, exist_ok=True)

def rd(n):
    with open(os.path.join(a.template, n), encoding='utf-8') as f:
        return f.read()

def wr(n, s):
    with open(os.path.join(dest, n), 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)

def names(s):
    s = s.replace('Tubod SDA Church', a.name)
    s = s.replace('Tubod, Isabel, Leyte', a.tagline)
    s = s.replace('TUBOD SDA', a.name.upper())
    s = s.replace('Tubod SDA backup ', a.name + ' backup ')
    return s

def storage(s):
    s = re.sub(r'\btubod(Look|Cache1|Token|Notif|AnnSeen|Lang)\b', key + r'\1', s)
    s = s.replace("'tubod-ann'", "'%s-ann'" % key).replace("'tubod-chat'", "'%s-chat'" % key)
    return s

def residual(s):
    return re.sub(r'\bTubod\b', a.place, s)

# index.html and the Bible game
for n in ('index.html', 'bible-game.html'):
    s = storage(names(rd(n)))
    s = s.replace('https://mvcashbel-art.github.io/Tubod-SDA/og-image.jpg', site + 'og-image.jpg')
    s = s.replace('https://mvcashbel-art.github.io/Tubod-SDA/', site)
    s = residual(s)
    wr(n, s)

# service worker
s = rd('sw.js').replace('tubod-v6', key + '-v6').replace('tubod-pics-v1', key + '-pics-v1')
s = s.replace('Tubod SDA Church', a.name)
s = s.replace('tubod-ann', key + '-ann').replace('tubod-chat', key + '-chat')
wr('sw.js', s)

# manifest
s = rd('manifest.json').replace('Tubod SDA Church', a.name).replace('"Tubod SDA"', '"%s"' % short)
wr('manifest.json', s)

# config.js: empty on purpose
wr('config.js', """// Paste this church's Google web app link between the quotes, then save this file.
// It looks like: https://script.google.com/macros/s/AKfycb.../exec
window.CHURCH_CONFIG = {
  API_URL: '',
  // Optional push notifications (OneSignal). Leave empty unless this church sets up its own OneSignal app.
  ONESIGNAL_APP_ID: ''
};
""")

# backend
s = rd('Code.gs')
s = s.replace("joinCode: 'TUBODSDA'", "joinCode: '%s'" % a.code)
s = names(s)
s = residual(s)
wr('Code.gs', s)

# images
for n in ('logo-mark.png', 'icon-192.png', 'icon-512.png', 'og-image.jpg'):
    shutil.copyfile(os.path.join(a.template, n), os.path.join(dest, n))

# leftovers check
left = []
for n in os.listdir(dest):
    if n.endswith(('.html', '.js', '.json', '.gs')):
        with open(os.path.join(dest, n), encoding='utf-8') as f:
            for i, line in enumerate(f, 1):
                if re.search(r'tubod', line, re.I):
                    left.append('%s:%d: %s' % (n, i, line.strip()[:120]))
print('made', dest)
print('leftover "tubod" mentions: %d' % len(left))
for l in left:
    print('  ', l)
