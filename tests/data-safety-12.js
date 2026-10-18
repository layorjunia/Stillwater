/* Round 12 — recovering from a build that does not know the safety layers.
   Same contract: runAll12().

   The phone app has a build baked into it (1.4.4) that runs whenever the
   downloaded update is missing. On a single keystroke it saves its own small
   view of the data over the stored copy: measured against real data, 49 days /
   63 journals / 9 deletions / 3 check-ins became 1 day. The high-water mark —
   the largest set the device ever held — survived, but nothing ever used it,
   and it only refreshed when the NUMBER of things grew, so the day being
   written was stale in it (2 of 14 answers). This round pins the way back. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY, HWM = KEY + '_hwm';
  const has = typeof healFromHighWaterMark === 'function';

  function reset() {
    ['stillwater_wal', 'stillwater_wal_checkins', HWM, KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = true; currentUser = null;
    if (typeof dailyTimer !== 'undefined' && dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    if (typeof evTimer !== 'undefined' && evTimer) { clearTimeout(evTimer); evTimer = null; }
  }
  const dayOf = (d, over) => Object.assign(
    { d, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 }, over || {});
  /** A realistic set of data: days with answers, journals, check-ins, deletions. */
  function realistic() {
    const daily = {};
    for (let i = 1; i <= 20; i++) {
      const d = '2026-09-' + String(i).padStart(2, '0');
      daily[d] = dayOf(d, { ts: 1000 + i, ci: { where: 'where ' + i, good: 'grateful ' + i, mental: 4 },
        sc: { done: true, note: 'note ' + i },
        dp: [{ id: 'q' + i, theme: 'self', q: 'Question ' + i, a: 'answer to ' + i }, { id: 'q' + (i + 40), theme: 'fear', q: 'Question ' + (i + 40), a: 'second answer ' + i }] });
    }
    return {
      thoughts: [{ id: 't1', title: 'web', createdAt: 5, bubbles: [{ id: 'b1', parentId: null, text: 'root', x: .5, y: .5 }] }],
      grievances: [{ id: 'g1', text: 'a released grievance', forgivenAt: 6 }],
      journals: Array.from({ length: 12 }, (_, i) => ({ id: 'j' + i, title: 'entry ' + i, text: 'journal text number ' + i, type: 'negative', savedAt: 100 + i })),
      daily,
      checkins: [{ id: 'k1', at: 10, createdAt: 10, updatedAt: 10, ci: { mental: 2 }, trigger: 'a trigger', note: 'what happened' },
                 { id: 'k2', at: 20, createdAt: 20, updatedAt: 20, ci: { emotional: 1 }, trigger: '', note: 'second' }],
      deleted: { gone1: 5, gone2: 6 },
    };
  }
  const setStore = o => localStorage.setItem(KEY, JSON.stringify(o));
  const setHwm = o => localStorage.setItem(HWM, JSON.stringify(Object.assign({ savedAt: 1 }, o)));
  const disk = () => JSON.parse(localStorage.getItem(KEY) || '{}');

  t('what a build that does not know the safety layers leaves behind is brought back at launch', () => {
    reset();
    ok(has, 'healFromHighWaterMark must exist');
    const full = realistic();
    setHwm(full);
    // The shape the old build writes: five keys, no check-ins, one day.
    setStore({ thoughts: [], grievances: [], journals: [], deleted: {}, daily: { '2026-10-18': dayOf('2026-10-18', { ci: { where: 'typed in the old build' }, ts: 9e12 }) } });
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    restoreOnLaunch();
    const s = disk();
    eq((s.journals || []).length, 12, 'journals on disk:');
    eq(Object.keys(s.daily || {}).length, 21, 'days on disk (20 restored + the one just typed):');
    eq((s.checkins || []).length, 2, 'check-ins on disk:');
    eq((s.thoughts || []).length + (s.grievances || []).length, 2, 'thought web and released grievance:');
    eq(Object.keys(s.deleted || {}).length, 2, 'deletions on disk:');
    eq(JSON.stringify(s.journals.map(j => [j.id, j.text]).sort()), JSON.stringify(full.journals.map(j => [j.id, j.text]).sort()), 'journals word for word:');
    for (const [d, e] of Object.entries(full.daily)) eq(JSON.stringify(s.daily[d]), JSON.stringify(e), 'day ' + d + ':');
    eq(s.daily['2026-10-18'].ci.where, 'typed in the old build', 'and what was typed in the old build:');
  });

  t('on a healthy store the recovery changes nothing and writes nothing', () => {
    reset();
    ok(has, 'healFromHighWaterMark must exist');
    const full = realistic();
    setStore(full); setHwm(full);
    const before = localStorage.getItem(KEY);
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    restoreOnLaunch();
    eq(localStorage.getItem(KEY), before, 'the stored copy, byte for byte:');
    eq(healFromHighWaterMark(), 0, 'items it restored:');
  });

  t('something you deleted stays deleted', () => {
    reset();
    ok(has, 'healFromHighWaterMark must exist');
    const full = realistic();
    full.journals.push({ id: 'jdel', title: 'deleted', text: 'I deleted this', type: 'negative', savedAt: 50 });
    full.checkins.push({ id: 'kdel', at: 5, createdAt: 5, updatedAt: 5, ci: {}, trigger: 'deleted', note: 'deleted' });
    setHwm(full);
    const now = realistic(); now.deleted = { jdel: 1, kdel: 1 };
    setStore(now);
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    restoreOnLaunch();
    const s = disk();
    ok(!(s.journals || []).some(j => j.id === 'jdel'), 'the deleted journal stays gone');
    ok(!(s.checkins || []).some(c => c.id === 'kdel'), 'the deleted check-in stays gone');
    ok(s.deleted.jdel && s.deleted.kdel, 'and the deletions are still recorded');
  });

  t('a day you edited after the safety copy was taken keeps what you wrote', () => {
    reset();
    ok(has, 'healFromHighWaterMark must exist');
    const old = realistic(), now = realistic();
    old.daily['2026-09-05'].ci.where = 'the older text';
    now.daily['2026-09-05'].ci.where = 'the newer text';
    now.daily['2026-09-05'].ts = 99999;
    setHwm(old); setStore(now);
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    restoreOnLaunch();
    eq(disk().daily['2026-09-05'].ci.where, 'the newer text', 'the newer copy wins:');
  });

  t('a journal edited after the safety copy was taken keeps its newer text', () => {
    reset();
    ok(has, 'healFromHighWaterMark must exist');
    const old = realistic(), now = realistic();
    old.journals[3].text = 'older words'; old.journals[3].savedAt = 10;
    now.journals[3].text = 'newer words, edited later'; now.journals[3].savedAt = 5000;
    setHwm(old); setStore(now);
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    restoreOnLaunch();
    eq(disk().journals.find(j => j.id === 'j3').text, 'newer words, edited later', 'journal text:');
  });

  t('a damaged safety copy is ignored without error', () => {
    reset();
    ok(has, 'healFromHighWaterMark must exist');
    const full = realistic(); setStore(full);
    const before = localStorage.getItem(KEY);
    for (const junk of ['not json at all', '[]', '"a string"', '{"daily":5,"journals":"x"}', 'null', '{"journals":[null,1,{"id":""}]}']) {
      localStorage.setItem(HWM, junk);
      state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
      let threw = null;
      try { restoreOnLaunch(); } catch (e) { threw = e; }
      ok(!threw, `launch must survive a safety copy of ${JSON.stringify(junk).slice(0, 30)}: ${threw && threw.message}`);
      eq(localStorage.getItem(KEY), before, 'the stored copy after ' + JSON.stringify(junk).slice(0, 24) + ':');
    }
  });

  t('the safety copy follows what you type, not only how many entries exist', () => {
    reset();
    const d = '2026-10-05';
    state.daily[d] = dayOf(d, { ts: 5, dp: [{ id: 'q1', theme: 'self', q: 'Q', a: 'short' }] });
    persist();
    eq(JSON.parse(localStorage.getItem(HWM)).daily[d].dp[0].a, 'short', 'first copy:');
    state.daily[d].dp[0].a = 'a much longer answer that was typed into an entry that already existed';
    persist();
    eq(JSON.parse(localStorage.getItem(HWM)).daily[d].dp[0].a, 'a much longer answer that was typed into an entry that already existed',
      'after typing more into the same entry:');
    state.checkins = [{ id: 'kk', at: 1, createdAt: 1, updatedAt: 1, ci: {}, trigger: '', note: 'x' }]; persist();
    state.checkins[0].note = 'x and then a good deal more written later'; persist();
    eq(JSON.parse(localStorage.getItem(HWM)).checkins[0].note, 'x and then a good deal more written later', 'a check-in written to:');
  });

  t('the safety copy never shrinks', () => {
    reset();
    const d = '2026-10-05';
    state.daily[d] = dayOf(d, { ts: 5, dp: [{ id: 'q1', theme: 'self', q: 'Q', a: 'a long answer worth keeping safe' }] });
    persist();
    state.daily[d].dp[0].a = 'x'; persist();
    eq(JSON.parse(localStorage.getItem(HWM)).daily[d].dp[0].a, 'a long answer worth keeping safe', 'after the text is cut down:');
  });

  t('launch recovers from the safety copy after loading the disk and before the keystroke logs', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const m = /function restoreOnLaunch\(\) \{([\s\S]*?)\n\}/.exec(src);
    ok(m, 'restoreOnLaunch found');
    const body = m[1];
    const a = body.indexOf('loadState()'), b = body.indexOf('healFromHighWaterMark()'), c = body.indexOf('walRestore()');
    ok(a >= 0 && b > a && c > b, 'order must be loadState, then healFromHighWaterMark, then walRestore');
  });

  // ---------- "+ Another question" ----------
  function pickMany(times) {
    state.mode = 'daily'; renderDaily();
    const picks = [];
    for (let i = 0; i < times; i++) {
      const before = state.daily[dailyKey].dp.length;
      addExtraDepth();
      const e = state.daily[dailyKey];
      if (e.dp.length === before) break;
      const added = e.dp[e.dp.length - 1];
      picks.push(added.id);
      removeExtraDepth(added.id);          // blank, so it can be dropped again
    }
    return picks;
  }
  function markAnswered(ids) {
    ids.forEach((id, i) => {
      const day = dayKey(addDays(new Date(), -(400 + i)));
      state.daily[day] = dayOf(day, { dp: [{ id, theme: 'self', q: 'asked back then', a: 'answered back then' }] });
    });
  }

  t('"+ Another question" never offers one you already answered while fresh ones remain', () => {
    reset();
    const answered = Array.from({ length: 200 }, (_, i) => 'q' + i);
    markAnswered(answered);
    const set = new Set(answered);
    const picks = pickMany(80);
    ok(picks.length >= 60, 'it must keep offering questions (got ' + picks.length + ')');
    const repeats = picks.filter(id => set.has(id));
    eq(repeats.length, 0, `answered questions offered (${repeats.slice(0, 4).join(', ')}):`);
    renderDaily();
  });

  t('"+ Another question" still offers something once every question has been answered', () => {
    reset();
    markAnswered(DEPTHS.map((_, i) => 'q' + i));
    state.mode = 'daily'; renderDaily();
    const before = state.daily[dailyKey].dp.map(d => d.id);
    addExtraDepth();
    const e = state.daily[dailyKey];
    eq(e.dp.length, before.length + 1, 'a question was added:');
    ok(before.indexOf(e.dp[e.dp.length - 1].id) < 0, 'and it is not one already on today');
    renderDaily();
  });

  // ---------- the downloaded update ----------
  function withFullStorage(untilRemoved, fn) {
    const realSet = localStorage.setItem.bind(localStorage), realRemove = localStorage.removeItem.bind(localStorage);
    const removed = [];
    localStorage.removeItem = function (k) { removed.push(String(k)); return realRemove(k); };
    localStorage.setItem = function (k, v) {
      if (String(k) === 'stillwater_probe_key' && (untilRemoved === null || removed.indexOf(untilRemoved) < 0)) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      return realSet(k, v);
    };
    const toastReal = window.toast; window.toast = () => {};
    try { return fn(removed); } finally { localStorage.setItem = realSet; localStorage.removeItem = realRemove; window.toast = toastReal; }
  }
  function seedStorage() {
    reset();
    localStorage.setItem('sw_update_html', '<html>cached update</html>');
    localStorage.setItem('sw_update_version', '9.9.9');
    localStorage.setItem(KEY + '_prev', '{"x":1}');
    localStorage.setItem(HWM, '{"savedAt":1}');
  }

  t('when storage is full the downloaded update is kept while anything else can go first', () => {
    seedStorage();
    withFullStorage(HWM, () => { safeSetItem('stillwater_probe_key', 'v'); });
    ok(localStorage.getItem('sw_update_html'), 'the cached update must still be there');
    eq(localStorage.getItem('sw_update_version'), '9.9.9', 'and its version:');
    localStorage.removeItem('stillwater_probe_key');
  });

  t('the downloaded update is the very last thing given up', () => {
    seedStorage();
    const order = withFullStorage(null, removed => { safeSetItem('stillwater_probe_key', 'v'); return removed.slice(); });
    const i = k => order.indexOf(k);
    ok(i(KEY + '_prev') >= 0 && i(HWM) >= 0 && i('sw_update_html') >= 0, 'all three were eventually given up: ' + order.join(', '));
    ok(i(KEY + '_prev') < i('sw_update_html'), 'the one-step undo goes before the update');
    ok(i(HWM) < i('sw_update_html'), 'the safety copy goes before the update');
  });

  async function runAll12() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { localStorage.removeItem('stillwater_probe_key'); reset(); setMode('daily'); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll12 = runAll12;
})();
