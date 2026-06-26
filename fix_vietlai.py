import re
import json

path1 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('<mat-label class="ml-2">Viết lại</mat-label>', '<mat-label class="ml-2">{{ \'app.rewrite\' | transloco }}</mat-label>')

with open(path1, 'w', encoding='utf-8') as f:
    f.write(content)

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

vi_data['app.rewrite'] = 'Viết lại'
en_data['app.rewrite'] = 'Rewrite'

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)
with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)

print("Fixed Viet lai")
