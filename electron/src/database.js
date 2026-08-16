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

function getTiktokDataDir(app) {
    let documentsPath;
    try {
        if (app && app.getPath) {
            documentsPath = app.getPath('documents');
        }
    } catch (e) {}
    if (!documentsPath) {
        documentsPath = path.join(require('os').homedir(), 'Documents');
    }
    const tiktokDir = path.join(documentsPath, 'ai.type', 'data', 'tiktok');
    if (!fs.existsSync(tiktokDir)) {
        fs.mkdirSync(tiktokDir, { recursive: true });
    }
    return tiktokDir;
}

function saveToSqliteViaPython(tiktokDbPath, record) {
    try {
        const { execFileSync } = require('child_process');
        const pyScript = `
import sqlite3
conn = sqlite3.connect(${JSON.stringify(tiktokDbPath)})
conn.execute('''
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
    )
''')
conn.execute('''
    INSERT INTO livestream_analyses (room_id, date_str, timestamp, nickname, title, hls_url, analysis_text)
    VALUES (?, ?, ?, ?, ?, ?, ?)
''', (${JSON.stringify(record.room_id)}, ${JSON.stringify(record.date_str)}, ${record.timestamp}, ${JSON.stringify(record.nickname)}, ${JSON.stringify(record.title)}, ${JSON.stringify(record.hls_url)}, ${JSON.stringify(record.analysis_text)}))
conn.commit()
conn.close()
`;
        execFileSync('python3', ['-c', pyScript]);
        console.log('[Python SQLite Fallback] Đã ghi bản ghi trực tiếp vào tiktok.sqlite thành công!');
    } catch (err) {
        console.error('[Python SQLite Fallback Error]:', err.message);
    }
}

function listFromSqliteViaPython(tiktokDbPath, roomId, nickname, dateStr) {
    try {
        const { execFileSync } = require('child_process');
        const key = roomId || nickname || '';
        const pyScript = `
import sqlite3, json
conn = sqlite3.connect(${JSON.stringify(tiktokDbPath)})
conn.row_factory = sqlite3.Row
cursor = conn.cursor()
query = 'SELECT * FROM livestream_analyses'
params = []
conds = []
if ${JSON.stringify(key)}:
    conds.append('(room_id = ? OR nickname = ?)')
    params.extend([${JSON.stringify(key)}, ${JSON.stringify(key)}])
if ${JSON.stringify(dateStr || '')}:
    conds.append('date_str = ?')
    params.append(${JSON.stringify(dateStr || '')})
if conds:
    query += ' WHERE ' + ' AND '.join(conds)
query += ' ORDER BY timestamp DESC LIMIT 100'
cursor.execute(query, params)
rows = [dict(r) for r in cursor.fetchall()]
conn.close()
print(json.dumps(rows))
`;
        const out = execFileSync('python3', ['-c', pyScript], { encoding: 'utf-8' });
        return JSON.parse(out.trim());
    } catch (e) {
        return [];
    }
}

function clearSqliteViaPython(tiktokDbPath, roomId) {
    try {
        const { execFileSync } = require('child_process');
        const pyScript = `
import sqlite3
conn = sqlite3.connect(${JSON.stringify(tiktokDbPath)})
if ${JSON.stringify(roomId || '')}:
    conn.execute('DELETE FROM livestream_analyses WHERE room_id = ? OR nickname = ?', (${JSON.stringify(roomId || '')}, ${JSON.stringify(roomId || '')}))
else:
    conn.execute('DELETE FROM livestream_analyses')
conn.commit()
conn.close()
`;
        execFileSync('python3', ['-c', pyScript]);
        console.log('[Python SQLite Fallback] Đã xóa bản ghi trong tiktok.sqlite thành công!');
    } catch (err) {
        console.error('[Python SQLite Clear Error]:', err.message);
    }
}

