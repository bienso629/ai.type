import re

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's see if the strings are there
strings = [
    'Soạn Prompt cho công việc',
    'Nội dung sáng tạo',
    'Click 2 lần vào đoạn văn này để chỉnh sửa.',
    'Biến Hình ảnh thành Bài',
    'Biến Video thành Bài',
    'Gemini đã hồi đáp',
    'Gắn Backlink vào Bài',
    'Gợi ý Prompt cho bạn',
    'Từ điển kiến thức',
    'Nguồn khác',
    'Lên ý tưởng'
]

for s in strings:
    if s in content:
        print(f"FOUND: {s}")
    else:
        print(f"NOT FOUND: {s}")
