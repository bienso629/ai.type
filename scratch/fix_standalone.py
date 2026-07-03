import re

files_to_fix = [
    "/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin/content/ai-tts/tools/node-editor/node-editor.component.ts",
    "/home/yenai/Documents/Projects/Typing/ai.type/src/app/layout/layouts/vertical/thin/thin.component.ts"
]

def add_import(content, import_stmt, module_name):
    if module_name not in content:
        # insert after the last import
        imports_end = [m.end() for m in re.finditer(r'import .*;', content)]
        if imports_end:
            idx = max(imports_end)
            content = content[:idx] + "\n" + import_stmt + content[idx:]
        else:
            content = import_stmt + "\n" + content
            
        # Add to imports array of @Component
        # find `imports: [\n` or `imports: [`
        content = re.sub(r'imports\s*:\s*\[', f'imports: [{module_name}, ', content)
    return content

for filepath in files_to_fix:
    with open(filepath, 'r') as f:
        content = f.read()
    
    content = add_import(content, "import { TranslocoModule } from '@ngneat/transloco';", "TranslocoModule")
    content = add_import(content, "import { MatTooltipModule } from '@angular/material/tooltip';", "MatTooltipModule")
    
    with open(filepath, 'w') as f:
        f.write(content)

print("Standalone Imports fixed.")
