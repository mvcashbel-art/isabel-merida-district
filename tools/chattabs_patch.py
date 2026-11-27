#!/usr/bin/env python3
"""Chat list gets two tabs: Personal and Groups (every group you belong to, even before the first message).
Usage: python3 tools/chattabs_patch.py <index.html> ..."""
import re, sys
for p in sys.argv[1:]:
    s = open(p, encoding='utf-8').read()
    if 'msgtabs' in s:
        print('already', p); continue
    i = s.index('function renderConvoList(){'); j = s.index('function openThreadView(opts){')
    new = r'''function renderConvoList(){
  const list = $('#msgList'); if (!list) return;
  const all = S.convos || [];
  const review = S.isAdmin ? '<button class="btn sm quiet msg-review" data-act="msgreview">Review all messages (safeguarding)</button>' : '';
  const dms = all.filter(c => c.kind !== 'group');
  /* every group you belong to is listed, even before its first message */
  const ids = new Set(all.filter(c => c.kind === 'group').map(c => c.groupId));
  const gr = (S.groups || []).filter(g => S.isAdmin || ids.has(g.id) || inGroup(S.uid, g.id) || ((S.me && S.me.groups) || []).includes(g.id)).map(g => {
    const c = all.find(x => x.kind === 'group' && x.groupId === g.id);
    return { g, c, t: c && c.lastTime || 0 };
  }).sort((a, b) => (b.t - a.t) || String(a.g.name).localeCompare(String(b.g.name)));
  const un = a => a.reduce((n, c) => n + (c && c.unread || 0), 0), uD = un(dms), uG = un(gr.map(x => x.c));
  if (MSG.tab !== 'dm' && MSG.tab !== 'grp') MSG.tab = (!dms.length && gr.length) ? 'grp' : 'dm';
  const tb = (t, label, n) => `<button type="button" role="tab" class="${MSG.tab === t ? 'on' : ''}" aria-selected="${MSG.tab === t}" data-act="msgtab" data-t="${t}">${label}${n ? `<span class="convo-badge sm">${n > 99 ? '99+' : n}</span>` : ''}</button>`;
  const tabs = `<div class="seg msgtabs" role="tablist" aria-label="Chats">${tb('dm', 'Personal', uD)}${tb('grp', 'Groups', uG)}</div>`;
  const row = (ava, who, c, act) => {
    const badge = c && c.unread ? `<span class="convo-badge">${c.unread > 99 ? '99+' : c.unread}</span>` : '';
    const pre = c && c.lastText ? (c.fromMe ? 'You: ' : '') + c.lastText : 'No messages yet';
    return `<button class="convo-row${c && c.unread ? ' un' : ''}" ${act} data-title="${esc(who)}">${ava}<span class="convo-main"><span class="convo-top"><b>${esc(who)}</b>${c && c.lastTime ? `<span class="convo-time">${esc(ago(c.lastTime))}</span>` : ''}</span><span class="convo-pre">${esc(pre)}</span></span>${badge}</button>`;
  };
  let body;
  if (MSG.tab === 'grp') {
    body = gr.length ? gr.map(x => row(`<span class="av md convo-grp">${icon('users')}</span>`, x.g.name, x.c, `data-act="opengroupchat" data-gid="${esc(x.g.id)}"`)).join('')
      : '<p class="muted" style="padding:14px">You are not in a group yet. Open <b>Groups</b>, join one, and its chat shows up here.</p>';
  } else {
    body = dms.length ? dms.map(c => row(av(c.uid, 'md'), c.who, c, `data-act="opendm" data-uid="${esc(c.uid)}"`)).join('')
      : '<p class="muted" style="padding:14px">No personal chats yet. Open a member’s profile and tap <b>Message</b>.</p>';
  }
  list.innerHTML = review + tabs + body;
}
'''
    s = s[:i] + new + s[j:]
    a = "    case 'opendm': openThreadView({ to: el.dataset.uid, title: el.dataset.title }); break;"
    assert s.count(a) == 1, ('opendm', p)
    s = s.replace(a, "    case 'msgtab': MSG.tab = el.dataset.t; renderConvoList(); break;\n    case 'opendm': MSG.tab = 'dm'; openThreadView({ to: el.dataset.uid, title: el.dataset.title }); break;")
    b = "    case 'opengroupchat': openThreadView("
    assert s.count(b) == 1, ('opengc', p)
    s = s.replace(b, "    case 'opengroupchat': MSG.tab = 'grp'; openThreadView(")
    c = ".convo-badge{"
    assert s.count(c) == 1, ('css', p)
    s = s.replace(c, ".seg.msgtabs{grid-template-columns:1fr 1fr;margin:8px 8px 4px}.seg.msgtabs button{display:flex;align-items:center;justify-content:center;gap:6px}.convo-badge.sm{min-width:17px;height:17px;font-size:.66rem;padding:0 5px}\n" + c)
    d = "'Groups':'Mga grupo',"
    if d in s and "'Personal':" not in s: s = s.replace(d, d + " 'Personal':'Pribado',", 1)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', p)
