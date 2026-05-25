const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');

function registerExportImportHandlers() {
    ipcMain.handle('export-project', async (event, payload) => {
        try {
            const projectJSON = payload.projectJSON;
            const mediaPaths = payload.mediaPaths || [];
            const username = payload.username || 'admin';
            let data = {};

            let defaultPath = 'project.ait';
            try {
                data = JSON.parse(projectJSON);
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
            
            const docPath = app.getPath('documents');
            const targetUuid = data.uuid || 'unknown';
            const projectDir = path.join(docPath, 'ai.type', 'data', 'tts', username, targetUuid);

            const addedFiles = new Set();

            // Nếu thư mục dự án tồn tại, nén toàn bộ thư mục đó (bỏ qua file project.json vì sẽ ghi đè sau)
            if (fs.existsSync(projectDir) && fs.statSync(projectDir).isDirectory()) {
                const files = fs.readdirSync(projectDir);
                for (const file of files) {
                    if (file === 'project.json') continue; // Sẽ thêm bằng projectJSON đã xử lý
                    const fullPath = path.join(projectDir, file);
                    if (fs.statSync(fullPath).isDirectory()) {
                        zip.addLocalFolder(fullPath, file);
                    } else {
                        zip.addLocalFile(fullPath, '');
                        addedFiles.add(file);
                    }
                }
            }

            // Thêm file project.json đã được parse các đường dẫn %MEDIA_DIR%
            zip.addFile('project.json', Buffer.from(projectJSON, 'utf8'));

            // Thêm các file media từ `mediaPaths` nếu chúng KHÔNG nằm trong projectDir (phòng hờ)
            for (const mediaPath of mediaPaths) {
                if (!mediaPath) continue;

                // Loại bỏ giao thức file:// hoặc file:///
                let localPath = mediaPath;
                if (localPath.startsWith('file://')) {
                    try {
                        const url = require('url');
                        localPath = url.fileURLToPath(localPath);
                    } catch (e) {
                        if (localPath.startsWith('file:///')) {
                            localPath = process.platform === 'win32' ? localPath.slice(8) : localPath.slice(7);
                        } else {
                            localPath = localPath.slice(7);
                        }
                    }
                }

                // Giải mã các ký tự đặc biệt (ví dụ khoảng trắng %20)
                try {
                    localPath = decodeURIComponent(localPath);
                } catch (e) {
                    console.error("Lỗi giải mã đường dẫn media:", e);
                }

                if (fs.existsSync(localPath)) {
                    const filename = path.basename(localPath);
                    if (!addedFiles.has(filename)) {
                        zip.addLocalFile(localPath, '');
                        addedFiles.add(filename);
                    }
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

            if (!targetUuid) {
                targetUuid = crypto.randomUUID ? crypto.randomUUID() : `scenario_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                isNewScenario = true;
                importedData.uuid = targetUuid;
                if (importedData.videoProject) {
                    importedData.videoProject.uuid = targetUuid;
                }
            } else {
                if (targetUuid !== currentUuid) {
                    isNewScenario = true;
                }
            }

            // Giải nén trực tiếp vào thư mục Documents/ai.type/data/tts/<username>/<uuid>
            const docPath = app.getPath('documents');
            const extractDir = path.join(docPath, 'ai.type', 'data', 'tts', username || 'admin', targetUuid);
            const mediaDir = extractDir;

            // XOÁ THƯ MỤC CŨ ĐI (nếu tồn tại) ĐỂ TRÁNH NHÂN ĐÔI DỮ LIỆU
            if (fs.existsSync(extractDir)) {
                fs.rmSync(extractDir, { recursive: true, force: true });
            }
            fs.mkdirSync(extractDir, { recursive: true });

            zip.extractAllTo(extractDir, true);

            // Di chuyển các tệp từ thư mục 'media' cũ (nếu có từ bản export cũ) ra ngoài root của thư mục dự án
            const oldMediaDir = path.join(extractDir, 'media');
            if (fs.existsSync(oldMediaDir) && fs.statSync(oldMediaDir).isDirectory()) {
                const files = fs.readdirSync(oldMediaDir);
                for (const file of files) {
                    fs.renameSync(path.join(oldMediaDir, file), path.join(extractDir, file));
                }
                try {
                    fs.rmdirSync(oldMediaDir);
                } catch(e) {}
            }

            const projectData = importedData;

            // Bổ sung mediaDir vào projectData để frontend biết thư mục gốc của project
            projectData.mediaDir = mediaDir.replace(/\\/g, '/');

            // Ghi đè lại file project.json đã cập nhật UUID và đường dẫn trong thư mục dự án mới/hiện tại
            const updatedProjectJsonPath = path.join(extractDir, 'project.json');
            fs.writeFileSync(updatedProjectJsonPath, JSON.stringify(projectData, null, 2), 'utf8');

            return { success: true, isNewScenario, targetUuid, projectData };
        } catch (error) {
            console.error("Import Project Error:", error);
            return { success: false, error: error.message };
        }
    });
    ipcMain.handle('delete-project', async (event, payload) => {
        try {
            const { targetUuid, username } = payload;
            if (!targetUuid) return { success: false, error: 'Thiếu targetUuid' };
            const docPath = app.getPath('documents');
            const extractDir = path.join(docPath, 'ai.type', 'data', 'tts', username || 'admin', targetUuid);
            
            if (fs.existsSync(extractDir)) {
                fs.rmSync(extractDir, { recursive: true, force: true });
            }
            return { success: true };
        } catch (error) {
            console.error("Delete Project Error:", error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = { registerExportImportHandlers };
