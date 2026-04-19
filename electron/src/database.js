const Database = require('../node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function initDatabase(app, ipcMain) {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'local_sync.sqlite');

    try {
        db = new Database(dbPath);
        // Bật WAL mode để tăng tốc độ ghi/đọc, tối ưu cho xử lý hàng loạt
        db.pragma('journal_mode = WAL');

        console.log('[SQLite] Kết nối thành công tại:', dbPath);

        // Khởi tạo bảng mẫu dùng làm hàng đợi đồng bộ (Sync Queue) 
        // Có thể mở rộng schema ở đây tùy vào nghiệp vụ dự án
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

        // Đăng ký các cổng giao tiếp IPC cho Angular (Renderer process)

        // 1. Chạy mã SELECT lấy nhiều dòng
        ipcMain.handle('db-all', (event, { query, params = [] }) => {
            try {
                const stmt = db.prepare(query);
                return { success: true, data: stmt.all(params) };
            } catch (err) {
                console.error('[SQLite Error db-all]:', err.message);
                return { success: false, error: err.message };
            }
        });

        // 2. Chạy mã SELECT lấy 1 dòng
        ipcMain.handle('db-get', (event, { query, params = [] }) => {
            try {
                const stmt = db.prepare(query);
                return { success: true, data: stmt.get(params) };
            } catch (err) {
                console.error('[SQLite Error db-get]:', err.message);
                return { success: false, error: err.message };
            }
        });

        // 3. Thực thi Data Manipulation (INSERT, UPDATE, DELETE)
        ipcMain.handle('db-run', (event, { query, params = [] }) => {
            try {
                const stmt = db.prepare(query);
                const info = stmt.run(params);
                return { success: true, info }; // info includes changes, lastInsertRowid
            } catch (err) {
                console.error('[SQLite Error db-run]:', err.message);
                return { success: false, error: err.message };
            }
        });

    } catch (err) {
        console.error('[SQLite Fatal Error]: Không thể khởi tạo database.', err);
    }
}

module.exports = { initDatabase };
