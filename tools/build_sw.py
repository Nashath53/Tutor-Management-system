"""Builds sw.js: lists every app file to precache and sets a VERSION hash from their contents.
Run after ANY change to HTML/CSS/JS:  python3 tools/build_sw.py   (the new hash triggers the auto-update)."""
import os, hashlib, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = []
for d, dirs, fs in os.walk(ROOT):
    dirs[:] = [x for x in dirs if x not in ('.git', 'tools', 'supabase', 'docs', 'node_modules')]
    for f in fs:
        if f.endswith(('.html', '.css', '.js', '.png', '.webmanifest', '.svg', '.woff2')) and f != 'sw.js':
            files.append(os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/'))
files.sort()
h = hashlib.sha256()
for f in files: h.update(f.encode()); h.update(open(os.path.join(ROOT, f), 'rb').read())
version = h.hexdigest()[:10]
tpl = open(os.path.join(ROOT, 'tools', 'sw-template.js')).read()
urls = ['./'] + ['./' + f for f in files]
open(os.path.join(ROOT, 'sw.js'), 'w').write(tpl.replace('__VERSION__', version).replace('__PRECACHE__', json.dumps(urls, indent=2)))
print('sw.js version', version, '-', len(urls), 'files')
