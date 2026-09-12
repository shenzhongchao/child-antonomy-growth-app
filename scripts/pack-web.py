#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Package dist/ into a ZIP ready for EdgeOne Pages "直接上传".

EdgeOne Pages requires index.html to sit at the *outermost* level of the
archive (a nested dist/ folder causes a 404 on the homepage), so this script
flattens dist/ into the archive root and verifies the result.

Usage:
    python scripts/pack-web.py [output.zip]

Default output: release/today-i-control-pwa.zip
"""
import os
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DIST = os.path.join(ROOT, 'dist')
DEFAULT_OUT = os.path.join(ROOT, 'release', 'today-i-control-pwa.zip')

SKIP_PREFIX = ('__', '.')          # verify.js temp pages, OS junk
ILLEGAL = set('\\/:*?"<>|')
MAX_FILE_MB = 25
MAX_FILES = 20000


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    out = os.path.abspath(out)
    if not os.path.isdir(DIST):
        sys.exit('missing dist/')

    names = []
    for name in sorted(os.listdir(DIST)):
        path = os.path.join(DIST, name)
        if not os.path.isfile(path) or name.startswith(SKIP_PREFIX):
            continue
        if ILLEGAL & set(name):
            sys.exit('illegal character in filename: ' + name)
        size_mb = os.path.getsize(path) / 1024.0 / 1024.0
        if size_mb > MAX_FILE_MB:
            sys.exit('%s is %.1fMB, over the %dMB limit' % (name, size_mb, MAX_FILE_MB))
        names.append(name)

    if 'index.html' not in names:
        sys.exit('dist/index.html is missing')
    if len(names) > MAX_FILES:
        sys.exit('too many files: %d' % len(names))

    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in names:
            z.write(os.path.join(DIST, name), name)

    with zipfile.ZipFile(out) as z:
        inside = z.namelist()
    if 'index.html' not in inside:
        sys.exit('packaging error: index.html is not at the archive root')
    if any('/' in n for n in inside):
        sys.exit('packaging error: archive contains nested folders')

    print('%s' % out)
    print('%d files, %.2f MB' % (len(inside), os.path.getsize(out) / 1024.0 / 1024.0))
    for n in inside:
        print('  %-26s %8.1f KB' % (n, os.path.getsize(os.path.join(DIST, n)) / 1024.0))


if __name__ == '__main__':
    main()
