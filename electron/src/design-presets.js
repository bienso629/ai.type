// electron/src/design-presets.js
// 3D Design Presets Store — Electron IPC + JSON files
//
// Lưu danh sách các mẫu thiết kế (design preset) cho cảnh 3D phòng.
// Mỗi mẫu design = 1 bản chụp (snapshot) toàn bộ trạng thái cảnh:
//   props + character + room + thumbnail PNG.
//
// Cấu trúc thư mục:
// ~/Documents/ai.type/data/profiles/{username}/designs/
//   ├── designs.json            <- index danh sách mẫu (metadata, không chứa props)
//   ├── {designId}.json         <- dữ liệu đầy đủ của 1 mẫu (props/character/room)
//   └── thumbnails/{designId}.png <- ảnh xem trước (PNG base64 đã decode)
//
// IPC API:
//   designs:list              -> { designs: DesignMeta[] }
//   designs:get               -> { design: DesignData }
//   designs:save              -> { design: DesignMeta }   (tạo mới hoặc ghi đè)
//   designs:delete            -> void
//   designs:rename            -> { design: DesignMeta }
//   designs:save-thumbnail    -> { thumbnailPath }
//   designs:duplicate         -> { design: DesignMeta }

const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

// ── Path Helpers ──────────────────────────────────────────────────────────────

function getDesignsRoot(username) {
    const safe = (username || 'default').replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    return path.join(app.getPath('documents'), 'ai.type', 'data', 'profiles', safe, 'designs');
}

