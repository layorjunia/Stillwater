/* Round 19 — the lessons: three a day, about four minutes each, about twelve minutes in all.
   Same contract: runAll19(), or runAll19('regex') to run the tests whose names match.

   What this protects: every verse of the Bible is in exactly one lesson, in order; every lesson's passage, excerpt and minutes
   agree with their sources (checked against the Bible text and Henry's files, not against the builder); no lesson is long; the
   day is about twelve minutes; the plan does not move once he is using it; what is on screen is what is in the files; the
   conversion of old chapter-based Study data keeps everything he wrote and read.

   Run signed OUT, from http://localhost. Needs fake-firestore.js loaded first. */
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
  const words = s => s.split(/\s+/).filter(Boolean).length;

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
  async function enterStudy() { reset(); setMode('study'); await wait(1100); }
  const rdText = () => norm($q('#rd-inner').textContent);
  const verseNums = () => [...document.querySelectorAll('#rd-inner .rd-text .rd-v sup')].map(x => Number(x.textContent));

  // all the lesson files, fetched once and shared by the tests below
  let LES = null, BIBLE = null;
  async function loadAll() {
    if (LES) return;
    const idx = (await getJson('index.json')).books;
    LES = {}; BIBLE = {};
    for (const b of idx) {
      BIBLE[b.c] = await getJson('bsb/' + b.c + '.json');
      const jobs = Array.from({ length: b.k }, (_, i) => i + 1);
      for (let i = 0; i < jobs.length; i += 40) {
        await Promise.all(jobs.slice(i, i + 40).map(async ch => { LES[b.c + ':' + ch] = await getJson('les/' + b.c + '/' + ch + '.json'); }));
      }
    }
  }

  // ============ the plan covers the Bible once ============
  t('every verse of the Bible is in exactly one lesson, in order, and no lesson crosses a chapter', async () => {
    await loadAll();
    let chapters = 0, passages = 0;
    for (const b of STUDY_BOOKS) {
      const specs = STUDY_SPLITS[b[0]].split('|');
      eq(specs.length, b[2], b[1] + ' chapters in the plan:');
      specs.forEach((spec, i) => {
        const [vc, rest] = spec.split(':'), starts = [1].concat(rest ? rest.split(',').map(Number) : []);
        eq(Number(vc), BIBLE[b[0]][i].length, `${b[1]} ${i + 1}: verses in the plan and in the Bible text:`);
        ok(starts.every((v, k) => k === 0 || (v > starts[k - 1] && v <= Number(vc))), `${b[1]} ${i + 1}: passage starts rise and stay inside the chapter: ${starts}`);
        chapters++; passages += starts.length;
      });
    }
    eq(chapters, 1189, 'chapters:');
    eq(passages, 2596, 'lessons in the Bible:');
    const walk = (list) => { let prev = null; for (const x of list) { const k = x.code + ':' + x.ch; if (prev && prev.k === k) eq(x.v1, prev.v2 + 1, k + ' runs on from the lesson before:'); else eq(x.v1, 1, k + ' starts at verse 1:'); prev = { k, v2: x.v2 }; } };
    [STUDY_OT, STUDY_NT].forEach(walk);
    eq(STUDY_OT.length + STUDY_NT.length, 2596, 'the Old and New Testament lists together are the whole Bible:');
  });

  t('every lesson file agrees with the plan: its passages, its Bible words, its excerpt words and its minutes', async () => {
    await loadAll();
    let checked = 0;
    for (const list of [STUDY_OT, STUDY_NT]) {
      const seen = new Set();
      for (const it of list) {
        const k = it.code + ':' + it.ch + ':' + it.v1;
        if (seen.has(k)) continue; seen.add(k);
        const les = LES[it.code + ':' + it.ch], P = les.find(x => x.v[0] === it.v1);
        ok(P, k + ' has a lesson entry');
        eq(P.v[1], it.v2, k + ' last verse:');
        eq(P.m, it.m, k + ' minutes in the page and in the lesson file:');
        const bw = BIBLE[it.code][it.ch - 1].slice(it.v1 - 1, it.v2).reduce((n, v) => n + words(v), 0);
        eq(P.w, bw, k + ' Bible words:');
        eq(P.hw, P.x.reduce((n, b) => n + b.p.reduce((m, p) => m + words(p), 0), 0), k + ' excerpt words:');
        eq(P.m, Math.max(2, Math.ceil((P.w + P.hw + 60) / 180)), k + ' minutes:');
        checked++;
      }
    }
    ok(checked >= 2596, 'lessons checked: ' + checked);
    for (const [k, les] of Object.entries(LES)) {            // and each chapter's entries cover it once
      const flat = les.flatMap(P => Array.from({ length: P.v[1] - P.v[0] + 1 }, (_, i) => P.v[0] + i));
      const [code, ch] = k.split(':');
      eq(flat.join(','), BIBLE[code][Number(ch) - 1].map((_, i) => i + 1).join(','), k + ' verses covered once:');
    }
  });

  // ============ the time ============
  t('every lesson is short: 2 to 6 minutes, a passage under 520 words, Henry’s excerpt under 660', async () => {
    await loadAll();
    const ms = [], bad = [];
    for (const [k, les] of Object.entries(LES)) for (const P of les) {
      ms.push(P.m);
      if (P.m < 2 || P.m > 6 || P.w > 520 || P.hw > 660) bad.push(k + ' ' + P.v + ' ' + P.m + 'min ' + P.w + '+' + P.hw);
    }
    eq(bad.slice(0, 5).join(' | '), '', 'lessons outside the bounds (' + bad.length + '):');
    ms.sort((a, b) => a - b);
    ok(ms[Math.floor(ms.length / 2)] >= 3 && ms[Math.floor(ms.length / 2)] <= 5, 'the median lesson is 3 to 5 minutes: ' + ms[Math.floor(ms.length / 2)]);
  });

  t('read every day, the whole Bible is 1,134 days: one New Testament lesson and one or two Old Testament ones a day, none repeated, 9 to 14 minutes, the New Testament drops out after 602 days', async () => {
    reset(); const was = studySaveNow; studySaveNow = () => {};
    try {
      const seen = new Set(), mins = [], counts = [];
      let day = keyToDate('2026-01-01'), ntDays = 0, k;
      for (let n = 0; n < 1200; n++) {
        k = dayKey(day);
        const r = studyAssign(k), slots = studySlots(r);
        if (!slots.length) break;
        const items = slots.map(i => studyItem(r, i)), nt = items.filter(x => x.kind === 'New Testament').length;
        for (const it of items) { ok(!seen.has(it.id), 'repeated: ' + it.ref + ' on day ' + (n + 1)); seen.add(it.id); }
        if (nt) { ntDays++; eq(nt, 1, 'day ' + (n + 1) + ' New Testament lessons:'); }
        else ok(items.length === 2 || n === 1133, 'after the New Testament a day is two Old Testament lessons: day ' + (n + 1) + ' has ' + items.length);
        mins.push(items.reduce((a, x) => a + x.m, 0)); counts.push(items.length);
        r.r = r.a.map(x => x ? 1 : 0);
        day = addDays(day, 1);
      }
      eq(seen.size, 2596, 'every lesson of the Bible was offered, once:');
      eq(mins.length, 1134, 'days to read it all:'); eq(ntDays, 602, 'days with a New Testament lesson:');
      mins.sort((a, b) => a - b);
      ok(mins[mins.length - 1] <= 15, 'the longest day: ' + mins[mins.length - 1]); ok(mins[0] >= 2, 'the shortest: ' + mins[0]);
      ok(mins[Math.floor(mins.length / 2)] >= 9 && mins[Math.floor(mins.length / 2)] <= 11, 'the middle day: ' + mins[Math.floor(mins.length / 2)]);
      const twos = counts.filter(c => c === 2).length;
      ok(twos > 700 && twos < 900, 'days of two lessons (not always three): ' + twos);
      eq(studySlots(studyAssign(dayKey(day))).length, 0, 'and then there is nothing left to offer, not a repeat:');
    } finally { studySaveNow = was; }
  });

  // ============ the excerpt is Henry's own ============
  t('every excerpt is Henry’s own words: each paragraph is found in his commentary on that chapter, nothing is made up', async () => {
    await loadAll();
    let checked = 0;
    const codes = Object.keys(BIBLE);
    for (const code of codes) {
      const n = BIBLE[code].length;
      for (const ch of new Set([1, Math.ceil(n / 2), n].filter(c => c >= 1 && c <= n))) {
        const mh = await getJson('mh/' + code + '/' + ch + '.json');
        const full = norm([...(mh.i || []), ...(mh.s || []).flatMap(s => s.p)].join(' '));
        for (const P of LES[code + ':' + ch]) for (const b of P.x) for (const p of b.p) {
          const body = norm(p.replace(/\s?…$/, ''));
          const probe = P.x.length > 5 || b.p.length === 1 && /… /.test(body) ? body.slice(0, 40) : body;     // gist paragraphs join first sentences
          ok(full.includes(probe) || full.includes(body.slice(0, 60)), `${code} ${ch} ${P.v}: not Henry: ${body.slice(0, 70)}`);
          checked++;
        }
      }
    }
    ok(checked > 400, 'paragraphs checked: ' + checked);
  });

  t('no excerpt is cut at a list number or ends on a lead-in to a list: no "observe, 1. …", no "Here, I. …", and no block ends on "observe," or "four things:—"', async () => {
    await loadAll();
    const bad = [];
    for (const [k, les] of Object.entries(LES)) for (const P of les) for (const b of P.x) {
      for (const p of b.p) if (/(?:^|[\s:;,—(])(?:\d{1,2}|[IVX]{1,4})\.\s*…$/.test(p) && !/\b(?:vv?|ver|vers|ch)\.(?:<\/i>)?\s*\d+\.\s*…$/.test(p)) bad.push(k + ' cut at a list number: ' + p.slice(-40));
      const last = b.p[b.p.length - 1].replace(/\s?…$/, '');
      if (/[,;:—-]\s*$/.test(last)) bad.push(k + ' ends on a lead-in: ' + last.slice(-40));      // (a lead-in in the MIDDLE is fine: its list follows)
    }
    eq(bad.slice(0, 4).join(' | '), '', 'bad cuts (' + bad.length + '):');
  });

  t('a section Henry spreads over two lessons is not shown twice: consecutive lessons never repeat a paragraph', async () => {
    await loadAll();
    const dup = [];
    for (const [k, les] of Object.entries(LES)) for (let i = 1; i < les.length; i++) {
      const prev = new Set(les[i - 1].x.flatMap(b => b.p));
      for (const b of les[i].x) for (const p of b.p) if (prev.has(p) && words(p) > 8) dup.push(k + ' ' + les[i].v);
    }
    eq(dup.slice(0, 4).join(' | '), '', 'repeated across lessons (' + dup.length + '):');
  });

  // ============ the plan does not move ============
  t('the plan is pinned: both lists and the first days, so a rebuild or an edit cannot move where anyone is', () => {
    const sum = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); };
    eq(sum(STUDY_OT.map(x => x.id).join('|')) + ' ' + sum(STUDY_NT.map(x => x.id).join('|')), PIN, 'checksums of every lesson name in the Old and the New Testament list:');
    eq(STUDY_DAY_MIN + ',' + STUDY_SLOTS, '9,3', 'the day’s nine minutes and three lessons:');
    reset(); const was = studySaveNow; studySaveNow = () => {};
    try {
      const out = [];
      for (const d of daysFrom('2026-11-22', 6)) { const r = studyAssign(d); out.push(refsOf(d)); r.r = r.a.map(x => x ? 1 : 0); }
      eq(out.join(' // '), 'Genesis 1:1–19 | Genesis 1:20–31 | Matthew 1:1–17 // Genesis 2:1–17 | Genesis 2:18–25 | Matthew 1:18–25 // ' +
        'Genesis 3:1–13 | Matthew 2:1–15 // Genesis 3:14–24 | Matthew 2:16–23 // Genesis 4:1–15 | Genesis 4:16–26 | Matthew 3 // ' +
        'Genesis 5:1–24 | Matthew 4:1–17', 'the first six days:');
    } finally { studySaveNow = was; }
  });
  const PIN = '93e00a4d 3d89ff75';
  const refsOf = (d) => { const r = studyAssign(d); return studySlots(r).map(i => studyItem(r, i).ref).join(' | '); };
  const daysFrom = (start, n) => Array.from({ length: n }, (_, i) => dayKey(addDays(keyToDate(start), i)));

  // ============ the Lesson on screen ============
  t('the Lesson tab is the passage’s verses, Henry’s excerpt, the story’s question and prayer, exactly as in the files, with the time', async () => {
    await enterStudy();
    const it = studyItem(todayRecNow(), 0), P = (await getJson('les/GEN/1.json')).find(x => x.v[0] === it.v1), d = (await getJson('GEN.json'))['1'];
    tap('[data-st="lesson:0"]'); await wait(1100);
    eq($q('#reader [data-rd="tab:lesson"]').getAttribute('aria-selected'), 'true', 'the Lesson tab is selected:');
    eq($q('#rd-inner .rd-h').textContent, 'Read · ' + P.m + ' min in all', 'the time:');
    const bible = await getJson('bsb/GEN.json');
    eq(verseNums().join(','), Array.from({ length: P.v[1] - P.v[0] + 1 }, (_, i) => P.v[0] + i).join(','), 'the verses of this passage only:');
    eq(norm($q('#rd-inner .rd-text').textContent), norm(bible[0].slice(P.v[0] - 1, P.v[1]).map((v, i) => (P.v[0] + i) + v).join(' ')), 'the Bible words:');
    const shown = [...document.querySelectorAll('#rd-inner .rd-c')].map(x => x.textContent);
    const want = P.x.flatMap(b => b.p).concat(d.p ? [d.p] : []);
    eq(shown.length, want.length, 'Henry’s paragraphs and the prayer, none dropped or added:');
    eq(shown.map(x => norm(x)).join(' || '), want.map(x => norm(x.replace(/<\/?[ib]>/g, ''))).join(' || '), 'every paragraph, word for word:');
    eq(norm(shown[0]), norm(P.x[0].p[0].replace(/<\/?[ib]>/g, '')), 'Henry’s first words:');
    const qs = [...document.querySelectorAll('#rd-inner .rd-q li')].map(x => x.textContent);
    eq(qs.join(' | '), d.q[0] + ' | ' + STUDY_GENERIC[2], 'the questions:');
    ok(rdText().includes(norm(d.p)), 'the prayer');
    readerClose();
  });
  const todayRecNow = () => study.days[dayKey()];

  t('a lesson that is not a chapter’s first has no prayer, and its question is a rotating one, not the story’s', async () => {
    reset();
    const it = STUDY_OT[1];                        // Genesis 1:20–31
    eq(it.n, 1, 'the second passage of Genesis 1');
    readerOpen({ code: it.code, name: it.name, ch: it.ch, v1: it.v1, v2: it.v2, tab: 'lesson', lesson: it }); await wait(1100);
    eq($q('#rd-title').textContent, 'Genesis 1:20–31', 'title:');
    ok(!$q('#rd-inner').textContent.includes('Pray'), 'no prayer heading');
    const qs = [...document.querySelectorAll('#rd-inner .rd-q li')].map(x => x.textContent);
    eq(qs.join(' | '), STUDY_GENERIC[1] + ' | ' + STUDY_GENERIC[2], 'questions:');
    const P = (await getJson('les/GEN/1.json'))[1];
    const strip = (x) => norm(x.replace(/<\/?[ib]>/g, ''));
    eq([...document.querySelectorAll('#rd-inner .rd-c')].map(x => norm(x.textContent)).join(' || '), P.x.flatMap(b => b.p).map(strip).join(' || '), 'Henry’s paragraphs are this passage’s own, word for word, not the first one’s:');
    const first = (await getJson('les/GEN/1.json'))[0];
    ok(P.x.flatMap(b => b.p).join() !== first.x.flatMap(b => b.p).join(), 'and the two passages really do differ, so this test can tell them apart');
    readerClose();
  });

  t('"All of Henry on these verses" goes to the Commentary tab, limited to this passage, with no chapter overview', async () => {
    await enterStudy();
    tap('[data-st="lesson:0"]'); await wait(1100);
    tap('#rd-inner [data-rd="tab:comm"]'); await wait(900);
    eq($q('#reader [data-rd="tab:comm"]').getAttribute('aria-selected'), 'true', 'the Commentary tab:');
    const d = await getJson('mh/GEN/1.json'), it = STUDY_OT[0];
    const touch = d.s.filter(s => s.v[1] >= it.v1 && s.v[0] <= it.v2);
    eq(document.querySelectorAll('#rd-inner .rd-sec').length, touch.length, 'only the sections that touch Genesis 1:1–19:');
    ok(!$q('#rd-inner').textContent.startsWith('Overview'), 'no overview');
    ok($q('#rd-inner [data-rd="whole"]'), 'and a way to the whole chapter');
    readerClose();
  });

  t('opening the Study tab fetches the Bible book and the lessons only, never Henry’s whole chapter, until it is asked for', async () => {
    reset(); try { await caches.delete(STUDY_CACHE); } catch (e) {}
    const was = window.fetch, urls = [];
    window.fetch = (u, o) => { urls.push(String(u)); return was(u, o); };
    try {
      setMode('study'); await wait(1500);
      ok(urls.some(u => /\/study\/bsb\/GEN\.json/.test(u)) && urls.some(u => /\/study\/les\/GEN\/1\.json/.test(u)), 'it fetched Genesis and its lessons: ' + urls.length);
      eq(urls.filter(u => /\/study\/mh\//.test(u)).length, 0, 'Henry’s whole chapters fetched in the background:');
      tap('[data-st="lesson:0"]'); await wait(900);
      eq(urls.filter(u => /\/study\/mh\//.test(u)).length, 0, 'nor by opening the lesson:');
      tap('#rd-inner [data-rd="tab:comm"]'); await wait(900);
      eq(urls.filter(u => /\/study\/mh\/GEN\/1\.json/.test(u)).length, 1, 'only when “All of Henry” is asked for:');
    } finally { window.fetch = was; readerClose(); try { await caches.delete(STUDY_CACHE); } catch (e) {} }
  });

  t('if only the lessons cannot be fetched (the Bible text can) the lesson says so, offers Try again, and works once the lessons come back', async () => {
    reset(); try { await caches.delete(STUDY_CACHE); } catch (e) {}
    const was = window.fetch;
    window.fetch = (u, o) => /\/study\/les\//.test(String(u)) ? Promise.reject(new Error('offline')) : was(u, o);
    try {
      const it = STUDY_OT[0];
      readerOpen({ code: it.code, name: it.name, ch: it.ch, v1: it.v1, v2: it.v2, tab: 'lesson', lesson: it }); await wait(1200);
      ok(/The lesson needs a connection the first time/.test(rdText()), 'it says so: ' + rdText().slice(0, 80));
      ok($q('#rd-inner [data-rd="retry"]'), 'with a way to try again');
      ok(!$q('#rd-inner .rd-text'), 'and no half-drawn lesson');
      window.fetch = was;
      tap('#rd-inner [data-rd="retry"]'); await wait(1200);
      ok($q('#rd-inner .rd-q') && verseNums().length === 19, 'after trying again the whole lesson is there');
    } finally { window.fetch = was; readerClose(); try { await caches.delete(STUDY_CACHE); } catch (e) {} }
  });

  t('the whole day’s reading on screen is short: the three lessons’ text, headings included, is under 3,000 words', async () => {
    await enterStudy();
    let total = 0;
    for (const id of [0, 1, 2]) {
      tap('[data-st="lesson:' + id + '"]'); await wait(1100);
      total += words($q('#rd-inner').textContent); readerClose();
    }
    ok(total < 3000 && total > 900, 'words in the three lessons: ' + total);
  });

  t('a lesson can be marked read from its tab and the card, the ring and the streak all follow', async () => {
    await enterStudy();
    tap('[data-st="lesson:2"]'); await wait(900);
    tap('#rd-mark'); await wait(50);
    ok(studyRead(todayRecNow(), 2), 'the lesson is counted');
    ok($q('#study-view .st-card[data-t="2"]').classList.contains('done'), 'its card shows it');
    readerClose();
    [0, 1].forEach(x => tap('[data-st="done:' + x + '"]'));
    ok(studyDayDone(dayKey()) && studyStreaks().current === 1, 'all of the day’s lessons make a day and a streak of 1');
    const pay = (window.__stillwaterWidget || {});
    eq(pay.studyToday, 3, 'the widget is told 3 of 3:');
  });

  async function runAll19(only) {
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
  window.runAll19 = runAll19;
})();
