import os
text = open('electron/src/main.js', 'r', encoding='utf-8').read()
import re
text = re.sub(r'(const baseName = path.basename\(videoPath, ext\);)[\s\r\n]+const timestamp = new Date\(\)\.getTime\(\);[\s\r\n]+const outputPath = path\.join\(dir, \$\{baseName\}_trimmed_\$\{timestamp\}\$\{ext\}\);', r'\1\n        let originalBaseName = baseName.replace(/_trimmed_\d+/g, \'\');\n        const timestamp = new Date().getTime();\n        const outputPath = path.join(dir, \$\{originalBaseName\}_trimmed_\$\{timestamp\}\$\{ext\});', text)
text = re.sub(r'child.on\(\'close\', \(code\) => \{[\s\r\n]+if \(code === 0 && fs\.existsSync\(outputPath\)\) \{[\s\r\n]+resolve\(\{ success: true, path: outputPath \}\);', r'child.on(\'close\', (code) => {\n                if (code === 0 && fs.existsSync(outputPath)) {\n                    if (baseName.includes(\'_trimmed_\')) {\n                        try { fs.unlinkSync(videoPath); } catch (e) {}\n                    }\n                    resolve({ success: true, path: outputPath });', text)
open('electron/src/main.js', 'w', encoding='utf-8').write(text)
