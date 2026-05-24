const fs = require('fs');
const content = fs.readFileSync('electron/src/main.js', 'utf-8');
const lines = content.split('\n');
console.log('Searching for check-local-file-exists in main.js:');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('check-local-file-exists')) {
        console.log(`Line ${i+1}: ${lines[i].trim()}`);
        // print next 15 lines
        for (let j = 1; j <= 15; j++) {
            console.log(`Line ${i+1+j}: ${lines[i+j]}`);
        }
    }
}
