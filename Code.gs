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
/** District announcements. church = '' for the whole district, or a church code (TBD, I02 ...). */
var NEWS_COLS = ['id', 'title', 'body', 'date', 'church', 'pinned', 'createdAt', 'createdBy'];
/** District events. church = '' for the whole district, or a church code. time is free text like "9:00 AM". */
var EVENT_COLS = ['id', 'title', 'date', 'time', 'place', 'description', 'church', 'createdAt', 'createdBy'];
/** Sabbath attendance: one number per church per date. No names are stored. */
var PHOTO_COLS = ['memberId', 'church', 'photo', 'updatedAt', 'updatedBy'];
var ATT_COLS = ['church', 'date', 'count', 'updatedAt', 'updatedBy'];
var SESSION_SECONDS = 6 * 60 * 60;
var HASH_ROUNDS = 400;
var LOOKUPS_PER_HOUR = 60;

/** Real church names, keyed by the number in the church code (I02, I03 ...). The codes never change, so member IDs stay valid. */
var NAMED_ISABEL_ = { 2: 'Apale SDA Church', 3: 'Isabel SDA Church', 4: 'Simangan SDA Church',
  5: 'Puting Bato SDA Church', 6: 'Bantigue SDA Church', 7: 'San Francisco SDA Church' };

/** Run once after updating: renames the church rows already in the Churches tab. Only the name column changes. */
function renameChurches() {
  var cs = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Churches');
  var rows = cs.getRange(2, 1, Math.max(cs.getLastRow() - 1, 1), 3).getValues();
  var changed = 0;
  rows.forEach(function (r, k) {
    var m = /^I(\d\d)$/.exec(String(r[0]));
    var nm = m && NAMED_ISABEL_[parseInt(m[1], 10)];
    if (nm && r[1] !== nm) { cs.getRange(k + 2, 2).setValue(nm); changed++; }
  });
  Logger.log('Renamed ' + changed + ' church(es).');
}

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
    for (var i = 2; i <= 12; i++) rows.push(['I' + ('0' + i).slice(-2), NAMED_ISABEL_[i] || 'Isabel Church ' + i, 'Isabel']);
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
  if (a === 'publicAnnouncements') return publicAnnouncements_();
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
    case 'getSheetId': requireDistrict_(u); return getSheetId_(b);
    case 'previewFromSheet': requireDistrict_(u); return previewFromSheet_(u, b);
    case 'logExport': log_(u.username, 'export', '', String(Number(b.count) || 0) + ' rows'); return { ok: true };
    case 'listEvents': requireDistrict_(u); return listEvents_();
    case 'saveEvent': requireDistrict_(u); return withLock_(function () { return saveEvent_(u, b); });
    case 'deleteEvent': requireDistrict_(u); return withLock_(function () { return deleteEvent_(u, b); });
    case 'listPhotos': return listPhotos_(u, b);
    case 'savePhoto': return withLock_(function () { return savePhoto_(u, b); });
    case 'listAttendance': return listAttendance_(u);
    case 'saveAttendance': return withLock_(function () { return saveAttendance_(u, b); });
    case 'listNews': requireDistrict_(u); return listNews_();
    case 'saveNews': requireDistrict_(u); return withLock_(function () { return saveNews_(u, b); });
    case 'deleteNews': requireDistrict_(u); return withLock_(function () { return deleteNews_(u, b); });
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

/* ---------- read a church's own Google Sheet directly (district only) ----------
   Reads the "Members" tab of a church website's Sheet and returns the people
   mapped to registry fields for review. It only READS; nothing is written to
   the church's Sheet, and nothing is added to the registry until the officer
   confirms (that goes through the normal saveMember). The script can only open
   a Sheet its own Google account has access to. */
function sheetId_(s) {
  s = String(s || '').trim();
  var m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}
