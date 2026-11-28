#!/usr/bin/env python3 -I
"""Build the Study tab's Seminary library into study/sem/ (served by the site, fetched on demand by the app).

    python3 -I scripts/build-seminary.py

Sources: scripts/seminary-src/*.md, written by hand as whole prose lessons (never stitched or generated from fields).
One file holds lessons for ONE course. Header lines first, then lessons:

    @course story                       the course (see COURSES below); a file with no @course is an error
    @conf debated                       optional default: debated (Christians differ here) | scholars (scholars differ) | nothing

    # Title of the lesson               2 to 60 characters; the id comes from the title unless @id is given
    @id some-fixed-id                   optional; use it for anything the page looks up by name (book-gen ... book-rev)
    @ref ROM 3:21-26; GAL 2:16          optional: key passages, shown at the end as links that open the Bible text inside the app
    @conf debated                       optional: this lesson's own label (use @conf none to clear the file's)
    @q A question to think about?       optional

    Paragraphs of prose, blank line between them. Inside a lesson:
    ## A short heading                  (book introductions and long lessons only)
    - a list item                       (consecutive lines make one list)

Checks, each fatal: ids unique and well formed; length (130 to 560 words); every paragraph a whole sentence or more; American spelling;
BC and AD (never BCE or CE); no em or en dashes; and EVERY Bible reference, in the text and in @ref, must exist in the Berean Standard Bible
text in study/bsb (a chapter or verse that is not there stops the build). A lesson id that was shipped before may not disappear (a retitled
lesson would lose his mark), unless this is run with --allow-drop. Quotation marks around six words or more that are NOT in the Bible text
are listed (not fatal) so each can be checked against its source. Prints counts and reading minutes only.
"""
import glob, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'seminary-src')
OUT = os.path.join(ROOT, 'study', 'sem')
BSB = os.path.join(ROOT, 'study', 'bsb')