function getDesignsDir(username) {
    const dir = getDesignsRoot(username);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getThumbnailsDir(username) {
    const dir = path.join(getDesignsDir(username), 'thumbnails');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getDesignsIndexPath(username) {
    return path.join(getDesignsDir(username), 'designs.json');
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

// ── Defaults ──────────────────────────────────────────────────────────────────

const DESIGN_META_DEFAULTS = {
    id: null,
    name: 'Chưa đặt tên',
    description: '',
    thumbnailPath: null,
    propCount: 0,
    hasCharacter: false,
    hasRoom: false,
    createdAt: null,
    updatedAt: null
};

// ── IPC Handlers ──────────────────────────────────────────────────────────────

function registerDesignPresetHandlers() {

    // ── designs:list — trả về index metadata (không kèm props nặng) ──
    ipcMain.handle('designs:list', async (_event, { username } = {}) => {
        try {
            rebuildIndexIfStale(username);
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            // Sắp xếp mới nhất lên đầu
            idx.designs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            return { success: true, data: idx.designs };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:get — đọc dữ liệu đầy đủ 1 mẫu ──
    ipcMain.handle('designs:get', async (_event, { username, designId } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            // Chặn path traversal: chỉ cho phép ký tự an toàn
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const designData = readJson(path.join(getDesignsDir(username), safeId + '.json'), null);
            if (!designData) return { success: false, error: 'Mẫu thiết kế không tồn tại' };
            return { success: true, data: designData };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:save — tạo mới hoặc ghi đè 1 mẫu ──
    // Payload: { username, designId, name, description, data: { props, character, room } }
    ipcMain.handle('designs:save', async (_event, { username, designId, name, description, data } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const now = new Date().toISOString();
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            let meta = idx.designs.find(d => d.id === safeId);
            if (!meta) {
                meta = { ...DESIGN_META_DEFAULTS, id: safeId, createdAt: now };
                idx.designs.push(meta);
            }
            // Ghi file dữ liệu đầy đủ
            const dataPath = path.join(getDesignsDir(username), safeId + '.json');
            writeJson(dataPath, data || {});
            // Cập nhật metadata
            if (name) meta.name = String(name).slice(0, 120);
            if (description !== undefined) meta.description = String(description).slice(0, 500);
            meta.propCount = Array.isArray(data?.props) ? data.props.length : 0;
            meta.hasCharacter = !!(data?.character && (data.character.glbPath || data.character.animationState));
            meta.hasRoom = !!data?.room;
            meta.updatedAt = now;
            writeJson(getDesignsIndexPath(username), idx);
            return { success: true, data: meta };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:delete — xóa mẫu + file data + thumbnail ──
    ipcMain.handle('designs:delete', async (_event, { username, designId } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const dir = getDesignsDir(username);
            const dataFile = path.join(dir, safeId + '.json');
            if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
            const thumbFile = path.join(getThumbnailsDir(username), safeId + '.png');
            if (fs.existsSync(thumbFile)) fs.unlinkSync(thumbFile);
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            idx.designs = idx.designs.filter(d => d.id !== safeId);
            writeJson(getDesignsIndexPath(username), idx);
            return { success: true };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:rename — đổi tên / mô tả, không đụng dữ liệu ──
    ipcMain.handle('designs:rename', async (_event, { username, designId, name, description } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            const meta = idx.designs.find(d => d.id === safeId);
            if (!meta) return { success: false, error: 'Không tìm thấy mẫu' };
            if (name) meta.name = String(name).slice(0, 120);
            if (description !== undefined) meta.description = String(description).slice(0, 500);
            meta.updatedAt = new Date().toISOString();
            writeJson(getDesignsIndexPath(username), idx);
            return { success: true, data: meta };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:save-thumbnail — decode base64 PNG (chụp từ canvas 3D) thành file .png ──
    ipcMain.handle('designs:save-thumbnail', async (_event, { username, designId, base64 } = {}) => {
        try {
            if (!designId || !base64) return { success: false, error: 'Thiếu designId hoặc base64' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const thumbsDir = getThumbnailsDir(username);
            const thumbPath = path.join(thumbsDir, safeId + '.png');
            const raw = String(base64).replace(/^data:image\/\w+;base64,/, '');
            fs.writeFileSync(thumbPath, Buffer.from(raw, 'base64'));
            // Cập nhật index
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            const meta = idx.designs.find(d => d.id === safeId);
            if (meta) {
                meta.thumbnailPath = thumbPath;
                meta.updatedAt = new Date().toISOString();
                writeJson(getDesignsIndexPath(username), idx);
            }
            return { success: true, data: { thumbnailPath: thumbPath } };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:duplicate — nhân bản 1 mẫu ──
    ipcMain.handle('designs:duplicate', async (_event, { username, designId } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const dir = getDesignsDir(username);
            const src = readJson(path.join(dir, safeId + '.json'), null);
            if (!src) return { success: false, error: 'Mẫu gốc không tồn tại' };
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            const srcMeta = idx.designs.find(d => d.id === safeId);
            const now = new Date().toISOString();
            const newId = 'design_' + Date.now();
            const newMeta = {
                ...DESIGN_META_DEFAULTS,
                id: newId,
                name: (srcMeta ? srcMeta.name : 'Mẫu') + ' (bản sao)',
                description: srcMeta ? srcMeta.description : '',
                propCount: Array.isArray(src.props) ? src.props.length : 0,
                hasCharacter: !!(src.character && (src.character.glbPath || src.character.animationState)),
                hasRoom: !!src.room,
                createdAt: now,
                updatedAt: now
            };
            writeJson(path.join(dir, newId + '.json'), src);
            // Copy thumbnail nếu có
            const srcThumb = path.join(getThumbnailsDir(username), safeId + '.png');
            if (fs.existsSync(srcThumb)) {
                fs.copyFileSync(srcThumb, path.join(getThumbnailsDir(username), newId + '.png'));
                newMeta.thumbnailPath = path.join(getThumbnailsDir(username), newId + '.png');
            }
            idx.designs.push(newMeta);
            writeJson(getDesignsIndexPath(username), idx);
            return { success: true, data: newMeta };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── Helper: dọn index khi file data còn mà index mất (hoặc ngược lại) ──
    function rebuildIndexIfStale(username) {
        try {
            const dir = getDesignsDir(username);
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            if (!Array.isArray(idx.designs)) idx.designs = [];
            const onDisk = fs.readdirSync(dir)
                .filter(f => f.endsWith('.json') && f !== 'designs.json')
                .map(f => f.replace(/\.json$/, ''));
            let changed = false;
            // Thêm mẫu còn file data mà thiếu trong index
            for (const id of onDisk) {
                if (!idx.designs.some(d => d.id === id)) {
                    const data = readJson(path.join(dir, id + '.json'), {}) || {};
                    idx.designs.push({
                        ...DESIGN_META_DEFAULTS,
                        id,
                        name: data.name || 'Chưa đặt tên',
                        propCount: Array.isArray(data.props) ? data.props.length : 0,
                        hasCharacter: !!(data.character && (data.character.glbPath || data.character.animationState)),
                        hasRoom: !!data.room,
                        createdAt: data.createdAt || new Date().toISOString(),
                        updatedAt: data.updatedAt || new Date().toISOString()
                    });
                    changed = true;
                }
            }
            // Xóa khỏi index các mẫu mà file data không còn
            const before = idx.designs.length;
            idx.designs = idx.designs.filter(d => onDisk.includes(d.id));
            if (changed || idx.designs.length !== before) {
                writeJson(getDesignsIndexPath(username), idx);
            }
        } catch (e) {
            // Không bao giờ để lỗi rebuild làm hỏng list
            console.warn('[DesignPresets] rebuildIndexIfStale error:', e);
        }
    }

    console.log('[DesignPresets] All IPC handlers registered OK');
}

module.exports = { registerDesignPresetHandlers };
