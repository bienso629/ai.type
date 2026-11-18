const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, ipcMain, shell, dialog } = require('electron');

const IGNORED_USERDATA_NAMES = new Set([
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'Crashpad',
    'Dictionaries',
    'Shared Dictionary',
    'blob_storage',
    'Session Storage',
    'Service Worker',
    'VideoDecodeStats',
    'WebStorage',
    'shared_proto_db',
    'SingletonCookie',
    'SingletonLock',
    'SingletonSocket',
    'Cookies-journal',
    'DIPS',
    'DIPS-shm',
    'DIPS-wal',
    'SharedStorage',
    'SharedStorage-wal',
    'Trust Tokens',
    'Trust Tokens-journal',
    'Network Persistent State',
    'TransportSecurity'
]);

function getCustomRootsConfigPath() {
    const docDir = app ? app.getPath('documents') : path.join(os.homedir(), 'Documents');
    const baseDir = path.join(docDir, 'ai.type');
    if (!fs.existsSync(baseDir)) {
        try { fs.mkdirSync(baseDir, { recursive: true }); } catch (_) {}
    }
    return path.join(baseDir, 'workspace_roots.json');
}

function loadCustomRoots() {
    try {
        const cfgPath = getCustomRootsConfigPath();
        if (fs.existsSync(cfgPath)) {
            const list = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            if (Array.isArray(list)) {
                return list.filter(item => item && typeof item.path === 'string');
            }
        }
    } catch (_) {}
    return [];
}

function saveCustomRoots(list) {
    try {
        const cfgPath = getCustomRootsConfigPath();
        fs.writeFileSync(cfgPath, JSON.stringify(list, null, 2), 'utf8');
    } catch (_) {}
}

function classifyFileCategory(ext) {
    const clean = (ext || '').toLowerCase().replace(/^\./, '');
    if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(clean)) return 'video';
    if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'flac'].includes(clean)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(clean)) return 'image';
    if (['glb', 'gltf', 'obj', 'fbx'].includes(clean)) return 'model3d';
    if (['js', 'ts', 'json', 'html', 'css', 'scss', 'py', 'sh'].includes(clean)) return 'code';
    if (['md', 'txt', 'srt', 'vtt', 'lrc', 'csv', 'log', 'pdf', 'doc', 'docx'].includes(clean)) return 'document';
    if (['sqlite', 'db', 'faiss', 'pkl', 'bin'].includes(clean)) return 'database';
    if (['zip', 'tar', 'gz', 'rar', '7z'].includes(clean)) return 'archive';
    return 'other';
}

function shouldSkipEntry(parentDir, entryName) {
    if (!entryName || entryName === '.' || entryName === '..') return true;
    if (entryName.startsWith('.org.chromium.')) return true;
    const userDataDir = app ? app.getPath('userData') : '';
    if (userDataDir && path.resolve(parentDir) === path.resolve(userDataDir)) {
        if (IGNORED_USERDATA_NAMES.has(entryName)) return true;
    }
    return false;
}

function quickDirSummary(dirPath) {
    let folderCount = 0;
    let fileCount = 0;
    let directSize = 0;
    try {
        if (!fs.existsSync(dirPath)) {
            return { exists: false, folderCount: 0, fileCount: 0, directSize: 0 };
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (shouldSkipEntry(dirPath, entry.name)) continue;
            if (entry.isDirectory()) {
                folderCount++;
            } else if (entry.isFile()) {
                fileCount++;
                try {
                    const st = fs.statSync(path.join(dirPath, entry.name));
                    directSize += st.size || 0;
                } catch (_) {}
            }
        }
        return { exists: true, folderCount, fileCount, directSize };
    } catch (_) {
        return { exists: false, folderCount: 0, fileCount: 0, directSize: 0 };
    }
}

