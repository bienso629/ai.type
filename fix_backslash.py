import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the invalid token error
content = content.replace("p = p.replace(/\\//g, '\\');", "p = p.replace(/\\//g, '\\\\');")
# Check if there are other badly escaped characters
content = content.replace("p = p.replace(/^file:\\/\\//i, '');", "p = p.replace(/^file:\\\\/\\\\//i, '');")
content = content.replace("p = p.replace(/^media:\\/\\//i, '');", "p = p.replace(/^media:\\\\/\\\\//i, '');")

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed syntax error.")
