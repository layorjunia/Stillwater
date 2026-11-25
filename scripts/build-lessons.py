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
MAX_BLOCKS = 7                                       # most separate pieces of Henry in one lesson (one per group of verses)
MATCH_MIN, MATCH_RATIO = 4.0, 1.4                  # a run is placed after a verse only when it shares this much (rarity-weighted) with it, this many times more than with any other
COVER_MIN = 0.0                                      # the best run of a section must score at least this to be shown after its verses
WPM, EXTRA = 180, 60                                 # reading speed; the question and prayer, in words
W = lambda s: len(s.split())


def budget(passage_words):
    """Words of Henry for a passage: less when the passage is long, so a lesson stays about the same size."""
    return max(240, min(480, 720 - passage_words))


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


# ---- choosing Henry's TEACHING --------------------------------------------------------------------------------------------------
# Henry opens nearly every section by retelling the verses ("We have here the third part of the sixth day's work..."), and the
# lesson used to show just that opening. What is worth a reader's four minutes is the other part: what he draws out of it, what
# it means for us, what to do. So every sentence of Henry on the passage is scored for teaching against retelling, and the best
# short runs of whole sentences are shown, in his order, up to the budget. Nothing is rewritten: only chosen.
TAG = re.compile(r'<[^>]+>')
STOP = set('''the and that for with this was were are but not his her him they them their there which who whom whose have has had been from
into upon unto shall will would could should may might can than then when what where while also any all one our out its you your yet
more most such some these those thou thee thy thine hath doth said saith about after before every each other very much many
here hence thus therefore because whether either neither being having doing done make made let lest only even ever never again over
under through against between among without within during must ought'''.split())

# a sentence that is the opening line of a section: it says what the verses are, not what to take from them
FORMULA = re.compile(
    r"^(?:(?:and|but|now|so|then)\s+)?(?:we\s+have\s+(?:here|in\s+these|in\s+this)|here\s+(?:is|are|we\s+have|we\s+find|we\s+see|have\s+we)|"
    r"here,\s+(?:i|1)\b|in\s+these\s+(?:verses|words)|in\s+this\s+(?:verse|passage|chapter|section|psalm|part)|this\s+(?:passage|chapter|psalm|section|verse|is\s+the\s+(?:history|story|account))|"
    r"the\s+(?:scope|title|design|contents?|first\s+words|general\s+contents|history|story|narrative|inscription|argument)\b|"
    r"(?:two|three|four|five|six|several|many|some)\s+things?\s+(?:are|is)\s+here|we\s+(?:are\s+here|have\s+here|find|read|may\s+here|may\s+observe\s+here|may\s+observe\s+in)|"
    r"(?:the\s+)?(?:prophet|apostle|psalmist|evangelist|preacher|historian|sacred\s+historian|writer)\s+(?:here|now|having|in\s+the|proceeds|goes|begins|comes|is)|"
    r"(?:the\s+)?(?:history|story|account)\s+of\b|observe\s+here|see\s+here|(?:we\s+are\s+)?(?:here\s+)?told\b)", re.I)
# words of a lesson being drawn: duty, what we should do, what always holds
NORM = re.compile(r"\b(should|ought|must|let\s+us|may\s+we|we\s+may|learn|hence|therefore|duty|it\s+is\s+(?:our|the\s+duty|a\s+(?:great|sad|good|certain|very))|"
                  r"how\s+(?:great|much|many|sad|good|happy|dangerous|ready|apt|easy|hard|sweet|precious|vain|needful|fit)|apt\s+to|ready\s+to|never|always|ever\s+(?:since|after|be)|"
                  r"nothing\s+(?:can|is|more)|none\s+(?:but|can|of\s+us)|no\s+(?:man|one)|whosoever|whoever|every\s+(?:one|man|good)|not\s+(?:only|barely)|"
                  r"it\s+is\s+(?:good|well|better|vain|folly|safe|sin|dangerous|comfortable)|better\s+(?:to|than)|blessed|happy|wise|folly|sin\s+is|grace|faith|comfort|prayer|"
                  r"holy|temptation|conscience|repent|mercy|providence)\b", re.I)
GENERAL = re.compile(r"\b(we|us|our|ourselves|men|christians?|believers?|saints?|sinners?|ministers?|parents|children|those\s+(?:that|who)|them\s+that|he\s+that|they\s+that|"
                     r"all\s+(?:that|who|good|wicked)|such\s+as|the\s+(?:godly|wicked|righteous|best|worst)|good\s+(?:people|men)|wicked\s+(?:people|men)|God\s+(?:is|will|does|never|has\s+promised))\b", re.I)
