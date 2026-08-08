// electron/src/local-profiles.js
// Profile 3D Data Store — Electron IPC + JSON files
//
// Cấu trúc thư mục:
// ~/Documents/ai.type/data/profiles/{username}/
//   ├── profile.json          ← thông tin cơ bản
//   ├── character.json        ← nhân vật (GLB, scale, vị trí)
//   ├── clothing.json         ← quần áo / phụ kiện (array)
//   ├── animations.json       ← danh sách animation clips (array)
//   ├── room.json             ← cài đặt phòng (đèn, màu, theme)
//   ├── props.json            ← đồ vật trong phòng (array)
//   ├── inventory.json        ← danh sách item user sở hữu
//   └── assets/              ← file GLB, PNG, ...
//         ├── {username}.glb  ← character GLB
//         ├── anims/          ← animation GLBs
//         ├── clothing/       ← clothing GLBs
//         └── props/          ← prop GLBs

const { ipcMain, app } = require('electron');
const fs   = require('fs');
const path = require('path');

// ── Path Helpers ──────────────────────────────────────────────────────────────

function getProfilesRoot() {
    return path.join(app.getPath('documents'), 'ai.type', 'data', 'profiles');
}

function getProfileDir(username) {
    const safe = (username || 'default').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const dir  = path.join(getProfilesRoot(), safe);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getAssetsDir(username, sub = '') {
    const dir = sub
        ? path.join(getProfileDir(username), 'assets', sub)
        : path.join(getProfileDir(username), 'assets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Đọc JSON file, trả về defaultValue nếu chưa có
function readJson(filePath, defaultValue = null) {
    if (!fs.existsSync(filePath)) return defaultValue;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch { return defaultValue; }
}

// Ghi JSON file
function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Default Data ───────────────────────────────────────────────────────────────

const DEFAULT_CHARACTER = {
    name: null,                  // hiển thị tên, null = dùng username
    glbPath: null,               // đường dẫn tuyệt đối trên đĩa
    position: { x: 0, y: 0, z: 0 },
    scale: 1.0,
    facingAngle: 0,
    activeAnimationName: null,   // tên animation đang phát (null = đứng im)
    createdAt: null,
    updatedAt: null
};

const DEFAULT_ROOM = {
    theme: 'default',
    lightsOn: true,
    ambientColor: '#ffffff',
    cameraPreset: 'DESK_VIEW',
    backgroundUrl: null,
    updatedAt: null
};

// ── IPC Handlers ───────────────────────────────────────────────────────────────

function registerProfileHandlers() {

    // ─────────────────────────────────────────────────────────────
    // PROFILE (thông tin cơ bản)
    // ─────────────────────────────────────────────────────────────

    /** Lấy toàn bộ profile (gộp tất cả json files) */
    ipcMain.handle('profile:get', async (_event, { username } = {}) => {
        try {
            const dir = getProfileDir(username);
            const now = new Date().toISOString();

            // Đọc / tạo profile.json
            const profilePath = path.join(dir, 'profile.json');
            let profile = readJson(profilePath);
            if (!profile) {
                profile = { username, createdAt: now, updatedAt: now };
                writeJson(profilePath, profile);
            }

            // Đọc tất cả sub-files, tạo default nếu chưa có
            const charPath  = path.join(dir, 'character.json');
            const roomPath  = path.join(dir, 'room.json');
            const clothPath = path.join(dir, 'clothing.json');
            const animPath  = path.join(dir, 'animations.json');
            const propPath  = path.join(dir, 'props.json');
            const invPath   = path.join(dir, 'inventory.json');

            if (!fs.existsSync(charPath))  writeJson(charPath,  { ...DEFAULT_CHARACTER, createdAt: now, updatedAt: now });
            if (!fs.existsSync(roomPath))  writeJson(roomPath,  { ...DEFAULT_ROOM, updatedAt: now });
            if (!fs.existsSync(clothPath)) writeJson(clothPath, []);
            if (!fs.existsSync(animPath))  writeJson(animPath,  []);
            if (!fs.existsSync(propPath))  writeJson(propPath,  []);
            if (!fs.existsSync(invPath))   writeJson(invPath,   { items: [] });

            return {
                success: true,
                data: {
                    ...profile,
                    character:   readJson(charPath,  DEFAULT_CHARACTER),
                    room:        readJson(roomPath,   DEFAULT_ROOM),
                    clothing:    readJson(clothPath,  []),
                    animations:  readJson(animPath,   []),
                    props:       readJson(propPath,   []),
                    inventory:   readJson(invPath,    { items: [] }),
                }
            };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // CHARACTER
    // ─────────────────────────────────────────────────────────────

    /** Lưu thông tin character (không bao gồm file GLB) */
    ipcMain.handle('character:save', async (_event, { username, character } = {}) => {
        try {
            const filePath = path.join(getProfileDir(username), 'character.json');
            const existing = readJson(filePath, { ...DEFAULT_CHARACTER });
            const updated  = { ...existing, ...character, updatedAt: new Date().toISOString() };
            writeJson(filePath, updated);
            return { success: true, data: updated };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    /** Upload GLB file cho character, lưu vào assets/{username}.glb */
    ipcMain.handle('character:upload-glb', async (_event, { username, buffer } = {}) => {
        try {
            const safe    = (username || 'default').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const assetsDir = getAssetsDir(username);
            const glbPath = path.join(assetsDir, `${safe}.glb`);
            fs.writeFileSync(glbPath, Buffer.from(buffer));

            // Cập nhật character.json
            const charPath = path.join(getProfileDir(username), 'character.json');
            const existing = readJson(charPath, { ...DEFAULT_CHARACTER });
            const updated  = { ...existing, glbPath, updatedAt: new Date().toISOString() };
            if (!updated.createdAt) updated.createdAt = updated.updatedAt;
            writeJson(charPath, updated);

            return { success: true, glbPath };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    /** Đọc GLB file thành ArrayBuffer */
    ipcMain.handle('asset:read-glb', async (_event, { filePath } = {}) => {
        try {
            if (!filePath || !fs.existsSync(filePath))
                return { success: false, error: 'File không tồn tại: ' + filePath };
            const buffer = fs.readFileSync(filePath);
            return { success: true, buffer: buffer.buffer };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // ANIMATIONS
    // ─────────────────────────────────────────────────────────────

    /** Lấy danh sách animations */
    ipcMain.handle('animations:list', async (_event, { username } = {}) => {
        try {
            const filePath = path.join(getProfileDir(username), 'animations.json');
            return { success: true, data: readJson(filePath, []) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    /** Upload 1 animation clip GLB */
    ipcMain.handle('animations:upload', async (_event, { username, name, buffer } = {}) => {
        try {
            const animDir = getAssetsDir(username, 'anims');
            const safe    = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const glbPath = path.join(animDir, `${safe}.glb`);
            fs.writeFileSync(glbPath, Buffer.from(buffer));

            // Thêm vào animations.json
            const animListPath = path.join(getProfileDir(username), 'animations.json');
            const list = readJson(animListPath, []);
            const idx  = list.findIndex(a => a.name === name);
            const entry = { id: safe, name, glbPath, uploadedAt: new Date().toISOString() };
            if (idx >= 0) list[idx] = entry; else list.push(entry);
            writeJson(animListPath, list);

            return { success: true, data: entry };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    /** Xoá animation */
    ipcMain.handle('animations:delete', async (_event, { username, id } = {}) => {
        try {
            const animListPath = path.join(getProfileDir(username), 'animations.json');
            let list = readJson(animListPath, []);
            const entry = list.find(a => a.id === id);
            if (entry?.glbPath && fs.existsSync(entry.glbPath))
                fs.unlinkSync(entry.glbPath);
            list = list.filter(a => a.id !== id);
            writeJson(animListPath, list);
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // ─────────────────────────────────────────────────────────────
    // CLOTHING / ACCESSORIES
    // ─────────────────────────────────────────────────────────────

    ipcMain.handle('clothing:list', async (_event, { username } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'clothing.json');
            return { success: true, data: readJson(p, []) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('clothing:upload', async (_event, { username, name, slot, buffer } = {}) => {
        try {
            // slot: 'hat' | 'top' | 'bottom' | 'shoes' | 'accessory'
            const clothDir = getAssetsDir(username, 'clothing');
            const safe     = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const glbPath  = path.join(clothDir, `${safe}.glb`);
            fs.writeFileSync(glbPath, Buffer.from(buffer));

            const listPath = path.join(getProfileDir(username), 'clothing.json');
            const list = readJson(listPath, []);
            const entry = { id: safe, name, slot: slot || 'accessory', glbPath, equippedAt: new Date().toISOString() };
            const idx = list.findIndex(c => c.id === safe);
            if (idx >= 0) list[idx] = entry; else list.push(entry);
            writeJson(listPath, list);
            return { success: true, data: entry };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('clothing:delete', async (_event, { username, id } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'clothing.json');
            let list = readJson(p, []);
            const entry = list.find(c => c.id === id);
            if (entry?.glbPath && fs.existsSync(entry.glbPath)) fs.unlinkSync(entry.glbPath);
            writeJson(p, list.filter(c => c.id !== id));
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ─────────────────────────────────────────────────────────────
    // ROOM SETTINGS
    // ─────────────────────────────────────────────────────────────

    ipcMain.handle('room:get', async (_event, { username } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'room.json');
            return { success: true, data: readJson(p, { ...DEFAULT_ROOM }) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('room:save', async (_event, { username, room } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'room.json');
            const updated = { ...readJson(p, { ...DEFAULT_ROOM }), ...room, updatedAt: new Date().toISOString() };
            writeJson(p, updated);
            return { success: true, data: updated };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('wall-photo:save', async (_event, { username, buffer } = {}) => {
        try {
            const assetsDir = path.join(getProfileDir(username), 'assets');
            fs.mkdirSync(assetsDir, { recursive: true });
            const photoPath = path.join(assetsDir, 'wall_photo.jpg');
            fs.writeFileSync(photoPath, Buffer.from(buffer));
            // Cập nhật room.json với wallPhotoPath
            const roomPath = path.join(getProfileDir(username), 'room.json');
            const room = readJson(roomPath, { ...DEFAULT_ROOM });
            room.wallPhotoPath = photoPath;
            room.updatedAt = new Date().toISOString();
            writeJson(roomPath, room);
            return { success: true, filePath: photoPath };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ─────────────────────────────────────────────────────────────
    // PROPS (đồ vật trong phòng)
    // ─────────────────────────────────────────────────────────────

    ipcMain.handle('props:list', async (_event, { username } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'props.json');
            return { success: true, data: readJson(p, []) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('props:save', async (_event, { username, props } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'props.json');
            writeJson(p, props);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('props:upload', async (_event, { username, name, position, scale, buffer } = {}) => {
        try {
            const propDir = getAssetsDir(username, 'props');
            const safe    = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
            const glbPath = path.join(propDir, `${safe}.glb`);
            if (buffer) fs.writeFileSync(glbPath, Buffer.from(buffer));

            const listPath = path.join(getProfileDir(username), 'props.json');
            const list = readJson(listPath, []);
            const entry = {
                id: `${safe}_${Date.now()}`, name, glbPath,
                position: position || { x: 0, y: 0, z: 0 },
                scale: scale || 1.0,
                addedAt: new Date().toISOString()
            };
            list.push(entry);
            writeJson(listPath, list);
            return { success: true, data: entry };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('props:delete', async (_event, { username, id } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'props.json');
            let list = readJson(p, []);
            // Xoá file chỉ khi không còn prop nào khác dùng cùng GLB
            const entry = list.find(c => c.id === id);
            list = list.filter(c => c.id !== id);
            const stillUsed = list.some(c => c.glbPath === entry?.glbPath);
            if (!stillUsed && entry?.glbPath && fs.existsSync(entry.glbPath))
                fs.unlinkSync(entry.glbPath);
            writeJson(p, list);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ─────────────────────────────────────────────────────────────
    // INVENTORY (danh sách item user sở hữu)
    // ─────────────────────────────────────────────────────────────

    ipcMain.handle('inventory:get', async (_event, { username } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'inventory.json');
            return { success: true, data: readJson(p, { items: [] }) };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('inventory:add-item', async (_event, { username, item } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'inventory.json');
            const inv = readJson(p, { items: [] });
            inv.items.push({ ...item, addedAt: new Date().toISOString() });
            writeJson(p, inv);
            return { success: true, data: inv };
        } catch (e) { return { success: false, error: e.message }; }
    });

    ipcMain.handle('inventory:remove-item', async (_event, { username, itemId } = {}) => {
        try {
            const p = path.join(getProfileDir(username), 'inventory.json');
            const inv = readJson(p, { items: [] });
            inv.items = inv.items.filter(i => i.id !== itemId);
            writeJson(p, inv);
            return { success: true, data: inv };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ─────────────────────────────────────────────────────────────
    // LEGACY — giữ tương thích với code cũ
    // ─────────────────────────────────────────────────────────────

    /** @deprecated dùng character:save thay thế */
    ipcMain.handle('profile:save', async (_event, { username, profile } = {}) => {
        try {
            const dir = getProfileDir(username);
            const now = new Date().toISOString();

            // Merge character fields nếu có
            if (profile?.character) {
                const charPath = path.join(dir, 'character.json');
                const existing = readJson(charPath, { ...DEFAULT_CHARACTER });
                writeJson(charPath, { ...existing, ...profile.character, updatedAt: now });
            }
            // Merge room fields nếu có
            if (profile?.scene || profile?.room) {
                const roomPath = path.join(dir, 'room.json');
                const existing = readJson(roomPath, { ...DEFAULT_ROOM });
                writeJson(roomPath, { ...existing, ...(profile.scene || profile.room), updatedAt: now });
            }
            // Cập nhật profile.json
            const profilePath = path.join(dir, 'profile.json');
            const base = readJson(profilePath, { username, createdAt: now });
            writeJson(profilePath, { ...base, updatedAt: now });

            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    /** @deprecated dùng character:upload-glb thay thế */
    ipcMain.handle('profile:save-character-glb', async (_event, { username, buffer } = {}) => {
        // Forward sang handler mới
        return ipcMain.emit
            ? { success: false, error: 'use character:upload-glb' }
            : { success: false, error: 'forward failed' };
    });

    /** @deprecated dùng asset:read-glb thay thế */
    ipcMain.handle('profile:read-glb', async (_event, { filePath } = {}) => {
        try {
            if (!filePath || !fs.existsSync(filePath))
                return { success: false, error: 'File không tồn tại' };
            const buffer = fs.readFileSync(filePath);
            return { success: true, buffer: buffer.buffer };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('profile:check-character-glb', async (_event, { username } = {}) => {
        try {
            const charPath = path.join(getProfileDir(username), 'character.json');
            const char = readJson(charPath, null);
            if (char?.glbPath && fs.existsSync(char.glbPath))
                return { success: true, exists: true, glbPath: char.glbPath };
            return { success: true, exists: false };
        } catch (e) {
            return { success: false, exists: false, error: e.message };
        }
    });

    console.log('[LocalProfiles] All IPC handlers registered ✅');
}

module.exports = { registerProfileHandlers };
