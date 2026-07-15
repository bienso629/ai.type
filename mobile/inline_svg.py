import re

with open('assets/logo.svg', 'r') as f:
    content = f.read()

# Extract the style block
style_match = re.search(r'<style>(.*?)</style>', content, re.DOTALL)
if style_match:
    style_content = style_match.group(1)
    
    # Parse classes
    classes = {}
    for cls_match in re.finditer(r'\.(cls-\d+)\s*\{\s*([^}]+)\s*\}', style_content):
        cls_name = cls_match.group(1)
        styles = cls_match.group(2).strip()
        
        # Convert css rules to xml attributes
        # e.g., 'fill: url(#linear-gradient);' -> 'fill="url(#linear-gradient)"'
        # e.g., 'mask: url(#mask-30);' -> 'mask="url(#mask-30)"'
        attrs = []
        for rule in styles.split(';'):
            if ':' in rule:
                k, v = rule.split(':', 1)
                attrs.append(f'{k.strip()}="{v.strip()}"')
        
        classes[cls_name] = ' '.join(attrs)
    
    # Remove the style block
    content = content[:style_match.start()] + content[style_match.end():]
    
    # Replace class="cls-X" with the attributes
    for cls_name, attrs in classes.items():
        content = re.sub(rf'class="{cls_name}"', attrs, content)
        
    with open('assets/logo.svg', 'w') as f:
        f.write(content)
    print("SVG styles inlined successfully.")
else:
    print("No style block found.")
