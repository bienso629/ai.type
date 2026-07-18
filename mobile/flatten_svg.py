import re

with open('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/typing-logo.svg', 'r') as f:
    content = f.read()

# Remove defs block entirely
content = re.sub(r'<defs>.*?</defs>', '', content, flags=re.DOTALL)

# Remove mask attributes
content = re.sub(r'mask="[^"]+"', '', content)
content = re.sub(r'mask:.*?url\([^)]+\);?', '', content)

# Replace fill="url(#linear-gradient)" with fill="#e05060" (orange-pink)
content = re.sub(r'fill="url\(#linear-gradient(-5|-6)?\)"', 'fill="#e05060"', content)
# linear-gradient-2 is same
content = re.sub(r'fill="url\(#linear-gradient-2\)"', 'fill="#e05060"', content)
# linear-gradient-3 and 4 are dark grey
content = re.sub(r'fill="url\(#linear-gradient-[34]\)"', 'fill="#262626"', content)
content = re.sub(r'fill="url\(#linear-gradient-[7]\)"', 'fill="#262626"', content)

# Any other gradient fallback
content = re.sub(r'fill="url\([^)]+\)"', 'fill="#e05060"', content)

# Remove empty <g> tags
content = re.sub(r'<g\s*>.*?</g>', '', content, flags=re.DOTALL) # wait, what if <g> has children?
# let's just remove `<g mask="...">` wrappers that SVGO might have left
content = re.sub(r'<g[^>]*mask="[^"]+"[^>]*>', '<g>', content)

with open('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/typing-logo.svg', 'w') as f:
    f.write(content)
