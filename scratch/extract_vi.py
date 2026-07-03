import os
import re
import json
from pathlib import Path

# Regex to match Vietnamese characters
VI_PATTERN = re.compile(r'[áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ]')

# Known prompt indicators to skip
PROMPT_KEYWORDS = ["JSON", "Hãy viết", "Nội dung mẫu", "Prompt", "AI", "khoá chính", "định dạng"]

def has_vi(text):
    return bool(VI_PATTERN.search(text))

def is_prompt(text):
    if len(text) > 150: return True
    for kw in PROMPT_KEYWORDS:
        if kw.lower() in text.lower():
            return True
    return False

def extract_strings(directory):
    html_strings = set()
    ts_strings = set()
    
    for root, _, files in os.walk(directory):
        for file in files:
            filepath = os.path.join(root, file)
            if file.endswith('.html'):
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # A very naive extraction for HTML: text between tags and in specific attributes
                    # This is just for estimation
                    texts = re.findall(r'>([^<]+)<', content)
                    for t in texts:
                        t = t.strip()
                        if has_vi(t) and "{{" not in t and "transloco" not in t:
                            html_strings.add(t)
                    
                    # Attributes: matTooltip, placeholder, title, label
                    attrs = re.findall(r'(?:matTooltip|placeholder|title|label)="([^"]+)"', content)
                    for a in attrs:
                        if has_vi(a) and "transloco" not in a:
                            html_strings.add(a)
                            
            elif file.endswith('.ts'):
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    # Strings in quotes
                    strs = re.findall(r"'([^'\\]*(?:\\.[^'\\]*)*)'", content)
                    strs += re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"', content)
                    # Backticks (simple)
                    strs += re.findall(r'`([^`\\]*(?:\\.[^`\\]*)*)`', content)
                    
                    for s in strs:
                        s = s.strip()
                        if has_vi(s) and not is_prompt(s):
                            ts_strings.add(s)

    return html_strings, ts_strings

h_strs, t_strs = extract_strings('/home/yenai/Documents/Projects/Typing/ai.type/src/app')
print(f"HTML unique Vietnamese strings: {len(h_strs)}")
print(f"TS unique Vietnamese strings: {len(t_strs)}")
print("Sample HTML:", list(h_strs)[:5])
print("Sample TS:", list(t_strs)[:5])
