#!/usr/bin/env python3 -I
"""Build the Study tab's reading content: the Bible text and Matthew Henry's full commentary, served by the site
and fetched on demand by the app, so nobody has to leave the app to read.

    python3 -I scripts/build-reading-content.py

Writes, inside this project:
  study/bsb/<CODE>.json   the Berean Standard Bible (public domain), one array per chapter, one string per verse.
                          chapters[ch - 1][v - 1] is verse v of chapter ch. A verse the BSB leaves out is "".
  study/mh/<CODE>/<ch>.json   Matthew Henry's commentary on that chapter, whole (one file a chapter: Henry on the Psalms alone
                          is 3 MB, and nobody should download it to read one psalm):
                            {"i": [overview paragraphs], "s": [{"v": [first, last], "h": "heading", "p": [paragraphs]}]}
                          v is the verse range a section comments on. Paragraphs may hold <i> and <b> only.

Sources, both public domain, both on this Mac:
  Berean Standard Bible       Bible App/Tools/source/bsb.txt           (dedicated to the public domain, per its own header)
  Matthew Henry's Commentary  Walk the Stories/Data/_raw/ccel/henry-mhc1..6.xml   (CCEL)

Prints counts and problems only. It stops (exit 1) if the Bible text is not complete or any commentary section points
outside its chapter. Run it again to rebuild; the output is deterministic.
"""
import glob, html, json, os, re, runpy, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
base = runpy.run_path(os.path.join(HERE, 'build-study-content.py'))      # BOOKS, attrs, HENRY (does not run main)
BOOKS, attrs, HENRY = base['BOOKS'], base['attrs'], base['HENRY']
BSB = os.path.join(os.path.dirname(ROOT), 'Bible App', 'Tools', 'source', 'bsb.txt')
OUT_BSB = os.path.join(ROOT, 'study', 'bsb')
OUT_MH = os.path.join(ROOT, 'study', 'mh')

NAME_TO_CODE = {b[1]: b[0] for b in BOOKS}
NAME_TO_CODE['Psalm'] = 'PSA'            # the BSB names the book singular


def bible():
    """{code: [[verse, ...] per chapter]}"""
    out = {b[0]: [] for b in BOOKS}
    with open(BSB, encoding='utf-8-sig') as f:
        for line in f:
            line = line.rstrip('\r\n')
            if '\t' not in line:
                continue
            ref, text = line.split('\t', 1)
            m = re.match(r'^(.+) (\d+):(\d+)$', ref)
            if not m:
                continue                                    # header rows
            code = NAME_TO_CODE[m.group(1)]
            ch, v = int(m.group(2)), int(m.group(3))
            chapters = out[code]
            while len(chapters) < ch:
                chapters.append([])
            verses = chapters[ch - 1]
            while len(verses) < v - 1:
                verses.append('')                           # verses the BSB omits keep the numbering
            verses.append(text.strip())
    return out


def rich(frag):
    """One paragraph of Henry: scripture links become plain text, <i> and <b> stay, every other tag goes."""
    t = re.sub(r'<scripRef[^>]*>(.*?)</scripRef>', r'\1', frag, flags=re.S)
    t = re.sub(r'<br\s*/?>', ' ', t)
    t = re.sub(r'<(/?)(i|b)\b[^>]*>', lambda m: '<%s%s>' % (m.group(1), m.group(2)), t)
    t = re.sub(r'<(?!/?(?:i|b)>)[^>]+>', '', t)
    t = html.unescape(t)
    t = re.sub(r'\s+', ' ', t).strip()
    t = re.sub(r'<(i|b)>\s*</\1>', '', t)
    for tag in ('i', 'b'):                                  # an unbalanced tag would leak into the next paragraph
        if t.count('<%s>' % tag) != t.count('</%s>' % tag):
            t = t.replace('<%s>' % tag, '').replace('</%s>' % tag, '')
    return re.sub(r'\s+', ' ', t).strip()


def plain(frag):
    return re.sub(r'<[^>]+>', '', rich(frag)).strip()


BLOCK = re.compile(r'<h4\b[^>]*>(?P<h>.*?)</h4>'
                   r'|<p class="(?P<c>indent|intro|passage)"[^>]*>(?P<p>.*?)</p>'
                   r'|<verse\b[^>]*>(?P<v>.*?)</verse>\s*(?:<attr\b[^>]*>(?P<a>.*?)</attr>)?', re.S)


