import re

path1 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path1, 'r', encoding='utf-8') as f:
    content = f.read()

print("lần" in content)

# I can just use string replace.
content = content.replace(" lần trên ", "{{ 'app.times_over' | transloco }}")
content = content.replace(" lần {{", "{{ 'app.times' | transloco }}{{")
content = content.replace(" lần ({{", "{{ 'app.times' | transloco }}({{")

with open(path1, 'w', encoding='utf-8') as f:
    f.write(content)

path2 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/microsites/archive/archive.component.html'
with open(path2, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(" lần trên ", "{{ 'app.times_over' | transloco }}")
content = content.replace(" lần {{", "{{ 'app.times' | transloco }}{{")
content = content.replace(" lần ({{", "{{ 'app.times' | transloco }}({{")

with open(path2, 'w', encoding='utf-8') as f:
    f.write(content)
