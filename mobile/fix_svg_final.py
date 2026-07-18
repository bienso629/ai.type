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
            if p.startswith('mask:'): continue # strip masks
            
            parts = p.split(':', 1)
            if len(parts) == 2:
                key = parts[0].strip()
                val = parts[1].strip()
                # If it's a gradient fill, flatten it
                if key == 'fill' and val.startswith('url(#linear-gradient'):
                    if val == 'url(#linear-gradient-3)' or val == 'url(#linear-gradient-4)' or val == 'url(#linear-gradient-7)':
                        val = '#262626' # dark grey
                    else:
                        val = '#e05060' # orange/pink
                attrs.append(f'{key}="{val}"')
        classes[cls_name] = attrs

# Remove <defs> entirely to get rid of gradients, styles and masks
content = re.sub(r'<defs>.*?</defs>', '', content, flags=re.DOTALL)

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

# Remove any empty <g> groups left behind
content = re.sub(r'<g\s*>', '<g>', content) # normalize
content = re.sub(r'<g>\s*</g>', '', content, flags=re.DOTALL)

with open('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/typing-logo.svg', 'w') as f:
    f.write(content)