def blocks(seg):
    """[(kind, text)] in document order: 'h' heading, 'p' paragraph."""
    out = []
    for m in BLOCK.finditer(seg):
        if m.group('h') is not None:
            t = plain(m.group('h'))
            if t:
                out.append(('h', t))
        elif m.group('p') is not None:
            t = rich(m.group('p'))
            if t:
                out.append(('k' if m.group('c') == 'passage' else 'p', t))
        else:
            lines = [rich(x) for x in re.findall(r'<l\b[^>]*>(.*?)</l>', m.group('v'), re.S)]
            t = ' / '.join(x for x in lines if x)
            if t and m.group('a'):
                t += ' — ' + rich(m.group('a'))
            if t:
                out.append(('p', t))
    return out


def osis_range(osis, n, last_verse):
    """'Bible:Gen.1.1-Gen.1.2' for chapter n -> ([first, last] clamped to the chapter, repaired) or None.
    CCEL's tags name the wrong chapter in a few places (2 Chronicles 28-29, Luke 16); the chapter heading is right, so a
    tag that does not include chapter n is read as being about n, and the verse numbers are checked against the quoted text."""
    m = re.match(r'^Bible:\w+\.(\d+)(?:\.(\d+))?(?:-\w+\.(\d+)(?:\.(\d+))?)?$', osis or '')
    if not m:
        return None
    c1, v1, c2, v2 = int(m.group(1)), m.group(2), m.group(3), m.group(4)
    c2 = int(c2) if c2 else c1
    repaired = False
    if c1 > n or c2 < n:
        c1 = c2 = n
        repaired = True
    first = int(v1) if (v1 and c1 == n) else 1
    if v2 and c2 == n:
        last = int(v2)
    elif v1 and not m.group(3):
        last = first                      # one verse: "Bible:Gen.3.16"
    else:
        last = last_verse
    if not v1 and not v2:
        first, last = 1, last_verse
    return [max(1, first), min(last_verse, max(first, last))], repaired


def quoted_verses(text):
    """[first, last] verse numbers in Henry's quoted passage ("19 There was a certain rich man ... 31 ..."), or None."""
    nums = [int(x) for x in re.findall(r'(?:^|(?<=\s))(\d{1,3})(?=\s+\S)', text)]
    if not nums:
        return None
    seq = [nums[0]]
    for x in nums[1:]:
        if x == seq[-1] + 1:
            seq.append(x)
    return [seq[0], seq[-1]]


def henry(bsb, stats):
    """{code: {chapter: record}}, problems"""
    out, problems = {}, []
    for vol in range(1, 7):
        s = open(os.path.join(HENRY, 'henry-mhc%d.xml' % vol), encoding='utf-8', errors='replace').read()
        starts = [(m.start(), attrs(m.group(0))) for m in re.finditer(r'<div1\b[^>]*>', s)]
        for k, (pos, a) in enumerate(starts):
            end = starts[k + 1][0] if k + 1 < len(starts) else len(s)
            book = next((b for b in BOOKS if b[3] == vol and b[4] == a.get('title', '')), None)
            if not book:
                continue
            body = s[pos:end]
            d2 = [(m.start(), attrs(m.group(0))) for m in re.finditer(r'<div2\b[^>]*>', body)]
            chapters = [(p, at) for p, at in d2 if not at.get('title', '').lower().startswith('intro')]
            if len(chapters) != book[2]:
                problems.append('%s: Henry has %d chapters, expected %d' % (book[1], len(chapters), book[2]))
            recs = {}
            for n, (p, at) in enumerate(chapters, 1):
                nxt = [x[0] for x in d2].index(p) + 1
                chap = body[p:(d2[nxt][0] if nxt < len(d2) else len(body))]
                last_verse = len(bsb[book[0]][n - 1]) if n - 1 < len(bsb[book[0]]) else 0
                marks = [m for m in re.finditer(r'<scripCom\b[^>]*>', chap)]
                before = chap[:marks[0].start()] if marks else chap
                overview = [t for kind, t in blocks(before) if kind == 'p']
                sections = []
                for j, mk in enumerate(marks):
                    seg = chap[mk.end():(marks[j + 1].start() if j + 1 < len(marks) else len(chap))]
                    got = osis_range(attrs(mk.group(0)).get('osisRef', ''), n, last_verse)
                    if got is None:
                        problems.append('%s %d: a section has no usable verse range (%s)' % (book[1], n, attrs(mk.group(0)).get('osisRef', '')))
                        continue
                    rng, repaired = got
                    stats['repaired'] += repaired
                    heading, paras, quote = '', [], None
                    for kind, t in blocks(seg):
                        if kind == 'h' and not heading and not paras:
                            heading = t
                        elif kind == 'p':
                            paras.append(t)
                        elif kind == 'k' and quote is None:
                            quote = quoted_verses(t)
                    if quote:
                        # a check, never an override: the tag is right where Henry quotes half a verse ("17b—")
                        stats['checked'] += 1
                        if quote != rng:
                            stats['disagree'] += 1
                            stats['disagreements'].append('%s %d: tag %s, quoted text %s' % (book[1], n, rng, quote))
                    if paras or heading:
                        sec = {'v': rng}
                        if heading:
                            sec['h'] = heading
                        sec['p'] = paras
                        sections.append(sec)
                if not overview and not sections:
                    problems.append('%s %d: no commentary found' % (book[1], n))
                    continue
                rec = {}
                if overview:
                    rec['i'] = overview
                if sections:
                    rec['s'] = sections
                recs[str(n)] = rec
            out[book[0]] = recs
    return out, problems