function getDefaultWorkspaceRoots() {
    const docDir = app ? app.getPath('documents') : path.join(os.homedir(), 'Documents');
    const downloadsDir = app ? app.getPath('downloads') : path.join(os.homedir(), 'Downloads');
    const userDataDir = app ? app.getPath('userData') : path.join(os.homedir(), '.config', 'typing');

    const aiTypeDocRoot = path.join(docDir, 'ai.type');
    const aiTypingDownloads = path.join(downloadsDir, 'AI.TYPING');

    const builtInRoots = [
        {
            id: 'root_ai_type_main',
            name: 'Thư mục gốc AI.Type (Documents/ai.type)',
            badge: 'Chính',
            description: 'Thư mục làm việc trung tâm chứa toàn bộ dữ liệu, cấu hình, bài viết, phông chữ và tài nguyên của phần mềm.',
            path: aiTypeDocRoot,
            isCustom: false
        },
        {
            id: 'root_ai_typing_downloads',
            name: 'Video & Tải xuống (Downloads/AI.TYPING)',
            badge: 'Video / Media',
            description: 'Chứa các video tải về từ YouTube, Facebook, TikTok, Livestream và dữ liệu phân tích video.',
            path: aiTypingDownloads,
            isCustom: false
        },
        {
            id: 'root_tts_projects',
            name: 'Dự án Dựng phim & TTS (data/tts)',
            badge: 'Dự án TTS',
            description: 'Chứa các dự án biên tập Video Timeline, giọng đọc AI TTS, phụ đề và phân cảnh.',
            path: path.join(aiTypeDocRoot, 'data', 'tts'),
            isCustom: false
        },
        {
            id: 'root_profiles_3d',
            name: 'Hồ sơ & Không gian 3D (data/profiles)',
            badge: '3D Studio',
            description: 'Chứa nhân vật 3D, đồ vật .GLB, mẫu thiết kế phòng 3D và video quay màn hình 3D.',
            path: path.join(aiTypeDocRoot, 'data', 'profiles'),
            isCustom: false
        },
        {
            id: 'root_exports_video',
            name: 'Video Xuất bản (data/exports)',
            badge: 'Exports',
            description: 'Chứa các tệp video thành phẩm và khung hình đã kết xuất.',
            path: path.join(aiTypeDocRoot, 'data', 'exports'),
            isCustom: false
        },
        {
            id: 'root_local_articles',
            name: 'Bài viết Cục bộ (local_articles)',
            badge: 'Bài viết',
            description: 'Chứa các bài viết Markdown (.md) và nội dung soạn thảo lưu trữ trên máy.',
            path: path.join(aiTypeDocRoot, 'local_articles'),
            isCustom: false
        },
        {
            id: 'root_userdata',
            name: 'Cấu hình & Model AI (UserData)',
            badge: 'Hệ thống',
            description: 'Chứa mô hình AI cục bộ (models), khung hình tùy chỉnh (custom_frames) và dữ liệu phiên làm việc.',
            path: userDataDir,
            isCustom: false
        }
    ];

    const customRoots = loadCustomRoots().map((c, idx) => ({
        id: c.id || `custom_root_${idx}_${Date.now()}`,
        name: c.name || path.basename(c.path) || c.path,
        badge: 'Tùy chỉnh',
        description: c.description || 'Thư mục làm việc do người dùng thêm vào.',
        path: c.path,
        isCustom: true
    }));

    return [...builtInRoots, ...customRoots].map(root => {
        const summary = quickDirSummary(root.path);
        return {
            ...root,
            exists: summary.exists,
            folderCount: summary.folderCount,
            fileCount: summary.fileCount,
            directSize: summary.directSize
        };
    });
}

function listDirectoryEntries(dirPath) {
    if (!dirPath || typeof dirPath !== 'string') {
        throw new Error('Đường dẫn thư mục không hợp lệ.');
    }
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
        return [];
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
        throw new Error('Đường dẫn không phải là thư mục.');
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
        if (shouldSkipEntry(resolved, entry.name)) continue;
        const fullPath = path.join(resolved, entry.name);
        try {
            const st = fs.statSync(fullPath);
            const isDirectory = st.isDirectory();
            const ext = isDirectory ? '' : path.extname(entry.name);
            let childCount = 0;
            if (isDirectory) {
                try {
                    childCount = fs.readdirSync(fullPath).filter(n => !shouldSkipEntry(fullPath, n)).length;
                } catch (_) {}
            }
            items.push({
                name: entry.name,
                path: fullPath,
                isDirectory,
                size: isDirectory ? 0 : (st.size || 0),
                mtimeMs: st.mtimeMs || 0,
                ext: ext ? ext.toLowerCase() : '',
                category: isDirectory ? 'folder' : classifyFileCategory(ext),
                childCount
            });
        } catch (_) {}
    }

    items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
        }
        if ((b.mtimeMs || 0) !== (a.mtimeMs || 0)) {
            return (b.mtimeMs || 0) - (a.mtimeMs || 0);
        }
        return a.name.localeCompare(b.name, 'vi', { numeric: true, sensitivity: 'base' });
    });

    return items;
}

