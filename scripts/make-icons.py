#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Generate PWA icons for dist/ from assets/star-friend.png.

Usage:
    python scripts/make-icons.py

Requires Pillow. Outputs are written into dist/ (tracked source):
    favicon-32.png, icon-192.png, icon-512.png,
    icon-192-maskable.png, icon-512-maskable.png, apple-touch-icon.png

Ratios are derived from the real silhouette radius of the artwork, so the
maskable variants are guaranteed to survive Android's circular safe-area crop.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow is required: pip install Pillow')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, 'dist')
# full-resolution source; dist/ only ships the downscaled WebP
SOURCE = os.path.join(ROOT, 'assets', 'star-friend.png')
BG = (230, 246, 255, 255)  # #e6f6ff, matches <meta name="theme-color">

MASK_SAFE_RADIUS = 0.40   # Android maskable safe zone = circle of 80% diameter
ANY_SAFE_RADIUS = 0.44    # generous margin so rounded-square launchers never clip


def silhouette_radius(image):
    """Farthest opaque pixel from the centre, normalised by image width."""
    probe = image.resize((256, 256), Image.LANCZOS)
    alpha = probe.getchannel('A')
    cx = cy = 128
    best = 0.0
    for y in range(256):
        for x in range(256):
            if alpha.getpixel((x, y)) > 8:
                d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
                if d > best:
                    best = d
    return best / 256.0


def render(size, ratio, bg=None):
    """Scale the silhouette to `ratio` of the canvas and centre it."""
    canvas = Image.new('RGBA', (size, size), bg if bg else (0, 0, 0, 0))
    inner = size * ratio
    w, h = CONTENT.size
    k = inner / max(w, h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    art = CONTENT.resize((nw, nh), Image.LANCZOS)
    canvas.paste(art, ((size - nw) // 2, (size - nh) // 2), art)
    return canvas


if not os.path.exists(SOURCE):
    sys.exit('missing source: ' + SOURCE)

src = Image.open(SOURCE).convert('RGBA')
CONTENT = src.crop(src.getchannel('A').getbbox())

radius = silhouette_radius(CONTENT)
mask_ratio = MASK_SAFE_RADIUS / radius * 0.98
any_ratio = min(0.80, ANY_SAFE_RADIUS / radius * 0.98)
print('content %dx%d  silhouette radius %.3f' % (CONTENT.size[0], CONTENT.size[1], radius))
print('ratios: any=%.3f maskable=%.3f' % (any_ratio, mask_ratio))

JOBS = [
    ('favicon-32.png', 32, min(0.94, any_ratio), None),
    ('icon-192.png', 192, any_ratio, None),
    ('icon-512.png', 512, any_ratio, None),
    ('icon-192-maskable.png', 192, mask_ratio, BG),
    ('icon-512-maskable.png', 512, mask_ratio, BG),
    ('apple-touch-icon.png', 180, any_ratio, BG),  # iOS ignores alpha, needs opaque
]

for name, size, ratio, bg in JOBS:
    out = os.path.join(DIST, name)
    render(size, ratio, bg).save(out, format='PNG', optimize=True)
    print('%-26s %4dpx  %6.1f KB' % (name, size, os.path.getsize(out) / 1024.0))
print('done')
