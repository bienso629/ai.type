import re
import json

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix labels
content = re.sub(r'label="Đoạn văn \((.*?)\)"', r'label="{{ \'app.paragraph\' | transloco }} (\1)"', content)
content = re.sub(r'label="Tiêu đề \((.*?)\)"', r'label="{{ \'app.title\' | transloco }} (\1)"', content)
content = re.sub(r'label="HTML \((.*?)\)"', r'label="HTML (\1)"', content)
content = re.sub(r'label="Dàn ý"', r'label="{{ \'app.outline\' | transloco }}"', content)
content = re.sub(r'label="Đã xoá \((.*?)\)"', r'label="{{ \'app.deleted\' | transloco }} (\1)"', content)

# Fix tooltips
content = content.replace('Xoá đoạn văn', "{{ 'app.delete_paragraph' | transloco }}")
content = content.replace('Xóa dàn ý', "{{ 'app.delete_outline' | transloco }}")

# Fix missing "Copy" and "Tập của bạn" 
content = content.replace('    Copy', "    {{ 'app.copy_text' | transloco }}")

content = re.sub(r'Tập của\s*bạn', "{{ 'app.your_episode' | transloco }}", content, flags=re.MULTILINE)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

vi_data['app.delete_paragraph'] = 'Xoá đoạn văn'
en_data['app.delete_paragraph'] = 'Delete paragraph'
vi_data['app.delete_outline'] = 'Xóa dàn ý'
en_data['app.delete_outline'] = 'Delete outline'

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)
with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)

print("Done")
