import sys
import re

with open('electron/src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the child_process spawn block to also print args
old_spawn = '''            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                const child = spawn(ffmpegPath, args);
                let errLog = "";
                child.stderr.on('data', (data) => { errLog += data.toString(); });
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Failed to encode scene ${i}: ${errLog}`));
                });
            });'''

new_spawn = '''            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                console.log("SPAWNING FFMPEG WITH ARGS: ", args);
                const child = spawn(ffmpegPath, args);
                let errLog = "ARGS: " + JSON.stringify(args) + "\\n";
                child.stderr.on('data', (data) => { errLog += data.toString(); });
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Failed to encode scene ${i}: ${errLog}`));
                });
            });'''

content = content.replace(old_spawn, new_spawn)

with open('electron/src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Added args to stderr logging.")
