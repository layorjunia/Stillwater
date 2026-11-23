/* Round 18 — reading inside the app: the Bible text (Berean Standard Bible) and Matthew Henry's commentary.
   Same contract: runAll18(), or runAll18('regex') to run the tests whose names match.

   What this protects: nobody is sent to another site to read; the text on screen is exactly the text in the files and the
   files are the whole Bible and Henry's whole commentary; a verse range shows only its verses; marking read from the
   reader is the same act as marking it on the card; a failed fetch says so and recovers; reading writes nothing; every word
   on the reader can be read (4.5:1).

   Run signed OUT, from http://localhost (the real study/ files are fetched). Needs fake-firestore.js loaded first. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const KEY = STORAGE_KEY;
  const $q = s => document.querySelector(s);
  const tap = sel => { const el = $q(sel); if (!el) throw new Error('nothing to tap: ' + sel); el.click(); };
  const getJson = async (p) => { const r = await fetch('/study/' + p, { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const norm = s => s.replace(/\s+/g, ' ').trim();

  function reset() {
    try { readerClose(); } catch (e) {}
    clearTimeout(studySaveTimer); studySaveTimer = null; studyDirty = false;
    [STUDY_KEY, STUDY_KEY + '_bak', 'stillwater_wal', 'stillwater_wal_checkins', 'stillwater_wal_mind', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [], deleted: {} }));
    state.thoughts = []; state.grievances = []; state.journals = []; state.deleted = {}; state.daily = {}; state.checkins = []; state.mind = [];
    state.current = { thought: null, grievance: null, journal: null, checkin: null };
    study = studyNormalize(null);
    stState.screen = 'home'; stState.jid = null; stState.open = {};
    for (const k of Object.keys(studyMem)) delete studyMem[k];
    for (const k of Object.keys(rdMem)) delete rdMem[k];
    for (const k of Object.keys(rdFlight)) delete rdFlight[k];
    rdPrefetched.clear();
    studyTried.clear(); studyJourneys = null;
    hasLoadedFromCloud = false; currentUser = null;
    localStorage.setItem('stillwater_legacy_prompted_', '1');
    localStorage.setItem('stillwater_legacy_pulled_test@example.invalid', '1');
  }
  async function enterStudy() { reset(); setMode('study'); await wait(900); }
  // every window.open is counted, and none is let through
  function watchOpen() {
    const was = window.open, calls = [];
    window.open = (...a) => { calls.push(a); return null; };
    return { calls, restore: () => { window.open = was; } };
  }
  const readerText = () => norm($q('#rd-inner').textContent);
  const verseNums = () => [...document.querySelectorAll('#rd-inner .rd-text .rd-v sup')].map(x => Number(x.textContent));
  const todayRec = () => study.days[dayKey()];

  // ============ the content: whole, and exactly what the source says ============
  t('the Bible text is whole: 66 books, 1,189 chapters, 31,102 verses, and the verses read as the Berean Standard Bible', async () => {
    const idx = await getJson('index.json');
    eq(idx.books.length, 66, 'books:');
    let chapters = 0, slots = 0, omitted = 0;
    const bible = {};
    for (const b of idx.books) {
      const d = await getJson('bsb/' + b.c + '.json');
      bible[b.c] = d;
      eq(d.length, b.k, b.n + ' chapters:');
      chapters += d.length;
      d.forEach((ch, i) => { ok(ch.length > 0, b.n + ' ' + (i + 1) + ' has verses'); slots += ch.length; omitted += ch.filter(v => !v).length; });
    }
    eq(chapters, 1189, 'chapters:'); eq(slots, 31102, 'verse slots:'); ok(omitted <= 20, 'verses the BSB leaves out: ' + omitted);
    eq(bible.GEN[0][0], 'In the beginning God created the heavens and the earth.', 'Genesis 1:1:');
    eq(bible.JHN[2][15], 'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.', 'John 3:16:');
    eq(bible.PSA[22][0], 'A Psalm of David. The LORD is my shepherd; I shall not want.', 'Psalm 23:1 (the title is part of verse 1):');
    eq(bible.PSA[22].length, 6, 'Psalm 23 verses:');
    eq(bible.PSA[118].length, 176, 'Psalm 119 verses:');
  });

  t('Henry is whole: every chapter has commentary; sections run in order inside their chapter; only <i> and <b> are in his text', async () => {
    const idx = await getJson('index.json');
    let checked = 0, secs = 0;
    for (const b of idx.books) {
      const bible = await getJson('bsb/' + b.c + '.json');
      const sample = new Set([1, b.k, Math.ceil(b.k / 2), 2, 3].filter(n => n >= 1 && n <= b.k));
      for (const ch of sample) {
        const d = await getJson('mh/' + b.c + '/' + ch + '.json'); checked++;
        ok((d.i && d.i.length) || (d.s && d.s.length), b.n + ' ' + ch + ' has commentary');
        const last = bible[ch - 1].length; let prev = 0;
        for (const s of d.s || []) {
          secs++;
          ok(s.v[0] >= 1 && s.v[1] <= last && s.v[0] <= s.v[1], `${b.n} ${ch}: section ${s.v} is inside 1-${last}`);
          ok(s.v[0] >= prev, `${b.n} ${ch}: sections run in order`);
          prev = s.v[0];
          ok(s.p.length > 0, `${b.n} ${ch}: a section has words`);
        }
        const all = (d.i || []).concat(...(d.s || []).map(s => s.p));
        for (const p of all) {
          ok(!/<(?!\/?[ib]>)/.test(p), `${b.n} ${ch}: only <i> and <b>`);
          for (const tag of ['i', 'b']) eq(p.split('<' + tag + '>').length, p.split('</' + tag + '>').length, `${b.n} ${ch}: <${tag}> is balanced`);
        }
      }
    }
    ok(checked > 250 && secs > 800, `enough checked: ${checked} chapters, ${secs} sections`);
  });

  t('a verse Henry comments on alone is one verse, not the rest of the chapter, and the chapters where the source named the wrong chapter are right', async () => {
    const g3 = await getJson('mh/GEN/3.json');
    const one = g3.s.find(s => s.v[0] === 16);
    ok(one && one.v[1] === 16, 'Genesis 3:16 is its own section: ' + JSON.stringify(one && one.v));
    // CCEL tags these as the neighbouring chapter; the chapter heading is right
    for (const [code, ch] of [['2CH', 28], ['2CH', 29]]) {
      const d = await getJson('mh/' + code + '/' + ch + '.json'), bible = await getJson('bsb/' + code + '.json');
      ok(d.s.length >= 2 && d.s[0].v[0] === 1, code + ' ' + ch + ' starts at verse 1');
      ok(d.s.every(s => s.v[1] <= bible[ch - 1].length), code + ' ' + ch + ' stays inside the chapter');
    }
    const l16 = await getJson('mh/LUK/16.json');
    ok(l16.s.some(s => s.v[0] === 19 && s.v[1] === 31), 'Luke 16:19-31 (the rich man and Lazarus) is in Luke 16');
  });

  // ============ the reference reader ============
  t('references are read the way every caller writes them, and refused when they are not a real chapter', () => {
    const p = r => { const x = readerParseRef(r); return x && [x.code, x.ch, x.v1, x.v2].join(','); };
    eq(p('Genesis 1'), 'GEN,1,0,0', 'a chapter:');
    eq(p('1SA 5:1-12'), '1SA,5,1,12', 'a code and a range:');
    eq(p('1 Samuel 5:1-12'), '1SA,5,1,12', 'a name and a range:');
    eq(p('Psalm 23'), 'PSA,23,0,0', 'singular Psalm:');
    eq(p('Psalms 119'), 'PSA,119,0,0', 'plural Psalms:');
    eq(p('Song of Solomon 2:3'), 'SNG,2,3,3', 'a long name and one verse:');
    eq(p('1 John 4:7–8'), '1JN,4,7,8', 'an en dash:');
    eq(p('Genesis 99'), null, 'a chapter that is not there:');
    eq(p('Genesis'), null, 'no chapter:');
    eq(p('Hezekiah 3'), null, 'a book that is not there:');
    eq(p(''), null, 'nothing:');
    for (const b of STUDY_BOOKS) ok(readerParseRef(b[1] + ' ' + b[2]), b[1] + ' ' + b[2] + ' (its last chapter) reads');
  });

  // ============ the reader on a Study card ============
  t('the card opens its passage in the app: the title, its verses in order on the Bible tab, the whole chapter one tap away, and no new window', async () => {
    await enterStudy();
    const w = watchOpen();
    try {
      eq($q('#study-view .st-ref').textContent, 'Genesis 1:1–19', 'the first card:');
      tap('[data-st="lesson:0"]'); await wait(900);
      ok(!$q('#reader').hidden, 'the reader is open');
      eq($q('#rd-title').textContent, 'Genesis 1:1–19', 'its title:');
      tap('#reader [data-rd="tab:text"]'); await wait(200);
      eq($q('#reader [data-rd="tab:text"]').getAttribute('aria-selected'), 'true', 'the Bible tab:');
      const bible = await getJson('bsb/GEN.json'), nums = verseNums();
      eq(nums.join(','), Array.from({ length: 19 }, (_, i) => i + 1).join(','), 'verses shown, in order, none missing:');
      eq(norm($q('#rd-inner .rd-text').textContent), norm(bible[0].slice(0, 19).map((v, i) => (i + 1) + v).join(' ')), 'the words are the file’s, exactly:');
      tap('#rd-inner [data-rd="whole"]'); await wait(100);
      eq(verseNums().length, bible[0].length, 'the whole chapter:');
      eq(w.calls.length, 0, 'windows opened:');
    } finally { w.restore(); readerClose(); }
  });

  t('a chapter with verses the BSB leaves out shows the verses that exist, and nothing in their place', async () => {
    reset(); openPassage('Mark 9'); await wait(900);
    const bible = await getJson('bsb/MRK.json'), want = bible[8].map((v, i) => v ? i + 1 : 0).filter(Boolean);
    eq(verseNums().join(','), want.join(','), 'verses shown:');
    ok(!verseNums().includes(44) && !verseNums().includes(46), 'verses 44 and 46 are not invented');
    readerClose();
  });

  t('Psalm 119, the longest chapter, shows all 176 verses', async () => {
    reset(); openPassage('Psalm 119'); await wait(1000);
    eq(verseNums().length, 176, 'verses:'); eq(verseNums()[175], 176, 'the last:');
    readerClose();
  });

  t('the Commentary tab holds Henry’s whole chapter: an overview, then each section under its verses with those verses quoted', async () => {
    await enterStudy();
    const w = watchOpen();
    try {
      readerOpen({ code: 'GEN', name: 'Genesis', ch: 1, tab: 'comm' }); await wait(1000);
      eq($q('#reader [data-rd="tab:comm"]').getAttribute('aria-selected'), 'true', 'the Commentary tab:');
      const d = await getJson('mh/GEN/1.json'), bible = await getJson('bsb/GEN.json');
      ok($q('#rd-inner .rd-h').textContent === 'Overview', 'it begins with the overview');
      eq(document.querySelectorAll('#rd-inner .rd-sec').length, d.s.length, 'sections:');
      eq(document.querySelectorAll('#rd-inner .rd-c').length, d.i.length + d.s.reduce((n, s) => n + s.p.length, 0), 'paragraphs, none dropped:');
      const first = $q('#rd-inner .rd-sec');
      eq(first.querySelector('.rd-h').textContent, 'Verses ' + d.s[0].v[0] + '–' + d.s[0].v[1], 'the first section’s verses:');
      eq(norm(first.querySelector('.rd-quote').textContent), norm(bible[0].slice(d.s[0].v[0] - 1, d.s[0].v[1]).map((v, i) => (d.s[0].v[0] + i) + v).join(' ')), 'the quoted verses are the Bible’s:');
      ok(readerText().includes('In these verses we have the work of creation in its epitome'), 'Henry’s own words are there');
      eq(w.calls.length, 0, 'windows opened:');
      ok(!$q('#reader a[href]'), 'and there is no link anywhere in the reader');
    } finally { w.restore(); readerClose(); }
  });

  t('each chapter gets its own commentary: opening another chapter of the same book shows that chapter, not the one before', async () => {
    reset(); readerOpen({ code: 'GEN', name: 'Genesis', ch: 1, tab: 'comm' }); await wait(900);
    const one = readerText(); readerClose();
    readerOpen({ code: 'GEN', name: 'Genesis', ch: 12, tab: 'comm' }); await wait(900);
    const twelve = readerText(), d = await getJson('mh/GEN/12.json');
    ok(one !== twelve, 'the two chapters differ');
    eq(document.querySelectorAll('#rd-inner .rd-sec').length, d.s.length, 'Genesis 12’s sections:');
    ok(!twelve.includes('In these verses we have the work of creation'), 'nothing of Genesis 1 is left');
    readerOpen({ code: 'GEN', name: 'Genesis', ch: 1, tab: 'text' }); await wait(300);
    eq(verseNums().length, 31, 'and the Bible text follows the chapter too:');
    readerClose();
  });

  t('the same heading is not repeated on every section of a passage', async () => {
    reset(); readerOpen({ code: 'GEN', name: 'Genesis', ch: 1, tab: 'comm' }); await wait(900);
    const d = await getJson('mh/GEN/1.json');
    const distinct = new Set(); let prev = '', want = 0;
    for (const s of d.s) { if (s.h && s.h !== prev) want++; prev = s.h || prev; }
    eq(document.querySelectorAll('#rd-inner .rd-sh').length, want, 'headings shown:');
    ok(want < d.s.length, 'there are fewer headings than sections here, so the test means something');
    readerClose();
  });

  t('Mark as read in the reader is the same act as on the card: it counts the chapter, shows on the card, and undoes', async () => {
    await enterStudy();
    ok(!studyRead(todayRec(), 0), 'not read to begin with');
    tap('[data-st="lesson:0"]'); await wait(900);
    const btn = $q('#rd-mark');
    ok(!btn.hidden && btn.getAttribute('aria-pressed') === 'false' && $q('#rd-mark-t').textContent === 'Mark as read', 'the button is there, unmarked');
    btn.click(); await wait(50);
    ok(studyRead(todayRec(), 0), 'the chapter is counted');
    eq(btn.getAttribute('aria-pressed'), 'true', 'the button shows it:'); eq($q('#rd-mark-t').textContent, 'Read', 'and says so:');
    ok($q('#study-view [data-st="done:0"]').classList.contains('on'), 'the card behind it shows read');
    eq(studyToday(dayKey()), 1, 'today:');
    btn.click(); await wait(50);
    ok(!studyRead(todayRec(), 0), 'tapping again undoes it'); eq(btn.getAttribute('aria-pressed'), 'false', 'and the button follows:');
    readerClose();
  });

  t('reading alone writes nothing: opening, switching tabs and closing leave the Study data byte-for-byte as it was', async () => {
    await enterStudy(); studyFlush();
    const before = localStorage.getItem(STUDY_KEY), jb = localStorage.getItem(KEY);
    tap('[data-st="lesson:1"]'); await wait(700); tap('#reader [data-rd="tab:comm"]'); await wait(700); tap('#rd-back'); await wait(200);
    studyFlush();
    eq(localStorage.getItem(STUDY_KEY), before, 'Study data:'); eq(localStorage.getItem(KEY), jb, 'the journals, answers and check-ins:');
  });

  // ============ a passage from a journey ============
  t('a journey passage shows only its verses, with the whole chapter one tap away', async () => {
    await enterStudy();
    tap('[data-st="jopen:abraham"]'); await wait(500);
    const j = studyJourneys.find(x => x.id === 'abraham'), ix = j.i.findIndex(x => x.r === 'GEN 12:1-5');
    ok(ix >= 0, 'the journey has Genesis 12:1-5');
    tap('[data-st="jread:abraham:' + ix + '"]'); await wait(900);
    eq($q('#rd-title').textContent, 'Genesis 12:1–5', 'title:');
    eq(verseNums().join(','), '1,2,3,4,5', 'only its verses:');
    const more = $q('#rd-inner [data-rd="whole"]'); ok(more, 'a way to the whole chapter');
    more.click(); await wait(100);
    eq(verseNums().length, (await getJson('bsb/GEN.json'))[11].length, 'the whole chapter:');
    ok(!$q('#rd-inner [data-rd="whole"]'), 'and the button is gone');
    readerClose();
  });

  t('a passage’s commentary is only the sections that touch its verses, and the overview waits for the whole chapter', async () => {
    reset(); readerOpen({ code: 'GEN', name: 'Genesis', ch: 12, v1: 1, v2: 5, tab: 'comm' }); await wait(900);
    const d = await getJson('mh/GEN/12.json');
    const touch = d.s.filter(s => s.v[1] >= 1 && s.v[0] <= 5);
    ok(touch.length > 0 && touch.length < d.s.length, 'the chapter has sections beyond this passage');
    eq(document.querySelectorAll('#rd-inner .rd-sec').length, touch.length, 'sections shown:');
    ok(!readerText().startsWith('Overview'), 'no overview yet');
    tap('#rd-inner [data-rd="whole"]'); await wait(100);
    eq(document.querySelectorAll('#rd-inner .rd-sec').length, d.s.length, 'all the sections now:');
    eq($q('#rd-inner .rd-h').textContent, 'Overview', 'with the overview:');
    readerClose();
  });

  t('marking a journey passage read from the reader ticks it in the journey, and the Study streak is untouched', async () => {
    await enterStudy(); tap('[data-st="jopen:abraham"]'); await wait(500);
    const j = studyJourneys.find(x => x.id === 'abraham'), x = j.i[0];
    tap('[data-st="jread:abraham:0"]'); await wait(800);
    ok(!$q('#rd-mark').hidden, 'the reader offers it');
    tap('#rd-mark'); await wait(60);
    ok(((study.topics.abraham || {})[x.r] || 0) > 0, 'the passage is ticked');
    ok($q('#study-view .st-jp .st-check').classList.contains('on'), 'and shows in the journey behind');
    eq(studyToday(dayKey()), 0, 'but today’s three chapters are not touched:');
    readerClose();
  });

  // ============ the old Daily chapter, and never leaving the app ============
  t('the Daily tab’s own Read button opens the reader too, and says Read, not NKJV', async () => {
    reset(); const w = watchOpen();
    try {
      eq($q('#sc-open').textContent, 'Read', 'the button:');
      openPassage('Psalms 71'); await wait(900);
      eq($q('#rd-title').textContent, 'Psalms 71', 'title:'); ok(verseNums().length > 10, 'verses shown');
      ok($q('#rd-mark').hidden, 'no mark button here: the Daily tab has its own');
      eq(w.calls.length, 0, 'windows opened:');
    } finally { w.restore(); readerClose(); }
  });

  t('no code path sends the reader to another site: the page has no Bible Gateway or CCEL address and no window.open', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const w of ['biblegateway', 'ccel.org', 'window.open', 'passageUrl', 'studyCommUrl', 'studyOpenUrl', 'NKJV']) ok(code.indexOf(w) < 0, 'the page still has "' + w + '"');
    const a = src.indexOf('/* ===== STUDY ====='), b = src.indexOf('/* ===== END STUDY =====');
    eq((src.slice(a, b).match(/\bfetch\(/g) || []).length, 1, 'the Study block still fetches in one place only:');
  });

  // ============ closing, focus, layering ============
  t('the back button and Escape close the reader and give focus back to what opened it', async () => {
    await enterStudy();
    const opener = $q('[data-st="lesson:0"]'); opener.focus(); opener.click(); await wait(300);
    ok(!$q('#reader').hidden, 'open');
    eq(document.activeElement && document.activeElement.id, 'rd-back', 'focus moves into the reader:');
    tap('#rd-back'); ok($q('#reader').hidden, 'the back button closes it'); eq(document.activeElement, opener, 'focus returns:');
    opener.click(); await wait(300);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok($q('#reader').hidden, 'Escape closes it'); eq(document.activeElement, opener, 'focus returns:');
    ok(!rdState.open && rdState.mark === null, 'and nothing is left holding the card');
  });

  t('the reader covers the whole screen, tab bar included, and sits under the toast and the sign-in screen', async () => {
    await enterStudy(); tap('[data-st="lesson:0"]'); await wait(700);
    const r = $q('#reader').getBoundingClientRect();
    ok(Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1, 'it fills the window');
    const bottom = document.elementFromPoint(innerWidth / 2, innerHeight - 6);
    ok(bottom && $q('#reader').contains(bottom), 'nothing of the tab bar shows through at the bottom');
    const z = Number(getComputedStyle($q('#reader')).zIndex), zt = Number(getComputedStyle($q('#toast')).zIndex), za = Number(getComputedStyle($q('#auth-overlay')).zIndex);
    ok(z < zt && z < za, `reader ${z}, toast ${zt}, sign-in ${za}`);
    ok(z > Number(getComputedStyle($q('#cal-sheet')).zIndex), 'and above the calendar');
    readerClose();
  });

  // ============ it fails kindly, and recovers ============
  t('with no connection the reader says so, offers no outside link, and works once the connection is back', async () => {
    reset();
    const was = window.fetch; await caches.delete(STUDY_CACHE);
    window.fetch = () => Promise.reject(new Error('offline'));
    try {
      readerOpen({ code: 'OBA', name: 'Obadiah', ch: 1, tab: 'text' }); await wait(500);
      ok(/needs a connection the first time/.test(readerText()), 'it says so: ' + readerText().slice(0, 80));
      ok($q('#rd-inner [data-rd="retry"]'), 'with a way to try again'); ok(!$q('#reader a[href]'), 'and no link away');
      eq(verseNums().length, 0, 'and no half-drawn text');
      window.fetch = was;
      tap('#rd-inner [data-rd="retry"]'); await wait(900);
      eq(verseNums().length, 21, 'Obadiah’s 21 verses after trying again:');
      ok(!/needs a connection/.test(readerText()), 'and the message is gone');
    } finally { window.fetch = was; readerClose(); await caches.delete(STUDY_CACHE); }
  });

  t('a failed fetch is not remembered for the next time the reader opens', async () => {
    reset(); const was = window.fetch; await caches.delete(STUDY_CACHE);
    try {
      window.fetch = () => Promise.reject(new Error('offline'));
      readerOpen({ code: 'JON', name: 'Jonah', ch: 2, tab: 'text' }); await wait(400); readerClose();
      window.fetch = was;
      readerOpen({ code: 'JON', name: 'Jonah', ch: 2, tab: 'text' }); await wait(900);
      eq(verseNums().length, 10, 'Jonah 2 opens normally the second time:');
    } finally { window.fetch = was; readerClose(); await caches.delete(STUDY_CACHE); }
  });

  t('a slow open that is overtaken does not draw over the chapter opened after it', async () => {
    reset(); const was = window.fetch; await caches.delete(STUDY_CACHE);
    window.fetch = (u, o) => /OBA/.test(String(u)) ? new Promise(res => setTimeout(() => res(was(u, o)), 600)) : was(u, o);
    try {
      readerOpen({ code: 'OBA', name: 'Obadiah', ch: 1, tab: 'text' }); await wait(50);
      readerOpen({ code: 'JON', name: 'Jonah', ch: 1, tab: 'text' }); await wait(1300);
      const jon = (await getJson('bsb/JON.json'))[0].length;
      eq($q('#rd-title').textContent, 'Jonah 1', 'the title:'); eq(verseNums().length, jon, 'Jonah 1’s ' + jon + ' verses, not Obadiah’s 21:');
    } finally { window.fetch = was; readerClose(); await caches.delete(STUDY_CACHE); }
  });

  // ============ nothing in Henry's text can run ============
  t('markup in the commentary cannot run: only <i> and <b> come through, everything else is shown as plain text', () => {
    const h = rdRich('Plain <i>said</i> and <b>bold</b> <img src=x onerror=alert(1)> <script>alert(1)</script> <u>no</u> &amp; "q"');
    const box = document.createElement('div'); box.innerHTML = h;
    eq(box.querySelectorAll('img,script,u').length, 0, 'elements that came through:');
    eq(box.querySelectorAll('i').length, 1, '<i>:'); eq(box.querySelectorAll('b').length, 1, '<b>:');
    ok(box.textContent.includes('<img src=x onerror=alert(1)>') && box.textContent.includes('<script>'), 'the rest is visible as text');
  });

  t('a commentary paragraph that is not text cannot break the reader', async () => {
    reset(); const was = window.fetch; await caches.delete(STUDY_CACHE);
    window.fetch = (u, o) => /mh\/OBA\/1/.test(String(u))
      ? Promise.resolve(new Response(JSON.stringify({ i: ['ok <i>x</i> <img src=x onerror=window.__pwn=1>'], s: [{ v: [1, 3], p: ['<script>window.__pwn=1</script>fine'] }] })))
      : was(u, o);
    try {
      readerOpen({ code: 'OBA', name: 'Obadiah', ch: 1, tab: 'comm' }); await wait(900);
      eq(window.__pwn, undefined, 'script that ran:'); ok(readerText().includes('fine'), 'the text still shows');
    } finally { window.fetch = was; readerClose(); await caches.delete(STUDY_CACHE); delete window.__pwn; }
  });

  // ============ readable ============
  const rgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  function audit(root, base) {
    const bad = []; let checked = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue;
      const fg = rgba(cs.color); if (!fg) continue;
      const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
      for (const e of chain) { const o = Number(getComputedStyle(e).opacity); if (o < 1) fg.a *= o; }
      if (fg.a <= 0.05) continue;
      let cands = [base];
      for (const e of chain) {
        const st = getComputedStyle(e), c = rgba(st.backgroundColor);
        if (c && c.a > 0) cands = cands.map(x => over(c, x));
        const stops = (st.backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(rgba).filter(Boolean);
        if (stops.length) cands = stops.flatMap(sg => cands.map(x => over(sg, x)));
      }
      const r = Math.min(...cands.map(b => ratio(over(fg, b), b))); checked++;
      if (r < 4.5) bad.push(`${n.nodeValue.trim().slice(0, 26)} → ${r.toFixed(2)}`);
    }
    return { bad, checked };
  }
  t('every word on the reader passes the 4.5:1 bar: the lesson, both other tabs, the buttons, a passage, and the failure message', async () => {
    await enterStudy();
    const fails = []; let total = 0;
    const run = (label) => { const r = audit($q('#reader'), { r: 6, g: 9, b: 14, a: 1 }); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    tap('[data-st="lesson:0"]'); await wait(1000); run('lesson');
    tap('#reader [data-rd="tab:text"]'); await wait(200); run('bible');
    tap('#reader [data-rd="tab:comm"]'); await wait(300); run('commentary');
    $q('#rd-scroll').scrollTop = 1200; await wait(100); run('commentary, further down');
    readerClose();
    readerOpen({ code: 'GEN', name: 'Genesis', ch: 12, v1: 1, v2: 5, tab: 'text', mark: { on: () => true, toggle: () => {} } }); await wait(900); run('a passage, marked');
    readerClose();
    const was = window.fetch; await caches.delete(STUDY_CACHE); window.fetch = () => Promise.reject(new Error('offline'));
    try { readerOpen({ code: 'NAM', name: 'Nahum', ch: 1, tab: 'text' }); await wait(500); run('offline'); } finally { window.fetch = was; readerClose(); await caches.delete(STUDY_CACHE); }
    ok(total > 120, 'enough text checked: ' + total);
    eq(fails.join(' | '), '', `text under 4.5:1 (${total} checked):`);
  });

  t('the verse numbers are small but still readable: gold on the page, at least 7:1', async () => {
    reset(); openPassage('Genesis 1'); await wait(900);
    const sup = $q('#rd-inner .rd-v sup'), fg = rgba(getComputedStyle(sup).color), bg = rgba(getComputedStyle($q('#reader')).backgroundColor);
    ok(ratio(over(fg, bg), bg) >= 7, 'the ratio is ' + ratio(over(fg, bg), bg).toFixed(2));
    readerClose();
  });

  async function runAll18(only) {
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
  window.runAll18 = runAll18;
})();
