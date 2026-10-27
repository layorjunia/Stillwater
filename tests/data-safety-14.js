/* Round 14 — "What do you want?" every day, without ever re-judging a day.
   Same contract: runAll14().

   Asked every day from 2026-10-27, required from 2026-11-04. The week between is
   a grace window: the phone updates itself on its own schedule, so a day finished
   on the previous version of the app must stay finished when the update lands
   afterwards. A day is judged against the questions THAT day was asked, by its
   own date — so a day inside the window stays finished for good. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;

  const Q = 'What do you want?';
  const FIRST = '2026-10-27';          // asked from here (a Tuesday)
  const BEFORE = '2026-10-26';         // the last day that does not ask it
  const GRACE_LAST = '2026-11-03';     // the last day it is asked but not required
  const REQUIRED = '2026-11-04';       // the first day it is required (a Wednesday)

  const keys = d => checkinsFor(d).map(c => c.k);
  const asks = (d, k) => keys(d).indexOf(k) >= 0;
  const dow = d => keyToDate(d).getDay();
  const plus = (d, n) => dayKey(addDays(keyToDate(d), n));

  function reset() {
    ['stillwater_wal', 'stillwater_wal_checkins', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = true; currentUser = null;
    if (typeof dailyTimer !== 'undefined' && dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  }
  const dayOf = (d, over) => Object.assign(
    { d, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 }, over || {});
  /** A day with everything REQUIRED answered; pass `also` to answer more, `skip` to leave some out. */
  function fullDay(d, opts) {
    opts = opts || {};
    const e = dayOf(d, { sc: { done: true, note: '' } });
    const list = opts.also ? checkinsFor(d) : requiredCheckinsFor(d);
    list.forEach(c => { if ((opts.skip || []).indexOf(c.k) < 0) e.ci[c.k] = c.type === 'scale' ? 4 : 'answer for ' + c.k; });
    for (let i = 0; i < depthsPerDay(d); i++) e.dp.push({ id: 'q' + i, q: 'Question ' + i, theme: 'self', a: 'answer ' + i });
    if (reframeApplies(d)) e.rf = { bother: 'a bother', opposite: 'an opposite' };
    return e;
  }
  const texts = () => [...document.querySelectorAll('#checkin-grid .ci-q')].map(n => n.textContent);

  t('the question reads "What do you want?" and takes a written answer', () => {
    const c = CHECKIN.find(x => x.k === 'want');
    ok(c, 'the new check-in must exist');
    eq(c.q, Q, 'wording:');
    eq(c.type, 'text', 'a written answer:');
  });

  t('it is asked every day from 2026-10-27, Sundays included, and not before', () => {
    ok(!asks(BEFORE, 'want') && !asks('2026-10-25', 'want') && !asks('2026-09-30', 'want'), 'not asked before ' + FIRST);
    for (let i = 0; i < 60; i++) { const d = plus(FIRST, i); ok(asks(d, 'want'), 'asked on ' + d + ' (' + dow(d) + ')'); }
    ok(asks('2027-06-01', 'want') && asks('2027-06-06', 'want'), 'and every day after');
  });

  t('on screen it comes right after "Where are you at today?"', () => {
    reset(); state.mode = 'daily'; renderDaily(plus(FIRST, 1));
    const q = texts(), w = q.findIndex(x => /Where are you at today/.test(x));
    ok(w >= 0, 'the "where" question is on screen');
    eq(q[w + 1], Q, 'the question after it:');
    renderDaily();
  });

  t('every day before 2026-10-27 is asked exactly what it was asked before', () => {
    const base = ['mental', 'emotional', 'physical', 'spiritual'];
    const expected = {
      '2026-09-11': base.concat(['progress', 'where', 'good', 'letgo']),
      '2026-09-12': base.concat(['progress', 'where', 'good', 'letgo', 'add']),
      '2026-10-11': base.concat(['progress', 'where', 'good', 'letgo', 'add']),            // Sunday
      '2026-10-12': base.concat(['progress', 'where', 'good', 'forward']),                  // Monday
      '2026-10-25': base.concat(['progress', 'where', 'good', 'forward', 'letgo', 'add']),  // Sunday
      '2026-10-26': base.concat(['progress', 'where', 'good', 'forward']),                  // Monday
    };
    for (const [d, want] of Object.entries(expected)) eq(keys(d).slice().sort().join(','), want.slice().sort().join(','), d + ' asks:');
  });

  t('what a day REQUIRES does not change until 2026-11-04', () => {
    for (let i = 0; i < 8; i++) {
      const d = plus(FIRST, i);
      if (d >= REQUIRED) continue;
      ok(requiredCheckinsFor(d).every(c => c.k !== 'want'), d + ' must not require it');
    }
    ok(requiredCheckinsFor(REQUIRED).some(c => c.k === 'want'), REQUIRED + ' requires it');
    ok(requiredCheckinsFor(plus(REQUIRED, 3)).some(c => c.k === 'want'), 'and every day after');
  });

  t('days keep their question count through 2026-11-03, then gain one', () => {
    for (let i = 0; i <= 14; i++) {
      const d = plus('2026-10-20', i);
      const base = dow(d) === SUNDAY ? 15 : 13;
      eq(slotsFor(d), d >= REQUIRED ? base + 1 : base, d + ' (' + dow(d) + '):');
    }
  });

  t('a day finished before the update arrived is still finished, at 100%', () => {
    reset();
    for (const d of [FIRST, plus(FIRST, 1), GRACE_LAST]) {
      const e = fullDay(d);
      ok(!('want' in e.ci), 'setup: ' + d + ' was finished without the new question');
      ok(dayCounts(e), d + ' must still count');
      eq(filledCount(e), slotsFor(d), d + ' must still read 100%:');
    }
  });

  t('and it stays finished for good, whatever the date is later', () => {
    reset();
    const d = plus(FIRST, 2);                       // inside the window
    state.daily[d] = fullDay(d);
    const clk = installClock(2026, 12, 1, 9, 0);    // a month on
    try { ok(dayCounts(state.daily[d]), d + ' must still count a month later'); }
    finally { clk.restore(); }
  });

  t('answering it during the first week counts, and it shows', () => {
    reset();
    const d = plus(FIRST, 1);
    const e = fullDay(d, { also: true });
    ok(e.ci.want, 'setup: the new question is answered');
    ok(dayCounts(e), 'the day counts');
    ok(filledCount(e) >= slotsFor(d), 'and the answer is counted: ' + filledCount(e) + ' of ' + slotsFor(d));
  });

  t('from 2026-11-04 a day is not finished without it', () => {
    reset();
    for (const d of [REQUIRED, plus(REQUIRED, 4)]) {          // a Wednesday and a Sunday
      ok(!dayCounts(fullDay(d, { also: true, skip: ['want'] })), d + ' without it must not count');
      ok(dayCounts(fullDay(d, { also: true })), d + ' with it must count');
    }
    ok(dow(plus(REQUIRED, 4)) === SUNDAY, 'setup: the second day is a Sunday');
  });

  t('the Sunday pair is untouched', () => {
    for (let i = 0; i < 28; i++) {
      const d = plus(FIRST, i);
      ['letgo', 'add'].forEach(k => eq(asks(d, k), dow(d) === SUNDAY, k + ' on ' + d + ':'));
    }
  });

  t('the answer is written to disk and the keystroke log, and survives a reload', () => {
    reset();
    state.mode = 'daily'; renderDaily(plus(FIRST, 1));
    const d = plus(FIRST, 1);
    const card = [...document.querySelectorAll('#checkin-grid .ci-card')].find(c => c.querySelector('.ci-q').textContent === Q);
    ok(card, 'the question must be on screen');
    const ta = card.querySelector('.ci-input');
    ta.value = 'To feel steady.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    persist();
    state.daily = {}; loadState();
    eq((state.daily[d].ci || {}).want, 'To feel steady.', 'after a reload:');
    const wal = JSON.parse(localStorage.getItem('stillwater_wal') || '{}');
    eq(((wal[d] || {})['ci:want'] || {}).v, 'To feel steady.', 'in the keystroke log:');
    renderDaily();
  });

  t('the streak runs unbroken through the whole change', () => {
    reset();
    const days = [];
    for (let i = -3; i <= 9; i++) days.push(plus(FIRST, i));     // 2026-10-24 .. 2026-11-05
    days.forEach(d => { state.daily[d] = fullDay(d); });
    const s = computeStreaks();
    eq(s.total, days.length, 'every day counts:');
    ok(s.longest >= days.length, `a ${days.length}-day run, got ${s.longest}`);
  });

  function installClock(y, mo, d, h, mi) {
    const R = window.Date;
    const c = { base: new R(y, mo - 1, d, h, mi, 0).getTime(), real0: R.now() };
    const now = () => c.base + (R.now() - c.real0);
    class Fake extends R { constructor(...a) { if (a.length === 0) super(now()); else super(...a); } static now() { return now(); } }
    window.Date = Fake;
    return { restore() { window.Date = R; } };
  }

  async function runAll14() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); setMode('daily'); renderDaily(); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll14 = runAll14;
})();
