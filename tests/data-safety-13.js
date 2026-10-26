/* Round 13 — the day on screen is today the moment the app comes to the front.
   Same contract: runAll13().

   iOS keeps the page alive overnight and freezes its timers while the app is
   suspended. The only thing that rolled the screen over to a new day was a
   once-a-minute timer, so waking the app on Monday morning showed SUNDAY's
   screen — including the two questions that are only asked on Sundays, and
   yesterday's answers — until that timer next fired. Returning to the app must
   check the day immediately, without ever yanking you off something else. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;
  const RealDate = window.Date;
  const SUN = '2026-10-25', MON = '2026-10-26';
  const NEW_Q = 'What is one thing you will do today that moves you forward?';

  function installClock(y, mo, d, h, mi) {
    const c = { base: new RealDate(y, mo - 1, d, h, mi, 0).getTime(), real0: RealDate.now() };
    const now = () => c.base + (RealDate.now() - c.real0);
    class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
      static now() { return now(); }
    }
    window.Date = FakeDate;
    return { set(y2, mo2, d2, h2, mi2) { c.base = new RealDate(y2, mo2 - 1, d2, h2, mi2, 0).getTime(); c.real0 = RealDate.now(); },
             restore() { window.Date = RealDate; } };
  }
  /** Make "the app is in front" true even when the test page is a background tab. */
  function visible(fn) {
    const had = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    try { return fn(); } finally { if (had) Object.defineProperty(document, 'hidden', had); else delete document.hidden; }
  }
  const comeBack = (how) => visible(() => {
    if (how === 'visibilitychange') document.dispatchEvent(new Event('visibilitychange'));
    else if (how === 'pageshow') window.dispatchEvent(new Event('pageshow'));
    else window.dispatchEvent(new Event('focus'));
  });
  const texts = () => [...document.querySelectorAll('#checkin-grid .ci-q')].map(n => n.textContent);
  const pairShown = () => texts().some(q => /old belief, goal or dream|belief, dream or goal you want to add/.test(q));

  function reset() {
    ['stillwater_wal', 'stillwater_wal_checkins', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = true; currentUser = null;
    if (typeof dailyTimer !== 'undefined' && dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
  }

  for (const how of ['visibilitychange', 'pageshow', 'focus']) {
    t(`waking the app on Monday morning shows Monday at once (${how})`, () => {
      reset();
      const clk = installClock(2026, 10, 25, 21, 0);
      try {
        setMode('daily'); renderDaily();
        eq(dailyKey, SUN, 'Sunday evening:');
        ok(pairShown(), 'Sunday shows the belief/dream pair');
        clk.set(2026, 10, 26, 9, 50);          // the page was frozen all night
        comeBack(how);
        eq(dailyKey, MON, 'the day on screen right after waking:');
        ok(!pairShown(), 'Monday must not show the belief/dream pair');
        ok(texts().indexOf(NEW_Q) >= 0, 'Monday shows the new daily question');
        ok(document.querySelector('#daily-date').textContent.indexOf('Monday') >= 0, 'and says Monday at the top');
      } finally { clk.restore(); renderDaily(); }
    });
  }

  t('waking the app on the same day changes nothing and rebuilds nothing', () => {
    reset();
    const clk = installClock(2026, 10, 26, 9, 0);
    try {
      setMode('daily'); renderDaily();
      const card = document.querySelector('#checkin-grid .ci-card');
      for (const how of ['visibilitychange', 'pageshow', 'focus']) comeBack(how);
      ok(document.querySelector('#checkin-grid .ci-card') === card, 'the screen must not be rebuilt under your fingers');
    } finally { clk.restore(); renderDaily(); }
  });

  t('waking the app never pulls you off a past day you are reading', () => {
    reset();
    const clk = installClock(2026, 10, 25, 21, 0);
    try {
      setMode('daily'); renderDaily('2026-10-20');
      eq(viewingToday, false, 'viewing a past day:');
      clk.set(2026, 10, 26, 9, 50);
      comeBack('visibilitychange'); comeBack('focus');
      eq(dailyKey, '2026-10-20', 'still on the past day:');
    } finally { clk.restore(); renderDaily(); }
  });

  t('waking the app never switches you away from another tab', () => {
    reset();
    const clk = installClock(2026, 10, 25, 21, 0);
    try {
      setMode('daily'); renderDaily();
      setMode('journal');
      clk.set(2026, 10, 26, 9, 50);
      comeBack('visibilitychange');
      eq(state.mode, 'journal', 'still on the Journal tab:');
    } finally { clk.restore(); setMode('daily'); renderDaily(); }
  });

  t('what was typed on the old day just before it rolled over stays on that day', () => {
    reset();
    const clk = installClock(2026, 10, 25, 23, 59);
    try {
      setMode('daily'); renderDaily();
      const ta = [...document.querySelectorAll('#checkin-grid .ci-card')]
        .find(c => /Where are you at today/.test(c.querySelector('.ci-q').textContent)).querySelector('.ci-input');
      ta.value = 'written a moment before midnight';
      ta.dispatchEvent(new Event('input', { bubbles: true }));     // autosave is still waiting
      clk.set(2026, 10, 26, 0, 1);
      comeBack('focus');
      eq(dailyKey, MON, 'rolled over:');
      eq(state.daily[SUN].ci.where, 'written a moment before midnight', 'on Sunday, in memory:');
      eq(JSON.parse(localStorage.getItem(KEY)).daily[SUN].ci.where, 'written a moment before midnight', 'on Sunday, on disk:');
      ok(!((state.daily[MON] || {}).ci || {}).where, 'and not carried onto Monday');
    } finally { clk.restore(); renderDaily(); }
  });

  t('the once-a-minute check is still there for an app left on screen past midnight', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    ok(/setInterval\(\(\) => rolloverIfNeeded\(\), 60000\)/.test(src), 'the timer must remain');
    ok(/addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) rolloverIfNeeded\(\); \}\)/.test(src)
      && /addEventListener\('pageshow', \(\) => rolloverIfNeeded\(\)\)/.test(src)
      && /addEventListener\('focus', \(\) => rolloverIfNeeded\(\)\)/.test(src), 'and all three wake-up checks');
  });

  async function runAll13() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
      finally { window.Date = RealDate; }
    }
    try { reset(); setMode('daily'); renderDaily(); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll13 = runAll13;
})();
