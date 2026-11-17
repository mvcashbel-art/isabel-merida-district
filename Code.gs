/**
 * Isabel–Merida District Member Registry: backend (Google Apps Script)
 *
 * Bound to a PRIVATE Google Sheet owned by a district account. Never share the sheet
 * itself, and never "Publish to web" any of its tabs. The only way in is this web app.
 *
 * Sheets created by setup():  Members, Users, Churches, Log
 * Roles: "district" sees every church; "clerk" sees and edits only their own church.
 * Public check (no sign-in): member ID + last name -> yes/no and church name only.
 */

var ID_PREFIX = 'IM';
var TZ = 'Asia/Manila';
var STATUSES = ['active', 'deceased', 'breakaway', 'transferred', 'inactive', 'dropped'];
var MEMBER_COLS = ['memberId', 'lastName', 'firstName', 'middleName', 'sex', 'birthdate', 'church', 'barangay',
  'phone', 'baptismDate', 'status', 'statusDate', 'statusNote', 'notes', 'createdAt', 'updatedAt', 'updatedBy'];
var USER_COLS = ['username', 'name', 'role', 'church', 'salt', 'hash', 'active', 'mustChange', 'createdAt'];
var CHURCH_COLS = ['code', 'name', 'municipality'];
var LOG_COLS = ['time', 'user', 'action', 'memberId', 'detail'];
var SESSION_SECONDS = 6 * 60 * 60;
var HASH_ROUNDS = 400;
var LOOKUPS_PER_HOUR = 60;

/* ---------------------------------------------------------------- setup */

/** Run once from the Apps Script editor. Read the temporary admin password in View > Logs. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [['Members', MEMBER_COLS], ['Users', USER_COLS], ['Churches', CHURCH_COLS], ['Log', LOG_COLS]].forEach(function (p) {
    var s = ss.getSheetByName(p[0]) || ss.insertSheet(p[0]);
    s.getRange(1, 1, 1, p[1].length).setValues([p[1]]);
    s.getRange(1, 1, s.getMaxRows(), p[1].length).setNumberFormat('@');
    s.setFrozenRows(1);
  });
  var cs = ss.getSheetByName('Churches');
  if (cs.getLastRow() < 2) {
    var rows = [['TBD', 'Tubod SDA Church', 'Isabel']];
    for (var i = 2; i <= 12; i++) rows.push(['I' + ('0' + i).slice(-2), 'Isabel Church ' + i, 'Isabel']);
    for (var j = 1; j <= 3; j++) rows.push(['M' + ('0' + j).slice(-2), 'Merida Church ' + j, 'Merida']);
    cs.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  if (!findUser_('admin')) {
    var temp = tempPassword_();
    createUser_('admin', 'District Administrator', 'district', '', temp);
    Logger.log('First sign-in  ->  username: admin   temporary password: ' + temp + '   (you must change it at first sign-in)');
  } else {
    Logger.log('Setup checked. The admin user already exists.');
  }
}

/* ---------------------------------------------------------------- entry points */

function doGet() {
  return out_({ ok: true, service: 'district-registry' });
}

function doPost(e) {
  var res;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = route_(body);
  } catch (err) {
    if (err && err.userMessage) {
      res = { ok: false, error: err.message, code: err.code || '' };
    } else {
      console.error(err);
      res = { ok: false, error: 'Something went wrong on the server. Please try again.' };
    }
  }
  return out_(res);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(msg, code) {
  var e = new Error(msg);
  e.userMessage = true;
  e.code = code || '';
  throw e;
}

