#!/usr/bin/env python3
"""Turn a device snapshot (backups/device-snapshot-*) into files the tests can load.

    python3 scripts/extract-snapshot.py backups/device-snapshot-YYYYMMDD-HHMMSS

Reads the app's localStorage straight out of the WebKit database in the snapshot and writes, next to it:
  importable-backup.json   {"format":"stillwater-backup", ...} the stored data, ready for Import or the tests
  high-water-mark.json, keystroke-log.json, checkin-keystroke-log.json, undo-stash.json   when present
Prints COUNTS only. His writing never goes to the terminal.
"""
import json, os, sqlite3, sys

def find(root):
    for dp, _, fs in os.walk(root):
        if 'localstorage.sqlite3' in fs:
            return os.path.join(dp, 'localstorage.sqlite3')
    sys.exit('no localstorage.sqlite3 under ' + root)

def decode(v):
    if isinstance(v, str): return v
    for enc in ('utf-16-le', 'utf-8'):
        try:
            s = v.decode(enc)
            json.loads(s); return s
        except Exception:
            continue
    return None

root = sys.argv[1]
con = sqlite3.connect('file:' + find(root) + '?mode=ro', uri=True)
rows = {k: decode(v) for k, v in con.execute('select key, value from ItemTable')}
want = {'stillwater_v4': 'importable-backup.json', 'stillwater_v4_hwm': 'high-water-mark.json',
        'stillwater_wal': 'keystroke-log.json', 'stillwater_wal_checkins': 'checkin-keystroke-log.json',
        'stillwater_v4_prev': 'undo-stash.json'}
for key, name in want.items():
    raw = rows.get(key)
    if not raw: continue
    data = json.loads(raw)
    if key == 'stillwater_v4':
        data = dict({'format': 'stillwater-backup', 'version': 1}, **data)
    json.dump(data, open(os.path.join(root, name), 'w'), indent=1)
    if key == 'stillwater_v4':
        n = lambda k: len(data.get(k) or [])
        print('stored data: %d journals, %d days, %d check-ins, %d thought webs, %d grievances, %d deleted, %d mind'
              % (n('journals'), len(data.get('daily') or {}), n('checkins'), n('thoughts'), n('grievances'),
                 len(data.get('deleted') or {}), n('mind')))
    print('wrote', name)
