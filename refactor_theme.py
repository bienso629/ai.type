import re

file_path = 'src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replacements for dark theme to light theme
replacements = {
    'bg-gray-900': 'bg-gray-50',
    'bg-gray-800': 'bg-white',
    'bg-gray-700': 'bg-gray-200',
    'bg-gray-600': 'bg-gray-300',
    'border-gray-800': 'border-gray-200',
    'border-gray-700': 'border-gray-300',
    'border-gray-600': 'border-gray-400',
    'text-gray-100': 'text-gray-900',
    'text-gray-200': 'text-gray-800',
    'text-gray-300': 'text-gray-700',
    'text-gray-400': 'text-gray-600',
    'text-white': 'text-gray-900',
    'hover:text-white': 'hover:text-black',
    'hover:bg-gray-700': 'hover:bg-gray-200',
    'bg-black': 'bg-gray-100',
}

for old, new in replacements.items():
    content = content.replace(old, new)

# We also need to remove the X button
# The X button looks like this:
x_button_pattern = r'<button mat-icon-button class="[^"]*"\s*\(click\)="close\(\)">\s*<mat-icon \[svgIcon\]="\'heroicons_outline:x\'"><\/mat-icon>\s*<\/button>'
content = re.sub(x_button_pattern, '', content, flags=re.MULTILINE)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated HTML successfully")
