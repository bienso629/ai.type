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

function getVideoDir(username) {
    const dir = path.join(getDesignsDir(username), 'video');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function getDesignVideoPath(username, safeId) {
    return path.join(getVideoDir(username), safeId + '.json');
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

// Ghi JSON file nguyên tử (atomic tmp + rename) để tránh rách file khi đọc/ghi liên tiếp
function writeJson(filePath, data, pretty = true) {
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    const serialized = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    fs.writeFileSync(tmpPath, serialized, 'utf8');
    fs.renameSync(tmpPath, filePath);
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
    videoCount: 0,
    camKeyframeCount: 0,
    hasVideoSetup: false,
    createdAt: null,
    updatedAt: null
};

function extractVideoMeta(data) {
    const av = data && (data.aiVideo3d || (data.scene && data.scene.aiVideo3d) || (data.cameraKeyframes !== undefined || data.refImages !== undefined || data.history !== undefined ? data : null)) || null;
    if (!av || typeof av !== 'object') {
        return { videoCount: 0, camKeyframeCount: 0, hasVideoSetup: false };
    }
    const histLen = Array.isArray(av.history) ? av.history.length : 0;
    const videoCount = histLen > 0 ? histLen : ((av.resultFilePath || av.resultUrl) ? 1 : 0);
    const camKeyframeCount = Array.isArray(av.cameraKeyframes) ? av.cameraKeyframes.length : 0;
    const hasVideoSetup = Boolean(
        videoCount > 0 ||
        camKeyframeCount > 0 ||
        (Array.isArray(av.refImages) && av.refImages.length > 0) ||
        (typeof av.prompt === 'string' && av.prompt.trim().length > 0) ||
        av.capturedFilePath ||
        av.resultFilePath ||
        av.resultUrl
    );
    return { videoCount, camKeyframeCount, hasVideoSetup };
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

function registerDesignPresetHandlers() {

    // ── designs:list — trả về index metadata (không kèm props nặng) ──
    ipcMain.handle('designs:list', async (_event, { username } = {}) => {
        try {
            rebuildIndexIfStale(username);
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            // Sắp xếp mới nhất lên đầu
            idx.designs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            // Gắn thumbnailDataUrl + đồng bộ videoCount/camKeyframeCount từ sidecar designs/video/{id}.json
            const enriched = idx.designs.map((d) => {
                if (!d) return d;
                const copy = { ...d };
                const safeId = String(d.id || '').replace(/[^a-zA-Z0-9_\-]/g, '_');
                if (safeId) {
                    const videoSidecar = readJson(getDesignVideoPath(username, safeId), null);
                    if (videoSidecar) {
                        const vm = extractVideoMeta(videoSidecar);
                        copy.videoCount = vm.videoCount;
                        copy.camKeyframeCount = vm.camKeyframeCount;
                        copy.hasVideoSetup = vm.hasVideoSetup;
                    }
                }
                if (!copy.thumbnailDataUrl && copy.thumbnailPath && fs.existsSync(copy.thumbnailPath)) {
                    try {
                        const stat = fs.statSync(copy.thumbnailPath);
                        if (stat.size > 0 && stat.size <= 512 * 1024) {
                            const ext = path.extname(copy.thumbnailPath).toLowerCase();
                            const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
                            const b64 = fs.readFileSync(copy.thumbnailPath).toString('base64');
                            copy.thumbnailDataUrl = `data:${mime};base64,${b64}`;
                        }
                    } catch (_) {}
                }
                return copy;
            });
            return { success: true, data: enriched };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:get — đọc dữ liệu đầy đủ 1 mẫu (luôn gộp sidecar video mới nhất) ──
    ipcMain.handle('designs:get', async (_event, { username, designId } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            // Chặn path traversal: chỉ cho phép ký tự an toàn
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const designData = readJson(path.join(getDesignsDir(username), safeId + '.json'), null);
            if (!designData) return { success: false, error: 'Mẫu thiết kế không tồn tại' };
            const videoSidecar = readJson(getDesignVideoPath(username, safeId), null);
            if (videoSidecar && typeof videoSidecar === 'object') {
                designData.aiVideo3d = videoSidecar;
                designData.scene = { ...(designData.scene || {}), aiVideo3d: videoSidecar };
            }
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
            // Ghi file dữ liệu đầy đủ (compact JSON giúp giảm dung lượng ~2.5x và nạp mẫu nhanh hơn)
            const dataPath = path.join(getDesignsDir(username), safeId + '.json');
            writeJson(dataPath, data || {}, false);
            // Ghi kèm file sidecar video gọn nhẹ để patch-video chạy <1ms
            const av = data && (data.aiVideo3d || (data.scene && data.scene.aiVideo3d)) || null;
            if (av && typeof av === 'object') {
                writeJson(getDesignVideoPath(username, safeId), av, false);
            }
            // Cập nhật metadata
            if (name) meta.name = String(name).slice(0, 120);
            if (description !== undefined) meta.description = String(description).slice(0, 500);
            meta.propCount = Array.isArray(data?.props) ? data.props.length : 0;
            meta.hasCharacter = !!(data?.character && (data.character.glbPath || data.character.animationState));
            meta.hasRoom = !!data?.room;
            const vm = extractVideoMeta(av || data);
            meta.videoCount = vm.videoCount;
            meta.camKeyframeCount = vm.camKeyframeCount;
            meta.hasVideoSetup = vm.hasVideoSetup;
            meta.updatedAt = now;
            writeJson(getDesignsIndexPath(username), idx);
            return { success: true, data: meta };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:delete — xóa mẫu + file data + sidecar video + thumbnail ──
    ipcMain.handle('designs:delete', async (_event, { username, designId } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const dir = getDesignsDir(username);
            const dataFile = path.join(dir, safeId + '.json');
            if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
            const videoFile = getDesignVideoPath(username, safeId);
            if (fs.existsSync(videoFile)) fs.unlinkSync(videoFile);
            for (const ext of ['.png', '.jpg']) {
                const thumbFile = path.join(getThumbnailsDir(username), safeId + ext);
                if (fs.existsSync(thumbFile)) fs.unlinkSync(thumbFile);
            }
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

    // ── designs:save-thumbnail — decode base64 PNG/JPEG (chụp từ canvas 3D) thành file ảnh ──
    ipcMain.handle('designs:save-thumbnail', async (_event, { username, designId, base64 } = {}) => {
        try {
            if (!designId || !base64) return { success: false, error: 'Thiếu designId hoặc base64' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const thumbsDir = getThumbnailsDir(username);
            const strVal = String(base64);
            const isJpeg = /^data:image\/jpe?g;base64,/i.test(strVal);
            const ext = isJpeg ? '.jpg' : '.png';
            const mime = isJpeg ? 'image/jpeg' : 'image/png';
            const thumbPath = path.join(thumbsDir, safeId + ext);
            const raw = strVal.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            fs.writeFileSync(thumbPath, Buffer.from(raw, 'base64'));
            // Cập nhật index
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            const meta = idx.designs.find(d => d.id === safeId);
            if (meta) {
                meta.thumbnailPath = thumbPath;
                if (raw.length <= 260 * 1024) {
                    meta.thumbnailDataUrl = `data:${mime};base64,${raw}`;
                }
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
            const srcVideo = readJson(getDesignVideoPath(username, safeId), null);
            const vm = extractVideoMeta(srcVideo || src);
            const newMeta = {
                ...DESIGN_META_DEFAULTS,
                id: newId,
                name: (srcMeta ? srcMeta.name : 'Mẫu') + ' (bản sao)',
                description: srcMeta ? srcMeta.description : '',
                propCount: Array.isArray(src.props) ? src.props.length : 0,
                hasCharacter: !!(src.character && (src.character.glbPath || src.character.animationState)),
                hasRoom: !!src.room,
                videoCount: vm.videoCount,
                camKeyframeCount: vm.camKeyframeCount,
                hasVideoSetup: vm.hasVideoSetup,
                createdAt: now,
                updatedAt: now
            };
            writeJson(path.join(dir, newId + '.json'), src, false);
            if (srcVideo) {
                writeJson(getDesignVideoPath(username, newId), srcVideo, false);
            }
            // Copy thumbnail nếu có (.jpg hoặc .png)
            for (const ext of ['.jpg', '.png']) {
                const srcThumb = path.join(getThumbnailsDir(username), safeId + ext);
                if (fs.existsSync(srcThumb)) {
                    const dstThumb = path.join(getThumbnailsDir(username), newId + ext);
                    fs.copyFileSync(srcThumb, dstThumb);
                    newMeta.thumbnailPath = dstThumb;
                    if (srcMeta?.thumbnailDataUrl) {
                        newMeta.thumbnailDataUrl = srcMeta.thumbnailDataUrl;
                    }
                    break;
                }
            }
            idx.designs.push(newMeta);
            writeJson(getDesignsIndexPath(username), idx);
            return { success: true, data: newMeta };
        } catch (e) { return { success: false, error: e.message }; }
    });

    // ── designs:patch-video — ghi nguyên tử file sidecar video (~1KB, <1ms, không chạm file props lớn) ──
    ipcMain.handle('designs:patch-video', async (_event, { username, designId, aiVideo3d } = {}) => {
        try {
            if (!designId) return { success: false, error: 'Thiếu designId' };
            const safeId = String(designId).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const dataPath = path.join(getDesignsDir(username), safeId + '.json');
            if (!fs.existsSync(dataPath)) return { success: false, error: 'Mẫu thiết kế không tồn tại' };
            const videoPath = getDesignVideoPath(username, safeId);
            writeJson(videoPath, aiVideo3d || {}, false);
            const idx = readJson(getDesignsIndexPath(username), { designs: [] });
            const meta = idx.designs.find(d => d.id === safeId);
            if (meta) {
                const vm = extractVideoMeta(aiVideo3d);
                meta.videoCount = vm.videoCount;
                meta.camKeyframeCount = vm.camKeyframeCount;
                meta.hasVideoSetup = vm.hasVideoSetup;
                writeJson(getDesignsIndexPath(username), idx);
            }
            return { success: true, data: meta || null };
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
                    const videoSidecar = readJson(getDesignVideoPath(username, id), null);
                    const vm = extractVideoMeta(videoSidecar || data);
                    idx.designs.push({
                        ...DESIGN_META_DEFAULTS,
                        id,
                        name: data.name || 'Chưa đặt tên',
                        propCount: Array.isArray(data.props) ? data.props.length : 0,
                        hasCharacter: !!(data.character && (data.character.glbPath || data.character.animationState)),
                        hasRoom: !!data.room,
                        videoCount: vm.videoCount,
                        camKeyframeCount: vm.camKeyframeCount,
                        hasVideoSetup: vm.hasVideoSetup,
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
