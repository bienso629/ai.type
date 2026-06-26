import json

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
en_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/en.json'

with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)

for key, value in vi_data.items():
    if "has no H1" in value or "missing primary keyword" in value or "not yet available" in value or "No images yet" in value or "improve experience" in value:
        print(f"FOUND IN VI: {key} = {value}")

