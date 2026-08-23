#!/usr/bin/env python3
"""
Generates the Stillwater app icon: a luminous orb on deep water with
expanding ripple rings. Pure Pillow, no external tooling.

    python3 scripts/make-icon.py
"""
from PIL import Image, ImageDraw, ImageFilter
import os

S = 1024
CX, CY = S * 0.5, S * 0.47


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def corner_gradient(size, tl, tr, bl, br):
    """Smooth 4-corner gradient by upscaling a 2x2 image."""
    small = Image.new("RGB", (2, 2))
    small.putpixel((0, 0), tl)
    small.putpixel((1, 0), tr)
    small.putpixel((0, 1), bl)
    small.putpixel((1, 1), br)
    return small.resize((size, size), Image.BICUBIC)


def radial(size, inner, outer, power=1.0):
    """Radial gradient drawn as concentric circles, then softened."""
    img = Image.new("RGB", (size, size), outer)
    d = ImageDraw.Draw(img)
    steps = 220
    for i in range(steps, 0, -1):
        t = (i / steps) ** power
        r = (size / 2) * t
        d.ellipse(
            [size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r],
            fill=lerp(inner, outer, t),
        )
    return img.filter(ImageFilter.GaussianBlur(size / 90))


# ---------------------------------------------------------------- background
icon = corner_gradient(
    S,
    tl=(11, 42, 71),      # deep navy
    tr=(16, 58, 96),
    bl=(20, 72, 116),
    br=(31, 100, 150),    # lifted blue
).convert("RGBA")

# glow from upper-left, like light entering water
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for i in range(160, 0, -1):
    t = i / 160
    r = S * 0.85 * t
    a = int(52 * (1 - t) ** 1.6)
    gd.ellipse([S * 0.16 - r, S * 0.04 - r, S * 0.16 + r, S * 0.04 + r],
               fill=(120, 220, 240, a))
icon = Image.alpha_composite(icon, glow.filter(ImageFilter.GaussianBlur(S / 32)))

# vignette so the orb reads at small sizes
vig = Image.new("RGBA", (S, S), (0, 0, 0, 0))
vd = ImageDraw.Draw(vig)
for i in range(120):
    t = i / 120
    r = S * (0.52 + 0.48 * t)
    vd.ellipse([CX - r, CY - r, CX + r, CY + r],
               outline=(4, 16, 32, int(2.4 * t)), width=int(S / 90))
icon = Image.alpha_composite(icon, vig.filter(ImageFilter.GaussianBlur(S / 46)))

# ------------------------------------------------------------------- ripples
rip = Image.new("RGBA", (S, S), (0, 0, 0, 0))
rd = ImageDraw.Draw(rip)
for k, (rr, alpha, w) in enumerate([
    (0.215, 150, 0.0130),
    (0.300, 96,  0.0105),
    (0.395, 58,  0.0088),
    (0.495, 30,  0.0072),
]):
    r = S * rr
    squash = 0.90                      # slight ellipse = water surface
    rd.ellipse(
        [CX - r, CY - r * squash, CX + r, CY + r * squash],
        outline=(168, 236, 240, alpha),
        width=max(2, int(S * w)),
    )
icon = Image.alpha_composite(icon, rip.filter(ImageFilter.GaussianBlur(S / 420)))

# ---------------------------------------------------------------------- orb
OR = S * 0.158
orb = radial(int(OR * 2), inner=(196, 250, 246), outer=(28, 118, 168), power=1.35)

mask = Image.new("L", orb.size, 0)
ImageDraw.Draw(mask).ellipse([0, 0, orb.size[0] - 1, orb.size[1] - 1], fill=255)

# outer bloom
bloom = Image.new("RGBA", (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(bloom)
for i in range(90, 0, -1):
    t = i / 90
    r = OR * (1 + 1.5 * t)
    bd.ellipse([CX - r, CY - r, CX + r, CY + r],
               fill=(96, 214, 232, int(30 * (1 - t) ** 1.5)))
icon = Image.alpha_composite(icon, bloom.filter(ImageFilter.GaussianBlur(S / 40)))

icon.paste(orb, (int(CX - OR), int(CY - OR)), mask)

# specular highlight — kept well inside the orb so it reads as sheen, not a blob
spec = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(spec)
hx, hy = CX - OR * 0.30, CY - OR * 0.36
sd.ellipse([hx - OR * 0.26, hy - OR * 0.16, hx + OR * 0.26, hy + OR * 0.16],
           fill=(255, 255, 255, 120))
spec = spec.filter(ImageFilter.GaussianBlur(S / 52))
spec.putalpha(spec.getchannel("A").point(lambda v: int(v * 0.9)))
icon = Image.alpha_composite(icon, spec)

# crisp rim so the orb separates from the water
rim = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(rim).ellipse(
    [CX - OR, CY - OR, CX + OR, CY + OR],
    outline=(214, 250, 250, 96), width=max(2, int(S * 0.0035)),
)
icon = Image.alpha_composite(icon, rim.filter(ImageFilter.GaussianBlur(S / 700)))

out = os.path.join(
    os.path.dirname(__file__), "..",
    "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
)
icon.convert("RGB").save(os.path.abspath(out), "PNG")
print("wrote", os.path.abspath(out))

# preview strip at real icon sizes, to sanity-check small-size legibility
prev = Image.new("RGB", (60 + 120 + 180 + 80, 200), (24, 24, 28))
x = 20
for sz in (60, 120, 180):
    prev.paste(icon.convert("RGB").resize((sz, sz), Image.LANCZOS), (x, 20))
    x += sz + 20
prev.save("/tmp/icon-preview.png")
print("preview /tmp/icon-preview.png")
