#!/usr/bin/env python3 -I
"""Build the Study tab's LESSONS: short, about four minutes each, three a day (about twelve minutes).

    python3 -I scripts/build-lessons.py

A lesson is a passage of about 330 words of the Bible, a brief excerpt of Matthew Henry on exactly those verses, and a
question. Henry's whole commentary is still there (one tap away); it is just not what has to be read.

Reads study/bsb/ and study/mh/ (scripts/build-reading-content.py makes them) and writes:
  study/les/<CODE>/<ch>.json   [{"v": [first, last], "w": Bible words, "x": [{"v": [a, b], "h": heading, "p": [paragraphs]}],
                                 "hw": excerpt words, "m": minutes}, ...]   one entry per passage of the chapter
  and the plan the page carries, written between the STUDY PLAN markers in Stillwater.html:
  const STUDY_SPLITS = {GEN: "31:14|25|...", ...}   per chapter "<verses>[:<start verse of each later passage>]"
  const STUDY_MINS = {GEN: "45|4|...", ...}            per chapter, one digit (minutes) for each passage

Passages are cut where Henry's own sections begin, so a lesson is never a stranger to its commentary; a long section is cut at
a verse so that the pieces are equal in words. Nothing crosses a chapter. The plan is by count (the Nth lesson read is the Nth
passage), so DO NOT change PASSAGE_MIN/MAX/TARGET once the app is in use: it would move where everyone is.

Prints counts, minutes and problems only; exits 1 on a problem (a verse in no passage or two, an out-of-range passage).
"""
import glob, json, math, os, random, re, runpy, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BOOKS = runpy.run_path(os.path.join(HERE, 'build-study-content.py'))['BOOKS']
BSB, MH, OUT = (os.path.join(ROOT, 'study', d) for d in ('bsb', 'mh', 'les'))
PAGE = os.path.join(ROOT, 'Stillwater.html')

PASSAGE_MIN, PASSAGE_MAX, TARGET = 170, 400, 330     # words of Bible in a passage
DAY_MIN = 9                                          # minutes: the page adds a second Old Testament lesson only below this
MAX_BLOCKS = 5                                       # most separate pieces of Henry in one lesson
WPM, EXTRA = 180, 60                                 # reading speed; the question and prayer, in words
W = lambda s: len(s.split())


def budget(passage_words):
    """Words of Henry for a passage: less when the passage is long, so a lesson stays about the same size."""
    return max(200, min(420, 640 - passage_words))


NOT_AN_END = re.compile(r"^\(?(\d{1,3}|[ivxlcIVXLC]{1,5}|[A-Za-z])\)?$")        # "1." "(1.)" "I." "ii." "a." are list markers
MARKER_TAIL = re.compile(r"(?:^|[:;,(\u2014])(\d{1,3}|[ivxlcIVXLC]{1,5}|[A-Za-z])\)?$")   # "considerations:\u20141." is a list marker, "4-15." is a verse range
ABBREV = {'v', 'vv', 'ver', 'vers', 'ch', 'chap', 'vol', 'viz', 'ibid', 'st', 'dr', 'mr', 'mrs', 'rev', 'ps', 'prov', 'eccl', 'isa', 'jer',
          'ezek', 'dan', 'matt', 'mat', 'rom', 'cor', 'gal', 'eph', 'phil', 'col', 'thess', 'tim', 'heb', 'jam', 'pet', 'gen', 'exod', 'lev',
          'num', 'deut', 'josh', 'judg', 'sam', 'chron', 'neh', 'esth', 'ib', 'sect', 'no'}


def sentence_ends(text):
    """Character offsets just after each real sentence end in text."""
    out = []
    for m in re.finditer(r'[.!?][\u201d"\')]*(?=\s+[A-Z\u201c"\u2018(])', text):
        before = text[:m.start()].split()
        tok = before[-1].strip('(\u201c"\u2018') if before else ''
        if m.group(0)[0] == '.' and (NOT_AN_END.match(tok) or MARKER_TAIL.search(tok) or tok.lower() in ABBREV):
            continue
        out.append(m.end())
    return out