function registerWorkspaceFoldersHandlers() {
    ipcMain.handle('workspace:get-roots', async () => {
        try {
            const roots = getDefaultWorkspaceRoots();
            return { success: true, roots };
        } catch (err) {
            return { success: false, error: err.message, roots: [] };
        }
    });

    ipcMain.handle('workspace:ensure-root', async (_event, payload) => {
        try {
            const dirPath = payload?.path;
            if (!dirPath) throw new Error('Thiếu đường dẫn thư mục.');
            fs.mkdirSync(dirPath, { recursive: true });
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:list-dir', async (_event, payload) => {
        try {
            const dirPath = typeof payload === 'string' ? payload : payload?.dirPath;
            const items = listDirectoryEntries(dirPath);
            return { success: true, items };
        } catch (err) {
            return { success: false, error: err.message, items: [] };
        }
    });

    ipcMain.handle('workspace:create-folder', async (_event, payload) => {
        try {
            const parentPath = payload?.parentPath;
            const folderName = (payload?.folderName || '').trim();
            if (!parentPath || !folderName) {
                throw new Error('Vui lòng nhập tên thư mục hợp lệ.');
            }
            if (/[/\\:*?"<>|]/.test(folderName)) {
                throw new Error('Tên thư mục chứa ký tự không hợp lệ.');
            }
            const targetPath = path.join(parentPath, folderName);
            if (fs.existsSync(targetPath)) {
                throw new Error('Thư mục này đã tồn tại.');
            }
            fs.mkdirSync(targetPath, { recursive: true });
            return { success: true, path: targetPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:create-file', async (_event, payload) => {
        try {
            const parentPath = payload?.parentPath;
            const fileName = (payload?.fileName || '').trim();
            const content = typeof payload?.content === 'string' ? payload.content : '';
            if (!parentPath || !fileName) {
                throw new Error('Vui lòng nhập tên tệp hợp lệ.');
            }
            if (/[/\\:*?"<>|]/.test(fileName)) {
                throw new Error('Tên tệp chứa ký tự không hợp lệ.');
            }
            const targetPath = path.join(parentPath, fileName);
            if (fs.existsSync(targetPath)) {
                throw new Error('Tệp tin này đã tồn tại.');
            }
            fs.writeFileSync(targetPath, content, 'utf8');
            return { success: true, path: targetPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:rename-item', async (_event, payload) => {
        try {
            const itemPath = payload?.itemPath;
            const newName = (payload?.newName || '').trim();
            if (!itemPath || !newName) {
                throw new Error('Tên mới không hợp lệ.');
            }
            if (/[/\\:*?"<>|]/.test(newName)) {
                throw new Error('Tên mới chứa ký tự không hợp lệ.');
            }
            if (!fs.existsSync(itemPath)) {
                throw new Error('Tệp hoặc thư mục không tồn tại.');
            }
            const newPath = path.join(path.dirname(itemPath), newName);
            if (path.resolve(itemPath) !== path.resolve(newPath) && fs.existsSync(newPath)) {
                throw new Error('Đã có tệp hoặc thư mục trùng tên tại vị trí này.');
            }
            fs.renameSync(itemPath, newPath);
            return { success: true, newPath };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:delete-item', async (_event, payload) => {
        try {
            const itemPath = payload?.itemPath;
            if (!itemPath || !fs.existsSync(itemPath)) {
                throw new Error('Tệp hoặc thư mục không tồn tại.');
            }
            try {
                await shell.trashItem(itemPath);
            } catch (_) {
                fs.rmSync(itemPath, { recursive: true, force: true });
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:open-item', async (_event, payload) => {
        try {
            const itemPath = payload?.itemPath;
            const mode = payload?.mode || 'open';
            if (!itemPath) throw new Error('Thiếu đường dẫn.');
            if (!fs.existsSync(itemPath)) {
                throw new Error('Đường dẫn chưa tồn tại trên ổ đĩa.');
            }
            if (mode === 'reveal') {
                shell.showItemInFolder(itemPath);
            } else {
                const errMsg = await shell.openPath(itemPath);
                if (errMsg) {
                    shell.showItemInFolder(itemPath);
                }
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:preview-item', async (_event, payload) => {
        try {
            const itemPath = payload?.itemPath;
            if (!itemPath || !fs.existsSync(itemPath)) {
                throw new Error('Tệp không tồn tại.');
            }
            const st = fs.statSync(itemPath);
            if (st.isDirectory()) {
                return { success: true, type: 'directory', size: 0, mtimeMs: st.mtimeMs };
            }
            const ext = path.extname(itemPath).toLowerCase();
            const category = classifyFileCategory(ext);

            if (category === 'code' || ['md', 'txt', 'srt', 'vtt', 'lrc', 'csv', 'log', 'xml', 'yml', 'yaml', 'ini', 'conf'].includes(ext.replace(/^\./, ''))) {
                const maxBytes = 256 * 1024;
                const fd = fs.openSync(itemPath, 'r');
                const readLen = Math.min(st.size, maxBytes);
                const buf = Buffer.alloc(readLen);
                fs.readSync(fd, buf, 0, readLen, 0);
                fs.closeSync(fd);
                return {
                    success: true,
                    type: 'text',
                    category,
                    ext,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    truncated: st.size > maxBytes,
                    content: buf.toString('utf8')
                };
            }

            if (category === 'image') {
                let dataUrl = '';
                if (st.size <= 15 * 1024 * 1024) {
                    const buf = fs.readFileSync(itemPath);
                    const mimeMap = {
                        '.png': 'image/png',
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.webp': 'image/webp',
                        '.gif': 'image/gif',
                        '.svg': 'image/svg+xml',
                        '.bmp': 'image/bmp',
                        '.ico': 'image/x-icon'
                    };
                    const mime = mimeMap[ext] || 'image/png';
                    dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
                }
                return {
                    success: true,
                    type: 'image',
                    category,
                    ext,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    dataUrl
                };
            }

            if (category === 'video' || category === 'audio') {
                const normalized = itemPath.replace(/\\/g, '/');
                const mediaUrl = normalized.startsWith('/') ? `media://${normalized}` : `media:///${normalized}`;
                return {
                    success: true,
                    type: category,
                    category,
                    ext,
                    size: st.size,
                    mtimeMs: st.mtimeMs,
                    mediaUrl
                };
            }

            return {
                success: true,
                type: 'binary',
                category,
                ext,
                size: st.size,
                mtimeMs: st.mtimeMs
            };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:save-text-file', async (_event, payload) => {
        try {
            const itemPath = payload?.itemPath;
            const content = payload?.content;
            if (!itemPath || typeof content !== 'string') {
                throw new Error('Dữ liệu lưu tệp không hợp lệ.');
            }
            fs.writeFileSync(itemPath, content, 'utf8');
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:add-custom-root', async () => {
        try {
            const res = await dialog.showOpenDialog({
                title: 'Chọn thư mục làm việc để thêm vào Quản lý Thư mục',
                properties: ['openDirectory', 'createDirectory']
            });
            if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
                return { success: false, canceled: true };
            }
            const chosenPath = res.filePaths[0];
            const customRoots = loadCustomRoots();
            if (!customRoots.some(r => path.resolve(r.path) === path.resolve(chosenPath))) {
                customRoots.push({
                    id: `custom_${Date.now()}`,
                    name: `${path.basename(chosenPath)} (${chosenPath})`,
                    description: 'Thư mục làm việc tùy chỉnh do người dùng thêm.',
                    path: chosenPath
                });
                saveCustomRoots(customRoots);
            }
            return { success: true, roots: getDefaultWorkspaceRoots() };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:remove-custom-root', async (_event, payload) => {
        try {
            const targetPath = payload?.path;
            if (!targetPath) throw new Error('Thiếu đường dẫn thư mục.');
            const customRoots = loadCustomRoots().filter(
                r => path.resolve(r.path) !== path.resolve(targetPath)
            );
            saveCustomRoots(customRoots);
            return { success: true, roots: getDefaultWorkspaceRoots() };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('workspace:clean-temp-dirs', async () => {
        try {
            const downloadsDir = app ? app.getPath('downloads') : path.join(os.homedir(), 'Downloads');
            const aiTypingDir = path.join(downloadsDir, 'AI.TYPING');
            let removedCount = 0;
            let freedBytes = 0;

            const calcSizeRecursive = (p) => {
                let total = 0;
                try {
                    const st = fs.statSync(p);
                    if (st.isFile()) return st.size || 0;
                    if (st.isDirectory()) {
                        for (const child of fs.readdirSync(p)) {
                            total += calcSizeRecursive(path.join(p, child));
                        }
                    }
                } catch (_) {}
                return total;
            };

            if (fs.existsSync(aiTypingDir)) {
                const entries = fs.readdirSync(aiTypingDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && entry.name.startsWith('_temp_')) {
                        const fullPath = path.join(aiTypingDir, entry.name);
                        freedBytes += calcSizeRecursive(fullPath);
                        try {
                            fs.rmSync(fullPath, { recursive: true, force: true });
                            removedCount++;
                        } catch (_) {}
                    }
                }
            }
            return { success: true, removedCount, freedBytes };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
}

module.exports = { registerWorkspaceFoldersHandlers };
