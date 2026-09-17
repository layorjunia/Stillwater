/* Round 7 — the Check-In tab, and relaunching with keystrokes in the recorder.
   Same contract: runAll7().

   A check-in is its own record: five ratings, what triggered it, what happened,
   and when. It has to survive everything a daily answer survives — reloads,
   sync merges, deletes, exports, a killed app — and it must never touch a daily
   answer or the streak.

   Relaunch: the app used to restore logged keystrokes into an EMPTY memory and
   save that over the real store, so every launch shrank what was on disk until
   the cloud refilled it. Relaunching must never shrink what is on disk. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;
  const EVK = 'stillwater_wal_checkins';
  const q = s => document.querySelector(s);

  function reset() {
    ok(q('#checkin-view') && typeof renderCheckinTab === 'function', 'the Check-In tab must exist');
    if (evTimer) { clearTimeout(evTimer); evTimer = null; }
    if (dailyTimer) { clearTimeout(dailyTimer); dailyTimer = null; }
    ['stillwater_wal', EVK, KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = true; currentUser = null;
    q('#ev-form').dataset.evId = '';
    setMode('checkin');
  }
  const disk = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const rate = (k, v) => {
    const b = q(`#ev-ratings [data-k="${k}"] .scale-opt[data-v="${v}"]`);
    ok(b, `rating ${k}=${v} must be on screen`);
    b.click();
  };
  const type = (sel, text) => { const el = q(sel); el.value = text; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const save = () => q('#ev-save').click();
  const listText = () => q('#ev-list').textContent;
  function stubCloud(doc, onSet) {
    const orig = fbDb.collection;
    fbDb.collection = () => ({ doc: () => ({
      get: async () => ({ exists: !!doc, data: () => JSON.parse(JSON.stringify(doc || {})) }),
      set: async (p) => { if (onSet) onSet(JSON.parse(JSON.stringify(p))); },
    })});
    return () => { fbDb.collection = orig; };
  }
  const hasUndefined = v => v === undefined || (v && typeof v === 'object' && Object.values(v).some(hasUndefined));

  // ---------- the tab ----------
  t('the Check-In tab is in the bottom bar and opens on a fresh form timed now', () => {
    reset();
    const btn = q('.mode-btn[data-mode="checkin"]');
    ok(btn, 'a Check-In button in the bar');
    setMode('daily'); btn.click();
    ok(q('#checkin-view').classList.contains('active'), 'the tab shows');
    eq(state.checkins.length, 0, 'opening it creates nothing:');
    ok(Math.abs(whenToTs(q('#ev-when').value) - Date.now()) < 120000, 'the time starts at now');
    eq(document.querySelectorAll('#ev-ratings [data-k]').length, 5, 'all five ratings:');
    ok(!q('#ev-ratings .scale-opt.sel'), 'nothing chosen yet');
    eq(q('#ev-trigger').value + q('#ev-note').value, '', 'notes start empty:');
  });

  t('a check-in is on disk from its first rating', () => {
    reset();
    rate('emotional', 1);
    const saved = disk().checkins || [];
    eq(saved.length, 1, 'saved immediately:');
    eq(saved[0].ci.emotional, 1, 'with the rating:');
  });

  t('typing stays in one check-in and survives a reload', () => {
    reset();
    rate('mental', 2);
    type('#ev-trigger', 'A text message');
    type('#ev-note', 'My chest tightened and I paced the kitchen.');
    flushCheckin();
    state.checkins = []; loadState();
    eq(state.checkins.length, 1, 'one check-in, not one per keystroke:');
    const c = state.checkins[0];
    eq(c.ci.mental, 2, 'rating:');
    eq(c.trigger, 'A text message', 'what triggered it:');
    eq(c.note, 'My chest tightened and I paced the kitchen.', 'what happened:');
  });

  t('Save starts a fresh form and lists the check-in with its ratings and notes', () => {
    reset();
    rate('physical', 2); rate('spiritual', 4);
    type('#ev-trigger', 'TRIGGER-X'); type('#ev-note', 'NOTE-X');
    save();
    eq(q('#ev-trigger').value + q('#ev-note').value, '', 'the form is fresh again:');
    ok(!q('#ev-ratings .scale-opt.sel'), 'ratings cleared');
    ok(listText().includes('TRIGGER-X') && listText().includes('NOTE-X'), 'notes listed');
    ok(listText().includes('Tired') && listText().includes('Rooted'), 'ratings listed');
    eq((disk().checkins || []).length, 1, 'saved once:');
  });

  t('several check-ins in a day are kept apart', () => {
    reset();
    for (const n of [1, 2, 3]) { type('#ev-note', 'event ' + n); save(); }
    const saved = disk().checkins || [];
    eq(saved.length, 3, 'three check-ins:');
    eq(new Set(saved.map(c => c.id)).size, 3, 'three separate ids:');
    ['event 1', 'event 2', 'event 3'].forEach(x => ok(listText().includes(x), x + ' listed'));
  });

  t('the time can be set to when it actually happened', () => {
    reset();
    const w = q('#ev-when'); w.value = '2026-09-10T14:30'; w.dispatchEvent(new Event('change', { bubbles: true }));
    type('#ev-note', 'earlier that afternoon');
    save();
    const when = new Date(2026, 8, 10, 14, 30);
    eq((disk().checkins || [])[0].at, when.getTime(), 'stored time:');
    ok(listText().includes(when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })), 'listed at that time');
  });

  t('editing an earlier check-in changes that one only', () => {
    reset();
    type('#ev-note', 'first'); save();
    type('#ev-note', 'second'); save();
    const first = disk().checkins.find(c => c.note === 'first');
    q(`#ev-list [data-edit="${first.id}"]`).click();
    eq(q('#ev-note').value, 'first', 'opened in the form:');
    type('#ev-note', 'first, with more detail');
    save();
    const after = disk().checkins;
    eq(after.length, 2, 'still two:');
    eq(after.find(c => c.id === first.id).note, 'first, with more detail', 'the edited one:');
    ok(after.some(c => c.note === 'second'), 'the other one untouched');
  });

  t('leaving the tab mid-check-in saves it, and it is still there on return', () => {
    reset();
    type('#ev-note', 'half');                   // creates it
    type('#ev-note', 'half-written thought');   // still waiting to save
    setMode('daily');
    ok((disk().checkins || []).some(c => c.note === 'half-written thought'), 'saved on leaving');
    setMode('checkin');
    eq(q('#ev-note').value, 'half-written thought', 'still in the form:');
  });

  t('check-ins never touch daily answers, the streak, or the daily keystroke log', () => {
    reset();
    const d = '2026-09-14';
    state.daily[d] = { d, ci: { where: 'kept' }, sc: { done: true, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 5 };
    persist();
    const dailyBefore = JSON.stringify(state.daily);
    const streakBefore = JSON.stringify(computeStreaks());
    const dailyLogBefore = localStorage.getItem('stillwater_wal');
    rate('mental', 1); rate('progress', 2); type('#ev-trigger', 'x'); type('#ev-note', 'y'); save();
    eq(JSON.stringify(state.daily), dailyBefore, 'daily answers:');
    eq(JSON.stringify(disk().daily), dailyBefore, 'daily answers on disk:');
    eq(JSON.stringify(computeStreaks()), streakBefore, 'streak:');
    eq(localStorage.getItem('stillwater_wal'), dailyLogBefore, 'the daily keystroke log:');
  });

  // ---------- sync ----------
  t('signing in merges check-ins from this device and the cloud, newest copy winning', async () => {
    reset();
    state.checkins = [
      { id: 'A', at: 1, createdAt: 1, updatedAt: 200, ci: {}, trigger: '', note: 'A here (newer)' },
      { id: 'B', at: 2, createdAt: 2, updatedAt: 100, ci: {}, trigger: '', note: 'B only here' },
    ];
    persist();
    const cloud = { thoughts: [], grievances: [], journals: [{ id: 'j', savedAt: 1, text: 'j' }], daily: {}, deleted: {},
      checkins: [
        { id: 'A', at: 1, createdAt: 1, updatedAt: 150, ci: {}, trigger: '', note: 'A in the cloud (older)' },
        { id: 'C', at: 3, createdAt: 3, updatedAt: 120, ci: { mental: 3 }, trigger: '', note: 'C only in the cloud' },
      ] };
    let pushed = null;
    const un = stubCloud(cloud, p => { pushed = p; });
    try { hasLoadedFromCloud = false; await cloudLoadOrMigrate('u'); } finally { un(); }
    eq(JSON.stringify(state.checkins.map(c => c.note).sort()),
       JSON.stringify(['A here (newer)', 'B only here', 'C only in the cloud']), 'union, newest copy:');
    ok(pushed && (pushed.checkins || []).length === 3, 'the union goes back up to the cloud');
    eq((disk().checkins || []).length, 3, 'and stays on this device:');
  });

  t('a cloud copy from an app version without check-ins never wipes them', async () => {
    reset();
    type('#ev-note', 'written on the phone'); save();
    const un = stubCloud({ journals: [{ id: 'j', savedAt: 1, text: 'j' }], daily: {}, deleted: {} });
    try { hasLoadedFromCloud = false; await cloudLoadOrMigrate('u'); } finally { un(); }
    ok(state.checkins.some(c => c.note === 'written on the phone'), 'kept in memory');
    ok((disk().checkins || []).some(c => c.note === 'written on the phone'), 'kept on disk');
  });

  t('the cloud save carries every check-in, with nothing the cloud would reject', async () => {
    reset();
    type('#ev-note', 'to the cloud'); save();
    type('#ev-trigger', 'and another'); save();
    let payload = null;
    const un = stubCloud(null, p => { payload = p; });
    try { hasLoadedFromCloud = true; await cloudSaveNow('u'); } finally { un(); }
    ok(payload && Array.isArray(payload.checkins), 'check-ins are in the cloud write');
    eq(payload.checkins.length, 2, 'all of them:');
    ok(!hasUndefined(payload.checkins), 'no undefined values');
  });

  t('a deleted check-in stays deleted — through sync, the keystroke log and an old backup', async () => {
    reset();
    type('#ev-trigger', 'to be deleted'); type('#ev-note', 'gone');
    const id = q('#ev-form').dataset.evId;
    flushCheckin();
    const realConfirm = window.confirm; window.confirm = () => true;
    try { q('#ev-delete').click(); } finally { window.confirm = realConfirm; }
    ok(state.deleted[id], 'recorded as deleted');
    ok(!state.checkins.some(c => c.id === id), 'gone from this device');
    const old = { id, at: 1, createdAt: 1, updatedAt: 9e15, ci: {}, trigger: 'to be deleted', note: 'gone' };
    const un = stubCloud({ journals: [{ id: 'j', savedAt: 1, text: 'j' }], checkins: [old], deleted: {} });
    try { hasLoadedFromCloud = false; await cloudLoadOrMigrate('u'); } finally { un(); }
    ok(!state.checkins.some(c => c.id === id), 'not brought back by the cloud');
    eq(checkinWalRestore(), 0, 'not brought back by the keystroke log:');
    await importBackup({ text: async () => JSON.stringify({ format: 'stillwater-backup', version: 1, checkins: [old] }) });
    ok(!state.checkins.some(c => c.id === id), 'not brought back by an old backup file');
    ok(!(disk().checkins || []).some(c => c.id === id), 'and not on disk');
  });

  // ---------- recovery ----------
  t('the keystroke log brings back a check-in the saved copy lost', () => {
    reset();
    rate('emotional', 2);
    type('#ev-trigger', 'LOST-TRIGGER');
    type('#ev-note', 'LOST-NOTE');
    const id = q('#ev-form').dataset.evId;
    flushCheckin();
    state.checkins = []; persist();            // a bad write loses it everywhere
    ok(checkinWalRestore() >= 3, 'answers restored');
    const c = state.checkins.find(x => x.id === id);
    ok(c, 'the check-in is back');
    eq(c.trigger, 'LOST-TRIGGER', 'trigger:');
    eq(c.note, 'LOST-NOTE', 'what happened:');
    eq(c.ci.emotional, 2, 'rating:');
  });

  t('the keystroke log respects answers cleared on purpose', () => {
    reset();
    type('#ev-note', 'second thoughts');
    type('#ev-note', '');
    rate('mental', 3); rate('mental', 3);      // chosen, then un-chosen
    const id = q('#ev-form').dataset.evId;
    flushCheckin();
    state.checkins = [];
    checkinWalRestore();
    const c = state.checkins.find(x => x.id === id);
    ok(!c || (!c.note && !(c.ci || {}).mental), 'nothing cleared on purpose comes back');
  });

  t('export and import carry check-ins', async () => {
    reset();
    type('#ev-note', 'exported'); save();
    const exported = collectForExport();
    eq((exported.checkins || []).length, 1, 'in the export:');
    state.checkins = []; persist();
    await importBackup({ text: async () => JSON.stringify(exported) });
    ok(state.checkins.some(c => c.note === 'exported'), 'back after import');
    eq((disk().checkins || []).length, 1, 'and on disk:');
  });

  t('the undo stash and the high-water mark include check-ins', () => {
    reset();
    type('#ev-note', 'one'); save();
    type('#ev-note', 'two'); save();
    eq((JSON.parse(localStorage.getItem(KEY + '_hwm') || '{}').checkins || []).length, 2, 'high-water mark:');
    state.checkins = state.checkins.slice(0, 1); persist();     // a bug drops one without deleting it
    eq((JSON.parse(localStorage.getItem(KEY + '_prev') || '{}').checkins || []).length, 2, 'the undo stash kept both:');
  });

  t('what is written is shown as text, never run', () => {
    reset();
    window.__evRan = false;
    type('#ev-note', '<img src=x onerror="window.__evRan=true">'); save();
    ok(!q('#ev-list img'), 'no element created');
    ok(listText().includes('<img src=x'), 'shown as text');
    ok(!window.__evRan, 'nothing ran');
  });

  // ---------- launch ----------
  t('relaunching with keystrokes in the recorder never shrinks what is on disk', () => {
    reset();
    const today = dayKey();
    localStorage.setItem(KEY, JSON.stringify({
      thoughts: [], grievances: [], deleted: { gone: 1 },
      journals: [{ id: 'j1', title: 't', text: 'journal one', type: 'negative', savedAt: 1 },
                 { id: 'j2', title: 't', text: 'journal two', type: 'negative', savedAt: 2 }],
      daily: { '2026-09-10': { d: '2026-09-10', ci: { where: 'stored' }, sc: { done: true, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 5 } },
      checkins: [{ id: 'k1', at: 1, createdAt: 1, updatedAt: 1, ci: { mental: 2 }, trigger: '', note: 'stored check-in' }],
    }));
    localStorage.setItem('stillwater_wal', JSON.stringify({ [today]: { 'ci:where': { v: 'typed before a crash', at: Date.now() } } }));
    localStorage.setItem(EVK, JSON.stringify({ k2: { note: { v: 'check-in typed before a crash', at: Date.now() } } }));
    // exactly the memory a fresh launch starts with
    state.thoughts = []; state.grievances = []; state.journals = []; state.daily = {}; state.deleted = {}; state.checkins = [];
    restoreOnLaunch();
    const s = disk();
    eq((s.journals || []).length, 2, 'journals on disk after relaunch:');
    ok(s.daily && s.daily['2026-09-10'], 'the stored day is still on disk');
    ok(s.deleted && s.deleted.gone, 'deletions are still on disk');
    ok((s.checkins || []).some(c => c.id === 'k1'), 'the stored check-in is still on disk');
    ok(s.daily[today] && s.daily[today].ci.where === 'typed before a crash', 'the daily keystroke came back');
    ok((s.checkins || []).some(c => c.id === 'k2' && c.note === 'check-in typed before a crash'), 'the check-in keystroke came back');
  });

  t('the app launches through restoreOnLaunch, never straight into the recorder', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const at = src.indexOf('INIT — set up UI');
    ok(at > 0, 'launch section found');
    const init = src.slice(at, at + 3000);
    ok(/\nrestoreOnLaunch\(\);/.test(init), 'launch must call restoreOnLaunch()');
    ok(!/const back = walRestore\(\);/.test(init), 'and must not restore keystrokes before loading the disk');
    ok(/function restoreOnLaunch\(\) \{\s*loadState\(\);/.test(src), 'restoreOnLaunch loads the disk first');
  });

  async function runAll7() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { if (evTimer) { clearTimeout(evTimer); evTimer = null; } setMode('daily'); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll7 = runAll7;
})();
