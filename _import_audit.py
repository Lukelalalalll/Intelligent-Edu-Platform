import ast, re, sys
from pathlib import Path
from collections import Counter
from importlib import metadata as md

root = Path('backend')
stdlib = set(getattr(sys, 'stdlib_module_names', set())) | set(sys.builtin_module_names)

exclude_dir_names = {'tests','__pycache__','.venv','venv','env','.env','site-packages','dist-packages','Lib','Scripts','node_modules','.git'}

def is_excluded(path: Path):
    parts = set(path.parts)
    return any(p in exclude_dir_names for p in path.parts)

local_toplevel = set()
for p in root.iterdir():
    if p.name in exclude_dir_names:
        continue
    if p.is_file() and p.suffix == '.py':
        local_toplevel.add(p.stem)
    elif p.is_dir() and (p / '__init__.py').exists():
        local_toplevel.add(p.name)

imports = set()
for py in root.rglob('*.py'):
    rel = py.relative_to(root)
    if is_excluded(rel.parent):
        continue
    try:
        text = py.read_text(encoding='utf-8')
        tree = ast.parse(text)
    except Exception:
        continue
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for a in node.names:
                imports.add(a.name.split('.')[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module.split('.')[0])

filtered = sorted(m for m in imports if m and m not in stdlib and not m.startswith('backend') and m not in local_toplevel)

req_lines = (root/'requirements.txt').read_text(encoding='utf-8').splitlines()

def norm(n:str)->str:
    return re.sub(r'[-_.]+','-',n).lower()

req_raw=[]
for line in req_lines:
    line=line.strip()
    if not line or line.startswith('#'):
        continue
    if line.startswith(('-r','--requirement','-c','--constraint','-f','--find-links','--index-url','--extra-index-url','--trusted-host')):
        continue
    if line.startswith('-e '):
        line=line[3:].strip()
    if '#egg=' in line:
        req_raw.append(line.split('#egg=',1)[1].strip())
        continue
    m=re.match(r'^([A-Za-z0-9_.-]+)',line)
    if m:
        req_raw.append(m.group(1))

req_norm=[norm(x) for x in req_raw]
req_set=set(req_norm)
dups=sorted(k for k,v in Counter(req_norm).items() if v>1)

pkg_map=md.packages_distributions()
missing=set()
for mod in filtered:
    dists=pkg_map.get(mod)
    if dists:
        dnorm=[norm(d) for d in dists]
        if not any(d in req_set for d in dnorm):
            missing.add(dnorm[0])
    else:
        mnorm=norm(mod)
        if mnorm not in req_set:
            missing.add(mnorm)

print('MISSING:', ', '.join(sorted(missing)) if missing else 'None')
print('DUPLICATES:', ', '.join(dups) if dups else 'None')