function splitName_(full) {
  var s = String(full || '').replace(/\s+/g, ' ').trim();
  if (s.indexOf(',') >= 0) {
    var last = s.slice(0, s.indexOf(',')).trim();
    var rest = s.slice(s.indexOf(',') + 1).trim().split(' ').filter(function (x) { return x; });
    return { firstName: rest[0] || '', middleName: rest.slice(1).join(' '), lastName: last };
  }
  var p = s.split(' ').filter(function (x) { return x; });
  if (!p[0]) return { firstName: '', middleName: '', lastName: '' };
  if (p.length === 1) return { firstName: p[0], middleName: '', lastName: p[0] };
  if (p.length === 2) return { firstName: p[0], middleName: '', lastName: p[1] };
  return { firstName: p[0], middleName: p.slice(1, -1).join(' '), lastName: p[p.length - 1] };
}
function mapStatus_(raw) {
  var s = String(raw || '').trim().toLowerCase();
  if (!s) return 'active';
  if (STATUSES.indexOf(s) >= 0) return s;
  if (s.indexOf('active') === 0) return 'active';
  if (s.indexOf('inact') === 0) return 'inactive';
  if (s.indexOf('backslid') === 0) return 'inactive';
  if (s.indexOf('offshoot') === 0 || s.indexOf('breakaway') === 0) return 'breakaway';
  if (s.indexOf('transfer') === 0) return 'transferred';
  if (s.indexOf('drop') === 0) return 'dropped';
  if (s.indexOf('decease') === 0 || s.indexOf('dead') === 0) return 'deceased';
  return 'active';
}
function getSheetId_(b) {
  var church = clean_(b.church, 10);
  if (!church || !churchExists_(church)) fail_('Choose the church.');
  var saved = PropertiesService.getScriptProperties().getProperty('sheet_' + church) || '';
  return { ok: true, sheetId: saved };
}
function previewFromSheet_(u, b) {
  var church = clean_(b.church, 10);
  if (!church || !churchExists_(church)) fail_('Choose the church.');
  var sid = sheetId_(b.sheetId);
  if (!sid) fail_('Paste the church Google Sheet link or ID.');
  var ss;
  try { ss = SpreadsheetApp.openById(sid); }
  catch (e) { fail_('Could not open that Sheet. Check the link, and make sure this registry account is allowed to open it.', 'sheet'); }
  var sh = ss.getSheetByName('Members');
  if (!sh) fail_('That Sheet has no tab named "Members".', 'sheet');
  var values = sh.getDataRange().getValues();
  if (values.length < 2) { return { ok: true, members: [], sheetId: sid }; }
  var col = {};
  values[0].forEach(function (h, i) { col[String(h).trim().toLowerCase()] = i; });
  var get = function (r, name) { var i = col[name]; return i === undefined ? '' : String(r[i] == null ? '' : r[i]).trim(); };
  var okDate = function (s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); };
  var out = [];
  for (var k = 1; k < values.length; k++) {
    var r = values[k];
    if (get(r, 'access') === 'pending') continue; /* not an approved member yet */
    var nm = splitName_(get(r, 'name'));
    if (!nm.firstName && !nm.lastName) continue;
    var notes = [];
    if (get(r, 'bday')) notes.push('Birthday ' + get(r, 'bday'));
    if (get(r, 'since')) notes.push('Member since ' + get(r, 'since'));
    out.push({
      firstName: nm.firstName, middleName: nm.middleName, lastName: nm.lastName,
      sex: '', birthdate: '', barangay: '',
      phone: clean_(get(r, 'phone'), 30),
      baptismDate: okDate(get(r, 'baptdate')) ? get(r, 'baptdate') : '',
      status: mapStatus_(get(r, 'mstatus')),
      statusDate: okDate(get(r, 'mstatusdate')) ? get(r, 'mstatusdate') : '',
      statusNote: clean_(get(r, 'mstatusnote'), 300),
      notes: notes.join(' · ')
    });
  }
  try { PropertiesService.getScriptProperties().setProperty('sheet_' + church, sid); } catch (e) {}
  log_(u.username, 'sheet-read', '', church + ' -> ' + out.length);
  return { ok: true, members: out, sheetId: sid };
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

/* ---------------------------------------------------------------- district announcements */

