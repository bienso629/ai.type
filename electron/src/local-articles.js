const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getLocalArticlesDir(username = 'admin') {
    const docPath = app.getPath('documents');
    const articlesDir = path.join(docPath, 'ai.type', 'local_articles', username);
    if (!fs.existsSync(articlesDir)) {
        fs.mkdirSync(articlesDir, { recursive: true });
    }
    return articlesDir;
}

function sanitizeFilename(name) {
    return (name || 'bai-viet-cuc-bo')
        .toString()
        .trim()
        .replace(/[/\\?%*:|"<>]/g, '_')
        .substring(0, 100);
}

function encryptContent(text, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text || '', 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        data: encrypted
    };
}

function decryptContent(encryptedObj, password) {
    try {
        const salt = Buffer.from(encryptedObj.salt, 'hex');
        const iv = Buffer.from(encryptedObj.iv, 'hex');
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return { success: true, text: decrypted };
    } catch (e) {
        return { success: false, error: 'Mật khẩu giải mã không chính xác!' };
    }
}

function registerLocalArticlesHandlers() {
    /**
     * Ghi bài viết trực tiếp xuống ổ đĩa cục bộ (Hỗ trợ mã hóa bằng mật khẩu)
     */
    ipcMain.handle('save-local-article', async (event, payload) => {
        try {
            const { title, content, domain, username = 'admin', uuid, tags, format = 'md', password } = payload || {};
            if (!content && !title) {
                return { success: false, error: 'Tiêu đề hoặc nội dung bài viết không được để trống' };
            }

            const targetUuid = uuid || `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const articlesDir = getLocalArticlesDir(username);
            const safeTitle = sanitizeFilename(title);
            const filenameBase = `${safeTitle}_${targetUuid}`;

            const isEncrypted = !!password;
            let storedContent = content || '';
            let encryptedPayload = null;

            if (isEncrypted) {
                encryptedPayload = encryptContent(content || '', password);
                storedContent = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
            }

            const articleMetadata = {
                uuid: targetUuid,
                title: title || 'Bài viết chưa đặt tên',
                content: isEncrypted ? storedContent : (content || ''),
                encrypted_payload: encryptedPayload,
                domain: domain || 'local.ai.type',
                username: username,
                tags: tags || [],
                format: format,
                is_local: true,
                is_encrypted: isEncrypted,
                created_at: payload.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // 1. Lưu file .json chứa thông tin metadata chi tiết
            const jsonPath = path.join(articlesDir, `${filenameBase}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(articleMetadata, null, 2), 'utf8');

            // 2. Lưu file .md trực tiếp
            const mdHeader = `# ${title || 'Bài viết chưa đặt tên'}\n\n> **Domain**: ${domain || 'local.ai.type'} | **Tạo lúc**: ${articleMetadata.created_at} ${isEncrypted ? '| **BẢO VỆ MẬT KHẨU (AES-256)**' : ''}\n\n---\n\n`;
            const mdPath = path.join(articlesDir, `${filenameBase}.md`);
            fs.writeFileSync(mdPath, mdHeader + (isEncrypted ? `\`\`\`encrypted\n${JSON.stringify(encryptedPayload)}\n\`\`\`` : storedContent), 'utf8');

            return {
                success: true,
                uuid: targetUuid,
                jsonPath,
                mdPath,
                is_encrypted: isEncrypted,
                message: `Đã lưu thành công bài viết cục bộ vào: ${mdPath}`
            };
        } catch (error) {
            console.error('Lỗi khi lưu bài viết cục bộ:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Mở hộp thoại Save Dialog cho phép người dùng chọn nơi lưu file Markdown (.md) hoặc JSON (.json) trên máy
     */
    ipcMain.handle('export-local-article-dialog', async (event, payload) => {
        try {
            const { title, content, domain, tags, format = 'md', password } = payload || {};
            const safeTitle = sanitizeFilename(title);
            const defaultExtension = format === 'json' ? 'json' : 'md';

            const { canceled, filePath } = await dialog.showSaveDialog({
                title: 'Lưu bài viết xuống ổ đĩa cục bộ',
                defaultPath: `${safeTitle}.${defaultExtension}`,
                filters: [
                    { name: 'Markdown File (*.md)', extensions: ['md'] },
                    { name: 'JSON Metadata File (*.json)', extensions: ['json'] }
                ]
            });

            if (canceled || !filePath) return { success: false, canceled: true };

            const isEncrypted = !!password;
            let outputContent = content || '';
            let encryptedPayload = null;

            if (isEncrypted) {
                encryptedPayload = encryptContent(content || '', password);
                outputContent = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
            }

            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.json') {
                const data = {
                    title: title || 'Bài viết chưa đặt tên',
                    content: outputContent,
                    encrypted_payload: encryptedPayload,
                    domain: domain || 'local.ai.type',
                    tags: tags || [],
                    is_local: true,
                    is_encrypted: isEncrypted,
                    exported_at: new Date().toISOString()
                };
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            } else {
                const mdHeader = `# ${title || 'Bài viết chưa đặt tên'}\n\n> **Domain**: ${domain || 'local.ai.type'} | **Xuất lúc**: ${new Date().toLocaleString('vi-VN')} ${isEncrypted ? '| **BẢO VỆ MẬT KHẨU (AES-256)**' : ''}\n\n---\n\n`;
                fs.writeFileSync(filePath, mdHeader + (isEncrypted ? `\`\`\`encrypted\n${JSON.stringify(encryptedPayload)}\n\`\`\`` : outputContent), 'utf8');
            }

            return { success: true, filePath, message: `Đã xuất bài viết ra tệp: ${filePath}` };
        } catch (error) {
            console.error('Lỗi khi xuất bài viết:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy danh sách các bài viết lưu cục bộ trên ổ đĩa
     */
    ipcMain.handle('list-local-articles', async (event, payload) => {
        try {
            const { username = 'admin' } = payload || {};
            const articlesDir = getLocalArticlesDir(username);
            const files = fs.readdirSync(articlesDir);

            const articles = [];
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        const fullPath = path.join(articlesDir, file);
                        const rawData = fs.readFileSync(fullPath, 'utf8');
                        const article = JSON.parse(rawData);
                        articles.push({
                            uuid: article.uuid,
                            title: article.title,
                            domain: article.domain,
                            username: article.username,
                            tags: article.tags,
                            is_local: true,
                            is_encrypted: !!article.is_encrypted,
                            created_at: article.created_at,
                            updated_at: article.updated_at,
                            filePath: fullPath
                        });
                    } catch (e) {
                        console.warn(`Không thể đọc file bài viết cục bộ: ${file}`, e);
                    }
                }
            }

            // Sắp xếp bài mới nhất lên đầu
            articles.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

            return { success: true, articles };
        } catch (error) {
            console.error('Lỗi khi lấy danh sách bài viết cục bộ:', error);
            return { success: false, error: error.message, articles: [] };
        }
    });

    /**
     * Đọc nội dung một bài viết cục bộ (Giải mã nếu có mật khẩu)
     */
    ipcMain.handle('read-local-article', async (event, payload) => {
        try {
            const { uuid, filePath, username = 'admin', password } = payload || {};
            let jsonPath = filePath;

            if (!jsonPath && uuid) {
                const articlesDir = getLocalArticlesDir(username);
                const files = fs.readdirSync(articlesDir);
                const matchingFile = files.find(f => f.includes(uuid) && f.endsWith('.json'));
                if (matchingFile) {
                    jsonPath = path.join(articlesDir, matchingFile);
                }
            }

            if (!jsonPath || !fs.existsSync(jsonPath)) {
                return { success: false, error: 'Không tìm thấy bài viết cục bộ' };
            }

            const rawData = fs.readFileSync(jsonPath, 'utf8');
            const article = JSON.parse(rawData);

            if (article.is_encrypted) {
                if (!password) {
                    return {
                        success: true,
                        is_encrypted: true,
                        article: {
                            ...article,
                            content: ''
                        }
                    };
                }

                if (!article.encrypted_payload) {
                    return { success: false, error: 'Dữ liệu mã hóa bị hỏng hoặc không hợp lệ' };
                }

                const result = decryptContent(article.encrypted_payload, password);
                if (!result.success) {
                    return { success: false, error: result.error, is_encrypted: true };
                }

                return {
                    success: true,
                    is_encrypted: true,
                    unlocked: true,
                    article: {
                        ...article,
                        content: result.text
                    }
                };
            }

            return { success: true, is_encrypted: false, article };
        } catch (error) {
            console.error('Lỗi khi đọc bài viết cục bộ:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Xóa bài viết cục bộ khỏi ổ đĩa
     */
    ipcMain.handle('delete-local-article', async (event, payload) => {
        try {
            const { uuid, username = 'admin' } = payload || {};
            if (!uuid) return { success: false, error: 'Thiếu UUID bài viết' };

            const articlesDir = getLocalArticlesDir(username);
            const files = fs.readdirSync(articlesDir);
            let deletedCount = 0;

            for (const file of files) {
                if (file.includes(uuid)) {
                    fs.unlinkSync(path.join(articlesDir, file));
                    deletedCount++;
                }
            }

            return { success: true, deletedCount, message: 'Đã xóa bài viết cục bộ' };
        } catch (error) {
            console.error('Lỗi khi xóa bài viết cục bộ:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    registerLocalArticlesHandlers,
    getLocalArticlesDir,
    encryptContent,
    decryptContent
};
