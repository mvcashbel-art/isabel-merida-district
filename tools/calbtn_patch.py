#!/usr/bin/env python3
"""Church events get an "Add to calendar" button (phone calendar .ics with reminders, or Google Calendar).
Usage: python3 tools/calbtn_patch.py <index.html> ..."""
import sys
for p in sys.argv[1:]:
    s = open(p, encoding='utf-8').read()
    if "data-act=\"addcal\"" in s:
        print('already', p); continue
    # 1. button inside each event
    a = "${full && e.desc ? `<p>${esc(e.desc)}</p>` : ''}"
    assert s.count(a) == 1, ('evItem', p)
    s = s.replace(a, a + "<button type=\"button\" class=\"btn sm quiet ev-cal\" data-act=\"addcal\" data-id=\"${esc(e.id)}\">Add to calendar</button>")
    # 2. helpers before evItem
    b = "function evItem(e, full){"
    assert s.count(b) == 1, p
    helpers = r"""/* add an event to the phone calendar: a .ics file (with reminders) or a Google Calendar link */
const icsEsc = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsFold = l => { const o = []; while (l.length > 74){ o.push(l.slice(0, 74)); l = ' ' + l.slice(74); } o.push(l); return o.join('\r\n'); };
function evTimes(e){
  const [y, mo, d] = String(e.date).split('-').map(Number), pad = ms => new Date(ms).toISOString();
  if (e.time && /^\d{1,2}:\d{2}/.test(e.time)){
    const [h, mi] = e.time.split(':').map(Number), st = Date.UTC(y, mo - 1, d, h - TZ, mi), en = st + 2 * 36e5, f = ms => pad(ms).replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return { s: f(st), e: f(en), all: false };
  }
  const f = ms => pad(ms).slice(0, 10).replace(/-/g, ''), st = Date.UTC(y, mo - 1, d); return { s: f(st), e: f(st + 864e5), all: true };
}
function evIcs(e){
  const t = evTimes(e), now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Church site//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', 'UID:' + (e.id || e.date + e.title) + '@church', 'DTSTAMP:' + now,
    t.all ? 'DTSTART;VALUE=DATE:' + t.s : 'DTSTART:' + t.s, t.all ? 'DTEND;VALUE=DATE:' + t.e : 'DTEND:' + t.e, 'SUMMARY:' + icsEsc(e.title)];
  if (e.place) L.push('LOCATION:' + icsEsc(e.place));
  if (e.desc) L.push('DESCRIPTION:' + icsEsc(e.desc));
  L.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.title), 'END:VALARM', 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(e.title), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}
function evGoogle(e){
  const t = evTimes(e);
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(e.title || '') + '&dates=' + t.s + '/' + t.e + '&details=' + encodeURIComponent(e.desc || '') + '&location=' + encodeURIComponent(e.place || '');
}
function openAddCal(id){
  const e = (S.events || []).find(x => x.id === id); if (!e) return;
  openModal('Add to calendar', `<div class="m-body"><p><b>${esc(e.title)}</b><br><span class="muted">${esc(evItemWhen(e))}</span></p><p class="muted">Pick where to save this event. You will get a reminder the day before and one hour before.</p>
    <div class="m-actions" style="flex-wrap:wrap"><button class="btn primary" type="button" data-act="calics" data-id="${esc(e.id)}">Phone calendar</button><a class="btn" href="${esc(evGoogle(e))}" target="_blank" rel="noopener">Google Calendar</a><button class="btn" type="button" data-act="closemodal">Close</button></div></div>`);
}
function evItemWhen(e){ const [y, mo, d] = String(e.date).split('-').map(Number); return [DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()] + ', ' + MONTHS[mo - 1] + ' ' + d, e.time ? time12(e.time) : '', e.place].filter(Boolean).join(' · '); }
function downloadIcs(id){
  const e = (S.events || []).find(x => x.id === id); if (!e) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([evIcs(e)], { type: 'text/calendar' })); a.download = String(e.title || 'event').replace(/[^\w]+/g, '-').slice(0, 40) + '.ics';
  document.body.appendChild(a); a.click(); a.remove(); toast('Saved. Open the file to add it to your calendar.');
}
"""
    s = s.replace(b, helpers + b)
    # 3. click cases
    c = "    case 'calendar': openCalendarModal(); break;"
    assert s.count(c) == 1, ('case', p)
    s = s.replace(c, c + "\n    case 'addcal': openAddCal(el.dataset.id); break;\n    case 'calics': downloadIcs(el.dataset.id); break;")
    # 4. css
    d = ".evlist"
    i = s.index('<style>') + 7
    s = s[:i] + ".ev-cal{margin-top:6px}\n" + s[i:]
    # 5. Cebuano
    k = "'Groups':'Mga grupo',"
    if k in s and "'Phone calendar'" not in s:
        s = s.replace(k, k + " 'Add to calendar':'Idugang sa kalendaryo', 'Phone calendar':'Kalendaryo sa telepono', 'Pick where to save this event. You will get a reminder the day before and one hour before.':'Pilia kung asa i-save kini nga kalihokan. Makadawat ka og pahimangno usa ka adlaw ug usa ka oras sa wala pa.', 'Saved. Open the file to add it to your calendar.':'Na-save. Ablihi ang file aron madugang sa imong kalendaryo.',", 1)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', p)
