const fs = require('fs');
const content = fs.readFileSync('electron/src/main.js', 'utf-8');
const lines = content.split('\n');
console.log('Printing lines 2340 to 2380 of electron/src/main.js:');
for (let i = 2339; i < Math.min(2380, lines.length); i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