def first_sentence(text, cap=40):
    """The first real sentence of text (no more than `cap` words)."""
    ends = sentence_ends(text)
    out = text[:ends[0]].strip() if ends else text.strip()
    return out if W(out) <= cap else ' '.join(out.split()[:cap]).rstrip(',;:\u2014-') + '\u2026'


def cut_sentences(text, limit):
    """text trimmed to a whole sentence at or under `limit` words (at least its first sentence); '…' marks a cut."""
    words = text.split()
    if len(words) <= limit:
        return text
    best = None
    for e in sentence_ends(text):
        if W(text[:e]) <= limit:
            best = e
        else:
            if best is None:
                best = e                            # the first sentence, even if it is long
            break
    if best is None or W(text[:best]) > limit * 2:
        return ' '.join(words[:limit]).rstrip(',;:\u2014-') + '\u2026'
    out = text[:best].rstrip()
    return out + ' \u2026' if best < len(text.rstrip()) else out


def split_chapter(vw, cuts):
    """[(first, last), ...] verse ranges for the passages of one chapter. vw = words per verse."""
    n = len(vw)
    cs = sorted(set(c for c in cuts if 1 < c <= n) | {1})
    segs = [(c, (cs[i + 1] - 1) if i + 1 < len(cs) else n) for i, c in enumerate(cs)]
    pieces = []
    for a, b in segs:
        w = sum(vw[a - 1:b])
        if w > PASSAGE_MAX:                          # a long section: cut at verses into equal pieces
            k = math.ceil(w / TARGET)
            per, acc, start, cnt = w / k, 0, a, 1
            for v in range(a, b + 1):
                acc += vw[v - 1]
                if cnt < k and acc >= per * cnt and v < b:
                    pieces.append((start, v)); start = v + 1; cnt += 1
            pieces.append((start, b))
        else:
            pieces.append((a, b))
    out, cur = [], None
    for a, b in pieces:
        w = sum(vw[a - 1:b])
        if cur is None:
            cur = [a, b, w]
        elif cur[2] + w <= PASSAGE_MAX or (cur[2] < PASSAGE_MIN and cur[2] + w <= PASSAGE_MAX * 1.25):
            cur = [cur[0], b, cur[2] + w]
        else:
            out.append(cur); cur = [a, b, w]
    out.append(cur)
    if len(out) > 1 and out[-1][2] < PASSAGE_MIN * 0.6 and out[-2][2] + out[-1][2] <= PASSAGE_MAX * 1.3:
        last = out.pop(); out[-1] = [out[-1][0], last[1], out[-1][2] + last[2]]
    return [(a, b) for a, b, _ in out]


def lead_in(p):
    return bool(re.search(r'[,;:\u2014-]\s*$', p.rstrip(' \u2026')))


def clean_end(p):
    """A paragraph that ends on a lead-in ("observe," "two ways:\u2014") is cut back to its last whole sentence, or ended cleanly."""
    if not lead_in(p):
        return p
    ends = [e for e in sentence_ends(p) if W(p[:e]) >= 8]
    if ends and ends[-1] < len(p.rstrip()):
        return p[:ends[-1]].rstrip() + ' \u2026'
    return p.rstrip(' ,;:\u2014-\u2026') + ' \u2026'


def window_of(s, a, b):
    """The paragraphs of section s that belong to the verses a..b. Each paragraph belongs to exactly ONE passage: the one that holds
    the verse at the middle of the paragraph (paragraphs run in verse order, so position in the section is position in the verses).
    That way a section Henry spreads over two lessons is never shown twice."""
    v0, v1 = s['v']
    ln = max(1, v1 - v0 + 1)
    lens = [W(p) for p in s['p']]
    tot, run, out = sum(lens) or 1, 0, []
    for p, l in zip(s['p'], lens):
        mid = (run + l / 2) / tot; run += l
        if a <= v0 + min(ln - 1, int(mid * ln)) <= b:
            out.append(p)
    return out


