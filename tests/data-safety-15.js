/* Round 15 — end-to-end encryption of the cloud copy. Same contract: runAll15().

   What goes to the cloud is ciphertext, made with a key from the PIN. This round
   pins what that must mean: nothing readable is ever written, the key and the
   data survive every ordinary journey (new phone, relaunch, two devices, a
   half-finished move), and — because the cloud copy is the safety net — the app
   refuses to overwrite anything it cannot open or did not merge. The Firestore
   stub is faithful (1 MiB, no undefined, merge vs replace, server reads), and the
   documents the app writes are also run through the real SDK's own validator. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEY = STORAGE_KEY;
  const clone = v => JSON.parse(JSON.stringify(v));
  const PIN = '73920486';
  const SECRETS = ['SECRET-JOURNAL-ONE', 'SECRET-JOURNAL-TWO', 'SECRET-DAILY-ANSWER', 'SECRET-CHECKIN-NOTE', 'SECRET-STRAY'];

  const dayOf = (d, over) => Object.assign(
    { d, ci: {}, sc: { done: true, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 }, over || {});
  const payload = () => ({
    thoughts: [], grievances: [],
    journals: [
      { id: 'j1', title: 'one', text: 'SECRET-JOURNAL-ONE', type: 'negative', savedAt: 100 },
      { id: 'j2', title: 'two', text: 'SECRET-JOURNAL-TWO', type: 'negative', savedAt: 200 },
    ],
    daily: { '2026-09-10': dayOf('2026-09-10', { ci: { where: 'SECRET-DAILY-ANSWER' }, ts: 5000,
      dp: [{ id: 'q1', theme: 'self', q: 'Q1', a: 'SECRET-DAILY-ANSWER' }] }) },
    checkins: [{ id: 'k1', at: 10, createdAt: 10, updatedAt: 10, ci: { mental: 2 }, trigger: '', note: 'SECRET-CHECKIN-NOTE' }],
    deleted: { gone: 7 },
  });
  const canon = p => {
    const n = normalizeCloudPayload(p);
    const byId = a => a.slice().sort((x, y) => String(x.id).localeCompare(String(y.id)));
    return JSON.stringify([byId(n.thoughts), byId(n.grievances), byId(n.journals), byId(n.checkins),
      Object.keys(n.daily).filter(k => dayHasContent(n.daily[k])).sort().map(k => [k, n.daily[k]]), Object.keys(n.deleted).sort()]);
  };
  const noise = (n) => { const out = new Uint8Array(n); for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536))); return out; };
  const leaks = text => SECRETS.filter(s => text.indexOf(s) >= 0 || text.indexOf(btoa(s)) >= 0);
  function reset() {
    if (typeof cloudSaveTimer !== 'undefined' && cloudSaveTimer) { clearTimeout(cloudSaveTimer); cloudSaveTimer = null; }
    ['stillwater_wal', 'stillwater_wal_checkins', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    state.current = { thought:null, grievance:null, journal:null, checkin:null };
    hasLoadedFromCloud = false; currentUser = null;
    localStorage.setItem('stillwater_legacy_prompted_', '1');           // no recovery prompt over the page
    localStorage.setItem('stillwater_legacy_pulled_test@example.invalid', '1');   // and never a call to the old project
    TestCloud.resetE2ee(PIN);
    hideUnlock();
  }
  function seedLocal(p) {
    state.thoughts = clone(p.thoughts || []); state.grievances = clone(p.grievances || []);
    state.journals = clone(p.journals || []); state.daily = clone(p.daily || {});
    state.checkins = clone(p.checkins || []); state.deleted = clone(p.deleted || {});
    persist();
  }
  const sdkAccepts = (doc) => {                       // the real SDK validates client-side, before any network
    let app; try { app = firebase.app('t-validate'); } catch (e) { app = firebase.initializeApp({ projectId: 'v', apiKey: 'x', appId: 'x' }, 't-validate'); }
    try { app.firestore().collection('t').doc('t').set(doc).catch(() => {}); return true; } catch (e) { return false; }
  };
  const legacyDoc = (p) => Object.assign({ updatedAt: 1 }, clone(p));
  const overlayShown = () => !document.querySelector('#unlock-overlay').classList.contains('hidden');
  async function rig(cloudDocs) {
    const cloud = new TestCloud.FakeCloud(cloudDocs || {});
    const un = cloud.install();
    return { cloud, un };
  }
  async function newKey(pin, iter) {
    const salt = b64enc(crypto.getRandomValues(new Uint8Array(16)));
    const kb = await e2eeDeriveBytes(pin, b64dec(salt), iter || 1500);
    return { salt, kb, key: await e2eeImport(kb) };
  }
  /** Run a scenario with a clean slate and always put the real Firestore and sign-in state back. */
  const scenario = (name, fn) => t(name, async () => {
    reset();
    try { await fn(); } finally { currentUser = null; hasLoadedFromCloud = false; TestCloud.resetE2ee(null); hideUnlock(); }
  });

  // ---------- the cryptography itself ----------
  t('a payload seals and opens to exactly what was sealed, whatever is in it', async () => {
    const k = await newKey('4321');
    const p = payload(); p.journals[0].text = 'Line one\nLine two — “quoted” 😀 ünïcöde \u0000 end';
    const sealed = await e2eeEncrypt(p, k.key, k.salt, 1500);
    const opened = await e2eeDecrypt(sealed.env, k.key);
    eq(opened.json, sealed.json, 'the sealed text:');
    eq(JSON.stringify(opened.data), JSON.stringify(stripUndefined(p)), 'the data:');
    if (typeof CompressionStream === 'function') eq(sealed.env.z, 1, 'compressed:');
  });

  t('the stored copy shows none of the text, and none of the field names', async () => {
    const k = await newKey('4321');
    const sealed = await e2eeEncrypt(payload(), k.key, k.salt, 1500);
    const stored = JSON.stringify({ enc: sealed.env, rev: 1, updatedAt: 1 });
    eq(leaks(stored).join(','), '', 'text visible in the stored copy:');
    ['journals', 'daily', 'checkins', 'thoughts', 'grievances', 'where', 'savedAt', 'type'].forEach(w =>
      ok(stored.indexOf(w) < 0, `the stored copy shows the word "${w}"`));
  });

  t('the wrong key does not open it', async () => {
    const a = await newKey('4321'), b = await newKey('4322');
    const sealed = await e2eeEncrypt(payload(), a.key, a.salt, 1500);
    let opened = false; try { await e2eeDecrypt(sealed.env, b.key); opened = true; } catch (e) {}
    eq(opened, false, 'opened with the wrong key:');
  });

  t('a damaged, altered or shortened copy does not open', async () => {
    const k = await newKey('4321');
    const sealed = await e2eeEncrypt(payload(), k.key, k.salt, 1500);
    const tryOpen = async (env) => { try { await e2eeDecrypt(env, k.key); return true; } catch (e) { return false; } };
    const flip = s => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    ok(await tryOpen(sealed.env), 'setup: the untouched copy opens');
    eq(await tryOpen(Object.assign({}, sealed.env, { parts: [flip(sealed.env.parts[0])].concat(sealed.env.parts.slice(1)) })), false, 'one character changed:');
    eq(await tryOpen(Object.assign({}, sealed.env, { iv: b64enc(crypto.getRandomValues(new Uint8Array(12))) })), false, 'a different IV:');
    eq(await tryOpen(Object.assign({}, sealed.env, { parts: [sealed.env.parts[0].slice(0, -8)] })), false, 'cut short:');
  });

  t('every write uses a fresh IV, so the same data never produces the same bytes', async () => {
    const k = await newKey('4321');
    const a = await e2eeEncrypt(payload(), k.key, k.salt, 1500), b = await e2eeEncrypt(payload(), k.key, k.salt, 1500);
    ok(a.env.iv !== b.env.iv, 'the same IV was used twice');
    ok(a.env.parts.join('') !== b.env.parts.join(''), 'identical ciphertext for identical data');
  });

  t('it still works where the browser cannot compress', async () => {
    const k = await newKey('4321'), real = window.CompressionStream;
    window.CompressionStream = undefined;
    try {
      const sealed = await e2eeEncrypt(payload(), k.key, k.salt, 1500);
      eq(sealed.env.z, 0, 'flag:');
      eq((await e2eeDecrypt(sealed.env, k.key)).json, sealed.json, 'round trip:');
    } finally { window.CompressionStream = real; }
  });

  t('a large copy is split into pieces under the limit and still opens identically', async () => {
    const k = await newKey('4321');
    const hiss = b64enc(noise(600000));                                              // ~800,000 characters that cannot compress
    const p = payload(); p.journals[0].text = hiss;
    const sealed = await e2eeEncrypt(p, k.key, k.salt, 1500);
    ok(sealed.env.parts.length >= 4, 'expected several pieces, got ' + sealed.env.parts.length);
    ok(sealed.env.parts.every(x => x.length <= 200000), 'a piece is over 200,000 characters');
    eq((await e2eeDecrypt(sealed.env, k.key)).json, sealed.json, 'round trip:');
    eq(firestoreProblem({ enc: sealed.env, rev: 1, updatedAt: 1 }), '', 'a copy this size is within the document limit');
  });

  t('a copy too big for Firestore is caught before anything is sent', async () => {
    const k = await newKey('4321');
    const p = payload(); p.journals[0].text = b64enc(noise(900000));                                      // ~1.2 million characters
    const sealed = await e2eeEncrypt(p, k.key, k.salt, 1500);
    ok(/over 1 MB/.test(firestoreProblem({ enc: sealed.env, rev: 1, updatedAt: 1 })), 'the pre-flight must refuse it');
  });

  t('the pre-flight catches what Firestore rejects, and passes what it accepts', () => {
    eq(firestoreProblem({ a: 1, b: 'x', c: [1, 'y', { z: 2 }] }), '', 'a valid document:');
    ok(firestoreProblem({ a: undefined }), 'undefined');
    ok(firestoreProblem({ a: [[1]] }), 'a nested array');
    ok(firestoreProblem({ a: 'x'.repeat(1100000) }), 'a string over 1 MB');
    ok(firestoreProblem({ __x__: 1 }), 'a reserved field name');
  });

  t('the key comes from the PIN: same PIN and salt agree, anything else differs', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16)), other = crypto.getRandomValues(new Uint8Array(16));
    const a = await e2eeDeriveBytes('4321', salt, 1500), b = await e2eeDeriveBytes('4321', salt, 1500);
    const c = await e2eeDeriveBytes('4322', salt, 1500), d = await e2eeDeriveBytes('4321', other, 1500);
    eq(b64enc(a), b64enc(b), 'same PIN, same salt:');
    ok(b64enc(a) !== b64enc(c), 'a different PIN gave the same key');
    ok(b64enc(a) !== b64enc(d), 'a different salt gave the same key');
    eq(a.length, 32, 'key length in bytes:');
  });

  t('the real strength is 600,000 rounds and takes a moment, not a minute', async () => {
    eq(window.__E2EE_DEFAULT_ITER, 600000, 'the app default:');
    const t0 = performance.now();
    await e2eeDeriveBytes('4321', crypto.getRandomValues(new Uint8Array(16)), 600000);
    const ms = performance.now() - t0;
    ok(ms < 15000, 'deriving the real key took ' + Math.round(ms) + ' ms');
  });

  // ---------- what reaches the cloud ----------
  scenario('a new account’s first sync writes only ciphertext', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({});
    try { await cloudLoadOrMigrate('u'); } finally { un(); }
    const doc = cloud.peek();
    ok(doc && doc.enc, 'an encrypted copy must exist');
    eq(Object.keys(doc).sort().join(','), 'enc,rev,updatedAt', 'the only fields:');
    eq(leaks(cloud.text()).join(','), '', 'readable text in the cloud:');
    ok(sdkAccepts(doc), 'the real SDK must accept exactly this document');
    eq(canon((await e2eeDecrypt(doc.enc, e2ee.key)).data), canon(payload()), 'and it opens to the same data:');
  });

  scenario('the readable copy is replaced by one that opens to the same data, in the right order', async () => {
    seedLocal({ journals: [payload().journals[0]], daily: {}, checkins: [], deleted: {} });
    const legacy = legacyDoc({ thoughts: [], grievances: [], journals: [payload().journals[1]], daily: payload().daily, checkins: payload().checkins, deleted: {} });
    const { cloud, un } = await rig({ 'users/u': legacy });
    const snaps = []; cloud.onWrite = async () => snaps.push(cloud.peek());
    try { await cloudLoadOrMigrate('u'); } finally { un(); }
    const ops = cloud.log.map(e => e.op === 'get' ? (e.server ? 'get(server)' : 'get') : (e.merge ? 'set(merge)' : 'set(replace)')).join(' > ');
    ok(/set\(merge\) > get\(server\) > set\(replace\) > get\(server\)$/.test(ops), 'order of operations: ' + ops);
    ok(snaps[0].enc && snaps[0].journals, 'phase 1 adds the encrypted copy BESIDE the readable one');
    ok(snaps[1].enc && !snaps[1].journals && !snaps[1].daily && !snaps[1].checkins, 'phase 2 leaves only the encrypted copy');
    const doc = cloud.peek();
    eq(Object.keys(doc).sort().join(','), 'enc,rev,updatedAt', 'the only fields now:');
    eq(leaks(cloud.text()).join(','), '', 'readable text left in the cloud:');
    const all = (await e2eeDecrypt(doc.enc, e2ee.key)).data;
    eq(all.journals.map(j => j.id).sort().join(','), 'j1,j2', 'this device’s and the cloud’s entries are both there:');
    ok(all.daily['2026-09-10'] && all.checkins.length === 1, 'days and check-ins too');
    ok(sdkAccepts(snaps[0]) && sdkAccepts(snaps[1]), 'the real SDK accepts both documents written');
  });

  scenario('if the encrypted copy never arrives, the readable copy is kept untouched, and the next launch finishes the job', async () => {
    seedLocal(payload());
    const legacy = legacyDoc(payload());
    const { cloud, un } = await rig({ 'users/u': legacy });
    try {
      cloud.dropWrites = true;
      const first = await cloudLoadOrMigrate('u');
      eq(JSON.stringify(cloud.peek()), JSON.stringify(legacy), 'the cloud document after a lost write:');
      eq(first, 'error', 'reported as:');
      eq(state.journals.length, 2, 'this device’s data is intact:');
      cloud.dropWrites = false; e2ee.conflict = false;
      const second = await cloudLoadOrMigrate('u');
      eq(second, 'synced', 'the retry:');
      ok(cloud.peek().enc && !cloud.peek().journals, 'now encrypted, readable copy gone');
    } finally { un(); }
  });

  scenario('if the encrypted copy arrives damaged, the readable copy is kept, and a retry recovers', async () => {
    seedLocal(payload());
    const legacy = legacyDoc(payload());
    const { cloud, un } = await rig({ 'users/u': legacy });
    try {
      cloud.corruptNext = true;
      eq(await cloudLoadOrMigrate('u'), 'error', 'first attempt:');
      const mid = cloud.peek();
      eq(JSON.stringify(mid.journals), JSON.stringify(legacy.journals), 'the readable copy is still whole:');
      TestCloud.resetE2ee(PIN);                          // a fresh launch
      eq(await cloudLoadOrMigrate('u'), 'synced', 'the retry, with a damaged copy still sitting beside it:');
      const doc = cloud.peek();
      ok(doc.enc && !doc.journals, 'encrypted, readable copy gone');
      eq(canon((await e2eeDecrypt(doc.enc, e2ee.key)).data), canon(payload()), 'and it opens to the right data:');
    } finally { un(); }
  });

  scenario('with no key, nothing readable is ever uploaded', async () => {
    seedLocal({ journals: [payload().journals[0]], daily: {}, checkins: [], deleted: {} });
    const legacy = legacyDoc({ thoughts: [], grievances: [], journals: [payload().journals[1]], daily: {}, checkins: [], deleted: {} });
    TestCloud.resetE2ee(null);
    const { cloud, un } = await rig({ 'users/u': legacy });
    try {
      eq(await cloudLoadOrMigrate('u'), 'locked', 'result:');
      eq(JSON.stringify(cloud.peek()), JSON.stringify(legacy), 'the cloud document:');
      eq(cloud.sets().length, 0, 'writes:');
      ok(state.journals.some(j => j.id === 'j2'), 'the cloud’s entries are still merged in, for reading');
      state.journals.push({ id: 'j3', title: '', text: 'typed after', type: 'negative', savedAt: 300 });
      await cloudSaveNow('u');
      eq(cloud.sets().length, 0, 'writes after more typing:');
      eq($('#sync-state').dataset.state, 'locked', 'the indicator:');
    } finally { un(); }
  });

  scenario('the PIN prompt appears once, “Not now” leaves the app usable, and the indicator brings it back', async () => {
    TestCloud.resetE2ee(null); e2ee.prompted = false;
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      ok(overlayShown(), 'the prompt must appear');
      document.querySelector('#unlock-skip').click();
      ok(!overlayShown(), '“Not now” must close it');
      await cloudLoadOrMigrate('u'); await cloudSaveNow('u');
      ok(!overlayShown(), 'it must not come back by itself');
      document.querySelector('#sync-state').click();
      ok(overlayShown(), 'tapping the indicator must reopen it');
      ok(parseFloat(getComputedStyle(document.querySelector('#unlock-pin')).fontSize) >= 16, 'the field must be 16px or more, or iOS zooms in');
      eq(cloud.sets().length, 0, 'writes meanwhile:');
    } finally { un(); }
  });

  scenario('a right PIN unlocks and encrypts, and the PIN itself is never stored', async () => {
    TestCloud.resetE2ee(null);
    seedLocal(payload());
    currentUser = { uid: 'u', email: 'test@example.invalid', reauthenticateWithCredential: async () => ({}) };
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      const r = await unlockWithPin(PIN);
      ok(r.ok, 'the right PIN: ' + r.msg);
      eq(await cloudLoadOrMigrate('u'), 'synced', 'then:');
      ok(cloud.peek().enc && !cloud.peek().journals, 'the cloud copy is encrypted');
      ok(localStorage.getItem('sw_e2ee_key'), 'the key is cached on this device');
      const where = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if ((localStorage.getItem(k) || '').indexOf(PIN) >= 0) where.push(k); }
      for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if ((sessionStorage.getItem(k) || '').indexOf(PIN) >= 0) where.push('session:' + k); }
      eq(where.join(','), '', 'the PIN found in storage under:');
      eq(cloud.text().indexOf(PIN), -1, 'the PIN found in the cloud');
    } finally { un(); }
  });

  scenario('a wrong PIN is refused, and nothing gets encrypted under it', async () => {
    TestCloud.resetE2ee(null);
    currentUser = { uid: 'u', email: 'test@example.invalid',
      reauthenticateWithCredential: async () => { const e = new Error('x'); e.code = 'auth/wrong-password'; throw e; } };
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      const r = await unlockWithPin('1111');
      eq(r.ok, false, 'a wrong PIN:');
      ok(/doesn.t match/.test(r.msg), 'the message: ' + r.msg);
      eq(sessionPin, null, 'the PIN kept after a refusal:');
      eq(cloud.sets().length, 0, 'writes:');
      eq((await unlockWithPin('12')).ok, false, 'a PIN that is too short:');
    } finally { un(); }
  });

  scenario('an encrypted copy is unlocked by its own PIN, and by no other', async () => {
    TestCloud.resetE2ee(null);
    const sealed = await TestCloud.sealedDoc(payload(), PIN, 4);
    currentUser = { uid: 'u', email: 'test@example.invalid', reauthenticateWithCredential: async () => ({}) };
    const { cloud, un } = await rig({ 'users/u': sealed.doc });
    try {
      eq((await unlockWithPin('1111')).ok, false, 'a wrong PIN:');
      eq(sessionPin, null, 'the PIN kept after a refusal:');
      eq((await unlockWithPin(PIN)).ok, true, 'the right PIN:');
    } finally { un(); }
  });

  // ---------- journeys ----------
  scenario('a new phone opens the same cloud copy with only the PIN', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      const before = cloud.sets().length;
      // a different phone: nothing local, no cached key, only the PIN it just signed in with
      state.thoughts = []; state.grievances = []; state.journals = []; state.daily = {}; state.checkins = []; state.deleted = {};
      localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], deleted: {} }));
      TestCloud.resetE2ee(PIN); hasLoadedFromCloud = false;
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      eq(canon(currentPayload()), canon(payload()), 'everything is back, identical:');
      eq(cloud.sets().length, before, 'opening it must not write:');
      ok(localStorage.getItem('sw_e2ee_key'), 'and the key is cached for next time');
    } finally { un(); }
  });

  scenario('a returning launch opens with the cached key and never asks for the PIN', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      TestCloud.resetE2ee(null); e2ee.prompted = false;                 // a relaunch: no PIN in memory, no key in memory
      // resetE2ee wipes the cache too, so put back exactly what the first session cached
      const salt = cloud.peek().enc.salt;
      const kb = await e2eeDeriveBytes(PIN, b64dec(salt), cloud.peek().enc.iter);
      localStorage.setItem('sw_e2ee_key', JSON.stringify({ uid: 'u', salt, iter: cloud.peek().enc.iter, k: b64enc(kb) }));
      hasLoadedFromCloud = false; hideUnlock();
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      ok(!overlayShown(), 'the PIN prompt must not appear');
      eq(canon(currentPayload()), canon(payload()), 'data:');
    } finally { un(); }
  });

  scenario('a cached key belonging to another account is ignored, and a stale one asks for the PIN rather than failing', async () => {
    TestCloud.resetE2ee(null); e2ee.prompted = false;
    const sealed = await TestCloud.sealedDoc(payload(), PIN, 2);
    const { cloud, un } = await rig({ 'users/u': sealed.doc });
    try {
      localStorage.setItem('sw_e2ee_key', JSON.stringify({ uid: 'someone-else', salt: sealed.doc.enc.salt, iter: 1500, k: b64enc(sealed.keyBytes) }));
      eq(await cloudLoadOrMigrate('u'), 'locked', 'another account’s key:');
      hideUnlock(); e2ee.prompted = false;
      localStorage.setItem('sw_e2ee_key', JSON.stringify({ uid: 'u', salt: sealed.doc.enc.salt, iter: 1500, k: b64enc(new Uint8Array(32)) }));
      eq(await cloudLoadOrMigrate('u'), 'locked', 'a stale key:');
      ok(overlayShown(), 'and it asks for the PIN');
      eq(cloud.sets().length, 0, 'writes:');
    } finally { un(); }
  });

  scenario('a cloud copy this device cannot open is never overwritten', async () => {
    seedLocal(payload());
    TestCloud.resetE2ee('00000000');                               // a PIN that does not match
    const sealed = await TestCloud.sealedDoc(payload(), PIN, 4);
    const { cloud, un } = await rig({ 'users/u': sealed.doc });
    try {
      eq(await cloudLoadOrMigrate('u'), 'error', 'result:');
      eq(hasLoadedFromCloud, false, 'must stay gated:');
      hasLoadedFromCloud = true;                                   // even if something forced it open
      await cloudSaveNow('u');
      eq(cloud.sets().length, 0, 'writes:');
      eq(JSON.stringify(cloud.peek()), JSON.stringify(sealed.doc), 'the cloud document:');
      eq(state.journals.length, 2, 'this device’s data is intact:');
    } finally { un(); }
  });

  scenario('a damaged cloud copy is never overwritten and is reported, not guessed at', async () => {
    seedLocal(payload());
    const sealed = await TestCloud.sealedDoc(payload(), PIN, 4);
    const bad = clone(sealed.doc); bad.enc.parts[0] = (bad.enc.parts[0][0] === 'A' ? 'B' : 'A') + bad.enc.parts[0].slice(1);
    const { cloud, un } = await rig({ 'users/u': bad });
    try {
      eq(await cloudLoadOrMigrate('u'), 'error', 'result:');
      eq(cloud.sets().length, 0, 'writes:');
      eq(JSON.stringify(cloud.peek()), JSON.stringify(bad), 'the cloud document:');
    } finally { un(); }
  });

  scenario('a save replaces the encrypted copy with the next revision, carrying the new words', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      const r0 = cloud.peek().rev;
      state.journals.push({ id: 'j9', title: '', text: 'SECRET-STRAY typed later', type: 'negative', savedAt: 999 });
      eq(await cloudSaveNow('u'), 'synced', 'result:');
      const doc = cloud.peek();
      eq(doc.rev, r0 + 1, 'revision:');
      eq(Object.keys(doc).sort().join(','), 'enc,rev,updatedAt', 'the only fields:');
      ok((await e2eeDecrypt(doc.enc, e2ee.key)).data.journals.some(j => j.id === 'j9'), 'the new entry is in it');
      eq(leaks(cloud.text()).join(','), '', 'readable text in the cloud:');
    } finally { un(); }
  });

  scenario('two saves at once run one after the other and both land', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      const r0 = cloud.peek().rev;
      const [a, b] = await Promise.all([cloudSaveNow('u'), cloudSaveNow('u')]);
      eq(a + ',' + b, 'synced,synced', 'results:');
      eq(cloud.peek().rev, r0 + 2, 'revision after two saves:');
      eq(e2ee.conflict, false, 'a false conflict:');
    } finally { un(); }
  });

  scenario('a change made on another device is never overwritten, and reopening merges both', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      const r0 = cloud.peek().rev;
      // the other device writes a newer revision under the same key
      const other = clone(payload()); other.journals.push({ id: 'jOther', title: '', text: 'from the other device', type: 'negative', savedAt: 500 });
      const sealed = await e2eeEncrypt(other, e2ee.key, e2ee.salt, e2ee.iterUsed);
      cloud.docs.set('users/u', { enc: sealed.env, rev: r0 + 1, updatedAt: 1 });
      const theirs = JSON.stringify(cloud.peek());
      state.journals.push({ id: 'jMine', title: '', text: 'written here meanwhile', type: 'negative', savedAt: 600 });
      const before = cloud.sets().length;
      eq(await cloudSaveNow('u'), 'conflict', 'saving over a newer revision:');
      eq(cloud.sets().length, before, 'writes:');
      eq(JSON.stringify(cloud.peek()), theirs, 'the other device’s copy:');
      eq(await cloudSaveNow('u'), 'conflict', 'and it stays refused until reopened:');
      eq(cloud.log.filter(e => e.op === 'get').length > 0, true, 'setup sanity');
      // reopening merges both
      eq(await cloudLoadOrMigrate('u'), 'synced', 'reopened:');
      const all = (await e2eeDecrypt(cloud.peek().enc, e2ee.key)).data.journals.map(j => j.id).sort().join(',');
      eq(all, 'j1,j2,jMine,jOther', 'both devices’ entries, in the cloud:');
      eq(state.journals.map(j => j.id).sort().join(','), 'j1,j2,jMine,jOther', 'and on this device:');
    } finally { un(); }
  });

  scenario('a copy under a different key is never overwritten, even when the revision matches', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      const rev = cloud.peek().rev;
      const other = await TestCloud.sealedDoc(payload(), '11112222', rev);        // someone else's key, same revision
      cloud.docs.set('users/u', other.doc);
      const before = cloud.sets().length, theirs = JSON.stringify(cloud.peek());
      eq(await cloudSaveNow('u'), 'conflict', 'result:');
      eq(cloud.sets().length, before, 'writes:');
      eq(JSON.stringify(cloud.peek()), theirs, 'the cloud document:');
    } finally { un(); }
  });

  scenario('readable leftovers from an older build are merged in and cleaned out', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      // an older build opens the encrypted document, sees nothing it knows, and writes its own readable fields beside it
      const stray = Object.assign(cloud.peek(), { journals: [{ id: 'old1', title: '', text: 'SECRET-STRAY', type: 'negative', savedAt: 5 }] });
      cloud.docs.set('users/u', stray);
      TestCloud.resetE2ee(PIN);
      hasLoadedFromCloud = false;
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      ok(state.journals.some(j => j.id === 'old1'), 'the leftover is kept on this device');
      const doc = cloud.peek();
      ok(!doc.journals, 'and removed from the cloud’s readable fields');
      ok((await e2eeDecrypt(doc.enc, e2ee.key)).data.journals.some(j => j.id === 'old1'), 'and inside the encrypted copy');
      eq(leaks(cloud.text()).join(','), '', 'readable text left in the cloud:');
    } finally { un(); }
  });

  scenario('offline with nothing to compare against, a save waits instead of guessing', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      cloud.online = false; cloud.docs.delete('users/u');
      const before = cloud.sets().length;
      state.journals.push({ id: 'jx', title: '', text: 'typed offline', type: 'negative', savedAt: 700 });
      eq(await cloudSaveNow('u'), 'offline', 'result:');
      eq(cloud.sets().length, before, 'writes:');
      eq($('#sync-state').dataset.state, 'local', 'the indicator:');
      ok(state.journals.some(j => j.id === 'jx'), 'and what was typed is safe on this device');
    } finally { un(); }
  });

  scenario('signing out forgets the key and the PIN, but keeps the data on the device', async () => {
    seedLocal(payload());
    const { cloud, un } = await rig({ 'users/u': legacyDoc(payload()) });
    try {
      await cloudLoadOrMigrate('u');
      ok(localStorage.getItem('sw_e2ee_key') && e2ee.key && sessionPin, 'setup: a key and a PIN are held');
      e2eeForget();
      eq(localStorage.getItem('sw_e2ee_key'), null, 'the cached key:');
      eq(e2ee.key, null, 'the key in memory:');
      eq(sessionPin, null, 'the PIN in memory:');
      eq(state.journals.length, 2, 'the data on this device:');
    } finally { un(); }
  });

  // ---------- honesty ----------
  t('the indicator says what is true: PIN needed, failed, offline', () => {
    applySyncResult('locked'); eq($('#sync-state').dataset.state, 'locked', 'locked'); eq($('#sync-state').textContent, 'PIN needed', 'text');
    applySyncResult('error'); eq($('#sync-state').textContent, 'Not synced', 'error');
    applySyncResult('conflict'); eq($('#sync-state').textContent, 'Not synced', 'conflict');
    applySyncResult('offline'); eq($('#sync-state').dataset.state, 'local', 'offline');
    applySyncResult('synced'); eq($('#sync-state').textContent, 'Synced', 'synced');
    setSyncState('local');
  });

  scenario('a failed read never reports Synced', async () => {
    seedLocal(payload());
    const orig = fbDb.collection;
    fbDb.collection = () => ({ doc: () => ({ get: async () => { throw new Error('network'); }, set: async () => { throw new Error('no'); } }) });
    try { eq(await cloudLoadOrMigrate('u'), 'error', 'result:'); } finally { fbDb.collection = orig; }
  });

  t('no literal escape sequence is shown anywhere in the page (a \\u2022 typed into HTML is not a dot)', () => {
    const bad = [];
    document.querySelectorAll('*').forEach(el => {
      for (const a of el.attributes) if (/\\u[0-9a-fA-F]{4}/.test(a.value)) bad.push(el.tagName.toLowerCase() + '#' + (el.id || '?') + '[' + a.name + ']');
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;        // escapes are valid inside code
      for (const n of el.childNodes) if (n.nodeType === 3 && /\\u[0-9a-fA-F]{4}/.test(n.nodeValue)) bad.push(el.tagName.toLowerCase() + '#' + (el.id || '?') + ' text');
    });
    eq(bad.join(', '), '', 'literal escapes in the page:');
    eq(document.querySelector('#unlock-pin').placeholder, '\u2022\u2022\u2022\u2022', 'the PIN field shows dots:');
  });

  t('sign-in never says "Synced" on its own, and no readable write exists anywhere in the app', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const handler = /fbAuth\.onAuthStateChanged\(async \(user\) => \{([\s\S]*?)\n\}\);/.exec(src);
    ok(handler, 'the sign-in handler was found');
    ok(handler[1].indexOf("setSyncState('synced')") < 0, 'the sign-in handler must not claim Synced itself');
    ok(handler[1].indexOf('applySyncResult(await cloudLoadOrMigrate') >= 0, 'it must report what the load returned');
    const body = e2eeSyncUpNow.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const writes = body.match(/ref\.set\([^)]*\)/g) || [];
    ok(writes.length === 3, 'exactly three writes, found ' + writes.length);
    ok(writes.every(w => /^ref\.set\((doc|doc2)\b/.test(w)), 'every write sends the encrypted envelope: ' + writes.join(' | '));
    ok(!/\.set\(stripUndefined/.test(src), 'a readable payload must never be passed to a cloud write');
    ok(/updatedAt:\s*Date\.now\(\)/.test(body) && !/FieldValue\s*\.\s*serverTimestamp/.test(body), 'a plain number, never an SDK sentinel');
  });

  async function runAll15() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); TestCloud.resetE2ee(null); setMode('daily'); } catch (e) {}
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll15 = runAll15;
})();
