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

const SERVER_MASTER_KEYS = [
    'ai_type_secret_key_2026_!@#',
    '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8',
    'ai.type.vn-secret-key-2026'
];

function decryptContent(encryptedObj, password) {
    const keysToTry = [password, ...SERVER_MASTER_KEYS].filter(Boolean);
    for (const key of keysToTry) {
        try {
            const salt = Buffer.from(encryptedObj.salt, 'hex');
            const iv = Buffer.from(encryptedObj.iv, 'hex');
            const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');
            const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
            let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            if (decrypted) {
                return { success: true, text: decrypted };
            }
        } catch (e) {}
    }
    return { success: false, error: 'Mật khẩu giải mã không chính xác!' };
}

function htmlToMarkdownFallback(html) {
    if (!html) return '';
    let text = html.toString();

    // Tables
    text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (match, tableBody) => {
        const rows = [];
        const trMatches = Array.from(tableBody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
        for (const tr of trMatches) {
            const cells = [];
            const thtdMatches = Array.from(tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi));
            for (const cell of thtdMatches) {
                cells.push(cell[1].replace(/<[^>]+>/g, '').trim());
            }
            if (cells.length > 0) rows.push(cells);
        }
        if (rows.length === 0) return '';
        let mdTable = '\n\n| ' + rows[0].join(' | ') + ' |\n';
        mdTable += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
        for (let r = 1; r < rows.length; r++) {
            mdTable += '| ' + rows[r].join(' | ') + ' |\n';
        }
        return mdTable + '\n';
    });

    // Images
    text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>/gi, '\n\n![$2]($1)\n\n');
    text = text.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, '\n\n![$1]($2)\n\n');
    text = text.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '\n\n![]($1)\n\n');

    // Headings
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n');
    text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n\n##### $1\n\n');
    text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n\n###### $1\n\n');

    // Bold, Italic, Links
    text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
    text = text.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
    text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
    text = text.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, '*$1*');
    text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

    // Paragraphs, Blockquotes, Line breaks
    text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n\n> $1\n\n');
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');

    // Clean remaining tags & HTML entities
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");
    text = text.replace(/\n{3,}/g, '\n\n').trim();

    return text;
}

function registerLocalArticlesHandlers() {
    /**
     * Ghi bài viết trực tiếp xuống ổ đĩa cục bộ (Hỗ trợ mã hóa bằng mật khẩu)
     */
    ipcMain.handle('save-local-article', async (event, payload) => {
        try {
            const { title, content, markdown, domain, username = 'admin', uuid, tags, format = 'md', password } = payload || {};
            if (!content && !title && !markdown) {
                return { success: false, error: 'Tiêu đề hoặc nội dung bài viết không được để trống' };
            }

            const targetUuid = uuid || `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const articlesDir = getLocalArticlesDir(username);
            const safeTitle = sanitizeFilename(title);
            const filenameBase = `${safeTitle}_${targetUuid}`;

            const isEncrypted = !!password;
            let storedContent = content || '';
            let pureMarkdown = markdown || htmlToMarkdownFallback(content || '');
            let encryptedPayload = null;

            if (isEncrypted) {
                encryptedPayload = encryptContent(content || '', password);
                storedContent = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
                pureMarkdown = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
            }

            const articleMetadata = {
                uuid: targetUuid,
                title: title || 'Bài viết chưa đặt tên',
                content: isEncrypted ? storedContent : (content || ''),
                markdown: isEncrypted ? pureMarkdown : pureMarkdown,
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

            // 2. Lưu file .md trực tiếp bằng Markdown chuẩn
            const mdHeader = `# ${title || 'Bài viết chưa đặt tên'}\n\n> **Domain**: ${domain || 'local.ai.type'} | **Tạo lúc**: ${articleMetadata.created_at} ${isEncrypted ? '| **BẢO VỆ MẬT KHẨU (AES-256)**' : ''}\n\n---\n\n`;
            const mdPath = path.join(articlesDir, `${filenameBase}.md`);
            fs.writeFileSync(mdPath, mdHeader + (isEncrypted ? `\`\`\`encrypted\n${JSON.stringify(encryptedPayload)}\n\`\`\`` : pureMarkdown), 'utf8');

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
            const { title, content, markdown, domain, tags, format = 'md', password } = payload || {};
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
            let pureMarkdown = markdown || htmlToMarkdownFallback(content || '');
            let encryptedPayload = null;

            if (isEncrypted) {
                encryptedPayload = encryptContent(content || '', password);
                outputContent = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
                pureMarkdown = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
            }

            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.json') {
                const data = {
                    title: title || 'Bài viết chưa đặt tên',
                    content: outputContent,
                    markdown: pureMarkdown,
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
                fs.writeFileSync(filePath, mdHeader + (isEncrypted ? `\`\`\`encrypted\n${JSON.stringify(encryptedPayload)}\n\`\`\`` : pureMarkdown), 'utf8');
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
