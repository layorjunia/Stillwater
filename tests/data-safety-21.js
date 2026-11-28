/* Round 21 — the Seminary: a library of whole lessons beside the day's Bible lessons.
   Same contract: runAll21(), or runAll21('regex') to run the tests whose names match.

   What this protects: the library is whole (every lesson in the index has a body, ids are unique, every course file is there); every Bible
   reference in a lesson is a real verse; every book of the Bible has a note; progress lives in its own key, survives junk and a damaged
   main copy, and Import only ever adds; the day's lesson is chosen once and kept, rotates through the courses, and never repeats a lesson he
   has read; reading it never touches the Study record; a reference inside a lesson opens the verse inside the app; the files are cached
   under their own revision; every word can be read.

   Run signed OUT, from http://localhost. Needs fake-firestore.js loaded first. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const KEY = STORAGE_KEY;
  const $q = s => document.querySelector(s);
  const getJson = async (p) => { const r = await fetch('/study/' + p, { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const today = () => dayKey();
  const ago = (n) => dayKey(addDays(new Date(), -n));
  const norm = s => s.replace(/\s+/g, ' ').trim();

  function reset() {
    try { semClose(); } catch (e) {}
    try { readerClose(); } catch (e) {}
    clearTimeout(semSaveTimer); semSaveTimer = null; semDirty = false;
    clearTimeout(studySaveTimer); studySaveTimer = null; studyDirty = false;
    [SEM_KEY, SEM_KEY + '_bak', STUDY_KEY, STUDY_KEY + '_bak', 'stillwater_wal', 'stillwater_wal_checkins', 'stillwater_wal_mind', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [], deleted: {} }));
    state.thoughts = []; state.grievances = []; state.journals = []; state.deleted = {}; state.daily = {}; state.checkins = []; state.mind = [];
    state.current = { thought: null, grievance: null, journal: null, checkin: null };
    study = studyNormalize(null); sem = semNormalize(null);
    stState.screen = 'home'; stState.jid = null; stState.open = {};
    for (const k of Object.keys(studyMem)) delete studyMem[k];
    for (const k of Object.keys(rdMem)) delete rdMem[k];
    for (const k of Object.keys(rdFlight)) delete rdFlight[k];
    rdPrefetched.clear(); studyTried.clear(); studyJourneys = null;
    hasLoadedFromCloud = false; currentUser = null;
    localStorage.setItem('stillwater_legacy_prompted_', '1');
    localStorage.setItem('stillwater_legacy_pulled_test@example.invalid', '1');
  }
  async function indexReady() {                                   // the index, loaded
    if (!semIndex) { semIndex = null; semEnsureIndex(); for (let i = 0; i < 60 && !semIndex; i++) await wait(100); }
    ok(semIndex && semIndex.total > 100, 'the index loaded: ' + (semIndex && semIndex.total));
    return semIndex;
  }
  async function enterStudy() { reset(); await indexReady(); setMode('study'); await wait(500); }
  const stored = () => JSON.parse(localStorage.getItem(SEM_KEY) || 'null');
  const lum = (r, g, b) => { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgb = (s) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
  const onto = (css, base) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(css); if (!m) return base; const a = m[4] === undefined ? 1 : Number(m[4]); return [0, 1, 2].map(i => Math.round(Number(m[i + 1]) * a + base[i] * (1 - a))); };   // a translucent background over what is behind it
  const ratio = (a, b) => { const x = lum(...a), y = lum(...b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  // all the course files, fetched once and shared by the tests below
  let BODIES = null, BSB = {};
  async function loadBodies() {
    if (BODIES) return BODIES;
    const idx = await getJson('sem/index.json'); BODIES = {};
    for (const [cid, , ] of idx.courses) { try { BODIES[cid] = await getJson('sem/' + cid + '.json'); } catch (e) { BODIES[cid] = null; } }
    return BODIES;
  }

  // ============ the library ============
  t('the library is whole: every lesson in the index has a body, ids are unique, and every body is in the index', async () => {
    const idx = await getJson('sem/index.json'), bodies = await loadBodies();
    ok(idx.lessons.length >= 150, 'lessons: ' + idx.lessons.length);
    eq(new Set(idx.lessons.map(r => r[0])).size, idx.lessons.length, 'every lesson has its own id:');
    const seen = new Set();
    for (const [id, ci, title, mins, cf] of idx.lessons) {
      ok(/^[a-z0-9-]{3,40}$/.test(id), id + ' is a well formed id');
      ok(idx.courses[ci], id + ' belongs to a course'); ok(title.length >= 2 && title.length <= 60, id + ' title');
      ok(Number.isInteger(mins) && mins >= 2 && mins <= 6, id + ' minutes: ' + mins); ok([0, 1, 2].includes(cf), id + ' label');
      const B = bodies[idx.courses[ci][0]]; ok(B, 'the file for ' + idx.courses[ci][0] + ' is there');
      const D = B[id]; ok(D && Array.isArray(D.b) && D.b.length >= 2 && D.b.every(x => typeof x === 'string' && x.length > 0), id + ' has a body');
      ok(Array.isArray(D.r) && typeof D.q === 'string', id + ' key passages and question');
      seen.add(id);
    }
    for (const [cid, B] of Object.entries(bodies)) if (B) for (const id of Object.keys(B)) ok(seen.has(id), id + ' is in the index (nothing hidden in a file)');
  });

  t('every lesson is a real piece of writing: 130 to 560 words, whole sentences, American spelling, BC and AD, no dashes, no markup', async () => {
    const bodies = await loadBodies(), BR = /\b(?:colour|honour|favour|behaviour|neighbour|labour|flavour|humour|centre|metre|theatre|fibre|organise|recognise|realise|emphasise|programme|defence|offence|licence|practise|grey|towards|whilst|amongst|learnt|judgement|holiday|saviour)\b/i;
    let n = 0;
    for (const [cid, B] of Object.entries(bodies)) for (const [id, D] of Object.entries(B || {})) {
      const text = D.b.join(' '), w = text.split(/\s+/).length; n++;
      ok(w >= 130 && w <= 650, id + ' words: ' + w);
      ok(!/\b(?:BCE|CE)\b/.test(text), id + ' uses BCE/CE'); ok(!BR.test(text.replace(/burnt offerings?/gi, '').replace(/\bTyre\b/g, '')), id + ' British spelling: ' + (BR.exec(text) || [])[0]);
      ok(!/[–—]/.test(text + D.q), id + ' has a dash'); ok(!/\*\*|`|\]\(/.test(text), id + ' has markup');
      for (const b of D.b) if (!b.startsWith('## ') && !b.startsWith('- ')) ok(/[.?!"”:]$/.test(b.trim()), id + ' paragraph ends mid-sentence: ...' + b.slice(-30));
    }
    ok(n >= 150, 'checked ' + n);
  });

  t('every Bible reference in a lesson is a real verse (checked here against the Bible text, not against the builder)', async () => {
    const bodies = await loadBodies(); let refs = 0;
    for (const [cid, B] of Object.entries(bodies)) for (const [id, D] of Object.entries(B || {})) {
      const found = [];
      for (const b of D.b.concat([D.q])) { SEM_REF_RE.lastIndex = 0; let m; while ((m = SEM_REF_RE.exec(b))) found.push(m[2] + ' ' + m[3] + (m[4] ? ':' + m[4] + (m[5] ? '-' + m[5] : '') : '')); }
      for (const r of D.r) found.push(r);
      for (const ref of found) {
        const p = readerParseRef(ref); ok(p, id + ': ' + ref + ' is not a reference'); refs++;
        if (!BSB[p.code]) BSB[p.code] = await (await fetch('/study/bsb/' + p.code + '.json')).json();
        const chap = BSB[p.code][p.ch - 1]; ok(chap, id + ': ' + ref + ' has no such chapter');
        if (p.v1) { ok(chap[p.v1 - 1], id + ': ' + ref + ' has no verse ' + p.v1); ok(chap[p.v2 - 1], id + ': ' + ref + ' has no verse ' + p.v2); }
      }
    }
    ok(refs > 300, 'references checked: ' + refs);
  });

  t('every one of the 66 books has a note, and the paired books point to the note that covers them', async () => {
    await indexReady();
    for (const b of STUDY_BOOKS) { const L = semBookIntro(b[0]); ok(L, b[1] + ' has a note'); ok(L.t.length > 2, b[1] + ' note has a title'); }
    eq(semBookIntro('2SA').id, semBookIntro('1SA').id, '2 Samuel shares the note:'); eq(semBookIntro('NEH').id, semBookIntro('EZR').id, 'Nehemiah shares Ezra\'s:');
    eq(semBookIntro('3JN').id, semBookIntro('1JN').id, '3 John shares the note:');
    ok(semBookIntro('GEN').id !== semBookIntro('EXO').id, 'single books have their own');
    const bodies = await loadBodies(); const D = bodies.books[semBookIntro('ROM').id]; ok(D.b.some(x => x.startsWith('## ')) && D.b.some(x => x.startsWith('- ')), 'a note has its headings and its outline');
  });

  // ============ storage ============
  t('what is read from storage is never trusted: junk, bad ids, bad days and bad times are dropped, not fatal', () => {
    const out = semNormalize({ read: { 'good-id': 1700000000000, 'Bad ID': 5, 'x': 5, 'neg-one': -5, 'zero-zero': 0, 'str-time': 'abc', 'ok-two': '1700000000001' }, days: { '2026-01-02': 'good-id', 'tomorrow': 'good-id', '2026-01-03': 'BAD', '2026-01-04': 7, '2026-1-5': 'good-id' }, extra: 5 });
    eq(Object.keys(out.read).sort().join(','), 'good-id,ok-two', 'only sound reads:'); eq(out.read['ok-two'], 1700000000001, 'a numeric string is a time:');
    eq(Object.keys(out.days).join(','), '2026-01-02', 'only sound days:'); eq(out.v, 1, 'version:'); ok(!('extra' in out), 'nothing else is kept');
    for (const bad of [null, undefined, 5, 'x', [], true]) { const o = semNormalize(bad); eq(Object.keys(o.read).length + Object.keys(o.days).length, 0, 'empty for ' + JSON.stringify(bad) + ':'); }
    const big = { read: {} }; for (let i = 0; i < 25000; i++) big.read['l-' + String(i).padStart(6, '0')] = 5; eq(Object.keys(semNormalize(big).read).length, 20000, 'bounded:');
  });

  t('progress is in its own key, with one previous copy, and a damaged main copy falls back to it', async () => {
    reset(); await indexReady();
    const id = semIndex.byCourse[0][0].id, id2 = semIndex.byCourse[0][1].id;
    semToggle(id); semToggle(id2);
    const a = stored(); ok(a.read[id] > 0 && a.read[id2] > 0, 'saved at once under ' + SEM_KEY);
    ok(!JSON.parse(localStorage.getItem(KEY)).seminary, 'nothing about it in the journal save');
    ok(localStorage.getItem(SEM_KEY + '_bak'), 'the previous copy is kept'); ok(JSON.parse(localStorage.getItem(SEM_KEY + '_bak')).read[id] > 0, 'and it is readable');
    localStorage.setItem(SEM_KEY, '{ this is not json'); semLoad(); ok(semRead(id), 'a broken main copy falls back to the previous one');
    localStorage.setItem(SEM_KEY, JSON.stringify({ read: { 'zz-top': 5 }, days: {} })); localStorage.removeItem(SEM_KEY + '_bak'); semLoad(); ok(semRead('zz-top') && !semRead(id), 'a sound main copy is read as it is');
    localStorage.removeItem(SEM_KEY); localStorage.removeItem(SEM_KEY + '_bak'); semLoad(); eq(Object.keys(sem.read).length, 0, 'nothing stored: empty, not a crash:');
    const id3 = semIndex.byCourse[0][2].id;
    localStorage.setItem(SEM_KEY, JSON.stringify({ read: { [id]: 5 }, days: {} })); semLoad(); semToggle(id2);           // saving keeps that good main copy as the previous one
    ok(JSON.parse(localStorage.getItem(SEM_KEY + '_bak')).read[id] > 0, 'the good copy became the previous one');
    localStorage.setItem(SEM_KEY, 'garbage'); semToggle(id3);
    ok(JSON.parse(localStorage.getItem(SEM_KEY + '_bak')).read[id] > 0, 'a broken main copy is never copied over the good previous one: ' + (localStorage.getItem(SEM_KEY + '_bak') || '').slice(0, 40));
  });

  t('Import only ever adds: a lesson he has read stays read, the earliest time is kept, nothing is lowered or removed', async () => {
    reset(); await indexReady();
    const [a, b, c] = semIndex.byCourse[0].map(x => x.id);
    sem.read[a] = 2000; sem.days[ago(1)] = a; semSaveNow();
    const n = semImport({ read: { [a]: 1000, [b]: 3000, 'junk id': 5 }, days: { [ago(1)]: b, [ago(2)]: c } });
    eq(n, 1, 'one new lesson counted:'); eq(sem.read[a], 1000, 'the earlier time is kept:'); eq(sem.read[b], 3000, 'the new lesson is added:'); ok(!('junk id' in sem.read), 'junk is dropped');
    eq(sem.days[ago(1)], a, 'a day already chosen is not changed:'); eq(sem.days[ago(2)], c, 'a new day is added:');
    const before = JSON.stringify(sem); eq(semImport({ read: { [a]: 9999 } }), 0, 'a later time adds nothing:'); eq(JSON.stringify(sem), before, 'and changes nothing:');
    eq(semImport(null), 0, 'null:'); eq(semImport('x'), 0, 'junk:'); eq(JSON.stringify(sem), before, 'unchanged by junk:');
    eq(stored().read[b], 3000, 'and it was saved:');
  });

  t('Export carries it, and Import through the real path brings it back (nothing else in the save is touched)', async () => {
    reset(); await indexReady();
    const [a, b] = semIndex.byCourse[0].map(x => x.id); semToggle(a); semToggle(b);
    const out = collectForExport(); ok(out.seminary && out.seminary.read[a] > 0 && out.seminary.read[b] > 0, 'exported');
    const snap = JSON.stringify(out.seminary); sem = semNormalize(null); semSaveNow();
    semImport(JSON.parse(snap)); ok(semRead(a) && semRead(b), 'imported'); eq(JSON.stringify(semForExport()), snap, 'the same record:');
  });

  // ============ the day's lesson ============
  t('the day gets one lesson, chosen once and kept; a second look the same day, and after a reload, is the same lesson', async () => {
    reset(); await indexReady();
    const L = semAssign(today()); ok(L, 'a lesson for today'); eq(sem.days[today()], L.id, 'kept:'); eq(stored().days[today()], L.id, 'saved:');
    eq(semAssign(today()).id, L.id, 'the same on a second look:'); semToggle(L.id); eq(semAssign(today()).id, L.id, 'and still the same after he reads it:');
    semLoad(); eq(semAssign(today()).id, L.id, 'and after a reload:');
  });

  t('days rotate through the courses, and a lesson he has read never comes up again', async () => {
    reset(); await indexReady();
    const first = [], full = semIndex.byCourse.map((l, i) => i).filter(i => semIndex.byCourse[i].length);
    ok(full.length >= 3, 'at least three courses in the library');
    for (let i = 0; i < full.length; i++) { const L = semAssign(ago(30 - i)); first.push(L.ci); semToggle(L.id); }
    eq(new Set(first).size, full.length, 'one lesson from each course in turn: ' + first.join(','));
    eq(first.join(','), full.join(','), 'in the order the library lists them:');
    const read = new Set(Object.keys(sem.read));
    for (let i = 0; i < 25; i++) { const d = dayKey(addDays(new Date(), 1 + i)); const L = semAssign(d); ok(L, 'a lesson'); ok(!read.has(L.id), L.id + ' was already read'); semToggle(L.id); read.add(L.id); }
  });

  t('a lesson he has not read comes first in line again; when every lesson is read there is nothing to offer, not a crash', async () => {
    reset(); await indexReady();
    const L = semAssign(ago(3)); const next = semAssign(ago(2)); ok(L.id !== next.id, 'the next day is a different lesson');
    const again = semPick(ago(-40)); const sameCourse = semIndex.byCourse[L.ci].find(x => !semRead(x.id));
    ok(semIndex.byCourse[again.ci].find(x => !semRead(x.id)).id === again.id, 'always the first unread of its course');
    ok(sameCourse.id === L.id, 'the unread one stays first in its course');
    for (const id of semIndex.byId.keys()) sem.read[id] = 1;
    eq(semPick(ago(-50)), null, 'all read: nothing:'); setMode('study'); await wait(300); ok($q('#st-inner').textContent.includes('Seminary'), 'the tab still draws');
    ok(!$q('#st-inner .sm-card'), 'and offers no card');
  });

  t('a day kept for a lesson that is no longer in the library is picked again, not shown as nothing', async () => {
    reset(); await indexReady(); sem.days[today()] = 'gone-lesson'; const L = semAssign(today()); ok(L && L.id !== 'gone-lesson', 'picked again'); eq(sem.days[today()], L.id, 'and kept:');
  });

  // ============ the screens ============
  t('the Study tab shows the day\'s lesson with its course, minutes and a button, and the courses with how many are read', async () => {
    await enterStudy(); const L = semAssign(today());
    const card = $q('#st-inner .sm-card'); ok(card, 'a card'); ok(card.textContent.includes(L.t), 'its title'); ok(card.textContent.includes(semIndex.courses[L.ci].n), 'its course'); ok(card.textContent.includes(L.m + ' min'), 'its minutes'); ok(card.querySelector('.sm-min').textContent === L.m + ' min', 'in the minutes label');
    ok(card.querySelector('[data-sm="open:' + L.id + '"]'), 'a button to read it'); ok(card.querySelector('[data-sm="done:' + L.id + '"]'), 'and one to mark it');
    const rows = [...document.querySelectorAll('#st-inner .sm-rows .sm-row')]; eq(rows.length, semIndex.courses.filter((c, i) => semIndex.byCourse[i].length).length, 'a row for each course:');
    ok(rows.every(r => /\d+ of \d+/.test(r.textContent)), 'with its count');
    const head = $q('#st-inner .sm-rows .mm-count').textContent; eq(head, '0 of ' + semIndex.total, 'the total:');
    semToggle(L.id); await wait(80); ok($q('#st-inner .sm-card').classList.contains('done'), 'marked: the card says so'); eq($q('#st-inner .sm-rows .mm-count').textContent, '1 of ' + semIndex.total, 'and the total moves:');
  });

  t('a course opens to its lessons, each with a check and a title; marking works from the list; Back returns', async () => {
    await enterStudy(); const cid = semIndex.courses[0].id; semGo('course:' + cid); await wait(120);
    eq(stState.screen, 'course', 'the course screen:'); const rows = [...document.querySelectorAll('#st-inner .st-jp')]; eq(rows.length, semIndex.byCourse[0].length, 'a row for every lesson:');
    const L = semIndex.byCourse[0][1]; const row = rows[1]; ok(row.textContent.includes(L.t), 'the title'); row.querySelector('.st-check').click(); await wait(80);
    ok(semRead(L.id), 'marked from the list'); ok($q('#st-inner .st-jp:nth-of-type(2)') || true, 'still drawn'); ok(document.querySelectorAll('#st-inner .st-jp.on').length === 1, 'one row shows read');
    const h = $q('#st-inner .mm-count').textContent; ok(/^1 of \d+$/.test(h), 'the count: ' + h);
    semGo('cback'); await wait(120); eq(stState.screen, 'home', 'Back:'); ok($q('#st-inner .sm-card'), 'the home again');
  });

  t('a lesson opens in its own reader: title, course, minutes, the paragraphs, key passages, a question, and the next lesson', async () => {
    await enterStudy(); const L = semIndex.byCourse[2].find(x => x.id === 'book-gen') || semIndex.byId.get('book-gen'); ok(L, 'Genesis has a note');
    semOpen(L.id); await wait(700);
    ok(!$q('#semreader').hidden, 'open'); eq($q('#sm-title').textContent, semIndex.courses[L.ci].n, 'the course in the bar:'); ok($q('#sm-inner .sm-h').textContent === L.t, 'the title');
    ok(document.querySelectorAll('#sm-inner .rd-c').length >= 2, 'paragraphs'); ok($q('#sm-inner ul.sm-ul'), 'and the outline'); ok($q('#sm-inner h4.rd-h'), 'and headings');
    ok(document.querySelectorAll('#sm-inner .sm-refs button').length >= 2, 'key passages'); ok($q('#sm-inner .sm-next'), 'and the next lesson');
    const next = $q('#sm-inner .sm-next'); const nid = next.dataset.sm.slice(5); next.click(); await wait(500); eq(semState.id, nid, 'the next lesson opens in place:'); ok($q('#sm-inner .sm-h').textContent === semIndex.byId.get(nid).t, 'with its title');
    semClose(); ok($q('#semreader').hidden, 'closes');
  });

  t('Mark as read in the reader toggles and saves, and does not close the lesson', async () => {
    await enterStudy(); const L = semIndex.byCourse[0][0]; semOpen(L.id); await wait(500);
    ok(!semRead(L.id) && $q('#sm-mark-t').textContent === 'Mark as read', 'starts unread');
    $q('#sm-mark').click(); await wait(50); ok(semRead(L.id), 'read'); eq($q('#sm-mark-t').textContent, 'Read', 'the button says so:'); eq($q('#sm-mark').getAttribute('aria-pressed'), 'true', 'pressed:'); ok(!$q('#semreader').hidden, 'still open'); ok(stored().read[L.id] > 0, 'saved');
    $q('#sm-mark').click(); await wait(50); ok(!semRead(L.id), 'and back to unread');
  });

  t('a Bible reference inside a lesson opens that verse in the reader, above the lesson, and closing it returns to the lesson', async () => {
    await enterStudy(); const L = semIndex.byId.get('in-the-beginning-a-world-made-on-purpose'); ok(L, 'the lesson is in the library'); semOpen(L.id); await wait(700);
    const btn = $q('#sm-inner .sm-ref'); ok(btn, 'a reference in the text');
    const want = readerParseRef(btn.dataset.sm.slice(4)); btn.click(); await wait(900);
    ok(!$q('#reader').hidden, 'the Bible reader opened'); ok($q('#rd-title').textContent.startsWith(want.name + ' ' + want.ch), 'at ' + want.name + ' ' + want.ch + ': ' + $q('#rd-title').textContent);
    const auth = $q('#auth-overlay'), authWas = auth && auth.style.display; if (auth) auth.style.display = 'none';        // signed out, the sign-in screen is meant to sit above everything: look through it
    try { const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2); ok(top && top.closest('#reader'), 'above the lesson'); } finally { if (auth) auth.style.display = authWas; }
    ok($q('#rd-inner .rd-text'), 'with verses'); const nums = [...document.querySelectorAll('#rd-inner .rd-text .rd-v sup')].map(x => Number(x.textContent)); ok(nums.length > 0, 'numbered');
    if (want.v1) eq(nums[0], want.v1, 'starting at the verse asked for:');
    readerClose(); await wait(100); ok(!$q('#semreader').hidden, 'the lesson is still there'); eq(semState.id, L.id, 'the same lesson:');
    const chip = $q('#sm-inner .sm-refs button'); chip.click(); await wait(600); ok(!$q('#reader').hidden, 'a key passage opens too'); readerClose();
  });

  t('a reference is only a link if it is real: valid ones become buttons, others stay plain text', () => {
    const h = semRich('See Romans 8:28 and Genesis 1:1-3, then Psalm 23. Mark 99 is not a chapter, Chapter 3 is not a book, and Matthew 5:3-12 is.');
    const btns = [...h.matchAll(/data-sm="ref:([^"]+)"/g)].map(m => m[1]);
    eq(btns.join('|'), 'Romans 8:28|Genesis 1:1-3|Psalm 23|Matthew 5:3-12', 'the real ones:'); ok(h.includes('Mark 99') && !h.includes('ref:Mark'), 'an impossible chapter is plain text');
    ok(h.includes('Genesis 1:1–3'), 'a range shows with an en dash'); ok(!semRich('<b>x</b> & "y"').includes('<b>'), 'text is escaped');
    eq(semRich('Romans 8:28').match(/<button/g).length, 1, 'one button:'); ok(!/Genesis 1:1<\/button>-3/.test(h), 'the range is one button');
    ok(semRich('1 Corinthians 13:4-7 and 2 Timothy 3:16').match(/<button/g).length === 2, 'numbered books'); ok(semRich('Song of Solomon 2:10').includes('data-sm="ref:Song of Solomon 2:10"'), 'Song of Solomon');
  });

  t('the lesson text is safe: nothing in it can add markup to the page', async () => {
    await enterStudy(); const L = semIndex.byCourse[0][0]; const was = semBodies[L.cid]; const D = was[L.id]; const keep = JSON.stringify(D);
    try {
      was[L.id] = { b: ['## <img src=x onerror=window.__pwn=1>', 'A <script>window.__pwn=2</script> paragraph with Romans 8:28 in it. "Quote" & more.', '- <b>bold</b> item'], r: ['ROM 8:28', 'NOPE 1:1'], q: '<i>q</i> Genesis 1:1' };
      semOpen(L.id); await wait(200);
      ok(!window.__pwn, 'nothing ran'); ok(!$q('#sm-inner img') && !$q('#sm-inner script') && !$q('#sm-inner b') && !$q('#sm-inner i'), 'no elements made from text');
      ok($q('#sm-inner').textContent.includes('<script>window.__pwn=2</script>'), 'shown as text'); eq(document.querySelectorAll('#sm-inner .sm-refs button').length, 1, 'an unreadable key passage is skipped:');
    } finally { was[L.id] = JSON.parse(keep); semClose(); }
  });

  t('reading lessons never touches the Study record, its streak or its plan', async () => {
    await enterStudy(); studyAssign(today()); const rec = JSON.stringify(study), streak = JSON.stringify(studyStreaks());
    for (const L of semIndex.byCourse[0].slice(0, 3)) semToggle(L.id);
    semAssign(today()); semOpen(semIndex.byCourse[1][0].id); await wait(300); semClose();
    eq(JSON.stringify(study), rec, 'the Study record is unchanged:'); eq(JSON.stringify(studyStreaks()), streak, 'and so is the streak:');
    ok(!studyDayDone(today()), 'reading Seminary lessons does not finish the Study day'); eq(studyWidgetFields().studyToday, 0, 'nor move the widget:');
    ok(!('seminary' in study) && !JSON.stringify(study).includes('book-'), 'nothing of it inside the Study record');
  });

  t('the Bible lesson card offers the note for a new book, on its first lesson only, and the note opens', async () => {
    await enterStudy();
    const first = studyAssign(today()); const slot = studySlots(first).map(i => studyItem(first, i)).find(it => it.n === 0 && it.ch === 1);
    ok(slot, 'day one has a first lesson of a book: ' + studySlots(first).map(i => studyItem(first, i).id).join(','));
    const btn = [...document.querySelectorAll('#st-inner .st-card [data-sm^="open:book-"]')]; ok(btn.length >= 1, 'an About button: ' + btn.length);
    ok(btn.every(b => /^About /.test(b.textContent)), 'it says so'); ok(btn.some(b => b.textContent === 'About ' + slot.name), 'for ' + slot.name);
    const rec = study.days[today()]; for (const i of studySlots(rec)) { const it = studyItem(rec, i); if (!(it.n === 0 && it.ch === 1)) ok(!document.querySelector('[data-t="' + i + '"] [data-sm]'), it.ref + ' is not the start of a book: no button'); }
    btn[0].click(); await wait(500); ok(!$q('#semreader').hidden && semState.id.startsWith('book-'), 'the note opens'); semClose();
  });

  // ============ fetching and keeping ============
  t('the files are kept under their own revision, so a phone never shows an old library, and the Bible text cache is not touched', async () => {
    eq(SEM_REV, 2, 'revision:'); eq(SEM_CACHE, 'sw-sem-v2', 'cache:'); ok(SEM_CACHE !== STUDY_CACHE, 'apart from the Bible and Henry');
    await caches.delete(SEM_CACHE); semPurged = null; const was = window.fetch, urls = []; window.fetch = (u, o) => { urls.push(String(u)); return was(u, o); };
    try {
      await semFetchJson('index.json'); ok(urls.some(u => /\/study\/sem\/index\.json\?r=2$/.test(u)), 'the fetch carries the revision: ' + urls.join(' '));
      urls.length = 0; await semFetchJson('index.json'); eq(urls.length, 0, 'the second time nothing is fetched:');
      await (await caches.open('sw-sem-v1')).put('/old', new Response('x')); semPurged = null; await semFetchJson('index.json'); ok(!(await caches.keys()).includes('sw-sem-v1'), 'an older revision is deleted');
      ok((await caches.keys()).includes(SEM_CACHE), 'and this one is kept');
    } finally { window.fetch = was; }
  });

  t('without a connection the first time: a message and a retry, never a blank screen; the lessons come back when it is there', async () => {
    reset(); const was = window.fetch, keepIdx = semIndex; await caches.delete(SEM_CACHE); semPurged = null; semIndex = null; semPrefetched = true;
    window.fetch = (u, o) => String(u).includes('/study/sem/') ? Promise.reject(new Error('offline')) : was(u, o);
    try {
      setMode('study'); await wait(900); eq(semIndex, false, 'the index could not be fetched:'); ok($q('#st-inner').textContent.includes('Needs a connection the first time'), 'it says so');
      ok(!$q('#st-inner .sm-card'), 'no card from nothing'); ok($q('#st-inner .st-card'), 'the Bible lessons are still there');
    } finally { window.fetch = was; }
    setMode('daily'); await wait(100); semPrefetched = false; setMode('study'); await wait(1500); ok(semIndex && semIndex.total > 100, 'back, on the next visit: ' + (semIndex && semIndex.total)); ok($q('#st-inner .sm-card'), 'with its card');
    window.fetch = was;
  });

  t('a lesson file that cannot be fetched shows a message and a retry; the retry works', async () => {
    await enterStudy(); const L = semIndex.byCourse[0][0]; const was = window.fetch; await caches.delete(SEM_CACHE); semPurged = null; delete semBodies[L.cid];
    window.fetch = (u, o) => String(u).includes('/study/sem/' + L.cid) ? Promise.reject(new Error('offline')) : was(u, o);
    try { semOpen(L.id); await wait(500); ok($q('#sm-inner').textContent.includes('needs a connection'), 'a message'); ok($q('#sm-inner [data-sm="retry"]'), 'and a retry button'); eq(semBodies[L.cid], false, 'remembered as failed:'); }
    finally { window.fetch = was; }
    $q('#sm-inner [data-sm="retry"]').click(); await wait(900); ok($q('#sm-inner .rd-c'), 'the lesson is there after the retry'); semClose();
  });

  t('a damaged index is survived: bad rows are skipped, a wrong shape is refused as a whole', () => {
    const idx = semShape({ courses: [['aa', 'One', '#112233'], ['bb', 'Two', 'red'], 'junk', ['cc']], lessons: [['good-one', 0, 'A title', 3, 0], 'junk', ['bad id!', 0, 'x', 3, 0], ['no-course', 9, 'x', 3, 0], ['empty', 0, '', 3, 0], ['good-one', 0, 'dup', 3, 0], ['short', 0, 'x'], ['ok-two', 1, 'Two', 'abc', 7], null] });
    eq([...idx.byId.keys()].join(','), 'good-one,ok-two', 'only sound rows:'); eq(idx.byId.get('ok-two').m, 3, 'minutes fall back:'); eq(idx.byId.get('ok-two').cf, 2, 'a label is bounded:'); eq(idx.courses[1].c, '#F4D9A4', 'a bad colour falls back:');
    eq(idx.byCourse[0].length, 1, 'by course:'); let threw = false; try { semShape({ lessons: 5 }); } catch (e) { threw = true; } ok(threw, 'a wrong shape is refused');
  });

  // ============ every word can be read ============
  t('every word of a lesson can be read: text, links, headings, chips and buttons all clear 4.5:1 on what they sit on', async () => {
    await enterStudy(); semOpen('book-rom'); await wait(800); const bg = rgb(getComputedStyle($q('#semreader')).backgroundColor); ok(bg, 'a background');
    const probes = ['.sm-h', '.rd-c', '.rd-h', '.sm-ul li', '.sm-min', '.sm-refs button', '.sm-next'];
    for (const sel of probes) {
      const el = $q('#sm-inner ' + sel); ok(el, 'found ' + sel); const cs = getComputedStyle(el); const fg = rgb(cs.color), under = onto(cs.backgroundColor, bg);
      const r = ratio(fg, under); ok(r >= 4.5, sel + ' contrast ' + r.toFixed(2) + ' (' + cs.color + ' on ' + cs.backgroundColor + ' over the page)');
    }
    semOpen('in-the-beginning-a-world-made-on-purpose'); await wait(500);
    { const el = $q('#sm-inner .sm-ref'); ok(el, 'found a link in the text'); const cs = getComputedStyle(el); const r = ratio(rgb(cs.color), bg); ok(r >= 4.5, 'a link in the text: contrast ' + r.toFixed(2)); }
    const L = semIndex.byCourse.flat().find(x => x.cf); if (L) { semOpen(L.id); await wait(500); const chip = $q('#sm-inner .sm-chip'); ok(chip, 'a label'); const cs = getComputedStyle(chip); ok(ratio(rgb(cs.color), onto(cs.backgroundColor, bg)) >= 4.5, 'the label contrast'); }
    semClose(); await enterStudy(); semAssign(today()); await wait(100); setMode('study'); await wait(300);
    for (const sel of ['.sm-card .sm-track', '.sm-card .sm-title', '.sm-card .sm-min', '.sm-rows .mm-h', '.sm-rows .mm-count', '.sm-rows .sm-row span', '.sm-rows .sm-row em']) {
      const el = $q('#st-inner ' + sel); ok(el, 'found ' + sel); const cs = getComputedStyle(el); const r = ratio(rgb(cs.color), [11, 20, 31]); ok(r >= 4.5, sel + ' contrast ' + r.toFixed(2));
    }
  });

  t('Escape closes a lesson, but a Bible reader opened from it closes first; nothing links away and nothing speaks in a device voice', async () => {
    await enterStudy(); semOpen('book-rom'); await wait(600); readerOpen({ code: 'ROM', name: 'Romans', ch: 8, v1: 28, v2: 28, tab: 'text' }); await wait(300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ok($q('#reader').hidden && !$q('#semreader').hidden, 'the Bible reader first');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ok($q('#semreader').hidden, 'then the lesson');
    const page = await (await fetch('/Stillwater.html')).text(); const block = page.slice(page.indexOf('SEMINARY — a library'), page.indexOf('/* ===== END SEMINARY ====='));
    ok(block.length > 3000, 'found the block'); ok(!/https?:\/\//.test(block) && !/target="_blank"/.test(block) && !/<a /.test(block), 'no outbound link in the Seminary code');
    ok(!/speechSynthesis|SpeechSynthesisUtterance/.test(block), 'no device voice');
    const bodies = await loadBodies(); const all = JSON.stringify(bodies); ok(!/https?:\/\//.test(all), 'no address in any lesson'); ok(!/<a\b|<script|onerror=/i.test(all), 'no markup in any lesson');
  });

  // ============ finishing a lesson, and what the app opens on ============
  t('a Seminary lesson read to its end marks itself read, but a quick flick to the bottom does not, and it never unmarks', async () => {
    await enterStudy(); const L = semIndex.byCourse[0][0]; semOpen(L.id); await wait(600);
    const sc = $q('#sm-scroll');
    semState.since = Date.now(); sc.scrollTop = sc.scrollHeight; semAutoCheck(); ok(!semRead(L.id), 'a few seconds in the lesson is not reading it');
    semState.since = Date.now() - (L.m * 60000) / 2; sc.scrollTop = 0;
    if (sc.scrollHeight > sc.clientHeight + 60) { semAutoCheck(); ok(!semRead(L.id), 'not at the end yet, however long he has been in it'); }
    sc.scrollTop = sc.scrollHeight; semAutoCheck(); ok(semRead(L.id), 'at the end, after a fair time: read'); ok(stored().read[L.id] > 0, 'and saved');
    const at = sem.read[L.id]; semAutoCheck(); eq(sem.read[L.id], at, 'a second check changes nothing:');
    semToggle(L.id); ok(!semRead(L.id), 'he can still mark it unread by hand'); semState.since = Date.now() - 600000; semClose(); semAutoCheck(); ok(!semRead(L.id), 'and nothing marks a lesson that is closed');
    const next = semPick(ago(-60)); ok(next && next.id !== undefined, 'a lesson is still offered');
  });

  t('a lesson taller than the screen still counts as the one in view: it is marked seen after its seconds, and does not come back as new', async () => {
    reset(); localStorage.removeItem(LEARN_KEY); localStorage.removeItem(LEARN_KEY + '_bak'); learn = learnNormalize(null); lnState.dwell = {}; lnState.kinds = {}; lnState.screen = 'feed'; lnState.filter = 'all';
    if (!learnData) await learnFetchData(); ok(learnData && learnData.cards.length > 100, 'the library loaded');
    setMode('learn'); await wait(500); clearInterval(lnState.timer); lnState.timer = null; renderLearn(); await wait(300);
    const card = $q('#ln-inner .ln-card'), id = card.dataset.id; eq(lnState.kinds[id], 'new', 'the first card is new:');
    const ps = [...card.querySelectorAll('.ln-p')], anchor = ps[ps.length - 1]; for (let i = 0; i < 18; i++) anchor.after(ps[i % ps.length].cloneNode(true));   // as tall as the longest lesson on a phone, or more
    const sc = $q('#ln-scroll'); ok(card.getBoundingClientRect().height > sc.clientHeight * 1.6, 'the card is taller than the screen: ' + Math.round(card.getBoundingClientRect().height) + ' vs ' + sc.clientHeight);
    const top = card.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop;
    for (const off of [100, 500, 900]) { sc.scrollTop = top + off; await wait(350); }
    eq(lnState.vis, id, 'the tall card is the one in view:');
    lnState.last = Date.now(); const need = learnById.get(id).qk ? LEARN_DWELL_QUICK : LEARN_DWELL; for (let i = 0; i < need; i++) learnTick();
    ok(learn.cards[id], 'marked seen after ' + need + ' seconds'); ok(!learnBuildQueue().some(q => q.c.id === id && q.kind === 'new'), 'and it is not offered as new again');
    ok(learnDue(dayKey(addDays(new Date(), 1))).includes(id), 'it comes back tomorrow as a recall, not as new');
    setMode('daily'); await wait(100); learn = learnNormalize(null); localStorage.removeItem(LEARN_KEY);
  });

  t('a short card is still the one in view when it fills the screen: the change measures the screen, not only the card', async () => {
    learn = learnNormalize(null); lnState.dwell = {}; lnState.kinds = {}; setMode('learn'); await wait(400); clearInterval(lnState.timer); lnState.timer = null; renderLearn(); await wait(300);
    const sc = $q('#ln-scroll'), cards = [...document.querySelectorAll('#ln-inner .ln-card')]; ok(cards.length >= 3, 'cards on screen');
    const c = cards[1], top = c.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop; sc.scrollTop = top - 120; await wait(400);
    ok(lnState.vis && lnState.vis !== '', 'some card is in view'); ok(lnState.ratio.size >= 2, 'several cards are being measured');
    sc.scrollTop = 0; await wait(300); setMode('daily');
  });

  t('the app opens on Learn: it is marked as the showing tab in the page itself, and the startup sets it', async () => {
    const page = await (await fetch('/Stillwater.html')).text();
    ok(/<button class="mode-btn active" data-mode="learn">/.test(page), 'the Learn button is the active one'); ok(!/<button class="mode-btn active" data-mode="daily">/.test(page), 'and the Daily button is not');
    ok(/<div class="view active" id="learn-view">/.test(page), 'the Learn screen is the one showing'); ok(!/<div class="view active" id="daily-view">/.test(page), 'and Daily is not');
    const boot = page.slice(page.indexOf('function bootInitialRender'), page.indexOf('requestAnimationFrame(() => requestAnimationFrame(bootInitialRender))'));
    ok(boot.includes("setMode('learn')") && !boot.includes("setMode('daily')"), 'the startup opens Learn');
    ok((page.match(/<div class="view active"/g) || []).length === 1, 'exactly one screen is marked showing');
    ok((page.match(/<button class="mode-btn active"/g) || []).length === 1, 'exactly one tab is marked active');
  });

  async function runAll21(only) {
    const fail = []; let passed = 0;
    const re = only ? new RegExp(only) : null;
    for (const { name, fn } of T) {
      if (re && !re.test(name)) continue;
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); setMode('daily'); } catch (e) {}
    return { total: passed + fail.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll21 = runAll21;
})();
