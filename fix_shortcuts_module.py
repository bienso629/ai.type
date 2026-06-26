import os

path = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/layout/common/shortcuts/shortcuts.module.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("import { MatTooltipModule } from '@angular/material/tooltip';", "import { MatTooltipModule } from '@angular/material/tooltip';\nimport { TranslocoModule } from '@ngneat/transloco';")
content = content.replace("MatTooltipModule\n    ]", "MatTooltipModule,\n        TranslocoModule\n    ]")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed shortcuts module")