def excerpt(sections, a, b, words_of_bible):
    """Matthew Henry on verses a..b, in brief: [{"v", "h", "p"}]. Every section that touches the passage gets a share."""
    H = budget(words_of_bible)
    touch = [s for s in sections if s['v'][1] >= a and s['v'][0] <= b and s['p']]
    touch = [s for s in touch if window_of(s, a, b)]
    if not touch:
        return []
    window = lambda sec: window_of(sec, a, b)
    if len(touch) > MAX_BLOCKS:                       # a dense stretch (Psalm 119's stanzas): the gist of each, in groups
        size = math.ceil(len(touch) / MAX_BLOCKS)
        groups = [touch[i:i + size] for i in range(0, len(touch), size)]
        gshare = H / len(groups)
        out = []
        for g in groups:
            gist = ' '.join(first_sentence(window(s)[0]) for s in g)
            out.append({'v': [g[0]['v'][0], g[-1]['v'][1]], 'p': [clean_end(cut_sentences(gist, int(gshare)))]})
        return out
    share = H / len(touch)
    blocks = []
    for s in touch:
        blocks.append({'v': list(s['v']), 'h': s.get('h', ''), 'all': window(s), 'used': 0, 'p': []})
    for bl in blocks:                                  # first pass: each section its share, whole paragraphs where they fit
        spent = 0
        for i, p in enumerate(bl['all']):
            l = W(p)
            if i == 0 and l > share * 1.25:
                bl['p'].append(cut_sentences(p, int(share))); spent += min(l, int(share)); bl['used'] = 1; break
            if spent + l <= share * 1.25 or i == 0:
                bl['p'].append(p); spent += l; bl['used'] = i + 1
            else:
                break
    total = sum(W(p) for bl in blocks for p in bl['p'])
    for bl in blocks:                                  # second pass: room left over goes to sections that have more to say
        while bl['used'] < len(bl['all']) and bl['p'] and not bl['p'][-1].endswith('…'):
            nxt = bl['all'][bl['used']]
            if total + W(nxt) > H * 1.15:
                break
            bl['p'].append(nxt); total += W(nxt); bl['used'] += 1
    for bl in blocks:                                  # never end on a lead-in that promises a list ("observe," "four things:\u2014")
        if bl['p'] and lead_in(bl['p'][-1]) and bl['used'] < len(bl['all']):
            nxt = bl['all'][bl['used']]                                              # the list it promised: one paragraph, kept short
            bl['p'].append(cut_sentences(nxt, 100) if W(nxt) > 130 else nxt); bl['used'] += 1
        if bl['p']:
            bl['p'][-1] = clean_end(bl['p'][-1])
    return [{'v': bl['v'], **({'h': bl['h']} if bl['h'] else {}), 'p': bl['p']} for bl in blocks if bl['p']]


