/* Round 16 — the Mind Map, and the new tab bar.  Same contract: runAll16().

   The Mind Map holds what someone says about themselves in the hardest year of their life, so it is held to
   the same standard as the journal: every answer reaches the disk at once, survives an old build's save and a
   wiped store, merges between devices by id without ever replacing, never comes back once deleted, and goes to
   the cloud encrypted. The scoring is checked against values worked out by hand. The screens are driven with
   real taps, and every piece of text on them is measured for contrast.

   Run signed OUT. Writes only to the test state. Needs fake-firestore.js loaded first. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const near = (a, b, tol, m) => { if (Math.abs(a - b) > tol) throw new Error(`${m || ''} expected ~${b}, got ${a}`); };
  const KEY = STORAGE_KEY;
  const PIN = '73920486';
  const clone = v => JSON.parse(JSON.stringify(v));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SECRETS = ['SECRET-MIND-TEXT', 'SECRET-MIND-THOUGHT'];

  // ---------- fixtures ----------
  const setRec = (id, set, a, over) => Object.assign({ id, kind: 'set', set, startedAt: 100, doneAt: 200, a, updatedAt: 200 }, over || {});
  const exRec = (id, ex, f, over) => Object.assign({ id, kind: 'ex', ex, at: 300, f, updatedAt: 300 }, over || {});
  const predRec = (id, dom, did, over) => Object.assign({ id, kind: 'pred', at: 400, dom, note: '', top: ['solve'], did: did || '', updatedAt: 400 }, over || {});
  const big5 = fn => Object.fromEntries(MM_BIG5.map(x => [x.id, fn(x)]));
  const allOf = (items, v) => Object.fromEntries(items.map(x => [x.id, v]));
  const mindDocs = () => [
    setRec('m1', 'big5', big5(() => 4)),
    exRec('m2', 'trigger', { dom: 'ex', sit: 'SECRET-MIND-TEXT one', thought: 'SECRET-MIND-THOUGHT', feel: ['Angry', 'Hurt'], int: 7, did: 'ruminate', need: ['Respect'], after: 'Neutral' }),
    exRec('m3', 'carried', { what: 'SECRET-MIND-TEXT two', str: ['Patience', 'Faith'] }),
    predRec('m4', 'ex', 'avoid'),
    setRec('m5', 'situations', { s1: 'ruminate', s1_w: 'soothe', s4: 'soothe', s4_w: '-' }, { ids: ['s1', 's4'] }),
  ];
  const mid = r => r.id;
  const canonMind = list => JSON.stringify(list.slice().sort((a, b) => a.id.localeCompare(b.id)));
  const leaks = text => SECRETS.filter(s => text.indexOf(s) >= 0 || text.indexOf(btoa(s)) >= 0);

  function reset() {
    if (typeof cloudSaveTimer !== 'undefined' && cloudSaveTimer) { clearTimeout(cloudSaveTimer); cloudSaveTimer = null; }
    clearTimeout(mmSaveTimer); mmSaveTimer = null; mmDirty = false; mmSigCache = null;
    ['stillwater_wal', 'stillwater_wal_checkins', MM_WAL_KEY, KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [], deleted: {} }));
    state.thoughts = []; state.grievances = []; state.journals = []; state.deleted = {}; state.daily = {}; state.checkins = []; state.mind = [];
    state.current = { thought: null, grievance: null, journal: null, checkin: null };
    Object.assign(mm, { screen: 'home', lens: null, recId: null, draft: null, idx: 0, ex: null, exRec: null, dom: 'ex', pred: null, busy: false });
    hasLoadedFromCloud = false; currentUser = null;
    localStorage.setItem('stillwater_legacy_prompted_', '1');
    localStorage.setItem('stillwater_legacy_pulled_test@example.invalid', '1');
    TestCloud.resetE2ee(PIN);
    hideUnlock();
  }
  function seedLocal(p) {
    state.thoughts = clone(p.thoughts || []); state.grievances = clone(p.grievances || []);
    state.journals = clone(p.journals || []); state.daily = clone(p.daily || {});
    state.checkins = clone(p.checkins || []); state.mind = clone(p.mind || []); state.deleted = clone(p.deleted || {});
    persist();
  }
  const put = (...recs) => { state.mind.push(...recs); };
  const stored = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  async function rig(cloudDocs) { const cloud = new TestCloud.FakeCloud(cloudDocs || {}); const un = cloud.install(); return { cloud, un }; }
  const scenario = (name, fn) => t(name, async () => {
    reset();
    try { await fn(); } finally { currentUser = null; hasLoadedFromCloud = false; TestCloud.resetE2ee(null); hideUnlock(); }
  });
  const tap = sel => { const el = document.querySelector(sel); if (!el) throw new Error('nothing to tap: ' + sel); el.click(); };
  const typeInto = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const sdkAccepts = (doc) => {
    let app; try { app = firebase.app('t-validate'); } catch (e) { app = firebase.initializeApp({ projectId: 'v', apiKey: 'x', appId: 'x' }, 't-validate'); }
    try { app.firestore().collection('t').doc('t').set(doc).catch(() => {}); return true; } catch (e) { return false; }
  };

  // ============ the engine, against values worked out by hand ============
  t('Temperament: forward items count as given, reverse items as 6 minus the answer', () => {
    const r = mmScoreBig5(big5(() => 4));                 // forward 4, reverse 2
    ['E', 'A', 'C', 'N'].forEach(k => near(r[k], 3, 1e-9, k + ':'));   // two of each
    near(r.O, 2.5, 1e-9, 'O has one forward and three reverse items:');
    const top = mmScoreBig5(big5(x => x.r ? 1 : 5));      // every trait answered at its highest
    ['E', 'A', 'C', 'N', 'O'].forEach(k => near(top[k], 5, 1e-9, 'high ' + k + ':'));
    const low = mmScoreBig5(big5(x => x.r ? 5 : 1));
    ['E', 'A', 'C', 'N', 'O'].forEach(k => near(low[k], 1, 1e-9, 'low ' + k + ':'));
  });

  t('Temperament uses the 20 Mini-IPIP items, four per trait, in the keying the IPIP publishes', () => {
    eq(MM_BIG5.length, 20, 'items:');
    ['E', 'A', 'C', 'N', 'O'].forEach(k => eq(MM_BIG5.filter(x => x.t === k).length, 4, k + ' items:'));
    const rev = id => MM_BIG5.find(x => x.id === id).r;
    // the reverse-keyed ones, by their wording
    const byText = s => MM_BIG5.find(x => x.q === s);
    ['Don’t talk a lot.', 'Keep in the background.', 'Am not interested in other people’s problems.', 'Am not really interested in others.',
     'Often forget to put things back in their proper place.', 'Make a mess of things.', 'Am relaxed most of the time.', 'Seldom feel blue.',
     'Have difficulty understanding abstract ideas.', 'Am not interested in abstract ideas.', 'Do not have a good imagination.'
    ].forEach(s => eq(byText(s).r, 1, 'reverse-keyed: ' + s));
    ['Am the life of the party.', 'Sympathize with others’ feelings.', 'Get chores done right away.', 'Have frequent mood swings.',
     'Have a vivid imagination.', 'Talk to a lot of different people at parties.', 'Feel others’ emotions.', 'Like order.', 'Get upset easily.'
    ].forEach(s => eq(byText(s).r, 0, 'forward-keyed: ' + s));
  });

  t('Closeness: the four styles fall where worry and distance say they should', () => {
    const mk = (anx, avd) => Object.fromEntries(MM_ATTACH.map(x => [x.id, (x.d === 'anx' ? anx : avd) === 5 ? (x.r ? 1 : 5) : (x.r ? 5 : 1)]));
    eq(mmScoreAttach(mk(5, 1)).style, 'anxious', 'high worry, low distance:');
    eq(mmScoreAttach(mk(1, 5)).style, 'avoidant', 'low worry, high distance:');
    eq(mmScoreAttach(mk(5, 5)).style, 'fearful', 'both:');
    eq(mmScoreAttach(mk(1, 1)).style, 'secure', 'neither:');
    const r = mmScoreAttach(mk(5, 1)); near(r.anx, 5, 1e-9, 'anxiety:'); near(r.avd, 1, 1e-9, 'avoidance:');
    eq(mmScoreAttach({ a1: 5 }), null, 'one answer is not enough to place anyone:');
  });

  t('Values: core and important are sorted, and only core values with a low living-score are gaps, lowest first', () => {
    const a = {}; MM_VALUES.forEach(v => { a['v:' + v.id] = 2; });
    a['v:honesty'] = 0; a['v:family'] = 0; a['v:peace'] = 0; a['v:growth'] = 1;
    a['l:honesty'] = 4; a['l:family'] = 1; a['l:peace'] = 2;
    const r = mmScoreValues(a);
    eq(r.core.map(v => v.id).join(','), 'honesty,family,peace', 'core:');
    eq(r.imp.map(v => v.id).join(','), 'growth', 'important:');
    eq(r.gaps.map(g => g.id + ':' + g.lived).join(','), 'family:1,peace:2', 'gaps, lowest first, honesty excluded at 4:');
  });

  t('Values: the "living it" questions appear only after the sort is finished, and only for core values', () => {
    const rec = { set: 'values', a: {} };
    eq(mmItems('values', rec).length, 16, 'before the sort is finished:');
    MM_VALUES.forEach(v => { rec.a['v:' + v.id] = 2; });
    rec.a['v:honesty'] = 0; rec.a['v:faith'] = 0;
    const items = mmItems('values', rec);
    eq(items.length, 18, 'two core values add two questions:');
    eq(items.slice(16).map(i => i.id).join(','), 'l:honesty,l:faith', 'which ones:');
    MM_VALUES.forEach(v => { rec.a['v:' + v.id] = 2; });
    eq(mmItems('values', rec).length, 16, 'no core values, no follow-ups:');
  });

  t('Thinking and Feelings: patterns rank by score, and steadying and costly moves average separately', () => {
    const th = mmScoreThink({ aon: 3, over: 1, cata: 2, mind: 3, should: 0 });
    eq(th.top.join(','), 'aon,mind,cata', 'patterns at "often" or above, strongest first:');
    const reg = mmScoreReg(allOf(MM_REG, 3));
    near(reg.steady, 3, 1e-9, 'steady:'); near(reg.costly, 3, 1e-9, 'costly:');
    const a = allOf(MM_REG, 1); a.ruminate = 5; a.suppress = 5; a.soothe = 5;
    const r2 = mmScoreReg(a);
    eq(r2._o[0] === 'ruminate' || r2._o[0] === 'suppress' || r2._o[0] === 'soothe', true, 'the top move is one of the three fives:');
    // costly: ruminate 5, suppress 5, numb 1, explode 1  => 3 ; steady: modify 1, reappraise 1, express 1, soothe 5 => 2
    near(r2.costly, 3, 1e-9, 'costly average:'); near(r2.steady, 2, 1e-9, 'steady average:');
  });

  t('Situations: the latest answer to a scenario replaces an earlier one, and counts add up', () => {
    reset();
    put(setRec('r1', 'situations', { s1: 'avoid', s1_w: 'soothe', s2: 'freeze', s2_w: '-' }, { startedAt: 100, ids: ['s1', 's2'] }),
        setRec('r2', 'situations', { s1: 'ruminate', s1_w: 'soothe' }, { startedAt: 500, ids: ['s1'] }));
    const S = mmSitProfile();
    eq(S.n, 2, 'scenarios answered:');
    eq(S.have.s1, 'ruminate', 'the later round wins:');
    eq(S.overall.avoid, 0, 'the replaced answer no longer counts:');
    eq(S.overall.ruminate, 1, 'ruminate:'); eq(S.overall.freeze, 1, 'freeze:');
    eq(S.wn, 1, 'a skipped "rather" is not a preference:');
    eq(S.domN.ex, 2, 'both are about the ex:');
  });

  function seedSituations() {
    const pick = (id, tag, w) => { const a = {}; a[id] = tag; if (w) a[id + '_w'] = w; return a; };
    const a = Object.assign({},
      pick('s1', 'ruminate', 'soothe'), pick('s2', 'avoid', 'soothe'), pick('s3', 'ruminate', 'soothe'),
      pick('s4', 'soothe', 'soothe'), pick('s5', 'soothe', 'soothe'),
      pick('s6', 'solve', 'solve'), pick('s7', 'solve', 'solve'), pick('s8', 'solve', 'solve'),
      pick('s9', 'soothe', 'soothe'), pick('s10', 'soothe', 'soothe'));
    put(setRec('sit1', 'situations', a, { ids: Object.keys(a).filter(k => !k.endsWith('_w')) }));
  }
  t('Prediction: the situation asked about outweighs the overall habit; with nothing answered there is no prediction', () => {
    reset();
    eq(mmPredict('ex'), null, 'nothing answered:');
    seedSituations();
    eq(mmPredict('ex').top[0].tag, 'ruminate', 'about the ex:');
    eq(mmPredict('money').top[0].tag, 'solve', 'about money:');
    eq(mmPredict('night').top[0].tag, 'soothe', 'alone and low:');
    eq(mmPredict('faith').top[0].tag, 'soothe', 'a kind never answered falls back on the overall habit (soothe is most common):');
    eq(mmPredict('ex').top.length, 3, 'three likely moves:');
    const sum = mmPredict('ex').top.reduce((s, x) => s + x.pct, 0);
    ok(sum > 0 && sum <= 100, 'percentages are shares of one whole, got ' + sum);
  });

  t('Prediction: one answer about a kind of situation nudges the estimate and does not decide it; more answers make it firmer', () => {
    const run = (exAnswers) => {
      reset();
      const a = {}; const others = ['s4', 's6', 's7', 's8', 's9', 's11'];
      others.forEach(id => { a[id] = 'solve'; });
      exAnswers.forEach(id => { a[id] = 'ruminate'; });
      put(setRec('sh', 'situations', a, { ids: Object.keys(a) }));
      return mmPredict('ex');
    };
    const one = run(['s1']), three = run(['s1', 's2', 's3']);
    eq(one.confidence, 'low', 'one answer:');
    ok(one.top[0].pct < 70, 'one answer must not read as near-certainty, got ' + one.top[0].pct + '%');
    ok(three.top[0].pct > one.top[0].pct, 'three answers are firmer than one: ' + one.top[0].pct + '% then ' + three.top[0].pct + '%');
    eq(three.top[0].tag, 'ruminate', 'and point the same way:');
  });

  t('Prediction: real moments count for more than imagined ones, and confidence grows with evidence', () => {
    reset(); seedSituations();
    eq(mmPredict('ex').confidence, 'fair', 'three answers about the ex:');
    eq(mmPredict('faith').confidence, 'low', 'none about faith:');
    put(exRec('x1', 'trigger', { dom: 'ex', did: 'confront' }), exRec('x2', 'trigger', { dom: 'ex', did: 'confront' }),
        predRec('x3', 'ex', 'confront'));
    const p = mmPredict('ex');
    eq(p.top[0].tag, 'confront', 'three real moments of pushing back beat three imagined replays:');
    eq(p.confidence, 'good', 'confidence:');
    eq(mmSitProfile().real.n, 3, 'real moments counted from trigger maps and logged predictions:');
  });

  t('Prediction: what the person would rather do is reported, and the gap needs two cases before it is called a pattern', () => {
    reset(); seedSituations();
    eq(mmPredict('ex').want, 'soothe', 'rather:');
    const S = mmSitProfile();
    ok(S.wishGap.some(g => g.have === 'ruminate' && g.want === 'soothe' && g.count === 2), 'replay-to-settle appears twice: ' + JSON.stringify(S.wishGap));
    ok(!S.wishGap.some(g => g.have === 'avoid'), 'a single case is not a pattern');
  });

  t('Rounds: six situations, spread across kinds, none repeated until all have been answered', () => {
    reset();
    const first = mmNextRound();
    eq(first.length, MM_ROUND, 'round size:');
    const doms = new Set(first.map(id => MM_SCENARIOS.find(s => s.id === id).dom));
    ok(doms.size >= 5, 'spread across kinds of situation, got ' + doms.size);
    const seen = new Set(first);
    put(setRec('rr1', 'situations', Object.fromEntries(first.map(id => [id, 'solve']).concat(first.map(id => [id + '_w', '-']))), { ids: first }));
    for (let i = 0; i < 3; i++) {
      const next = mmNextRound();
      const unseen = MM_SCENARIOS.map(s => s.id).filter(id => !seen.has(id));
      if (unseen.length >= MM_ROUND) next.forEach(id => ok(!seen.has(id), 'repeated ' + id + ' while ' + unseen.length + ' were still unasked'));
      else unseen.forEach(id => ok(next.indexOf(id) >= 0, 'left ' + id + ' out of the last round'));
      next.forEach(id => seen.add(id));
      put(setRec('rr' + (i + 2), 'situations', Object.fromEntries(next.map(id => [id, 'solve']).concat(next.map(id => [id + '_w', '-']))), { ids: next }));
    }
    eq(seen.size, MM_SCENARIOS.length, 'after four rounds every situation has been asked:');
    eq(mmNextRound().length, MM_ROUND, 'and a fifth round still has six:');
  });

  t('A situation counts as answered only when both the first move and the "rather" are in; skipping the second still counts', () => {
    const it = { id: 's1', type: 'scn' };
    eq(mmAnswered(it, {}), false, 'nothing:');
    eq(mmAnswered(it, { s1: 'avoid' }), false, 'first move only:');
    eq(mmAnswered(it, { s1: 'avoid', s1_w: '-' }), true, 'skipped:');
    eq(mmAnswered(it, { s1: 'avoid', s1_w: 'soothe' }), true, 'both:');
  });

  t('Readings fire only when the lenses they need are finished, and only on a plain pattern', () => {
    reset();
    const b = big5(x => 3); b.b4 = 5; b.b14 = 5; b.b9 = 1; b.b19 = 1;      // emotional intensity 5
    put(setRec('i1', 'big5', b));
    let P = mmProfile();
    eq(mmInsights(P, { ready: false }).length, 0, 'one lens done, nothing to say:');
    const reg = allOf(MM_REG, 3); reg.ruminate = 5;
    put(setRec('i2', 'regulate', reg));
    P = mmProfile();
    const ids = mmInsights(P, { ready: false }).map(i => i.id);
    ok(ids.indexOf('loop') >= 0, 'strong feelings plus replaying should be named: ' + ids.join(','));
    const calm = allOf(MM_REG, 3); calm.ruminate = 2;
    state.mind = state.mind.filter(r => r.id !== 'i2'); put(setRec('i3', 'regulate', calm));
    eq(mmInsights(mmProfile(), { ready: false }).map(i => i.id).indexOf('loop'), -1, 'not when the person does not replay:');
  });

  t('A reading that names a gap uses the person’s own value and score', () => {
    reset();
    const a = {}; MM_VALUES.forEach(v => { a['v:' + v.id] = 2; }); a['v:family'] = 0; a['l:family'] = 1;
    put(setRec('g1', 'values', a));
    const ins = mmInsights(mmProfile(), { ready: false }).find(i => i.id === 'gap');
    ok(ins, 'the gap is named');
    ok(/Family/.test(ins.text) && /1 out of 5/.test(ins.text), 'it says which value and how far: ' + ins.text);
  });

  // ---------- signals ----------
  const SENT = 'I always feel alone and I never get it right because I am so tired. ';   // 15 words
  function journalsOf(n, ageDays, id) { return Array.from({ length: n }, (_, i) => ({ id: (id || 'sj') + i, title: '', text: SENT, type: 'negative', savedAt: Date.now() - ageDays * 86400000 })); }
  t('Signals: word rates are counted exactly, per 1,000 words', () => {
    reset();
    state.journals = journalsOf(30, 3);                    // 450 words in the last 4 weeks
    const S = mmSignals();
    ok(S.words.ok, 'enough words');
    eq(S.words.recentN, 450, 'words counted:');
    const row = id => S.words.rows.find(r => r.id === id).recent;
    near(row('i'), 200, 0.01, '“I” words (3 of 15):');
    near(row('abs'), 133.33, 0.05, 'absolute words (always, never):');
    near(row('neg'), 133.33, 0.05, 'painful feeling words (alone, tired):');
    near(row('insight'), 66.67, 0.05, 'insight words (because):');
    near(row('pos'), 0, 1e-9, 'no warm words:');
  });

  t('Signals: too little writing says so, compares only when both periods have enough, and shows no text', () => {
    reset();
    state.journals = journalsOf(5, 3);                     // 75 words
    eq(mmSignals().words.ok, false, 'under 300 words:');
    state.journals = journalsOf(30, 3).concat(journalsOf(30, 40, 'old'));
    const S = mmSignals();
    eq(S.words.compare, true, 'two periods:');
    S.words.rows.forEach(r => eq(r.dir, 'flat', r.id + ' unchanged between periods:'));
    ok(JSON.stringify(S).indexOf('alone') < 0 && JSON.stringify(S).indexOf('tired') < 0, 'the result carries counts, never his words');
    state.journals = journalsOf(30, 3).concat(Array.from({ length: 30 }, (_, i) => ({ id: 'w' + i, title: '', text: 'We are grateful and hopeful and calm today and the day was good ok. ', type: 'positive', savedAt: Date.now() - 40 * 86400000 })));
    const S2 = mmSignals();
    eq(S2.words.rows.find(r => r.id === 'neg').dir, 'up', 'painful words up against a warmer earlier period:');
    eq(S2.words.rows.find(r => r.id === 'pos').dir, 'down', 'warm words down:');
  });

  t('Signals: it only reads, and never changes anything', () => {
    reset(); state.journals = journalsOf(30, 3);
    const before = JSON.stringify([state.journals, state.daily, state.checkins, state.mind, state.deleted]);
    mmSignals(); mmProfile(); mmPredict('ex'); mmInsights(mmProfile(), mmSignals());
    eq(JSON.stringify([state.journals, state.daily, state.checkins, state.mind, state.deleted]), before, 'state:');
  });

  t('Signals: the weekly shape and the trends come from the five ratings', () => {
    reset();
    for (let i = 1; i <= 42; i++) {
      const d = addDays(new Date(), -i), k = dayKey(d), recent = i <= 14;
      const emo = d.getDay() === 0 ? 2 : (recent ? 5 : 3);
      state.daily[k] = { d: k, ci: { emotional: emo, physical: emo, mental: 3 }, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: [], ts: 1 };
    }
    const S = mmSignals().days;
    ok(S.ok, 'enough days');
    eq(S.weekdays && S.weekdays.low.name, 'Sunday', 'the lowest day:');
    eq(S.trends.find(x => x.id === 'emotional').dir, 'up', 'emotional state last fortnight against the one before:');
    eq(S.trends.find(x => x.id === 'mental').dir, 'flat', 'a steady rating:');
    ok(S.links.length && /Emotional/.test(S.links[0].a + S.links[0].b) && S.links[0].r > 0.9, 'emotional state and body move together: ' + JSON.stringify(S.links[0]));
  });

  // ============ it is saved, and it stays saved ============
  t('every answer is on disk the instant it is given', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:temper"].mm-row'); tap('[data-mm="start:big5"]');
    eq(JSON.stringify(stored().mind || []), '[]', 'nothing is stored before an answer exists:');
    tap('[data-mm="ans:5"]');
    let rec = stored().mind[0];
    ok(rec && rec.kind === 'set' && rec.set === 'big5', 'the record is on disk after one tap');
    eq(Object.keys(rec.a).length, 1, 'answers on disk after 1 tap:');
    await wait(240); tap('[data-mm="ans:2"]'); await wait(240); tap('[data-mm="ans:3"]');
    rec = stored().mind[0];
    eq(Object.keys(rec.a).length, 3, 'answers on disk after 3 taps:');
    eq(rec.a.b1 + ',' + rec.a.b2 + ',' + rec.a.b3, '5,2,3', 'what was tapped:');
    ok(!rec.doneAt, 'not finished');
    setMode('daily');
  });

  t('a double tap records one answer, not two', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:temper"].mm-row'); tap('[data-mm="start:big5"]');
    const before = mm.idx;
    document.querySelector('[data-mm="ans:4"]').click();
    document.querySelector('[data-mm="ans:4"]').click();     // a double tap lands on the NEXT question, in the same spot
    eq(Object.keys(mmSetRecs('big5')[0].a).length, 1, 'answers:');
    eq(mm.idx, before + 1, 'moved on once:');
    await wait(240); setMode('daily');
  });

  t('closing half way keeps the answers, and "Continue" picks up at the first one left', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:temper"].mm-row'); tap('[data-mm="start:big5"]');
    for (let i = 0; i < 4; i++) { tap('[data-mm="ans:3"]'); await wait(240); }
    tap('[data-mm="quit"]');
    eq(mm.screen, 'lens', 'back on the lens page:');
    const label = document.querySelector('[data-mm="start:big5"]').textContent;
    ok(/Continue 4 of 20/.test(label), 'the button says where you are: ' + label);
    tap('[data-mm="start:big5"]');
    eq(mm.idx, 4, 'resumes at the fifth question:');
    eq(mmSetRecs('big5').length, 1, 'still one record:');
    setMode('daily');
  });

  t('going back and changing an answer replaces it, it does not add one', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:temper"].mm-row'); tap('[data-mm="start:big5"]');
    tap('[data-mm="ans:1"]'); await wait(240); tap('[data-mm="ans:2"]'); await wait(240);
    tap('[data-mm="prev"]'); tap('[data-mm="prev"]');
    eq(mm.idx, 0, 'back to the first:');
    tap('[data-mm="ans:5"]'); await wait(240);
    const rec = mmSetRecs('big5')[0];
    eq(rec.a.b1, 5, 'the new answer:'); eq(rec.a.b2, 2, 'the next one untouched:'); eq(Object.keys(rec.a).length, 2, 'count:');
    setMode('daily');
  });

  t('finishing a set scores it, shows the result, and a retake adds a record without touching the first', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:temper"].mm-row'); tap('[data-mm="start:big5"]');
    for (let i = 0; i < 20; i++) { tap('[data-mm="ans:4"]'); await wait(235); }
    eq(mm.screen, 'lens', 'result page:');
    const first = mmSetRecs('big5')[0];
    ok(first.doneAt > 0, 'finished');
    eq(document.querySelectorAll('.mm-bar').length, 5, 'five trait bars on screen:');
    ok(/Retake/.test(document.querySelector('[data-mm="start:big5"]').textContent), 'offers a retake');
    const snap = JSON.stringify(first);
    tap('[data-mm="start:big5"]'); tap('[data-mm="ans:5"]');
    eq(mmSetRecs('big5').length, 2, 'two records:');
    eq(JSON.stringify(mmSetRecs('big5')[0]), snap, 'the first is untouched:');
    near(mmProfile().big5.E, 3, 1e-9, 'the profile still reads the finished one while the retake is open:');
    tap('[data-mm="quit"]'); setMode('daily');
  });

  t('a round of situations, then a prediction, then what really happened — all through the screens', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:situ"].mm-row'); tap('[data-mm="start:situations"]');
    const ids = mm.draft.ids.slice();
    for (let i = 0; i < ids.length; i++) {
      const first = document.querySelector('[data-mm^="scn:"]'); ok(first, 'a first-move choice for ' + ids[i]);
      const tag = first.dataset.mm.split(':')[1];
      first.click(); await wait(235);
      const wish = document.querySelector('[data-mm^="wish:"]'); ok(wish, 'the "rather" step appears');
      document.querySelector('[data-mm="wish:' + tag + '"]').click(); await wait(235);
    }
    eq(mm.screen, 'lens', 'done:');
    eq(mmSitProfile().n, MM_ROUND, 'answered:');
    tap('[data-mm="dom:' + MM_SCENARIOS.find(s => s.id === ids[0]).dom + '"]');
    const btn = document.querySelector('[data-mm="predict"]'); ok(!btn.disabled, 'prediction is open once there are answers');
    typeInto(document.querySelector('#mm-pred-note'), 'SECRET-MIND-TEXT message tonight');
    btn.click();
    ok(document.querySelector('.mm-res'), 'a prediction is shown');
    eq(document.querySelectorAll('.mm-res .mm-bar').length, 3, 'three likely moves:');
    eq(mmPredRecs().length, 1, 'logged:');
    eq(document.querySelector('#mm-pred-note').value, 'SECRET-MIND-TEXT message tonight', 'the typed note survives the redraw:');
    document.querySelector('[data-mm="predict"]').click();
    eq(mmPredRecs().length, 1, 'asking twice in a row does not log twice:');
    tap('[data-mm^="did:"][data-mm$=":solve"]');
    eq(mmPredRecs()[0].did, 'solve', 'what really happened is recorded:');
    eq(mmSitProfile().real.overall.solve, 1, 'and counts as a real moment:');
    setMode('daily');
  });

  t('an exercise saves as it is typed, lists itself, and deleting it leaves a tombstone', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:feel"].mm-row'); tap('[data-mm="ex:new:trigger"]');
    eq(mm.screen, 'ex', 'the form:');
    const ta = document.querySelector('#mmf-sit'); ok(ta, 'a text field');
    typeInto(ta, 'SECRET-MIND-TEXT first words');
    ok(state.mind.length === 1 && state.mind[0].f.sit === 'SECRET-MIND-TEXT first words', 'in the record immediately');
    const w = mmWalRead()[state.mind[0].id];
    ok(w && w.f.sit && w.f.sit.v === 'SECRET-MIND-TEXT first words', 'and in the keystroke log immediately');
    tap('[data-mm^="chip:feel:m:Angry"]'); tap('[data-mm^="chip:feel:m:Hurt"]'); tap('[data-mm^="chip:feel:m:Angry"]');
    eq(state.mind[0].f.feel.join(','), 'Hurt', 'tapping a chip twice turns it off:');
    tap('[data-mm="sc:int:7"]'); eq(state.mind[0].f.int, 7, 'a 0–10 rating:');
    tap('[data-mm^="chip:did:s:ruminate"]'); eq(state.mind[0].f.did, 'ruminate', 'what I did:');
    tap('[data-mm="exdone"]');
    eq(mm.screen, 'lens', 'back on the lens:');
    ok(document.querySelector('.mm-entry'), 'listed');
    ok(JSON.stringify(stored().mind).indexOf('first words') > 0, 'on disk');
    const id = state.mind[0].id;
    const realConfirm = window.confirm; window.confirm = () => true;
    try { tap('[data-mm="ex:open:' + id + '"]'); tap('[data-mm^="del:"]'); } finally { window.confirm = realConfirm; }
    eq(state.mind.length, 0, 'gone from memory:');
    ok(state.deleted[id], 'tombstone written:');
    ok(JSON.stringify(stored().mind || []).indexOf(id) < 0, 'gone from disk:');
    setMode('daily');
  });

  t('what is typed survives the store being wiped: the log puts back both the words and the entry', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:story"].mm-row'); tap('[data-mm="ex:new:carried"]');
    typeInto(document.querySelector('#mmf-what'), 'SECRET-MIND-TEXT the thing I got through');
    const id = state.mind[0].id;
    state.mind = []; localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], deleted: {} }));
    localStorage.removeItem(KEY + '_hwm');
    eq(mmWalRestore(), 1, 'restored:');
    eq(state.mind.length, 1, 'the entry is back:');
    eq(state.mind[0].id, id, 'same entry:'); eq(state.mind[0].ex, 'carried', 'same exercise:');
    eq(state.mind[0].f.what, 'SECRET-MIND-TEXT the thing I got through', 'same words:');
    setMode('daily');
  });

  t('the log never overwrites words typed since, and never brings back a deleted entry', async () => {
    reset();
    mm.exRec = { id: 'wl1', kind: 'ex', ex: 'carried', at: 1, f: {} }; mm.screen = 'ex';
    mmWalWrite(mm.exRec, 'what', 'old words');
    put({ id: 'wl1', kind: 'ex', ex: 'carried', at: 1, f: { what: 'newer words typed since' }, updatedAt: 5 });
    eq(mmWalRestore(), 0, 'nothing to restore:'); eq(state.mind[0].f.what, 'newer words typed since', 'newer words kept:');
    state.deleted.wl1 = Date.now(); state.mind = [];
    eq(mmWalRestore(), 0, 'a deleted entry stays deleted:'); eq(state.mind.length, 0, 'still gone:');
  });

  t('closing the app with a pending edit still saves it (the pagehide flush)', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:story"].mm-row'); tap('[data-mm="ex:new:bestworst"]');
    typeInto(document.querySelector('#mmf-best'), 'SECRET-MIND-TEXT best days');
    ok(JSON.stringify(stored().mind || []).indexOf('best days') < 0, 'setup: the timed save has not run yet');
    flushPending();
    ok(JSON.stringify(stored().mind).indexOf('best days') > 0, 'on disk after the flush');
    setMode('daily');
  });

  t('typing keeps going into the live entry after a merge swaps the object underneath', async () => {
    reset(); setMode('mind');
    tap('[data-mm="lens:story"].mm-row'); tap('[data-mm="ex:new:bestworst"]');
    const ta = document.querySelector('#mmf-best');
    typeInto(ta, 'SECRET-MIND-TEXT start');
    const old = state.mind[0];
    state.mind = mergeById([], [Object.assign({}, clone(old), { updatedAt: old.updatedAt + 5000 })], 'updatedAt');   // the cloud's newer copy lands
    ok(state.mind[0] !== old, 'setup: the object was replaced');
    typeInto(ta, 'SECRET-MIND-TEXT start and more');
    eq(state.mind[0].f.best, 'SECRET-MIND-TEXT start and more', 'the words went into the live entry:');
    flushPending();
    ok(JSON.stringify(stored().mind).indexOf('start and more') > 0, 'and reached the disk');
    setMode('daily');
  });

  scenario('an old build saving over the store cannot lose the Mind Map: the safety copy brings it back', async () => {
    seedLocal({ mind: mindDocs(), journals: [{ id: 'j1', title: 'a', text: 'kept', type: 'negative', savedAt: 5 }] });
    ok(JSON.stringify(JSON.parse(localStorage.getItem(KEY + '_hwm'))).indexOf('"mind"') > 0, 'the safety copy holds the Mind Map');
    // what 1.4.4 does on a keystroke: saves ITS view of the data, which has no Mind Map in it
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: stored().journals, daily: {}, checkins: [], deleted: {} }));
    state.mind = [];
    restoreOnLaunch();
    eq(canonMind(state.mind), canonMind(mindDocs()), 'every record is back, exactly:');
    ok(stored().mind && stored().mind.length === mindDocs().length, 'and saved again');
  });

  scenario('the safety copy keeps up when ONLY the Mind Map grows, and brings that growth back after an old build’s save', async () => {
    seedLocal({ journals: [{ id: 'j1', title: 'a', text: 'kept', type: 'negative', savedAt: 5 }] });
    ok(JSON.stringify(JSON.parse(localStorage.getItem(KEY + '_hwm'))).indexOf('"m1"') < 0, 'setup: no Mind Map in the safety copy yet');
    state.mind = clone(mindDocs()); persist();                     // nothing else changed; only the Mind Map grew
    const hwm = JSON.parse(localStorage.getItem(KEY + '_hwm'));
    eq((hwm.mind || []).length, mindDocs().length, 'the safety copy now holds the new records:');
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: stored().journals, daily: {}, checkins: [], deleted: {} }));
    state.mind = []; restoreOnLaunch();
    eq(canonMind(state.mind), canonMind(mindDocs()), 'and they come back:');
  });

  scenario('the safety copy never brings back something that was deleted', async () => {
    seedLocal({ mind: mindDocs() });
    mmDelete('m3');
    ok(!state.mind.some(r => r.id === 'm3'), 'setup: deleted');
    ok(JSON.stringify(JSON.parse(localStorage.getItem(KEY + '_hwm'))).indexOf('"m3"') > 0, 'setup: the append-only safety copy still holds it');
    state.mind = []; localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], deleted: state.deleted }));
    restoreOnLaunch();
    ok(!state.mind.some(r => r.id === 'm3'), 'm3 stays deleted');
    eq(state.mind.length, mindDocs().length - 1, 'everything else is back:');
  });

  scenario('removing Mind Map records stashes a one-step undo, like every other shrink', async () => {
    seedLocal({ mind: mindDocs() });
    localStorage.removeItem(KEY + '_prev');
    mmDelete('m2');
    const prev = JSON.parse(localStorage.getItem(KEY + '_prev') || 'null');
    ok(prev, 'a stash exists'); ok(prev.mind.some(r => r.id === 'm2'), 'and it still has the removed entry');
  });

  scenario('export carries the Mind Map, and import adds it back without removing anything', async () => {
    seedLocal({ mind: mindDocs() });
    const out = collectForExport();
    eq(canonMind(out.mind), canonMind(mindDocs()), 'exported:');
    state.mind = []; localStorage.removeItem(KEY + '_hwm');
    state.mind = [setRec('keep', 'think', { aon: 1 })];
    await importBackup({ text: async () => JSON.stringify(out) });
    eq(state.mind.length, mindDocs().length + 1, 'imported records added, the existing one kept:');
    ok(state.mind.some(r => r.id === 'keep'), 'the one already here is still here');
  });

  t('garbage in a backup or from the cloud cannot break the Mind Map', () => {
    const n = normalizeCloudPayload({ mind: [null, 5, 'x', { id: 'x' }, { id: 'y', kind: 'zzz' },
      { id: 's', kind: 'set', set: 'big5', a: [1, 2] }, { id: 'e', kind: 'ex', ex: 'trigger', f: 'text' }, { id: 'p', kind: 'pred' }] });
    eq(n.mind.map(r => r.id).sort().join(','), 'e,p,s', 'only well-formed kinds survive:');
    eq(JSON.stringify(n.mind.find(r => r.id === 's').a), '{}', 'answers repaired:');
    eq(JSON.stringify(n.mind.find(r => r.id === 'e').f), '{}', 'fields repaired:');
    eq(normalizeCloudPayload({}).mind.length, 0, 'a payload from before the Mind Map:');
    eq(normalizeCloudPayload({ mind: 'nope' }).mind.length, 0, 'not even a list:');
  });

  t('two devices: the same entry keeps the newer copy, different entries are both kept', () => {
    reset();
    const a = [exRec('d1', 'carried', { what: 'older' }, { updatedAt: 10 }), exRec('only-a', 'carried', { what: 'a' })];
    const b = [exRec('d1', 'carried', { what: 'newer' }, { updatedAt: 20 }), exRec('only-b', 'carried', { what: 'b' })];
    const m = mergeById(a, b, 'updatedAt');
    eq(m.length, 3, 'union:'); eq(m.find(r => r.id === 'd1').f.what, 'newer', 'newer wins:');
    const u = unionPayload({ mind: a }, { mind: b });
    eq(u.mind.length, 3, 'the same through the payload union:'); eq(u.mind.find(r => r.id === 'd1').f.what, 'newer', 'newer wins there too:');
    const dead = unionPayload({ mind: a, deleted: { 'only-a': 1 } }, { mind: b });
    ok(!dead.mind.some(r => r.id === 'only-a'), 'a tombstone outranks a copy');
  });

  // ============ the cloud copy, encrypted ============
  t('the Mind Map fits Firestore: no undefined, no nested arrays, nothing over the limits', () => {
    reset(); state.mind = clone(mindDocs());
    eq(firestoreProblem(currentPayload()), '', 'the pre-flight check:');
    eq(TestCloud.docProblem(currentPayload()), '', 'the fake Firestore, written separately:');
    ok(sdkAccepts(currentPayload()), 'the real SDK accepts it');
  });

  scenario('first sync: the Mind Map goes up encrypted, with none of its words or field names visible, and opens to exactly what was sent', async () => {
    seedLocal({ mind: mindDocs() });
    const { cloud, un } = await rig({});
    try {
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      const doc = cloud.peek();
      ok(doc.enc && !doc.mind, 'only the sealed copy is in the cloud');
      const text = JSON.stringify(doc);
      eq(leaks(text).join(','), '', 'words visible in the cloud copy:');
      ['"mind"', 'trigger', 'situations', 'carried', 'ruminate', 'Respect'].forEach(w => ok(text.indexOf(w) < 0, 'the cloud copy shows "' + w + '"'));
      eq(canonMind((await e2eeDecrypt(doc.enc, e2ee.key)).data.mind), canonMind(mindDocs()), 'opens to the same records:');
    } finally { un(); }
  });

  scenario('a new phone gets the Mind Map back with only the PIN, and writes nothing', async () => {
    const sealed = await TestCloud.sealedDoc({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: mindDocs(), deleted: {} }, PIN, 3);
    const { cloud, un } = await rig({ 'users/u': sealed.doc });
    try {
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      eq(canonMind(state.mind), canonMind(mindDocs()), 'the records:');
      eq(cloud.sets().length, 0, 'writes:');
    } finally { un(); }
  });

  scenario('a cloud that holds ONLY Mind Map entries is not mistaken for an empty one', async () => {
    seedLocal({ journals: [{ id: 'jj', title: 'x', text: 'mine', type: 'negative', savedAt: 9 }] });
    const sealed = await TestCloud.sealedDoc({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [setRec('only', 'think', { aon: 2 })], deleted: {} }, PIN, 2);
    const { cloud, un } = await rig({ 'users/u': sealed.doc });
    try {
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      ok(state.mind.some(r => r.id === 'only'), 'the cloud’s Mind Map entry arrives');
      ok(state.journals.some(j => j.id === 'jj'), 'and the local journal is kept');
      const opened = (await e2eeDecrypt(cloud.peek().enc, e2ee.key)).data;
      ok(opened.mind.some(r => r.id === 'only') && opened.journals.some(j => j.id === 'jj'), 'and the union goes back up');
    } finally { un(); }
  });

  scenario('two devices each answered something: signing in merges both and uploads the union', async () => {
    seedLocal({ mind: [setRec('here', 'big5', big5(() => 3))] });
    const sealed = await TestCloud.sealedDoc({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [exRec('there', 'carried', { what: 'SECRET-MIND-TEXT' })], deleted: {} }, PIN, 2);
    const { cloud, un } = await rig({ 'users/u': sealed.doc });
    try {
      eq(await cloudLoadOrMigrate('u'), 'synced', 'result:');
      eq(state.mind.map(mid).sort().join(','), 'here,there', 'in memory:');
      eq(((await e2eeDecrypt(cloud.peek().enc, e2ee.key)).data.mind || []).map(mid).sort().join(','), 'here,there', 'in the cloud:');
    } finally { un(); }
  });

  scenario('an entry deleted here does not come back from the cloud', async () => {
    seedLocal({ mind: [exRec('gone', 'carried', { what: 'x' })], deleted: { gone: Date.now() } });
    const sealed = await TestCloud.sealedDoc({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [exRec('gone', 'carried', { what: 'x' }), exRec('stay', 'carried', { what: 'y' })], deleted: {} }, PIN, 2);
    const { un } = await rig({ 'users/u': sealed.doc });
    try {
      await cloudLoadOrMigrate('u');
      eq(state.mind.map(mid).join(','), 'stay', 'what is left:');
    } finally { un(); }
  });

  scenario('a change to a Mind Map entry reaches the cloud as a new sealed revision', async () => {
    seedLocal({ mind: [exRec('chg', 'carried', { what: 'one' })] });
    const { cloud, un } = await rig({});
    try {
      eq(await cloudLoadOrMigrate('u'), 'synced', 'first sync:');
      const rev1 = cloud.peek().rev;
      state.mind[0].f.what = 'SECRET-MIND-TEXT two'; mmSave(state.mind[0]);
      eq(await cloudSaveNow('u'), 'synced', 'second:');
      ok(cloud.peek().rev > rev1, 'a newer revision');
      eq((await e2eeDecrypt(cloud.peek().enc, e2ee.key)).data.mind[0].f.what, 'SECRET-MIND-TEXT two', 'with the change:');
      eq(leaks(JSON.stringify(cloud.peek())).join(','), '', 'still sealed:');
    } finally { un(); }
  });

  // ============ the tabs and the sidebar ============
  t('the bottom bar has exactly five tabs, in order, all the same width and evenly spaced', () => {
    reset(); setMode('daily');
    const tabs = [...document.querySelectorAll('.mode-btn')];
    eq(tabs.map(b => b.dataset.mode).join(','), 'thought,journal,daily,checkin,mind', 'tabs:');
    eq(tabs.map(b => b.querySelector('.label').textContent).join(','), 'Thought Web,Journal,Daily,Check-In,Mind Map', 'labels:');
    const r = tabs.map(b => b.getBoundingClientRect());
    ok(r[0].width > 0, 'visible');
    r.forEach(x => near(x.width, r[0].width, 0.6, 'a tab’s width differs from the first:'));
    for (let i = 1; i < r.length; i++) near(r[i].left - r[i - 1].left, r[0].width, 0.6, 'the gap between tab ' + i + ' and ' + (i + 1) + ':');
    const bar = document.querySelector('.mode-switch').getBoundingClientRect();
    if (innerWidth <= 1000) {
      near(r[0].left - bar.left, bar.right - r[4].right, 0.6, 'equal margins at both ends:');
      ok(r[4].right <= bar.right + 0.5 && r[0].left >= bar.left - 0.5, 'nothing cut off');
    }
  });

  t('every tab label fits inside its own column, whatever the label', () => {
    const tabs = [...document.querySelectorAll('.mode-btn')];
    tabs.forEach(b => { const l = b.querySelector('.label'); ok(l.scrollWidth <= l.clientWidth + 1, b.dataset.mode + ' label is cut off (' + l.scrollWidth + ' > ' + l.clientWidth + ')'); });
  });

  t('Grievance and Grief are in the sidebar, not the tab bar, and each opens its own screen and closes the menu', () => {
    reset();
    eq(document.querySelectorAll('.mode-btn[data-mode="grievance"], .mode-btn[data-mode="grief"]').length, 0, 'tabs for them:');
    const links = [...document.querySelectorAll('#sidebar .side-link')];
    eq(links.map(b => b.dataset.mode).join(','), 'grievance,grief', 'sidebar links:');
    eq(links.map(b => b.textContent.trim()).join(','), 'Grievance,Grief', 'names:');
    $('#sidebar').classList.add('open');
    links[0].click();
    eq(state.mode, 'grievance', 'mode:'); ok($('#grievance-view').classList.contains('active'), 'the grievance screen is showing');
    ok(!$('#sidebar').classList.contains('open'), 'the menu closed'); ok(links[0].classList.contains('active'), 'the link shows it is current');
    eq(document.querySelectorAll('.mode-btn.active').length, 0, 'no tab claims to be current:');
    links[1].click();
    eq(state.mode, 'grief', 'mode:'); ok($('#grief-view').classList.contains('active'), 'the grief screen is showing');
    ok(!links[0].classList.contains('active') && links[1].classList.contains('active'), 'only Grief is current');
    setMode('daily');
    eq(document.querySelectorAll('#sidebar .side-link.active').length, 0, 'leaving them clears the highlight:');
  });

  t('exactly one screen shows at a time, whichever tab or link is used', () => {
    reset();
    for (const m of ['thought', 'journal', 'daily', 'checkin', 'mind', 'grievance', 'grief', 'mind', 'daily']) {
      setMode(m);
      const on = [...document.querySelectorAll('#workspace > .view.active')].map(v => v.id);
      eq(on.join(','), m === 'thought' ? 'thought-view' : m + '-view', 'screens showing for ' + m + ':');
    }
  });

  t('opening the Mind Map does not disturb the library tab, and leaving it saves a pending edit', () => {
    reset(); setMode('journal'); const lib = state.libTab;
    setMode('mind'); eq(state.libTab, lib, 'library tab:');
    tap('[data-mm="lens:story"].mm-row'); tap('[data-mm="ex:new:bestworst"]');
    typeInto(document.querySelector('#mmf-best'), 'SECRET-MIND-TEXT leaving');
    setMode('daily');
    ok(JSON.stringify(stored().mind).indexOf('leaving') > 0, 'switching tabs saved it');
  });

  // ============ every piece of text can be read ============
  const rgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const WORST = { r: 45, g: 122, b: 177, a: 1 };      // the lightest point of the page gradient: the hardest thing text can sit on
  function audit(root) {
    const bad = []; let checked = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement; if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue;
      if (cs.webkitTextFillColor && /rgba\(0, 0, 0, 0\)|transparent/.test(cs.webkitTextFillColor)) continue;   // the existing gradient page titles
      let fg = el instanceof SVGElement ? rgba(cs.fill) : rgba(cs.color); if (!fg) continue;
      const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
      let bg = WORST;
      for (const e of chain) { const c = rgba(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); }
      const r = ratio(over(fg, bg), bg); checked++;
      if (r < 4.5) bad.push(`${(n.nodeValue.trim()).slice(0, 28)} → ${r.toFixed(2)} (${el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className})`);
    }
    return { bad, checked };
  }
  function fullData() {
    reset();
    put(setRec('a1', 'big5', big5(x => (x.t === 'N' ? (x.r ? 1 : 5) : 4))),
        setRec('a2', 'attach', Object.fromEntries(MM_ATTACH.map(x => [x.id, x.d === 'anx' ? (x.r ? 1 : 5) : 2]))),
        setRec('a3', 'values', Object.assign(Object.fromEntries(MM_VALUES.map(v => ['v:' + v.id, 2])), { 'v:family': 0, 'v:honesty': 0, 'v:faith': 1, 'l:family': 1, 'l:honesty': 4 })),
        setRec('a4', 'think', Object.assign(allOf(MM_THINK, 1), { cata: 3, mind: 2 })),
        setRec('a5', 'regulate', Object.assign(allOf(MM_REG, 2), { ruminate: 5, suppress: 4, soothe: 1, express: 1 })),
        exRec('a6', 'trigger', { dom: 'ex', sit: 'a', feel: ['Angry'], need: ['Respect'], did: 'ruminate' }),
        exRec('a7', 'trigger', { dom: 'ex', sit: 'b', feel: ['Hurt'], need: ['Respect'], did: 'avoid' }),
        exRec('a8', 'trigger', { dom: 'kids', sit: 'c', feel: ['Sad'], need: ['Rest'], did: 'ruminate' }),
        exRec('a9', 'carried', { what: 'x', str: ['Faith', 'Patience'] }),
        predRec('a10', 'ex', ''));
    seedSituations();
    state.journals = journalsOf(30, 3);
    mmSigCache = null;
  }
  t('the map and every lens page pass the 4.5:1 contrast bar for all their text', async () => {
    fullData(); setMode('mind');
    const fails = []; let total = 0;
    const run = (label) => { const r = audit($('#mind-view')); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    mm.screen = 'home'; renderMind(); run('map');
    for (const l of MM_LENSES) { mm.screen = 'lens'; mm.lens = l.id; mm.dom = 'ex'; mm.pred = null; renderMind(); if (l.id === 'situ') { tap('[data-mm="dom:ex"]'); tap('[data-mm="predict"]'); } run(l.name); }
    ok(total > 150, 'enough text was checked to mean something (' + total + ')');
    eq(fails.join(' | '), '', 'text under 4.5:1 (' + total + ' checked):');
    setMode('daily');
  });
  t('the question screens and exercise forms pass the contrast bar too', async () => {
    fullData(); setMode('mind');
    const fails = []; let total = 0;
    const run = (label) => { const r = audit($('#mind-view')); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    for (const set of ['big5', 'values', 'think']) { state.mind = state.mind.filter(r => r.set !== set); mm.screen = 'lens'; renderMind(); mmStart(set); run(set); }
    state.mind = state.mind.filter(r => r.set !== 'situations'); mmStart('situations'); run('first move');
    tap('[data-mm^="scn:"]'); run('the "rather" step');
    for (const ex of Object.keys(MM_EX)) { mm.exRec = { id: 'au-' + ex, kind: 'ex', ex, at: 1, f: { sit: 'x', feel: ['Angry'], int: 4, did: 'solve', dom: 'ex', after: 'Neutral', tone: 'Steady', pattern: ['Blame'], str: ['Faith'], need: ['Rest'], body: ['Chest'] } }; mm.screen = 'ex'; renderMind(); run('form ' + ex); }
    ok(total > 100, 'enough text was checked (' + total + ')');
    eq(fails.join(' | '), '', 'text under 4.5:1 (' + total + ' checked):');
    mm.exRec = null; mm.screen = 'home'; mm.draft = null; setMode('daily');
  });

  t('the map shows each lens’s real state, and nothing the person typed leaks into the page title or the sync', async () => {
    fullData(); setMode('mind'); mm.screen = 'home'; renderMind();
    const nodes = [...document.querySelectorAll('.mm-node')];
    eq(nodes.length, 8, 'nodes:');
    const state_ = id => document.querySelector('.mm-node[data-mm="lens:' + id + '"]').classList.contains('done') ? 'done' : document.querySelector('.mm-node[data-mm="lens:' + id + '"]').classList.contains('part') ? 'part' : 'none';
    ['temper', 'close', 'values', 'think', 'feel', 'situ', 'story', 'signals'].forEach(id => eq(state_(id), 'done', id + ' state:'));
    ok(/8 of 8/.test(document.querySelector('.mm-center-s').textContent), 'the centre counts them: ' + document.querySelector('.mm-center-s').textContent);
    reset(); setMode('mind'); mm.screen = 'home'; renderMind();
    ok(/0 of 8/.test(document.querySelector('.mm-center-s').textContent), 'and counts none when none are done');
    ok([...document.querySelectorAll('.mm-node')].every(n => n.classList.contains('none')), 'all drawn as not started');
    setMode('daily');
  });

  // ============ it stays on this device ============
  t('the Mind Map code never reaches the network on its own and never uses a synthetic voice', async () => {
    const src = await (await fetch(location.pathname, { cache: 'no-store' })).text();
    const a = src.indexOf('/* ===== MIND MAP'), b = src.indexOf('/* ===== END MIND MAP =====');
    ok(a > 0 && b > a, 'the Mind Map block was found');
    const code = src.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'firebase', 'fbDb', 'speechSynthesis', 'SpeechSynthesisUtterance', 'import(', 'eval(', 'new Function'].forEach(w =>
      ok(code.indexOf(w) < 0, 'the Mind Map block contains "' + w + '"'));
    ok(code.indexOf('persist()') > 0, 'it saves through the one save path (persist), which is what carries it to the safety copy and the sealed cloud copy');
  });

  t('no raw escape sequences or stray markup show on any Mind Map screen', async () => {
    fullData(); setMode('mind');
    const bad = [];
    const screens = [() => { mm.screen = 'home'; }, ...MM_LENSES.map(l => () => { mm.screen = 'lens'; mm.lens = l.id; })];
    for (const s of screens) { s(); renderMind(); const txt = $('#mm-inner').innerText; if (/\\u[0-9a-f]{4}|&amp;|&lt;|&gt;|undefined|NaN|\[object/i.test(txt)) bad.push(mm.lens || 'home'); }
    eq(bad.join(','), '', 'screens showing raw text:');
    setMode('daily');
  });

  async function runAll16(only) {
    const fail = []; let passed = 0;
    const re = only ? new RegExp(only) : null;
    for (const { name, fn } of T) {
      if (re && !re.test(name)) continue;
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); TestCloud.resetE2ee(null); setMode('daily'); } catch (e) {}
    return { total: passed + fail.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll16 = runAll16;
})();
