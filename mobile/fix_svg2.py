import re

with open('/home/yenai/Documents/Projects/Typing/ai.type/docs/assets/typing-logo.svg', 'r') as f:
    content = f.read()

styles_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
classes = {}
if styles_match:
    styles_str = styles_match.group(1)
    for rule in re.finditer(r'\.(cls-\d+)\s*\{\s*([^}]+)\s*\}', styles_str):
        cls_name = rule.group(1)
        properties = rule.group(2).split(';')
        attrs = []
        for p in properties:
            p = p.strip()
            if not p: continue
            if p.startswith('mask:'): continue # strip masks!
            # It looks like "fill: #123"
            parts = p.split(':', 1)
            if len(parts) == 2:
                key = parts[0].strip()
                val = parts[1].strip()
                attrs.append(f'{key}="{val}"')
        classes[cls_name] = attrs

# Remove <style> block completely
content = re.sub(r'<style>.*?</style>', '', content, flags=re.DOTALL)

# Replace class="cls-x" with key="val" key="val"
def replacer(match):
    cls_name = match.group(1)
    if cls_name in classes and classes[cls_name]:
        return ' '.join(classes[cls_name])
    return ''

content = re.sub(r'class="(cls-\d+)"', replacer, content)

# Remove any mask attributes directly on tags
content = re.sub(r'mask="[^"]+"', '', content)
content = re.sub(r'mask:.*?url\([^)]+\);?', '', content)

with open('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/typing-logo.svg', 'w') as f:
    f.write(content)
