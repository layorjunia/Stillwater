#!/usr/bin/env python3 -I
"""Build the Study tab's per-chapter content into study/ (served by the site, fetched on demand by the app).

    python3 -I scripts/build-study-content.py

Sources, all on this Mac and all Jacob's own or public domain:
  Matthew Henry's Commentary on the Whole Bible (CCEL, public domain)   Walk the Stories/Data/_raw/ccel/henry-mhc1..6.xml
  The Bible stories written for Walk the Stories                        Walk the Stories/Content/worlds/bible/src/pieces/*.json
  Walk the Stories' journeys (Abraham, David, Paul ...)                 .../src/trails/*.json

Per chapter it keeps, in this order of use:
  o  Henry's overview of the chapter        u  Henry's outline of it ("We have three things in this chapter")
  s  the story's title                      i  one sentence of what the story is about
  q  reflection questions                   p  a prayer          l  one thing to carry into today
  h  the id of the chapter in Henry's text on ccel.org
Prints counts only. Run it again to rebuild; the output is deterministic.
"""
import glob, html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WTS = os.path.join(os.path.dirname(ROOT), 'Walk the Stories')
HENRY = os.path.join(WTS, 'Data', '_raw', 'ccel')
PIECES = os.path.join(WTS, 'Content', 'worlds', 'bible', 'src', 'pieces')
TRAILS = os.path.join(WTS, 'Content', 'worlds', 'bible', 'src', 'trails')
OUT = os.path.join(ROOT, 'study')

# code (as the stories write it), name, chapters, volume, title in Henry's text
BOOKS = [
    ('GEN', 'Genesis', 50, 1, 'Genesis'), ('EXO', 'Exodus', 40, 1, 'Exodus'), ('LEV', 'Leviticus', 27, 1, 'Leviticus'),
    ('NUM', 'Numbers', 36, 1, 'Numbers'), ('DEU', 'Deuteronomy', 34, 1, 'Deuteronomy'),
    ('JOS', 'Joshua', 24, 2, 'Joshua'), ('JDG', 'Judges', 21, 2, 'Judges'), ('RUT', 'Ruth', 4, 2, 'Ruth'),
    ('1SA', '1 Samuel', 31, 2, 'First Samuel'), ('2SA', '2 Samuel', 24, 2, 'Second Samuel'),
    ('1KI', '1 Kings', 22, 2, 'First Kings'), ('2KI', '2 Kings', 25, 2, 'Second Kings'),
    ('1CH', '1 Chronicles', 29, 2, 'First Chronicles'), ('2CH', '2 Chronicles', 36, 2, 'Second Chronicles'),
    ('EZR', 'Ezra', 10, 2, 'Ezra'), ('NEH', 'Nehemiah', 13, 2, 'Nehemiah'), ('EST', 'Esther', 10, 2, 'Esther'),
    ('JOB', 'Job', 42, 3, 'Job'), ('PSA', 'Psalms', 150, 3, 'Psalms'), ('PRO', 'Proverbs', 31, 3, 'Proverbs'),
    ('ECC', 'Ecclesiastes', 12, 3, 'Ecclesiastes'), ('SNG', 'Song of Solomon', 8, 3, 'Song of Solomon'),
    ('ISA', 'Isaiah', 66, 4, 'Isaiah'), ('JER', 'Jeremiah', 52, 4, 'Jeremiah'), ('LAM', 'Lamentations', 5, 4, 'Lamentations'),
    ('EZK', 'Ezekiel', 48, 4, 'Ezekiel'), ('DAN', 'Daniel', 12, 4, 'Daniel'), ('HOS', 'Hosea', 14, 4, 'Hosea'),
    ('JOL', 'Joel', 3, 4, 'Joel'), ('AMO', 'Amos', 9, 4, 'Amos'), ('OBA', 'Obadiah', 1, 4, 'Obadiah'),
    ('JON', 'Jonah', 4, 4, 'Jonah'), ('MIC', 'Micah', 7, 4, 'Micah'), ('NAM', 'Nahum', 3, 4, 'Nahum'),
    ('HAB', 'Habakkuk', 3, 4, 'Habakkuk'), ('ZEP', 'Zephaniah', 3, 4, 'Zephaniah'), ('HAG', 'Haggai', 2, 4, 'Haggai'),
    ('ZEC', 'Zechariah', 14, 4, 'Zechariah'), ('MAL', 'Malachi', 4, 4, 'Malachi'),
    ('MAT', 'Matthew', 28, 5, 'Matthew'), ('MRK', 'Mark', 16, 5, 'Mark'), ('LUK', 'Luke', 24, 5, 'Luke'),
    ('JHN', 'John', 21, 5, 'John'),
    ('ACT', 'Acts', 28, 6, 'Acts'), ('ROM', 'Romans', 16, 6, 'Romans'), ('1CO', '1 Corinthians', 16, 6, 'First Corinthians'),
    ('2CO', '2 Corinthians', 13, 6, 'Second Corinthians'), ('GAL', 'Galatians', 6, 6, 'Galatians'),
    ('EPH', 'Ephesians', 6, 6, 'Ephesians'), ('PHP', 'Philippians', 4, 6, 'Philippians'), ('COL', 'Colossians', 4, 6, 'Colossians'),
    ('1TH', '1 Thessalonians', 5, 6, 'First Thessalonians'), ('2TH', '2 Thessalonians', 3, 6, 'Second Thessalonians'),
    ('1TI', '1 Timothy', 6, 6, 'First Timothy'), ('2TI', '2 Timothy', 4, 6, 'Second Timothy'), ('TIT', 'Titus', 3, 6, 'Titus'),
    ('PHM', 'Philemon', 1, 6, 'Philemon'), ('HEB', 'Hebrews', 13, 6, 'Hebrews'), ('JAS', 'James', 5, 6, 'James'),
    ('1PE', '1 Peter', 5, 6, 'First Peter'), ('2PE', '2 Peter', 3, 6, 'Second Peter'),
    ('1JN', '1 John', 5, 6, 'First John'), ('2JN', '2 John', 1, 6, 'Second John'), ('3JN', '3 John', 1, 6, 'Third John'),
    ('JUD', 'Jude', 1, 6, 'Jude'), ('REV', 'Revelation', 22, 6, 'Revelation'),
]
assert len(BOOKS) == 66 and sum(b[2] for b in BOOKS) == 1189


