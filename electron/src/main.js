const { autoUpdater } = require("electron-updater");
const dns = require("dns");
try {
    dns.setServers(["1.1.1.1", "8.8.8.8", "1.0.0.1", "8.8.4.4"]);
} catch (e) {}
const {
    app,
    protocol,
    BrowserWindow,
    Menu,
    globalShortcut,
    screen,
    session,
    ipcMain,
    dialog, // <--- Thêm cái này vào
    Notification,
    desktopCapturer,
    net,
    safeStorage,
    shell
} = require("electron");

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-setuid-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

const { registerExportImportHandlers } = require("./export-import-project");
const { registerLocalArticlesHandlers } = require("./local-articles");
const { registerProfileHandlers } = require("./local-profiles");
const { registerFontsHandlers } = require("./fonts");
const { registerOperaCodecHandlers } = require("./opera-codec");
const { initDatabase } = require("./database");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { exec, execFile, spawn, execSync } = require("child_process");
const os = require("os");
const path = require("path");
const http = require("http");
const semver = require("semver");
const fs = require("fs");

// Bắt phím tắt nội bộ thay vì globalShortcut để tránh xung đột với hệ đi?u hành và app khác
app.on('web-contents-created', (e, webContents) => {
    webContents.on('before-input-event', (event, input) => {
        if (!app.isPackaged) {
            // DevTools
            if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
                webContents.toggleDevTools();
                event.preventDefault();
            }
            if (input.key === 'F12') {
                webContents.toggleDevTools();
                event.preventDefault();
            }
        }
        
        // Reload - Cho phép chạy trên cả môi trường Dev và Production
        if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {
            const url = webContents.getURL();
            if (url.startsWith('file://')) {
                const hashMatch = url.match(/#.*$/);
                const hash = hashMatch ? hashMatch[0].substring(1) : '';
                mainWindow.loadFile(path.join(__dirname, "..", "fallback", "index.html"), { hash });
            } else {
                webContents.reload();
            }
            event.preventDefault();
        }
        if (input.key === 'F5') {
            const url = webContents.getURL();
            if (url.startsWith('file://')) {
                const hashMatch = url.match(/#.*$/);
                const hash = hashMatch ? hashMatch[0].substring(1) : '';
                mainWindow.loadFile(path.join(__dirname, "..", "fallback", "index.html"), { hash });
            } else {
                webContents.reload();
            }
            event.preventDefault();
        }
    });

    // Context menu mặc định đã được vô hiệu hóa theo yêu cầu
    webContents.on('context-menu', (event, params) => {
        // Không hiển thị menu popup chuột phải
    });
});

protocol.registerSchemesAsPrivileged([
    {
        scheme: 'mediacors',
        privileges: {
            supportFetchAPI: true,
            bypassCSP: true,
            corsEnabled: true
        }
    },
    {
        scheme: 'media',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            bypassCSP: true
        }
    }
]);

// C�? xác định có đang ở chế độ dev hay không
const express = require("express");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-extra");
const https = require("https");
const crypto = require("crypto");
const WebSocket = require("ws");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const util = require('util');
const execPromise = util.promisify(require('child_process').exec);

const { google } = require("googleapis");
const { OAuth2Client, GoogleAuth } = require("google-auth-library");
const { version } = require("./../package.json"); // Lấy version từ file package.json

// Không set cứng User Agent ở đây nữa, sẽ tự động bóc tách từ Chromium gốc ở bước khi App đã Ready

let serviceProcess = null;
const uploadsDir = path.join(app.getPath('userData'), 'uploads');

// Tạo thư mục nếu nó chưa tồn tại
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}



// =====================================================================
// Google Ads Keyword Planner IPC (ads:keywordIdeas)
// =====================================================================
const ADS_CLIENT_ID =
    process.env.ADS_CLIENT_ID ||
    "90514980593-9tqqkt4eobhee5aqrft3f6s5mpkakbp0.apps.googleusercontent.com";
const ADS_CLIENT_SECRET =
    process.env.ADS_CLIENT_SECRET || "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";
const ADS_DEVELOPER_TOKEN =
    process.env.ADS_DEVELOPER_TOKEN || "OsRSnxr4OiG6bfuG0RqVtw";
const ADS_REFRESH_TOKEN =
    process.env.ADS_REFRESH_TOKEN ||
    "1//0g2m3ngcIRj1zCgYIARAAGBASNwF-L9Irbur0YDEMdc0wcZ65b0gxav-3MUFMhqRKkAux2N0yIoGt60mNzTGqAJJrjSNYJIYPX4k";
const ADS_CUSTOMER_ID = process.env.ADS_CUSTOMER_ID || "6453144045";

let adsOauthClient = null;
if (ADS_CLIENT_ID && ADS_CLIENT_SECRET && ADS_REFRESH_TOKEN) {
    adsOauthClient = new OAuth2Client(
        ADS_CLIENT_ID,
        ADS_CLIENT_SECRET,
        "urn:ietf:wg:oauth:2.0:oob",
    );
    adsOauthClient.setCredentials({ refresh_token: ADS_REFRESH_TOKEN });
}

// ==== QUẢN LÝ BINARIES (FFmpeg, YT-DLP, Edge-TTS, Type...) ====
const binaries = {
    ffmpeg: null,
    ytdlp: null,
    edgeTts: null,
    typeLite: null,
    downloader: null
};

function loadBinaries() {
    const isWin = process.platform === "win32";
    const isMac = process.platform === "darwin";
    let results = [];
    let hasError = false;

    const getPath = (winName, macName, linuxName, label) => {
        let fileName = winName;
        if (isMac) fileName = macName;
        else if (!isWin && !isMac) fileName = linuxName; // For Linux and others
        
        let binPath = "";

        if (app.isPackaged) {
            // Khi đã đóng gói, file nằm thẳng trong thư mục resources
            binPath = path.join(process.resourcesPath, fileName);
        } else {
            // Khi chạy DEV (npm start)
            binPath = path.resolve(__dirname, "..", fileName);
        }

        if (fs.existsSync(binPath)) {
            if (!isWin) {
                try { fs.chmodSync(binPath, "755"); } catch (e) { }
            }
            return binPath;
        } else {
            hasError = true;
            results.push(`🔸 ${label}: KHÔNG TÌM THẤY tại ${binPath}`);
            return null;
        }
    };

    binaries.ffmpeg = getPath("ffmpeg-win.exe", "ffmpeg-macos", "ffmpeg-linux", "FFmpeg");
    binaries.ytdlp = getPath("yt-dlp-win.exe", "yt-dlp-macos", "yt-dlp-linux", "Youtube-DL");
    binaries.edgeTts = getPath("edge-tts-win.exe", "edge-tts-macos", "edge-tts-linux", "Edge-TTS");

    if (hasError) {
        dialog.showMessageBox({
            type: 'error',
            title: 'Lỗi Hệ Thống',
            message: 'Phát hiện thiếu file thực thi quan trọng!',
            detail: results.join("\n"),
            buttons: ['OK']
        });
    }
}

function sendNotification(title, body) {
    // Kiểm tra xem hệ thống có hỗ trợ thông báo không
    if (Notification.isSupported()) {
        new Notification({
            title: title,
            body: body,
            // icon: path.join(__dirname, 'assets/icon.png') // Thêm icon nếu muốn
        }).show();
    } else {
        // Fallback sang log nếu không hỗ trợ
        console.log(`[Notification]: ${title} - ${body}`);
    }
}

async function googleAdsGenerateKeywordIdeas({
    keywordText,
    customerId,
    language,
    geoTargetConstants,
}) {
    if (!adsOauthClient) {
        throw new Error(
            "Chưa cấu hình ADS_CLIENT_ID / ADS_CLIENT_SECRET / ADS_REFRESH_TOKEN",
        );
    }
    if (!ADS_DEVELOPER_TOKEN) {
        throw new Error("Chưa cấu hình ADS_DEVELOPER_TOKEN");
    }
    if (!customerId) {
        throw new Error("Thiếu ADS_CUSTOMER_ID");
    }
    if (!keywordText) {
        throw new Error("Thiếu keywordText");
    }

    const { token } = await adsOauthClient.getAccessToken();
    if (!token) {
        throw new Error("Không lấy được access token cho Google Ads");
    }

    const postData = JSON.stringify({
        customerId,
        language: language || "languageConstants/1004",
        geoTargetConstants:
            geoTargetConstants && geoTargetConstants.length
                ? geoTargetConstants
                : ["geoTargetConstants/2392"],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        keywordSeed: {
            keywords: [keywordText],
        },
    });

    return await new Promise((resolve, reject) => {
        const req = https.request(
            {
                method: "POST",
                hostname: "googleads.googleapis.com",
                path: `/v16/customers/${customerId}:generateKeywordIdeas`,
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(postData),
                    Authorization: `Bearer ${token}`,
                    "developer-token": ADS_DEVELOPER_TOKEN,
                },
            },
            (res) => {
                let raw = "";
                res.on("data", (chunk) => (raw += chunk.toString()));
                res.on("end", () => {
                    if (!raw) {
                        return reject(
                            new Error(
                                `Google Ads API trả v�? body rỗng (status ${res.statusCode})`,
                            ),
                        );
                    }

                    const contentType = (
                        res.headers["content-type"] || ""
                    ).toLowerCase();

                    if (!contentType.includes("application/json")) {
                        return reject(
                            new Error(
                                `Google Ads API trả v�? nội dung không phải JSON (status ${res.statusCode}). ` +
                                `Có thể Developer Token / tài khoản chưa được bật API. Preview: ${raw.slice(0, 200)}`,
                            ),
                        );
                    }

                    try {
                        const json = JSON.parse(raw);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(json);
                        } else {
                            reject(
                                new Error(
                                    json.error?.message ||
                                    `Google Ads API Error ${res.statusCode}`,
                                ),
                            );
                        }
                    } catch (e) {
                        reject(
                            new Error(
                                `Không parse được JSON từ Google Ads API (status ${res.statusCode}). Body: ${raw.slice(0, 200)}`,
                            ),
                        );
                    }
                });
            },
        );

        req.on("error", (err) => reject(err));
        req.write(postData);
        req.end();
    });
}

function startGoService() {
    const isPackaged = app.isPackaged;
    const platform = process.platform; // 'darwin' cho macOS, 'win32' cho Windows

    // Xác định tên file dựa trên OS
    const binName =
        platform === "win32" ? "gologin-core-win.exe" : "gologin-core-macos";

    // �?ư�?ng dẫn linh hoạt: dev lùi ra ngoài src/, packaged lấy từ Resources
    const binPath = isPackaged
        ? path.join(process.resourcesPath, binName)
        : path.join(__dirname, "..", "services", binName);

    sendToRenderer("tools-log", `[DEBUG]: Khởi chạy core tại ${binPath}`);

    if (!fs.existsSync(binPath)) {
        sendToRenderer(
            "tools-log",
            `[ERROR]: Không tìm thấy binary: ${binName}`,
        );
        return;
    }

    // Cấp quy�?n thực thi (chỉ cần thiết cho macOS)
    if (platform !== "win32") {
        try {
            fs.chmodSync(binPath, "755");
        } catch (e) {
            console.error("Lỗi cấp quy�?n macOS:", e);
        }
    }

    // Khởi chạy tiến trình
    serviceProcess = spawn(binPath, [], {
        cwd: path.dirname(binPath),
        stdio: ["inherit", "pipe", "pipe"],
    });

    serviceProcess.stdout.on("data", (data) => {
        const msg = data.toString();
        sendToRenderer("tools-log", `[CORE]: ${msg}`);
        if (msg.includes("GO-SERVICE-READY")) {
            sendToRenderer("tools-log", `[SYSTEM]: Core Engine đã sẵn sàng.`);
        }
    });

    serviceProcess.stderr.on("data", (data) => {
        sendToRenderer("tools-log", `[CORE-ERROR]: ${data.toString()}`);
    });
}

// ================= DOWNLOAD CORE =================

// Cập nhật hàm phụ này để đoán đuôi file chính xác
function inferExtFromUrl(url) {
    try {
        const u = new URL(url);
        // Kiểm tra link video Capcut/Dreamina
        if (u.href.includes('video/tos') || u.href.includes('mime_type=video_mp4')) {
            return '.mp4';
        }

        // Logic cũ của bạn cho ảnh
        const base = path.basename(u.pathname);
        const m = base.match(/\.(webp|jpg|jpeg|png|gif|avif|mp4)$/i);
        if (m) return "." + m[1].toLowerCase();
    } catch { }
    return ".jpg";
}

// 2. Hàm download giữ nguyên tên, nhưng xử lý được m�?i loại file binary
function downloadImage(url, outDir, filenamePrefix = "dreamina_") {
    return new Promise(async (resolve, reject) => {
        try {
            await fs.promises.mkdir(outDir, { recursive: true });

            // Logic nhận diện đuôi file mở rộng
            let ext = ".jpg";
            try {
                const u = new URL(url);
                // Kiểm tra nếu là link video từ Capcut/Dreamina
                if (u.href.includes('mime_type=video_mp4') || u.pathname.endsWith('.mp4')) {
                    ext = '.mp4';
                } else {
                    // Dùng hàm infer của bạn cho các trư�?ng hợp ảnh
                    ext = inferExtFromUrl(url);
                }
            } catch (e) {
                ext = ".jpg";
            }

            const hash = crypto.createHash("md5").update(url).digest("hex").slice(0, 10);
            const filename = `${filenamePrefix}${Date.now()}_${hash}${ext}`;
            const outPath = path.join(outDir, filename);

            const req = https.get(
                url,
                {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                        "Referer": "https://dreamina.capcut.com/",
                    },
                },
                (res) => {
                    // Xử lý Redirect (nếu có)
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        https.get(res.headers.location, (r2) => {
                            const ws = fs.createWriteStream(outPath);
                            r2.pipe(ws);
                            ws.on("finish", () => resolve(outPath));
                        }).on("error", reject);
                        return;
                    }

                    if (res.statusCode !== 200) {
                        return reject(new Error(`HTTP ${res.statusCode}`));
                    }

                    const ws = fs.createWriteStream(outPath);
                    res.pipe(ws);
                    ws.on("finish", () => resolve(outPath));
                    ws.on("error", reject);
                }
            );
            req.on("error", reject);
        } catch (e) {
            reject(e);
        }
    });
}

// ================= DREAMINA ENTRY (AUTO DOWNLOAD) =================
// FULL CODE hàm createImageByDreamina (giữ nguyên tên)
function createImageByDreamina(_targetUrlWithUniqueID, uniqueID, options = {}) {
    const outDir = options.outDir || path.join(app.getPath("pictures"), "Dreamina");
    const maxImages = Number.isFinite(options.maxImages) ? options.maxImages : 100;
    const filenamePrefix = options.filenamePrefix || "dreamina_";

    if (!targetWindow || targetWindow.isDestroyed()) return;

    // --- Tự động Paste Prompt ---
    if (options.prompt) {
        const safePrompt = options.prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        targetWindow.webContents.executeJavaScript(`
            setTimeout(() => {
                const editor = document.querySelector('rich-textarea') || document.querySelector('p[data-placeholder]')?.parentElement || document.querySelector('div[contenteditable="true"]');
                if (editor) {
                    editor.focus();
                    document.execCommand('insertText', false, \`${safePrompt}\`);
                    
                    // Thử tìm nút Send và ấn tự động luôn sau 1 giây
                    setTimeout(() => {
                        const sendBtn = document.querySelector('button[aria-label*="Send message"], button[aria-label*="Gửi tin nhắn"], button.send-button');
                        if (sendBtn && !sendBtn.disabled) sendBtn.click();
                    }, 1000);
                }
            }, 3000);
        `).catch(err => console.log('Auto-paste prompt error:', err.message));
    }
    // ----------------------------

    const seen = new Set();
    let saved = 0;

    const onFound = async (_evt, payload) => {
        const src = payload?.src;
        if (!src || seen.has(src) || saved >= maxImages) return;
        seen.add(src);

        try {
            // downloadImage sẽ tự dùng inferExtFromUrl để lưu .mp4 hoặc .jpg
            const p = await downloadImage(src, outDir, filenamePrefix);
            saved += 1;

            const isVid = p.toLowerCase().endsWith('.mp4');
            sendToRenderer("tools-log", `[Dreamina] ${isVid ? '🎬 Video' : '✅ Ảnh'} đã tải: ${path.basename(p)}`);

            // Gửi action dreamina-downloaded để Renderer gắn ngược lại chương trình
            _evt.reply("tools-response", { action: "dreamina-downloaded", file: p, isVid });
        } catch (e) {
            sendToRenderer("tools-log", `[Dreamina] �?� Lỗi: ${e.message}`);
        }
    };

    ipcMain.on("dreamina:image-found", onFound);
    ipcMain.on("dreamina:debug", (_evt, msg) => sendToRenderer("tools-log", String(msg)));

    targetWindow.once("closed", () => {
        ipcMain.removeListener("dreamina:image-found", onFound);
    });
}

// Hàm dùng để set cookie vào session
async function setFacebookCookiesFromFile(cookieFilePath) {
    if (!fs.existsSync(cookieFilePath)) return false;
    const cookies = JSON.parse(fs.readFileSync(cookieFilePath, "utf-8"));

    for (const cookie of cookies) {
        // Bắt buộc có url khi set cookie cho Electron
        let url = "";

        if (cookie.secure) {
            url = `https://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
        } else {
            url = `http://${cookie.domain.replace(/^\./, "")}${cookie.path}`;
        }

        try {
            await session.defaultSession.cookies.set({
                url,
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                expirationDate: cookie.expires > 0 ? cookie.expires : undefined,
                sameSite: cookie.sameSite,
            });
        } catch (err) {
            console.log(`Set cookie ${cookie.name} lỗi:`, err.message);
        }
    }
    return true;
}

// ==== SCREENSHOT ====
async function captureOnlyTargetWindow(targetUrlWithUniqueID, uniqueID) {
    try {
        sendToRenderer("tools-log", "[Screenshot] Bắt đầu...");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const screenshotPath = path.join(
            documentsDir,
            `screenshot-${timestamp}.png`,
        );

        sendToRenderer(
            "tools-log",
            "[Screenshot] �?ang fetch Chrome remote debug...",
        );

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        sendToRenderer("tools-log", "[Screenshot] Puppeteer đã connect.");

        const pages = await browser.pages();
        sendToRenderer("tools-log", `[Screenshot] Có ${pages.length} page.`);

        let matchedPage = null;
        for (const page of pages) {
            const pageUrl = page.url();
            sendToRenderer("tools-log", `[Screenshot] Page URL: ${pageUrl}`);
            if (pageUrl.includes(`uniqueID=${uniqueID}`)) {
                matchedPage = page;
                break;
            }
        }

        if (!matchedPage) {
            sendToRenderer(
                "tools-log",
                `[Screenshot] �?� Không tìm thấy page có uniqueID=${uniqueID}`,
            );
            await browser.disconnect();
            return;
        }

        await matchedPage.screenshot({
            path: screenshotPath,
            fullPage: true,
        });

        sendToRenderer(
            "tools-log",
            `[Screenshot] ✅ �?ã chụp ảnh: ${screenshotPath}`,
        );

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer(
            "tools-log",
            `[Screenshot] �?� Lỗi khi chụp ảnh: ${err.message}`,
        );
        if (targetWindow) targetWindow.close();
    }
}

async function getFacebookCookies(uniqueID, event) {
    try {
        sendToRenderer(
            "tools-log",
            `[FB-GetCookie] �?ang tìm page với uniqueID=${uniqueID}...`,
        );

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        const pages = await browser.pages();
        let matchedPage = null;

        for (const page of pages) {
            const pageUrl = page.url();
            if (pageUrl.includes(`uniqueID=${uniqueID}`)) {
                matchedPage = page;
                break;
            }
        }

        if (!matchedPage) {
            sendToRenderer(
                "tools-log",
                `[FB-GetCookie] �?� Không tìm thấy page có uniqueID=${uniqueID}`,
            );
            event.reply("tools-response", {
                error: `Không tìm thấy tab đăng nhập Facebook!`,
            });
            await browser.disconnect();
            return;
        }

        const cookies = await matchedPage.cookies();
        // Lưu file vào Documents
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const cookiePath = path.join(
            documentsDir,
            `fb-cookies-${timestamp}.json`,
        );
        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), "utf-8");

        sendToRenderer(
            "tools-log",
            `[FB-GetCookie] �?ã lưu cookies vào: ${cookiePath}`,
        );

        // Trả cookie v�? UI
        event.reply("tools-response", {
            action: "get-facebook-cookies",
            success: true,
            cookies,
            file: cookiePath,
        });

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer("tools-log", `[FB-GetCookie] �?� Lỗi: ${err.message}`);
        event.reply("tools-response", { error: err.message });
        if (targetWindow) targetWindow.close();
    }
}

async function connectApps(targetUrlWithUniqueID, uniqueID) {
    try {
        sendToRenderer("tools-log", "[FB-Login] Bắt đầu...");

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        sendToRenderer("tools-log", "[FB-Login] Puppeteer đã connect.");

        const pages = await browser.pages();
        sendToRenderer("tools-log", `[FB-Login] Có ${pages.length} page.`);

        let matchedPage = null;
        for (const page of pages) {
            const pageUrl = page.url();

            sendToRenderer("tools-log", `[FB-Login] Page URL: ${pageUrl}`);

            if (pageUrl.includes(`uniqueID=${uniqueID}`)) {
                matchedPage = page;
                break;
            }
        }

        if (!matchedPage) {
            sendToRenderer(
                "tools-log",
                `[FB-Login] �?� Không tìm thấy page có uniqueID=${uniqueID}`,
            );
            await browser.disconnect();
            return;
        }

        sendToRenderer(
            "tools-log",
            `[FB-Login] �?ã tìm thấy tab Facebook cần đăng nhập!`,
        );

        // Tùy mục tiêu, ví dụ: lấy cookie sau khi user tự login
        // Ch�? user login, bạn có thể ch�? đến khi url đổi sang https://www.facebook.com/?sk=welcome hoặc cookie đầy đủ
        // Ở đây mình lấy cookies luôn sau 20s (hoặc bạn có thể trigger bằng nút trên giao diện, hoặc logic thông minh hơn)
        setTimeout(async () => {
            const cookies = await matchedPage.cookies();
            sendToRenderer(
                "tools-log",
                `[FB-Login] Cookie sau login: ${JSON.stringify(cookies)}`,
            );
            // Bạn có thể lưu cookies vào file hoặc gửi trả v�? renderer nếu cần
            await browser.disconnect();
            if (targetWindow) targetWindow.close();
        }, 200000); // ch�? 200s, tuỳ ý
    } catch (err) {
        sendToRenderer("tools-log", `[FB-Login] �?� Lỗi: ${err.message}`);
        if (targetWindow) targetWindow.close();
    }
}

async function websiteCrawl(
    targetUrlWithUniqueID,
    uniqueID,
    selector = [],
    model,
) {
    try {
        sendToRenderer("tools-log", "[Website-Crawl] Bắt đầu...");

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        const pages = await browser.pages();
        const matchedPage = pages.find((page) =>
            page.url().includes(`uniqueID=${uniqueID}`),
        );

        if (!matchedPage) {
            sendToRenderer(
                "tools-log",
                `[Website-Crawl] �?� Không tìm thấy tab có uniqueID=${uniqueID}`,
            );
            await browser.disconnect();
            return;
        }

        const html = await matchedPage.content();
        const results = await Promise.all(
            selector.map(async (item) => {
                try {
                    const res = await parseSelector({
                        instruction: item.value,
                        html,
                        model,
                    });
                    return { key: item.key, value: res.value };
                } catch (err) {
                    sendToRenderer(
                        "tools-log",
                        `[Gemini] �?� Lỗi xử lý "${item.key}": ${err.message}`,
                    );
                    return { key: item.key, value: "" };
                }
            }),
        );

        const data = {};
        results.forEach(({ key, value }) => {
            data[key] = value;
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const jsonPath = path.join(
            documentsDir,
            `website-crawled-${timestamp}.json`,
        );

        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
        sendToRenderer("tools-log", `✅ �?ã lưu dữ liệu JSON: ${jsonPath}`);

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer("tools-log", `[Website-Crawl] �?� Lỗi: ${err.message}`);
        if (targetWindow) targetWindow.close();
    }
}

function extractFacebookPostsFromHTML(html, facegroup, storySelector, postContainerSelector, profileNameSelector, seeMoreText) {
    if (!html) return [];
    const $ = cheerio.load(html);
    const results = [];

    $(postContainerSelector).each((index, element) => {
        const post = $(element);

        // --- 1. LẤY MẢNG HREF & LỌC THỜI GIAN ---
        let postUrls = [];
        let timeText = "";

        post.find('a[role="link"]').each((i, el) => {
            const txt = $(el).text().toLowerCase();
            const href = $(el).attr('href');

            if (href && href !== '#' && !href.startsWith('mailto:')) {
                const fullHref = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
                postUrls.push(fullHref);
            }

            if (/(vừa xong|just now|hôm qua|yesterday)/i.test(txt) || /\d+\s*(phút|gi�?|ngày|tháng|năm|m|h|d|y|hr|hrs|mins|thg|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(txt)) {
                timeText = txt;
            }
        });

        if (!timeText) timeText = "Unknown time";
        postUrls = [...new Set(postUrls)];

        // --- 2. LẤY T�?C GIẢ ---
        let authorName = "N/A";
        let authorLink = "";
        const profileContainer = post.find(`[${profileNameSelector}]`);
        if (profileContainer.length) {
            const aTag = profileContainer.find('a[role="link"]').first();
            if (aTag.length) {
                authorName = aTag.text().trim();
                let href = aTag.attr('href');
                if (href) {
                    authorLink = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
                }
            }
        }

        // --- 3. LẤY NỘI DUNG VĂN BẢN (TEXT) ---
        const contentEl = post.find(`[${storySelector}]`);
        const content = contentEl.text().trim();

        // Kiểm tra bung "Xem thêm"
        if (content.includes(seeMoreText)) return;

        // --- 4. HÌNH ẢNH (IMAGES) ---
        const images = [];
        post.find('img').each((i, img) => {
            const src = $(img).attr('src');
            const alt = $(img).attr('alt') || "";
            if (src && src.includes('https://scontent') && !alt.toLowerCase().includes('hồ sơ') && !alt.toLowerCase().includes('profile')) {
                images.push(src);
            }
        });

        const finalImages = [...new Set(images)];

        // --- �?IỀU KIỆN MỚI: BỎ QUA NẾU KHÔNG CÓ TEXT VÀ KHÔNG CÓ ẢNH ---
        if (!content && finalImages.length === 0) {
            return; // B�? qua bài post "trống" (chỉ có video hoặc chỉ có sticker/link)
        }

        // --- 5. VIDEO LINK ---
        let videoUrl = post.find('a[href*="/videos/"], a[href*="/watch/"]').first().attr('href') || null;
        if (videoUrl && !videoUrl.startsWith('http')) videoUrl = `https://www.facebook.com${videoUrl}`;

        // --- 6. TƯƠNG T�?C ---
        const reactions = post.find('[aria-label*="cảm xúc"], [aria-label*="reactions"]').attr('aria-label') || "0";
        let commentCount = "0", shareCount = "0";
        post.find('div[role="button"]').each((i, btn) => {
            const txt = $(btn).text().toLowerCase();
            if (txt.includes('bình luận')) commentCount = txt.replace(/[^0-9kK]/g, '');
            if (txt.includes('chia sẻ')) shareCount = txt.replace(/[^0-9kK]/g, '');
        });

        results.push({
            facegroup,
            href: postUrls,
            author: { name: authorName, link: authorLink },
            time: timeText,
            text: content,
            images: finalImages,
            video: videoUrl,
            reactions: reactions,
            commentCount,
            shareCount,
            used: 0,
            uuid: new Date().getTime()
        });
    });

    return results;
}
async function downloadFacebookImage(url, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    const filename = "fb_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5) + ".jpg";
    const destPath = path.join(destDir, filename);

    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                return resolve(url);
            }
            const file = fs.createWriteStream(destPath);
            res.pipe(file);
            file.on('finish', () => {
                file.close(() => resolve(`http://localhost:${fallbackPort}/data/facebook/${filename}`));
            });
            file.on('error', () => {
                fs.unlink(destPath, () => {});
                resolve(url);
            });
        }).on('error', () => resolve(url));
    });
}

async function facebookCrawl(args) {
    const {
        uniqueID, facegroup, maxPosts,
        storySelector, postContainerSelector, profileNameSelector,
        seeMoreSelector, seeMoreText
    } = args;

    let browser = null;
    let allPosts = [];
    let seenIds = new Set();
    let count = 0;

    try {
        sendToRenderer("tools-log", "[FB-Crawl] 🚀 Khởi động trình quét...");

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        let facebookPage = null;
        let retries = 15;
        while (retries > 0 && !facebookPage) {
            const targets = await browser.targets();
            const target = targets.find((t) => t.url().includes(`uniqueID=${uniqueID}`) || (args.useWebview && t.url().includes('facebook.com')));

            if (target) {
                facebookPage = await target.page();
            }

            if (facebookPage) break;

            sendToRenderer("tools-log", `�?� �?ang đợi tab Facebook mở... (${retries}s)`);
            await new Promise(r => setTimeout(r, 2000));
            retries--;
        }

        if (!facebookPage) {
            sendToRenderer("tools-log", "�?� Không tìm thấy tab Facebook.");
            return;
        }

        try {
            await facebookPage.bringToFront();
        } catch (e) {
            // Có thể b�? qua nếu là webview không hỗ trợ bringToFront
        }

        let noNewPostLoops = 0;
        let previousPostCount = 0;

        while (allPosts.length < maxPosts && count < 1000) {
            count++;
            // If using targetWindow and it's closed, stop. But for webview, targetWindow might be null, so check !useWebview.
            if (!args.useWebview && (!targetWindow || targetWindow.isDestroyed())) break;

            await facebookPage.evaluate(() => window.scrollBy(0, 2000));
            await new Promise(r => setTimeout(r, 3000));

            // Click Xem thêm
            await facebookPage.evaluate(async (sel, txt) => {
                const btns = Array.from(document.querySelectorAll(sel));
                for (const btn of btns) {
                    if (btn.innerText.includes(txt)) {
                        btn.scrollIntoView();
                        btn.click();
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }, seeMoreSelector, seeMoreText).catch(() => { });

            await new Promise(r => setTimeout(r, 1500));

            const html = await facebookPage.content();
            const matches = extractFacebookPostsFromHTML(
                html,
                facegroup,
                storySelector,
                postContainerSelector,
                profileNameSelector,
                seeMoreText
            );

            for (const post of matches) {
                const primaryUrl = post.href.find(u => u.includes('/posts/') || u.includes('/groups/')) || post.href[0];
                const key = primaryUrl || post.text.substring(0, 100);

                if (key && !seenIds.has(key)) {
                    seenIds.add(key);

                    const dataPath = path.join(os.homedir(), "Documents", "ai.type", "data", "facebook");
                    const newImages = [];
                    for (const img of post.images) {
                        try {
                            const newImg = await downloadFacebookImage(img, dataPath);
                            newImages.push(newImg);
                        } catch(e) {
                            newImages.push(img);
                        }
                    }
                    post.images = newImages;

                    allPosts.push(post);
                    sendToRenderer("tools-log", `[FB-Crawl] ✅ �?ã lấy: ${post.author.name} (${post.images.length} ảnh)`);

                    // Phát luồng trực tiếp v�? frontend
                    sendToRenderer("tools-response", {
                        action: "facebook-crawl-stream",
                        success: true,
                        posts: [post]
                    });
                }
                if (allPosts.length >= maxPosts) break;
            }

            // Kiểm tra tiến độ để tránh vòng lặp vô hạn
            if (allPosts.length === previousPostCount) {
                noNewPostLoops++;
            } else {
                noNewPostLoops = 0;
            }
            previousPostCount = allPosts.length;

            if (noNewPostLoops >= 5) {
                sendToRenderer("tools-log", `[FB-Crawl] ⚠�? Không tìm thấy bài đăng mới sau nhi�?u lần cuộn. Dừng quét tại ${allPosts.length} bài.`);
                break;
            }

            if (allPosts.length >= maxPosts) break;
        }

        sendToRenderer("tools-response", {
            action: "facebook-crawl",
            success: true,
            posts: allPosts.slice(0, maxPosts),
        });

        if (browser) await browser.disconnect();
        if (!args.useWebview && targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.close();
        }
    } catch (err) {
        sendToRenderer("tools-log", `�?� Lỗi: ${err.message}`);
        if (browser) await browser.disconnect();
    }
}

// ==== FALLBACK SERVER ====
function startFallbackServer() {
    const fallbackApp = express();
    fallbackApp.use((req, res, next) => {
        res.header("Access-Control-Allow-Origin", "*");
        next();
    });
    const fallbackPath = path.resolve(__dirname, "..", "fallback");
    fallbackApp.use(express.static(fallbackPath));
    const dataPath = path.join(os.homedir(), "Documents", "ai.type", "data");
    fallbackApp.use('/data', express.static(dataPath));
    const server = fallbackApp.listen(fallbackPort, () => {
        sendToRenderer(
            "tools-log",
            `[✓] Fallback server chạy tại http://localhost:${fallbackPort}`,
        );
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[Fallback] Cổng ${fallbackPort} đang bận, thử d�?n dẹp...`);
            killPort(fallbackPort);
            setTimeout(() => {
                server.close();
                server.listen(fallbackPort);
            }, 1000);
        }
    });
}

puppeteer.use(StealthPlugin());
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Có ngư�?i dùng mở thêm app, focus vào cửa sổ hiện tại
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.commandLine.appendSwitch("remote-debugging-port", "9999"); // BẮT BUỘC cho puppeteer.connect()
app.commandLine.appendSwitch("log-level", "3"); // Tắt các cảnh báo không cần thiết của Chromium DevTools (Autofill.enable, ...)

// Thêm util này gần đầu file:
const fileExists = (p) => {
    try {
        return fs.existsSync(p);
    } catch {
        return false;
    }
};

// ==== PATH CONFIG ====
const documentsDir = path.join(os.homedir(), "Documents");
const fallbackPort = 5454;

let mainWindow;
let secondaryWindow = null;
let targetWindow = null;
let downloaderProcess = null;
let typeProcess = null;

// ====== GOOGLE SEARCH CONSOLE OAUTH CONFIG ======
const SCOPES_GSC = ["https://www.googleapis.com/auth/webmasters.readonly"];

// TODO: thay bằng thông tin real của OAuth Desktop App (Google Cloud Console)
const GSC_CLIENT_ID =
    "90514980593-9tqqkt4eobhee5aqrft3f6s5mpkakbp0.apps.googleusercontent.com";
const GSC_CLIENT_SECRET = "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";
const GSC_REDIRECT_URI = "http://localhost/google"; // redirect mặc định cho Desktop App

// Lưu token vào thư mục userData của Electron
const TOKEN_GSC_PATH = path.join(app.getPath("userData"), "gsc-token.json");

const gscOauth2Client = new google.auth.OAuth2(
    GSC_CLIENT_ID,
    GSC_CLIENT_SECRET,
    GSC_REDIRECT_URI,
);

function gscLoadTokenIfExists() {
    try {
        if (fs.existsSync(TOKEN_GSC_PATH)) {
            const raw = fs.readFileSync(TOKEN_GSC_PATH, "utf-8");
            const tokens = JSON.parse(raw);
            gscOauth2Client.setCredentials(tokens);
        }
    } catch (e) {
        sendToRenderer("tools-log", `[GSC] Lỗi load token: ${e.message}`);
    }
}

function gscSaveToken(tokens) {
    try {
        fs.writeFileSync(
            TOKEN_GSC_PATH,
            JSON.stringify(tokens, null, 2),
            "utf-8",
        );
        sendToRenderer("tools-log", `[GSC] �?ã lưu token vào ${TOKEN_GSC_PATH}`);
    } catch (e) {
        sendToRenderer("tools-log", `[GSC] Lỗi lưu token: ${e.message}`);
    }
}

function getAuthHtml(title, message, isSuccess) {
    const color = isSuccess ? '#10b981' : '#ef4444';
    const bgColor = isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const icon = isSuccess
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    return `<!DOCTYPE html>
    <html lang="vi">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
            body {
                margin: 0; padding: 0; font-family: 'Inter', sans-serif;
                background-color: #0f172a; color: #f8fafc;
                display: flex; align-items: center; justify-content: center;
                height: 100vh; overflow: hidden;
            }
            .glass-panel {
                background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px;
                padding: 48px; max-width: 420px; width: 100%; text-align: center;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                transform: translateY(20px); opacity: 0;
                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .icon-wrapper {
                width: 80px; height: 80px; margin: 0 auto 24px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                background-color: ${bgColor}; color: ${color};
                box-shadow: 0 0 20px ${isSuccess ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
                animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s forwards;
                transform: scale(0);
            }
            h1 { margin: 0 0 12px; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; }
            p { margin: 0 0 32px; font-size: 15px; color: #94a3b8; line-height: 1.6; }
            .btn {
                background: ${isSuccess ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'};
                color: white; border: none; padding: 14px 28px; border-radius: 12px;
                font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;
                box-shadow: 0 4px 14px ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}; width: 100%;
            }
            .btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px ${isSuccess ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; }
            @keyframes slideUp { to { transform: translateY(0); opacity: 1; } }
            @keyframes scaleIn { to { transform: scale(1); } }
        </style>
    </head>
    <body>
        <div class="glass-panel">
            <div class="icon-wrapper">${icon}</div>
            <h1>${title}</h1>
            <p>${message}</p>
            <button class="btn" onclick="window.close()">Đóng cửa sổ này</button>
        </div>
        ${isSuccess ? '<script>setTimeout(() => window.close(), 3000);</script>' : ''}
    </body>
    </html>`;
}

// Mở cửa sổ login Google, lấy "code" rồi đổi sang access_token + refresh_token
async function gscDoLogin() {
    return new Promise((resolve, reject) => {
        const { shell } = require('electron');

        const server = http.createServer(async (req, res) => {
            try {
                const urlObj = new URL(req.url, `http://${req.headers.host}`);

                if (urlObj.pathname === '/google') {
                    const code = urlObj.searchParams.get("code");
                    const error = urlObj.searchParams.get("error");

                    if (error) {
                        sendToRenderer("tools-log", `[GSC] Lỗi OAuth: ${error}`);
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(getAuthHtml('Lỗi xác thực', `Quá trình đăng nhập thất bại: ${error}. Vui lòng thử lại.`, false));
                        server.close();
                        reject(new Error(error));
                        return;
                    }

                    if (!code) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(getAuthHtml('Lỗi hệ thống', `Không tìm thấy mã xác thực từ Google trả về.`, false));
                        server.close();
                        reject(new Error("No code in redirect URL"));
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(getAuthHtml('Thành công', 'Quá trình xác thực hoàn tất! Bạn có thể quay lại app ai.type, cửa sổ này sẽ tự đóng lại.', true));
                    server.close();

                    sendToRenderer("tools-log", "[GSC] Nhận code từ trình duyệt chính, đang đổi sang token...");
                    const { tokens } = await gscOauth2Client.getToken(code);
                    gscOauth2Client.setCredentials(tokens);
                    gscSaveToken(tokens);

                    sendToRenderer("tools-log", "[GSC] Đăng nhập thành công, đã lưu token.");
                    resolve();
                } else {
                    res.writeHead(404);
                    res.end();
                }
            } catch (err) {
                res.writeHead(500);
                res.end(`Loi: ${err.message}`);
                server.close();
                reject(err);
            }
        });

        // Lắng nghe ở port cố định 5455 để dễ cấu hình trên Google Cloud Console
        server.listen(5455, '127.0.0.1', () => {
            const redirectUri = `http://localhost:5455/google`;

            // Cập nhật lại redirectUri để Google OAuth cho phép
            gscOauth2Client._clientId = GSC_CLIENT_ID;
            gscOauth2Client._clientSecret = GSC_CLIENT_SECRET;
            gscOauth2Client.redirectUri = redirectUri;

            const authUrl = gscOauth2Client.generateAuthUrl({
                access_type: "offline",
                scope: SCOPES_GSC,
                prompt: "consent",
            });

            sendToRenderer("tools-log", `[GSC] Mở Chrome mặc định: ${authUrl}`);
            shell.openExternal(authUrl);
        });

        server.on('error', (e) => {
            sendToRenderer("tools-log", `[GSC] Lỗi server listen: ${e.message}`);
            reject(e);
        });
    });
}

async function gscEnsureAuthenticated() {
    gscLoadTokenIfExists();
    const creds = gscOauth2Client.credentials;

    if (!creds.access_token && !creds.refresh_token) {
        // Chưa từng login
        await gscDoLogin();
    } else if (creds.refresh_token && !creds.access_token) {
        // Có refresh token nhưng hết access token
        await gscOauth2Client.getAccessToken();
    }
}

// ===== CHROME APP (STT) - CHỈ MỞ DUY NHẤT 1 CỬA SỔ =====
let chromeAppProcess = null;

// WS server cho Chrome app (Angular 17 STT)
let sttWsServer = null;
const sttWsClients = new Set();

async function parseSelector({ instruction, html, model }) {
    const prompt = `Bạn là AI chuyên trích xuất dữ liệu từ HTML theo hướng dẫn. Hãy đ�?c đoạn HTML sau và trích ra dữ liệu theo yêu cầu:

    [INSTRUCTION]
    ${instruction}

    [HTML]
    ${html}

    Trả v�? JSON với 1 key duy nhất là "value", ví dụ: { "value": "Kết quả" }
    Nếu không tìm thấy, trả v�?: { "value": "" }`;

    const result = await model.generateContent(prompt);
    let text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Loại b�? ```json ... ```
    text = text.trim();
    if (text.startsWith("```json")) {
        text = text
            .replace(/^```json\s*/, "")
            .replace(/```$/, "")
            .trim();
    }

    // Loại b�? nếu bị b�?c markdown kiểu khác
    text = text.replace(/^```/, "").replace(/```$/, "").trim();

    // Parse JSON
    try {
        const json = JSON.parse(text);
        return { value: json.value || "" };
    } catch (e) {
        // Nếu parse lỗi thì trả lại nguyên văn (fallback)
        return { value: text };
    }
}

// ==== AUDIO RECORDING TỪ WEBVIEW ====
let audioRecordStream = null;
ipcMain.on('webview-audio-chunk', (event, buffer) => {
    if (!audioRecordStream) {
        const audioPath = path.join(app.getPath('userData'), 'meeting_audio.webm');
        audioRecordStream = fs.createWriteStream(audioPath);
        console.log(`[Audio Recording] Bắt đầu ghi âm lưu tại: ${audioPath}`);
    }
    audioRecordStream.write(buffer);
});


ipcMain.handle('delete-local-file', async (event, filePath) => {
    try {
        if (require('fs').existsSync(filePath)) {
            require('fs').unlinkSync(filePath);
            return { success: true };
        }
        return { success: false, error: 'File not found' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('terminal:get-last-directory', async () => {
    try {
        const candidates = [
            path.join(app.getPath('userData'), 'last_directory.txt'),
            path.join(os.homedir(), '.config', 'AI.Type', 'last_directory.txt'),
            path.join(os.homedir(), 'Documents', 'ai.type', 'last_directory.txt'),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) {
                const dir = fs.readFileSync(p, 'utf-8').trim();
                if (dir && fs.existsSync(dir)) {
                    return { success: true, directory: dir };
                }
            }
        }
        return { success: true, directory: process.cwd() };
    } catch (e) {
        return { success: false, error: e.message, directory: process.cwd() };
    }
});

ipcMain.handle('init-system-audio', () => {
    // Không cần tạo stream nữa vì gửi 1 lần
    return true;
});

ipcMain.handle('save-system-audio', (event, uint8ArrayData) => {
    // Lưu vào Documents\ai.type\data\notes
    const notesDir = path.join(app.getPath('documents'), 'ai.type', 'data', 'notes');
    if (!fs.existsSync(notesDir)) {
        fs.mkdirSync(notesDir, { recursive: true });
    }

    // Tên file có chứa mốc th�?i gian riêng biệt
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const audioPath = path.join(notesDir, `recording_${timestamp}.webm`);

    const buffer = Buffer.from(uint8ArrayData);
    fs.writeFileSync(audioPath, buffer);
    console.log(`[Audio Recording] �?ã lưu file âm thanh hoàn chỉnh tại: ${audioPath}`);
    return audioPath;
});

ipcMain.handle('transcribe-system-audio', async (event, payload) => {
    const { apiKey, audioPath } = payload;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

        const base64Data = fs.readFileSync(audioPath).toString("base64");

        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64Data,
                    mimeType: "audio/webm"
                }
            },
            { text: "Hãy nghe và viết lại chính xác nội dung văn bản tiếng Việt của đoạn âm thanh này. Chỉ cần trả v�? nội dung, không giải thích." }
        ]);

        return result.response.text();
    } catch (e) {
        console.error('Lỗi khi g�?i Gemini dịch âm thanh:', e);
        throw e;
    }
});

// ==== DESKTOP CAPTURER (C�?CH 2) ====
ipcMain.handle('desktop-capturer-get-sources', async (event, opts) => {
    const sources = await desktopCapturer.getSources(opts);
    return sources.map(s => ({
        id: s.id,
        name: s.name,
        display_id: s.display_id,
    }));
});

// ==== UTILS ====
function sendToRenderer(channel, data) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, data);
    }
}

function createUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

const APP_RELATED_PORTS = [8000, 54321, 7868, 7171, 7777, 1133, 12345, 48921, 5454];

function killPort(port) {
    const cmd =
        process.platform === "win32"
            ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /PID %a /F`
            : `fuser -k ${port}/tcp 2>/dev/null || (lsof -ti tcp:${port} | xargs -r kill -9 2>/dev/null) || true`;
    try {
        exec(cmd, () => {});
    } catch(e) {}
}

function killPortSync(port) {
    const cmd =
        process.platform === "win32"
            ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /PID %a /F`
            : `fuser -k ${port}/tcp 2>/dev/null || (lsof -ti tcp:${port} | xargs -r kill -9 2>/dev/null) || true`;
    try {
        execSync(cmd, { stdio: "ignore" });
    } catch(e) {}
}

function cleanupAllAppPortsSync() {
    console.log('[System] Đang tự động dọn dẹp tất cả các cổng liên quan trước khi khởi chạy...');
    APP_RELATED_PORTS.forEach(port => {
        killPortSync(port);
    });
}

function _old_killPort_unused(port) {
    const cmd =
        process.platform === "win32"
            ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}" ^| find "LISTENING"') do taskkill /PID %a /F`
            : `lsof -ti tcp:${port} | xargs kill -9`;
    exec(cmd, (err) => {
        if (err)
            sendToRenderer(
                "tools-log",
                `Không thể huỷ tiến trình: ${err.message}`,
            );
        else
            sendToRenderer("tools-log", `�?ã huỷ tiến trình chiếm port ${port}`);
    });
}

function startSttWebSocketServer(port = 7777) {
    if (sttWsServer) {
        return;
    }

    try {
        sttWsServer = new WebSocket.Server(
            {
                port,
                host: "127.0.0.1",
            },
            () => {
                sendToRenderer(
                    "tools-log",
                    `[STT-WS] Server listening on ws://127.0.0.1:${port}`,
                );
            },
        );

        sttWsServer.on("connection", (ws, req) => {
            const clientId = createUniqueID();
            ws._clientId = clientId;
            sttWsClients.add(ws);

            sendToRenderer(
                "tools-log",
                `[STT-WS] Client connected: ${clientId} from ${req.socket.remoteAddress}:${req.socket.remotePort}`,
            );

            ws.on("message", (raw) => {
                let text = raw.toString();
                let payload = null;
                try {
                    payload = JSON.parse(text);
                } catch (e) {
                    sendToRenderer(
                        "tools-log",
                        `[STT-WS] Received non-JSON message from ${clientId}: ${text}`,
                    );
                    return;
                }

                // Handshake đơn giản
                if (payload.type === "hello") {
                    sendToRenderer(
                        "tools-log",
                        `[STT-WS] Handshake from ${clientId} role=${payload.role || ""}`,
                    );
                    return;
                }

                // Chrome app gửi caption
                if (payload.type === "caption") {
                    sendToRenderer(
                        "tools-log",
                        `[STT-WS] caption from ${clientId}: ${JSON.stringify(payload)}`,
                    );
                    sendToRenderer("stt-caption", payload);
                }

                // Kênh debug chung
                sendToRenderer("stt-message", {
                    clientId,
                    payload,
                });
            });

            ws.on("close", (code, reason) => {
                sttWsClients.delete(ws);
                sendToRenderer(
                    "tools-log",
                    `[STT-WS] Client disconnected: ${clientId} (code=${code}, reason=${reason})`,
                );
            });

            ws.on("error", (err) => {
                sendToRenderer(
                    "tools-log",
                    `[STT-WS] Error from ${clientId}: ${err.message}`,
                );
            });
        });

        sttWsServer.on("error", (err) => {
            sendToRenderer(
                "tools-log",
                `[STT-WS] Server error: ${err.message}`,
            );
        });
    } catch (err) {
        sendToRenderer(
            "tools-log",
            `[STT-WS] Failed to start WebSocket server: ${err.message}`,
        );
    }
}

function getChromePath() {
    const platform = process.platform;
    let possiblePaths = [];

    if (platform === "win32") {
        possiblePaths = [
            process.env.LOCALAPPDATA +
            "\\Google\\Chrome\\Application\\chrome.exe",
            process.env.PROGRAMFILES +
            "\\Google\\Chrome\\Application\\chrome.exe",
            process.env["PROGRAMFILES(X86)"] +
            "\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ];
    } else if (platform === "darwin") {
        // MacOS
        possiblePaths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            path.join(
                os.homedir(),
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            ),
        ];
    } else if (platform === "linux") {
        // Linux
        possiblePaths = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
        ];
    }

    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }

    return null;
}

function prepareChromeSttProfile(userDataDir) {
    try {
        const defaultDir = path.join(userDataDir, "Default");
        if (!fs.existsSync(defaultDir)) {
            fs.mkdirSync(defaultDir, { recursive: true });
        }
        const prefPath = path.join(defaultDir, "Preferences");
        let prefs = {};
        if (fs.existsSync(prefPath)) {
            try {
                prefs = JSON.parse(fs.readFileSync(prefPath, "utf8"));
            } catch (e) {}
        }
        if (!prefs.profile) prefs.profile = {};
        if (!prefs.profile.content_settings) prefs.profile.content_settings = {};
        if (!prefs.profile.content_settings.exceptions) prefs.profile.content_settings.exceptions = {};
        
        prefs.profile.content_settings.exceptions.media_stream_mic = {
            "http://localhost:7171,*": { setting: 1 },
            "http://127.0.0.1:7171,*": { setting: 1 },
            "http://localhost:7171": { setting: 1 },
            "http://127.0.0.1:7171": { setting: 1 }
        };
        fs.writeFileSync(prefPath, JSON.stringify(prefs, null, 2), "utf8");
    } catch (err) {
        console.error("[ChromeApp] Lỗi tạo preferences cho STT:", err);
    }
}

function openChromeApp(url, width = 400, height = 800) {
    const targetUrl = url || "http://localhost:7171/";

    if (chromeAppProcess && chromeAppProcess.killed) chromeAppProcess = null;

    if (sttWsClients.size > 0) {
        sendToRenderer("tools-log", `[ChromeApp] Đang chạy rồi, không mở lại.`);
        return;
    }

    const chromePath = getChromePath();
    if (!chromePath) {
        sendToRenderer(
            "tools-log",
            `[ChromeApp] ❌ Không tìm thấy Google Chrome!`,
        );
        return;
    }

    try {
        const userDataDir = path.join(os.homedir(), ".config", "ai-type-chrome-stt");
        prepareChromeSttProfile(userDataDir);

        const args = [
            `--app=${targetUrl}`,
            `--window-size=${width},${height}`,
            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            "--test-type",
            "--ignore-certificate-errors",
            "--disable-web-security",
            "--disable-site-isolation-trials",
            "--unsafely-treat-insecure-origin-as-secure=http://localhost:7171,http://127.0.0.1:7171",
            "--use-fake-ui-for-media-stream",
            "--enable-speech-input",
            "--enable-features=SpeechRecognition",
            // Tắt dịch & popup thừa
            "--disable-features=IsolateOrigins,site-per-process,Translate,OptimizationGuideModelDownloading,OptimizationHints",
            "--disable-translate",
            `--user-data-dir=${userDataDir}`,
            "--autoplay-policy=no-user-gesture-required",
        ];

        sendToRenderer(
            "tools-log",
            `[ChromeApp] Mở size ${width}x${height} tại: ${chromePath}`,
        );

        const child = spawn(chromePath, args, {
            detached: true,
            stdio: "ignore",
            shell: false,
        });

        child.unref();
        chromeAppProcess = child;
    } catch (err) {
        sendToRenderer("tools-log", `[ChromeApp] �?� Exception: ${err.message}`);
    }
}

// Trả v�? đư�?ng dẫn đúng cho preload ở cả dev (electron .) và app.asar
function resolvePreload() {
    // 1) Khi chạy từ dist/main.js: __dirname = .../app.asar/dist (build) hoặc <proj>/dist (dev)
    const candidate1 = path.join(__dirname, "..", "preload.js"); // <-- CHUẨN
    if (fs.existsSync(candidate1)) return candidate1;

    // 2) Phòng khi ai đó vẫn để preload cạnh main.js (ít gặp)
    const candidate2 = path.join(__dirname, "preload.js");
    if (fs.existsSync(candidate2)) return candidate2;

    // 3) Phòng thêm case hiếm trong khi dev chạy từ root
    const candidate3 = path.join(process.cwd(), "preload.js");
    if (fs.existsSync(candidate3)) return candidate3;

    // 4) Báo lỗi để còn biết
    return candidate1; // vẫn trả v�? candidate1 để log báo lỗi
}

// ==== MAIN WINDOW ====
function createMainWindow() {
    mainWindow = new BrowserWindow({
        title: 'AI.Type',
        width: 1440,
        height: 1080,
        icon: path.join(__dirname, '../icons/icon.png'),
        backgroundColor: "#212121",
        fullscreenable: true,
        alwaysOnTop: false,
        resizable: true,
        autoHideMenuBar: true,
        show: true,
        frame: true,
        webPreferences: {
            sandbox: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: false,
            webviewTag: true,
            devTools: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            preload: resolvePreload(),
            autoplayPolicy: 'no-user-gesture-required'
        },
    });

    mainWindow.webContents.on('page-title-updated', (event, title) => {
        if (mainWindow && !mainWindow.isDestroyed() && title) {
            mainWindow.setTitle(title);
        }
    });

    mainWindow.maximize();

    if (app.isPackaged) {
        mainWindow.loadFile(path.join(__dirname, "..", "fallback", "index.html"))
            .then(() => sendToRenderer("tools-log", `[WebApp] Đã load fallback/index.html thành công`))
            .catch((err) => sendToRenderer("tools-log", `[WebApp] Lỗi khi load fallback/index.html: ${err.message}`));
    } else {
        const targetURL = "http://localhost:4200";
        mainWindow.loadURL(targetURL)
            .then(() => sendToRenderer("tools-log", `[WebApp] Đã load ${targetURL} thành công`))
            .catch((err) => sendToRenderer("tools-log", `[WebApp] Lỗi khi load ${targetURL}: ${err.message}`));
    }

    mainWindow.on("closed", () => {
        mainWindow = null;

        if (downloaderProcess) {
            downloaderProcess.kill("SIGTERM");
        }

        if (typeProcess) {
            typeProcess.kill("SIGTERM");
        }

        if (pdfApiProcess) {
            pdfApiProcess.kill("SIGTERM");
        }
        stopTiktokPlugin();
        stopAiAgent();
        stopColabAgent();
        cleanupAllAppPortsSync();
    });

    mainWindow.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription) => {
            sendToRenderer(
                "tools-log",
                `Main window failed to load: ${errorDescription} (${errorCode})`,
            );
        },
    );

    Menu.setApplicationMenu(null);
    /* Menu.buildFromTemplate([
            { label: "Ứng dụng", submenu: [{ label: "Thoát", role: "quit" }] },
            {
                label: "Văn bản",
                submenu: [
                    { role: "undo" },
                    { role: "redo" },
                    { type: "separator" },
                    { role: "cut" },
                    { role: "copy" },
                    { role: "paste" },
                    { role: "pasteandmatchstyle" },
                    { role: "delete" },
                    { role: "selectall" },
                ],
            },
            {
                label: "Hiển thị",
                submenu: [
                    { role: "reload", label: "Tải lại", accelerator: "CmdOrCtrl+R" },
                    { role: "forceReload", label: "Tải lại toàn bộ", accelerator: "CmdOrCtrl+Shift+R" },
                    ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "Công cụ cho nhà phát triển" }]),
                    { type: "separator" },
                    { role: "resetZoom", label: "Khôi phục thu phóng" },
                    { role: "zoomIn", label: "Phóng to" },
                    { role: "zoomOut", label: "Thu nh�?" },
                    { type: "separator" },
                    { role: "togglefullscreen", label: "Toàn màn hình" }
                ]
            },
            { label: "Cửa sổ", role: "windowMenu" },
        ]),
    */
}

// ==== TARGET WINDOW ====
function createTargetWindow(
    url,
    callback,
    uniqueID,
    winWidth = 1000,
    winHeight = null,
    show = true,
) {
    if (targetWindow && !targetWindow.isDestroyed()) {
        const currentUrl = targetWindow.webContents.getURL();
        if (url.includes("zalo.me") && currentUrl.includes("zalo.me")) {
            targetWindow.show();
            targetWindow.focus();
            if (typeof callback === "function") callback(url, uniqueID);
            return targetWindow;
        }
        targetWindow.close();
    }

    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workArea;

    const finalWidth = Math.min(winWidth, Math.floor(screenW * 0.95));
    const finalHeight = Math.min(winHeight || screenH, Math.floor(screenH * 0.95));
    const finalX = Math.max(0, Math.floor((screenW - finalWidth) / 2));
    const finalY = Math.max(0, Math.floor((screenH - finalHeight) / 2));

    const preloadPath = resolvePreload();
    sendToRenderer(
        "tools-log",
        `[Target] preload dùng: ${preloadPath} (exists=${fs.existsSync(preloadPath)})`,
    );

    // Gắn uniqueID vào URL
    let targetUrlWithUniqueID = url;
    if (uniqueID) {
        if (url.includes("?")) {
            targetUrlWithUniqueID += `&uniqueID=${uniqueID}`;
        } else {
            targetUrlWithUniqueID += `?uniqueID=${uniqueID}`;
        }
    }

    targetWindow = new BrowserWindow({
        width: finalWidth,
        height: finalHeight,
        x: finalX,
        y: finalY,
        icon: path.join(__dirname, '../icons/icon.png'),
        title: "Công cụ AI",
        show: show,
        frame: false,
        resizable: false,
        movable: false,
        focusable: true,
        fullscreenable: false,
        autoHideMenuBar: true,
        hasShadow: true,
        skipTaskbar: false,
        alwaysOnTop: false,
        backgroundColor: "#FFFFFF",
        webPreferences: {
            partition: url.includes("zalo.me") ? 'persist:gemini-webview' : undefined,
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: false,
            sandbox: false,
            nativeWindowOpen: true,
            enableRemoteModule: false,
            webSecurity: !url.includes("google.com"),
            webviewTag: false,
            devTools: false,
            nodeIntegrationInSubFrames: true,
            preload: resolvePreload(),
        },
    });

    // Dùng chung User-Agent "sạch" đã được l�?c ở app.whenReady để tránh mismatch version với Client Hints
    targetWindow.webContents.setUserAgent(app.userAgentFallback);

    targetWindow.loadURL(targetUrlWithUniqueID);

    targetWindow.webContents.on("did-finish-load", () => {
        sendToRenderer(
            "tools-log",
            `Target window loaded: ${targetUrlWithUniqueID}`,
        );
        if (typeof callback === "function")
            callback(targetUrlWithUniqueID, uniqueID);
    });

    targetWindow.webContents.on(
        "did-fail-load",
        (event, errorCode, errorDescription) => {
            sendToRenderer(
                "tools-log",
                `Target window load failed: ${errorDescription} (${errorCode})`,
            );

            // if (targetWindow && !targetWindow.isDestroyed()) {
            //     targetWindow.close();
            // }
        },
    );

    const currentWin = targetWindow;
    
    currentWin.on("close", (event) => {
        if (url.includes("zalo.me") && isZaloPluginEnabled() && getZaloPluginMode() === 'tool') {
            event.preventDefault();
            currentWin.hide();
            sendToRenderer("tools-log", "[Zalo-Tool] Target window hidden instead of closed to keep running in background.");
        }
    });

    currentWin.on("closed", () => {
        if (targetWindow === currentWin) {
            targetWindow = null;
        }
    });

    return targetWindow;
}
ipcMain.on("zalo-plugin:incoming-message", (_evt, data) => {
    sendToRenderer("zalo-plugin:notify", data);
});

// Zalo Plugin Main-Process HTTP Bridge

function postToPlugin(path, data) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(data || {});
        const req = http.request({
            hostname: '127.0.0.1',
            port: 54322,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch {
                    resolve({ success: false });
                }
            });
        });
        
        req.on('error', (err) => {
            reject(err);
        });
        
        req.write(payload);
        req.end();
    });
}

ipcMain.on('zalo-plugin:log', (_evt, msg) => {
    postToPlugin('/api/zalo/log', { message: msg }).catch(() => {});
});

ipcMain.on('zalo-plugin:sync-contacts', (_evt, contacts) => {
    postToPlugin('/api/zalo/sync-contacts', { contacts }).catch(() => {});
});

ipcMain.on('zalo-plugin:sync-messages', (_evt, payload) => {
    postToPlugin('/api/zalo/sync-messages', payload).catch(() => {});
});

ipcMain.handle('zalo-plugin:get-reply', async (_evt, prompt) => {
    try {
        const res = await postToPlugin('/api/zalo/reply', { prompt });
        return res;
    } catch {
        return { success: false, error: 'Connection to plugin failed' };
    }
});

ipcMain.handle('zalo-plugin:get-pending-sends', async () => {
    try {
        return new Promise((resolve) => {
            http.get('http://127.0.0.1:54322/api/zalo/pending-sends', (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch { resolve({ success: false }); }
                });
            }).on('error', () => {
                resolve({ success: false });
            });
        });
    } catch {
        return { success: false };
    }
});

// --- thêm forward debug từ preload về UI (đặt trong app.whenReady() sau createMainWindow()) ---
ipcMain.on("dreamina:debug", (_evt, msg) => {
    sendToRenderer("tools-log", String(msg));
});

// Nhận message từ renderer Angular và forward sang tất cả Chrome STT clients
ipcMain.on("stt-send-to-chrome", (_event, payload) => {
    const msg = JSON.stringify(payload || {});
    if (!sttWsServer || sttWsClients.size === 0) {
        sendToRenderer(
            "tools-log",
            "[STT-WS] Không có Chrome client nào để gửi message",
        );
        return;
    }

    for (const ws of sttWsClients) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(msg);
            } catch (err) {
                sendToRenderer(
                    "tools-log",
                    `[STT-WS] Lỗi khi send tới client: ${err.message}`,
                );
            }
        }
    }
});

// ============================================================
// [MỚI] EDGE TTS ENGINE (PURE NODE.JS - NO PYTHON REQUIRED)
// ============================================================


const chunkTextForTTS = (text, maxLength = 60) => {
    const chunks = [];
    let currentChunk = '';
    const parts = text.match(/[^.,!?\n]+[.,!?\n]*/g) || [text];
    
    for (let part of parts) {
        if (part.length > maxLength) {
            const words = part.split(' ');
            for (const word of words) {
                if (currentChunk.length + word.length + 1 > maxLength && currentChunk.trim().length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = word + ' ';
                } else {
                    currentChunk += word + ' ';
                }
            }
        } else {
            if (currentChunk.length + part.length > maxLength && currentChunk.trim().length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = part;
            } else {
                currentChunk += part;
            }
        }
    }
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
};

async function generateEdgeAudioByExe(text, voice, outputPath, subPath, rate, pitch) {
    const exePath = binaries.edgeTts;
    if (!exePath) throw new Error('Không tìm thấy file Edge TTS Core!');
    
    // Tăng kích thước chunk lên mức lớn (4000) để không chia nhỏ câu gây ngắt cục giọng đọc
    const chunks = chunkTextForTTS(text, 4000);
    const tmpDir = require('path').dirname(outputPath);
    const baseName = require('path').basename(outputPath, require('path').extname(outputPath));
    
    const chunkFiles = [];
    
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkOutputPath = require('path').join(tmpDir, `${baseName}_chunk_${i}.mp3`);
        const chunkSubPath = require('path').join(tmpDir, `${baseName}_chunk_${i}.vtt`);
        
        const args = [
            `--text=${chunk}`,
            `--voice=${voice}`,
            `--output=${chunkOutputPath}`,
            `--rate=${rate || '+0%'}`,
            `--pitch=${pitch || '+0Hz'}`,
            `--write-subtitles=${chunkSubPath}`
        ];
        
        sendToRenderer('tools-log', `[TTS-Exe] Generating chunk ${i+1}/${chunks.length} ...`);
        
        const runWithRetry = async (retries = 3) => {
            for (let r = 0; r < retries; r++) {
                try {
                    await new Promise((res, rej) => {
                        require('child_process').execFile(exePath, args, (error, stdout, stderr) => {
                            if (error) {
                                let errorMsg = stderr || error.message;
                                rej(new Error(errorMsg));
                            } else {
                                res();
                            }
                        });
                    });
                    return; // Success
                } catch (e) {
                    if (r === retries - 1) {
                        let errorMsg = e.message;
                        if (errorMsg.includes('No audio was received')) {
                            errorMsg = 'Giọng đọc của Microsoft đang quá tải hoặc từ khóa bị chặn. Vui lòng thử lại sau.';
                        }
                        sendToRenderer('tools-log', `[TTS-Exe] Error at chunk ${i+1}: ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                    sendToRenderer('tools-log', `[TTS-Exe] Chunk ${i+1} failed. Retrying (${r+1}/${retries})...`);
                    await new Promise(res => setTimeout(res, 1000));
                }
            }
        };
        await runWithRetry();
        chunkFiles.push(chunkOutputPath);
    }
    
    if (chunkFiles.length === 1) {
        require('fs').renameSync(chunkFiles[0], outputPath);
        const chunkSubPath = require('path').join(tmpDir, `${baseName}_chunk_0.vtt`);
        if (require('fs').existsSync(chunkSubPath)) {
            require('fs').renameSync(chunkSubPath, subPath);
        }
        return { audio: outputPath, sub: subPath };
    }
    
    return new Promise((resolve, reject) => {
        const listFile = require('path').join(tmpDir, `${baseName}_list.txt`);
        const listContent = chunkFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
        require('fs').writeFileSync(listFile, listContent);
        
        const ffmpegArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath];
        
        require('child_process').execFile(binaries.ffmpeg, ffmpegArgs, (error) => {
            if (error) return reject(new Error('Lỗi ghép audio: ' + error.message));
            
            try {
                require('fs').unlinkSync(listFile);
                chunkFiles.forEach(f => {
                    if (require('fs').existsSync(f)) require('fs').unlinkSync(f);
                    const subF = f.replace('.mp3', '.vtt');
                    if (require('fs').existsSync(subF)) require('fs').unlinkSync(subF);
                });
            } catch (e) {}
            
            resolve({ audio: outputPath, sub: subPath });
        });
    });
}

let pdfApiProcess = null;
let currentPdfSender = null;
let currentAbortController = null;

const downloadAndExtractZip = async (url, destDir, zipPath, progressMsgPrefix, sender) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const total = parseInt(res.headers.get('content-length'), 10) || 0;
            let downloaded = 0;
            let lastPercent = 0;

            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            const fileStream = fs.createWriteStream(zipPath);
            res.body.on('data', (chunk) => {
                downloaded += chunk.length;
                if (total) {
                    const percent = Math.floor((downloaded / total) * 100);
                    if (percent > lastPercent) {
                        lastPercent = percent;
                        if (percent % 5 === 0 || percent === 100) {
                            if (sender) sender.send('pdf-analysis-progress', `${progressMsgPrefix}... ${percent}%`);
                        }
                    }
                }
            });

            res.body.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                if (sender) sender.send('pdf-analysis-progress', '�?ang giải nén dữ liệu (Vui lòng đợi vài phút)...');


                const { exec } = require('child_process');
                const isWin = process.platform === 'win32';
                let extractCmd = isWin
                    ? `powershell -command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`
                    : `unzip -o '${zipPath}' -d '${destDir}'`;

                exec(extractCmd, (error) => {
                    try { fs.unlinkSync(zipPath); } catch (e) { } // D�?n rác
                    if (error) {
                        return reject(new Error('Lỗi giải nén: ' + error.message));
                    }
                    resolve();
                });
            });

            fileStream.on('error', (err) => {
                try { fs.unlinkSync(zipPath); } catch (e) { }
                reject(err);
            });

        } catch (err) {
            try { fs.unlinkSync(zipPath); } catch (e) { }
            reject(err);
        }
    });
};

const getMinerUModelPath = () => {
    return path.join(app.getPath('userData'), 'models', 'models--opendatalab--MinerU2.5-Pro-2604-1.2B', 'snapshots', 'd3f5e08d073c21466bbabe21c71bb1e9c2e595da');
};

ipcMain.handle('check-mineru-model', async () => {
    const configPath = path.join(getMinerUModelPath(), 'config.json');
    return fs.existsSync(configPath);
});

ipcMain.handle('setup-mineru-model', async (event) => {
    return new Promise(async (resolve, reject) => {
        const modelPath = getMinerUModelPath();
        const configPath = path.join(modelPath, 'config.json');

        if (fs.existsSync(configPath)) {
            event.sender.send('pdf-analysis-progress', 'Mô hình AI đã sẵn sàng.');
            resolve();
            return;
        }



        event.sender.send('pdf-analysis-progress', '�?ang kết nối để tải mô hình AI...');
        const modelsDir = path.join(app.getPath('userData'), 'models');
        const zipFile = path.join(modelsDir, 'model.zip');
        const url = 'https://cdn1.type.vn/assets/models--opendatalab--MinerU2.5-Pro-2604-1.2B.zip';

        try {
            await downloadAndExtractZip(url, modelsDir, zipFile, '�?ang tải Mô hình AI (~1.7GB)', event.sender);
            event.sender.send('pdf-analysis-progress', 'Mô hình AI đã sẵn sàng.');
            resolve();
        } catch (e) {
            reject(new Error(`Tải model thất bại: ${e.message}`));
        }
    });
});

ipcMain.handle('cancel-pdf-analysis', async () => {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    try {
        await fetch('http://127.0.0.1:48921/cancel', { method: 'POST' });
    } catch (e) { }
});

ipcMain.handle('download-temp-pdf', async (event, url) => {
    return new Promise(async (resolve, reject) => {
        try {
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Lỗi tải file: HTTP ${res.status}`);

            const tempDir = app.getPath('temp');
            const tempFile = path.join(tempDir, `temp_mineru_${Date.now()}.pdf`);
            const fileStream = fs.createWriteStream(tempFile);

            res.body.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve(tempFile);
            });
            fileStream.on('error', (err) => {
                try { fs.unlinkSync(tempFile); } catch (e) { }
                reject(err);
            });
        } catch (e) {
            reject(e.message);
        }
    });
});

ipcMain.handle('run-pdf-analysis', async (event, filePath) => {
    return new Promise(async (resolve, reject) => {
        currentPdfSender = event.sender;
        currentPdfSender.send('pdf-analysis-progress', '�?ang kiểm tra API AI cục bộ...');

        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        // Hàm g�?i API
        const fetchApi = async (url, body = null) => {
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
            try {
                const res = await fetch(`http://127.0.0.1:48921${url}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : null,
                    timeout: 0, // No timeout cho việc analyze
                    signal
                });
                if (!res.ok) throw new Error(await res.text());
                return await res.json();
            } catch (err) {
                if (err.name === 'AbortError') throw new Error('cancelled');
                throw err;
            }
        };

        // Hàm kiểm tra và khởi động server nếu cần
        const ensureApiRunning = async () => {
            try {
                // Thử kết nối
                const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
                await fetch('http://127.0.0.1:48921/openapi.json', { timeout: 1000 });

                if (!pdfApiProcess) {
                    // Nếu server đang chạy nhưng không phải do instance hiện tại tạo ra -> �?ây là process zombie (thư�?ng do nodemon khởi động lại).
                    // Process này sẽ bị kẹt stdout khiến progress không hiển thị trên UI. Phải kill nó đi để tạo lại!
                    console.log("[PDF] Phát hiện zombie process, đang tiến hành kill...");
                    if (currentPdfSender) currentPdfSender.send('pdf-analysis-progress', '�?ang d�?n dẹp tiến trình cũ...');

                    const { execSync } = require('child_process');
                    try {
                        if (process.platform === 'win32') {
                            execSync(`FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :48921') DO taskkill /F /PID %P`);
                        } else {
                            execSync(`lsof -i :48921 -t | xargs kill -9`);
                        }
                    } catch (e) { } // B�? qua lỗi nếu không tìm thấy

                    await new Promise(r => setTimeout(r, 1000));
                    throw new Error("Killed zombie process");
                }

                return true;
            } catch (e) {
                // Chưa chạy -> Start
                if (currentPdfSender) currentPdfSender.send('pdf-analysis-progress', '�?ang khởi động mô hình AI...');

                const getMinerUExecutableInfoAsync = async () => {
                    const isWin = process.platform === 'win32';
                    const exeName = isWin ? 'mineru_api.exe' : 'mineru_api';

                    // 1. Kiểm tra file trong resources (trư�?ng hợp app đóng gói có nhúng sẵn)
                    const exePath = path.join(__dirname, '..', 'bin', exeName);
                    if (fs.existsSync(exePath)) {
                        return { cmd: exePath, args: [], cwd: path.dirname(exePath) };
                    }

                    // 2. Kiểm tra trong userData (app tải v�?)
                    const mineruDir = path.join(app.getPath('userData'), 'mineru_api_bin');
                    const downloadedExe = path.join(mineruDir, exeName);
                    if (fs.existsSync(downloadedExe)) {
                        return { cmd: downloadedExe, args: [], cwd: mineruDir };
                    }

                    // 3. Nếu đang chạy DEV mode với pdf.py, trả v�? luôn để dev
                    const basePath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
                    const scriptPath = path.join(basePath, 'scripts', 'pdf.py');
                    if (!app.isPackaged && fs.existsSync(scriptPath)) {
                        return { cmd: 'python', args: ['-u', scriptPath], cwd: path.dirname(scriptPath) };
                    }

                    // 4. Nếu không có ở bất kì đâu, tiến hành TẢI VỀ
                    if (currentPdfSender) currentPdfSender.send('pdf-analysis-progress', '�?ang tải tệp Engine AI (Chỉ tải 1 lần đầu tiên)... 0%');

                    const zipUrl = isWin ? 'https://cdn1.type.vn/assets/mineru_api_win.zip' : 'https://cdn1.type.vn/assets/mineru_api_mac.zip';
                    const zipPath = path.join(app.getPath('userData'), 'mineru_api.zip');

                    try {
                        await downloadAndExtractZip(zipUrl, mineruDir, zipPath, '�?ang tải tệp Engine AI (~3.3GB)', currentPdfSender);
                        if (!isWin) {
                            try { fs.chmodSync(downloadedExe, '755'); } catch (e) { }
                        }
                        return { cmd: downloadedExe, args: [], cwd: mineruDir };
                    } catch (err) {
                        throw new Error('Lỗi tải tệp Engine: ' + err.message);
                    }
                };

                const exeInfo = await getMinerUExecutableInfoAsync();
                pdfApiProcess = spawn(exeInfo.cmd, exeInfo.args, {
                    cwd: exeInfo.cwd,
                    env: { ...process.env, PYTHONIOENCODING: 'utf8', MINERU_MODEL_PATH: getMinerUModelPath() }
                });

                pdfApiProcess.stdout.on('data', (data) => {
                    const lines = data.toString('utf8');
                    // Forward print() tới UI
                    if (lines.trim() && currentPdfSender) {
                        currentPdfSender.send('pdf-analysis-progress', lines.trim());
                    }
                });

                pdfApiProcess.stderr.on('data', (data) => {
                    const errLine = data.toString('utf8');
                    if (errLine.includes('%') || errLine.includes('it/s')) {
                        // Tách bằng \r hoặc \n để lấy dòng trạng thái cuối cùng
                        const parts = errLine.split(/[\r\n]+/);
                        let lastPart = parts[parts.length - 1].trim();
                        if (!lastPart && parts.length > 1) {
                            lastPart = parts[parts.length - 2].trim();
                        }
                        if (lastPart && currentPdfSender) {
                            currentPdfSender.send('pdf-analysis-progress', lastPart);
                        }
                    } else {
                        console.error("Lỗi từ pdf API:", errLine);
                    }
                });

                // Ch�? server boot (tối đa 30 giây vì import torch/transformers khá nặng)
                let isReady = false;
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    try {
                        const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
                        await fetch('http://127.0.0.1:48921/openapi.json', { timeout: 1000 });
                        isReady = true;
                        break;
                    } catch (e) { }
                }

                if (!isReady) {
                    throw new Error("Không thể kết nối đến AI Server, vui lòng thử lại!");
                }

                return true;
            }
        };

        try {
            await ensureApiRunning();

            event.sender.send('pdf-analysis-progress', '�?ang nạp AI Model vào bộ nhớ (lần đầu có thể mất vài phút)...');
            await fetchApi('/load_model');

            event.sender.send('pdf-analysis-progress', 'Bắt đầu phân tích PDF...');
            const result = await fetchApi('/analyze', { file_path: filePath });

            resolve(result.data);
        } catch (error) {
            console.error("Lỗi chạy pdf API:", error);
            reject(error.message || error);
        }
    });
});

ipcMain.handle('run-pdf-analysis-openai', async (event, filePath, configData) => {
    try {
        const fs = require('fs');
        const { OpenAI } = require('openai');

        if (event.sender) {
            event.sender.send('pdf-analysis-progress', '�?ang đ�?c nội dung file PDF...');
        }

        const dataBuffer = fs.readFileSync(filePath);
        const pdfBase64 = dataBuffer.toString('base64');

        if (event.sender) {
            event.sender.send('pdf-analysis-progress', '?ang gửi trực tiếp file PDF lên hệ thống AI...');
        }

        console.log("RECEIVED configData:", configData);

        const openai = new OpenAI({
            apiKey: configData?.key || '',
            baseURL: configData?.url || '',
        });

        const completion = await openai.chat.completions.create({
            model: "gemini-3.5-flash",
            messages: [
                { role: "system", content: "You are a helpful assistant. Extract and format the content from the provided PDF document into a structured JSON array representing sections or paragraphs. Output ONLY valid JSON array. Do not include markdown tags like ```json" },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Please analyze this document and return a JSON array of strings containing the text chunks/paragraphs." },
                        { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } }
                    ]
                }
            ],
        });

        const resultText = completion.choices[0].message.content.trim();

        if (event.sender) {
            event.sender.send('pdf-analysis-progress', 'Hoàn tất phân tích AI!');
        }

        try {
            // Loại b? markdown code block nếu có
            let cleanJson = resultText;
            if (cleanJson.startsWith('```json')) {
                cleanJson = cleanJson.substring(7);
            }
            if (cleanJson.endsWith('```')) {
                cleanJson = cleanJson.substring(0, cleanJson.length - 3);
            }
            // Parse rồi stringify lại để đảm bảo là chuỗi JSON hợp lệ, vì API upload bắt buộc là string
            return JSON.stringify(JSON.parse(cleanJson.trim()));
        } catch (e) {
            return JSON.stringify({ raw_text: resultText }); // Fallback nếu không phải JSON, chuyển thành chuỗi JSON
        }
    } catch (error) {
        console.error("Lỗi phân tích PDF bằng OpenAI:", error);
        throw error;
    }
});

// Lắng nghe sự kiện 'select-local-file' từ Renderer process
// Lắng nghe sự kiện 'select-local-file' từ Renderer process
ipcMain.handle('select-local-file', async (event, { filePath, customDir }) => {
    try {
        if (!filePath) return '';
        let cleanPath = filePath.replace(/^file:\/\//i, '');
        try { cleanPath = decodeURIComponent(cleanPath); } catch (e) {}
        cleanPath = path.normalize(cleanPath);

        if (!fs.existsSync(cleanPath)) {
            return `file://${cleanPath}`;
        }

        const ext = path.extname(cleanPath).toLowerCase();
        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv', '.m4v'].includes(ext);
        const stat = fs.statSync(cleanPath);

        // Với file video hoặc file lớn hơn 50MB, KHÔNG copy để tránh đóng băng ứng dụng và tốn dung lượng ổ đĩa
        if (isVideo || stat.size > 50 * 1024 * 1024) {
            return `file://${path.resolve(cleanPath)}`;
        }

        const fileName = path.basename(cleanPath);
        const docPath = app.getPath("documents");
        const dataDir = path.join(docPath, "ai.type", "data");

        // Nếu file đã nằm trong thư mục data của app rồi thì không cần copy
        if (cleanPath.startsWith(path.normalize(dataDir))) {
            return `file://${path.resolve(cleanPath)}`;
        }

        const uniqueFileName = `${Date.now()}_${fileName}`;
        let destinationPath;
        if (customDir) {
            const saveDir = path.join(dataDir, customDir);
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }
            destinationPath = path.join(saveDir, uniqueFileName);
        } else {
            destinationPath = path.join(uploadsDir, uniqueFileName);
        }

        // Copy file bất đồng bộ (Non-blocking async)
        await fs.promises.copyFile(cleanPath, destinationPath);
        return `file://${path.resolve(destinationPath)}`;
    } catch (error) {
        console.error('Error selecting file:', error);
        return `file://${filePath}`;
    }
});

// 1. Hàm tạo Audio - Lưu vào Documents/ai.type/data/tts/...
ipcMain.handle("tts-generate", async (event, payload) => {
    try {
        const { text, voice, rate, pitch, filename, username } = payload;

        // Format Rate: 1.2 -> "+20%", 0.8 -> "-20%"
        const rateVal = Math.round(((rate || 1) - 1) * 100);
        const formattedRate = rateVal >= 0 ? `+${rateVal}%` : `${rateVal}%`;

        // Format Pitch: 5 -> "+5Hz", -10 -> "-10Hz"
        // Quan tr�?ng: Dấu trừ của số âm sẽ tự xuất hiện khi chuyển thành chuỗi
        const formattedPitch = pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`;

        const documentsPath = app.getPath("documents");
        const saveDir = path.join(
            documentsPath,
            "ai.type",
            "data",
            "tts",
            username || "anonymous",
        );

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const filePath = path.join(
            saveDir,
            filename.endsWith(".mp3") ? filename : `${filename}.mp3`,
        );

        // Tạo thêm đư�?ng dẫn cho file phụ đ�? (cùng tên, khác đuôi)
        const subPath = path.join(
            saveDir,
            filename.endsWith(".mp3") ? filename.replace('.mp3', '.vtt') : `${filename}.vtt`
        );

        // [THAY �?ỔI]: Truy�?n biến đã format vào đây
        // await generateEdgeAudioByExe(text, voice, filePath, formattedRate, formattedPitch);
        await generateEdgeAudioByExe(text, voice, filePath, subPath, formattedRate, formattedPitch);

        if (fs.existsSync(filePath)) {
            return {
                success: true,
                url: `file://${filePath}`,
                filePath: filePath,
            };
        } else {
            return { success: false, error: "File chưa được tạo ra." };
        }
    } catch (error) {
        console.error("TTS Error:", error);
        return { success: false, error: error.message };
    }
});

// 2. Hàm đ�?c file - Cập nhật logic fallback (phòng h�?)
ipcMain.handle("check-local-file-exists", async (event, payload) => {
    try {
        const { path: filePath, filename, username, targetUuid } = payload;
        let targetPath = filePath;

        if (targetPath) {
            if (targetPath.startsWith('file://')) {
                try {
                    const url = require('url');
                    targetPath = url.fileURLToPath(targetPath);
                } catch (e) {
                    if (targetPath.startsWith('file:///')) {
                        targetPath = process.platform === 'win32' ? targetPath.slice(8) : targetPath.slice(7);
                    } else {
                        targetPath = targetPath.slice(7);
                    }
                }
            }
            try {
                targetPath = decodeURIComponent(targetPath);
            } catch (e) { }
        }

        // Nếu filepath chỉ là tên file (basename) thì targetPath (absolute) ban đầu không tồn tại (sẽ failed fs.existsSync).
        // Ta cần reset targetPath v�? rỗng nếu nó không phải là absolute path để chạy logic dự phòng bên dưới.
        if (targetPath && !path.isAbsolute(targetPath)) {
            targetPath = null;
        }

        if (!targetPath && filename) {
            const documentsPath = app.getPath("documents");
            const userFolder = path.join(documentsPath, "ai.type", "data", "tts", username || "anonymous");

            // TH1: Tìm trong thư mục dự án hiện tại (targetUuid) - Hỗ trợ Import Project
            if (targetUuid) {
                const projectPath = path.join(userFolder, targetUuid, filename);
                if (fs.existsSync(projectPath)) {
                    targetPath = projectPath;
                }
            }

            // TH2: Tìm trong thư mục global (TTS cache chung)
            if (!targetPath) {
                targetPath = path.join(userFolder, filename);
            }
        }

        const exists = !!(targetPath && fs.existsSync(targetPath));
        console.log(`[IPC check-local-file-exists] filePath: "${filePath}", filename: "${filename}", computed targetPath: "${targetPath}", exists: ${exists}`);

        if (exists) {
            return { exists: true, path: targetPath };
        } else {
            return { exists: false };
        }
    } catch (error) {
        console.error("[IPC check-local-file-exists] Error:", error);
        return { exists: false, error: error.message };
    }
});


ipcMain.handle("get-app-version", async () => {
    return version;
});

ipcMain.handle("system:get-specs", async () => {
    try {
        const totalMemBytes = os.totalmem();
        const freeMemBytes = os.freemem();
        const ramTotalGb = Math.round(totalMemBytes / (1024 * 1024 * 1024));
        const ramUsedGb = ((totalMemBytes - freeMemBytes) / (1024 * 1024 * 1024)).toFixed(1);
        const cpus = os.cpus();
        const cpuCores = cpus ? cpus.length : 8;

        let idle = 0;
        let total = 0;
        if (cpus && cpus.length > 0) {
            for (const cpu of cpus) {
                for (const type in cpu.times) {
                    total += cpu.times[type];
                }
                idle += cpu.times.idle;
            }
        }
        const cpuUsage = total > 0 ? Math.round(((total - idle) / total) * 100) : 15;

        return {
            cpuCores,
            cpuUsage: Math.max(5, Math.min(99, cpuUsage)),
            ramUsedGb,
            ramTotalGb
        };
    } catch (e) {
        return { cpuCores: 8, cpuUsage: 14, ramUsedGb: '12.8', ramTotalGb: 64 };
    }
});

ipcMain.on("app:relaunch", () => {
    // Thiết lập ứng dụng sẽ mở lại sau khi đóng
    app.relaunch();
    // Thoát ứng dụng hiện tại ngay lập tức
    app.exit(0);
});

ipcMain.handle("read-file-base64", async (event, args) => {
    let { filePath } = args || {};
    try {
        if (!filePath) return { success: false, error: "Empty filePath" };
        if (filePath.startsWith('media://')) filePath = decodeURIComponent(filePath.substring(8));
        else if (filePath.startsWith('file://')) filePath = decodeURIComponent(filePath.substring(7));
        if (filePath.match(/^\/[a-zA-Z]:[\\/]/)) filePath = filePath.substring(1);

        let targetPath = filePath;
        if (!fs.existsSync(targetPath)) {
            const candidate1 = path.join(__dirname, '..', '..', filePath);
            const candidate2 = path.join(process.cwd(), filePath);
            if (fs.existsSync(candidate1)) targetPath = candidate1;
            else if (fs.existsSync(candidate2)) targetPath = candidate2;
        }

        if (!fs.existsSync(targetPath)) {
            return { success: false, error: "File not found: " + filePath };
        }
        const fileBuffer = fs.readFileSync(targetPath);
        const base64 = fileBuffer.toString("base64");
        const ext = path.extname(targetPath).toLowerCase();
        let mime = "image/jpeg";
        if (ext === '.png') mime = "image/png";
        else if (ext === '.svg') mime = "image/svg+xml";
        else if (ext === '.webp') mime = "image/webp";
        else if (ext === '.mp4') mime = "video/mp4";

        return { success: true, base64: base64, dataUrl: `data:${mime};base64,${base64}` };
    } catch (e) {
        console.error(e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle("read-text-file", async (event, args) => {
    const { filePath } = args;
    try {
        if (!fs.existsSync(filePath)) {
            return { success: false, error: "File not found: " + filePath };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true, content: content };
    } catch (e) {
        console.error(e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle("scan-subtitles-in-project", async (_event, payload) => {
    try {
        const { dir } = payload;
        if (!dir || !fs.existsSync(dir)) {
            return { success: false, error: "Directory does not exist" };
        }

        const files = fs.readdirSync(dir);
        let originalSrt = null;
        let viSrt = null;

        for (const file of files) {
            if (file.endsWith('_vi.srt') || file.endsWith('.vi.srt') || file.endsWith('_vie.srt')) {
                viSrt = file;
            } else if (file.endsWith('.srt') && !file.includes('_vi') && !file.includes('.vi')) {
                originalSrt = file;
            }
        }

        return {
            success: true,
            originalSrtFile: originalSrt,
            viSrtFile: viSrt,
            originalContent: originalSrt ? fs.readFileSync(path.join(dir, originalSrt), 'utf-8') : null,
            viContent: viSrt ? fs.readFileSync(path.join(dir, viSrt), 'utf-8') : null
        };
    } catch (e) {
        console.error('[scan-subtitles-in-project] Error:', e);
        return { success: false, error: e.message };
    }
});

function getFlatFontsDir() {
    const flatDir = path.join(os.tmpdir(), "ai_type_all_fonts");
    if (!fs.existsSync(flatDir)) {
        fs.mkdirSync(flatDir, { recursive: true });
    }
    const baseFontsDir = path.join(app ? app.getPath("documents") : path.join(os.homedir(), "Documents"), "ai.type", "fonts");
    if (fs.existsSync(baseFontsDir)) {
        const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
        function scanAndCopy(dir) {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        scanAndCopy(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (fontExtensions.includes(ext) && !entry.name.startsWith('._')) {
                            const destPath = path.join(flatDir, entry.name);
                            if (!fs.existsSync(destPath)) {
                                try {
                                    fs.copyFileSync(fullPath, destPath);
                                } catch (ce) {}
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        scanAndCopy(baseFontsDir);
    }
    return flatDir;
}

let cachedFontFamilyMap = null;

function getResolvedFontName(requestedFontName) {
    if (!requestedFontName || requestedFontName === 'sans-serif') return 'DejaVu Sans';
    
    // Làm sạch chuỗi
    let clean = String(requestedFontName).split(',')[0].trim().replace(/['"]/g, '');
    if (!clean || clean === 'sans-serif') return 'DejaVu Sans';
    
    const standardFonts = ['DejaVu Sans', 'Arial', 'Montserrat', 'Roboto', 'Inter', 'Oswald', 'Playfair Display', 'Courier New'];
    if (standardFonts.includes(clean)) return clean;
    
    if (!cachedFontFamilyMap) {
        cachedFontFamilyMap = new Map();
        try {
            const flatFontsDir = getFlatFontsDir();
            const { execSync } = require('child_process');
            const out = execSync(`fc-scan --format "%{file}@@@%{family[0]}@@@%{fullname[0]}@@@%{postscriptname[0]}\\n" "${flatFontsDir}"/* 2>/dev/null`, { encoding: 'utf-8', timeout: 5000 });
            const lines = out.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                const parts = line.split('@@@');
                const file = parts[0];
                const family = parts[1] || '';
                const fullname = parts[2] || '';
                const postscriptname = parts[3] || '';
                const baseName = path.basename(file, path.extname(file));
                
                const bestTarget = fullname || family || postscriptname || baseName;
                
                const keys = [
                    baseName,
                    baseName.toLowerCase(),
                    baseName.replace(/[-_]/g, ' '),
                    baseName.replace(/[-_ ]/g, '').toLowerCase(),
                    fullname,
                    fullname.toLowerCase(),
                    family,
                    family.toLowerCase(),
                    postscriptname,
                    postscriptname.toLowerCase()
                ];
                for (const k of keys) {
                    if (k && !cachedFontFamilyMap.has(k)) {
                        cachedFontFamilyMap.set(k, bestTarget);
                    }
                }
            }
        } catch (e) {
            console.error('[getResolvedFontName] error building font map:', e);
        }
    }
    
    const key = clean;
    const lower = clean.toLowerCase();
    const spaceKey = clean.replace(/[-_]/g, ' ').toLowerCase();
    const compactKey = clean.replace(/[-_ ]/g, '').toLowerCase();
    
    if (cachedFontFamilyMap.has(key)) return cachedFontFamilyMap.get(key);
    if (cachedFontFamilyMap.has(lower)) return cachedFontFamilyMap.get(lower);
    if (cachedFontFamilyMap.has(spaceKey)) return cachedFontFamilyMap.get(spaceKey);
    if (cachedFontFamilyMap.has(compactKey)) return cachedFontFamilyMap.get(compactKey);
    
    return clean;
}

function resolveVideoAssetPath(targetPath) {
    if (!targetPath) return '';
    let clean = String(targetPath).trim();
    if (clean.startsWith('media://')) clean = decodeURIComponent(clean.substring(8));
    else if (clean.startsWith('file://')) clean = decodeURIComponent(clean.substring(7));
    if (clean.match(/^\/[a-zA-Z]:[\\/]/)) clean = clean.substring(1);

    if (fs.existsSync(clean)) return clean;

    const baseName = path.basename(clean);
    const relFromSrc = clean.replace(/^[\\/]/, '').replace(/^src[\\/]/, '').replace(/^electron[\\/]/, '').replace(/^fallback[\\/]/, '');

    const candidates = [
        path.join(process.cwd(), clean),
        path.join(__dirname, '..', '..', clean),
        path.join(__dirname, '..', clean),
        path.join(__dirname, clean),
        process.resourcesPath ? path.join(process.resourcesPath, 'assets', 'video_frames', baseName) : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'video_frames', baseName) : null,
        process.resourcesPath ? path.join(process.resourcesPath, relFromSrc) : null,
        process.resourcesPath ? path.join(process.resourcesPath, 'assets', relFromSrc.replace(/^assets[\\/]/, '')) : null,
        path.join(process.cwd(), 'src', 'assets', 'video_frames', baseName),
        path.join(process.cwd(), 'electron', 'fallback', 'assets', 'video_frames', baseName),
        path.join(__dirname, '..', '..', 'src', 'assets', 'video_frames', baseName),
        path.join(__dirname, '..', 'fallback', 'assets', 'video_frames', baseName)
    ].filter(Boolean);

    for (const cand of candidates) {
        if (fs.existsSync(cand)) return cand;
    }
    return clean;
}

ipcMain.handle("render-video-with-frame", async (event, payload) => {
    let { 
        videoPath, 
        totalDuration, 
        baseClips, 
        overlays, 
        audioClips, 
        frameBgPath, 
        frameBgVideoPath, 
        frameMaskPath, 
        outputPath, 
        quad, 
        canvasWidth, 
        canvasHeight, 
        subtitles, 
        subtitleBottom, 
        subtitleFontSize, 
        subtitleFontFamily, 
        previewHeight 
    } = payload || {};
    
    try {
        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const W = canvasWidth || 2286;
        const H = canvasHeight || 4096;

        let cleanBgVideoPath = frameBgVideoPath ? resolveVideoAssetPath(frameBgVideoPath) : '';
        let cleanBgPath = resolveVideoAssetPath(frameBgPath || 'src/assets/video_frames/tiktok_frame_bg.jpg');
        let cleanMaskPath = resolveVideoAssetPath(frameMaskPath || 'src/assets/video_frames/tiktok_frame_mask.png');

        const hasBgVideo = !!cleanBgVideoPath && fs.existsSync(cleanBgVideoPath);
        if (!hasBgVideo && !fs.existsSync(cleanBgPath)) {
            return { success: false, error: "Frame background not found: " + cleanBgPath };
        }
        if (!fs.existsSync(cleanMaskPath)) {
            return { success: false, error: "Frame mask image not found: " + cleanMaskPath };
        }

        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        const X0 = quad?.topLeft?.x || 172.0;
        const Y0 = quad?.topLeft?.y || 1238.4;
        const X1 = quad?.topRight?.x || 2110.0;
        const Y1 = quad?.topRight?.y || 1162.0;
        const X2 = quad?.bottomLeft?.x || 33.0;
        const Y2 = quad?.bottomLeft?.y || 2376.3;
        const X3 = quad?.bottomRight?.x || 1958.0;
        const Y3 = quad?.bottomRight?.y || 2275.0;

        // Chuẩn hoá danh sách Base Clips (Track 0)
        let validBaseClips = [];
        if (Array.isArray(baseClips) && baseClips.length > 0) {
            for (const item of baseClips) {
                let p = item.path || '';
                if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
                else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
                if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
                if (fs.existsSync(p)) {
                    validBaseClips.push({ ...item, cleanPath: p });
                }
            }
        }
        if (validBaseClips.length === 0 && videoPath) {
            let p = videoPath;
            if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
            else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
            if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
            if (fs.existsSync(p)) {
                validBaseClips.push({ type: 'video', cleanPath: p, startTime: 0, duration: Number(totalDuration) || 5, trimStart: 0, trackIndex: 0 });
            }
        }

        // Chuẩn hoá danh sách Overlays (Track 1+ và Images)
        let validOverlays = [];
        if (Array.isArray(overlays) && overlays.length > 0) {
            for (const item of overlays) {
                let p = item.path || '';
                if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
                else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
                if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
                if (fs.existsSync(p)) {
                    validOverlays.push({ ...item, cleanPath: p });
                }
            }
        }

        // Chuẩn hoá danh sách Audio Clips - Kiểm tra xem file có stream audio hay không
        let validAudioClips = [];
        if (Array.isArray(audioClips) && audioClips.length > 0) {
            for (const item of audioClips) {
                let p = item.path || '';
                if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
                else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
                if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
                if (fs.existsSync(p)) {
                    try {
                        const probeOut = execSync(`"${ffmpegPath}" -i "${p}" 2>&1`, { encoding: 'utf-8' });
                        if (probeOut && (probeOut.includes('Audio:') || probeOut.includes('Stream #') && probeOut.includes(': Audio:'))) {
                            validAudioClips.push({ ...item, cleanPath: p });
                        }
                    } catch (pe) {
                        const out = (pe && (pe.stdout || pe.stderr || pe.message)) || '';
                        if (out.includes('Audio:')) {
                            validAudioClips.push({ ...item, cleanPath: p });
                        }
                    }
                }
            }
        }

        // Tính tổng thời lượng cuối cùng
        let maxDur = Number(totalDuration) || 0;
        if (maxDur <= 0) {
            for (const c of validBaseClips) maxDur = Math.max(maxDur, (Number(c.startTime) || 0) + (Number(c.duration) || 5));
            for (const o of validOverlays) maxDur = Math.max(maxDur, (Number(o.startTime) || 0) + (Number(o.duration) || 5));
            for (const a of validAudioClips) maxDur = Math.max(maxDur, (Number(a.startTime) || 0) + (Number(a.duration) || 5));
        }
        if (maxDur <= 0) maxDur = 5;

        // Xử lý tạo file phụ đề ASS nếu có danh sách subtitles
        let assFilePath = null;
        let subtitleFilter = '';
        if (Array.isArray(subtitles) && subtitles.length > 0) {
            function formatAssTime(seconds) {
                const s = Math.max(0, seconds);
                const hrs = Math.floor(s / 3600);
                const mins = Math.floor((s % 3600) / 60);
                const secs = Math.floor(s % 60);
                const cs = Math.floor((s % 1) * 100);
                return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
            }

            function escapeAss(text) {
                if (!text) return "";
                return String(text).replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}").replace(/\n/g, "\\N");
            }

            const flatFontsDir = getFlatFontsDir();
            const escapedFontsDir = flatFontsDir.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
            
            const previewH = Number(previewHeight) || 570;
            const marginV = Math.max(15, Math.round((Number(subtitleBottom !== undefined ? subtitleBottom : 20) / previewH) * H));
            const cleanFontName = getResolvedFontName(subtitleFontFamily);
            const primaryFontSize = Math.max(30, Math.round((Number(subtitleFontSize || 24) / previewH) * H));
            const secondaryFontSize = Math.round(primaryFontSize * 0.85);

            const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${cleanFontName},${primaryFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,1,0,1,8,4,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
` + subtitles.map(sub => {
                const start = formatAssTime(sub.startTime || 0);
                const end = formatAssTime((sub.startTime || 0) + (sub.duration || 3));
                const itemFont = getResolvedFontName(sub.fontFamily || subtitleFontFamily);
                const itemSize = sub.fontSize ? Math.max(40, Math.round((Number(sub.fontSize) / 450) * H)) : primaryFontSize;
                const itemSecSize = Math.round(itemSize * 0.85);
                let textLine = "";
                if (sub.secondaryText && sub.primaryText) {
                    textLine = `{\\fn${itemFont}\\fs${itemSize}\\b1\\c&HFFFFFF&}${escapeAss(sub.primaryText)}\\N{\\fn${itemFont}\\fs${itemSecSize}\\c&H00E5FF&}${escapeAss(sub.secondaryText)}`;
                } else {
                    textLine = `{\\fn${itemFont}\\fs${itemSize}\\b1\\c&HFFFFFF&}${escapeAss(sub.primaryText || sub.secondaryText)}`;
                }
                return `Dialogue: 0,${start},${end},Default,,0,0,0,,${textLine}`;
            }).join("\n") + "\n";

            assFilePath = path.join(os.tmpdir(), `tmp_frame_sub_${Date.now()}_${Math.random().toString(36).substring(7)}.ass`);
            fs.writeFileSync(assFilePath, assContent, "utf8");

            const escapedAss = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
            subtitleFilter = `subtitles=filename='${escapedAss}':fontsdir='${escapedFontsDir}'`;
        }

        const args = ['-y'];

        // 1. Input 0: Background
        if (hasBgVideo) {
            args.push('-stream_loop', '-1', '-i', cleanBgVideoPath);
        } else {
            args.push('-loop', '1', '-i', cleanBgPath);
        }
        let currentInputIdx = 1;

        // 2. Input 1: Mask
        args.push('-loop', '1', '-i', cleanMaskPath);
        const maskInputIndex = currentInputIdx;
        currentInputIdx++;

        const getWebmDecoder = (filePath) => {
            if (!String(filePath).toLowerCase().endsWith('.webm')) return null;
            try {
                const probe = execSync(`"${ffmpegPath}" -i "${filePath}" 2>&1`, { encoding: 'utf-8' });
                if (probe.includes('Video: vp9') || probe.includes('libvpx-vp9') || probe.includes('vp9 (')) return 'libvpx-vp9';
                return 'libvpx';
            } catch (e) {
                const out = (e && (e.stdout || e.stderr || e.message)) || '';
                if (out.includes('Video: vp9') || out.includes('libvpx-vp9') || out.includes('vp9 (')) return 'libvpx-vp9';
                return 'libvpx';
            }
        };

        // 3. Inputs: Base Clips (Track 0)
        const baseClipIndices = [];
        for (const bc of validBaseClips) {
            if (bc.type === 'image') {
                args.push('-loop', '1', '-i', bc.cleanPath);
            } else {
                const dec = getWebmDecoder(bc.cleanPath);
                if (dec) {
                    args.push('-c:v', dec);
                }
                args.push('-i', bc.cleanPath);
            }
            baseClipIndices.push({ inputIndex: currentInputIdx, ...bc });
            currentInputIdx++;
        }

        // 4. Inputs: Overlays (Track 1+ và Images)
        const overlayIndices = [];
        for (const ov of validOverlays) {
            if (ov.type === 'image') {
                args.push('-loop', '1', '-i', ov.cleanPath);
            } else {
                const dec = getWebmDecoder(ov.cleanPath);
                if (dec) {
                    args.push('-c:v', dec);
                }
                args.push('-i', ov.cleanPath);
            }
            overlayIndices.push({ inputIndex: currentInputIdx, ...ov });
            currentInputIdx++;
        }

        // 5. Inputs: Audio Clips
        const audioIndices = [];
        for (const ac of validAudioClips) {
            args.push('-i', ac.cleanPath);
            audioIndices.push({ inputIndex: currentInputIdx, ...ac });
            currentInputIdx++;
        }

        let filterParts = [];

        // Scale background
        filterParts.push(`[0:v]scale=${W}:${H}:flags=lanczos[bg]`);

        // Tạo Base Mockup Screen Canvas (Track 0)
        filterParts.push(`color=c=black:s=${W}x${H}:d=${maxDur}[base_screen_canvas]`);
        let currentScreenBase = '[base_screen_canvas]';

        let baseCounter = 0;
        for (const bc of baseClipIndices) {
            const start = Math.max(0, Number(bc.startTime) || 0);
            const end = start + (Number(bc.duration) || 5);
            const trimS = Math.max(0, Number(bc.trimStart) || 0);
            const dur = Math.max(0.1, Number(bc.duration) || 5);
            const scaledTag = `[bc_scaled_${baseCounter}]`;
            const nextTag = `[bc_comp_${baseCounter}]`;

            if (bc.type === 'image') {
                filterParts.push(`[${bc.inputIndex}:v]scale=${W}:${H}:flags=lanczos,format=rgba,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            } else {
                filterParts.push(`[${bc.inputIndex}:v]trim=start=${trimS}:duration=${dur},scale=${W}:${H}:flags=lanczos,format=rgba,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            }
            filterParts.push(`${currentScreenBase}${scaledTag}overlay=0:0:enable='between(t,${start},${end})':eof_action=pass${nextTag}`);
            currentScreenBase = nextTag;
            baseCounter++;
        }

        // Perspective Quad Warp cho màn hình Mockup
        filterParts.push(`${currentScreenBase}perspective=x0=${X0}:y0=${Y0}:x1=${X1}:y1=${Y1}:x2=${X2}:y2=${Y2}:x3=${X3}:y3=${Y3}:sense=destination:interpolation=cubic[warped]`);

        // Masking màn hình Mockup lồng vào Background
        filterParts.push(`[${maskInputIndex}:v]scale=${W}:${H}:flags=lanczos,format=gray[mask]`);
        filterParts.push(`[warped][mask]alphamerge[maskedvid]`);
        filterParts.push(`[bg][maskedvid]overlay=0:0[base_comp]`);
        let currentFullBase = '[base_comp]';

        // Đè các Track 1+ / Overlay Clips lên trên cùng
        let ovCounter = 0;
        for (const ov of overlayIndices) {
            const start = Math.max(0, Number(ov.startTime) || 0);
            const end = start + (Number(ov.duration) || 5);
            const trimS = Math.max(0, Number(ov.trimStart) || 0);
            const dur = Math.max(0.1, Number(ov.duration) || 5);
            const scaledTag = `[ov_scaled_${ovCounter}]`;
            const nextTag = `[ov_layer_${ovCounter}]`;

            if (ov.type === 'image') {
                filterParts.push(`[${ov.inputIndex}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            } else {
                filterParts.push(`[${ov.inputIndex}:v]trim=start=${trimS}:duration=${dur},scale=${W}:${H}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            }
            filterParts.push(`${currentFullBase}${scaledTag}overlay=(W-w)/2:(H-h)/2:format=auto:enable='between(t,${start},${end})':eof_action=pass${nextTag}`);
            currentFullBase = nextTag;
            ovCounter++;
        }

        // Bắn Subtitles & Texts
        if (subtitleFilter) {
            filterParts.push(`${currentFullBase}${subtitleFilter}[outv]`);
        } else {
            filterParts.push(`${currentFullBase}null[outv]`);
        }

        // Xử lý Audio Filter Graph: Mix toàn bộ Audio Tracks
        let hasAudioOutput = false;
        if (audioIndices.length > 0) {
            let audioPadParts = [];
            let aCounter = 0;
            for (const ac of audioIndices) {
                const startMs = Math.round((Number(ac.startTime) || 0) * 1000);
                const vol = Number(ac.volume) !== undefined ? Number(ac.volume) : 1;
                const trimS = Math.max(0, Number(ac.trimStart) || 0);
                const dur = Math.max(0.1, Number(ac.duration) || 5);
                const outAudTag = `[a_processed_${aCounter}]`;

                filterParts.push(`[${ac.inputIndex}:a]atrim=start=${trimS}:duration=${dur},asetpts=PTS-STARTPTS,adelay=${startMs}|${startMs},volume=${vol}${outAudTag}`);
                audioPadParts.push(outAudTag);
                aCounter++;
            }

            if (audioPadParts.length === 1) {
                filterParts.push(`${audioPadParts[0]}apad=whole_dur=${maxDur}[outa]`);
            } else {
                filterParts.push(`${audioPadParts.join('')}amix=inputs=${audioPadParts.length}:duration=longest:dropout_transition=0,apad=whole_dur=${maxDur}[outa]`);
            }
            hasAudioOutput = true;
        } else {
            // Tạo silent audio track để tránh lỗi aac encoder thiếu stream
            filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${maxDur}[outa]`);
            hasAudioOutput = true;
        }

        const filterComplex = filterParts.join(';');

        args.push(
            '-filter_complex', filterComplex,
            '-map', '[outv]'
        );

        if (hasAudioOutput) {
            args.push(
                '-map', '[outa]',
                '-c:a', 'aac',
                '-b:a', '192k'
            );
        }

        args.push(
            '-t', String(maxDur),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '17',
            '-pix_fmt', 'yuv420p',
            outputPath
        );

        console.log('[render-video-with-frame] Executing FFmpeg:', ffmpegPath, args.join(' '));

        const cleanupTempAss = () => {
            if (assFilePath && fs.existsSync(assFilePath)) {
                try { fs.unlinkSync(assFilePath); } catch (e) {}
            }
        };

        return new Promise((resolve) => {
            const child = spawn(ffmpegPath, args);
            let stderrData = '';
            child.stderr.on('data', (d) => {
                stderrData += d.toString();
            });
            child.on('close', (code) => {
                cleanupTempAss();
                if (code === 0) {
                    console.log('[render-video-with-frame] Xuất video thành công:', outputPath);
                    resolve({ success: true, outputPath });
                } else {
                    console.error('[render-video-with-frame] FFmpeg args:', args.join(' '));
                    console.error('[render-video-with-frame] Lỗi FFmpeg:', stderrData);
                    resolve({ success: false, error: `FFmpeg exited with code ${code}: ${stderrData.slice(-1200)}` });
                }
            });
            child.on('error', (err) => {
                cleanupTempAss();
                resolve({ success: false, error: err.message });
            });
        });
    } catch (e) {
        console.error('[render-video-with-frame] Exception:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle("render-video-with-subtitles", async (event, payload) => {
    let { 
        videoPath, 
        totalDuration, 
        baseClips, 
        overlays, 
        audioClips, 
        outputPath, 
        subtitles, 
        subtitleBottom, 
        subtitleFontSize, 
        subtitleFontFamily, 
        previewHeight 
    } = payload || {};

    try {
        const ffmpegPath = binaries.ffmpeg || "ffmpeg";

        // Chuẩn hoá danh sách Base Clips (Track 0)
        let validBaseClips = [];
        if (Array.isArray(baseClips) && baseClips.length > 0) {
            for (const item of baseClips) {
                let p = item.path || '';
                if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
                else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
                if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
                if (fs.existsSync(p)) {
                    validBaseClips.push({ ...item, cleanPath: p });
                }
            }
        }
        if (validBaseClips.length === 0 && videoPath) {
            let p = videoPath;
            if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
            else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
            if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
            if (fs.existsSync(p)) {
                validBaseClips.push({ type: 'video', cleanPath: p, startTime: 0, duration: Number(totalDuration) || 5, trimStart: 0, trackIndex: 0 });
            }
        }

        // Chuẩn hoá danh sách Overlays (Track 1+ và Images)
        let validOverlays = [];
        if (Array.isArray(overlays) && overlays.length > 0) {
            for (const item of overlays) {
                let p = item.path || '';
                if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
                else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
                if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
                if (fs.existsSync(p)) {
                    validOverlays.push({ ...item, cleanPath: p });
                }
            }
        }

        // Chuẩn hoá danh sách Audio Clips - Kiểm tra xem file có stream audio hay không
        let validAudioClips = [];
        if (Array.isArray(audioClips) && audioClips.length > 0) {
            for (const item of audioClips) {
                let p = item.path || '';
                if (p.startsWith('media://')) p = decodeURIComponent(p.substring(8));
                else if (p.startsWith('file://')) p = decodeURIComponent(p.substring(7));
                if (p.match(/^\/[a-zA-Z]:[\\/]/)) p = p.substring(1);
                if (fs.existsSync(p)) {
                    try {
                        const probeOut = execSync(`"${ffmpegPath}" -i "${p}" 2>&1`, { encoding: 'utf-8' });
                        if (probeOut && (probeOut.includes('Audio:') || probeOut.includes('Stream #') && probeOut.includes(': Audio:'))) {
                            validAudioClips.push({ ...item, cleanPath: p });
                        }
                    } catch (pe) {
                        const out = (pe && (pe.stdout || pe.stderr || pe.message)) || '';
                        if (out.includes('Audio:')) {
                            validAudioClips.push({ ...item, cleanPath: p });
                        }
                    }
                }
            }
        }

        if (validBaseClips.length === 0 && validOverlays.length === 0) {
            return { success: false, error: "Không tìm thấy clip video/hình ảnh nguồn để xuất" };
        }

        const outDir = path.dirname(outputPath);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }

        // Lấy kích thước video chuẩn từ clip đầu tiên
        let vidW = 1920;
        let vidH = 1080;
        const firstProbeTarget = validBaseClips[0]?.cleanPath || validOverlays[0]?.cleanPath;
        if (firstProbeTarget) {
            try {
                const probeOutput = execSync(`"${ffmpegPath}" -i "${firstProbeTarget}" 2>&1`, { encoding: 'utf-8' });
                const dimMatch = probeOutput && probeOutput.match(/Video:.*,\s*(\d{3,5})x(\d{3,5})/);
                if (dimMatch) {
                    vidW = parseInt(dimMatch[1], 10);
                    vidH = parseInt(dimMatch[2], 10);
                }
            } catch (pe) {
                const out = (pe && (pe.stdout || pe.stderr || pe.message)) || '';
                const dimMatch = out.match(/Video:.*,\s*(\d{3,5})x(\d{3,5})/);
                if (dimMatch) {
                    vidW = parseInt(dimMatch[1], 10);
                    vidH = parseInt(dimMatch[2], 10);
                }
            }
        }

        // Tính tổng thời lượng xuất video
        let maxDur = Number(totalDuration) || 0;
        if (maxDur <= 0) {
            for (const c of validBaseClips) maxDur = Math.max(maxDur, (Number(c.startTime) || 0) + (Number(c.duration) || 5));
            for (const o of validOverlays) maxDur = Math.max(maxDur, (Number(o.startTime) || 0) + (Number(o.duration) || 5));
            for (const a of validAudioClips) maxDur = Math.max(maxDur, (Number(a.startTime) || 0) + (Number(a.duration) || 5));
        }
        if (maxDur <= 0) maxDur = 5;

        // Xử lý tạo file phụ đề ASS
        let assFilePath = null;
        let subtitleFilter = '';
        if (Array.isArray(subtitles) && subtitles.length > 0) {
            function formatAssTime(seconds) {
                const s = Math.max(0, seconds);
                const hrs = Math.floor(s / 3600);
                const mins = Math.floor((s % 3600) / 60);
                const secs = Math.floor(s % 60);
                const cs = Math.floor((s % 1) * 100);
                return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
            }

            function escapeAss(text) {
                if (!text) return "";
                return String(text).replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}").replace(/\n/g, "\\N");
            }

            const flatFontsDir = getFlatFontsDir();
            const escapedFontsDir = flatFontsDir.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

            const previewH = Number(previewHeight) || 500;
            const marginV = Math.max(8, Math.round((Number(subtitleBottom !== undefined ? subtitleBottom : 20) / previewH) * vidH));
            const cleanFontName = getResolvedFontName(subtitleFontFamily);
            const primaryFontSize = Math.max(16, Math.round((Number(subtitleFontSize || 24) / previewH) * vidH));
            const secondaryFontSize = Math.round(primaryFontSize * 0.85);

            const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${vidW}
PlayResY: ${vidH}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${cleanFontName},${primaryFontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,1,0,1,6,3,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
` + subtitles.map(sub => {
                const start = formatAssTime(sub.startTime || 0);
                const end = formatAssTime((sub.startTime || 0) + (sub.duration || 3));
                const itemFont = getResolvedFontName(sub.fontFamily || subtitleFontFamily);
                const itemSize = sub.fontSize ? Math.max(16, Math.round((Number(sub.fontSize) / previewH) * vidH)) : primaryFontSize;
                const itemSecSize = Math.round(itemSize * 0.85);
                let textLine = "";
                if (sub.secondaryText && sub.primaryText) {
                    textLine = `{\\fn${itemFont}\\fs${itemSize}\\b1\\c&HFFFFFF&}${escapeAss(sub.primaryText)}\\N{\\fn${itemFont}\\fs${itemSecSize}\\c&H00E5FF&}${escapeAss(sub.secondaryText)}`;
                } else {
                    textLine = `{\\fn${itemFont}\\fs${itemSize}\\b1\\c&HFFFFFF&}${escapeAss(sub.primaryText || sub.secondaryText)}`;
                }
                return `Dialogue: 0,${start},${end},Default,,0,0,0,,${textLine}`;
            }).join("\n") + "\n";

            assFilePath = path.join(os.tmpdir(), `tmp_burn_sub_${Date.now()}_${Math.random().toString(36).substring(7)}.ass`);
            fs.writeFileSync(assFilePath, assContent, "utf8");

            const escapedAss = assFilePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
            subtitleFilter = `subtitles=filename='${escapedAss}':fontsdir='${escapedFontsDir}'`;
        }

        const args = ['-y'];
        let currentInputIdx = 0;

        const getWebmDecoder = (filePath) => {
            if (!String(filePath).toLowerCase().endsWith('.webm')) return null;
            try {
                const probe = execSync(`"${ffmpegPath}" -i "${filePath}" 2>&1`, { encoding: 'utf-8' });
                if (probe.includes('Video: vp9') || probe.includes('libvpx-vp9') || probe.includes('vp9 (')) return 'libvpx-vp9';
                return 'libvpx';
            } catch (e) {
                const out = (e && (e.stdout || e.stderr || e.message)) || '';
                if (out.includes('Video: vp9') || out.includes('libvpx-vp9') || out.includes('vp9 (')) return 'libvpx-vp9';
                return 'libvpx';
            }
        };

        // 1. Inputs: Base Clips (Track 0)
        const baseClipIndices = [];
        for (const bc of validBaseClips) {
            if (bc.type === 'image') {
                args.push('-loop', '1', '-i', bc.cleanPath);
            } else {
                const dec = getWebmDecoder(bc.cleanPath);
                if (dec) {
                    args.push('-c:v', dec);
                }
                args.push('-i', bc.cleanPath);
            }
            baseClipIndices.push({ inputIndex: currentInputIdx, ...bc });
            currentInputIdx++;
        }

        // 2. Inputs: Overlays (Track 1+ và Images)
        const overlayIndices = [];
        for (const ov of validOverlays) {
            if (ov.type === 'image') {
                args.push('-loop', '1', '-i', ov.cleanPath);
            } else {
                const dec = getWebmDecoder(ov.cleanPath);
                if (dec) {
                    args.push('-c:v', dec);
                }
                args.push('-i', ov.cleanPath);
            }
            overlayIndices.push({ inputIndex: currentInputIdx, ...ov });
            currentInputIdx++;
        }

        // 3. Inputs: Audio Clips
        const audioIndices = [];
        for (const ac of validAudioClips) {
            args.push('-i', ac.cleanPath);
            audioIndices.push({ inputIndex: currentInputIdx, ...ac });
            currentInputIdx++;
        }

        let filterParts = [];

        // Canvas nền tổng thể
        filterParts.push(`color=c=black:s=${vidW}x${vidH}:d=${maxDur}[canvas_base]`);
        let currentVideoBase = '[canvas_base]';

        // Đè Base Clips (Track 0)
        let baseCounter = 0;
        for (const bc of baseClipIndices) {
            const start = Math.max(0, Number(bc.startTime) || 0);
            const end = start + (Number(bc.duration) || 5);
            const trimS = Math.max(0, Number(bc.trimStart) || 0);
            const dur = Math.max(0.1, Number(bc.duration) || 5);
            const scaledTag = `[bc_scaled_${baseCounter}]`;
            const nextTag = `[bc_comp_${baseCounter}]`;

            if (bc.type === 'image') {
                filterParts.push(`[${bc.inputIndex}:v]scale=${vidW}:${vidH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            } else {
                filterParts.push(`[${bc.inputIndex}:v]trim=start=${trimS}:duration=${dur},scale=${vidW}:${vidH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            }
            filterParts.push(`${currentVideoBase}${scaledTag}overlay=(W-w)/2:(H-h)/2:format=auto:enable='between(t,${start},${end})':eof_action=pass${nextTag}`);
            currentVideoBase = nextTag;
            baseCounter++;
        }

        // Đè Overlays (Track 1+ và Images)
        let ovCounter = 0;
        for (const ov of overlayIndices) {
            const start = Math.max(0, Number(ov.startTime) || 0);
            const end = start + (Number(ov.duration) || 5);
            const trimS = Math.max(0, Number(ov.trimStart) || 0);
            const dur = Math.max(0.1, Number(ov.duration) || 5);
            const scaledTag = `[ov_scaled_${ovCounter}]`;
            const nextTag = `[ov_layer_${ovCounter}]`;

            if (ov.type === 'image') {
                filterParts.push(`[${ov.inputIndex}:v]scale=${vidW}:${vidH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            } else {
                filterParts.push(`[${ov.inputIndex}:v]trim=start=${trimS}:duration=${dur},scale=${vidW}:${vidH}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,setpts=PTS-STARTPTS+${start}/TB${scaledTag}`);
            }
            filterParts.push(`${currentVideoBase}${scaledTag}overlay=(W-w)/2:(H-h)/2:format=auto:enable='between(t,${start},${end})':eof_action=pass${nextTag}`);
            currentVideoBase = nextTag;
            ovCounter++;
        }

        // Phụ đề
        if (subtitleFilter) {
            filterParts.push(`${currentVideoBase}${subtitleFilter}[outv]`);
        } else {
            filterParts.push(`${currentVideoBase}null[outv]`);
        }

        // Audio Filter Graph: Mix toàn bộ Audio Tracks
        let hasAudioOutput = false;
        if (audioIndices.length > 0) {
            let audioPadParts = [];
            let aCounter = 0;
            for (const ac of audioIndices) {
                const startMs = Math.round((Number(ac.startTime) || 0) * 1000);
                const vol = Number(ac.volume) !== undefined ? Number(ac.volume) : 1;
                const trimS = Math.max(0, Number(ac.trimStart) || 0);
                const dur = Math.max(0.1, Number(ac.duration) || 5);
                const outAudTag = `[a_processed_${aCounter}]`;

                filterParts.push(`[${ac.inputIndex}:a]atrim=start=${trimS}:duration=${dur},asetpts=PTS-STARTPTS,adelay=${startMs}|${startMs},volume=${vol}${outAudTag}`);
                audioPadParts.push(outAudTag);
                aCounter++;
            }

            if (audioPadParts.length === 1) {
                filterParts.push(`${audioPadParts[0]}apad=whole_dur=${maxDur}[outa]`);
            } else {
                filterParts.push(`${audioPadParts.join('')}amix=inputs=${audioPadParts.length}:duration=longest:dropout_transition=0,apad=whole_dur=${maxDur}[outa]`);
            }
            hasAudioOutput = true;
        } else {
            // Tạo silent audio track để tránh lỗi aac encoder thiếu stream
            filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=44100:d=${maxDur}[outa]`);
            hasAudioOutput = true;
        }

        const filterComplex = filterParts.join(';');

        args.push(
            '-filter_complex', filterComplex,
            '-map', '[outv]'
        );

        if (hasAudioOutput) {
            args.push(
                '-map', '[outa]',
                '-c:a', 'aac',
                '-b:a', '192k'
            );
        }

        args.push(
            '-t', String(maxDur),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            outputPath
        );

        console.log('[render-video-with-subtitles] Executing FFmpeg:', ffmpegPath, args.join(' '));

        const cleanupTempAss = () => {
            if (assFilePath && fs.existsSync(assFilePath)) {
                try { fs.unlinkSync(assFilePath); } catch (e) {}
            }
        };

        return new Promise((resolve) => {
            const child = spawn(ffmpegPath, args);
            let stderrData = '';
            child.stderr.on('data', (d) => {
                stderrData += d.toString();
            });
            child.on('close', (code) => {
                cleanupTempAss();
                if (code === 0) {
                    console.log('[render-video-with-subtitles] Xuất video thành công:', outputPath);
                    resolve({ success: true, outputPath });
                } else {
                    console.error('[render-video-with-subtitles] FFmpeg args:', args.join(' '));
                    console.error('[render-video-with-subtitles] Lỗi FFmpeg:', stderrData);
                    resolve({ success: false, error: `FFmpeg exited with code ${code}: ${stderrData.slice(-1200)}` });
                }
            });
            child.on('error', (err) => {
                cleanupTempAss();
                resolve({ success: false, error: err.message });
            });
        });
    } catch (e) {
        console.error('[render-video-with-subtitles] Exception:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle("get-ai-agent-context", async () => {
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const contextPath = path.join(userPluginsDir, "ai-agent-context.md");
        if (fs.existsSync(contextPath)) {
            const content = fs.readFileSync(contextPath, 'utf-8');
            return { success: true, content: content };
        }
        return { success: false, error: "Context file not found" };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * 2. Hàm chụp màn hình App (Full window screenshot)
 */
ipcMain.handle("capture-app", async (event, args) => {
    const { fileName, folder } = args;
    const win = BrowserWindow.getFocusedWindow();

    if (!win)
        return { success: false, error: "Không tìm thấy cửa sổ ứng dụng" };

    // 1. Chuẩn bị đư�?ng dẫn lưu file
    const docPath = app.getPath("documents");
    const saveDir = path.join(
        docPath,
        "ai.type",
        "data",
        "uploads",
        folder || "screenshots",
    );

    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }

    const finalFileName = fileName || `screenshot_${Date.now()}.png`;
    const filePath = path.join(saveDir, finalFileName);

    try {
        // C�?CH 1: Dùng Puppeteer để chụp FULL PAGE (Chất lượng cao, lấy hết chi�?u dài)
        // Kết nối vào chính trình duyệt Electron hiện tại qua port 9999
        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();

        // Kết nối Puppeteer
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null, // �?ể null để lấy đúng kích thước hiện tại
        });

        // Lấy danh sách các tab đang mở
        const pages = await browser.pages();

        // Tìm tab Main Window (Thư�?ng là tab không có uniqueID hoặc là tab đầu tiên)
        // Logic: Lấy tab có URL chứa localhost hoặc file:// và KHÔNG phải là devtools
        const page = pages.find((p) => {
            const u = p.url();
            return !u.startsWith("devtools://") && !u.includes("uniqueID=");
        });

        if (page) {
            // Inject CSS để ẩn thanh cuộn (scrollbars) cho đẹp nếu cần
            await page.addStyleTag({
                content: "body { overflow-y: hidden !important; }",
            });

            // Chụp Full Page
            await page.screenshot({
                path: filePath,
                fullPage: true, // <--- �?ÂY LÀ CHÌA KHO�? �?Ể CHỤP FULL HEIGHT
            });

            // Restore lại thanh cuộn (nếu cần)
            await page.addStyleTag({
                content: "body { overflow-y: auto !important; }",
            });

            await browser.disconnect();

            sendToRenderer(
                "tools-log",
                `[Screenshot] ✅ �?ã chụp Full Height: ${filePath}`,
            );
            return {
                success: true,
                path: filePath,
                url: `file:///${filePath.replace(/\\/g, "/")}`,
            };
        } else {
            // Nếu không tìm thấy page qua Puppeteer thì disconnect để fallback
            await browser.disconnect();
            throw new Error("Không tìm thấy Page qua Puppeteer");
        }
    } catch (e) {
        // C�?CH 2: FALLBACK (Dự phòng)
        // Nếu lỗi Puppeteer thì dùng cách cũ chụp Viewport
        sendToRenderer(
            "tools-log",
            `[Screenshot] ⚠�? Lỗi Puppeteer (${e.message}), chuyển sang chụp Viewport.`,
        );

        try {
            const image = await win.capturePage();
            const buffer = image.toPNG();
            fs.writeFileSync(filePath, buffer);
            return {
                success: true,
                path: filePath,
                url: `file:///${filePath.replace(/\\/g, "/")}`,
            };
        } catch (err2) {
            console.error("Lỗi chụp màn hình:", err2);
            return { success: false, error: err2.message };
        }
    }
});

// ===== GLOBAL WINDOW.OPEN HANDLER =====
app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
        try {
            if (url.startsWith("http://localhost:7171")) {
                sendToRenderer(
                    "tools-log",
                    `[WindowOpenHandler] Mở Chrome app cho URL: ${url}`,
                );
                openChromeApp(url);
                return { action: "deny" };
            }
        } catch (e) {
            sendToRenderer(
                "tools-log",
                `[WindowOpenHandler] Lỗi khi xử lý window.open(${url}): ${e.message}`,
            );
        }
        return { 
            action: "allow",
            overrideBrowserWindowOptions: {
                width: 1024,
                height: 800,
                title: 'Loading...'
            }
        };
    });

    contents.on('did-create-window', (window, details) => {
        window.webContents.on('page-title-updated', (e, title) => {
            if (window && !window.isDestroyed()) {
                window.setTitle(title);
            }
        });
    });
});

// ============================================================
// [CẬP NHẬT] SERVER PHỤC VỤ CHROME APP STT (PORT 7171)
// ============================================================
function startSttServer() {
    const sttApp = express();
    const port = 7171;

    const sttHtmlContent = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="referrer" content="no-referrer">
    <title>AI.Type - STT Player</title>
    
    <link rel="icon" href="https://cdn-icons-png.flaticon.com/512/1082/1082453.png">

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        /* Reset CSS */
        body { margin: 0; background: #000; color: #0f0; font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
        
        /* [2] CUSTOM SCROLLBAR CHO �?ẸP */
        ::-webkit-scrollbar {
            width: 8px; /* �?ộ rộng thanh cuộn */
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #111; /* Màu n�?n đư�?ng ray */
        }
        ::-webkit-scrollbar-thumb {
            background: #333; /* Màu thanh kéo */
            border-radius: 4px; /* Bo tròn */
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #555; /* Màu khi di chuột vào */
        }

        /* Container Video */
        .video-wrapper { 
            flex: 1; 
            background: #000; 
            position: relative; 
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        video { 
            width: 100%; 
            height: 100%; 
            max-height: 100vh;
            object-fit: contain;
            z-index: 1;
        }

        /* Khu vực Logs */
        #logs { 
            height: 150px; 
            padding: 10px; 
            overflow-y: auto; /* Scrollbar sẽ hiện ở đây */
            background: #111; 
            border-top: 1px solid #333; 
            font-size: 14px; 
            line-height: 1.5; 
            z-index: 2;
        }

        .log-line { margin-bottom: 4px; border-bottom: 1px dashed #222; padding-bottom: 2px; }
        .final { color: #4ade80; font-weight: bold; }
        .interim { color: #facc15; font-style: italic; opacity: 0.7; }
        .err { color: #ef4444; }
        .info { color: #60a5fa; }
    </style>
</head>
<body>
    <div class="video-wrapper">
        <video id="video" controls playsinline autoplay muted></video>
    </div>
    <div id="logs"></div>

    <script>
        const video = document.getElementById('video');
        const logs = document.getElementById('logs');
        let ws, recognition, hls;

        function processText(text) {
            if (!text) return '';
            let s = text.trim();
            s = s.charAt(0).toUpperCase() + s.slice(1);
            s = s.replace(/ phẩy/gi, ',');
            s = s.replace(/ chấm/gi, '.');
            const lastChar = s.slice(-1);
            if (!['.', '?', '!', ';', ','].includes(lastChar)) s += '.';
            return s;
        }

        function log(msg, type='') {
            const d = document.createElement('div');
            d.className = 'log-line ' + type;
            d.textContent = msg;
            logs.appendChild(d);
            logs.scrollTop = logs.scrollHeight;
        }

        function connectWs() {
            ws = new WebSocket('ws://127.0.0.1:7777');
            ws.onopen = () => { log('✅ Kết nối WS thành công', 'info'); ws.send(JSON.stringify({type:'hello', role:'chrome'})); };
            ws.onclose = () => setTimeout(connectWs, 2000);
            ws.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data);
                    if (d.type === 'set-source') loadVideo(d.source);
                } catch{}
            };
        }

        function startStt() {
            if (!window.webkitSpeechRecognition) return log('❌ Trình duyệt không hỗ trợ STT', 'err');
            
            const initRecognition = () => {
                if (recognition) {
                    try { recognition.abort(); } catch(e){}
                }
                recognition = new webkitSpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'vi-VN';

                recognition.onstart = () => log('🎙️ STT đang lắng nghe tiếng...', 'info');
                recognition.onerror = (e) => {
                    if (e.error !== 'no-speech') log('⚠️ Lỗi Mic: ' + e.error, 'err');
                    if (e.error === 'not-allowed' || e.error === 'audio-capture') {
                        setTimeout(() => {
                            try { recognition.start(); } catch(err) { initRecognition(); }
                        }, 1000);
                    }
                };
                recognition.onend = () => setTimeout(() => {
                    try { recognition.start(); } catch(err) { initRecognition(); }
                }, 800);
                
                recognition.onresult = (e) => {
                    let finalRaw = '';
                    let interimRaw = '';
                    for (let i = e.resultIndex; i < e.results.length; ++i) {
                        if (e.results[i].isFinal) finalRaw += e.results[i][0].transcript;
                        else interimRaw += e.results[i][0].transcript;
                    }
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        if (finalRaw) {
                            const processedFinal = processText(finalRaw);
                            ws.send(JSON.stringify({ type:'caption', text: processedFinal, isFinal: true, source: video.src }));
                            log('💬 ' + processedFinal, 'final');
                        }
                        if (interimRaw) {
                            ws.send(JSON.stringify({ type:'caption', text: interimRaw, isFinal: false, source: video.src }));
                        }
                    }
                };
                try { recognition.start(); } catch(e) {
                    setTimeout(initRecognition, 1000);
                }
            };

            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
                    log('🎙️ Micro đã sẵn sàng', 'info');
                }).catch((err) => {
                    log('ℹ️ getUserMedia: ' + err.message, 'info');
                }).finally(() => {
                    initRecognition();
                });
            } else {
                initRecognition();
            }
        }

        function loadVideo(url) {
            log('▶? ?ang tải nguồn: ' + url, 'info');
            if(hls) { hls.destroy(); hls = null; }

            if (Hls.isSupported()) {
                hls = new Hls({ debug: false, enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('✅ ?ã nhận tín hiệu Video', 'info');
                    video.muted = false; 
                    video.play().catch(() => {
                        video.muted = true; 
                        video.play();
                    });
                });
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                            case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
                            default: hls.destroy(); break;
                        }
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                video.addEventListener('loadedmetadata', () => video.play());
            }
        }

        function startStt() {
            if (!window.webkitSpeechRecognition) return log('�?� Trình duyệt không hỗ trợ STT', 'err');
            
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'vi-VN';

            recognition.onstart = () => log('🎙�? STT đang lắng nghe...', 'info');
            recognition.onerror = (e) => { if (e.error !== 'no-speech') log('⚠�? Lỗi Mic: ' + e.error, 'err'); };
            recognition.onend = () => setTimeout(() => { try{recognition.start()}catch{} }, 1000);
            
            recognition.onresult = (e) => {
                let finalRaw = '';
                let interimRaw = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) finalRaw += e.results[i][0].transcript;
                    else interimRaw += e.results[i][0].transcript;
                }
                if (ws && ws.readyState === WebSocket.OPEN) {
                    if (finalRaw) {
                        const processedFinal = processText(finalRaw);
                        ws.send(JSON.stringify({ type:'caption', text: processedFinal, isFinal: true, source: video.src }));
                        log('�? ' + processedFinal, 'final');
                    }
                    if (interimRaw) {
                        ws.send(JSON.stringify({ type:'caption', text: interimRaw, isFinal: false, source: video.src }));
                    }
                }
            };
            try { recognition.start(); } catch{}
        }

        window.onload = () => {
            connectWs();
            startStt();
            const p = new URLSearchParams(location.search);
            if(p.get('source')) loadVideo(p.get('source'));
        };
    </script>
</body>
</html>
    `;

    sttApp.get("/", (req, res) => {
        res.send(sttHtmlContent);
    });

    const server = sttApp.listen(port, () => {
        sendToRenderer(
            "tools-log",
            `[STT-Server] Server running at http://localhost:${port}`,
        );
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[STT-Server] Cổng ${port} đang bị chiếm, thử d�?n dẹp...`);
            killPort(port);
            setTimeout(() => {
                server.close();
                server.listen(port);
            }, 1000);
        } else {
            console.error(`[STT-Server] Lỗi không xác định:`, err);
        }
    });
}

// --- MULTIMODAL AI AGENT ---
let aiAgentProcess = null;
const aiAgentConfigPath = path.join(app.getPath('userData'), 'ai_agent_config.json');

// Config này chứa Secret API Key + token proxy Anthropic/Umodelverse, nên phải mã hóa
// trước khi ghi ra đĩa (safeStorage dùng keychain/DPAPI/libsecret của OS, không phải mã hóa tự chế).
// File cũ (chưa có "encrypted") vẫn đọc được để không phá cấu hình có sẵn của user.
function readAiAgentConfig() {
    try {
        if (!fs.existsSync(aiAgentConfigPath)) return {};
        const raw = fs.readFileSync(aiAgentConfigPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.encrypted === 'string') {
            if (!safeStorage.isEncryptionAvailable()) {
                console.error('[AI Agent] Không thể giải mã config: safeStorage không khả dụng trên hệ thống này.');
                return {};
            }
            const decrypted = safeStorage.decryptString(Buffer.from(parsed.encrypted, 'base64'));
            return JSON.parse(decrypted);
        }
        return parsed;
    } catch (e) {
        console.error('[AI Agent] Lỗi đọc config:', e);
        return {};
    }
}

function writeAiAgentConfig(data) {
    if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(JSON.stringify(data)).toString('base64');
        fs.writeFileSync(aiAgentConfigPath, JSON.stringify({ encrypted }), 'utf8');
    } else {
        console.warn('[AI Agent] safeStorage không khả dụng, lưu config dạng plaintext (không mã hóa được).');
        fs.writeFileSync(aiAgentConfigPath, JSON.stringify(data), 'utf8');
    }
}

function isAiAgentEnabled() {
    try {
        const data = readAiAgentConfig();
        return data.enable === true;
    } catch (err) { }
    return false;
}

function startAiAgent() {
    if (aiAgentProcess) return;
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const agentPath = path.join(userPluginsDir, 'ai_agent_linux');
        if (fs.existsSync(agentPath)) {
            let args = [];
            const agentEnv = { ...process.env };
            try {
                const data = readAiAgentConfig();
                // Truyền secret qua biến môi trường của subprocess, KHÔNG qua argv, để tránh
                // hiện trong `ps`/`/proc/<pid>/cmdline` (ai đọc được cmdline trên máy là lấy được token).
                if (data.apiKey) agentEnv.AI_AGENT_API_KEY = data.apiKey;
                // Umodelverse (Mì Tôm AI) proxy: lấy từ settings tài khoản (API /user/profile),
                // dùng để `claude` CLI xác thực qua proxy khi model được chọn là Claude.
                if (data.umodelverseKey) agentEnv.ANTHROPIC_AUTH_TOKEN = data.umodelverseKey;
                if (data.umodelverseUrl) {
                    agentEnv.ANTHROPIC_BASE_URL = data.umodelverseUrl.replace(/\/v1\/?$/, '');
                }
            } catch(e) {}
            // Using inherit or pipe to see errors in Electron console
            aiAgentProcess = spawn(agentPath, args, { stdio: 'pipe', env: agentEnv });
            
            aiAgentProcess.stdout.on('data', (data) => console.log(`[AI Agent] ${data}`));
            aiAgentProcess.stderr.on('data', (data) => console.error(`[AI Agent] ${data}`));
            
            aiAgentProcess.on('error', (err) => {
                console.error('[AI Agent] Lỗi khởi chạy:', err);
                aiAgentProcess = null;
            });
            
            aiAgentProcess.on('exit', (code) => {
                console.log(`[AI Agent] Đã thoát với mã ${code}`);
                aiAgentProcess = null;
            });
            
            console.log('[AI Agent] Đã khởi chạy tại port 54321');
        } else {
            console.warn('[AI Agent] Không tìm thấy file thực thi:', agentPath);
        }
    } catch (e) {
        console.error('[AI Agent] Lỗi start:', e);
    }
}

function stopAiAgent() {
    try {
        // Luôn gọi shutdown API kể cả khi aiAgentProcess = null (zombie)
        const http = require('http');
        const req = http.get('http://127.0.0.1:54321/api/shutdown', (res) => {});
        req.on('error', () => {});
    } catch (e) { }

    if (aiAgentProcess) {
        try {
            aiAgentProcess.kill('SIGKILL');
            aiAgentProcess = null;
        } catch (e) { }
    }
    
    // Fallback dọn dẹp port 54321
    try {
        const cp = require('child_process');
        if (process.platform === 'win32') {
            cp.exec('netstat -ano | findstr :54321', (err, stdout) => {
                if (stdout) {
                    const lines = stdout.trim().split('\n');
                    for (const line of lines) {
                        const parts = line.trim().split(/\s+/);
                        const pid = parts[parts.length - 1];
                        if (pid && pid !== '0') cp.exec(`taskkill /f /pid ${pid}`);
                    }
                }
            });
        } else {
            cp.exec('fuser -k 54321/tcp');
            cp.exec('killall -9 ai_agent_linux');
        }
    } catch (e) {}
    
    console.log('[AI Agent] Đã tắt');
}

ipcMain.handle('toggle-ai-agent', (event, enable, apiKey, extra) => {
    try {
        const configData = { enable };
        if (apiKey) configData.apiKey = apiKey;
        if (extra && extra.umodelverseUrl) configData.umodelverseUrl = extra.umodelverseUrl;
        if (extra && extra.umodelverseKey) configData.umodelverseKey = extra.umodelverseKey;
        writeAiAgentConfig(configData);
        if (enable) {
            if (aiAgentProcess) {
                stopAiAgent();
                setTimeout(startAiAgent, 300);
            } else {
                startAiAgent();
            }
        } else {
            stopAiAgent();
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('is-ai-agent-active', async () => {
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const agentPath = path.join(userPluginsDir, 'ai_agent_linux');
        const exists = fs.existsSync(agentPath);
        const enabled = isAiAgentEnabled();
        let apiKey = 'type-vn-local-agent-2026';
        try {
            const data = readAiAgentConfig();
            if (data.apiKey) apiKey = data.apiKey;
        } catch(e) {}
        return { exists, enabled, active: exists && enabled, apiKey };
    } catch (e) {
        return { exists: false, enabled: false, active: false };
    }
});

// --- COLAB GPU AGENT PLUGIN ---
let colabAgentProcess = null;

function isColabAgentEnabled() {
    try {
        const configPath = path.join(os.homedir(), "Documents", "ai.type", "data", "colab", "agent_config.json");
        if (fs.existsSync(configPath)) {
            const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            return data.enable !== false;
        }
    } catch(e) {}
    return true;
}

function startColabAgent() {
    if (colabAgentProcess) return;
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const binaryPath = path.join(userPluginsDir, 'colab_agent_linux');
        const devBinaryPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'dist', 'colab_agent_linux');
        const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'colab_agent.py');
        
        let execPath = null;
        let args = ['--port', '7868'];

        if (fs.existsSync(devScriptPath)) {
            execPath = 'python3';
            args = [devScriptPath, '--port', '7868'];
        } else if (fs.existsSync(binaryPath)) {
            execPath = binaryPath;
        } else if (fs.existsSync(devBinaryPath)) {
            execPath = devBinaryPath;
        }

        if (execPath) {
            colabAgentProcess = spawn(execPath, args, { stdio: 'pipe' });
            colabAgentProcess.stdout.on('data', (data) => console.log(`[Colab Agent Plugin] ${data}`));
            colabAgentProcess.stderr.on('data', (data) => console.error(`[Colab Agent Plugin] ${data}`));
            colabAgentProcess.on('exit', () => { colabAgentProcess = null; });
            console.log('[Colab Agent Plugin] Đã khởi chạy tại http://127.0.0.1:7868');
        }
    } catch (e) {
        console.error('[Colab Agent Plugin] Lỗi start:', e);
    }
}

function stopColabAgent() {
    if (colabAgentProcess) {
        try {
            colabAgentProcess.kill('SIGKILL');
            colabAgentProcess = null;
        } catch (e) {}
    }
    try {
        const cp = require('child_process');
        if (process.platform !== 'win32') {
            cp.exec('fuser -k 7868/tcp');
            cp.exec('killall -9 colab_agent_linux');
        }
    } catch (e) {}
    console.log('[Colab Agent Plugin] Đã dừng');
}

// --- ZALO AUTO REPLY PLUGIN ---
let zaloPluginProcess = null;
const zaloPluginConfigPath = path.join(app.getPath('userData'), 'zalo_plugin_config.json');

function isZaloPluginEnabled() {
    if (fs.existsSync(zaloPluginConfigPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(zaloPluginConfigPath, 'utf8'));
            return !!data.enable;
        } catch (e) {
            return false;
        }
    }
    return false;
}

function getZaloPluginMode() {
    if (fs.existsSync(zaloPluginConfigPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(zaloPluginConfigPath, 'utf8'));
            return data.mode || 'tool';
        } catch (e) {
            return 'tool';
        }
    }
    return 'tool';
}

let zaloPluginRestartCount = 0;
let zaloPluginRestartTimeout = null;

function startZaloPlugin() {
    if (zaloPluginProcess) return;
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const userBinaryPath = path.join(userPluginsDir, 'zalo_auto_reply_linux');
        const devBinaryPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'zalop', 'dist', 'zalo_auto_reply_linux');
        const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'zalop', 'zalo_auto_reply.py');

        let binaryPath = '';
        let cmd = '';
        let args = [];

        if (fs.existsSync(userBinaryPath)) {
            binaryPath = userBinaryPath;
            cmd = binaryPath;
        } else if (fs.existsSync(devBinaryPath)) {
            binaryPath = devBinaryPath;
            cmd = binaryPath;
        } else if (fs.existsSync(devScriptPath)) {
            cmd = 'python3';
            args = [devScriptPath];
        }

        if (cmd) {
            zaloPluginProcess = spawn(cmd, args, { stdio: 'pipe' });
            console.log(`[Zalo Plugin] Khởi chạy: ${cmd} ${args.join(' ')}`);

            zaloPluginProcess.stdout.on('data', (data) => console.log(`[Zalo Plugin] ${data}`));
            zaloPluginProcess.stderr.on('data', (data) => console.error(`[Zalo Plugin] ${data}`));

            zaloPluginProcess.on('error', (err) => {
                console.error('[Zalo Plugin] Lỗi khởi chạy:', err);
                zaloPluginProcess = null;
            });

            zaloPluginProcess.on('exit', (code) => {
                console.log(`[Zalo Plugin] Đã thoát với mã ${code}`);
                zaloPluginProcess = null;

                if (isZaloPluginEnabled() && zaloPluginRestartCount < 5) {
                    zaloPluginRestartCount++;
                    console.log(`[Zalo Plugin] Đang thử khởi động lại lần thứ ${zaloPluginRestartCount}/5 sau 3 giây...`);
                    if (zaloPluginRestartTimeout) clearTimeout(zaloPluginRestartTimeout);
                    zaloPluginRestartTimeout = setTimeout(() => {
                        startZaloPlugin();
                    }, 3000);
                } else if (zaloPluginRestartCount >= 5) {
                    console.error('[Zalo Plugin] Khởi động lại thất bại quá 5 lần. Dừng lại.');
                }
            });

            // Reset restart count if runs successfully for 10 seconds
            setTimeout(() => {
                if (zaloPluginProcess && !zaloPluginProcess.killed) {
                    zaloPluginRestartCount = 0;
                }
            }, 10000);
        } else {
            console.warn('[Zalo Plugin] Không tìm thấy file nguồn cài đặt plugin.');
        }
    } catch (e) {
        console.error('[Zalo Plugin] Lỗi start:', e);
    }
}

function stopZaloPlugin() {
    if (zaloPluginProcess) {
        try {
            zaloPluginProcess.kill('SIGKILL');
            zaloPluginProcess = null;
            console.log('[Zalo Plugin] Đã tắt');
        } catch (e) {}
    }
}

ipcMain.handle('toggle-zalo-plugin', (event, enable, mode) => {
    try {
        const targetMode = mode || 'tool';
        fs.writeFileSync(zaloPluginConfigPath, JSON.stringify({ enable, mode: targetMode }), 'utf8');
        if (enable) {
            startZaloPlugin();
        } else {
            stopZaloPlugin();
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- 100 TIKTOKERS PLUGIN ---
let tiktokPluginProcess = null;
const tiktokPluginConfigPath = path.join(app.getPath('userData'), 'tiktok_plugin_config.json');

function isTiktokPluginEnabled() {
    if (fs.existsSync(tiktokPluginConfigPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(tiktokPluginConfigPath, 'utf8'));
            return !!data.enable;
        } catch (e) {
            return false;
        }
    }
    return false;
}

let tiktokPluginRestartCount = 0;
let tiktokPluginRestartTimeout = null;

function startTiktokPlugin() {
    if (tiktokPluginProcess) return;
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const candidateBinaries = [
            path.join(userPluginsDir, '100tiktok-linux'),
            path.join(userPluginsDir, '100tiktok_linux'),
            path.join(userPluginsDir, '100tiktok.exe'),
            path.join(userPluginsDir, '100tiktok'),
            path.join(userPluginsDir, '100tiktok-mac'),
            path.join(userPluginsDir, '100tiktok-windows.exe')
        ];
        
        let binaryPath = candidateBinaries.find(p => fs.existsSync(p));
        let cmd = '';
        let args = [];

        if (binaryPath) {
            try {
                fs.chmodSync(binaryPath, 0o755);
            } catch(e) {}
            cmd = binaryPath;
        } else {
            const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', '100 tiktokers', 'app.py');
            const devDistPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', '100 tiktokers', 'dist', '100tiktok-linux');
            if (fs.existsSync(devDistPath)) {
                cmd = devDistPath;
            } else if (fs.existsSync(devScriptPath)) {
                cmd = 'python3';
                args = [devScriptPath];
            }
        }

        if (cmd) {
            killPort(8000);
            tiktokPluginProcess = spawn(cmd, args, { stdio: 'pipe' });
            console.log(`[100 TikTokers Plugin] Khởi chạy: ${cmd} ${args.join(' ')}`);

            tiktokPluginProcess.stdout.on('data', (data) => console.log(`[100 TikTokers Plugin] ${data}`));
            tiktokPluginProcess.stderr.on('data', (data) => console.error(`[100 TikTokers Plugin] ${data}`));

            tiktokPluginProcess.on('error', (err) => {
                console.error('[100 TikTokers Plugin] Lỗi khởi chạy:', err);
                tiktokPluginProcess = null;
            });

            tiktokPluginProcess.on('exit', (code) => {
                console.log(`[100 TikTokers Plugin] Đã thoát với mã ${code}`);
                tiktokPluginProcess = null;

                if (isTiktokPluginEnabled() && tiktokPluginRestartCount < 5) {
                    tiktokPluginRestartCount++;
                    console.log(`[100 TikTokers Plugin] Đang thử khởi động lại lần thứ ${tiktokPluginRestartCount}/5 sau 3 giây...`);
                    if (tiktokPluginRestartTimeout) clearTimeout(tiktokPluginRestartTimeout);
                    tiktokPluginRestartTimeout = setTimeout(() => {
                        startTiktokPlugin();
                    }, 3000);
                } else if (tiktokPluginRestartCount >= 5) {
                    console.error('[100 TikTokers Plugin] Khởi động lại thất bại quá 5 lần. Dừng lại.');
                }
            });

            setTimeout(() => {
                if (tiktokPluginProcess && !tiktokPluginProcess.killed) {
                    tiktokPluginRestartCount = 0;
                }
            }, 10000);
        } else {
            console.warn('[100 TikTokers Plugin] Không tìm thấy file 100tiktok-linux trong Documents/ai.type/plugins.');
        }
    } catch (e) {
        console.error('[100 TikTokers Plugin] Lỗi start:', e);
    }
}

function stopTiktokPlugin() {
    if (tiktokPluginProcess) {
        try {
            tiktokPluginProcess.kill('SIGKILL');
            tiktokPluginProcess = null;
            console.log('[100 TikTokers Plugin] Đã tắt');
        } catch (e) {}
    }
    killPort(8000);
}

ipcMain.handle('toggle-tiktok-plugin', (event, enable) => {
    try {
        fs.writeFileSync(tiktokPluginConfigPath, JSON.stringify({ enable }), 'utf8');
        if (enable) {
            startTiktokPlugin();
        } else {
            stopTiktokPlugin();
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-plugins-status', async (event) => {
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        
        // Zalo Reply Plugin
        const userBinaryPath = path.join(userPluginsDir, 'zalo_auto_reply_linux');
        const devBinaryPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'zalop', 'dist', 'zalo_auto_reply_linux');
        const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'zalop', 'zalo_auto_reply.py');
        const installed = fs.existsSync(userBinaryPath);
        const canInstall = fs.existsSync(devBinaryPath) || fs.existsSync(devScriptPath);
        const enabled = isZaloPluginEnabled();
        
        // AI Agent Plugin
        const userAgentPath = path.join(userPluginsDir, 'ai_agent_linux');
        const agentInstalled = fs.existsSync(userAgentPath);
        const agentEnabled = isAiAgentEnabled();
        let agentApiKey = 'type-vn-local-agent-2026';
        try {
            const data = readAiAgentConfig();
            if (data.apiKey) agentApiKey = data.apiKey;
        } catch(e) {}

        // Colab Agent Plugin
        const userColabPath = path.join(userPluginsDir, 'colab_agent_linux');
        const devColabBinary = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'dist', 'colab_agent_linux');
        const devColabScript = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'colab_agent.py');
        const colabInstalled = fs.existsSync(userColabPath);
        const colabCanInstall = fs.existsSync(devColabBinary) || fs.existsSync(devColabScript);
        const colabEnabled = isColabAgentEnabled();
        let colabVersion = '1.0.1';
        try {
            const cp = require('child_process');
            let binToProbe = null;
            if (fs.existsSync(userColabPath)) binToProbe = userColabPath;
            else if (fs.existsSync(devColabBinary)) binToProbe = devColabBinary;

            if (binToProbe) {
                const out = cp.execFileSync(binToProbe, ['--version'], { timeout: 1500, encoding: 'utf8' });
                if (out && out.trim()) {
                    colabVersion = out.trim().split(/\s+/).pop();
                }
            } else {
                const manifestPath = path.join(userPluginsDir, 'colab_agent.json');
                if (fs.existsSync(manifestPath)) {
                    colabVersion = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).version || colabVersion;
                }
            }
        } catch(e) {}

        return [
            {
                id: 'zalo_reply',
                name: 'Quản lý Zalo',
                description: 'Tự động đọc và trả lời tin nhắn Zalo thông minh.',
                installed,
                canInstall,
                enabled,
                mode: getZaloPluginMode(),
                version: '1.0'
            },
            {
                id: 'ai_agent',
                name: 'AI Agent',
                description: 'Hỗ trợ viết kịch bản phim, sinh nội dung và tự động hóa tác vụ AI.',
                installed: agentInstalled,
                canInstall: false, // User installs manually by copying file
                enabled: agentEnabled,
                apiKey: agentApiKey,
                version: '1.0'
            },
            {
                id: 'colab_agent',
                name: 'Colab GPU Agent',
                description: 'Tự động hóa kết nối Google Colab GPU, bóc tách MinerU và thực thi code từ xa.',
                installed: colabInstalled,
                canInstall: colabCanInstall,
                enabled: colabEnabled,
                version: colabVersion
            },
            {
                id: 'tiktok_100',
                name: '100 TikTokers',
                description: 'Tự động hóa theo dõi, phân tích xu hướng và khai thác nội dung từ 100 kênh TikTok.',
                installed: [
                    path.join(userPluginsDir, '100tiktok-linux'),
                    path.join(userPluginsDir, '100tiktok_linux'),
                    path.join(userPluginsDir, '100tiktok.exe'),
                    path.join(userPluginsDir, '100tiktok')
                ].some(p => fs.existsSync(p)),
                canInstall: false,
                enabled: isTiktokPluginEnabled(),
                version: '1.0'
            }
        ];
    } catch (e) {
        return [];
    }
});

ipcMain.handle('install-plugin', async (event, pluginId) => {
    try {
        if (pluginId === 'zalo_reply') {
            const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
            fs.mkdirSync(userPluginsDir, { recursive: true });
            
            const userBinaryPath = path.join(userPluginsDir, 'zalo_auto_reply_linux');
            const devBinaryPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'zalop', 'dist', 'zalo_auto_reply_linux');
            const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'zalop', 'zalo_auto_reply.py');
            
            if (fs.existsSync(devBinaryPath)) {
                fs.copyFileSync(devBinaryPath, userBinaryPath);
                return { success: true, message: 'Đã cài đặt plugin thành công!' };
            } else if (fs.existsSync(devScriptPath)) {
                const destScriptPath = path.join(userPluginsDir, 'zalo_auto_reply.py');
                fs.copyFileSync(devScriptPath, destScriptPath);
                return { success: true, message: 'Đã sao chép tệp mã nguồn vào Documents/ai.type/plugins!' };
            }
            return { success: false, error: 'Không tìm thấy file nguồn cài đặt plugin.' };
        } else if (pluginId === 'ai_agent') {
            return { success: true, message: 'Plugin AI Agent đã sẵn sàng. Hãy copy file ai_agent_linux vào thư mục plugins.' };
        } else if (pluginId === 'colab_agent') {
            const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
            fs.mkdirSync(userPluginsDir, { recursive: true });
            
            const userBinaryPath = path.join(userPluginsDir, 'colab_agent_linux');
            const devBinaryPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'dist', 'colab_agent_linux');
            const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'colab_agent.py');
            
            if (fs.existsSync(devBinaryPath)) {
                fs.copyFileSync(devBinaryPath, userBinaryPath);
                fs.chmodSync(userBinaryPath, 0o755);
                startColabAgent();
                return { success: true, message: 'Đã cài đặt Colab GPU Agent thành công!' };
            } else if (fs.existsSync(devScriptPath)) {
                const destScriptPath = path.join(userPluginsDir, 'colab_agent.py');
                fs.copyFileSync(devScriptPath, destScriptPath);
                fs.chmodSync(destScriptPath, 0o755);
                startColabAgent();
                return { success: true, message: 'Đã sao chép mã nguồn Colab Agent vào Documents/ai.type/plugins!' };
            }
            return { success: false, error: 'Không tìm thấy file nguồn Colab Agent.' };
        }
        return { success: false, error: 'Plugin không xác định.' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('uninstall-plugin', async (event, pluginId) => {
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        if (pluginId === 'zalo_reply') {
            const userBinaryPath = path.join(userPluginsDir, 'zalo_auto_reply_linux');
            const userScriptPath = path.join(userPluginsDir, 'zalo_auto_reply.py');
            
            stopZaloPlugin();
            stopZaloBackgroundWindow();
            if (targetWindow && !targetWindow.isDestroyed() && targetWindow.webContents.getURL().includes("zalo.me")) {
                targetWindow.destroy();
            }
            
            if (fs.existsSync(userBinaryPath)) {
                fs.unlinkSync(userBinaryPath);
            }
            if (fs.existsSync(userScriptPath)) {
                fs.unlinkSync(userScriptPath);
            }
            fs.writeFileSync(zaloPluginConfigPath, JSON.stringify({ enable: false, mode: 'tool' }), 'utf8');
            return { success: true, message: 'Đã gỡ cài đặt plugin thành công!' };
        } else if (pluginId === 'ai_agent') {
            const userAgentPath = path.join(userPluginsDir, 'ai_agent_linux');
            stopAiAgent();
            if (fs.existsSync(userAgentPath)) {
                fs.unlinkSync(userAgentPath);
            }
            writeAiAgentConfig({ enable: false });
            return { success: true, message: 'Đã gỡ cài đặt plugin thành công!' };
        } else if (pluginId === 'colab_agent') {
            const userColabPath = path.join(userPluginsDir, 'colab_agent_linux');
            const userScriptPath = path.join(userPluginsDir, 'colab_agent.py');
            stopColabAgent();
            if (fs.existsSync(userColabPath)) {
                fs.unlinkSync(userColabPath);
            }
            if (fs.existsSync(userScriptPath)) {
                fs.unlinkSync(userScriptPath);
            }
            return { success: true, message: 'Đã gỡ cài đặt Colab Agent thành công!' };
        } else if (pluginId === 'tiktok_100') {
            stopTiktokPlugin();
            const candidateBinaries = [
                path.join(userPluginsDir, '100tiktok-linux'),
                path.join(userPluginsDir, '100tiktok_linux'),
                path.join(userPluginsDir, '100tiktok.exe'),
                path.join(userPluginsDir, '100tiktok')
            ];
            candidateBinaries.forEach(p => {
                if (fs.existsSync(p)) {
                    try { fs.unlinkSync(p); } catch(e) {}
                }
            });
            fs.writeFileSync(tiktokPluginConfigPath, JSON.stringify({ enable: false }), 'utf8');
            return { success: true, message: 'Đã gỡ cài đặt plugin 100 TikTokers thành công!' };
        }
        return { success: false, error: 'Plugin không xác định.' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('toggle-colab-agent', (event, enable) => {
    try {
        const configDir = path.join(os.homedir(), "Documents", "ai.type", "data", "colab");
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, "agent_config.json");
        let cfg = {};
        if (fs.existsSync(configPath)) {
            try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch(e) {}
        }
        cfg.enable = enable;
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');

        if (enable) {
            startColabAgent();
        } else {
            stopColabAgent();
        }
        return { success: true };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

function readColabDiskAccounts() {
    try {
        const accountsJsonPath = path.join(os.homedir(), ".config", "colab-cli", "accounts", "accounts.json");
        const tokenPath = path.join(os.homedir(), ".config", "colab-cli", "token.json");
        let accounts = [];
        let activeEmail = '';
        if (fs.existsSync(accountsJsonPath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(accountsJsonPath, 'utf8'));
                accounts = parsed.accounts || [];
                activeEmail = parsed.active_email || '';
            } catch(e) {}
        }
        const hasToken = fs.existsSync(tokenPath);
        return {
            authenticated: hasToken && accounts.length > 0,
            token_path: tokenPath,
            accounts,
            active_email: activeEmail
        };
    } catch(e) {
        return { authenticated: false, accounts: [], active_email: '' };
    }
}

ipcMain.handle('get-colab-auth-status', async () => {
    try {
        try {
            const resp = await fetch('http://127.0.0.1:7868/auth_status');
            if (resp.ok) {
                const data = await resp.json();
                if (data && Array.isArray(data.accounts) && data.accounts.length > 0) {
                    return data;
                }
            }
        } catch(e) {}
        
        // Fallback đọc trực tiếp từ file trên ổ đĩa để danh sách tài khoản không bao giờ bị mất
        const diskData = readColabDiskAccounts();
        return diskData;
    } catch(e) {
        return readColabDiskAccounts();
    }
});

ipcMain.handle('switch-colab-account', async (event, email) => {
    try {
        try {
            const resp = await fetch('http://127.0.0.1:7868/switch_account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.success) return data;
            }
        } catch(e) {}

        // Fallback thực hiện đổi trực tiếp trên đĩa nếu daemon đang tắt
        const accountsDir = path.join(os.homedir(), ".config", "colab-cli", "accounts");
        const accountsJsonPath = path.join(accountsDir, "accounts.json");
        const targetTokenFile = path.join(accountsDir, `${email}.json`);
        const mainTokenFile = path.join(os.homedir(), ".config", "colab-cli", "token.json");

        if (fs.existsSync(targetTokenFile)) {
            fs.copyFileSync(targetTokenFile, mainTokenFile);
        }
        if (fs.existsSync(accountsJsonPath)) {
            const idx = JSON.parse(fs.readFileSync(accountsJsonPath, 'utf8'));
            idx.active_email = email;
            if (Array.isArray(idx.accounts)) {
                for (const acc of idx.accounts) {
                    acc.status = (acc.email === email) ? 'active' : 'ready';
                }
            }
            fs.writeFileSync(accountsJsonPath, JSON.stringify(idx, null, 2), 'utf8');
            return { success: true, active_email: email, accounts: idx.accounts || [] };
        }
        return { success: false, error: 'Không tìm thấy file cấu hình tài khoản.' };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('remove-colab-account', async (event, email) => {
    try {
        try {
            const resp = await fetch('http://127.0.0.1:7868/remove_account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            if (resp.ok) {
                const data = await resp.json();
                if (data && data.success) return data;
            }
        } catch(e) {}

        // Fallback thực hiện xóa trực tiếp trên đĩa nếu daemon đang tắt
        const accountsDir = path.join(os.homedir(), ".config", "colab-cli", "accounts");
        const accountsJsonPath = path.join(accountsDir, "accounts.json");
        const targetTokenFile = path.join(accountsDir, `${email}.json`);
        const mainTokenFile = path.join(os.homedir(), ".config", "colab-cli", "token.json");

        if (fs.existsSync(targetTokenFile)) {
            try { fs.unlinkSync(targetTokenFile); } catch(e) {}
        }
        if (fs.existsSync(accountsJsonPath)) {
            const idx = JSON.parse(fs.readFileSync(accountsJsonPath, 'utf8'));
            idx.accounts = (idx.accounts || []).filter(a => a.email !== email);
            if (idx.active_email === email) {
                if (idx.accounts.length > 0) {
                    const newActive = idx.accounts[0].email;
                    idx.active_email = newActive;
                    idx.accounts[0].status = 'active';
                    const newFile = path.join(accountsDir, `${newActive}.json`);
                    if (fs.existsSync(newFile)) {
                        fs.copyFileSync(newFile, mainTokenFile);
                    }
                } else {
                    idx.active_email = '';
                    if (fs.existsSync(mainTokenFile)) {
                        try { fs.unlinkSync(mainTokenFile); } catch(e) {}
                    }
                }
            }
            fs.writeFileSync(accountsJsonPath, JSON.stringify(idx, null, 2), 'utf8');
            return { success: true, active_email: idx.active_email || '', accounts: idx.accounts || [] };
        }
        return { success: true, active_email: '', accounts: [] };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('login-colab-google', async () => {
    try {
        const { shell } = require('electron');
        startColabAgent();
        
        // Đợi daemon sẵn sàng
        await new Promise(r => setTimeout(r, 600));

        let authUrl = null;
        try {
            const resp = await fetch('http://127.0.0.1:7868/auth_url');
            if (resp.ok) {
                const data = await resp.json();
                authUrl = data.auth_url;
            }
        } catch(e) {}

        if (!authUrl) {
            return { success: false, error: 'Không thể kết nối tới Colab Agent Daemon.' };
        }

        // Mở trình duyệt mặc định của hệ điều hành (Chrome/Firefox/Edge)
        await shell.openExternal(authUrl);

        return { success: true, authUrl };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('exchange-colab-code', async (event, code) => {
    try {
        if (!code || !code.trim()) {
            return { success: false, error: 'Mã xác thực không hợp lệ.' };
        }
        
        const resp = await fetch('http://127.0.0.1:7868/exchange_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim() })
        });

        const data = await resp.json();
        if (resp.ok && data.success) {
            return { success: true, message: 'Đã liên kết Google Colab thành công!' };
        } else {
            return { success: false, error: data?.error || 'Mã xác thực không hợp lệ hoặc phiên OAuth đã hết hạn.' };
        }
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('start-colab-gpu', async () => {
    try {
        if (!colabAgentProcess) {
            startColabAgent();
            await new Promise(r => setTimeout(r, 1500));
        }
        const resp = await fetch('http://127.0.0.1:7868/start_gpu', { method: 'POST' });
        if (resp.ok) {
            const data = await resp.json();
            if (data.success) {
                if (data.url) {
                    try {
                        await colabMcpClient.connect(data.url);
                    } catch (e) {}
                }
                return { success: true, message: 'Đã khởi chạy GPU Colab thành công!', url: data.url, gpu: data.gpu };
            } else {
                return { success: false, error: data.error || 'Lỗi khởi chạy GPU Colab.' };
            }
        }
        return { success: false, error: 'Không thể kết nối đến Colab Agent Plugin (cổng 7868).' };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('stop-colab-gpu', async () => {
    try {
        const resp = await fetch('http://127.0.0.1:7868/stop_gpu', { method: 'POST' });
        colabMcpClient.disconnect();
        if (resp.ok) {
            return { success: true, message: 'Đã dừng máy ảo Colab GPU.' };
        }
        return { success: false, error: 'Lỗi khi dừng GPU.' };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('check-colab-gpu-status', async () => {
    try {
        const userPluginsDir = path.join(os.homedir(), "Documents", "ai.type", "plugins");
        const userColabPath = path.join(userPluginsDir, 'colab_agent_linux');
        const userScriptPath = path.join(userPluginsDir, 'colab_agent.py');
        const devBinaryPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'dist', 'colab_agent_linux');
        const devScriptPath = path.join(__dirname, '..', '..', '..', 'apps', 'plugins', 'colab', 'colab_agent.py');
        const colabInstalled = fs.existsSync(userColabPath) || fs.existsSync(userScriptPath) || fs.existsSync(devBinaryPath) || fs.existsSync(devScriptPath);
        const colabEnabled = isColabAgentEnabled();
        const pluginActive = colabInstalled && colabEnabled;

        if (colabMcpClient && colabMcpClient.isConnected && colabMcpClient.baseUrl) {
            return { success: true, plugin_active: pluginActive, is_connected: true, colab_url: colabMcpClient.baseUrl };
        }
        const resp = await fetch('http://127.0.0.1:7868/status', { signal: AbortSignal.timeout(1500) });
        if (resp.ok) {
            const data = await resp.json();
            return {
                success: true,
                plugin_active: pluginActive,
                is_connected: !!(data && data.is_connected),
                colab_url: data?.colab_url || '',
                gpu: data?.gpu || ''
            };
        }
        return { success: true, plugin_active: pluginActive, is_connected: false };
    } catch(e) {
        return { success: false, plugin_active: false, is_connected: false, error: e.message };
    }
});

ipcMain.on('zalo-plugin:require-login', () => {
    // Không làm gì cả vì người dùng chỉ dùng trong Web Tools sidebar
});

ipcMain.on('zalo-plugin:login-success', () => {
    // Không làm gì cả vì người dùng chỉ dùng trong Web Tools sidebar
});

ipcMain.on('zalo-plugin:is-enabled', (event) => {
    event.returnValue = isZaloPluginEnabled();
});

app.on('will-quit', () => {
    stopAiAgent();
    stopZaloPlugin();
    stopColabAgent();
    stopTiktokPlugin();
    cleanupAllAppPortsSync();
});

app.whenReady().then(async () => {
    // Tự động dọn dẹp giải phóng toàn bộ các cổng liên quan trước khi khởi chạy
    cleanupAllAppPortsSync();

    if (isAiAgentEnabled()) {
        startAiAgent();
    }
    if (isZaloPluginEnabled()) {
        startZaloPlugin();
    }
    if (isColabAgentEnabled()) {
        startColabAgent();
    }
    if (isTiktokPluginEnabled()) {
        startTiktokPlugin();
    }

    startCrmServices();
    startFallbackServer();
    const resolveMediaPath = (originalUrl) => {
        let targetPath = '';
        let url = originalUrl;
        try { url = decodeURIComponent(url); } catch (e) {}

        if (url.toLowerCase().startsWith('smart_find/')) {
            const queryString = url.substring(url.indexOf('?') + 1);
            const params = new URLSearchParams(queryString);
            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\/\//i, '');
            originalPath = originalPath.split('?')[0].split('#')[0];
            const mediaDir = params.get('dir') || '';
            const uuid = params.get('uuid') || 'default';

            let basename = originalPath ? require('path').basename(originalPath).replace(/^\d{13}_/, '') : '';

            let testPath = originalPath;
            if (testPath) {
                const dm = testPath.match(/^([a-zA-Z])(:?)([\\/])/);
                if (dm && !dm[2]) {
                    testPath = dm[1].toUpperCase() + ':' + testPath.substring(1);
                }
                if (fs.existsSync(testPath)) return testPath;
                const rawBasename = require('path').basename(originalPath);
                if (rawBasename !== basename) {
                    const rawDir = require('path').dirname(testPath);
                    const rawPath = require('path').join(rawDir, rawBasename);
                    if (fs.existsSync(rawPath)) return rawPath;
                }
            }

            const docPath = app.getPath('documents');
            const ttsAdminDir = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin');
            const searchDirs = [];
            if (mediaDir) searchDirs.push(mediaDir);
            searchDirs.push(require('path').join(ttsAdminDir, uuid));
            if (fs.existsSync(ttsAdminDir)) {
                try {
                    const allDirs = fs.readdirSync(ttsAdminDir, { withFileTypes: true })
                        .filter(d => d.isDirectory() && d.name !== uuid)
                        .map(d => require('path').join(ttsAdminDir, d.name));
                    searchDirs.push(...allDirs);
                } catch (e) { /* ignore */ }
            }
            searchDirs.push(uploadsDir);

            for (const dir of searchDirs) {
                if (!fs.existsSync(dir)) continue;
                const directPath = require('path').join(dir, basename);
                if (fs.existsSync(directPath)) return directPath;
                try {
                    const files = fs.readdirSync(dir);
                    const match = files.find(f => f.endsWith(`_${basename}`) || f === basename);
                    if (match) return require('path').join(dir, match);
                } catch (e) { /* ignore */ }
            }
            targetPath = require('path').join(ttsAdminDir, uuid, basename);
            return targetPath;
        } else if (url.toLowerCase().startsWith('auto_find/')) {
            const rest = url.substring('auto_find/'.length);
            const parts = rest.split('/');
            const uuid = parts[0];
            const basename = parts.slice(1).join('/').split('?')[0].split('#')[0];
            const docPath = app.getPath('documents');
            targetPath = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin', uuid, basename);
        } else {
            let cleaned = url.split('?')[0].split('#')[0];
            if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
            const driveMatch = cleaned.match(/^([a-zA-Z])(:?)\//);
            if (driveMatch) {
                const driveLetter = driveMatch[1].toUpperCase();
                if (driveMatch[2] === ':') {
                    cleaned = driveLetter + cleaned.substring(1);
                } else {
                    cleaned = driveLetter + ':' + cleaned.substring(1);
                }
            } else {
                cleaned = '/' + cleaned;
            }
            targetPath = cleaned;
        }

        targetPath = require('path').normalize(targetPath);
        if (fs.existsSync(targetPath)) return targetPath;

        const dir = require('path').dirname(targetPath);
        const base = require('path').basename(targetPath);
        if (fs.existsSync(dir)) {
            try {
                const files = fs.readdirSync(dir);
                const match = files.find(f => f.endsWith(`_${base}`) || f === base);
                if (match) {
                    targetPath = require('path').join(dir, match);
                }
            } catch (e) {}
        }
        return targetPath;
    };

    // Native file protocol cho <img>, <video>, <audio> (Hỗ trợ stream, seeking hoàn hảo)
    protocol.registerFileProtocol('media', (request, callback) => {
        try {
            const url = request.url.replace(/^media:\/+/i, '');
            const targetPath = resolveMediaPath(url);
            return callback({ path: targetPath });
        } catch (error) {
            console.error('Lỗi protocol media:', error);
            return callback({ error: -2 }); // -2 is FAILED
        }
    });

    protocol.handle('mediacors', async (request) => {
        const url = request.url.replace('mediacors://', '');
        const targetPath = resolveMediaPath(url);

        try {
            const fileUrl = require('url').pathToFileURL(targetPath).toString();
            const response = await net.fetch(fileUrl, {
                headers: request.headers,
                method: request.method
            });
            const headers = new Headers(response.headers);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Access-Control-Allow-Headers', '*');

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: headers
            });
        } catch (error) {
            return new Response('Not Found', { status: 404 });
        }
    });

    registerExportImportHandlers();
    registerLocalArticlesHandlers();
    registerProfileHandlers();
    registerFontsHandlers();
    registerOperaCodecHandlers(ipcMain);
    initDatabase(app, ipcMain);
    if (process.platform === 'win32') {
        app.setAppUserModelId("ai.type.vn"); // Thay bằng id app của bạn
    }

    // [ANTI-BOT] Lấy User Agent G�?C 100% của Chromium hiện tại
    let trueAgent = session.defaultSession.getUserAgent();
    // Bóc đi 2 cái đuôi báo danh "Tôi là ứng dụng Electron giả lập"
    trueAgent = trueAgent.replace(/Electron\/[\d.]+ /g, '')
        .replace(/ai.type\/[\d.]+ /g, '');

    try {
        const fs = require('fs');
        const uaPath = require('path').join(app.getPath('userData'), 'chrome_ua.txt');
        if (fs.existsSync(uaPath)) {
            const savedUa = fs.readFileSync(uaPath, 'utf-8').trim();
            if (savedUa) {
                trueAgent = savedUa;
            }
        }
    } catch (e) { }

    // Ép toàn bộ Session và ứng dụng dùng Agent trong sạch này
    app.userAgentFallback = trueAgent;
    session.defaultSession.setUserAgent(trueAgent);
    session.fromPartition('persist:gemini-webview').setUserAgent(trueAgent); // Sửa lỗi Cookie cho webview

    const filter = {
        urls: [
            "*://*.type.vn/*",
            "*://*.facebook.com/*",
            "*://facebook.com/*",
            "*://chatgpt.com/*",
            "*://*.messenger.com/*",
            "*://*.google.com/*",
            "*://labs.google/*",
            "*://*.labs.google/*"
        ]
    };

    // Cài đặt vượt rào bot chung
    const setupHeaders = (details, callback) => {
        // Xoá dấu vết Electron kh�?i Client Hints để qua mặt Google/Labs
        const chUa = details.requestHeaders['Sec-CH-UA'] || details.requestHeaders['sec-ch-ua'];
        if (chUa) {
            let newChUa = chUa.replace(/,?\s*"Electron";\s*v="[^"]+"/, '').replace(/"Electron";\s*v="[^"]+"\s*,?/, '');
            newChUa = newChUa.replace(/,?\s*"ai\.type";\s*v="[^"]+"/, '').replace(/"ai\.type";\s*v="[^"]+"\s*,?/, '');

            if (details.requestHeaders['Sec-CH-UA']) details.requestHeaders['Sec-CH-UA'] = newChUa;
            if (details.requestHeaders['sec-ch-ua']) details.requestHeaders['sec-ch-ua'] = newChUa;
        }

        // Triệt để xoá Electron kh�?i User-Agent ở cấp độ Network Request (Bắt buộc để trị lỗi Cookie Google)
        const ua = details.requestHeaders['User-Agent'] || details.requestHeaders['user-agent'];
        if (ua) {
            let cleanUA = ua.replace(/Electron\/[\d.]+ /g, '').replace(/ai.type\/[\d.]+ /g, '');
            if (details.requestHeaders['User-Agent']) details.requestHeaders['User-Agent'] = cleanUA;
            if (details.requestHeaders['user-agent']) details.requestHeaders['user-agent'] = cleanUA;
        }

        if (details.url.includes('type.vn')) {
            // Ép Origin để NodeBB cho phép hiển thị ảnh từ localhost:5454
            details.requestHeaders['Origin'] = 'https://type.vn';
            details.requestHeaders['Referer'] = 'https://type.vn/';
            delete details.requestHeaders['Sec-Fetch-Site'];
        }
        callback({ requestHeaders: details.requestHeaders });
    };

    // �?p dụng cho session mặc định
    session.defaultSession.webRequest.onBeforeSendHeaders(filter, setupHeaders);
    // �?p dụng cho session của webview để Google không block (ERR_ABORTED)
    session.fromPartition('persist:gemini-webview').webRequest.onBeforeSendHeaders(filter, setupHeaders);

    // Chạy hàm load ngay khi khởi tạo
    loadBinaries();

    startGoService();
    startSttWebSocketServer();
    startSttServer(); // <--- [THÊM] G�?i hàm vừa tạo
    createMainWindow();

    try {
        require("./type-lite/type-lite.js");
        sendToRenderer("tools-log", "📥 Type: Khởi chạy server type-lite nhúng thành công.");
    } catch (err) {
        sendToRenderer("tools-log", `❌ Type lỗi khởi động nhúng: ${err.message}`);
    }

    // ===== IPC: Xoá toàn bộ cookie Google để đăng nhập lại =====
    ipcMain.handle('clear-google-cookies', async () => {
        try {
            const cookies = await session.defaultSession.cookies.get({});
            let removedCount = 0;
            for (const cookie of cookies) {
                if (cookie.domain.includes('google') || cookie.domain.includes('labs.google')) {
                    const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
                    await session.defaultSession.cookies.remove(url, cookie.name);
                    removedCount++;
                }
            }

            // Xoá thư mục Chrome auth profile để lần sau đăng nhập lại từ đầu
            const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');
            if (fs.existsSync(googleAuthDir)) {
                fs.rmSync(googleAuthDir, { recursive: true, force: true });
            }

            sendToRenderer("tools-log", `[Gemini-Auth] ✅ �?ã xoá ${removedCount} cookie Google.`);
            return { success: true, removed: removedCount };
        } catch (err) {
            sendToRenderer("tools-log", `[Gemini-Auth] Lỗi xoá cookie: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('clear-all-cookies', async () => {
        try {
            // Clear in defaultSession
            await session.defaultSession.clearStorageData();

            // Xoá thư mục Chrome auth profile để lần sau đăng nhập lại từ đầu
            const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');
            if (fs.existsSync(googleAuthDir)) {
                fs.rmSync(googleAuthDir, { recursive: true, force: true });
            }

            // Tìm webview đang chạy và xoá storage của nó (nếu khác defaultSession)
            if (targetWindow && targetWindow.webContents) {
                await targetWindow.webContents.session.clearStorageData();
            }

            sendToRenderer("tools-log", `[Gemini-Auth] ✅ �?ã xoá toàn bộ Cookie và Storage của ứng dụng.`);
            return { success: true };
        } catch (err) {
            sendToRenderer("tools-log", `[Gemini-Auth] Lỗi xoá tất cả cookie: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('clear-webview-auth', async () => {
        try {
            // Xóa session storage của webview
            await session.fromPartition('persist:gemini-webview').clearStorageData();

            // Chỉ xóa thư mục Chrome auth profile của Puppeteer
            const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');
            if (fs.existsSync(googleAuthDir)) {
                fs.rmSync(googleAuthDir, { recursive: true, force: true });
            }
            return { success: true };
        } catch (error) {
            console.error('Lỗi khi xoá auth webview:', error);
            return { success: false, error: error.message };
        }
    });

    // Lắng nghe Webview sinh ra từ giao diện Angular (nếu có) để Auto-map nó làm đối tượng lấy hình ảnh
    app.on('web-contents-created', (event, contents) => {
        if (contents.getType() === 'window') {
            contents.on('will-attach-webview', (embedEvent, webPreferences, params) => {
                const preloadPath = resolvePreload();
                webPreferences.preload = preloadPath;
                webPreferences.contextIsolation = true;
                console.log(`[Zalo Webview] Đã tiêm preload script vào webview: ${preloadPath}`);
            });
        }
        if (contents.getType() === 'webview') {
            // Duck-type tương thích chức năng (bao gồm EventEmitter methods)
            const EventEmitter = require('events');
            const fakeEmitter = new EventEmitter();
            targetWindow = {
                isWebview: true,
                webContents: contents,
                isDestroyed: () => contents.isDestroyed(),
                close: () => { },
                once: (...args) => fakeEmitter.once(...args),
                on: (...args) => fakeEmitter.on(...args),
                removeListener: (...args) => fakeEmitter.removeListener(...args),
                emit: (...args) => fakeEmitter.emit(...args),
            };

            // Vô hiệu hóa menu chuột phải cho webview
            contents.on('context-menu', (event, params) => {
                // Không hiển thị menu popup
            });

            contents.on('console-message', (event) => {
                const fs = require('fs');
                const logPath = require('path').join(app.getPath('userData'), 'webview.log');
                try {
                    fs.appendFileSync(logPath, `[WEBVIEW] ${event.level}: ${event.message} (line ${event.line} at ${event.sourceId})\n`);
                } catch (e) {
                    console.error('Failed to write to webview.log:', e);
                }
            });

            // ============================================================
            // PUPPETEER STEALTH LOGIN: Mở Chromium THẬT (không phải Electron)
            // để đăng nhập Google, rồi chuyển cookie v�? Electron.
            // Google phát hiện Electron qua JS fingerprinting nên BrowserWindow
            // luôn bị chặn. Puppeteer Stealth patch hết các dấu hiệu đó.
            // ============================================================
            let isGeminiAuthRunning = false; // Tránh mở nhi�?u lần

            const launchStealthLogin = async (loginUrl, webviewContents) => {
                if (isGeminiAuthRunning) return;
                isGeminiAuthRunning = true;
                sendToRenderer("tools-log", "[Gemini-Auth] �?ang mở Chrome thật để đăng nhập...");

                const CHROME_DEBUG_PORT = 9224;
                let syncInterval = null;

                try {
                    const realChromePath = getChromePath();
                    if (!realChromePath) {
                        sendToRenderer("tools-log", "[Gemini-Auth] �?� Không tìm thấy Chrome trên máy!");
                        isGeminiAuthRunning = false;
                        return;
                    }

                    const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');

                    const chromeArgs = [
                        `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
                        `--user-data-dir=${googleAuthDir}`,
                        '--no-first-run',
                        '--no-default-browser-check',
                        '--disable-sync',
                        '--disable-features=ChromeSigninInterceptEnabled,DialMediaRouteProvider',
                        '--disable-infobars',
                        `--window-size=550,750`,
                        loginUrl
                    ];

                    sendToRenderer("tools-log", `[Gemini-Auth] Mở: ${realChromePath}`);
                    const chromeProcess = require('child_process').spawn(realChromePath, chromeArgs, {
                        detached: false,
                        stdio: 'ignore'
                    });

                    // Ch�? Chrome khởi động xong (2 giây)
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    sendToRenderer("tools-log", "[Gemini-Auth] �?ang kết nối vào Chrome...");

                    // Kết nối vào Chrome đang chạy qua remote debugging
                    let stealthBrowser;
                    try {
                        stealthBrowser = await puppeteer.connect({
                            browserURL: `http://127.0.0.1:${CHROME_DEBUG_PORT}`,
                            defaultViewport: null
                        });
                    } catch (connectErr) {
                        // Thử lại sau 3 giây nếu Chrome chưa sẵn sàng
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        stealthBrowser = await puppeteer.connect({
                            browserURL: `http://127.0.0.1:${CHROME_DEBUG_PORT}`,
                            defaultViewport: null
                        });
                    }

                    sendToRenderer("tools-log", "[Gemini-Auth] ✅ �?ã kết nối Chrome! Hãy đăng nhập Google...");

                    // Dùng vòng lặp kiểm tra URL liên tục trên tất cả các tab
                    const startContinuousSync = async (browserInstance) => {
                        syncInterval = setInterval(async () => {
                            try {
                                const pages = await browserInstance.pages();
                                const page = pages.find(p => !p.isClosed());
                                if (!page) return;

                                const client = await page.createCDPSession();
                                const { cookies: allCookies } = await client.send('Network.getAllCookies');
                                await client.detach();

                                for (const cookie of allCookies) {
                                    try {
                                        const cookieObj = {
                                            url: `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
                                            name: cookie.name,
                                            value: cookie.value,
                                            domain: cookie.name.startsWith('__Host-') ? undefined : cookie.domain,
                                            path: cookie.path,
                                            secure: cookie.secure,
                                            httpOnly: cookie.httpOnly,
                                            sameSite: cookie.sameSite === 'None' ? 'no_restriction'
                                                : cookie.sameSite === 'Lax' ? 'lax'
                                                    : cookie.sameSite === 'Strict' ? 'strict'
                                                        : undefined
                                        };
                                        if (cookie.expires && cookie.expires > 0) cookieObj.expirationDate = cookie.expires;

                                        await webviewContents.session.cookies.set(cookieObj);
                                        if (webviewContents.session !== session.defaultSession) {
                                            await session.defaultSession.cookies.set(cookieObj);
                                        }
                                    } catch (e) { }
                                }
                            } catch (e) { }
                        }, 1500);
                    };

                    startContinuousSync(stealthBrowser);

                    // �?ảm bảo window nổi lên trên cùng (focus)
                    try {
                        const pages = await stealthBrowser.pages();
                        if (pages.length > 0) {
                            await pages[0].bringToFront();
                        }
                    } catch (e) { }

                    try {
                        let isLoggedIn = false;
                        let checkCount = 0;
                        while (!isLoggedIn && checkCount < 300) { // Timeout 5 phút (300 * 1s)
                            await new Promise(r => setTimeout(r, 1000));
                            checkCount++;
                            const pages = await stealthBrowser.pages();
                            if (pages.length === 0) throw new Error("All pages closed");

                            for (const p of pages) {
                                try {
                                    const url = p.url();
                                    if (url.includes('gemini.google') && !url.includes('accounts.google.com')) {
                                        isLoggedIn = true;
                                        break;
                                    }
                                } catch (e) { }
                            }
                        }
                        if (!isLoggedIn) throw new Error("Timeout waiting for login");
                    } catch (waitErr) {
                        sendToRenderer("tools-log", "[Gemini-Auth] Popup đã bị đóng hoặc hết gi�?!");
                        if (syncInterval) clearInterval(syncInterval);
                        try { await stealthBrowser.close(); } catch (e) { }
                        try { chromeProcess.kill(); } catch (e) { }
                        isGeminiAuthRunning = false;

                        if (!webviewContents.isDestroyed()) {
                            webviewContents.loadURL('https://gemini.google.com/app?hl=vi');
                        }
                        return;
                    }

                    sendToRenderer("tools-log", "[Gemini-Auth] 🎉 �?ăng nhập thành công! �?ang xác thực với Gemini...");

                    // QUAN TRỌNG: Sau khi login Google, cần truy cập gemini.google để domain đó tạo cookie xác thực riêng
                    let activePage = loginPage;
                    try {
                        if (activePage.isClosed()) {
                            const pages = await stealthBrowser.pages();
                            activePage = pages[pages.length - 1];
                        }
                        await activePage.goto('https://gemini.google.com/app?hl=vi', { waitUntil: 'networkidle2', timeout: 30000 });
                    } catch (navErr) {
                        sendToRenderer("tools-log", "[Gemini-Auth] ⚠�? Gemini chậm tải, vẫn tiếp tục lấy cookie...");
                        const pages = await stealthBrowser.pages();
                        if (pages.length > 0) activePage = pages[pages.length - 1];
                    }

                    // Ch�? thêm 2 giây để cookie ổn định
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    sendToRenderer("tools-log", "[Gemini-Auth] �?ang chuyển cookie...");

                    if (!activePage || activePage.isClosed()) {
                        throw new Error("Không tìm thấy tab để lấy cookie!");
                    }

                    // Sync User-Agent để tránh Google đá văng do lệch fingerprint
                    try {
                        const chromeUA = await stealthBrowser.userAgent();
                        webviewContents.setUserAgent(chromeUA);
                        sendToRenderer("tools-log", `[Gemini-Auth] �?ã đồng bộ User-Agent: ${chromeUA.substring(0, 30)}...`);

                        try {
                            const fs = require('fs');
                            const uaPath = require('path').join(app.getPath('userData'), 'chrome_ua.txt');
                            fs.writeFileSync(uaPath, chromeUA, 'utf-8');
                        } catch (e) { }
                    } catch (e) {
                        sendToRenderer("tools-log", `[Gemini-Auth] Lỗi đồng bộ UA: ${e.message}`);
                    }

                    // Hút TOÀN BỘ cookie từ Chrome (không chỉ google.com)
                    const client = await activePage.createCDPSession();
                    const { cookies: allCookies } = await client.send('Network.getAllCookies');

                    // Lấy toàn bộ cookie để hỗ trợ cả Youtube, bên thứ 3 (tránh bị thiếu cookie session)
                    const googleCookies = allCookies;

                    sendToRenderer("tools-log", `[Gemini-Auth] Thu được ${googleCookies.length} cookie.`);

                    // Import cookie vào Electron
                    let importedCount = 0;
                    for (const cookie of googleCookies) {
                        try {
                            const cookieObj = {
                                url: `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
                                name: cookie.name,
                                value: cookie.value,
                                domain: cookie.domain,
                                path: cookie.path,
                                secure: cookie.secure,
                                httpOnly: cookie.httpOnly,
                                sameSite: cookie.sameSite === 'None' ? 'no_restriction'
                                    : cookie.sameSite === 'Lax' ? 'lax'
                                        : cookie.sameSite === 'Strict' ? 'strict'
                                            : undefined
                            };
                            if (cookie.expires && cookie.expires > 0) {
                                cookieObj.expirationDate = cookie.expires;
                            } else {
                                // Nếu là session cookie, gán th�?i gian 1 năm để tránh mất khi tắt ứng dụng
                                cookieObj.expirationDate = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365);
                            }
                            // __Host- cookies MUST NOT have a domain attribute
                            if (cookie.name.startsWith('__Host-')) {
                                delete cookieObj.domain;
                            }
                            await webviewContents.session.cookies.set(cookieObj);
                            if (webviewContents.session !== session.defaultSession) {
                                await session.defaultSession.cookies.set(cookieObj);
                            }
                            importedCount++;
                        } catch (cookieErr) {
                            sendToRenderer("tools-log", `[Gemini-Auth] Lỗi import cookie ${cookie.name}: ${cookieErr.message}`);
                            console.log(`[Gemini-Auth] Lỗi import cookie ${cookie.name}: ${cookieErr.message}`);
                        }
                    }

                    sendToRenderer("tools-log", `[Gemini-Auth] ✅ �?ã import ${importedCount}/${googleCookies.length} cookie thành công!`);

                    // �?ồng bộ Local Storage và Session Storage lần cuối
                    // [BỎ QUA] Tránh làm h�?ng IndexedDB
                    /*
                    try {
                        const lsData = await activePage.evaluate(() => JSON.stringify(localStorage));
                        const ssData = await activePage.evaluate(() => JSON.stringify(sessionStorage));
                        if (!webviewContents.isDestroyed()) {
                            if (lsData) {
                                await webviewContents.executeJavaScript(`
                                    try {
                                        const data = ${lsData};
                                        for (let key in data) localStorage.setItem(key, data[key]);
                                    } catch(e){}
                                `);
                            }
                            if (ssData) {
                                await webviewContents.executeJavaScript(`
                                    try {
                                        const data = ${ssData};
                                        for (let key in data) sessionStorage.setItem(key, data[key]);
                                    } catch(e){}
                                `);
                            }
                        }
                    } catch (e) { }
                    */

                    // �?óng Chrome
                    try {
                        await stealthBrowser.close();
                    } catch (closeErr) {
                        // Chrome có thể đã đóng
                    }
                    try { chromeProcess.kill(); } catch (e) { }

                    // Reload webview
                    if (!webviewContents.isDestroyed()) {
                        sendToRenderer("tools-log", "[Gemini-Auth] �?ang tải lại trang...");
                        webviewContents.reloadIgnoringCache();
                    }

                } catch (err) {
                    sendToRenderer("tools-log", `[Gemini-Auth] Lỗi: ${err.message}`);
                } finally {
                    if (syncInterval) clearInterval(syncInterval);
                    isGeminiAuthRunning = false;
                }
            };



            // Bắt sự kiện khi user tự bấm vào nút Login từ lớp overlay
            contents.on('will-navigate', (e, url) => {
                if (url.includes('trigger-stealth-login')) {
                    e.preventDefault();
                    // Lấy chính URL hiện tại (có chứa tham số continue=... của trang gốc) để đăng nhập
                    launchStealthLogin(contents.getURL(), contents);
                }
            });

            // Bắt sự kiện mở popup mới (nút Sign In có thể mở popup)
            contents.setWindowOpenHandler(({ url }) => {
                if (url.includes('accounts.google.com')) {
                    launchStealthLogin(url, contents);
                    return { action: 'deny' };
                }
                return { 
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        width: 1024,
                        height: 800
                    }
                };
            });

            // Bắt sự kiện ngư�?i dùng tải xuống từ màn hình phụ
            contents.session.on('will-download', (event, item, webContents) => {
                const fileName = item.getFilename();
                sendToRenderer("tools-log", `[Webview] Bắt đầu tải file: ${fileName}`);

                item.on('updated', (event, state) => {
                    if (state === 'interrupted') {
                        sendToRenderer("tools-log", "[Webview] Tải xuống bị gián đoạn.");
                    } else if (state === 'progressing') {
                        if (item.isPaused()) {
                            sendToRenderer("tools-log", "[Webview] Tải xuống bị tạm dừng.");
                        }
                    }
                });

                item.once('done', (event, state) => {
                    if (state === 'completed') {
                        const localPath = item.getSavePath();
                        sendToRenderer("tools-log", `[Webview] Tải xuống hoàn tất: ${localPath}`);

                        // Gửi sự kiện cho Angular Frontend biết
                        if (mainWindow) {
                            mainWindow.webContents.send('webview-download-complete', {
                                file: localPath,
                                name: fileName
                            });
                        }
                    } else {
                        sendToRenderer("tools-log", `[Webview] Tải xuống thất bại: ${state}`);
                    }
                });
            });

            sendToRenderer("tools-log", "[Webview] �?ã đính kèm thẻ webview mới vào luồng Download Ảnh tự động!");
        }
    });

    if (binaries.downloader) {
        downloaderProcess = execFile(binaries.downloader, [], (err, stdout, stderr) => {
            if (err) sendToRenderer("tools-log", `�?� Downloader lỗi: ${err}`);
            if (stdout) sendToRenderer("tools-log", `📥 Downloader: ${stdout}`);
            if (stderr) sendToRenderer("tools-log", `⚠�? Downloader stderr: ${stderr}`);
        });
    }

    // ===== EXTRACT LAST FRAME IPC =====
    ipcMain.handle("extract-last-frame-old", async (_event, videoPath) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("Không tìm thấy FFmpeg"));
            }
            try {
                const imgDir = path.dirname(videoPath);
                const ext = path.extname(videoPath);
                const baseName = path.basename(videoPath, ext);
                const outputFileName = `${baseName}_last_frame.jpg`;
                const outputPath = path.join(imgDir, outputFileName);

                const ffmpegPath = binaries.ffmpeg;
                const args = [
                    "-sseof", "-0.1",
                    "-i", videoPath,
                    "-update", "1",
                    "-q:v", "2",
                    "-y",
                    outputPath
                ];

                sendToRenderer("tools-log", `[FFmpeg] Trích xuất last frame: ${args.join(" ")}`);
                const child = spawn(ffmpegPath, args);

                let stderrOutput = "";
                child.stderr.on("data", (data) => {
                    stderrOutput += data.toString();
                });

                child.on("close", (code) => {
                    if (code === 0) {
                        resolve({ success: true, path: outputPath });
                    } else {
                        sendToRenderer("tools-log", `[FFmpeg Error] ${stderrOutput}`);
                        reject(new Error(`FFmpeg exited with code ${code}`));
                    }
                });

                child.on("error", (err) => {
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    });
    // Function to get video fps using ffmpeg
    const getVideoFPS = (ffmpegPath, videoPath) => {
        return new Promise((resolve) => {
            const child = spawn(ffmpegPath, ['-i', videoPath]);
            let stderr = '';
            child.stderr.on('data', (data) => stderr += data.toString());
            child.on('close', () => {
                const match = stderr.match(/, ([\d.]+) fps/);
                if (match && match[1]) {
                    resolve(parseFloat(match[1]));
                } else {
                    resolve(1); // fallback
                }
            });
        });
    };

    // Function to get exact media duration using ffmpeg
    const getMediaDuration = (ffmpegPath, filePath) => {
        return new Promise((resolve) => {
            const cmd = ffmpegPath || 'ffmpeg';
            try {
                const child = spawn(cmd, ['-i', filePath]);
                let stderr = '';
                child.stderr.on('data', (data) => stderr += data.toString());
                child.on('error', () => resolve(0));
                child.on('close', () => {
                    const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
                    if (match) {
                        const hours = parseFloat(match[1]);
                        const mins = parseFloat(match[2]);
                        const secs = parseFloat(match[3]);
                        resolve(hours * 3600 + mins * 60 + secs);
                    } else {
                        resolve(0);
                    }
                });
            } catch (e) {
                resolve(0);
            }
        });
    };

    ipcMain.handle('get-media-duration', async (_event, filePath) => {
        try {
            let cleanPath = String(filePath || '').trim().replace(/^file:\/{2,3}/i, '').replace(/^media:\/{2,3}/i, '');
            try { cleanPath = decodeURIComponent(cleanPath); } catch (e) {}
            cleanPath = cleanPath.split('?')[0].split('#')[0];
            if (!cleanPath.startsWith('/') && !/^[a-zA-Z]:/.test(cleanPath)) cleanPath = '/' + cleanPath;
            cleanPath = path.normalize(cleanPath);
            const cmd = binaries.ffmpeg || 'ffmpeg';
            const dur = await getMediaDuration(cmd, cleanPath);
            return { success: true, duration: dur };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // ===== EXTRACT VIDEO FRAMES IPC =====
    ipcMain.handle("extract-video-frames", async (_event, payload) => {
        return new Promise(async (resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("Không tìm thấy FFmpeg"));
            }
            try {
                const videoPath = typeof payload === 'string' ? payload : payload.videoPath;
                const interval = typeof payload === 'object' && payload.interval ? payload.interval : null;
                const startTime = typeof payload === 'object' && payload.startTime !== undefined ? payload.startTime : 0;
                const duration = typeof payload === 'object' && payload.duration !== undefined ? payload.duration : null;

                const videoPathDecoded = videoPath.replace('file://', '');
                const stats = fs.statSync(videoPathDecoded);
                const fileSize = stats.size;
                const baseName = path.basename(videoPathDecoded, path.extname(videoPathDecoded)).replace(/[^a-zA-Z0-9_-]/g, '_');
                
                let cacheDirName = `_frames_${baseName}_${fileSize}`;
                if (interval) cacheDirName += `_int_${interval}`;
                if (startTime > 0) cacheDirName += `_ss_${startTime}`;
                if (duration) cacheDirName += `_t_${duration}`;

                const downloadsPath = app.getPath('downloads');
                const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
                if (!fs.existsSync(aiTypingDir)) {
                    fs.mkdirSync(aiTypingDir, { recursive: true });
                }

                const tempDir = path.join(aiTypingDir, cacheDirName);
                
                const fps = await getVideoFPS(binaries.ffmpeg, videoPath);
                const effectiveFps = interval ? (1 / interval) : fps;

                // Caching logic
                if (fs.existsSync(tempDir)) {
                    const allFiles = fs.readdirSync(tempDir);
                    const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
                    if (frameFiles.length > 0) {
                        sendToRenderer("tools-log", `[FFmpeg] Sử dụng lại frames đã trích xuất: ${tempDir}`);
                        const framePaths = frameFiles.map(f => path.join(tempDir, f));
                        return resolve({ success: true, paths: framePaths, fps: effectiveFps });
                    }
                } else {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const framePattern = path.join(tempDir, 'frame_%05d.jpg');
                const ffmpegPath = binaries.ffmpeg;

                const vfFilter = interval ? `scale=720:-1,fps=1/${interval}` : "scale=720:-1";
                const args = ["-y"];
                
                if (startTime > 0) {
                    args.push("-ss", startTime.toString());
                }
                
                args.push("-i", videoPath);
                
                if (duration) {
                    args.push("-t", duration.toString());
                }
                
                args.push(
                    "-vf", vfFilter,
                    "-q:v", "2",
                    framePattern
                );

                sendToRenderer("tools-log", `[FFmpeg] Trích xuất frames: ${args.join(" ")}`);
                const child = spawn(ffmpegPath, args);

                let stderrOutput = "";
                child.stderr.on("data", (data) => {
                    stderrOutput += data.toString();
                });

                child.on("close", (code) => {
                    if (code === 0) {
                        const allFiles = fs.readdirSync(tempDir);
                        const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
                        const framePaths = frameFiles.map(f => path.join(tempDir, f));
                        resolve({ success: true, paths: framePaths, fps: effectiveFps });
                    } else {
                        sendToRenderer("tools-log", `[FFmpeg Error] ${stderrOutput}`);
                        reject(new Error(`FFmpeg exited with code ${code}`));
                    }
                });

                child.on("error", (err) => {
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    });

    // ===== SAVE BASE64 IPC =====
    ipcMain.handle("save-base64", async (_event, payload) => {
        return new Promise((resolve) => {
            try {
                let { base64, fileName, folder, username } = payload || {};
                if (!base64) return resolve({ success: false, error: "Empty base64 data" });

                // Strip data URI prefix if present
                if (base64.startsWith('data:')) {
                    base64 = base64.split(',')[1];
                }

                const docDir = documentsDir || path.join(os.homedir(), "Documents");
                let targetDir = path.join(docDir, "ai.type", "data", "uploads");
                if (folder && username) {
                    targetDir = path.join(targetDir, folder, username);
                } else if (username) {
                    targetDir = path.join(targetDir, username);
                } else if (folder) {
                    targetDir = path.join(targetDir, folder);
                }

                fs.mkdirSync(targetDir, { recursive: true });

                const fname = fileName || `image_${Date.now()}.png`;
                const filePath = path.join(targetDir, fname);
                const buffer = Buffer.from(base64, "base64");
                fs.writeFileSync(filePath, buffer);

                resolve({ success: true, path: filePath, fileName: fname });
            } catch (err) {
                console.error("save-base64 error:", err);
                resolve({ success: false, error: err.message });
            }
        });
    });

    // ===== OVERWRITE FILE BASE64 IPC =====
    ipcMain.handle("overwrite-file-base64", async (_event, payload) => {
        return new Promise((resolve, reject) => {
            try {
                let { filePath, base64 } = payload;
                filePath = filePath.replace('file://', '').replace(/\\/g, '/');
                const buffer = Buffer.from(base64, 'base64');
                fs.writeFileSync(filePath, buffer);
                resolve({ success: true });
            } catch (err) {
                console.error('overwrite-file-base64 error:', err);
                reject(err);
            }
        });
    });

    // ===== MOCK AI EDIT FRAMES IPC =====
    ipcMain.handle("mock-ai-edit-frames", async (_event, payload) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) return reject(new Error("Không tìm thấy FFmpeg"));
            try {
                const { dirPath, attachmentUrl } = payload;
                if (!fs.existsSync(dirPath)) return reject(new Error("Thư mục frames không tồn tại"));
                if (!attachmentUrl) return resolve({ success: true }); // No attachment = no mock edit
                
                let attachPath = attachmentUrl.replace('file://', '').replace(/\\/g, '/');
                // Ensure attachPath is valid
                if (!fs.existsSync(attachPath)) {
                    // Try decoding URI
                    attachPath = decodeURIComponent(attachPath);
                    if (!fs.existsSync(attachPath)) return resolve({ success: true }); // Ignore if not found
                }
                
                const framePattern = path.join(dirPath, 'frame_%05d.jpg');
                const tempPattern = path.join(dirPath, 'temp_%05d.jpg');
                const ffmpegPath = binaries.ffmpeg;
                
                // Scale attachment to 200px width and overlay in center
                const args = [
                    "-y",
                    "-i", framePattern,
                    "-i", attachPath,
                    "-filter_complex", "[1:v]scale=250:-1[ov];[0:v][ov]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2",
                    "-q:v", "2",
                    tempPattern
                ];

                sendToRenderer("tools-log", `[FFmpeg] Mock AI Edit frames: ${args.join(" ")}`);
                const child = spawn(ffmpegPath, args);

                let stderrOutput = "";
                child.stderr.on("data", (data) => { stderrOutput += data.toString(); });

                child.on("close", (code) => {
                    if (code === 0) {
                        // Rename temp back to frame
                        const allFiles = fs.readdirSync(dirPath);
                        const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
                        frameFiles.forEach((file, index) => {
                            const tempFile = `temp_${String(index + 1).padStart(5, '0')}.jpg`;
                            const tempPath = path.join(dirPath, tempFile);
                            const origPath = path.join(dirPath, file);
                            if (fs.existsSync(tempPath)) {
                                fs.renameSync(tempPath, origPath);
                            }
                        });
                        resolve({ success: true });
                    } else {
                        console.error("[Mock AI Edit error]", stderrOutput);
                        resolve({ success: false, error: stderrOutput }); // Resolve anyway so it doesn't break
                    }
                });
                
                child.on("error", (err) => { reject(err); });
            } catch (err) {
                reject(err);
            }
        });
    });

    // ===== MERGE FRAMES TO VIDEO IPC =====
    ipcMain.handle("merge-frames-to-video", async (_event, payload) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("Không tìm thấy FFmpeg"));
            }
            try {
                const { dirPath, fps } = payload;
                if (!fs.existsSync(dirPath)) {
                    return reject(new Error("Thư mục frames không tồn tại"));
                }
                
                const outputFileName = `magic_kling_${Date.now()}.mp4`;
                const outputPath = path.join(app.getPath('downloads'), 'AI.TYPING', outputFileName);
                
                const framePattern = path.join(dirPath, 'frame_%05d.jpg');
                const ffmpegPath = binaries.ffmpeg;
                
                const args = [
                    "-y",
                    "-framerate", fps ? fps.toString() : "1",
                    "-i", framePattern,
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    outputPath
                ];

                sendToRenderer("tools-log", `[FFmpeg] Gộp frames thành video: ${args.join(" ")}`);
                const child = spawn(ffmpegPath, args);

                let stderrOutput = "";
                child.stderr.on("data", (data) => {
                    stderrOutput += data.toString();
                });

                child.on("close", (code) => {
                    if (code === 0) {
                        return resolve({ success: true, videoPath: outputPath });
                    } else {
                        console.error("[FFmpeg merge error]:", stderrOutput);
                        return reject(new Error(`Lỗi gộp video (code ${code}): ` + stderrOutput));
                    }
                });
                
                child.on("error", (err) => {
                    reject(err);
                });
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    });

    function getVideoWorkingDir(videoOrAudioPath, defaultPrefix = 'video') {
        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        if (videoOrAudioPath) {
            let cleanPath = String(videoOrAudioPath).trim();
            cleanPath = cleanPath.replace(/^file:\/{2,3}/i, '').replace(/^media:\/{2,3}/i, '');
            if (process.platform === 'win32' && cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
            cleanPath = decodeURIComponent(cleanPath.split('?')[0].split('#')[0]);

            // If it's already directly inside a subfolder of AI.TYPING, reuse that subfolder
            const parentDir = path.dirname(cleanPath);
            if (parentDir.startsWith(aiTypingDir) && parentDir !== aiTypingDir) {
                return parentDir;
            }

            // Otherwise, create a dedicated subfolder named after the video/audio file
            const ext = path.extname(cleanPath);
            let baseName = path.basename(cleanPath, ext).replace(/[^\w\d\-_.]/g, '_').replace(/_+/g, '_').substring(0, 60);
            if (!baseName || baseName === '_') baseName = `${defaultPrefix}_${Date.now()}`;
            const targetDir = path.join(aiTypingDir, baseName);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            return targetDir;
        }

        const targetDir = path.join(aiTypingDir, `${defaultPrefix}_${Date.now()}`);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        return targetDir;
    }

    // ===== EXTRACT AUDIO IPC =====
    ipcMain.handle("extract-audio", async (_event, payload) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("Không tìm thấy FFmpeg"));
            }
            try {
                const videoPath = typeof payload === "string" ? payload : payload.videoPath;
                const startTime = typeof payload === "object" && payload.startTime !== undefined ? Number(payload.startTime) : null;
                const duration = typeof payload === "object" && payload.duration !== undefined ? Number(payload.duration) : null;

                const videoDir = getVideoWorkingDir(videoPath);
                const ext = path.extname(videoPath);
                const baseName = path.basename(videoPath, ext).replace(/[^\w\d\-_.]/g, '_');
                const outputFileName = `${baseName}_audio_${Date.now()}.mp3`;
                const outputPath = path.join(videoDir, outputFileName);

                // Dọn dẹp các file audio cũ của video này trong videoDir
                try {
                    if (fs.existsSync(videoDir)) {
                        const existingFiles = fs.readdirSync(videoDir);
                        for (const f of existingFiles) {
                            if (f.startsWith(baseName) && f.includes('_audio_') && f.endsWith('.mp3')) {
                                try { fs.unlinkSync(path.join(videoDir, f)); } catch (e) {}
                            }
                        }
                    }
                } catch (cleanErr) {
                    console.warn('[extract-audio] Lỗi dọn dẹp audio cũ:', cleanErr);
                }

                const ffmpegPath = binaries.ffmpeg;
                const args = ["-y"];

                if (startTime !== null && startTime > 0) {
                    args.push("-ss", startTime.toFixed(3));
                }
                args.push("-i", videoPath);
                if (duration !== null && duration > 0) {
                    args.push("-t", duration.toFixed(3));
                }

                args.push(
                    "-vn", // No video
                    "-acodec", "libmp3lame",
                    "-q:a", "2", // Good quality
                    outputPath
                );

                sendToRenderer("tools-log", `[FFmpeg] Tách audio sang ${outputPath}: ${args.join(" ")}`);
                const child = spawn(ffmpegPath, args);

                let stderrOutput = "";
                child.stderr.on("data", (data) => {
                    stderrOutput += data.toString();
                });

                child.on("close", async (code) => {
                    if (code === 0 && fs.existsSync(outputPath)) {
                        const exactDur = await getMediaDuration(ffmpegPath, outputPath);
                        resolve({
                            audioPath: outputPath,
                            duration: exactDur > 0 ? exactDur : duration
                        });
                    } else {
                        reject(new Error(`FFmpeg error (code ${code}): ${stderrOutput}`));
                    }
                });

                child.on("error", (err) => {
                    reject(err);
                });
            } catch (err) {
                reject(err);
            }
        });
    });

    function formatSecondsToSRT(seconds) {
        const totalMs = Math.round(seconds * 1000);
        const hrs = Math.floor(totalMs / 3600000);
        const mins = Math.floor((totalMs % 3600000) / 60000);
        const secs = Math.floor((totalMs % 60000) / 1000);
        const ms = totalMs % 1000;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }

    function formatSecondsToVTT(seconds) {
        const totalMs = Math.round(seconds * 1000);
        const hrs = Math.floor(totalMs / 3600000);
        const mins = Math.floor((totalMs % 3600000) / 60000);
        const secs = Math.floor((totalMs % 60000) / 1000);
        const ms = totalMs % 1000;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }

    function generateSubtitlesFiles(videoDir, baseName, segments) {
        if (!segments || !Array.isArray(segments) || segments.length === 0) return null;

        const sorted = [...segments].sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));

        let srtContent = "";
        let vttContent = "WEBVTT\n\n";
        let srtViContent = "";
        let vttViContent = "WEBVTT\n\n";
        let hasVietnamese = false;

        sorted.forEach((seg, idx) => {
            const start = Math.max(0, Number(seg.startTime) || 0);
            const end = Math.max(start + 0.3, Number(seg.endTime) || (start + (Number(seg.duration) || 3)));
            const text = String(seg.text || '').trim();
            const viText = String(seg.vietnameseText || seg.viText || text).trim();

            if (!text && !viText) return;

            if (seg.vietnameseText && seg.vietnameseText.trim() !== text) {
                hasVietnamese = true;
            }

            // Original SRT format
            srtContent += `${idx + 1}\n`;
            srtContent += `${formatSecondsToSRT(start)} --> ${formatSecondsToSRT(end)}\n`;
            srtContent += `${text || viText}\n\n`;

            // Original VTT format
            vttContent += `${idx + 1}\n`;
            vttContent += `${formatSecondsToVTT(start)} --> ${formatSecondsToVTT(end)}\n`;
            vttContent += `${text || viText}\n\n`;

            // Vietnamese SRT format
            srtViContent += `${idx + 1}\n`;
            srtViContent += `${formatSecondsToSRT(start)} --> ${formatSecondsToSRT(end)}\n`;
            srtViContent += `${viText}\n\n`;

            // Vietnamese VTT format
            vttViContent += `${idx + 1}\n`;
            vttViContent += `${formatSecondsToVTT(start)} --> ${formatSecondsToVTT(end)}\n`;
            vttViContent += `${viText}\n\n`;
        });

        try {
            const srtPath = path.join(videoDir, `${baseName}.srt`);
            const vttPath = path.join(videoDir, `${baseName}.vtt`);
            fs.writeFileSync(srtPath, srtContent.trim() + '\n', 'utf8');
            fs.writeFileSync(vttPath, vttContent.trim() + '\n', 'utf8');
            sendToRenderer("tools-log", `[Phụ đề] Đã lưu file phụ đề gốc .SRT và .VTT vào: ${srtPath}`);

            let srtViPath = null;
            let vttViPath = null;
            if (hasVietnamese || (srtViContent && !baseName.endsWith('_vi'))) {
                srtViPath = path.join(videoDir, `${baseName}_vi.srt`);
                vttViPath = path.join(videoDir, `${baseName}_vi.vtt`);
                fs.writeFileSync(srtViPath, srtViContent.trim() + '\n', 'utf8');
                fs.writeFileSync(vttViPath, vttViContent.trim() + '\n', 'utf8');
                sendToRenderer("tools-log", `[Phụ đề Tiếng Việt] Đã tạo thêm file phụ đề Tiếng Việt .SRT vào: ${srtViPath}`);
            }

            return { srtPath, vttPath, srtViPath, vttViPath };
        } catch (e) {
            console.error('[Phụ đề] Lỗi ghi file subtitle:', e);
            return null;
        }
    }

    // ===== EXPORT SUBTITLES IPC =====
    ipcMain.handle("export-subtitles", async (_event, payload) => {
        try {
            const { videoPath, subtitles, filename } = payload || {};
            const videoDir = getVideoWorkingDir(videoPath);
            const baseName = filename || path.basename(videoPath || 'subtitles', path.extname(videoPath || '')).replace(/[^\w\d\-_.]/g, '_');
            const result = generateSubtitlesFiles(videoDir, baseName, subtitles);
            return { success: true, ...result };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });

    // ===== SPLIT AUDIO SEGMENTS IPC =====
    ipcMain.handle("split-audio-segments", async (_event, payload) => {
        const { audioPath, segments } = payload || {};
        if (!binaries.ffmpeg) {
            throw new Error("Không tìm thấy FFmpeg");
        }
        if (!segments || !Array.isArray(segments) || segments.length === 0) {
            return [];
        }

        let cleanAudioPath = String(audioPath || '').trim();
        cleanAudioPath = cleanAudioPath.replace(/^file:\/{2,3}/i, '').replace(/^media:\/{2,3}/i, '');
        if (process.platform === 'win32' && cleanAudioPath.startsWith('/')) cleanAudioPath = cleanAudioPath.slice(1);
        cleanAudioPath = decodeURIComponent(cleanAudioPath.split('?')[0].split('#')[0]);

        const videoDir = getVideoWorkingDir(cleanAudioPath);
        const ext = path.extname(cleanAudioPath) || ".mp3";
        const baseName = path.basename(cleanAudioPath, ext).replace(/[^\w\d\-_.]/g, '_');
        const ffmpegPath = binaries.ffmpeg;
        const results = [];

        // Dọn dẹp sạch sẽ các file segment cũ và file phụ đề cũ của video này trước khi tạo mới
        try {
            if (fs.existsSync(videoDir)) {
                const existingFiles = fs.readdirSync(videoDir);
                for (const f of existingFiles) {
                    if (f.startsWith(baseName) && (f.includes('_seg_') || f.endsWith('.srt') || f.endsWith('.vtt'))) {
                        try { fs.unlinkSync(path.join(videoDir, f)); } catch (e) {}
                    }
                }
            }
        } catch (cleanErr) {
            console.warn('[split-audio-segments] Lỗi dọn dẹp file segment/sub cũ:', cleanErr);
        }

        // Tự động tạo file phụ đề .SRT và .VTT ngay trong thư mục video
        generateSubtitlesFiles(videoDir, baseName, segments);

        sendToRenderer("tools-log", `[FFmpeg] Bắt đầu cắt ${segments.length} đoạn audio vào ${videoDir} từ: ${path.basename(cleanAudioPath)}`);

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const startTime = Math.max(0, Number(seg.startTime) || 0);
            const duration = Math.max(0.3, Number(seg.duration) || (seg.endTime ? Number(seg.endTime) - startTime : 3));
            const outputFileName = `${baseName}_seg_${i}_${Date.now()}${ext}`;
            const outputPath = path.join(videoDir, outputFileName);

            const args = [
                "-y",
                "-i", cleanAudioPath,
                "-ss", startTime.toFixed(3),
                "-t", duration.toFixed(3),
                "-acodec", "libmp3lame",
                "-q:a", "2",
                outputPath
            ];

            await new Promise((resolve) => {
                const child = spawn(ffmpegPath, args);
                let stderr = "";
                child.stderr.on("data", (d) => { stderr += d.toString(); });
                child.on("close", (code) => {
                    if (code === 0 && fs.existsSync(outputPath)) {
                        results.push({
                            audioPath: outputPath,
                            text: seg.text || "",
                            originalText: seg.originalText || seg.text || "",
                            vietnameseText: seg.vietnameseText || "",
                            startTime: startTime,
                            duration: duration
                        });
                    } else {
                        console.error(`[FFmpeg] Cắt segment ${i} thất bại:`, stderr);
                    }
                    resolve();
                });
                child.on("error", (err) => {
                    console.error(`[FFmpeg] Lỗi process segment ${i}:`, err);
                    resolve();
                });
            });
        }

        sendToRenderer("tools-log", `[FFmpeg] Đã cắt thành công ${results.length}/${segments.length} đoạn audio.`);
        return results;
    });

    // ===== GOOGLE SEARCH CONSOLE IPC =====
    ipcMain.handle("gsc:query", async (_event, args) => {
        const {
            startDate,
            endDate,
            siteUrl,
            mode,
            dimensions,
            rowLimit,
            searchType,
        } = args || {};

        try {
            if (!startDate || !endDate) {
                throw new Error("Thiếu startDate hoặc endDate");
            }

            const site = siteUrl || "https://huyenthuyen.vn/";

            await gscEnsureAuthenticated();

            const webmasters = google.webmasters({
                version: "v3",
                auth: gscOauth2Client,
            });

            const requestBody = {
                startDate,
                endDate,
                searchType: searchType || "WEB",
            };

            if (mode !== "totals") {
                requestBody.dimensions =
                    dimensions && dimensions.length
                        ? dimensions
                        : ["query", "date"];
                requestBody.rowLimit = rowLimit || 25000;
            }

            // GSC coi http:// và https:// là hai property khác nhau (trừ Domain property
            // sc-domain:). Nếu domain lưu thiếu scheme hoặc sai scheme so với property đã
            // verify trong Search Console, tự động thử các dạng còn lại trước khi báo lỗi.
            let candidateSites;
            if (/^https:\/\//i.test(site)) {
                candidateSites = [site, site.replace(/^https:\/\//i, "http://")];
            } else if (/^http:\/\//i.test(site)) {
                candidateSites = [site, site.replace(/^http:\/\//i, "https://")];
            } else {
                // Domain trần không có scheme (VD: "nguoitroly.com") -> ưu tiên https trước
                const bare = site.replace(/\/+$/, "");
                candidateSites = [`https://${bare}/`, `http://${bare}/`, bare];
            }

            let res = null;
            let lastErr = null;
            let usedSite = site;

            for (const candidate of candidateSites) {
                try {
                    res = await webmasters.searchanalytics.query({
                        siteUrl: candidate,
                        requestBody,
                    });
                    usedSite = candidate;
                    break;
                } catch (err) {
                    lastErr = err;
                    const isPermissionErr = /sufficient permission/i.test(
                        (err && err.message) || "",
                    );
                    if (!isPermissionErr) throw err;
                    // Thử scheme kế tiếp nếu là lỗi thiếu quyền do sai scheme
                }
            }

            if (!res) throw lastErr;

            const rows = res.data.rows || [];

            sendToRenderer(
                "tools-log",
                `[GSC] Query OK (site=${usedSite}, mode=${mode || "detail"}), rows=${rows.length}`,
            );

            return {
                success: true,
                rows,
            };
        } catch (e) {
            sendToRenderer("tools-log", `[GSC] Lỗi: ${e.message}`);
            return {
                success: false,
                error: e.message || "Unknown GSC error",
            };
        }
    });

    ipcMain.on("tools-command", (event, data) => {
        try {
            if (!data || !data.command) {
                event.reply("tools-response", {
                    error: "Không có lệnh nào được gửi",
                });
                return;
            }

            if (!data.url) data.url = "https://google.com.vn";

            sendToRenderer(
                "tools-log",
                `Received tools command: ${data.command} (URL: ${data.url})`,
            );

            switch (data.command) {
                case "chupchupchup": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    createTargetWindow(data.url, captureOnlyTargetWindow, uniqueID);
                    break;
                }
                case "dreamina.capcut": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    const defaultOutDir = path.join(
                        documentsDir,
                        "ai.type",
                        "data",
                        "uploads",
                        "thumbnails",
                        data.username,
                    );

                    if (targetWindow && !targetWindow.isDestroyed() && !targetWindow.isWebview) {
                        // Nếu Webview đã mở, chạy script trực tiếp lên đó luôn
                        createImageByDreamina(data.url, uniqueID, {
                            outDir: data.outDir || defaultOutDir,
                            maxImages: data.maxImages || 100,
                            filenamePrefix: data.filenamePrefix || "dream_",
                            prompt: data.prompt,
                        });
                    } else {
                        // Nếu chưa mở (chạy n�?n), g�?i popup như cũ
                        createTargetWindow(
                            data.url,
                            () => {
                                createImageByDreamina(data.url, uniqueID, {
                                    outDir: data.outDir || defaultOutDir,
                                    maxImages: data.maxImages || 100,
                                    filenamePrefix: data.filenamePrefix || "dream_",
                                    prompt: data.prompt,
                                });
                            },
                            uniqueID,
                            data.width || 1000,
                            data.height || 1100,
                        );
                    }
                    break;
                }
                case "facebook-login": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    if (data.cookiePath && fs.existsSync(data.cookiePath)) {
                        setFacebookCookiesFromFile(data.cookiePath).then(() => {
                            sendToRenderer(
                                "tools-log",
                                `[FB-Login] �?ã set cookies từ file: ${data.cookiePath}`,
                            );
                            createTargetWindow(data.url, connectApps, uniqueID);
                            event.reply("tools-response", {
                                success: true,
                                action: "facebook-login",
                                uniqueID,
                            });
                        });
                    } else {
                        createTargetWindow(data.url, connectApps, uniqueID);
                        event.reply("tools-response", {
                            success: true,
                            action: "facebook-login",
                            uniqueID,
                        });
                    }
                    break;
                }
                case "website-crawl": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    const apiKey = "AIzaSyAKUojwbty61HGbsL4rCm4Wby2ujggVm-0";
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({
                        model: "gemini-3.5-flash",
                    });

                    createTargetWindow(
                        data.url,
                        (url, id) =>
                            websiteCrawl(url, id, data.selector || [], model),
                        uniqueID,
                    );
                    break;
                }
                case "get-facebook-cookies": {
                    if (!data.uniqueID) {
                        event.reply("tools-response", { error: "Thiếu uniqueID!" });
                        return;
                    }
                    getFacebookCookies(data.uniqueID, event);
                    break;
                }
                case "facebook-crawl": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    const maxPosts = data.maxPosts || 3;
                    const facegroup = data.facegroup || "";

                    if (data.useWebview) {
                        sendToRenderer(
                            "tools-log",
                            `[FB-Crawl] 🚀 Khởi chạy quét Facebook qua Web Tools...`
                        );
                        facebookCrawl(data);
                    } else if (data.cookiePath && fs.existsSync(data.cookiePath)) {
                        setFacebookCookiesFromFile(data.cookiePath).then(() => {
                            sendToRenderer(
                                "tools-log",
                                `[FB-Crawl] �?ã set cookies từ file: ${data.cookiePath}`,
                            );
                            createTargetWindow(
                                data.url,
                                (url, id) =>
                                    facebookCrawl(data),
                                uniqueID,
                            );
                        });
                    } else {
                        createTargetWindow(
                            data.url,
                            (url, id) =>
                                facebookCrawl(data),
                            uniqueID,
                        );
                    }
                    break;
                }
                case "tiktok-crawl": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    const username = data.tiktoker;
                    const url = `https://www.tiktok.com/@${username}`;

                    createTargetWindow(
                        url,
                        async (targetUrl, id) => {
                            let browser;
                            try {
                                sendToRenderer(
                                    "tools-log",
                                    `[TikTok] 🚀 Chế độ quét hình ảnh kích hoạt cho @${username}`,
                                );
                                const res = await fetch(
                                    "http://localhost:9999/json/version",
                                );
                                const json = await res.json();
                                browser = await puppeteer.connect({
                                    browserWSEndpoint: json.webSocketDebuggerUrl,
                                    defaultViewport: null,
                                });

                                const pages = await browser.pages();
                                const page = pages.find((p) =>
                                    p.url().includes(id),
                                );
                                if (!page) return;

                                // LẮNG NGHE DỮ LIỆU TỪ PRELOAD
                                const linkHandler = (_evt, payload) => {
                                    if (payload && payload.url) {
                                        sendToRenderer("tools-response", {
                                            action: "tiktok-crawl-stream",
                                            success: true,
                                            videos: [
                                                {
                                                    url: payload.url,
                                                    thumbnail: payload.thumbnail,
                                                    title: payload.title,
                                                },
                                            ],
                                        });
                                    }
                                };
                                ipcMain.on("tiktok:link-found", linkHandler);

                                let noChangeCount = 0;
                                let lastHeight = 0;

                                while (noChangeCount < 15) {
                                    const currentHeight = await page
                                        .evaluate(
                                            () =>
                                                document.documentElement
                                                    .scrollHeight,
                                        )
                                        .catch(() => 0);

                                    await page.keyboard.press("End");
                                    await new Promise((r) => setTimeout(r, 3500)); // Đợi lâu chút để ảnh kịp load

                                    if (currentHeight > lastHeight) {
                                        lastHeight = currentHeight;
                                        noChangeCount = 0;
                                    } else {
                                        noChangeCount++;
                                    }

                                    if (page.isClosed()) break;
                                }

                                ipcMain.removeListener(
                                    "tiktok:link-found",
                                    linkHandler,
                                );
                                sendToRenderer(
                                    "tools-log",
                                    `[TikTok] ✅ Hoàn tất quét kênh.`,
                                );
                                sendToRenderer("tools-response", {
                                    action: "tiktok-crawl-finished",
                                });

                                if (browser) await browser.disconnect();
                                if (targetWindow && !targetWindow.isDestroyed() && !targetWindow.isWebview)
                                    targetWindow.close();
                            } catch (err) {
                                sendToRenderer(
                                    "tools-log",
                                    `[TikTok] ❌ Lỗi: ${err.message}`,
                                );
                            }
                        },
                        uniqueID,
                        1280,
                        800,
                    );
                    break;
                }
                case "open-chrome-app": {
                    // Lấy width, height từ data (nếu UI không gửi thì dùng mặc định của hàm)
                    const w = data.width || 1200;
                    const h = data.height || 800;

                    // Gọi hàm với tham số mới
                    openChromeApp(data.url, w, h);

                    event.reply("tools-response", {
                        success: true,
                        action: "open-chrome-app",
                        url: data.url,
                        size: `${w}x${h}`,
                    });
                    break;
                }
                case "zalo-crawl": {
                    const uniqueID = data.uniqueID || createUniqueID();
                    // createTargetWindow của bạn đã có cơ chế callback(url, id) khi 'did-finish-load'
                    // Chúng ta sẽ gọi zaloCrawlDirect ngay tại đó.
                    createTargetWindow(data.url, () => {
                        // targetWindow lúc này đã được khởi tạo trong scope của main.js
                        zaloCrawlDirect(targetWindow, uniqueID);
                    }, uniqueID);
                    break;
                }
                default:
                    event.reply("tools-response", {
                        error: "Command không hỗ trợ!",
                    });
            }
        } catch (error) {
            console.error("tools-command error:", error);
            event.reply("tools-response", { error: error.message });
            require('electron').dialog.showErrorBox("Error in tools-command", error.stack);
        }
    });

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    // (Đã chuyển web-contents-created lên đầu file)

    globalShortcut.register("CommandOrControl+C+G", () => {
        if (targetWindow) targetWindow.close();
    });

    globalShortcut.register("CommandOrControl+Shift+N", () => {
        createMainWindow();
    });

    // ==========================================
    // Cấu hình kiểm tra cập nhật từ Google Drive
    // ==========================================
    const GOOGLE_DRIVE_DOWNLOAD_URL = "https://drive.google.com/drive/folders/1rPJM3BvKHfZNghi8me7zTNADs8vOJCk7?usp=drive_link";

    async function checkGoogleDriveUpdates(manual = false) {
        try {
            let currentVersion = app.getVersion();
            try {
                const pkg = require(path.join(__dirname, '..', 'package.json'));
                if (pkg && pkg.version) currentVersion = pkg.version;
            } catch (e) {}

            sendToRenderer("tools-log", `[AutoUpdate] Đang kiểm tra phiên bản mới từ Google Drive (Hiện tại: v${currentVersion})...`);

            const fetchFolderContent = () => {
                return new Promise((resolve, reject) => {
                    const req = https.get(GOOGLE_DRIVE_DOWNLOAD_URL, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                        timeout: 10000
                    }, (res) => {
                        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            https.get(res.headers.location, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res2) => {
                                let data = '';
                                res2.on('data', chunk => data += chunk);
                                res2.on('end', () => resolve(data));
                            }).on('error', reject);
                            return;
                        }
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => resolve(data));
                    });
                    req.on('error', reject);
                    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout kết nối Google Drive')); });
                });
            };

            const html = await fetchFolderContent();
            const titleMatch = html.match(/<title>AI Type\s+([0-9]+\.[0-9]+\.[0-9]+)/i);
            const exeMatch = html.match(/AI\.Type(?: Setup)?[- ]([0-9]+\.[0-9]+\.[0-9]+)/i);
            const ymlMatch = html.match(/version:\s*([0-9]+\.[0-9]+\.[0-9]+)/i);
            const remoteVersion = (titleMatch && titleMatch[1]) || (exeMatch && exeMatch[1]) || (ymlMatch && ymlMatch[1]);

            if (!remoteVersion) {
                sendToRenderer("tools-log", `[AutoUpdate] Không thể xác định phiên bản trên Google Drive.`);
                if (manual) {
                    dialog.showMessageBox(mainWindow || null, {
                        type: 'info',
                        title: 'Kiểm tra cập nhật',
                        message: `Không lấy được thông tin phiên bản tự động từ Google Drive. Bạn có thể mở trực tiếp thư mục Google Drive để tải bản mới nhất.`,
                        buttons: ['Mở Google Drive', 'Đóng'],
                        defaultId: 0
                    }).then(res => {
                        if (res.response === 0) shell.openExternal(GOOGLE_DRIVE_DOWNLOAD_URL);
                    });
                }
                return { hasUpdate: false, currentVersion, remoteVersion: null };
            }

            const hasUpdate = semver.gt(remoteVersion, currentVersion);

            if (hasUpdate) {
                sendToRenderer("tools-log", `[AutoUpdate] Phát hiện phiên bản mới: v${remoteVersion} (Hiện tại: v${currentVersion}).`);
                dialog.showMessageBox(mainWindow || null, {
                    type: 'info',
                    title: 'Cập nhật phần mềm AI.Type',
                    message: `Đã có phiên bản mới AI.Type v${remoteVersion} trên Google Drive!\n(Phiên bản bạn đang dùng: v${currentVersion})`,
                    detail: 'Bạn có muốn mở thư mục Google Drive để tải về bản cài đặt mới nhất không?',
                    buttons: ['Tải về ngay', 'Để sau'],
                    defaultId: 0,
                    cancelId: 1
                }).then((result) => {
                    if (result.response === 0) {
                        shell.openExternal(GOOGLE_DRIVE_DOWNLOAD_URL);
                    }
                });
                return { hasUpdate: true, currentVersion, remoteVersion, downloadUrl: GOOGLE_DRIVE_DOWNLOAD_URL };
            } else {
                sendToRenderer("tools-log", `[AutoUpdate] Bạn đang sử dụng phiên bản mới nhất (v${currentVersion}).`);
                if (manual) {
                    dialog.showMessageBox(mainWindow || null, {
                        type: 'info',
                        title: 'Kiểm tra cập nhật',
                        message: `Bạn đang sử dụng phiên bản mới nhất AI.Type (v${currentVersion}).`,
                        buttons: ['OK']
                    });
                }
                return { hasUpdate: false, currentVersion, remoteVersion };
            }
        } catch (err) {
            sendToRenderer("tools-log", `[AutoUpdate] Lỗi khi kiểm tra cập nhật: ${err.message}`);
            if (manual) {
                dialog.showMessageBox(mainWindow || null, {
                    type: 'error',
                    title: 'Lỗi kiểm tra cập nhật',
                    message: `Không thể kết nối đến Google Drive để kiểm tra phiên bản: ${err.message}`,
                    buttons: ['Mở Google Drive', 'Đóng'],
                    defaultId: 0
                }).then(res => {
                    if (res.response === 0) shell.openExternal(GOOGLE_DRIVE_DOWNLOAD_URL);
                });
            }
            return { hasUpdate: false, error: err.message };
        }
    }

    // IPC Handlers cho việc kiểm tra cập nhật và mở Google Drive
    ipcMain.handle("app:check-for-updates", async (_e, args) => {
        const manual = args && args.manual !== undefined ? args.manual : true;
        return await checkGoogleDriveUpdates(manual);
    });

    ipcMain.handle("app:open-download-drive", async () => {
        await shell.openExternal(GOOGLE_DRIVE_DOWNLOAD_URL);
        return { success: true };
    });

    // Tự động kiểm tra phiên bản sau khi khởi động app 3 giây
    setTimeout(() => {
        checkGoogleDriveUpdates(false).catch(() => {});
    }, 3000);

    globalShortcut.register("CommandOrControl+Shift+L", () => {
        if (mainWindow) {
            mainWindow.webContents.send("tools-response", { action: "toggle-gemini-webview" });
        }
    });

    // Tắt phím tắt global CTRL+SHIFT+R để tránh xung đột
    // Tính năng refresh được xử lý qua Menu "Hiển thị" (View Menu)
});

// Hủy đăng ký khi ứng dụng đóng để tránh rò rỉ bộ nhớ
app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (serviceProcess) serviceProcess.kill("SIGTERM");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.on('resize-window', (event, { width, height }) => {
    // Lấy cửa sổ hiện tại đang được focus (hoặc mainWindow)
    const win = BrowserWindow.getFocusedWindow() || mainWindow;

    if (win) {
        // �?ổi kích thước cửa sổ (true = có hiệu ứng animation resize mượt mà trên macOS/Windows)
        win.setSize(width, height, true);

        // Căn giữa cửa sổ lại ra giữa màn hình để không bị lẹm ra ngoài
        win.center();
    }
});

ipcMain.handle("ads:keywordIdeas", async (_event, args) => {
    try {
        const keywordText = args && args.keywordText;
        const languageConstant = args && args.languageConstant;
        const geoTargetConstants = args && args.geoTargetConstants;
        const customerId = ADS_CUSTOMER_ID || (args && args.customerId);

        const result = await googleAdsGenerateKeywordIdeas({
            keywordText,
            customerId,
            language: languageConstant,
            geoTargetConstants,
        });

        return {
            success: true,
            results: result.results || result.keywordIdeas || [],
        };
    } catch (err) {
        return {
            success: false,
            error: err.message || String(err),
        };
    }
});

// =====================================================================
// Google Analytics 4 (GA4) – Data API (IPC: ga:report)
// =====================================================================

// Nếu bạn muốn set mặc định property ID qua biến môi trư�?ng:
const GA_DEFAULT_PROPERTY_ID = process.env.GA_PROPERTY_ID || "293654701";

// ✅ �?ƯỜNG DẪN MẶC �?ỊNH: C:\Users\<User>\Documents\ai.type\ga4-service.json
const GA_KEY_FILE_DEFAULT = path.join(
    documentsDir,
    "ai.type",
    "ga4-service.json",
);

function resolveGaKeyFile() {
    // 1) Ưu tiên: GA_KEY_FILE trong biến môi trư�?ng
    if (process.env.GA_KEY_FILE && fileExists(process.env.GA_KEY_FILE)) {
        return process.env.GA_KEY_FILE;
    }

    // 2) Mặc định: Documents\ai.type\ga4-service.json (trư�?ng hợp của bạn)
    if (fileExists(GA_KEY_FILE_DEFAULT)) {
        return GA_KEY_FILE_DEFAULT;
    }

    // 3) Khi đóng gói: resources/ga4-service.json
    if (process.resourcesPath) {
        const candidateRes = path.join(
            process.resourcesPath,
            "ga4-service.json",
        );
        if (fileExists(candidateRes)) return candidateRes;
    }

    // 4) Khi chạy dev: đặt ga4-service.json cạnh main.js (../ga4-service.json)
    const candidateDev = path.join(__dirname, "..", "ga4-service.json");
    if (fileExists(candidateDev)) return candidateDev;

    return null;
}

let gaAuth = null;
let gaServiceAccountEmail = null;

function getGaServiceAccountEmail() {
    if (gaServiceAccountEmail) return gaServiceAccountEmail;
    const keyFile = resolveGaKeyFile();
    if (!keyFile) return null;
    try {
        const raw = fs.readFileSync(keyFile, "utf8");
        const json = JSON.parse(raw);
        gaServiceAccountEmail = json.client_email || null;
        return gaServiceAccountEmail;
    } catch (e) {
        return null;
    }
}

async function getGaAccessToken() {
    const keyFile = resolveGaKeyFile();
    if (!keyFile) {
        throw new Error(
            "Không tìm thấy file ga4-service.json. " +
            "Hãy lưu file service account JSON vào C:\\Users\\<User>\\Documents\\ai.type\\ga4-service.json, " +
            "hoặc set env GA_KEY_FILE, hoặc copy vào resources/ga4-service.json.",
        );
    }

    if (!gaAuth) {
        gaAuth = new GoogleAuth({
            keyFile,
            scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
        });
    }

    const client = await gaAuth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token =
        typeof tokenResponse === "string"
            ? tokenResponse
            : tokenResponse && tokenResponse.token;

    if (!token) {
        throw new Error("Không lấy được access token cho Google Analytics 4");
    }

    return token;
}

ipcMain.handle("ga:report", async (_event, args) => {
    try {
        const {
            propertyId,
            startDate,
            endDate,
            metrics,
            dimensions,
            dimensionFilter,
            limit,
        } = args || {};

        if (!startDate || !endDate) {
            throw new Error("Thiếu startDate hoặc endDate cho GA4");
        }

        const propId = propertyId || GA_DEFAULT_PROPERTY_ID;
        if (!propId) {
            throw new Error(
                "Thiếu GA4 property ID. " +
                "Hãy nhập trong UI hoặc set biến môi trư�?ng GA_PROPERTY_ID.",
            );
        }

        const token = await getGaAccessToken();

        const body = {
            dateRanges: [
                {
                    startDate,
                    endDate,
                },
            ],
            metrics: (metrics && metrics.length
                ? metrics
                : [
                    "activeUsers",
                    "sessions",
                    "screenPageViews",
                    "engagementRate",
                ]
            ).map((name) => ({ name })),
            dimensions: (dimensions && dimensions.length ? dimensions : []).map(
                (name) => ({ name }),
            ),
            limit: limit || 100,
        };

        if (dimensionFilter) {
            body.dimensionFilter = dimensionFilter;
        }

        const postData = JSON.stringify(body);

        const result = await new Promise((resolve, reject) => {
            const req = https.request(
                {
                    method: "POST",
                    hostname: "analyticsdata.googleapis.com",
                    path: `/v1beta/properties/${propId}:runReport`,
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(postData),
                        Authorization: `Bearer ${token}`,
                    },
                },
                (res) => {
                    let raw = "";
                    res.on("data", (chunk) => (raw += chunk.toString()));
                    res.on("end", () => {
                        try {
                            const json = raw ? JSON.parse(raw) : {};
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(json);
                            } else {
                                reject(
                                    new Error(
                                        json.error?.message ||
                                        `Google Analytics API Error ${res.statusCode}`,
                                    ),
                                );
                            }
                        } catch (e) {
                            reject(
                                new Error(
                                    `Không parse được JSON từ GA4 API (status ${res.statusCode})`,
                                ),
                            );
                        }
                    });
                },
            );

            req.on("error", (err) => reject(err));
            req.write(postData);
            req.end();
        });

        sendToRenderer(
            "tools-log",
            `[GA4] runReport OK (metrics=${(metrics || []).join(
                ",",
            )}, dimensions=${(dimensions || []).join(",")})`,
        );

        return {
            success: true,
            result,
        };
    } catch (err) {
        let errorMsg = (err && err.message) || String(err);

        if (errorMsg.includes("sufficient permissions")) {
            const saEmail = getGaServiceAccountEmail();
            if (saEmail) {
                errorMsg +=
                    `\n\nNguyên nhân: App dùng Service Account ${saEmail} để gọi GA4 Data API (không phải tài khoản Google của bạn). ` +
                    `Service Account này chưa được thêm vào property GA4 này nên bị chặn quyền.\n\n` +
                    `Cách khắc phục:\n` +
                    `1. Vào Google Analytics (analytics.google.com) → chọn đúng property.\n` +
                    `2. Vào Admin (biểu tượng bánh răng) → Property Access Management (Quản lý quyền truy cập property).\n` +
                    `3. Bấm + → Add users.\n` +
                    `4. Dán email: ${saEmail}\n` +
                    `5. Chọn quyền Viewer (Người xem) là đủ để đọc báo cáo.\n` +
                    `6. Lưu, rồi quay lại app bấm "Lấy dữ liệu & Phân tích đa chiều" lại.\n\n` +
                    `Nếu bạn quản lý nhiều domain/property khác nhau, mỗi property mới cũng cần add lại email Service Account này một lần.`;
            }
        }

        sendToRenderer("tools-log", `[GA4] Lỗi: ${errorMsg}`);
        return {
            success: false,
            error: errorMsg,
        };
    }
});

async function zaloCrawlDirect(tWindow, uniqueID) {
    if (!tWindow) return;

    sendToRenderer("tools-log", "[Zalo-Direct] 🚀 �?ang trích xuất dữ liệu từ 44 bảng...");

    try {
        // Thực thi script lấy toàn bộ dữ liệu từ IndexedDB
        const result = await tWindow.webContents.executeJavaScript(`
            (async () => {
                try {
                    const uid = localStorage.getItem('sh_zlast_uid');
                    if (!uid) return { error: "Không thấy UID" };
                    const dbName = "zdb_" + uid;

                    return new Promise((resolve) => {
                        const req = indexedDB.open(dbName);
                        req.onsuccess = async (e) => {
                            const db = e.target.result;
                            const storeNames = Array.from(db.objectStoreNames);
                            const allData = {};

                            for (const name of storeNames) {
                                try {
                                    allData[name] = await new Promise((resStore) => {
                                        const transaction = db.transaction(name, "readonly");
                                        const store = transaction.objectStore(name);
                                        const getReq = store.getAll();
                                        getReq.onsuccess = () => resStore(getReq.result);
                                        getReq.onerror = () => resStore([]);
                                    });
                                } catch (err) { allData[name] = []; }
                            }
                            db.close();
                            resolve({ success: true, uid, data: allData });
                        };
                        req.onerror = () => resolve({ error: "Open DB fail" });
                    });
                } catch (err) { return { error: err.message }; }
            })()
        `);

        if (result.error) {
            sendToRenderer("tools-log", "[Zalo-Direct] ⚠? " + result.error);
        } else {
            // --- PHẦN GHI FILE ---
            const timestamp = new Date().getTime();
            const fileName = `zalo_dump_${result.uid}_${timestamp}.json`;
            // Lưu vào Documents/ai.type/data/ (giống các project khác của bạn)
            const saveDir = path.join(os.homedir(), "Documents", "ai.type", "data", "zalo");

            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }

            const filePath = path.join(saveDir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2), "utf-8");

            sendToRenderer("tools-log", `[Zalo-Direct] ✅ �?ã lưu file: ${filePath}`);

            // Trả v�? response có chứa 'path' để Angular không bị undefined
            sendToRenderer("tools-response", {
                action: "zalo-crawl",
                success: true,
                path: filePath, // �?ư�?ng dẫn file thực tế
                uid: result.uid
            });
        }
    } catch (e) {
        sendToRenderer("tools-log", "[Zalo-Direct] �?� Lỗi: " + e.message);
    }
}

// =====================================================================
// [RENDER VIDEO] C�?C HÀM TIỆN �?CH DÀNH RIÊNG CHO RENDER FFmpeg
// =====================================================================

function cleanFilePath(fileUrl) {
    if (!fileUrl) return '';
    let p = fileUrl;

    if (p.startsWith('media://')) {
        p = p.substring(8);
        if (p.toLowerCase().startsWith('auto_find/')) {
            const rest = p.substring(10);
            const parts = rest.split('/');
            const uuid = parts[0];
            const basename = parts.slice(1).join('/');
            const docPath = app.getPath('documents');
            p = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin', uuid, basename);
        } else if (p.toLowerCase().startsWith('smart_find/')) {
            // Very simplified smart_find resolver for safety
            const queryString = p.substring(p.indexOf('?') + 1);
            const params = new URLSearchParams(queryString);
            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\/\//i, '');
            if (originalPath.includes('?')) originalPath = originalPath.split('?')[0];
            if (originalPath.includes('#')) originalPath = originalPath.split('#')[0];
            p = originalPath;
        } else {
            if (p.startsWith('/')) p = p.substring(1);
            const driveMatch = p.match(/^([a-zA-Z])(:?)\//);
            if (driveMatch) {
                const driveLetter = driveMatch[1].toUpperCase();
                if (driveMatch[2] === ':') p = driveLetter + p.substring(1);
                else p = driveLetter + ':' + p.substring(1);
            } else {
                p = '/' + p;
            }
        }
    }

    if (p.startsWith('file://')) {
        try {
            const url = require('url');
            p = url.fileURLToPath(p);
        } catch (e) {
            p = p.substring(7); // Giữ lại dấu / đầu tiên
            if (process.platform === 'win32' && p.match(/^\/[a-zA-Z]:/)) {
                p = p.substring(1);
            }
        }
    }

    try {
        p = decodeURIComponent(p); // Giải mã %20 thành dấu cách
    } catch (e) { }

    if (process.platform === 'win32') {
        p = p.replace(/\//g, '\\');
    }

    return p;
}


async function checkAudioStream(filePath) {
    const ffmpegCmd = binaries.ffmpeg || "ffmpeg";
    try {
        await execPromise(`"${ffmpegCmd}" -i "${filePath}"`, { timeout: 10000 });
        return false;
    } catch (e) {
        return e.message.includes('Audio:');
    }
}

function getAudioTempoFilter(speed) {
    if (speed === 1) return 'atempo=1.0';
    if (speed > 2.0) {
        let filter = '';
        let s = speed;
        while (s > 2.0) { filter += 'atempo=2.0,'; s /= 2.0; }
        filter += `atempo=${s}`;
        return filter;
    } else if (speed < 0.5) {
        let filter = '';
        let s = speed;
        while (s < 0.5) { filter += 'atempo=0.5,'; s /= 0.5; }
        filter += `atempo=${s}`;
        return filter;
    }
    return `atempo=${speed}`;
}

async function getAudioDuration(filePath) {
    const ffmpegCmd = binaries.ffmpeg || "ffmpeg"; // Fallback v�? system nếu file đi kèm bị lỗi/mất
    try {
        await execPromise(`"${ffmpegCmd}" -i "${filePath}"`);
        return 2.0;
    } catch (e) {
        const match = e.message.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d+)/);
        if (match) {
            const hours = parseInt(match[1], 10);
            const minutes = parseInt(match[2], 10);
            const seconds = parseFloat(match[3]);
            return hours * 3600 + minutes * 60 + seconds;
        }
        return 2.0;
    }
}

function formatVttTime(ms) {
    const h = Math.floor(ms / 3600000); ms %= 3600000;
    const m = Math.floor(ms / 60000); ms %= 60000;
    const s = Math.floor(ms / 1000);
    const milli = Math.floor(ms % 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

// =====================================================================
// IPC HANDLER: RENDER CUSTOM VIDEO CHUẨN STUDIO (CH�?NG LỆCH AUDIO)
// =====================================================================

/**
 * Chạy FFmpeg bằng spawn để xử lý tham số chính xác hơn exec
 */
function spawnFFmpeg(args, cwd) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = binaries.ffmpeg;
        const child = spawn(ffmpegPath, args, { cwd });

        let stderr = "";
        child.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exit code ${code}. Stderr: ${stderr.slice(-500)}`));
        });
    });
}

ipcMain.handle('render-custom-video', async (event, projectData) => {
    try {
        if (!binaries.ffmpeg) {
            return { success: false, error: "Thiếu FFmpeg binary." };
        }

        // sendToRenderer("tools-log", `[Render] �?ang sử dụng phương thức Spawn (Array Args)...`);
        sendNotification("Xuất video", `�?ang khởi tạo render: ${projectData.title}`);

        // 1. Cấu hình khung hình
        let w = 1080, h = 1920;
        if (projectData.exportRatio === '16:9') { w = 1920; h = 1080; }
        else if (projectData.exportRatio === '1:1') { w = 1080; h = 1080; }

        const includeSubtitle = projectData.withSubtitle === true;
        const workspaceDir = path.join(app.getPath('documents'), 'ai.type', 'data', 'exports', projectData.uuid || Date.now().toString());

        if (fs.existsSync(workspaceDir)) fs.rmSync(workspaceDir, { recursive: true, force: true });
        fs.mkdirSync(workspaceDir, { recursive: true });

        const sceneVideos = [];
        let finalAudioListContent = "ffconcat version 1.0\n";

        // --- BƯỚC 1: XỬ L�? TỪNG SCENE ---
        for (let i = 0; i < projectData.scenes.length; i++) {
            const scene = projectData.scenes[i];

            // Hỗ trợ cấu trúc mới: hình ảnh có thể nằm trong mảng videos
            let sceneImg = scene.imageUrl;
            if (!sceneImg && scene.videos && scene.videos.length > 0) {
                const validVideo = scene.videos.find(v => v.imageUrl);
                if (validVideo) sceneImg = validVideo.imageUrl;
            }

            const originalImgPath = cleanFilePath(sceneImg);

            if (!originalImgPath || !fs.existsSync(originalImgPath) || !scene.subtitles?.length) continue;

            // Copy input vào workspace để sạch đư�?ng dẫn
            const imgExt = path.extname(originalImgPath) || '.jpeg';
            const localInputName = `input_${i}${imgExt}`;
            fs.copyFileSync(originalImgPath, path.join(workspaceDir, localInputName));

            let sceneDurationMs = 0;
            let mergedVtt = "WEBVTT\n\n";

            for (let j = 0; j < scene.subtitles.length; j++) {
                const sub = scene.subtitles[j];
                const originalAudioPath = cleanFilePath(sub.audioUrl);
                if (!originalAudioPath || !fs.existsSync(originalAudioPath)) continue;

                const wavName = `audio_${i}_${j}.wav`;

                // Chuẩn hóa Audio bằng spawn
                await spawnFFmpeg(['-y', '-i', originalAudioPath, '-ar', '44100', '-ac', '2', wavName], workspaceDir);

                const durationSec = await getAudioDuration(path.join(workspaceDir, wavName));
                const durationMs = Math.round(durationSec * 1000);

                mergedVtt += `${formatVttTime(sceneDurationMs)} --> ${formatVttTime(sceneDurationMs + durationMs)}\n${sub.text.replace(/\n/g, ' ')}\n\n`;
                sceneDurationMs += durationMs;
                finalAudioListContent += `file '${wavName}'\n`;
            }

            const sceneDurationSec = (sceneDurationMs / 1000).toFixed(3);
            const sceneVideoName = `scene_${i}.mp4`;

            // Xử lý Video Filter
            let videoFilter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
            if (includeSubtitle) {
                const vttName = `scene_${i}.vtt`;
                fs.writeFileSync(path.join(workspaceDir, vttName), mergedVtt, 'utf-8');
                // Lưu ý: Dùng dấu nháy đơn lồng nhau cho tham số filename bên trong filter
                videoFilter += `,subtitles=filename='${vttName}':force_style='FontName=Arial,FontSize=18'`;
            }

            const isVideo = localInputName.toLowerCase().endsWith('.mp4');
            const args = [
                '-y',
                ...(isVideo ? ['-stream_loop', '-1', '-i', localInputName] : ['-loop', '1', '-framerate', '30', '-i', localInputName]),
                '-t', sceneDurationSec,
                '-vf', videoFilter,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
                sceneVideoName
            ];

            await spawnFFmpeg(args, workspaceDir);
            sceneVideos.push(sceneVideoName);
        }

        // --- BƯỚC 2: GỘP AUDIO TỔNG ---
        if (finalAudioListContent.trim() === "ffconcat version 1.0" || sceneVideos.length === 0) {
            throw new Error('Dữ liệu Render trống. Hãy đảm bảo bạn đã tải đầy đủ hình ảnh và file audio cho các phân cảnh (Không bị xóa mất file gốc dưới máy tính).');
        }

        fs.writeFileSync(path.join(workspaceDir, 'audios.txt'), finalAudioListContent);
        await spawnFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', 'audios.txt', '-ar', '44100', '-ac', '2', 'final_audio.wav'], workspaceDir);

        // --- BƯỚC 3: GỘP VIDEO TỔNG ---
        const videoListContent = "ffconcat version 1.0\n" + sceneVideos.map(v => `file '${v}'`).join('\n') + '\n';
        fs.writeFileSync(path.join(workspaceDir, 'videos.txt'), videoListContent);
        await spawnFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', 'videos.txt', '-c', 'copy', 'final_video_muted.mp4'], workspaceDir);

        // --- BƯỚC 4: MUXING & EXPORT ---
        const safeTitle = projectData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const finalExportPath = path.join(app.getPath('documents'), 'ai.type', 'data', 'exports', `${safeTitle}_${Date.now()}.mp4`);

        await spawnFFmpeg(['-y', '-i', 'final_video_muted.mp4', '-i', 'final_audio.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', 'output.mp4'], workspaceDir);

        fs.copyFileSync(path.join(workspaceDir, 'output.mp4'), finalExportPath);

        sendNotification("Thành Công!", `Video của bạn đã sẵn sàng`);

        return { success: true, path: finalExportPath, url: `file://${finalExportPath}` };
    } catch (err) {
        console.error("Spawn Render Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('apply-rvc', async (event, payload) => {
    try {
        const { inputAudio, outputAudio, pitch, pthPath, indexPath } = payload;
        const fs = require('fs'); // �?ảm bảo có thư viện xử lý file

        // CH�?NG LỖI CÂM (0 BYTES): Bắt Python xuất ra file tạm trước
        const tempOutput = inputAudio + ".tmp.wav";

        sendToRenderer("tools-log", `[RVC] �?ang g�?i API biến đổi gi�?ng...`);

        const response = await fetch('http://127.0.0.1:7890/api/rvc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: inputAudio,
                model: pthPath,
                index: indexPath || "",
                output: tempOutput, // <--- ÉP PYTHON GHI VÀO FILE TẠM
                pitch: pitch || 0
            })
        });

        const data = await response.json();

        if (data.success && fs.existsSync(tempOutput)) {
            // KHI PYTHON LÀM XONG -> LẤY FILE TẠM GHI �?È THẲNG LÊN FILE OUTPUT
            if (fs.existsSync(outputAudio)) {
                try { fs.unlinkSync(outputAudio); } catch (e) { } // Xóa output cũ nếu có
            }
            fs.renameSync(tempOutput, outputAudio); // Di chuyển file tạm thành output chính

            // Nếu file đầu vào là .mp3, mà output là .wav, ta d�?n sạch luôn file .mp3 gốc cho rỗng thùng rác
            if (inputAudio !== outputAudio && fs.existsSync(inputAudio)) {
                try { fs.unlinkSync(inputAudio); } catch (e) { }
            }

            sendToRenderer("tools-log", `[RVC] ✅ �?ã biến đổi và ghi đè file thành công!`);
            return { success: true, path: outputAudio };
        } else {
            sendToRenderer("tools-log", `[RVC] �?� Lỗi từ API: ${data.error}`);
            return { success: false, error: data.error };
        }
    } catch (error) {
        sendToRenderer("tools-log", `[RVC] �?� Mất kết nối tới Python API: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// Thêm vào trong app.whenReady() hoặc khu vực định nghĩa ipcMain
ipcMain.handle("tts-ausync-generate", async (event, payload) => {
    const { text, voice_id, speed, filename, username, key } = payload;

    try {
        // BƯỚC 1: POST yêu cầu tạo Audio với đầy đủ các trường bắt buộc
        const postRes = await fetch("https://api.ausynclab.io/api/v1/speech/text-to-speech", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": key
            },
            body: JSON.stringify({
                "audio_name": filename, // Sử dụng tên file làm tên audio
                "text": text,
                "voice_id": parseInt(voice_id),
                "speed": speed || 1.0,
                "model_name": "myna-2", // Model bắt buộc theo yêu cầu
                "language": "vi",       // Ngôn ngữ tiếng Việt
                "callback_url": ""      // �?ể trống vì chúng ta dùng cơ chế Polling (h�?i liên tục)
            })
        });

        const postData = await postRes.json();

        // Kiểm tra mã trạng thái từ API
        if (postData.status !== 200 || !postData.result || !postData.result.audio_id) {
            throw new Error(postData.message || "Không thể khởi tạo audio trên AusyncLab. Kiểm tra lại API Key hoặc Voice ID.");
        }

        const audioId = postData.result.audio_id;
        let audioUrl = "";
        let attempts = 0;

        // BƯỚC 2: Polling GET để ch�? file hoàn thành (GET https://api.ausynclab.io/api/v1/speech/{audio_id})
        sendToRenderer("tools-log", `[AusyncLab] �?ang xử lý Audio ID: ${audioId}...`);

        while (attempts < 200) { // Tăng lên 20 lần (khoảng 400 giây) cho an toàn
            const getRes = await fetch(`https://api.ausynclab.io/api/v1/speech/${audioId}`, {
                headers: { "x-api-key": key }
            });
            const getData = await getRes.json();

            if (getData.status === 200 && getData.result.state === "SUCCEED") {
                audioUrl = getData.result.audio_url; // Lấy URL file .wav thành phẩm
                break;
            } else if (getData.result.state === "FAILED") {
                throw new Error("AusyncLab báo lỗi khi đang xử lý chuyển đổi văn bản.");
            }

            // �?ợi 2 giây trước khi h�?i lại
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!audioUrl) throw new Error("Quá th�?i gian ch�? (Timeout) - API chưa trả v�? link download.");

        // BƯỚC 3: Tải file v�? thư mục cục bộ giống generateEdgeTTSLocal
        const documentsPath = app.getPath("documents");
        const saveDir = path.join(documentsPath, "ai.type", "data", "tts", username);
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

        // Xác định đư�?ng dẫn file cuối cùng (thư�?ng Ausync trả v�? .wav)
        const filePath = path.join(saveDir, `${filename}.wav`);

        const fileRes = await fetch(audioUrl);
        if (!fileRes.ok) throw new Error("Không thể kết nối tới máy chủ lưu trữ audio để tải file.");

        const buffer = await fileRes.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return {
            success: true,
            filePath: filePath // Trả v�? đư�?ng dẫn để Angular load vào WaveSurfer
        };

    } catch (error) {
        console.error("AusyncLab TTS Error:", error);
        return { success: false, error: error.message };
    }
});

// Thêm một Set ở đầu file để lưu trữ các task đang chạy
const activeTtsTasks = new Set();

ipcMain.handle("get-colab-voices", async () => {
    try {
        const voicesDir = path.join(app.getPath("documents"), "ai.type", "voices");
        if (!fs.existsSync(voicesDir)) {
            fs.mkdirSync(voicesDir, { recursive: true });
            return [];
        }
        const files = fs.readdirSync(voicesDir);
        const wavFiles = files.filter(f => f.toLowerCase().endsWith(".wav") || f.toLowerCase().endsWith(".mp3"));
        
        return wavFiles.map(file => {
            const rawName = path.basename(file, path.extname(file));
            const txtFile = path.join(voicesDir, `${rawName}.txt`);
            let refText = "";
            if (fs.existsSync(txtFile)) {
                try {
                    refText = fs.readFileSync(txtFile, "utf8").trim();
                } catch (e) {}
            }
            const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            return {
                id: `omnivoice-${rawName.toLowerCase()}`,
                name: displayName,
                voiceKey: rawName.toLowerCase(),
                audioFile: file,
                refText: refText
            };
        });
    } catch (err) {
        console.error("[TTS] Lỗi khi lấy danh sách voices từ Documents/ai.type/voices:", err);
        return [];
    }
});

ipcMain.handle("tts-type-generate", async (event, payload) => {
    const { text, voice_id, speed, ref_audio_name, ref_text, num_step, filename, username, ref_audio_base64 } = payload;

    // Kiểm tra xem có kết nối Colab GPU đang hoạt động hay không
    let colabBaseUrl = null;
    try {
        if (colabMcpClient && colabMcpClient.isConnected && colabMcpClient.baseUrl) {
            colabBaseUrl = colabMcpClient.baseUrl;
        } else {
            // Thử kiểm tra daemon local cổng 7868
            const localResp = await fetch("http://127.0.0.1:7868/status", { signal: AbortSignal.timeout(1500) });
            if (localResp.ok) {
                const statusJson = await localResp.json();
                if (statusJson && statusJson.is_connected && statusJson.colab_url) {
                    colabBaseUrl = statusJson.colab_url;
                }
            }
        }
    } catch (e) {}

    // Định nghĩa Base URL của API (ưu tiên Colab OmniVoice, fallback sang tts.type.vn)
    const isColab = !!colabBaseUrl;
    const API_BASE_URL = isColab ? colabBaseUrl.replace(/\/+$/, "") : "https://tts.type.vn";

    try {
        const logPrefix = isColab ? "[OmniVoice Colab]" : "[Type TTS]";
        sendToRenderer("tools-log", `${logPrefix} Đang gửi yêu cầu tạo audio tới ${API_BASE_URL} cho: ${filename}...`);

        const requestBody = {
            "text": text,
            "ref_audio_name": ref_audio_name,
            "ref_text": ref_text || "",
            "speed": Number(speed) || 1.0,
            "num_step": Number(num_step) || 16
        };

        // Tự động tìm nạp voice sample từ Documents/ai.type/voices
        let finalRefBase64 = ref_audio_base64;
        let finalRefText = ref_text ? ref_text.trim() : "";

        if (ref_audio_name) {
            const rawVoiceKey = path.basename(ref_audio_name, path.extname(ref_audio_name)).toLowerCase();

            try {
                const voicesDir = path.join(app.getPath("documents"), "ai.type", "voices");
                const sampleCandidates = [
                    path.join(voicesDir, ref_audio_name),
                    path.join(voicesDir, `${ref_audio_name}.wav`),
                    path.join(voicesDir, `${rawVoiceKey}.wav`),
                    path.join(voicesDir, `${rawVoiceKey}.mp3`)
                ];
                for (const cand of sampleCandidates) {
                    if (fs.existsSync(cand)) {
                        if (!finalRefBase64) {
                            finalRefBase64 = fs.readFileSync(cand).toString("base64");
                        }
                        const txtCand = cand.replace(/\.[^/.]+$/, ".txt");
                        if (!finalRefText && fs.existsSync(txtCand)) {
                            finalRefText = fs.readFileSync(txtCand, "utf8").trim();
                        }
                        break;
                    }
                }
            } catch (err) {
                console.error("[TTS] Không thể đọc voice sample cục bộ:", err);
            }
        }

        if (finalRefBase64) {
            requestBody["ref_audio_base64"] = finalRefBase64;
        }
        if (finalRefText) {
            requestBody["ref_text"] = finalRefText;
        }

        const postRes = await fetch(`${API_BASE_URL}/generate_audio_async`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (!postRes.ok) throw new Error(`HTTP Error: ${postRes.status}`);
        const postData = await postRes.json();
        const taskId = postData.task_id;

        if (!taskId) throw new Error("API không trả về Task ID");

        // BỎ TASK ID VÀO SỔ THEO DÕI
        activeTtsTasks.add({ id: taskId, baseUrl: API_BASE_URL });

        // BƯỚC 2: Polling (Hỏi thăm) xem file đã xong chưa
        sendToRenderer("tools-log", `${logPrefix} Đang xử lý Audio trên GPU (Task ID: ${taskId})...`);

        let downloadPath = "";
        let attempts = 0;

        while (attempts < 900) { // Timeout 30 phút cho máy chủ xử lý
            const currentItem = Array.from(activeTtsTasks).find(t => (typeof t === 'string' ? t === taskId : t.id === taskId));
            if (!currentItem) {
                throw new Error("Task đã bị hủy bởi người dùng.");
            }

            const statusRes = await fetch(`${API_BASE_URL}/status/${taskId}`);
            const statusData = await statusRes.json();

            if (statusData.status === "done") {
                downloadPath = statusData.download_url;
                break;
            } else if (statusData.status === "error" || statusData.status === "cancelled") {
                throw new Error(statusData.message || "Quá trình tạo audio đã bị dừng hoặc lỗi.");
            }

            // Chờ 2 giây trước khi hỏi lại
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!downloadPath) throw new Error("Quá thời gian chờ (Timeout) - API chạy quá lâu.");

        // BƯỚC 3: Tải file audio về máy tính
        sendToRenderer("tools-log", `${logPrefix} Đã xử lý xong, đang tải file về...`);

        // KHI NÀO TẢI XONG FILE, XÓA TASK KHỎI SỔ
        for (const item of activeTtsTasks) {
            if ((typeof item === 'string' && item === taskId) || item.id === taskId) {
                activeTtsTasks.delete(item);
            }
        }

        const fullDownloadUrl = downloadPath.startsWith("http") ? downloadPath : `${API_BASE_URL}${downloadPath}`;
        const fileRes = await fetch(fullDownloadUrl);
        if (!fileRes.ok) throw new Error("Không thể tải file âm thanh từ server.");

        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Thiết lập đường dẫn lưu cục bộ
        const documentsPath = app.getPath("documents");
        const saveDir = path.join(documentsPath, "ai.type", "data", "tts", username || "default");

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const safeFilename = filename.endsWith(".wav") ? filename : `${filename}.wav`;
        const filePath = path.join(saveDir, safeFilename);

        // Ghi file
        fs.writeFileSync(filePath, buffer);

        sendToRenderer("tools-log", `${logPrefix} ✅ Đã lưu file thành công tại: ${filePath}`);

        return {
            success: true,
            filePath: filePath
        };

    } catch (error) {
        console.error("Type TTS Error:", error);
        sendToRenderer("tools-log", `[TTS Error] ❌ Lỗi: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// 2. THÊM CỔNG MỚI ĐỂ NHẬN LỆNH HỦY TỪ ANGULAR
ipcMain.handle('cancel-tts', async (event) => {
    console.log('Nhận lệnh hủy từ UI. Đang hủy các task:', Array.from(activeTtsTasks));

    const cancelPromises = [];

    // Duyệt qua tất cả các task đang chạy ngầm và gọi API hủy
    for (const taskItem of activeTtsTasks) {
        const taskId = typeof taskItem === 'string' ? taskItem : taskItem.id;
        const targetBaseUrl = typeof taskItem === 'string' ? "https://tts.type.vn" : (taskItem.baseUrl || "https://tts.type.vn");
        cancelPromises.push(
            fetch(`${targetBaseUrl}/cancel_task/${taskId}`, { method: 'POST' })
                .catch(err => console.log(`Lỗi hủy task ${taskId}:`, err.message))
        );
    }

    // Đợi gửi lệnh hủy xong
    await Promise.all(cancelPromises);

    // Xóa sạch sổ
    activeTtsTasks.clear();
    return { success: true };
});

ipcMain.handle('upload-to-archive-org', async (event, payload) => {
    try {
        const { accessKey, secretKey, title, creator, collection, username, clips } = payload;

        if (!accessKey || !secretKey) {
            return { success: false, error: 'Thiếu Access Key hoặc Secret Key của Archive.org.' };
        }

        if (!clips || clips.length === 0) {
            return { success: false, error: 'Không có file audio nào để upload.' };
        }

        const toArchiveOrgHeader = (val) => {
            if (!val) return '';
            const str = String(val).trim().replace(/[\r\n]+/g, ' ');
            if (!str) return '';
            if (/[^\x00-\x7F]/.test(str)) {
                return `uri(${encodeURIComponent(str)})`;
            }
            return str;
        };

        const cleanTitle = (title || 'audio')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .substring(0, 40);

        const identifier = `aitype-${cleanTitle || 'voice'}-${Date.now()}`;
        const https = require('https');
        const fs = require('fs');
        const path = require('path');

        console.log(`[Archive.org] Bắt đầu upload tất cả ${clips.length} file audio cho item: ${identifier}`);

        let uploadedCount = 0;
        const uploadedFiles = [];
        for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            let filePath = clip.localFilePath;

            if (!filePath && clip.audioFileName) {
                const documentsPath = app.getPath('documents');
                filePath = path.join(documentsPath, 'ai.type', 'data', 'tts', username || 'anonymous', clip.audioFileName);
            }

            if (!filePath || !fs.existsSync(filePath)) {
                console.warn(`[Archive.org] File không tồn tại trên đĩa: ${filePath}`);
                continue;
            }

            const rawFileName = clip.audioFileName || path.basename(filePath);
            const safeFileName = encodeURIComponent(rawFileName);
            const fileStats = fs.statSync(filePath);
            const uploadUrl = `https://s3.us.archive.org/${identifier}/${safeFileName}`;
            const directDownloadUrl = `https://archive.org/download/${identifier}/${safeFileName}`;

            console.log(`[Archive.org] Uploading file ${i + 1}/${clips.length}: ${rawFileName} (${fileStats.size} bytes)...`);

            await new Promise((resolve, reject) => {
                const req = https.request(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `LOW ${accessKey.trim()}:${secretKey.trim()}`,
                        'Content-Length': fileStats.size,
                        'x-archive-auto-make-bucket': '1',
                        'x-archive-meta-mediatype': 'audio',
                        'x-archive-meta-title': toArchiveOrgHeader(title || 'Giọng đọc AI'),
                        'x-archive-meta-creator': toArchiveOrgHeader(creator || 'AI.Type'),
                        'x-archive-meta-collection': toArchiveOrgHeader(collection || 'opensource_audio'),
                        'x-archive-meta-language': 'vie',
                        'x-archive-interactive-priority': '1'
                    }
                }, (res) => {
                    let resData = '';
                    res.on('data', chunk => resData += chunk);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            console.log(`[Archive.org] Upload thành công file ${i + 1}/${clips.length}: ${rawFileName}`);
                            uploadedCount++;
                            uploadedFiles.push({
                                fileName: rawFileName,
                                directUrl: directDownloadUrl
                            });
                            resolve(true);
                        } else {
                            let cleanMsg = resData.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                            if (cleanMsg.length > 200) cleanMsg = cleanMsg.substring(0, 200) + '...';
                            console.error(`[Archive.org] Upload thất bại status ${res.statusCode}: ${resData}`);
                            reject(new Error(`Server Archive.org trả về HTTP ${res.statusCode}: ${cleanMsg || 'Lỗi từ Server Archive.org'}`));
                        }
                    });
                });

                req.on('error', (err) => {
                    console.error(`[Archive.org] Network error:`, err);
                    reject(err);
                });

                const fileStream = fs.createReadStream(filePath);
                fileStream.pipe(req);
            });
        }

        if (uploadedCount > 0) {
            const itemUrl = `https://archive.org/details/${identifier}`;
            return {
                success: true,
                identifier: identifier,
                itemUrl: itemUrl,
                uploadedCount: uploadedCount,
                files: uploadedFiles,
                directAudioUrls: uploadedFiles.map(f => f.directUrl),
                message: `Đã upload thành công ${uploadedCount} file audio lên Archive.org!`
            };
        } else {
            return { success: false, error: 'Không thể upload file nào lên Archive.org.' };
        }
    } catch (err) {
        console.error('[Archive.org] Error handling upload:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('check-file-exists', async (event, filePath) => {
    try {
        if (!filePath) return false;
        let cleanPath = String(filePath).trim();
        cleanPath = cleanPath.replace(/^file:\/{2,3}/i, '');
        cleanPath = cleanPath.replace(/^media:\/{2,3}/i, '');
        if (cleanPath.startsWith('SMART_FIND/')) return true;
        // On Windows file:///D:/... -> D:/...
        if (process.platform === 'win32') {
            if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
        } else {
            if (!cleanPath.startsWith('/')) cleanPath = '/' + cleanPath;
        }
        cleanPath = decodeURIComponent(cleanPath.split('?')[0].split('#')[0]);
        return fs.existsSync(cleanPath);
    } catch (e) {
        return false;
    }
});

ipcMain.handle('download-single-video-temp', async (event, payload) => {
    try {
        const url = typeof payload === 'string' ? payload : payload.url;
        let customCookies = typeof payload === 'object' ? payload.customCookies : '';
        const ytdlpPath = binaries.ytdlp || "yt-dlp";
        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        const videoFolder = path.join(aiTypingDir, `video_${Date.now()}`);
        fs.mkdirSync(videoFolder, { recursive: true });

        const outputTemplate = path.join(videoFolder, `video.%(ext)s`);
        const args = [
            '-o', outputTemplate,
            '--newline',
            '--no-warnings',
            '--rm-cache-dir',
            '--force-overwrites',
            '--js-runtimes', 'node',
            '-S', 'res,fps',
            '-f', 'bestvideo*+bestaudio/best',
            '--merge-output-format', 'mp4'
        ];
        if (binaries.ffmpeg) {
            args.push('--ffmpeg-location', binaries.ffmpeg);
        }

        const isFacebook = url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com');
        
        if (!customCookies || !customCookies.trim()) {
            const cookiesJsonPath = path.join(__dirname, 'cookies.json');
            if (fs.existsSync(cookiesJsonPath)) {
                try {
                    customCookies = fs.readFileSync(cookiesJsonPath, 'utf8');
                } catch (e) {}
            }
        }

        if (customCookies && customCookies.trim().length > 0) {
            try {
                let cookieContent = customCookies.trim();
                if (cookieContent.startsWith('[')) {
                    const cookiesData = JSON.parse(cookieContent);
                    let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from custom cookies\n\n";
                    for (const c of cookiesData) {
                        let domain = c.domain || '';
                        let includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                        let cPath = c.path || '/';
                        let secure = c.secure ? 'TRUE' : 'FALSE';
                        let expiration = c.expirationDate ? Math.round(c.expirationDate) : (c.expires ? Math.round(c.expires) : 0);
                        netscapeStr += `${domain}\t${includeSubdomains}\t${cPath}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
                    }
                    cookieContent = netscapeStr;
                } else if (!cookieContent.includes('# Netscape')) {
                    let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from raw cookies\n\n";
                    const pairs = cookieContent.split(';');
                    for (const pair of pairs) {
                        const trimmed = pair.trim();
                        if (!trimmed) continue;
                        const idx = trimmed.indexOf('=');
                        if (idx > 0) {
                            const key = trimmed.substring(0, idx).trim();
                            const val = trimmed.substring(idx + 1).trim();
                            netscapeStr += `.youtube.com\tTRUE\t/\tTRUE\t0\t${key}\t${val}\n`;
                        }
                    }
                    cookieContent = netscapeStr;
                }
                const tempCookiePath = path.join(app.getPath('temp'), `cookies_temp_${Date.now()}.txt`);
                fs.writeFileSync(tempCookiePath, cookieContent, 'utf8');
                if (!isFacebook) args.push('--cookies', tempCookiePath);
            } catch (err) {
                console.error("Lỗi ghi file cookies tạm", err);
            }
        }

        args.push(url);

        await new Promise((resolve, reject) => {
            const child = spawn(ytdlpPath, args);
            let stderrOutput = "";
            child.stdout.on('data', (data) => {
                const text = data.toString();
                const match = text.match(/\[download\]\s+([\d\.]+)%/);
                if (match && match[1]) {
                    const percent = Math.round(parseFloat(match[1]));
                    sendToRenderer('download-single-video-progress', { percent });
                }
            });
            child.stderr.on('data', (data) => {
                stderrOutput += data.toString();
            });
            child.on('close', (code) => {
                if (code === 0) {
                    sendToRenderer('download-single-video-progress', { percent: 100 });
                    resolve();
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}. Error: ${stderrOutput}`));
                }
            });
        });

        const files = fs.readdirSync(videoFolder);
        const foundVideoFile = files.find(f => f.startsWith('video.') && !f.endsWith('.json') && !f.endsWith('.vtt') && !f.endsWith('.srt'));
        if (foundVideoFile) {
            return { success: true, path: path.join(videoFolder, foundVideoFile) };
        } else {
            return { success: false, error: 'Download complete but file not found.' };
        }
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('extract-online-video-stream', async (event, payload) => {
    try {
        const url = typeof payload === 'string' ? payload : (payload?.url || '');
        if (!url || !url.trim()) {
            return { success: false, error: 'Đường dẫn URL không hợp lệ.' };
        }
        const ytdlpPath = binaries.ytdlp || "yt-dlp";
        const args = [
            '--no-warnings',
            '--rm-cache-dir',
            '--no-playlist',
            '-f', 'best[ext=mp4]/best',
            '--print', '%(url)s',
            '--print', '%(title)s',
            '--print', '%(duration)s',
            url.trim()
        ];

        return new Promise((resolve) => {
            execFile(ytdlpPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
                if (err) {
                    console.error('[yt-dlp extract stream error]', err, stderr);
                    return resolve({ success: false, error: stderr || err.message });
                }
                const lines = (stdout || '').trim().split(/\r?\n/).filter(Boolean);
                if (lines.length === 0) {
                    return resolve({ success: false, error: 'Không lấy được luồng phát trực tiếp từ URL này.' });
                }
                const streamUrl = lines[0].trim();
                const title = lines.length > 1 ? lines[1].trim() : 'Online Video';
                const rawDuration = lines.length > 2 ? parseFloat(lines[2].trim()) : 0;
                const duration = !isNaN(rawDuration) && rawDuration > 0 ? parseFloat(rawDuration.toFixed(1)) : 10;

                resolve({
                    success: true,
                    streamUrl,
                    title,
                    duration,
                    originalUrl: url.trim()
                });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('download-video', async (event, payload) => {
    try {
        const { urls } = payload;
        if (!urls || urls.length === 0) {
            return { success: false, error: 'Không có URL hợp lệ' };
        }

        const ytdlpPath = binaries.ytdlp || "yt-dlp";

        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        // Output template cho yt-dlp: Downloads/AI.TYPING/{channel_name}/{title}.{ext}
        const outputTemplate = path.join(aiTypingDir, '%(uploader)s', '%(title)s.%(ext)s');

        sendToRenderer("tools-log", `[Download] �?ang tiến hành tải dữ liệu chất lượng tốt nhất...`);

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            // Tải best video & audio
            const args = [
                '-o', outputTemplate,
                '--newline',
                '--no-warnings',
                '--rm-cache-dir',
                '--force-overwrites',
                '--js-runtimes', 'node',
                '-S', 'res,fps',
                '-f', 'bestvideo*+bestaudio/best',
                '--merge-output-format', 'mp4'
            ];
            if (binaries.ffmpeg) {
                args.push('--ffmpeg-location', binaries.ffmpeg);
            }

            // Bổ sung cookie từ giao diện người dùng cấu hình
            const isFacebook = url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com');
            if (payload.customCookies && payload.customCookies.trim().length > 0) {
                try {
                    let cookieContent = payload.customCookies.trim();
                    if (cookieContent.startsWith('[')) {
                        const cookiesData = JSON.parse(cookieContent);
                        let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from custom cookies\n\n";
                        for (const c of cookiesData) {
                            let domain = c.domain || '';
                            let includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                            let cPath = c.path || '/';
                            let secure = c.secure ? 'TRUE' : 'FALSE';
                            let expiration = c.expirationDate ? Math.round(c.expirationDate) : (c.expires ? Math.round(c.expires) : 0);
                            netscapeStr += `${domain}\t${includeSubdomains}\t${cPath}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
                        }
                        cookieContent = netscapeStr;
                    } else if (!cookieContent.includes('# Netscape')) {
                        let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from raw cookies\n\n";
                        const pairs = cookieContent.split(';');
                        for (const pair of pairs) {
                            const trimmed = pair.trim();
                            if (!trimmed) continue;
                            const idx = trimmed.indexOf('=');
                            if (idx > 0) {
                                const key = trimmed.substring(0, idx).trim();
                                const val = trimmed.substring(idx + 1).trim();
                                netscapeStr += `.youtube.com\tTRUE\t/\tTRUE\t0\t${key}\t${val}\n`;
                            }
                        }
                        cookieContent = netscapeStr;
                    }
                    const tempCookiePath = path.join(app.getPath('temp'), `cookies_temp_${Date.now()}.txt`);
                    fs.writeFileSync(tempCookiePath, cookieContent, 'utf8');
                    if (!isFacebook) args.push('--cookies', tempCookiePath);
                } catch (err) {
                    console.error("Lỗi ghi file cookies tạm", err);
                }
            } else {
                const cookiesJsonPath = path.join(__dirname, 'cookies.json');
                if (fs.existsSync(cookiesJsonPath)) {
                    try {
                        const cookiesData = JSON.parse(fs.readFileSync(cookiesJsonPath, 'utf8'));
                        let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from cookies.json\n\n";
                        for (const c of cookiesData) {
                            let domain = c.domain || '';
                            let includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                            let cPath = c.path || '/';
                            let secure = c.secure ? 'TRUE' : 'FALSE';
                            let expiration = c.expirationDate ? Math.round(c.expirationDate) : (c.expires ? Math.round(c.expires) : 0);
                            netscapeStr += `${domain}\t${includeSubdomains}\t${cPath}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
                        }
                        const tempCookiePath = path.join(app.getPath('temp'), `cookies_temp_${Date.now()}.txt`);
                        fs.writeFileSync(tempCookiePath, netscapeStr, 'utf8');
                        if (!isFacebook) args.push('--cookies', tempCookiePath);
                    } catch (err) {
                        console.error("Lỗi đọc file cookies.json", err);
                    }
                }
            }

            args.push(url);

            let lastPercent = 0;
            sendToRenderer('download-video-progress', {
                index: i,
                total: urls.length,
                percent: 0,
                speed: '',
                eta: '',
                status: `Đang tải video ${i + 1}/${urls.length}...`
            });

            await new Promise((resolve, reject) => {
                const child = spawn(ytdlpPath, args);

                child.stdout.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) {
                        sendToRenderer("tools-log", `[Download] ${line}`);
                        // Bắt % tiến trình từ yt-dlp
                        const match = line.match(/\[download\]\s+([\d\.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/) ||
                                      line.match(/\[download\]\s+([\d\.]+)%/);
                        if (match && match[1]) {
                            const percent = Math.round(parseFloat(match[1]));
                            const speed = match[3] || '';
                            const eta = match[4] || '';
                            if (percent !== lastPercent) {
                                lastPercent = percent;
                                sendToRenderer('download-video-progress', {
                                    index: i,
                                    total: urls.length,
                                    percent,
                                    speed,
                                    eta,
                                    status: `Đang tải video ${i + 1}/${urls.length}: ${percent}%`
                                });
                            }
                        }
                    }
                });

                child.stderr.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) sendToRenderer("tools-log", `[Download] ${line}`);
                });

                child.on('close', (code) => {
                    if (code === 0) {
                        sendToRenderer('download-video-progress', {
                            index: i,
                            total: urls.length,
                            percent: 100,
                            speed: '',
                            eta: '',
                            status: `Tải xong video ${i + 1}/${urls.length}`
                        });
                        resolve();
                    } else {
                        reject(new Error(`Thất bại với mã thoát: ${code}`));
                    }
                });
            });
        }

        sendToRenderer('download-video-progress', {
            index: urls.length,
            total: urls.length,
            percent: 100,
            speed: '',
            eta: '',
            status: 'Hoàn tất tải toàn bộ video!'
        });
        sendNotification("Tải Video", "Tải video hoàn tất vào thư mục AI.TYPING!");
        return { success: true };

    } catch (err) {
        console.error("Download Video Error:", err);
        return { success: false, error: err.message };
    }
});

// =====================================================================
// XUẤT B�?O C�?O PDF BẰNG IPC (Chữa cháy lỗi No Print Preview của Electron)
// =====================================================================
ipcMain.handle('export-gsc-pdf', async (event, payload) => {
    try {
        const { siteUrl, startDate, endDate } = payload || {};
        let safeDomain = "SEO_Report";
        if (siteUrl) safeDomain = siteUrl.replace(/https?:\/\//, '').replace(/[\/\\]/g, '_');

        const defaultName = `[AI.TYPE] ${safeDomain} (${startDate} to ${endDate}).pdf`;
        const defaultPath = path.join(app.getPath('downloads'), defaultName);

        // Hiển thị hộp thoại lưu file hệ thống
        const { filePath } = await dialog.showSaveDialog({
            title: 'Lưu báo cáo SEO thành PDF',
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Document', extensions: ['pdf'] }
            ]
        });

        // Nếu ngư�?i dùng ch�?n chỗ lưu
        if (filePath) {
            sendToRenderer("tools-log", `[PDF] �?ang kết xuất trang web SEO Report thành PDF... vui lòng ch�?.`);

            // Xử lý dứt điểm Bug kinh điển: PrintToPDF luôn rò rỉ màu n�?n #212121 của BrowserWindow ra thành màu PDF Page
            const win = BrowserWindow.fromWebContents(event.sender);
            const originalColor = win.getBackgroundColor();
            win.setBackgroundColor('#ffffff');

            // Lấy nội dung frontend (đang hiển thị màn hình Report) và build thành PDF Vector (cực nét, dạng text)
            const marginInches = 0.4;
            const pdfData = await event.sender.printToPDF({
                printBackground: true,
                landscape: true,
                pageSize: 'A4',
                margins: { marginType: 'custom', top: marginInches, bottom: marginInches, left: marginInches, right: marginInches },
                displayHeaderFooter: true,
                headerTemplate: `<div style="font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #888; width: 100%; text-align: left; padding-left: ${marginInches * 96}px;">Báo cáo đề xuất chỉnh sửa SEO cho ${safeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')} (${startDate} to ${endDate})</div>`,
                footerTemplate: `<div style="font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #888; width: 100%; text-align: right; padding-right: ${marginInches * 96}px;">Trang <span class="pageNumber"></span> / <span class="totalPages"></span></div>`
            });

            // Phục hồi lại màu nền tối của cửa sổ App
            win.setBackgroundColor(originalColor || '#212121');

            // Ghi file
            fs.writeFileSync(filePath, pdfData);
            sendToRenderer("tools-log", `✅ Đã lưu PDF Báo Cáo thành công tại: ${filePath}`);
            sendNotification("Báo cáo SEO", "Xuất file PDF thành công!");

            return { success: true, filePath };
        } else {
            return { success: false, error: "Đã hủy lưu file" }; // Người dùng ấn Cancel
        }
    } catch (err) {
        console.error("Lỗi xuất PDF:", err);
        sendToRenderer("tools-log", `❌ Lỗi khi xuất PDF: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// =====================================================================
// XUẤT BÁO CÁO ẢNH (PNG) BẰNG IPC
// =====================================================================
ipcMain.handle('export-gsc-image', async (event, payload) => {
    try {
        const { siteUrl, startDate, endDate, base64Image } = payload || {};
        let safeDomain = "SEO_Report";
        if (siteUrl) safeDomain = siteUrl.replace(/https?:\/\//, '').replace(/[\/\\]/g, '_');

        const defaultName = `[AI.TYPE] Báo Cáo Tổng Hợp AI - ${safeDomain} (${startDate || '2026'} to ${endDate || '2026'}).png`;
        const defaultPath = path.join(app.getPath('downloads'), defaultName);

        const { filePath } = await dialog.showSaveDialog({
            title: 'Lưu Báo Cáo Ảnh (PNG)',
            defaultPath: defaultPath,
            filters: [
                { name: 'PNG Image', extensions: ['png'] }
            ]
        });

        if (filePath) {
            if (base64Image) {
                const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
                const buffer = Buffer.from(cleanBase64, 'base64');
                fs.writeFileSync(filePath, buffer);
            } else {
                const win = BrowserWindow.fromWebContents(event.sender);
                const image = await win.webContents.capturePage();
                fs.writeFileSync(filePath, image.toPNG());
            }
            sendToRenderer("tools-log", `✅ Đã lưu Báo Cáo Ảnh thành công tại: ${filePath}`);
            sendNotification("Báo cáo SEO bằng ảnh", "Xuất Báo Cáo Ảnh thành công!");
            return { success: true, filePath };
        } else {
            return { success: false, error: "Đã hủy lưu file" };
        }
    } catch (err) {
        console.error("Lỗi xuất Báo cáo Ảnh:", err);
        return { success: false, error: err.message };
    }
});

// =====================================================================
// IPC HANDLER: CHỌN FILE VIDEO CỤC BỘ QUA HỘP THOẠI HỆ THỐNG
// =====================================================================
ipcMain.handle('select-video-file', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'] }]
    });
    if (!canceled && filePaths.length > 0) {
        return filePaths[0];
    }
    return null;
});

// =====================================================================
// IPC HANDLER: CHỌN THƯ MỤC TÀI LIỆU VÀ QUÉT DANH SÁCH FILE
// =====================================================================
ipcMain.handle('select-folder-dialog', async (event, defaultPath) => {
    try {
        const options = {
            properties: ['openDirectory'],
            title: 'Chọn thư mục tài liệu'
        };
        if (defaultPath && fs.existsSync(defaultPath)) {
            options.defaultPath = defaultPath;
        }
        const { canceled, filePaths } = await dialog.showOpenDialog(options);
        if (!canceled && filePaths && filePaths.length > 0) {
            return filePaths[0];
        }
        return null;
    } catch (e) {
        console.error('[Folder Dialog] Error selecting folder:', e);
        return null;
    }
});

ipcMain.handle('list-documents-in-folder', async (event, folderPath) => {
    try {
        if (!folderPath || !fs.existsSync(folderPath)) {
            return { success: false, error: 'Thư mục không tồn tại', files: [] };
        }

        const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.xls', '.pptx', '.ppt', '.csv', '.epub', '.json', '.html'];
        const files = [];

        // Quét các tệp tin đã học từ Documents/ai.type/data/faiss/*/docs/
        const faissBaseDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'faiss');
        const indexedNames = new Set();
        if (fs.existsSync(faissBaseDir)) {
            try {
                const users = fs.readdirSync(faissBaseDir);
                for (const u of users) {
                    const uDocs = path.join(faissBaseDir, u, 'docs');
                    if (fs.existsSync(uDocs)) {
                        for (const df of fs.readdirSync(uDocs)) {
                            if (df.endsWith('.md')) {
                                indexedNames.add(df.replace(/\.md$/, '').toLowerCase().trim());
                            }
                        }
                    }
                }
            } catch (fe) {}
        }

        const scanDirRecursive = (currentDir, relativePrefix = '') => {
            try {
                const entries = fs.readdirSync(currentDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name.startsWith('.')) continue;

                    const fullPath = path.join(currentDir, entry.name);
                    const relPath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;

                    if (entry.isDirectory()) {
                        scanDirRecursive(fullPath, relPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (validExtensions.includes(ext) || ext !== '') {
                            try {
                                const stats = fs.statSync(fullPath);
                                const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
                                const dateStr = stats.mtime.toLocaleDateString('vi-VN', {
                                    year: 'numeric', month: '2-digit', day: '2-digit',
                                    hour: '2-digit', minute: '2-digit'
                                });
                                
                                let docType = ext.replace('.', '').toUpperCase();
                                if (docType === 'PDF') docType = 'PDF';
                                else if (docType === 'DOCX' || docType === 'DOC') docType = 'Word';
                                else if (docType === 'TXT' || docType === 'MD') docType = 'Text';
                                else if (docType === 'XLSX' || docType === 'XLS') docType = 'Excel';
                                else if (docType === 'PPTX' || docType === 'PPT') docType = 'Slides';

                                const baseName = path.parse(entry.name).name.toLowerCase().trim();
                                const isIndexed = indexedNames.has(entry.name.toLowerCase().trim()) || indexedNames.has(baseName);

                                files.push({
                                    filename: entry.name,
                                    relativePath: relPath,
                                    filePath: fullPath,
                                    size_mb: parseFloat(sizeMb) < 0.01 ? '< 0.01' : sizeMb,
                                    size_bytes: stats.size,
                                    updated_at: dateStr,
                                    doc_type: docType,
                                    is_local: true,
                                    is_indexed: isIndexed
                                });
                            } catch (statErr) {
                                console.warn('Error reading file stats:', fullPath, statErr);
                            }
                        }
                    }
                }
            } catch (dirErr) {
                console.warn('Error reading directory:', currentDir, dirErr);
            }
        };

        scanDirRecursive(folderPath);

        files.sort((a, b) => a.filename.localeCompare(b.filename));
        return { success: true, folderPath: folderPath, files: files };
    } catch (e) {
        console.error('[List Documents] Error:', e);
        return { success: false, error: e.message, files: [] };
    }
});

ipcMain.handle('open-file-path', async (event, filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            await shell.openPath(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error opening file path:', e);
        return false;
    }
});

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            shell.showItemInFolder(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Error showing item in folder:', e);
        return false;
    }
});

ipcMain.handle('find-latest-analyzed-video', async (event) => {
    try {
        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            return null;
        }
        
        const files = fs.readdirSync(aiTypingDir);
        let latestFile = null;
        let latestTime = 0;
        
        for (const file of files) {
            if (file.startsWith('analyze_video_') && file.match(/\.(mp4|mkv|avi|mov|webm|flv)$/i)) {
                const filePath = path.join(aiTypingDir, file);
                const stats = fs.statSync(filePath);
                if (stats.mtimeMs > latestTime) {
                    latestTime = stats.mtimeMs;
                    latestFile = filePath;
                }
            }
        }
        
        return latestFile;
    } catch (e) {
        console.error('Error finding latest analyzed video:', e);
        return null;
    }
});

// =====================================================================
// IPC HANDLER: TẢI VÀ PHÂN T�?CH VIDEO OFFLINE BẰNG YT-DLP VÀ FFMPEG
// =====================================================================
ipcMain.handle('analyze-video-local', async (event, payload) => {
    try {
        let { url, extractInterval } = payload;
        if (!url) {
            return { success: false, error: 'Kh�ng c� URL h?p l?' };
        }
        url = url.trim();

        const ytdlpPath = binaries.ytdlp || "yt-dlp";
        const ffmpegPath = binaries.ffmpeg || "ffmpeg";

        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        // Tạo một thư mục tạm thời riêng cho task này
        const timestamp = Date.now();
        const tempDir = path.join(aiTypingDir, `_temp_${timestamp}`);
        fs.mkdirSync(tempDir, { recursive: true });

        let isLocalFile = false;
        let videoPath = '';
        let subtitlesText = "";
        let videoFile = "";

        // Kiểm tra xem URL có phải là file local không
        if (fs.existsSync(url) && fs.statSync(url).isFile()) {
            isLocalFile = true;
            videoPath = url;
            videoFile = path.basename(url);
            sendToRenderer("tools-log", `[AI Analyze] Sử dụng video từ máy tính: ${url}`);
        } else {
            // Nếu url giống một đường dẫn máy tính (bắt đầu bằng ổ đĩa C:\ hoặc D:\ hoặc /) nhưng không tồn tại file
            if (/^[a-zA-Z]:\\/.test(url) || url.startsWith('/')) {
                return { success: false, error: `Không tìm thấy file video trên máy tính tại: ${url}. Có thể file đã bị xóa hoặc đổi tên.` };
            }

            // Tải video độ phân giải vừa đủ để tăng tốc, KÈM THEO PHỤ ĐỀ
            const outputTemplate = path.join(tempDir, 'video.%(ext)s');

            sendToRenderer("tools-log", `[AI Analyze] Đang tải video chất lượng tốt nhất bằng yt-dlp...`);

            const ytdlpArgs = [
                '-o', outputTemplate,
                '--newline',
                '--no-warnings',
                '--rm-cache-dir',
                '--force-overwrites',
                '--ignore-errors',
                '--js-runtimes', 'node',
                '-S', 'res,fps',
                '-f', 'bestvideo*+bestaudio/best',
                '--merge-output-format', 'mp4',
                '--write-auto-subs',
                '--write-subs',
                '--sub-lang', 'vi,en.*'
            ];
            if (binaries.ffmpeg) {
                ytdlpArgs.push('--ffmpeg-location', binaries.ffmpeg);
            }

            // Bổ sung cookie từ giao diện người dùng cấu hình
            let hasCustomCookies = false;
            const isFacebook = url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com');

            if (payload.customCookies && payload.customCookies.trim().length > 0) {
                try {
                    let cookieContent = payload.customCookies.trim();
                    if (cookieContent.startsWith('[')) {
                        const cookiesData = JSON.parse(cookieContent);
                        let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from custom cookies\n\n";
                        for (const c of cookiesData) {
                            let domain = c.domain || '';
                            let includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                            let cPath = c.path || '/';
                            let secure = c.secure ? 'TRUE' : 'FALSE';
                            let expiration = c.expirationDate ? Math.round(c.expirationDate) : (c.expires ? Math.round(c.expires) : 0);
                            netscapeStr += `${domain}\t${includeSubdomains}\t${cPath}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
                        }
                        cookieContent = netscapeStr;
                    } else if (!cookieContent.includes('# Netscape')) {
                        let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from raw cookies\n\n";
                        let cookieDomain = '.youtube.com';
                        try {
                            const parsedUrl = new URL(url);
                            cookieDomain = '.' + parsedUrl.hostname.replace(/^www\./, '');
                        } catch (e) {
                            if (url.includes('tiktok.com')) cookieDomain = '.tiktok.com';
                            else if (url.includes('facebook.com')) cookieDomain = '.facebook.com';
                        }
                        const pairs = cookieContent.split(';');
                        for (const pair of pairs) {
                            const trimmed = pair.trim();
                            if (!trimmed) continue;
                            const idx = trimmed.indexOf('=');
                            if (idx > 0) {
                                const key = trimmed.substring(0, idx).trim();
                                const val = trimmed.substring(idx + 1).trim();
                                netscapeStr += `${cookieDomain}\tTRUE\t/\tTRUE\t0\t${key}\t${val}\n`;
                            }
                        }
                        cookieContent = netscapeStr;
                    }
                    const tempCookiePath = path.join(tempDir, 'cookies_temp.txt');
                    fs.writeFileSync(tempCookiePath, cookieContent, 'utf8');
                    if (!isFacebook) ytdlpArgs.push('--cookies', tempCookiePath);
                    hasCustomCookies = true;
                } catch (err) {
                    console.error("Lỗi ghi file cookies tạm", err);
                }
            } else {
                const cookiesJsonPath = path.join(__dirname, 'cookies.json');
                if (fs.existsSync(cookiesJsonPath)) {
                    try {
                        const cookiesData = JSON.parse(fs.readFileSync(cookiesJsonPath, 'utf8'));
                        let netscapeStr = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This file was generated from cookies.json\n\n";
                        for (const c of cookiesData) {
                            let domain = c.domain || '';
                            let includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
                            let cPath = c.path || '/';
                            let secure = c.secure ? 'TRUE' : 'FALSE';
                            let expiration = c.expirationDate ? Math.round(c.expirationDate) : (c.expires ? Math.round(c.expires) : 0);
                            netscapeStr += `${domain}\t${includeSubdomains}\t${cPath}\t${secure}\t${expiration}\t${c.name}\t${c.value}\n`;
                        }
                        const tempCookiePath = path.join(tempDir, 'cookies_temp.txt');
                        fs.writeFileSync(tempCookiePath, netscapeStr, 'utf8');
                        if (!isFacebook) ytdlpArgs.push('--cookies', tempCookiePath);
                        hasCustomCookies = true;
                    } catch (err) {
                        console.error("Lỗi đọc file cookies.json", err);
                    }
                }
            }

            // Nếu không có file cookie nào được xuất, thì mới dùng cookie từ trình duyệt Chrome
            // Lấy cookie từ Chrome bị lỗi DPAPI trên phiên bản Chrome mới nên bị vô hiệu hóa.

            ytdlpArgs.push(url);

            let ytdlpStderr = "";
            await new Promise((resolve, reject) => {
                const child = spawn(ytdlpPath, ytdlpArgs);
                child.stdout.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line && line.includes('[download]')) sendToRenderer("tools-log", `[AI Analyze] ${line}`);
                });
                child.stderr.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) {
                        sendToRenderer("tools-log", `[AI Analyze] ${line}`);
                        ytdlpStderr += line + "\n";
                    }
                });
                child.on('close', (code) => {
                    resolve();
                });
                child.on('error', (err) => {
                    ytdlpStderr += `Lỗi khi chạy yt-dlp: ${err.message}\n`;
                    resolve();
                });
            });

            // Tìm file video và phụ đề vừa tải về trong thư mục tạm
            const files = fs.readdirSync(tempDir);
            const foundVideoFile = files.find(f => f.startsWith('video.') && !f.endsWith('.vtt') && !f.endsWith('.srt') && !f.endsWith('.lrc') && !f.endsWith('.json'));
            const subtitleFile = files.find(f => f.startsWith('video.') && (f.endsWith('.vtt') || f.endsWith('.srt')));

            if (!foundVideoFile) {
                let errorMsg = 'Không tìm thấy video tải về.';
                if (ytdlpStderr) {
                    errorMsg += ` Chi tiết lỗi: ${ytdlpStderr}`;
                }
                throw new Error(errorMsg);
            }

            videoFile = foundVideoFile;
            videoPath = path.join(tempDir, videoFile);
            if (subtitleFile) {
                try {
                    const subPath = path.join(tempDir, subtitleFile);
                    subtitlesText = fs.readFileSync(subPath, 'utf8');
                    sendToRenderer("tools-log", `[AI Analyze] Đã lấy được phụ đề của video.`);
                } catch (e) { }
            }
        }

        sendToRenderer("tools-log", `[AI Analyze] Bắt đầu trích xuất phân cảnh và âm thanh...`);

        const framePattern = path.join(tempDir, 'frame_%03d.jpg');
        const audioPath = path.join(tempDir, 'audio.mp3');

        // Lệnh FFmpeg: Cắt frame ảnh
        const interval = parseFloat(extractInterval) || 5;
        const fps = (1 / interval).toFixed(4); // ví dụ: 5s/frame => fps=0.2

        const ffmpegFrameArgs = [
            '-y',
            '-i', videoPath,
            '-vf', `fps=${fps},scale=640:-1`, '-q:v', '5', framePattern
        ];

        await new Promise((resolve, reject) => {
            const child = spawn(ffmpegPath, ffmpegFrameArgs);
            child.stderr.on('data', (data) => {
                // Log stderr of ffmpeg if needed, but it's very noisy
            });
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Trích xuất phân cảnh thất bại với mã thoát: ${code}`));
            });
        });

        // Lệnh FFmpeg: Cắt âm thanh
        const ffmpegAudioArgs = [
            '-y',
            '-i', videoPath,
            '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audioPath
        ];

        // Lấy âm thanh nhưng không làm hỏng tiến trình nếu video không có tiếng
        await new Promise((resolve) => {
            const child = spawn(ffmpegPath, ffmpegAudioArgs);
            child.on('close', () => {
                resolve();
            });
        });

        sendToRenderer("tools-log", `[AI Analyze] Trích xuất thành công. Đang đóng gói dữ liệu gửi cho AI...`);

        // Đọc các frame
        const allFiles = fs.readdirSync(tempDir);
        const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();

        // Giới hạn tối đa 100 frames (trải đều khắp video) để AI nhìn được tổng quan mà không bị quá tải token
        const maxFrames = 100;
        let selectedFrames = [];
        if (frameFiles.length <= maxFrames) {
            selectedFrames = frameFiles;
        } else {
            const step = frameFiles.length / maxFrames;
            for (let i = 0; i < maxFrames; i++) {
                const index = Math.min(Math.floor(i * step), frameFiles.length - 1);
                selectedFrames.push(frameFiles[index]);
            }
            // Loại bỏ các phần tử trùng lặp (nếu có do làm tròn)
            selectedFrames = [...new Set(selectedFrames)];
        }

        const base64Frames = [];
        for (const frameFile of selectedFrames) {
            const framePath = path.join(tempDir, frameFile);
            const data = fs.readFileSync(framePath);
            base64Frames.push(`data:image/jpeg;base64,${data.toString('base64')}`);
        }

        // Đọc audio
        let audioBase64 = "";
        if (fs.existsSync(audioPath)) {
            const audioData = fs.readFileSync(audioPath);
            audioBase64 = `data:audio/mp3;base64,${audioData.toString('base64')}`;
        }

        // Move video ra thư mục AI.TYPING chính nếu là video tải về
        let finalVideoPath = videoPath;
        if (!isLocalFile) {
            finalVideoPath = path.join(aiTypingDir, `analyze_video_${timestamp}${path.extname(videoFile)}`);
            fs.renameSync(videoPath, finalVideoPath);
        }

        // Xóa thư mục tạm (chứa các file jpg)
        // try {
        //     fs.rmSync(tempDir, { recursive: true, force: true });
        // } catch(e) {}

        sendToRenderer("tools-log", `[AI Analyze] Đã hoàn tất! Video được lưu/sử dụng tại ${finalVideoPath}`);

        return {
            success: true,
            videoPath: finalVideoPath,
            frames: base64Frames,
            audio: audioBase64,
            subtitles: subtitlesText
        };

    } catch (err) {
        console.error("Analyze Video Local Error:", err);
        sendToRenderer("tools-log", `[AI Analyze] Lỗi: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// ==== AI: FETCH HTML ====
ipcMain.handle('ai:fetch-html', async (event, targetUrl) => {
    try {
        const response = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            }
        });
        const html = await response.text();
        return { success: true, html };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
ipcMain.handle('extract-last-frame', async (event, videoPath) => {
    try {
        let videoPathDecoded = videoPath.replace(/^file:\/\//, '');
        if (process.platform === 'win32' && videoPathDecoded.startsWith('/')) {
            videoPathDecoded = videoPathDecoded.slice(1);
        }
        if (!fs.existsSync(videoPathDecoded)) return { success: false, error: 'Video file not found: ' + videoPathDecoded };

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const videoDir = getVideoWorkingDir(videoPathDecoded);
        const ext = path.extname(videoPathDecoded);
        const baseName = path.basename(videoPathDecoded, ext).replace(/[^\w\d\-_.]/g, '_');
        const outputPath = path.join(videoDir, `${baseName}_last_frame_${Date.now()}.png`);

        return new Promise((resolve) => {
            const args = ['-sseof', '-0.5', '-i', videoPathDecoded, '-update', '1', '-q:v', '2', '-y', outputPath];
            const child = spawn(ffmpegPath, args);
            child.on('close', (code) => {
                if (fs.existsSync(outputPath)) {
                    const base64 = fs.readFileSync(outputPath, { encoding: 'base64' });
                    resolve({ success: true, path: outputPath, base64 });
                } else {
                    // Try getting the first frame if the previous method fails (e.g., video too short)
                    const args2 = ['-i', videoPathDecoded, '-vframes', '1', '-q:v', '2', '-y', outputPath];
                    const child2 = spawn(ffmpegPath, args2);
                    child2.on('close', () => {
                        if (fs.existsSync(outputPath)) {
                            const base64 = fs.readFileSync(outputPath, { encoding: 'base64' });
                            resolve({ success: true, path: outputPath, base64 });
                        } else {
                            resolve({ success: false, error: 'Cannot extract frame' });
                        }
                    });
                }
            });
        });
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('trim-video', async (event, payload) => {
    try {
        let { videoUrl, trimStart, duration } = payload;
        
        trimStart = parseFloat(trimStart) || 0;
        let parsedDuration = parseFloat(duration);
        if (isNaN(parsedDuration) || parsedDuration > 10) parsedDuration = 10;
        duration = parsedDuration;

        // Remove file://
        const videoPath = videoUrl.replace('file://', '');
        const isHttp = videoPath.startsWith('http://') || videoPath.startsWith('https://');
        
        if (!isHttp && !fs.existsSync(videoPath)) {
            return { success: false, error: 'File gốc không tồn tại: ' + videoPath };
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        let outputPath;
        let localInputPath = videoPath;
        let baseName = '';
        const timestamp = new Date().getTime();
        const tempDir = path.join(app.getPath('temp'), 'type_video_trim');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });


        // Download file if it's http
        if (isHttp) {
            let urlPathname = new URL(videoPath).pathname;
            const ext = path.extname(urlPathname) || '.mp4';
            baseName = path.basename(urlPathname, ext) || 'video';
            localInputPath = path.join(tempDir, `download_${timestamp}${ext}`);
            outputPath = path.join(tempDir, `trimmed_${timestamp}${ext}`);
            
            await new Promise((resolve, reject) => {
                const https = require(videoPath.startsWith('https') ? 'https' : 'http');
                const file = fs.createWriteStream(localInputPath);
                https.get(videoPath, (response) => {
                    response.pipe(file);
                    file.on('finish', () => { file.close(resolve); });
                }).on('error', (err) => {
                    fs.unlink(localInputPath, () => {});
                    reject(err);
                });
            });
        } else {
            const dir = path.dirname(videoPath);
            const ext = path.extname(videoPath);
            baseName = path.basename(videoPath, ext);
            let originalBaseName = baseName.replace(/_trimmed_\d+/g, '');
            outputPath = path.join(dir, `${originalBaseName}_trimmed_${timestamp}${ext}`);
        }

        const args = [
            '-ss', trimStart.toString(),
            '-i', localInputPath,
            '-t', duration.toString(),
            '-c:v', 'libx264',
            '-crf', '28',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-y',
            outputPath
        ];

        return new Promise((resolve) => {
            const child = spawn(ffmpegPath, args);
            
            child.on('close', (code) => {
                if (isHttp) { try { fs.unlinkSync(localInputPath); } catch (e) {} }
                if (code === 0 && fs.existsSync(outputPath)) {
                    if (!isHttp && baseName.includes('_trimmed_')) {
                        try { fs.unlinkSync(videoPath); } catch (e) {}
                    }
                    resolve({ success: true, path: outputPath });
                } else {
                    resolve({ success: false, error: `FFmpeg process exited with code ${code}` });
                }
            });
            
            child.on('error', (err) => {
                if (isHttp) { try { fs.unlinkSync(localInputPath); } catch (e) {} }
                resolve({ success: false, error: err.message });
            });
        });

    } catch (e) {
        return { success: false, error: e.message };
    }
});

// =====================================================================
// IPC HANDLER: PHÁT HIỆN VÀ TRÍCH XUẤT KHUNG HÌNH PHÂN CẢNH VIDEO (AI VISION)
// =====================================================================
ipcMain.handle('detect-video-scenes-and-frames', async (event, payload) => {
    try {
        let { videoPath, startTime, duration } = payload || {};
        if (!videoPath) {
            return { success: false, error: 'Thiếu đường dẫn video' };
        }

        let cleanPath = videoPath.replace(/^file:\/\//i, '').replace(/^media:\/\//i, '');
        try { cleanPath = decodeURIComponent(cleanPath); } catch (e) {}
        cleanPath = path.normalize(cleanPath);
        if (cleanPath.startsWith('\\') || cleanPath.startsWith('/')) {
            // Absolute path
        } else if (!/^[a-zA-Z]:/.test(cleanPath)) {
            cleanPath = '/' + cleanPath;
        }

        if (!fs.existsSync(cleanPath)) {
            return { success: false, error: 'File video không tồn tại: ' + cleanPath };
        }

        startTime = Math.max(0, Number(startTime) || 0);
        let totalDuration = Number(duration) || 0;
        const ffmpegPath = binaries.ffmpeg || 'ffmpeg';

        // Lấy duration thực tế nếu duration <= 0
        if (totalDuration <= 0) {
            try {
                const durCmd = `${ffmpegPath} -i "${cleanPath}" 2>&1`;
                const output = await new Promise((resolve) => {
                    exec(durCmd, (err, stdout, stderr) => resolve((stdout || '') + (stderr || '')));
                });
                const match = output.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
                if (match) {
                    totalDuration = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
                }
            } catch (e) {}
            if (totalDuration <= 0) totalDuration = 10;
        }

        const tempDir = path.join(app.getPath('temp'), `ai_type_scenes_${Date.now()}`);
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        // PHÁT HIỆN ĐIỂM CHUYỂN CẢNH THỰC TẾ (NATURAL SCENE CUTS) BẰNG FFMPEG
        const outPattern = path.join(tempDir, 'scene_%04d.jpg');
        const ffmpegArgs = [
            '-ss', startTime.toString(),
            '-t', totalDuration.toString(),
            '-i', cleanPath,
            '-vf', "scale=480:-1,select='gt(scene,0.15)',showinfo",
            '-fps_mode', 'vfr',
            '-q:v', '3',
            '-y',
            outPattern
        ];

        let stderr = '';
        await new Promise((resolve) => {
            const child = spawn(ffmpegPath, ffmpegArgs);
            child.stderr.on('data', d => stderr += d);
            child.on('close', resolve);
            child.on('error', (err) => {
                console.error('[detect-video-scenes-and-frames] spawn error:', err);
                resolve(-1);
            });
        });

        // Bóc tách timestamps chuyển cảnh
        const rawCuts = [];
        const regex = /pts_time:([0-9.]+)/g;
        let m;
        while ((m = regex.exec(stderr)) !== null) {
            const t = parseFloat(m[1]);
            if (!isNaN(t)) rawCuts.push(t);
        }

        // Lọc các mốc chuyển cảnh tự nhiên:
        // - Khoảng cách tối thiểu giữa 2 cảnh: 2.0s (tránh micro-cuts)
        // - Khoảng cách tối đa: 25s (nếu cú máy dài, chèn mốc chuyển đoạn)
        const cuts = [startTime];
        for (const c of rawCuts) {
            const actualCut = startTime + c;
            const last = cuts[cuts.length - 1];
            if (actualCut - last >= 2.0) {
                if (actualCut - last > 25.0) {
                    const count = Math.floor((actualCut - last) / 15.0);
                    const step = (actualCut - last) / (count + 1);
                    for (let k = 1; k <= count; k++) {
                        cuts.push(Math.round((last + k * step) * 100) / 100);
                    }
                }
                cuts.push(Math.round(actualCut * 100) / 100);
            }
        }
        const endTimeline = startTime + totalDuration;
        if (endTimeline - cuts[cuts.length - 1] >= 2.0) {
            cuts.push(Math.round(endTimeline * 100) / 100);
        } else {
            cuts[cuts.length - 1] = Math.round(endTimeline * 100) / 100;
        }

        // Tạo danh sách scenes tự nhiên & trích xuất frame đại diện
        const scenes = [];
        const frames = [];

        for (let i = 0; i < cuts.length - 1; i++) {
            const sStart = cuts[i];
            const sEnd = cuts[i + 1];
            const sDur = Math.max(0.1, Math.round((sEnd - sStart) * 100) / 100);
            const sampleTime = Math.min(sEnd - 0.1, sStart + Math.min(0.5, sDur * 0.3));
            const framePath = path.join(tempDir, `shot_${i + 1}_${Date.now()}.jpg`);

            // Trích xuất frame đại diện sắc nét cho cảnh này
            const fArgs = [
                '-ss', sampleTime.toString(),
                '-i', cleanPath,
                '-vframes', '1',
                '-vf', 'scale=640:-1',
                '-q:v', '3',
                '-y',
                framePath
            ];

            await new Promise(res => {
                const fChild = spawn(ffmpegPath, fArgs);
                fChild.on('close', res);
                fChild.on('error', res);
            });

            let base64 = '';
            if (fs.existsSync(framePath)) {
                try {
                    base64 = fs.readFileSync(framePath).toString('base64');
                } catch (e) {}
            }

            const frameObj = {
                index: i,
                timestamp: sStart,
                duration: sDur,
                filePath: framePath,
                url: `file://${framePath}`,
                base64: base64
            };

            frames.push(frameObj);
            scenes.push({
                index: i,
                startTime: sStart,
                endTime: sEnd,
                duration: sDur,
                frame: frameObj
            });
        }

        return {
            success: true,
            totalDuration: totalDuration,
            cuts: cuts,
            scenes: scenes,
            frames: frames
        };
    } catch (e) {
        console.error('Lỗi detect-video-scenes-and-frames:', e);
        return { success: false, error: e.message };
    }
});

// =====================================================================
// IPC HANDLER: CẮT TÁCH VIDEO THÀNH CÁC PHÂN CẢNH BẰNG FFMPEG
// =====================================================================
ipcMain.handle('split-video-clips-ffmpeg', async (event, payload) => {
    try {
        let { videoPath, scenes } = payload || {};
        if (!videoPath || !scenes || !Array.isArray(scenes) || scenes.length === 0) {
            return { success: false, error: 'Dữ liệu phân cảnh không hợp lệ' };
        }

        let cleanPath = videoPath.replace(/^file:\/\//i, '').replace(/^media:\/\//i, '');
        try { cleanPath = decodeURIComponent(cleanPath); } catch (e) {}
        cleanPath = path.normalize(cleanPath);
        if (cleanPath.startsWith('\\') || cleanPath.startsWith('/')) {
            // Absolute path
        } else if (!/^[a-zA-Z]:/.test(cleanPath)) {
            cleanPath = '/' + cleanPath;
        }

        if (!fs.existsSync(cleanPath)) {
            return { success: false, error: 'File video không tồn tại: ' + cleanPath };
        }

        const ffmpegPath = binaries.ffmpeg || 'ffmpeg';
        const docPath = app.getPath('documents');
        const scenesDir = path.join(docPath, 'ai.type', 'data', 'scenes', `split_${Date.now()}`);
        if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true });

        const clips = new Array(scenes.length);

        // Xử lý cắt video song song (concurrency: 3) với độ chính xác tuyệt đối tới từng frame
        const concurrency = 3;
        let currentIndex = 0;

        const worker = async () => {
            while (currentIndex < scenes.length) {
                const i = currentIndex++;
                const sc = scenes[i];
                const start = Math.max(0, Number(sc.startTime) || 0);
                const end = Math.max(start + 0.1, Number(sc.endTime) || (start + 3));
                const duration = Math.max(0.1, Math.round((end - start) * 100) / 100);

                const outClipPath = path.join(scenesDir, `scene_${i + 1}_${Date.now()}_${i}.mp4`);
                const outThumbPath = path.join(scenesDir, `scene_${i + 1}_${Date.now()}_${i}_thumb.jpg`);

                // Frame-accurate re-encode (Loại bỏ triệt để hiện tượng dính frame/GOP của clip trước)
                const reencodeArgs = [
                    '-ss', start.toString(),
                    '-i', cleanPath,
                    '-t', duration.toString(),
                    '-c:v', 'libx264',
                    '-preset', 'ultrafast',
                    '-crf', '19',
                    '-c:a', 'aac',
                    '-avoid_negative_ts', 'make_zero',
                    '-y',
                    outClipPath
                ];

                await new Promise((resolve) => {
                    const child = spawn(ffmpegPath, reencodeArgs);
                    child.on('close', resolve);
                    child.on('error', (err) => {
                        console.error(`[split-video-clips-ffmpeg] cut error on scene ${i + 1}:`, err);
                        resolve(-1);
                    });
                });

                // Trích xuất 1 ảnh thumbnail cho phân cảnh từ clip mới tạo
                const thumbArgs = [
                    '-ss', '0',
                    '-i', outClipPath,
                    '-vframes', '1',
                    '-vf', 'scale=640:-1',
                    '-q:v', '3',
                    '-y',
                    outThumbPath
                ];

                await new Promise((resolve) => {
                    const child = spawn(ffmpegPath, thumbArgs);
                    child.on('close', resolve);
                    child.on('error', resolve);
                });

                clips[i] = {
                    videoUrl: `file://${outClipPath}`,
                    imageUrl: fs.existsSync(outThumbPath) ? `file://${outThumbPath}` : null,
                    duration: duration,
                    startTime: start,
                    endTime: end,
                    prompt: sc.prompt || ''
                };
            }
        };

        const workers = [];
        for (let w = 0; w < Math.min(concurrency, scenes.length); w++) {
            workers.push(worker());
        }
        await Promise.all(workers);

        return {
            success: true,
            clips: clips
        };
    } catch (e) {
        console.error('Lỗi split-video-clips-ffmpeg:', e);
        return { success: false, error: e.message };
    }
});

// =====================================================================
// IPC HANDLER: CROP KHUNG HÌNH VIDEO (CROP VIDEO FRAME) BẰNG FFMPEG
// =====================================================================
ipcMain.handle('crop-video-ffmpeg', async (_event, payload) => {
    try {
        let { videoPath, cropX, cropY, cropWidth, cropHeight, originalWidth, originalHeight, mode, padColor } = payload || {};
        if (!videoPath) {
            return { success: false, error: 'Thiếu đường dẫn file video' };
        }

        let cleanPath = videoPath.replace(/^file:\/\//i, '').replace(/^media:\/\//i, '');
        try { cleanPath = decodeURIComponent(cleanPath); } catch (e) {}
        cleanPath = path.normalize(cleanPath);
        if (cleanPath.startsWith('\\') || cleanPath.startsWith('/')) {
            // Absolute path
        } else if (!/^[a-zA-Z]:/.test(cleanPath)) {
            cleanPath = '/' + cleanPath;
        }

        if (!fs.existsSync(cleanPath)) {
            return { success: false, error: 'File video không tồn tại: ' + cleanPath };
        }

        const ffmpegPath = binaries.ffmpeg || 'ffmpeg';
        const docPath = app.getPath('documents');
        const cropDir = path.join(docPath, 'ai.type', 'data', 'cropped_videos');
        if (!fs.existsSync(cropDir)) fs.mkdirSync(cropDir, { recursive: true });

        // Làm tròn số chẵn cho x, y, width, height theo chuẩn H.264
        let w = Math.round(Number(cropWidth) || 0);
        let h = Math.round(Number(cropHeight) || 0);
        let x = Math.round(Number(cropX) || 0);
        let y = Math.round(Number(cropY) || 0);
        let origW = Math.round(Number(originalWidth) || 0);
        let origH = Math.round(Number(originalHeight) || 0);

        if (w % 2 !== 0) w -= 1;
        if (h % 2 !== 0) h -= 1;
        if (x % 2 !== 0) x -= 1;
        if (y % 2 !== 0) y -= 1;
        if (origW % 2 !== 0) origW += 1;
        if (origH % 2 !== 0) origH += 1;

        if (w <= 0 || h <= 0) {
            return { success: false, error: 'Kích thước vùng crop không hợp lệ' };
        }

        const isWebmInput = String(cleanPath).toLowerCase().endsWith('.webm');
        const isCropPad = mode === 'crop_pad' || mode === 'keep_aspect' || mode === 'keep_canvas';
        
        // Khi ở chế độ crop_pad (cắt 4 biên giữ canvas): luôn xuất ra WebM VP8 Alpha trong suốt để lộ lớp video bên dưới
        const outputWebm = isCropPad || isWebmInput;
        const ext = outputWebm ? '.webm' : '.mp4';
        const baseName = path.basename(cleanPath, path.extname(cleanPath));
        const outVideoPath = path.join(cropDir, `${baseName}_crop_${Date.now()}${ext}`);
        const outThumbPath = path.join(cropDir, `${baseName}_crop_${Date.now()}_thumb.jpg`);

        const finalW = isCropPad && origW > 0 ? origW : w;
        const finalH = isCropPad && origH > 0 ? origH : h;

        let filterParts = [];
        if (outputWebm) {
            filterParts.push('format=yuva420p');
        }
        filterParts.push(`crop=${w}:${h}:${Math.max(0, x)}:${Math.max(0, y)}`);
        if (isCropPad && origW > 0 && origH > 0) {
            filterParts.push(`pad=${origW}:${origH}:${Math.max(0, x)}:${Math.max(0, y)}:color=black@0`);
        }

        const cropFilter = filterParts.join(',');

        let hasAudio = false;
        try {
            const probeOut = execSync(`"${ffmpegPath}" -i "${cleanPath}" 2>&1`, { encoding: 'utf-8' });
            if (probeOut && (probeOut.includes('Audio:') || (probeOut.includes('Stream #') && probeOut.includes(': Audio:')))) {
                hasAudio = true;
            }
        } catch (pe) {
            const out = (pe && (pe.stdout || pe.stderr || pe.message)) || '';
            if (out.includes('Audio:')) hasAudio = true;
        }

        let cropArgs = ['-y'];
        if (isWebmInput) {
            cropArgs.push('-c:v', 'libvpx');
        }
        cropArgs.push('-i', cleanPath);
        cropArgs.push('-vf', cropFilter);

        if (outputWebm) {
            cropArgs.push(
                '-c:v', 'libvpx',
                '-pix_fmt', 'yuva420p',
                '-auto-alt-ref', '0',
                '-b:v', '4M'
            );
            if (hasAudio) {
                cropArgs.push('-c:a', 'libvorbis');
            } else {
                cropArgs.push('-an');
            }
        } else {
            cropArgs.push(
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '18',
                '-pix_fmt', 'yuv420p'
            );
            if (hasAudio) {
                cropArgs.push('-c:a', 'copy');
            } else {
                cropArgs.push('-an');
            }
        }

        cropArgs.push(outVideoPath);

        sendToRenderer('tools-log', `[FFmpeg] Crop video: ${cropArgs.join(' ')}`);

        const cropCode = await new Promise((resolve) => {
            const child = spawn(ffmpegPath, cropArgs);
            let stderrOutput = '';
            child.stderr.on('data', (d) => { stderrOutput += d.toString(); });
            child.on('close', (code) => {
                if (code !== 0) console.error('[crop-video-ffmpeg] Lỗi:', stderrOutput);
                resolve(code);
            });
            child.on('error', (err) => {
                console.error('[crop-video-ffmpeg] spawn error:', err);
                resolve(-1);
            });
        });

        if (cropCode !== 0 || !fs.existsSync(outVideoPath)) {
            return { success: false, error: 'Lỗi thực thi FFmpeg khi crop video' };
        }

        // Trích xuất 1 ảnh thumbnail cho video vừa crop
        const thumbArgs = [
            '-ss', '0',
            '-i', outVideoPath,
            '-vframes', '1',
            '-vf', 'scale=640:-1',
            '-q:v', '3',
            '-y',
            outThumbPath
        ];

        await new Promise((resolve) => {
            const child = spawn(ffmpegPath, thumbArgs);
            child.on('close', resolve);
            child.on('error', resolve);
        });

        return {
            success: true,
            videoUrl: `file://${outVideoPath}`,
            imageUrl: fs.existsSync(outThumbPath) ? `file://${outThumbPath}` : null,
            width: finalW,
            height: finalH
        };
    } catch (e) {
        console.error('Lỗi crop-video-ffmpeg:', e);
        return { success: false, error: e.message };
    }
});

// =====================================================================
// IPC HANDLER: TỰ ĐỘNG QUÉT THƯ MỤC VIDEO TÌM PHỤ ĐỀ (.SRT/.VTT) & AUDIO SEGMENTS
// =====================================================================
ipcMain.handle('scan-companion-video-assets', async (_event, payload) => {
    try {
        let { videoPath } = payload || {};
        if (!videoPath) return { success: false, error: 'Thiếu đường dẫn video' };

        let cleanPath = String(videoPath).replace(/^file:\/{2,3}/i, '').replace(/^media:\/{2,3}/i, '');
        try { cleanPath = decodeURIComponent(cleanPath.split('?')[0].split('#')[0]); } catch (e) {}
        cleanPath = path.normalize(cleanPath);
        if (cleanPath.startsWith('\\') || cleanPath.startsWith('/')) {
            // Absolute
        } else if (!/^[a-zA-Z]:/.test(cleanPath)) {
            cleanPath = '/' + cleanPath;
        }

        if (!fs.existsSync(cleanPath)) {
            return { success: false, error: 'File video không tồn tại: ' + cleanPath };
        }

        const videoDir = path.dirname(cleanPath);
        const files = fs.readdirSync(videoDir);

        // 1. Tìm file phụ đề (.srt / .vtt)
        let selectedSrtPath = null;
        let selectedOrigSrtPath = null;

        const srtFiles = files.filter(f => f.endsWith('.srt') || f.endsWith('.vtt'));
        if (srtFiles.length > 0) {
            const viSrt = srtFiles.filter(f => f.toLowerCase().includes('_vi.') || f.toLowerCase().includes('.vi.'));
            if (viSrt.length > 0) {
                viSrt.sort((a, b) => fs.statSync(path.join(videoDir, b)).mtimeMs - fs.statSync(path.join(videoDir, a)).mtimeMs);
                selectedSrtPath = path.join(videoDir, viSrt[0]);
            }

            const origSrt = srtFiles.filter(f => !f.toLowerCase().includes('_vi.') && !f.toLowerCase().includes('.vi.'));
            if (origSrt.length > 0) {
                origSrt.sort((a, b) => fs.statSync(path.join(videoDir, b)).mtimeMs - fs.statSync(path.join(videoDir, a)).mtimeMs);
                selectedOrigSrtPath = path.join(videoDir, origSrt[0]);
            }

            if (!selectedSrtPath && selectedOrigSrtPath) {
                selectedSrtPath = selectedOrigSrtPath;
            }
        }

        let srtContent = null;
        let origSrtContent = null;
        if (selectedSrtPath && fs.existsSync(selectedSrtPath)) {
            srtContent = fs.readFileSync(selectedSrtPath, 'utf8');
        }
        if (selectedOrigSrtPath && fs.existsSync(selectedOrigSrtPath) && selectedOrigSrtPath !== selectedSrtPath) {
            origSrtContent = fs.readFileSync(selectedOrigSrtPath, 'utf8');
        }

        // 2. Tìm các audio segments (_seg_*.mp3)
        const segFiles = files.filter(f => f.includes('_seg_') && (f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a') || f.endsWith('.aac')));
        const audioSegments = [];

        if (segFiles.length > 0) {
            const byIndex = new Map();
            for (const f of segFiles) {
                const match = f.match(/_seg_(\d+)/);
                if (match) {
                    const idx = parseInt(match[1], 10);
                    const fullPath = path.join(videoDir, f);
                    const mtime = fs.statSync(fullPath).mtimeMs;
                    if (!byIndex.has(idx) || byIndex.get(idx).mtime < mtime) {
                        byIndex.set(idx, { path: fullPath, fileName: f, mtime, index: idx });
                    }
                }
            }

            const sortedIndices = Array.from(byIndex.keys()).sort((a, b) => a - b);
            for (const idx of sortedIndices) {
                const item = byIndex.get(idx);
                audioSegments.push({
                    index: idx,
                    audioPath: item.path,
                    audioUrl: `media://${item.path.replace(/\\/g, '/')}`
                });
            }
        }

        // 3. Tìm full audio nếu có
        const fullAudioFiles = files.filter(f => !f.includes('_seg_') && (f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a') || f.endsWith('.aac')));
        let fullAudioUrl = null;
        if (fullAudioFiles.length > 0) {
            fullAudioFiles.sort((a, b) => fs.statSync(path.join(videoDir, b)).mtimeMs - fs.statSync(path.join(videoDir, a)).mtimeMs);
            const fullPath = path.join(videoDir, fullAudioFiles[0]);
            fullAudioUrl = `media://${fullPath.replace(/\\/g, '/')}`;
        }

        const hasCompanion = !!(srtContent || audioSegments.length > 0 || fullAudioUrl);

        return {
            success: true,
            hasCompanion: hasCompanion,
            videoDir: videoDir,
            srtContent: srtContent,
            origSrtContent: origSrtContent,
            selectedSrtPath: selectedSrtPath,
            audioSegments: audioSegments,
            fullAudioUrl: fullAudioUrl
        };
    } catch (err) {
        console.error('Lỗi scan-companion-video-assets:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('open-external', async (event, targetPath) => {
    try {
        if (fs.existsSync(targetPath)) {
            shell.showItemInFolder(targetPath);
            return { success: true };
        }
        return { success: false, error: 'File khÃ´ng tá»“n táº¡i' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// --- NODEBB EMAIL SENDER SERVICES ---
const axios = require('axios');
const nodemailer = require('nodemailer');

ipcMain.handle('fetch-forum-users', async (event, config) => {
  try {
    const NODEBB_URL = config.nodebbUrl;
    const ADMIN_TOKEN = config.nodebbToken;
    let allUsers = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      // Dùng API admin để lấy được email của thành viên, cần truyền _uid=1 để xác thực Master Token
      const response = await axios.get(`${NODEBB_URL}/api/admin/manage/users?_uid=1&page=${currentPage}`, {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
      });
      // Phản hồi của /api/admin/manage/users
      const responseData = response.data.response || response.data;
      totalPages = responseData.pagination ? responseData.pagination.pageCount : 1;
      
      const userList = responseData.users || [];
      for (const user of userList) {
        if (user.email) allUsers.push(user);
      }
      currentPage++;
    } while (currentPage <= totalPages);

    return { success: true, users: allUsers };
  } catch (error) {
    let errorMsg = error.message;
    if (error.response && error.response.data) {
        errorMsg += ' - Detail: ' + JSON.stringify(error.response.data);
    }
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('fetch-forum-groups', async (event, config) => {
  try {
    const NODEBB_URL = config.nodebbUrl;
    const ADMIN_TOKEN = config.nodebbToken;
    
    const response = await axios.get(`${NODEBB_URL}/api/v3/groups?_uid=1`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    
    const responseData = response.data.response || response.data;
    // Tùy theo cấu trúc của NodeBB, groups có thể nằm trong responseData.groups hoặc chính nó
    const groups = responseData.groups || responseData;
    return { success: true, groups: groups };
  } catch (error) {
    let errorMsg = error.message;
    if (error.response && error.response.data) {
        errorMsg += ' - Detail: ' + JSON.stringify(error.response.data);
    }
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('add-forum-users-to-groups', async (event, { userIds, groupSlugs, config }) => {
  try {
    const NODEBB_URL = config.nodebbUrl;
    const ADMIN_TOKEN = config.nodebbToken;
    let successCount = 0;
    let failCount = 0;
    
    for (const uid of userIds) {
      for (const slug of groupSlugs) {
        try {
          await axios.put(`${NODEBB_URL}/api/v3/groups/${slug}/membership/${uid}?_uid=1`, {}, {
            headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
          });
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
    }
    return { success: true, successCount, failCount };
  } catch (error) {
    let errorMsg = error.message;
    if (error.response && error.response.data) {
        errorMsg += ' - Detail: ' + JSON.stringify(error.response.data);
    }
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('remove-forum-users-from-groups', async (event, { userIds, groupSlugs, config }) => {
  try {
    const NODEBB_URL = config.nodebbUrl;
    const ADMIN_TOKEN = config.nodebbToken;
    let successCount = 0;
    let failCount = 0;
    
    for (const uid of userIds) {
      for (const slug of groupSlugs) {
        try {
          await axios.delete(`${NODEBB_URL}/api/v3/groups/${slug}/membership/${uid}?_uid=1`, {
            headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
          });
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
    }
    return { success: true, successCount, failCount };
  } catch (error) {
    let errorMsg = error.message;
    if (error.response && error.response.data) {
        errorMsg += ' - Detail: ' + JSON.stringify(error.response.data);
    }
    return { success: false, error: errorMsg };
  }
});

ipcMain.handle('fetch-forum-user-groups', async (event, { uid, config }) => {
  try {
    const NODEBB_URL = config.nodebbUrl;
    const ADMIN_TOKEN = config.nodebbToken;
    
    const response = await axios.get(`${NODEBB_URL}/api/v3/users/${uid}?_uid=1`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
    });
    
    const responseData = response.data.response || response.data;
    // Lấy mảng group slugs mà user đang thuộc về (trong groups của NodeBB)
    const userGroups = responseData.groups || [];
    const groupSlugs = userGroups.map(g => g.slug);
    
    return { success: true, groupSlugs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-mass-emails', async (event, { senderName, subject, htmlContent, users, config }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465, // Port 465 thì secure, 587 thì không
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    // Chạy ngầm trong background
    (async () => {
        let successCount = 0;
        let failCount = 0;

        for (const user of users) {
          try {
            await transporter.sendMail({
              from: `"${senderName || 'Type.vn Admin'}" <${config.smtpUser}>`, 
              to: user.email, 
              subject: subject, 
              html: `Chào <b>${user.username}</b>,<br><br>${htmlContent}` 
            });
            successCount++;
            
            event.sender.send('send-email-progress', { 
                status: 'sending', user: user.username, 
                success: successCount, fail: failCount, total: users.length 
            });

          } catch (mailErr) {
            failCount++;
            event.sender.send('send-email-progress', { 
                status: 'sending', user: user.username, 
                success: successCount, fail: failCount, total: users.length 
            });
          }
          
          // Nghỉ ngẫu nhiên từ 5 đến 10 phút (300000ms đến 600000ms)
          const delay = Math.floor(Math.random() * (600000 - 300000 + 1)) + 300000;
          await new Promise(resolve => setTimeout(resolve, delay)); 
        }
        
        event.sender.send('send-email-progress', { 
            status: 'done', 
            success: successCount, fail: failCount, total: users.length 
        });
    })();

    return { success: true, message: `Đã xếp ${users.length} email vào hàng chờ gửi ngầm.` };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
// ------------------------------------

// --- B?T Ð?U CRM SERVICES ---
let crmPhpProcess = null;
let crmMariaDbProcess = null;

function startCrmServices() {
    const isPackaged = app.isPackaged;
    const crmDir = isPackaged 
        ? path.join(process.resourcesPath, 'crm')
        : path.join(__dirname, '..', 'crm');

    const phpExe = path.join(crmDir, 'php', 'php.exe');
    const wwwDir = path.join(crmDir, 'www');
    const mariadbExe = path.join(crmDir, 'mariadb', 'mariadbd.exe');
    const mariadbData = path.join(crmDir, 'mariadb', 'data');

    if (fs.existsSync(mariadbExe)) {
        crmMariaDbProcess = spawn(mariadbExe, ['--datadir=' + mariadbData, '--port=3307', '--console'], {
            cwd: path.join(crmDir, 'mariadb'),
            detached: false
        });
    }

    if (fs.existsSync(phpExe)) {
        crmPhpProcess = spawn(phpExe, ['-S', '127.0.0.1:2929'], {
            cwd: wwwDir,
            detached: false
        });
    }
}

app.on('will-quit', () => {
    if (crmPhpProcess) crmPhpProcess.kill();
    if (crmMariaDbProcess) crmMariaDbProcess.kill();
    try { require('child_process').exec('taskkill /f /im mariadbd.exe'); } catch(e){}
    try { require('child_process').exec('taskkill /f /im php.exe'); } catch(e){}
});

ipcMain.on('open-crm', () => {
    const crmWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: 'Qu?n Lý Khách Hàng (CRM)',
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false }
    });
    crmWindow.loadURL('http://127.0.0.1:2929');
});
// --- K?T THÚC CRM SERVICES ---

// =====================================================================
// RENDER FINAL COMPOSITION
// =====================================================================
ipcMain.handle('render-final-composition', async (event, payload) => {
    try {
        const { projectTitle, projectUuid, aspectRatio, videos } = payload;
        if (!videos || videos.length === 0) {
            return { success: false, error: "Không có video nào để ghép." };
        }

        let targetWidth = 1920;
        let targetHeight = 1080;
        if (aspectRatio === '9:16') {
            targetWidth = 1080;
            targetHeight = 1920;
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const docPath = app.getPath('documents');
        const workspaceDir = path.join(docPath, 'ai.type', 'data', 'exports', 'workspace', projectUuid);
        const outputDir = path.join(docPath, 'ai.type', 'data', 'exports', 'output', projectUuid);

        if (!fs.existsSync(workspaceDir)) fs.mkdirSync(workspaceDir, { recursive: true });
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        // Generate safe output name
        const safeTitle = (projectTitle || 'Untitled').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const finalOutputPath = path.join(outputDir, `${safeTitle}_final.mp4`);

        let finalAudioListContent = "ffconcat version 1.0\n";
        const sceneFiles = [];
        
        for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            const cleanPath = cleanFilePath(video.videoUrl || video.src);
            const partPath = path.join(workspaceDir, `final_scene_${i}.mp4`);
            sceneFiles.push(partPath);

            const actualSpeed = video.playbackRate || 1.0;
            const hasAudio = await checkAudioStream(cleanPath);
            let args = [];

            const scalePadFilter = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p`;

            if (hasAudio) {
                const atempoFilter = getAudioTempoFilter(actualSpeed);
                args = [
                    '-y',
                    '-ss', video.videoStart.toString(),
                    '-to', video.videoEnd.toString(),
                    '-i', cleanPath,
                    '-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS,${scalePadFilter}[v];[0:a]${atempoFilter}[a]`,
                    '-map', '[v]',
                    '-map', '[a]',
                    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
                    '-c:a', 'aac', '-b:a', '128k',
                    partPath
                ];
            } else {
                args = [
                    '-y',
                    '-ss', video.videoStart.toString(),
                    '-to', video.videoEnd.toString(),
                    '-i', cleanPath,
                    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                    '-filter_complex', `[0:v]setpts=${1/actualSpeed}*PTS,${scalePadFilter}[v]`,
                    '-map', '[v]',
                    '-map', '1:a',
                    '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
                    '-c:a', 'aac',
                    '-shortest',
                    partPath
                ];
            }

            await new Promise((resolve, reject) => {
                const { spawn } = require('child_process');
                console.log("SPAWNING FFMPEG WITH ARGS: ", args);
                const child = spawn(ffmpegPath, args);
                let errLog = "ARGS: " + JSON.stringify(args) + "\n";
                child.stderr.on('data', (data) => { errLog += data.toString(); });
                child.stdout.on('data', () => {}); // Consume stdout
                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Failed to encode scene ${i}: ${errLog}`));
                });
                child.on('error', reject);
            });

            finalAudioListContent += `file '${partPath}'\n`;
        }

        const concatListPath = path.join(workspaceDir, 'final_concat.txt');
        fs.writeFileSync(concatListPath, finalAudioListContent, 'utf-8');

        // Concat the scenes
        const concatArgs = [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            finalOutputPath
        ];

        await new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const child = spawn(ffmpegPath, concatArgs);
            child.stdout.on('data', () => {});
            child.stderr.on('data', () => {});
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Failed to concat final video`));
            });
            child.on('error', reject);
        });

        return { success: true, path: finalOutputPath };

    } catch (error) {
        return { success: false, error: error.message };
    }
});

// =====================================================================
// LICENSE CHECKER IN MAIN PROCESS (SECURITY)
// =====================================================================
let currentLicense = null;

ipcMain.handle('register-license', (event, token) => {
    currentLicense = token;
});

// Kiểm tra mỗi 5 phút (Đã vô hiệu hóa kiểm tra và ép kích hoạt phần mềm)
setInterval(() => {
    // Đã tắt logic kiểm tra hết hạn license key
}, 5 * 60 * 1000);

// =====================================================================
// MODEL CONTEXT PROTOCOL (MCP) CLIENT FOR GOOGLE COLAB GPU
// =====================================================================
const { colabMcpClient } = require('./mcp-client');

ipcMain.handle('mcp-connect', async (event, url) => {
    try {
        const result = await colabMcpClient.connect(url);
        return { success: true, ...result };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle('mcp-status', async () => {
    return {
        isConnected: colabMcpClient.isConnected,
        baseUrl: colabMcpClient.baseUrl,
        serverInfo: colabMcpClient.serverInfo,
        tools: colabMcpClient.availableTools
    };
});

ipcMain.handle('mcp-disconnect', async () => {
    colabMcpClient.disconnect();
    return { success: true };
});

ipcMain.handle('mcp-call-tool', async (event, toolName, args) => {
    try {
        const result = await colabMcpClient.callTool(toolName, args);
        return { success: true, data: result };
    } catch (err) {
        return { success: false, error: err.message || String(err) };
    }
});

ipcMain.handle('run-pdf-analysis-mcp', async (event, payload, legacyMcpUrl = null) => {
    return new Promise(async (resolve, reject) => {
        try {
            const sender = event.sender;
            let filePath = '';
            let mcpUrl = '';
            let docType = 'qa_detailed';
            let googleApiKey = '';

            let username = 'admin';
            if (typeof payload === 'object' && payload !== null) {
                filePath = payload.filePath;
                mcpUrl = payload.mcpUrl;
                docType = payload.docType || 'qa_detailed';
                googleApiKey = payload.googleApiKey || '';
                username = payload.username || 'admin';
            } else {
                filePath = payload;
                mcpUrl = legacyMcpUrl;
            }

            // 1. Kiểm tra Colab Agent Plugin nền (cổng 7868) để lấy URL mới nhất
            let activeUrl = mcpUrl;
            try {
                const resp = await fetch('http://127.0.0.1:7868/status');
                if (resp.ok) {
                    const statusData = await resp.json();
                    if (statusData && statusData.colab_url && statusData.is_connected) {
                        activeUrl = statusData.colab_url;
                    }
                }
            } catch(e) {}

            if ((!colabMcpClient.isConnected || colabMcpClient.baseUrl !== activeUrl) && activeUrl) {
                if (sender) sender.send('pdf-analysis-progress', 'Đang kết nối tới Colab MCP GPU Server...');
                try {
                    await colabMcpClient.connect(activeUrl);
                } catch(e) {
                    console.error('[Colab MCP] Lỗi connect activeUrl:', e);
                }
            }

            if (!colabMcpClient.isConnected && mcpUrl && mcpUrl !== activeUrl) {
                try {
                    await colabMcpClient.connect(mcpUrl);
                } catch(e) {}
            }

            if (!colabMcpClient.isConnected) {
                throw new Error('Chưa kết nối tới Colab MCP Server. Vui lòng bấm "Khởi chạy GPU T4" trong mục Cài đặt > Plugins.');
            }

            const result = await colabMcpClient.analyzePdfOnColab(filePath, docType, googleApiKey, (statusText) => {
                if (sender) sender.send('pdf-analysis-progress', statusText);
            }, { username });

            const content = result.data || result;
            resolve(content);
        } catch (error) {
            console.error('Lỗi chạy Colab MCP PDF analysis:', error);
            reject(error.message || String(error));
        }
    });
});

// ==============================================================================
// LOCAL FAISS VECTOR DATABASE STORAGE (Documents/ai.type/data/faiss/{username})
// ==============================================================================
ipcMain.handle('save-local-faiss-data', async (event, { username, filename, doc_type, markdown, content_json, faiss_base64, pkl_base64 }) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const targetDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'faiss', safeUser);
        fs.mkdirSync(targetDir, { recursive: true });

        const docsDir = path.join(targetDir, 'docs');
        fs.mkdirSync(docsDir, { recursive: true });

        // 1. Lưu file Markdown bóc tách
        if (markdown) {
            const mdFilename = `${path.parse(filename).name}.md`;
            fs.writeFileSync(path.join(docsDir, mdFilename), markdown, 'utf-8');
        }

        // 2. Lưu file JSON chi tiết MinerU
        if (content_json) {
            const jsonFilename = `${path.parse(filename).name}.mineru.json`;
            fs.writeFileSync(path.join(docsDir, jsonFilename), JSON.stringify(content_json, null, 2), 'utf-8');
        }

        // 3. Đảm bảo file index.faiss & index.pkl luôn được tạo và cập nhật
        const faissPath = path.join(targetDir, 'index.faiss');
        const pklPath = path.join(targetDir, 'index.pkl');
        if (faiss_base64) {
            fs.writeFileSync(faissPath, Buffer.from(faiss_base64, 'base64'));
        } else if (!fs.existsSync(faissPath)) {
            const header = Buffer.from(`FAISS_INDEX_V1:${safeUser}:${Date.now()}`);
            fs.writeFileSync(faissPath, header);
        }

        if (pkl_base64) {
            fs.writeFileSync(pklPath, Buffer.from(pkl_base64, 'base64'));
        } else if (!fs.existsSync(pklPath)) {
            fs.writeFileSync(pklPath, Buffer.from(JSON.stringify({ created_at: Date.now(), user: safeUser })));
        }

        // 4. Cập nhật metadata
        const metaPath = path.join(targetDir, 'index_metadata.json');
        let meta = { username: safeUser, updated_at: new Date().toISOString(), files: {} };
        if (fs.existsSync(metaPath)) {
            try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) {}
        }
        const faissSize = fs.existsSync(faissPath) ? fs.statSync(faissPath).size : 0;
        meta.files[filename] = {
            doc_type: doc_type || 'analysis',
            updated_at: new Date().toISOString(),
            md_path: path.join(docsDir, `${path.parse(filename).name}.md`),
            faiss_size: faissSize
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

        console.log(`[FAISS Local] Đã lưu dữ liệu chỉ mục tại: ${targetDir} (Kích thước: ${faissSize} bytes)`);
        return { success: true, targetDir, faiss_size: faissSize };
    } catch (err) {
        console.error('[FAISS Local] Lỗi lưu index:', err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-local-faiss-context', async (event, { username, query, maxChunks = 5 }) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const targetDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'faiss', safeUser);
        const docsDir = path.join(targetDir, 'docs');

        if (!fs.existsSync(docsDir)) {
            return { success: false, context: '' };
        }

        const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
        if (!files.length) return { success: false, context: '' };

        const queryTerms = (query || '').toLowerCase().split(/\s+/).filter(t => t.length > 1);
        let scoredChunks = [];

        for (const file of files) {
            const content = fs.readFileSync(path.join(docsDir, file), 'utf-8');
            const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 30);
            for (const p of paragraphs) {
                const lowerP = p.toLowerCase();
                let score = 0;
                for (const term of queryTerms) {
                    if (lowerP.includes(term)) score += 1;
                }
                if (score > 0) {
                    scoredChunks.push({ score, text: p.trim(), file });
                }
            }
        }

        scoredChunks.sort((a, b) => b.score - a.score);
        const topChunks = scoredChunks.slice(0, maxChunks);
        const contextText = topChunks.map(c => `[Tài liệu: ${c.file}]\n${c.text}`).join('\n\n---\n\n');

        return { success: true, context: contextText, chunksCount: topChunks.length };
    } catch (e) {
        return { success: false, error: e.message, context: '' };
    }
});

ipcMain.handle('get-local-faiss-metadata', async (event, username) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const targetDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'faiss', safeUser);
        const metaPath = path.join(targetDir, 'index_metadata.json');
        let filesMap = {};

        if (fs.existsSync(metaPath)) {
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                filesMap = meta.files || {};
            } catch (e) {}
        }

        const docsDir = path.join(targetDir, 'docs');
        if (fs.existsSync(docsDir)) {
            const files = fs.readdirSync(docsDir);
            for (const f of files) {
                if (f.endsWith('.md')) {
                    const base = f.replace(/\.md$/, '');
                    const pdfName = `${base}.pdf`;
                    if (!filesMap[pdfName]) filesMap[pdfName] = { doc_type: 'qa_detailed' };
                    if (!filesMap[base]) filesMap[base] = { doc_type: 'qa_detailed' };
                    if (!filesMap[f]) filesMap[f] = { doc_type: 'qa_detailed' };
                }
            }
        }

        return { success: true, files: filesMap };
    } catch (e) {
        return { success: false, error: e.message, files: {} };
    }
});

ipcMain.handle('save-local-chatbot-history', async (event, { username, threadId, messages, title }) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const userChatDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'chatbot', safeUser);
        if (!fs.existsSync(userChatDir)) {
            fs.mkdirSync(userChatDir, { recursive: true });
        }

        const threadFile = path.join(userChatDir, `thread_${threadId}.json`);
        fs.writeFileSync(threadFile, JSON.stringify(messages || [], null, 2), 'utf-8');

        // Cập nhật chỉ mục danh sách cuộc trò chuyện
        const indexFile = path.join(userChatDir, 'threads_index.json');
        let indexList = [];
        if (fs.existsSync(indexFile)) {
            try { indexList = JSON.parse(fs.readFileSync(indexFile, 'utf-8')); } catch (e) {}
        }
        const existingIdx = indexList.findIndex(t => String(t.id) === String(threadId));
        const dateStr = new Date().toLocaleDateString('vi-VN', {
            hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const firstUserMsg = (messages || []).find(m => m[2] === 'user')?.[3];
        const computedTitle = (firstUserMsg ? firstUserMsg.slice(0, 60) : null) || 
                              (title && title !== 'Hội thoại mới' ? title.slice(0, 60) : null) || 
                              (title || 'Hội thoại mới');

        const threadItem = {
            id: threadId,
            title: computedTitle,
            updated_at: dateStr,
            messages_count: messages?.length || 0
        };
        if (existingIdx >= 0) {
            indexList[existingIdx] = threadItem;
        } else {
            indexList.unshift(threadItem);
        }
        fs.writeFileSync(indexFile, JSON.stringify(indexList, null, 2), 'utf-8');

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-local-chatbot-history', async (event, { username, threadId }) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const userChatDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'chatbot', safeUser);
        const threadFile = path.join(userChatDir, `thread_${threadId}.json`);
        if (fs.existsSync(threadFile)) {
            const data = JSON.parse(fs.readFileSync(threadFile, 'utf-8'));
            return { success: true, messages: data };
        }
        return { success: false, messages: [] };
    } catch (e) {
        return { success: false, error: e.message, messages: [] };
    }
});

ipcMain.handle('list-local-chatbot-threads', async (event, username) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const userChatDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'chatbot', safeUser);
        const indexFile = path.join(userChatDir, 'threads_index.json');
        if (fs.existsSync(indexFile)) {
            const list = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
            return { success: true, threads: list || [] };
        }
        return { success: true, threads: [] };
    } catch (e) {
        return { success: false, error: e.message, threads: [] };
    }
});

ipcMain.handle('delete-local-chatbot-thread', async (event, { username, threadId }) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const userChatDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'chatbot', safeUser);
        const threadFile = path.join(userChatDir, `thread_${threadId}.json`);
        if (fs.existsSync(threadFile)) {
            fs.unlinkSync(threadFile);
        }

        const indexFile = path.join(userChatDir, 'threads_index.json');
        if (fs.existsSync(indexFile)) {
            let list = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) || [];
            list = list.filter(t => String(t.id) !== String(threadId));
            fs.writeFileSync(indexFile, JSON.stringify(list, null, 2), 'utf-8');
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('clear-all-local-chatbot-threads', async (event, username) => {
    try {
        const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
        const userChatDir = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'chatbot', safeUser);
        if (fs.existsSync(userChatDir)) {
            const files = fs.readdirSync(userChatDir);
            for (const f of files) {
                try { fs.unlinkSync(path.join(userChatDir, f)); } catch (err) {}
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});





