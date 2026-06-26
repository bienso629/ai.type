import re

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace "công việc\n                        đang làm của\n                        bạn" with "{{ 'app.your_current_work_lc' | transloco }}"
content = re.sub(r'công việc\s*đang làm của\s*bạn', "{{ 'app.your_current_work_lc' | transloco }}", content, flags=re.MULTILINE)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Multiline fix done")