# id, name, colour (all clear 4.5:1 on the dark cards). The ORDER is the order the daily lesson rotates through.
COURSES = [
    ('story', 'The story of the Bible', '#7FE3D4'),
    ('theo', 'Theology', '#F4D9A4'),
    ('books', 'Book by book', '#8FD0F0'),
    ('hist', 'Church history', '#F5A8C0'),
    ('jesus', 'Jesus', '#F2B365'),
    ('world', 'The world of the Bible', '#9FE49A'),
    ('read', 'How to read the Bible', '#BBA9F7'),
    ('canon', 'How we got the Bible', '#FF9E9E'),
    ('words', 'Words of the Bible', '#E3F28A'),
    ('faith', 'Living the faith', '#85E0A3'),
    ('defend', 'Hard questions', '#FFC2A1'),
    ('creeds', 'Creeds and councils', '#D9B38C'),
]
COURSE_IDS = [c[0] for c in COURSES]
CONFS = ('', 'debated', 'scholars')
# the book codes, in order, as the page writes them (the names are the ones used in the lessons)
BOOKS = [
    ('GEN', 'Genesis'), ('EXO', 'Exodus'), ('LEV', 'Leviticus'), ('NUM', 'Numbers'), ('DEU', 'Deuteronomy'), ('JOS', 'Joshua'),
    ('JDG', 'Judges'), ('RUT', 'Ruth'), ('1SA', '1 Samuel'), ('2SA', '2 Samuel'), ('1KI', '1 Kings'), ('2KI', '2 Kings'),
    ('1CH', '1 Chronicles'), ('2CH', '2 Chronicles'), ('EZR', 'Ezra'), ('NEH', 'Nehemiah'), ('EST', 'Esther'), ('JOB', 'Job'),
    ('PSA', 'Psalms'), ('PRO', 'Proverbs'), ('ECC', 'Ecclesiastes'), ('SNG', 'Song of Solomon'), ('ISA', 'Isaiah'),
    ('JER', 'Jeremiah'), ('LAM', 'Lamentations'), ('EZK', 'Ezekiel'), ('DAN', 'Daniel'), ('HOS', 'Hosea'), ('JOL', 'Joel'),
    ('AMO', 'Amos'), ('OBA', 'Obadiah'), ('JON', 'Jonah'), ('MIC', 'Micah'), ('NAM', 'Nahum'), ('HAB', 'Habakkuk'),
    ('ZEP', 'Zephaniah'), ('HAG', 'Haggai'), ('ZEC', 'Zechariah'), ('MAL', 'Malachi'), ('MAT', 'Matthew'), ('MRK', 'Mark'),
    ('LUK', 'Luke'), ('JHN', 'John'), ('ACT', 'Acts'), ('ROM', 'Romans'), ('1CO', '1 Corinthians'), ('2CO', '2 Corinthians'),
    ('GAL', 'Galatians'), ('EPH', 'Ephesians'), ('PHP', 'Philippians'), ('COL', 'Colossians'), ('1TH', '1 Thessalonians'),
    ('2TH', '2 Thessalonians'), ('1TI', '1 Timothy'), ('2TI', '2 Timothy'), ('TIT', 'Titus'), ('PHM', 'Philemon'), ('HEB', 'Hebrews'),
    ('JAS', 'James'), ('1PE', '1 Peter'), ('2PE', '2 Peter'), ('1JN', '1 John'), ('2JN', '2 John'), ('3JN', '3 John'), ('JUD', 'Jude'),
    ('REV', 'Revelation'),
]
assert len(BOOKS) == 66
NAME2CODE = {n: c for c, n in BOOKS}
NAME2CODE.update({'Psalm': 'PSA', 'Song of Songs': 'SNG'})
CODES = {c for c, _ in BOOKS}
# a reference in prose: "Romans 8:28", "1 Corinthians 15:3-8", "Psalm 23", "Genesis 1"
REF_NAMES = '|'.join(sorted((re.escape(n) for n in NAME2CODE), key=len, reverse=True))
REF_RE = re.compile(r'(?<![A-Za-z0-9])(' + REF_NAMES + r') (\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?(?![0-9]|:\d)')
BRITISH = re.compile(r"\b(?:colour|honour|favour|behaviour|neighbour|labour|flavour|humour|rumour|centre|metre|litre|theatre|fibre|analyse|paralyse|organise|recognise|realise|emphasise|summarise|memorise|criticise|apologise|specialise|categorise|minimise|maximise|generalise|centralise|standardise|characterise|normalise|visualise|utilise|catalogue|programme|defence|offence|licence|practise|grey|tyre|jewellery|ageing|artefact|aluminium|sulphur|mould|plough|cheque|catalyse|counselling|travelling|labelled|modelling|cancelled|signalling|fuelled|towards|whilst|amongst|learnt|spelt|burnt|dreamt|judgement|maths|mum|lorry|petrol|holiday|autumn|pounds?\s+sterling|saviour|honourable|sceptic|grey|baptise|christianise|evangelise|sanctuary-?\s*towards|manoeuvre|diarrhoea|foetus|mediaeval|pretence|cosy|woollen|plough)\b", re.I)

_bsb = {}


def bible(code):
    if code not in _bsb:
        with open(os.path.join(BSB, code + '.json'), encoding='utf-8') as f:
            _bsb[code] = json.load(f)
    return _bsb[code]


def norm(s):
    s = re.sub(r'[—–-]', ' ', s.lower().replace('’', "'").replace("'", ''))
    return re.sub(r'[^a-z0-9 ]', '', s).split()


_alltext = None


def all_bible_words():
    """The whole Bible as one normalized string, for finding quoted verses."""
    global _alltext
    if _alltext is None:
        parts = []
        for c in CODES:
            for ch in bible(c):
                parts.append(' '.join(' '.join(norm(v)) for v in ch if v))      # a chapter in one run, so a quote may cross a verse break
        _alltext = ' ' + ' | '.join(parts) + ' '
    return _alltext


