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
  const readAll = (d) => { const r = studyAssign(d); r.r = r.a.map(id => id ? Date.now() : 0); };           // every lesson the day offers
  const refsOf = (d) => { const r = studyAssign(d); return studySlots(r).map(i => studyItem(r, i).ref).join(' | '); };
  const stored = () => JSON.parse(localStorage.getItem(STUDY_KEY) || 'null');
  const ago = (n) => dayKey(addDays(new Date(), -n));
  /** Nine days read, ending twelve days ago (so no streak runs into today): TODAY is then day 10, the first day of three lessons
      (Genesis 5:25–32 | Genesis 6:1–12 | Matthew 5:33–48), whatever the date. Day one is two lessons, so tests of a day of three start here. */
  const leadToThree = () => { for (let n = 20; n >= 12; n--) readAll(ago(n)); };
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
  t('two lists of lessons: the Old Testament 1,994 (the Psalms and wisdom books in their place) and the New Testament 602, each in order, every lesson once', () => {
    eq(STUDY_OT.length + ' ' + STUDY_NT.length, '1994 602', 'lengths:');
    eq(STUDY_BOOKS.reduce((n, b) => n + b[2], 0), 1189, 'the whole Bible:');
    eq(STUDY_OT[0].ref + ' | ' + STUDY_OT.at(-1).ref, 'Genesis 1:1–19 | Malachi 4', 'Old Testament runs Genesis to Malachi:');
    eq(STUDY_NT[0].ref + ' | ' + STUDY_NT.at(-1).ref, 'Matthew 1:1–17 | Revelation 22:6–21', 'New Testament runs Matthew to Revelation:');
    const at = (c) => STUDY_OT.findIndex(x => x.code === c);
    ok(at('EST') < at('JOB') && at('JOB') < at('PSA') && at('PSA') < at('PRO') && at('PRO') < at('ECC') && at('ECC') < at('SNG') && at('SNG') < at('ISA'),
      'the Psalms and wisdom books are part of the Old Testament, in their place');
    eq(new Set(STUDY_OT.concat(STUDY_NT).map(x => x.id)).size, 2596, 'every lesson has its own name, and there are 2,596:');
    ok(STUDY_OT.every(x => x.kind === 'Old Testament') && STUDY_NT.every(x => x.kind === 'New Testament'), 'each is labelled Old or New Testament');
  });

  t('the first day: Genesis 1:1–19 and Matthew 1:1–17, nine minutes; the tenth day is the first of three lessons', () => {
    reset();
    eq(refsOf('2026-11-22'), 'Genesis 1:1–19 | Matthew 1:1–17', 'today’s lessons:');
    const r = study.days['2026-11-22']; eq(studySlots(r).reduce((n, i) => n + studyItem(r, i).m, 0), 9, 'minutes:');
    eq(passageFor('2026-11-22'), 'Psalms 71', 'the Daily plan’s chapter on its last day (the Daily tab is unchanged):');
    reset(); leadToThree();
    eq(refsOf(dayKey()), 'Genesis 5:25–32 | Genesis 6:1–12 | Matthew 5:33–48', 'the tenth day, three lessons, on any date:');
    const t3 = study.days[dayKey()]; eq(studySlots(t3).reduce((n, i) => n + studyItem(t3, i).m, 0), 13, 'minutes:');
  });

  t('a day is one New Testament lesson and one or two Old Testament lessons; the second Old Testament one only when the first and the New Testament one come to under nine minutes', () => {
    reset(); const was = studySaveNow; studySaveNow = () => {};
    try {
      let three = 0, two = 0;
      for (const d of daysFrom('2026-01-01', 300)) {
        const r = studyAssign(d), items = studySlots(r).map(i => studyItem(r, i));
        const nt = items.filter(x => x.kind === 'New Testament'), ot = items.filter(x => x.kind === 'Old Testament');
        eq(nt.length, 1, d + ' New Testament lessons:'); ok(ot.length === 1 || ot.length === 2, d + ' Old Testament lessons: ' + ot.length);
        if (ot.length === 2) { ok(ot[0].m + nt[0].m < 9, d + ': two Old Testament lessons only under nine minutes'); three++; }
        else { ok(ot[0].m + nt[0].m >= 9, d + ': one Old Testament lesson only from nine minutes'); two++; }
        r.r = r.a.map(x => x ? 1 : 0);
      }
      ok(two > 50 && three > 50, 'both kinds of day happen: ' + two + ' of two, ' + three + ' of three');
    } finally { studySaveNow = was; }
  });

  t('reading one lesson does not change the other lessons of the same day, or itself', () => {
    reset();
    const before = refsOf('2026-11-22');
    const r = studyAssign('2026-11-22'); r.r[0] = Date.now();
    eq(refsOf('2026-11-22'), before, 'the lessons after reading one:');
    readAll('2026-11-22');
    eq(refsOf('2026-11-22'), before, 'and after reading all of them:');
  });

  t('the plan follows what was read: after a finished day the next day is the next of each', () => {
    reset();
    readAll('2026-11-22');
    eq(refsOf('2026-11-23'), 'Genesis 1:20–31 | Matthew 1:18–25', 'the next day:');
    readAll('2026-11-23');
    eq(refsOf('2026-11-24'), 'Genesis 2:1–17 | Matthew 2:1–15', 'a day of two lessons, when the first and the New Testament lesson already come to nine minutes:');
    readAll('2026-11-24');
    eq(refsOf('2026-11-25'), 'Genesis 2:18–25 | Matthew 2:16–23', 'and another:');
  });

  t('a lesson read on its own leaves the rest first in line: tomorrow offers them again, then the next', () => {
    reset();
    const r = studyAssign('2026-11-22'); r.r[1] = Date.now();                       // only Matthew 1:1–17
    eq(refsOf('2026-11-23'), 'Genesis 1:1–19 | Matthew 1:18–25', 'the Old Testament lesson not read is first in line, and Matthew moves on:');
    reset();
    const r2 = studyAssign('2026-11-22'); r2.r[0] = Date.now();                     // only Genesis 1:1–19
    eq(refsOf('2026-11-23'), 'Genesis 1:20–31 | Matthew 1:1–17', 'the New Testament lesson not read waits, and Genesis moves on:');
  });

  t('days missed never skip a lesson: five days later it is still the next one', () => {
    reset();
    readAll('2026-11-22');
    eq(refsOf('2026-11-27'), 'Genesis 1:20–31 | Matthew 1:18–25', 'after four silent days:');
  });

  t('un-marking a lesson puts it back in line', () => {
    reset();
    readAll('2026-11-22');
    study.days['2026-11-22'].r[0] = 0;
    eq(refsOf('2026-11-23'), 'Genesis 1:1–19 | Matthew 1:18–25', 'un-read (and with Matthew 1:18–25 it is already nine minutes, so no second Old Testament lesson):');
  });

  t('a lesson already read is never offered again, whatever order days are opened in', () => {
    reset();
    const a = studyAssign('2026-11-22'); a.r = a.a.map(x => x ? Date.now() : 0);
    const later = studyAssign('2026-12-30');
    const ids = new Set(a.a.filter(Boolean));
    ok(later.a.filter(Boolean).length >= 2 && later.a.filter(Boolean).every(id => !ids.has(id)), 'none of the lessons read on 22 November is offered on 30 December');
  });

  // ============ Study: the streak ============
  const markDays = (days, all) => days.forEach(d => { const r = studyAssign(d); r.r = r.a.map((id, i) => id && (all || i === 0) ? Date.now() : 0); });
  t('a day counts only when EVERY lesson it offers is read: one of three is not a day, and a day of two needs both', () => {
    reset();
    markDays(['2026-12-01'], true); markDays(['2026-12-02'], false);
    ok(studyDayDone('2026-12-01') && !studyDayDone('2026-12-02'), 'done and not');
    eq(studyStreaks(new Date(2026, 11, 2, 12)).total, 1, 'total:');
    reset(); for (const d of daysFrom('2026-01-01', 2)) readAll(d);
    const two = studyAssign('2026-01-03'); eq(studySlots(two).length, 2, 'the third day has two lessons:');
    two.r[0] = Date.now(); ok(!studyDayDone('2026-01-03'), 'one of two is not a day');
    two.r[1] = Date.now(); ok(studyDayDone('2026-01-03'), 'both is');
    study.days['2026-12-05'] = { a: [null, null, null], r: [0, 0, 0], n: '' }; ok(!studyDayDone('2026-12-05'), 'a day with no lessons on it is not a day');
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

  t('the widget gets its own streak: current, best, total, today out of three (a day of two is scaled to it), and the days it describes', () => {
    reset(); leadToThree();
    const day = dayKey(); const r = studyAssign(day); r.r[0] = Date.now(); r.r[1] = Date.now();
    eq(studySlots(r).length, 3, 'a day of three lessons');
    const f = studyWidgetFields();
    eq(Object.keys(f).sort().join(','), 'studyCurrent,studyDayKey,studyDone,studyLastDoneDay,studyLongest,studyToday,studyTotal', 'fields:');
    eq(f.studyToday, 2, 'today:'); eq(f.studyDone, false, 'not done:'); eq(f.studyDayKey, day, 'the day:'); eq(f.studyLastDoneDay, ago(12), 'last done:');
    r.r[2] = Date.now();
    eq(studyWidgetFields().studyDone, true, 'done with all three:'); eq(studyWidgetFields().studyToday, 3, 'three of three:');
    r.a = [STUDY_OT[0].id, STUDY_NT[0].id, null]; r.r = [Date.now(), 0, 0];          // a day of two lessons
    eq(studyWidgetFields().studyToday, 1, 'one of two is one of three:'); eq(studyWidgetFields().studyDone, false, 'not done:');
    r.r[1] = Date.now();
    eq(studyWidgetFields().studyToday, 3, 'both is three of three:'); eq(studyWidgetFields().studyDone, true, 'done:');
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

  t('what it reads is cleaned: nonsense days, unknown lessons, repeated lessons and bad times are dropped, good ones kept', () => {
    const ids = [STUDY_OT[0].id, STUDY_OT[1].id, STUDY_NT[0].id];
    const n = studyNormalize({ v: 3, days: { 'nope': { a: [ids[0]], r: [5] },
      '2026-12-01': { a: [ids[0], 'XXX:1:1', ids[0]], r: ['abc', 99, -1], n: 7 }, '2026-12-02': { a: ids, r: [5, 6, 7], n: 'ok' } },
      topics: { j1: { 'GEN 1': 5, 'GEN 2': 'no' }, j2: 'x' } });
    eq(Object.keys(n.days).join(','), '2026-12-01,2026-12-02', 'days kept:');
    eq(JSON.stringify(n.days['2026-12-01'].a), JSON.stringify([ids[0], null, null]), 'an unknown lesson and a repeat are dropped:');
    eq(JSON.stringify(n.days['2026-12-01'].r), '[0,0,0]', 'bad times, and a mark on nothing, become not read:');
    eq(JSON.stringify(n.days['2026-12-02'].a) + JSON.stringify(n.days['2026-12-02'].r), JSON.stringify(ids) + '[5,6,7]', 'a good day is kept:');
    eq(JSON.stringify(n.topics), '{"j1":{"GEN 1":5}}', 'journey marks (a malformed entry is dropped whole):');
  });

  t('Study as the chapter version saved it (v1) is kept: reads, notes and journey ticks stay exactly, and each read is worked out as the lesson it was', () => {
    reset();
    const old = { v: 1, days: { '2026-11-22': { a: { ot: 0, wis: 70, nt: 0 }, r: { ot: 1795369800725, wis: 0, nt: 0 }, n: 'a note I wrote' },
                                '2026-11-21': { a: { ot: 0, wis: 70, nt: 0 }, r: { ot: 11, wis: 22, nt: 33 }, n: '' } },
                  topics: { abraham: { 'GEN 12:1-5': 777 } } };
    const jb = localStorage.getItem(KEY);
    localStorage.setItem(STUDY_KEY, JSON.stringify(old));
    studyLoad();
    eq(study.v, 3, 'now version 3:');
    const d = study.days['2026-11-22'], e = study.days['2026-11-21'];
    eq(d.n, 'a note I wrote', 'the note:'); eq(study.topics.abraham['GEN 12:1-5'], 777, 'the journey tick:');
    eq(e.a.join() + '|' + e.r.join(), 'GEN:1:1,PSA:71:1,MAT:1:1|11,22,33', 'the first day’s three reads, by lesson name, with their times:');
    eq(d.a[0] + '|' + d.r[0], 'GEN:1:20|1795369800725', 'the next day’s read is the next Old Testament lesson:');
    ok(studyReadIds().has('PSA:71:1'), 'Psalm 71 read as Psalms and Wisdom counts as read, so the Old Testament will skip it later');
    eq(JSON.parse(localStorage.getItem(STUDY_KEY)).v, 1, 'loading alone rewrites nothing:');
    studySaveNow();
    eq(JSON.parse(localStorage.getItem(STUDY_KEY)).v, 3, 'the first save is version 3:');
    eq(JSON.parse(localStorage.getItem(STUDY_KEY + '_bak')).v, 1, 'with the version it replaced kept beside it:');
    eq(refsOf('2026-11-22'), 'Genesis 1:20–31 | Matthew 1:18–25', 'and that day’s unread lesson is offered beside it:');
    eq(localStorage.getItem(KEY), jb, 'the journals, answers and check-ins were not touched:');
  });

  t('Study as the three-track version saved it (v2, with positions) is kept: each read becomes the lesson at its saved position', () => {
    reset();
    const old = { v: 2, days: { '2026-11-23': { a: { ot: 2, wis: 80, nt: 2 }, r: { ot: 500, wis: 600, nt: 0 }, n: 'v2 note' } }, topics: {} };
    localStorage.setItem(STUDY_KEY, JSON.stringify(old));
    studyLoad();
    const d = study.days['2026-11-23'];
    eq(d.a.filter(Boolean).join() + '|' + d.r.filter(Boolean).join(), 'GEN:2:1,PSA:72:1|500,600', 'Genesis 2:1–17 and Psalm 72, the two that were read:');
    eq(d.n, 'v2 note', 'the note:');
    ok(!studyReadIds().has('MAT:1:18'), 'the New Testament lesson that was not read is not marked');
  });

  t('an old export (three tracks) imported into the new plan adds its marks and notes, by lesson name', () => {
    reset();
    const old = { v: 1, days: { '2026-10-01': { a: { ot: 5, wis: 9, nt: 2 }, r: { ot: 5, wis: 6, nt: 7 }, n: 'kept note' } }, topics: {} };
    const added = studyImport(old);
    ok(added > 0, 'something was added');
    const d = study.days['2026-10-01'];
    eq(d.r.join(), '5,6,7', 'the three marks came in:'); eq(d.n, 'kept note', 'and the note:');
    eq(d.a.join(), 'GEN:1:1,PSA:71:1,MAT:1:1', 'as the first lessons of each old track:');
  });

  t('Export carries Study, and Import only ever adds: nothing here is replaced or removed', () => {
    reset();
    readAll('2026-11-22'); study.days['2026-11-22'].n = 'my note'; study.topics.abraham = { 'GEN 12:1-9': 100 }; studySaveNow();
    const out = collectForExport();
    ok(out.study && out.study.days['2026-11-22'], 'exported');
    const snapshot = JSON.stringify(out.study), firstId = out.study.days['2026-11-22'].a[0];
    study = studyNormalize(null);
    studyAssign('2026-11-25'); study.days['2026-11-25'].r[0] = 77; study.days['2026-11-22'] = { a: [firstId, null, null], r: [5, 0, 0], n: '' };
    const added = studyImport(JSON.parse(snapshot));
    ok(added > 0, 'something was added');
    ok(study.days['2026-11-25'].r[0] === 77, 'a day only here is kept');
    const d = study.days['2026-11-22'];
    const want = out.study.days['2026-11-22'].a.filter(Boolean).length;
    ok(d.r[0] > 5 && d.a.filter(Boolean).length === want && d.r.filter((x, i) => d.a[i]).every(x => x > 5) && d.n === 'my note', 'the imported marks and note fill in what was empty, without lowering anything');
    eq(study.topics.abraham['GEN 12:1-9'], 100, 'journey marks:');
    eq(studyImport({ days: 'junk' }), 0, 'junk adds nothing:');
  });

  t('an import matches lessons by name, whatever slot each device had them in, and an older mark never lowers a newer one', () => {
    reset();
    const A = STUDY_OT[0].id, B = STUDY_OT[1].id, C = STUDY_NT[0].id;
    study.days['2026-11-22'] = { a: [B, null, null], r: [5, 0, 0], n: '' };            // this device has only B, in the first slot
    studyImport({ v: 3, days: { '2026-11-22': { a: [A, B, C], r: [100, 200, 300], n: '' } }, topics: {} });   // the other had A, B, C
    const d = study.days['2026-11-22'], at = (id) => d.a.indexOf(id);
    eq(JSON.stringify([...d.a].sort()), JSON.stringify([A, B, C].sort()), 'all three lessons, each once:');
    eq(d.r[at(B)], 200, 'the lesson both had takes the later time:'); eq(d.r[at(A)], 100, 'A came in with its time:'); eq(d.r[at(C)], 300, 'C came in with its time:');
    studyImport({ v: 3, days: { '2026-11-22': { a: [B, null, null], r: [1, 0, 0], n: '' } }, topics: {} });
    eq(d.r[at(B)], 200, 'an older mark did not lower it:');
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

  t('Genesis 1 reads right: an overview of sensible length, a question, a prayer, a line to carry, no markup left', async () => {
    const d = (await (await fetch('/study/GEN.json')).json())['1'];
    ok(d.o && d.o.length > 120 && d.o.length <= 560, 'an overview of sensible length: ' + (d.o || '').length);
    ok(d.q && d.q.length >= 1 && d.p && d.l && d.s, 'a question, a prayer, a line to carry and a story title');
    ok(!/[<>]|&[a-z]+;|\[\[|scripRef/.test(d.o + d.i), 'no markup left in the text');
  });

  t('the journeys are Walk the Stories’ own: thirteen of them, each a list of passages with a title', async () => {
    const j = await (await fetch('/study/journeys.json')).json();
    eq(j.length, 13, 'journeys:');
    ok(j.every(x => x.id && x.n && x.i.length >= 3 && x.i.every(p => /^\w{3} \d+/.test(p.r) && p.t)), 'every one has passages with a reference and a title');
    ok(j.some(x => x.id === 'abraham'), 'Abraham’s road is there');
  });

  t('with the content unreachable the day’s lessons still show from the plan, the lesson says it needs a connection, and everything is tried again on the next visit', async () => {
    reset(); leadToThree();
    try { await caches.delete(STUDY_CACHE); } catch (e) {}           // nothing kept from an earlier test, so a fetch really is needed
    const realFetch = window.fetch; let calls = 0;
    window.fetch = (u, o) => /\/study\//.test(String(u)) ? (calls++, Promise.resolve({ ok: false, status: 404, json: async () => ({}) })) : realFetch(u, o);
    try {
      setMode('study'); await wait(600);
      eq(document.querySelectorAll('.st-card').length, 3, 'the three lessons still show:');
      eq([...document.querySelectorAll('.st-ref')].map(x => x.textContent).join(' | '), refsOf(dayKey()), 'from the plan, which needs no connection:');
      ok(document.querySelectorAll('.st-min').length === 3 && document.querySelector('.st-tot'), 'the minutes are in the page, so they show even now');
      tap('[data-st="lesson:0"]'); await wait(500);
      ok(/needs a connection the first time/.test(document.querySelector('#rd-inner').textContent), 'the lesson says so');
      ok(calls >= 3, 'it tried: ' + calls);
      readerClose();
      const before = calls; studyEnter(); await wait(500);
      ok(calls > before, 'and tries again on the next visit');
    } finally { window.fetch = realFetch; readerClose(); setMode('daily'); }
  });

  // ============ Study: the screen ============
  const openedUrls = []; const realOpen = window.open;
  const captureOpen = () => { openedUrls.length = 0; window.open = (u) => { openedUrls.push(String(u)); return null; }; };
  const releaseOpen = () => { window.open = realOpen; };
  t('the Study tab shows today’s lessons with their stories and minutes, loaded from the site', async () => {
    reset(); setMode('study'); await wait(900);
    eq([...document.querySelectorAll('.st-ref')].map(x => x.textContent).join(' | '), refsOf(dayKey()), 'the lessons:');
    eq(document.querySelectorAll('.st-card').length, 2, 'day one is two lessons:');
    eq([...document.querySelectorAll('.st-story')].length, 2, 'a story title under each lesson that begins a chapter (both do on day one): ' + document.querySelectorAll('.st-story').length);
    eq(document.querySelectorAll('.st-min').length, 2, 'minutes on each:');
    const mins = [...document.querySelectorAll('.st-min')].map(x => parseInt(x.textContent, 10));
    eq(document.querySelector('.st-tot').textContent, mins.reduce((a, b) => a + b, 0) + ' min', 'and the day’s total:');
    eq([...document.querySelectorAll('#workspace > .view.active')].map(v => v.id).join(','), 'study-view', 'only the Study screen shows:');
    setMode('daily');
  });

  t('Lesson opens the reader, inside the app, on the Lesson tab at that card’s passage', async () => {
    reset(); setMode('study'); await wait(900); captureOpen();
    try {
      const at = (sel) => { tap(sel); const s = rdState, r = [s.code, s.ch, s.v1, s.v2, s.tab].join(' '); readerClose(); return r; };
      eq(at('[data-st="lesson:0"]'), 'GEN 1 1 19 lesson', 'the first:');
      eq(at('[data-st="lesson:1"]'), 'MAT 1 1 17 lesson', 'Matthew, the second on a day of two:');
      eq(openedUrls.length, 0, 'addresses opened outside the app:');
    } finally { releaseOpen(); readerClose(); setMode('daily'); }
  });

  t('Mark as read saves at once, moves the ring, can be undone, and finishing the last lesson of the day completes it', async () => {
    reset(); leadToThree(); setMode('study'); await wait(700);
    tap('[data-st="done:0"]');
    ok(stored().days[dayKey()].r[0] > 0, 'on disk straight away');
    eq(document.querySelector('.st-meta b').textContent, '1/3', 'today:');
    ok(document.querySelector('.st-card[data-t="0"]').classList.contains('done'), 'the card shows it is read');
    ok(!studyDayDone(dayKey()), 'one lesson of three is not yet a day');
    tap('[data-st="done:0"]');
    eq(stored().days[dayKey()].r[0], 0, 'un-marked on disk:'); eq(document.querySelector('.st-meta b').textContent, '0/3', 'today:');
    [0, 1, 2].forEach(x => tap('[data-st="done:' + x + '"]'));
    eq(document.querySelector('.st-meta b').textContent, '3/3', 'all three:');
    ok(studyDayDone(dayKey()) && studyStreaks().current === 1, 'the day counts and the streak is 1');
    eq(document.querySelector('.st-core b').textContent, '1', 'the ring shows the streak:');
    setMode('daily');
  });

  t('the Lesson reads in order: the passage, Henry in brief, a question to think about, the prayer (round 19 checks each against its source)', async () => {
    reset(); setMode('study'); await wait(900); tap('[data-st="lesson:0"]'); await wait(900);
    const heads = [...document.querySelectorAll('#rd-inner .rd-h')].map(x => x.textContent.replace(/ ·.*/, '')).join(',');
    eq(heads, 'Read,Think about it,Pray', 'sections (Henry is woven into the reading, not a section of his own):');
    readerClose(); setMode('daily');
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
    captureOpen(); try { tap('.st-jp .st-jt'); eq(rdState.open && rdState.code + ' ' + rdState.ch + ':' + rdState.v1 + '-' + rdState.v2, 'GEN 11:27-32', 'opens the passage in the reader:'); eq(openedUrls.length, 0, 'and nothing outside the app:'); } finally { releaseOpen(); readerClose(); }
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
    ok(lightest < 0.012, 'the lightest colour in the backdrop has luminance ' + lightest.toFixed(4) + ' (the old blue was 0.18, the first dark pass 0.016)');
    ok(lum(rgba(getComputedStyle(document.body).backgroundColor)) < 0.005, 'and so is the page behind it');
    ok(Number(getComputedStyle(document.querySelector('.bokeh')).opacity) <= 0.08, 'the glow blobs are dim');
  });

  t('no navy tint is left in the panels: the sidebar, top bar, tab bar and cards are neutral near black', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const css = src.slice(0, src.indexOf('</style>'));
    eq((css.match(/rgba\(10, 37, 64,/g) || []).length, 0, 'translucent navy (10, 37, 64) in the styles:');
    eq((css.match(/rgba\(6, 24, 44,/g) || []).length, 0, 'translucent navy (6, 24, 44) in the styles:');
    for (const sel of ['#sidebar', '#topbar', '.mode-switch']) {
      const c = rgba(getComputedStyle(document.querySelector(sel)).backgroundColor);
      ok(!c || c.a === 0 || Math.max(c.r, c.g, c.b) <= 24, sel + ' background is tinted: ' + JSON.stringify(c));
    }
    const glass = getComputedStyle(document.documentElement).getPropertyValue('--glass-bg');
    const alphas = (glass.match(/rgba\(255,\s*255,\s*255,\s*[0-9.]+\)/g) || []).map(x => Number(/([0-9.]+)\)$/.exec(x)[1]));
    ok(alphas.length >= 3 && Math.max(...alphas) <= 0.06, 'the glass panels let little light in (white at ' + alphas.join(', ') + '):');
  });

  t('the paper is dark too: the journal pages and the grievance card are dark with light ink, and the Grief river is a night river', async () => {
    reset();
    const stopsOf = el => (getComputedStyle(el).backgroundImage.match(/rgba?\([^)]*\)/g) || []).map(rgba).filter(Boolean).filter(c => c.a > 0.5);
    const lightestL = el => Math.max(...stopsOf(el).map(lum));
    setMode('journal'); await wait(200);
    const card = document.querySelector('#journal-card');
    ok(lightestL(card) < 0.03, 'the journal page: ' + lightestL(card).toFixed(3));
    ok(lightestL(document.querySelector('#journal-card-companion')) < 0.03, 'the companion page');
    const ink = rgba(getComputedStyle(document.querySelector('#journal-text')).color), inkTitle = rgba(getComputedStyle(document.querySelector('#journal-title')).color);
    ok(lum(ink) > 0.6 && lum(inkTitle) > 0.6, 'light ink on it: ' + JSON.stringify([ink, inkTitle]));
    ok(ratio(ink, { r: 24, g: 28, b: 34 }) >= 7, 'and it reads: ' + ratio(ink, { r: 24, g: 28, b: 34 }).toFixed(1) + ':1');
    setMode('grievance'); await wait(200);
    ok(lightestL(document.querySelector('#grievance-card')) < 0.03, 'the grievance card');
    ok(lum(rgba(getComputedStyle(document.querySelector('#grievance-text')).color)) > 0.6, 'with light ink');
    ok(lum(rgba(getComputedStyle(document.querySelector('.grievance-header')).color)) > 0.4, 'and a light heading');
    setMode('grief'); await wait(200);
    ok(lightestL(document.querySelector('#grief-canvas')) < 0.03, 'the river banks: ' + lightestL(document.querySelector('#grief-canvas')).toFixed(3));
    ok(lightestL(document.querySelector('.river-water')) < 0.06, 'the river water: ' + lightestL(document.querySelector('.river-water')).toFixed(3));
    setMode('daily');
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
  const BASE = { r: 11, g: 20, b: 31, a: 1 };            // the lightest point of the backdrop
  t('every piece of text on the Study screens, home and a journey, passes the 4.5:1 bar', async () => {
    reset(); setMode('study'); await wait(900);
    tap('[data-st="done:1"]'); document.querySelector('#st-note').value = 'a note'; await wait(100);
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
