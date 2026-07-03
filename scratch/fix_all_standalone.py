import os
import glob
import re

ts_files = glob.glob('/home/yenai/Documents/Projects/Typing/ai.type/src/app/**/*.ts', recursive=True)

for ts_path in ts_files:
    with open(ts_path, 'r') as f:
        content = f.read()
    
    if '@Component' in content and 'standalone: true' in content:
        # Check if the HTML uses transloco
        html_path = ts_path.replace('.ts', '.html')
        needs_fix = False
        
        if os.path.exists(html_path):
            with open(html_path, 'r') as f:
                html_content = f.read()
            if 'transloco' in html_content:
                needs_fix = True
        
        # also check inline templates
        if 'template:' in content and 'transloco' in content:
            needs_fix = True
            
        if needs_fix:
            changed = False
            if 'TranslocoModule' not in content:
                content = "import { TranslocoModule } from '@ngneat/transloco';\n" + content
                changed = True
            if 'MatTooltipModule' not in content:
                content = "import { MatTooltipModule } from '@angular/material/tooltip';\n" + content
                changed = True
                
            # insert into all imports arrays inside @Component
            if changed or not re.search(r'imports\s*:\s*\[.*TranslocoModule', content, re.DOTALL):
                def replace_imports(match):
                    arr = match.group(0)
                    if 'TranslocoModule' not in arr:
                        arr = arr.replace('imports: [', 'imports: [TranslocoModule, MatTooltipModule, ')
                    return arr
                content = re.sub(r'imports\s*:\s*\[', replace_imports, content)
                changed = True
                
            if changed:
                with open(ts_path, 'w') as f:
                    f.write(content)
                print(f"Fixed standalone: {ts_path}")

print("All standalone checked.")