def main():
    for d in (OUT_BSB, OUT_MH):
        os.makedirs(d, exist_ok=True)
        for old in glob.glob(os.path.join(d, '**', '*.json'), recursive=True):
            os.remove(old)
    text = bible()
    problems = []
    verses = empty = 0
    for code, name, count, vol, _ in BOOKS:
        ch = text[code]
        if len(ch) != count:
            problems.append('%s: the BSB has %d chapters, expected %d' % (name, len(ch), count))
        for i, vs in enumerate(ch, 1):
            if not vs:
                problems.append('%s %d: no verses' % (name, i))
            verses += sum(1 for v in vs if v)
            empty += sum(1 for v in vs if not v)
        data = json.dumps(ch, ensure_ascii=False, separators=(',', ':'))
        open(os.path.join(OUT_BSB, code + '.json'), 'w', encoding='utf-8').write(data)
    if verses + empty != 31102:
        problems.append('the BSB has %d verse slots; the Bible has 31,102' % (verses + empty))

    stats = {'repaired': 0, 'checked': 0, 'disagree': 0, 'disagreements': []}
    mh, hp = henry(text, stats)
    problems += hp
    secs = paras = 0
    for code, name, count, vol, _ in BOOKS:
        recs = mh.get(code, {})
        for r in recs.values():
            secs += len(r.get('s', []))
            paras += len(r.get('i', [])) + sum(len(s['p']) for s in r.get('s', []))
        os.makedirs(os.path.join(OUT_MH, code), exist_ok=True)
        for ch, rec in recs.items():
            open(os.path.join(OUT_MH, code, ch + '.json'), 'w', encoding='utf-8').write(
                json.dumps(rec, ensure_ascii=False, separators=(',', ':')))
    covered = sum(len(r) for r in mh.values())

    def sizes(d):
        fs = sorted(glob.glob(os.path.join(d, '**', '*.json'), recursive=True), key=os.path.getsize, reverse=True)
        return sum(os.path.getsize(f) for f in fs), ', '.join('%s %s' % (os.path.basename(f)[:-5], format(os.path.getsize(f), ',')) for f in fs[:3])
    b_total, b_top = sizes(OUT_BSB)
    m_total, m_top = sizes(OUT_MH)
    print('Bible text: 66 books, %d verses (%d the BSB leaves out), %s bytes; largest: %s' % (verses, empty, format(b_total, ','), b_top))
    print('Henry: %d of 1189 chapters, %d sections, %d paragraphs, %s bytes in %d files; largest: %s' % (
        covered, secs, paras, format(m_total, ','), covered, m_top))
    print('verse ranges: %d checked against Henry\'s quoted text, %d tag repairs (wrong chapter in the tag), %d where tag and quote differ' % (
        stats['checked'], stats['repaired'], stats['disagree']))
    for d in stats['disagreements'][:40]:
        print('  differs:', d)
    for p in problems:
        print('PROBLEM', p)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
