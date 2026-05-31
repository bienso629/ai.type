const fs = require('fs');
let data = fs.readFileSync('electron/src/main.js', 'utf8');

const ttsTarget = `        if (fs.existsSync(filePath)) {
            return {
                success: true,
                url: \`file://\${filePath}\`,
                filePath: filePath,
            };
        } else {
            return { success: false, error: "File chưa được tạo ra." };
        }`;

const ttsReplace = `        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            if (stats.size > 0) {
                return {
                    success: true,
                    url: \`file://\${filePath}\`,
                    filePath: filePath,
                };
            } else {
                try { fs.unlinkSync(filePath); } catch (e) {}
                return { success: false, error: "Tạo audio thất bại (file rỗng)." };
            }
        } else {
            return { success: false, error: "File chưa được tạo ra." };
        }`;

data = data.replace(ttsTarget, ttsReplace);

const checkTarget = `        if (exists) {
            return { exists: true, path: targetPath };
        } else {
            return { exists: false };
        }`;

const checkReplace = `        if (exists) {
            const stats = fs.statSync(targetPath);
            if (stats.size > 0) {
                return { exists: true, path: targetPath };
            } else {
                return { exists: false };
            }
        } else {
            return { exists: false };
        }`;

data = data.replace(checkTarget, checkReplace);

fs.writeFileSync('electron/src/main.js', data, 'utf8');
console.log('Replaced successfully.');
