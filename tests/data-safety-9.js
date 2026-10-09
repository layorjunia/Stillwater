/* Round 9 — the question bank grows, and the day leans where life is now.
   Same contract: runAll9().

   1.6.8 appends 90 questions about healing, rebuilding and what comes next,
   and changes how a day is chosen: at least one question about healing or the
   future, and never more than one that looks back. Nothing was deleted and
   nothing moved — a question's id is its slot, and answers are stored against
   it, so an inserted or removed question would silently re-label history. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

  const BACK = ['betrayal', 'past', 'trigger'];
  const FWD  = ['healing', 'rebuild', 'forward', 'growth', 'future', 'change', 'grateful', 'secure'];
  const NEW_THEMES = ['healing', 'rebuild', 'forward'];
  const ORIGINAL = {"lens": [56, 73, 50, 60, 67, 46, 32, 59, 53, 48, 46, 48, 64, 60, 50, 63, 63, 56, 50, 57, 69, 42, 65, 74, 63, 53, 43, 59, 58, 55, 48, 28, 50, 51, 50, 60, 66, 50, 43, 41, 60, 52, 63, 48, 38, 63, 40, 50, 45, 42, 47, 66, 47, 59, 50, 57, 47, 45, 48, 45, 45, 55, 44, 57, 34, 50, 46, 53, 62, 50, 46, 58, 43, 65, 47, 58, 57, 55, 53, 51, 50, 63, 59, 60, 45, 41, 67, 55, 36, 53, 53, 46, 55, 31, 53, 45, 47, 52, 50, 40, 47, 45, 45, 52, 45, 57, 47, 36, 41, 65, 24, 39, 47, 24, 27, 58, 53, 47, 56, 52, 45, 38, 43, 51, 43, 35, 30, 24, 33, 70, 24, 37, 79, 57, 67, 58, 67, 64, 62, 65, 64, 41, 78, 73, 60, 63, 31, 44, 63, 54, 55, 68, 40, 71, 42, 64, 52, 72, 48, 75, 52, 68, 47, 66, 64, 43, 53, 64, 102, 51, 35, 71, 90, 47, 43, 52, 63, 54, 38, 46, 53, 69, 50, 57, 59, 70, 63, 45, 62, 63, 53, 29, 41, 72, 64, 39, 44, 67, 48, 38, 53, 69, 35, 56, 68, 51, 37, 71, 79, 74, 66, 57, 45, 82, 75, 79, 66, 75, 70, 56, 51, 56, 73, 44, 53, 54, 55, 65, 39, 72, 74, 60, 58, 51, 44, 45, 29, 36, 48, 78, 84, 46, 49, 48, 90, 45, 55, 26, 62, 79, 75, 76, 83, 58, 44, 64, 95, 74, 84, 64, 48, 76, 64, 37, 61, 57, 60, 85, 47, 38, 55, 91, 29, 69, 30, 42, 35, 51, 64, 82, 93, 77, 66, 77, 47, 85, 54, 55, 48, 45, 38, 65, 39, 79, 60, 55, 78, 52, 56, 40, 69, 59, 46, 76, 60, 64, 52, 40, 52, 55, 41, 78, 57, 73, 56, 95, 52, 47, 47, 40, 54, 57, 68, 80, 56, 57, 48, 72, 67, 45, 70, 60, 87, 57, 63, 37, 56, 65, 74], "checksum": 1794404};   // the 339 questions as they stood in 1.6.7

  const days = n => Array.from({ length: n }, (_, i) => dayKey(addDays(new Date(), i)));

  t('the original questions keep their slot and their wording', () => {
    ok(DEPTHS.length >= ORIGINAL.lens.length, `the bank shrank to ${DEPTHS.length}`);
    const wrong = [];
    let sum = 0;
    ORIGINAL.lens.forEach((n, i) => {
      const q = (DEPTHS[i] || [])[1] || '';
      if (q.length !== n) wrong.push('q' + i);
      for (let c = 0; c < q.length; c++) sum += q.charCodeAt(c);
    });
    eq(wrong.length, 0, `questions whose wording changed (${wrong.slice(0, 6).join(', ')}):`);
    eq(sum, ORIGINAL.checksum, 'the original questions, character for character:');
  });

  t('the new questions were added at the end, not slotted in', () => {
    ok(DEPTHS.length >= 429, `expected at least 429 questions, got ${DEPTHS.length}`);
    const added = DEPTHS.slice(ORIGINAL.lens.length);
    eq(added.length, DEPTHS.length - 339, 'count:');
    ok(added.length >= 90, `only ${added.length} new questions`);
    const strays = added.filter(r => NEW_THEMES.indexOf(r[0]) === -1).map(r => r[0]);
    eq(strays.length, 0, `new entries with an unexpected theme (${strays.slice(0, 4).join(', ')}):`);
    NEW_THEMES.forEach(th => ok(added.some(r => r[0] === th), `no ${th} questions were added`));
  });

  t('every theme in the bank has a name to show', () => {
    const missing = [...new Set(DEPTHS.map(r => r[0]))].filter(th => !THEME_LABEL[th]);
    eq(missing.length, 0, `themes with no label (${missing.join(', ')}):`);
  });

  t('every question in the bank still stands on its own', () => {
    const bad = [];
    DEPTHS.forEach((r, i) => {
      const q = r[1];
      if (/\b(he|him|his|she|her|hers)\b/i.test(q) && !/\b(God|Jesus|Christ|Lord)\b/.test(q)) bad.push('q' + i + ' unnamed pronoun');
      if (/^(and|but|so|or|then|also|plus|if so|if not)\b|^(why|how come)\s*\?/i.test(q.trim())) bad.push('q' + i + ' continuation');
      if (!/[?.]$/.test(q)) bad.push('q' + i + ' no end punctuation');
      if (q.split(/\s+/).length < 4) bad.push('q' + i + ' too short');
    });
    eq(bad.length, 0, `(${bad.slice(0, 5).join('; ')}):`);
  });

  t('no two questions in the bank are the same', () => {
    const seen = new Map(), dupes = [];
    DEPTHS.forEach((r, i) => {
      const k = r[1].toLowerCase();
      if (seen.has(k)) dupes.push('q' + i + ' repeats q' + seen.get(k)); else seen.set(k, i);
    });
    eq(dupes.length, 0, `(${dupes.slice(0, 4).join('; ')}):`);
  });

  t('no day ever asks more than one question that looks back', () => {
    const bad = days(400).map(d => [d, depthsFor(d).filter(q => BACK.indexOf(q.theme) >= 0).length])
      .filter(([, n]) => n > 1);
    eq(bad.length, 0, `days with more than one (${bad.slice(0, 3).map(b => b[0] + ': ' + b[1]).join(', ')}):`);
  });

  t('every day asks at least one about healing or what comes next', () => {
    const bad = days(400).filter(d => !depthsFor(d).some(q => FWD.indexOf(q.theme) >= 0));
    eq(bad.length, 0, `days without one (${bad.slice(0, 3).join(', ')}):`);
  });

  t('a day never asks the same question twice', () => {
    const bad = days(400).filter(d => { const ids = depthsFor(d).map(q => q.id); return new Set(ids).size !== ids.length; });
    eq(bad.length, 0, `days with a repeat (${bad.slice(0, 3).join(', ')}):`);
  });

  t('nothing is stranded: every question still comes round', () => {
    const seen = new Set();
    let firstFull = null;
    for (let i = 0; i < 900 && !firstFull; i++) {
      depthsFor(dayKey(addDays(new Date(), i))).forEach(q => seen.add(q.id));
      if (seen.size === DEPTHS.length) firstFull = i + 1;
    }
    ok(firstFull, `${DEPTHS.length - seen.size} questions never came up in 900 days`);
    ok(firstFull <= 600, `every question should come round inside 600 days, took ${firstFull}`);
  });

  t('the balance actually shifted toward now and forward', () => {
    let slots = 0, back = 0, fwd = 0, fresh = 0;
    for (const d of days(84)) {
      const qs = depthsFor(d);
      slots += qs.length;
      back += qs.filter(q => BACK.indexOf(q.theme) >= 0).length;
      fwd  += qs.filter(q => FWD.indexOf(q.theme) >= 0).length;
      fresh += qs.filter(q => Number(q.id.slice(1)) >= 339).length;
    }
    ok(back / slots <= 0.15, `looking back should be at most 15% of 12 weeks, got ${Math.round(back / slots * 100)}%`);
    ok(fwd / slots >= 0.45, `healing and forward should be at least 45%, got ${Math.round(fwd / slots * 100)}%`);
    ok(fresh / slots >= 0.2, `the new questions should be at least 20% of what is asked, got ${Math.round(fresh / slots * 100)}%`);
  });

  t('a day already answered keeps the questions it was answered under', () => {
    const KEY = STORAGE_KEY;
    ['stillwater_wal', KEY+'_hwm', KEY+'_prev'].forEach(k => localStorage.removeItem(k));
    localStorage.setItem(KEY, JSON.stringify({thoughts:[],grievances:[],journals:[],daily:{},checkins:[],deleted:{}}));
    state.thoughts=[]; state.grievances=[]; state.journals=[]; state.deleted={}; state.daily={}; state.checkins=[];
    hasLoadedFromCloud = true; currentUser = null;
    const day = '2026-09-20';
    const dp = [
      { id: 'q250', theme: 'betrayal', q: 'A QUESTION ANSWERED BACK THEN', a: 'what I wrote at the time' },
      { id: 'q11',  theme: 'self',     q: 'ANOTHER ONE FROM BACK THEN',   a: 'and this' },
    ];
    state.daily[day] = { d: day, ci: {}, sc: { done: false, note: '' }, rf: { bother: '', opposite: '' }, dp: JSON.parse(JSON.stringify(dp)), ts: 1 };
    state.mode = 'daily'; renderDaily(day);
    eq(JSON.stringify(state.daily[day].dp), JSON.stringify(dp), 'the day it was answered under:');
    const shown = [...document.querySelectorAll('.depth-card .depth-q')].map(n => n.textContent);
    ok(shown.includes('A QUESTION ANSWERED BACK THEN') && shown.includes('ANOTHER ONE FROM BACK THEN'), 'and that is what shows');
    renderDaily();
  });

  async function runAll9() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll9 = runAll9;
})();