function route_(b) {
  var a = String(b.action || '');
  if (a === 'login') return login_(b);
  if (a === 'publicVerify') return publicVerify_(b);
  var u = session_(b.token);
  if (a === 'logout') { CacheService.getScriptCache().remove('s_' + b.token); return { ok: true }; }
  if (a === 'me') return { ok: true, user: publicUser_(u) };
  if (a === 'changePassword') return changePassword_(u, b);
  if (u.mustChange === 'yes') fail_('Please set a new password first.', 'mustchange');
  switch (a) {
    case 'listChurches': return { ok: true, churches: churches_() };
    case 'listMembers': return listMembers_(u);
    case 'saveMember': return withLock_(function () { return saveMember_(u, b); });
    case 'setStatus': return withLock_(function () { return setStatus_(u, b); });
    case 'history': return history_(u, b);
    case 'officerLookup': return officerLookup_(u, b);
    case 'logExport': log_(u.username, 'export', '', String(Number(b.count) || 0) + ' rows'); return { ok: true };
    case 'listUsers': requireDistrict_(u); return listUsers_();
    case 'saveUser': requireDistrict_(u); return withLock_(function () { return saveUser_(u, b); });
    case 'resetPassword': requireDistrict_(u); return withLock_(function () { return resetPassword_(u, b); });
    default: fail_('Unknown action: ' + a);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------------------------------------------------------------- sheet helpers */

function sheet_(name) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) fail_('The "' + name + '" tab is missing. Run setup() once from the script editor.');
  return s;
}
function norm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v);
}
function readAll_(name, cols) {
  var s = sheet_(name), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, cols.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 };
    cols.forEach(function (c, j) { o[c] = norm_(r[j]); });
    return o;
  });
}
function rowValues_(cols, o) {
  return cols.map(function (c) { return o[c] === null || o[c] === undefined ? '' : String(o[c]); });
}
function appendObj_(name, cols, o) {
  var s = sheet_(name), r = s.getLastRow() + 1;
  s.getRange(r, 1, 1, cols.length).setValues([rowValues_(cols, o)]);
}
function writeObj_(name, cols, row, o) {
  sheet_(name).getRange(row, 1, 1, cols.length).setValues([rowValues_(cols, o)]);
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function today_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function log_(user, action, memberId, detail) {
  appendObj_('Log', LOG_COLS, { time: now_(), user: user, action: action, memberId: memberId || '', detail: detail || '' });
}

/* ---------------------------------------------------------------- passwords + sessions */

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}
function hash_(salt, pw) {
  var h = salt + ':' + pw;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    h = hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt));
  }
  return h;
}
function tempPassword_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}
function findUser_(username) {
  var list = readAll_('Users', USER_COLS);
  for (var i = 0; i < list.length; i++) if (list[i].username === username) return list[i];
  return null;
}
function createUser_(username, name, role, church, password) {
  var salt = Utilities.getUuid();
  appendObj_('Users', USER_COLS, {
    username: username, name: name, role: role, church: church, salt: salt, hash: hash_(salt, password),
    active: 'yes', mustChange: 'yes', createdAt: now_()
  });
}
function publicUser_(u) {
  return { username: u.username, name: u.name, role: u.role, church: u.church, mustChange: u.mustChange === 'yes' };
}
function requireDistrict_(u) {
  if (u.role !== 'district') fail_('Only district officers can do that.', 'forbidden');
}
function session_(token) {
  token = String(token || '');
  var username = token ? CacheService.getScriptCache().get('s_' + token) : null;
  if (!username) fail_('Your session ended. Please sign in again.', 'auth');
  var u = findUser_(username);
  if (!u || u.active !== 'yes') fail_('This account is turned off.', 'auth');
  return u;
}

function login_(b) {
  var username = String(b.username || '').trim().toLowerCase(), pw = String(b.password || '');
  var cache = CacheService.getScriptCache(), key = 'lf_' + username;
  var fails = Number(cache.get(key) || 0);
  if (fails >= 5) fail_('Too many wrong attempts. Wait 10 minutes and try again.', 'locked');
  var u = username ? findUser_(username) : null;
  if (!u || u.active !== 'yes' || hash_(u.salt, pw) !== u.hash) {
    cache.put(key, String(fails + 1), 600);
    Utilities.sleep(400);
    fail_('Wrong username or password.');
  }
  cache.remove(key);
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  cache.put('s_' + token, username, SESSION_SECONDS);
  log_(username, 'login', '', '');
  return { ok: true, token: token, user: publicUser_(u) };
}