PAST = re.compile(r"\b(was|were|had|did|said|went|came|took|gave|sent|saw|told|found|called|began|brought|died|slew|cried|answered|spoke|knew|heard|stood|rose|fell|fled|replied|asked)\b", re.I)
VERSEREF = re.compile(r"\bvv?\.\s*\d+|\bver\.\s*\d+")                      # "v. 4": pointing back at the verses = retelling them
XREF = re.compile(r"\b(?:Gen|Exod|Lev|Num|Deut|Josh|Judg|Ruth|Sam|Kings|Chron|Ezra|Neh|Esth|Job|Ps|Prov|Eccl|Cant|Isa|Jer|Lam|Ezek|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Matt|Mark|Luke|John|Acts|Rom|Cor|Gal|Eph|Phil|Col|Thess|Tim|Tit|Heb|Jam|Pet|Jude|Rev)\.\s+[ivxlc\d]+")
THESIS = re.compile(r"^\s*(?:\(?\d{1,2}\.?\)?|[IVX]{1,4}\.|Observe,?\s*\d?\.?)\s*(?:Observe,?\s*)?(?:That|Here|How|The|It|God|Christ|Let|Learn|We|See)\b")
STRONG_BAD = re.compile(r"^(?:he|she|it|its|this|these|they|his|her|their|which|who)\b", re.I)    # a run cannot well start on these: they need the sentence before
WEAK_BAD = re.compile(r"^(?:and|but|for|then|so|thus|hence|therefore|now|yet|nor|or|also|such|however|there|when|if|that|because|though|although|whereas|since|unless|while|"
                      r"as|besides|seeing|whence|wherein|whereby|whereof|thereupon|therein|thence)\b", re.I)
FRAGMENT = re.compile(r"^(?:on|of|from|to|by|with|at|against|upon|under|after|before|between|about|into|out)\b", re.I)    # an item of a list whose lead-in is not in the run
PRONOUN8 = re.compile(r"\b(?:it|its|he|him|his|she|her|they|them|their|this|these|thereby|herein|hereby|thereof)\b", re.I)
ENUM = re.compile(r"^\s*(?:(?:As|Observe|Note|Now|And|But|Here|See|First|Secondly|Thirdly),?\s+(?=[\d(\[IVX<]))?(?:(?:<[ib]>)?(?:\(\d{1,2}\.?\)|\d{1,2}\.|\[\d{1,2}\.\]|[IVXL]{1,5}\.|[a-f]\.|\([ivxl]{1,5}\.?\)|\([a-z]\.?\))(?:</[ib]>)?\s+)+")
# an item of one of Henry's numbered lists starts a unit of its own (a close tag, </i>, may sit just before the number)
LIST_AT = re.compile(r"(?<=[.!?;:”\"\)>])\s+(?=\(\d{1,2}\.\)\s|\[\d{1,2}\.\]\s|\d{1,2}\.\s+[A-Za-z“\"<]|[IVX]{1,4}\.\s+[A-Z“\"<])|\s+(?=\(\d{1,2}\.\)\s+[A-Za-z<])")
HEADING = re.compile(r"^(?:the|of|his|her|their|its|a|an|that|to|how|what)\b", re.I)         # "The punishment he should fall under for this sin."
HAS_VERB = re.compile(r"\b(?:is|are|was|were|be|been|am|have|has|had|do|does|did|will|shall|should|may|must|can|cannot|would|could|might|ought|let|says?|said)\b", re.I)
LAMBDA = 0.8                 # every sentence has to earn this much to be worth its words
MIN_FILL = 0.6                # a lesson always gets at least this share of its budget, from the best Henry has, even where he mostly narrates
RUN_MAX, RUN_MIN = 120, 28    # words in a run of sentences (a single longer sentence is allowed); fewer than RUN_MIN cannot stand alone
TOKEN = re.compile(r"[A-Za-z']+")


def toks(s):
    out = []
    for w in TOKEN.findall(TAG.sub(' ', s).lower()):
        w = w.strip("'")
        if len(w) > 3 and w not in STOP:
            for suf in ('ing', 'ed', 'es', 's'):
                if w.endswith(suf) and len(w) - len(suf) > 3:
                    w = w[:-len(suf)]
                    break
            out.append(w)
    return out


