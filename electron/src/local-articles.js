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

const articlesDbInstances = {};
let activeLocalUsername = 'admin';

function setActiveLocalUsername(username) {
    if (username && typeof username === 'string' && username.trim() && username !== 'all') {
        activeLocalUsername = username.trim();
    }
}

function getActiveLocalUsername() {
    return activeLocalUsername || 'admin';
}

function sanitizeUsername(username) {
    if (!username || typeof username !== 'string') return 'admin';
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
    return clean || 'admin';
}

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

function getArticlesDbPath(username = 'admin') {
    const sanitized = sanitizeUsername(username);
    const dbDir = getArticlesDbDir();
    if (sanitized === 'admin') {
        const adminPath = path.join(dbDir, 'articles_admin.sqlite');
        if (fs.existsSync(adminPath)) {
            return adminPath;
        }
        const legacyPath = path.join(dbDir, 'articles.sqlite');
        if (fs.existsSync(legacyPath)) {
            return legacyPath;
        }
        return adminPath;
    }
    return path.join(dbDir, `articles_${sanitized}.sqlite`);
}

function getArticlesDatabase(username) {
    const targetUser = username || activeLocalUsername || 'admin';
    const sanitized = sanitizeUsername(targetUser);
    if (articlesDbInstances[sanitized]) {
        return articlesDbInstances[sanitized];
    }
    const dbPath = getArticlesDbPath(sanitized);
    const dbInstance = new sqlite3.Database(dbPath);
    articlesDbInstances[sanitized] = dbInstance;

    dbInstance.serialize(() => {
        dbInstance.run(`
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
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_articles_username ON local_articles(username)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_articles_updated_at ON local_articles(updated_at)`);

        dbInstance.run(`
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
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_chats_username ON local_chats(username)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_chats_updated_at ON local_chats(updated_at)`);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_domains (
                domain TEXT PRIMARY KEY,
                name TEXT,
                username TEXT,
                password TEXT,
                note TEXT,
                monthly_target INTEGER DEFAULT 0,
                writing_style TEXT,
                ga4_property_id TEXT,
                server_ip TEXT,
                server_username TEXT,
                server_password TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_tasks (
                id TEXT PRIMARY KEY,
                username TEXT,
                domain_id TEXT,
                year INTEGER,
                month INTEGER,
                day INTEGER,
                title TEXT,
                status TEXT,
                done INTEGER DEFAULT 0,
                task_json TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_tasks_username ON local_tasks(username)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_tasks_domain_id ON local_tasks(domain_id)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_tasks_year ON local_tasks(year)`);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_nodes (
                id TEXT PRIMARY KEY,
                title TEXT,
                url TEXT,
                username TEXT,
                uuids_json TEXT,
                raw_json TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_nodes_username ON local_nodes(username)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_nodes_url ON local_nodes(url)`);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_comments (
                id TEXT PRIMARY KEY,
                uuid TEXT NOT NULL,
                blockid TEXT NOT NULL,
                author TEXT,
                username TEXT,
                comment_json TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_comments_uuid ON local_comments(uuid)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_comments_blockid ON local_comments(blockid)`);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_forum_categories (
                cid INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT,
                description TEXT,
                disabled INTEGER DEFAULT 0,
                order_num INTEGER DEFAULT 0
            )
        `);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_collections (
                id TEXT PRIMARY KEY,
                title TEXT,
                url TEXT,
                picture TEXT,
                excerpt TEXT,
                username TEXT DEFAULT 'admin',
                uuids_json TEXT,
                count INTEGER DEFAULT 0,
                has_script INTEGER DEFAULT 0,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_collections_username ON local_collections(username)`);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_link_collections (
                id TEXT PRIMARY KEY,
                title TEXT,
                ids_json TEXT,
                username TEXT DEFAULT 'admin',
                created_at TEXT,
                updated_at TEXT
            )
        `);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_links (
                id TEXT PRIMARY KEY,
                link TEXT,
                title TEXT,
                options_json TEXT,
                username TEXT DEFAULT 'admin',
                created_at TEXT,
                updated_at TEXT
            )
        `);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_facebook_posts (
                id TEXT PRIMARY KEY,
                uuid INTEGER,
                used INTEGER DEFAULT 0,
                facegroup TEXT,
                text TEXT,
                images_json TEXT,
                href_json TEXT,
                username TEXT DEFAULT 'admin',
                created_at TEXT,
                updated_at TEXT
            )
        `);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_fb_posts_facegroup ON local_facebook_posts(facegroup)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_fb_posts_created_at ON local_facebook_posts(created_at)`);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_gologin_tokens (
                id TEXT PRIMARY KEY,
                token TEXT,
                profiles_json TEXT,
                username TEXT DEFAULT 'admin',
                created_at TEXT,
                updated_at TEXT
            )
        `);

        dbInstance.run(`
            CREATE TABLE IF NOT EXISTS local_scripts (
                uuid TEXT PRIMARY KEY,
                username TEXT DEFAULT 'admin',
                title TEXT,
                outline TEXT,
                script TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        `);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_scripts_username ON local_scripts(username)`);
        dbInstance.run(`CREATE INDEX IF NOT EXISTS idx_local_scripts_updated_at ON local_scripts(updated_at)`);

        // Tự động nạp dữ liệu kịch bản scripts từ backup nếu bảng đang trống và đúng user admin
        if (sanitized === 'admin') {
            dbInstance.get('SELECT COUNT(*) as count FROM local_scripts', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(getArticlesDbDir(), 'backup', 'admin_scripts_2023.json'),
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_scripts_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_scripts_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const raw = fs.readFileSync(backupFile, 'utf8');
                            const list = JSON.parse(raw);
                            if (Array.isArray(list) && list.length > 0) {
                                const stmt = dbInstance.prepare(
                                    'INSERT OR REPLACE INTO local_scripts (uuid, username, title, outline, script, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                                );
                                for (const item of list) {
                                    const uuid = item.uuid || item._id || item.id;
                                    if (!uuid) continue;
                                    const title = item.title || item.name || '';
                                    const outline = item.outline || '';
                                    const script = item.script || '';
                                    const createdAt = item.createdAt || new Date().toISOString();
                                    const updatedAt = item.updatedAt || createdAt;
                                    stmt.run(uuid, 'admin', title, outline, script, createdAt, updatedAt);
                                }
                                stmt.finalize();
                                console.log(`[local-scripts] Đã tự động nạp ${list.length} kịch bản từ backup.`);
                            }
                        }
                    } catch (e) {
                        console.error('[local-scripts] Lỗi khi nạp từ backup:', e);
                    }
                }
            });

            // Tự động nạp dữ liệu gologin tokens từ backup nếu bảng đang trống
            dbInstance.get('SELECT COUNT(*) as count FROM local_gologin_tokens', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_gologin_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_gologin_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const raw = fs.readFileSync(backupFile, 'utf8');
                            const list = JSON.parse(raw);
                            if (Array.isArray(list) && list.length > 0) {
                                const stmt = dbInstance.prepare(
                                    'INSERT OR REPLACE INTO local_gologin_tokens (id, token, profiles_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
                                );
                                for (const item of list) {
                                    const id = item._id || item.id || crypto.randomUUID();
                                    const token = item.token || '';
                                    const profilesJson = JSON.stringify(item.profiles || []);
                                    const createdAt = item.createdAt || new Date().toISOString();
                                    const updatedAt = item.updatedAt || createdAt;
                                    stmt.run(id, token, profilesJson, 'admin', createdAt, updatedAt);
                                }
                                stmt.finalize();
                                console.log(`[local-gologin-tokens] Đã tự động nạp ${list.length} token GoLogin từ backup.`);
                            }
                        }
                    } catch (e) {
                        console.error('[local-gologin-tokens] Lỗi khi nạp từ backup:', e);
                    }
                }
            });

            // Tự động nạp dữ liệu collections từ backup nếu bảng đang trống hoặc chứa rel:
            dbInstance.get('SELECT COUNT(*) as count FROM local_collections WHERE id NOT LIKE "rel:%"', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(getArticlesDbDir(), 'backup', 'admin_collections_2023.json'),
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_collections_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_collections_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const raw = fs.readFileSync(backupFile, 'utf8');
                            const rawCols = JSON.parse(raw);
                            if (Array.isArray(rawCols) && rawCols.length > 0) {
                                const collections = rawCols.filter(x => x && x.type === 'collection');
                                const rels = rawCols.filter(x => x && x.type === 'collection_uuid');
                                const uuidsByCol = {};
                                for (const r of rels) {
                                    if (r.collection_id && r.uuid) {
                                        if (!uuidsByCol[r.collection_id]) uuidsByCol[r.collection_id] = [];
                                        if (!uuidsByCol[r.collection_id].includes(r.uuid)) {
                                            uuidsByCol[r.collection_id].push(r.uuid);
                                        }
                                    }
                                }

                                dbInstance.serialize(() => {
                                    dbInstance.run('DELETE FROM local_collections WHERE id LIKE "rel:%"');
                                    const stmt = dbInstance.prepare(`
                                        INSERT OR REPLACE INTO local_collections (id, title, url, picture, excerpt, username, uuids_json, count, has_script, created_at, updated_at)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    `);
                                    for (const c of collections) {
                                        const id = c._id || c.id;
                                        if (!id) continue;
                                        const colUuids = uuidsByCol[id] || (Array.isArray(c.uuids) ? c.uuids : (Array.isArray(c.uuid) ? c.uuid : []));
                                        stmt.run(
                                            id,
                                            c.title || '',
                                            c.url || '',
                                            c.picture || '',
                                            c.excerpt || '',
                                            'admin',
                                            JSON.stringify(colUuids),
                                            colUuids.length,
                                            c.has_script ? 1 : 0,
                                            c.createdAt || new Date().toISOString(),
                                            c.updatedAt || new Date().toISOString()
                                        );
                                    }
                                    stmt.finalize();
                                    console.log(`[local-collections] Đã tự động nạp ${collections.length} bộ sưu tập từ backup.`);
                                });
                            }
                        }
                    } catch (e) {
                        console.error('[local-collections] Lỗi khi nạp từ backup:', e);
                    }
                }
            });

            // Tự động nạp dữ liệu link collections từ backup nếu bảng đang trống
            dbInstance.get('SELECT COUNT(*) as count FROM local_link_collections', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_link_collections_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_link_collections_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const raw = fs.readFileSync(backupFile, 'utf8');
                            const list = JSON.parse(raw);
                            if (Array.isArray(list) && list.length > 0) {
                                const stmt = dbInstance.prepare(
                                    'INSERT OR REPLACE INTO local_link_collections (id, title, ids_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
                                );
                                for (const item of list) {
                                    const id = item._id || item.id;
                                    const title = item.title || 'Bộ sưu tập link';
                                    const idsJson = JSON.stringify(item.ids || []);
                                    const createdAt = item.createdAt || new Date().toISOString();
                                    const updatedAt = item.updatedAt || createdAt;
                                    stmt.run(id, title, idsJson, 'admin', createdAt, updatedAt);
                                }
                                stmt.finalize();
                                console.log(`[local-link-collections] Đã tự động nạp ${list.length} bộ sưu tập link từ backup.`);
                            }
                        }
                    } catch (e) {
                        console.error('[local-link-collections] Lỗi khi nạp từ backup:', e);
                    }
                }
            });

            // Tự động nạp dữ liệu links từ backup nếu bảng đang trống
            dbInstance.get('SELECT COUNT(*) as count FROM local_links', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_links_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_links_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const raw = fs.readFileSync(backupFile, 'utf8');
                            const list = JSON.parse(raw);
                            if (Array.isArray(list) && list.length > 0) {
                                const stmt = dbInstance.prepare(
                                    'INSERT OR REPLACE INTO local_links (id, link, title, options_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
                                );
                                for (const item of list) {
                                    const id = item._id || item.id;
                                    const link = item.link || '';
                                    const title = item.title || link;
                                    const optionsJson = JSON.stringify(item.options || {});
                                    const createdAt = item.createdAt || new Date().toISOString();
                                    const updatedAt = item.updatedAt || createdAt;
                                    stmt.run(id, link, title, optionsJson, 'admin', createdAt, updatedAt);
                                }
                                stmt.finalize();
                                console.log(`[local-links] Đã tự động nạp ${list.length} link từ backup.`);
                            }
                        }
                    } catch (e) {
                        console.error('[local-links] Lỗi khi nạp từ backup:', e);
                    }
                }
            });

            // Tự động nạp dữ liệu facebook posts từ backup nếu bảng đang trống
            dbInstance.get('SELECT COUNT(*) as count FROM local_facebook_posts', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_facebook_posts_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_facebook_posts_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const raw = fs.readFileSync(backupFile, 'utf8');
                            const list = JSON.parse(raw);
                            if (Array.isArray(list) && list.length > 0) {
                                const stmt = dbInstance.prepare(
                                    'INSERT OR REPLACE INTO local_facebook_posts (id, uuid, used, facegroup, text, images_json, href_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                                );
                                for (const item of list) {
                                    const id = item._id || item.id;
                                    const uuidVal = item.uuid || 0;
                                    const used = item.used ? 1 : 0;
                                    const facegroup = item.facegroup || '';
                                    const text = item.text || '';
                                    const imagesJson = JSON.stringify(item.images || []);
                                    const hrefJson = JSON.stringify(item.href || []);
                                    const createdAt = item.createdAt || new Date().toISOString();
                                    const updatedAt = item.updatedAt || createdAt;
                                    stmt.run(id, uuidVal, used, facegroup, text, imagesJson, hrefJson, 'admin', createdAt, updatedAt);
                                }
                                stmt.finalize();
                                console.log(`[local-facebook-posts] Đã tự động nạp ${list.length} bài viết facebook từ backup.`);
                            }
                        }
                    } catch (e) {
                        console.error('[local-facebook-posts] Lỗi khi nạp từ backup:', e);
                    }
                }
            });
        }

        // Khởi tạo danh mục diễn đàn mặc định nếu chưa có
        dbInstance.get('SELECT COUNT(*) as count FROM local_forum_categories', (err, row) => {
            if (!err && (!row || row.count === 0)) {
                const defaultCategories = [
                    { cid: 1, name: 'Cafe Buổi Sáng', slug: '1/cafe-buổi-sáng', description: 'Những tin tức mới nhất cập nhật về thế giới công nghệ AI năm 2023', order_num: 1 },
                    { cid: 3, name: 'Giới thiệu Phim', slug: '3/giới-thiệu-phim', description: 'Thành viên được quyền tải tài nguyên hình ảnh, video miễn phí', order_num: 2 },
                    { cid: 28, name: 'Giới thiệu Trò chơi', slug: '28/giới-thiệu-trò-chơi', description: 'Thông tin & đánh giá các Game hay đang chơi mới nhất.', order_num: 3 },
                    { cid: 15, name: 'Chuyện đời', slug: '15/chuyện-đời', description: 'Nơi mọi người cùng chia sẻ câu chuyện của mình.', order_num: 4 },
                    { cid: 27, name: 'Radio Chill Phết', slug: '27/radio-chill-phết', description: 'Nghe Radio và Audio ngay cả khi bạn phải thường xuyên di chuyển.', order_num: 5 },
                    { cid: 25, name: 'Truyện Hay Phết', slug: '25/truyện-hay-phết', description: 'Đọc truyện online, đọc truyện chữ, truyện bao hay mà chỉ có mỗi AD thích.', order_num: 6 },
                    { cid: 29, name: 'Mô hình AI Thiết kế', slug: '29/mô-hình-ai-thiết-kế', description: 'Trong này toàn quái vật', order_num: 7 },
                    { cid: 8, name: 'Mô hình AI Âm thanh', slug: '8/mô-hình-ai-âm-thanh', description: 'Hỗ trợ sáng tạo thiết kế âm thanh, nhạc và thuyết minh', order_num: 8 },
                    { cid: 7, name: 'Mô hình AI sáng tạo Hình ảnh', slug: '7/mô-hình-ai-sáng-tạo-hình-ảnh', description: 'Công cụ hỗ trợ thiết kế & chỉnh sửa hình ảnh đẹp lung linh cho bạn', order_num: 9 },
                    { cid: 6, name: 'Mô hình AI sáng tạo Video', slug: '6/mô-hình-ai-sáng-tạo-video', description: 'Công cụ hỗ trợ bạn thiết kế mọi loại video yêu thích để đăng lên Tiktok, Youtube và Facebook', order_num: 10 },
                    { cid: 5, name: 'Mô hình AI viết', slug: '5/mô-hình-ai-viết', description: 'Hỏi nhanh đáp lẹ chính là AI tụi mình', order_num: 11 },
                    { cid: 24, name: 'Học làm Video', slug: '24/học-làm-video', description: 'Các bài hướng dẫn tập chỉnh sửa video bằng Davinci Resolve do con gà AD lượm được', order_num: 12 },
                    { cid: 13, name: 'Content SEO', slug: '13/content-seo', description: 'Content SEO chính là cầu nối giữa website của bạn đến các công cụ tìm kiếm.', order_num: 13 },
                    { cid: 10, name: 'Lập trình Python', slug: '10/lập-trình-python', description: 'Tìm hiểu về ngôn ngữ lập trình Python dùng cho AI ngay từ bây giờ', order_num: 14 },
                    { cid: 12, name: 'Bí Kíp Viết', slug: '12/bí-kíp-viết', description: 'Để viết tốt, bạn không chỉ cứ ngồi vào bạn và viết. Mà bên cạnh đó, bạn phải đọc mỗi ngày.', order_num: 15 },
                    { cid: 4, name: 'Chợ phần mềm', slug: '4/chợ-phần-mềm', description: 'Gian hàng buôn bán phần mềm của anh em.', order_num: 16 },
                    { cid: 14, name: 'Phần mềm AI.TYPE', slug: '14/phần-mềm-ai-type', description: 'Giới thiệu và hướng dẫn sử dụng phần mềm tự động tạo bài viết AI.TYPE', order_num: 17 }
                ];
                const stmt = dbInstance.prepare(
                    'INSERT OR REPLACE INTO local_forum_categories (cid, name, slug, description, disabled, order_num) VALUES (?, ?, ?, ?, 0, ?)'
                );
                for (const cat of defaultCategories) {
                    stmt.run(cat.cid, cat.name, cat.slug, cat.description, cat.order_num);
                }
                stmt.finalize();
            }
        });

        // Chỉ tự động nạp nodes, domains, articles từ backup cho tài khoản admin
        if (sanitized === 'admin') {
            // Tự động nạp dữ liệu từ thư mục backup nếu bảng local_nodes đang trống
            dbInstance.get('SELECT COUNT(*) as count FROM local_nodes', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_nodes_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_nodes_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const rawContent = fs.readFileSync(backupFile, 'utf8');
                            const nodes = JSON.parse(rawContent);
                            if (Array.isArray(nodes) && nodes.length > 0) {
                                const stmt = dbInstance.prepare(`
                                    INSERT OR REPLACE INTO local_nodes (id, title, url, username, uuids_json, raw_json, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const n of nodes) {
                                    const nodeId = n._id || n.id;
                                    const url = n.url || '';
                                    let title = n.title;
                                    if (!title && Array.isArray(n.meta)) {
                                        for (const m of n.meta) {
                                            if (m && typeof m === 'object' && ((m.name && m.name.toLowerCase().includes('title')) || (m.property && m.property.toLowerCase().includes('title')))) {
                                                title = m.content;
                                                break;
                                            }
                                        }
                                    }
                                    if (!title && n.heading && Array.isArray(n.heading.h1)) {
                                        const h1s = n.heading.h1.filter(x => x && x.trim());
                                        if (h1s.length > 0) title = h1s[0];
                                    }
                                    if (!title) title = url || 'Node';

                                    const username = 'admin';
                                    const uuids = JSON.stringify(n.uuids || []);
                                    const rawJson = JSON.stringify(n);
                                    const createdAt = n.createdAt || n.updatedAt || new Date().toISOString();
                                    const updatedAt = n.updatedAt || createdAt;
                                    stmt.run(nodeId, title, url, username, uuids, rawJson, createdAt, updatedAt);
                                }
                                stmt.finalize();
                                console.log(`[local-nodes] Đã tự động nạp ${nodes.length} bản ghi node từ backup.`);
                            }
                        }
                    } catch (backupErr) {
                        console.error('[local-nodes] Lỗi khi nạp từ backup:', backupErr);
                    }
                }
            });

            // Tự động nạp dữ liệu tên miền và mật khẩu từ thư mục backup vào local_domains
            dbInstance.get('SELECT COUNT(*) as count FROM local_domains WHERE password IS NOT NULL AND password != ""', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_domain_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_domain_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const rawContent = fs.readFileSync(backupFile, 'utf8');
                            const domains = JSON.parse(rawContent);
                            if (Array.isArray(domains) && domains.length > 0) {
                                const stmt = dbInstance.prepare(`
                                    INSERT INTO local_domains (
                                        domain, name, username, password, note, monthly_target, writing_style,
                                        ga4_property_id, server_ip, server_username, server_password, created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    ON CONFLICT(domain) DO UPDATE SET
                                        name = excluded.name,
                                        username = excluded.username,
                                        password = excluded.password,
                                        note = excluded.note,
                                        monthly_target = excluded.monthly_target,
                                        writing_style = excluded.writing_style,
                                        ga4_property_id = excluded.ga4_property_id,
                                        server_ip = excluded.server_ip,
                                        server_username = excluded.server_username,
                                        server_password = excluded.server_password,
                                        updated_at = excluded.updated_at
                                `);
                                for (const d of domains) {
                                    if (!d.domain) continue;
                                    const encPass = encryptDomainPassword(d.password);
                                    const encServerPass = encryptDomainPassword(d.serverPassword);
                                    const now = new Date().toISOString();
                                    stmt.run(
                                        d.domain,
                                        d.name || d.domain,
                                        d.username || '',
                                        encPass,
                                        d.note || '',
                                        d.monthlyTarget || 0,
                                        d.writingStyle || '',
                                        d.ga4PropertyId || '',
                                        d.serverIp || '',
                                        d.serverUsername || '',
                                        encServerPass,
                                        d.createdAt || now,
                                        d.updatedAt || now
                                    );
                                }
                                stmt.finalize();
                                console.log(`[local-domains] Đã tự động nạp ${domains.length} tên miền và mật khẩu từ backup.`);
                            }
                        }
                    } catch (backupErr) {
                        console.error('[local-domains] Lỗi khi nạp từ backup:', backupErr);
                    }
                }
            });

            // Tự động nạp dữ liệu bài viết từ backup nếu bảng local_articles đang trống
            dbInstance.get('SELECT COUNT(*) as count FROM local_articles', (err, row) => {
                if (!err && (!row || row.count === 0)) {
                    try {
                        const backupCandidates = [
                            path.join(getArticlesDbDir(), 'backup', 'admin_archives_2023.json'),
                            path.join(require('os').homedir(), 'Documents', 'Projects', 'Typing', 'backup', 'admin_archives_2023.json'),
                            path.join(__dirname, '..', '..', 'backup', 'admin_archives_2023.json')
                        ];
                        const backupFile = backupCandidates.find(f => fs.existsSync(f));
                        if (backupFile) {
                            const rawContent = fs.readFileSync(backupFile, 'utf8');
                            const archives = JSON.parse(rawContent);
                            if (Array.isArray(archives) && archives.length > 0) {
                                const stmt = dbInstance.prepare(`
                                    INSERT OR REPLACE INTO local_articles (
                                        uuid, title, url, content, markdown, domain, username,
                                        thumbnail, description, source_json, done_json, trash_json,
                                        seo_json, arr_keyword_json, tags_json, style_json,
                                        format, is_local, is_encrypted, encrypted_payload,
                                        created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const doc of archives) {
                                    const uuid = doc.uuid || doc._id;
                                    if (!uuid) continue;
                                    const title = doc.title || (doc.name ? doc.name : '');
                                    const url = doc.url || '';
                                    const content = doc.content || '';
                                    const markdown = doc.markdown || '';
                                    const domain = doc.domain || '';
                                    const username = doc.username || 'admin';
                                    const thumbnail = doc.thumbnail || '';
                                    const description = doc.description || '';
                                    const sourceJson = JSON.stringify(doc.source || {});
                                    const doneJson = JSON.stringify(doc.done || {});
                                    const trashJson = JSON.stringify(doc.trash || {});
                                    const seoJson = JSON.stringify(doc.seo || {});
                                    const arrKeywordJson = JSON.stringify(doc.arr_keyword || []);
                                    const tagsJson = JSON.stringify(doc.tags || []);
                                    const styleJson = JSON.stringify(doc.style || {});
                                    const format = doc.format || 'md';
                                    const isLocal = 1;
                                    const isEncrypted = 0;
                                    const encryptedPayload = '';
                                    const createdAt = doc.createdAt || doc.created_at || new Date().toISOString();
                                    const updatedAt = doc.updatedAt || doc.updated_at || createdAt;

                                    stmt.run(
                                        uuid, title, url, content, markdown, domain, username,
                                        thumbnail, description, sourceJson, doneJson, trashJson,
                                        seoJson, arrKeywordJson, tagsJson, styleJson,
                                        format, isLocal, isEncrypted, encryptedPayload,
                                        createdAt, updatedAt
                                    );
                                }
                                stmt.finalize();
                                console.log(`[local-articles] Đã tự động nạp ${archives.length} bài viết từ backup archives.`);
                            }
                        }
                    } catch (backupErr) {
                        console.error('[local-articles] Lỗi khi nạp archives từ backup:', backupErr);
                    }
                }
            });
        }
    });
    return dbInstance;
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

const NANOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-';
function generateNanoId(size = 10) {
    let id = '';
    const bytes = crypto.randomBytes(size);
    for (let i = 0; i < size; i++) {
        id += NANOID_ALPHABET[bytes[i] & 63];
    }
    return id;
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

function getMachineKey() {
    let machineId = '';
    try {
        if (fs.existsSync('/etc/machine-id')) {
            machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        } else if (fs.existsSync('/var/lib/dbus/machine-id')) {
            machineId = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
        }
    } catch (e) {}
    if (!machineId) {
        machineId = require('os').hostname() + '_' + require('os').userInfo().username;
    }
    return crypto.createHash('sha256').update(machineId + '_ai_type_domain_vault_salt_2026').digest('hex').substring(0, 32);
}

function encryptDomainPassword(plainText) {
    if (!plainText) return '';
    const str = String(plainText).trim();
    if (!str) return '';
    if (str.startsWith('ENC_AES256:')) return str; // Đã được mã hoá trước đó
    try {
        const key = Buffer.from(getMachineKey(), 'utf8');
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(str, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return `ENC_AES256:${iv.toString('hex')}:${encrypted}`;
    } catch (err) {
        console.error('[encryptDomainPassword] Lỗi mã hoá:', err);
        return plainText;
    }
}

function decryptDomainPassword(cipherText) {
    if (!cipherText) return '';
    let str = String(cipherText).trim();
    if (!str) return '';

    // 1. Giải mã định dạng mã hóa cục bộ ENC_AES256:IV:CIPHER
    if (str.startsWith('ENC_AES256:')) {
        try {
            const parts = str.split(':');
            if (parts.length === 3) {
                const iv = Buffer.from(parts[1], 'hex');
                const encryptedData = parts[2];
                const key = Buffer.from(getMachineKey(), 'utf8');
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                str = decrypted;
            }
        } catch (err) {
            console.error('[decryptDomainPassword] Lỗi giải mã ENC_AES256:', err);
            return '';
        }
    }

    // 2. Giải mã định dạng mã hóa từ backend type.vn (IV_HEX:CIPHER_HEX, IV dài 32 ký tự hex)
    if (str && str.includes(':')) {
        const defaultKey = 'yEnAi_vX2n#8pM!xZ9yQ@1kW5rT$4sY&';
        let key = (process.env.CRYPTO_SECRET_KEY || defaultKey).padEnd(32, '0').substring(0, 32);
        try {
            const textParts = str.split(':');
            if (textParts.length === 2 && textParts[0].length === 32) {
                const iv = Buffer.from(textParts[0], 'hex');
                const encryptedText = Buffer.from(textParts[1], 'hex');
                const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
                let decrypted = decipher.update(encryptedText);
                decrypted = Buffer.concat([decrypted, decipher.final()]);
                const res = decrypted.toString();
                if (res) return res;
            }
        } catch (e) {
            // Giữ nguyên chuỗi nếu không phải khóa này
        }
    }

    return str;
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
    ipcMain.handle('set-active-local-user', async (event, payload) => {
        try {
            const username = (payload && typeof payload === 'object') ? (payload.username || payload.name || payload.email) : payload;
            setActiveLocalUsername(username);
            getArticlesDatabase(username);
            return { success: true, activeUser: activeLocalUsername };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

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

            const targetUuid = uuid || generateNanoId(10);
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

            const db = getArticlesDatabase(username);
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
            const { username = getActiveLocalUsername(), uuids, keyword, domain } = payload || {};
            const db = getArticlesDatabase(username);

            const rows = await new Promise((resolve, reject) => {
                let query = 'SELECT a.*, (s.uuid IS NOT NULL) AS has_script FROM local_articles a LEFT JOIN local_scripts s ON a.uuid = s.uuid';
                const conditions = [];
                const params = [];

                if (username && username !== 'all') {
                    conditions.push('a.username = ?');
                    params.push(username);
                }

                if (Array.isArray(uuids) && uuids.length > 0) {
                    const placeholders = uuids.map(() => '?').join(',');
                    conditions.push(`a.uuid IN (${placeholders})`);
                    params.push(...uuids);
                } else if (typeof uuids === 'string' && uuids.trim()) {
                    conditions.push('a.uuid = ?');
                    params.push(uuids.trim());
                }

                if (keyword && keyword.trim()) {
                    conditions.push('(a.title LIKE ? OR a.description LIKE ?)');
                    const kw = `%${keyword.trim()}%`;
                    params.push(kw, kw);
                }

                if (domain && domain.trim()) {
                    conditions.push('a.domain = ?');
                    params.push(domain.trim());
                }

                if (conditions.length > 0) {
                    query += ' WHERE ' + conditions.join(' AND ');
                }

                query += ' ORDER BY a.updated_at DESC, a.created_at DESC';

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
                    has_script: !!r.has_script,
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
            const { uuid, username = getActiveLocalUsername(), password } = payload || {};
            if (!uuid) {
                return { success: false, error: 'Thiếu UUID bài viết cục bộ' };
            }

            const db = getArticlesDatabase(username);
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
            const { uuid, username = getActiveLocalUsername() } = payload || {};
            if (!uuid) return { success: false, error: 'Thiếu UUID bài viết' };

            const db = getArticlesDatabase(username);
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
            const { username = getActiveLocalUsername() } = payload || {};
            const db = getArticlesDatabase(username);

            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM local_collections WHERE id NOT LIKE "rel:%" ORDER BY updated_at DESC', [], (err, resultRows) => {
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
     * Tạo hoặc lưu bộ sưu tập cục bộ
     */
    ipcMain.handle('save-local-collection', async (event, payload) => {
        try {
            const { id = crypto.randomUUID(), title, url, picture = '', excerpt = '', username = getActiveLocalUsername(), uuid = [] } = payload || {};
            if (!title) {
                return { success: false, message: 'Tiêu đề bộ sưu tập không được để trống.' };
            }
            const db = getArticlesDatabase(username);
            const uuidsList = Array.isArray(uuid) ? uuid : (uuid ? [uuid] : []);
            const now = new Date().toISOString();

            await new Promise((resolve, reject) => {
                const stmt = db.prepare(`
                    INSERT INTO local_collections (id, title, url, picture, excerpt, username, uuids_json, count, has_script, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        url = excluded.url,
                        picture = excluded.picture,
                        excerpt = excluded.excerpt,
                        uuids_json = excluded.uuids_json,
                        count = excluded.count,
                        updated_at = excluded.updated_at
                `);
                stmt.run(
                    id,
                    title,
                    url || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    picture,
                    excerpt,
                    username,
                    JSON.stringify(uuidsList),
                    uuidsList.length,
                    now,
                    now,
                    (err) => (err ? reject(err) : resolve())
                );
                stmt.finalize();
            });

            return { success: true, id, message: 'Lưu bộ sưu tập cục bộ thành công.' };
        } catch (error) {
            console.error('[save-local-collection] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Thêm bài viết vào bộ sưu tập cục bộ
     */
    ipcMain.handle('store-local-collection', async (event, payload) => {
        try {
            const { _id, id, uuid, username = getActiveLocalUsername() } = payload || {};
            const colId = _id || id;
            if (!colId || !uuid) {
                return { success: false, message: 'Thiếu thông tin bộ sưu tập hoặc bài viết.' };
            }
            const db = getArticlesDatabase(username);
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_collections WHERE id = ?', [colId], (err, r) => err ? reject(err) : resolve(r));
            });
            if (!row) {
                return { success: false, message: 'Không tìm thấy bộ sưu tập.' };
            }

            let uuids = [];
            try {
                if (row.uuids_json) uuids = JSON.parse(row.uuids_json);
            } catch (e) {}

            if (!uuids.includes(uuid)) {
                uuids.push(uuid);
            }
            const now = new Date().toISOString();

            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE local_collections SET uuids_json = ?, count = ?, updated_at = ? WHERE id = ?',
                    [JSON.stringify(uuids), uuids.length, now, colId],
                    (err) => err ? reject(err) : resolve()
                );
            });

            return { success: true, message: 'Thêm vào bộ sưu tập thành công.' };
        } catch (error) {
            console.error('[store-local-collection] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Xóa bài viết khỏi bộ sưu tập cục bộ
     */
    ipcMain.handle('remove-from-local-collection', async (event, payload) => {
        try {
            const { _id, id, uuid, username = getActiveLocalUsername() } = payload || {};
            const colId = _id || id;
            if (!colId || !uuid) {
                return { success: false, message: 'Thiếu thông tin bộ sưu tập hoặc bài viết.' };
            }
            const db = getArticlesDatabase(username);
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_collections WHERE id = ?', [colId], (err, r) => err ? reject(err) : resolve(r));
            });
            if (!row) {
                return { success: false, message: 'Không tìm thấy bộ sưu tập.' };
            }

            let uuids = [];
            try {
                if (row.uuids_json) uuids = JSON.parse(row.uuids_json);
            } catch (e) {}

            uuids = uuids.filter(u => u !== uuid);
            const now = new Date().toISOString();

            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE local_collections SET uuids_json = ?, count = ?, updated_at = ? WHERE id = ?',
                    [JSON.stringify(uuids), uuids.length, now, colId],
                    (err) => err ? reject(err) : resolve()
                );
            });

            return { success: true, message: 'Đã gỡ bài viết khỏi bộ sưu tập.' };
        } catch (error) {
            console.error('[remove-from-local-collection] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Helper bóc tách Title, Meta Description, Meta Keywords từ HTML website
     */
    function extractHtmlMetadata(html) {
        if (!html || typeof html !== 'string') {
            return { title: '', description: '', keywords: '', sampleText: '' };
        }
        let title = '';
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();

        let description = '';
        const descRegexes = [
            /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i,
            /<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i,
            /<meta\s+[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i,
            /<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i,
            /<meta\s+[^>]*name=["']twitter:description["'][^>]*content=["']([^"']*)["']/i
        ];
        for (const reg of descRegexes) {
            const m = html.match(reg);
            if (m && m[1]) {
                description = m[1].trim();
                break;
            }
        }

        let keywords = '';
        const kwRegexes = [
            /<meta\s+[^>]*name=["']keywords["'][^>]*content=["']([^"']*)["']/i,
            /<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']keywords["']/i
        ];
        for (const reg of kwRegexes) {
            const m = html.match(reg);
            if (m && m[1]) {
                keywords = m[1].trim();
                break;
            }
        }

        // Lấy headings
        const headings = [];
        const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
        let match;
        while ((match = headingRegex.exec(html)) !== null && headings.length < 8) {
            const cleanText = match[1].replace(/<[^>]+>/g, '').trim();
            if (cleanText) headings.push(cleanText);
        }

        // Clean body sample text
        let cleanBody = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
                            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
                            .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim();
        const sampleText = (headings.length > 0 ? `Tiêu đề mục: ${headings.join(' | ')}. ` : '') + cleanBody.substring(0, 1000);

        return { title, description, keywords, sampleText };
    }

    /**
     * Bóc tách thông tin trang web trực tiếp từ Electron main process (bypass CORS & timeout)
     */
    ipcMain.handle('fetch-domain-metadata', async (event, rawDomain) => {
        if (!rawDomain) return { title: '', description: '', keywords: '', sampleText: '', isLive: false };
        let targetUrl = rawDomain.trim();
        if (!/^https?:\/\//i.test(targetUrl)) {
            targetUrl = 'https://' + targetUrl;
        }

        const http = require('http');
        const https = require('https');
        const { URL } = require('url');

        function fetchUrl(urlStr, redirectCount = 0) {
            return new Promise((resolve) => {
                if (redirectCount > 4) {
                    return resolve({ success: false, error: 'Quá nhiều chuyển hướng' });
                }
                try {
                    const parsedUrl = new URL(urlStr);
                    const client = parsedUrl.protocol === 'https:' ? https : http;
                    const req = client.get(urlStr, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                        },
                        timeout: 10000
                    }, (res) => {
                        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            let nextUrl = res.headers.location;
                            if (!nextUrl.startsWith('http')) {
                                nextUrl = new URL(nextUrl, urlStr).toString();
                            }
                            return resolve(fetchUrl(nextUrl, redirectCount + 1));
                        }
                        if (res.statusCode !== 200) {
                            return resolve({ success: false, statusCode: res.statusCode });
                        }
                        let data = '';
                        res.on('data', chunk => {
                            data += chunk;
                            if (data.length > 2000000) { // Giới hạn 2MB
                                req.destroy();
                                resolve({ success: true, html: data });
                            }
                        });
                        res.on('end', () => resolve({ success: true, html: data }));
                    });
                    req.on('error', err => resolve({ success: false, error: err.message }));
                    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
                } catch (err) {
                    resolve({ success: false, error: err.message });
                }
            });
        }

        try {
            let res = await fetchUrl(targetUrl);
            // Thử fallback sang http nếu https thất bại
            if (!res.success && targetUrl.startsWith('https://')) {
                const fallbackHttp = targetUrl.replace(/^https:\/\//i, 'http://');
                res = await fetchUrl(fallbackHttp);
            }

            if (res.success && res.html) {
                const meta = extractHtmlMetadata(res.html);
                return {
                    ...meta,
                    isLive: true
                };
            }
            return { title: '', description: '', keywords: '', sampleText: '', isLive: false };
        } catch (e) {
            return { title: '', description: '', keywords: '', sampleText: '', isLive: false };
        }
    });

    /**
     * Lưu hoặc cập nhật thông tin tên miền vào bảng local_domains
     */
    ipcMain.handle('save-local-domain', async (event, domainData) => {
        try {
            if (!domainData || !domainData.domain) {
                return { success: false, error: 'Thiếu domain' };
            }
            const targetUser = domainData.user || domainData.username || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const now = new Date().toISOString();

            const encryptedPassword = encryptDomainPassword(domainData.password || '');
            const encryptedServerPassword = encryptDomainPassword(domainData.serverPassword || '');

            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO local_domains (
                        domain, name, username, password, note, monthly_target, writing_style,
                        ga4_property_id, server_ip, server_username, server_password, updated_at, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(domain) DO UPDATE SET
                        name = excluded.name,
                        username = excluded.username,
                        password = excluded.password,
                        note = excluded.note,
                        monthly_target = excluded.monthly_target,
                        writing_style = excluded.writing_style,
                        ga4_property_id = excluded.ga4_property_id,
                        server_ip = excluded.server_ip,
                        server_username = excluded.server_username,
                        server_password = excluded.server_password,
                        updated_at = excluded.updated_at
                `, [
                    domainData.domain,
                    domainData.name || domainData.domain,
                    domainData.username || '',
                    encryptedPassword,
                    domainData.note || '',
                    domainData.monthlyTarget || 0,
                    domainData.writingStyle || '',
                    domainData.ga4PropertyId || '',
                    domainData.serverIp || '',
                    domainData.serverUsername || '',
                    encryptedServerPassword,
                    now,
                    now
                ], function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            return { success: true, message: 'Đã lưu tên miền cục bộ thành công' };
        } catch (error) {
            console.error('[save-local-domain] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy danh sách domains duy nhất từ database SQLite local (chuẩn từ bảng local_domains đã được backup/sync)
     */
    ipcMain.handle('list-local-domains', async (event, payload) => {
        try {
            const targetUser = (payload && (payload.username || payload.user)) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);

            // 1. Lấy tất cả tên miền đã lưu trong bảng local_domains (đã đồng bộ từ JSON backup)
            const savedDomains = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM local_domains ORDER BY domain ASC', [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                });
            });

            // Map trực tiếp từ bảng local_domains chuẩn, tự giải mã mật khẩu cấp RAM
            const domains = savedDomains.map(sd => {
                const dom = (sd.domain || '').trim();
                return {
                    domain: dom,
                    name: sd.name || dom,
                    username: sd.username || '',
                    password: decryptDomainPassword(sd.password || ''),
                    note: sd.note || '',
                    monthlyTarget: sd.monthly_target || 0,
                    writingStyle: sd.writing_style || '',
                    ga4PropertyId: sd.ga4_property_id || '',
                    serverIp: sd.server_ip || '',
                    serverUsername: sd.server_username || '',
                    serverPassword: decryptDomainPassword(sd.server_password || '')
                };
            }).filter(d => !!d.domain);

            return { success: true, data: domains, total: domains.length };
        } catch (error) {
            console.error('[list-local-domains] Lỗi:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    /**
     * Lấy danh sách tasks từ database SQLite local
     */
    ipcMain.handle('list-local-tasks', async (event, payload) => {
        try {
            const targetUser = (payload && (payload.username || payload.user)) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const year = payload?.year ? parseInt(payload.year, 10) : new Date().getFullYear();

            // 1. Lấy tasks từ bảng local_tasks
            let query = 'SELECT * FROM local_tasks WHERE 1=1';
            const params = [];

            if (payload?.year) {
                query += ' AND year = ?';
                params.push(year);
            }
            if (payload?.domain) {
                query += ' AND domain_id = ?';
                params.push(payload.domain);
            }

            query += ' ORDER BY created_at DESC';

            const rows = await new Promise((resolve, reject) => {
                db.all(query, params, (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const tasksMap = new Map();

            rows.forEach(r => {
                let taskObj = {};
                try {
                    taskObj = r.task_json ? JSON.parse(r.task_json) : {};
                } catch (e) {
                    taskObj = {};
                }
                const t = {
                    ...taskObj,
                    _id: r.id,
                    id: r.id,
                    username: r.username,
                    domain_id: r.domain_id,
                    domain: r.domain_id,
                    year: r.year,
                    month: r.month,
                    day: r.day,
                    title: r.title,
                    name: r.title,
                    status: r.status,
                    done: !!r.done
                };
                tasksMap.set(r.id, t);
            });

            // 2. Tự động đồng bộ các bài viết từ bảng local_articles sang thành task hiển thị trên lịch
            let articleQuery = 'SELECT uuid, domain, username, title, created_at, seo_json FROM local_articles WHERE domain IS NOT NULL AND domain != ""';
            const articleParams = [];
            if (payload?.domain) {
                articleQuery += ' AND (domain = ? OR domain LIKE ?)';
                articleParams.push(payload.domain, `%${payload.domain}%`);
            }

            const articleRows = await new Promise((resolve, reject) => {
                db.all(articleQuery, articleParams, (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            for (const art of articleRows) {
                const artId = 'article_task_' + art.uuid;
                if (tasksMap.has(artId)) continue;

                let dObj = new Date(art.created_at || Date.now());
                if (isNaN(dObj.getTime())) dObj = new Date();
                const artYear = dObj.getFullYear();
                const artMonth = dObj.getMonth() + 1;
                const artDay = dObj.getDate();

                if (payload?.year && artYear !== year) continue;

                const startStr = `${artYear}-${String(artMonth).padStart(2, '0')}-${String(artDay).padStart(2, '0')}T08:00:00`;
                const endStr = `${artYear}-${String(artMonth).padStart(2, '0')}-${String(artDay).padStart(2, '0')}T17:00:00`;

                let metaText = '';
                if (art.seo_json) {
                    try {
                        const parsedSeo = JSON.parse(art.seo_json);
                        metaText = parsedSeo.description?.text || parsedSeo.mainkey || '';
                    } catch (e) {}
                }

                tasksMap.set(artId, {
                    _id: artId,
                    id: artId,
                    article_uuid: art.uuid,
                    username: art.username || 'admin',
                    domain_id: art.domain,
                    domain: art.domain,
                    domainName: art.domain,
                    year: artYear,
                    month: artMonth,
                    day: artDay,
                    title: art.title,
                    name: art.title,
                    status: 'done',
                    done: true,
                    startDate: startStr,
                    endDate: endStr,
                    meta: metaText,
                    created_at: art.created_at || new Date().toISOString()
                });
            }

            const tasks = Array.from(tasksMap.values());
            return { success: true, data: tasks, result: tasks, total: tasks.length };
        } catch (error) {
            console.error('[list-local-tasks] Lỗi:', error);
            return { success: false, error: error.message, data: [], result: [] };
        }
    });

    /**
     * Thêm hoặc cập nhật task vào database SQLite local
     */
    ipcMain.handle('save-local-task', async (event, payload) => {
        try {
            const task = payload?.task || payload || {};
            const username = payload?.username || task.username || getActiveLocalUsername();
            const db = getArticlesDatabase(username);
            const id = task._id || task.id || ('local_task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
            const domainId = task.domain_id || task.domain || task.domainName || '';
            const year = task.year ? parseInt(task.year, 10) : new Date().getFullYear();
            const month = task.month ? parseInt(task.month, 10) : (new Date().getMonth() + 1);
            const day = task.day ? parseInt(task.day, 10) : new Date().getDate();
            const title = task.title || task.name || '';
            const status = task.status || (task.done ? 'done' : 'pending');
            const done = task.done ? 1 : 0;
            const now = new Date().toISOString();

            const taskJson = JSON.stringify({
                ...task,
                _id: id,
                id: id,
                username: username,
                domain_id: domainId,
                year: year,
                month: month,
                day: day,
                title: title,
                status: status,
                done: !!done,
                updated_at: now
            });

            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO local_tasks (
                        id, username, domain_id, year, month, day, title, status, done, task_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        username = excluded.username,
                        domain_id = excluded.domain_id,
                        year = excluded.year,
                        month = excluded.month,
                        day = excluded.day,
                        title = excluded.title,
                        status = excluded.status,
                        done = excluded.done,
                        task_json = excluded.task_json,
                        updated_at = excluded.updated_at
                `, [
                    id,
                    username,
                    domainId,
                    year,
                    month,
                    day,
                    title,
                    status,
                    done,
                    taskJson,
                    task.created_at || now,
                    now
                ], function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            return {
                success: true,
                id: id,
                _id: id,
                rev: '1-' + Date.now(),
                _rev: '1-' + Date.now(),
                message: 'Đã lưu task cục bộ thành công'
            };
        } catch (error) {
            console.error('[save-local-task] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Xóa task khỏi database SQLite local
     */
    ipcMain.handle('delete-local-task', async (event, payload) => {
        try {
            const targetUser = (payload && (payload.username || payload.user)) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const task = payload?.task || payload || {};
            const id = task._id || task.id || (typeof payload === 'string' ? payload : null);

            if (!id) {
                return { success: false, error: 'Thiếu id của task để xóa' };
            }

            await new Promise((resolve, reject) => {
                db.run('DELETE FROM local_tasks WHERE id = ?', [id], function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            return { success: true, message: 'Đã xóa task cục bộ thành công' };
        } catch (error) {
            console.error('[delete-local-task] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy số lượng thống kê từ database SQLite local
     */
    ipcMain.handle('get-local-statistics', async (event, payload) => {
        try {
            const targetUser = (payload && (payload.username || payload.user)) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
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
                if (!dom || dom.includes('[object') || dom.includes('object object')) return;

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
                username = getActiveLocalUsername(),
                question = '',
                content = '',
                answer = '',
                messages = []
            } = payload || {};

            const db = getArticlesDatabase(username);
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
            const { username = getActiveLocalUsername(), page } = payload || {};
            const db = getArticlesDatabase(username);
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
            const { username = getActiveLocalUsername() } = payload || {};
            const db = getArticlesDatabase(username);
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
            const { id, username = getActiveLocalUsername() } = payload || {};
            if (!id) return { success: false, error: 'Thiếu ID' };

            const db = getArticlesDatabase(username);
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

    /**
     * Lấy danh sách WP2MD từ SQLite local
     */
    ipcMain.handle('list-local-wp2md', async (event, payload) => {
        try {
            const { keyword = '', page } = payload || {};
            const db = getArticlesDatabase();
            const pageSize = page?.size || 25;
            const pageOffset = (page?.pageNumber || 0) * pageSize;

            let sql = 'SELECT id, title, hostname, created_at, updated_at, raw_json FROM local_wp_posts';
            const params = [];

            if (keyword && keyword.trim()) {
                sql += ' WHERE title LIKE ? OR hostname LIKE ?';
                const kw = `%${keyword.trim()}%`;
                params.push(kw, kw);
            }

            sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(pageSize, pageOffset);

            const rows = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const docs = rows.map(r => {
                let parsed = {};
                try {
                    if (r.raw_json) parsed = JSON.parse(r.raw_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    title: r.title || parsed.title || parsed.object?.title || '',
                    hostname: r.hostname || parsed.hostname || 'localhost',
                    createdAt: r.created_at || parsed.createdAt,
                    updatedAt: r.updated_at || parsed.updatedAt,
                    object: parsed.object || {}
                };
            });

            return {
                success: true,
                data: {
                    docs: docs,
                    bookmark: null
                }
            };
        } catch (error) {
            console.error('[list-local-wp2md] Lỗi:', error);
            return { success: false, error: error.message, data: { docs: [] } };
        }
    });

    /**
     * Lấy tổng số lượng bản ghi WP2MD từ SQLite local
     */
    ipcMain.handle('get-local-wp2md-total', async (event, payload) => {
        try {
            const { keyword = '' } = payload || {};
            const db = getArticlesDatabase();

            let sql = 'SELECT COUNT(*) as cnt FROM local_wp_posts';
            const params = [];

            if (keyword && keyword.trim()) {
                sql += ' WHERE title LIKE ? OR hostname LIKE ?';
                const kw = `%${keyword.trim()}%`;
                params.push(kw, kw);
            }

            const total = await new Promise((resolve, reject) => {
                db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.cnt : 0);
                });
            });

            return {
                success: true,
                data: {
                    total: total,
                    wp2md: total
                }
            };
        } catch (error) {
            console.error('[get-local-wp2md-total] Lỗi:', error);
            return { success: false, error: error.message, data: { total: 0 } };
        }
    });

    /**
     * Lấy chi tiết bản ghi WP2MD từ SQLite local
     */
    ipcMain.handle('get-local-wp2md-details', async (event, payload) => {
        try {
            const { id } = payload || {};
            if (!id) return { success: false, error: 'Thiếu ID' };

            const db = getArticlesDatabase();
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_wp_posts WHERE id = ?', [id], (err, resultRow) => {
                    if (err) reject(err);
                    else resolve(resultRow);
                });
            });

            if (!row) {
                return { success: false, error: 'Không tìm thấy bản ghi' };
            }

            let parsed = {};
            try {
                if (row.raw_json) parsed = JSON.parse(row.raw_json);
            } catch (e) {}

            return {
                success: true,
                data: {
                    _id: row.id,
                    id: row.id,
                    title: row.title || parsed.title || parsed.object?.title || '',
                    hostname: row.hostname || parsed.hostname || 'localhost',
                    object: parsed.object || {
                        title: row.title || '',
                        'content:encoded': row.content || '',
                        link: parsed.object?.link || ''
                    }
                }
            };
        } catch (error) {
            console.error('[get-local-wp2md-details] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Chuyển đổi bài viết WordPress sang Markdown cục bộ
     */
    ipcMain.handle('convert-local-wp2md', async (event, payload) => {
        try {
            const { id } = payload || {};
            if (!id) return { success: false, error: 'Thiếu ID' };

            const db = getArticlesDatabase();
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_wp_posts WHERE id = ?', [id], (err, resultRow) => {
                    if (err) reject(err);
                    else resolve(resultRow);
                });
            });

            if (!row) return { success: false, error: 'Không tìm thấy bản ghi' };

            let parsed = {};
            try {
                if (row.raw_json) parsed = JSON.parse(row.raw_json);
            } catch (e) {}

            const htmlContent = parsed.object?.['content:encoded'] || row.content || '';
            const mdResult = htmlToMarkdownFallback(htmlContent);

            return {
                success: true,
                data: {
                    result: mdResult,
                    title: row.title || parsed.title || ''
                }
            };
        } catch (error) {
            console.error('[convert-local-wp2md] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy danh sách Nodes từ SQLite local
     */
    ipcMain.handle('list-local-nodes', async (event, payload) => {
        try {
            const { username = getActiveLocalUsername(), keyword = '', page, bookmark } = payload || {};
            const db = getArticlesDatabase(username);
            const pageSize = page?.size || 100;
            const pageOffset = (page?.pageNumber || 0) * pageSize;

            let sql = 'SELECT * FROM local_nodes WHERE (username = ? OR username IS NULL)';
            const params = [username];

            if (keyword && keyword.trim()) {
                sql += ' AND (title LIKE ? OR url LIKE ?)';
                const kw = `%${keyword.trim()}%`;
                params.push(kw, kw);
            }

            sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(pageSize, pageOffset);

            const rows = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, resultRows) => {
                    if (err) reject(err);
                    else resolve(resultRows || []);
                });
            });

            const docs = rows.map(r => {
                let parsed = {};
                try {
                    if (r.raw_json) parsed = JSON.parse(r.raw_json);
                } catch (e) {}

                let uuids = [];
                try {
                    if (r.uuids_json) uuids = JSON.parse(r.uuids_json);
                    else if (parsed.uuids && Array.isArray(parsed.uuids)) uuids = parsed.uuids;
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    title: r.title || parsed.title || 'Node',
                    url: r.url || parsed.url || '',
                    uuids: uuids,
                    createdAt: r.created_at || parsed.createdAt,
                    updatedAt: r.updated_at || parsed.updatedAt,
                    ...parsed
                };
            });

            return {
                success: true,
                data: {
                    docs: docs,
                    bookmark: null
                }
            };
        } catch (error) {
            console.error('[list-local-nodes] Lỗi:', error);
            return { success: false, error: error.message, data: { docs: [] } };
        }
    });

    /**
     * Lấy tổng số lượng Node từ SQLite local
     */
    ipcMain.handle('get-local-nodes-total', async (event, payload) => {
        try {
            const { username = getActiveLocalUsername(), keyword = '' } = payload || {};
            const db = getArticlesDatabase(username);

            let sql = 'SELECT COUNT(*) as cnt FROM local_nodes WHERE (username = ? OR username IS NULL)';
            const params = [username];

            if (keyword && keyword.trim()) {
                sql += ' AND (title LIKE ? OR url LIKE ?)';
                const kw = `%${keyword.trim()}%`;
                params.push(kw, kw);
            }

            const total = await new Promise((resolve, reject) => {
                db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? row.cnt : 0);
                });
            });

            return {
                success: true,
                data: {
                    total: total,
                    node: total
                }
            };
        } catch (error) {
            console.error('[get-local-nodes-total] Lỗi:', error);
            return { success: false, error: error.message, data: { total: 0 } };
        }
    });

    /**
     * Lưu Node cục bộ vào SQLite
     */
    ipcMain.handle('save-local-node', async (event, payload) => {
        try {
            const { url, type, node, username = getActiveLocalUsername() } = payload || {};
            if (!node && !url) return { success: false, error: 'Dữ liệu node không hợp lệ' };

            const db = getArticlesDatabase(username);
            const nodeData = node || {};
            const nodeId = nodeData._id || nodeData.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const title = nodeData.title || url || 'Node';
            const nodeUrl = url || nodeData.url || '';
            const uuids = Array.isArray(nodeData.uuids) ? nodeData.uuids : [];
            const now = new Date().toISOString();

            await new Promise((resolve, reject) => {
                const sql = `
                    INSERT INTO local_nodes (id, title, url, username, uuids_json, raw_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        title = excluded.title,
                        url = excluded.url,
                        uuids_json = excluded.uuids_json,
                        raw_json = excluded.raw_json,
                        updated_at = excluded.updated_at
                `;
                db.run(sql, [nodeId, title, nodeUrl, username, JSON.stringify(uuids), JSON.stringify(nodeData), now, now], function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });

            return { success: true, id: nodeId, message: 'Đã lưu node cục bộ' };
        } catch (error) {
            console.error('[save-local-node] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy chi tiết Node từ SQLite local
     */
    ipcMain.handle('get-local-node-details', async (event, payload) => {
        try {
            const { id, username = getActiveLocalUsername() } = payload || {};
            if (!id) return { success: false, error: 'Thiếu ID' };

            const db = getArticlesDatabase(username);
            const row = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_nodes WHERE id = ?', [id], (err, resultRow) => {
                    if (err) reject(err);
                    else resolve(resultRow);
                });
            });

            if (!row) {
                return { success: false, error: 'Không tìm thấy node' };
            }

            let parsed = {};
            try {
                if (row.raw_json) parsed = JSON.parse(row.raw_json);
            } catch (e) {}

            let uuids = [];
            try {
                if (row.uuids_json) uuids = JSON.parse(row.uuids_json);
            } catch (e) {}

            return {
                success: true,
                data: {
                    _id: row.id,
                    id: row.id,
                    title: row.title,
                    url: row.url,
                    uuids: uuids,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                    ...parsed
                }
            };
        } catch (error) {
            console.error('[get-local-node-details] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * ==========================================
     * WORDPRESS LOCAL PROXY IPC HANDLERS
     * Tự động request trực tiếp từ máy local lên Website WordPress (bỏ qua API Server trung gian)
     * ==========================================
     */

    function buildWpAuthHeader(username, password) {
        if (!username || !password || password.startsWith('****') || username.startsWith('****')) return {};
        const cleanPass = decryptDomainPassword(password);
        if (!cleanPass || cleanPass.startsWith('****')) return {};
        const token = Buffer.from(`${username}:${cleanPass}`).toString('base64');
        return { 'Authorization': `Basic ${token}` };
    }

    async function getEffectiveWpAuth(rawDomain, username, password) {
        let cleanUser = (username || '').trim();
        let cleanPass = (password || '').trim();
        if (cleanUser && cleanPass && !cleanUser.startsWith('****') && !cleanPass.startsWith('****')) {
            return { username: cleanUser, password: cleanPass };
        }
        const cleanDomain = (rawDomain || '').trim();
        const cleanHost = cleanDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
        const cleanHttp = 'http://' + cleanHost;
        const cleanHttps = 'https://' + cleanHost;

        return new Promise((resolve) => {
            const db = getArticlesDatabase();
            db.get(
                'SELECT username, password FROM local_domains WHERE LOWER(domain) = ? OR LOWER(domain) = ? OR LOWER(domain) = ? OR LOWER(domain) LIKE ? OR LOWER(domain) LIKE ? LIMIT 1',
                [cleanHttps, cleanHttp, cleanHost, '%' + cleanHost + '%', '%' + cleanHost.replace(/^www\./, '') + '%'],
                (err, row) => {
                    if (row) {
                        resolve({
                            username: (cleanUser && !cleanUser.startsWith('****')) ? cleanUser : row.username,
                            password: (cleanPass && !cleanPass.startsWith('****')) ? cleanPass : row.password
                        });
                    } else {
                        resolve({ username: cleanUser, password: cleanPass });
                    }
                }
            );
        });
    }

    // 1. Lấy danh sách chuyên mục WordPress trực tiếp từ Local
    ipcMain.handle('wp:categories', async (event, payload) => {
        try {
            let { domain, username, password, apppass } = payload || {};
            if (!domain) return { success: false, error: 'Thiếu domain' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            // Trường hợp đặc biệt: domain chính xác là diễn đàn type.vn (sử dụng API diễn đàn NodeBB)
            const cleanDomainHost = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
            const isTypeVnForum = cleanDomainHost === 'type.vn' || cleanDomainHost === 'www.type.vn';
            if (isTypeVnForum) {
                try {
                    const onlineResp = await fetch('https://type.vn/api/categories', {
                        headers: { 'User-Agent': 'Mozilla/5.0 AI.Type/1.0' },
                        signal: AbortSignal.timeout(3000)
                    });
                    if (onlineResp.ok) {
                        const onlineJson = await onlineResp.json();
                        const list = onlineJson?.categories || [];
                        if (Array.isArray(list) && list.length > 0) {
                            return {
                                success: true,
                                data: list.map(c => ({
                                    id: c.cid,
                                    cid: c.cid,
                                    name: c.name,
                                    slug: c.slug
                                }))
                            };
                        }
                    }
                } catch (e) {}

                // Fallback từ SQLite
                const db = getArticlesDatabase();
                const rows = await new Promise((resolve) => {
                    db.all('SELECT * FROM local_forum_categories WHERE disabled = 0 ORDER BY order_num ASC, cid ASC', [], (err, r) => {
                        resolve(r || []);
                    });
                });
                return {
                    success: true,
                    data: rows.map(r => ({
                        id: r.cid,
                        cid: r.cid,
                        name: r.name,
                        slug: r.slug
                    }))
                };
            }

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const apiUrl = `${domain}/wp-json/wp/v2/categories?per_page=100`;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                ...buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password)
            };

            const resp = await fetch(apiUrl, { method: 'GET', headers });
            if (!resp.ok) {
                return { success: false, error: `WordPress phản hồi lỗi HTTP ${resp.status}`, data: [] };
            }
            const data = await resp.json();
            return { success: true, data: Array.isArray(data) ? data : [] };
        } catch (error) {
            console.error('[wp:categories] Lỗi:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    // 2. Tạo chuyên mục WordPress mới trực tiếp từ Local
    ipcMain.handle('wp:create-category', async (event, payload) => {
        try {
            let { domain, name, username, password, apppass, parent, description } = payload || {};
            if (!domain || !name) return { success: false, error: 'Thiếu tên chuyên mục hoặc domain' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);
            if (!authHeader.Authorization) {
                return { success: false, error: 'Không tìm thấy tài khoản/mật khẩu ứng dụng WordPress để tạo chuyên mục.' };
            }

            const bodyData = { name };
            if (parent) bodyData.parent = parent;
            if (description) bodyData.description = description;

            const apiUrl = `${domain}/wp-json/wp/v2/categories`;
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                    ...authHeader
                },
                body: JSON.stringify(bodyData)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return { success: false, error: `WordPress từ chối tạo chuyên mục (HTTP ${resp.status}): ${errText}` };
            }

            const resData = await resp.json();
            return { success: true, data: resData, id: resData.id };
        } catch (error) {
            console.error('[wp:create-category] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    // 3. Lấy danh sách thẻ (Tags) WordPress trực tiếp từ Local
    ipcMain.handle('wp:tags', async (event, payload) => {
        try {
            let { domain, username, password, apppass } = payload || {};
            if (!domain) return { success: false, error: 'Thiếu domain' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const apiUrl = `${domain}/wp-json/wp/v2/tags?per_page=100`;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                ...buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password)
            };

            const resp = await fetch(apiUrl, { method: 'GET', headers });
            if (!resp.ok) {
                return { success: false, error: `WordPress phản hồi lỗi HTTP ${resp.status}`, data: [] };
            }
            const data = await resp.json();
            return { success: true, data: Array.isArray(data) ? data : [] };
        } catch (error) {
            console.error('[wp:tags] Lỗi:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    // 4. Tạo thẻ (Tag) WordPress mới trực tiếp từ Local
    ipcMain.handle('wp:create-tag', async (event, payload) => {
        try {
            let { domain, name, username, password, apppass, description } = payload || {};
            if (!domain || !name) return { success: false, error: 'Thiếu tên thẻ hoặc domain' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);
            if (!authHeader.Authorization) {
                return { success: false, error: 'Không tìm thấy tài khoản/mật khẩu ứng dụng WordPress để tạo thẻ.' };
            }

            const bodyData = { name };
            if (description) bodyData.description = description;

            const apiUrl = `${domain}/wp-json/wp/v2/tags`;
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                    ...authHeader
                },
                body: JSON.stringify(bodyData)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return { success: false, error: `WordPress từ chối tạo thẻ (HTTP ${resp.status}): ${errText}` };
            }

            const resData = await resp.json();
            return { success: true, data: resData, id: resData.id };
        } catch (error) {
            console.error('[wp:create-tag] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    // 5. Upload Media / Ảnh lên WordPress trực tiếp từ Local
    ipcMain.handle('wp:upload-media', async (event, payload) => {
        try {
            let { domain, b64, base64, imagePath, username, password, apppass } = payload || {};
            if (!domain) return { success: false, error: 'Thiếu domain' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);
            if (!authHeader.Authorization) {
                return { success: false, error: 'Không tìm thấy tài khoản/mật khẩu ứng dụng WordPress để tải ảnh lên.' };
            }

            let fileBuffer = null;
            let fileName = 'image_' + Date.now() + '.png';
            let mimeType = 'image/png';

            const rawB64 = b64 || base64;
            if (rawB64) {
                let pureB64 = rawB64;
                if (typeof rawB64 === 'string' && rawB64.startsWith('data:')) {
                    const parts = rawB64.split(',');
                    pureB64 = parts[1] || '';
                    const header = parts[0];
                    const mimeMatch = header.match(/^data:([^;]+)/);
                    if (mimeMatch) mimeType = mimeMatch[1];
                    const nameMatch = header.match(/;name=([^;]+)/);
                    if (nameMatch) {
                        try { fileName = decodeURIComponent(nameMatch[1]); } catch (e) { fileName = nameMatch[1]; }
                    } else {
                        const ext = mimeType.split('/')[1] || 'png';
                        fileName = 'image_' + Date.now() + '.' + (ext === 'jpeg' ? 'jpg' : ext);
                    }
                }
                fileBuffer = Buffer.from(pureB64, 'base64');
            } else if (imagePath) {
                let cleanPath = imagePath;
                if (cleanPath.startsWith('file://')) cleanPath = cleanPath.slice(7);
                cleanPath = decodeURIComponent(cleanPath);
                if (fs.existsSync(cleanPath)) {
                    fileBuffer = fs.readFileSync(cleanPath);
                    fileName = path.basename(cleanPath);
                    const ext = fileName.split('.').pop()?.toLowerCase();
                    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                    else if (ext === 'webp') mimeType = 'image/webp';
                    else if (ext === 'gif') mimeType = 'image/gif';
                }
            }

            if (!fileBuffer || fileBuffer.length === 0) {
                return { success: false, error: 'Dữ liệu hình ảnh trống hoặc không hợp lệ.' };
            }

            const apiUrl = `${domain}/wp-json/wp/v2/media`;
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': mimeType,
                    'Content-Disposition': `attachment; filename="${fileName}"`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                    ...authHeader
                },
                body: fileBuffer
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return { success: false, error: `WordPress từ chối tải ảnh lên (HTTP ${resp.status}): ${errText}` };
            }

            const resData = await resp.json();
            return {
                success: true,
                data: resData,
                id: resData.id,
                source_url: resData.source_url
            };
        } catch (error) {
            console.error('[wp:upload-media] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    // 6. Lấy danh sách bài viết WordPress trực tiếp từ Local
    ipcMain.handle('wp:posts', async (event, payload) => {
        try {
            let { domain, username, password, apppass, page = 1, per_page = 100, keyword, category, status } = payload || {};
            if (!domain) return { success: false, error: 'Thiếu domain' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            let authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);

            const queryParams = new URLSearchParams();
            queryParams.append('page', String(page));
            queryParams.append('per_page', String(per_page));
            queryParams.append('_embed', 'true');

            if (Object.keys(authHeader).length > 0) {
                queryParams.append('context', 'edit');
                if (status) {
                    if (Array.isArray(status)) {
                        status.forEach(s => queryParams.append('status[]', s));
                    } else {
                        queryParams.append('status', status);
                    }
                } else {
                    ['publish', 'draft', 'pending', 'trash'].forEach(s => queryParams.append('status[]', s));
                }
            }

            if (keyword && keyword.trim()) {
                queryParams.append('search', keyword.trim());
            }
            if (category) {
                queryParams.append('categories', String(category));
            }

            const apiUrl = `${domain}/wp-json/wp/v2/posts?${queryParams.toString()}`;
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                ...authHeader
            };

            let resp = await fetch(apiUrl, { method: 'GET', headers });
            if (!resp.ok && Object.keys(authHeader).length > 0) {
                // Nếu xác thực thất bại hoặc quyền status bị cấm (HTTP 400/401/403), tự động fallback sang lấy danh sách public
                const fallbackParams = new URLSearchParams();
                fallbackParams.append('page', String(page));
                fallbackParams.append('per_page', String(per_page));
                fallbackParams.append('_embed', 'true');
                if (keyword && keyword.trim()) fallbackParams.append('search', keyword.trim());
                if (category) fallbackParams.append('categories', String(category));
                const fallbackUrl = `${domain}/wp-json/wp/v2/posts?${fallbackParams.toString()}`;
                resp = await fetch(fallbackUrl, {
                    method: 'GET',
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0' }
                });
            }
            if (!resp.ok) {
                return { success: false, error: `WordPress phản hồi HTTP ${resp.status}`, data: [] };
            }
            const data = await resp.json();
            return { success: true, data: Array.isArray(data) ? data : [] };
        } catch (error) {
            console.error('[wp:posts] Lỗi:', error);
            return { success: false, error: error.message, data: [] };
        }
    });

    // 7. Cập nhật bài viết WordPress trực tiếp từ Local
    ipcMain.handle('wp:update-post', async (event, payload) => {
        try {
            let { domain, id, wp_post_id, post_id, username, password, apppass, status, title, content, excerpt, featured_media } = payload || {};
            const targetId = id || wp_post_id || post_id;
            if (!domain || !targetId) return { success: false, error: 'Thiếu domain hoặc post id' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);
            if (!authHeader.Authorization) {
                return { success: false, error: 'Không tìm thấy tài khoản/mật khẩu ứng dụng WordPress hợp lệ để cập nhật bài viết.' };
            }

            const bodyData = {};
            if (status) bodyData.status = status;
            if (title) bodyData.title = title;
            if (content) bodyData.content = content;
            if (excerpt) bodyData.excerpt = excerpt;
            if (featured_media) bodyData.featured_media = featured_media;

            const apiUrl = `${domain}/wp-json/wp/v2/posts/${targetId}`;
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                    ...authHeader
                },
                body: JSON.stringify(bodyData)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return { success: false, error: `WordPress từ chối cập nhật bài (HTTP ${resp.status}): ${errText}` };
            }

            const resData = await resp.json();
            return { success: true, data: resData, id: targetId };
        } catch (error) {
            console.error('[wp:update-post] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    // 8. Tạo bài viết WordPress trực tiếp từ Local
    ipcMain.handle('wp:create-post', async (event, payload) => {
        try {
            let { domain, username, password, apppass, status = 'publish', title, content, excerpt, featured_media, categories, tags } = payload || {};
            if (!domain || !title) return { success: false, error: 'Thiếu domain hoặc tiêu đề bài viết' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);
            if (!authHeader.Authorization) {
                return { success: false, error: 'Không tìm thấy tài khoản/mật khẩu ứng dụng WordPress để đăng bài.' };
            }

            const bodyData = {
                title: title,
                content: content || '',
                status: status
            };
            if (excerpt) bodyData.excerpt = excerpt;
            if (featured_media) bodyData.featured_media = featured_media;
            if (categories) bodyData.categories = categories;
            if (tags) bodyData.tags = tags;

            const apiUrl = `${domain}/wp-json/wp/v2/posts`;
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                    ...authHeader
                },
                body: JSON.stringify(bodyData)
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return { success: false, error: `WordPress từ chối đăng bài (HTTP ${resp.status}): ${errText}` };
            }

            const resData = await resp.json();
            return { success: true, data: resData, id: resData.id };
        } catch (error) {
            console.error('[wp:create-post] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    // 9. Xóa bài viết WordPress trực tiếp từ Local
    ipcMain.handle('wp:delete-post', async (event, payload) => {
        try {
            let { domain, id, wp_post_id, post_id, username, password, apppass, force = false } = payload || {};
            const targetId = id || wp_post_id || post_id;
            if (!domain || !targetId) return { success: false, error: 'Thiếu domain hoặc post id' };
            if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
                domain = 'https://' + domain;
            }
            if (domain.endsWith('/')) domain = domain.slice(0, -1);

            const effectiveAuth = await getEffectiveWpAuth(domain, username, apppass || password);
            const authHeader = buildWpAuthHeader(effectiveAuth.username, effectiveAuth.password);
            const apiUrl = `${domain}/wp-json/wp/v2/posts/${targetId}?force=${force ? 'true' : 'false'}`;
            const resp = await fetch(apiUrl, {
                method: 'DELETE',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI.Type/1.0',
                    ...authHeader
                }
            });

            if (!resp.ok) {
                const errText = await resp.text();
                return { success: false, error: `WordPress từ chối xóa bài (HTTP ${resp.status}): ${errText}` };
            }

            const resData = await resp.json();
            return { success: true, data: resData, id: targetId };
        } catch (error) {
            console.error('[wp:delete-post] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Lấy danh sách bình luận / ghi chú cục bộ của bài viết theo uuid
     */
    ipcMain.handle('list-local-comments', async (event, payload) => {
        try {
            const { uuid, username = getActiveLocalUsername() } = payload || {};
            if (!uuid) {
                return { success: true, data: [] };
            }

            const db = getArticlesDatabase(username);
            const rows = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT * FROM local_comments WHERE uuid = ? ORDER BY created_at ASC',
                    [uuid],
                    (err, r) => {
                        if (err) reject(err);
                        else resolve(r || []);
                    }
                );
            });

            const comments = rows.map((row) => {
                let commentObj = {};
                try {
                    if (row.comment_json) {
                        commentObj = JSON.parse(row.comment_json);
                    }
                } catch (e) {}

                return {
                    _id: row.id,
                    id: row.id,
                    uuid: row.uuid,
                    blockid: row.blockid,
                    author: row.author,
                    username: row.username,
                    comment: commentObj,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                };
            });

            return { success: true, data: comments };
        } catch (error) {
            console.error('[list-local-comments] Lỗi:', error);
            return { success: false, data: [], error: error.message };
        }
    });

    /**
     * Lưu bình luận / ghi chú cục bộ cho block trong bài viết
     */
    ipcMain.handle('save-local-comment', async (event, payload) => {
        try {
            const { uuid, blockid, author = 'admin', username = 'admin', comment } = payload || {};
            if (!uuid || !blockid) {
                return { success: false, error: 'Thiếu uuid hoặc blockid để lưu bình luận' };
            }

            const commentId = generateNanoId(16);
            const nowIso = (comment && comment.createdAt) ? new Date(comment.createdAt).toISOString() : new Date().toISOString();
            const commentData = {
                content: (comment && comment.content) ? comment.content : '',
                username: (comment && comment.username) ? comment.username : username,
                childrens: (comment && Array.isArray(comment.childrens)) ? comment.childrens : [],
                createdAt: nowIso
            };
            const commentJson = JSON.stringify(commentData);

            const db = getArticlesDatabase(username || commentData.username || getActiveLocalUsername());
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO local_comments (id, uuid, blockid, author, username, comment_json, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [commentId, uuid, blockid, author, username, commentJson, nowIso, nowIso],
                    function (err) {
                        if (err) reject(err);
                        else resolve();
                    }
                );
            });

            const returnedData = {
                _id: commentId,
                id: commentId,
                uuid: uuid,
                blockid: blockid,
                author: author,
                username: username,
                comment: commentData,
                createdAt: nowIso,
                updatedAt: nowIso
            };

            return { success: true, data: returnedData };
        } catch (error) {
            console.error('[save-local-comment] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Kiểm tra đồng tác giả cục bộ (môi trường offline luôn cho phép tác giả hiện tại)
     */
    ipcMain.handle('check-local-together', async (event, payload) => {
        return { success: true, data: { allow: true, local: true } };
    });

    /**
     * Lấy danh mục diễn đàn cục bộ từ SQLite
     */
    ipcMain.handle('list-local-forum-categories', async (event, payload) => {
        try {
            const db = getArticlesDatabase();

            // Cố gắng đồng bộ danh mục mới nhất trực tiếp từ type.vn/api/categories nếu có mạng
            try {
                const onlineResp = await fetch('https://type.vn/api/categories', {
                    headers: { 'User-Agent': 'Mozilla/5.0 AI.Type/1.0' },
                    signal: AbortSignal.timeout(3000)
                });
                if (onlineResp.ok) {
                    const onlineJson = await onlineResp.json();
                    const list = onlineJson?.categories || [];
                    if (Array.isArray(list) && list.length > 0) {
                        const insertStmt = db.prepare(
                            'INSERT OR REPLACE INTO local_forum_categories (cid, name, slug, description, disabled, order_num) VALUES (?, ?, ?, ?, ?, ?)'
                        );
                        for (const item of list) {
                            insertStmt.run(
                                item.cid,
                                item.name,
                                item.slug || '',
                                item.description || '',
                                item.disabled ? 1 : 0,
                                item.order || item.cid || 0
                            );
                        }
                        insertStmt.finalize();
                    }
                }
            } catch (fetchErr) {
                // Môi trường offline hoặc timeout, tiếp tục đọc từ SQLite
            }

            const rows = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT * FROM local_forum_categories WHERE disabled = 0 ORDER BY order_num ASC, cid ASC',
                    [],
                    (err, r) => {
                        if (err) reject(err);
                        else resolve(r || []);
                    }
                );
            });

            const categories = rows.map((r) => ({
                cid: r.cid,
                name: r.name,
                slug: r.slug,
                description: r.description
            }));

            return {
                success: true,
                data: {
                    response: {
                        categories: categories
                    }
                }
            };
        } catch (error) {
            console.error('[list-local-forum-categories] Lỗi:', error);
            return {
                success: true,
                data: {
                    response: {
                        categories: [
                            { cid: 1, name: 'Cafe Buổi Sáng', slug: '1/cafe-buổi-sáng' },
                            { cid: 3, name: 'Giới thiệu Phim', slug: '3/giới-thiệu-phim' },
                            { cid: 28, name: 'Giới thiệu Trò chơi', slug: '28/giới-thiệu-trò-chơi' },
                            { cid: 15, name: 'Chuyện đời', slug: '15/chuyện-đời' },
                            { cid: 27, name: 'Radio Chill Phết', slug: '27/radio-chill-phết' },
                            { cid: 25, name: 'Truyện Hay Phết', slug: '25/truyện-hay-phết' },
                            { cid: 29, name: 'Mô hình AI Thiết kế', slug: '29/mô-hình-ai-thiết-kế' },
                            { cid: 8, name: 'Mô hình AI Âm thanh', slug: '8/mô-hình-ai-âm-thanh' },
                            { cid: 7, name: 'Mô hình AI sáng tạo Hình ảnh', slug: '7/mô-hình-ai-sáng-tạo-hình-ảnh' },
                            { cid: 6, name: 'Mô hình AI sáng tạo Video', slug: '6/mô-hình-ai-sáng-tạo-video' },
                            { cid: 5, name: 'Mô hình AI viết', slug: '5/mô-hình-ai-viết' },
                            { cid: 24, name: 'Học làm Video', slug: '24/học-làm-video' },
                            { cid: 13, name: 'Content SEO', slug: '13/content-seo' },
                            { cid: 10, name: 'Lập trình Python', slug: '10/lập-trình-python' },
                            { cid: 12, name: 'Bí Kíp Viết', slug: '12/bí-kíp-viết' },
                            { cid: 4, name: 'Chợ phần mềm', slug: '4/chợ-phần-mềm' },
                            { cid: 14, name: 'Phần mềm AI.TYPE', slug: '14/phần-mềm-ai-type' }
                        ]
                    }
                }
            };
        }
    });

    /**
     * Tạo bài viết thảo luận diễn đàn cục bộ
     */
    ipcMain.handle('create-local-forum-topic', async (event, payload) => {
        return {
            success: true,
            message: 'Đã tạo chủ đề diễn đàn cục bộ thành công',
            data: {
                tid: Date.now(),
                ...payload
            }
        };
    });

    /**
     * Lấy danh sách bộ sưu tập liên kết (Link Collections) từ SQLite
     */
    ipcMain.handle('list-local-link-collections', async (event, payload) => {
        try {
            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const rows = await new Promise((resolve, reject) => {
                db.all('SELECT * FROM local_link_collections ORDER BY updated_at DESC', [], (err, r) => {
                    if (err) reject(err);
                    else resolve(r || []);
                });
            });

            const collections = rows.map(r => {
                let parsedIds = [];
                try {
                    if (r.ids_json) parsedIds = JSON.parse(r.ids_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    title: r.title,
                    ids: parsedIds,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return { success: true, data: collections, total: collections.length };
        } catch (error) {
            console.error('[list-local-link-collections] Lỗi:', error);
            return { success: false, data: [], error: error.message };
        }
    });

    /**
     * Lấy danh sách links trong một bộ sưu tập liên kết từ SQLite
     */
    ipcMain.handle('get-local-links-in-collection', async (event, payload) => {
        try {
            const { id, username = getActiveLocalUsername() } = payload || {};
            const db = getArticlesDatabase(username);

            let targetIds = [];
            if (id) {
                const colRow = await new Promise((resolve) => {
                    db.get('SELECT ids_json FROM local_link_collections WHERE id = ?', [id], (err, r) => resolve(r));
                });
                if (colRow && colRow.ids_json) {
                    try {
                        targetIds = JSON.parse(colRow.ids_json);
                    } catch (e) {}
                }
            }

            let linksQuery = 'SELECT * FROM local_links';
            let params = [];
            if (targetIds.length > 0) {
                const placeholders = targetIds.map(() => '?').join(',');
                linksQuery += ` WHERE id IN (${placeholders})`;
                params = targetIds;
            }

            const rows = await new Promise((resolve, reject) => {
                db.all(linksQuery, params, (err, r) => {
                    if (err) reject(err);
                    else resolve(r || []);
                });
            });

            const links = rows.map(r => {
                let parsedOptions = {};
                try {
                    if (r.options_json) parsedOptions = JSON.parse(r.options_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    link: r.link,
                    title: r.title,
                    options: parsedOptions,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return { success: true, data: links, total: links.length };
        } catch (error) {
            console.error('[get-local-links-in-collection] Lỗi:', error);
            return { success: false, data: [], error: error.message };
        }
    });

    /**
     * Lấy toàn bộ links cục bộ từ local_links
     */
    ipcMain.handle('list-local-links', async (event, payload) => {
        try {
            const username = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(username);
            const keyword = (payload && payload.keyword) ? String(payload.keyword).trim().toLowerCase() : '';
            const page = payload && payload.page ? payload.page : null;

            let query = 'SELECT * FROM local_links WHERE (username = ? OR username = "admin")';
            let params = [username];

            if (keyword) {
                query += ' AND (LOWER(link) LIKE ? OR LOWER(title) LIKE ?)';
                params.push(`%${keyword}%`, `%${keyword}%`);
            }

            // Đếm tổng số link
            let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
            const totalCount = await new Promise((resolve) => {
                db.get(countQuery, params, (err, row) => {
                    resolve((row && row.count) || 0);
                });
            });

            query += ' ORDER BY created_at DESC';

            if (page && page.size) {
                const pageSize = Number(page.size);
                const pageNumber = page.pageNumber ? Number(page.pageNumber) : 0;
                query += ` LIMIT ${pageSize} OFFSET ${pageNumber * pageSize}`;
            }

            const rows = await new Promise((resolve, reject) => {
                db.all(query, params, (err, r) => {
                    if (err) reject(err);
                    else resolve(r || []);
                });
            });

            const links = rows.map(r => {
                let parsedOptions = {};
                try {
                    if (r.options_json) parsedOptions = JSON.parse(r.options_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    link: r.link,
                    title: r.title,
                    options: parsedOptions,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return {
                success: true,
                data: {
                    docs: links,
                    total: totalCount,
                    bookmark: 'local-done'
                },
                total: totalCount
            };
        } catch (error) {
            console.error('[list-local-links] Lỗi:', error);
            return {
                success: false,
                data: { docs: [], total: 0, bookmark: '' },
                total: 0,
                error: error.message
            };
        }
    });

    /**
     * Thêm mới link cục bộ vào local_links
     */
    ipcMain.handle('add-local-link', async (event, payload) => {
        try {
            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const link = (payload && payload.link) ? payload.link.trim() : '';
            const title = (payload && payload.title) || link;
            const optionsJson = JSON.stringify((payload && payload.options) || {});
            const username = (payload && payload.username) || 'admin';
            const now = new Date().toISOString();
            const id = crypto.randomUUID();

            if (!link) {
                return { success: false, message: 'Link không hợp lệ' };
            }

            // Kiểm tra link trùng
            const existing = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM local_links WHERE link = ?', [link], (err, r) => {
                    if (err) reject(err);
                    else resolve(r);
                });
            });

            if (existing) {
                return { success: false, message: 'Link này đã tồn tại.' };
            }

            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO local_links (id, link, title, options_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [id, link, title, optionsJson, username, now, now],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this);
                    }
                );
            });

            return {
                success: true,
                data: {
                    _id: id,
                    id: id,
                    link: link,
                    title: title,
                    options: (payload && payload.options) || {},
                    createdAt: now,
                    updatedAt: now
                }
            };
        } catch (error) {
            console.error('[add-local-link] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });

    /**
     * Cập nhật link cục bộ trong local_links
     */
    ipcMain.handle('update-local-link', async (event, payload) => {
        try {
            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const id = (payload && (payload._id || payload.id)) ? String(payload._id || payload.id).trim() : '';
            const link = (payload && payload.link) ? payload.link.trim() : '';
            const title = (payload && payload.title) || link;
            const optionsJson = JSON.stringify((payload && payload.options) || {});
            const now = new Date().toISOString();

            if (!id) {
                return { success: false, message: 'ID link không hợp lệ' };
            }

            const res = await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE local_links SET link = ?, title = ?, options_json = ?, updated_at = ? WHERE id = ?',
                    [link, title, optionsJson, now, id],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this);
                    }
                );
            });

            return {
                success: true,
                data: {
                    modifiedCount: res.changes || 1
                }
            };
        } catch (error) {
            console.error('[update-local-link] Lỗi:', error);
            return { success: false, error: error.message };
        }
    });


    /**
     * Lấy danh sách bài viết Facebook (FacePosts/Trend) từ SQLite local
     */
    ipcMain.handle('list-local-facebook-posts', async (event, payload) => {
        try {
            const { keyword = '', page, facegroup } = payload || {};
            const pageSize = (page && page.size) ? Number(page.size) : 25;
            const pageOffset = (page && page.pageNumber) ? Number(page.pageNumber) * pageSize : 0;

            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            let whereClauses = [];
            let params = [];

            if (keyword && String(keyword).trim()) {
                whereClauses.push('text LIKE ?');
                params.push(`%${String(keyword).trim()}%`);
            }

            if (facegroup) {
                whereClauses.push('facegroup = ?');
                params.push(facegroup);
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

            // Đếm tổng số
            const countRow = await new Promise((resolve) => {
                db.get(`SELECT COUNT(*) as count FROM local_facebook_posts ${whereSql}`, params, (err, r) => resolve(r));
            });
            const totalElements = countRow ? countRow.count : 0;

            // Lấy trang dữ liệu
            const rows = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM local_facebook_posts ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                    [...params, pageSize, pageOffset],
                    (err, r) => {
                        if (err) reject(err);
                        else resolve(r || []);
                    }
                );
            });

            const docs = rows.map(r => {
                let parsedImages = [];
                let parsedHref = [];
                try {
                    if (r.images_json) parsedImages = JSON.parse(r.images_json);
                } catch (e) {}
                try {
                    if (r.href_json) parsedHref = JSON.parse(r.href_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    uuid: r.uuid,
                    used: r.used,
                    facegroup: r.facegroup,
                    text: r.text,
                    images: parsedImages,
                    href: parsedHref,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return {
                success: true,
                data: {
                    docs: docs,
                    total_rows: totalElements,
                    bookmark: `bkm_${pageOffset + docs.length}`
                }
            };
        } catch (error) {
            console.error('[list-local-facebook-posts] Lỗi:', error);
            return {
                success: false,
                data: {
                    docs: [],
                    total_rows: 0
                },
                error: error.message
            };
        }
    });

    // ── Lấy danh sách GoLogin tokens cục bộ ──
    ipcMain.handle('list-local-gologin-tokens', async (event, payload) => {
        try {
            const username = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(username);

            const rows = await new Promise((resolve, reject) => {
                db.all(
                    'SELECT * FROM local_gologin_tokens WHERE username = ? OR username = "admin" ORDER BY created_at DESC',
                    [username],
                    (err, r) => {
                        if (err) reject(err);
                        else resolve(r || []);
                    }
                );
            });

            const tokens = rows.map(r => {
                let profiles = [];
                try {
                    if (r.profiles_json) profiles = JSON.parse(r.profiles_json);
                } catch (e) {}

                return {
                    _id: r.id,
                    id: r.id,
                    token: r.token,
                    profiles: profiles,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at
                };
            });

            return {
                success: true,
                data: tokens
            };
        } catch (error) {
            console.error('[list-local-gologin-tokens] Lỗi:', error);
            return {
                success: false,
                data: [],
                error: error.message
            };
        }
    });

    // ── Thêm mới GoLogin token cục bộ ──
    ipcMain.handle('add-local-gologin-token', async (event, payload) => {
        try {
            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const token = (payload && payload.token) ? payload.token.trim() : '';
            const username = (payload && payload.username) || 'admin';

            if (!token) {
                return { success: false, message: 'Token không hợp lệ' };
            }

            // Kiểm tra token đã tồn tại chưa
            const existing = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_gologin_tokens WHERE token = ?', [token], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existing) {
                return {
                    success: false,
                    message: 'Mã token này đã tồn tại.'
                };
            }

            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const profilesJson = JSON.stringify([]);

            await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO local_gologin_tokens (id, token, profiles_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, token, profilesJson, username, now, now],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this);
                    }
                );
            });

            return {
                success: true,
                data: {
                    _id: id,
                    id: id,
                    token: token,
                    profiles: [],
                    createdAt: now,
                    updatedAt: now
                }
            };
        } catch (error) {
            console.error('[add-local-gologin-token] Lỗi:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    // ── Cập nhật profiles cho GoLogin token cục bộ ──
    ipcMain.handle('update-local-gologin-token', async (event, payload) => {
        try {
            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const token = (payload && payload.token) ? payload.token.trim() : '';
            const profiles = (payload && payload.profiles) ? payload.profiles : [];
            const username = (payload && payload.username) || 'admin';
            const now = new Date().toISOString();

            if (!token) {
                return { success: false, message: 'Token không hợp lệ' };
            }

            const profilesJson = JSON.stringify(profiles);

            // Kiểm tra token có tồn tại không
            const existing = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM local_gologin_tokens WHERE token = ?', [token], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (existing) {
                await new Promise((resolve, reject) => {
                    db.run(
                        'UPDATE local_gologin_tokens SET profiles_json = ?, updated_at = ? WHERE token = ?',
                        [profilesJson, now, token],
                        function(err) {
                            if (err) reject(err);
                            else resolve(this);
                        }
                    );
                });
            } else {
                const id = crypto.randomUUID();
                await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO local_gologin_tokens (id, token, profiles_json, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
                        [id, token, profilesJson, username, now, now],
                        function(err) {
                            if (err) reject(err);
                            else resolve(this);
                        }
                    );
                });
            }

            return {
                success: true,
                data: {
                    token: token,
                    profiles: profiles
                }
            };
        } catch (error) {
            console.error('[update-local-gologin-token] Lỗi:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    // ── Xóa profile thuộc GoLogin token cục bộ ──
    ipcMain.handle('delete-local-gologin-profile', async (event, payload) => {
        try {
            const targetUser = (payload && payload.username) || getActiveLocalUsername();
            const db = getArticlesDatabase(targetUser);
            const token = (payload && payload.token) ? payload.token.trim() : '';
            const profileId = (payload && (payload.profileId || payload.id)) ? String(payload.profileId || payload.id).trim() : '';
            const now = new Date().toISOString();

            if (!profileId) {
                return { success: false, message: 'profileId không hợp lệ' };
            }

            let rows = [];
            if (token) {
                rows = await new Promise((resolve, reject) => {
                    db.all('SELECT * FROM local_gologin_tokens WHERE token = ?', [token], (err, r) => {
                        if (err) reject(err);
                        else resolve(r || []);
                    });
                });
            } else {
                rows = await new Promise((resolve, reject) => {
                    db.all('SELECT * FROM local_gologin_tokens', (err, r) => {
                        if (err) reject(err);
                        else resolve(r || []);
                    });
                });
            }

            let deleted = false;
            for (const row of rows) {
                let profiles = [];
                try {
                    if (row.profiles_json) profiles = JSON.parse(row.profiles_json);
                } catch (e) {}

                const initialLen = profiles.length;
                profiles = profiles.filter(p => p.id !== profileId && p._id !== profileId);
                if (profiles.length !== initialLen) {
                    deleted = true;
                    await new Promise((resolve, reject) => {
                        db.run(
                            'UPDATE local_gologin_tokens SET profiles_json = ?, updated_at = ? WHERE id = ?',
                            [JSON.stringify(profiles), now, row.id],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this);
                            }
                        );
                    });
                }
            }

            return {
                success: true,
                deleted: deleted
            };
        } catch (error) {
            console.error('[delete-local-gologin-profile] Lỗi:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    // Handler đồng bộ toàn bộ file backup JSON vào database articles.sqlite cục bộ
    ipcMain.handle('sync-backup-to-local-sqlite', async (event, args) => {
        try {
            const { username = getActiveLocalUsername(), year = 2023 } = args || {};
            const db = getArticlesDatabase(username);
            const backupDir = path.join(getArticlesDbDir(), 'backup');
            if (!fs.existsSync(backupDir)) {
                return { success: false, message: `Thư mục backup không tồn tại: ${backupDir}` };
            }

            const results = {};

            // 1. Đồng bộ local_articles từ admin_archives_2023.json
            const archivesFile = path.join(backupDir, `${username}_archives_${year}.json`);
            if (fs.existsSync(archivesFile)) {
                try {
                    const archives = JSON.parse(fs.readFileSync(archivesFile, 'utf8'));
                    if (Array.isArray(archives) && archives.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_articles (
                                        uuid, title, url, content, markdown, domain, username,
                                        thumbnail, description, source_json, done_json, trash_json,
                                        seo_json, arr_keyword_json, tags_json, style_json,
                                        format, is_local, is_encrypted, encrypted_payload,
                                        created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const doc of archives) {
                                    const uuid = doc.uuid || doc._id;
                                    if (!uuid) continue;
                                    stmt.run(
                                        uuid,
                                        doc.title || doc.name || '',
                                        doc.url || '',
                                        doc.content || '',
                                        doc.markdown || '',
                                        doc.domain || '',
                                        doc.username || username,
                                        doc.thumbnail || '',
                                        doc.description || '',
                                        JSON.stringify(doc.source || {}),
                                        JSON.stringify(doc.done || {}),
                                        JSON.stringify(doc.trash || {}),
                                        JSON.stringify(doc.seo || {}),
                                        JSON.stringify(doc.arr_keyword || []),
                                        JSON.stringify(doc.tags || []),
                                        JSON.stringify(doc.style || {}),
                                        doc.format || 'md',
                                        1,
                                        0,
                                        '',
                                        doc.createdAt || doc.created_at || new Date().toISOString(),
                                        doc.updatedAt || doc.updated_at || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.articles = archives.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp archives:', e);
                }
            }

            // 2. Đồng bộ local_wp_posts từ admin_wp2md_2023.json
            const wpFile = path.join(backupDir, `${username}_wp2md_${year}.json`);
            if (fs.existsSync(wpFile)) {
                try {
                    const wpPosts = JSON.parse(fs.readFileSync(wpFile, 'utf8'));
                    if (Array.isArray(wpPosts) && wpPosts.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_wp_posts (
                                        id, title, hostname, content, excerpt, pub_date, raw_json, created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const p of wpPosts) {
                                    const id = p.id || p._id;
                                    if (!id) continue;
                                    stmt.run(
                                        String(id),
                                        p.title || '',
                                        p.hostname || p.domain || '',
                                        p.content || '',
                                        p.excerpt || '',
                                        p.pub_date || p.date || '',
                                        JSON.stringify(p),
                                        p.created_at || p.createdAt || new Date().toISOString(),
                                        p.updated_at || p.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.wp_posts = wpPosts.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp wp2md:', e);
                }
            }

            // 3. Đồng bộ local_domains từ admin_domain_2023.json
            const domainFile = path.join(backupDir, `${username}_domain_${year}.json`);
            if (fs.existsSync(domainFile)) {
                try {
                    const domains = JSON.parse(fs.readFileSync(domainFile, 'utf8'));
                    if (Array.isArray(domains) && domains.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_domains (
                                        domain, name, username, password, note, monthly_target, writing_style,
                                        ga4_property_id, server_ip, server_username, server_password, created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const d of domains) {
                                    if (!d.domain) continue;
                                    stmt.run(
                                        d.domain,
                                        d.name || d.domain,
                                        d.username || username,
                                        encryptDomainPassword(d.password),
                                        d.note || '',
                                        d.monthlyTarget || 0,
                                        d.writingStyle || '',
                                        d.ga4PropertyId || '',
                                        d.serverIp || '',
                                        d.serverUsername || '',
                                        encryptDomainPassword(d.serverPassword),
                                        d.createdAt || new Date().toISOString(),
                                        d.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.domains = domains.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp domains:', e);
                }
            }

            // 4. Đồng bộ local_tasks từ admin_tasks_2023.json
            const tasksFile = path.join(backupDir, `${username}_tasks_${year}.json`);
            if (fs.existsSync(tasksFile)) {
                try {
                    const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
                    if (Array.isArray(tasks) && tasks.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_tasks (
                                        id, username, domain_id, year, month, day, title, status, done, task_json, created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const t of tasks) {
                                    const id = t.id || t._id;
                                    if (!id) continue;
                                    stmt.run(
                                        id,
                                        t.username || username,
                                        t.domain_id || t.domain || '',
                                        parseInt(t.year) || year,
                                        parseInt(t.month) || 1,
                                        parseInt(t.day) || 1,
                                        t.title || '',
                                        t.status || 'pending',
                                        t.done ? 1 : 0,
                                        JSON.stringify(t),
                                        t.createdAt || t.created_at || new Date().toISOString(),
                                        t.updatedAt || t.updated_at || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.tasks = tasks.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp tasks:', e);
                }
            }

            // 5. Đồng bộ local_nodes từ admin_nodes_2023.json
            const nodesFile = path.join(backupDir, `${username}_nodes_${year}.json`);
            if (fs.existsSync(nodesFile)) {
                try {
                    const nodes = JSON.parse(fs.readFileSync(nodesFile, 'utf8'));
                    if (Array.isArray(nodes) && nodes.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_nodes (
                                        id, title, url, username, uuids_json, raw_json, created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const n of nodes) {
                                    const id = n._id || n.id;
                                    if (!id) continue;
                                    let title = n.title;
                                    if (!title && Array.isArray(n.meta)) {
                                        for (const m of n.meta) {
                                            if (m && typeof m === 'object' && ((m.name && m.name.toLowerCase().includes('title')) || (m.property && m.property.toLowerCase().includes('title')))) {
                                                title = m.content;
                                                break;
                                            }
                                        }
                                    }
                                    if (!title && n.heading && Array.isArray(n.heading.h1)) {
                                        const h1s = n.heading.h1.filter(x => x && x.trim());
                                        if (h1s.length > 0) title = h1s[0];
                                    }
                                    if (!title) title = n.url || 'Node';

                                    stmt.run(
                                        id,
                                        title,
                                        n.url || '',
                                        username,
                                        JSON.stringify(n.uuids || []),
                                        JSON.stringify(n),
                                        n.createdAt || n.updatedAt || new Date().toISOString(),
                                        n.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.nodes = nodes.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp nodes:', e);
                }
            }

            // 6. Đồng bộ local_facebook_posts từ admin_facebook_posts_2023.json
            const fbFile = path.join(backupDir, `${username}_facebook_posts_${year}.json`);
            if (fs.existsSync(fbFile)) {
                try {
                    const fbPosts = JSON.parse(fs.readFileSync(fbFile, 'utf8'));
                    if (Array.isArray(fbPosts) && fbPosts.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_facebook_posts (
                                        id, uuid, used, facegroup, text, images_json, href_json, username, created_at, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const f of fbPosts) {
                                    const id = f._id || f.id;
                                    if (!id) continue;
                                    stmt.run(
                                        id,
                                        f.uuid || 0,
                                        f.used ? 1 : 0,
                                        f.facegroup || '',
                                        f.text || '',
                                        JSON.stringify(f.images || []),
                                        JSON.stringify(f.href || []),
                                        username,
                                        f.createdAt || new Date().toISOString(),
                                        f.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.facebook_posts = fbPosts.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp facebook posts:', e);
                }
            }

            // 7. Đồng bộ local_link_collections & local_links
            const linkCollectionsFile = path.join(backupDir, `${username}_link_collections_${year}.json`);
            if (fs.existsSync(linkCollectionsFile)) {
                try {
                    const collections = JSON.parse(fs.readFileSync(linkCollectionsFile, 'utf8'));
                    if (Array.isArray(collections) && collections.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_link_collections (id, title, ids_json, username, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                `);
                                for (const c of collections) {
                                    const id = c._id || c.id;
                                    if (!id) continue;
                                    stmt.run(
                                        id,
                                        c.title || 'Bộ sưu tập',
                                        JSON.stringify(c.ids || []),
                                        username,
                                        c.createdAt || new Date().toISOString(),
                                        c.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.link_collections = collections.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp link collections:', e);
                }
            }

            const linksFile = path.join(backupDir, `${username}_links_${year}.json`);
            if (fs.existsSync(linksFile)) {
                try {
                    const links = JSON.parse(fs.readFileSync(linksFile, 'utf8'));
                    if (Array.isArray(links) && links.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_links (id, link, title, options_json, username, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const l of links) {
                                    const id = l._id || l.id;
                                    if (!id) continue;
                                    stmt.run(
                                        id,
                                        l.link || '',
                                        l.title || l.link || '',
                                        JSON.stringify(l.options || {}),
                                        username,
                                        l.createdAt || new Date().toISOString(),
                                        l.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.links = links.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp links:', e);
                }
            }

            // 8. Đồng bộ local_gologin_tokens
            const gologinFile = path.join(backupDir, `${username}_gologin_${year}.json`);
            if (fs.existsSync(gologinFile)) {
                try {
                    const tokens = JSON.parse(fs.readFileSync(gologinFile, 'utf8'));
                    if (Array.isArray(tokens) && tokens.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_gologin_tokens (id, token, profiles_json, username, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                `);
                                for (const tk of tokens) {
                                    const id = tk._id || tk.id;
                                    if (!id) continue;
                                    stmt.run(
                                        id,
                                        tk.token || '',
                                        JSON.stringify(tk.profiles || []),
                                        username,
                                        tk.createdAt || new Date().toISOString(),
                                        tk.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.gologin = tokens.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp gologin:', e);
                }
            }

            // 9. Đồng bộ local_collections từ admin_collections_2023.json
            const colFile = path.join(backupDir, `${username}_collections_${year}.json`);
            if (fs.existsSync(colFile)) {
                try {
                    const rawCols = JSON.parse(fs.readFileSync(colFile, 'utf8'));
                    if (Array.isArray(rawCols) && rawCols.length > 0) {
                        const collections = rawCols.filter(x => x && x.type === 'collection');
                        const rels = rawCols.filter(x => x && x.type === 'collection_uuid');
                        const uuidsByCol = {};
                        for (const r of rels) {
                            if (r.collection_id && r.uuid) {
                                if (!uuidsByCol[r.collection_id]) uuidsByCol[r.collection_id] = [];
                                if (!uuidsByCol[r.collection_id].includes(r.uuid)) {
                                    uuidsByCol[r.collection_id].push(r.uuid);
                                }
                            }
                        }

                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                db.run('DELETE FROM local_collections WHERE id LIKE "rel:%"');
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_collections (id, title, url, picture, excerpt, username, uuids_json, count, has_script, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const c of collections) {
                                    const id = c._id || c.id;
                                    if (!id) continue;
                                    const colUuids = uuidsByCol[id] || (Array.isArray(c.uuids) ? c.uuids : (Array.isArray(c.uuid) ? c.uuid : []));
                                    stmt.run(
                                        id,
                                        c.title || '',
                                        c.url || '',
                                        c.picture || '',
                                        c.excerpt || '',
                                        username,
                                        JSON.stringify(colUuids),
                                        colUuids.length,
                                        c.has_script ? 1 : 0,
                                        c.createdAt || new Date().toISOString(),
                                        c.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.collections = collections.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp collections:', e);
                }
            }

            // 10. Đồng bộ local_chats từ admin_chatgpt_2023.json
            const chatsFile = path.join(backupDir, `${username}_chatgpt_${year}.json`);
            if (fs.existsSync(chatsFile)) {
                try {
                    const chats = JSON.parse(fs.readFileSync(chatsFile, 'utf8'));
                    if (Array.isArray(chats) && chats.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_chats (id, conversation_id, username, question, content, answer, messages_json, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const c of chats) {
                                    const id = c._id || c.id;
                                    if (!id) continue;
                                    stmt.run(
                                        id,
                                        c.conversation_id || c.cid || '',
                                        username,
                                        c.question || '',
                                        c.content || '',
                                        c.answer || '',
                                        JSON.stringify(c.messages || []),
                                        c.createdAt || new Date().toISOString(),
                                        c.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.chats = chats.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp chats:', e);
                }
            }

            // 11. Đồng bộ local_scripts từ admin_scripts_2023.json
            const scriptsFile = path.join(backupDir, `${username}_scripts_${year}.json`);
            if (fs.existsSync(scriptsFile)) {
                try {
                    const scripts = JSON.parse(fs.readFileSync(scriptsFile, 'utf8'));
                    if (Array.isArray(scripts) && scripts.length > 0) {
                        await new Promise((resolve, reject) => {
                            db.serialize(() => {
                                const stmt = db.prepare(`
                                    INSERT OR REPLACE INTO local_scripts (uuid, username, title, outline, script, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?)
                                `);
                                for (const s of scripts) {
                                    const uuid = s.uuid || s._id || s.id;
                                    if (!uuid) continue;
                                    stmt.run(
                                        uuid,
                                        username,
                                        s.title || s.name || '',
                                        s.outline || '',
                                        s.script || '',
                                        s.createdAt || new Date().toISOString(),
                                        s.updatedAt || new Date().toISOString()
                                    );
                                }
                                stmt.finalize((err) => (err ? reject(err) : resolve()));
                            });
                        });
                        results.scripts = scripts.length;
                    }
                } catch (e) {
                    console.error('[sync-backup-to-local-sqlite] Lỗi nạp scripts:', e);
                }
            }

            console.log('[sync-backup-to-local-sqlite] Hoàn tất nạp vào SQLite:', results);
            return {
                success: true,
                results: results
            };
        } catch (error) {
            console.error('[sync-backup-to-local-sqlite] Lỗi:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    // ===== QUẢN LÝ KỊCH BẢN LOCAL (LOCAL SCRIPTS) =====
    ipcMain.handle('save-local-script', async (event, payload) => {
        try {
            const { uuid, username = getActiveLocalUsername(), title, outline, script } = payload || {};
            if (!uuid) return { success: false, error: 'Thiếu uuid của kịch bản' };

            const db = getArticlesDatabase(username);
            const now = new Date().toISOString();

            return await new Promise((resolve) => {
                db.get('SELECT created_at FROM local_scripts WHERE uuid = ?', [uuid], (err, row) => {
                    const createdAt = (row && row.created_at) ? row.created_at : now;
                    db.run(
                        `INSERT OR REPLACE INTO local_scripts (uuid, username, title, outline, script, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [uuid, username, title || '', outline || '', script || '', createdAt, now],
                        function (err2) {
                            if (err2) {
                                console.error('[save-local-script] Lỗi lưu kịch bản vào SQLite:', err2);
                                return resolve({ success: false, error: err2.message });
                            }
                            resolve({ success: true, uuid });
                        }
                    );
                });
            });
        } catch (e) {
            console.error('[save-local-script] Exception:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('get-local-script', async (event, payload) => {
        try {
            const { uuid, username = getActiveLocalUsername() } = payload || {};
            if (!uuid) return { success: false, error: 'Thiếu uuid' };

            const db = getArticlesDatabase(username);
            return await new Promise((resolve) => {
                db.get('SELECT * FROM local_scripts WHERE uuid = ?', [uuid], (err, row) => {
                    if (err) {
                        console.error('[get-local-script] Lỗi đọc SQLite:', err);
                        return resolve({ success: false, error: err.message });
                    }
                    if (!row) {
                        return resolve({ success: false, notFound: true, message: 'Chưa có kịch bản cho bài viết này trong SQLite' });
                    }
                    resolve({
                        success: true,
                        data: {
                            uuid: row.uuid,
                            username: row.username,
                            title: row.title,
                            outline: row.outline,
                            script: row.script,
                            createdAt: row.created_at,
                            updatedAt: row.updated_at
                        }
                    });
                });
            });
        } catch (e) {
            console.error('[get-local-script] Exception:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('list-local-scripts', async (event, payload) => {
        try {
            const { username = getActiveLocalUsername() } = payload || {};
            const db = getArticlesDatabase(username);
            return await new Promise((resolve) => {
                db.all(
                    'SELECT uuid, username, title, outline, created_at, updated_at FROM local_scripts WHERE username = ? ORDER BY updated_at DESC',
                    [username],
                    (err, rows) => {
                        if (err) {
                            return resolve({ success: false, error: err.message, data: [] });
                        }
                        const formatted = (rows || []).map((r) => ({
                            uuid: r.uuid,
                            username: r.username,
                            title: r.title,
                            outline: r.outline,
                            createdAt: r.created_at,
                            updatedAt: r.updated_at
                        }));
                        resolve({ success: true, data: formatted });
                    }
                );
            });
        } catch (e) {
            return { success: false, error: e.message, data: [] };
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
