const fs = require('fs');
let text = fs.readFileSync('electron/src/main.js', 'utf8');

text = text.replace("const outputPath = path.join(dir, `\\$\\{originalBaseName\\}_trimmed_\\$\\{timestamp\\}\\$\\{ext\\}`);", "const outputPath = path.join(dir, originalBaseName + '_trimmed_' + timestamp + ext);");

fs.writeFileSync('electron/src/main.js', text);