def teaching_score(sent, bible_toks):
    """How much a sentence of Henry teaches rather than retells: higher is more. Returns (score, share of its words that are in the verses)."""
    plain = TAG.sub('', sent)
    t = toks(sent)
    ov = sum(1 for w in t if w in bible_toks) / max(1, len(t))
    ital = sum(W(m) for m in re.findall(r'<i>(.*?)</i>', sent)) / max(1, W(plain))     # italics are Henry quoting the verse
    sc = (1.0 * min(3, len(NORM.findall(plain))) + 1.1 * min(3, len(GENERAL.findall(plain))) + 0.5 * min(2, len(XREF.findall(plain)))
          - 0.9 * min(3, len(PAST.findall(plain))) - 1.2 * min(3, len(VERSEREF.findall(plain))) - 5.0 * max(0, ov - 0.25) - 2.5 * ital)
    if FORMULA.match(plain.strip()):
        sc -= 3.0
    if W(plain) < 7:
        sc -= 1.5
    if THESIS.match(plain):                 # "I. That man was made in God's image": the point of an observation, even in the verse's own words
        sc += 2.2 + 3.0 * max(0, ov - 0.25)
    return sc, ov


def sentences(par):
    """The sentences of a paragraph, with each item of Henry's numbered lists on its own. A number after "v." or after a chapter in
    Roman numerals ("Jam. v. 14.", "Rom. viii. 37.") is a verse, not a list number, and stays where it is."""
    out, a = [], 0
    for e in sentence_ends(par):
        out.append(par[a:e].strip())
        a = e
    if par[a:].strip():
        out.append(par[a:].strip())
    fine = []
    for t in out:
        pos = 0
        for m in LIST_AT.finditer(t):
            before = t[:m.start()].split()
            tok = re.sub(r'[.,;:()\[\]"\u201c\u201d\']', '', TAG.sub('', before[-1])).lower() if before else ''
            if re.match(r'\d', t[m.end():]) and (tok in ('v', 'vv', 'ver', 'vers', 'ch', 'chap') or re.fullmatch(r'[ivxlc]+', tok)):
                continue
            if t[pos:m.start()].strip():
                fine.append(t[pos:m.start()].strip())
            pos = m.end()
        if t[pos:].strip():
            fine.append(t[pos:].strip())
    return fine


def balance(t):
    """A run cut out of a paragraph never keeps a stray </i> or </b>, and never leaves one open."""
    out, stack = [], []
    for g in re.findall(r'</?[ib]>|[^<]+|<', t):
        if g in ('<i>', '<b>'):
            stack.append(g[1]); out.append(g)
        elif g in ('</i>', '</b>'):
            if stack and stack[-1] == g[2]:
                stack.pop(); out.append(g)
        else:
            out.append(g)
    return ''.join(out) + ''.join('</%s>' % c for c in reversed(stack))


STEM_STOP = set('''the and that for with this was were are but not his her him they them their there which who whom whose have has had been from shall will
 unto thou thee thy thine ye you your our upon into then than also such these those would should could when what where said saith hath doth being very
 more most much many some any all one two out over under about after before because while may might must can cannot let its'''.split())


def match_verse(run, verse_texts, first, lo, hi):
    """The verse (lo..hi) a run of Henry is most clearly about, or None. He wrote on groups of verses, not single ones, so this is
    only said when the words say it: the run shares clearly more (rarer) words with one verse than with any other."""
    vs = list(range(lo, hi + 1))
    def stems(t):
        return {w[:5] for w in re.findall(r"[a-z']+", TAG.sub(' ', t).lower()) if len(w) >= 4 and w not in STEM_STOP}
    vt = {v: stems(verse_texts[v - first]) for v in vs}
    df = {}
    for v in vs:
        for w in vt[v]:
            df[w] = df.get(w, 0) + 1
    rt = stems(run)
    sc = {v: sum(math.log(1 + len(vs) / df[w]) for w in rt & vt[v]) for v in vs}
    best = max(vs, key=lambda v: (sc[v], -v))
    second = sorted(sc.values())[-2]
    return best if sc[best] >= MATCH_MIN and sc[best] >= MATCH_RATIO * second else None


