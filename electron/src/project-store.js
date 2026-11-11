/**
 * PROJECT STORE
 * Lưu trữ dữ liệu cấu trúc dự án video (meta/timeline/casting) trên đĩa theo từng user,
 * thay thế cho việc nhét vào session IndexedDB của tài khoản.
 *
 * Cấu trúc đĩa: Documents/ai.type/data/tts/<username>/<uuid>/
 *   - meta.json     : dữ liệu "ai_type_audio_merger_data_<uuid>" (title, clips, ...)
 *   - timeline.json : dữ liệu "ai_type_video_ready_data_<uuid>" (scenes, editorLayout, ...)
 *   - casting.json  : dữ liệu "casting_list_<uuid>" (danh sách nhân vật)
 *
 * Ghi theo kiểu atomic (ghi file .tmp rồi rename) để tránh hỏng dữ liệu.
 */
const { ipcMain, app } = require("electron");
const fs = require("fs");
const path = require("path");

// Các trường nhị phân lớn nằm trong frame (base64) - luôn loại bỏ trước khi ghi đĩa
const STRIP_KEYS = new Set(["bgDataUrl", "thumbDataUrl"]);

function stripBinaryFields(value, depth = 0) {
    if (value === null || value === undefined || depth > 12) return value;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) value[i] = stripBinaryFields(value[i], depth + 1);
        return value;
    }
    if (typeof value === "object") {
        for (const k of Object.keys(value)) {
            if (STRIP_KEYS.has(k)) delete value[k];
            else stripBinaryFields(value[k], depth + 1);
        }
    }
    return value;
}

function sanitizeSegment(segment) {
    const s = String(segment || "").trim();
    if (!/^[A-Za-z0-9._-]+$/.test(s) || s === "." || s === "..") return null;
    return s;
}

function getUserRoot(username) {
    const safeUser = sanitizeSegment(username) || "anonymous";
    return path.join(app.getPath("documents"), "ai.type", "data", "tts", safeUser);
}

function getProjectDir(username, uuid) {
    const safeUuid = sanitizeSegment(uuid);
    if (!safeUuid) return null;
    return path.join(getUserRoot(username), safeUuid);
}

function atomicWriteJson(filePath, data) {
    const tmp = filePath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data), "utf-8");
    fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, "utf-8");
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn("[project-store] Không đọc được file:", filePath, e.message);
        return null;
    }
}

function buildPayload({ meta, timeline, casting }) {
    const data = {};
    if (meta) data.meta = meta;
    if (timeline) data.timeline = timeline;
    if (casting) data.casting = casting;
    return data;
}

