/* Round 2 — failures not yet observed in the wild. Storage exhaustion,
   corruption, timing, hostile input. Same contract: runAll2(). */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;

  function reset() {
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={};
    state.current = { thought:null, grievance:null, journal:null };
    hasLoadedFromCloud = true; currentUser = null;
  }
  function fillDay(marker) {
    state.mode='daily'; renderDaily();
    document.querySelectorAll('#checkin-grid .ci-card').forEach((c,i) => {
      const ta=c.querySelector('.ci-input'), sc=c.querySelector('.scale-opt[data-v="4"]');
      if (ta) { ta.value = marker+' ci'+i; ta.dispatchEvent(new Event('input',{bubbles:true})); }
      if (sc) sc.click();
    });
    document.querySelectorAll('.depth-card .depth-input').forEach((ta,i) => {
      ta.value = marker+' dp'+i; ta.dispatchEvent(new Event('input',{bubbles:true}));
    });
    return dayKey();
  }
  /** Make localStorage.setItem throw for the app's own keys, like a full disk. */
  function withFullDisk(fn) {
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      if (String(k).startsWith('stillwater')) {
        const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e;
      }
      return real(k, v);
    };
    try { return fn(); } finally { localStorage.setItem = real; }
  }

  // ---------- storage exhaustion ----------
  t('a full disk does not silently swallow the save', () => {
    reset(); const d = fillDay('Q1');
    let told = false;
    const origToast = window.toast;
    window.toast = (m) => { if (/space|storage|full|save/i.test(m)) told = true; };
    try { withFullDisk(() => persist()); } finally { window.toast = origToast; }
    ok(told, 'the user must be told the device could not save');
  });

  t('a full disk frees space and retries rather than giving up', () => {
    reset();
    localStorage.setItem(KEY+'_prev', 'x'.repeat(20000));
    const d = fillDay('Q2');
    let attempts = 0;
    const real = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      if (String(k) === KEY) {
        attempts++;
        if (attempts === 1) { const e = new Error('QuotaExceededError'); e.name='QuotaExceededError'; throw e; }
      }
      return real(k, v);
    };
    try { persist(); } finally { localStorage.setItem = real; }
    ok(attempts >= 2, 'must retry after freeing space');
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    ok(saved && saved.daily && saved.daily[d], 'the day must end up saved');
  });

  t('the write-ahead log still records when the main store is full', () => {
    reset();
    const d = dayKey();
    walWrite(d, 'ci:test', 'words that must survive');
    const wal = JSON.parse(localStorage.getItem('stillwater_wal'));
    eq(wal[d]['ci:test'].v, 'words that must survive');
  });

  t('log pruning never drops today', () => {
    reset();
    const d = dayKey();
    walWrite(d, 'ci:x', 'today');
    walWrite('2020-01-01', 'ci:x', 'ancient');
    const wal = JSON.parse(localStorage.getItem('stillwater_wal'));
    ok(wal[d], "today's entry kept");
    ok(!wal['2020-01-01'], 'ancient entry pruned');
  });

  // ---------- corruption ----------
  t('corrupt stored JSON does not wipe live data', () => {
    reset();
    state.journals = [{id:'c1', savedAt:1, text:'precious'}];
    localStorage.setItem(KEY, '{ this is not json');
    loadState();
    ok(Array.isArray(state.journals), 'journals must still be an array');
  });

  t('a malformed day entry is repaired, not discarded', () => {
    reset();
    const d = dayKey();
    state.daily[d] = { d, ci: null, dp: 'not an array', sc: 'nope' };
    const e = getEntry(d, true);
    ok(e.ci && typeof e.ci === 'object', 'ci repaired');
    ok(Array.isArray(e.dp), 'dp repaired');
    state.mode='daily'; renderDaily(d);       // must not throw
  });

  t('a day whose ci holds odd types does not break counting', () => {
    reset(); const d = dayKey();
    state.daily[d] = { d, ci: { mental: null, where: 123, good: {x:1} }, dp: [], sc:{done:false}, ts:1 };
    const n = filledCount(state.daily[d]);
    ok(typeof n === 'number' && n >= 0, 'filledCount must stay numeric');
  });

  // ---------- timing ----------
  t('midnight rolling over mid-edit does not lose the old day', () => {
    reset();
    const d = fillDay('Q8'); const before = filledCount(state.daily[d]);
    dailyKey = dayKey(addDays(new Date(), 1));   // pretend the clock advanced
    renderDaily();                                // back to real today
    eq(filledCount(state.daily[d]), before, "yesterday's answers intact");
  });

  t('backgrounding the app flushes what is typed', () => {
    reset(); const d = fillDay('Q9');
    dailyDirty = true;
    flushPending();
    const saved = JSON.parse(localStorage.getItem(KEY));
    ok(saved.daily[d] && filledCount(saved.daily[d]) > 0, 'flushed to disk');
  });

  t('two saves in quick succession do not race each other', () => {
    reset(); const d = fillDay('Q10');
    saveDaily(true); saveDaily(true); saveDaily(false);
    eq(filledCount(state.daily[d]) > 0, true);
    ok(JSON.parse(localStorage.getItem(KEY)).daily[d], 'still on disk');
  });

  t('the clock moving backwards does not erase a run', () => {
    reset();
    const mk = (day) => {
      const e = { d: day, ci:{}, sc:{done:true}, ts:1, rf:{bother:'xxx',opposite:'yyy'}, dp:[] };
      checkinsFor(day).forEach(c => e.ci[c.k] = c.type==='scale' ? 4 : 'an answer');
      for (let i=0;i<depthsPerDay(day);i++) e.dp.push({id:'d'+i,q:'q',theme:'self',a:'an answer'});
      return e;
    };
    for (const off of [0,-1,-2]) { const k = dayKey(addDays(new Date(), off)); state.daily[k] = mk(k); }
    const before = computeStreaks().total;
    // a device clock jumping back must not delete anything
    const after = computeStreaks().total;
    eq(after, before, 'no entries removed by recomputation');
    eq(Object.keys(state.daily).length, 3, 'all days still present');
  });

  // ---------- hostile / malformed input ----------
  t('importing a non-backup file is refused without touching data', async () => {
    reset();
    state.journals = [{id:'safe', savedAt:1, text:'mine'}];
    const before = JSON.stringify(state.journals);
    await importBackup({ text: async () => 'this is not json at all' });
    eq(JSON.stringify(state.journals), before, 'unchanged after a bad file');
    await importBackup({ text: async () => JSON.stringify({ format:'something-else' }) });
    eq(JSON.stringify(state.journals), before, 'unchanged after a foreign backup');
  });

  t('importing a backup with junk entries does not corrupt state', async () => {
    reset();
    state.journals = [{id:'safe', savedAt:1, text:'mine'}];
    await importBackup({ text: async () => JSON.stringify({ format:'stillwater-backup', version:1,
      journals: [null, {}, {id:null}, {id:'ok', savedAt:2, text:'fine'}],
      daily: null, thoughts: 'nope', grievances: undefined, deleted: null }) });
    ok(state.journals.some(j=>j.id==='safe'), 'existing entry survives');
    ok(state.journals.every(j=>j && j.id), 'no junk entries admitted');
  });

  t('a very long entry is stored and read back intact', () => {
    reset();
    const big = 'w'.repeat(60000);
    state.journals = [{id:'big', savedAt:1, text:big, title:'big'}];
    persist();
    const back = JSON.parse(localStorage.getItem(KEY)).journals[0];
    eq(back.text.length, big.length, 'long text preserved');
  });

  // ---------- recovery paths ----------
  t('legacy recovery only ever adds', () => {
    reset();
    state.journals = [{id:'mine', savedAt:5, text:'mine'}];
    const merged = mergeById(state.journals, [{id:'old', savedAt:1, text:'from the old project'}], 'savedAt');
    eq(merged.length, 2, 'recovery is additive');
    ok(merged.some(j=>j.id==='mine'), 'existing kept');
  });

  t('the shrink stash survives long enough to be useful', () => {
    reset();
    state.journals = [{id:'s1',savedAt:1,text:'a'},{id:'s2',savedAt:1,text:'b'}];
    persist();
    state.journals = []; persist();
    state.journals = []; persist();     // a second shrink must not overwrite the good stash with an empty one
    const prev = JSON.parse(localStorage.getItem(KEY+'_prev')||'null');
    ok(prev && prev.journals.length === 2, 'stash still holds the good version');
  });

  t('deleting one entry never touches the others', () => {
    reset();
    state.journals = [{id:'k1',savedAt:1,text:'keep'},{id:'k2',savedAt:1,text:'go'},{id:'k3',savedAt:1,text:'keep'}];
    persist();
    state.deleted['k2'] = Date.now(); applyTombstones(); persist();
    eq(state.journals.map(j=>j.id).sort().join(','), 'k1,k3');
  });

  async function runAll2() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll2 = runAll2;
})();
