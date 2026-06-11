const fs = require('fs');
let text = fs.readFileSync('electron/src/main.js', 'utf8');

const regex1 = /const baseName = path\.basename\(videoPath, ext\);\s*const timestamp = new Date\(\)\.getTime\(\);\s*const outputPath = path\.join\(dir, `\$\{baseName\}_trimmed_\$\{timestamp\}\$\{ext\}`\);/;
const repl1 = `const baseName = path.basename(videoPath, ext);
        let originalBaseName = baseName.replace(/_trimmed_\\d+/g, '');
        const timestamp = new Date().getTime();
        const outputPath = path.join(dir, \\\`\\$\\{originalBaseName\\}_trimmed_\\$\\{timestamp\\}\\$\\{ext\\}\\\`);`;

const regex2 = /child\.on\('close', \(code\) => \{\s*if \(code === 0 && fs\.existsSync\(outputPath\)\) \{\s*resolve\(\{ success: true, path: outputPath \}\);/;
const repl2 = `child.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputPath)) {
                    if (baseName.includes('_trimmed_')) {
                        try { fs.unlinkSync(videoPath); } catch (e) {}
                    }
                    resolve({ success: true, path: outputPath });`;

text = text.replace(regex1, repl1);
text = text.replace(regex2, repl2);

fs.writeFileSync('electron/src/main.js', text);
console.log('PATCHED!');