function registerProjectStoreHandlers() {
    // Lưu 1 hoặc nhiều phần dữ liệu của 1 dự án
    ipcMain.handle("project-store:save", async (event, payload) => {
        try {
            const { username, uuid, meta, timeline, casting } = payload || {};
            if (!uuid) return { success: false, error: "Thiếu uuid" };
            const projectDir = getProjectDir(username, uuid);
            if (!projectDir) return { success: false, error: "uuid không hợp lệ" };
            fs.mkdirSync(projectDir, { recursive: true });
            const written = [];
            if (meta && typeof meta === "object") {
                atomicWriteJson(path.join(projectDir, "meta.json"), stripBinaryFields(meta));
                written.push("meta.json");
            }
            if (timeline && typeof timeline === "object") {
                atomicWriteJson(path.join(projectDir, "timeline.json"), stripBinaryFields(timeline));
                written.push("timeline.json");
            }
            if (casting && Array.isArray(casting)) {
                atomicWriteJson(path.join(projectDir, "casting.json"), stripBinaryFields(casting));
                written.push("casting.json");
            }
            return { success: true, written };
        } catch (e) {
            console.error("[project-store:save] Lỗi:", e);
            return { success: false, error: e.message };
        }
    });

    // Đọc toàn bộ dữ liệu 1 dự án
    ipcMain.handle("project-store:load", async (event, payload) => {
        try {
            const { username, uuid } = payload || {};
            const projectDir = getProjectDir(username, uuid);
            if (!projectDir || !fs.existsSync(projectDir)) {
                return { success: true, exists: false, data: null };
            }
            const data = buildPayload({
                meta: readJsonSafe(path.join(projectDir, "meta.json")),
                timeline: readJsonSafe(path.join(projectDir, "timeline.json")),
                casting: readJsonSafe(path.join(projectDir, "casting.json")),
            });
            return { success: true, exists: Object.keys(data).length > 0, data };
        } catch (e) {
            console.error("[project-store:load] Lỗi:", e);
            return { success: false, error: e.message };
        }
    });

    // Liệt kê tất cả dự án của 1 user (dựa trên meta.json/timeline.json trên đĩa)
    ipcMain.handle("project-store:list", async (event, payload) => {
        try {
            const username = payload && payload.username;
            const root = getUserRoot(username);
            const projects = [];
            if (fs.existsSync(root)) {
                const entries = fs.readdirSync(root, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const dirPath = path.join(root, entry.name);
                    let meta = readJsonSafe(path.join(dirPath, "meta.json"));
                    const hasTimeline = fs.existsSync(path.join(dirPath, "timeline.json"));
                    const hasCasting = fs.existsSync(path.join(dirPath, "casting.json"));
                    if (!meta && !hasTimeline && !hasCasting) continue;
                    if (!meta) {
                        meta = {
                            uuid: entry.name,
                            title: null,
                            clips: [],
                        };
                    }
                    if (!meta.uuid) meta.uuid = entry.name;
                    let updatedAt = 0;
                    try {
                        const statFile = path.join(dirPath, meta ? "meta.json" : "timeline.json");
                        updatedAt = fs.statSync(fs.existsSync(statFile) ? statFile : dirPath).mtimeMs;
                    } catch (e) {
                        updatedAt = 0;
                    }
                    projects.push({
                        uuid: meta.uuid,
                        title: meta.title || null,
                        clips: Array.isArray(meta.clips) ? meta.clips : [],
                        aspectRatio: meta.aspectRatio || null,
                        hasTimeline: !!hasTimeline,
                        hasCasting: !!hasCasting,
                        updatedAt,
                    });
                }
            }
            projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            return { success: true, projects };
        } catch (e) {
            console.error("[project-store:list] Lỗi:", e);
            return { success: false, error: e.message, projects: [] };
        }
    });

    // Xóa dữ liệu cấu trúc JSON của dự án (không đụng media mp3/ảnh)
    ipcMain.handle("project-store:delete", async (event, payload) => {
        try {
            const { username, uuid } = payload || {};
            const projectDir = getProjectDir(username, uuid);
            if (!projectDir || !fs.existsSync(projectDir)) return { success: true };
            for (const f of ["meta.json", "timeline.json", "casting.json"]) {
                const p = path.join(projectDir, f);
                if (fs.existsSync(p)) fs.rmSync(p, { force: true });
            }
            return { success: true };
        } catch (e) {
            console.error("[project-store:delete] Lỗi:", e);
            return { success: false, error: e.message };
        }
    });

    // Migration 1 lần: nhận dữ liệu từ session IndexedDB (trước khi bị trim) và ghi xuống đĩa
    ipcMain.handle("project-store:migrate", async (event, payload) => {
        try {
            const { username, projects } = payload || {};
            if (!Array.isArray(projects)) return { success: false, error: "Thiếu projects" };
            let migrated = 0;
            for (const p of projects) {
                if (!p || !p.uuid) continue;
                const projectDir = getProjectDir(username, p.uuid);
                if (!projectDir) continue;
                fs.mkdirSync(projectDir, { recursive: true });
                if (p.meta && typeof p.meta === "object" && !fs.existsSync(path.join(projectDir, "meta.json"))) {
                    atomicWriteJson(path.join(projectDir, "meta.json"), stripBinaryFields(p.meta));
                }
                if (p.timeline && typeof p.timeline === "object" && !fs.existsSync(path.join(projectDir, "timeline.json"))) {
                    atomicWriteJson(path.join(projectDir, "timeline.json"), stripBinaryFields(p.timeline));
                }
                if (Array.isArray(p.casting) && !fs.existsSync(path.join(projectDir, "casting.json"))) {
                    atomicWriteJson(path.join(projectDir, "casting.json"), stripBinaryFields(p.casting));
                }
                migrated++;
            }
            return { success: true, migrated };
        } catch (e) {
            console.error("[project-store:migrate] Lỗi:", e);
            return { success: false, error: e.message };
        }
    });
}

module.exports = { registerProjectStoreHandlers };