def check_ref(code, ch, v1, v2):
    """None if the passage is in the BSB text, else why not."""
    b = bible(code)
    if not 1 <= ch <= len(b):
        return 'no chapter %d' % ch
    last = len(b[ch - 1])
    if v1:
        if not 1 <= v1 <= last:
            return 'no verse %d (chapter has %d)' % (v1, last)
        if v2 and not v1 <= v2 <= last:
            return 'bad verse range to %d (chapter has %d)' % (v2, last)
    return None


def parse_ref(text):
    """"ROM 3:21-26" (the page's own codes) or "Romans 3:21-26" -> (code, chapter, v1, v2); v1 = 0 is the whole chapter."""
    t = text.strip()
    m = re.fullmatch(r'([1-3]?[A-Z]{2,3}) (\d{1,3})(?::(\d{1,3})(?:-(\d{1,3}))?)?', t)
    if m and m.group(1) in CODES:
        return m.group(1), int(m.group(2)), int(m.group(3) or 0), int(m.group(4) or 0)
    m = REF_RE.fullmatch(t)
    if not m:
        return None
    return NAME2CODE[m.group(1)], int(m.group(2)), int(m.group(3) or 0), int(m.group(4) or 0)


def words(s):
    return len(s.split())


def slug(t):
    s = re.sub(r'[^a-z0-9]+', '-', t.lower().replace("'", '').replace('’', '')).strip('-')
    return s


def parse(path):
    """-> (course, [lesson dicts]) from one source file."""
    course, dconf, lessons, cur = None, '', [], None
    with open(path, encoding='utf-8') as f:
        lines = f.read().split('\n')
    def finish():
        nonlocal cur
        if cur:
            lessons.append(cur)
            cur = None
    for n, raw in enumerate(lines, 1):
        line = raw.rstrip()
        if line.startswith('# '):
            finish()
            cur = {'title': line[2:].strip(), 'id': '', 'ref': [], 'conf': None, 'q': '', 'body': [], 'line': n, 'file': os.path.basename(path)}
        elif line.startswith('@') and cur is None:
            k, _, v = line[1:].partition(' ')
            if k == 'course': course = v.strip()
            elif k == 'conf': dconf = '' if v.strip() == 'none' else v.strip()
            else: raise SystemExit('%s:%d unknown header @%s' % (path, n, k))
        elif cur is not None and line.startswith('@') and not cur['body']:
            k, _, v = line[1:].partition(' ')
            v = v.strip()
            if k == 'id': cur['id'] = v
            elif k == 'ref': cur['ref'] = [x.strip() for x in v.split(';') if x.strip()]
            elif k == 'conf': cur['conf'] = '' if v == 'none' else v
            elif k == 'q': cur['q'] = v
            else: raise SystemExit('%s:%d unknown lesson tag @%s' % (path, n, k))
        elif cur is not None:
            cur['body'].append(line)
        elif line.strip():
            raise SystemExit('%s:%d text before the first lesson title' % (path, n))
    finish()
    for L in lessons:
        blocks, para = [], []
        def flush():
            nonlocal para
            if para:
                blocks.append('\n'.join(para))
                para = []
        for line in L['body']:
            if not line.strip():
                flush()
            elif line.startswith('## '):
                flush(); blocks.append(line)
            elif line.startswith('- '):
                if para and not para[0].startswith('- '):
                    flush()
                para.append(line)
            else:
                if para and para[0].startswith('- '):
                    flush()
                para.append(line.strip())
        flush()
        # a wrapped source line is one paragraph: join plain lines
        out = []
        for b in blocks:
            if b.startswith('- ') or b.startswith('## '):
                out.append(b)
            else:
                out.append(' '.join(x.strip() for x in b.split('\n')))
        L['blocks'] = out
        if L['conf'] is None:
            L['conf'] = dconf
    return course, lessons


