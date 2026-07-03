import os
import glob
import re

module_files = glob.glob('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.module.ts', recursive=True)

for path in module_files:
    with open(path, 'r') as f:
        content = f.read()
    
    # If it's a module
    if '@NgModule' in content:
        changed = False
        
        # Add imports at top
        if 'TranslocoModule' not in content:
            content = "import { TranslocoModule } from '@ngneat/transloco';\n" + content
            changed = True
        if 'MatTooltipModule' not in content:
            content = "import { MatTooltipModule } from '@angular/material/tooltip';\n" + content
            changed = True
            
        # Add to imports array inside @NgModule
        # We look for imports: [...] block
        def replace_imports(match):
            arr = match.group(0)
            if 'TranslocoModule' not in arr:
                arr = arr.replace('imports: [', 'imports: [\n        TranslocoModule,\n        MatTooltipModule,')
            return arr
            
        new_content = re.sub(r'imports\s*:\s*\[', replace_imports, content, count=1)
        if new_content != content:
            changed = True
            content = new_content
            
        if changed:
            with open(path, 'w') as f:
                f.write(content)
            print(f"Fixed module: {path}")

print("All modules checked.")
