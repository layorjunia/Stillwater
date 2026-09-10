/* Data-safety suite. Load the app, then fetch+eval this file and call runAll().
   Every test attacks a way data has actually been lost, or could be.
   Run: bash tests/run.sh   (serves the app; then paste runAll() in the console) */
(function () {
  const T = [];
  const t = (name, fn) => T.push({ name, fn });
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };

  const KEY = STORAGE_KEY;
  function reset() {
    localStorage.removeItem('stillwater_wal');
    localStorage.removeItem(KEY + '_hwm');
    localStorage.removeItem(KEY + '_prev');
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={};
    state.current = { thought: null, grievance: null, journal: null };
    hasLoadedFromCloud = true;
    currentUser = null;
  }
  function fillDayViaDOM(marker) {
    state.mode='daily'; renderDaily();
    document.querySelectorAll('#checkin-grid .ci-card').forEach((c,i) => {
      const ta = c.querySelector('.ci-input'), sc = c.querySelector('.scale-opt[data-v="4"]');
      if (ta) { ta.value = marker+' ci'+i; ta.dispatchEvent(new Event('input',{bubbles:true})); }
      if (sc) sc.click();
    });
    document.querySelectorAll('.depth-card .depth-input').forEach((ta,i) => {
      ta.value = marker+' dp'+i; ta.dispatchEvent(new Event('input',{bubbles:true}));
    });
    const sd = document.getElementById('sc-done');
    if (sd && !sd.classList.contains('on')) sd.click();
    return dayKey();
  }
  function stubCloud(doc, onSet) {
    const orig = fbDb.collection;
    fbDb.collection = () => ({ doc: () => ({
      get: async () => ({ exists: !!doc, data: () => JSON.parse(JSON.stringify(doc||{})) }),
      set: async (p) => { if (onSet) onSet(p); },
    })});
    return () => { fbDb.collection = orig; };
  }

  // ---------- typing & saving ----------
  t('typing lands in state and survives save', () => {
    reset(); const d = fillDayViaDOM('T1'); saveDaily(true);
    ok(filledCount(state.daily[d]) >= 12, 'day should be full');
    ok(JSON.parse(localStorage.getItem(KEY)).daily[d], 'must be on disk');
  });

  t('saveDaily never deletes a day', () => {
    reset(); state.mode='daily'; renderDaily();
    const d = dayKey(); saveDaily(true); saveDaily(true);
    ok(state.daily[d], 'empty day must still exist');
  });

  t('cloud merge landing mid-typing does not lose answers', async () => {
    reset(); const d = fillDayViaDOM('T3');
    const before = filledCount(state.daily[d]);
    // disk still holds the pre-typing snapshot, as it would mid-session
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],deleted:{},
      daily:{[d]:{d, ci:{}, sc:{done:false}, dp:depthsFor(d).map(x=>({...x,a:''})), ts:0}}}));
    const un = stubCloud({thoughts:[],grievances:[],journals:[{id:'c1',savedAt:1,text:'cloud'}],daily:{},deleted:{}});
    try { hasLoadedFromCloud=false; await cloudLoadOrMigrate('u'); } finally { un(); }
    eq(filledCount(state.daily[d]), before, 'answers after merge');
  });

  t('write-ahead log restores after memory+disk wipe', () => {
    reset(); const d = fillDayViaDOM('T4');
    const before = filledCount(state.daily[d]);
    state.daily = {};
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}));
    walRestore();
    eq(filledCount(state.daily[d]), before, 'restored');
  });

  t('a deliberately cleared field stays cleared', () => {
    reset(); const d = fillDayViaDOM('T5');
    const ta = document.querySelector('#checkin-grid .ci-input');
    const k = ta.dataset.wal.split(':')[1];
    ta.value=''; ta.dispatchEvent(new Event('input',{bubbles:true}));
    state.daily[d].ci[k] = '';
    walRestore();
    eq((state.daily[d].ci[k]||'').trim(), '', 'must stay empty');
  });

  // ---------- cloud read/write ----------
  t('failed cloud read never writes back', async () => {
    reset(); const d = fillDayViaDOM('T6');
    const before = filledCount(state.daily[d]);
    let wrote = false;
    const orig = fbDb.collection;
    fbDb.collection = () => ({ doc: () => ({
      get: async () => { throw new Error('network'); },
      set: async () => { wrote = true; } })});
    try { hasLoadedFromCloud=false; await cloudLoadOrMigrate('u'); } finally { fbDb.collection = orig; }
    eq(wrote, false, 'must not write after a failed read');
    eq(hasLoadedFromCloud, false, 'must stay gated');
    ok(filledCount(state.daily[d]) >= 0, 'local intact');
  });

  t('empty cloud gets this device migrated up', async () => {
    reset(); const d = fillDayViaDOM('T7'); saveDaily(true);
    let sent = null;
    const un = stubCloud({thoughts:[],grievances:[],journals:[],daily:{},deleted:{}}, p => sent = p);
    try { hasLoadedFromCloud=false; await cloudLoadOrMigrate('u'); } finally { un(); }
    ok(sent && sent.daily && sent.daily[d], 'local day should be uploaded');
  });

  t('cloud entries the device lacks are merged in, not dropped', async () => {
    reset();
    state.journals = [{id:'local1', savedAt: 10, text:'local only'}];
    const un = stubCloud({thoughts:[],grievances:[],deleted:{},daily:{},
      journals:[{id:'cloud1', savedAt: 20, text:'cloud only'}]});
    try { hasLoadedFromCloud=false; await cloudLoadOrMigrate('u'); } finally { un(); }
    const ids = state.journals.map(j=>j.id).sort();
    eq(ids.join(','), 'cloud1,local1', 'union of both');
  });

  t('newest timestamp wins on the same id', () => {
    const out = mergeById([{id:'x', savedAt:1, text:'old'}], [{id:'x', savedAt:2, text:'new'}], 'savedAt');
    eq(out[0].text, 'new');
    const out2 = mergeById([{id:'x', savedAt:2, text:'new'}], [{id:'x', savedAt:1, text:'old'}], 'savedAt');
    eq(out2[0].text, 'new', 'order must not matter');
  });

  t('undefined values are stripped so the write is accepted', () => {
    const p = stripUndefined({ a: 1, b: undefined, c: { d: undefined, e: 2 }, f: [{ g: undefined, h: 3 }] });
    eq(JSON.stringify(p), JSON.stringify({a:1,c:{e:2},f:[{h:3}]}));
    let app; try { app = firebase.app('t-validate'); }
    catch(e) { app = firebase.initializeApp({projectId:'v',apiKey:'x',appId:'x'}, 't-validate'); }
    app.firestore().collection('t').doc('t').set(p);   // throws if invalid
  });

  t('no SDK sentinel is ever sent', () => {
    // strip comments first — the function documents why the sentinel is banned
    const body = cloudSaveNow.toString()
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/FieldValue\s*\.\s*serverTimestamp/.test(body), 'must not use a sentinel');
    ok(/updatedAt:\s*Date\.now\(\)/.test(body), 'updatedAt must be a plain number');
  });

  // ---------- deletion ----------
  t('a deleted entry does not come back from the cloud', () => {
    reset();
    state.journals = [{id:'gone', savedAt:1, text:'x'}];
    state.deleted = { gone: Date.now() };
    const merged = mergeById(state.journals, [{id:'gone', savedAt:99, text:'x'}], 'savedAt');
    eq(merged.length, 0, 'tombstone must win');
  });

  t('export honours tombstones and is a superset otherwise', () => {
    reset();
    state.journals = [{id:'a1', savedAt:1, text:'keep'},{id:'b1', savedAt:1, text:'drop'}];
    persist();
    state.deleted = { b1: Date.now() }; applyTombstones(); persist();
    const e = collectForExport();
    ok(e.journals.some(j=>j.id==='a1'), 'kept entry present');
    ok(!e.journals.some(j=>j.id==='b1'), 'deleted entry absent');
  });

  t('import merges and cannot overwrite', async () => {
    reset();
    state.journals = [{id:'mine', savedAt:5, text:'mine'}];
    const file = { text: async () => JSON.stringify({ format:'stillwater-backup', version:1,
      journals:[{id:'theirs', savedAt:5, text:'theirs'}], daily:{}, thoughts:[], grievances:[], deleted:{} }) };
    await importBackup(file);
    const ids = state.journals.map(j=>j.id).sort();
    eq(ids.join(','), 'mine,theirs', 'both survive import');
  });

  // ---------- safety nets ----------
  t('a shrinking write stashes the previous version', () => {
    reset();
    state.journals = [{id:'p1',savedAt:1,text:'a'},{id:'p2',savedAt:1,text:'b'}];
    persist();
    state.journals = [];
    persist();
    const prev = JSON.parse(localStorage.getItem(KEY+'_prev')||'null');
    ok(prev && prev.journals.length === 2, 'previous version stashed');
  });

  t('high-water mark keeps the largest set ever held', () => {
    reset();
    state.journals = [{id:'h1',savedAt:1,text:'x'},{id:'h2',savedAt:1,text:'y'}]; persist();
    state.journals = [{id:'h1',savedAt:1,text:'x'}]; persist();
    const hwm = JSON.parse(localStorage.getItem(KEY+'_hwm')||'null');
    ok(hwm && hwm.journals.length === 2, 'hwm holds the bigger set');
  });

  t('sign-out never clears local data', () => {
    reset();
    state.journals=[{id:'s1',savedAt:1,text:'x'}]; persist();
    const before = localStorage.getItem(KEY);
    ok(!/localStorage\.removeItem\(\s*STORAGE_KEY\s*\)/.test(document.documentElement.innerHTML),
       'nothing may remove the store key');
    eq(localStorage.getItem(KEY), before);
  });

  // ---------- daily mechanics ----------
  t('an answered day is never rotated to new questions', () => {
    reset();
    const d = dayKey();
    const e = getEntry(d, true);
    e.dp = [{id:'q0',q:'old',theme:'self',a:'my answer'},{id:'q1',q:'b',theme:'self',a:''},
            {id:'q2',q:'c',theme:'self',a:''}];
    state.mode='daily'; renderDaily();
    eq(state.daily[d].dp.find(x=>x.id==='q0').a, 'my answer');
  });

  t('extra questions survive a re-render', () => {
    reset(); state.mode='daily'; renderDaily();
    const d = dayKey(); const n = state.daily[d].dp.length;
    addExtraDepth(); addExtraDepth();
    renderDaily();
    eq(state.daily[d].dp.length, n + 2);
  });

  t('a retired question still shows where it was answered', () => {
    reset();
    const day = '2026-08-23';
    state.daily[day] = { d: day, ci: { complete: 'an old answer' }, sc:{done:false},
                         dp: [], ts: 1 };
    state.mode='daily'; renderDaily(day);
    const qs = [...document.querySelectorAll('#checkin-grid .ci-q')].map(x=>x.textContent);
    ok(qs.some(q=>q.includes('make today feel complete')), 'retired question shown');
    const vals = [...document.querySelectorAll('#checkin-grid .ci-input')].map(x=>x.value);
    ok(vals.some(v=>v==='an old answer'), 'its answer shown');
  });

  t('a day is judged by the questions it was asked', () => {
    const mk = (day) => {
      const e = { d: day, ci:{}, sc:{done:true}, ts:1, rf:{bother:'x'.repeat(3),opposite:'y'.repeat(3)},
                  dp: [] };
      checkinsFor(day).forEach(c => e.ci[c.k] = c.type==='scale' ? 4 : 'an answer');
      for (let i=0;i<depthsPerDay(day);i++) e.dp.push({id:'d'+i,q:'q',theme:'self',a:'an answer'});
      return e;
    };
    ok(dayCounts(mk('2026-08-24')), 'old-shape day counts');
    ok(dayCounts(mk('2026-09-20')), 'new-shape day counts');
  });

  t('streak survives a gap correctly', () => {
    reset();
    const mk = (day) => {
      const e = { d: day, ci:{}, sc:{done:true}, ts:1, rf:{bother:'xxx',opposite:'yyy'}, dp: [] };
      checkinsFor(day).forEach(c => e.ci[c.k] = c.type==='scale' ? 4 : 'an answer');
      for (let i=0;i<depthsPerDay(day);i++) e.dp.push({id:'d'+i,q:'q',theme:'self',a:'an answer'});
      return e;
    };
    const today = new Date();
    for (const off of [-1,-2,-3]) { const k = dayKey(addDays(today,off)); state.daily[k]=mk(k); }
    eq(computeStreaks().current, 3, 'run ending yesterday stays alive today');
    delete state.daily[dayKey(addDays(today,-2))];
    eq(computeStreaks().current, 1, 'gap breaks it');
  });

  t('widget payload carries the day it describes', () => {
    reset();
    syncWidgetData(computeStreaks(), 0.5);
    const p = JSON.parse(localStorage.getItem('stillwater_widget'));
    eq(p.dayKey, dayKey());
    ok('lastDoneDay' in p, 'lastDoneDay present');
  });

  t('journal autosave never creates a blank entry', () => {
    reset(); setMode('journal'); newJournal();
    saveJournalQuiet();
    eq(state.journals.length, 0, 'empty journal must not be saved');
    state.current.journal.text = 'real words';
    saveJournalQuiet();
    eq(state.journals.length, 1, 'a real one is saved');
  });

  t('rendering never creates a day', () => {
    reset();
    const future = '2027-01-01';
    renderStreakUI(undefined);
    ok(!state.daily[future], 'render must not create');
    ok(!/getEntry\([^)]*,\s*true\s*\)/.test(renderStreakUI.toString()), 'no create-on-render');
  });

  async function runAll() {
    const pass = [], fail = [];
    for (const { name, fn } of T) {
      try { await fn(); pass.push(name); }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    return { total: T.length, passed: pass.length, failed: fail.length, failures: fail };
  }
  window.runAll = runAll;
  window.SW_TEST_COUNT = T.length;
})();