def excerpt(sections, a, b, words_of_bible, bible_text, verse_texts):
    """Henry on verses a..b: [{"v", "h", "p", "at"?}], the best of his teaching on them in about budget() words, in his order.
    "v" is the group of verses he wrote the section on; "at" (only when it differs from the last of them) is the verse a run best matches,
    which the reader puts it after, so a long group reads verse, Henry, verse, Henry."""
    H = budget(words_of_bible)
    bt = set(toks(bible_text))
    touch = [s for s in sections if s['v'][1] >= a and s['v'][0] <= b and s['p'] and window_of(s, a, b)]
    units = []
    for si, s in enumerate(touch):
        for pi, par in enumerate(window_of(s, a, b)):
            for st in sentences(par):
                sc, ov = teaching_score(st, bt)
                plain = ENUM.sub('', TAG.sub('', st), count=1).strip()
                head = W(plain) <= 12 and bool(HEADING.match(plain)) and not HAS_VERB.search(plain)       # a heading of a list, not a sentence
                if head and units and units[-1]['s'] == si and units[-1]['p'] == pi and lead_in(TAG.sub('', units[-1]['t'])):
                    head = False                                                         # but an item right after its lead-in ("it is, 1. An ancient song") is kept
                units.append({'s': si, 'p': pi, 't': st, 'sc': sc, 'w': W(TAG.sub('', st)), 'head': head})
    by_par = {}
    for idx, u in enumerate(units):
        by_par.setdefault((u['s'], u['p']), []).append(idx)
    cands = []                                     # (score, first, last, words, section): a run of whole sentences from one paragraph
    for (si, _), idxs in by_par.items():
        for x in range(len(idxs)):
            words = 0
            for y in range(x, len(idxs)):
                words += units[idxs[y]]['w']
                if words > RUN_MAX and y > x:
                    break
                if lead_in(TAG.sub('', units[idxs[y]]['t'])) or words < RUN_MIN or units[idxs[y]]['head'] or units[idxs[x]]['head']:   # never end on "observe," or "four things:—"
                    continue
                first = ENUM.sub('', TAG.sub('', units[idxs[x]]['t']), count=1).strip()      # the words, not the list number
                if not re.match(r"[A-Z\u201c\"\u2018'(\[<]", first):
                    continue                                                  # a run opens on a capital: a lower-case start is the tail of a sentence
                pen = 0.0
                if STRONG_BAD.match(first):
                    pen = 2.5 if x else 1.5                                   # begins "This"/"He": it needs the sentence before it
                elif WEAK_BAD.match(first):
                    pen = 1.0 if x else 0.4
                elif FRAGMENT.match(first):
                    pen = 1.2 if x else 0.8
                if PRONOUN8.search(' '.join(first.split()[:8])):
                    pen += 1.4 if x else 0.5                                  # and a "he"/"it"/"they" early on has no one to point at
                if x and lead_in(TAG.sub('', units[idxs[x - 1]]['t'])):
                    pen += 1.5                                                # an item of a list whose lead-in is not in the run
                if FORMULA.match(first):
                    pen += 2.0                                                # never open a lesson's teaching with the retelling
                whole = x == 0 and y == len(idxs) - 1                         # a whole paragraph stands on its own
                tot = sum(units[idxs[z]]['sc'] - LAMBDA for z in range(x, y + 1)) - pen + (0.8 if whole else 0)
                cands.append((tot, idxs[x], idxs[y], words, si))
    chosen, used, uses, left, total = [], set(), {}, H, 0
    # First, coverage: the lesson is read as verses then Henry on THOSE verses, so each group of verses (each of his sections) gets the best
    # short run he has on it, if it is any good. Sections whose best is only retelling are left to the plain verses.
    share = max(RUN_MIN + 12, int(H / max(1, min(len(touch), MAX_BLOCKS)) * 1.25))
    per_sec = {}
    for tot, i, j, words, si in cands:
        if words <= share and (si not in per_sec or tot > per_sec[si][0]):
            per_sec[si] = (tot, i, j, words, si)
    for tot, i, j, words, si in sorted(per_sec.values(), reverse=True)[:MAX_BLOCKS]:
        if tot < COVER_MIN or words > left + 30:
            continue
        chosen.append((i, j)); used.update(range(i, j + 1)); uses[si] = 1
        left -= words; total += words
    while True:
        best = None
        for tot, i, j, words, si in cands:
            if words > left + 30 or any(k in used for k in range(i, j + 1)):
                continue
            if si not in uses and len(uses) >= MAX_BLOCKS:                    # at most MAX_BLOCKS separate sections in one lesson
                continue
            adj = tot * (0.6 ** uses.get(si, 0)) if tot > 0 else tot          # the next run from the same section is worth less: spread it
            if best is None or adj > best[0]:
                best = (adj, i, j, words, si)
        if best is None or (total >= MIN_FILL * H and best[0] <= 1.0):          # the best there is, up to MIN_FILL; after that only what is really good
            break
        _, i, j, words, si = best
        chosen.append((i, j)); used.update(range(i, j + 1)); uses[si] = uses.get(si, 0) + 1
        left -= words; total += words
    chosen.sort()
    merged = []
    for i, j in chosen:
        if merged and merged[-1][1] + 1 == i and (units[i]['s'], units[i]['p']) == (units[merged[-1][1]]['s'], units[merged[-1][1]]['p']):
            merged[-1] = (merged[-1][0], j)
        else:
            merged.append((i, j))
    runs = []                                                       # (section, text, verse it is placed after) in Henry's order
    for i, j in merged:
        text = balance(' '.join(ENUM.sub('', units[z]['t'], count=1).strip() for z in range(i, j + 1) if not units[z]['head']))
        if not re.search(r'[.!?\u201d"\')\]:;\u2014]\s*(?:</[ib]>)*\s*$', text):                     # his paragraph runs on without a full stop: end ours
            text = re.sub(r'((?:</[ib]>)*)\s*$', r'.\1', text)
        runs.append([units[i]['s'], text, None])
    for si in sorted({r[0] for r in runs}):                          # place each run after the verse it is about, where that is clear
        sec = touch[si]
        lo, hi = max(a, sec['v'][0]), min(b, sec['v'][1])
        mine = [r for r in runs if r[0] == si]
        for r in mine:
            r[2] = match_verse(r[1], verse_texts, a, lo, hi) if hi - lo >= 3 else None
        prev = None
        for r in mine:                                               # unclear ones sit with their neighbour; no run goes back before the one before it
            if r[2] is None:
                r[2] = prev
            elif prev is not None and r[2] < prev:
                r[2] = prev
            prev = r[2] if r[2] is not None else prev
        first = next((r[2] for r in mine if r[2] is not None), None)
        for r in mine:
            if r[2] is None:
                r[2] = first if first is not None else hi
        # a run that nothing placed settles at the end of the group; one that came before a placed one keeps Henry's order by sitting with it
    blocks = []
    for si, text, at in runs:
        sec = touch[si]
        lo, hi = max(a, sec['v'][0]), min(b, sec['v'][1])
        if blocks and blocks[-1][0] == si and blocks[-1][1].get('at', hi) == at:
            blocks[-1][1]['p'].append(text)
        else:
            blk = {'v': [lo, hi]}
            if sec.get('h'):
                blk['h'] = sec['h']
            if at != hi:
                blk['at'] = at
            blk['p'] = [text]
            blocks.append((si, blk))
    return [blk for _, blk in blocks]


