import re
import json

path1 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix multi-line string replacements
content = re.sub(r'lên kịch bản, viết nội dung sản phẩm hay tóm tắt tài\s*liệu', "{{ 'app.ai_writer_subtitle' | transloco }}", content)
content = re.sub(r'Ví dụ:\s*https://type.vn/topic/45', "{{ 'app.example_rewrite_url' | transloco }}", content)

# Fix SEO image/links stats
content = re.sub(r'Có \{\{seo\[\'images\'\]\.total\}\} hình\s*ảnh', "{{ 'app.has_images' | transloco: {count: seo['images'].total} }}", content)
content = re.sub(r'Đã có \{\{\s*seo\[\'links\'\]\s*\}\} liên\s*kết', "{{ 'app.has_links' | transloco: {count: seo['links']} }}", content)

with open(path1, 'w', encoding='utf-8') as f:
    f.write(content)

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

vi_data['app.has_images'] = 'Có {{count}} hình ảnh'
en_data['app.has_images'] = 'Has {{count}} images'
vi_data['app.has_links'] = 'Đã có {{count}} liên kết'
en_data['app.has_links'] = 'Has {{count}} links'

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)
with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)

print("Fixed newlines and remaining SEO")