def lint(L, course):
    bad = []
    t = L['title']
    if not 2 <= len(t) <= 60: bad.append('title length %d' % len(t))
    if not re.fullmatch(r'[a-z0-9-]{3,40}', L['id']): bad.append('id %r' % L['id'])
    if L['conf'] not in CONFS: bad.append('conf %r' % L['conf'])
    body_words = 0
    for b in L['blocks']:
        if b.startswith('## '):
            if not 2 <= len(b) - 3 <= 48: bad.append('heading length: %s' % b)
            continue
        if b.startswith('- '):
            for item in b.split('\n'):
                if not item.startswith('- '): bad.append('list line not an item: %s' % item[:40])
                if words(item) > 45: bad.append('list item over 45 words: %s' % item[:40])
                body_words += words(item)
            continue
        body_words += words(b)
        if words(b) < 12 and not b.endswith((':', '.', '?', '!')): bad.append('short paragraph: %s' % b[:40])
        if not b.rstrip().endswith(('.', '?', '!', '"', '”', ':')): bad.append('paragraph does not end a sentence: ...%s' % b[-30:])
    if not 130 <= body_words <= 560: bad.append('%d words (130 to 560)' % body_words)
    if not any(not b.startswith(('## ', '- ')) for b in L['blocks']): bad.append('no prose paragraph')
    text = ' '.join([t, L['q']] + L['blocks'])
    if re.search(r'\b(?:BCE|CE|B\.C\.E\.|C\.E\.)\b', text): bad.append('BCE/CE: write BC and AD')
    m = BRITISH.search(re.sub(r'\bTyre\b', '', re.sub(r'burnt offerings?', '', text, flags=re.I)))
    if m: bad.append('British spelling: %s' % m.group(0))
    if '—' in text or '–' in text or ' -- ' in text: bad.append('dash: use a comma, a colon or a new sentence (ranges use a plain hyphen)')
    if re.search(r'[*_]{2}|`|\[\w[^\]]*\]\(', text): bad.append('markup')
    if re.search(r'\bTODO\b|\bXXX\b|\?\?', text): bad.append('placeholder')
    # Bible references: all must be real
    refs = []
    for m in REF_RE.finditer(text):
        code, ch, v1, v2 = NAME2CODE[m.group(1)], int(m.group(2)), int(m.group(3) or 0), int(m.group(4) or 0)
        why = check_ref(code, ch, v1, v2)
        if why: bad.append('reference %s: %s' % (m.group(0), why))
        refs.append((code, ch, v1, v2))
    for r in L['ref']:
        p = parse_ref(r)
        if not p: bad.append('@ref not a reference: %r' % r); continue
        why = check_ref(*p)
        if why: bad.append('@ref %s: %s' % (r, why))
    # a number written like a reference to something that is not a book, such as "Matthew 33"
    if re.search(r'\b(?:verse|verses) \d+-\d+[a-z]', text): bad.append('verse range with a letter')
    return bad, body_words


_verses = None


def verse_table():
    global _verses
    if _verses is None:
        _verses = []
        for c, n in BOOKS:
            for ci, ch in enumerate(bible(c), 1):
                for vi, v in enumerate(ch, 1):
                    if v: _verses.append(('%s %d:%d' % (c, ci, vi), v, set(norm(v))))
    return _verses


def closest_verse(q):
    qs = set(norm(q))
    best, score = None, 0
    for ref, text, ws in verse_table():
        sc = len(qs & ws) / max(1, len(qs | ws))
        if sc > score: best, score = (ref, text), sc
    return best if score > 0.35 else None


def quotes_not_in_bible(L):
    """Quoted passages of six words or more that are not word for word in the BSB, with the closest verse so they can be corrected."""
    out, hay = [], None
    text = ' '.join(b for b in L['blocks'] if not b.startswith('## '))
    text = text.replace('\u201c', '"').replace('\u201d', '"')
    parts = text.split('"')                  # quotes are paired in order: the odd segments are inside a quote
    for i in range(1, len(parts), 2):
        q = parts[i]
        if words(q) < 4: continue
        if hay is None: hay = all_bible_words()
        w = ' '.join(norm(q))
        # a quote may be a run of a verse with the sentence ending cut off: compare without the final punctuation
        if w and (' ' + w) not in hay:
            near = closest_verse(q)
            out.append((q[:100], near))
    return out


