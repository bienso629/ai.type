import re
import json

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)
with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

# List of all untranslated strings from ai-writer and archives
keys = {
    'app.invite_to_write': ('Mời bạn cùng viết', 'Invite to write'),
    'app.scripting_summary_etc': ('lên kịch bản, viết nội dung sản phẩm hay tóm tắt tài liệu', 'scripting, product content writing or document summary'),
    'app.brainstorm': ('Lên ý tưởng', 'Brainstorm'),
    'app.save_work': ('Lưu công việc', 'Save work'),
    'app.paragraph': ('Đoạn văn', 'Paragraph'),
    'app.outline': ('Dàn ý', 'Outline'),
    'app.deleted': ('Đã xoá', 'Deleted'),
    'app.your_episode': ('Tập của bạn', 'Your episode'),
    'app.select_episode': ('Select episode', 'Select episode'),
    'app.compose_prompt': ('Soạn Prompt cho công việc này', 'Compose prompt for this task'),
    'app.creative_content': ('Nội dung sáng tạo', 'Creative content'),
    'app.double_click_to_edit': ('Click 2 lần vào đoạn văn này để chỉnh sửa.', 'Double click this paragraph to edit.'),
    'app.image_to_article': ('Biến Hình ảnh thành Bài', 'Image to Article'),
    'app.video_to_article': ('Biến Video thành Bài', 'Video to Article'),
    'app.gemini_responded': ('Gemini đã hồi đáp', 'Gemini responded'),
    'app.add_backlink': ('Gắn Backlink vào Bài', 'Add backlink to article'),
    'app.prompt_suggestions': ('Gợi ý Prompt cho bạn', 'Prompt suggestions for you'),
    'app.knowledge_dict': ('Từ điển kiến thức', 'Knowledge dictionary'),
    'app.other_sources': ('Nguồn khác', 'Other sources'),
    'app.your_current_work_lc': ('công việc đang làm của bạn', 'your current work'),
    'app.copy_text': ('Copy', 'Copy')
}

for k, (vi_v, en_v) in keys.items():
    vi_data[k] = vi_v
    en_data[k] = en_v

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)
with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)

def replace_in_file(path, replacements):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements.items():
        content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

ai_writer_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'

ai_writer_replacements = {
    'lên kịch bản, viết nội dung sản phẩm hay tóm tắt tài liệu': "{{ 'app.scripting_summary_etc' | transloco }}",
    '>Lên ý tưởng<': ">{{ 'app.brainstorm' | transloco }}<",
    '>Copy<': ">{{ 'app.copy_text' | transloco }}<",
    '>Lưu công việc<': ">{{ 'app.save_work' | transloco }}<",
    '>Đoạn văn (': ">{{ 'app.paragraph' | transloco }} (",
    '>Tiêu đề (': ">{{ 'app.title' | transloco }} (",
    '>Dàn ý<': ">{{ 'app.outline' | transloco }}<",
    '>Đã xoá (': ">{{ 'app.deleted' | transloco }} (",
    '>Tập của bạn<': ">{{ 'app.your_episode' | transloco }}<",
    'placeholder="Select episode"': 'placeholder="{{ \'app.select_episode\' | transloco }}"',
    'Soạn Prompt cho công việc này': "{{ 'app.compose_prompt' | transloco }}",
    'Nội dung sáng tạo': "{{ 'app.creative_content' | transloco }}",
    'Click 2 lần vào đoạn văn này để chỉnh sửa.': "{{ 'app.double_click_to_edit' | transloco }}",
    'Biến Hình ảnh thành Bài': "{{ 'app.image_to_article' | transloco }}",
    'Biến Video thành Bài': "{{ 'app.video_to_article' | transloco }}",
    'Gemini đã hồi đáp': "{{ 'app.gemini_responded' | transloco }}",
    'Gắn Backlink vào Bài': "{{ 'app.add_backlink' | transloco }}",
    'Gợi ý Prompt cho bạn': "{{ 'app.prompt_suggestions' | transloco }}",
    'Từ điển kiến thức': "{{ 'app.knowledge_dict' | transloco }}",
    'Nguồn khác': "{{ 'app.other_sources' | transloco }}"
}

replace_in_file(ai_writer_path, ai_writer_replacements)

ai_tts_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-tts/ai-tts.component.html'
replace_in_file(ai_tts_path, {
    'công việc đang làm của bạn': "{{ 'app.your_current_work_lc' | transloco }}"
})

archives_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/archives/archives.component.html'
replace_in_file(archives_path, {
    'placeholder="Mời bạn cùng viết"': '[placeholder]="\'app.invite_to_write\' | transloco"'
})

print("Done translations replacements.")
