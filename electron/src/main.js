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
    net
} = require("electron");
const { autoUpdater } = require("electron-updater");
const { registerExportImportHandlers } = require("./export-import-project");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { exec, execFile, spawn } = require("child_process");
const os = require("os");
const path = require("path");
const http = require("http");
const fs = require("fs");

// Bắt phím tắt nội bộ thay vì globalShortcut để tránh xung đột với hệ đi�?u hành và app khác
app.on('web-contents-created', (e, webContents) => {
    webContents.on('before-input-event', (event, input) => {
        if (!app.isPackaged) {
            if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i') {
                webContents.toggleDevTools();
                event.preventDefault();
            }
            if (input.key === 'F12') {
                webContents.toggleDevTools();
                event.preventDefault();
            }
        }
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

// ==== QUẢN L�? BINARIES (FFmpeg, YT-DLP, Edge-TTS, Type...) ====
const binaries = {
    ffmpeg: null,
    ytdlp: null,
    edgeTts: null,
    typeLite: null,
    downloader: null
};

function loadBinaries() {
    const isWin = process.platform === "win32";
    let results = [];
    let hasError = false;

    const getPath = (winName, macName, label) => {
        const fileName = isWin ? winName : macName;
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
            results.push(`�?� ${label}: KHÔNG TÌM THẤY tại ${binPath}`);
            return null;
        }
    };

    binaries.ffmpeg = getPath("ffmpeg-win.exe", "ffmpeg-macos", "FFmpeg");
    binaries.ytdlp = getPath("yt-dlp-win.exe", "yt-dlp-macos", "Youtube-DL");
    binaries.edgeTts = getPath("edge-tts-win.exe", "edge-tts-macos", "Edge-TTS");
    binaries.typeLite = getPath("type-lite-win.exe", "type-lite-macos", "Type-Lite");

    if (hasError) {
        dialog.showMessageBox({
            type: 'error',
            title: 'Lỗi Hệ Thống',
            message: 'Phát hiện thiếu file thực thi quan tr�?ng!',
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

            await facebookPage.mouse.wheel({ deltaY: 2000 });
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
    const fallbackPath = path.resolve(__dirname, "..", "fallback");
    fallbackApp.use(express.static(fallbackPath));
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
            <button class="btn" onclick="window.close()">�?óng cửa sổ này</button>
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
                        res.end(getAuthHtml('Lỗi hệ thống', `Không tìm thấy mã xác thực từ Google trả v�?.`, false));
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

                    sendToRenderer("tools-log", "[GSC] �?ăng nhập thành công, đã lưu token.");
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

function killPort(port) {
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

// Trong file main.js
// Thêm tham số width, height vào hàm
function openChromeApp(url, width = 400, height = 800) {
    const targetUrl = url || "http://localhost:7171/";

    if (chromeAppProcess && chromeAppProcess.killed) chromeAppProcess = null;

    if (sttWsClients.size > 0) {
        sendToRenderer("tools-log", `[ChromeApp] �?ang chạy rồi, không mở lại.`);
        return;
    }

    const chromePath = getChromePath();
    if (!chromePath) {
        sendToRenderer(
            "tools-log",
            `[ChromeApp] �?� Không tìm thấy Google Chrome!`,
        );
        return;
    }

    try {
        const userDataDir = path.join(os.tmpdir(), "chrome-stt-" + Date.now());

        const args = [
            `--app=${targetUrl}`,
            // --- THÊM DÒNG NÀY �?Ể CHỈNH K�?CH THƯỚC ---
            `--window-size=${width},${height}`,

            // Nếu muốn chỉnh vị trí xuất hiện (tùy ch�?n):
            // `--window-position=100,100`,

            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            "--test-type",
            "--ignore-certificate-errors",
            "--disable-web-security",
            "--disable-site-isolation-trials",

            // Tắt dịch & popup thừa
            "--disable-features=IsolateOrigins,site-per-process,Translate,OptimizationGuideModelDownloading,OptimizationHints",
            "--disable-translate",

            `--user-data-dir=${userDataDir}`,
            "--autoplay-policy=no-user-gesture-required",
            "--use-fake-ui-for-media-stream",
            "--enable-speech-input",

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
        width: 1440,
        height: 1080,
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
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            preload: resolvePreload(),
        },
    });

    mainWindow.maximize();

    const targetURL = "http://localhost:4200";
    const fallbackURL = `http://localhost:${fallbackPort}`;

    const req = http.get(targetURL, (res) => {
        if (res.statusCode === 200) {
            sendToRenderer("tools-log", "[✓] Angular app đã chạy, loadURL");
            mainWindow.loadURL(targetURL);
        } else {
            sendToRenderer("tools-log", "[!] Không mong muốn, dùng fallback");
            mainWindow.webPreferences.devTools = false; // Tắt devtools cho main window (vẫn mở được bằng shortcut nếu cần)
            loadFallback();
        }
    });

    req.on("error", () => {
        sendToRenderer(
            "tools-log",
            "[x] Không kết nối được Angular → fallback",
        );
        loadFallback();
    });

    function loadFallback() {
        startFallbackServer();
        mainWindow
            .loadURL(fallbackURL)
            .then(() =>
                sendToRenderer(
                    "tools-log",
                    "[Fallback] Load fallback thành công",
                ),
            )
            .catch((err) =>
                sendToRenderer(
                    "tools-log",
                    `[Fallback] Lỗi khi load fallback: ${err.message}`,
                ),
            );
    }

    mainWindow.on("closed", () => {
        mainWindow = null;

        if (downloaderProcess) {
            downloaderProcess.kill("SIGTERM");
            killPort(1133);
        }

        if (typeProcess) {
            typeProcess.kill("SIGTERM");
            killPort(12345);
        }

        if (pdfApiProcess) {
            pdfApiProcess.kill("SIGTERM");
        }
        killPort(48921);
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

    Menu.setApplicationMenu(
        Menu.buildFromTemplate([
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
    );
}

// ==== TARGET WINDOW ====
function createTargetWindow(
    url,
    callback,
    uniqueID,
    winWidth = 1000,
    winHeight = 800,
) {
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.close();
    }

    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workArea;

    const finalWidth = Math.min(winWidth, Math.floor(screenW * 0.95));
    const finalHeight = Math.min(winHeight, Math.floor(screenH * 0.95));
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
        title: "Công cụ AI",
        show: true, // show sau khi ready-to-show
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
    currentWin.on("closed", () => {
        if (targetWindow === currentWin) {
            targetWindow = null;
        }
    });

    return targetWindow;
}

// --- thêm forward debug từ preload v�? UI (đặt trong app.whenReady() sau createMainWindow()) ---
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

/**
 * Hàm sinh audio từ Edge TTS bằng WebSocket thuần.
 * Không cần cài Python, không cần edge-tts cli.
 */
async function generateEdgeAudioByExe(text, voice, outputPath, subPath, rate, pitch) {
    return new Promise((resolve, reject) => {
        const exePath = binaries.edgeTts;
        if (!exePath) {
            return reject(new Error("Không tìm thấy file Edge TTS Core!"));
        }

        const args = [
            `--text=${text}`,
            `--voice=${voice}`,
            `--output=${outputPath}`,
            `--rate=${rate || "+0%"}`,
            `--pitch=${pitch || "+0Hz"}`,
            `--write-subtitles=${subPath}`
        ];

        sendToRenderer("tools-log", `[TTS-Exe] Executing: ${exePath} ...`);

        execFile(exePath, args, (error, stdout, stderr) => {
            if (error) {
                let errorMsg = stderr || error.message;
                if (errorMsg.includes("No audio was received") && voice === "vi-VN-NamMinhNeural") {
                    errorMsg = "Gi�?ng đ�?c Nam Minh của Microsoft bị giới hạn độ dài ký tự rất ngắn (dưới 80 ký tự/câu). Vui lòng ngắt đoạn text này thành nhi�?u phần ngắn hơn, hoặc đổi sang gi�?ng Hoài My để đ�?c các đoạn dài liên tục.";
                }
                sendToRenderer("tools-log", `[TTS-Exe] Error: ${errorMsg}`);
                return reject(new Error(errorMsg));
            }
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
            event.sender.send('pdf-analysis-progress', '�?ang gửi trực tiếp file PDF lên hệ thống AI...');
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
            // Loại b�? markdown code block nếu có
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
ipcMain.handle('select-local-file', async (event, { filePath, customDir }) => {
    try {
        const fileName = path.basename(filePath);
        const docPath = app.getPath("documents");
        const dataDir = path.join(docPath, "ai.type", "data");

        // Nếu file đã nằm trong thư mục data của app rồi thì không cần copy
        const normalizedFilePath = path.normalize(filePath);
        const normalizedDataDir = path.normalize(dataDir);
        if (normalizedFilePath.startsWith(normalizedDataDir)) {
            console.log(`File already in data dir, skipping copy: ${filePath}`);
            return `file://${path.resolve(filePath)}`;
        }

        // Tạo một tên file duy nhất để tránh bị trùng (ví dụ: timestamp_filename)
        const uniqueFileName = `${Date.now()}_${fileName}`;

        let destinationPath;
        if (customDir) {
            const saveDir = path.join(docPath, "ai.type", "data", customDir);
            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }
            destinationPath = path.join(saveDir, uniqueFileName);
        } else {
            destinationPath = path.join(uploadsDir, uniqueFileName);
        }

        // Copy file từ đư�?ng dẫn gốc sang thư mục uploads/custom của app
        fs.copyFileSync(filePath, destinationPath);

        console.log(`File copied from ${filePath} to ${destinationPath}`);

        // Trả v�? đư�?ng dẫn mới v�? Renderer process.
        return `file://${path.resolve(destinationPath)}`;
    } catch (error) {
        console.error('Error selecting file:', error);
        throw error; // Gửi lỗi v�? Renderer process
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

ipcMain.on("app:relaunch", () => {
    // Thiết lập ứng dụng sẽ mở lại sau khi đóng
    app.relaunch();
    // Thoát ứng dụng hiện tại ngay lập tức
    app.exit(0);
});

// main.js (Phần xử lý ipcMain save-base64)
ipcMain.handle("save-base64", async (event, args) => {
    // Thêm username vào destructuring
    const { base64, fileName, folder, username, customDir } = args;

    const docPath = app.getPath("documents");

    let saveDir;
    if (customDir) {
        saveDir = path.join(docPath, "ai.type", "data", customDir);
    } else {
        // SỬA �?ƯỜNG DẪN: Thêm username vào cuối đư�?ng dẫn
        // Ví dụ: .../uploads/thumbnails/admin/
        saveDir = path.join(
            docPath,
            "ai.type",
            "data",
            "uploads",
            folder || "thumbnails",
            username || "default",
        );
    }

    // Tạo thư mục (recursive: true sẽ tạo cả thư mục username nếu chưa có)
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }

    const filePath = path.join(saveDir, fileName);
    const buffer = Buffer.from(base64, "base64");

    try {
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
    } catch (e) {
        console.error(e);
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

        function loadVideo(url) {
            log('▶�? �?ang tải nguồn: ' + url, 'info');
            if(hls) { hls.destroy(); hls = null; }

            if (Hls.isSupported()) {
                hls = new Hls({ debug: false, enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('✅ �?ã nhận tín hiệu Video', 'info');
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

app.whenReady().then(async () => {
    startCrmServices();
    const resolveMediaPath = (originalUrl) => {
        let targetPath = '';
        let url = decodeURIComponent(originalUrl);

        // Chromium với standard:true sẽ normalize URL:
        //   media://AUTO_FIND/xxx  ->  media://auto_find/xxx   (lowercase hostname)
        //   media:///C:/path       ->  media://c/path          (C: bị mất dấu hai chấm)
        // Nên ta cần so khớp case-insensitive

        if (url.toLowerCase().startsWith('smart_find/')) {
            const queryString = url.substring(url.indexOf('?') + 1);
            const params = new URLSearchParams(queryString);
            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\/\//i, '');
            const mediaDir = params.get('dir') || '';
            const uuid = params.get('uuid') || 'default';

            // Rút trích basename, b�? timestamp prefix nếu có
            let basename = originalPath ? require('path').basename(originalPath).replace(/^\d{13}_/, '') : '';

            // Khôi phục drive letter bị Chromium lowercase
            let testPath = originalPath;
            if (testPath) {
                const dm = testPath.match(/^([a-zA-Z])(:?)([\\/])/);
                if (dm && !dm[2]) {
                    testPath = dm[1].toUpperCase() + ':' + testPath.substring(1);
                }
                if (fs.existsSync(testPath)) return testPath;
                // Thử với basename gốc (chưa strip timestamp)
                const rawBasename = require('path').basename(originalPath);
                if (rawBasename !== basename) {
                    const rawDir = require('path').dirname(testPath);
                    const rawPath = require('path').join(rawDir, rawBasename);
                    if (fs.existsSync(rawPath)) return rawPath;
                }
            }

            const docPath = app.getPath('documents');
            const ttsAdminDir = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin');

            // Chiến lược tìm kiếm theo thứ tự ưu tiên:
            const searchDirs = [];

            // 1. mediaDir (nếu có)
            if (mediaDir) searchDirs.push(mediaDir);

            // 2. Thư mục uuid hiện tại
            searchDirs.push(require('path').join(ttsAdminDir, uuid));

            // 3. Tất cả thư mục project khác trong tts/admin/
            if (fs.existsSync(ttsAdminDir)) {
                try {
                    const allDirs = fs.readdirSync(ttsAdminDir, { withFileTypes: true })
                        .filter(d => d.isDirectory() && d.name !== uuid)
                        .map(d => require('path').join(ttsAdminDir, d.name));
                    searchDirs.push(...allDirs);
                } catch (e) { /* ignore */ }
            }

            // 4. Thư mục uploads
            searchDirs.push(uploadsDir);

            // Quét từng thư mục
            for (const dir of searchDirs) {
                if (!fs.existsSync(dir)) continue;

                // Thử trực tiếp
                const directPath = require('path').join(dir, basename);
                if (fs.existsSync(directPath)) return directPath;

                // Thử tìm file có timestamp prefix (ví dụ: 1779705618490_s1p3.mp4)
                try {
                    const files = fs.readdirSync(dir);
                    const match = files.find(f => f.endsWith(`_${basename}`) || f === basename);
                    if (match) return require('path').join(dir, match);
                } catch (e) { /* ignore */ }
            }

            // Fallback cuối: trả v�? path mặc định (dù có thể không tồn tại)
            targetPath = require('path').join(ttsAdminDir, uuid, basename);
            return targetPath;
        } else if (url.toLowerCase().startsWith('auto_find/')) {
            // Cắt b�? phần "auto_find/" (case-insensitive)
            const rest = url.substring('auto_find/'.length);
            const parts = rest.split('/');
            const uuid = parts[0];
            const basename = parts.slice(1).join('/');
            const docPath = app.getPath('documents');
            targetPath = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin', uuid, basename);
        } else {
            // Xử lý đư�?ng dẫn ổ đĩa bị Chromium bóp méo
            // "c/Users/..." -> "C:/Users/..."
            // "/c/Users/..." -> "C:/Users/..."
            // "/C:/Users/..." -> "C:/Users/..."
            let cleaned = url;
            // B�? dấu / đầu nếu có
            if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
            // Khôi phục drive letter: "c/Users" -> "C:/Users"
            const driveMatch = cleaned.match(/^([a-zA-Z])(:?)\//);
            if (driveMatch) {
                const driveLetter = driveMatch[1].toUpperCase();
                // Nếu đã có dấu hai chấm (C:/) thì giữ, nếu không (c/) thì thêm vào
                if (driveMatch[2] === ':') {
                    cleaned = driveLetter + cleaned.substring(1);
                } else {
                    cleaned = driveLetter + ':' + cleaned.substring(1);
                }
            } else {
                // Trên macOS/Linux: Khôi phục dấu / ở đầu để tạo thành absolute path
                cleaned = '/' + cleaned;
            }
            targetPath = cleaned;
        }

        targetPath = require('path').normalize(targetPath);

        // Fallback: tìm file có timestamp prefix
        if (!fs.existsSync(targetPath)) {
            const dir = require('path').dirname(targetPath);
            const base = require('path').basename(targetPath);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir);
                const match = files.find(f => f.endsWith(`_${base}`) || f === base);
                if (match) {
                    targetPath = require('path').join(dir, match);
                }
            }
        }
        return targetPath;
    };

    // Native file protocol cho <img>, <video>, <audio> (Hỗ trợ stream, seeking hoàn hảo)
    protocol.registerFileProtocol('media', (request, callback) => {
        try {
            const url = request.url.replace('media://', '');
            const targetPath = resolveMediaPath(url);
            console.log('[Media Protocol - File]', request.url, '-> targetPath:', targetPath);
            return callback({ path: targetPath });
        } catch (error) {
            console.error('Lỗi protocol media:', error);
            return callback({ error: -2 }); // -2 is FAILED
        }
    });

    // Custom protocol cho Wavesurfer dùng fetch() (cần CORS)
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

    if (binaries.typeLite) {
        typeProcess = execFile(binaries.typeLite, [], (err, stdout, stderr) => {
            if (err) sendToRenderer("tools-log", `�?� Type lỗi: ${err}`);
            if (stdout) sendToRenderer("tools-log", `📥 Type: ${stdout}`);
            if (stderr) sendToRenderer("tools-log", `⚠�? Type stderr: ${stderr}`);
        });
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

            // Bổ sung menu chuột phải cho webview
            contents.on('context-menu', (event, params) => {
                const { Menu } = require('electron');
                const template = [];

                if (params.linkURL) {
                    template.push({
                        label: 'Copy Link',
                        click: () => {
                            const { clipboard } = require('electron');
                            clipboard.writeText(params.linkURL);
                        }
                    });
                }

                if (params.hasImageContents) {
                    template.push({ role: 'copyImage', label: 'Copy Image' });
                }

                if (params.editFlags.canCopy) {
                    template.push({ role: 'copy', label: 'Copy' });
                }
                if (params.editFlags.canPaste) {
                    template.push({ role: 'paste', label: 'Paste' });
                }
                if (params.editFlags.canCut) {
                    template.push({ role: 'cut', label: 'Cut' });
                }
                if (params.editFlags.canSelectAll) {
                    template.push({ role: 'selectAll', label: 'Select All' });
                }

                if (template.length > 0) {
                    template.push({ type: 'separator' });
                }

                template.push({
                    label: 'Reload',
                    click: () => { contents.reload(); }
                });
                template.push({
                    label: 'Inspect Element',
                    click: () => { contents.inspectElement(params.x, params.y); }
                });

                const menu = Menu.buildFromTemplate(template);
                menu.popup();
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
                return { action: 'allow' };
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
    // ===== EXTRACT VIDEO FRAMES IPC =====
    ipcMain.handle("extract-video-frames", async (_event, videoPath) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("Không tìm thấy FFmpeg"));
            }
            try {
                const videoPathDecoded = videoPath.replace('file://', '');
                const stats = fs.statSync(videoPathDecoded);
                const fileSize = stats.size;
                const baseName = path.basename(videoPathDecoded, path.extname(videoPathDecoded)).replace(/[^a-zA-Z0-9_-]/g, '_');
                const cacheDirName = `_frames_${baseName}_${fileSize}`;

                const downloadsPath = app.getPath('downloads');
                const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
                if (!fs.existsSync(aiTypingDir)) {
                    fs.mkdirSync(aiTypingDir, { recursive: true });
                }

                const tempDir = path.join(aiTypingDir, cacheDirName);

                // Caching logic
                if (fs.existsSync(tempDir)) {
                    const allFiles = fs.readdirSync(tempDir);
                    const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();
                    if (frameFiles.length > 0) {
                        sendToRenderer("tools-log", `[FFmpeg] Sử dụng lại frames đã trích xuất: ${tempDir}`);
                        const framePaths = frameFiles.map(f => path.join(tempDir, f));
                        return resolve({ success: true, paths: framePaths });
                    }
                } else {
                    fs.mkdirSync(tempDir, { recursive: true });
                }

                const framePattern = path.join(tempDir, 'frame_%03d.jpg');
                const ffmpegPath = binaries.ffmpeg;
                const args = [
                    "-y",
                    "-i", videoPath,
                    "-vf", "fps=1,scale=720:-1",
                    "-q:v", "2",
                    framePattern
                ];

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
                        resolve({ success: true, paths: framePaths });
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

    // ===== EXTRACT AUDIO IPC =====
    ipcMain.handle("extract-audio", async (_event, videoPath) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("Không tìm thấy FFmpeg"));
            }
            try {
                const audioDir = path.dirname(videoPath);
                const ext = path.extname(videoPath);
                const baseName = path.basename(videoPath, ext);
                const outputFileName = `${baseName}_audio.mp3`;
                const outputPath = path.join(audioDir, outputFileName);

                const ffmpegPath = binaries.ffmpeg;
                const args = [
                    "-i", videoPath,
                    "-vn", // No video
                    "-acodec", "libmp3lame",
                    "-q:a", "2", // Good quality
                    "-y", // Overwrite
                    outputPath
                ];

                sendToRenderer("tools-log", `[FFmpeg] Tách audio: ${args.join(" ")}`);
                const child = spawn(ffmpegPath, args);

                let stderrOutput = "";
                child.stderr.on("data", (data) => {
                    stderrOutput += data.toString();
                });

                child.on("close", (code) => {
                    if (code === 0) {
                        resolve(outputPath);
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

            const res = await webmasters.searchanalytics.query({
                siteUrl: site,
                requestBody,
            });

            const rows = res.data.rows || [];

            sendToRenderer(
                "tools-log",
                `[GSC] Query OK (mode=${mode || "detail"}), rows=${rows.length}`,
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
                                    await new Promise((r) => setTimeout(r, 3500)); // �?ợi lâu chút để ảnh kịp load

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
                                    `[TikTok] �?� Lỗi: ${err.message}`,
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

                    // G�?i hàm với tham số mới
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
                    // Chúng ta sẽ g�?i zaloCrawlDirect ngay tại đó.
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

    // (�?ã chuyển web-contents-created lên đầu file)

    globalShortcut.register("CommandOrControl+C+G", () => {
        if (targetWindow) targetWindow.close();
    });

    globalShortcut.register("CommandOrControl+Shift+N", () => {
        createMainWindow();
    });

    globalShortcut.register("CommandOrControl+Shift+L", () => {
        if (mainWindow) {
            mainWindow.webContents.send("tools-response", { action: "toggle-gemini-webview" });
        }
    });

    // Tắt phím tắt global CTRL+SHIFT+R để tránh xung đột
    // Tính năng refresh được xử lý qua Menu "Hiển thị" (View Menu)

    // ==========================================
    // AUTO UPDATER (CẬP NHẬT TỰ �?ỘNG)
    // ==========================================
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        sendToRenderer("tools-log", '[AutoUpdate] �?ang kiểm tra phiên bản mới...');
    });

    autoUpdater.on('update-available', (info) => {
        sendToRenderer("tools-log", `[AutoUpdate] T�m th?y phi�n b?n m?i: ${info.version}`);
        dialog.showMessageBox({
            type: 'info',
            title: 'C?p nh?t',
            message: `?� c� phi�n b?n m?i (${info.version}). B?n c� mu?n t?i v? kh�ng?`,
            buttons: ['T?i c?p nh?t', '?? sau']
        }).then((result) => {
            if (result.response === 0) {
                sendToRenderer("tools-log", '[AutoUpdate] ?ang b?t ??u t?i...');
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on('update-not-available', (info) => {
        sendToRenderer("tools-log", '[AutoUpdate] Bạn đang dùng phiên bản mới nhất.');
    });

    autoUpdater.on('error', (err) => {
        sendToRenderer("tools-log", `[AutoUpdate] L?i ki?m tra c?p nh?t: ${err.message}`);
        if (mainWindow && mainWindow.webContents) {
            let safeError = (err.message || '').replace(/'/g, '"').replace(/\n/g, ' ');
            mainWindow.webContents.executeJavaScript(`
                (function(){
                    let div = document.getElementById('auto-update-progress-overlay');
                    if (div) { 
                        div.innerHTML = "<b>? L?i t?i c?p nh?t!</b><br><span style='font-size:12px;color:red;'>${safeError}</span><br><br>Vui l�ng ki?m tra l?i file latest.yml v� file .exe tr�n server xem m� hash ?� kh?p ch?a."; 
                    }
                })();
            `).catch(e=>e);
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const speed = Math.round(progressObj.bytesPerSecond / 1024);
        const percent = Math.round(progressObj.percent);
        sendToRenderer("tools-log", `[AutoUpdate] T?c ?? t?i: ${speed}KB/s - ?� t?i ${percent}%`);
        
        if (mainWindow && mainWindow.webContents) {
            mainWindow.setProgressBar(progressObj.percent / 100);
            mainWindow.webContents.executeJavaScript(`
                (function() {
                    let div = document.getElementById('auto-update-progress-overlay');
                    if (!div) {
                        div = document.createElement('div');
                        div.id = 'auto-update-progress-overlay';
                        div.style.cssText = 'position:fixed; bottom:20px; right:20px; width:320px; background:rgba(255,255,255,0.95); border:1px solid #ddd; box-shadow:0 4px 15px rgba(0,0,0,0.2); z-index:99999999; padding:15px; border-radius:8px; font-family:sans-serif; color:#333; transition: all 0.3s ease;';
                        div.innerHTML = "<b>? ?ang t?i b?n c?p nh?t m?i...</b><br><div style='width:100%;background:#e0e0e0;border-radius:5px;margin-top:12px;height:12px;overflow:hidden;'><div id='auto-update-progress-bar' style='width:0%;height:100%;background:#007bff;transition:width 0.2s;'></div></div><div id='auto-update-text' style='margin-top:8px;font-size:13px;text-align:right;color:#555;'>0%</div>";
                        document.body.appendChild(div);
                    }
                    document.getElementById('auto-update-progress-bar').style.width = '${percent}%';
                    document.getElementById('auto-update-text').innerText = 'T?c ??: ${speed} KB/s - ?� t?i: ${percent}%';
                })();
            `).catch(err => console.log('inject error', err));
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendToRenderer("tools-log", '[AutoUpdate] T?i ho�n t?t! ?ng d?ng s? ???c c?p nh?t.');
        if (mainWindow) {
            mainWindow.setProgressBar(-1);
            mainWindow.webContents.executeJavaScript(`
                let div = document.getElementById('auto-update-progress-overlay');
                if (div) { div.style.display = 'none'; }
            `).catch(e=>e);
        }
        dialog.showMessageBox({
            type: 'info',
            title: 'C?p nh?t ph?n m?m',
            message: `?� t?i xong phi�n b?n m?i (${info.version}). B?n c� mu?n c�i ??t v� kh?i ??ng l?i ngay b�y gi??`,
            buttons: ['C�i ??t ngay', '?? sau']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    // Bắt buộc cấu hình URL cho môi trư�?ng dev để test
    if (!app.isPackaged) {
        try {
            const pkg = require(require('path').join(__dirname, '..', 'package.json'));
            app.getVersion = () => pkg.version; // Ép app đ�?c đúng version từ package.json thay vì version của lõi Electron
        } catch (e) { }

        autoUpdater.forceDevUpdateConfig = true;
        autoUpdater.setFeedURL("https://ai.type.vn/phan-mem/");
    }

    // Bắt đầu kiểm tra cập nhật ngay cả trong Dev
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        sendToRenderer("tools-log", `[AutoUpdate] Lỗi khi chạy updater: ${err.message}`);
    });
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
        sendToRenderer(
            "tools-log",
            `[GA4] Lỗi: ${(err && err.message) || String(err)}`,
        );
        return {
            success: false,
            error: err.message || String(err),
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
            sendToRenderer("tools-log", "[Zalo-Direct] ⚠�? " + result.error);
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

    // �?ổi gạch chéo thành gạch chéo ngược chuẩn của Windows
    if (process.platform === 'win32') {
        p = p.replace(/\//g, '\\');
    }

    return p;
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
        // BƯỚC 1: POST yêu cầu tạo Audio với đầy đủ các trư�?ng bắt buộc
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

ipcMain.handle("tts-type-generate", async (event, payload) => {
    const { text, voice_id, speed, ref_audio_name, ref_text, num_step, filename, username } = payload;

    // �?ịnh nghĩa Base URL của API
    const API_BASE_URL = "https://tts.type.vn";

    try {
        // BƯỚC 1: POST yêu cầu lên endpoint _async để lấy task_id
        sendToRenderer("tools-log", `[Type TTS] �?ang gửi yêu cầu tạo audio cho: ${filename}...`);

        const postRes = await fetch(`${API_BASE_URL}/generate_audio_async`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "text": text,
                "ref_audio_name": ref_audio_name,
                "ref_text": ref_text,
                "speed": speed || 1.0,
                "num_step": num_step || 16
            })
        });

        if (!postRes.ok) throw new Error(`HTTP Error: ${postRes.status}`);
        const postData = await postRes.json();
        const taskId = postData.task_id;

        if (!taskId) throw new Error("API không trả v�? Task ID");

        // BỎ TASK ID VÀO SỔ THEO DÕI
        if (taskId) activeTtsTasks.add(taskId);

        // BƯỚC 2: Polling (H�?i thăm) xem file đã xong chưa
        sendToRenderer("tools-log", `[Type TTS] �?ang xử lý Audio (Task ID: ${taskId})...`);

        let downloadPath = "";
        let attempts = 0;

        while (attempts < 900) { // Tăng Timeout lên 30 phút (1800 giây) để cho máy chủ thảnh thơi xử lý
            // === THÊM �?OẠN NÀY ===
            // Nếu taskId đã bị hàm cancel-tts xóa kh�?i sổ, lập tức dừng vòng lặp
            if (!activeTtsTasks.has(taskId)) {
                throw new Error("Task đã bị hủy bởi ngư�?i dùng.");
            }
            // =====================

            const statusRes = await fetch(`${API_BASE_URL}/status/${taskId}`);
            const statusData = await statusRes.json();

            // Cập nhật thêm việc bắt trạng thái cancelled từ server (nếu có)
            if (statusData.status === "done") {
                downloadPath = statusData.download_url;
                break;
            } else if (statusData.status === "error" || statusData.status === "cancelled") {
                throw new Error(statusData.message || "Quá trình tạo audio đã bị dừng hoặc lỗi.");
            }

            // Ch�? 2 giây trước khi h�?i lại
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!downloadPath) throw new Error("Quá th�?i gian ch�? (Timeout) - API chạy quá lâu.");

        // BƯỚC 3: Tải file audio v�? máy tính
        sendToRenderer("tools-log", `[Type TTS] �?ã xử lý xong, đang tải file v�?...`);

        // KHI NÀO TẢI XONG FILE, XÓA TASK KHỎI SỔ
        activeTtsTasks.delete(taskId);

        const fileRes = await fetch(`${API_BASE_URL}${downloadPath}`);
        if (!fileRes.ok) throw new Error("Không thể tải file âm thanh từ server.");

        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Thiết lập đư�?ng dẫn lưu cục bộ
        const documentsPath = app.getPath("documents");
        const saveDir = path.join(documentsPath, "ai.type", "data", "tts", username || "default");

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const safeFilename = filename.endsWith(".wav") ? filename : `${filename}.wav`;
        const filePath = path.join(saveDir, safeFilename);

        // Ghi file
        fs.writeFileSync(filePath, buffer);

        sendToRenderer("tools-log", `[Type TTS] ✅ �?ã lưu file thành công tại: ${filePath}`);

        return {
            success: true,
            filePath: filePath
        };

    } catch (error) {
        console.error("Type TTS Error:", error);
        sendToRenderer("tools-log", `[Type TTS] �?� Lỗi: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// 2. THÊM CỔNG MỚI �?Ể NHẬN LỆNH HỦY TỪ ANGULAR
ipcMain.handle('cancel-tts', async (event) => {
    console.log('Nhận lệnh hủy từ UI. �?ang hủy các task:', Array.from(activeTtsTasks));

    const cancelPromises = [];

    // Duyệt qua tất cả các task đang chạy ngầm và g�?i API hủy
    for (const taskId of activeTtsTasks) {
        cancelPromises.push(
            fetch(`https://tts.type.vn/cancel_task/${taskId}`, { method: 'POST' })
                .catch(err => console.log(`Lỗi hủy task ${taskId}:`, err.message))
        );
    }

    // �?ợi gửi lệnh hủy xong
    await Promise.all(cancelPromises);

    // Xóa sạch sổ
    activeTtsTasks.clear();
    return { success: true };
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

        for (let url of urls) {
            // Tải best video & audio
            const args = [
                '-o', outputTemplate,
                '--newline',
                '--no-warnings',
                '--rm-cache-dir',
                '--js-runtimes', 'node',
                '--extractor-args', 'youtube:player_client=ios,android,web',
                '-f', 'bestvideo+bestaudio/best'
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

            await new Promise((resolve, reject) => {
                const child = spawn(ytdlpPath, args);

                child.stdout.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) sendToRenderer("tools-log", `[Download] ${line}`);
                });

                child.stderr.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) sendToRenderer("tools-log", `[Download] ${line}`);
                });

                child.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Thất bại với mã thoát: ${code}`));
                });
            });
        }

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

            sendToRenderer("tools-log", `[AI Analyze] Đang tải video từ YouTube để phân tích...`);

            const ytdlpArgs = [
                '-o', outputTemplate,
                '--newline',
                '--no-warnings',
                '--rm-cache-dir',
                '--ignore-errors',
                '--js-runtimes', 'node',
                '--extractor-args', 'youtube:player_client=ios,android,web',
                '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
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
        const interval = parseFloat(extractInterval) || 1;
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
        const videoPathDecoded = videoPath.replace('file://', '');
        if (!fs.existsSync(videoPathDecoded)) return { success: false, error: 'Video file not found: ' + videoPathDecoded };

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const imgDir = path.dirname(videoPathDecoded);
        const ext = path.extname(videoPathDecoded);
        const baseName = path.basename(videoPathDecoded, ext);
        const outputPath = path.join(imgDir, `${baseName}_last_frame.png`);

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
