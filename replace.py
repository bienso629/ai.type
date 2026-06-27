import sys

def replace():
    with open('src/app/modules/admin/content/ai-tts/tools/node-editor/node-editor.component.html', 'r') as f:
        lines = f.readlines()
        
    start_idx = -1
    for i, line in enumerate(lines):
        if '<!-- Docked Global Prompt Editor' in line:
            start_idx = i
            break
            
    if start_idx != -1:
        with open('mock-dark-prompt.html', 'r') as m:
            mock = m.read()
            
        new_lines = lines[:start_idx] + [mock]
        
        with open('src/app/modules/admin/content/ai-tts/tools/node-editor/node-editor.component.html', 'w') as f:
            f.writelines(new_lines)
        print("Replaced!")
    else:
        print("Start index not found")

replace()
