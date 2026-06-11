import json
import re

html = open(r'C:\Users\Wing386\.gemini\antigravity-ide\brain\3cd097bf-fe39-4afe-a585-0b8d8783aa32\.system_generated\steps\844\content.md', encoding='utf-8').read()

strings = re.findall(r'\\"children\\":\\"([^\\"]*)\\"', html)
output = "".join(strings).replace('\\n', '\n')

with open(r'C:\Users\Wing386\ai.type\extract_out.txt', 'w', encoding='utf-8') as f:
    f.write(output)
