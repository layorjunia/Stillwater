/* Round 8 — updates. Same contract: runAll8().

   Right after a release the version manifest can be new while the page itself
   is still the old one for a few seconds. An update that caches that old page
   under the new version number runs old code while claiming to be current, and
   never downloads the real update. And the version shown must be the one
   actually running. */
(function () {
  const T = [];
  const t = (n, f) => T.push({ name: n, fn: f });
  const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy'); };
  const eq = (a, b, m) => { if (a !== b) throw new Error(`${m||''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
  const KEYS = ['sw_update_html', 'sw_update_version', 'sw_boot_attempt_9.9.9'];

  async function withServer(manifestVersion, pageVersion, fn) {
    const saved = KEYS.map(k => [k, localStorage.getItem(k)]);
    KEYS.forEach(k => localStorage.removeItem(k));
    const realFetch = window.fetch;
    window.fetch = async (url) => {
      const u = String(url);
      if (u.includes('/version.json')) return new Response(JSON.stringify({ version: manifestVersion }), { status: 200 });
      if (u.includes('/Stillwater.html')) return new Response(
        `<html><div id="daily-view"></div><script>const APP_VERSION = "${pageVersion}";<\/script></html>`, { status: 200 });
      return realFetch(url);
    };
    try { return await fn(); }
    finally {
      window.fetch = realFetch;
      KEYS.forEach(k => localStorage.removeItem(k));
      saved.forEach(([k, v]) => { if (v !== null) localStorage.setItem(k, v); });
    }
  }

  t('a page that is still the old version is never cached as the new one', async () => {
    await withServer('9.9.9', APP_VERSION, async () => {
      const got = await checkForUpdate(false);
      eq(got, false, 'update accepted:');
      eq(localStorage.getItem('sw_update_version'), null, 'version recorded:');
      eq(localStorage.getItem('sw_update_html'), null, 'page cached:');
    });
  });

  t('a page that is the new version is cached and offered', async () => {
    await withServer('9.9.9', '9.9.9', async () => {
      const got = await checkForUpdate(false);
      eq(got, true, 'update accepted:');
      eq(localStorage.getItem('sw_update_version'), '9.9.9', 'version recorded:');
      ok((localStorage.getItem('sw_update_html') || '').includes('const APP_VERSION = "9.9.9"'), 'the right page cached');
    });
  });

  t('the version shown is the one running; a downloaded update shows on the button', () => {
    const had = localStorage.getItem('sw_update_version');
    const btn = document.getElementById('update-btn');
    const btnText = btn.textContent, btnReady = btn.classList.contains('ready');
    try {
      localStorage.setItem('sw_update_version', '9.9.9');
      setUpdateBadge('9.9.9');
      ok(document.getElementById('version-line').textContent.startsWith('v' + APP_VERSION),
        'version line must show the running v' + APP_VERSION + ', got "' + document.getElementById('version-line').textContent + '"');
      eq(btn.textContent, 'Restart for v9.9.9', 'button:');
    } finally {
      if (had === null) localStorage.removeItem('sw_update_version'); else localStorage.setItem('sw_update_version', had);
      btn.textContent = btnText; btn.classList.toggle('ready', btnReady);
      setUpdateBadge(null);
    }
  });

  async function runAll8() {
    const fail = []; let passed = 0;
    for (const { name, fn } of T) {
      try { await fn(); passed++; }
      catch (e) { fail.push(name + ' — ' + e.message); }
    }
    return { total: T.length, passed, failed: fail.length, failures: fail };
  }
  window.runAll8 = runAll8;
})();
