"""把 logo 字标内联进 template.html，生成 index.html。字标取自 ../logo/wordmark-next-*.svg。"""
import json
import pathlib

d = pathlib.Path(__file__).parent
wm = {k: (d.parent / 'logo' / f'wordmark-next-{k}.svg').read_text(encoding='utf-8') for k in ('light', 'dark')}
t = (d / 'template.html').read_text(encoding='utf-8')
(d / 'index.html').write_text(t.replace('__WM__', json.dumps(wm, ensure_ascii=False)), encoding='utf-8')
print('ok', (d / 'index.html').stat().st_size)
