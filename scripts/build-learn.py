#!/usr/bin/env python3 -I
"""Build the Learn tab's ideas: learn/ideas.json, from the hand-written sources in scripts/learn-src/*.py.

    python3 -I scripts/build-learn.py

Each source file defines CARDS = [C(...), ...] for one series (the helpers below are in scope; nothing to import). A card is ONE idea:

    C('fluency', 'The fluency illusion',                          # id, headline
      'Why does re-reading feel like learning when it mostly is not?',   # hook: the question that makes you want the answer
      ['para 1', 'para 2'],                                        # the idea, at most ~85 words in all
      'Picture it: ...',                                           # a concrete example
      'Familiar is not the same as learned.',                      # the line to carry
      ('Which is a better test?', ['a', 'b', 'c'], 1, 'why b'),    # a recall check: question, 3 options, index of the right one, why
      'Koriat & Bjork, 2005',                                      # the source (a person and a year, or the field's standard reference)
      'solid',                                                     # how settled it is: solid | mixed | contested
      viz=curve(...))                                              # the animated picture (see the helpers) or demo('stroop')

ACCURACY is the point of this tab. A claim goes in only if it is well established or is shown for what it is: 'mixed' (the evidence is
mixed or the effect is small) and 'contested' (popular, but it has failed to replicate or is disputed) are labelled on the card. Numbers
are used only when they are the published figures; a picture that is only the SHAPE of a finding says so (note='Illustration').

Checks (the build exits 1 on any): ids unique, lengths, one right answer, a source, a valid picture. Prints counts and reading time.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'learn-src')
OUT = os.path.join(ROOT, 'learn', 'ideas.json')

# id, name, colour (all clear 4.5:1 on the dark cards), the order series are mixed in
TRACKS = [
    ('learn', 'How you learn', '#7FE3D4'),
    ('think', 'Thinking clearly', '#F4D9A4'),
    ('mind', 'Mind and emotion', '#F5A8C0'),
    ('brain', 'Brain and body', '#BBA9F7'),
    ('sci', 'How the world works', '#8FD0F0'),
    ('num', 'Numbers and evidence', '#F2B365'),
    ('people', 'People', '#9FE49A'),
]
CONF = ('solid', 'mixed', 'contested')


# ---- the pictures: plain data, drawn and animated by the page --------------------------------------------------------------------
def curve(x, y, a, al, b=None, bl=None, note=None):
    """A line that draws itself (and, optionally, a second line to compare). Points are [x, y] in 0..100."""
    return {'k': 'curve', 'x': x, 'y': y, 'a': a, 'al': al, 'b': b, 'bl': bl, 'note': note}

def bars(data, hi=None, note=None):
    """Bars that grow. data = [[label, value, text-on-the-bar], ...] (value 0..100 sets the height)."""
    return {'k': 'bars', 'd': data, 'hi': hi, 'note': note}

def dots(n, groups, cols=None, note=None):
    """n dots that fill in by group: groups = [[count, label], ...], the rest stay plain."""
    return {'k': 'dots', 'n': n, 'g': groups, 'cols': cols, 'note': note}

def steps(items, loop=False, note=None):
    """Boxes that light up one after another (a loop repeats)."""
    return {'k': 'steps', 's': items, 'loop': loop, 'note': note}

def vs(a, b, note=None):
    """Two panels side by side, each [title, text]."""
    return {'k': 'vs', 'a': a, 'b': b, 'note': note}

def scale(l, r, marks, note=None):
    """A spectrum from l to r with markers that slide in: marks = [[label, position 0..100], ...]."""
    return {'k': 'scale', 'l': l, 'r': r, 'm': marks, 'note': note}

def venn(a, b, o, note=None, mode='overlap'):
    """Two circles: mode 'overlap' (they share something), 'nested' (b sits inside a) or 'apart' (separate). o is the caption."""
    return {'k': 'venn', 'a': a, 'b': b, 'o': o, 'note': note, 'mode': mode}

def wave(items, note=None):
    """Moving waves: items = [[label, wavelength 1..10, colour]]."""
    return {'k': 'wave', 'w': items, 'note': note}

def orbit(kind, note=None):
    return {'k': 'orbit', 'kind': kind, 'note': note}

def spread(note=None):
    return {'k': 'spread', 'note': note}

def demo(name):
    """Something to DO: stroop, span, calib, wason."""
    return {'k': 'demo', 'd': name}

VIZ = {'curve', 'bars', 'dots', 'steps', 'vs', 'scale', 'venn', 'wave', 'orbit', 'spread', 'demo'}
DEMOS = {'stroop', 'span', 'calib', 'wason'}
HELPERS = dict(curve=curve, bars=bars, dots=dots, steps=steps, vs=vs, scale=scale, venn=venn, wave=wave, orbit=orbit, spread=spread, demo=demo)


def C(id, h, hook, p, ex, k, q, src, c='solid', viz=None):
    return {'id': id, 'h': h, 'hook': hook, 'p': p, 'ex': ex, 'k': k, 'q': {'q': q[0], 'o': q[1], 'a': q[2], 'w': q[3]}, 'src': src, 'c': c, 'viz': viz}


HELPERS['C'] = C
W = lambda s: len(s.split())


def check(card, track, seen):
    """Problems with one card, as strings."""
    bad, i = [], card['id']
    if not re.fullmatch(r'[a-z0-9-]{3,30}', i): bad.append('id %r' % i)
    if i in seen: bad.append('id used twice')
    if W(card['h']) > 9 or len(card['h']) > 56: bad.append('headline too long: %d chars' % len(card['h']))
    if len(card['hook']) > 120 or not card['hook'].endswith(('?', '.', '!')): bad.append('hook: %d chars, ends %r' % (len(card['hook']), card['hook'][-1:]))
    if not 1 <= len(card['p']) <= 3 or sum(W(x) for x in card['p']) > 95: bad.append('body: %d paragraphs, %d words' % (len(card['p']), sum(W(x) for x in card['p'])))
    if W(card['ex']) > 70 or W(card['ex']) < 8: bad.append('example: %d words' % W(card['ex']))
    if len(card['k']) > 150 or len(card['k']) < 12: bad.append('takeaway: %d chars' % len(card['k']))
    q = card['q']
    if not (len(q['o']) == 3 and len(set(q['o'])) == 3 and isinstance(q['a'], int) and 0 <= q['a'] < 3): bad.append('quiz options/answer')
    if len(q['q']) > 150 or any(len(o) > 70 for o in q['o']) or W(q['w']) > 55 or not q['w']: bad.append('quiz lengths')
    if not card['src'] or len(card['src']) > 110: bad.append('source missing or long')
    if card['c'] not in CONF: bad.append('confidence %r' % card['c'])
    v = card['viz']
    if not v or v.get('k') not in VIZ: bad.append('picture missing or unknown')
    elif v['k'] == 'demo' and v['d'] not in DEMOS: bad.append('demo %r' % v['d'])
    elif v['k'] == 'curve' and not (len(v['a']) >= 3 and all(len(p) == 2 and 0 <= p[0] <= 100 and 0 <= p[1] <= 100 for p in v['a'] + (v['b'] or []))): bad.append('curve points')
    elif v['k'] == 'bars' and not (2 <= len(v['d']) <= 7 and all(0 <= r[1] <= 100 for r in v['d'])): bad.append('bars')
    elif v['k'] == 'dots' and not (v['n'] <= 1000 and sum(g[0] for g in v['g']) <= v['n']): bad.append('dots')
    elif v['k'] == 'steps' and not 2 <= len(v['s']) <= 5: bad.append('steps')
    elif v['k'] == 'scale' and not all(0 <= m[1] <= 100 for m in v['m']): bad.append('scale')
    elif v['k'] == 'wave' and not 1 <= len(v['w']) <= 3: bad.append('wave')
    elif v['k'] == 'venn' and v['mode'] not in ('overlap', 'nested', 'apart'): bad.append('venn mode')
    for field in [card['h'], card['hook'], card['ex'], card['k'], card['src'], q['q'], q['w']] + card['p'] + q['o']:
        if re.search(r'\s{2,}|<|>|\[\[', field): bad.append('markup or double space in %r' % field[:30])
    return ['%s %s: %s' % (track, i, b) for b in bad]


def main():
    problems, cards, by_track = [], [], {}
    seen = set()
    for tid, name, colour in TRACKS:
        path = os.path.join(SRC, tid + '.py')
        if not os.path.exists(path):
            problems.append('no source for series %s (%s)' % (tid, path)); continue
        ns = dict(HELPERS)
        exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), ns)
        for c in ns['CARDS']:
            problems.extend(check(c, tid, seen)); seen.add(c['id'])
            c['t'] = tid
            by_track.setdefault(tid, []).append(c)
    # the order in which new ideas arrive: the series taken in turn, so no two in a row are from the same one, each in its own order
    order, idx = [], {t: 0 for t in by_track}
    while any(idx[t] < len(by_track[t]) for t in by_track):
        for tid, _, _ in TRACKS:
            if tid in by_track and idx[tid] < len(by_track[tid]):
                order.append(by_track[tid][idx[tid]]['id']); idx[tid] += 1
    for t in by_track: cards.extend(by_track[t])
    out = {'v': 1, 'tracks': [{'id': t, 'n': n, 'c': col} for t, n, col in TRACKS if t in by_track], 'cards': cards, 'order': order}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    words = [sum(W(x) for x in c['p']) + W(c['ex']) + W(c['k']) + W(c['hook']) for c in cards]
    secs = [w / 3.3 + 14 for w in words]            # reading at ~200 words a minute, plus the check
    print('ideas: %d in %d series (%s)' % (len(cards), len(by_track), ', '.join('%s %d' % (t, len(v)) for t, v in by_track.items())))
    print('confidence: %s' % ', '.join('%s %d' % (k, sum(1 for c in cards if c['c'] == k)) for k in CONF))
    print('pictures: %s' % ', '.join('%s %d' % (k, sum(1 for c in cards if c['viz']['k'] == k)) for k in sorted(VIZ)))
    print('about %d seconds a card (%d words); five minutes is about %d ideas; the library is about %d days of five minutes' % (
        sum(secs) / len(secs), sum(words) / len(words), 300 / (sum(secs) / len(secs)), sum(secs) / 300))
    print('written learn/ideas.json (%d bytes)' % os.path.getsize(OUT))
    for p in problems[:40]: print('PROBLEM', p)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
