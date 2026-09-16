/* Round 5 — rewording a daily check-in must never move an answer or re-judge a
   day. Same contract: runAll5().

   1.6.4 rewords "What's one good thing, however small?" to "What's something
   you are grateful for today?" from 2026-09-16. The question keeps its key, so
   every answer stays exactly where it is and every day is asked exactly what it
   was asked before. Days up to 2026-09-15 still show the wording they were
   answered under. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;

  const K        = 'good';
  const OLD      = "What's one good thing, however small?";
  const NEW      = "What's something you are grateful for today?";
  const LAST_OLD = '2026-09-15';   // the last day asked the old wording
  const FIRST    = '2026-09-16';   // the first day asked the new one

  function reset() {
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={};
    state.current = { thought:null, grievance:null, journal:null };
    hasLoadedFromCloud = true; currentUser = null;
  }
  const texts = () => [...document.querySelectorAll('#checkin-grid .ci-q')].map(n => n.textContent);
  const cardFor = q => [...document.querySelectorAll('#checkin-grid .ci-card')]
    .find(c => c.querySelector('.ci-q').textContent === q);
  const wordingOn = day => {
    const c = CHECKIN.find(x => x.k === K);
    return typeof checkinWording === 'function' ? checkinWording(c, day) : c.q;
  };

  /** Answer everything a day asks, through the real inputs, skipping `skip`. */
  function fillDay(day, skip) {
    skip = skip || [];
    state.mode = 'daily'; renderDaily(day);
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

  t('"one good thing" reads "grateful for today" from 2026-09-16', () => {
    ok(typeof checkinWording === 'function', 'a check-in must be able to keep its earlier wording');
    eq(wordingOn('2026-08-24'), OLD, 'an early day');
    eq(wordingOn(LAST_OLD), OLD, LAST_OLD);
    eq(wordingOn(FIRST), NEW, FIRST);
    eq(wordingOn('2027-06-01'), NEW, 'every day after');
  });

  t('the reworded question keeps its key, so no answer moves', () => {
    const matches = CHECKIN.filter(c => [c.q].concat((c.was || []).map(w => w.q)).some(q => q === OLD || q === NEW));
    eq(matches.length, 1, 'one question, not two:');
    eq(matches[0].k, K, 'stored under the same key as before:');
  });

  t('every day is asked exactly what it was asked before', () => {
    // What each day asks in total — check-ins, rotating questions, scripture —
    // as it stood in 1.6.3, before the rewording.
    const before = { '2026-08-24': 11, '2026-08-31': 13, '2026-09-05': 13, '2026-09-11': 13,
                     '2026-09-12': 14, '2026-09-15': 14, '2026-09-16': 14, '2027-06-01': 14 };
    for (const [day, n] of Object.entries(before)) {
      eq(slotsFor(day), n, `${day} asks`);
      ok(checkinsFor(day).some(c => c.k === K), `${day} must still ask it under "${K}"`);
    }
  });

  t('a day before the change still shows the question answered on it', () => {
    reset();
    state.daily[LAST_OLD] = { d: LAST_OLD, ci: { [K]: 'an answer from before' }, sc: { done: false, note: '' },
                              rf: { bother: '', opposite: '' }, dp: [], ts: 1 };
    state.mode = 'daily'; renderDaily(LAST_OLD);
    ok(texts().includes(OLD), 'the old wording must show on ' + LAST_OLD);
    ok(!texts().includes(NEW), 'and the new wording must not');
    eq(cardFor(OLD).querySelector('.ci-input').value, 'an answer from before', 'with its answer');
  });

  t('from 2026-09-16 the new wording is on screen and saves where the old one did', () => {
    reset();
    state.mode = 'daily'; renderDaily(FIRST);
    const card = cardFor(NEW);
    ok(card, 'the gratitude question must be on screen on ' + FIRST);
    ok(!texts().includes(OLD), 'the old wording must be gone from ' + FIRST);
    const ta = card.querySelector('.ci-input');
    ta.value = 'A quiet morning.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    eq(state.daily[FIRST].ci[K], 'A quiet morning.', 'stored under the same key');
    persist();
    state.daily = {}; loadState();
    eq((state.daily[FIRST].ci || {})[K], 'A quiet morning.', 'answer must come back after a reload');
    const wal = JSON.parse(localStorage.getItem('stillwater_wal') || '{}');
    eq(((wal[FIRST] || {})['ci:' + K] || {}).v, 'A quiet morning.', 'the keystroke log must hold its own copy');
  });

  t('an answer written before updating, on the day of the change, stays and the day still counts', () => {
    reset();
    const e = fillDay(FIRST);
    e.ci[K] = 'written before the update arrived';
    persist();
    renderDaily(FIRST);
    const card = cardFor(NEW);
    ok(card, 'the gratitude question must be on screen');
    eq(card.querySelector('.ci-input').value, 'written before the update arrived', 'the answer must show, not blank');
    ok(dayCounts(state.daily[FIRST]), 'the day must still count');
    eq(filledCount(state.daily[FIRST]), slotsFor(FIRST), 'and still read 100%');
  });

  t('a run of days across the change keeps every day', () => {
    reset();
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'];
    days.forEach(d => fillDay(d));
    days.forEach(d => ok(dayCounts(state.daily[d]), d + ' must count'));
    eq(computeStreaks().total, 4, 'every day across the change');
  });

  async function runAll5() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    renderDaily();
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll5 = runAll5;
})();
