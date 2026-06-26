import json

vi_path = '/home/yenai/Documents/Projects/Typing/ai.type/src/assets/i18n/vi.json'
with open(vi_path, 'r', encoding='utf-8') as f:
    vi_data = json.load(f)

for key, value in vi_data.items():
    if "Title missing" in value or "Content has no" in value or "not yet available" in value or "No images" in value or "improve experience" in value or "missing primary keyword" in value:
        print(f"FOUND: {key} = {value}")
