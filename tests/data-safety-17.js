/* Round 17 — the Study tab, the daily chapter's move, the words on the check-in numbers, the darker theme.
   Same contract: runAll17(), or runAll17('regex') to run the tests whose names match.

   What this protects: nothing finished is re-judged when the chapter leaves the Daily tab (checked against the real
   days from a phone backup when one is served); Study keeps its own storage and cannot touch journals, answers or
   check-ins; a missed day never skips a chapter; every word on the new screens can be read.

   Run signed OUT. Needs fake-firestore.js loaded first. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const KEY = STORAGE_KEY;
  const clone = v => JSON.parse(JSON.stringify(v));
  const tap = sel => { const el = document.querySelector(sel); if (!el) throw new Error('nothing to tap: ' + sel); el.click(); };
  const opt = (k, v) => CHECKIN.find(c => c.k === k).opts.find(o => o.v === v);

  function reset() {
    clearTimeout(studySaveTimer); studySaveTimer = null; studyDirty = false;
    [STUDY_KEY, STUDY_KEY + '_bak', 'stillwater_wal', 'stillwater_wal_checkins', 'stillwater_wal_mind', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [], deleted: {} }));
    state.thoughts = []; state.grievances = []; state.journals = []; state.deleted = {}; state.daily = {}; state.checkins = []; state.mind = [];
    state.current = { thought: null, grievance: null, journal: null, checkin: null };
    study = studyNormalize(null);
    stState.screen = 'home'; stState.jid = null; stState.open = {};
    for (const k of Object.keys(studyMem)) delete studyMem[k];
    studyTried.clear(); studyJourneys = null;
    hasLoadedFromCloud = false; currentUser = null;
    localStorage.setItem('stillwater_legacy_prompted_', '1');
    localStorage.setItem('stillwater_legacy_pulled_test@example.invalid', '1');
  }
  const daysFrom = (start, n) => Array.from({ length: n }, (_, i) => dayKey(addDays(keyToDate(start), i)));
  const readAll = (d) => { const r = studyAssign(d); STUDY_TRACKS.forEach(x => { r.r[x.id] = Date.now(); }); };
  const refsOf = (d) => { const r = studyAssign(d); return STUDY_TRACKS.map(x => studyItem(x, r).ref).join(' | '); };
  const stored = () => JSON.parse(localStorage.getItem(STUDY_KEY) || 'null');
  const dayRec = (k, over) => Object.assign({ d: k, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 }, over || {});
  function fullDay(d, withReading) {
    const e = dayRec(d, { sc: { done: !!withReading, note: '' } });
    requiredCheckinsFor(d).forEach(c => { e.ci[c.k] = c.type === 'scale' ? 4 : 'answer for ' + c.k; });
    for (let i = 0; i < depthsPerDay(d); i++) e.dp.push({ id: 'q' + i, q: 'Question ' + i, theme: 'self', a: 'answer ' + i });
    if (reframeApplies(d)) e.rf = { bother: 'a bother', opposite: 'an opposite' };
    return e;
  }

  // ============ the words on the check-in numbers ============
  t('the check-in words sit on their numbers: mentally 4 Clear and 5 Sharp; spiritual 1 Distant, 2 Adrift, 4 Held, 5 Rooted; progress 1 Slipping, 2 Stuck, 4 Forward, 5 Gaining', () => {
    const words = k => CHECKIN.find(c => c.k === k).opts.map(o => o.v + '=' + o.lbl).join(' ');
    eq(words('mental'), '1=Foggy 2=Scattered 3=Okay 4=Clear 5=Sharp', 'mental:');
    eq(words('spiritual'), '1=Distant 2=Adrift 3=Present 4=Held 5=Rooted', 'spiritual:');
    eq(words('progress'), '1=Slipping 2=Stuck 3=Holding 4=Forward 5=Gaining', 'progress:');
    eq(words('emotional'), '1=Heavy 2=Low 3=Even 4=Warm 5=Bright', 'emotional is untouched:');
    eq(words('physical'), '1=Depleted 2=Tired 3=Steady 4=Rested 5=Strong', 'physical is untouched:');
  });

  t('answers already given stay on their number: nothing is moved, only the word on the number reads differently', () => {
    reset();
    const e = dayRec('2026-10-02', { ci: { mental: 4, spiritual: 2, progress: 5, emotional: 3 } });
    state.daily['2026-10-02'] = e; persist();
    state.daily = {}; loadState();
    const got = state.daily['2026-10-02'].ci;
    eq(got.mental + ',' + got.spiritual + ',' + got.progress + ',' + got.emotional, '4,2,5,3', 'the stored numbers:');
    const text = (() => { openCalendar('2026-10-02'); const x = document.querySelector('#cal-reader').textContent; closeCalendar(); return x; })();
    [opt('mental', 4).lbl, opt('spiritual', 2).lbl, opt('progress', 5).lbl].forEach(w => ok(text.includes(w), `the reader shows "${w}" for those numbers`));
    eq(opt('mental', 4).lbl + opt('spiritual', 2).lbl + opt('progress', 5).lbl, 'ClearAdriftGaining', 'which are the new words:');
  });

  t('the colours stay with their positions, so the row still runs from low to high', () => {
    const colours = k => CHECKIN.find(c => c.k === k).opts.map(o => o.c).join(';');
    eq(colours('mental'), '#5A6472,#2E3540;#6E7C93,#3A4454;#5B93C4,#2C5680;#4FC3DC,#2D7AB1;#8FE9F2,#1E9BC4', 'mental:');
    eq(colours('progress'), '#8A5A6A,#3E2530;#A8707A,#5A3038;#C9B87A,#8E7C42;#8FD3A8,#3E8E60;#9BEDE0,#2D9AB1', 'progress:');
  });

  // ============ the daily chapter moved to Study ============
  t('the chapter is asked and required up to 2026-11-21, and from 2026-11-22 it is neither', () => {
    eq(SCRIPTURE_LAST, '2026-11-21', 'the last day:');
    ok(scriptureApplies('2026-08-23') && scriptureApplies('2026-11-21') && scriptureApplies('2026-11-20'), 'before and on the last day');
    ok(!scriptureApplies('2026-11-22') && !scriptureApplies('2026-12-25') && !scriptureApplies('2027-06-01'), 'after it');
  });

  t('a day up to the cutoff counts exactly as before: with the reading it counts, without it it does not', () => {
    reset();
    for (const d of ['2026-09-10', '2026-10-15', '2026-11-20', '2026-11-21']) {
      ok(dayCounts(fullDay(d, true)), d + ' with the reading counts');
      ok(!dayCounts(fullDay(d, false)), d + ' without the reading does not');
    }
  });

  t('a day from 2026-11-22 counts without any reading, and a reading marked there changes nothing', () => {
    reset();
    for (const d of ['2026-11-22', '2026-11-23', '2026-12-31']) {
      ok(dayCounts(fullDay(d, false)), d + ' without a reading counts');
      ok(dayCounts(fullDay(d, true)), d + ' with one counts too');
    }
  });

  t('it asks one fewer thing from the cutoff on, and not a thing more or less otherwise', () => {
    const base = d => requiredCheckinsFor(d).length + depthsPerDay(d) + (reframeApplies(d) ? 2 : 0);
    for (const d of ['2026-09-10', '2026-10-30', '2026-11-21']) eq(slotsFor(d), base(d) + 1, d + ':');
    for (const d of ['2026-11-22', '2026-12-02']) eq(slotsFor(d), base(d), d + ':');
  });

  t('on screen the Scripture section shows for days up to the cutoff and is gone after it', () => {
    reset(); setMode('daily');
    renderDaily('2026-11-21');
    ok(!document.querySelector('#scripture-section').hidden && document.querySelector('#scripture-section').offsetParent !== null, 'shown on the last day');
    renderDaily('2026-11-22');
    ok(document.querySelector('#scripture-section').hidden, 'hidden on the next');
    ok(document.querySelector('#scripture-section').offsetParent === null, 'and not on screen');
    renderDaily();
  });

  t('a reading already marked on a day that no longer asks for one is not counted as an answer', () => {
    const e = fullDay('2026-11-23', true);
    eq(filledForDisplay(e), filledCount(e) - 1, 'shown count:');
    const e2 = fullDay('2026-11-21', true);
    eq(filledForDisplay(e2), filledCount(e2), 'a day that still asks for it keeps it:');
    eq(filledCount(e), filledCount(fullDay('2026-11-23', false)) + 1, 'the stored count itself is unchanged, so no merge or safety check sees a shrink:');
  });

  /** His real days, if a backup is being served: nothing finished may be re-judged, and no streak may move. */
  t('against the real days from the phone backup: every day up to the cutoff judges exactly as before, and the streaks do not move', async () => {
    let backup = null;
    for (const u of ['/backups/device-snapshot-20261122-102120/importable-backup.json', '/backups/device-snapshot-20261106-143656/importable-backup.json']) {
      try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { backup = await r.json(); break; } } catch (e) {}
    }
    if (!backup) return;                                   // not being served here (the public site never serves it)
    const oldCounts = (e) => {                             // the rule as it was: the reading always required
      if (!e) return false;
      for (const c of requiredCheckinsFor(e.d)) { const v = e.ci ? e.ci[c.k] : null; if (c.type === 'scale') { if (!v) return false; } else if (!(typeof v === 'string' && v.trim().length >= 2)) return false; }
      const base = (e.dp || []).filter(d => !d.extra);
      if (base.length < depthsPerDay(e.d)) return false;
      if (!base.every(d => (d.a || '').trim().length >= 2)) return false;
      if (!(e.sc && e.sc.done)) return false;
      if (reframeApplies(e.d)) { if (!e.rf) return false; if ((e.rf.bother || '').trim().length < 2) return false; if ((e.rf.opposite || '').trim().length < 2) return false; }
      return true;
    };
    const days = Object.keys(backup.daily).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k));
    ok(days.length > 50, 'a real backup was loaded (' + days.length + ' days)');
    let judged = 0, differ = [];
    for (const k of days) {
      const e = Object.assign({}, backup.daily[k], { d: k });
      if (k <= SCRIPTURE_LAST) { judged++; if (dayCounts(e) !== oldCounts(e)) differ.push(k); }
    }
    eq(differ.join(','), '', `days judged differently (of ${judged}):`);
    const streaks = (fn) => {
      const done = new Set(days.filter(k => fn(Object.assign({}, backup.daily[k], { d: k }))));
      let longest = 0, run = 0, prev = null;
      for (const k of [...done].sort()) { if (prev && dayKey(addDays(keyToDate(prev), 1)) === k) run++; else run = 1; longest = Math.max(longest, run); prev = k; }
      return longest + '/' + done.size;
    };
    eq(streaks(dayCounts), streaks(oldCounts), 'longest streak / days that count:');
  });

  // ============ Study: the plan ============
  t('three tracks of the right length: Old Testament 929, Psalms and wisdom 243, New Testament 260', () => {
    eq(STUDY_TRACKS.map(x => x.id + ':' + x.list.length).join(' '), 'ot:929 wis:243 nt:260', 'lengths:');
    eq(STUDY_BOOKS.reduce((n, b) => n + b[2], 0), 1189, 'the whole Bible:');
    eq(STUDY_TRACKS[0].list[0].ref + ' | ' + STUDY_TRACKS[0].list[928].ref, 'Genesis 1 | Malachi 4', 'Old Testament runs Genesis to Malachi:');
    eq(STUDY_TRACKS[2].list[0].ref + ' | ' + STUDY_TRACKS[2].list[259].ref, 'Matthew 1 | Revelation 22', 'New Testament runs Matthew to Revelation:');
    eq(STUDY_TRACKS[1].list[0].ref + ' | ' + STUDY_TRACKS[1].list[149].ref + ' | ' + STUDY_TRACKS[1].list[150].ref, 'Psalms 1 | Psalms 150 | Proverbs 1', 'wisdom runs Psalms then Proverbs:');
  });

  t('the first day: Genesis 1, Psalms 71 (where the Daily plan had reached) and Matthew 1', () => {
    reset();
    eq(refsOf('2026-11-22'), 'Genesis 1 | Psalms 71 | Matthew 1', 'today’s three:');
    eq(passageFor('2026-11-22'), 'Psalms 71', 'the Daily plan’s chapter on its last day:');
  });

  t('reading one chapter does not change the other two, or itself, on the same day', () => {
    reset();
    const before = refsOf('2026-11-22');
    const r = studyAssign('2026-11-22'); r.r.ot = Date.now();
    eq(refsOf('2026-11-22'), before, 'the three after reading one:');
    readAll('2026-11-22');
    eq(refsOf('2026-11-22'), before, 'and after reading all three:');
  });

  t('a day whose plan position was lost is worked out again from the days BEFORE it, never from its own reading', () => {
    reset();
    const now = Date.now();
    study.days['2026-11-22'] = { a: null, r: { ot: now, wis: now, nt: now }, n: '' };      // e.g. a damaged record that kept its read marks
    eq(refsOf('2026-11-22'), 'Genesis 1 | Psalms 71 | Matthew 1', 'the same three it was always going to be:');
    eq(refsOf('2026-11-23'), 'Genesis 2 | Psalms 72 | Matthew 2', 'and the day after moves on by exactly one:');
  });

  t('the plan follows progress: after a finished day the next day is the next chapter of each', () => {
    reset();
    readAll('2026-11-22');
    eq(refsOf('2026-11-23'), 'Genesis 2 | Psalms 72 | Matthew 2', 'the next day:');
    readAll('2026-11-23');
    eq(refsOf('2026-11-24'), 'Genesis 3 | Psalms 73 | Matthew 3', 'and the next:');
  });

  t('a chapter not read waits for tomorrow, and the others move on', () => {
    reset();
    const r = studyAssign('2026-11-22'); r.r.ot = 0; r.r.wis = Date.now(); r.r.nt = Date.now();
    eq(refsOf('2026-11-23'), 'Genesis 1 | Psalms 72 | Matthew 2', 'Genesis waits; the others move on:');
  });

  t('days missed never skip a chapter: five days later it is still the next one', () => {
    reset();
    readAll('2026-11-22');
    eq(refsOf('2026-11-27'), 'Genesis 2 | Psalms 72 | Matthew 2', 'after four silent days:');
  });

  t('un-marking a chapter puts the plan back, and the tracks wrap round at the end of their list', () => {
    reset();
    readAll('2026-11-22');
    study.days['2026-11-22'].r.ot = 0;
    eq(refsOf('2026-11-23'), 'Genesis 1 | Psalms 72 | Matthew 2', 'un-read:');
    // the New Testament has 260 chapters: after reading 260 days it begins again at Matthew 1
    reset();
    const days = daysFrom('2026-01-01', 260);
    days.forEach(d => { const r = studyAssign(d); r.r.nt = Date.now(); });
    eq(studyItem(STUDY_TRACKS[2], studyAssign('2026-09-20')).ref, 'Matthew 1', 'wraps to the beginning:');
  });

  // ============ Study: the streak ============
  const markDays = (days, all) => days.forEach(d => { const r = studyAssign(d); STUDY_TRACKS.forEach((x, i) => { r.r[x.id] = (all || i < 2) ? Date.now() : 0; }); });
  t('a day counts only when all three chapters are read; two of three is not a day', () => {
    reset();
    markDays(['2026-12-01'], true); markDays(['2026-12-02'], false);
    ok(studyDayDone('2026-12-01') && !studyDayDone('2026-12-02'), 'done and not');
    eq(studyStreaks(new Date(2026, 11, 2, 12)).total, 1, 'total:');
  });

  t('the streak counts consecutive days, stays alive through today until today ends, and a gap breaks it', () => {
    reset();
    markDays(['2026-12-01', '2026-12-02', '2026-12-03'], true);
    eq(studyStreaks(new Date(2026, 11, 3, 12)).current, 3, 'three days running:');
    eq(studyStreaks(new Date(2026, 11, 4, 9)).current, 3, 'still alive the next morning, today not done yet:');
    eq(studyStreaks(new Date(2026, 11, 5, 9)).current, 0, 'a missed day breaks it:');
    markDays(['2026-12-10', '2026-12-11'], true);
    const s = studyStreaks(new Date(2026, 11, 11, 12));
    eq(s.current + '/' + s.longest + '/' + s.total, '2/3/5', 'current / longest / total:');
  });

  t('the widget gets its own streak: current, best, total, today out of three, and the days it describes', () => {
    reset();
    markDays(['2026-11-30'], true);
    const day = dayKey(); const r = studyAssign(day); r.r.ot = Date.now(); r.r.wis = Date.now();
    const f = studyWidgetFields();
    eq(Object.keys(f).sort().join(','), 'studyCurrent,studyDayKey,studyDone,studyLastDoneDay,studyLongest,studyToday,studyTotal', 'fields:');
    eq(f.studyToday, 2, 'today:'); eq(f.studyDone, false, 'not done:'); eq(f.studyDayKey, day, 'the day:'); eq(f.studyLastDoneDay, '2026-11-30', 'last done:');
    r.r.nt = Date.now();
    eq(studyWidgetFields().studyDone, true, 'done with three:');
    syncWidgetData(computeStreaks(), 0.5);
    const payload = window.__stillwaterWidget;
    ok(payload.studyCurrent >= 1 && payload.studyDone === true && payload.current !== undefined, 'the one payload carries both streaks: ' + Object.keys(payload).join(','));
  });

  // ============ Study: storage, kept apart and safe ============
  t('it saves in its own key, at once, and comes back exactly', () => {
    reset();
    readAll('2026-11-22'); studySaveNow();
    ok(localStorage.getItem(STUDY_KEY), 'its own key holds it');
    const before = JSON.stringify(study);
    study = studyNormalize(null); studyLoad();
    eq(JSON.stringify(study), before, 'after a reload:');
  });

  t('it never touches the journals, answers or check-ins, and they never touch it', () => {
    reset();
    state.journals = [{ id: 'j1', title: 'a', text: 'kept', type: 'negative', savedAt: 5 }];
    persist();
    const main = localStorage.getItem(KEY), hwm = localStorage.getItem(KEY + '_hwm');
    readAll('2026-11-22'); studyAssign('2026-11-23'); studySaveNow(); study.days['2026-11-23'].n = 'a note'; studyFlush();
    eq(localStorage.getItem(KEY), main, 'the main store after Study writes:');
    eq(localStorage.getItem(KEY + '_hwm'), hwm, 'the safety copy:');
    const mine = localStorage.getItem(STUDY_KEY);
    state.journals.push({ id: 'j2', title: 'b', text: 'more', type: 'negative', savedAt: 6 }); persist();
    eq(localStorage.getItem(STUDY_KEY), mine, 'Study after a journal save:');
  });

  t('a damaged main copy falls back to the previous one, and two damaged copies give an empty Study, never an error', () => {
    reset();
    readAll('2026-11-22'); studySaveNow();
    study.days['2026-11-22'].n = 'second save'; studySaveNow();      // now the previous copy exists
    localStorage.setItem(STUDY_KEY, '{ this is not json');
    study = studyNormalize(null); studyLoad();
    ok(studyDayDone('2026-11-22'), 'the finished day came back from the previous copy');
    localStorage.setItem(STUDY_KEY, 'garbage'); localStorage.setItem(STUDY_KEY + '_bak', 'also garbage');
    let threw = false; try { study = studyNormalize(null); studyLoad(); } catch (e) { threw = true; }
    ok(!threw, 'no error'); eq(Object.keys(study.days).length, 0, 'an empty Study:');
  });

  t('a broken copy is never kept as the backup, so one bad write cannot destroy both', () => {
    reset();
    readAll('2026-11-22'); studySaveNow();
    localStorage.setItem(STUDY_KEY, '{ broken');
    studySaveNow();                                        // saves again while the main key is broken
    let good = false; try { JSON.parse(localStorage.getItem(STUDY_KEY + '_bak') || '{ x'); good = true; } catch (e) {}
    ok(good || localStorage.getItem(STUDY_KEY + '_bak') === null, 'the backup is not the broken text');
  });

  t('what it reads is cleaned: nonsense days, negative positions and bad times are dropped, good ones kept', () => {
    const n = studyNormalize({ days: { 'nope': { r: { ot: 5 } }, '2026-12-01': { a: { ot: -3, wis: 2, nt: 'x' }, r: { ot: 'abc', wis: 99, nt: -1 }, n: 7 }, '2026-12-02': { a: { ot: 1, wis: 2, nt: 3 }, r: { ot: 5, wis: 6, nt: 7 }, n: 'ok' } },
      topics: { j1: { 'GEN 1': 5, 'GEN 2': 'no' }, j2: 'x' } });
    eq(Object.keys(n.days).join(','), '2026-12-01,2026-12-02', 'days kept:');
    eq(JSON.stringify(n.days['2026-12-01'].r), '{"ot":0,"wis":99,"nt":0}', 'bad times become not read:');
    eq(n.days['2026-12-01'].a, null, 'a broken plan position is dropped, to be worked out again:');
    eq(JSON.stringify(n.days['2026-12-02'].a), '{"ot":1,"wis":2,"nt":3}', 'a good one is kept:');
    eq(JSON.stringify(n.topics), '{"j1":{"GEN 1":5}}', 'journey marks (a malformed entry is dropped whole):');
  });

  t('Export carries Study, and Import only ever adds: nothing here is replaced or removed', () => {
    reset();
    readAll('2026-11-22'); study.days['2026-11-22'].n = 'my note'; study.topics.abraham = { 'GEN 12:1-9': 100 }; studySaveNow();
    const out = collectForExport();
    ok(out.study && out.study.days['2026-11-22'], 'exported');
    const snapshot = JSON.stringify(out.study);
    study = studyNormalize(null);
    studyAssign('2026-11-25'); study.days['2026-11-25'].r.ot = 77; study.days['2026-11-22'] = { a: null, r: { ot: 5, wis: 0, nt: 0 }, n: '' };
    const added = studyImport(JSON.parse(snapshot));
    ok(added > 0, 'something was added');
    ok(study.days['2026-11-25'].r.ot === 77, 'a day only here is kept');
    ok(study.days['2026-11-22'].r.ot > 5 && study.days['2026-11-22'].r.wis > 0 && study.days['2026-11-22'].n === 'my note', 'the imported marks and note fill in what was empty, without lowering anything');
    eq(study.topics.abraham['GEN 12:1-9'], 100, 'journey marks:');
    eq(studyImport({ days: 'junk' }), 0, 'junk adds nothing:');
  });

  // ============ Study: the content ============
  t('the content files are all there and complete: 66 books, 1,189 chapters, Henry on all but a few Proverbs, a story on nearly all', async () => {
    const index = await (await fetch('/study/index.json')).json();
    eq(index.books.length, 66, 'books:');
    eq(index.books.reduce((n, b) => n + b.k, 0), 1189, 'chapters:');
    let withHenry = 0, withLink = 0, withStory = 0, empty = [];
    for (const b of index.books) {
      const d = await (await fetch('/study/' + b.c + '.json')).json();
      for (let n = 1; n <= b.k; n++) { const c = d[String(n)]; if (!c) { empty.push(b.c + n); continue; } if (c.o) withHenry++; if (c.h) withLink++; if (c.s && c.i) withStory++; }
    }
    ok(withHenry >= 1165, 'Henry’s overview on ' + withHenry);
    ok(withLink >= 1185, 'a Henry link on ' + withLink);
    ok(withStory >= 1160, 'a story on ' + withStory);
    ok(empty.length <= 4, 'chapters with nothing: ' + empty.join(','));
  });

  t('Genesis 1 reads right, and its commentary link is the real chapter on ccel.org', async () => {
    const d = (await (await fetch('/study/GEN.json')).json())['1'];
    ok(d.o && d.o.length > 120 && d.o.length <= 560, 'an overview of sensible length: ' + (d.o || '').length);
    ok(d.q && d.q.length >= 1 && d.p && d.l && d.s, 'a question, a prayer, a line to carry and a story title');
    eq(studyCommUrl(d), 'https://www.ccel.org/ccel/henry/mhc1.Gen.ii.html', 'the link:');
    ok(!/[<>]|&[a-z]+;|\[\[|scripRef/.test(d.o + d.i), 'no markup left in the text');
  });

  t('the journeys are Walk the Stories’ own: thirteen of them, each a list of passages with a title', async () => {
    const j = await (await fetch('/study/journeys.json')).json();
    eq(j.length, 13, 'journeys:');
    ok(j.every(x => x.id && x.n && x.i.length >= 3 && x.i.every(p => /^\w{3} \d+/.test(p.r) && p.t)), 'every one has passages with a reference and a title');
    ok(j.some(x => x.id === 'abraham'), 'Abraham’s road is there');
  });

  t('a book that cannot be fetched falls back to plain study questions, without an error, and tries again next time the tab opens', async () => {
    reset();
    try { await caches.delete(STUDY_CACHE); } catch (e) {}           // nothing kept from an earlier test, so a fetch really is needed
    const realFetch = window.fetch; let calls = 0;
    window.fetch = (u, o) => /\/study\//.test(String(u)) ? (calls++, Promise.resolve({ ok: false, status: 404, json: async () => ({}) })) : realFetch(u, o);
    try {
      setMode('study'); await wait(500);
      const cards = document.querySelectorAll('.st-card'); eq(cards.length, 3, 'the three chapters still show:');
      tap('[data-st="more:ot"]');
      const text = document.querySelector('.st-panel').textContent;
      ok(STUDY_GENERIC.every(q => text.includes(q)), 'the plain questions are there');
      ok(!/Loading/.test(document.querySelector('.st-card .st-panel').textContent), 'not stuck on Loading');
      ok(calls >= 3, 'it tried: ' + calls);
      const before = calls; studyEnter(); await wait(400);
      ok(calls > before, 'and tries again on the next visit');
    } finally { window.fetch = realFetch; setMode('daily'); }
  });

  // ============ Study: the screen ============
  const openedUrls = []; const realOpen = window.open;
  const captureOpen = () => { openedUrls.length = 0; window.open = (u) => { openedUrls.push(String(u)); return null; }; };
  const releaseOpen = () => { window.open = realOpen; };
  t('the Study tab shows today’s three chapters with their stories, loaded from the site', async () => {
    reset(); setMode('study'); await wait(900);
    eq([...document.querySelectorAll('.st-ref')].map(x => x.textContent).join(' | '), refsOf(dayKey()), 'the chapters:');
    ok([...document.querySelectorAll('.st-story')].length === 3, 'a story title under each: ' + document.querySelectorAll('.st-story').length);
    eq([...document.querySelectorAll('#workspace > .view.active')].map(v => v.id).join(','), 'study-view', 'only the Study screen shows:');
    setMode('daily');
  });

  t('Read opens the chapter in the NKJV, Commentary opens Henry on that chapter, both outside the app', async () => {
    reset(); setMode('study'); await wait(900); captureOpen();
    try {
      tap('[data-st="read:ot"]'); tap('[data-st="comm:ot"]'); tap('[data-st="read:wis"]'); tap('[data-st="comm:nt"]');
      eq(openedUrls[0], 'https://www.biblegateway.com/passage/?search=Genesis%201&version=NKJV', 'Genesis:');
      eq(openedUrls[1], 'https://www.ccel.org/ccel/henry/mhc1.Gen.ii.html', 'Henry on Genesis 1:');
      eq(openedUrls[2], 'https://www.biblegateway.com/passage/?search=Psalms%2071&version=NKJV', 'Psalms:');
      ok(/^https:\/\/www\.ccel\.org\/ccel\/henry\/mhc5\.Matt\./.test(openedUrls[3]), 'Henry on Matthew 1: ' + openedUrls[3]);
    } finally { releaseOpen(); setMode('daily'); }
  });

  t('Mark as read saves at once, moves the ring, can be undone, and finishing the third completes the day', async () => {
    reset(); setMode('study'); await wait(700);
    tap('[data-st="done:ot"]');
    ok(stored().days[dayKey()].r.ot > 0, 'on disk straight away');
    eq(document.querySelector('.st-meta b').textContent, '1/3', 'today:');
    ok(document.querySelector('.st-card[data-t="ot"]').classList.contains('done'), 'the card shows it is read');
    tap('[data-st="done:ot"]');
    eq(stored().days[dayKey()].r.ot, 0, 'un-marked on disk:'); eq(document.querySelector('.st-meta b').textContent, '0/3', 'today:');
    ['ot', 'wis', 'nt'].forEach(x => tap('[data-st="done:' + x + '"]'));
    eq(document.querySelector('.st-meta b').textContent, '3/3', 'all three:');
    ok(studyDayDone(dayKey()) && studyStreaks().current === 1, 'the day counts and the streak is 1');
    eq(document.querySelector('.st-core b').textContent, '1', 'the ring shows the streak:');
    setMode('daily');
  });

  t('Study opens a chapter’s overview, story, questions, line to carry and prayer, with the credit', async () => {
    reset(); setMode('study'); await wait(900);
    tap('[data-st="more:ot"]');
    const heads = [...document.querySelectorAll('.st-panel .st-h')].map(x => x.textContent).join(',');
    eq(heads, 'Overview,The story,Think about it,Carry it into today,Pray', 'sections:');
    ok(document.querySelector('.st-credit').textContent.includes('Matthew Henry') && document.querySelector('.st-credit').textContent.includes('Walk the Stories'), 'credited');
    tap('[data-st="more:ot"]'); ok(!document.querySelector('.st-panel'), 'and it closes again');
    setMode('daily');
  });

  t('the day’s note saves as it is typed and survives leaving the tab', async () => {
    reset(); setMode('study'); await wait(500);
    const ta = document.querySelector('#st-note'); ta.value = 'NOTE-FOR-TODAY'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    setMode('daily');                                      // leaving flushes it
    ok((stored().days[dayKey()] || {}).n === 'NOTE-FOR-TODAY', 'on disk after leaving');
    studyEnter(); ok(document.querySelector('#st-note').value === 'NOTE-FOR-TODAY', 'and back on screen');
    document.querySelector('#st-note').value = 'SECOND'; document.querySelector('#st-note').dispatchEvent(new Event('input', { bubbles: true }));
    flushPending();
    eq(stored().days[dayKey()].n, 'SECOND', 'a pending note is saved by the pagehide flush:');
    setMode('daily');
  });

  t('the journeys list shows, a journey opens to its passages, and passages can be ticked off and opened', async () => {
    reset(); setMode('study'); await wait(900);
    const rows = document.querySelectorAll('.st-jrow'); eq(rows.length, 13, 'journeys:');
    tap('[data-st="jopen:abraham"]');
    const passages = document.querySelectorAll('.st-jp'); ok(passages.length >= 10, 'passages: ' + passages.length);
    tap('.st-jp .st-check');
    ok(Object.keys(study.topics.abraham).length === 1 && stored().topics.abraham, 'ticked and saved');
    eq(document.querySelector('.mm-count').textContent, '1 of ' + passages.length, 'progress:');
    captureOpen(); try { tap('.st-jp .st-jt'); ok(/biblegateway\.com\/passage\/\?search=Genesis%2011/.test(openedUrls[0]) || /biblegateway\.com\/passage\/\?search=\w/.test(openedUrls[0]), 'opens the passage: ' + openedUrls[0]); } finally { releaseOpen(); }
    tap('[data-st="jback"]'); ok(document.querySelector('.st-jrow em').textContent.startsWith('1 of '), 'back on the list, with the count');
    setMode('daily');
  });

  t('every tab has a name for when its label is hidden, and on a mid-sized desktop window the labels give way to icons so nothing is crowded', () => {
    const word = b => (b.querySelector('.l-full') || b.querySelector('.label')).textContent;
    const tabs = [...document.querySelectorAll('.mode-btn')];
    ok(tabs.every(b => b.getAttribute('aria-label') === word(b) && b.title === word(b)), 'every tab is named: ' + tabs.map(b => b.getAttribute('aria-label')).join(','));
    if (innerWidth > 1000 && innerWidth <= 1360) {
      ok(tabs.every(b => getComputedStyle(b.querySelector('.label')).display === 'none'), 'icons only at this width');
      const pill = document.querySelector('.mode-switch').getBoundingClientRect(), sync = document.querySelector('#sync-state').getBoundingClientRect();
      const first = document.querySelector('.top-actions').firstElementChild.getBoundingClientRect();
      const controlsLeft = Math.min(sync.width ? sync.left : 1e9, first.left);
      ok(pill.width > 0 && pill.right <= controlsLeft - 4, 'the tabs end before the sync text and controls begin (' + Math.round(pill.right) + ' vs ' + Math.round(controlsLeft) + ')');
    }
  });

  // ============ the calendar, the theme, the words on screen ============
  t('coming back from a day returns to where you were in the calendar; later months have nothing to open', () => {
    reset();
    state.daily['2026-09-14'] = fullDay('2026-09-14', true); state.daily['2026-10-03'] = fullDay('2026-10-03', true);
    setMode('daily'); document.querySelector('#calendar-btn').click();
    const sc = document.querySelector('#cal-scroll'); sc.scrollTop = 220; const was = sc.scrollTop;
    tap('#cal-months button[data-day="2026-10-03"]'); ok(!document.querySelector('#cal-reader').hidden, 'the day opened');
    tap('#cal-back');
    eq(Math.round(document.querySelector('#cal-scroll').scrollTop), Math.round(was), 'scroll position:');
    const cur = document.querySelector('#cal-months .cal-month.current');
    ok(cur.nextElementSibling && cur.nextElementSibling.querySelectorAll('button[data-day]').length === 0, 'next month has no days to open');
    closeCalendar();
  });

  const rgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  t('the backdrop is dark: every colour in the app’s gradient is near black or deep navy, none a bright blue', () => {
    const bg = getComputedStyle(document.querySelector('#app')).backgroundImage;
    const stops = (bg.match(/rgb\([^)]*\)/g) || []).map(rgba).filter(c => c);
    ok(stops.length >= 3, 'the gradient was found: ' + stops.length + ' colours');
    const lightest = Math.max(...stops.map(lum));
    ok(lightest < 0.03, 'the lightest colour in the backdrop has luminance ' + lightest.toFixed(3) + ' (the old blue was 0.18)');
    ok(lum(rgba(getComputedStyle(document.body).backgroundColor)) < 0.01, 'and so is the page behind it');
    ok(Number(getComputedStyle(document.querySelector('.bokeh')).opacity) <= 0.2, 'the glow blobs are dim');
  });

  function audit(root, base) {
    const bad = []; let checked = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue;
      if (cs.webkitTextFillColor && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.webkitTextFillColor)) continue;   // the gradient page titles
      const fg = el instanceof SVGElement ? rgba(cs.fill) : rgba(cs.color); if (!fg) continue;
      const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
      // a faded element is faded text: take the element's opacity into the text (unless it is only mid-way through an entrance animation)
      for (const e of chain) {
        const o = Number(getComputedStyle(e).opacity);
        const animating = e.getAnimations && e.getAnimations().some(a => a.playState === 'running');
        if (o < 1 && !animating) fg.a *= o;
      }
      if (fg.a <= 0.05) continue;                          // not on screen at all (a button that only appears once there is something to act on)
      let cands = [base];                                  // every background the text could be sitting on: a gradient counts as each of its colours
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
  const BASE = { r: 15, g: 34, b: 54, a: 1 };            // the lightest point of the new backdrop
  t('every piece of text on the Study screens, home and a journey, passes the 4.5:1 bar', async () => {
    reset(); setMode('study'); await wait(900);
    tap('[data-st="more:ot"]'); tap('[data-st="done:wis"]'); document.querySelector('#st-note').value = 'a note'; await wait(100);
    const fails = []; let total = 0;
    const run = (label) => { const r = audit(document.querySelector('#study-view'), BASE); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    run('home'); tap('[data-st="jopen:abraham"]'); run('journey');
    ok(total > 60, 'enough text checked: ' + total);
    eq(fails.join(' | '), '', `text under 4.5:1 (${total} checked):`);
    setMode('daily');
  });
  t('the Daily tab, the calendar and the Check-In tab all still pass on the dark backdrop', async () => {
    reset();
    state.daily['2026-10-03'] = fullDay('2026-10-03', true);
    const fails = []; let total = 0;
    const run = (label, root) => { const r = audit(root, BASE); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    setMode('daily'); renderDaily(); await wait(300); run('daily', document.querySelector('#daily-view'));
    document.querySelector('#calendar-btn').click(); await wait(200); run('calendar', document.querySelector('#cal-sheet'));
    tap('#cal-months button[data-day="2026-10-03"]'); run('a day read in the calendar', document.querySelector('#cal-sheet')); closeCalendar();
    setMode('checkin'); await wait(300); run('check-in', document.querySelector('#checkin-view'));
    ok(total > 120, 'enough text checked: ' + total);
    eq(fails.join(' | '), '', `text under 4.5:1 (${total} checked):`);
    setMode('daily');
  });

  t('every other screen passes the 4.5:1 bar too: Journal, Thought Web, Grievance, Grief, the menu and the sign-in page', async () => {
    reset();
    const fails = []; let total = 0;
    const run = (label, root) => { const r = audit(root, BASE); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    for (const m of ['journal', 'thought', 'grievance', 'grief']) { setMode(m); await wait(350); run(m, document.querySelector('#' + m + '-view')); run(m + ' top bar', document.querySelector('#topbar')); }
    setMode('daily'); document.querySelector('#menu-toggle').click(); await wait(500); run('menu', document.querySelector('#sidebar')); document.querySelector('#sidebar-close').click();
    const auth = document.querySelector('#auth-overlay'); const was = auth.classList.contains('hidden'); auth.classList.remove('hidden'); await wait(350);
    run('sign-in', auth); if (was) auth.classList.add('hidden');
    ok(total > 25, 'enough text checked: ' + total);
    eq(fails.join(' | '), '', `text under 4.5:1 (${total} checked):`);
    setMode('daily');
  });

  // ============ it stays apart, and on this device ============
  t('the Study code never writes the journals, answers or check-ins, never syncs, and only fetches its own content', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const a = src.indexOf('/* ===== STUDY ====='), b = src.indexOf('/* ===== END STUDY =====');
    ok(a > 0 && b > a, 'the Study block was found');
    const code = src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ['persist(', 'cloudSave', 'e2eeSync', 'fbDb', 'firebase', 'state.daily', 'state.journals', 'state.checkins', 'state.thoughts', 'state.grievances', 'state.mind', 'state.deleted',
     'speechSynthesis', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'eval(', 'new Function'].forEach(w => ok(code.indexOf(w) < 0, 'the Study block contains "' + w + '"'));
    eq((code.match(/\bfetch\(/g) || []).length, 1, 'fetch calls:');
    ok(/fetch\(url\)/.test(code) && /studyBase\(\)/.test(code), 'the one fetch goes to studyBase()');
  });

  t('Study is in Export and Import, and is kept out of the synced copy for now', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    ok(/study: \(\(\) => \{ try \{ return studyForExport\(\)/.test(src), 'Export includes it');
    ok(/try \{ studyImport\(data\.study\); \} catch \(e\) \{\}/.test(src), 'Import merges it, inside a try');
    ok(!/CLOUD_FIELDS = \[[^\]]*study/.test(src), 'it is NOT in the cloud fields (kept apart on purpose in this release)');
    ok(!/currentPayload\(\)[\s\S]{0,300}study/.test(src.slice(src.indexOf('function currentPayload'), src.indexOf('function currentPayload') + 400)), 'and not in the synced payload');
  });

  async function runAll17(only) {
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
  window.runAll17 = runAll17;
})();