def words_of(t):
    """The words of a text and nothing else: no tags, punctuation, numbers or list numbers (Roman numerals), lower case."""
    return [w for w in re.findall(r"[a-z']+", TAG.sub(' ', t).lower()) if not re.fullmatch(r"[ivxlcdm]+", w)]


def not_his(x, mh):
    """Sentences of an excerpt that are not Henry's own words, or are out of his order: nothing may be made up, nothing rewritten.
    Compared by words only (balance() may close an italic tag and the list numbers are dropped), in order through the chapter."""
    src = words_of(' '.join(list(mh.get('i', [])) + [p for sec in mh.get('s', []) for p in sec['p']]))
    bad, at = [], 0
    for bl in x:
        for p in bl['p']:
            for chunk in re.split(r'(?:(?<=[.!?\u201d"])|(?<=[.!?\u201d"]</i>)|(?<=[.!?\u201d"]</b>))\s+(?=(?:<[ib]>)?[A-Z\u00c6\u0152\u201c"])', p):
                w = words_of(chunk)
                if len(w) < 5:
                    continue
                i = next((k for k in range(at, len(src) - len(w) + 1) if src[k:k + len(w)] == w), -1)
                if i < 0:
                    bad.append(chunk[:60])
                else:
                    at = i + 1
    return bad


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
                x = excerpt(secs, a, b, w, ' '.join(verses[a - 1:b]), verses[a - 1:b])
                if not x and mh.get('i'):                                   # Henry has no section here: his overview, in brief
                    x = [{'v': [a, b], 'p': [cut_sentences(mh['i'][0], budget(w))]}]
                if not x:
                    no_henry += 1
                put = a - 1
                for bl in x:                                                  # where each piece of Henry is placed: inside its group, inside the passage, never back before the one before
                    at = bl.get('at', bl['v'][1])
                    if not (a <= bl['v'][0] <= at <= bl['v'][1] <= b) or at < put:
                        problems.append('%s %d:%d-%d: a piece of Henry is placed badly (group %s, after verse %s, after the last piece at %s)' % (name, ch, a, b, bl['v'], at, put))
                    put = at
                for chunk in not_his(x, mh):
                    problems.append('%s %d:%d-%d: not Henry, or out of his order: %s' % (name, ch, a, b, chunk))
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
