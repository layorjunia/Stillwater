/* The encryption, proven against a REAL Firestore server (the local emulator) with the real SDK —
   not the stand-in the unit tests use. Run signed OUT, with the emulator up (scripts/emulator.sh start):

     (0, eval)(await (await fetch('/tests/fake-firestore.js')).text());
     (0, eval)(await (await fetch('/tests/emulator-check.js')).text());
     await runEmulatorCheck('/backups/<a device snapshot>/importable-backup.json');   // or no argument: sample data

   It reports only pass/fail and counts — never any of the words. */
(function () {
  const clone = v => JSON.parse(JSON.stringify(v));
  async function runEmulatorCheck(backupUrl) {
    const checks = [];
    const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
    const PIN = '73920486';
    let original;
    if (backupUrl) {
      const b = await (await fetch(backupUrl, { cache: 'no-store' })).json();
      original = { thoughts: b.thoughts || [], grievances: b.grievances || [], journals: b.journals || [],
        daily: b.daily || {}, checkins: b.checkins || [], deleted: b.deleted || {} };
    } else {
      original = { thoughts: [], grievances: [], deleted: { gone: 1 },
        journals: [{ id: 'j1', title: 't', text: 'SAMPLE-ONE', type: 'negative', savedAt: 1 }, { id: 'j2', title: 't', text: 'SAMPLE-TWO', type: 'negative', savedAt: 2 }],
        daily: { '2026-09-10': { d: '2026-09-10', ci: { where: 'SAMPLE-ANSWER' }, sc: { done: true, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 5 } },
        checkins: [{ id: 'k1', at: 1, createdAt: 1, updatedAt: 1, ci: { mental: 2 }, trigger: '', note: 'SAMPLE-NOTE' }] };
    }
    const canon = p => {
      const n = normalizeCloudPayload(p);
      const by = a => a.slice().sort((x, y) => String(x.id).localeCompare(String(y.id)));
      return JSON.stringify([by(n.thoughts), by(n.grievances), by(n.journals), by(n.checkins),
        Object.keys(n.daily).filter(k => dayHasContent(n.daily[k])).sort().map(k => [k, n.daily[k]]), Object.keys(n.deleted).sort()]);
    };
    const snippets = [];
    const addS = s => { s = String(s || '').split(/\s+/).join(' '); if (s.length >= 28) { snippets.push(s.slice(0, 36)); if (s.length >= 90) snippets.push(s.slice(Math.floor(s.length / 2), Math.floor(s.length / 2) + 36)); } };
    original.journals.forEach(j => addS(j.text)); original.checkins.forEach(c => { addS(c.trigger); addS(c.note); });
    for (const e of Object.values(original.daily)) { Object.values(e.ci || {}).forEach(v => typeof v === 'string' && addS(v)); (e.dp || []).forEach(d => addS(d.a)); }

    // a real SDK instance talking to the emulator; the app's own Firestore handle is pointed at it
    let app; try { app = firebase.app('emu'); } catch (e) {
      app = firebase.initializeApp({ projectId: 'demo-stillwater', apiKey: 'x', appId: 'x' }, 'emu');
      const d = app.firestore(); d.settings({ ignoreUndefinedProperties: true }); d.useEmulator('127.0.0.1', 8080);
    }
    const emuDb = app.firestore(), ref = emuDb.collection('users').doc('u');
    await fetch('http://127.0.0.1:8080/emulator/v1/projects/demo-stillwater/databases/(default)/documents', { method: 'DELETE' });
    const realCollection = fbDb.collection;
    fbDb.collection = (c) => emuDb.collection(c);
    const server = async () => (await ref.get({ source: 'server' })).data();
    const local = () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
      localStorage.setItem('stillwater_legacy_prompted_', '1');
      state.thoughts = clone(original.thoughts); state.grievances = clone(original.grievances); state.journals = clone(original.journals);
      state.daily = clone(original.daily); state.checkins = clone(original.checkins); state.deleted = clone(original.deleted);
    };
    try {
      // 1. the readable copy that is there now, moved over
      await ref.set(Object.assign({ updatedAt: 1 }, clone(original)));
      local(); hasLoadedFromCloud = false; currentUser = null;
      TestCloud.resetE2ee(PIN); e2ee.iter = window.__E2EE_DEFAULT_ITER;
      const status = await cloudLoadOrMigrate('u');
      const d1 = await server();
      check('the migration finishes', status === 'synced', status);
      check('the server holds only enc, rev and updatedAt', Object.keys(d1).sort().join(',') === 'enc,rev,updatedAt', Object.keys(d1).sort().join(','));
      check('it was encrypted with 600,000 rounds', d1.enc.iter === 600000, d1.enc.iter);
      check('it opens to exactly the data', canon((await e2eeDecrypt(d1.enc, e2ee.key)).data) === canon(original));
      const raw = JSON.stringify(d1);
      check('none of the writing is in the server’s copy', snippets.filter(s => raw.indexOf(s) >= 0).length === 0, snippets.length + ' snippets searched');
      // 2. a second save
      state.journals.push({ id: 'jNew', title: '', text: 'added after the move', type: 'negative', savedAt: Date.now() });
      const r2 = await cloudSaveNow('u'), d2 = await server();
      check('a second save lands as the next revision', r2 === 'synced' && d2.rev === d1.rev + 1, r2 + ' rev ' + d2.rev);
      // 3. another device writes a newer revision
      const other = clone(currentPayload()); other.journals.push({ id: 'jOther', title: '', text: 'other device', type: 'negative', savedAt: 5 });
      const sealed = await e2eeEncrypt(other, e2ee.key, e2ee.salt, e2ee.iterUsed);
      await ref.set({ enc: sealed.env, rev: d2.rev + 1, updatedAt: 1 });
      state.journals.push({ id: 'jMine', title: '', text: 'meanwhile here', type: 'negative', savedAt: 6 });
      const theirs = JSON.stringify(await server());
      const r3 = await cloudSaveNow('u');
      check('a newer revision from another device is refused, and left alone', r3 === 'conflict' && JSON.stringify(await server()) === theirs, r3);
      const r3b = await cloudLoadOrMigrate('u'), ids = (await e2eeDecrypt((await server()).enc, e2ee.key)).data.journals.map(j => j.id);
      check('reopening merges both devices’ entries', r3b === 'synced' && ['jOther', 'jMine', 'jNew'].every(i => ids.indexOf(i) >= 0), r3b);
      // 4. an older build leaves readable fields beside the encrypted copy (a real merge write)
      await ref.set({ journals: [{ id: 'stray', title: '', text: 'older build', type: 'negative', savedAt: 9 }], updatedAt: 2 }, { merge: true });
      const dirty = Object.keys(await server()).sort().join(',');
      TestCloud.resetE2ee(PIN); e2ee.iter = window.__E2EE_DEFAULT_ITER; hasLoadedFromCloud = false;
      const r4 = await cloudLoadOrMigrate('u'), d4 = await server();
      check('readable leftovers are merged in and cleaned out', dirty.indexOf('journals') >= 0 && Object.keys(d4).sort().join(',') === 'enc,rev,updatedAt'
        && (await e2eeDecrypt(d4.enc, e2ee.key)).data.journals.some(j => j.id === 'stray') && state.journals.some(j => j.id === 'stray'), r4);
      // 5. a new phone: nothing local, only the PIN. Opening must not write.
      const want = canon(currentPayload());
      state.thoughts = []; state.grievances = []; state.journals = []; state.daily = {}; state.checkins = []; state.deleted = {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], deleted: {} }));
      TestCloud.resetE2ee(PIN); e2ee.iter = window.__E2EE_DEFAULT_ITER; hasLoadedFromCloud = false;
      const revBefore = (await server()).rev, r5 = await cloudLoadOrMigrate('u');
      check('a new phone gets everything back with only the PIN, and writes nothing', r5 === 'synced' && canon(currentPayload()) === want && (await server()).rev === revBefore, r5);
      // 6. a wrong PIN
      TestCloud.resetE2ee('00000000'); e2ee.iter = window.__E2EE_DEFAULT_ITER; hasLoadedFromCloud = false;
      const keep = JSON.stringify(await server()), r6 = await cloudLoadOrMigrate('u');
      check('a wrong PIN opens nothing and leaves the server copy untouched', r6 === 'error' && JSON.stringify(await server()) === keep, r6);
      // 7. the size limit, against the real server
      const noise = n => { const o = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(o.subarray(i, Math.min(n, i + 65536))); return o; };
      const kb = await e2eeDeriveBytes('4321', crypto.getRandomValues(new Uint8Array(16)), 1500), key = await e2eeImport(kb);
      const big = Object.assign(clone(original), { journals: [{ id: 'big', title: '', text: b64enc(noise(600000)), type: 'negative', savedAt: 1 }] });
      const sealedBig = await e2eeEncrypt(big, key, b64enc(crypto.getRandomValues(new Uint8Array(16))), 1500);
      const lim = emuDb.collection('limits').doc('t');
      await lim.set({ enc: sealedBig.env, rev: 1, updatedAt: 1 });
      check('a large encrypted copy (~800 KB, several pieces) is accepted and reads back identical',
        sealedBig.env.parts.length >= 4 && (await e2eeDecrypt((await lim.get({ source: 'server' })).data().enc, key)).json === sealedBig.json, sealedBig.env.parts.length + ' pieces');
      let refused = false; try { await lim.set({ x: 'a'.repeat(1100000) }); } catch (e) { refused = true; }
      check('over 1 MiB the real server refuses, and so does the pre-flight', refused && !!firestoreProblem({ x: 'a'.repeat(1100000) }));
    } finally {
      fbDb.collection = realCollection; hasLoadedFromCloud = false; TestCloud.resetE2ee(null);
      Object.keys(localStorage).filter(k => k.startsWith('stillwater') || k.startsWith('sw_e2ee')).forEach(k => localStorage.removeItem(k));
    }
    return { allOk: checks.every(c => c.ok), passed: checks.filter(c => c.ok).length, total: checks.length, checks };
  }
  window.runEmulatorCheck = runEmulatorCheck;
})();
