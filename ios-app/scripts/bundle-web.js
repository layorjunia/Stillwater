/* Copies the single-file web app + vendored Firebase SDK into www/
   so Capacitor can bundle them into the iOS app for offline launch. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const www  = path.resolve(__dirname, '..', 'www');

fs.mkdirSync(path.join(www, 'vendor'), { recursive: true });

// The app itself becomes index.html inside the bundle.
let html = fs.readFileSync(path.join(root, 'Stillwater.html'), 'utf8');
fs.writeFileSync(path.join(www, 'index.html'), html);

for (const f of fs.readdirSync(path.join(root, 'vendor'))) {
  fs.copyFileSync(path.join(root, 'vendor', f), path.join(www, 'vendor', f));
}

console.log('bundled www/index.html (' + (html.length / 1024).toFixed(0) + ' KB) + vendor/');
