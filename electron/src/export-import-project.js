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
                if (!mediaPath) continue;

                // Loại bỏ giao thức file:// hoặc file:///
                let localPath = mediaPath;
                if (localPath.startsWith('file:///')) {
                    localPath = localPath.slice(8);
                } else if (localPath.startsWith('file://')) {
                    localPath = localPath.slice(7);
                }

                // Giải mã các ký tự đặc biệt (ví dụ khoảng trắng %20)
                try {
                    localPath = decodeURIComponent(localPath);
                } catch (e) {
                    console.error("Lỗi giải mã đường dẫn media:", e);
                }

                if (fs.existsSync(localPath)) {
                    // addLocalFile adds the file into the zip under the specified folder 'media'
                    zip.addLocalFile(localPath, 'media');
                } else {
                    console.warn(`Export Warning: Tệp media không tồn tại trên máy cục bộ: ${localPath}`);
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

    ipcMain.handle('import-project', async (event, payload) => {
        try {
            // Hỗ trợ cả payload dạng object hoặc chuỗi currentUuid đơn lẻ (để tương thích ngược)
            const currentUuid = typeof payload === 'object' ? payload.currentUuid : payload;
            const username = typeof payload === 'object' ? payload.username : 'admin';

            const { canceled, filePaths } = await dialog.showOpenDialog({
                title: 'Mở dự án',
                properties: ['openFile'],
                filters: [{ name: 'AI.Type Project', extensions: ['ait'] }]
            });

            if (canceled || filePaths.length === 0) return { success: false, canceled: true };

            const zipPath = filePaths[0];
            const zip = new AdmZip(zipPath);

            const projectJsonEntry = zip.getEntry('project.json');
            if (!projectJsonEntry) {
                return { success: false, error: "Tệp dự án không hợp lệ (thiếu project.json)." };
            }

            const rawProjectJson = projectJsonEntry.getData().toString('utf8');
            let importedData;
            try {
                importedData = JSON.parse(rawProjectJson);
            } catch (e) {
                return { success: false, error: "Không thể đọc dữ liệu project.json." };
            }

            let targetUuid = importedData.uuid;
            let isNewScenario = false;

            // Nếu tệp nhập vào không có UUID, tạo UUID mới
            if (!targetUuid) {
                targetUuid = crypto.randomUUID ? crypto.randomUUID() : `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                isNewScenario = true;
                importedData.uuid = targetUuid;
                if (importedData.videoProject) {
                    importedData.videoProject.uuid = targetUuid;
                }
            } else {
                // Giữ nguyên UUID của tệp nhập vào.
                // Nếu UUID khác kịch bản đang mở, báo frontend chuyển hướng (navigate) sang kịch bản đó
                if (targetUuid !== currentUuid) {
                    isNewScenario = true;
                }
            }

            // Giải nén trực tiếp vào thư mục Documents/ai.type/data/tts/<username>/<uuid> để hiển thị và lưu trữ đúng vị trí trực quan cho người dùng
            const docPath = app.getPath('documents');
            const extractDir = path.join(docPath, 'ai.type', 'data', 'tts', username || 'admin', targetUuid);
            const mediaDir = path.join(extractDir, 'media');

            // Tạo thư mục nếu chưa có
            if (!fs.existsSync(extractDir)) {
                fs.mkdirSync(extractDir, { recursive: true });
            }

            zip.extractAllTo(extractDir, true);

            // Chuyển đổi importedData thành chuỗi JSON để thay thế %MEDIA_DIR%
            let projectJSON = JSON.stringify(importedData);

            // Thay thế %MEDIA_DIR% bằng đường dẫn thư mục media thực tế dưới dạng URL file:// để Chromium hiển thị được
            // Lưu ý: trong JSON, dấu gạch chéo ngược trên Windows sẽ cần được escape (hoặc dùng forward slash)
            // Dùng forward slash cho đồng bộ vì Electron/Chromium hiểu forward slash tốt trên cả Windows
            const safeMediaDir = mediaDir.replace(/\\/g, '/');
            const fileProtocolPrefix = safeMediaDir.startsWith('/') ? 'file://' : 'file:///';
            const replacement = `${fileProtocolPrefix}${safeMediaDir}`;
            projectJSON = projectJSON.replace(/%MEDIA_DIR%/g, replacement);

            const projectData = JSON.parse(projectJSON);

            // Ghi đè lại file project.json đã cập nhật UUID và đường dẫn trong thư mục dự án mới/hiện tại
            const updatedProjectJsonPath = path.join(extractDir, 'project.json');
            fs.writeFileSync(updatedProjectJsonPath, JSON.stringify(projectData, null, 2), 'utf8');

            return { success: true, isNewScenario, targetUuid, projectData };
        } catch (error) {
            console.error("Import Project Error:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerExportImportHandlers };
