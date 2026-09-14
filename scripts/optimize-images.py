#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert the artwork in assets/ into WebP for dist/ (the shipped web app).

Why WebP: the three PNGs in assets/ weigh ~5.7MB, which is painful on mobile.
WebP cuts that by ~90% at a quality you cannot see the difference in.

Usage:
    python scripts/optimize-images.py

CONSTRAINTS — do not "improve" these without checking the CSS:

  * growth-art.png is a SPRITE SHEET. styles.css sets
    `background-size: 738.5px 1043.7px` and pins each icon with absolute pixel
    offsets (.bag { background-position: -63px -328px }, etc.). Resizing it
    would shift every icon, so it must keep its exact pixel dimensions.

  * assets/ keeps the original PNGs because
    scripts/make-icons.py wants the full-resolution source for icons.

  * Only dist/ is packaged for the web (see scripts/pack-web.py), so the
    originals never reach the deployed site.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is required: pip install Pillow')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
DIST = os.path.join(ROOT, 'dist')

# name, max width (None = keep exact size), quality
JOBS = [
    ('growth-art.png', None, 92),        # sprite sheet: exact size, quality first
    ('star-friend.png', 512, 90),        # largest use is .mascot at 108px
    ('storybook-scene.png', 1200, 85),   # full-width hero, has priority
]

total_before = 0
total_after = 0

for name, max_width, quality in JOBS:
    src = os.path.join(ASSETS, name)
    if not os.path.exists(src):
        sys.exit('missing source: ' + src)

    out_name = os.path.splitext(name)[0] + '.webp'
    out = os.path.join(DIST, out_name)

    im = Image.open(src)
    original_size = os.path.getsize(src)
    mode = im.mode
    w, h = im.size

    if max_width and w > max_width:
        ratio = max_width / float(w)
        im = im.resize((max_width, max(1, round(h * ratio))), Image.LANCZOS)

    im.save(out, format='WEBP', quality=quality, method=6)

    new_size = os.path.getsize(out)
    total_before += original_size
    total_after += new_size
    print('%-22s %s %dx%d -> %dx%d  q%-3d  %7.1f KB -> %6.1f KB  (-%.0f%%)' % (
        name, mode, w, h, im.size[0], im.size[1], quality,
        original_size / 1024.0, new_size / 1024.0,
        (1 - new_size / float(original_size)) * 100))

print('')
print('total: %.2f MB -> %.2f MB  (-%.0f%%)' % (
    total_before / 1024.0 / 1024.0,
    total_after / 1024.0 / 1024.0,
    (1 - total_after / float(total_before)) * 100))