function changePassword_(u, b) {
  var oldPw = String(b.oldPassword || ''), newPw = String(b.newPassword || '');
  if (hash_(u.salt, oldPw) !== u.hash) fail_('Your current password is not correct.');
  if (newPw.length < 8) fail_('The new password must be at least 8 characters.');
  if (newPw === oldPw) fail_('Choose a password different from the current one.');
  return withLock_(function () {
    var fresh = findUser_(u.username);
    fresh.salt = Utilities.getUuid();
    fresh.hash = hash_(fresh.salt, newPw);
    fresh.mustChange = 'no';
    writeObj_('Users', USER_COLS, fresh._row, fresh);
    log_(u.username, 'password-change', '', '');
    return { ok: true };
  });
}

/* ---------------------------------------------------------------- churches + ids */

function churches_() {
  return readAll_('Churches', CHURCH_COLS).map(function (c) { return { code: c.code, name: c.name, municipality: c.municipality }; });
}
function churchName_(code) {
  var list = churches_();
  for (var i = 0; i < list.length; i++) if (list[i].code === code) return list[i].name;
  return code;
}
function churchExists_(code) {
  return churches_().some(function (c) { return c.code === code; });
}
function check_(s) {
  var h = 7;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1296;
  return ('0' + h.toString(36).toUpperCase()).slice(-2);
}
function makeId_(code, seq) {
  var base = ID_PREFIX + '-' + code + '-' + ('0000' + seq).slice(-4);
  return base + '-' + check_(base);
}
function validId_(id) {
  var m = /^(.+-\d{4})-([0-9A-Z]{2})$/.exec(id);
  return !!m && check_(m[1]) === m[2];
}
function nextSeq_(code, members) {
  var max = 0, re = new RegExp('^' + ID_PREFIX + '-' + code + '-(\\d{4})-');
  members.forEach(function (m) { var x = re.exec(m.memberId); if (x) max = Math.max(max, Number(x[1])); });
  return max + 1;
}
function key_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/* ---------------------------------------------------------------- members */

