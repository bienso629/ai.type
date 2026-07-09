import os
import glob
import re

base_dir = '/home/yenai/Documents/Projects/Typing/ai.type/src/app/modules/admin'
modules = {}

for root, dirs, files in os.walk(base_dir):
    for file in files:
        if file.endswith('.html'):
            path = os.path.join(root, file)
            # detect module name from path
            parts = path.split('/')
            module_name = parts[-3] if len(parts) > 3 else 'general'
            if module_name not in modules:
                modules[module_name] = []
            
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Extract buttons
            buttons = re.findall(r'<button[^>]*>(.*?)</button>', content, re.DOTALL | re.IGNORECASE)
            # Extract labels
            labels = re.findall(r'<mat-label[^>]*>(.*?)</mat-label>', content, re.DOTALL | re.IGNORECASE)
            # Extract headers (h1, h2, h3, or text inside text-xl/text-2xl)
            headers = re.findall(r'<div[^>]*class="[^"]*text-(?:xl|2xl)[^"]*"[^>]*>(.*?)</div>', content, re.DOTALL | re.IGNORECASE)
            
            def clean(text):
                # remove html tags inside
                text = re.sub(r'<[^>]+>', '', text)
                text = re.sub(r'\{\{.*?\}\}', '', text) # remove angular interpolations
                return text.strip().replace('\n', ' ')
            
            buttons = [clean(b) for b in buttons if clean(b)]
            labels = [clean(l) for l in labels if clean(l)]
            headers = [clean(h) for h in headers if clean(h)]
            
            if buttons or labels or headers:
                modules[module_name].append({
                    'file': file,
                    'headers': list(set(headers)),
                    'buttons': list(set(buttons)),
                    'labels': list(set(labels))
                })

with open('manual_draft.md', 'w', encoding='utf-8') as f:
    f.write("# Tài liệu Hướng Dẫn Sử Dụng Hệ Thống\n\n")
    for mod, pages in modules.items():
        if not pages: continue
        f.write(f"## Module: {mod.upper()}\n\n")
        for page in pages:
            f.write(f"### Màn hình: {page['file']}\n")
            if page['headers']:
                f.write("**Chức năng chính / Tiêu đề:**\n")
                for h in page['headers']:
                    if h: f.write(f"- {h}\n")
            if page['labels']:
                f.write("**Các trường thông tin (Inputs/Labels):**\n")
                for l in page['labels']:
                    if l: f.write(f"- {l}\n")
            if page['buttons']:
                f.write("**Các nút thao tác (Buttons):**\n")
                for b in page['buttons']:
                    if b: f.write(f"- {b}\n")
            f.write("\n")
