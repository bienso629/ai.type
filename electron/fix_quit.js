const fs = require('fs');
let c = fs.readFileSync('src/main.js', 'utf8');
c = c.replace(/app\.on\("will-quit", \(\) => \{[\s\S]*?if \(serviceProcess\) \{[\s\S]*?serviceProcess\.kill\(\);\s*\}\s*/, 'app.on("will-quit", () => {\n    if (serviceProcess) { serviceProcess.kill(); }\n    if (n8nProcess) { n8nProcess.kill(); }\n');
fs.writeFileSync('src/main.js', c);
