/* A faithful in-memory Firestore for the tests, plus helpers for the encryption.

   Earlier tests used a stub that accepted anything, which hid for a month a value
   real Firestore rejects. This one enforces what Firestore enforces — 1 MiB per
   document, no undefined, no nested arrays, nesting depth, per-string size — and
   behaves like it: set() replaces, set({merge:true}) merges maps and replaces
   arrays, get({source:'server'}) fails when offline. It can also ignore a write,
   corrupt one, or fail one, to prove the app copes. */
(function () {
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const utf8 = s => new TextEncoder().encode(s).length;
  // Written independently of the app's own pre-flight, so the two cross-check each other.
  function problem(v, depth, inArray) {
    if (v === undefined) return 'undefined value';
    if (Array.isArray(v)) {
      if (inArray) return 'nested array';
      for (const x of v) { const p = problem(x, depth + 1, true); if (p) return p; }
      return '';
    }
    if (v && typeof v === 'object') {
      if (depth > 20) return 'nesting too deep';
      for (const [k, x] of Object.entries(v)) {
        if (!k) return 'empty field name';
        const p = problem(x, depth + 1, false); if (p) return p;
      }
      return '';
    }
    if (typeof v === 'string' && utf8(v) > 1048487) return 'string over 1 MB';
    return '';
  }
  function docProblem(doc) {
    const p = problem(doc, 1, false); if (p) return p;
    if (utf8(JSON.stringify(doc)) > 1048576) return 'document over 1 MiB';
    return '';
  }
  function deepMerge(a, b) {
    const out = Object.assign({}, a);
    for (const [k, v] of Object.entries(b)) {
      const isMap = x => x && typeof x === 'object' && !Array.isArray(x);
      out[k] = (isMap(v) && isMap(out[k])) ? deepMerge(out[k], v) : clone(v);
    }
    return out;
  }

  class FakeCloud {
    constructor(initial) {
      this.docs = new Map(); this.log = [];
      this.online = true; this.dropWrites = false; this.corruptNext = false; this.failSets = 0; this.onWrite = null;
      for (const [p, d] of Object.entries(initial || {})) this.docs.set(p, clone(d));
    }
    peek(path) { const d = this.docs.get(path || 'users/u'); return d ? clone(d) : null; }
    text() { return JSON.stringify([...this.docs.values()]); }
    sets() { return this.log.filter(e => e.op === 'set'); }
    ref(path) {
      const self = this;
      return {
        async get(opts) {
          const server = !!(opts && opts.source === 'server');
          self.log.push({ op: 'get', path, server });
          if (server && !self.online) { const e = new Error('offline'); e.code = 'unavailable'; throw e; }
          const d = self.docs.get(path);
          return { exists: !!d, data: () => clone(d), metadata: { fromCache: !self.online } };
        },
        async set(data, opts) {
          const merge = !!(opts && opts.merge);
          const bad = docProblem(data);
          if (bad) { const e = new Error('Firestore rejected the write: ' + bad); e.code = 'invalid-argument'; throw e; }
          if (!self.online) { const e = new Error('offline'); e.code = 'unavailable'; throw e; }
          if (self.failSets > 0) { self.failSets--; const e = new Error('denied'); e.code = 'permission-denied'; throw e; }
          self.log.push({ op: 'set', path, merge, fields: Object.keys(data), data: clone(data) });
          if (self.dropWrites) return;                       // the server says yes and keeps nothing
          const prior = self.docs.get(path);
          const next = (merge && prior) ? deepMerge(prior, data) : clone(data);
          if (self.corruptNext && next.enc) {                // the copy is damaged on its way in
            self.corruptNext = false;
            const parts = next.enc.parts.slice();
            parts[0] = (parts[0][0] === 'A' ? 'B' : 'A') + parts[0].slice(1);
            next.enc = Object.assign({}, next.enc, { parts });
          }
          self.docs.set(path, next);
          if (self.onWrite) await self.onWrite(clone(data));
        },
      };
    }
    /** Point the app at this cloud. Returns the function that puts the real one back. */
    install() {
      const orig = fbDb.collection, self = this;
      fbDb.collection = (c) => ({ doc: (id) => self.ref(c + '/' + id) });
      return () => { fbDb.collection = orig; };
    }
  }

  window.__E2EE_DEFAULT_ITER = e2ee.iter;      // the app's real setting, before any test lowers it
  e2ee.prompted = true;                        // no test run ever leaves a PIN prompt over the page
  function resetE2ee(pin) {
    e2ee.key = null; e2ee.keyBytes = null; e2ee.uid = null; e2ee.salt = null; e2ee.iterUsed = 0;
    e2ee.seenRev = 0; e2ee.seenStray = false; e2ee.conflict = false;
    e2ee.prompted = true;                // tests never leave a PIN prompt over the page
    e2ee.iter = 1500;                    // fast; the real strength is checked separately
    e2ee.chain = Promise.resolve();
    sessionPin = (pin === undefined) ? null : pin;
    try { localStorage.removeItem('sw_e2ee_key'); } catch (e) {}
  }
  /** What a written document holds, in the clear — decrypting with the key in use. */
  async function readable(written) {
    if (written && written.enc) return (await e2eeDecrypt(written.enc, e2ee.key)).data;
    return written;
  }
  /** A ready-made encrypted cloud document, as another device (or an earlier session) would have left it. */
  async function sealedDoc(payload, pin, rev) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iter = 1500;
    const kb = await e2eeDeriveBytes(pin, salt, iter), key = await e2eeImport(kb);
    const sealed = await e2eeEncrypt(payload, key, b64enc(salt), iter);
    return { doc: { enc: sealed.env, rev: rev || 1, updatedAt: Date.now() }, key, keyBytes: kb, salt: b64enc(salt), iter };
  }
  window.TestCloud = { FakeCloud, resetE2ee, readable, sealedDoc, docProblem, clone };
})();
