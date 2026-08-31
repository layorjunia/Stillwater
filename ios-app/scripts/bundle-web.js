/* Copies the web app + vendored Firebase SDK into www/ for the iOS bundle.

   index.html is the LOADER, not the app. The app is app.html. They must stay
   separate: the loader replaces the document with whichever build should run,
   and doing that from inside the app file appends instead of replacing, which
   leaves two copies of the entire app (and two copies of the Firebase SDK) in
   one page. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const www  = path.resolve(__dirname, '..', 'www');

fs.mkdirSync(path.join(www, 'vendor'), { recursive: true });

const app    = fs.readFileSync(path.join(root, 'Stillwater.html'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'loader.html'), 'utf8');

// Keep the loader's BUNDLED constant in step with the app it ships alongside,
// or a stale cached build could outrank the one baked into the binary.
const appVer    = /const APP_VERSION = "([\d.]+)"/.exec(app);
const loaderVer = /var BUNDLED = "([\d.]+)"/.exec(loader);
if (!appVer || !loaderVer) throw new Error('could not read versions');
if (appVer[1] !== loaderVer[1]) {
  throw new Error(`version mismatch: app is ${appVer[1]}, loader says ${loaderVer[1]}`);
}

fs.writeFileSync(path.join(www, 'app.html'), app);
fs.writeFileSync(path.join(www, 'index.html'), loader);

for (const f of fs.readdirSync(path.join(root, 'vendor'))) {
  fs.copyFileSync(path.join(root, 'vendor', f), path.join(www, 'vendor', f));
}

console.log(`bundled www/index.html (loader) + www/app.html (v${appVer[1]}, ` +
            `${(app.length / 1024).toFixed(0)} KB) + vendor/`);
