/* Round 3 — every rotating question stands on its own, and rewording the
   question bank can never move, blank or re-label an answer.
   Same contract: runAll3().

   Questions rotate at random, so one written as a follow-up to the question
   before it ("What did that do to your trust?") arrives with nothing to follow.
   1.6.2 rewrote 58 of them. An answer already written keeps the exact wording
   it was written under; only a question still blank takes the new wording. */
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
  /** Reword one bank entry for the length of fn, then put it back. */
  function withReworded(idx, text, fn) {
    const orig = DEPTHS[idx][1];
    DEPTHS[idx][1] = text;
    try { return fn(); } finally { DEPTHS[idx][1] = orig; }
  }
  const cardTexts = () => [...document.querySelectorAll('.depth-card .depth-q')].map(n => n.textContent);
  const blankDay = (day, dp, ts) => ({ d: day, ci: {}, sc: { done: true, note: '' }, rf: { bother: '', opposite: '' }, ts, dp });

  // Wordings retired in 1.6.2. Each only made sense right after another question.
  const RETIRED = {
    "12": "What would it mean to trust your own judgment here?",
    "129": "What would you need in order to feel steady through this?",
    "132": "What is on the other side of this, if it goes well?",
    "143": "What would change if you believed they meant what they said?",
    "161": "How long does it take you to come back down once you are activated?",
    "168": "Which of your reactions belongs to an older situation than this one?",
    "172": "What would you have to believe to stop watching so closely?",
    "173": "What does staying this alert cost you?",
    "197": "What is one breath-long thing you can do when it rises?",
    "209": "Which survival strategy made sense then and does not now?",
    "211": "What did affection depend on?",
    "222": "What would you have to risk in order to be honest here?",
    "240": "What has already changed in how you handle this?",
    "244": "What is a more precise word for what you called fine?",
    "246": "What would you have to grieve in order to move?",
    "248": "What do you want the people who watch you learn about love?",
    "249": "What did you know before you let yourself know it?",
    "250": "Which lie still lands the hardest, and why that one?",
    "251": "What did each new piece of the truth cost you?",
    "252": "When the story changed again, what did you learn to stop expecting?",
    "255": "What are you still trying to make make sense?",
    "256": "Which image still arrives uninvited, and what do you do when it does?",
    "257": "What have you been investigating that no longer helps you?",
    "258": "What would you need in order to stop searching?",
    "259": "What was real, even though it ended in a lie?",
    "260": "What are you afraid this says about you?",
    "261": "What would you say to a friend this had happened to?",
    "266": "What did staying require you not to see?",
    "267": "Are you grieving the person, or the future you had planned?",
    "271": "What would justice look like, and is any of it actually available?",
    "278": "What do you need from the people who already know?",
    "279": "What do your children need from you today that has nothing to do with any of this?",
    "280": "What are you shielding them from that they may not need shielding from?",
    "281": "How do you want to speak about their other parent in front of them?",
    "282": "Which boundary would let you co-parent without reopening the wound?",
    "283": "What contact serves you, and what contact only hurts?",
    "285": "What happens if it is never said?",
    "293": "What has grown in you that would not have grown any other way?",
    "294": "What part of your life was never theirs to take?",
    "297": "When did you last feel Him near, and where were you?",
    "298": "What do you want to ask Him that you have been avoiding?",
    "300": "What did that do to your trust?",
    "301": "If your anger at Him is allowed, what would you say?",
    "305": "Where have you treated Him as unpredictable because people were?",
    "306": "What would it mean that He does not change?",
    "307": "What do you need to hear from Him today?",
    "308": "Where has He been faithful in a way you overlooked?",
    "310": "What are you still asking Him to explain?",
    "311": "Could you follow without the explanation?",
    "315": "What would it look like to hand this over for today, rather than forever?",
    "319": "What would you like it to feel like?",
    "323": "What is not yours to repent of?",
    "327": "What do you need from your people that you have not asked for?",
    "332": "What do you want your children to see about how you hold your faith through this?",
    "333": "What would trusting Him with tomorrow change about today?",
    "334": "What is one thing you can thank Him for that is true right now?",
    "336": "What would it mean to be loved by Him on your worst day?",
    "337": "What has He not asked you to do that you have been doing anyway?"
  };
  // The theme of every original slot. Question ids are slot numbers, so a
  // question inserted or removed mid-bank would quietly point every later id
  // at a different question.
  const THEMES = ["self", "self", "self", "self", "self", "self", "self", "self", "self", "self", "self", "self", "self", "self", "self", "fear", "fear", "fear", "fear", "fear", "fear", "fear", "fear", "fear", "fear", "fear", "fear", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "values", "values", "values", "values", "values", "values", "values", "values", "values", "values", "values", "values", "body", "body", "body", "body", "body", "body", "body", "body", "past", "past", "past", "past", "past", "past", "past", "past", "past", "past", "future", "future", "future", "future", "future", "future", "future", "future", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "grateful", "grateful", "grateful", "grateful", "grateful", "grateful", "grateful", "grateful", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "meaning", "meaning", "meaning", "meaning", "meaning", "meaning", "meaning", "meaning", "meaning", "meaning", "work", "work", "work", "work", "work", "work", "work", "work", "change", "change", "change", "change", "change", "change", "change", "change", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "attach", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "trigger", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "secure", "past", "past", "past", "past", "past", "past", "past", "past", "past", "past", "past", "past", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "others", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "shadow", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "growth", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "betrayal", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith", "faith"];

  // ---------- the bank ----------
  t('no question still depends on the one before it', () => {
    const left = Object.keys(RETIRED).filter(i => DEPTHS.some(r => r[1] === RETIRED[i])).map(i => 'q' + i);
    eq(left.length, 0, `follow-up wordings still in the bank (${left.slice(0, 6).join(', ')}${left.length > 6 ? ', …' : ''}):`);
  });

  t('he / him / her always says who it means', () => {
    const bad = DEPTHS.map((r, i) => [i, r[1]])
      .filter(([, q]) => /\b(he|him|his|she|her|hers)\b/i.test(q) && !/\b(God|Jesus|Christ|Lord)\b/.test(q))
      .map(([i]) => 'q' + i);
    eq(bad.length, 0, `unnamed he/him/her in ${bad.join(', ')}:`);
  });

  t('no question opens as the continuation of another', () => {
    const bad = DEPTHS.map((r, i) => [i, r[1]])
      .filter(([, q]) => /^(and|but|so|or|then|also|plus|if so|if not)\b|^(why|how come)\s*\?/i.test(q.trim()))
      .map(([i]) => 'q' + i);
    eq(bad.length, 0, `continuations: ${bad.join(', ')}:`);
  });

  t('no question moved: every original slot keeps its theme', () => {
    ok(DEPTHS.length >= THEMES.length, `the bank shrank to ${DEPTHS.length}`);
    const moved = THEMES.map((th, i) => DEPTHS[i][0] === th ? null : 'q' + i).filter(Boolean);
    eq(moved.length, 0, `slots that changed theme (${moved.slice(0, 6).join(', ')}):`);
  });

  // ---------- answers ----------
  t('an answer keeps the exact question it was written under', () => {
    reset();
    const day = '2026-08-30';
    const ids = [250, 285, 300, 319];
    state.daily[day] = blankDay(day, ids.map(i => ({ id: 'q' + i, theme: DEPTHS[i][0], q: RETIRED[i], a: 'answer to q' + i })), 1);
    withReworded(250, 'REWORDED AGAIN', () => renderDaily(day));
    const e = state.daily[day];
    ids.forEach((i, n) => {
      eq(e.dp[n].id, 'q' + i, 'order');
      eq(e.dp[n].q, RETIRED[i], `q${i} wording`);
      eq(e.dp[n].a, 'answer to q' + i, `q${i} answer`);
    });
    ok(ids.every(i => cardTexts().includes(RETIRED[i])), 'the screen must show the wording each answer was written under');
    renderDaily();
  });

  t('a blank question takes the current wording; the answers beside it do not move', () => {
    reset();
    const day = '2026-09-11';
    // The shape of a real day: three answered, one left blank under an old wording.
    state.daily[day] = blankDay(day, [
      { id: 'q11',  theme: DEPTHS[11][0],  q: DEPTHS[11][1],  a: 'first answer' },
      { id: 'q168', theme: DEPTHS[168][0], q: 'the old wording', a: '' },
      { id: 'q229', theme: DEPTHS[229][0], q: DEPTHS[229][1], a: 'second answer' },
      { id: 'q160', theme: DEPTHS[160][0], q: DEPTHS[160][1], a: 'third answer' },
    ], 1757616656000);
    const pairs = JSON.stringify(state.daily[day].dp.map(x => [x.id, x.a]));
    const answeredWording = JSON.stringify(state.daily[day].dp.filter(x => x.a).map(x => x.q));
    const filled = filledCount(state.daily[day]);
    renderDaily(day);
    const e = state.daily[day];
    eq(e.dp[1].q, DEPTHS[168][1], 'blank question wording');
    eq(JSON.stringify(e.dp.map(x => [x.id, x.a])), pairs, 'ids, order and answers');
    eq(JSON.stringify(e.dp.filter(x => x.a).map(x => x.q)), answeredWording, 'answered wordings');
    eq(filledCount(e), filled, 'nothing counted as lost');
    ok(cardTexts().includes(DEPTHS[168][1]) && !cardTexts().includes('the old wording'), 'the screen must show the new wording');
    renderDaily();
  });

  t('typing into a reworded question saves the answer under the wording on screen', () => {
    reset();
    renderDaily();
    const day = dayKey();
    const id = state.daily[day].dp[0].id;
    withReworded(Number(id.slice(1)), 'A REWORDED QUESTION', () => {
      renderDaily();
      const card = [...document.querySelectorAll('.depth-card')]
        .find(c => (c.querySelector('.depth-q') || {}).textContent === 'A REWORDED QUESTION');
      ok(card, 'the reworded question must be on screen');
      const ta = card.querySelector('.depth-input');
      ta.value = 'written under the new wording';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      persist();
      const saved = JSON.parse(localStorage.getItem(KEY)).daily[day].dp.find(x => x.id === id);
      eq(saved.a, 'written under the new wording', 'answer on disk');
      eq(saved.q, 'A REWORDED QUESTION', 'wording on disk');
    });
    renderDaily();
  });

  t('the keystroke log still restores into a reworded question', () => {
    reset();
    renderDaily();
    const day = dayKey();
    const id = state.daily[day].dp[0].id;
    withReworded(Number(id.slice(1)), 'A REWORDED QUESTION', () => {
      renderDaily();
      walWrite(day, 'dp:' + id, 'typed just before the app was killed');
      state.daily[day].dp.forEach(x => { x.a = ''; });
      walRestore();
      eq(state.daily[day].dp.find(x => x.id === id).a, 'typed just before the app was killed', 'restored answer');
    });
    renderDaily();
  });

  t('a synced copy carrying the old wording cannot blank or move an answer', () => {
    reset();
    const day = '2026-09-11';
    const copy = (wording, ts) => blankDay(day, [
      { id: 'q11',  theme: DEPTHS[11][0],  q: DEPTHS[11][1], a: 'first answer' },
      { id: 'q168', theme: DEPTHS[168][0], q: wording, a: '' },
    ], ts);
    // this device already shows the new wording; the cloud copy is newer and still has the old one
    state.daily = mergeDaily({ [day]: copy(DEPTHS[168][1], 100) }, { [day]: copy('the old wording', 200) });
    renderDaily(day);
    const e = state.daily[day];
    eq(e.dp[0].id, 'q11', 'answer still on its own question');
    eq(e.dp[0].a, 'first answer', 'answer kept');
    eq(e.dp[1].q, DEPTHS[168][1], 'wording current again');
    renderDaily();
  });

  async function runAll3() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll3 = runAll3;
})();