function initDatabase(app, ipcMain) {
    const userDataPath = app.getPath('userData');
    const tiktokDir = getTiktokDataDir(app);
    const tiktokDbPath = path.join(tiktokDir, 'tiktok.sqlite');
    const masterJsonFile = path.join(tiktokDir, 'livestream_analyses.json');

    console.log('[SQLite tiktok.sqlite] Thư mục lưu trữ chính thức tại:', tiktokDir);

    // Đảm bảo file master JSON luôn được tạo sẵn khi ứng dụng chạy
    if (!fs.existsSync(masterJsonFile)) {
        fs.writeFileSync(masterJsonFile, JSON.stringify([], null, 2), 'utf-8');
    }

    if (Database) {
        try {
            const dbPath = path.join(userDataPath, 'local_sync.sqlite');
            db = new Database(dbPath);
            db.pragma('journal_mode = WAL');
            console.log('[SQLite] Kết nối local_sync.sqlite thành công tại:', dbPath);

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
            console.error('[SQLite Fatal Error local_sync]:', err);
        }

        try {
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
        console.log('[SQLite Fallback] Electron database running with safe JSON & Python SQLite fallback in Documents/ai.type/data/tiktok.');
        // Khởi tạo tiktok.sqlite bằng Python nếu better-sqlite3 native không có sẵn
        saveToSqliteViaPython(tiktokDbPath, { room_id: 'init', date_str: '', timestamp: 0, nickname: '', title: '', hls_url: '', analysis_text: '' });
        clearSqliteViaPython(tiktokDbPath, 'init');
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
        const record = {
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

        // 1. Ghi vào SQLite Database (nếu better-sqlite3 chạy)
        if (tiktokDb) {
            try {
                const stmt = tiktokDb.prepare(`
                    INSERT INTO livestream_analyses (room_id, date_str, timestamp, nickname, title, hls_url, analysis_text)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                const info = stmt.run(
                    record.room_id,
                    record.date_str,
                    record.timestamp,
                    record.nickname,
                    record.title,
                    record.hls_url,
                    record.analysis_text
                );
                console.log('[SQLite tiktok.sqlite] Đã lưu bản ghi ID:', info.lastInsertRowid);
            } catch (err) {
                console.error('[SQLite Error db-tiktok-save]:', err.message);
                saveToSqliteViaPython(tiktokDbPath, record);
            }
        } else {
            // Nếu không có better-sqlite3 native -> Dùng Python SQLite driver để ghi trực tiếp vào tiktok.sqlite
            saveToSqliteViaPython(tiktokDbPath, record);
        }

        // 2. Đồng thời lưu vào livestream_analyses.json
        try {
            const masterFile = path.join(tiktokDir, 'livestream_analyses.json');
            let records = [];
            if (fs.existsSync(masterFile)) {
                try {
                    records = JSON.parse(fs.readFileSync(masterFile, 'utf-8'));
                } catch (e) {
                    records = [];
                }
            }
            records.unshift(record);
            fs.writeFileSync(masterFile, JSON.stringify(records.slice(0, 1000), null, 2), 'utf-8');
            console.log('[Documents/ai.type/data/tiktok] Đã lưu dữ liệu phân tích thành công vào:', masterFile);
            return { success: true, id: now };
        } catch (err) {
            console.error('[Save to Documents Error]:', err);
            return { success: true, id: now };
        }
    });

    ipcMain.handle('db-tiktok-clear', (event, { room_id }) => {
        // 1. Xóa trong SQLite Database
        if (tiktokDb) {
            try {
                if (room_id) {
                    const stmt = tiktokDb.prepare('DELETE FROM livestream_analyses WHERE room_id = ? OR nickname = ?');
                    stmt.run(String(room_id), String(room_id));
                } else {
                    const stmt = tiktokDb.prepare('DELETE FROM livestream_analyses');
                    stmt.run();
                }
            } catch (err) {
                console.error('[SQLite Clear Error]:', err.message);
                clearSqliteViaPython(tiktokDbPath, room_id);
            }
        } else {
            clearSqliteViaPython(tiktokDbPath, room_id);
        }

        // 2. Xóa trong file JSON master
        try {
            const masterFile = path.join(tiktokDir, 'livestream_analyses.json');
            if (fs.existsSync(masterFile)) {
                if (room_id) {
                    let records = JSON.parse(fs.readFileSync(masterFile, 'utf-8'));
                    const searchKey = String(room_id).toLowerCase();
                    records = records.filter(r => String(r.room_id).toLowerCase() !== searchKey && String(r.nickname).toLowerCase() !== searchKey);
                    fs.writeFileSync(masterFile, JSON.stringify(records, null, 2), 'utf-8');
                } else {
                    fs.writeFileSync(masterFile, JSON.stringify([], null, 2), 'utf-8');
                }
            }
        } catch (e) {
            console.error('[Clear Documents JSON Error]:', e);
        }

        return { success: true };
    });

    ipcMain.handle('db-tiktok-list', (event, { room_id, nickname, date_str }) => {
        // 1. Thử truy vấn từ SQLite Database nếu có
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
                if (rows && rows.length > 0) {
                    return { success: true, data: rows };
                }
            } catch (err) {
                console.error('[SQLite db-tiktok-list Error]:', err.message);
            }
        }

        // Truy vấn qua Python SQLite nếu better-sqlite3 không có
        const pyRows = listFromSqliteViaPython(tiktokDbPath, room_id, nickname, date_str);
        if (pyRows && pyRows.length > 0) {
            return { success: true, data: pyRows };
        }

        // 2. Đọc từ file JSON master tại Documents/ai.type/data/tiktok/
        try {
            const masterFile = path.join(tiktokDir, 'livestream_analyses.json');
            if (fs.existsSync(masterFile)) {
                let records = JSON.parse(fs.readFileSync(masterFile, 'utf-8'));
                if (Array.isArray(records) && records.length > 0) {
                    if (room_id || nickname) {
                        const searchKey = String(room_id || nickname || '').toLowerCase();
                        records = records.filter(r => {
                            const rId = String(r.room_id || '').toLowerCase();
                            const rNick = String(r.nickname || '').toLowerCase();
                            return rId === searchKey || rNick === searchKey || rNick.includes(searchKey);
                        });
                    }
                    if (date_str) {
                        records = records.filter(r => r.date_str === date_str);
                    }
                    return { success: true, data: records.slice(0, 100) };
                }
            }
        } catch (err) {
            console.error('[Read from Documents Error]:', err);
        }

        return { success: true, data: [] };
    });
}

module.exports = { initDatabase };
