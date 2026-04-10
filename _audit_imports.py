import ast
import re
from pathlib import Path
import sys

root = Path(r"C:/Users/msc_student/Desktop/Intelligent-Edu-Platform")
backend = root / "backend"
scan_dirs = [backend / "core", backend / "routes", backend / "services", backend / "schemas", backend / "scripts", backend / "infrastructure"]
exclude_parts = {"venv", "generated", "uploads", "tests", "__pycache__"}

py_files = []
for d in scan_dirs:
    if d.exists():
        for p in d.rglob("*.py"):
            if any(part in exclude_parts for part in p.parts):
                continue
            py_files.append(p)
if backend.exists():
    for p in backend.glob("*.py"):
        if p.is_file():
            py_files.append(p)

imports = set()
for f in sorted(set(py_files)):
    try:
        src = f.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            src = f.read_text(encoding="latin-1")
        except Exception:
            continue
    except Exception:
        continue
    try:
        tree = ast.parse(src, filename=str(f))
    except Exception:
        continue
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split('.')[0]
                if top:
                    imports.add(top)
        elif isinstance(node, ast.ImportFrom):
            if (node.level or 0) > 0:
                continue
            if node.module:
                top = node.module.split('.')[0]
                if top:
                    imports.add(top)

stdlib = set(getattr(sys, 'stdlib_module_names', set()))
local_toplevel = set()
if backend.exists():
    for child in backend.iterdir():
        if child.name.startswith('.'):
            continue
        if child.is_dir() and child.name not in exclude_parts and child.name != '__pycache__':
            local_toplevel.add(child.name)
        elif child.is_file() and child.suffix == '.py':
            local_toplevel.add(child.stem)

req_file = backend / "requirements.txt"
req_packages = set()
if req_file.exists():
    for line in req_file.read_text(encoding='utf-8', errors='ignore').splitlines():
        s = line.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith('-r ') or s.startswith('--requirement '):
            continue
        if s.startswith('-e ') or '://' in s or s.startswith('git+'):
            continue
        s = s.split(';', 1)[0].strip()
        m = re.match(r'^([A-Za-z0-9_.-]+)', s)
        if not m:
            continue
        req_packages.add(m.group(1).lower().replace('_','-'))

mapping = {
    'dotenv': ['python-dotenv'],
    'jose': ['python-jose'],
    'fitz': ['pymupdf'],
    'pil': ['pillow'],
    'cv2': ['opencv-python-headless'],
    'docx': ['python-docx'],
    'pptx': ['python-pptx'],
    'yaml': ['pyyaml'],
    'sklearn': ['scikit-learn'],
    'bson': ['pymongo'],
    'googleapiclient': ['google-api-python-client'],
    'google.oauth2': ['google-auth', 'google-auth-oauthlib', 'google-auth-httplib2'],
    'google_auth_oauthlib': ['google-auth', 'google-auth-oauthlib', 'google-auth-httplib2'],
    'google.auth': ['google-auth', 'google-auth-oauthlib', 'google-auth-httplib2'],
    'markdown_analysis': ['markdown_analysis'],
    'mrkdwn_analysis': ['markdown_analysis'],
}

def norm_dist(x):
    return x.lower().replace('_','-')

external_imports = set()
for mod in imports:
    if mod in stdlib or mod in local_toplevel or mod.startswith('_'):
        continue
    external_imports.add(mod)

missing = set()
for mod in sorted(external_imports):
    key = mod.lower()
    if key in mapping:
        needed = [norm_dist(x) for x in mapping[key]]
        if key in {'google.oauth2', 'google_auth_oauthlib', 'google.auth'}:
            if not any(n in req_packages for n in needed):
                missing.update(needed)
        else:
            if not any(n in req_packages for n in needed):
                missing.add(needed[0])
    else:
        cand = norm_dist(key)
        if cand not in req_packages:
            missing.add(cand)

used_req = set()
for mod in external_imports:
    key = mod.lower()
    if key in mapping:
        needed = [norm_dist(x) for x in mapping[key]]
        present = [n for n in needed if n in req_packages]
        if key in {'google.oauth2', 'google_auth_oauthlib', 'google.auth'}:
            used_req.update(present)
        elif present:
            used_req.add(present[0])
    else:
        cand = norm_dist(key)
        if cand in req_packages:
            used_req.add(cand)

unused_count = len(req_packages - used_req)
fully_covers = len(missing) == 0

print('MISSING:')
for pkg in sorted(missing):
    print(pkg)
print(f'UNUSED_COUNT: {unused_count}')
print('FULLY_COVERS: ' + ('yes' if fully_covers else 'no'))
