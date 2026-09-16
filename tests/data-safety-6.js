/* Round 6 — the calendar and reading view. Same contract: runAll6().

   You can scroll back through every month and read any day. Reading has to be
   harmless: it may never create, change or save a day. And everything that was
   written has to be there to read, under the question it was answered under. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;

  const sheet = () => document.querySelector('#cal-sheet');
  const closeCal = () => { const s = sheet(); if (s) s.hidden = true; };
  function reset() {
    closeCal();
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={};
    state.current = { thought:null, grievance:null, journal:null };
    hasLoadedFromCloud = true; currentUser = null;
    ok(document.querySelector('#calendar-btn') && sheet(), 'the calendar must exist');
  }
  const day = (d, over) => Object.assign(
    { d, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 }, over || {});
  /** A day with everything it asks answered. */
  function fullDay(d) {
    const e = day(d, { sc: { done: true, note: '' } });
    checkinsFor(d).forEach(c => { e.ci[c.k] = c.type === 'scale' ? 4 : 'answer for ' + c.k; });
    for (let i = 0; i < depthsPerDay(d); i++) e.dp.push({ id: 'q' + i, q: 'Question ' + i, theme: 'self', a: 'answer ' + i });
    if (reframeApplies(d)) e.rf = { bother: 'a bother', opposite: 'an opposite' };
    return e;
  }
  function openFromButton() {
    setMode('daily');
    document.querySelector('#calendar-btn').click();
    ok(!sheet().hidden, 'the calendar must open');
  }
  function tapDay(k) {
    const b = document.querySelector(`#cal-months button[data-day="${k}"]`);
    ok(b, `${k} must be tappable in the calendar`);
    b.click();
  }
  const readerText = () => document.querySelector('#cal-reader').textContent;
  const monthName = (y, m) => new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const deviceStore = () => JSON.stringify(Object.keys(localStorage).sort().map(x => [x, localStorage.getItem(x)]));

  t('the calendar opens on this month and scrolls back to the first month with answers', () => {
    reset();
    state.daily['2026-08-24'] = day('2026-08-24', { ci: { mental: 4 } });
    openFromButton();
    const titles = [...document.querySelectorAll('#cal-months .cal-month-title')].map(n => n.textContent);
    const now = new Date();
    eq(titles[0], monthName(now.getFullYear(), now.getMonth()), 'the first month shown');
    eq(titles[titles.length - 1], monthName(2026, 7), 'the last month shown');
    eq(titles.length, (now.getFullYear() * 12 + now.getMonth()) - (2026 * 12 + 7) + 1, 'every month in between, none skipped:');
    closeCal();
  });

  t('finished, started and empty days look different, and only days with answers open', () => {
    reset();
    state.daily['2026-09-14'] = fullDay('2026-09-14');
    state.daily['2026-09-13'] = day('2026-09-13', { ci: { mental: 3 } });
    state.daily['2026-09-12'] = day('2026-09-12');
    ok(dayCounts(state.daily['2026-09-14']), 'setup: the 14th is a finished day');
    openFromButton();
    const cell = k => document.querySelector(`#cal-months [data-day="${k}"]`);
    ok(cell('2026-09-14') && cell('2026-09-14').classList.contains('done'), 'a finished day is marked finished');
    ok(cell('2026-09-13') && cell('2026-09-13').classList.contains('part'), 'a started day is marked started');
    ok(!cell('2026-09-13').classList.contains('done'), 'and not as finished');
    ok(!cell('2026-09-12'), 'a day holding nothing is not tappable');
    closeCal();
  });

  t('a day shows every answer written on it, under the question it was answered under', () => {
    reset();
    const k = '2026-09-15';
    state.daily[k] = day(k, {
      ci: { mental: 4, where: 'WHERE-ANSWER', good: 'GOOD-ANSWER', letgo: 'LETGO-ANSWER', add: 'ADD-ANSWER' },
      sc: { done: true, note: 'SCRIPTURE-NOTE' },
      dp: [
        { id: 'q11', q: 'QUESTION-ELEVEN', theme: 'self', a: 'DEPTH-ANSWER' },
        { id: 'q7', q: 'QUESTION-EXTRA', theme: 'faith', a: 'EXTRA-ANSWER', extra: true },
        { id: 'q9', q: 'QUESTION-SHORT', theme: 'self', a: 'y' },
      ],
    });
    openFromButton(); tapDay(k);
    const text = readerText();
    ['WHERE-ANSWER', 'GOOD-ANSWER', 'LETGO-ANSWER', 'ADD-ANSWER', 'SCRIPTURE-NOTE', 'DEPTH-ANSWER',
     'EXTRA-ANSWER', 'QUESTION-ELEVEN', 'QUESTION-EXTRA', 'QUESTION-SHORT', passageFor(k), 'Sharp']
      .forEach(x => ok(text.includes(x), `"${x}" must be there to read`));
    ok(text.includes("What's one good thing, however small?"), 'the question as it was asked on ' + k);
    ok(!text.includes("What's something you are grateful for today?"), 'not a later wording');
    closeCal();
  });

  t('a retired question and a Turn It Over answer are still there to read', () => {
    reset();
    state.daily['2026-08-23'] = day('2026-08-23', { ci: { complete: 'COMPLETE-ANSWER' } });
    state.daily['2026-09-01'] = day('2026-09-01', { rf: { bother: 'BOTHER-ANSWER', opposite: 'OPPOSITE-ANSWER' } });
    openFromButton();
    tapDay('2026-08-23');
    ok(readerText().includes('What would make today feel complete?'), 'the retired question');
    ok(readerText().includes('COMPLETE-ANSWER'), 'and its answer');
    document.querySelector('#cal-back').click();
    tapDay('2026-09-01');
    ok(readerText().includes('BOTHER-ANSWER') && readerText().includes('OPPOSITE-ANSWER'), 'Turn It Over answers');
    closeCal();
  });

  t('reading never creates, changes or saves anything', () => {
    reset();
    const recent = dayKey(addDays(new Date(), -2));
    state.daily['2026-09-10'] = fullDay('2026-09-10');
    state.daily['2026-09-12'] = day('2026-09-12', { ci: { good: 'kept' } });
    state.daily[recent] = day(recent, { ci: { where: 'recent' } });
    persist();
    setMode('daily');                                   // where you really start from
    if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    const beforeStore = deviceStore();
    const beforeState = JSON.stringify(state.daily);
    const beforeDays = Object.keys(state.daily).sort().join(',');

    document.querySelector('#calendar-btn').click();
    const days = [...document.querySelectorAll('#cal-months button[data-day]')].map(b => b.dataset.day);
    ok(days.length >= 3, 'every day with answers is offered');
    for (const k of days) {
      tapDay(k);
      for (let n = 0; n < 2; n++) {                     // step back, then forward again
        const step = document.querySelectorAll('#cal-reader [data-go]')[n];
        if (step) step.click();
      }
      document.querySelector('#cal-back').click();
    }
    closeCal();
    const cell = document.querySelector('#heatmap [data-day]');
    ok(cell, 'the heatmap offers the days that hold answers');
    cell.click(); closeCal();
    document.querySelector('#rhythm-cal').click(); closeCal();

    eq(Object.keys(state.daily).sort().join(','), beforeDays, 'no day may be created:');
    eq(JSON.stringify(state.daily), beforeState, 'no answer may change:');
    eq(deviceStore(), beforeStore, 'nothing may be written to the device:');
  });

  t('previous and next step through days with answers, skipping empty days', () => {
    reset();
    state.daily['2026-09-10'] = day('2026-09-10', { ci: { where: 'TENTH' } });
    state.daily['2026-09-11'] = day('2026-09-11');
    state.daily['2026-09-12'] = day('2026-09-12', { ci: { where: 'TWELFTH' } });
    openFromButton(); tapDay('2026-09-12');
    const steps = () => [...document.querySelectorAll('#cal-reader [data-go]')];
    eq(steps()[0].dataset.go, '2026-09-10', 'previous skips the empty 11th:');
    steps()[0].click();
    ok(readerText().includes('TENTH'), 'shows the 10th');
    ok(steps()[0].classList.contains('off'), 'nothing before the 10th');
    steps()[1].click();
    ok(readerText().includes('TWELFTH'), 'next returns to the 12th');
    closeCal();
  });

  t('Edit opens that exact day in the daily editor', () => {
    reset();
    const k = '2026-09-15';
    state.daily[k] = day(k, { ci: { good: 'EDIT-ME' } });
    openFromButton(); tapDay(k);
    document.querySelector('#cal-reader [data-edit]').click();
    ok(sheet().hidden, 'the calendar closes');
    eq(state.mode, 'daily', 'screen');
    eq(dailyKey, k, 'day open in the editor');
    ok([...document.querySelectorAll('#checkin-grid .ci-input')].some(x => x.value === 'EDIT-ME'), 'with its answer ready to edit');
  });

  t('answers are shown as text and never run as code', () => {
    reset();
    const k = '2026-09-15';
    window.__calRan = false;
    state.daily[k] = day(k, {
      ci: { good: '<img src=x onerror="window.__calRan=true">' },
      dp: [{ id: 'q1', q: '<b>bold?</b>', theme: 'self', a: '<script>window.__calRan=true</script>' }],
    });
    openFromButton(); tapDay(k);
    const r = document.querySelector('#cal-reader');
    ok(!r.querySelector('img, script, b'), 'nothing written may turn into page elements');
    ok(r.textContent.includes('<img src=x'), 'the text itself is shown');
    ok(!window.__calRan, 'nothing ran');
    closeCal();
  });

  t('the calendar button shows on the Daily screen', () => {
    reset();
    setMode('journal');
    ok(document.querySelector('#calendar-btn').hidden, 'hidden away from Daily');
    setMode('daily');
    ok(!document.querySelector('#calendar-btn').hidden, 'shown on Daily');
  });

  async function runAll6() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    closeCal();
    setMode('daily');
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll6 = runAll6;
})();
