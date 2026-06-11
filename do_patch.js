const fs = require('fs');
let text = fs.readFileSync('electron/src/main.js', 'utf8');

// Patch 1: resolveMediaPath
const resolveStartIdx = text.indexOf('const resolveMediaPath = (originalUrl) => {');
if (resolveStartIdx > -1) {
    const endBrace = text.indexOf('\n    };', resolveStartIdx);
    if (endBrace > -1) {
        const originalFunc = text.substring(resolveStartIdx, endBrace + 7);
        const innerFunc = originalFunc.substring(originalFunc.indexOf('let targetPath ='));
        const patchedFunc = `const resolveMediaPath = (originalUrl) => {
        const findPath = (originalUrl) => {
${innerFunc}
        let finalPath = findPath(originalUrl) || "";
        
        // bypass 260 limit
        if (process.platform === "win32" && finalPath.length >= 250) {
            try {
                if (fs.existsSync(finalPath)) {
                    const tmpDir = require('electron').app.getPath("temp");
                    const ext = require("path").extname(finalPath);
                    const hash = require("crypto").createHash("md5").update(finalPath).digest("hex");
                    const shortTempPath = require("path").join(tmpDir, "ai_type_media_" + hash + ext);
                    
                    if (!fs.existsSync(shortTempPath)) {
                        fs.copyFileSync(finalPath, shortTempPath);
                    }
                    finalPath = shortTempPath;
                }
            } catch (e) {
                console.error("[Media Protocol] copy file error:", e);
            }
        }
        
        return finalPath;
    };`;
        text = text.replace(originalFunc, patchedFunc);
    }
}

// Patch 2: trim-video
const trimTarget = '        const baseName = path.basename(videoPath, ext);\n        const timestamp = new Date().getTime();\n        const outputPath = path.join(dir, `${baseName}_trimmed_${timestamp}${ext}`);';
const trimRepl = '        const baseName = path.basename(videoPath, ext);\n        let originalBaseName = baseName.replace(/_trimmed_\\d+/g, "");\n        const timestamp = new Date().getTime();\n        const outputPath = path.join(dir, `${originalBaseName}_trimmed_${timestamp}${ext}`);';
text = text.replace(trimTarget, trimRepl);

const closeTarget = "            child.on('close', (code) => {\n                if (code === 0 && fs.existsSync(outputPath)) {\n                    resolve({ success: true, path: outputPath });\n                } else {";
const closeRepl = "            child.on('close', (code) => {\n                if (code === 0 && fs.existsSync(outputPath)) {\n                    if (baseName.includes('_trimmed_')) {\n                        try { fs.unlinkSync(videoPath); } catch (e) {}\n                    }\n                    resolve({ success: true, path: outputPath });\n                } else {";
text = text.replace(closeTarget, closeRepl);

fs.writeFileSync('electron/src/main.js', text);
console.log('PATCHED!');
