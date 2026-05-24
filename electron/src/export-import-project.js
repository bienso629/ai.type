const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

function registerExportImportHandlers() {
    ipcMain.handle('export-project', async (event, { projectJSON, mediaPaths }) => {
        try {
            let defaultPath = 'project.ait';
            try {
                const data = JSON.parse(projectJSON);
                if (data.uuid) defaultPath = `${data.uuid}.ait`;
            } catch (e) {
                // Ignore parse error
            }

            const { canceled, filePath } = await dialog.showSaveDialog({
                title: 'Lưu dự án',
                defaultPath: defaultPath,
                filters: [{ name: 'AI.Type Project', extensions: ['ait'] }]
            });

            if (canceled || !filePath) return { success: false, canceled: true };

            const zip = new AdmZip();
            
            // Thêm file project.json
            zip.addFile('project.json', Buffer.from(projectJSON, 'utf8'));

            // Thêm các file media vào thư mục media/
            for (const mediaPath of mediaPaths) {
                if (fs.existsSync(mediaPath)) {
                    // addLocalFile adds the file into the zip under the specified folder 'media'
                    zip.addLocalFile(mediaPath, 'media');
                }
            }

            // Lưu zip file
            zip.writeZip(filePath);

            return { success: true, filePath };
        } catch (error) {
            console.error("Export Project Error:", error);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('import-project', async (event, currentUuid) => {
        try {
            const { canceled, filePaths } = await dialog.showOpenDialog({
                title: 'Mở dự án',
                properties: ['openFile'],
                filters: [{ name: 'AI.Type Project', extensions: ['ait'] }]
            });

            if (canceled || filePaths.length === 0) return { success: false, canceled: true };

            const zipPath = filePaths[0];
            const extractDir = path.join(app.getPath('userData'), 'projects', currentUuid);
            const mediaDir = path.join(extractDir, 'media');

            // Tạo thư mục nếu chưa có
            if (!fs.existsSync(extractDir)) {
                fs.mkdirSync(extractDir, { recursive: true });
            }

            const zip = new AdmZip(zipPath);
            zip.extractAllTo(extractDir, true);

            const projectJsonPath = path.join(extractDir, 'project.json');
            if (!fs.existsSync(projectJsonPath)) {
                return { success: false, error: "Tệp dự án không hợp lệ (thiếu project.json)." };
            }

            let projectJSON = fs.readFileSync(projectJsonPath, 'utf8');

            // Thay thế %MEDIA_DIR% bằng đường dẫn thư mục media thực tế
            // Lưu ý: trong JSON, dấu gạch chéo ngược trên Windows sẽ cần được escape (hoặc dùng forward slash)
            // Dùng forward slash cho đồng bộ vì Electron/Chromium hiểu forward slash tốt trên cả Windows
            const safeMediaDir = mediaDir.replace(/\\/g, '/');
            projectJSON = projectJSON.replace(/%MEDIA_DIR%/g, safeMediaDir);

            const projectData = JSON.parse(projectJSON);

            return { success: true, projectData };
        } catch (error) {
            console.error("Import Project Error:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerExportImportHandlers };
