const path = require('path');
const fs = require('fs');

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    try {
        Database = require('../node_modules/better-sqlite3');
    } catch (e2) {
        console.warn('[SQLite] Native better-sqlite3 module not loaded. Safe fallback mode enabled.');
    }
}

let db;
let tiktokDb;

function initDatabase(app, ipcMain) {
    const userDataPath = app.getPath('userData');

    if (Database) {
        try {
            const dbPath = path.join(userDataPath, 'local_sync.sqlite');
            db = new Database(dbPath);
            db.pragma('journal_mode = WAL');
            console.log('[SQLite] Kết nối thành công tại:', dbPath);

            db.exec(`
                CREATE TABLE IF NOT EXISTS sync_queue (
                    id TEXT PRIMARY KEY,
                    collection_name TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    sync_status TEXT DEFAULT 'pending_insert',
                    created_at INTEGER,
                    updated_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS local_user_profiles (
                    username TEXT PRIMARY KEY,
                    raw_data TEXT NOT NULL,
                    updated_at INTEGER
                );
                CREATE TABLE IF NOT EXISTS api_caches (
                    path TEXT PRIMARY KEY,
                    raw_data TEXT NOT NULL,
                    updated_at INTEGER
                );
            `);
        } catch (err) {
            console.error('[SQLite Fatal Error]:', err);
        }

        try {
            let documentsPath;
            try {
                documentsPath = app.getPath('documents');
            } catch (e) {
                documentsPath = path.join(require('os').homedir(), 'Documents');
            }

            const tiktokDataDir = path.join(documentsPath, 'ai.type', 'data', 'tiktok');
            if (!fs.existsSync(tiktokDataDir)) {
                fs.mkdirSync(tiktokDataDir, { recursive: true });
            }

            const tiktokDbPath = path.join(tiktokDataDir, 'tiktok.sqlite');
            tiktokDb = new Database(tiktokDbPath);
            tiktokDb.pragma('journal_mode = WAL');
            console.log('[SQLite tiktok.sqlite] Kết nối thành công tại:', tiktokDbPath);

            tiktokDb.exec(`
                CREATE TABLE IF NOT EXISTS livestream_analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id TEXT NOT NULL,
                    date_str TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    nickname TEXT,
                    title TEXT,
                    hls_url TEXT,
                    analysis_text TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_room_date ON livestream_analyses(room_id, date_str);
            `);
        } catch (err) {
            console.error('[SQLite Fatal Error tiktok.sqlite]:', err);
        }
    } else {
        console.log('[SQLite Fallback] Electron database running with safe JSON storage fallback.');
    }

    // --- IPC HANDLERS ---
    ipcMain.handle('db-all', (event, { query, params = [] }) => {
        try {
            if (!db) return { success: false, data: [] };
            const stmt = db.prepare(query);
            return { success: true, data: stmt.all(params) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('db-get', (event, { query, params = [] }) => {
        try {
            if (!db) return { success: false, data: null };
            const stmt = db.prepare(query);
            return { success: true, data: stmt.get(params) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('db-run', (event, { query, params = [] }) => {
        try {
            if (!db) return { success: false, error: 'Database not initialized' };
            const stmt = db.prepare(query);
            const info = stmt.run(params);
            return { success: true, info };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('db-tiktok-save', (event, { room_id, date_str, nickname, title, hls_url, analysis_text }) => {
        const dStr = date_str || new Date().toISOString().split('T')[0];
        const now = Date.now();

        if (tiktokDb) {
            try {
                const stmt = tiktokDb.prepare(`
                    INSERT INTO livestream_analyses (room_id, date_str, timestamp, nickname, title, hls_url, analysis_text)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                const info = stmt.run(
                    String(room_id || ''),
                    dStr,
                    now,
                    nickname || '',
                    title || '',
                    hls_url || '',
                    analysis_text || ''
                );
                return { success: true, id: info.lastInsertRowid };
            } catch (err) {
                console.error('[SQLite Error db-tiktok-save]:', err.message);
                return { success: false, error: err.message };
            }
        }

        // File-system JSON Fallback
        try {
            const documentsPath = app.getPath('documents');
            const saveDir = path.join(documentsPath, 'ai.type', 'data', 'tiktok', dStr);
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }
            const recordFile = path.join(saveDir, `${room_id || 'room'}.json`);
            const existing = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, 'utf-8')) : [];
            const newRecord = {
                id: now,
                room_id: String(room_id || ''),
                date_str: dStr,
                timestamp: now,
                nickname: nickname || '',
                title: title || '',
                hls_url: hls_url || '',
                analysis_text: analysis_text || '',
                created_at: new Date().toISOString()
            };
            existing.unshift(newRecord);
            fs.writeFileSync(recordFile, JSON.stringify(existing, null, 2), 'utf-8');
            return { success: true, id: now };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('db-tiktok-clear', (event, { room_id }) => {
        if (tiktokDb) {
            try {
                if (room_id) {
                    const stmt = tiktokDb.prepare('DELETE FROM livestream_analyses WHERE room_id = ? OR nickname = ?');
                    const info = stmt.run(String(room_id), String(room_id));
                    return { success: true, changes: info.changes };
                } else {
                    const stmt = tiktokDb.prepare('DELETE FROM livestream_analyses');
                    const info = stmt.run();
                    return { success: true, changes: info.changes };
                }
            } catch (err) {
                return { success: false, error: err.message };
            }
        }
        // Fallback clear from Documents/ai.type/data/tiktok
        try {
            let documentsPath;
            try {
                documentsPath = app.getPath('documents');
            } catch (e) {
                documentsPath = path.join(require('os').homedir(), 'Documents');
            }
            const baseDir = path.join(documentsPath, 'ai.type', 'data', 'tiktok');
            if (fs.existsSync(baseDir)) {
                fs.rmSync(baseDir, { recursive: true, force: true });
                fs.mkdirSync(baseDir, { recursive: true });
            }
        } catch (e) {}
        return { success: true };
    });

    ipcMain.handle('db-tiktok-list', (event, { room_id, nickname, date_str }) => {
        if (tiktokDb) {
            try {
                let query = 'SELECT * FROM livestream_analyses';
                const params = [];
                const conditions = [];

                if (room_id) {
                    conditions.push('(room_id = ? OR nickname = ?)');
                    params.push(String(room_id), String(room_id));
                } else if (nickname) {
                    conditions.push('(room_id = ? OR nickname = ?)');
                    params.push(String(nickname), String(nickname));
                }

                if (date_str) {
                    conditions.push('date_str = ?');
                    params.push(date_str);
                }

                if (conditions.length > 0) {
                    query += ' WHERE ' + conditions.join(' AND ');
                }
                query += ' ORDER BY timestamp DESC LIMIT 100';

                const stmt = tiktokDb.prepare(query);
                const rows = stmt.all(...params);
                return { success: true, data: rows };
            } catch (err) {
                console.error('[SQLite db-tiktok-list Error]:', err.message);
            }
        }

        // Fallback reading from Documents/ai.type/data/tiktok directory
        try {
            let documentsPath;
            try {
                documentsPath = app.getPath('documents');
            } catch (e) {
                documentsPath = path.join(require('os').homedir(), 'Documents');
            }
            const baseDir = path.join(documentsPath, 'ai.type', 'data', 'tiktok');
            let results = [];

            if (fs.existsSync(baseDir)) {
                const subItems = fs.readdirSync(baseDir);
                const searchDirs = date_str
                    ? [path.join(baseDir, date_str)]
                    : subItems.map(d => path.join(baseDir, d));

                for (const dir of searchDirs) {
                    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                        const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
                        for (const f of files) {
                            try {
                                const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
                                if (Array.isArray(content)) {
                                    results = results.concat(content);
                                }
                            } catch (e) {}
                        }
                    }
                }
            }

            if (room_id || nickname) {
                const searchKey = String(room_id || nickname);
                results = results.filter(r => String(r.room_id) === searchKey || String(r.nickname) === searchKey);
            }

            results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            return { success: true, data: results.slice(0, 100) };
        } catch (err) {
            return { success: true, data: [] };
        }
    });
}

module.exports = { initDatabase };
