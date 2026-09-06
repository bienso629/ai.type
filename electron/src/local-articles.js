const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let sqlite3;
try {
    sqlite3 = require('sqlite3').verbose();
} catch (e) {
    try {
        sqlite3 = require('../node_modules/sqlite3').verbose();
    } catch (e2) {
        console.error('[local-articles] Không thể tải thư viện sqlite3:', e2);
    }
}

let articlesDbInstance = null;

function getArticlesDbDir() {
    let documentsPath;
    try {
        if (app && app.getPath) {
            documentsPath = app.getPath('documents');
        }
    } catch (e) {}
    if (!documentsPath) {
        documentsPath = path.join(require('os').homedir(), 'Documents');
    }
    const dbDir = path.join(documentsPath, 'ai.type', 'data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    return dbDir;
}

function getArticlesDbPath() {
    return path.join(getArticlesDbDir(), 'articles.sqlite');
}

function getArticlesDatabase() {
    if (articlesDbInstance) {
        return articlesDbInstance;
    }
    const dbPath = getArticlesDbPath();
    articlesDbInstance = new sqlite3.Database(dbPath);
    articlesDbInstance.serialize(() => {
        articlesDbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_articles (
                uuid TEXT PRIMARY KEY,
                title TEXT,
                url TEXT,
                content TEXT,
                markdown TEXT,
                domain TEXT,
                username TEXT,
                thumbnail TEXT,
                description TEXT,
                source_json TEXT,
                done_json TEXT,
                trash_json TEXT,
                seo_json TEXT,
                arr_keyword_json TEXT,
                tags_json TEXT,
                style_json TEXT,
                format TEXT DEFAULT 'md',
                is_local INTEGER DEFAULT 1,
                is_encrypted INTEGER DEFAULT 0,
                encrypted_payload TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        articlesDbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_articles_username ON local_articles(username)`);
        articlesDbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_articles_updated_at ON local_articles(updated_at)`);

        articlesDbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_chats (
                id TEXT PRIMARY KEY,
                conversation_id TEXT,
                username TEXT,
                question TEXT,
                content TEXT,
                answer TEXT,
                messages_json TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        articlesDbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_chats_username ON local_chats(username)`);
        articlesDbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_chats_updated_at ON local_chats(updated_at)`);
    });
    return articlesDbInstance;
}

function getLocalArticlesDir(username = 'admin') {
    let documentsPath;
    try {
        if (app && app.getPath) {
            documentsPath = app.getPath('documents');
        }
    } catch (e) {}
    if (!documentsPath) {
        documentsPath = path.join(require('os').homedir(), 'Documents');
    }
    const articlesDir = path.join(documentsPath, 'ai.type', 'local_articles', username);
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
    // Khởi tạo bảng ngay khi đăng ký handler
    getArticlesDatabase();

    /**
     * Ghi bài viết trực tiếp vào database SQLite local (articles.sqlite)
     */
    ipcMain.handle('save-local-article', async (event, payload) => {
        try {
            const {
                title,
                url,
                content,
                markdown,
                domain,
                username = 'admin',
                uuid,
                tags,
                source,
                done,
                trash,
                seo,
                arr_keyword,
                style,
                thumbnail,
                description,
                format = 'md',
                password
            } = payload || {};

            if (!content && !title && !markdown && (!done || done.length === 0)) {
                return { success: false, error: 'Tiêu đề hoặc nội dung bài viết không được để trống' };
            }

            const targetUuid = uuid || `local_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const isEncrypted = !!password;
            let storedContent = content || '';
            let pureMarkdown = markdown || htmlToMarkdownFallback(content || (Array.isArray(done) ? done.join('\n\n') : ''));
            let encryptedPayload = null;

            if (isEncrypted) {
                encryptedPayload = encryptContent(content || (Array.isArray(done) ? done.join('\n\n') : ''), password);
                storedContent = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
                pureMarkdown = '[NỘI DUNG ĐÃ ĐƯỢC MÃ HÓA AES-256 BẰNG MẬT KHẨU]';
            }

            const nowIso = new Date().toISOString();
            const createdAt = payload.created_at || payload.createdAt || nowIso;
            const updatedAt = nowIso;
            const domainStr = typeof domain === 'object' && domain ? (domain.domain || 'local.ai.type') : (domain || 'local.ai.type');

            const sourceJson = source ? JSON.stringify(source) : null;
            const doneJson = done ? JSON.stringify(done) : (content ? JSON.stringify([content]) : null);
            const trashJson = trash ? JSON.stringify(trash) : null;
            const seoJson = seo ? JSON.stringify(seo) : null;
            const arrKeywordJson = arr_keyword ? JSON.stringify(arr_keyword) : null;
            const tagsJson = tags ? JSON.stringify(tags) : null;
            const styleJson = style ? JSON.stringify(style) : null;
            const encPayloadJson = encryptedPayload ? JSON.stringify(encryptedPayload) : null;

            const db = getArticlesDatabase();
            await new Promise((resolve, reject) => {
                const query = `
                    INSERT INTO local_articles (
                        uuid, title, url, content, markdown, domain, username, thumbnail, description,
                        source_json, done_json, trash_json, seo_json, arr_keyword_json, tags_json, style_json,
                        format, is_local, is_encrypted, encrypted_payload, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(uuid) DO UPDATE SET
                        title = excluded.title,
                        url = excluded.url,
                        content = excluded.content,
                        markdown = excluded.markdown,
                        domain = excluded.domain,
                        username = excluded.username,
                        thumbnail = excluded.thumbnail,
                        description = excluded.description,
                        source_json = excluded.source_json,
                        done_json = excluded.done_json,
                        trash_json = excluded.trash_json,
                        seo_json = excluded.seo_json,
                        arr_keyword_json = excluded.arr_keyword_json,
                        tags_json = excluded.tags_json,
                        style_json = excluded.style_json,
                        format = excluded.format,
                        is_local = excluded.is_local,
                        is_encrypted = excluded.is_encrypted,
                        encrypted_payload = excluded.encrypted_payload,
                        updated_at = excluded.updated_at
                `;

                db.run(query, [
                    targetUuid,
                    title || 'Bài viết chưa đặt tên',
                    url || '',
                    isEncrypted ? storedContent : (content || ''),
                    pureMarkdown,
                    domainStr,
                    username,
                    thumbnail || '',
                    description || '',
                    sourceJson,
                    doneJson,
                    trashJson,
                    seoJson,
                    arrKeywordJson,
                    tagsJson,
                    styleJson,
                    format,
                    1,
                    isEncrypted ? 1 : 0,
                    encPayloadJson,
                    createdAt,
                    updatedAt
                ], function (err) {
                    if (err) reject(err);
                    else resolve();
                });
            });

            // Tùy chọn lưu thêm bản sao file .md phụ trong local_articles
            try {
                const articlesDir = getLocalArticlesDir(username);
                const safeTitle = sanitizeFilename(title);
                const filenameBase = `${safeTitle}_${targetUuid}`;
                const mdHeader = `# ${title || 'Bài viết chưa đặt tên'}\n\n> **Domain**: ${domainStr} | **Tạo lúc**: ${createdAt} ${isEncrypted ? '| **BẢO VỆ MẬT KHẨU (AES-256)**' : ''}\n\n---\n\n`;
                const mdPath = path.join(articlesDir, `${filenameBase}.md`);
                fs.writeFileSync(mdPath, mdHeader + (isEncrypted ? `\`\`\`encrypted\n${JSON.stringify(encryptedPayload)}\n\`\`\`` : pureMarkdown), 'utf8');
            } catch (e) {}

            return {
                success: true,
                uuid: targetUuid,
                dbPath: getArticlesDbPath(),
                is_encrypted: isEncrypted,
                message: `Đã lưu thành công bài viết vào local database: ${getArticlesDbPath()}`
            };
        } catch (error) {
            console.error('[save-local-article] Lỗi khi lưu bài viết vào database local:', error);
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
     * Lấy danh sách các bài viết lưu trong database local SQLite (articles.sqlite)
     */
    ipcMain.handle('list-local-articles', async (event, payload) => {
        try {
            const { username = 'admin' } = payload || {};
            const db = getArticlesDatabase();

            const rows = await new Promise((resolve, reject) => {
                let query = 'SELECT * FROM local_articles';
                const params = [];
                if (username && username !== 'all') {
                    query += ' WHERE username = ?';
                    params.push(username);
                }
                query += ' ORDER BY updated_at DESC, created_at DESC';

                db.all(query, params, (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const articles = rows.map(r => {
                let parsedTags = [];
                try {
                    if (r.tags_json) parsedTags = JSON.parse(r.tags_json);
                } catch (e) {}

                let parsedSource = null;
                try {
                    if (r.source_json) parsedSource = JSON.parse(r.source_json);
                } catch (e) {}

                let parsedDone = null;
                try {
                    if (r.done_json) parsedDone = JSON.parse(r.done_json);
                } catch (e) {}

                return {
                    uuid: r.uuid,
                    title: r.title,
                    url: r.url,
                    domain: r.domain,
                    username: r.username,
                    thumbnail: r.thumbnail,
                    description: r.description,
                    tags: parsedTags,
                    source: parsedSource,
                    done: parsedDone,
                    is_local: true,
                    is_encrypted: !!r.is_encrypted,
                    created_at: r.created_at,
                    updated_at: r.updated_at
                };
            });

            return { success: true, articles, total: articles.length };
        } catch (error) {
            console.error('[list-local-articles] Lỗi khi lấy danh sách từ SQLite local:', error);
            return { success: false, error: error.message, articles: [] };
        }
    });

    /**
     * Đọc chi tiết một bài viết cục bộ từ database SQLite local (Giải mã nếu có mật khẩu)
     */
    ipcMain.handle('read-local-article', async (event, payload) => {
        try {
            const { uuid, username = 'admin', password } = payload || {};
            if (!uuid) {
                return { success: false, error: 'Thiếu UUID bài viết cục bộ' };
            }

            const db = getArticlesDatabase();
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_articles WHERE uuid = ?', [uuid], (err, r) => {
                    if (err) reject(err);
                    else resolve(r);
                });
            });

            if (!row) {
                return { success: false, error: 'Không tìm thấy bài viết trong database local' };
            }

            let parsedSource = null;
            try {
                if (row.source_json) parsedSource = JSON.parse(row.source_json);
            } catch (e) {}

            let parsedDone = null;
            try {
                if (row.done_json) parsedDone = JSON.parse(row.done_json);
            } catch (e) {}

            let parsedTrash = null;
            try {
                if (row.trash_json) parsedTrash = JSON.parse(row.trash_json);
            } catch (e) {}

            let parsedSeo = null;
            try {
                if (row.seo_json) parsedSeo = JSON.parse(row.seo_json);
            } catch (e) {}

            let parsedArrKeyword = null;
            try {
                if (row.arr_keyword_json) parsedArrKeyword = JSON.parse(row.arr_keyword_json);
            } catch (e) {}

            let parsedTags = [];
            try {
                if (row.tags_json) parsedTags = JSON.parse(row.tags_json);
            } catch (e) {}

            let parsedStyle = null;
            try {
                if (row.style_json) parsedStyle = JSON.parse(row.style_json);
            } catch (e) {}

            let encryptedPayload = null;
            try {
                if (row.encrypted_payload) encryptedPayload = JSON.parse(row.encrypted_payload);
            } catch (e) {}

            const article = {
                uuid: row.uuid,
                title: row.title,
                url: row.url,
                content: row.content,
                markdown: row.markdown,
                domain: row.domain,
                username: row.username,
                thumbnail: row.thumbnail,
                description: row.description,
                source: parsedSource,
                done: parsedDone,
                trash: parsedTrash,
                seo: parsedSeo,
                arr_keyword: parsedArrKeyword,
                tags: parsedTags,
                style: parsedStyle,
                is_local: true,
                is_encrypted: !!row.is_encrypted,
                encrypted_payload: encryptedPayload,
                created_at: row.created_at,
                createdAt: row.created_at,
                updated_at: row.updated_at,
                updatedAt: row.updated_at
            };

            if (article.is_encrypted) {
                if (!password) {
                    return {
                        success: true,
                        is_encrypted: true,
                        article: {
                            ...article,
                            content: '',
                            done: []
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
                        content: result.text,
                        done: [result.text]
                    }
                };
            }

            return { success: true, is_encrypted: false, article, data: article };
        } catch (error) {
            console.error('[read-local-article] Lỗi khi đọc bài viết từ SQLite local:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Xóa bài viết khỏi database SQLite local
     */
    ipcMain.handle('delete-local-article', async (event, payload) => {
        try {
            const { uuid, username = 'admin' } = payload || {};
            if (!uuid) return { success: false, error: 'Thiếu UUID bài viết' };

            const db = getArticlesDatabase();
            const deletedCount = await new Promise((resolve, reject) => {
                db.run('DELETE FROM local_articles WHERE uuid = ?', [uuid], function (err) {
                    if (err) reject(err);
                    else resolve(this.changes || 0);
                });
            });

            // Đồng thời dọn dẹp các file md phụ nếu có
            try {
                const articlesDir = getLocalArticlesDir(username);
                const files = fs.readdirSync(articlesDir);
                for (const file of files) {
                    if (file.includes(uuid)) {
                        fs.unlinkSync(path.join(articlesDir, file));
                    }
                }
            } catch (e) {}

            return { success: true, deletedCount, message: `Đã xóa bài viết khỏi local database (${deletedCount} bản ghi)` };
        } catch (error) {
            console.error('[delete-local-article] Lỗi khi xóa bài viết khỏi SQLite local:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy danh sách bộ sưu tập từ database SQLite local
     */
    ipcMain.handle('list-local-collections', async (event, payload) => {
        try {
            const { username = 'admin' } = payload || {};
            const db = getArticlesDatabase();

            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM local_collections ORDER BY updated_at DESC', [], (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const collections = rows.map(r => {
                let parsedUuids = [];
                try {
                    if (r.uuids_json) parsedUuids = JSON.parse(r.uuids_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    title: r.title,
                    url: r.url,
                    picture: r.picture,
                    excerpt: r.excerpt,
                    username: r.username,
                    uuid: parsedUuids,
                    count: parsedUuids.length,
                    has_script: !!r.has_script,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return { success: true, data: collections, total: collections.length };
        } catch (error) {
            console.error('[list-local-collections] Lỗi:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    /**
     * Lấy danh sách domains duy nhất từ database SQLite local
     */
    ipcMain.handle('list-local-domains', async (event, payload) => {
        try {
            const db = getArticlesDatabase();
            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT DISTINCT domain FROM local_articles WHERE domain IS NOT NULL AND domain != ""', [], (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const domains = rows.map(r => ({ domain: r.domain }));
            return { success: true, data: domains, total: domains.length };
        } catch (error) {
            console.error('[list-local-domains] Lỗi:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    /**
     * Lấy số lượng thống kê từ database SQLite local
     */
    ipcMain.handle('get-local-statistics', async (event, payload) => {
        try {
            const db = getArticlesDatabase();
            const rowCount = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as total FROM local_articles', (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.total : 0);
                });
            });

            // Tính toán domainStats trực tiếp từ local_articles theo tháng
            const domainRows = await new Promise((resolve, reject) => {
                db.all('SELECT domain, strftime("%m", created_at) as month, count(*) as cnt FROM local_articles WHERE domain IS NOT NULL GROUP BY domain, strftime("%m", created_at)', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            const calculatedDomainStats = {};
            domainRows.forEach(r => {
                let dom = (r.domain || '').trim().toLowerCase();
                if (dom.startsWith('http://')) dom = dom.substring(7);
                if (dom.startsWith('https://')) dom = dom.substring(8);
                if (dom.startsWith('www.')) dom = dom.substring(4);
                if (dom.endsWith('/')) dom = dom.substring(0, dom.length - 1);
                if (!dom) return;

                const m = parseInt(r.month, 10);
                if (!calculatedDomainStats[dom]) {
                    calculatedDomainStats[dom] = {};
                }
                calculatedDomainStats[dom][m] = (calculatedDomainStats[dom][m] || 0) + (r.cnt || 0);
            });

            // Lấy thêm từ local_statistics nếu có
            const statsRow = await new Promise((resolve) => {
                db.get('SELECT * FROM local_statistics LIMIT 1', (err, row) => {
                    if (err || !row) resolve(null);
                    else {
                        try {
                            resolve(row.data_json ? JSON.parse(row.data_json) : null);
                        } catch (e) {
                            resolve(null);
                        }
                    }
                });
            });

            const mergedStats = {
                archives: rowCount,
                total: rowCount,
                done: statsRow?.done || 0,
                money: statsRow?.money || 0,
                writing: statsRow?.writing || 0,
                domainStats: Object.keys(calculatedDomainStats).length > 0 ? calculatedDomainStats : (statsRow?.domainStats || {})
            };

            return {
                success: true,
                total: rowCount,
                data: mergedStats
            };
        } catch (error) {
            console.error('[get-local-statistics] Lỗi:', error);
            return { success: false, error: error.message, total: 0 };
        }
    });

    /**
     * Lưu/Cập nhật cuộc trò chuyện vào database SQLite local
     */
    ipcMain.handle('save-local-chat', async (event, payload) => {
        try {
            const {
                _id,
                id,
                conversation_id,
                username = 'admin',
                question = '',
                content = '',
                answer = '',
                messages = []
            } = payload || {};

            const db = getArticlesDatabase();
            const chatId = _id || id || `chat_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const messagesJson = JSON.stringify(messages || []);
            const now = new Date().toISOString();

            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO local_chats (id, conversation_id, username, question, content, answer, messages_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        question = excluded.question,
                        content = excluded.content,
                        answer = excluded.answer,
                        messages_json = excluded.messages_json,
                        conversation_id = COALESCE(excluded.conversation_id, local_chats.conversation_id),
                        updated_at = excluded.updated_at
                `, [chatId, conversation_id || null, username, question, content, answer, messagesJson, now, now], function (err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            return {
                success: true,
                _id: chatId,
                id: chatId,
                data: { _id: chatId, id: chatId, conversation_id }
            };
        } catch (error) {
            console.error('[save-local-chat] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy danh sách các cuộc trò chuyện từ SQLite local
     */
    ipcMain.handle('list-local-chats', async (event, payload) => {
        try {
            const { username = 'admin', page } = payload || {};
            const db = getArticlesDatabase();
            const pageSize = page?.size || 25;
            const pageOffset = (page?.pageNumber || 0) * pageSize;

            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM local_chats WHERE username = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?', [username, pageSize, pageOffset], (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const chats = rows.map(r => {
                let parsedMessages = [];
                try {
                    if (r.messages_json) parsedMessages = JSON.parse(r.messages_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    conversation_id: r.conversation_id,
                    username: r.username,
                    question: r.question,
                    content: r.content,
                    answer: r.answer,
                    messages: parsedMessages,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return {
                success: true,
                data: {
                    docs: chats,
                    bookmark: null
                }
            };
        } catch (error) {
            console.error('[list-local-chats] Lỗi:', error);
            return { success: false, error: error.message, data: { docs: [] } };
        }
    });

    /**
     * Lấy tổng số cuộc trò chuyện từ SQLite local
     */
    ipcMain.handle('get-local-chat-total', async (event, payload) => {
        try {
            const { username = 'admin' } = payload || {};
            const db = getArticlesDatabase();
            const total = await new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as cnt FROM local_chats WHERE username = ?', [username], (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.cnt : 0);
                });
            });

            return { success: true, data: { total: total, chatgpt: total } };
        } catch (error) {
            console.error('[get-local-chat-total] Lỗi:', error);
            return { success: false, error: error.message, data: { total: 0 } };
        }
    });

    /**
     * Xóa cuộc trò chuyện khỏi SQLite local
     */
    ipcMain.handle('delete-local-chat', async (event, payload) => {
        try {
            const { id } = payload || {};
            if (!id) return { success: false, error: 'Thiếu ID' };

            const db = getArticlesDatabase();
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM local_chats WHERE id = ?', [id], function (err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            return { success: true };
        } catch (error) {
            console.error('[delete-local-chat] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });
}

module.exports = {
    registerLocalArticlesHandlers,
    getArticlesDatabase,
    getArticlesDbPath,
    getLocalArticlesDir,
    encryptContent,
    decryptContent
};