def main():
    allow_drop = '--allow-drop' in sys.argv
    files = sorted(glob.glob(os.path.join(SRC, '*.md')))
    if not files:
        raise SystemExit('no sources in %s' % SRC)
    lessons, bycourse, errors, seen = [], {c: [] for c in COURSE_IDS}, [], {}
    qwarn = []
    for path in files:
        course, ls = parse(path)
        if course not in COURSE_IDS:
            errors.append('%s: @course %r is not one of %s' % (os.path.basename(path), course, ', '.join(COURSE_IDS)))
            continue
        for L in ls:
            if not L['id']:
                L['id'] = slug(L['title'])[:40].strip('-')
            L['course'] = course
            bad, wc = lint(L, course)
            L['words'] = wc
            if L['id'] in seen:
                bad.append('id %r also used at %s:%d' % (L['id'], seen[L['id']][0], seen[L['id']][1]))
            seen[L['id']] = (L['file'], L['line'])
            for b in bad:
                errors.append('%s:%d "%s": %s' % (L['file'], L['line'], L['title'], b))
            for q, near in quotes_not_in_bible(L):
                qwarn.append('%s "%s": "%s"%s' % (L['file'], L['title'], q, ('\n        BSB %s: %s' % near) if near else '  (no near verse: a person quoted?)'))
            bycourse[course].append(L)
            lessons.append(L)
    # the book introductions must have the fixed ids the page looks up
    for L in bycourse['books']:
        if not re.fullmatch(r'book-(?:' + '|'.join(c.lower() for c in CODES) + ')', L['id']):
            errors.append('%s:%d books lesson needs @id book-<code> (such as book-gen), got %r' % (L['file'], L['line'], L['id']))
    # nothing shipped may vanish
    prev = os.path.join(OUT, 'index.json')
    if os.path.exists(prev) and not allow_drop:
        try:
            with open(prev, encoding='utf-8') as f:
                old = {r[0] for r in json.load(f)['lessons']}
            gone = sorted(old - set(seen))
            if gone:
                errors.append('lesson ids shipped before are missing (retitled or deleted?): %s' % ', '.join(gone[:12]))
        except Exception as e:
            errors.append('could not read the previous index: %s' % e)
    if errors:
        print('\n'.join(errors[:80]))
        print('\n%d problem(s); nothing written.' % len(errors))
        sys.exit(1)
    os.makedirs(OUT, exist_ok=True)
    index = {'v': 1, 'courses': [[c, n, col] for c, n, col in COURSES], 'lessons': []}
    for ci, (cid, _, _) in enumerate(COURSES):
        bodies = {}
        for L in bycourse[cid]:
            mins = max(2, math.ceil(L['words'] / 140))
            index['lessons'].append([L['id'], ci, L['title'], mins, CONFS.index(L['conf'])])
            bodies[L['id']] = {'b': L['blocks'], 'r': L['ref'], 'q': L['q']}
        path = os.path.join(OUT, cid + '.json')
        if bodies:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(bodies, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        elif os.path.exists(path):
            os.remove(path)
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    tot = sum(r[3] for r in index['lessons'])
    print('%d lessons, %d minutes of reading (%.1f hours)' % (len(lessons), tot, tot / 60))
    for cid, n, _ in COURSES:
        k = len(bycourse[cid])
        if k: print('  %-8s %3d  %s' % (cid, k, n))
    if qwarn:
        print('\nQuoted words not found in the Bible text (check each against its source):')
        print('\n'.join('  ' + q for q in qwarn))


if __name__ == '__main__':
    main()
