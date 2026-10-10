/* Round 10 — never ask something twice while fresh questions are waiting.
   Same contract: runAll10().

   The rotation walks a fixed shuffle of the whole bank, so ADDING questions
   reshuffles it. In 1.6.8 that brought already-answered questions back round
   while unanswered ones were still waiting — two came up on 2026-10-10. The
   rotation now skips anything already answered until the bank is exhausted,
   and a blank question already answered on another day is swapped out when the
   day is opened. Answers are never touched by any of it. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;
  const BACK = ['betrayal', 'past', 'trigger'];
  const FWD  = ['healing', 'rebuild', 'forward', 'growth', 'future', 'change', 'grateful', 'secure'];

  function reset() {
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = true; currentUser = null;
    if (typeof dailyTimer !== 'undefined' && dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  }
  /** Mark `ids` as answered, spread over past days, the way real use would. */
  function markAnswered(ids) {
    ids.forEach((id, i) => {
      const day = dayKey(addDays(new Date(), -(400 + i)));
      state.daily[day] = { d: day, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' },
        dp: [{ id, theme: 'self', q: 'asked back then', a: 'answered back then' }], ts: 1 };
    });
  }
  const someIds = n => Array.from({ length: n }, (_, i) => 'q' + Math.floor(i * DEPTHS.length / n));
  const days = (n, from) => Array.from({ length: n }, (_, i) => dayKey(addDays(from || new Date(), i)));

  t('a question already answered is not asked again while fresh ones are waiting', () => {
    reset();
    const answered = new Set(someIds(176));
    markAnswered([...answered]);
    const repeats = [];
    for (const d of days(90)) for (const q of depthsFor(d)) if (answered.has(q.id)) repeats.push(d + ' ' + q.id);
    eq(repeats.length, 0, `questions asked again (${repeats.slice(0, 4).join(', ')}):`);
  });

  t('the day still leans forward and looks back at most once', () => {
    reset();
    markAnswered(someIds(176));
    const bad = [];
    for (const d of days(90)) {
      const qs = depthsFor(d);
      if (qs.filter(q => BACK.indexOf(q.theme) >= 0).length > 1) bad.push(d + ' looks back twice');
      if (!qs.some(q => FWD.indexOf(q.theme) >= 0)) bad.push(d + ' has nothing forward');
    }
    eq(bad.length, 0, `(${bad.slice(0, 4).join('; ')}):`);
  });

  t('a day never asks the same question twice', () => {
    reset();
    markAnswered(someIds(176));
    const bad = days(200).filter(d => { const ids = depthsFor(d).map(q => q.id); return new Set(ids).size !== ids.length; });
    eq(bad.length, 0, `days with a repeat (${bad.slice(0, 3).join(', ')}):`);
  });

  t('every question that has not been answered comes round', () => {
    reset();
    const answered = new Set(someIds(176));
    markAnswered([...answered]);
    const waiting = new Set(DEPTHS.map((_, i) => 'q' + i).filter(id => !answered.has(id)));
    for (const d of days(400)) for (const q of depthsFor(d)) waiting.delete(q.id);
    eq(waiting.size, 0, `questions that never came up in 400 days (${[...waiting].slice(0, 4).join(', ')}):`);
  });

  t('once the whole bank has been answered, a day is still filled', () => {
    reset();
    markAnswered(DEPTHS.map((_, i) => 'q' + i));
    const qs = depthsFor(dayKey());
    eq(qs.length, depthsPerDay(dayKey()), 'questions on a day with nothing fresh left:');
    eq(new Set(qs.map(q => q.id)).size, qs.length, 'and all different:');
  });

  t('a blank question you already answered is swapped for a fresh one when the day opens', () => {
    reset();
    const old1 = 'q248', old2 = 'q59';
    markAnswered([old1, old2]);
    const day = dayKey();
    state.daily[day] = { d: day, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, ts: 1,
      dp: [
        { id: 'q11', theme: 'self', q: 'ANSWERED TODAY', a: 'what I wrote today' },
        { id: old1, theme: 'growth', q: 'ALREADY ANSWERED BEFORE', a: '' },
        { id: old2, theme: 'body',   q: 'ALSO ANSWERED BEFORE',   a: '' },
      ] };
    state.mode = 'daily'; renderDaily(day);
    const now = state.daily[day].dp;
    eq(now.length, 3, 'the day keeps its number of questions:');
    eq(JSON.stringify(now[0]), JSON.stringify({ id: 'q11', theme: 'self', q: 'ANSWERED TODAY', a: 'what I wrote today' }),
      'the answered one is untouched:');
    ok(now[1].id !== old1 && now[2].id !== old2, 'the two already-answered blanks were swapped out');
    const answered = answeredDepthIds();
    ok(!answered.has(now[1].id) && !answered.has(now[2].id), 'and what replaced them has not been answered');
    eq(new Set(now.map(d => d.id)).size, 3, 'no duplicate in the day:');
    renderDaily();
  });

  t('the swap leaves every answer alone, even one answered on two days', () => {
    reset();
    const dup = 'q100';
    markAnswered([dup]);
    const day = dayKey();
    state.daily[day] = { d: day, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, ts: 1,
      dp: [{ id: dup, theme: 'growth', q: 'ANSWERED ON BOTH DAYS', a: 'today’s answer' }] };
    const before = JSON.stringify(state.daily[day].dp);
    state.mode = 'daily'; renderDaily(day);
    eq(JSON.stringify(state.daily[day].dp), before, 'an answered question stays exactly as it was:');
    renderDaily();
  });

  async function runAll10() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); setMode('daily'); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll10 = runAll10;
})();
