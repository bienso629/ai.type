import re

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(r'Soạn Prompt cho công việc\s*này', "{{ 'app.compose_prompt' | transloco }}", content, flags=re.MULTILINE)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

path2 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/archives/archives.component.html'
with open(path2, 'r', encoding='utf-8') as f:
    content2 = f.read()
content2 = content2.replace('placeholder="Mời bạn cùng viết"', '[placeholder]="\'app.invite_to_write\' | transloco"')
with open(path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print("Fixed")
