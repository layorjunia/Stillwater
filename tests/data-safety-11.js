/* Round 11 — the daily set changes shape without re-judging any day.
   Same contract: runAll11().

   From 2026-10-12: "What is one thing you will do today that moves you
   forward?" is asked every day, and the two belief/dream questions move from
   daily to Sundays. Every day up to and including 2026-10-11 keeps exactly the
   shape it had — a finished day must never lose its streak or its 100% because
   the app changed what it asks. Days are judged against what THEY were asked. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;

  const NEW_Q   = 'What is one thing you will do today that moves you forward?';
  const LAST_OLD = '2026-10-11';   // a Sunday: asks everything it always did
  const FIRST    = '2026-10-12';   // a Monday: the first day of the new shape
  const WEEKLY   = ['letgo', 'add'];

  const keys = d => checkinsFor(d).map(c => c.k);
  const asks = (d, k) => keys(d).indexOf(k) >= 0;
  const dow = d => keyToDate(d).getDay();

  function reset() {
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev', 'stillwater_wal_checkins'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = true; currentUser = null;
    if (typeof dailyTimer !== 'undefined' && dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  }
  const day = (d, over) => Object.assign(
    { d, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 }, over || {});
  /** Everything a day asks, answered. */
  function fullDay(d, skip) {
    skip = skip || [];
    const e = day(d, { sc: { done: true, note: '' } });
    checkinsFor(d).forEach(c => { if (skip.indexOf(c.k) < 0) e.ci[c.k] = c.type === 'scale' ? 4 : 'answer for ' + c.k; });
    for (let i = 0; i < depthsPerDay(d); i++) e.dp.push({ id: 'q' + i, q: 'Question ' + i, theme: 'self', a: 'answer ' + i });
    if (reframeApplies(d)) e.rf = { bother: 'a bother', opposite: 'an opposite' };
    return e;
  }
  const nextSunday = from => { let d = keyToDate(from); while (d.getDay() !== SUNDAY) d = addDays(d, 1); return dayKey(d); };
  const cardTexts = () => [...document.querySelectorAll('#checkin-grid .ci-q')].map(n => n.textContent);

  t('every day up to and including 2026-10-11 asks exactly what it always did', () => {
    // The set as it stood in 1.6.9, pinned by explicit key lists.
    const base = ['mental', 'emotional', 'physical', 'spiritual'];
    const expected = {
      '2026-08-23': base.concat(['carrying', 'complete', 'good']),
      '2026-08-31': base.concat(['carrying', 'good', 'letgo']),
      '2026-09-04': base.concat(['carrying', 'good', 'letgo']),
      '2026-09-05': base.concat(['progress', 'where', 'good', 'letgo']),
      '2026-09-11': base.concat(['progress', 'where', 'good', 'letgo']),
      '2026-09-12': base.concat(['progress', 'where', 'good', 'letgo', 'add']),
      '2026-10-10': base.concat(['progress', 'where', 'good', 'letgo', 'add']),   // Saturday
      '2026-10-11': base.concat(['progress', 'where', 'good', 'letgo', 'add']),   // Sunday
    };
    for (const [d, want] of Object.entries(expected)) {
      eq(keys(d).slice().sort().join(','), want.slice().sort().join(','), d + ' asks:');
    }
  });

  t('days keep the same number of questions as before the change', () => {
    eq(slotsFor('2026-09-11'), 13, '2026-09-11:');
    eq(slotsFor('2026-10-10'), 14, '2026-10-10:');
    eq(slotsFor(LAST_OLD), 14, LAST_OLD + ':');
  });

  t('the new question is asked every day from 2026-10-12, and not before', () => {
    const c = CHECKIN.find(x => x.k === 'forward');
    ok(c, 'the new check-in must exist');
    eq(c.type, 'text', 'a written answer:');
    eq(c.q, NEW_Q, 'wording:');
    ok(!asks(LAST_OLD, 'forward'), 'not asked on ' + LAST_OLD);
    for (let i = 0; i < 14; i++) {
      const d = dayKey(addDays(keyToDate(FIRST), i));
      ok(asks(d, 'forward'), 'asked on ' + d);
    }
    ok(asks('2027-06-01', 'forward') && asks('2027-06-06', 'forward'), 'and every day after');
  });

  t('the belief/dream questions are asked on Sundays only from 2026-10-12', () => {
    for (let i = 0; i < 28; i++) {
      const d = dayKey(addDays(keyToDate(FIRST), i));
      WEEKLY.forEach(k => eq(asks(d, k), dow(d) === SUNDAY, `${k} on ${d} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow(d)]}):`));
    }
    ok(asks('2026-10-18', 'letgo') && asks('2026-10-18', 'add'), 'both on 2026-10-18');
    ok(!asks('2026-10-17', 'letgo') && !asks('2026-10-17', 'add'), 'neither on 2026-10-17');
  });

  t('a day has the right number of questions: 13 on weekdays and Saturday, 15 on Sunday', () => {
    for (let i = 0; i < 23; i++) {          // 2026-10-12 .. 2026-11-03; round 14 pins the days after
      const d = dayKey(addDays(keyToDate(FIRST), i));
      eq(slotsFor(d), dow(d) === SUNDAY ? 15 : 13, d + ' (' + dow(d) + '):');
    }
  });

  t('2026-10-11 is not re-judged: a finished Sunday stays finished at 100%', () => {
    reset();
    const e = fullDay(LAST_OLD);
    ok(!('forward' in e.ci), 'setup: it was finished without the new question');
    ok(dayCounts(e), 'the last day of the old shape must still count');
    eq(filledCount(e), slotsFor(LAST_OLD), 'and still reads 100%:');
  });

  t('from 2026-10-12 a day is not finished until the new question is answered', () => {
    reset();
    const without = fullDay(FIRST, ['forward']);
    ok(!dayCounts(without), 'a Monday missing the new answer must not count');
    const withIt = fullDay(FIRST);
    ok(dayCounts(withIt), 'a Monday with everything it asks must count');
    ok(!('letgo' in withIt.ci) && !('add' in withIt.ci), 'and it was not asked the weekly pair');
  });

  t('a Sunday needs the weekly pair, a weekday does not', () => {
    reset();
    const sun = nextSunday(FIRST);
    ok(!dayCounts(fullDay(sun, ['letgo'])), sun + ' without "let go" must not count');
    ok(!dayCounts(fullDay(sun, ['add'])), sun + ' without "add" must not count');
    ok(dayCounts(fullDay(sun)), sun + ' with both must count');
    const tue = dayKey(addDays(keyToDate(FIRST), 1));
    ok(dayCounts(fullDay(tue)), 'a Tuesday without them counts');
  });

  t('a weekly answer already written on another day of the week is kept and shown', () => {
    reset();
    const wed = '2026-10-14';
    state.daily[wed] = fullDay(wed);
    state.daily[wed].ci.letgo = 'WRITTEN-BEFORE-THE-UPDATE';
    state.mode = 'daily'; renderDaily(wed);
    ok(cardTexts().some(q => /old belief, goal or dream/.test(q)), 'the question that holds an answer is shown');
    const ta = [...document.querySelectorAll('#checkin-grid .ci-card')]
      .find(c => /old belief/.test(c.querySelector('.ci-q').textContent)).querySelector('.ci-input');
    eq(ta.value, 'WRITTEN-BEFORE-THE-UPDATE', 'with its answer:');
    eq(state.daily[wed].ci.letgo, 'WRITTEN-BEFORE-THE-UPDATE', 'and in state:');
    ok(dayCounts(state.daily[wed]), 'it does not change whether the day counts');
    renderDaily();
  });

  t('a weekday shows the new question and not the weekly pair', () => {
    reset();
    state.mode = 'daily'; renderDaily('2026-10-13');
    const q = cardTexts();
    ok(q.indexOf(NEW_Q) >= 0, 'the new question is on screen');
    ok(!q.some(x => /old belief, goal or dream/.test(x)), 'the "let go" question is not');
    ok(!q.some(x => /belief, dream or goal you want to add/.test(x)), 'the "add" question is not');
    renderDaily('2026-10-18');
    const s = cardTexts();
    ok(s.indexOf(NEW_Q) >= 0, 'Sunday has the new question');
    ok(s.some(x => /old belief, goal or dream/.test(x)) && s.some(x => /belief, dream or goal you want to add/.test(x)), 'and both weekly ones');
    ok(s.indexOf(NEW_Q) < s.findIndex(x => /old belief, goal or dream/.test(x)), 'new question sits before the weekly pair');
    renderDaily();
  });

  t('the new answer is written to disk, the keystroke log, and survives a reload', () => {
    reset();
    state.mode = 'daily'; renderDaily(FIRST);
    const card = [...document.querySelectorAll('#checkin-grid .ci-card')].find(c => c.querySelector('.ci-q').textContent === NEW_Q);
    ok(card, 'the new question must be on screen');
    const ta = card.querySelector('.ci-input');
    ta.value = 'Call my brother and go for a walk.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    persist();
    state.daily = {}; loadState();
    eq((state.daily[FIRST].ci || {}).forward, 'Call my brother and go for a walk.', 'after a reload:');
    const wal = JSON.parse(localStorage.getItem('stillwater_wal') || '{}');
    eq(((wal[FIRST] || {})['ci:forward'] || {}).v, 'Call my brother and go for a walk.', 'in the keystroke log:');
    renderDaily();
  });

  t('the streak runs unbroken through the change', () => {
    reset();
    ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13'].forEach(d => { state.daily[d] = fullDay(d); });
    const s = computeStreaks();
    eq(s.total, 6, 'every day counts:');
    ok(s.longest >= 6, `a six-day run across the change, got ${s.longest}`);
  });

  async function runAll11() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); setMode('daily'); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll11 = runAll11;
})();
