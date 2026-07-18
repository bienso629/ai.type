import re

with open('/home/yenai/Documents/Projects/Typing/ai.type/docs/assets/typing-logo.svg', 'r') as f:
    content = f.read()

# Extract styles
styles_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
classes = {}
if styles_match:
    styles_str = styles_match.group(1)
    for rule in re.finditer(r'\.(cls-\d+)\s*\{\s*([^}]+)\s*\}', styles_str):
        cls_name = rule.group(1)
        properties = rule.group(2).split(';')
        valid_props = []
        for p in properties:
            p = p.strip()
            if not p: continue
            if p.startswith('mask:'): continue # strip masks!
            valid_props.append(p)
        classes[cls_name] = valid_props

# Remove <style> block completely
content = re.sub(r'<style>.*?</style>', '', content, flags=re.DOTALL)

# Replace class="cls-x" with style="prop: value;"
def replacer(match):
    cls_name = match.group(1)
    if cls_name in classes and classes[cls_name]:
        inline_styles = ';'.join(classes[cls_name])
        return f'style="{inline_styles}"'
    return '' # remove class if no valid properties

content = re.sub(r'class="(cls-\d+)"', replacer, content)

# Remove any mask attributes directly on tags
content = re.sub(r'mask="[^"]+"', '', content)
content = re.sub(r'mask:.*?url\([^)]+\);?', '', content)

with open('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/typing-logo.svg', 'w') as f:
    f.write(content)
