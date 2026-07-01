import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the literal characters "\nasync" with a real newline and "async"
content = content.replace('\\nasync function getAudioDuration(filePath)', '\nasync function getAudioDuration(filePath)')

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed syntax error.")