def attrs(tag):
    return dict(re.findall(r'([\w-]+)="([^"]*)"', tag))


def clean(frag):
    t = re.sub(r'<scripRef[^>]*>(.*?)</scripRef>', r'\1', frag, flags=re.S)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def cut(text, limit):
    """Trim to a whole sentence at or under limit characters."""
    if len(text) <= limit:
        return text
    window = text[:limit]
    ends = [m.end() for m in re.finditer(r'[.!?”"](?=\s|$)', window)]
    # a sentence end, not an abbreviation or a verse reference such as "xxxv. 10"
    ends = [e for e in ends if e > limit * 0.45]
    if ends:
        return window[:ends[-1]].strip()
    return window.rsplit(' ', 1)[0].rstrip(',;:—-') + '…'


def henry_chapters():
    """{(code, chapter): {'o':..., 'u':..., 'h': 'mhc1.Gen.ii'}}"""
    out, problems = {}, []
    for vol in range(1, 7):
        s = open(os.path.join(HENRY, f'henry-mhc{vol}.xml'), encoding='utf-8', errors='replace').read()
        # split into div1 books, then div2 chapters
        starts = [(m.start(), attrs(m.group(0))) for m in re.finditer(r'<div1\b[^>]*>', s)]
        for k, (pos, a) in enumerate(starts):
            end = starts[k + 1][0] if k + 1 < len(starts) else len(s)
            title = a.get('title', '')
            book = next((b for b in BOOKS if b[3] == vol and b[4] == title), None)
            if not book:
                continue
            body = s[pos:end]
            d2 = [(m.start(), attrs(m.group(0))) for m in re.finditer(r'<div2\b[^>]*>', body)]
            chapters = [(p, at) for p, at in d2 if not at.get('title', '').lower().startswith('intro')]
            if len(chapters) != book[2]:
                problems.append(f'{book[1]}: Henry has {len(chapters)} chapters, expected {book[2]}')
            for n, (p, at) in enumerate(chapters, 1):
                e = d2[[x[0] for x in d2].index(p) + 1][0] if [x[0] for x in d2].index(p) + 1 < len(d2) else len(body)
                chap = body[p:e]
                intros = [clean(m.group(1)) for m in re.finditer(r'<p class="intro"[^>]*>(.*?)</p>', chap, re.S)]
                intros = [t for t in intros if len(t) > 40]
                o = u = ''
                if intros:
                    o = intros[0]
                    outline = next((t for t in intros[1:] if re.search(r'\b(in this chapter|we have|here (is|are))\b', t[:220], re.I)), '')
                    if not outline and len(intros) > 1:
                        outline = intros[1]
                    u = outline
                out[(book[0], n)] = {'o': cut(o, 520), 'u': cut(u, 600), 'h': f'mhc{vol}.{at.get("id", "")}'}
    return out, problems


