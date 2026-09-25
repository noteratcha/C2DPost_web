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
v_doc = 'v2026.0925.0705' in doc_txt

# 5. ROADMAP_REPORT_FEATURE.md
road_txt = open('ROADMAP_REPORT_FEATURE.md', encoding='utf-8').read()
v_road = 'v2026.0925.0705' in road_txt

# 6. BUGFIX_REPORT.md
bug_txt = open('BUGFIX_REPORT.md', encoding='utf-8').read()
v_bug = 'v2026.0925.0705' in bug_txt

# 7. C2DPost_Python/convert_dpost.py
py_desktop_txt = open('../C2DPost_Python/convert_dpost.py', encoding='utf-8').read()
v_py_desktop = re.search(r'__version__\s*=\s*[\'"]([^\'"]+)[\'"]', py_desktop_txt).group(1)

# 8. SKILL.md
skill_txt = open('../.agents/skills/c2dpost-web-workflow/SKILL.md', encoding='utf-8').read()
v_skill = 'v2026.0925.0705' in skill_txt

print('Config:', v_config)
print('Package:', v_pkg)
print('Python (API):', v_py)
print('Python (Desktop):', v_py_desktop)
print('Doc matches:', v_doc)
print('Roadmap matches:', v_road)
print('Bugfix matches:', v_bug)
print('Skill matches:', v_skill)

assert v_config == 'v2026.0925.0705', 'Config version mismatch'
assert v_pkg == '2026.0925.0705', 'Package version mismatch'
assert v_py == '2026.0925.0705', 'Python API version mismatch'
assert v_py_desktop == '2026.0925.0705', 'Python Desktop version mismatch'
assert v_doc, 'Doc version mismatch'
assert v_road, 'Roadmap version mismatch'
assert v_bug, 'Bugfix version mismatch'
assert v_skill, 'Skill version mismatch'
print('ALL TRACKING LOCATIONS PERFECTLY SYNCHRONIZED TO v2026.0925.0705!')