def main():
    problems, planned, planned_min = [], {}, {}
    tracks_of = {b[0]: ('ot' if i < 39 else 'nt') for i, b in enumerate(BOOKS)}    # the Psalms and wisdom books are part of the Old Testament
    for old in glob.glob(os.path.join(OUT, '**', '*.json'), recursive=True):
        os.remove(old)
    lessons_total = no_henry = 0
    all_minutes = {'ot': [], 'nt': []}
    for code, name, count, vol, _ in BOOKS:
        bible = json.load(open(os.path.join(BSB, code + '.json')))
        parts, mparts = [], []
        os.makedirs(os.path.join(OUT, code), exist_ok=True)
        for ch in range(1, count + 1):
            verses = bible[ch - 1]
            vw = [W(v) for v in verses]
            mh = json.load(open(os.path.join(MH, code, '%d.json' % ch)))
            secs = mh.get('s', [])
            ranges = split_chapter(vw, [s['v'][0] for s in secs])
            # every verse in exactly one passage, in order
            flat = [v for a, b in ranges for v in range(a, b + 1)]
            if flat != list(range(1, len(verses) + 1)):
                problems.append('%s %d: the passages do not cover the verses once each: %s' % (name, ch, ranges))
            les = []
            for a, b in ranges:
                w = sum(vw[a - 1:b])
                x = excerpt(secs, a, b, w)
                if not x and mh.get('i'):                                   # Henry has no section here: his overview, in brief
                    x = [{'v': [a, b], 'p': [cut_sentences(mh['i'][0], budget(w))]}]
                if not x:
                    no_henry += 1
                hw = sum(W(p) for bl in x for p in bl['p'])
                m = max(2, math.ceil((w + hw + EXTRA) / WPM))
                les.append({'v': [a, b], 'w': w, 'x': x, 'hw': hw, 'm': m})
                all_minutes[tracks_of[code]].append(m)
                lessons_total += 1
            open(os.path.join(OUT, code, '%d.json' % ch), 'w', encoding='utf-8').write(json.dumps(les, ensure_ascii=False, separators=(',', ':')))
            parts.append(str(len(verses)) + (':' + ','.join(str(a) for a, _ in ranges[1:]) if len(ranges) > 1 else ''))
            assert all(L['m'] < 10 for L in les), 'a lesson of ten minutes or more does not fit one digit'
            mparts.append(''.join(str(L['m']) for L in les))
        planned[code] = '|'.join(parts)
        planned_min[code] = '|'.join(mparts)

    key = lambda c: c if re.match(r'^[A-Za-z_]\w*$', c) else "'%s'" % c
    js = 'const STUDY_SPLITS = {\n' + ',\n'.join('  %s: "%s"' % (key(c), planned[c]) for c, *_ in BOOKS) + '\n};\n'
    # minutes of every lesson (one digit each, per chapter, in passage order): the page works out a day's lessons from these, offline
    js += 'const STUDY_MINS = {\n' + ',\n'.join('  %s: "%s"' % (key(c), planned_min[c]) for c, *_ in BOOKS) + '\n};\n'
    s = open(PAGE, encoding='utf-8').read()
    a, b = '/* ===== STUDY PLAN (generated by scripts/build-lessons.py) ===== */', '/* ===== END STUDY PLAN ===== */'
    if a in s and b in s:
        s = s[:s.index(a) + len(a)] + '\n' + js + s[s.index(b):]
        open(PAGE, 'w', encoding='utf-8').write(s)
        wrote = 'written into Stillwater.html (%d bytes)' % len(js)
    else:
        open(os.path.join(ROOT, 'build', 'tmp', 'study-splits.js'), 'w').write(js)
        wrote = 'no markers in the page yet: written to build/tmp/study-splits.js (%d bytes)' % len(js)

    print('lessons: %d passages (Old Testament %d, New Testament %d; %d have no Henry text at all)' % (
        lessons_total, len(all_minutes['ot']), len(all_minutes['nt']), no_henry))
    # the plan as the page applies it: a day is the next New Testament lesson and one or two Old Testament lessons (the second only
    # while the first and the New Testament lesson come to under DAY_MIN minutes); read everything, every day, and count
    ot, nt = all_minutes['ot'], all_minutes['nt']
    io = jn = 0
    days = []
    while io < len(ot) or jn < len(nt):
        o1 = ot[io] if io < len(ot) else None
        o2 = ot[io + 1] if io + 1 < len(ot) else None
        n = nt[jn] if jn < len(nt) else None
        got = [x for x in (o1,) if x is not None]
        if o2 is not None and (n is None or o1 + n < DAY_MIN):
            got.append(o2)
        if n is not None:
            got.append(n)
        io += len(got) - (1 if n is not None else 0)
        jn += 1 if n is not None else 0
        days.append((len(got), sum(got), n is not None))
    mins = sorted(d[1] for d in days)
    nt_days = sum(1 for d in days if d[2])
    print('the whole Bible, read every day: %d days = %.1f years (the New Testament is done after %d days, then it is the Old Testament alone)' % (
        len(days), len(days) / 365, nt_days))
    print('lessons a day: %d days of 2, %d days of 3; minutes a day: median %d, 90th %d, max %d' % (
        sum(1 for d in days if d[0] == 2), sum(1 for d in days if d[0] == 3), mins[len(mins) // 2], mins[int(len(mins) * .9)], mins[-1]))
    print('with the New Testament: median %d min; Old Testament alone after it: median %d min' % (
        sorted(d[1] for d in days if d[2])[nt_days // 2], sorted(d[1] for d in days if not d[2])[max(0, (len(days) - nt_days) // 2)]))
    print('plan:', wrote)
    for p in problems[:20]:
        print('PROBLEM', p)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
