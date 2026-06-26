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
        'Mô tả về công việc': "{{ 'app.task_description' | transloco }}",
        'Ảnh/Video': "{{ 'app.image_video' | transloco }}",
        'No file selected': "{{ 'app.no_file_selected' | transloco }}",
        'Upload related image/video': "{{ 'app.upload_related_media' | transloco }}",
        'Viết lại từ bài khác': "{{ 'app.rewrite_from_article' | transloco }}",
        'Nhập địa chỉ bạn muốn viết lại': "{{ 'app.enter_rewrite_url' | transloco }}",
        'Ví dụ: https://type.vn/topic/45': "{{ 'app.example_rewrite_url' | transloco }}",
        'Search ideas on the internet': "{{ 'app.search_ideas_internet' | transloco }}",
        'Từ khoá tìm kiếm': "{{ 'app.search_keyword' | transloco }}",
        'Ví dụ: Thú tội + Minato Kanae': "{{ 'app.example_search_keyword' | transloco }}",
        'Khoá chính*': "{{ 'app.primary_keyword_required' | transloco }}",
        'Từ khoá mạnh xuyên suốt bài viết của bạn': "{{ 'app.strong_keyword_description' | transloco }}",
        'lên kịch bản, viết nội dung sản phẩm hay tóm tắt tài liệu': "{{ 'app.ai_writer_subtitle' | transloco }}",
        'Tiêu đề quá ngắn': "{{ 'app.title_too_short' | transloco }}",
        'Mô tả quá ngắn': "{{ 'app.description_too_short' | transloco }}",
        'Content quá ngắn': "{{ 'app.content_too_short' | transloco }}",
        'Mô tả chưa có khoá chính': "{{ 'app.description_missing_primary_keyword' | transloco }}",
        'Mô tả đã có khoá chính': "{{ 'app.description_has_primary_keyword' | transloco }}",
        'H1 không tìm thấy khoá chính': "{{ 'app.h1_missing_primary_keyword' | transloco }}",
        'Tìm thấy khoá chính trong H1': "{{ 'app.h1_contains_primary_keyword' | transloco }}",
        'Khoá chính không có ở dòng đầu': "{{ 'app.primary_keyword_missing_first_line' | transloco }}",
        'Khoá chính xuất hiện ở đầu': "{{ 'app.primary_keyword_appears_first_line' | transloco }}",
        'Khoá chính xuất hiện đầu tiêu': "{{ 'app.primary_keyword_is_in_title_beginning' | transloco }}",
        'Khoá chính nên xuất hiện đầu tiêu': "{{ 'app.primary_keyword_should_be_in_title_beginning' | transloco }}",
        'Alt không có khoá chính': "{{ 'app.alt_missing_primary_keyword' | transloco }}"
    }
    
    for k, v in replacements.items():
        content = content.replace(k, v)
        
    # More complex ones
    content = content.replace("Khoá chính xuất hiện", "{{ 'app.primary_keyword_appears' | transloco }}")
    content = content.replace("Điểm đạt được", "{{ 'app.score_achieved' | transloco }}")
    content = content.replace("Trong mô tả chứa từ khoá chính", "{{ 'app.description_contains_primary_keyword' | transloco }}")
    
    # We must be careful about "Khoá chính" as it might replace parts of "Khoá chính*" or "Khoá chính xuất hiện..."
    # "Khoá chính" alone. It occurs as <mat-label>Khoá chính</mat-label>
    content = content.replace("<mat-label>Khoá chính</mat-label>", "<mat-label>{{ 'app.primary_keyword' | transloco }}</mat-label>")
    
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
    'app.task_description': ('Mô tả về công việc', 'Task description'),
    'app.image_video': ('Ảnh/Video', 'Image/Video'),
    'app.no_file_selected': ('No file selected', 'No file selected'),
    'app.upload_related_media': ('Upload related image/video', 'Upload related image/video'),
    'app.rewrite_from_article': ('Viết lại từ bài khác', 'Rewrite from another article'),
    'app.enter_rewrite_url': ('Nhập địa chỉ bạn muốn viết lại', 'Enter the URL you want to rewrite'),
    'app.example_rewrite_url': ('Ví dụ: https://type.vn/topic/45', 'Example: https://type.vn/topic/45'),
    'app.search_ideas_internet': ('Search ideas on the internet', 'Search ideas on the internet'),
    'app.search_keyword': ('Từ khoá tìm kiếm', 'Search keyword'),
    'app.example_search_keyword': ('Ví dụ: Thú tội + Minato Kanae', 'Example: Confessions + Minato Kanae'),
    'app.primary_keyword_required': ('Khoá chính*', 'Primary keyword*'),
    'app.strong_keyword_description': ('Từ khoá mạnh xuyên suốt bài viết của bạn', 'Strong keyword throughout your article'),
    'app.ai_writer_subtitle': ('lên kịch bản, viết nội dung sản phẩm hay tóm tắt tài liệu', 'scripting, writing product content or summarizing documents'),
    'app.title_too_short': ('Tiêu đề quá ngắn', 'Title is too short'),
    'app.description_too_short': ('Mô tả quá ngắn', 'Description is too short'),
    'app.content_too_short': ('Content quá ngắn', 'Content is too short'),
    'app.description_missing_primary_keyword': ('Mô tả chưa có khoá chính', 'Description is missing primary keyword'),
    'app.description_has_primary_keyword': ('Mô tả đã có khoá chính', 'Description has primary keyword'),
    'app.h1_missing_primary_keyword': ('H1 không tìm thấy khoá chính', 'H1 is missing primary keyword'),
    'app.h1_contains_primary_keyword': ('Tìm thấy khoá chính trong H1', 'Primary keyword found in H1'),
    'app.primary_keyword_missing_first_line': ('Khoá chính không có ở dòng đầu', 'Primary keyword is not in the first line'),
    'app.primary_keyword_appears_first_line': ('Khoá chính xuất hiện ở đầu', 'Primary keyword appears at the beginning'),
    'app.primary_keyword_is_in_title_beginning': ('Khoá chính xuất hiện đầu tiêu', 'Primary keyword appears at the beginning of the title'),
    'app.primary_keyword_should_be_in_title_beginning': ('Khoá chính nên xuất hiện đầu tiêu', 'Primary keyword should appear at the beginning of the title'),
    'app.alt_missing_primary_keyword': ('Alt không có khoá chính', 'Alt is missing primary keyword'),
    'app.primary_keyword_appears': ('Khoá chính xuất hiện', 'Primary keyword appears'),
    'app.score_achieved': ('Điểm đạt được', 'Score achieved'),
    'app.description_contains_primary_keyword': ('Trong mô tả chứa từ khoá chính', 'Description contains primary keyword'),
    'app.primary_keyword': ('Khoá chính', 'Primary keyword')
}

for k, (vi, en) in new_keys.items():
    vi_data[k] = vi
    en_data[k] = en

with open(vi_path, 'w', encoding='utf-8') as f:
    json.dump(vi_data, f, ensure_ascii=False, indent=4)
with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, ensure_ascii=False, indent=4)

print("Translation updated")
