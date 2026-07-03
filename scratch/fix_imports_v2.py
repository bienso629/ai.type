import re

# node-editor.component.ts
path1 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-tts/tools/node-editor/node-editor.component.ts'
with open(path1, 'r') as f:
    c = f.read()
# remove bad imports
c = c.replace("import { TranslocoModule } from '@ngneat/transloco';\n", "")
c = c.replace("import { MatTooltipModule } from '@angular/material/tooltip';\n", "")
# add to top
c = "import { TranslocoModule } from '@ngneat/transloco';\nimport { MatTooltipModule } from '@angular/material/tooltip';\n" + c
with open(path1, 'w') as f:
    f.write(c)

# thin.component.ts
path2 = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/layout/layouts/vertical/thin/thin.component.ts'
with open(path2, 'r') as f:
    c = f.read()
# it already has imports at top, but we need to ensure ALL imports: [] arrays have the modules
c = re.sub(r'imports\s*:\s*\[', r'imports: [TranslocoModule, MatTooltipModule, ', c)
# remove duplicates in arrays if any
c = c.replace('TranslocoModule, MatTooltipModule, TranslocoModule, MatTooltipModule, ', 'TranslocoModule, MatTooltipModule, ')
with open(path2, 'w') as f:
    f.write(c)
