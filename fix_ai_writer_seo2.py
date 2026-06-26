import re
import json

path1 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
path2 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/microsites/archive/archive.component.html'

def process_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except FileNotFoundError:
        return
    
    replacements = {
        'Nội dung': "{{ 'app.content_label' | transloco }}",
        'Liên kết': "{{ 'app.link_label' | transloco }}",
        'Hình ảnh': "{{ 'app.image_label' | transloco }}",
        'Kiểm tra điểm SEO': "{{ 'app.check_seo_score' | transloco }}",
        
        'Tiêu đề quá dài': "{{ 'app.title_too_long' | transloco }}",
        'Tiêu đề chuẩn': "{{ 'app.title_perfect' | transloco }}",
        'Tiêu đề đạt': "{{ 'app.title_achieved' | transloco }}",
        
        'Mô tả quá dài': "{{ 'app.description_too_long' | transloco }}",
        'Mô tả tuyệt vời': "{{ 'app.description_perfect' | transloco }}",
        
        'tiêu đề,': "{{ 'app.headings_count_label' | transloco }},",
        'hình ảnh': "{{ 'app.images_count_label' | transloco }}",
        
        'H1 không có': "{{ 'app.h1_missing' | transloco }}"
    }
    
    # We must be careful about "Nội dung" and "Hình ảnh" not replacing other parts. 
    # Usually they are inside <mat-label class="my-2 pb-2 ml-0">Nội dung</mat-label>
    # So we replace the exact tag:
    content = content.replace('<mat-label class="my-2 pb-2 ml-0">Nội dung</mat-label>', '<mat-label class="my-2 pb-2 ml-0">{{ \'app.content_label\' | transloco }}</mat-label>')
    content = content.replace('<mat-label class="my-2 pb-2 ml-0">Liên kết</mat-label>', '<mat-label class="my-2 pb-2 ml-0">{{ \'app.link_label\' | transloco }}</mat-label>')
    content = content.replace('<mat-label class="my-2 pb-2 ml-0">Hình ảnh</mat-label>', '<mat-label class="my-2 pb-2 ml-0">{{ \'app.image_label\' | transloco }}</mat-label>')
    content = content.replace('<mat-label class="my-2 pb-2 ml-0">Mô tả</mat-label>', '<mat-label class="my-2 pb-2 ml-0">{{ \'app.description_label\' | transloco }}</mat-label>')
    content = content.replace('<mat-label class="ml-2">Kiểm tra điểm SEO</mat-label>', '<mat-label class="ml-2">{{ \'app.check_seo_score\' | transloco }}</mat-label>')

    content = content.replace('Tiêu đề quá dài', "{{ 'app.title_too_long' | transloco }}")
    content = content.replace('Tiêu đề chuẩn', "{{ 'app.title_perfect' | transloco }}")
    content = content.replace('Tiêu đề đạt', "{{ 'app.title_achieved' | transloco }}")
    content = content.replace('Mô tả quá dài', "{{ 'app.description_too_long' | transloco }}")
    content = content.replace('Mô tả tuyệt vời', "{{ 'app.description_perfect' | transloco }}")

    content = content.replace('tiêu đề,', "{{ 'app.headings_count_label' | transloco }},")
    content = content.replace('hình ảnh</mat-label>', "{{ 'app.images_count_label' | transloco }}</mat-label>")
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

process_file(path1)
process_file(path2)

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

new_keys = {
    'app.content_label': ('Nội dung', 'Content'),
    'app.link_label': ('Liên kết', 'Link'),
    'app.image_label': ('Hình ảnh', 'Image'),
    'app.description_label': ('Mô tả', 'Description'),
    'app.check_seo_score': ('Kiểm tra điểm SEO', 'Check SEO score'),
    'app.title_too_long': ('Tiêu đề quá dài', 'Title is too long'),
    'app.title_perfect': ('Tiêu đề chuẩn', 'Title is perfect'),
    'app.title_achieved': ('Tiêu đề đạt', 'Title is achieved'),
    'app.description_too_long': ('Mô tả quá dài', 'Description is too long'),
    'app.description_perfect': ('Mô tả tuyệt vời', 'Description is perfect'),
    'app.headings_count_label': ('tiêu đề', 'headings'),
    'app.images_count_label': ('hình ảnh', 'images'),
    'app.times': (' lần ', ' times '),
    'app.times_over': (' lần trên ', ' times over ')
}

for k, (vi, en) in new_keys.items():
    vi_data[k] = vi
    en_data[k] = en

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)
with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)

print("Translation updated 2")
