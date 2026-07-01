import sys

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace video.src with video.videoUrl || video.src
content = content.replace('cleanFilePath(video.src)', 'cleanFilePath(video.videoUrl || video.src)')

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed video src path mapping.")