/** The News tab is created the first time it is needed, so nothing has to be re-run in setup(). */
function lazySheet_(name, cols) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, cols.length).setValues([cols]);
    s.getRange(1, 1, s.getMaxRows(), cols.length).setNumberFormat('@');
    s.setFrozenRows(1);
  }
  return s;
}
function lazyRows_(name, cols) {
  var s = lazySheet_(name, cols), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, cols.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 };
    cols.forEach(function (c, j) { o[c] = norm_(r[j]); });
    return o;
  });
}
function newsSheet_() { return lazySheet_('News', NEWS_COLS); }
function newsRows_() { return lazyRows_('News', NEWS_COLS); }
function newsOut_(o) {
  return { id: o.id, title: o.title, body: o.body, date: o.date, church: o.church, pinned: o.pinned === 'yes' ? 'yes' : '', createdAt: o.createdAt, createdBy: o.createdBy };
}
function newsSort_(a, b) {
  if ((a.pinned === 'yes') !== (b.pinned === 'yes')) return a.pinned === 'yes' ? -1 : 1;
  return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.createdAt < b.createdAt ? 1 : -1);
}

/** Public, no sign-in: only what officers chose to announce. No names, no member data. */
function publicAnnouncements_() {
  var names = {};
  churches_().forEach(function (c) { names[c.code] = c.name; });
  var list = newsRows_().sort(newsSort_).slice(0, 30).map(function (o) {
    var x = newsOut_(o);
    delete x.createdBy; delete x.createdAt;
    x.churchName = x.church ? (names[x.church] || '') : '';
    return x;
  });
  var today = today_();
  var events = lazyRows_('Events', EVENT_COLS).filter(function (e) { return e.date >= today; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).slice(0, 40).map(function (e) {
      var x = eventOut_(e); delete x.createdBy; delete x.createdAt;
      x.churchName = x.church ? (names[x.church] || '') : '';
      return x;
    });
  return { ok: true, announcements: list, events: events };
}
function listNews_() {
  return { ok: true, news: newsRows_().sort(newsSort_).map(newsOut_) };
}
function saveNews_(u, b) {
  var n = b.item || {};
  var title = clean_(n.title, 140), body = clean_(n.body, 2000), date = clean_(n.date, 10) || today_();
  var church = clean_(n.church, 10);
  if (!title) fail_('Please write a title.');
  if (!dateOk_(date)) fail_('The date is not valid.');
  if (church && !churchExists_(church)) fail_('That church is not in the list.');
  var rows = newsRows_(), cur = null;
  if (n.id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === n.id) cur = rows[i]; if (!cur) fail_('That announcement no longer exists.'); }
  var rec = {
    id: cur ? cur.id : 'N' + Utilities.getUuid().replace(/-/g, '').slice(0, 8),
    title: title, body: body, date: date, church: church, pinned: n.pinned ? 'yes' : '',
    createdAt: cur ? cur.createdAt : now_(), createdBy: cur ? cur.createdBy : u.username
  };
  if (cur) writeObj_('News', NEWS_COLS, cur._row, rec); else appendObj_('News', NEWS_COLS, rec);
  log_(u.username, cur ? 'news-edit' : 'news-add', '', title);
  return { ok: true, item: newsOut_(rec) };
}
function deleteNews_(u, b) {
  var rows = newsRows_();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === String(b.id || '')) {
      newsSheet_().deleteRow(rows[i]._row);
      log_(u.username, 'news-delete', '', rows[i].title);
      return { ok: true };
    }
  }
  fail_('That announcement no longer exists.');
}

/* ---------------------------------------------------------------- district events */

function eventOut_(o) {
  return { id: o.id, title: o.title, date: o.date, time: o.time, place: o.place, description: o.description, church: o.church, createdAt: o.createdAt, createdBy: o.createdBy };
}
function listEvents_() {
  var rows = lazyRows_('Events', EVENT_COLS).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  return { ok: true, events: rows.map(eventOut_) };
}
function saveEvent_(u, b) {
  var n = b.item || {};
  var title = clean_(n.title, 140), date = clean_(n.date, 10), church = clean_(n.church, 10);
  if (!title) fail_('Please write a title.');
  if (!date || !dateOk_(date)) fail_('Please choose the date.');
  if (church && !churchExists_(church)) fail_('That church is not in the list.');
  var rows = lazyRows_('Events', EVENT_COLS), cur = null;
  if (n.id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === n.id) cur = rows[i]; if (!cur) fail_('That event no longer exists.'); }
  var rec = {
    id: cur ? cur.id : 'E' + Utilities.getUuid().replace(/-/g, '').slice(0, 8),
    title: title, date: date, time: clean_(n.time, 30), place: clean_(n.place, 140), description: clean_(n.description, 1000), church: church,
    createdAt: cur ? cur.createdAt : now_(), createdBy: cur ? cur.createdBy : u.username
  };
  if (cur) writeObj_('Events', EVENT_COLS, cur._row, rec); else appendObj_('Events', EVENT_COLS, rec);
  log_(u.username, cur ? 'event-edit' : 'event-add', '', title);
  return { ok: true, item: eventOut_(rec) };
}
function deleteEvent_(u, b) {
  var rows = lazyRows_('Events', EVENT_COLS);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === String(b.id || '')) {
      lazySheet_('Events', EVENT_COLS).deleteRow(rows[i]._row);
      log_(u.username, 'event-delete', '', rows[i].title);
      return { ok: true };
    }
  }
  fail_('That event no longer exists.');
}


