import re

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-writer/ai-writer.component.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove backslashes before single quotes
content = content.replace(r"\'app.paragraph\'", "'app.paragraph'")
content = content.replace(r"\'app.title\'", "'app.title'")
content = content.replace(r"\'app.outline\'", "'app.outline'")
content = content.replace(r"\'app.deleted\'", "'app.deleted'")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done removing backslashes")