function scoped_(u, members) {
  return u.role === 'district' ? members : members.filter(function (m) { return m.church === u.church; });
}
function findMember_(id, members) {
  for (var i = 0; i < members.length; i++) if (members[i].memberId === id) return members[i];
  return null;
}
function clean_(s, max) { return String(s || '').trim().slice(0, max || 120); }
function dateOk_(s) { return !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z').getTime())); }

function listMembers_(u) {
  var rows = scoped_(u, readAll_('Members', MEMBER_COLS)).map(function (m) { delete m._row; return m; });
  return { ok: true, members: rows };
}

function saveMember_(u, b) {
  var m = b.member || {};
  var all = readAll_('Members', MEMBER_COLS);
  var rec = {
    lastName: clean_(m.lastName, 60), firstName: clean_(m.firstName, 60), middleName: clean_(m.middleName, 60),
    sex: /^[MF]$/.test(m.sex) ? m.sex : '', birthdate: clean_(m.birthdate, 10), barangay: clean_(m.barangay, 80),
    phone: clean_(m.phone, 30), baptismDate: clean_(m.baptismDate, 10), notes: clean_(m.notes, 500)
  };
  if (!rec.lastName || !rec.firstName) fail_('Enter the first and last name.');
  if (!dateOk_(rec.birthdate) || !dateOk_(rec.baptismDate)) fail_('Dates must look like 2026-11-09.');

  if (m.memberId) {
    var cur = findMember_(String(m.memberId), all);
    if (!cur || scoped_(u, [cur]).length === 0) fail_('Member not found.');
    var row = cur._row;
    Object.keys(rec).forEach(function (k) { cur[k] = rec[k]; });
    if (u.role === 'district' && m.church && churchExists_(m.church)) cur.church = m.church;
    cur.updatedAt = now_(); cur.updatedBy = u.username;
    writeObj_('Members', MEMBER_COLS, row, cur);
    log_(u.username, 'edit', cur.memberId, '');
    delete cur._row;
    return { ok: true, member: cur };
  }

  var church = u.role === 'district' ? clean_(m.church, 10) : u.church;
  if (!church || !churchExists_(church)) fail_('Choose the church.');
  if (!b.force) {
    var dup = all.filter(function (x) {
      return key_(x.lastName) === key_(rec.lastName) && key_(x.firstName) === key_(rec.firstName) &&
        (!rec.birthdate || !x.birthdate || x.birthdate === rec.birthdate);
    })[0];
    if (dup) {
      fail_('Someone with this name is already registered: ' + dup.firstName + ' ' + dup.lastName + ' (' + churchName_(dup.church) +
        ', ' + dup.memberId + '). If this is a different person, save again to confirm.', 'duplicate');
    }
  }
  var rec2 = rec;
  rec2.memberId = makeId_(church, nextSeq_(church, all));
  rec2.church = church;
  rec2.status = 'active';
  rec2.statusDate = today_();
  rec2.statusNote = '';
  rec2.createdAt = now_(); rec2.updatedAt = now_(); rec2.updatedBy = u.username;
  appendObj_('Members', MEMBER_COLS, rec2);
  log_(u.username, 'create', rec2.memberId, '');
  return { ok: true, member: rec2 };
}

function setStatus_(u, b) {
  var status = String(b.status || '');
  if (STATUSES.indexOf(status) < 0) fail_('Choose a valid status.');
  var all = readAll_('Members', MEMBER_COLS);
  var cur = findMember_(String(b.memberId || ''), all);
  if (!cur || scoped_(u, [cur]).length === 0) fail_('Member not found.');
  var date = clean_(b.statusDate, 10) || today_();
  if (!dateOk_(date)) fail_('The date must look like 2026-11-09.');
  var old = cur.status;
  cur.status = status; cur.statusDate = date; cur.statusNote = clean_(b.note, 300);
  cur.updatedAt = now_(); cur.updatedBy = u.username;
  writeObj_('Members', MEMBER_COLS, cur._row, cur);
  log_(u.username, 'status', cur.memberId, old + ' -> ' + status + (cur.statusNote ? ': ' + cur.statusNote : ''));
  delete cur._row;
  return { ok: true, member: cur };
}

function history_(u, b) {
  var all = readAll_('Members', MEMBER_COLS);
  var cur = findMember_(String(b.memberId || ''), all);
  if (!cur || scoped_(u, [cur]).length === 0) fail_('Member not found.');
  var rows = readAll_('Log', LOG_COLS).filter(function (l) { return l.memberId === cur.memberId; })
    .slice(-50).reverse().map(function (l) { return { time: l.time, user: l.user, action: l.action, detail: l.detail }; });
  return { ok: true, history: rows };
}

/** Officer check across the whole district. Shows only name, church, status and ID. Every search is logged. */
function officerLookup_(u, b) {
  var ln = key_(b.lastName), fn = key_(b.firstName);
  if (ln.length < 2) fail_('Enter at least the last name.');
  var cache = CacheService.getScriptCache(), k = 'lk_' + u.username;
  var used = Number(cache.get(k) || 0);
  if (used >= LOOKUPS_PER_HOUR) fail_('Too many searches this hour. Try again later.', 'busy');
  cache.put(k, String(used + 1), 3600);
  var hits = readAll_('Members', MEMBER_COLS).filter(function (m) {
    return key_(m.lastName) === ln && (!fn || key_(m.firstName).indexOf(fn) === 0);
  }).slice(0, 10).map(function (m) {
    return { memberId: m.memberId, name: m.firstName + ' ' + m.lastName, church: churchName_(m.church), status: m.status, statusDate: m.statusDate };
  });
  log_(u.username, 'lookup', '', clean_(b.lastName, 40) + ' ' + clean_(b.firstName, 40) + ' -> ' + hits.length);
  return { ok: true, results: hits };
}

/* ---------------------------------------------------------------- public check (no sign-in) */

function publicVerify_(b) {
  var cache = CacheService.getScriptCache();
  var gk = 'pv_' + Math.floor(Date.now() / 60000), n = Number(cache.get(gk) || 0);
  if (n >= 30) fail_('Many people are checking right now. Please try again in a few minutes.', 'busy');
  cache.put(gk, String(n + 1), 120);

  var id = String(b.id || '').trim().toUpperCase().replace(/\s+/g, '');
  var ln = key_(b.lastName);
  if (!id || !ln) fail_('Enter the member ID and the last name.');
  var ik = 'pi_' + id, f = Number(cache.get(ik) || 0);
  if (f >= 5) fail_('Too many tries for this ID. Ask the church clerk to check it.', 'busy');

  var hit = null;
  if (validId_(id)) {
    var m = findMember_(id, readAll_('Members', MEMBER_COLS));
    if (m && key_(m.lastName) === ln && m.status === 'active') hit = m;
  }
  if (!hit) {
    cache.put(ik, String(f + 1), 3600);
    log_('public', 'verify-fail', validId_(id) ? id : '', '');
    return { ok: true, valid: false };
  }
  log_('public', 'verify-ok', hit.memberId, '');
  return { ok: true, valid: true, church: churchName_(hit.church) };
}

/* ---------------------------------------------------------------- users (district only) */

function listUsers_() {
  return { ok: true, users: readAll_('Users', USER_COLS).map(function (x) {
    return { username: x.username, name: x.name, role: x.role, church: x.church, active: x.active, mustChange: x.mustChange };
  }) };
}

function saveUser_(u, b) {
  var username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) fail_('Username: 3 to 30 letters, numbers, dot, dash or underscore.');
  var role = b.role === 'district' ? 'district' : 'clerk';
  var church = role === 'clerk' ? clean_(b.church, 10) : '';
  if (role === 'clerk' && !churchExists_(church)) fail_('Choose the church for this clerk.');
  var name = clean_(b.name, 80) || username;
  var existing = findUser_(username);
  if (existing) {
    if (username === u.username && b.active === 'no') fail_('You cannot turn off your own account.');
    existing.name = name; existing.role = role; existing.church = church;
    existing.active = b.active === 'no' ? 'no' : 'yes';
    writeObj_('Users', USER_COLS, existing._row, existing);
    log_(u.username, 'user-edit', '', username);
    return { ok: true };
  }
  var temp = tempPassword_();
  createUser_(username, name, role, church, temp);
  log_(u.username, 'user-create', '', username);
  return { ok: true, tempPassword: temp };
}

function resetPassword_(u, b) {
  var target = findUser_(String(b.username || '').trim().toLowerCase());
  if (!target) fail_('User not found.');
  var temp = tempPassword_();
  target.salt = Utilities.getUuid();
  target.hash = hash_(target.salt, temp);
  target.mustChange = 'yes';
  writeObj_('Users', USER_COLS, target._row, target);
  log_(u.username, 'password-reset', '', target.username);
  return { ok: true, tempPassword: temp };
}

/** Run from the editor if the admin password is lost. A new temporary password appears in the execution log. */
function resetAdmin() {
  var u = findUser_('admin');
  if (!u) { setup(); return; }
  var temp = tempPassword_();
  u.salt = Utilities.getUuid();
  u.hash = hash_(u.salt, temp);
  u.mustChange = 'yes';
  u.active = 'yes';
  writeObj_('Users', USER_COLS, u._row, u);
  CacheService.getScriptCache().remove('lf_admin');
  log_('system', 'password-reset', '', 'admin');
  Logger.log('New temporary password for admin: ' + temp);
}
