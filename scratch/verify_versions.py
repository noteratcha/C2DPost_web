import json, re

# 1. src/config.js
config_txt = open('src/config.js', encoding='utf-8').read()
v_config = re.search(r'APP_VERSION\s*=\s*[\'"]([^\'"]+)[\'"]', config_txt).group(1)

# 2. package.json
pkg = json.load(open('package.json', encoding='utf-8'))
v_pkg = pkg['version']

# 3. api/core/convert_dpost.py
py_txt = open('api/core/convert_dpost.py', encoding='utf-8').read()
v_py = re.search(r'__version__\s*=\s*[\'"]([^\'"]+)[\'"]', py_txt).group(1)

# 4. PROJECT_DOCUMENTATION.md
doc_txt = open('PROJECT_DOCUMENTATION.md', encoding='utf-8').read()
v_doc = 'v2026.0924.2340' in doc_txt

# 5. ROADMAP_REPORT_FEATURE.md
road_txt = open('ROADMAP_REPORT_FEATURE.md', encoding='utf-8').read()
v_road = 'v2026.0924.2340' in road_txt

# 6. BUGFIX_REPORT.md
bug_txt = open('BUGFIX_REPORT.md', encoding='utf-8').read()
v_bug = 'v2026.0924.2340' in bug_txt

print('Config:', v_config)
print('Package:', v_pkg)
print('Python:', v_py)
print('Doc matches:', v_doc)
print('Roadmap matches:', v_road)
print('Bugfix matches:', v_bug)

assert v_config == 'v2026.0924.2340', 'Config version mismatch'
assert v_pkg == '2026.0924.2340', 'Package version mismatch'
assert v_py == '2026.0924.2340', 'Python version mismatch'
assert v_doc, 'Doc version mismatch'
assert v_road, 'Roadmap version mismatch'
assert v_bug, 'Bugfix version mismatch'
print('ALL 6 VERSIONS PERFECTLY SYNCHRONIZED TO v2026.0924.2340!')
