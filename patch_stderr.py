import sys
import re

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the child_process spawn block with one that captures stderr
old_spawn = '''            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const child = spawn(ffmpegPath, args);
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Failed to encode scene ${i}`));
                });
            });'''

new_spawn = '''            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const child = spawn(ffmpegPath, args);
                let errLog = "";
                child.stderr.on('data', (data) => { errLog += data.toString(); });
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Failed to encode scene ${i}: ${errLog}`));
                });
            });'''

content = content.replace(old_spawn, new_spawn)

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Added stderr logging.")
