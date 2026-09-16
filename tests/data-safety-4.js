/* Round 4 — adding a daily question must never change a day that is already
   finished. Same contract: runAll4().

   Every check-in carries `from`, and a day is judged only against the
   questions THAT day was asked. 1.6.3 adds "What's a belief, dream or goal you
   want to add to your life?" from 2026-09-12, because 2026-09-11 was already
   complete when it was written — a finished day must keep its streak and its
   100%, not lose them because the app grew a new question. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;

  const NEW_KEY    = 'add';
  const FIRST_DAY  = '2026-09-12';   // the first day that asks it
  const DAY_BEFORE = '2026-09-11';   // the last day that does not

  function reset() {
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={};
    state.current = { thought:null, grievance:null, journal:null };
    hasLoadedFromCloud = true; currentUser = null;
  }
  const newQuestion = () => CHECKIN.find(c => c.k === NEW_KEY);
  const cardFor = q => [...document.querySelectorAll('#checkin-grid .ci-card')]
    .find(c => c.querySelector('.ci-q').textContent === q);

  /** Answer everything a day asks, through the real inputs, skipping `skip`. */
  function fillDay(day, skip) {
    skip = skip || [];
    renderDaily(day);
    const byQ = {};
    CHECKIN.forEach(c => { byQ[c.q] = c; (c.was || []).forEach(w => { byQ[w.q] = c; }); });
    document.querySelectorAll('#checkin-grid .ci-card').forEach(card => {
      const c = byQ[card.querySelector('.ci-q').textContent];
      if (!c || skip.indexOf(c.k) >= 0) return;
      const ta = card.querySelector('.ci-input');
      if (ta) { ta.value = 'answer for ' + c.k; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      const opt = card.querySelector('.scale-opt[data-v="4"]');
      if (opt) opt.click();
    });
    document.querySelectorAll('.depth-card .depth-input').forEach((ta, i) => {
      ta.value = 'answer to question ' + (i + 1); ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const sc = document.querySelector('#sc-done');
    if (sc && !((state.daily[day] || {}).sc || {}).done) sc.click();
    return state.daily[day];
  }

  t('a day that was already finished stays finished', () => {
    reset();
    const e = fillDay(DAY_BEFORE);
    ok(dayCounts(e), 'the last day before the new question must still count');
    eq(filledCount(e), slotsFor(DAY_BEFORE), 'and must still read 100%');
    ok(!checkinsFor(DAY_BEFORE).some(c => c.k === NEW_KEY), 'the new question must not be asked on it');
  });

  t('the new question is asked from 2026-09-12, and not before', () => {
    const q = newQuestion();
    ok(q, 'the new check-in must exist');
    eq(q.type, 'text', 'it takes a written answer');
    ok(/belief/i.test(q.q) && /dream/i.test(q.q) && /goal/i.test(q.q), `it must ask about a belief, dream or goal — got "${q.q}"`);
    ok(!checkinsFor(DAY_BEFORE).some(c => c.k === NEW_KEY), 'not asked on ' + DAY_BEFORE);
    ok(checkinsFor(FIRST_DAY).some(c => c.k === NEW_KEY), 'asked on ' + FIRST_DAY);
    ok(checkinsFor('2027-03-01').some(c => c.k === NEW_KEY), 'and every day after');
  });

  t('from 2026-09-12 a day is not complete until it is answered', () => {
    reset();
    const q = newQuestion(); ok(q, 'the new check-in must exist');
    const partial = fillDay(FIRST_DAY, [NEW_KEY]);
    ok(!dayCounts(partial), 'a day missing the new answer must not count toward the streak');
    const card = cardFor(q.q);
    ok(card, 'the new question must be on screen');
    const ta = card.querySelector('.ci-input');
    ta.value = 'A steadier faith.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ok(dayCounts(state.daily[FIRST_DAY]), 'and must count once it is answered');
    eq(state.daily[FIRST_DAY].ci[NEW_KEY], 'A steadier faith.', 'stored under its own key');
  });

  t('the new answer is written to disk and survives a reload', () => {
    reset();
    const q = newQuestion(); ok(q, 'the new check-in must exist');
    fillDay(FIRST_DAY);
    const written = state.daily[FIRST_DAY].ci[NEW_KEY];
    ok(written, 'the question must have been answered');
    persist();
    state.daily = {}; loadState();
    eq((state.daily[FIRST_DAY].ci || {})[NEW_KEY], written, 'answer must come back after a reload');
    const wal = JSON.parse(localStorage.getItem('stillwater_wal') || '{}');
    eq(((wal[FIRST_DAY] || {})['ci:' + NEW_KEY] || {}).v, written, 'the keystroke log must hold its own copy');
  });

  t('answers already written are untouched by the new question', () => {
    reset();
    const e = fillDay(DAY_BEFORE);
    const before = JSON.stringify(e.ci);
    const answers = JSON.stringify((e.dp || []).map(d => [d.id, d.a]));
    const filled = filledCount(e);
    renderDaily(DAY_BEFORE); renderDaily(FIRST_DAY); renderDaily(DAY_BEFORE);
    const after = state.daily[DAY_BEFORE];
    eq(JSON.stringify(after.ci), before, 'check-in answers');
    eq(JSON.stringify((after.dp || []).map(d => [d.id, d.a])), answers, 'question answers');
    eq(filledCount(after), filled, 'nothing counted as lost');
    ok(dayCounts(after), 'and the day still counts');
  });

  t('a finished run of days keeps every day it had', () => {
    reset();
    ['2026-09-09', '2026-09-10', '2026-09-11'].forEach(d => fillDay(d));
    const s = computeStreaks();
    eq(s.total, 3, 'every finished day still counts');
    ok(s.longest >= 3, `a three-day run, got ${s.longest}`);
  });

  async function runAll4() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    renderDaily();
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll4 = runAll4;
})();
