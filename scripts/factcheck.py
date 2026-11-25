#!/usr/bin/env python3
"""First-pass fact check of the written lessons against Wikipedia.

    python3 scripts/factcheck.py [lessons-dir-glob-or-file ...]    (default: every lesson in scripts/learn-src/lessons)

For each lesson it finds the best-matching Wikipedia articles (a search on the title plus the first named author or body in its source), reads their text,
and looks for every year, percentage, quantity and big number the lesson states. A number the articles never mention is FLAGGED, to be checked by hand
(a flag is a hint, not a verdict: Wikipedia does not cover every study, and a rounded number can differ in form). It never edits a lesson.

    build/tmp/wiki-cache/   one file per request, so a rerun is free
    build/tmp/factcheck.json  the flags, lesson by lesson

Only the lesson's title and source go out in a request, never anything personal.
"""
import glob, json, os, re, sys, time, urllib.parse, urllib.request, hashlib, threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'build', 'tmp', 'wiki-cache')
os.makedirs(CACHE, exist_ok=True)
UA = 'StillwaterFactCheck/1.0 (personal study app; fact-checking its own lessons)'
LOCK = threading.Lock()
LAST = [0.0]


def get(url):
    key = os.path.join(CACHE, hashlib.sha1(url.encode()).hexdigest() + '.json')
    if os.path.exists(key):
        return json.load(open(key, encoding='utf-8'))
    for attempt in range(8):
        with LOCK:                                  # one request at a time, a little under two a second: Wikipedia asks bots to be gentle
            wait = 0.7 - (time.time() - LAST[0])
            if wait > 0: time.sleep(wait)
            LAST[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            data = json.load(urllib.request.urlopen(req, timeout=25))
            json.dump(data, open(key, 'w', encoding='utf-8'))
            return data
        except urllib.error.HTTPError as e:
            time.sleep(45 if e.code == 429 else 3 * (attempt + 1))
        except Exception:
            time.sleep(3 * (attempt + 1))
    return {}


def search(q):
    u = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 4, 'format': 'json'})
    return [r['title'] for r in get(u).get('query', {}).get('search', [])]


def extract(title):
    u = 'https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'prop': 'extracts', 'explaintext': 1, 'exlimit': 1, 'titles': title, 'format': 'json', 'redirects': 1})
    pages = get(u).get('query', {}).get('pages', {})
    for p in pages.values():
        return p.get('extract', '') or ''
    return ''


def parse_lessons(path):
    out, series, src, cur, paras, buf = [], None, None, None, [], []
    def flush():
        nonlocal buf
        if buf: paras.append(' '.join(buf)); buf = []
    for raw in open(path, encoding='utf-8').read().split('\n'):
        l = raw.rstrip()
        if l.startswith('# '):
            flush()
            if cur is not None: cur['body'] = ' '.join(paras)
            paras.clear(); cur = {'title': l[2:].strip(), 'src': src, 'file': os.path.basename(path)}; out.append(cur); continue
        if l.startswith('@'):
            k, _, v = l[1:].partition(' ')
            if k == 'src':
                if cur is not None and not paras and not buf: cur['src'] = v.strip()
                else: src = v.strip()
            continue
        if not l.strip(): flush(); continue
        if cur is not None: buf.append(l.strip())
    flush()
    if cur is not None: cur['body'] = ' '.join(paras)
    return out


NUM = re.compile(r'(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(percent|%|million|billion|trillion|thousand))?', re.I)
WORDNUM = {'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,'nine':9,'ten':10}


def claims(body):
    """Every number the lesson states, in a form we can look for."""
    out = []
    for m in NUM.finditer(body):
        raw, unit = m.group(1), (m.group(2) or '').lower()
        plain = raw.replace(',', '')
        try: val = float(plain)
        except ValueError: continue
        if val < 10 and not unit and '.' not in plain: continue         # small counts ("two groups") are too common to check
        out.append((m.group(0).strip(), plain, unit, val))
    seen, res = set(), []
    for c in out:
        if c[0] not in seen: seen.add(c[0]); res.append(c)
    return res


def found(c, text, tnorm):
    disp, plain, unit, val = c
    cands = {plain}
    if '.' in plain and plain.endswith('0'): cands.add(plain.rstrip('0').rstrip('.'))
    if val >= 1000 and float(val).is_integer(): cands.add('{:,}'.format(int(val)))
    if unit in ('percent', '%'): cands |= {plain + '%', plain + ' percent', plain + ' per cent'}
    if unit in ('million', 'billion', 'trillion', 'thousand'): cands |= {plain + ' ' + unit, plain + unit[0]}
    return any(x in text or x in tnorm for x in cands)


def check(lesson):
    q = lesson['title'] + ' ' + re.split(r'[;,(]', lesson['src'] or '')[0]
    q = re.sub(r'[:–\-]', ' ', q)[:140]
    titles = search(q)[:3]
    if not titles:
        titles = search(lesson['title'])[:3]
    texts = [extract(t) for t in titles]
    full = '\n'.join(texts)
    tnorm = re.sub(r'(?<=\d),(?=\d)', '', full)
    miss = [c[0] for c in claims(lesson['body']) if not found(c, full, tnorm)]
    return {'title': lesson['title'], 'file': lesson['file'], 'pages': titles, 'n': len(claims(lesson['body'])), 'unmatched': miss}


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, 'scripts', 'learn-src', 'lessons', '*.md')))
    lessons = [l for f in files for l in parse_lessons(f)]
    print('lessons:', len(lessons), file=sys.stderr)
    results = []
    with ThreadPoolExecutor(1) as ex:
        for i, r in enumerate(ex.map(check, lessons)):
            results.append(r)
            if i % 100 == 99: print(i + 1, 'done', file=sys.stderr)
    json.dump(results, open(os.path.join(ROOT, 'build', 'tmp', 'factcheck.json'), 'w', encoding='utf-8'), indent=1)
    flagged = [r for r in results if r['unmatched']]
    print('checked %d lessons, %d numbers claimed, %d flagged lessons' % (len(results), sum(r['n'] for r in results), len(flagged)))


if __name__ == '__main__':
    main()
