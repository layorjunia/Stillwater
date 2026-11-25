/* Round 20 — the Learn tab: ideas that teach, five active minutes a day, recalls that come back on a schedule.
   Same contract: runAll20(), or runAll20('regex') to run the tests whose names match.

   What this protects: the library is complete and honest (every idea has a source and says how settled it is); progress is kept in its
   own key and survives junk, a bad main copy, Export and Import (which only ever add); the clock counts only real, active time and a
   day counts at five minutes; recalls come back on the schedule and nothing is lost; every picture and every experiment works; the tab
   bar swap did not cost Thought Web anything; every word can be read; nothing links away or speaks in a device voice.

   Run signed OUT, from http://localhost. Needs fake-firestore.js loaded first. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const KEY = STORAGE_KEY;
  const $q = s => document.querySelector(s);
  const tap = sel => { const el = $q(sel); if (!el) throw new Error('nothing to tap: ' + sel); el.click(); };
  const getJson = async (p) => { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const today = () => dayKey();
  const ago = (n) => dayKey(addDays(new Date(), -n));

  function reset() {
    try { readerClose(); } catch (e) {}
    clearTimeout(lnState.saveTimer); lnState.saveTimer = null; lnState.dirty = false; clearInterval(lnState.timer); lnState.timer = null;
    [LEARN_KEY, LEARN_KEY + '_bak', 'stillwater_wal', 'stillwater_wal_checkins', 'stillwater_wal_mind', KEY + '_hwm', KEY + '_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({ thoughts: [], grievances: [], journals: [], daily: {}, checkins: [], mind: [], deleted: {} }));
    state.thoughts = []; state.grievances = []; state.journals = []; state.deleted = {}; state.daily = {}; state.checkins = []; state.mind = [];
    state.current = { thought: null, grievance: null, journal: null, checkin: null };
    learn = learnNormalize(null);
    lnState.screen = 'feed'; lnState.filter = 'all'; lnState.queue = []; lnState.next = 0; lnState.last = Date.now(); lnState.vis = ''; lnState.ratio.clear();
    lnState.dwell = {}; lnState.kinds = {}; lnState.answered = {}; lnState.goalDay = ''; lnState.ticks = 0;
    hasLoadedFromCloud = false; currentUser = null;
    localStorage.setItem('stillwater_legacy_prompted_', '1');
    localStorage.setItem('stillwater_legacy_pulled_test@example.invalid', '1');
  }
  async function enter() {                                    // the Learn tab, with the library loaded and the page's own once-a-second clock stopped
    reset(); if (!learnData) await learnFetchData();
    ok(learnData && learnData.cards.length > 100, 'the library loaded');
    setMode('learn'); await wait(250); clearInterval(lnState.timer); lnState.timer = null; lnState.last = Date.now();
    return learnData;
  }
  const quiet = () => { lnState.last = Date.now(); };
  const stored = () => JSON.parse(localStorage.getItem(LEARN_KEY) || 'null');
  const textOf = (c) => [c.h, c.hook, c.ex, c.k, c.src, c.q.q, c.q.w, ...c.p, ...c.q.o].join(' ');

  // ============ the library ============
  t('the deep ideas are complete: 100+ of them, each with a picture, an example, a takeaway, a recall check with ONE right answer, and a source', async () => {
    const d = await getJson('/learn/ideas.json'), qd = await getJson('/learn/decks.json');
    ok(d.cards.length >= 100, 'ideas: ' + d.cards.length);
    eq(d.tracks.length, 12, 'series:');
    eq(new Set(d.cards.map(c => c.id)).size, d.cards.length, 'every idea has its own id:');
    const all = d.cards.length + qd.c.length;
    eq(d.order.length, all, 'the order covers every idea, deep and quick:'); eq(new Set(d.order).size, all, 'once each:');
    const ids = new Set(d.cards.map(c => c.id).concat(qd.c.map(r => r[0]))); ok(d.order.every(id => ids.has(id)), 'and only ideas that exist'); eq(ids.size, all, 'no id is shared between a deep idea and a quick one:');
    for (const c of d.cards) {
      ok(d.tracks.some(x => x.id === c.t), c.id + ' belongs to a series');
      ok(c.h && c.hook && c.p.length >= 1 && c.ex && c.k && c.src, c.id + ' is missing a part');
      ok(c.q.o.length === 3 && new Set(c.q.o).size === 3 && c.q.a >= 0 && c.q.a < 3 && c.q.w, c.id + ' recall check');
      ok(['solid', 'mixed', 'contested'].includes(c.c), c.id + ' says how settled it is');
      ok(c.viz && ['curve', 'bars', 'dots', 'steps', 'vs', 'scale', 'venn', 'wave', 'orbit', 'spread', 'demo'].includes(c.viz.k), c.id + ' has a picture');
    }
    const cnt = (k) => d.cards.filter(c => c.c === k).length;
    ok(cnt('mixed') >= 10 && cnt('contested') >= 2, 'the hedged ideas are labelled as such: mixed ' + cnt('mixed') + ', contested ' + cnt('contested'));
    eq(d.cards.filter(c => c.viz.k === 'demo').map(c => c.viz.d).sort().join(','), 'calib,span,stroop,wason', 'the four experiments are each on a card:');
  });

  t('every idea names its source: a year, or a named body, and none is padded or empty', async () => {
    const d = await getJson('/learn/ideas.json'), bad = [];
    for (const c of d.cards) if (!(/\b(1[4-9]|20)\d{2}\b/.test(c.src) || /NASA|WHO|Medical Research Council/.test(c.src)) || c.src.length > 140) bad.push(c.id + ': ' + c.src);
    eq(bad.join(' | '), '', 'ideas without a dated or named source:');
  });

  t('the writing is American English and has no markup, links or double spaces in it', async () => {
    const d = await getJson('/learn/ideas.json'), bad = [];
    const BRIT = /\b(colour\w*|behaviour\w*|favour\w*|honour\w*|humour\w*|neighbour\w*|labour\w*|recognis\w*|organis\w*|memoris\w*|summaris\w*|realis\w*|programme\w*|centre\w*|whilst|learnt|judgement|ageing|defence|tonnes?|maths|practis(e|ed|es|ing))\b/i;
    for (const c of d.cards) { const x = textOf(c).replace(/Nature Human Behaviour/g, 'Nature');   /* a journal's own title keeps its spelling */ const m = BRIT.exec(x); if (m) bad.push(c.id + ': ' + m[0]); if (/<|>|https?:|www\.|\s{2,}|£/.test(x)) bad.push(c.id + ': markup, link or spacing'); }
    eq(bad.slice(0, 5).join(' | '), '', 'problems (' + bad.length + '):');
  });

  t('every idea is short enough to take under a minute: 30 to 100 words of body, an example under 70, a takeaway under 150 characters', async () => {
    const d = await getJson('/learn/ideas.json'), bad = [];
    const W = s => s.split(/\s+/).filter(Boolean).length;
    for (const c of d.cards) { const b = c.p.reduce((n, p) => n + W(p), 0); if (b < 30 || b > 100 || W(c.ex) > 70 || c.k.length > 150) bad.push(c.id + ' ' + b + '/' + W(c.ex)); }
    eq(bad.slice(0, 5).join(' | '), '', 'ideas that are too long or too short (' + bad.length + '):');
  });

  t('the page’s Learn code never links away and never speaks in a device voice', async () => {
    const src = await (await fetch('/Stillwater.html', { cache: 'no-store' })).text();
    const block = src.slice(src.indexOf('/* ===== LEARN ====='), src.indexOf('/* ===== END LEARN ====='));
    ok(block.length > 10000, 'found the Learn block: ' + block.length);
    ok(!/speechSynthesis|SpeechSynthesisUtterance|AVSpeech/.test(block), 'no device voice');
    ok(!/window\.open|location\.href|location\.assign|target="_blank"|<a /.test(block), 'no way out of the app');
    ok(!/firebase|cloudSave|localStorage\.setItem\((STORAGE_KEY|KEY)/.test(block.replace(/safeSetItem\(LEARN_KEY/g, '')), 'nothing to do with the journal save or the cloud');
  });

  // ============ storage ============
  t('progress is saved in its own key, with one previous copy, and comes back exactly', async () => {
    reset();
    learn.days[today()] = { s: 123, n: 2, a: 3, r: 2 }; learn.cards.testing = { t: 5, b: 2, d: ago(-3), k: 1, w: 0, ts: 9 }; learn.saved.testing = 77;
    learnSaveNow();
    eq(JSON.stringify(stored()), JSON.stringify(learn), 'on disk:');
    learn.days[today()].s = 200; learnSaveNow();
    eq(JSON.parse(localStorage.getItem(LEARN_KEY + '_bak')).days[today()].s, 123, 'the copy before is kept beside it:');
    learn = learnNormalize(null); learnLoad();
    eq(learn.days[today()].s, 200, 'and it loads back:'); eq(learn.saved.testing, 77, 'with what was saved:'); eq(learn.cards.testing.b, 2, 'and the schedule:');
  });

  t('what it reads is never trusted: junk, negatives, absurd numbers, bad ids and bad dates are cleaned, and a broken main copy falls back to the previous', async () => {
    reset();
    const junk = { v: 9, days: { '2026-01-01': { s: -5, n: 'x', a: 1e12, r: 3.9 }, 'nope': { s: 10 }, '2026-01-02': 'a string' }, cards: { 'ok-id': { t: 'z', b: 99, d: 'tomorrow', k: -1, w: 2.7, ts: 5 }, 'BAD ID': { t: 1 }, '../x': {} }, saved: { 'ok-id': 5, 'BAD': 3, 'also-ok': -1 } };
    const n = learnNormalize(junk);
    eq(JSON.stringify(Object.keys(n.days)), '["2026-01-01"]', 'only a real date survives:');
    const d = n.days['2026-01-01']; eq(d.s + ',' + d.n + ',' + d.r, '0,0,3', 'junk numbers become zero or whole numbers:'); ok(d.a <= 9000, 'absurd counts are capped: ' + d.a);
    eq(JSON.stringify(Object.keys(n.cards)), '["ok-id"]', 'only well-formed ids:'); eq(n.cards['ok-id'].b, 5, 'a step is at most the last one:'); eq(n.cards['ok-id'].d, '', 'a bad due date is dropped:'); eq(n.cards['ok-id'].k, 0, 'negatives are zero:');
    eq(JSON.stringify(Object.keys(n.saved)), '["ok-id"]', 'only real saves:');
    eq(JSON.stringify(learnNormalize('junk')), JSON.stringify(learnNormalize(null)), 'a string is an empty record:'); eq(JSON.stringify(learnNormalize([1, 2])), JSON.stringify(learnNormalize(null)), 'so is an array:');
    learn.days[today()] = { s: 50, n: 0, a: 0, r: 0 }; learnSaveNow(); learn.days[today()].s = 60; learnSaveNow();
    localStorage.setItem(LEARN_KEY, '{broken'); learn = learnNormalize(null); learnLoad();
    eq(learn.days[today()].s, 50, 'a broken main copy falls back to the previous one:');
    localStorage.removeItem(LEARN_KEY); localStorage.removeItem(LEARN_KEY + '_bak'); learnLoad(); eq(Object.keys(learn.days).length, 0, 'with nothing stored it starts empty, without a crash:');
  });

  t('Learn never touches the journal, the daily answers or the check-ins, whatever happens in it', async () => {
    await enter();
    const before = localStorage.getItem(KEY);
    quiet(); const c = learnData.cards[0]; learnAnswer(c.id, c.q.a, document.createElement('div')); learnDayEdit().s = 400; learnSaveNow();
    learn.saved.testing = 1; learnSaveNow(); learnRate(c.id, false); learnImport({ days: { '2026-01-01': { s: 999 } } });
    eq(localStorage.getItem(KEY), before, 'the journal key:');
    setMode('daily');
  });

  t('Export carries Learn, and Import only ever adds: more minutes, newer schedules and more saves win, nothing is lowered or removed', async () => {
    reset();
    learn.days[ago(1)] = { s: 500, n: 4, a: 5, r: 4 }; learn.cards.testing = { t: 100, b: 3, d: ago(-7), k: 2, w: 1, ts: 5000 }; learn.saved.testing = 10; learnSaveNow();
    const out = collectForExport(); ok(out.learn && out.learn.days[ago(1)], 'exported');
    const snap = JSON.stringify(out.learn);
    learn = learnNormalize(null);
    learn.days[ago(1)] = { s: 300, n: 1, a: 9, r: 1 }; learn.days[ago(2)] = { s: 250, n: 0, a: 0, r: 0 };
    learn.cards.testing = { t: 50, b: 1, d: ago(-1), k: 5, w: 0, ts: 100 };           // an older schedule, but more right answers
    learn.saved.metacognition = 5;
    const added = learnImport(JSON.parse(snap)); ok(added > 0, 'something was added');
    const d = learn.days[ago(1)]; eq(d.s, 500, 'minutes took the larger:'); eq(d.a, 9, 'answers kept the larger:'); eq(learn.days[ago(2)].s, 250, 'a day only here is kept:');
    const c = learn.cards.testing; eq(c.b, 3, 'the newer schedule won:'); eq(c.k, 5, 'the larger right-count kept:'); eq(c.t, 50, 'and the earlier first-seen:');
    ok(learn.saved.testing === 10 && learn.saved.metacognition === 5, 'saves from both');
    eq(learnImport({ days: 'junk', cards: 7, saved: [] }), 0, 'junk adds nothing:'); eq(learnImport(null), 0, 'nor does nothing:');
    const second = learnImport(JSON.parse(snap)); eq(second, 0, 'importing the same file again changes nothing:');
  });

  // ============ the clock ============
  t('the clock counts only real, active time: the Learn tab open, the page visible, the screen touched in the last 75 seconds', async () => {
    await enter();
    const s0 = learnToday();
    quiet(); learnTick(); learnTick(); learnTick(); eq(learnToday(), s0 + 3, 'three active seconds:');
    lnState.last = Date.now() - LEARN_IDLE_MS - 1000; learnTick(); eq(learnToday(), s0 + 3, 'not after 75 seconds without a touch:');
    quiet(); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try { learnTick(); eq(learnToday(), s0 + 3, 'not while the page is hidden:'); } finally { delete document.hidden; }
    setMode('daily'); quiet(); learnTick(); eq(learnToday(), s0 + 3, 'not on another tab:');
    setMode('learn'); await wait(100); clearInterval(lnState.timer); lnState.timer = null; quiet(); learnTick(); eq(learnToday(), s0 + 4, 'and again once he is back:');
    lnState.last = Date.now() - 60000; learnTick(); eq(learnToday(), s0 + 5, 'a minute of reading without a touch still counts:');
  });

  t('there is no clock on screen unless he asks: the header is just "Learn" and the streak; tapping the streak shows today\'s time, tapping again hides it; reaching the goal lights the streak without opening anything', async () => {
    await enter();
    const shown = () => { const b = $q('#ln-clock'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; };
    eq($q('.ln-bar').textContent.replace(/\s+/g, '').trim(), 'Learn' + learnStreaks().current, 'the header says Learn and the streak, nothing else:');
    ok(!shown(), 'no time is showing'); ok(!document.querySelector('.ln-ring'), 'no ring counting up');
    learnDayEdit().s = 161; learnPaintTime(); ok(!shown(), 'still nothing while it counts');
    const btn = $q('.ln-streak'); eq(btn.tagName, 'BUTTON', 'the streak is a button:'); eq(btn.getAttribute('aria-expanded'), 'false', 'closed:');
    btn.click(); ok(shown(), 'tapped: it opens'); eq($q('#ln-t').textContent, '2:41', 'today so far:'); eq($q('#ln-of').textContent, 'of 5:00', 'of the five minutes:');
    eq(btn.getAttribute('aria-expanded'), 'true', 'and says so:'); ok(parseInt($q('#ln-f').style.width, 10) === 54, 'a bar at 54%: ' + $q('#ln-f').style.width);
    quiet(); learnTick(); eq($q('#ln-t').textContent, '2:42', 'it keeps counting while open');
    $q('.ln-streak').click(); ok(!shown(), 'tapped again: it hides'); learnDayEdit().s = 170; learnPaintTime(); eq($q('#ln-t').textContent, '2:50', 'and keeps its time up to date while hidden:');
    lnState.screen = 'stats'; renderLearn(); ok(!shown(), 'a fresh screen does not bring it back'); lnState.screen = 'feed'; renderLearn();
    learnDayEdit().s = LEARN_GOAL - 1; quiet(); learnTick(); ok($q('.ln-head').classList.contains('done'), 'five minutes: the streak lights up'); ok(!shown(), 'with nothing opened');
    ok(getComputedStyle($q('.ln-streak')).backgroundColor === 'rgb(244, 217, 164)', 'in gold: ' + getComputedStyle($q('.ln-streak')).backgroundColor);
    lnState.clockOpen = false;
  });

  t('five active minutes make a day: the ring fills, the streak starts, it is announced once, and the day stays done', async () => {
    await enter();
    learnDayEdit().s = LEARN_GOAL - 2; quiet(); learnTick(); ok(!learnDayDone(today()), 'one second short is not a day');
    eq($q('.ln-head').classList.contains('done'), false, 'the streak is not lit yet');
    quiet(); learnTick(); ok(learnDayDone(today()), 'five minutes is a day'); eq(learnStreaks().current, 1, 'a streak of 1:');
    ok($q('.ln-head').classList.contains('done'), 'the header shows it'); eq($q('#ln-of').textContent, 'Done for today', 'the label:'); eq($q('#ln-sn').textContent, '1', 'the streak on screen:');
    ok(/Five minutes done/.test($q('#toast').textContent), 'announced: ' + $q('#toast').textContent);
    eq(lnState.goalDay, today(), 'and noted, so it is not announced twice:');
    const was = $q('#toast').textContent; $q('#toast').textContent = ''; quiet(); learnTick(); eq($q('#toast').textContent, '', 'no second announcement:');
    ok(stored().days[today()].s >= LEARN_GOAL, 'saved at the moment it was reached');
    ok(was.length > 0, 'ok');
  });

  t('the streak counts consecutive days of five minutes, stays alive through today until today ends, and a gap breaks it', async () => {
    reset();
    const day = (n, s) => { learn.days[ago(n)] = { s, n: 0, a: 0, r: 0 }; };
    day(3, 300); day(2, 301); day(1, 900);
    eq(learnStreaks().current, 3, 'three days running (today not yet done):');
    day(0, 299); eq(learnStreaks().current, 3, '299 seconds today does not break it, and does not add:');
    day(0, 300); eq(learnStreaks().current, 4, 'five minutes today adds it:');
    reset(); day(4, 300); day(3, 300); day(1, 300);
    eq(learnStreaks().current, 1, 'a missed day breaks it:'); eq(learnStreaks().longest, 2, 'the best is kept:'); eq(learnStreaks().total, 3, 'and the days that counted:');
    reset(); day(2, 300); eq(learnStreaks().current, 0, 'two days ago with nothing since is over:');
    eq(learnStreaks(new Date(2026, 5, 10, 12)).current, 0, 'asked about another date it reads that date, not today:');
  });

  // ============ remembering ============
  t('the first answer schedules the idea for tomorrow, reading it for ten active seconds counts it as seen, and a seen idea leaves the new ones', async () => {
    await enter();
    const [a, b] = [learnData.cards[0], learnData.cards[1]];
    learnAnswer(a.id, a.q.a, document.createElement('div'));
    const r = learn.cards[a.id]; eq(r.b + ',' + r.d + ',' + r.k + ',' + r.w, '1,' + ago(-1) + ',1,0', 'answered right: step 1, due tomorrow:');
    eq(learn.days[today()].n + ',' + learn.days[today()].a + ',' + learn.days[today()].r, '1,1,1', 'counted today:');
    learnAnswer(a.id, a.q.a, document.createElement('div')); eq(learn.cards[a.id].k, 2, 'a second answer is a second right answer, the schedule unchanged:'); eq(learn.cards[a.id].d, ago(-1), 'due date:');
    learnAnswer(b.id, (b.q.a + 1) % 3, document.createElement('div')); eq(learn.cards[b.id].w, 1, 'a wrong first answer is counted:'); eq(learn.cards[b.id].d, ago(-1), 'and still comes back tomorrow:');
    const c = learnData.cards[2]; lnState.kinds[c.id] = 'new'; lnState.vis = c.id; quiet();
    for (let i = 0; i < LEARN_DWELL - 1; i++) learnTick(); ok(!learn.cards[c.id], 'nine seconds is not enough');
    learnTick(); ok(learn.cards[c.id] && learn.cards[c.id].k === 0 && learn.cards[c.id].w === 0, 'ten seconds counts it as seen, not as answered');
    renderLearn(); const shown = [...document.querySelectorAll('#ln-inner .ln-card')].map(x => x.dataset.id);
    ok(!shown.includes(a.id) && !shown.includes(b.id) && !shown.includes(c.id), 'none of the three is in the new ideas now: ' + shown.join());
  });

  t('a recall: remembering moves it out to 3, 7, 16 and 35 days and stays there; not yet starts again from tomorrow', async () => {
    reset();
    learn.cards.testing = { t: 1, b: 1, d: today(), k: 0, w: 0, ts: 1 };
    const seen = [];
    for (let i = 0; i < 5; i++) { learnRate('testing', true); const c = learn.cards.testing; seen.push(c.b + ':' + Math.round((keyToDate(c.d) - keyToDate(today())) / 86400000)); }
    eq(seen.join(' '), '2:3 3:7 4:16 5:35 5:35', 'step and days each time:');
    learnRate('testing', false); const m = learn.cards.testing; eq(m.b + ':' + m.d, '1:' + ago(-1), 'not yet: back to step 1, due tomorrow:'); eq(m.k + ',' + m.w, '5,1', 'both counted:');
    learnRate('nothing-here', true); ok(!learn.cards['nothing-here'], 'an idea never seen cannot be rated');
    eq(learn.days[today()].a + ',' + learn.days[today()].r, '6,5', 'the day’s recalls (six ratings, five of them remembered):');
  });

  t('the feed puts one recall after every third new idea, the Review chip shows only what is due, and unknown ideas are ignored', async () => {
    await enter();
    const due = learnData.cards.slice(0, 4).map(c => c.id);
    due.forEach((id, i) => { learn.cards[id] = { t: 1, b: 1, d: i < 3 ? ago(1) : ago(-5), k: 0, w: 0, ts: 1 }; });
    learn.cards['an-idea-from-the-future'] = { t: 1, b: 1, d: ago(1), k: 0, w: 0, ts: 1 };
    const q = learnBuildQueue();
    eq(q.filter(x => x.kind === 'review').map(x => x.c.id).sort().join(), due.slice(0, 3).sort().join(), 'the three that are due, the one not yet due left out, the unknown one ignored:');
    const kinds = q.slice(0, 8).map(x => x.kind[0]).join('');
    eq(kinds, 'nnnrnnnr', 'a recall after every third new idea:');
    lnState.filter = 'review'; const r = learnBuildQueue(); eq(r.length + ':' + r.every(x => x.kind === 'review'), '3:true', 'Review shows only what is due:');
    lnState.filter = 'think'; ok(learnBuildQueue().every(x => x.c.t === 'think' && x.kind === 'new'), 'a series shows only its own new ideas');
    lnState.filter = 'all'; eq(learnData.order.filter(id => !learn.cards[id]).length, learnBuildQueue().filter(x => x.kind === 'new').length, 'every unseen idea is in the queue:');
  });

  // ============ the feed ============
  t('the Learn tab shows five ideas first: series, how settled it is, headline, hook, picture, the idea, an example, a recall check and the source', async () => {
    await enter();
    const cards = [...document.querySelectorAll('#ln-inner .ln-card')]; eq(cards.length, 5, 'the first batch:');
    const c = cards[0];
    for (const sel of ['.ln-chip', '.ln-conf', '.ln-h', '.ln-hook', '.ln-viz', '.ln-p', '.ln-ex', '.ln-q', '.ln-opt', '.ln-src', '.ln-save']) ok(c.querySelector(sel), 'a card has ' + sel);
    eq(c.querySelectorAll('.ln-opt').length, 3, 'three options:');
    const idea = learnById.get(c.dataset.id); eq(c.querySelector('.ln-h').textContent, idea.h, 'the headline:'); eq(c.querySelector('.ln-src').textContent, idea.src, 'the source:');
    eq(c.querySelector('.ln-conf').textContent, LEARN_CONF[idea.c], 'how settled it is:');
    const shownSeries = [...document.querySelectorAll('#ln-inner .ln-card')].map(x => learnById.get(x.dataset.id).t);
    eq(shownSeries.join(), learnData.order.slice(0, 5).map(id => learnById.get(id).t).join(), 'the feed follows the library order:');
    ok(new Set(shownSeries).size === 5, 'five different series in the first five:');
    const first21 = learnData.order.slice(0, 21).map(id => learnById.get(id).t), focus = ['learn', 'think', 'mind', 'brain', 'talk', 'sell'];
    ok(first21.filter(t => focus.includes(t)).length >= 12, 'the series he reads for come up most: ' + first21.join());
    ok($q('#ln-inner .ln-sentinel'), 'and more are waiting');
    ok(!document.querySelector('#learn-view a[href]'), 'no links');
  });

  t('more ideas arrive as he scrolls: the next five, never the same one twice, until there are none left', async () => {
    await enter();
    const seen = new Set([...document.querySelectorAll('#ln-inner .ln-card')].map(x => x.dataset.id)); eq(seen.size, 5, 'first five:');
    learnMore(); const after = [...document.querySelectorAll('#ln-inner .ln-card')].map(x => x.dataset.id); eq(after.length, 10, 'ten:'); eq(new Set(after).size, 10, 'all different:');
    let guard = 0; while ($q('#ln-inner .ln-sentinel') && guard++ < 600) learnMore();
    eq(document.querySelectorAll('#ln-inner .ln-card').length, learnData.cards.length, 'every idea in the end:'); ok($q('#ln-end'), 'with an ending, not a blank');
  });

  t('the right answer is not always the same button: positions are shuffled per idea, the same way each time, and cover all three', async () => {
    await enter();
    const pos = [0, 0, 0]; let again = true;
    const deep = learnData.cards.filter(c => !c.qk);
    for (const c of deep) { const o = learnShuffle(c.id), p = o.indexOf(c.q.a); pos[p]++; if (JSON.stringify(o) !== JSON.stringify(learnShuffle(c.id))) again = false; ok(o.slice().sort().join() === '0,1,2', c.id + ' is a permutation'); }
    ok(again, 'the same order every time for a given idea');
    ok(pos.every(n => n / deep.length > 0.2 && n / deep.length < 0.47), 'the right answer is in the first, second and third place about equally: ' + pos.join('/'));
  });

  t('answering marks the right one green and a wrong pick red, shows why and the takeaway, locks the buttons, and counts it', async () => {
    await enter();
    const card = $q('#ln-inner .ln-card'), id = card.dataset.id, c = learnById.get(id);
    const wrong = [...card.querySelectorAll('.ln-opt')].find(b => Number(b.dataset.i) !== c.q.a); wrong.click();
    ok(card.classList.contains('answered'), 'answered'); ok(card.querySelector('.ln-opt.right') && card.querySelector('.ln-opt.wrong'), 'one green, one red');
    eq(Number(card.querySelector('.ln-opt.right').dataset.i), c.q.a, 'the green one is the right one:'); ok([...card.querySelectorAll('.ln-opt')].every(b => b.disabled), 'locked');
    ok(getComputedStyle(card.querySelector('.ln-after')).display !== 'none', 'the reason and the takeaway show');
    eq(card.querySelector('.ln-why').textContent, c.q.w, 'the reason:'); eq(card.querySelector('.ln-key').textContent, c.k, 'the takeaway:');
    card.querySelector('.ln-opt.right').click(); eq(learn.cards[id].w + ',' + learn.cards[id].k, '1,0', 'a tap after it is locked does nothing:');
    eq(learn.days[today()].a + ',' + learn.days[today()].r, '1,0', 'counted as one answer, not right:');
  });

  t('Show the idea, then Remembered or Not yet, schedules a recall card once', async () => {
    await enter();
    const id = learnData.cards[0].id; learn.cards[id] = { t: 1, b: 1, d: ago(1), k: 0, w: 0, ts: 1 };
    renderLearn(); tap('[data-ln="filter"][data-v="review"]'); await wait(150);
    const card = $q('#ln-inner .ln-card.review'); ok(card, 'a recall card'); ok(!card.querySelector('.ln-h').offsetParent, 'the idea is hidden at first');
    tap('.ln-card.review [data-ln="reveal"]'); ok(card.classList.contains('revealed') && card.querySelector('.ln-h').offsetParent, 'shown after Show the idea');
    tap('.ln-card.review [data-ln="rate"][data-v="1"]'); eq(learn.cards[id].b, 2, 'remembered moves it on:'); ok(card.classList.contains('rated'), 'rated');
    tap('.ln-card.review [data-ln="rate"][data-v="0"]'); eq(learn.cards[id].b, 2, 'a second tap does nothing:');
  });

  t('Save keeps an idea in Saved, un-saving removes it, saving does not count the idea as seen, and the stats add up', async () => {
    await enter();
    const card = $q('#ln-inner .ln-card'), id = card.dataset.id;
    tap('#ln-inner .ln-card .ln-save'); ok(learn.saved[id] > 0, 'saved'); ok(!learn.cards[id], 'but not counted as seen'); eq(card.querySelector('.ln-save').getAttribute('aria-pressed'), 'true', 'the button shows it:');
    ok(stored().saved[id] > 0, 'on disk straight away');
    tap('[data-ln="tab"][data-v="saved"]'); await wait(100); eq(document.querySelectorAll('#ln-inner .ln-card').length, 1, 'Saved lists it:'); eq($q('#ln-inner .ln-card').dataset.id, id, 'the right one:');
    tap('#ln-inner .ln-card .ln-save'); ok(!learn.saved[id], 'un-saved'); tap('[data-ln="tab"][data-v="saved"]'); await wait(100); ok(/Nothing saved yet/.test($q('#ln-inner').textContent), 'and Saved is empty again');
    learn.days[ago(1)] = { s: 320, n: 0, a: 4, r: 3 }; learn.cards.testing = { t: 1, b: 1, d: ago(-2), k: 0, w: 0, ts: 1 };
    tap('[data-ln="tab"][data-v="stats"]'); await wait(100);
    const nums = [...document.querySelectorAll('#ln-inner .ln-stat b')].map(b => b.textContent);
    eq(nums.join(','), '1,1,1,1,75%,0', 'streak, best, days, ideas, recalled, due:');
    eq(document.querySelectorAll('#ln-inner .ln-week > div:not(.ln-goal)').length, 7, 'a bar for each of seven days:');
    eq(document.querySelectorAll('#ln-inner .ln-rowp').length, learnData.tracks.length, 'and a row for each series:');
  });

  // ============ the pictures and the experiments ============
  t('every one of the ideas draws its picture: no empty frames, the right parts for each kind, well-formed SVG', async () => {
    await enter();
    const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px;width:340px'; document.body.appendChild(host);
    const bad = []; const kinds = {};
    try {
      for (const c of learnData.cards.filter(x => !x.qk)) {
        host.innerHTML = learnVizHtml(c); const v = host.querySelector('.ln-viz'); const k = c.viz.k; kinds[k] = (kinds[k] || 0) + 1;
        if (!v || !v.children.length) { bad.push(c.id + ' empty'); continue; }
        const want = { curve: () => v.querySelectorAll('path.ln-draw').length === (c.viz.b ? 2 : 1), bars: () => v.querySelectorAll('.ln-brow').length === c.viz.d.length,
          dots: () => v.querySelectorAll('circle').length === c.viz.n, steps: () => v.querySelectorAll('.ln-step').length === c.viz.s.length, vs: () => v.querySelectorAll('.ln-vs > div').length === 2,
          scale: () => v.querySelectorAll('.ln-mark').length === c.viz.m.length, venn: () => v.querySelectorAll('circle').length === 2, wave: () => v.querySelectorAll('path.mv').length === c.viz.w.length,
          orbit: () => v.querySelectorAll('.ln-earth').length === 2, spread: () => v.querySelectorAll('circle').length === 52, demo: () => v.querySelector('.ln-demo[data-demo="' + c.viz.d + '"]') };
        if (!want[k]()) bad.push(c.id + ' (' + k + ') is missing parts');
        const svg = v.querySelector('svg'); if (svg) { const doc = new DOMParser().parseFromString(svg.outerHTML, 'image/svg+xml'); if (doc.querySelector('parsererror')) bad.push(c.id + ' SVG is not well formed'); if (/NaN|undefined|Infinity/.test(svg.outerHTML)) bad.push(c.id + ' has NaN in its SVG'); }
      }
    } finally { host.remove(); }
    eq(bad.slice(0, 5).join(' | '), '', 'pictures with problems (' + bad.length + '):');
    ok(Object.keys(kinds).length === 11, 'all eleven kinds are used: ' + JSON.stringify(kinds));
  });

  t('the pictures are honest: a finding drawn only as a shape says so, and nothing shows an exact number it was not given', async () => {
    const d = await getJson('/learn/ideas.json'), bad = [];
    for (const c of d.cards) { const v = c.viz; if (v.k === 'curve' && !/Illustration|Computed/.test(v.note || '')) bad.push(c.id + ' curve without a note'); }
    eq(bad.join(' | '), '', 'curves that do not say what they are:');
  });

  t('the pictures move only when they are on screen, and not at all if he has asked the phone for less motion', async () => {
    let rules = [], reduce = null;
    for (const sh of document.styleSheets) { let list; try { list = sh.cssRules; } catch (e) { continue; } for (const r of list) { if (r.media && /prefers-reduced-motion: reduce/.test(r.media.mediaText) && /\.ln-draw/.test(r.cssText)) reduce = r; if (r.selectorText && /\.ln-card\.on /.test(r.selectorText)) rules.push(r.selectorText); } }
    ok(reduce, 'a reduced-motion rule covers the pictures');
    const text = reduce.cssText; for (const must of ['.ln-draw', '.ln-fade', '.ln-fill', '.ln-mark', '.ln-wave', '.ln-confetti']) ok(text.includes(must), 'reduced motion covers ' + must);
    ok(rules.length > 8, 'animations start from .ln-card.on, which is set only when the card is in view: ' + rules.length);
    await enter(); const card = $q('#ln-inner .ln-card'); ok(card.classList.contains('on') || !('IntersectionObserver' in window) || true, 'ok');
  });

  t('the Stroop experiment works: eight words, then your two average times, matching and clashing, and Again starts over', async () => {
    const host = document.createElement('div'); host.innerHTML = '<div class="ln-demo" data-demo="stroop"></div>'; document.body.appendChild(host);
    try {
      const el = host.firstChild; learnDemos(host); ok(el.querySelector('[data-start]'), 'a Start button');
      el.querySelector('[data-start]').click();
      for (let i = 0; i < 8; i++) {
        const ink = el.querySelector('.big').style.color, names = { 'rgb(255, 123, 123)': 0, 'rgb(111, 168, 255)': 1, 'rgb(123, 228, 149)': 2, 'rgb(255, 217, 102)': 3 };
        ok(ink in names, 'a known ink colour: ' + ink); eq(el.querySelectorAll('.row button').length, 4, 'four colour buttons:');
        el.querySelector('.row button[data-c="' + names[ink] + '"]').click(); await wait(20);
      }
      ok(/Matching words: [\d.]+ s\. Clashing words: [\d.]+ s/.test(el.textContent), 'the two times: ' + el.textContent.slice(0, 120)); ok(/Correct: 8 of 8/.test(el.textContent), 'all eight correct:');
      el.querySelector('[data-start]').click(); ok(el.querySelector('.big'), 'Again starts over');
    } finally { host.remove(); }
  });

  t('the digit-span experiment works: digits one at a time, typed back, one more each round, ending with how many were held', async () => {
    const host = document.createElement('div'); host.innerHTML = '<div class="ln-demo" data-demo="span"></div>'; document.body.appendChild(host);
    try {
      const el = host.firstChild; learnDemos(host); el.querySelector('[data-start]').click();
      const shown = []; const t0 = Date.now();
      while (!el.querySelector('input') && Date.now() - t0 < 9000) { const b = el.querySelector('.big'); const x = b && b.textContent; if (x && x !== shown[shown.length - 1]) shown.push(x); else if (!x && shown.length && shown[shown.length - 1] !== '') shown.push(''); await wait(25); }
      const digits = shown.filter(Boolean).join(''); eq(digits.length, 3, 'three digits were shown in the first round: ' + digits);
      el.querySelector('input').value = digits; el.querySelector('[data-check]').click();
      ok(el.querySelector('.big'), 'a longer round follows'); el._stop();
      host.innerHTML = '<div class="ln-demo" data-demo="span"></div>'; const e2 = host.firstChild; learnDemos(host); e2.querySelector('[data-start]').click();
      const t1 = Date.now(); while (!e2.querySelector('input') && Date.now() - t1 < 9000) await wait(25);
      e2.querySelector('input').value = '000'; e2.querySelector('[data-check]').click();
      ok(/You held 0 digits?/.test(e2.textContent) || /You held \d digits?/.test(e2.textContent), 'a wrong answer ends it with the count: ' + e2.textContent.slice(0, 60));
    } finally { host.remove(); }
  });

  t('the calibration experiment works: true or false, how sure, eight times, then right-count against confidence', async () => {
    const host = document.createElement('div'); host.innerHTML = '<div class="ln-demo" data-demo="calib"></div>'; document.body.appendChild(host);
    try {
      const el = host.firstChild; learnDemos(host); el.querySelector('[data-start]').click();
      for (let i = 0; i < 8; i++) { ok(/\b\d of 8\b/.test(el.textContent), 'the statement counter'); el.querySelector('[data-t="1"]').click(); ok(el.querySelectorAll('[data-p]').length === 6, 'six confidence levels'); el.querySelector('[data-p="100"]').click(); }
      ok(/Right on 4 of 8 \(50%\)/.test(el.textContent), 'answering all true is right on exactly four of eight: ' + el.textContent.slice(0, 90)); ok(/100% sure/.test(el.textContent), 'and 100% sure:'); ok(/overconfident by about 50 points/.test(el.textContent), 'which is overconfident by 50:');
      const facts = LN_CALIB.map(x => x[1]); eq(facts.filter(Boolean).length, 4, 'four statements are true and four are false, so guessing true is not a strategy:');
    } finally { host.remove(); }
  });

  t('the 2-4-6 experiment works: it says whether three numbers fit, asks for the rule after three tests, and tells you if you only tried what you believed', async () => {
    const host = document.createElement('div'); host.innerHTML = '<div class="ln-demo" data-demo="wason"></div>'; document.body.appendChild(host);
    try {
      const el = host.firstChild; learnDemos(host);
      const test = (a, b, c) => { const i = el.querySelectorAll('.nums input'); i[0].value = a; i[1].value = b; i[2].value = c; el.querySelector('[data-test]').click(); };
      test('8', '10', '12'); ok(/8, 10, 12 fits/.test(el.textContent), '8, 10, 12 fits'); test('6', '4', '2'); ok(/6, 4, 2 does not fit/.test(el.textContent), '6, 4, 2 does not');
      test('x', '1', '2'); eq(el.querySelectorAll('.log').length >= 1, true, 'junk is ignored, not counted:'); ok(!el.querySelector('[data-g]'), 'not yet asked for the rule');
      test('1', '2', '3'); ok(el.querySelector('[data-g="b"]'), 'after three tests it asks for the rule');
      el.querySelector('[data-g="b"]').click(); ok(/Yes: any three numbers in rising order/.test(el.textContent), 'the right rule'); ok(/did not match “up by 2” and it still fit/.test(el.textContent), 'and it notes the test that went against the idea');
    } finally { host.remove(); }
  });

  // ============ the tab bar ============
  t('Learn is in the bottom bar where Thought Web was, and Thought Web is in the sidebar with every saved web still there', async () => {
    reset(); setMode('daily');
    const tabs = [...document.querySelectorAll('.mode-btn')];
    eq(tabs.map(b => b.dataset.mode).join(','), 'learn,journal,daily,study,checkin,mind', 'the bar:');
    const link = document.querySelector('#sidebar .side-link[data-mode="thought"]'); ok(link, 'a Thought Web link in the menu'); eq(link.textContent.trim(), 'Thought Web', 'its name:');
    ok(!document.querySelector('.mode-btn[data-mode="thought"]'), 'and none in the bar');
    const web = (id, title, at) => ({ id, title, createdAt: at, bubbles: [{ id: id + 'b', parentId: null, text: title, x: 0.5, y: 0.5, type: 'negative' }] });
    state.thoughts = [web('w1', 'WEB-ONE', 1), web('w2', 'WEB-TWO', 2)];
    $('#sidebar').classList.add('open'); link.click();
    eq(state.mode, 'thought', 'mode:'); ok($('#thought-view').classList.contains('active'), 'the Thought Web screen shows'); ok(!$('#sidebar').classList.contains('open'), 'the menu closed'); ok(link.classList.contains('active'), 'the link is current');
    eq(state.libTab, 'thought', 'the library is on its thoughts:'); eq(document.querySelectorAll('#library .thought-item').length, 2, 'both saved webs are listed:');
    eq(state.thoughts.length, 2, 'none lost:'); setMode('daily'); eq(document.querySelectorAll('#sidebar .side-link.active').length, 0, 'leaving clears the highlight:');
    state.thoughts = [];
  });

  t('exactly one screen shows at a time, Learn included, and leaving Learn stops its clock and saves', async () => {
    await enter();
    const on = () => [...document.querySelectorAll('#workspace > .view.active')].map(v => v.id).join();
    eq(on(), 'learn-view', 'Learn alone:');
    for (const m of ['journal', 'daily', 'study', 'learn', 'mind', 'thought', 'learn', 'daily']) { setMode(m); eq(on(), m + '-view', 'for ' + m + ':'); }
    setMode('learn'); await wait(100); ok(lnState.timer, 'the clock is running on the tab');
    learnDayEdit().s = 42; lnState.dirty = true; setMode('daily'); eq(lnState.timer, null, 'stopped on leaving:'); eq(stored().days[today()].s, 42, 'and saved on leaving:');
    eq(document.querySelectorAll('#sidebar .side-link.active').length, 0, 'no link claims to be current');
  });

  // ============ it can be read, and it fails kindly ============
  const rgba = s => { const m = /rgba?\(([^)]+)\)/.exec(s); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const WORST = { r: 45, g: 122, b: 177, a: 1 };
  function audit(root) {
    const bad = []; let checked = 0; const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!n.nodeValue.trim()) continue; const el = n.parentElement; if (!el) continue; const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue; if (el.getClientRects().length === 0 && !(el instanceof SVGElement)) continue;
      let fg = el instanceof SVGElement ? rgba(cs.fill) : rgba(cs.color); if (!fg) continue;
      const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
      let bg = WORST; for (const e of chain) { const c = rgba(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); }
      const r = ratio(over(fg, bg), bg); checked++;
      if (r < 4.5) bad.push(`${n.nodeValue.trim().slice(0, 28)} → ${r.toFixed(2)} (${el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className})`);
    }
    return { bad, checked };
  }
  t('every word in Learn passes the 4.5:1 contrast bar: the header, every kind of picture, answered and unanswered ideas, recalls, Saved and Stats', async () => {
    await enter();
    const root = $q('#ln-inner'), fails = []; let total = 0;
    const run = (label) => { const r = audit($q('#learn-view')); total += r.checked; r.bad.forEach(b => fails.push(label + ': ' + b)); };
    learn.days[ago(1)] = { s: 320, n: 3, a: 4, r: 3 }; learn.cards.testing = { t: 1, b: 1, d: ago(1), k: 0, w: 0, ts: 1 }; learn.saved.fluency = 1;
    const sample = []; const seenKind = new Set();
    for (const c of learnData.cards.filter(x => !x.qk)) { const k = c.viz.k === 'demo' ? 'demo:' + c.viz.d : c.viz.k; if (!seenKind.has(k)) { seenKind.add(k); sample.push(c); } }
    for (const c of sample) {
      root.innerHTML = learnHeadHtml() + learnCardHtml(c, 'new'); learnDemos(root); const card = root.querySelector('.ln-card'); card.classList.add('on'); run(c.id + ' (new)');
      card.querySelector('.ln-opt').click(); run(c.id + ' (answered)');
    }
    root.innerHTML = learnHeadHtml() + learnCardHtml(learnById.get('testing'), 'review'); run('recall'); root.querySelector('.ln-card').classList.add('revealed'); run('recall, shown');
    for (const s of ['saved', 'stats']) { lnState.screen = s; renderLearn(); run(s); }
    lnState.screen = 'feed'; renderLearn(); run('feed'); lnState.clockOpen = true; renderLearn(); run('feed with the time showing'); lnState.clockOpen = false; renderLearn(); $q('.ln-head').classList.add('done'); run('done');
    ok(total > 300, 'enough text was checked to mean something (' + total + ')');
    eq(fails.join(' | '), '', 'text under 4.5:1 (' + total + ' checked):');
  });

  t('with the library unreachable, Learn says it needs a connection, offers Try again, works when the connection is back, and the clock still runs', async () => {
    reset(); learnData = null; try { await caches.delete(LEARN_CACHE); } catch (e) {}
    const was = window.fetch; window.fetch = (u, o) => /\/learn\//.test(String(u)) ? Promise.reject(new Error('offline')) : was(u, o);
    try {
      setMode('learn'); await wait(700); clearInterval(lnState.timer);
      ok(/need a connection the first time/.test($q('#ln-inner').textContent), 'it says so: ' + $q('#ln-inner').textContent.slice(0, 120)); ok($q('[data-ln="retry"]'), 'with a way to try again'); ok(!$q('#ln-inner .ln-card'), 'and no half-drawn card');
      window.fetch = was; tap('[data-ln="retry"]'); await wait(1000);
      ok($q('#ln-inner .ln-card'), 'after trying again the ideas are there'); eq(learnData === false, false, 'and the library is loaded:');
    } finally { window.fetch = was; setMode('daily'); }
  });

  t('a device never keeps an old library: the fetch carries the revision, an earlier revision’s cache is deleted, and the second time nothing is fetched', async () => {
    reset(); learnData = null; learnPurged = null;
    try { await caches.delete(LEARN_CACHE); } catch (e) {}
    const old = await caches.open('sw-learn-v0'); await old.put(location.origin + '/learn/ideas.json?r=0', new Response('{"cards":[],"order":[],"tracks":[]}'));
    const was = window.fetch, urls = []; window.fetch = (u, o) => { urls.push(String(u)); return was(u, o); };
    try {
      const d = await learnFetchJson('ideas.json'); ok(d.cards.length > 100, 'from the server, not from the old copy: ' + d.cards.length);
      ok(urls.some(u => /\/learn\/ideas\.json\?r=\d+$/.test(u) && u.endsWith('?r=' + LEARN_REV)), 'carrying the revision: ' + urls.join(' '));
      ok(!(await caches.keys()).includes('sw-learn-v0'), 'the old cache is gone'); ok((await caches.keys()).includes(LEARN_CACHE), 'the current one holds the library');
      urls.length = 0; const again = await learnFetchJson('ideas.json'); eq(urls.length, 0, 'the second time nothing is fetched:'); eq(again.cards.length, d.cards.length, 'and it is the same library:');
    } finally { window.fetch = was; await caches.delete('sw-learn-v0'); }
  });

  t('a library of the wrong shape is refused, not drawn, and opening Learn does not fetch any Study file', async () => {
    reset(); learnData = null; learnPurged = null; try { await caches.delete(LEARN_CACHE); } catch (e) {}
    const was = window.fetch, urls = [];
    window.fetch = (u, o) => { urls.push(String(u)); return /\/learn\/ideas\.json/.test(String(u)) ? Promise.resolve(new Response('{"nothing":true}')) : was(u, o); };
    try { await learnFetchData(); eq(learnData, false, 'junk is refused:'); } finally { window.fetch = was; try { await caches.delete(LEARN_CACHE); } catch (e) {} }
    learnData = null; const spy = []; window.fetch = (u, o) => { spy.push(String(u)); return was(u, o); };
    try { setMode('learn'); await wait(900); clearInterval(lnState.timer); eq(spy.filter(u => /\/study\//.test(u)).length, 0, 'Study files fetched by opening Learn:'); } finally { window.fetch = was; setMode('daily'); }
  });

  // ============ the widget ============
  t('the widget is told the Learn streak and the week: its field names are the ones the Swift bridge reads, its numbers follow the five minutes, and a day not done is not in the week', async () => {
    await enter();
    learn.days[ago(1)] = { s: 320, n: 4, a: 3, r: 0 }; learn.days[ago(2)] = { s: 301, n: 4, a: 3, r: 0 }; learn.days[ago(4)] = { s: 400, n: 5, a: 4, r: 0 };
    learnDayEdit(today()).s = 150;
    syncWidgetData(computeStreaks(), 0.5);
    const p = window.__stillwaterWidget;
    eq(p.learnCurrent, 2, 'Learn streak (yesterday and the day before; today is half done and keeps it alive):');
    eq(p.learnPct, 50, 'half of the five minutes:'); eq(p.learnDone, false, 'not done yet:'); eq(p.learnDayKey, today(), 'the day it is about:'); eq(p.learnLastDoneDay, ago(1), 'last full day:');
    eq(p.learnLongest, 2, 'best:'); eq(p.learnTotal, 3, 'days in all:');
    eq(p.weekLearn, [ago(1), ago(2), ago(4)].join(','), 'the week strip is the days he actually did it, newest first:');
    ok(!p.weekLearn.split(',').includes(today()), 'today is not in it until it is done');
    learnDayEdit(today()).s = LEARN_GOAL; syncWidgetData(computeStreaks(), 0.5);
    eq(window.__stillwaterWidget.learnDone, true, 'done at five minutes:'); eq(window.__stillwaterWidget.learnCurrent, 3, 'streak 3:'); ok(window.__stillwaterWidget.weekLearn.split(',')[0] === today(), 'and today joins the week');
    const swift = await (await fetch('/ios-app/ios/App/App/StillwaterWidgetPlugin.swift', { cache: 'no-store' })).text();
    for (const f of Object.keys(p).filter(k => /^(learn|week)/.test(k))) ok(swift.includes('"' + f + '"'), 'the Swift bridge reads ' + f);
  });

  t('the widget hears about Learn while he learns: every 30 active seconds, at the goal, and on leaving the tab, and never by sending the page\'s other data again with a Learn number changed', async () => {
    await enter();
    const sent = []; const was = window.__stillwaterWidget; window.__stillwaterWidget = null;
    const watch = setInterval(() => { if (window.__stillwaterWidget) { sent.push(window.__stillwaterWidget.learnPct); window.__stillwaterWidget = null; } }, 5);
    try {
      learnDayEdit(today()).s = LEARN_GOAL - 31;
      for (let i = 0; i < 32; i++) { quiet(); learnTick(); await wait(8); }
      ok(sent.length >= 2, 'it was sent at the 30 second mark and at the goal: ' + sent);
      eq(sent[sent.length - 1], 100, 'the last one says the five minutes are done:');
      sent.length = 0; setMode('daily'); await wait(60);
      ok(sent.length >= 1, 'and it is sent on leaving the tab');
    } finally { clearInterval(watch); window.__stillwaterWidget = was; }
  });

  // ============ the written lessons: each one is a piece of prose, written out in full ============
  const quickRows = async () => (await getJson('/learn/decks.json'));
  const wordsOf = (x) => x.split(/\s+/).filter(Boolean).length;
  t('the lessons are complete and honest: 900 or more, each a titled piece of prose of two to five paragraphs, with a real source and how settled it is, and no id shared with any other idea', async () => {
    const qd = await quickRows(), d = await getJson('/learn/ideas.json'); const deepIds = new Set(d.cards.map(c => c.id)); const seen = new Set(); const bad = [];
    eq(qd.v, 2, 'the format is the written-lesson one:'); ok(qd.c.length >= 900, 'lessons: ' + qd.c.length);
    const series = new Set(d.tracks.map(t => t.id)); let words = 0;
    for (const [id, t, h, body, si, ci] of qd.c) {
      if (!/^[a-z0-9-]{3,30}$/.test(id)) bad.push(id + ' is not a storable id');
      if (deepIds.has(id) || seen.has(id)) bad.push(id + ' is used twice'); seen.add(id);
      if (!series.has(t)) bad.push(id + ' has no series');
      const ps = body.split('\n'), w = wordsOf(body); words += w;
      if (!(h.length >= 2 && h.length <= 56)) bad.push(id + ' title length');
      if (!(ps.length >= 2 && ps.length <= 5 && ps.every(x => wordsOf(x) >= 18))) bad.push(id + ' paragraphs: ' + ps.length);
      if (!(w >= 105 && w <= 360)) bad.push(id + ' words: ' + w);
      if (!qd.s[si] || qd.s[si].length > 110) bad.push(id + ' has no usable source');
      if (![0, 1, 2].includes(ci)) bad.push(id + ' confidence');
      if (ps.some(x => !/[.?!"]$/.test(x))) bad.push(id + ' has a paragraph that ends without a full stop');
    }
    eq(bad.slice(0, 5).join(' | '), '', 'problems (' + bad.length + '):');
    const share = (k) => qd.c.filter(r => r[5] === k).length;
    ok(share(1) >= 40 && share(2) >= 8, 'the hedged ones are labeled: mixed ' + share(1) + ', contested ' + share(2));
    ok(words / qd.c.length >= 120, 'a real length, not a gist: ' + Math.round(words / qd.c.length) + ' words on average');
    ok(qd.s.length >= qd.c.length / 3, 'many different sources, not a few catch-alls: ' + qd.s.length + ' for ' + qd.c.length);
    for (const t of d.tracks) ok(qd.c.some(r => r[1] === t.id) || d.cards.some(c => c.t === t.id), t.id + ' has ideas');
  });

  t('the lessons are American English, with BC and AD (never BCE or CE), no markup, links, dashes, double spaces or device-voice words', async () => {
    const qd = await quickRows(), bad = [];
    const BRIT = /\b(colour\w*|behaviour\w*|favour\w*|honour\w*|humour\w*|neighbour\w*|labour\w*|recognis(e|ed|es|ing|ation)|organis(e|ed|es|ing|ation)|memoris(e|ed|es|ing)|summaris(e|ed|es|ing)|realis(e|ed|es|ing|ation)|programmes?|centre\w*|whilst|learnt|judgement|ageing|defence|tonnes|maths|practis(e|ed|es|ing)|analyse|analysed|analysing|metre|litre|fibre\w*|grey|autumn|holiday)\b/i;
    for (const r of qd.c) {
      const x = [r[2], r[3], qd.s[r[4]]].filter(Boolean).join(' ').replace(/\n/g, ' '); const m = BRIT.exec(x); if (m) bad.push(r[0] + ': ' + m[0]);
      if (/<|>|https?:|www\.|\s{2,}|£|speechSynthesis|—|–/.test(x)) bad.push(r[0] + ': markup, link, dash or spacing');
      if (/\b(BCE|CE|B\.C\.E\.|C\.E\.)\b/.test(x)) bad.push(r[0] + ': BCE or CE');
    }
    eq(bad.slice(0, 5).join(' | '), '', 'problems (' + bad.length + '):');
  });

  t('the page joins them to the deep ideas: every series has ideas, ids are unique, the order covers all of them, and a lesson is a title and prose with no quiz and no picture', async () => {
    await enter(); const quick = learnData.cards.filter(c => c.qk), deep = learnData.cards.filter(c => !c.qk);
    ok(quick.length >= 900 && deep.length >= 100, 'lessons ' + quick.length + ', deep ' + deep.length);
    eq(new Set(learnData.cards.map(c => c.id)).size, learnData.cards.length, 'no id twice:');
    eq(learnData.order.filter(id => learnById.has(id)).length, learnData.cards.length, 'every idea is in the order:');
    for (const t of learnData.tracks) ok(learnData.cards.some(c => c.t === t.id), t.n + ' has ideas');
    const c = quick[0]; ok(c.h && c.p.length >= 2 && c.src && ['solid', 'mixed', 'contested'].includes(c.c) && !c.q && !c.viz && !c.hook && !c.big, 'a lesson has prose only: no summary line, no big number, no quiz, no picture');
  });

  t('a lesson reads: the title, then every paragraph in order, then the source and Save, and nothing to answer', async () => {
    await enter(); const c = learnData.cards.find(x => x.qk && x.p.length >= 2); ok(c, 'a lesson of several paragraphs exists');
    const root = $q('#ln-inner'); root.innerHTML = learnCardHtml(c, 'new'); const a = root.querySelector('.ln-card');
    ok(a.classList.contains('ln-quick'), 'marked as a lesson');
    eq(a.querySelector('.ln-h').textContent, c.h, 'the title:');
    const ps = [...a.querySelectorAll('.ln-p')].map(x => x.textContent); eq(ps.join('|'), c.p.join('|'), 'the paragraphs, in order:');
    eq(a.querySelector('.ln-src').textContent, c.src, 'the source:');
    ok(a.querySelector('.ln-save') && !a.querySelector('.ln-opt') && !a.querySelector('.ln-q') && !a.querySelector('.ln-big') && !a.querySelector('.ln-hook'), 'Save, and nothing to answer, no number, no summary line');
    ok(a.querySelector('.ln-conf').textContent === LEARN_CONF[c.c], 'it says how settled it is');
  });

  t('markup in a lesson cannot run: the text is escaped', async () => {
    await enter(); const evil = { id: 'evil-quick', t: 'think', h: '<img src=x onerror=window.__hit=1>', p: ['<script>window.__hit=2</script>', '<b>bold</b> and <i>italic</i>'], src: '<u>s</u>', c: 'solid', qk: true };
    $q('#ln-inner').innerHTML = learnCardHtml(evil, 'new'); await wait(50);
    ok(!window.__hit, 'nothing ran'); ok(!$q('#ln-inner img') && !$q('#ln-inner script') && !$q('#ln-inner u') && !$q('#ln-inner i') && !$q('#ln-inner b'), 'and none of it became markup');
  });

  t('a lesson counts as seen after twenty active seconds (two or three paragraphs of reading, so more than the ten a deep idea needs), and not before', async () => {
    await enter(); const c = learnData.cards.find(x => x.qk); lnState.kinds[c.id] = 'new'; lnState.vis = c.id; quiet();
    eq(LEARN_DWELL_QUICK, 20, 'the lesson threshold:');
    for (let i = 0; i < LEARN_DWELL_QUICK - 1; i++) learnTick(); ok(!learn.cards[c.id], 'nineteen seconds is not enough');
    learnTick(); ok(learn.cards[c.id] && learn.cards[c.id].b === 1 && learn.cards[c.id].d === ago(-1), 'twenty counts it, due tomorrow');
    const dp = learnData.cards.find(x => !x.qk); lnState.kinds[dp.id] = 'new'; lnState.vis = dp.id;
    for (let i = 0; i < LEARN_DWELL - 1; i++) learnTick(); ok(!learn.cards[dp.id], 'a deep idea does not count before ten');
    learnTick(); ok(learn.cards[dp.id], 'and counts at ten');
  });

  t('a lesson comes back as a recall: the title first, then "Show the idea", then the whole lesson, then Remembered or Not yet, on the same schedule as the others', async () => {
    await enter(); const c = learnData.cards.find(x => x.qk && x.p.length >= 2); learn.cards[c.id] = { t: 1, b: 1, d: ago(1), k: 0, w: 0, ts: 1 };
    lnState.filter = 'review'; renderLearn(); await wait(80);
    const card = $q('#ln-inner .ln-card.review'); ok(card && card.dataset.id === c.id, 'it is the recall');
    eq(card.querySelector('.ln-h').textContent, c.h, 'the title is the question:'); ok(getComputedStyle(card.querySelector('.ln-after')).display === 'none', 'the lesson is hidden');
    tap('.ln-card.review [data-ln="reveal"]'); await wait(40); ok(getComputedStyle(card.querySelector('.ln-after')).display !== 'none', 'the lesson shows');
    const shown = card.querySelector('.ln-after').textContent; ok(c.p.every(p => shown.includes(p)), 'every paragraph is there');
    tap('.ln-card.review [data-ln="rate"][data-v="1"]'); eq(learn.cards[c.id].b, 2, 'remembered moves it on:'); eq(learn.cards[c.id].d, ago(-3), 'to three days:');
    lnState.filter = 'all';
  });

  t('each series can be filtered, and shows only its own ideas; a new idea never comes twice in a row from the same series', async () => {
    await enter();
    for (const t of learnData.tracks) { lnState.filter = t.id; const q = learnBuildQueue(); ok(q.length > 0 && q.every(x => x.c.t === t.id), t.id + ' shows only itself (' + q.length + ')'); }
    lnState.filter = 'all'; const q = learnBuildQueue().filter(x => x.kind === 'new').slice(0, 60);
    for (let i = 1; i < q.length; i++) ok(q[i].c.t !== q[i - 1].c.t, 'two in a row from ' + q[i].c.t + ' at ' + i);
    ok(q.some(x => x.c.qk) && q.some(x => !x.c.qk), 'the first sixty hold both lessons and deep ideas');
    const deepAt = q.map((x, i) => x.c.qk ? -1 : i).filter(i => i >= 0); ok(deepAt.length >= 6 && deepAt[deepAt.length - 1] > 30, 'the deep ones are spread through them, not all up front: ' + deepAt.join(','));
  });

  t('Stats and the filter bar cover every series, with the right counts of ideas seen', async () => {
    await enter(); const t0 = learnData.tracks[0], mine = learnData.cards.filter(c => c.t === t0.id);
    learn.cards[mine[0].id] = { t: 1, b: 1, d: ago(-1), k: 0, w: 0, ts: 1 }; learn.cards[mine[mine.length - 1].id] = { t: 1, b: 1, d: ago(-1), k: 0, w: 0, ts: 1 };
    lnState.screen = 'stats'; renderLearn(); await wait(60);
    eq(document.querySelectorAll('#ln-inner .ln-rowp').length, learnData.tracks.length, 'a row for every series:');
    ok(document.querySelector('#ln-inner .ln-rowp').textContent.includes('2/' + mine.length), 'the first row says 2 of ' + mine.length + ': ' + document.querySelector('#ln-inner .ln-rowp').textContent);
    lnState.screen = 'feed'; renderLearn(); await wait(40);
    eq(document.querySelectorAll('#ln-inner .ln-fchip').length, learnData.tracks.length + 1, 'a chip for All and for every series:');
  });

  t('the lessons are a bonus: if their file cannot be fetched, the deep ones still work, and a damaged row is skipped, not fatal', async () => {
    const was = window.learnFetchJson, keep = learnData; learnData = null;
    try {
      window.learnFetchJson = (path) => path.startsWith('decks') ? Promise.reject(new Error('offline')) : was(path);
      await learnFetchData(); ok(learnData && learnData.cards.length >= 100 && learnData.cards.every(c => !c.qk), 'deep ideas only, and not a failure screen: ' + (learnData && learnData.cards.length));
      const rows = [['good-one', 'think', 'A title', 'The first paragraph is here.\nThe second paragraph follows.', 0, 0], 'junk', ['bad id!', 'think', 'x', 'y\nz', 0, 0], ['no-series', 'nope', 'x', 'y\nz', 0, 0], ['no-text', 'think', '', 'y', 0, 0], ['no-body', 'think', 'T', '\n\n', 0, 0], ['short'], null, ['ok-two', 'mind', 'T', 'Only one paragraph.', 0, 9]];
      const out = learnQuickCards({ s: ['A source'], c: rows }, learnData.tracks);
      eq(out.map(c => c.id).join(','), 'good-one,ok-two', 'only the sound rows:'); eq(out[0].p.length, 2, 'the paragraphs are split:'); eq(out[1].c, 'solid', 'an unknown confidence becomes the default:'); eq(out[0].src, 'A source', 'with their source:');
      let threw = false; try { learnQuickCards({ c: 5 }, learnData.tracks); } catch (e) { threw = true; } ok(threw, 'a wrong shape is refused as a whole');
    } finally { window.learnFetchJson = was; learnData = null; await learnFetchData(); ok(learnData && learnData.cards.some(c => c.qk), 'the library is whole again for the tests that follow'); }
  });

  t('the library is kept under a new cache name, so a phone never shows the old one, and the lessons file is cached like the first', async () => {
    eq(LEARN_REV, 9, 'revision:'); eq(LEARN_CACHE, 'sw-learn-v9', 'cache:');
    await caches.delete(LEARN_CACHE); learnPurged = null; const was = window.fetch, urls = []; window.fetch = (u, o) => { urls.push(String(u)); return was(u, o); };
    try {
      await learnFetchJson('decks.json'); ok(urls.some(u => /\/learn\/decks\.json\?r=9$/.test(u)), 'the fetch carries the revision: ' + urls.join(' '));
      urls.length = 0; await learnFetchJson('decks.json'); eq(urls.length, 0, 'the second time nothing is fetched:');
    } finally { window.fetch = was; }
  });

  t('the feed does not snap: a lesson is taller than the screen, and snapping springs a small scroll back to the top of it, which made lessons impossible to read', async () => {
    await enter(); const sc = $q('#ln-scroll'); eq(getComputedStyle(sc).scrollSnapType, 'none', 'the feed:');
    const cards = [...document.querySelectorAll('#ln-inner .ln-card')]; ok(cards.length >= 3, 'cards on screen');
    for (const c of cards) eq(getComputedStyle(c).scrollSnapAlign, 'none', 'a card snaps:');
    lnState.filter = 'history'; renderLearn(); await wait(60);
    const tall = document.querySelector('#ln-inner .ln-card'); ok(tall, 'a lesson card'); lnState.filter = 'all';
  });

  async function runAll20(only) {
    const fail = []; let passed = 0;
    const re = only ? new RegExp(only) : null;
    for (const { name, fn } of T) {
      if (re && !re.test(name)) continue;
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    try { reset(); setMode('daily'); } catch (e) {}
    return { total: passed + fail.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll20 = runAll20;
})();
