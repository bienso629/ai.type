const { ipcMain, app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');

function getFontsDir() {
    const documentsDir = app ? app.getPath('documents') : path.join(os.homedir(), 'Documents');
    const fontsDir = path.join(documentsDir, 'ai.type', 'fonts');
    if (!fs.existsSync(fontsDir)) {
        fs.mkdirSync(fontsDir, { recursive: true });
    }
    return fontsDir;
}

function scanFontFiles(dirPath, baseFontsDir, fontGroupMap) {
    const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            scanFontFiles(fullPath, baseFontsDir, fontGroupMap);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (fontExtensions.includes(ext)) {
                // Determine folder group name relative to baseFontsDir
                const relPath = path.relative(baseFontsDir, fullPath);
                const pathParts = relPath.split(path.sep);
                
                let groupName = 'Mặc định / Khác';
                if (pathParts.length > 1) {
                    groupName = pathParts[0]; // First level directory name as group name
                }

                if (!fontGroupMap.has(groupName)) {
                    fontGroupMap.set(groupName, {
                        folderName: groupName,
                        folderPath: pathParts.length > 1 ? path.join(baseFontsDir, groupName) : baseFontsDir,
                        fonts: []
                    });
                }

                try {
                    const stats = fs.statSync(fullPath);
                    const fontName = path.basename(entry.name, ext);
                    const fontBuffer = fs.readFileSync(fullPath);
                    const base64 = fontBuffer.toString('base64');

                    let mimeType = 'font/ttf';
                    if (ext === '.otf') mimeType = 'font/otf';
                    else if (ext === '.woff') mimeType = 'font/woff';
                    else if (ext === '.woff2') mimeType = 'font/woff2';
                    const dataUrl = `data:${mimeType};base64,${base64}`;

                    fontGroupMap.get(groupName).fonts.push({
                        fileName: entry.name,
                        fontName: fontName,
                        filePath: fullPath,
                        relativePath: relPath,
                        folderName: groupName,
                        extension: ext,
                        size: stats.size,
                        sizeFormatted: (stats.size / 1024).toFixed(1) + ' KB',
                        dataUrl: dataUrl
                    });
                } catch (e) {
                    console.warn('Lỗi đọc font file:', fullPath, e);
                }
            }
        }
    }
}

function registerFontsHandlers() {
    ipcMain.handle('fonts:get-dir', async () => {
        return getFontsDir();
    });

    ipcMain.handle('fonts:open-dir', async () => {
        const fontsDir = getFontsDir();
        if (shell) {
            await shell.openPath(fontsDir);
        }
        return { success: true, path: fontsDir };
    });

    ipcMain.handle('fonts:list', async () => {
        try {
            const fontsDir = getFontsDir();
            const fontGroupMap = new Map();

            scanFontFiles(fontsDir, fontsDir, fontGroupMap);

            const groups = Array.from(fontGroupMap.values());
            // Total font count across all groups
            const totalFonts = groups.reduce((acc, g) => acc + g.fonts.length, 0);

            return { success: true, groups: groups, totalFonts, fontsDir };
        } catch (e) {
            return { success: false, error: e.message, groups: [], totalFonts: 0, fontsDir: getFontsDir() };
        }
    });

    ipcMain.handle('fonts:import-zip', async (_event, { zipName, base64Data, filePath }) => {
        try {
            const fontsDir = getFontsDir();
            let zipBuffer = null;
            if (base64Data) {
                zipBuffer = Buffer.from(base64Data, 'base64');
            } else if (filePath && fs.existsSync(filePath)) {
                zipBuffer = fs.readFileSync(filePath);
            }
            if (!zipBuffer) {
                return { success: false, error: 'Dữ liệu file ZIP không hợp lệ!' };
            }

            const cleanZipName = (zipName || 'Imported_Font')
                .replace(/\.zip$/i, '')
                .trim();

            const targetGroupDir = path.join(fontsDir, cleanZipName);
            if (!fs.existsSync(targetGroupDir)) {
                fs.mkdirSync(targetGroupDir, { recursive: true });
            }

            const zip = new JSZip();
            const contents = await zip.loadAsync(zipBuffer);
            const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
            const imported = [];

            for (const [relativePath, fileObj] of Object.entries(contents.files)) {
                if (!fileObj.dir) {
                    const ext = path.extname(relativePath).toLowerCase();
                    if (fontExtensions.includes(ext)) {
                        const fileName = path.basename(relativePath);
                        const destPath = path.join(targetGroupDir, fileName);
                        const fontBuffer = await fileObj.async('nodebuffer');
                        fs.writeFileSync(destPath, fontBuffer);
                        imported.push(fileName);
                    }
                }
            }

            return { success: true, folderName: cleanZipName, count: imported.length, imported, fontsDir };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('fonts:import-file', async (_event, { folderName, fileName, base64Data }) => {
        try {
            const fontsDir = getFontsDir();
            const groupFolder = folderName ? folderName.trim() : 'Mặc định';
            const targetDir = path.join(fontsDir, groupFolder);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const destPath = path.join(targetDir, fileName);
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(destPath, buffer);
            return { success: true, folderName: groupFolder, fileName, path: destPath };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('fonts:delete-file', async (_event, { filePath, fileName, folderName }) => {
        try {
            const fontsDir = getFontsDir();
            let targetPath = filePath;
            if (!targetPath && folderName && fileName) {
                targetPath = path.join(fontsDir, folderName, fileName);
            }
            if (targetPath && fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
                // Check if directory is empty now, if so, remove dir
                const dir = path.dirname(targetPath);
                if (dir !== fontsDir && fs.existsSync(dir)) {
                    const remaining = fs.readdirSync(dir);
                    if (remaining.length === 0) {
                        fs.rmdirSync(dir);
                    }
                }
            }
            return { success: true, fileName };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('fonts:delete-folder', async (_event, { folderName, folderPath }) => {
        try {
            const fontsDir = getFontsDir();
            let targetDir = folderPath;
            if (!targetDir && folderName) {
                targetDir = path.join(fontsDir, folderName);
            }
            if (targetDir && targetDir !== fontsDir && fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }
            return { success: true, folderName };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
}

module.exports = { registerFontsHandlers, getFontsDir };