def stories():
    """{(code, chapter): story fields}, taking the story that starts earliest in the chapter."""
    best = {}
    for f in sorted(glob.glob(os.path.join(PIECES, '*.json'))):
        d = json.load(open(f))
        for part in d.get('parts', []):
            for ref in part.get('refs', []):
                m = re.match(r'^(\w{3}) (\d+):(\d+)', ref)
                if not m:
                    continue
                key = (m.group(1), int(m.group(2)))
                verse = int(m.group(3))
                ad, kid = part.get('adult') or {}, part.get('kid') or {}
                rec = {'verse': verse, 'id': d.get('story'), 's': part.get('title', ''), 'i': (ad.get('intro') or '').strip(),
                       'q': [x.strip() for x in (ad.get('reflect') or []) if x.strip()][:2],
                       'p': (ad.get('prayer') or '').strip(), 'l': (kid.get('liveIt') or '').strip()}
                if key not in best or verse < best[key]['verse']:
                    best[key] = rec
    return best


def main():
    os.makedirs(OUT, exist_ok=True)
    for old in glob.glob(os.path.join(OUT, '*.json')):
        os.remove(old)
    henry, problems = henry_chapters()
    story = stories()
    index, total_bytes, with_story, with_henry = [], 0, 0, 0
    for code, name, count, vol, _ in BOOKS:
        book = {}
        for n in range(1, count + 1):
            h = henry.get((code, n), {})
            st = story.get((code, n))
            rec = {}
            if h.get('o'): rec['o'] = h['o']; with_henry += 1
            if h.get('u'): rec['u'] = h['u']
            if h.get('h'): rec['h'] = h['h']
            if st:
                with_story += 1
                for k in ('s', 'i', 'p', 'l'):
                    if st[k]: rec[k] = st[k]
                if st['q']: rec['q'] = st['q']
            if rec:
                book[str(n)] = rec
        path = os.path.join(OUT, code + '.json')
        data = json.dumps(book, ensure_ascii=False, separators=(',', ':'))
        open(path, 'w', encoding='utf-8').write(data)
        total_bytes += len(data.encode())
        index.append({'c': code, 'n': name, 'k': count, 'v': vol})

    # journeys: Walk the Stories' trails that follow a person or a period, as reading paths
    story_refs = {}
    for f in sorted(glob.glob(os.path.join(PIECES, '*.json'))):
        d = json.load(open(f))
        parts = d.get('parts', [])
        if parts and parts[0].get('refs'):
            story_refs[d['story']] = (parts[0]['refs'][0], parts[0].get('title', ''))
    journeys = []
    for f in sorted(glob.glob(os.path.join(TRAILS, '*.json'))):
        if os.path.basename(f).startswith('book-'):
            continue
        t = json.load(open(f))
        items, seen = [], set()
        for stop in t.get('stops', []):
            ids = []
            for key in ('stories', 'story', 'storyIds', 'items'):
                v = stop.get(key)
                if isinstance(v, list): ids += [x if isinstance(x, str) else (x.get('story') or x.get('id')) for x in v]
                elif isinstance(v, str): ids.append(v)
            for sid in ids:
                if sid in story_refs and sid not in seen:
                    seen.add(sid)
                    ref, title = story_refs[sid]
                    m = re.match(r'^(\w{3}) (\d+):?(\d+)?', ref)
                    items.append({'r': ref, 't': title})
        if items:
            journeys.append({'id': t['id'], 'n': t['name'], 'b': t.get('blurb', ''), 'i': items})
    json.dump({'books': index}, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'))
    json.dump(journeys, open(os.path.join(OUT, 'journeys.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    print(f'books written: {len(index)}   chapters: 1189   with Henry overview: {with_henry}   with a story: {with_story}')
    print(f'content: {total_bytes:,} bytes across 66 files; largest: ' +
          ', '.join(f'{os.path.basename(p)[:-5]} {os.path.getsize(p):,}' for p in sorted(glob.glob(os.path.join(OUT, '*.json')), key=os.path.getsize, reverse=True)[:3]))
    print(f'journeys: {len(journeys)} ({sum(len(j["i"]) for j in journeys)} passages)')
    for p in problems:
        print('PROBLEM', p)


if __name__ == '__main__':
    main()