/* ---------------------------------------------------------------- member ID photos (private) */
/* One small JPEG per member, kept in its own tab so the member list stays light. Never sent to the public pages. */

function listPhotos_(u, b) {
  var want = null;
  if (b.ids && b.ids.length) { want = {}; for (var i = 0; i < b.ids.length && i < 300; i++) want[String(b.ids[i])] = true; }
  var out = {};
  lazyRows_('Photos', PHOTO_COLS).forEach(function (r) {
    if (u.role !== 'district' && r.church !== u.church) return;
    if (want && !want[r.memberId]) return;
    if (r.photo) out[r.memberId] = r.photo;
  });
  return { ok: true, photos: out };
}
function savePhoto_(u, b) {
  var id = clean_(b.memberId, 40);
  var m = findMember_(id, scoped_(u, readAll_('Members', MEMBER_COLS)));
  if (!m) fail_('Member not found.');
  var photo = String(b.photo || '');
  var rows = lazyRows_('Photos', PHOTO_COLS), cur = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].memberId === id) cur = rows[i];
  if (!photo) {
    if (cur) lazySheet_('Photos', PHOTO_COLS).deleteRow(cur._row);
    log_(u.username, 'photo removed', id, '');
    return { ok: true };
  }
  if (photo.indexOf('data:image/jpeg;base64,') !== 0 || photo.length > 45000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(photo)) fail_('That picture could not be saved. Try a smaller one.');
  var rec = { memberId: id, church: m.church, photo: photo, updatedAt: now_(), updatedBy: u.username };
  if (cur) writeObj_('Photos', PHOTO_COLS, cur._row, rec); else appendObj_('Photos', PHOTO_COLS, rec);
  log_(u.username, 'photo saved', id, '');
  return { ok: true };
}

/* ---------------------------------------------------------------- Sabbath attendance (counts only) */

function listAttendance_(u) {
  var rows = lazyRows_('Attendance', ATT_COLS).filter(function (r) { return u.role === 'district' || r.church === u.church; });
  return { ok: true, attendance: rows.map(function (r) { return { church: r.church, date: r.date, count: Number(r.count) || 0, updatedAt: r.updatedAt, updatedBy: r.updatedBy }; }) };
}
function saveAttendance_(u, b) {
  var church = u.role === 'district' ? clean_(b.church, 10) : u.church;
  if (!church || !churchExists_(church)) fail_('Please choose a church.');
  var date = clean_(b.date, 10);
  if (!date || !dateOk_(date)) fail_('Please choose the Sabbath date.');
  if (date > today_()) fail_('That date has not come yet.');
  var count = Number(b.count);
  if (!isFinite(count) || count < 0 || count > 5000 || Math.floor(count) !== count) fail_('Enter a whole number from 0 to 5000.');
  var rows = lazyRows_('Attendance', ATT_COLS), cur = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].church === church && rows[i].date === date) cur = rows[i];
  var rec = { church: church, date: date, count: String(count), updatedAt: now_(), updatedBy: u.username };
  if (cur) writeObj_('Attendance', ATT_COLS, cur._row, rec); else appendObj_('Attendance', ATT_COLS, rec);
  log_(u.username, 'attendance', '', churchName_(church) + ' ' + date + ': ' + count);
  return { ok: true };
}
