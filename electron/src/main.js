const {
    app,
    protocol,
    BrowserWindow,
    Menu,
    globalShortcut,
    screen,
    session,
    ipcMain,
    dialog, // <--- ThÃªm cÃ¡i nÃ y vÃ o
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

// Báº¯t phÃ­m táº¯t ná»™i bá»™ thay vÃ¬ globalShortcut Ä‘á»ƒ trÃ¡nh xung Ä‘á»™t vá»›i há»‡ Ä‘iá»u hÃ nh vÃ  app khÃ¡c
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

// Cá» xÃ¡c Ä‘á»‹nh cÃ³ Ä‘ang á»Ÿ cháº¿ Ä‘á»™ dev hay khÃ´ng
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
const { version } = require("./../package.json"); // Láº¥y version tá»« file package.json

// KhÃ´ng set cá»©ng User Agent á»Ÿ Ä‘Ã¢y ná»¯a, sáº½ tá»± Ä‘á»™ng bÃ³c tÃ¡ch tá»« Chromium gá»‘c á»Ÿ bÆ°á»›c khi App Ä‘Ã£ Ready

let serviceProcess = null;
const uploadsDir = path.join(app.getPath('userData'), 'uploads');

// Táº¡o thÆ° má»¥c náº¿u nÃ³ chÆ°a tá»“n táº¡i
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

// ==== QUáº¢N LÃ BINARIES (FFmpeg, YT-DLP, Edge-TTS, Type...) ====
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
            // Khi Ä‘Ã£ Ä‘Ã³ng gÃ³i, file náº±m tháº³ng trong thÆ° má»¥c resources
            binPath = path.join(process.resourcesPath, fileName);
        } else {
            // Khi cháº¡y DEV (npm start)
            binPath = path.resolve(__dirname, "..", fileName);
        }

        if (fs.existsSync(binPath)) {
            if (!isWin) {
                try { fs.chmodSync(binPath, "755"); } catch (e) { }
            }
            return binPath;
        } else {
            hasError = true;
            results.push(`âŒ ${label}: KHÃ”NG TÃŒM THáº¤Y táº¡i ${binPath}`);
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
            title: 'Lá»—i Há»‡ Thá»‘ng',
            message: 'PhÃ¡t hiá»‡n thiáº¿u file thá»±c thi quan trá»ng!',
            detail: results.join("\n"),
            buttons: ['OK']
        });
    }
}

function sendNotification(title, body) {
    // Kiá»ƒm tra xem há»‡ thá»‘ng cÃ³ há»— trá»£ thÃ´ng bÃ¡o khÃ´ng
    if (Notification.isSupported()) {
        new Notification({
            title: title,
            body: body,
            // icon: path.join(__dirname, 'assets/icon.png') // ThÃªm icon náº¿u muá»‘n
        }).show();
    } else {
        // Fallback sang log náº¿u khÃ´ng há»— trá»£
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
            "ChÆ°a cáº¥u hÃ¬nh ADS_CLIENT_ID / ADS_CLIENT_SECRET / ADS_REFRESH_TOKEN",
        );
    }
    if (!ADS_DEVELOPER_TOKEN) {
        throw new Error("ChÆ°a cáº¥u hÃ¬nh ADS_DEVELOPER_TOKEN");
    }
    if (!customerId) {
        throw new Error("Thiáº¿u ADS_CUSTOMER_ID");
    }
    if (!keywordText) {
        throw new Error("Thiáº¿u keywordText");
    }

    const { token } = await adsOauthClient.getAccessToken();
    if (!token) {
        throw new Error("KhÃ´ng láº¥y Ä‘Æ°á»£c access token cho Google Ads");
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
                                `Google Ads API tráº£ vá» body rá»—ng (status ${res.statusCode})`,
                            ),
                        );
                    }

                    const contentType = (
                        res.headers["content-type"] || ""
                    ).toLowerCase();

                    if (!contentType.includes("application/json")) {
                        return reject(
                            new Error(
                                `Google Ads API tráº£ vá» ná»™i dung khÃ´ng pháº£i JSON (status ${res.statusCode}). ` +
                                `CÃ³ thá»ƒ Developer Token / tÃ i khoáº£n chÆ°a Ä‘Æ°á»£c báº­t API. Preview: ${raw.slice(0, 200)}`,
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
                                `KhÃ´ng parse Ä‘Æ°á»£c JSON tá»« Google Ads API (status ${res.statusCode}). Body: ${raw.slice(0, 200)}`,
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

    // XÃ¡c Ä‘á»‹nh tÃªn file dá»±a trÃªn OS
    const binName =
        platform === "win32" ? "gologin-core-win.exe" : "gologin-core-macos";

    // ÄÆ°á»ng dáº«n linh hoáº¡t: dev lÃ¹i ra ngoÃ i src/, packaged láº¥y tá»« Resources
    const binPath = isPackaged
        ? path.join(process.resourcesPath, binName)
        : path.join(__dirname, "..", "services", binName);

    sendToRenderer("tools-log", `[DEBUG]: Khá»Ÿi cháº¡y core táº¡i ${binPath}`);

    if (!fs.existsSync(binPath)) {
        sendToRenderer(
            "tools-log",
            `[ERROR]: KhÃ´ng tÃ¬m tháº¥y binary: ${binName}`,
        );
        return;
    }

    // Cáº¥p quyá»n thá»±c thi (chá»‰ cáº§n thiáº¿t cho macOS)
    if (platform !== "win32") {
        try {
            fs.chmodSync(binPath, "755");
        } catch (e) {
            console.error("Lá»—i cáº¥p quyá»n macOS:", e);
        }
    }

    // Khá»Ÿi cháº¡y tiáº¿n trÃ¬nh
    serviceProcess = spawn(binPath, [], {
        cwd: path.dirname(binPath),
        stdio: ["inherit", "pipe", "pipe"],
    });

    serviceProcess.stdout.on("data", (data) => {
        const msg = data.toString();
        sendToRenderer("tools-log", `[CORE]: ${msg}`);
        if (msg.includes("GO-SERVICE-READY")) {
            sendToRenderer("tools-log", `[SYSTEM]: Core Engine Ä‘Ã£ sáºµn sÃ ng.`);
        }
    });

    serviceProcess.stderr.on("data", (data) => {
        sendToRenderer("tools-log", `[CORE-ERROR]: ${data.toString()}`);
    });
}

// ================= DOWNLOAD CORE =================

// Cáº­p nháº­t hÃ m phá»¥ nÃ y Ä‘á»ƒ Ä‘oÃ¡n Ä‘uÃ´i file chÃ­nh xÃ¡c
function inferExtFromUrl(url) {
    try {
        const u = new URL(url);
        // Kiá»ƒm tra link video Capcut/Dreamina
        if (u.href.includes('video/tos') || u.href.includes('mime_type=video_mp4')) {
            return '.mp4';
        }

        // Logic cÅ© cá»§a báº¡n cho áº£nh
        const base = path.basename(u.pathname);
        const m = base.match(/\.(webp|jpg|jpeg|png|gif|avif|mp4)$/i);
        if (m) return "." + m[1].toLowerCase();
    } catch { }
    return ".jpg";
}

// 2. HÃ m download giá»¯ nguyÃªn tÃªn, nhÆ°ng xá»­ lÃ½ Ä‘Æ°á»£c má»i loáº¡i file binary
function downloadImage(url, outDir, filenamePrefix = "dreamina_") {
    return new Promise(async (resolve, reject) => {
        try {
            await fs.promises.mkdir(outDir, { recursive: true });

            // Logic nháº­n diá»‡n Ä‘uÃ´i file má»Ÿ rá»™ng
            let ext = ".jpg";
            try {
                const u = new URL(url);
                // Kiá»ƒm tra náº¿u lÃ  link video tá»« Capcut/Dreamina
                if (u.href.includes('mime_type=video_mp4') || u.pathname.endsWith('.mp4')) {
                    ext = '.mp4';
                } else {
                    // DÃ¹ng hÃ m infer cá»§a báº¡n cho cÃ¡c trÆ°á»ng há»£p áº£nh
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
                    // Xá»­ lÃ½ Redirect (náº¿u cÃ³)
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
// FULL CODE hÃ m createImageByDreamina (giá»¯ nguyÃªn tÃªn)
function createImageByDreamina(_targetUrlWithUniqueID, uniqueID, options = {}) {
    const outDir = options.outDir || path.join(app.getPath("pictures"), "Dreamina");
    const maxImages = Number.isFinite(options.maxImages) ? options.maxImages : 100;
    const filenamePrefix = options.filenamePrefix || "dreamina_";

    if (!targetWindow || targetWindow.isDestroyed()) return;

    // --- Tá»± Ä‘á»™ng Paste Prompt ---
    if (options.prompt) {
        const safePrompt = options.prompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        targetWindow.webContents.executeJavaScript(`
            setTimeout(() => {
                const editor = document.querySelector('rich-textarea') || document.querySelector('p[data-placeholder]')?.parentElement || document.querySelector('div[contenteditable="true"]');
                if (editor) {
                    editor.focus();
                    document.execCommand('insertText', false, \`${safePrompt}\`);
                    
                    // Thá»­ tÃ¬m nÃºt Send vÃ  áº¥n tá»± Ä‘á»™ng luÃ´n sau 1 giÃ¢y
                    setTimeout(() => {
                        const sendBtn = document.querySelector('button[aria-label*="Send message"], button[aria-label*="Gá»­i tin nháº¯n"], button.send-button');
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
            // downloadImage sáº½ tá»± dÃ¹ng inferExtFromUrl Ä‘á»ƒ lÆ°u .mp4 hoáº·c .jpg
            const p = await downloadImage(src, outDir, filenamePrefix);
            saved += 1;

            const isVid = p.toLowerCase().endsWith('.mp4');
            sendToRenderer("tools-log", `[Dreamina] ${isVid ? 'ðŸŽ¬ Video' : 'âœ… áº¢nh'} Ä‘Ã£ táº£i: ${path.basename(p)}`);

            // Gá»­i action dreamina-downloaded Ä‘á»ƒ Renderer gáº¯n ngÆ°á»£c láº¡i chÆ°Æ¡ng trÃ¬nh
            _evt.reply("tools-response", { action: "dreamina-downloaded", file: p, isVid });
        } catch (e) {
            sendToRenderer("tools-log", `[Dreamina] âŒ Lá»—i: ${e.message}`);
        }
    };

    ipcMain.on("dreamina:image-found", onFound);
    ipcMain.on("dreamina:debug", (_evt, msg) => sendToRenderer("tools-log", String(msg)));

    targetWindow.once("closed", () => {
        ipcMain.removeListener("dreamina:image-found", onFound);
    });
}

// HÃ m dÃ¹ng Ä‘á»ƒ set cookie vÃ o session
async function setFacebookCookiesFromFile(cookieFilePath) {
    if (!fs.existsSync(cookieFilePath)) return false;
    const cookies = JSON.parse(fs.readFileSync(cookieFilePath, "utf-8"));

    for (const cookie of cookies) {
        // Báº¯t buá»™c cÃ³ url khi set cookie cho Electron
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
            console.log(`Set cookie ${cookie.name} lá»—i:`, err.message);
        }
    }
    return true;
}

// ==== SCREENSHOT ====
async function captureOnlyTargetWindow(targetUrlWithUniqueID, uniqueID) {
    try {
        sendToRenderer("tools-log", "[Screenshot] Báº¯t Ä‘áº§u...");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const screenshotPath = path.join(
            documentsDir,
            `screenshot-${timestamp}.png`,
        );

        sendToRenderer(
            "tools-log",
            "[Screenshot] Äang fetch Chrome remote debug...",
        );

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        sendToRenderer("tools-log", "[Screenshot] Puppeteer Ä‘Ã£ connect.");

        const pages = await browser.pages();
        sendToRenderer("tools-log", `[Screenshot] CÃ³ ${pages.length} page.`);

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
                `[Screenshot] âŒ KhÃ´ng tÃ¬m tháº¥y page cÃ³ uniqueID=${uniqueID}`,
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
            `[Screenshot] âœ… ÄÃ£ chá»¥p áº£nh: ${screenshotPath}`,
        );

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer(
            "tools-log",
            `[Screenshot] âŒ Lá»—i khi chá»¥p áº£nh: ${err.message}`,
        );
        if (targetWindow) targetWindow.close();
    }
}

async function getFacebookCookies(uniqueID, event) {
    try {
        sendToRenderer(
            "tools-log",
            `[FB-GetCookie] Äang tÃ¬m page vá»›i uniqueID=${uniqueID}...`,
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
                `[FB-GetCookie] âŒ KhÃ´ng tÃ¬m tháº¥y page cÃ³ uniqueID=${uniqueID}`,
            );
            event.reply("tools-response", {
                error: `KhÃ´ng tÃ¬m tháº¥y tab Ä‘Äƒng nháº­p Facebook!`,
            });
            await browser.disconnect();
            return;
        }

        const cookies = await matchedPage.cookies();
        // LÆ°u file vÃ o Documents
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const cookiePath = path.join(
            documentsDir,
            `fb-cookies-${timestamp}.json`,
        );
        fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), "utf-8");

        sendToRenderer(
            "tools-log",
            `[FB-GetCookie] ÄÃ£ lÆ°u cookies vÃ o: ${cookiePath}`,
        );

        // Tráº£ cookie vá» UI
        event.reply("tools-response", {
            action: "get-facebook-cookies",
            success: true,
            cookies,
            file: cookiePath,
        });

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer("tools-log", `[FB-GetCookie] âŒ Lá»—i: ${err.message}`);
        event.reply("tools-response", { error: err.message });
        if (targetWindow) targetWindow.close();
    }
}

async function connectApps(targetUrlWithUniqueID, uniqueID) {
    try {
        sendToRenderer("tools-log", "[FB-Login] Báº¯t Ä‘áº§u...");

        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null,
        });

        sendToRenderer("tools-log", "[FB-Login] Puppeteer Ä‘Ã£ connect.");

        const pages = await browser.pages();
        sendToRenderer("tools-log", `[FB-Login] CÃ³ ${pages.length} page.`);

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
                `[FB-Login] âŒ KhÃ´ng tÃ¬m tháº¥y page cÃ³ uniqueID=${uniqueID}`,
            );
            await browser.disconnect();
            return;
        }

        sendToRenderer(
            "tools-log",
            `[FB-Login] ÄÃ£ tÃ¬m tháº¥y tab Facebook cáº§n Ä‘Äƒng nháº­p!`,
        );

        // TÃ¹y má»¥c tiÃªu, vÃ­ dá»¥: láº¥y cookie sau khi user tá»± login
        // Chá» user login, báº¡n cÃ³ thá»ƒ chá» Ä‘áº¿n khi url Ä‘á»•i sang https://www.facebook.com/?sk=welcome hoáº·c cookie Ä‘áº§y Ä‘á»§
        // á»ž Ä‘Ã¢y mÃ¬nh láº¥y cookies luÃ´n sau 20s (hoáº·c báº¡n cÃ³ thá»ƒ trigger báº±ng nÃºt trÃªn giao diá»‡n, hoáº·c logic thÃ´ng minh hÆ¡n)
        setTimeout(async () => {
            const cookies = await matchedPage.cookies();
            sendToRenderer(
                "tools-log",
                `[FB-Login] Cookie sau login: ${JSON.stringify(cookies)}`,
            );
            // Báº¡n cÃ³ thá»ƒ lÆ°u cookies vÃ o file hoáº·c gá»­i tráº£ vá» renderer náº¿u cáº§n
            await browser.disconnect();
            if (targetWindow) targetWindow.close();
        }, 200000); // chá» 200s, tuá»³ Ã½
    } catch (err) {
        sendToRenderer("tools-log", `[FB-Login] âŒ Lá»—i: ${err.message}`);
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
        sendToRenderer("tools-log", "[Website-Crawl] Báº¯t Ä‘áº§u...");

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
                `[Website-Crawl] âŒ KhÃ´ng tÃ¬m tháº¥y tab cÃ³ uniqueID=${uniqueID}`,
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
                        `[Gemini] âŒ Lá»—i xá»­ lÃ½ "${item.key}": ${err.message}`,
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
        sendToRenderer("tools-log", `âœ… ÄÃ£ lÆ°u dá»¯ liá»‡u JSON: ${jsonPath}`);

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer("tools-log", `[Website-Crawl] âŒ Lá»—i: ${err.message}`);
        if (targetWindow) targetWindow.close();
    }
}

function extractFacebookPostsFromHTML(html, facegroup, storySelector, postContainerSelector, profileNameSelector, seeMoreText) {
    if (!html) return [];
    const $ = cheerio.load(html);
    const results = [];

    $(postContainerSelector).each((index, element) => {
        const post = $(element);

        // --- 1. Láº¤Y Máº¢NG HREF & Lá»ŒC THá»œI GIAN ---
        let postUrls = [];
        let timeText = "";

        post.find('a[role="link"]').each((i, el) => {
            const txt = $(el).text().toLowerCase();
            const href = $(el).attr('href');

            if (href && href !== '#' && !href.startsWith('mailto:')) {
                const fullHref = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
                postUrls.push(fullHref);
            }

            if (/(vá»«a xong|just now|hÃ´m qua|yesterday)/i.test(txt) || /\d+\s*(phÃºt|giá»|ngÃ y|thÃ¡ng|nÄƒm|m|h|d|y|hr|hrs|mins|thg|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(txt)) {
                timeText = txt;
            }
        });

        if (!timeText) timeText = "Unknown time";
        postUrls = [...new Set(postUrls)];

        // --- 2. Láº¤Y TÃC GIáº¢ ---
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

        // --- 3. Láº¤Y Ná»˜I DUNG VÄ‚N Báº¢N (TEXT) ---
        const contentEl = post.find(`[${storySelector}]`);
        const content = contentEl.text().trim();

        // Kiá»ƒm tra bung "Xem thÃªm"
        if (content.includes(seeMoreText)) return;

        // --- 4. HÃŒNH áº¢NH (IMAGES) ---
        const images = [];
        post.find('img').each((i, img) => {
            const src = $(img).attr('src');
            const alt = $(img).attr('alt') || "";
            if (src && src.includes('https://scontent') && !alt.toLowerCase().includes('há»“ sÆ¡') && !alt.toLowerCase().includes('profile')) {
                images.push(src);
            }
        });

        const finalImages = [...new Set(images)];

        // --- ÄIá»€U KIá»†N Má»šI: Bá»Ž QUA Náº¾U KHÃ”NG CÃ“ TEXT VÃ€ KHÃ”NG CÃ“ áº¢NH ---
        if (!content && finalImages.length === 0) {
            return; // Bá» qua bÃ i post "trá»‘ng" (chá»‰ cÃ³ video hoáº·c chá»‰ cÃ³ sticker/link)
        }

        // --- 5. VIDEO LINK ---
        let videoUrl = post.find('a[href*="/videos/"], a[href*="/watch/"]').first().attr('href') || null;
        if (videoUrl && !videoUrl.startsWith('http')) videoUrl = `https://www.facebook.com${videoUrl}`;

        // --- 6. TÆ¯Æ NG TÃC ---
        const reactions = post.find('[aria-label*="cáº£m xÃºc"], [aria-label*="reactions"]').attr('aria-label') || "0";
        let commentCount = "0", shareCount = "0";
        post.find('div[role="button"]').each((i, btn) => {
            const txt = $(btn).text().toLowerCase();
            if (txt.includes('bÃ¬nh luáº­n')) commentCount = txt.replace(/[^0-9kK]/g, '');
            if (txt.includes('chia sáº»')) shareCount = txt.replace(/[^0-9kK]/g, '');
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
        sendToRenderer("tools-log", "[FB-Crawl] ðŸš€ Khá»Ÿi Ä‘á»™ng trÃ¬nh quÃ©t...");

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

            sendToRenderer("tools-log", `â³ Äang Ä‘á»£i tab Facebook má»Ÿ... (${retries}s)`);
            await new Promise(r => setTimeout(r, 2000));
            retries--;
        }

        if (!facebookPage) {
            sendToRenderer("tools-log", "âŒ KhÃ´ng tÃ¬m tháº¥y tab Facebook.");
            return;
        }

        try {
            await facebookPage.bringToFront();
        } catch (e) {
            // CÃ³ thá»ƒ bá» qua náº¿u lÃ  webview khÃ´ng há»— trá»£ bringToFront
        }

        let noNewPostLoops = 0;
        let previousPostCount = 0;

        while (allPosts.length < maxPosts && count < 1000) {
            count++;
            // If using targetWindow and it's closed, stop. But for webview, targetWindow might be null, so check !useWebview.
            if (!args.useWebview && (!targetWindow || targetWindow.isDestroyed())) break;

            await facebookPage.mouse.wheel({ deltaY: 2000 });
            await new Promise(r => setTimeout(r, 3000));

            // Click Xem thÃªm
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
                    sendToRenderer("tools-log", `[FB-Crawl] âœ… ÄÃ£ láº¥y: ${post.author.name} (${post.images.length} áº£nh)`);

                    // PhÃ¡t luá»“ng trá»±c tiáº¿p vá» frontend
                    sendToRenderer("tools-response", {
                        action: "facebook-crawl-stream",
                        success: true,
                        posts: [post]
                    });
                }
                if (allPosts.length >= maxPosts) break;
            }

            // Kiá»ƒm tra tiáº¿n Ä‘á»™ Ä‘á»ƒ trÃ¡nh vÃ²ng láº·p vÃ´ háº¡n
            if (allPosts.length === previousPostCount) {
                noNewPostLoops++;
            } else {
                noNewPostLoops = 0;
            }
            previousPostCount = allPosts.length;

            if (noNewPostLoops >= 5) {
                sendToRenderer("tools-log", `[FB-Crawl] âš ï¸ KhÃ´ng tÃ¬m tháº¥y bÃ i Ä‘Äƒng má»›i sau nhiá»u láº§n cuá»™n. Dá»«ng quÃ©t táº¡i ${allPosts.length} bÃ i.`);
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
        sendToRenderer("tools-log", `âŒ Lá»—i: ${err.message}`);
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
            `[âœ“] Fallback server cháº¡y táº¡i http://localhost:${fallbackPort}`,
        );
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[Fallback] Cá»•ng ${fallbackPort} Ä‘ang báº­n, thá»­ dá»n dáº¹p...`);
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
        // CÃ³ ngÆ°á»i dÃ¹ng má»Ÿ thÃªm app, focus vÃ o cá»­a sá»• hiá»‡n táº¡i
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.commandLine.appendSwitch("remote-debugging-port", "9999"); // Báº®T BUá»˜C cho puppeteer.connect()
app.commandLine.appendSwitch("log-level", "3"); // Táº¯t cÃ¡c cáº£nh bÃ¡o khÃ´ng cáº§n thiáº¿t cá»§a Chromium DevTools (Autofill.enable, ...)

// ThÃªm util nÃ y gáº§n Ä‘áº§u file:
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

// TODO: thay báº±ng thÃ´ng tin real cá»§a OAuth Desktop App (Google Cloud Console)
const GSC_CLIENT_ID =
    "90514980593-9tqqkt4eobhee5aqrft3f6s5mpkakbp0.apps.googleusercontent.com";
const GSC_CLIENT_SECRET = "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";
const GSC_REDIRECT_URI = "http://localhost/google"; // redirect máº·c Ä‘á»‹nh cho Desktop App

// LÆ°u token vÃ o thÆ° má»¥c userData cá»§a Electron
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
        sendToRenderer("tools-log", `[GSC] Lá»—i load token: ${e.message}`);
    }
}

function gscSaveToken(tokens) {
    try {
        fs.writeFileSync(
            TOKEN_GSC_PATH,
            JSON.stringify(tokens, null, 2),
            "utf-8",
        );
        sendToRenderer("tools-log", `[GSC] ÄÃ£ lÆ°u token vÃ o ${TOKEN_GSC_PATH}`);
    } catch (e) {
        sendToRenderer("tools-log", `[GSC] Lá»—i lÆ°u token: ${e.message}`);
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
            <button class="btn" onclick="window.close()">ÄÃ³ng cá»­a sá»• nÃ y</button>
        </div>
        ${isSuccess ? '<script>setTimeout(() => window.close(), 3000);</script>' : ''}
    </body>
    </html>`;
}

// Má»Ÿ cá»­a sá»• login Google, láº¥y "code" rá»“i Ä‘á»•i sang access_token + refresh_token
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
                        sendToRenderer("tools-log", `[GSC] Lá»—i OAuth: ${error}`);
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(getAuthHtml('Lá»—i xÃ¡c thá»±c', `QuÃ¡ trÃ¬nh Ä‘Äƒng nháº­p tháº¥t báº¡i: ${error}. Vui lÃ²ng thá»­ láº¡i.`, false));
                        server.close();
                        reject(new Error(error));
                        return;
                    }

                    if (!code) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(getAuthHtml('Lá»—i há»‡ thá»‘ng', `KhÃ´ng tÃ¬m tháº¥y mÃ£ xÃ¡c thá»±c tá»« Google tráº£ vá».`, false));
                        server.close();
                        reject(new Error("No code in redirect URL"));
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(getAuthHtml('ThÃ nh cÃ´ng', 'QuÃ¡ trÃ¬nh xÃ¡c thá»±c hoÃ n táº¥t! Báº¡n cÃ³ thá»ƒ quay láº¡i app ai.type, cá»­a sá»• nÃ y sáº½ tá»± Ä‘Ã³ng láº¡i.', true));
                    server.close();

                    sendToRenderer("tools-log", "[GSC] Nháº­n code tá»« trÃ¬nh duyá»‡t chÃ­nh, Ä‘ang Ä‘á»•i sang token...");
                    const { tokens } = await gscOauth2Client.getToken(code);
                    gscOauth2Client.setCredentials(tokens);
                    gscSaveToken(tokens);

                    sendToRenderer("tools-log", "[GSC] ÄÄƒng nháº­p thÃ nh cÃ´ng, Ä‘Ã£ lÆ°u token.");
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

        // Láº¯ng nghe á»Ÿ port cá»‘ Ä‘á»‹nh 5455 Ä‘á»ƒ dá»… cáº¥u hÃ¬nh trÃªn Google Cloud Console
        server.listen(5455, '127.0.0.1', () => {
            const redirectUri = `http://localhost:5455/google`;

            // Cáº­p nháº­t láº¡i redirectUri Ä‘á»ƒ Google OAuth cho phÃ©p
            gscOauth2Client._clientId = GSC_CLIENT_ID;
            gscOauth2Client._clientSecret = GSC_CLIENT_SECRET;
            gscOauth2Client.redirectUri = redirectUri;

            const authUrl = gscOauth2Client.generateAuthUrl({
                access_type: "offline",
                scope: SCOPES_GSC,
                prompt: "consent",
            });

            sendToRenderer("tools-log", `[GSC] Má»Ÿ Chrome máº·c Ä‘á»‹nh: ${authUrl}`);
            shell.openExternal(authUrl);
        });

        server.on('error', (e) => {
            sendToRenderer("tools-log", `[GSC] Lá»—i server listen: ${e.message}`);
            reject(e);
        });
    });
}

async function gscEnsureAuthenticated() {
    gscLoadTokenIfExists();
    const creds = gscOauth2Client.credentials;

    if (!creds.access_token && !creds.refresh_token) {
        // ChÆ°a tá»«ng login
        await gscDoLogin();
    } else if (creds.refresh_token && !creds.access_token) {
        // CÃ³ refresh token nhÆ°ng háº¿t access token
        await gscOauth2Client.getAccessToken();
    }
}

// ===== CHROME APP (STT) - CHá»ˆ Má»ž DUY NHáº¤T 1 Cá»¬A Sá»” =====
let chromeAppProcess = null;

// WS server cho Chrome app (Angular 17 STT)
let sttWsServer = null;
const sttWsClients = new Set();

async function parseSelector({ instruction, html, model }) {
    const prompt = `Báº¡n lÃ  AI chuyÃªn trÃ­ch xuáº¥t dá»¯ liá»‡u tá»« HTML theo hÆ°á»›ng dáº«n. HÃ£y Ä‘á»c Ä‘oáº¡n HTML sau vÃ  trÃ­ch ra dá»¯ liá»‡u theo yÃªu cáº§u:

    [INSTRUCTION]
    ${instruction}

    [HTML]
    ${html}

    Tráº£ vá» JSON vá»›i 1 key duy nháº¥t lÃ  "value", vÃ­ dá»¥: { "value": "Káº¿t quáº£" }
    Náº¿u khÃ´ng tÃ¬m tháº¥y, tráº£ vá»: { "value": "" }`;

    const result = await model.generateContent(prompt);
    let text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Loáº¡i bá» ```json ... ```
    text = text.trim();
    if (text.startsWith("```json")) {
        text = text
            .replace(/^```json\s*/, "")
            .replace(/```$/, "")
            .trim();
    }

    // Loáº¡i bá» náº¿u bá»‹ bá»c markdown kiá»ƒu khÃ¡c
    text = text.replace(/^```/, "").replace(/```$/, "").trim();

    // Parse JSON
    try {
        const json = JSON.parse(text);
        return { value: json.value || "" };
    } catch (e) {
        // Náº¿u parse lá»—i thÃ¬ tráº£ láº¡i nguyÃªn vÄƒn (fallback)
        return { value: text };
    }
}

// ==== AUDIO RECORDING Tá»ª WEBVIEW ====
let audioRecordStream = null;
ipcMain.on('webview-audio-chunk', (event, buffer) => {
    if (!audioRecordStream) {
        const audioPath = path.join(app.getPath('userData'), 'meeting_audio.webm');
        audioRecordStream = fs.createWriteStream(audioPath);
        console.log(`[Audio Recording] Báº¯t Ä‘áº§u ghi Ã¢m lÆ°u táº¡i: ${audioPath}`);
    }
    audioRecordStream.write(buffer);
});

ipcMain.handle('init-system-audio', () => {
    // KhÃ´ng cáº§n táº¡o stream ná»¯a vÃ¬ gá»­i 1 láº§n
    return true;
});

ipcMain.handle('save-system-audio', (event, uint8ArrayData) => {
    // LÆ°u vÃ o Documents\ai.type\data\notes
    const notesDir = path.join(app.getPath('documents'), 'ai.type', 'data', 'notes');
    if (!fs.existsSync(notesDir)) {
        fs.mkdirSync(notesDir, { recursive: true });
    }

    // TÃªn file cÃ³ chá»©a má»‘c thá»i gian riÃªng biá»‡t
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const audioPath = path.join(notesDir, `recording_${timestamp}.webm`);

    const buffer = Buffer.from(uint8ArrayData);
    fs.writeFileSync(audioPath, buffer);
    console.log(`[Audio Recording] ÄÃ£ lÆ°u file Ã¢m thanh hoÃ n chá»‰nh táº¡i: ${audioPath}`);
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
            { text: "HÃ£y nghe vÃ  viáº¿t láº¡i chÃ­nh xÃ¡c ná»™i dung vÄƒn báº£n tiáº¿ng Viá»‡t cá»§a Ä‘oáº¡n Ã¢m thanh nÃ y. Chá»‰ cáº§n tráº£ vá» ná»™i dung, khÃ´ng giáº£i thÃ­ch." }
        ]);

        return result.response.text();
    } catch (e) {
        console.error('Lá»—i khi gá»i Gemini dá»‹ch Ã¢m thanh:', e);
        throw e;
    }
});

// ==== DESKTOP CAPTURER (CÃCH 2) ====
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
                `KhÃ´ng thá»ƒ huá»· tiáº¿n trÃ¬nh: ${err.message}`,
            );
        else
            sendToRenderer("tools-log", `ÄÃ£ huá»· tiáº¿n trÃ¬nh chiáº¿m port ${port}`);
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

                // Handshake Ä‘Æ¡n giáº£n
                if (payload.type === "hello") {
                    sendToRenderer(
                        "tools-log",
                        `[STT-WS] Handshake from ${clientId} role=${payload.role || ""}`,
                    );
                    return;
                }

                // Chrome app gá»­i caption
                if (payload.type === "caption") {
                    sendToRenderer(
                        "tools-log",
                        `[STT-WS] caption from ${clientId}: ${JSON.stringify(payload)}`,
                    );
                    sendToRenderer("stt-caption", payload);
                }

                // KÃªnh debug chung
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
// ThÃªm tham sá»‘ width, height vÃ o hÃ m
function openChromeApp(url, width = 400, height = 800) {
    const targetUrl = url || "http://localhost:7171/";

    if (chromeAppProcess && chromeAppProcess.killed) chromeAppProcess = null;

    if (sttWsClients.size > 0) {
        sendToRenderer("tools-log", `[ChromeApp] Äang cháº¡y rá»“i, khÃ´ng má»Ÿ láº¡i.`);
        return;
    }

    const chromePath = getChromePath();
    if (!chromePath) {
        sendToRenderer(
            "tools-log",
            `[ChromeApp] âŒ KhÃ´ng tÃ¬m tháº¥y Google Chrome!`,
        );
        return;
    }

    try {
        const userDataDir = path.join(os.tmpdir(), "chrome-stt-" + Date.now());

        const args = [
            `--app=${targetUrl}`,
            // --- THÃŠM DÃ’NG NÃ€Y Äá»‚ CHá»ˆNH KÃCH THÆ¯á»šC ---
            `--window-size=${width},${height}`,

            // Náº¿u muá»‘n chá»‰nh vá»‹ trÃ­ xuáº¥t hiá»‡n (tÃ¹y chá»n):
            // `--window-position=100,100`,

            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            "--test-type",
            "--ignore-certificate-errors",
            "--disable-web-security",
            "--disable-site-isolation-trials",

            // Táº¯t dá»‹ch & popup thá»«a
            "--disable-features=IsolateOrigins,site-per-process,Translate,OptimizationGuideModelDownloading,OptimizationHints",
            "--disable-translate",

            `--user-data-dir=${userDataDir}`,
            "--autoplay-policy=no-user-gesture-required",
            "--use-fake-ui-for-media-stream",
            "--enable-speech-input",

        ];

        sendToRenderer(
            "tools-log",
            `[ChromeApp] Má»Ÿ size ${width}x${height} táº¡i: ${chromePath}`,
        );

        const child = spawn(chromePath, args, {
            detached: true,
            stdio: "ignore",
            shell: false,
        });

        child.unref();
        chromeAppProcess = child;
    } catch (err) {
        sendToRenderer("tools-log", `[ChromeApp] âŒ Exception: ${err.message}`);
    }
}

// Tráº£ vá» Ä‘Æ°á»ng dáº«n Ä‘Ãºng cho preload á»Ÿ cáº£ dev (electron .) vÃ  app.asar
function resolvePreload() {
    // 1) Khi cháº¡y tá»« dist/main.js: __dirname = .../app.asar/dist (build) hoáº·c <proj>/dist (dev)
    const candidate1 = path.join(__dirname, "..", "preload.js"); // <-- CHUáº¨N
    if (fs.existsSync(candidate1)) return candidate1;

    // 2) PhÃ²ng khi ai Ä‘Ã³ váº«n Ä‘á»ƒ preload cáº¡nh main.js (Ã­t gáº·p)
    const candidate2 = path.join(__dirname, "preload.js");
    if (fs.existsSync(candidate2)) return candidate2;

    // 3) PhÃ²ng thÃªm case hiáº¿m trong khi dev cháº¡y tá»« root
    const candidate3 = path.join(process.cwd(), "preload.js");
    if (fs.existsSync(candidate3)) return candidate3;

    // 4) BÃ¡o lá»—i Ä‘á»ƒ cÃ²n biáº¿t
    return candidate1; // váº«n tráº£ vá» candidate1 Ä‘á»ƒ log bÃ¡o lá»—i
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
            sendToRenderer("tools-log", "[âœ“] Angular app Ä‘Ã£ cháº¡y, loadURL");
            mainWindow.loadURL(targetURL);
        } else {
            sendToRenderer("tools-log", "[!] KhÃ´ng mong muá»‘n, dÃ¹ng fallback");
            mainWindow.webPreferences.devTools = false; // Táº¯t devtools cho main window (váº«n má»Ÿ Ä‘Æ°á»£c báº±ng shortcut náº¿u cáº§n)
            loadFallback();
        }
    });

    req.on("error", () => {
        sendToRenderer(
            "tools-log",
            "[x] KhÃ´ng káº¿t ná»‘i Ä‘Æ°á»£c Angular â†’ fallback",
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
                    "[Fallback] Load fallback thÃ nh cÃ´ng",
                ),
            )
            .catch((err) =>
                sendToRenderer(
                    "tools-log",
                    `[Fallback] Lá»—i khi load fallback: ${err.message}`,
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
            { label: "á»¨ng dá»¥ng", submenu: [{ label: "ThoÃ¡t", role: "quit" }] },
            {
                label: "VÄƒn báº£n",
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
                label: "Hiá»ƒn thá»‹",
                submenu: [
                    { role: "reload", label: "Táº£i láº¡i", accelerator: "CmdOrCtrl+R" },
                    { role: "forceReload", label: "Táº£i láº¡i toÃ n bá»™", accelerator: "CmdOrCtrl+Shift+R" },
                    ...(app.isPackaged ? [] : [{ role: "toggleDevTools", label: "CÃ´ng cá»¥ cho nhÃ  phÃ¡t triá»ƒn" }]),
                    { type: "separator" },
                    { role: "resetZoom", label: "KhÃ´i phá»¥c thu phÃ³ng" },
                    { role: "zoomIn", label: "PhÃ³ng to" },
                    { role: "zoomOut", label: "Thu nhá»" },
                    { type: "separator" },
                    { role: "togglefullscreen", label: "ToÃ n mÃ n hÃ¬nh" }
                ]
            },
            { label: "Cá»­a sá»•", role: "windowMenu" },
        ]),
    );
}

// ==== TARGET WINDOW ====
function createTargetWindow(
    url,
    callback,
    uniqueID,
    winWidth = 600,
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
        `[Target] preload dÃ¹ng: ${preloadPath} (exists=${fs.existsSync(preloadPath)})`,
    );

    // Gáº¯n uniqueID vÃ o URL
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
        title: "CÃ´ng cá»¥ AI",
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

    // DÃ¹ng chung User-Agent "sáº¡ch" Ä‘Ã£ Ä‘Æ°á»£c lá»c á»Ÿ app.whenReady Ä‘á»ƒ trÃ¡nh mismatch version vá»›i Client Hints
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

// --- thÃªm forward debug tá»« preload vá» UI (Ä‘áº·t trong app.whenReady() sau createMainWindow()) ---
ipcMain.on("dreamina:debug", (_evt, msg) => {
    sendToRenderer("tools-log", String(msg));
});

// Nháº­n message tá»« renderer Angular vÃ  forward sang táº¥t cáº£ Chrome STT clients
ipcMain.on("stt-send-to-chrome", (_event, payload) => {
    const msg = JSON.stringify(payload || {});
    if (!sttWsServer || sttWsClients.size === 0) {
        sendToRenderer(
            "tools-log",
            "[STT-WS] KhÃ´ng cÃ³ Chrome client nÃ o Ä‘á»ƒ gá»­i message",
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
                    `[STT-WS] Lá»—i khi send tá»›i client: ${err.message}`,
                );
            }
        }
    }
});

// ============================================================
// [Má»šI] EDGE TTS ENGINE (PURE NODE.JS - NO PYTHON REQUIRED)
// ============================================================

/**
 * HÃ m sinh audio tá»« Edge TTS báº±ng WebSocket thuáº§n.
 * KhÃ´ng cáº§n cÃ i Python, khÃ´ng cáº§n edge-tts cli.
 */
async function generateEdgeAudioByExe(text, voice, outputPath, subPath, rate, pitch) {
    return new Promise((resolve, reject) => {
        const exePath = binaries.edgeTts;
        if (!exePath) {
            return reject(new Error("KhÃ´ng tÃ¬m tháº¥y file Edge TTS Core!"));
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
                    errorMsg = "Giá»ng Ä‘á»c Nam Minh cá»§a Microsoft bá»‹ giá»›i háº¡n Ä‘á»™ dÃ i kÃ½ tá»± ráº¥t ngáº¯n (dÆ°á»›i 80 kÃ½ tá»±/cÃ¢u). Vui lÃ²ng ngáº¯t Ä‘oáº¡n text nÃ y thÃ nh nhiá»u pháº§n ngáº¯n hÆ¡n, hoáº·c Ä‘á»•i sang giá»ng HoÃ i My Ä‘á»ƒ Ä‘á»c cÃ¡c Ä‘oáº¡n dÃ i liÃªn tá»¥c.";
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
                if (sender) sender.send('pdf-analysis-progress', 'Äang giáº£i nÃ©n dá»¯ liá»‡u (Vui lÃ²ng Ä‘á»£i vÃ i phÃºt)...');


                const { exec } = require('child_process');
                const isWin = process.platform === 'win32';
                let extractCmd = isWin
                    ? `powershell -command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${destDir}'"`
                    : `unzip -o '${zipPath}' -d '${destDir}'`;

                exec(extractCmd, (error) => {
                    try { fs.unlinkSync(zipPath); } catch (e) { } // Dá»n rÃ¡c
                    if (error) {
                        return reject(new Error('Lá»—i giáº£i nÃ©n: ' + error.message));
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
            event.sender.send('pdf-analysis-progress', 'MÃ´ hÃ¬nh AI Ä‘Ã£ sáºµn sÃ ng.');
            resolve();
            return;
        }



        event.sender.send('pdf-analysis-progress', 'Äang káº¿t ná»‘i Ä‘á»ƒ táº£i mÃ´ hÃ¬nh AI...');
        const modelsDir = path.join(app.getPath('userData'), 'models');
        const zipFile = path.join(modelsDir, 'model.zip');
        const url = 'https://cdn1.type.vn/assets/models--opendatalab--MinerU2.5-Pro-2604-1.2B.zip';

        try {
            await downloadAndExtractZip(url, modelsDir, zipFile, 'Äang táº£i MÃ´ hÃ¬nh AI (~1.7GB)', event.sender);
            event.sender.send('pdf-analysis-progress', 'MÃ´ hÃ¬nh AI Ä‘Ã£ sáºµn sÃ ng.');
            resolve();
        } catch (e) {
            reject(new Error(`Táº£i model tháº¥t báº¡i: ${e.message}`));
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
            if (!res.ok) throw new Error(`Lá»—i táº£i file: HTTP ${res.status}`);

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
        currentPdfSender.send('pdf-analysis-progress', 'Äang kiá»ƒm tra API AI cá»¥c bá»™...');

        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        // HÃ m gá»i API
        const fetchApi = async (url, body = null) => {
            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
            try {
                const res = await fetch(`http://127.0.0.1:48921${url}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: body ? JSON.stringify(body) : null,
                    timeout: 0, // No timeout cho viá»‡c analyze
                    signal
                });
                if (!res.ok) throw new Error(await res.text());
                return await res.json();
            } catch (err) {
                if (err.name === 'AbortError') throw new Error('cancelled');
                throw err;
            }
        };

        // HÃ m kiá»ƒm tra vÃ  khá»Ÿi Ä‘á»™ng server náº¿u cáº§n
        const ensureApiRunning = async () => {
            try {
                // Thá»­ káº¿t ná»‘i
                const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
                await fetch('http://127.0.0.1:48921/openapi.json', { timeout: 1000 });

                if (!pdfApiProcess) {
                    // Náº¿u server Ä‘ang cháº¡y nhÆ°ng khÃ´ng pháº£i do instance hiá»‡n táº¡i táº¡o ra -> ÄÃ¢y lÃ  process zombie (thÆ°á»ng do nodemon khá»Ÿi Ä‘á»™ng láº¡i).
                    // Process nÃ y sáº½ bá»‹ káº¹t stdout khiáº¿n progress khÃ´ng hiá»ƒn thá»‹ trÃªn UI. Pháº£i kill nÃ³ Ä‘i Ä‘á»ƒ táº¡o láº¡i!
                    console.log("[PDF] PhÃ¡t hiá»‡n zombie process, Ä‘ang tiáº¿n hÃ nh kill...");
                    if (currentPdfSender) currentPdfSender.send('pdf-analysis-progress', 'Äang dá»n dáº¹p tiáº¿n trÃ¬nh cÅ©...');

                    const { execSync } = require('child_process');
                    try {
                        if (process.platform === 'win32') {
                            execSync(`FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :48921') DO taskkill /F /PID %P`);
                        } else {
                            execSync(`lsof -i :48921 -t | xargs kill -9`);
                        }
                    } catch (e) { } // Bá» qua lá»—i náº¿u khÃ´ng tÃ¬m tháº¥y

                    await new Promise(r => setTimeout(r, 1000));
                    throw new Error("Killed zombie process");
                }

                return true;
            } catch (e) {
                // ChÆ°a cháº¡y -> Start
                if (currentPdfSender) currentPdfSender.send('pdf-analysis-progress', 'Äang khá»Ÿi Ä‘á»™ng mÃ´ hÃ¬nh AI...');

                const getMinerUExecutableInfoAsync = async () => {
                    const isWin = process.platform === 'win32';
                    const exeName = isWin ? 'mineru_api.exe' : 'mineru_api';

                    // 1. Kiá»ƒm tra file trong resources (trÆ°á»ng há»£p app Ä‘Ã³ng gÃ³i cÃ³ nhÃºng sáºµn)
                    const exePath = path.join(__dirname, '..', 'bin', exeName);
                    if (fs.existsSync(exePath)) {
                        return { cmd: exePath, args: [], cwd: path.dirname(exePath) };
                    }

                    // 2. Kiá»ƒm tra trong userData (app táº£i vá»)
                    const mineruDir = path.join(app.getPath('userData'), 'mineru_api_bin');
                    const downloadedExe = path.join(mineruDir, exeName);
                    if (fs.existsSync(downloadedExe)) {
                        return { cmd: downloadedExe, args: [], cwd: mineruDir };
                    }

                    // 3. Náº¿u Ä‘ang cháº¡y DEV mode vá»›i pdf.py, tráº£ vá» luÃ´n Ä‘á»ƒ dev
                    const basePath = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
                    const scriptPath = path.join(basePath, 'scripts', 'pdf.py');
                    if (!app.isPackaged && fs.existsSync(scriptPath)) {
                        return { cmd: 'python', args: ['-u', scriptPath], cwd: path.dirname(scriptPath) };
                    }

                    // 4. Náº¿u khÃ´ng cÃ³ á»Ÿ báº¥t kÃ¬ Ä‘Ã¢u, tiáº¿n hÃ nh Táº¢I Vá»€
                    if (currentPdfSender) currentPdfSender.send('pdf-analysis-progress', 'Äang táº£i tá»‡p Engine AI (Chá»‰ táº£i 1 láº§n Ä‘áº§u tiÃªn)... 0%');

                    const zipUrl = isWin ? 'https://cdn1.type.vn/assets/mineru_api_win.zip' : 'https://cdn1.type.vn/assets/mineru_api_mac.zip';
                    const zipPath = path.join(app.getPath('userData'), 'mineru_api.zip');

                    try {
                        await downloadAndExtractZip(zipUrl, mineruDir, zipPath, 'Äang táº£i tá»‡p Engine AI (~3.3GB)', currentPdfSender);
                        if (!isWin) {
                            try { fs.chmodSync(downloadedExe, '755'); } catch (e) { }
                        }
                        return { cmd: downloadedExe, args: [], cwd: mineruDir };
                    } catch (err) {
                        throw new Error('Lá»—i táº£i tá»‡p Engine: ' + err.message);
                    }
                };

                const exeInfo = await getMinerUExecutableInfoAsync();
                pdfApiProcess = spawn(exeInfo.cmd, exeInfo.args, {
                    cwd: exeInfo.cwd,
                    env: { ...process.env, PYTHONIOENCODING: 'utf8', MINERU_MODEL_PATH: getMinerUModelPath() }
                });

                pdfApiProcess.stdout.on('data', (data) => {
                    const lines = data.toString('utf8');
                    // Forward print() tá»›i UI
                    if (lines.trim() && currentPdfSender) {
                        currentPdfSender.send('pdf-analysis-progress', lines.trim());
                    }
                });

                pdfApiProcess.stderr.on('data', (data) => {
                    const errLine = data.toString('utf8');
                    if (errLine.includes('%') || errLine.includes('it/s')) {
                        // TÃ¡ch báº±ng \r hoáº·c \n Ä‘á»ƒ láº¥y dÃ²ng tráº¡ng thÃ¡i cuá»‘i cÃ¹ng
                        const parts = errLine.split(/[\r\n]+/);
                        let lastPart = parts[parts.length - 1].trim();
                        if (!lastPart && parts.length > 1) {
                            lastPart = parts[parts.length - 2].trim();
                        }
                        if (lastPart && currentPdfSender) {
                            currentPdfSender.send('pdf-analysis-progress', lastPart);
                        }
                    } else {
                        console.error("Lá»—i tá»« pdf API:", errLine);
                    }
                });

                // Chá» server boot (tá»‘i Ä‘a 30 giÃ¢y vÃ¬ import torch/transformers khÃ¡ náº·ng)
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
                    throw new Error("KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n AI Server, vui lÃ²ng thá»­ láº¡i!");
                }

                return true;
            }
        };

        try {
            await ensureApiRunning();

            event.sender.send('pdf-analysis-progress', 'Äang náº¡p AI Model vÃ o bá»™ nhá»› (láº§n Ä‘áº§u cÃ³ thá»ƒ máº¥t vÃ i phÃºt)...');
            await fetchApi('/load_model');

            event.sender.send('pdf-analysis-progress', 'Báº¯t Ä‘áº§u phÃ¢n tÃ­ch PDF...');
            const result = await fetchApi('/analyze', { file_path: filePath });

            resolve(result.data);
        } catch (error) {
            console.error("Lá»—i cháº¡y pdf API:", error);
            reject(error.message || error);
        }
    });
});

ipcMain.handle('run-pdf-analysis-openai', async (event, filePath, configData) => {
    try {
        const fs = require('fs');
        const { OpenAI } = require('openai');

        if (event.sender) {
            event.sender.send('pdf-analysis-progress', 'Äang Ä‘á»c ná»™i dung file PDF...');
        }

        const dataBuffer = fs.readFileSync(filePath);
        const pdfBase64 = dataBuffer.toString('base64');

        if (event.sender) {
            event.sender.send('pdf-analysis-progress', 'Äang gá»­i trá»±c tiáº¿p file PDF lÃªn há»‡ thá»‘ng AI...');
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
            event.sender.send('pdf-analysis-progress', 'HoÃ n táº¥t phÃ¢n tÃ­ch AI!');
        }

        try {
            // Loáº¡i bá» markdown code block náº¿u cÃ³
            let cleanJson = resultText;
            if (cleanJson.startsWith('```json')) {
                cleanJson = cleanJson.substring(7);
            }
            if (cleanJson.endsWith('```')) {
                cleanJson = cleanJson.substring(0, cleanJson.length - 3);
            }
            // Parse rá»“i stringify láº¡i Ä‘á»ƒ Ä‘áº£m báº£o lÃ  chuá»—i JSON há»£p lá»‡, vÃ¬ API upload báº¯t buá»™c lÃ  string
            return JSON.stringify(JSON.parse(cleanJson.trim()));
        } catch (e) {
            return JSON.stringify({ raw_text: resultText }); // Fallback náº¿u khÃ´ng pháº£i JSON, chuyá»ƒn thÃ nh chuá»—i JSON
        }
    } catch (error) {
        console.error("Lá»—i phÃ¢n tÃ­ch PDF báº±ng OpenAI:", error);
        throw error;
    }
});

// Láº¯ng nghe sá»± kiá»‡n 'select-local-file' tá»« Renderer process
ipcMain.handle('select-local-file', async (event, { filePath, customDir }) => {
    try {
        const fileName = path.basename(filePath);
        const docPath = app.getPath("documents");
        const dataDir = path.join(docPath, "ai.type", "data");

        // Náº¿u file Ä‘Ã£ náº±m trong thÆ° má»¥c data cá»§a app rá»“i thÃ¬ khÃ´ng cáº§n copy
        const normalizedFilePath = path.normalize(filePath);
        const normalizedDataDir = path.normalize(dataDir);
        if (normalizedFilePath.startsWith(normalizedDataDir)) {
            console.log(`File already in data dir, skipping copy: ${filePath}`);
            return `file://${path.resolve(filePath)}`;
        }

        // Táº¡o má»™t tÃªn file duy nháº¥t Ä‘á»ƒ trÃ¡nh bá»‹ trÃ¹ng (vÃ­ dá»¥: timestamp_filename)
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

        // Copy file tá»« Ä‘Æ°á»ng dáº«n gá»‘c sang thÆ° má»¥c uploads/custom cá»§a app
        fs.copyFileSync(filePath, destinationPath);

        console.log(`File copied from ${filePath} to ${destinationPath}`);

        // Tráº£ vá» Ä‘Æ°á»ng dáº«n má»›i vá» Renderer process.
        return `file://${path.resolve(destinationPath)}`;
    } catch (error) {
        console.error('Error selecting file:', error);
        throw error; // Gá»­i lá»—i vá» Renderer process
    }
});

// 1. HÃ m táº¡o Audio - LÆ°u vÃ o Documents/ai.type/data/tts/...
ipcMain.handle("tts-generate", async (event, payload) => {
    try {
        const { text, voice, rate, pitch, filename, username } = payload;

        // Format Rate: 1.2 -> "+20%", 0.8 -> "-20%"
        const rateVal = Math.round(((rate || 1) - 1) * 100);
        const formattedRate = rateVal >= 0 ? `+${rateVal}%` : `${rateVal}%`;

        // Format Pitch: 5 -> "+5Hz", -10 -> "-10Hz"
        // Quan trá»ng: Dáº¥u trá»« cá»§a sá»‘ Ã¢m sáº½ tá»± xuáº¥t hiá»‡n khi chuyá»ƒn thÃ nh chuá»—i
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

        // Táº¡o thÃªm Ä‘Æ°á»ng dáº«n cho file phá»¥ Ä‘á» (cÃ¹ng tÃªn, khÃ¡c Ä‘uÃ´i)
        const subPath = path.join(
            saveDir,
            filename.endsWith(".mp3") ? filename.replace('.mp3', '.vtt') : `${filename}.vtt`
        );

        // [THAY Äá»”I]: Truyá»n biáº¿n Ä‘Ã£ format vÃ o Ä‘Ã¢y
        // await generateEdgeAudioByExe(text, voice, filePath, formattedRate, formattedPitch);
        await generateEdgeAudioByExe(text, voice, filePath, subPath, formattedRate, formattedPitch);

        if (fs.existsSync(filePath)) {
            return {
                success: true,
                url: `file://${filePath}`,
                filePath: filePath,
            };
        } else {
            return { success: false, error: "File chÆ°a Ä‘Æ°á»£c táº¡o ra." };
        }
    } catch (error) {
        console.error("TTS Error:", error);
        return { success: false, error: error.message };
    }
});

// 2. HÃ m Ä‘á»c file - Cáº­p nháº­t logic fallback (phÃ²ng há»)
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

        // Náº¿u filepath chá»‰ lÃ  tÃªn file (basename) thÃ¬ targetPath (absolute) ban Ä‘áº§u khÃ´ng tá»“n táº¡i (sáº½ failed fs.existsSync).
        // Ta cáº§n reset targetPath vá» rá»—ng náº¿u nÃ³ khÃ´ng pháº£i lÃ  absolute path Ä‘á»ƒ cháº¡y logic dá»± phÃ²ng bÃªn dÆ°á»›i.
        if (targetPath && !path.isAbsolute(targetPath)) {
            targetPath = null;
        }

        if (!targetPath && filename) {
            const documentsPath = app.getPath("documents");
            const userFolder = path.join(documentsPath, "ai.type", "data", "tts", username || "anonymous");

            // TH1: TÃ¬m trong thÆ° má»¥c dá»± Ã¡n hiá»‡n táº¡i (targetUuid) - Há»— trá»£ Import Project
            if (targetUuid) {
                const projectPath = path.join(userFolder, targetUuid, filename);
                if (fs.existsSync(projectPath)) {
                    targetPath = projectPath;
                }
            }

            // TH2: TÃ¬m trong thÆ° má»¥c global (TTS cache chung)
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
    // Thiáº¿t láº­p á»©ng dá»¥ng sáº½ má»Ÿ láº¡i sau khi Ä‘Ã³ng
    app.relaunch();
    // ThoÃ¡t á»©ng dá»¥ng hiá»‡n táº¡i ngay láº­p tá»©c
    app.exit(0);
});

// main.js (Pháº§n xá»­ lÃ½ ipcMain save-base64)
ipcMain.handle("save-base64", async (event, args) => {
    // ThÃªm username vÃ o destructuring
    const { base64, fileName, folder, username, customDir } = args;

    const docPath = app.getPath("documents");

    let saveDir;
    if (customDir) {
        saveDir = path.join(docPath, "ai.type", "data", customDir);
    } else {
        // Sá»¬A ÄÆ¯á»œNG DáºªN: ThÃªm username vÃ o cuá»‘i Ä‘Æ°á»ng dáº«n
        // VÃ­ dá»¥: .../uploads/thumbnails/admin/
        saveDir = path.join(
            docPath,
            "ai.type",
            "data",
            "uploads",
            folder || "thumbnails",
            username || "default",
        );
    }

    // Táº¡o thÆ° má»¥c (recursive: true sáº½ táº¡o cáº£ thÆ° má»¥c username náº¿u chÆ°a cÃ³)
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
 * 2. HÃ m chá»¥p mÃ n hÃ¬nh App (Full window screenshot)
 */
ipcMain.handle("capture-app", async (event, args) => {
    const { fileName, folder } = args;
    const win = BrowserWindow.getFocusedWindow();

    if (!win)
        return { success: false, error: "KhÃ´ng tÃ¬m tháº¥y cá»­a sá»• á»©ng dá»¥ng" };

    // 1. Chuáº©n bá»‹ Ä‘Æ°á»ng dáº«n lÆ°u file
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
        // CÃCH 1: DÃ¹ng Puppeteer Ä‘á»ƒ chá»¥p FULL PAGE (Cháº¥t lÆ°á»£ng cao, láº¥y háº¿t chiá»u dÃ i)
        // Káº¿t ná»‘i vÃ o chÃ­nh trÃ¬nh duyá»‡t Electron hiá»‡n táº¡i qua port 9999
        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();

        // Káº¿t ná»‘i Puppeteer
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null, // Äá»ƒ null Ä‘á»ƒ láº¥y Ä‘Ãºng kÃ­ch thÆ°á»›c hiá»‡n táº¡i
        });

        // Láº¥y danh sÃ¡ch cÃ¡c tab Ä‘ang má»Ÿ
        const pages = await browser.pages();

        // TÃ¬m tab Main Window (ThÆ°á»ng lÃ  tab khÃ´ng cÃ³ uniqueID hoáº·c lÃ  tab Ä‘áº§u tiÃªn)
        // Logic: Láº¥y tab cÃ³ URL chá»©a localhost hoáº·c file:// vÃ  KHÃ”NG pháº£i lÃ  devtools
        const page = pages.find((p) => {
            const u = p.url();
            return !u.startsWith("devtools://") && !u.includes("uniqueID=");
        });

        if (page) {
            // Inject CSS Ä‘á»ƒ áº©n thanh cuá»™n (scrollbars) cho Ä‘áº¹p náº¿u cáº§n
            await page.addStyleTag({
                content: "body { overflow-y: hidden !important; }",
            });

            // Chá»¥p Full Page
            await page.screenshot({
                path: filePath,
                fullPage: true, // <--- ÄÃ‚Y LÃ€ CHÃŒA KHOÃ Äá»‚ CHá»¤P FULL HEIGHT
            });

            // Restore láº¡i thanh cuá»™n (náº¿u cáº§n)
            await page.addStyleTag({
                content: "body { overflow-y: auto !important; }",
            });

            await browser.disconnect();

            sendToRenderer(
                "tools-log",
                `[Screenshot] âœ… ÄÃ£ chá»¥p Full Height: ${filePath}`,
            );
            return {
                success: true,
                path: filePath,
                url: `file:///${filePath.replace(/\\/g, "/")}`,
            };
        } else {
            // Náº¿u khÃ´ng tÃ¬m tháº¥y page qua Puppeteer thÃ¬ disconnect Ä‘á»ƒ fallback
            await browser.disconnect();
            throw new Error("KhÃ´ng tÃ¬m tháº¥y Page qua Puppeteer");
        }
    } catch (e) {
        // CÃCH 2: FALLBACK (Dá»± phÃ²ng)
        // Náº¿u lá»—i Puppeteer thÃ¬ dÃ¹ng cÃ¡ch cÅ© chá»¥p Viewport
        sendToRenderer(
            "tools-log",
            `[Screenshot] âš ï¸ Lá»—i Puppeteer (${e.message}), chuyá»ƒn sang chá»¥p Viewport.`,
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
            console.error("Lá»—i chá»¥p mÃ n hÃ¬nh:", err2);
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
                    `[WindowOpenHandler] Má»Ÿ Chrome app cho URL: ${url}`,
                );
                openChromeApp(url);
                return { action: "deny" };
            }
        } catch (e) {
            sendToRenderer(
                "tools-log",
                `[WindowOpenHandler] Lá»—i khi xá»­ lÃ½ window.open(${url}): ${e.message}`,
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
// [Cáº¬P NHáº¬T] SERVER PHá»¤C Vá»¤ CHROME APP STT (PORT 7171)
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
        
        /* [2] CUSTOM SCROLLBAR CHO Äáº¸P */
        ::-webkit-scrollbar {
            width: 8px; /* Äá»™ rá»™ng thanh cuá»™n */
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #111; /* MÃ u ná»n Ä‘Æ°á»ng ray */
        }
        ::-webkit-scrollbar-thumb {
            background: #333; /* MÃ u thanh kÃ©o */
            border-radius: 4px; /* Bo trÃ²n */
        }
        ::-webkit-scrollbar-thumb:hover {
            background: #555; /* MÃ u khi di chuá»™t vÃ o */
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

        /* Khu vá»±c Logs */
        #logs { 
            height: 150px; 
            padding: 10px; 
            overflow-y: auto; /* Scrollbar sáº½ hiá»‡n á»Ÿ Ä‘Ã¢y */
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
            s = s.replace(/ pháº©y/gi, ',');
            s = s.replace(/ cháº¥m/gi, '.');
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
            ws.onopen = () => { log('âœ… Káº¿t ná»‘i WS thÃ nh cÃ´ng', 'info'); ws.send(JSON.stringify({type:'hello', role:'chrome'})); };
            ws.onclose = () => setTimeout(connectWs, 2000);
            ws.onmessage = (e) => {
                try {
                    const d = JSON.parse(e.data);
                    if (d.type === 'set-source') loadVideo(d.source);
                } catch{}
            };
        }

        function loadVideo(url) {
            log('â–¶ï¸ Äang táº£i nguá»“n: ' + url, 'info');
            if(hls) { hls.destroy(); hls = null; }

            if (Hls.isSupported()) {
                hls = new Hls({ debug: false, enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('âœ… ÄÃ£ nháº­n tÃ­n hiá»‡u Video', 'info');
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
            if (!window.webkitSpeechRecognition) return log('âŒ TrÃ¬nh duyá»‡t khÃ´ng há»— trá»£ STT', 'err');
            
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'vi-VN';

            recognition.onstart = () => log('ðŸŽ™ï¸ STT Ä‘ang láº¯ng nghe...', 'info');
            recognition.onerror = (e) => { if (e.error !== 'no-speech') log('âš ï¸ Lá»—i Mic: ' + e.error, 'err'); };
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
                        log('ðŸ“ ' + processedFinal, 'final');
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
            console.log(`[STT-Server] Cá»•ng ${port} Ä‘ang bá»‹ chiáº¿m, thá»­ dá»n dáº¹p...`);
            killPort(port);
            setTimeout(() => {
                server.close();
                server.listen(port);
            }, 1000);
        } else {
            console.error(`[STT-Server] Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh:`, err);
        }
    });
}

app.whenReady().then(async () => {
    startCrmServices();
    const resolveMediaPath = (originalUrl) => {
        let targetPath = '';
        let url = decodeURIComponent(originalUrl);

        // Chromium vá»›i standard:true sáº½ normalize URL:
        //   media://AUTO_FIND/xxx  ->  media://auto_find/xxx   (lowercase hostname)
        //   media:///C:/path       ->  media://c/path          (C: bá»‹ máº¥t dáº¥u hai cháº¥m)
        // NÃªn ta cáº§n so khá»›p case-insensitive

        if (url.toLowerCase().startsWith('smart_find/')) {
            const queryString = url.substring(url.indexOf('?') + 1);
            const params = new URLSearchParams(queryString);
            let originalPath = params.get('path') || '';
            originalPath = originalPath.replace(/^file:\/\//i, '');
            const mediaDir = params.get('dir') || '';
            const uuid = params.get('uuid') || 'default';

            // RÃºt trÃ­ch basename, bá» timestamp prefix náº¿u cÃ³
            let basename = originalPath ? require('path').basename(originalPath).replace(/^\d{13}_/, '') : '';

            // KhÃ´i phá»¥c drive letter bá»‹ Chromium lowercase
            let testPath = originalPath;
            if (testPath) {
                const dm = testPath.match(/^([a-zA-Z])(:?)([\\/])/);
                if (dm && !dm[2]) {
                    testPath = dm[1].toUpperCase() + ':' + testPath.substring(1);
                }
                if (fs.existsSync(testPath)) return testPath;
                // Thá»­ vá»›i basename gá»‘c (chÆ°a strip timestamp)
                const rawBasename = require('path').basename(originalPath);
                if (rawBasename !== basename) {
                    const rawDir = require('path').dirname(testPath);
                    const rawPath = require('path').join(rawDir, rawBasename);
                    if (fs.existsSync(rawPath)) return rawPath;
                }
            }

            const docPath = app.getPath('documents');
            const ttsAdminDir = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin');

            // Chiáº¿n lÆ°á»£c tÃ¬m kiáº¿m theo thá»© tá»± Æ°u tiÃªn:
            const searchDirs = [];

            // 1. mediaDir (náº¿u cÃ³)
            if (mediaDir) searchDirs.push(mediaDir);

            // 2. ThÆ° má»¥c uuid hiá»‡n táº¡i
            searchDirs.push(require('path').join(ttsAdminDir, uuid));

            // 3. Táº¥t cáº£ thÆ° má»¥c project khÃ¡c trong tts/admin/
            if (fs.existsSync(ttsAdminDir)) {
                try {
                    const allDirs = fs.readdirSync(ttsAdminDir, { withFileTypes: true })
                        .filter(d => d.isDirectory() && d.name !== uuid)
                        .map(d => require('path').join(ttsAdminDir, d.name));
                    searchDirs.push(...allDirs);
                } catch (e) { /* ignore */ }
            }

            // 4. ThÆ° má»¥c uploads
            searchDirs.push(uploadsDir);

            // QuÃ©t tá»«ng thÆ° má»¥c
            for (const dir of searchDirs) {
                if (!fs.existsSync(dir)) continue;

                // Thá»­ trá»±c tiáº¿p
                const directPath = require('path').join(dir, basename);
                if (fs.existsSync(directPath)) return directPath;

                // Thá»­ tÃ¬m file cÃ³ timestamp prefix (vÃ­ dá»¥: 1779705618490_s1p3.mp4)
                try {
                    const files = fs.readdirSync(dir);
                    const match = files.find(f => f.endsWith(`_${basename}`) || f === basename);
                    if (match) return require('path').join(dir, match);
                } catch (e) { /* ignore */ }
            }

            // Fallback cuá»‘i: tráº£ vá» path máº·c Ä‘á»‹nh (dÃ¹ cÃ³ thá»ƒ khÃ´ng tá»“n táº¡i)
            targetPath = require('path').join(ttsAdminDir, uuid, basename);
            return targetPath;
        } else if (url.toLowerCase().startsWith('auto_find/')) {
            // Cáº¯t bá» pháº§n "auto_find/" (case-insensitive)
            const rest = url.substring('auto_find/'.length);
            const parts = rest.split('/');
            const uuid = parts[0];
            const basename = parts.slice(1).join('/');
            const docPath = app.getPath('documents');
            targetPath = require('path').join(docPath, 'ai.type', 'data', 'tts', 'admin', uuid, basename);
        } else {
            // Xá»­ lÃ½ Ä‘Æ°á»ng dáº«n á»• Ä‘Ä©a bá»‹ Chromium bÃ³p mÃ©o
            // "c/Users/..." -> "C:/Users/..."
            // "/c/Users/..." -> "C:/Users/..."
            // "/C:/Users/..." -> "C:/Users/..."
            let cleaned = url;
            // Bá» dáº¥u / Ä‘áº§u náº¿u cÃ³
            if (cleaned.startsWith('/')) cleaned = cleaned.substring(1);
            // KhÃ´i phá»¥c drive letter: "c/Users" -> "C:/Users"
            const driveMatch = cleaned.match(/^([a-zA-Z])(:?)\//);
            if (driveMatch) {
                const driveLetter = driveMatch[1].toUpperCase();
                // Náº¿u Ä‘Ã£ cÃ³ dáº¥u hai cháº¥m (C:/) thÃ¬ giá»¯, náº¿u khÃ´ng (c/) thÃ¬ thÃªm vÃ o
                if (driveMatch[2] === ':') {
                    cleaned = driveLetter + cleaned.substring(1);
                } else {
                    cleaned = driveLetter + ':' + cleaned.substring(1);
                }
            } else {
                // TrÃªn macOS/Linux: KhÃ´i phá»¥c dáº¥u / á»Ÿ Ä‘áº§u Ä‘á»ƒ táº¡o thÃ nh absolute path
                cleaned = '/' + cleaned;
            }
            targetPath = cleaned;
        }

        targetPath = require('path').normalize(targetPath);

        // Fallback: tÃ¬m file cÃ³ timestamp prefix
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

    // Native file protocol cho <img>, <video>, <audio> (Há»— trá»£ stream, seeking hoÃ n háº£o)
    protocol.registerFileProtocol('media', (request, callback) => {
        try {
            const url = request.url.replace('media://', '');
            const targetPath = resolveMediaPath(url);
            console.log('[Media Protocol - File]', request.url, '-> targetPath:', targetPath);
            return callback({ path: targetPath });
        } catch (error) {
            console.error('Lá»—i protocol media:', error);
            return callback({ error: -2 }); // -2 is FAILED
        }
    });

    // Custom protocol cho Wavesurfer dÃ¹ng fetch() (cáº§n CORS)
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
        app.setAppUserModelId("ai.type.vn"); // Thay báº±ng id app cá»§a báº¡n
    }

    // [ANTI-BOT] Láº¥y User Agent Gá»C 100% cá»§a Chromium hiá»‡n táº¡i
    let trueAgent = session.defaultSession.getUserAgent();
    // BÃ³c Ä‘i 2 cÃ¡i Ä‘uÃ´i bÃ¡o danh "TÃ´i lÃ  á»©ng dá»¥ng Electron giáº£ láº­p"
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

    // Ã‰p toÃ n bá»™ Session vÃ  á»©ng dá»¥ng dÃ¹ng Agent trong sáº¡ch nÃ y
    app.userAgentFallback = trueAgent;
    session.defaultSession.setUserAgent(trueAgent);
    session.fromPartition('persist:gemini-webview').setUserAgent(trueAgent); // Sá»­a lá»—i Cookie cho webview

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

    // CÃ i Ä‘áº·t vÆ°á»£t rÃ o bot chung
    const setupHeaders = (details, callback) => {
        // XoÃ¡ dáº¥u váº¿t Electron khá»i Client Hints Ä‘á»ƒ qua máº·t Google/Labs
        const chUa = details.requestHeaders['Sec-CH-UA'] || details.requestHeaders['sec-ch-ua'];
        if (chUa) {
            let newChUa = chUa.replace(/,?\s*"Electron";\s*v="[^"]+"/, '').replace(/"Electron";\s*v="[^"]+"\s*,?/, '');
            newChUa = newChUa.replace(/,?\s*"ai\.type";\s*v="[^"]+"/, '').replace(/"ai\.type";\s*v="[^"]+"\s*,?/, '');

            if (details.requestHeaders['Sec-CH-UA']) details.requestHeaders['Sec-CH-UA'] = newChUa;
            if (details.requestHeaders['sec-ch-ua']) details.requestHeaders['sec-ch-ua'] = newChUa;
        }

        // Triá»‡t Ä‘á»ƒ xoÃ¡ Electron khá»i User-Agent á»Ÿ cáº¥p Ä‘á»™ Network Request (Báº¯t buá»™c Ä‘á»ƒ trá»‹ lá»—i Cookie Google)
        const ua = details.requestHeaders['User-Agent'] || details.requestHeaders['user-agent'];
        if (ua) {
            let cleanUA = ua.replace(/Electron\/[\d.]+ /g, '').replace(/ai.type\/[\d.]+ /g, '');
            if (details.requestHeaders['User-Agent']) details.requestHeaders['User-Agent'] = cleanUA;
            if (details.requestHeaders['user-agent']) details.requestHeaders['user-agent'] = cleanUA;
        }

        if (details.url.includes('type.vn')) {
            // Ã‰p Origin Ä‘á»ƒ NodeBB cho phÃ©p hiá»ƒn thá»‹ áº£nh tá»« localhost:5454
            details.requestHeaders['Origin'] = 'https://type.vn';
            details.requestHeaders['Referer'] = 'https://type.vn/';
            delete details.requestHeaders['Sec-Fetch-Site'];
        }
        callback({ requestHeaders: details.requestHeaders });
    };

    // Ãp dá»¥ng cho session máº·c Ä‘á»‹nh
    session.defaultSession.webRequest.onBeforeSendHeaders(filter, setupHeaders);
    // Ãp dá»¥ng cho session cá»§a webview Ä‘á»ƒ Google khÃ´ng block (ERR_ABORTED)
    session.fromPartition('persist:gemini-webview').webRequest.onBeforeSendHeaders(filter, setupHeaders);

    // Cháº¡y hÃ m load ngay khi khá»Ÿi táº¡o
    loadBinaries();

    startGoService();
    startSttWebSocketServer();
    startSttServer(); // <--- [THÃŠM] Gá»i hÃ m vá»«a táº¡o
    createMainWindow();

    if (binaries.typeLite) {
        typeProcess = execFile(binaries.typeLite, [], (err, stdout, stderr) => {
            if (err) sendToRenderer("tools-log", `âŒ Type lá»—i: ${err}`);
            if (stdout) sendToRenderer("tools-log", `ðŸ“¥ Type: ${stdout}`);
            if (stderr) sendToRenderer("tools-log", `âš ï¸ Type stderr: ${stderr}`);
        });
    }

    // ===== IPC: XoÃ¡ toÃ n bá»™ cookie Google Ä‘á»ƒ Ä‘Äƒng nháº­p láº¡i =====
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

            // XoÃ¡ thÆ° má»¥c Chrome auth profile Ä‘á»ƒ láº§n sau Ä‘Äƒng nháº­p láº¡i tá»« Ä‘áº§u
            const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');
            if (fs.existsSync(googleAuthDir)) {
                fs.rmSync(googleAuthDir, { recursive: true, force: true });
            }

            sendToRenderer("tools-log", `[Gemini-Auth] âœ… ÄÃ£ xoÃ¡ ${removedCount} cookie Google.`);
            return { success: true, removed: removedCount };
        } catch (err) {
            sendToRenderer("tools-log", `[Gemini-Auth] Lá»—i xoÃ¡ cookie: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('clear-all-cookies', async () => {
        try {
            // Clear in defaultSession
            await session.defaultSession.clearStorageData();

            // XoÃ¡ thÆ° má»¥c Chrome auth profile Ä‘á»ƒ láº§n sau Ä‘Äƒng nháº­p láº¡i tá»« Ä‘áº§u
            const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');
            if (fs.existsSync(googleAuthDir)) {
                fs.rmSync(googleAuthDir, { recursive: true, force: true });
            }

            // TÃ¬m webview Ä‘ang cháº¡y vÃ  xoÃ¡ storage cá»§a nÃ³ (náº¿u khÃ¡c defaultSession)
            if (targetWindow && targetWindow.webContents) {
                await targetWindow.webContents.session.clearStorageData();
            }

            sendToRenderer("tools-log", `[Gemini-Auth] âœ… ÄÃ£ xoÃ¡ toÃ n bá»™ Cookie vÃ  Storage cá»§a á»©ng dá»¥ng.`);
            return { success: true };
        } catch (err) {
            sendToRenderer("tools-log", `[Gemini-Auth] Lá»—i xoÃ¡ táº¥t cáº£ cookie: ${err.message}`);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('clear-webview-auth', async () => {
        try {
            // XÃ³a session storage cá»§a webview
            await session.fromPartition('persist:gemini-webview').clearStorageData();

            // Chá»‰ xÃ³a thÆ° má»¥c Chrome auth profile cá»§a Puppeteer
            const googleAuthDir = path.join(app.getPath('userData'), 'google-auth-profile');
            if (fs.existsSync(googleAuthDir)) {
                fs.rmSync(googleAuthDir, { recursive: true, force: true });
            }
            return { success: true };
        } catch (error) {
            console.error('Lá»—i khi xoÃ¡ auth webview:', error);
            return { success: false, error: error.message };
        }
    });

    // Láº¯ng nghe Webview sinh ra tá»« giao diá»‡n Angular (náº¿u cÃ³) Ä‘á»ƒ Auto-map nÃ³ lÃ m Ä‘á»‘i tÆ°á»£ng láº¥y hÃ¬nh áº£nh
    app.on('web-contents-created', (event, contents) => {
        if (contents.getType() === 'webview') {
            // Duck-type tÆ°Æ¡ng thÃ­ch chá»©c nÄƒng (bao gá»“m EventEmitter methods)
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

            // Bá»• sung menu chuá»™t pháº£i cho webview
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
            // PUPPETEER STEALTH LOGIN: Má»Ÿ Chromium THáº¬T (khÃ´ng pháº£i Electron)
            // Ä‘á»ƒ Ä‘Äƒng nháº­p Google, rá»“i chuyá»ƒn cookie vá» Electron.
            // Google phÃ¡t hiá»‡n Electron qua JS fingerprinting nÃªn BrowserWindow
            // luÃ´n bá»‹ cháº·n. Puppeteer Stealth patch háº¿t cÃ¡c dáº¥u hiá»‡u Ä‘Ã³.
            // ============================================================
            let isGeminiAuthRunning = false; // TrÃ¡nh má»Ÿ nhiá»u láº§n

            const launchStealthLogin = async (loginUrl, webviewContents) => {
                if (isGeminiAuthRunning) return;
                isGeminiAuthRunning = true;
                sendToRenderer("tools-log", "[Gemini-Auth] Äang má»Ÿ Chrome tháº­t Ä‘á»ƒ Ä‘Äƒng nháº­p...");

                const CHROME_DEBUG_PORT = 9224;
                let syncInterval = null;

                try {
                    const realChromePath = getChromePath();
                    if (!realChromePath) {
                        sendToRenderer("tools-log", "[Gemini-Auth] âŒ KhÃ´ng tÃ¬m tháº¥y Chrome trÃªn mÃ¡y!");
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

                    sendToRenderer("tools-log", `[Gemini-Auth] Má»Ÿ: ${realChromePath}`);
                    const chromeProcess = require('child_process').spawn(realChromePath, chromeArgs, {
                        detached: false,
                        stdio: 'ignore'
                    });

                    // Chá» Chrome khá»Ÿi Ä‘á»™ng xong (2 giÃ¢y)
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    sendToRenderer("tools-log", "[Gemini-Auth] Äang káº¿t ná»‘i vÃ o Chrome...");

                    // Káº¿t ná»‘i vÃ o Chrome Ä‘ang cháº¡y qua remote debugging
                    let stealthBrowser;
                    try {
                        stealthBrowser = await puppeteer.connect({
                            browserURL: `http://127.0.0.1:${CHROME_DEBUG_PORT}`,
                            defaultViewport: null
                        });
                    } catch (connectErr) {
                        // Thá»­ láº¡i sau 3 giÃ¢y náº¿u Chrome chÆ°a sáºµn sÃ ng
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        stealthBrowser = await puppeteer.connect({
                            browserURL: `http://127.0.0.1:${CHROME_DEBUG_PORT}`,
                            defaultViewport: null
                        });
                    }

                    sendToRenderer("tools-log", "[Gemini-Auth] âœ… ÄÃ£ káº¿t ná»‘i Chrome! HÃ£y Ä‘Äƒng nháº­p Google...");

                    // DÃ¹ng vÃ²ng láº·p kiá»ƒm tra URL liÃªn tá»¥c trÃªn táº¥t cáº£ cÃ¡c tab
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

                    // Äáº£m báº£o window ná»•i lÃªn trÃªn cÃ¹ng (focus)
                    try {
                        const pages = await stealthBrowser.pages();
                        if (pages.length > 0) {
                            await pages[0].bringToFront();
                        }
                    } catch (e) { }

                    try {
                        let isLoggedIn = false;
                        let checkCount = 0;
                        while (!isLoggedIn && checkCount < 300) { // Timeout 5 phÃºt (300 * 1s)
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
                        sendToRenderer("tools-log", "[Gemini-Auth] Popup Ä‘Ã£ bá»‹ Ä‘Ã³ng hoáº·c háº¿t giá»!");
                        if (syncInterval) clearInterval(syncInterval);
                        try { await stealthBrowser.close(); } catch (e) { }
                        try { chromeProcess.kill(); } catch (e) { }
                        isGeminiAuthRunning = false;

                        if (!webviewContents.isDestroyed()) {
                            webviewContents.loadURL('https://gemini.google.com/app?hl=vi');
                        }
                        return;
                    }

                    sendToRenderer("tools-log", "[Gemini-Auth] ðŸŽ‰ ÄÄƒng nháº­p thÃ nh cÃ´ng! Äang xÃ¡c thá»±c vá»›i Gemini...");

                    // QUAN TRá»ŒNG: Sau khi login Google, cáº§n truy cáº­p gemini.google Ä‘á»ƒ domain Ä‘Ã³ táº¡o cookie xÃ¡c thá»±c riÃªng
                    let activePage = loginPage;
                    try {
                        if (activePage.isClosed()) {
                            const pages = await stealthBrowser.pages();
                            activePage = pages[pages.length - 1];
                        }
                        await activePage.goto('https://gemini.google.com/app?hl=vi', { waitUntil: 'networkidle2', timeout: 30000 });
                    } catch (navErr) {
                        sendToRenderer("tools-log", "[Gemini-Auth] âš ï¸ Gemini cháº­m táº£i, váº«n tiáº¿p tá»¥c láº¥y cookie...");
                        const pages = await stealthBrowser.pages();
                        if (pages.length > 0) activePage = pages[pages.length - 1];
                    }

                    // Chá» thÃªm 2 giÃ¢y Ä‘á»ƒ cookie á»•n Ä‘á»‹nh
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    sendToRenderer("tools-log", "[Gemini-Auth] Äang chuyá»ƒn cookie...");

                    if (!activePage || activePage.isClosed()) {
                        throw new Error("KhÃ´ng tÃ¬m tháº¥y tab Ä‘á»ƒ láº¥y cookie!");
                    }

                    // Sync User-Agent Ä‘á»ƒ trÃ¡nh Google Ä‘Ã¡ vÄƒng do lá»‡ch fingerprint
                    try {
                        const chromeUA = await stealthBrowser.userAgent();
                        webviewContents.setUserAgent(chromeUA);
                        sendToRenderer("tools-log", `[Gemini-Auth] ÄÃ£ Ä‘á»“ng bá»™ User-Agent: ${chromeUA.substring(0, 30)}...`);

                        try {
                            const fs = require('fs');
                            const uaPath = require('path').join(app.getPath('userData'), 'chrome_ua.txt');
                            fs.writeFileSync(uaPath, chromeUA, 'utf-8');
                        } catch (e) { }
                    } catch (e) {
                        sendToRenderer("tools-log", `[Gemini-Auth] Lá»—i Ä‘á»“ng bá»™ UA: ${e.message}`);
                    }

                    // HÃºt TOÃ€N Bá»˜ cookie tá»« Chrome (khÃ´ng chá»‰ google.com)
                    const client = await activePage.createCDPSession();
                    const { cookies: allCookies } = await client.send('Network.getAllCookies');

                    // Láº¥y toÃ n bá»™ cookie Ä‘á»ƒ há»— trá»£ cáº£ Youtube, bÃªn thá»© 3 (trÃ¡nh bá»‹ thiáº¿u cookie session)
                    const googleCookies = allCookies;

                    sendToRenderer("tools-log", `[Gemini-Auth] Thu Ä‘Æ°á»£c ${googleCookies.length} cookie.`);

                    // Import cookie vÃ o Electron
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
                                // Náº¿u lÃ  session cookie, gÃ¡n thá»i gian 1 nÄƒm Ä‘á»ƒ trÃ¡nh máº¥t khi táº¯t á»©ng dá»¥ng
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
                            sendToRenderer("tools-log", `[Gemini-Auth] Lá»—i import cookie ${cookie.name}: ${cookieErr.message}`);
                            console.log(`[Gemini-Auth] Lá»—i import cookie ${cookie.name}: ${cookieErr.message}`);
                        }
                    }

                    sendToRenderer("tools-log", `[Gemini-Auth] âœ… ÄÃ£ import ${importedCount}/${googleCookies.length} cookie thÃ nh cÃ´ng!`);

                    // Äá»“ng bá»™ Local Storage vÃ  Session Storage láº§n cuá»‘i
                    // [Bá»Ž QUA] TrÃ¡nh lÃ m há»ng IndexedDB
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

                    // ÄÃ³ng Chrome
                    try {
                        await stealthBrowser.close();
                    } catch (closeErr) {
                        // Chrome cÃ³ thá»ƒ Ä‘Ã£ Ä‘Ã³ng
                    }
                    try { chromeProcess.kill(); } catch (e) { }

                    // Reload webview
                    if (!webviewContents.isDestroyed()) {
                        sendToRenderer("tools-log", "[Gemini-Auth] Äang táº£i láº¡i trang...");
                        webviewContents.reloadIgnoringCache();
                    }

                } catch (err) {
                    sendToRenderer("tools-log", `[Gemini-Auth] Lá»—i: ${err.message}`);
                } finally {
                    if (syncInterval) clearInterval(syncInterval);
                    isGeminiAuthRunning = false;
                }
            };



            // Báº¯t sá»± kiá»‡n khi user tá»± báº¥m vÃ o nÃºt Login tá»« lá»›p overlay
            contents.on('will-navigate', (e, url) => {
                if (url.includes('trigger-stealth-login')) {
                    e.preventDefault();
                    // Láº¥y chÃ­nh URL hiá»‡n táº¡i (cÃ³ chá»©a tham sá»‘ continue=... cá»§a trang gá»‘c) Ä‘á»ƒ Ä‘Äƒng nháº­p
                    launchStealthLogin(contents.getURL(), contents);
                }
            });

            // Báº¯t sá»± kiá»‡n má»Ÿ popup má»›i (nÃºt Sign In cÃ³ thá»ƒ má»Ÿ popup)
            contents.setWindowOpenHandler(({ url }) => {
                if (url.includes('accounts.google.com')) {
                    launchStealthLogin(url, contents);
                    return { action: 'deny' };
                }
                return { action: 'allow' };
            });

            // Báº¯t sá»± kiá»‡n ngÆ°á»i dÃ¹ng táº£i xuá»‘ng tá»« mÃ n hÃ¬nh phá»¥
            contents.session.on('will-download', (event, item, webContents) => {
                const fileName = item.getFilename();
                sendToRenderer("tools-log", `[Webview] Báº¯t Ä‘áº§u táº£i file: ${fileName}`);

                item.on('updated', (event, state) => {
                    if (state === 'interrupted') {
                        sendToRenderer("tools-log", "[Webview] Táº£i xuá»‘ng bá»‹ giÃ¡n Ä‘oáº¡n.");
                    } else if (state === 'progressing') {
                        if (item.isPaused()) {
                            sendToRenderer("tools-log", "[Webview] Táº£i xuá»‘ng bá»‹ táº¡m dá»«ng.");
                        }
                    }
                });

                item.once('done', (event, state) => {
                    if (state === 'completed') {
                        const localPath = item.getSavePath();
                        sendToRenderer("tools-log", `[Webview] Táº£i xuá»‘ng hoÃ n táº¥t: ${localPath}`);

                        // Gá»­i sá»± kiá»‡n cho Angular Frontend biáº¿t
                        if (mainWindow) {
                            mainWindow.webContents.send('webview-download-complete', {
                                file: localPath,
                                name: fileName
                            });
                        }
                    } else {
                        sendToRenderer("tools-log", `[Webview] Táº£i xuá»‘ng tháº¥t báº¡i: ${state}`);
                    }
                });
            });

            sendToRenderer("tools-log", "[Webview] ÄÃ£ Ä‘Ã­nh kÃ¨m tháº» webview má»›i vÃ o luá»“ng Download áº¢nh tá»± Ä‘á»™ng!");
        }
    });

    if (binaries.downloader) {
        downloaderProcess = execFile(binaries.downloader, [], (err, stdout, stderr) => {
            if (err) sendToRenderer("tools-log", `âŒ Downloader lá»—i: ${err}`);
            if (stdout) sendToRenderer("tools-log", `ðŸ“¥ Downloader: ${stdout}`);
            if (stderr) sendToRenderer("tools-log", `âš ï¸ Downloader stderr: ${stderr}`);
        });
    }

    // ===== EXTRACT LAST FRAME IPC =====
    ipcMain.handle("extract-last-frame-old", async (_event, videoPath) => {
        return new Promise((resolve, reject) => {
            if (!binaries.ffmpeg) {
                return reject(new Error("KhÃ´ng tÃ¬m tháº¥y FFmpeg"));
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

                sendToRenderer("tools-log", `[FFmpeg] TrÃ­ch xuáº¥t last frame: ${args.join(" ")}`);
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
                return reject(new Error("KhÃ´ng tÃ¬m tháº¥y FFmpeg"));
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
                        sendToRenderer("tools-log", `[FFmpeg] Sá»­ dá»¥ng láº¡i frames Ä‘Ã£ trÃ­ch xuáº¥t: ${tempDir}`);
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

                sendToRenderer("tools-log", `[FFmpeg] TrÃ­ch xuáº¥t frames: ${args.join(" ")}`);
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
                return reject(new Error("KhÃ´ng tÃ¬m tháº¥y FFmpeg"));
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

                sendToRenderer("tools-log", `[FFmpeg] TÃ¡ch audio: ${args.join(" ")}`);
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
                throw new Error("Thiáº¿u startDate hoáº·c endDate");
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
            sendToRenderer("tools-log", `[GSC] Lá»—i: ${e.message}`);
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
                    error: "KhÃ´ng cÃ³ lá»‡nh nÃ o Ä‘Æ°á»£c gá»­i",
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
                        // Náº¿u Webview Ä‘Ã£ má»Ÿ, cháº¡y script trá»±c tiáº¿p lÃªn Ä‘Ã³ luÃ´n
                        createImageByDreamina(data.url, uniqueID, {
                            outDir: data.outDir || defaultOutDir,
                            maxImages: data.maxImages || 100,
                            filenamePrefix: data.filenamePrefix || "dream_",
                            prompt: data.prompt,
                        });
                    } else {
                        // Náº¿u chÆ°a má»Ÿ (cháº¡y ná»n), gá»i popup nhÆ° cÅ©
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
                                `[FB-Login] ÄÃ£ set cookies tá»« file: ${data.cookiePath}`,
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
                        event.reply("tools-response", { error: "Thiáº¿u uniqueID!" });
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
                            `[FB-Crawl] ðŸš€ Khá»Ÿi cháº¡y quÃ©t Facebook qua Web Tools...`
                        );
                        facebookCrawl(data);
                    } else if (data.cookiePath && fs.existsSync(data.cookiePath)) {
                        setFacebookCookiesFromFile(data.cookiePath).then(() => {
                            sendToRenderer(
                                "tools-log",
                                `[FB-Crawl] ÄÃ£ set cookies tá»« file: ${data.cookiePath}`,
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
                                    `[TikTok] ðŸš€ Cháº¿ Ä‘á»™ quÃ©t hÃ¬nh áº£nh kÃ­ch hoáº¡t cho @${username}`,
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

                                // Láº®NG NGHE Dá»® LIá»†U Tá»ª PRELOAD
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
                                    await new Promise((r) => setTimeout(r, 3500)); // Äá»£i lÃ¢u chÃºt Ä‘á»ƒ áº£nh ká»‹p load

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
                                    `[TikTok] âœ… HoÃ n táº¥t quÃ©t kÃªnh.`,
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
                                    `[TikTok] âŒ Lá»—i: ${err.message}`,
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
                    // Láº¥y width, height tá»« data (náº¿u UI khÃ´ng gá»­i thÃ¬ dÃ¹ng máº·c Ä‘á»‹nh cá»§a hÃ m)
                    const w = data.width || 1200;
                    const h = data.height || 800;

                    // Gá»i hÃ m vá»›i tham sá»‘ má»›i
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
                    // createTargetWindow cá»§a báº¡n Ä‘Ã£ cÃ³ cÆ¡ cháº¿ callback(url, id) khi 'did-finish-load'
                    // ChÃºng ta sáº½ gá»i zaloCrawlDirect ngay táº¡i Ä‘Ã³.
                    createTargetWindow(data.url, () => {
                        // targetWindow lÃºc nÃ y Ä‘Ã£ Ä‘Æ°á»£c khá»Ÿi táº¡o trong scope cá»§a main.js
                        zaloCrawlDirect(targetWindow, uniqueID);
                    }, uniqueID);
                    break;
                }
                default:
                    event.reply("tools-response", {
                        error: "Command khÃ´ng há»— trá»£!",
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

    // (ÄÃ£ chuyá»ƒn web-contents-created lÃªn Ä‘áº§u file)

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

    // Táº¯t phÃ­m táº¯t global CTRL+SHIFT+R Ä‘á»ƒ trÃ¡nh xung Ä‘á»™t
    // TÃ­nh nÄƒng refresh Ä‘Æ°á»£c xá»­ lÃ½ qua Menu "Hiá»ƒn thá»‹" (View Menu)

    // ==========================================
    // AUTO UPDATER (Cáº¬P NHáº¬T Tá»° Äá»˜NG)
    // ==========================================
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
        sendToRenderer("tools-log", '[AutoUpdate] Äang kiá»ƒm tra phiÃªn báº£n má»›i...');
    });

    autoUpdater.on('update-available', (info) => {
        sendToRenderer("tools-log", `[AutoUpdate] TÃ¬m tháº¥y phiÃªn báº£n má»›i: ${info.version}`);
    });

    autoUpdater.on('update-not-available', (info) => {
        sendToRenderer("tools-log", '[AutoUpdate] Báº¡n Ä‘ang dÃ¹ng phiÃªn báº£n má»›i nháº¥t.');
    });

    autoUpdater.on('error', (err) => {
        sendToRenderer("tools-log", `[AutoUpdate] Lá»—i kiá»ƒm tra cáº­p nháº­t: ${err.message}`);
    });

    autoUpdater.on('download-progress', (progressObj) => {
        const speed = Math.round(progressObj.bytesPerSecond / 1024);
        const percent = Math.round(progressObj.percent);
        sendToRenderer("tools-log", `[AutoUpdate] Tá»‘c Ä‘á»™ táº£i: ${speed}KB/s - ÄÃ£ táº£i ${percent}%`);
    });

    autoUpdater.on('update-downloaded', (info) => {
        sendToRenderer("tools-log", '[AutoUpdate] Táº£i hoÃ n táº¥t! á»¨ng dá»¥ng sáº½ Ä‘Æ°á»£c cáº­p nháº­t.');
        dialog.showMessageBox({
            type: 'info',
            title: 'Cáº­p nháº­t pháº§n má»m',
            message: `ÄÃ£ táº£i xong phiÃªn báº£n má»›i (${info.version}). Báº¡n cÃ³ muá»‘n cÃ i Ä‘áº·t vÃ  khá»Ÿi Ä‘á»™ng láº¡i ngay bÃ¢y giá»?`,
            buttons: ['CÃ i Ä‘áº·t ngay', 'Äá»ƒ sau']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    // Báº¯t buá»™c cáº¥u hÃ¬nh URL cho mÃ´i trÆ°á»ng dev Ä‘á»ƒ test
    if (!app.isPackaged) {
        try {
            const pkg = require(require('path').join(__dirname, '..', 'package.json'));
            app.getVersion = () => pkg.version; // Ã‰p app Ä‘á»c Ä‘Ãºng version tá»« package.json thay vÃ¬ version cá»§a lÃµi Electron
        } catch (e) { }

        autoUpdater.forceDevUpdateConfig = true;
        autoUpdater.setFeedURL("https://ai.type.vn/phan-mem/");
    }

    // Báº¯t Ä‘áº§u kiá»ƒm tra cáº­p nháº­t ngay cáº£ trong Dev
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        sendToRenderer("tools-log", `[AutoUpdate] Lá»—i khi cháº¡y updater: ${err.message}`);
    });
});

// Há»§y Ä‘Äƒng kÃ½ khi á»©ng dá»¥ng Ä‘Ã³ng Ä‘á»ƒ trÃ¡nh rÃ² rá»‰ bá»™ nhá»›
app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (serviceProcess) serviceProcess.kill("SIGTERM");
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.on('resize-window', (event, { width, height }) => {
    // Láº¥y cá»­a sá»• hiá»‡n táº¡i Ä‘ang Ä‘Æ°á»£c focus (hoáº·c mainWindow)
    const win = BrowserWindow.getFocusedWindow() || mainWindow;

    if (win) {
        // Äá»•i kÃ­ch thÆ°á»›c cá»­a sá»• (true = cÃ³ hiá»‡u á»©ng animation resize mÆ°á»£t mÃ  trÃªn macOS/Windows)
        win.setSize(width, height, true);

        // CÄƒn giá»¯a cá»­a sá»• láº¡i ra giá»¯a mÃ n hÃ¬nh Ä‘á»ƒ khÃ´ng bá»‹ láº¹m ra ngoÃ i
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
// Google Analytics 4 (GA4) â€“ Data API (IPC: ga:report)
// =====================================================================

// Náº¿u báº¡n muá»‘n set máº·c Ä‘á»‹nh property ID qua biáº¿n mÃ´i trÆ°á»ng:
const GA_DEFAULT_PROPERTY_ID = process.env.GA_PROPERTY_ID || "293654701";

// âœ… ÄÆ¯á»œNG DáºªN Máº¶C Äá»ŠNH: C:\Users\<User>\Documents\ai.type\ga4-service.json
const GA_KEY_FILE_DEFAULT = path.join(
    documentsDir,
    "ai.type",
    "ga4-service.json",
);

function resolveGaKeyFile() {
    // 1) Æ¯u tiÃªn: GA_KEY_FILE trong biáº¿n mÃ´i trÆ°á»ng
    if (process.env.GA_KEY_FILE && fileExists(process.env.GA_KEY_FILE)) {
        return process.env.GA_KEY_FILE;
    }

    // 2) Máº·c Ä‘á»‹nh: Documents\ai.type\ga4-service.json (trÆ°á»ng há»£p cá»§a báº¡n)
    if (fileExists(GA_KEY_FILE_DEFAULT)) {
        return GA_KEY_FILE_DEFAULT;
    }

    // 3) Khi Ä‘Ã³ng gÃ³i: resources/ga4-service.json
    if (process.resourcesPath) {
        const candidateRes = path.join(
            process.resourcesPath,
            "ga4-service.json",
        );
        if (fileExists(candidateRes)) return candidateRes;
    }

    // 4) Khi cháº¡y dev: Ä‘áº·t ga4-service.json cáº¡nh main.js (../ga4-service.json)
    const candidateDev = path.join(__dirname, "..", "ga4-service.json");
    if (fileExists(candidateDev)) return candidateDev;

    return null;
}

let gaAuth = null;

async function getGaAccessToken() {
    const keyFile = resolveGaKeyFile();
    if (!keyFile) {
        throw new Error(
            "KhÃ´ng tÃ¬m tháº¥y file ga4-service.json. " +
            "HÃ£y lÆ°u file service account JSON vÃ o C:\\Users\\<User>\\Documents\\ai.type\\ga4-service.json, " +
            "hoáº·c set env GA_KEY_FILE, hoáº·c copy vÃ o resources/ga4-service.json.",
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
        throw new Error("KhÃ´ng láº¥y Ä‘Æ°á»£c access token cho Google Analytics 4");
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
            throw new Error("Thiáº¿u startDate hoáº·c endDate cho GA4");
        }

        const propId = propertyId || GA_DEFAULT_PROPERTY_ID;
        if (!propId) {
            throw new Error(
                "Thiáº¿u GA4 property ID. " +
                "HÃ£y nháº­p trong UI hoáº·c set biáº¿n mÃ´i trÆ°á»ng GA_PROPERTY_ID.",
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
                                    `KhÃ´ng parse Ä‘Æ°á»£c JSON tá»« GA4 API (status ${res.statusCode})`,
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
            `[GA4] Lá»—i: ${(err && err.message) || String(err)}`,
        );
        return {
            success: false,
            error: err.message || String(err),
        };
    }
});

async function zaloCrawlDirect(tWindow, uniqueID) {
    if (!tWindow) return;

    sendToRenderer("tools-log", "[Zalo-Direct] ðŸš€ Äang trÃ­ch xuáº¥t dá»¯ liá»‡u tá»« 44 báº£ng...");

    try {
        // Thá»±c thi script láº¥y toÃ n bá»™ dá»¯ liá»‡u tá»« IndexedDB
        const result = await tWindow.webContents.executeJavaScript(`
            (async () => {
                try {
                    const uid = localStorage.getItem('sh_zlast_uid');
                    if (!uid) return { error: "KhÃ´ng tháº¥y UID" };
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
            sendToRenderer("tools-log", "[Zalo-Direct] âš ï¸ " + result.error);
        } else {
            // --- PHáº¦N GHI FILE ---
            const timestamp = new Date().getTime();
            const fileName = `zalo_dump_${result.uid}_${timestamp}.json`;
            // LÆ°u vÃ o Documents/ai.type/data/ (giá»‘ng cÃ¡c project khÃ¡c cá»§a báº¡n)
            const saveDir = path.join(os.homedir(), "Documents", "ai.type", "data", "zalo");

            if (!fs.existsSync(saveDir)) {
                fs.mkdirSync(saveDir, { recursive: true });
            }

            const filePath = path.join(saveDir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2), "utf-8");

            sendToRenderer("tools-log", `[Zalo-Direct] âœ… ÄÃ£ lÆ°u file: ${filePath}`);

            // Tráº£ vá» response cÃ³ chá»©a 'path' Ä‘á»ƒ Angular khÃ´ng bá»‹ undefined
            sendToRenderer("tools-response", {
                action: "zalo-crawl",
                success: true,
                path: filePath, // ÄÆ°á»ng dáº«n file thá»±c táº¿
                uid: result.uid
            });
        }
    } catch (e) {
        sendToRenderer("tools-log", "[Zalo-Direct] âŒ Lá»—i: " + e.message);
    }
}

// =====================================================================
// [RENDER VIDEO] CÃC HÃ€M TIá»†N ÃCH DÃ€NH RIÃŠNG CHO RENDER FFmpeg
// =====================================================================

function cleanFilePath(fileUrl) {
    if (!fileUrl) return '';
    let p = fileUrl;

    if (p.startsWith('file://')) {
        try {
            const url = require('url');
            p = url.fileURLToPath(p);
        } catch (e) {
            p = p.substring(7); // Giá»¯ láº¡i dáº¥u / Ä‘áº§u tiÃªn
            if (process.platform === 'win32' && p.match(/^\/[a-zA-Z]:/)) {
                p = p.substring(1);
            }
        }
    }

    try {
        p = decodeURIComponent(p); // Giáº£i mÃ£ %20 thÃ nh dáº¥u cÃ¡ch
    } catch (e) { }

    // Äá»•i gáº¡ch chÃ©o thÃ nh gáº¡ch chÃ©o ngÆ°á»£c chuáº©n cá»§a Windows
    if (process.platform === 'win32') {
        p = p.replace(/\//g, '\\');
    }

    return p;
}

async function getAudioDuration(filePath) {
    const ffmpegCmd = binaries.ffmpeg || "ffmpeg"; // Fallback vá» system náº¿u file Ä‘i kÃ¨m bá»‹ lá»—i/máº¥t
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
// IPC HANDLER: RENDER CUSTOM VIDEO CHUáº¨N STUDIO (CHá»NG Lá»†CH AUDIO)
// =====================================================================

/**
 * Cháº¡y FFmpeg báº±ng spawn Ä‘á»ƒ xá»­ lÃ½ tham sá»‘ chÃ­nh xÃ¡c hÆ¡n exec
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
            return { success: false, error: "Thiáº¿u FFmpeg binary." };
        }

        // sendToRenderer("tools-log", `[Render] Äang sá»­ dá»¥ng phÆ°Æ¡ng thá»©c Spawn (Array Args)...`);
        sendNotification("Xuáº¥t video", `Äang khá»Ÿi táº¡o render: ${projectData.title}`);

        // 1. Cáº¥u hÃ¬nh khung hÃ¬nh
        let w = 1080, h = 1920;
        if (projectData.exportRatio === '16:9') { w = 1920; h = 1080; }
        else if (projectData.exportRatio === '1:1') { w = 1080; h = 1080; }

        const includeSubtitle = projectData.withSubtitle === true;
        const workspaceDir = path.join(app.getPath('documents'), 'ai.type', 'data', 'exports', projectData.uuid || Date.now().toString());

        if (fs.existsSync(workspaceDir)) fs.rmSync(workspaceDir, { recursive: true, force: true });
        fs.mkdirSync(workspaceDir, { recursive: true });

        const sceneVideos = [];
        let finalAudioListContent = "ffconcat version 1.0\n";

        // --- BÆ¯á»šC 1: Xá»¬ LÃ Tá»ªNG SCENE ---
        for (let i = 0; i < projectData.scenes.length; i++) {
            const scene = projectData.scenes[i];

            // Há»— trá»£ cáº¥u trÃºc má»›i: hÃ¬nh áº£nh cÃ³ thá»ƒ náº±m trong máº£ng videos
            let sceneImg = scene.imageUrl;
            if (!sceneImg && scene.videos && scene.videos.length > 0) {
                const validVideo = scene.videos.find(v => v.imageUrl);
                if (validVideo) sceneImg = validVideo.imageUrl;
            }

            const originalImgPath = cleanFilePath(sceneImg);

            if (!originalImgPath || !fs.existsSync(originalImgPath) || !scene.subtitles?.length) continue;

            // Copy input vÃ o workspace Ä‘á»ƒ sáº¡ch Ä‘Æ°á»ng dáº«n
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

                // Chuáº©n hÃ³a Audio báº±ng spawn
                await spawnFFmpeg(['-y', '-i', originalAudioPath, '-ar', '44100', '-ac', '2', wavName], workspaceDir);

                const durationSec = await getAudioDuration(path.join(workspaceDir, wavName));
                const durationMs = Math.round(durationSec * 1000);

                mergedVtt += `${formatVttTime(sceneDurationMs)} --> ${formatVttTime(sceneDurationMs + durationMs)}\n${sub.text.replace(/\n/g, ' ')}\n\n`;
                sceneDurationMs += durationMs;
                finalAudioListContent += `file '${wavName}'\n`;
            }

            const sceneDurationSec = (sceneDurationMs / 1000).toFixed(3);
            const sceneVideoName = `scene_${i}.mp4`;

            // Xá»­ lÃ½ Video Filter
            let videoFilter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
            if (includeSubtitle) {
                const vttName = `scene_${i}.vtt`;
                fs.writeFileSync(path.join(workspaceDir, vttName), mergedVtt, 'utf-8');
                // LÆ°u Ã½: DÃ¹ng dáº¥u nhÃ¡y Ä‘Æ¡n lá»“ng nhau cho tham sá»‘ filename bÃªn trong filter
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

        // --- BÆ¯á»šC 2: Gá»˜P AUDIO Tá»”NG ---
        if (finalAudioListContent.trim() === "ffconcat version 1.0" || sceneVideos.length === 0) {
            throw new Error('Dá»¯ liá»‡u Render trá»‘ng. HÃ£y Ä‘áº£m báº£o báº¡n Ä‘Ã£ táº£i Ä‘áº§y Ä‘á»§ hÃ¬nh áº£nh vÃ  file audio cho cÃ¡c phÃ¢n cáº£nh (KhÃ´ng bá»‹ xÃ³a máº¥t file gá»‘c dÆ°á»›i mÃ¡y tÃ­nh).');
        }

        fs.writeFileSync(path.join(workspaceDir, 'audios.txt'), finalAudioListContent);
        await spawnFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', 'audios.txt', '-ar', '44100', '-ac', '2', 'final_audio.wav'], workspaceDir);

        // --- BÆ¯á»šC 3: Gá»˜P VIDEO Tá»”NG ---
        const videoListContent = "ffconcat version 1.0\n" + sceneVideos.map(v => `file '${v}'`).join('\n') + '\n';
        fs.writeFileSync(path.join(workspaceDir, 'videos.txt'), videoListContent);
        await spawnFFmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', 'videos.txt', '-c', 'copy', 'final_video_muted.mp4'], workspaceDir);

        // --- BÆ¯á»šC 4: MUXING & EXPORT ---
        const safeTitle = projectData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const finalExportPath = path.join(app.getPath('documents'), 'ai.type', 'data', 'exports', `${safeTitle}_${Date.now()}.mp4`);

        await spawnFFmpeg(['-y', '-i', 'final_video_muted.mp4', '-i', 'final_audio.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', 'output.mp4'], workspaceDir);

        fs.copyFileSync(path.join(workspaceDir, 'output.mp4'), finalExportPath);

        sendNotification("ThÃ nh CÃ´ng!", `Video cá»§a báº¡n Ä‘Ã£ sáºµn sÃ ng`);

        return { success: true, path: finalExportPath, url: `file://${finalExportPath}` };
    } catch (err) {
        console.error("Spawn Render Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('apply-rvc', async (event, payload) => {
    try {
        const { inputAudio, outputAudio, pitch, pthPath, indexPath } = payload;
        const fs = require('fs'); // Äáº£m báº£o cÃ³ thÆ° viá»‡n xá»­ lÃ½ file

        // CHá»NG Lá»–I CÃ‚M (0 BYTES): Báº¯t Python xuáº¥t ra file táº¡m trÆ°á»›c
        const tempOutput = inputAudio + ".tmp.wav";

        sendToRenderer("tools-log", `[RVC] Äang gá»i API biáº¿n Ä‘á»•i giá»ng...`);

        const response = await fetch('http://127.0.0.1:7890/api/rvc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: inputAudio,
                model: pthPath,
                index: indexPath || "",
                output: tempOutput, // <--- Ã‰P PYTHON GHI VÃ€O FILE Táº M
                pitch: pitch || 0
            })
        });

        const data = await response.json();

        if (data.success && fs.existsSync(tempOutput)) {
            // KHI PYTHON LÃ€M XONG -> Láº¤Y FILE Táº M GHI ÄÃˆ THáº²NG LÃŠN FILE OUTPUT
            if (fs.existsSync(outputAudio)) {
                try { fs.unlinkSync(outputAudio); } catch (e) { } // XÃ³a output cÅ© náº¿u cÃ³
            }
            fs.renameSync(tempOutput, outputAudio); // Di chuyá»ƒn file táº¡m thÃ nh output chÃ­nh

            // Náº¿u file Ä‘áº§u vÃ o lÃ  .mp3, mÃ  output lÃ  .wav, ta dá»n sáº¡ch luÃ´n file .mp3 gá»‘c cho rá»—ng thÃ¹ng rÃ¡c
            if (inputAudio !== outputAudio && fs.existsSync(inputAudio)) {
                try { fs.unlinkSync(inputAudio); } catch (e) { }
            }

            sendToRenderer("tools-log", `[RVC] âœ… ÄÃ£ biáº¿n Ä‘á»•i vÃ  ghi Ä‘Ã¨ file thÃ nh cÃ´ng!`);
            return { success: true, path: outputAudio };
        } else {
            sendToRenderer("tools-log", `[RVC] âŒ Lá»—i tá»« API: ${data.error}`);
            return { success: false, error: data.error };
        }
    } catch (error) {
        sendToRenderer("tools-log", `[RVC] âŒ Máº¥t káº¿t ná»‘i tá»›i Python API: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// ThÃªm vÃ o trong app.whenReady() hoáº·c khu vá»±c Ä‘á»‹nh nghÄ©a ipcMain
ipcMain.handle("tts-ausync-generate", async (event, payload) => {
    const { text, voice_id, speed, filename, username, key } = payload;

    try {
        // BÆ¯á»šC 1: POST yÃªu cáº§u táº¡o Audio vá»›i Ä‘áº§y Ä‘á»§ cÃ¡c trÆ°á»ng báº¯t buá»™c
        const postRes = await fetch("https://api.ausynclab.io/api/v1/speech/text-to-speech", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": key
            },
            body: JSON.stringify({
                "audio_name": filename, // Sá»­ dá»¥ng tÃªn file lÃ m tÃªn audio
                "text": text,
                "voice_id": parseInt(voice_id),
                "speed": speed || 1.0,
                "model_name": "myna-2", // Model báº¯t buá»™c theo yÃªu cáº§u
                "language": "vi",       // NgÃ´n ngá»¯ tiáº¿ng Viá»‡t
                "callback_url": ""      // Äá»ƒ trá»‘ng vÃ¬ chÃºng ta dÃ¹ng cÆ¡ cháº¿ Polling (há»i liÃªn tá»¥c)
            })
        });

        const postData = await postRes.json();

        // Kiá»ƒm tra mÃ£ tráº¡ng thÃ¡i tá»« API
        if (postData.status !== 200 || !postData.result || !postData.result.audio_id) {
            throw new Error(postData.message || "KhÃ´ng thá»ƒ khá»Ÿi táº¡o audio trÃªn AusyncLab. Kiá»ƒm tra láº¡i API Key hoáº·c Voice ID.");
        }

        const audioId = postData.result.audio_id;
        let audioUrl = "";
        let attempts = 0;

        // BÆ¯á»šC 2: Polling GET Ä‘á»ƒ chá» file hoÃ n thÃ nh (GET https://api.ausynclab.io/api/v1/speech/{audio_id})
        sendToRenderer("tools-log", `[AusyncLab] Äang xá»­ lÃ½ Audio ID: ${audioId}...`);

        while (attempts < 200) { // TÄƒng lÃªn 20 láº§n (khoáº£ng 400 giÃ¢y) cho an toÃ n
            const getRes = await fetch(`https://api.ausynclab.io/api/v1/speech/${audioId}`, {
                headers: { "x-api-key": key }
            });
            const getData = await getRes.json();

            if (getData.status === 200 && getData.result.state === "SUCCEED") {
                audioUrl = getData.result.audio_url; // Láº¥y URL file .wav thÃ nh pháº©m
                break;
            } else if (getData.result.state === "FAILED") {
                throw new Error("AusyncLab bÃ¡o lá»—i khi Ä‘ang xá»­ lÃ½ chuyá»ƒn Ä‘á»•i vÄƒn báº£n.");
            }

            // Äá»£i 2 giÃ¢y trÆ°á»›c khi há»i láº¡i
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!audioUrl) throw new Error("QuÃ¡ thá»i gian chá» (Timeout) - API chÆ°a tráº£ vá» link download.");

        // BÆ¯á»šC 3: Táº£i file vá» thÆ° má»¥c cá»¥c bá»™ giá»‘ng generateEdgeTTSLocal
        const documentsPath = app.getPath("documents");
        const saveDir = path.join(documentsPath, "ai.type", "data", "tts", username);
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

        // XÃ¡c Ä‘á»‹nh Ä‘Æ°á»ng dáº«n file cuá»‘i cÃ¹ng (thÆ°á»ng Ausync tráº£ vá» .wav)
        const filePath = path.join(saveDir, `${filename}.wav`);

        const fileRes = await fetch(audioUrl);
        if (!fileRes.ok) throw new Error("KhÃ´ng thá»ƒ káº¿t ná»‘i tá»›i mÃ¡y chá»§ lÆ°u trá»¯ audio Ä‘á»ƒ táº£i file.");

        const buffer = await fileRes.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return {
            success: true,
            filePath: filePath // Tráº£ vá» Ä‘Æ°á»ng dáº«n Ä‘á»ƒ Angular load vÃ o WaveSurfer
        };

    } catch (error) {
        console.error("AusyncLab TTS Error:", error);
        return { success: false, error: error.message };
    }
});

// ThÃªm má»™t Set á»Ÿ Ä‘áº§u file Ä‘á»ƒ lÆ°u trá»¯ cÃ¡c task Ä‘ang cháº¡y
const activeTtsTasks = new Set();

ipcMain.handle("tts-type-generate", async (event, payload) => {
    const { text, voice_id, speed, ref_audio_name, ref_text, num_step, filename, username } = payload;

    // Äá»‹nh nghÄ©a Base URL cá»§a API
    const API_BASE_URL = "https://tts.type.vn";

    try {
        // BÆ¯á»šC 1: POST yÃªu cáº§u lÃªn endpoint _async Ä‘á»ƒ láº¥y task_id
        sendToRenderer("tools-log", `[Type TTS] Äang gá»­i yÃªu cáº§u táº¡o audio cho: ${filename}...`);

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

        if (!taskId) throw new Error("API khÃ´ng tráº£ vá» Task ID");

        // Bá»Ž TASK ID VÃ€O Sá»” THEO DÃ•I
        if (taskId) activeTtsTasks.add(taskId);

        // BÆ¯á»šC 2: Polling (Há»i thÄƒm) xem file Ä‘Ã£ xong chÆ°a
        sendToRenderer("tools-log", `[Type TTS] Äang xá»­ lÃ½ Audio (Task ID: ${taskId})...`);

        let downloadPath = "";
        let attempts = 0;

        while (attempts < 900) { // TÄƒng Timeout lÃªn 30 phÃºt (1800 giÃ¢y) Ä‘á»ƒ cho mÃ¡y chá»§ tháº£nh thÆ¡i xá»­ lÃ½
            // === THÃŠM ÄOáº N NÃ€Y ===
            // Náº¿u taskId Ä‘Ã£ bá»‹ hÃ m cancel-tts xÃ³a khá»i sá»•, láº­p tá»©c dá»«ng vÃ²ng láº·p
            if (!activeTtsTasks.has(taskId)) {
                throw new Error("Task Ä‘Ã£ bá»‹ há»§y bá»Ÿi ngÆ°á»i dÃ¹ng.");
            }
            // =====================

            const statusRes = await fetch(`${API_BASE_URL}/status/${taskId}`);
            const statusData = await statusRes.json();

            // Cáº­p nháº­t thÃªm viá»‡c báº¯t tráº¡ng thÃ¡i cancelled tá»« server (náº¿u cÃ³)
            if (statusData.status === "done") {
                downloadPath = statusData.download_url;
                break;
            } else if (statusData.status === "error" || statusData.status === "cancelled") {
                throw new Error(statusData.message || "QuÃ¡ trÃ¬nh táº¡o audio Ä‘Ã£ bá»‹ dá»«ng hoáº·c lá»—i.");
            }

            // Chá» 2 giÃ¢y trÆ°á»›c khi há»i láº¡i
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!downloadPath) throw new Error("QuÃ¡ thá»i gian chá» (Timeout) - API cháº¡y quÃ¡ lÃ¢u.");

        // BÆ¯á»šC 3: Táº£i file audio vá» mÃ¡y tÃ­nh
        sendToRenderer("tools-log", `[Type TTS] ÄÃ£ xá»­ lÃ½ xong, Ä‘ang táº£i file vá»...`);

        // KHI NÃ€O Táº¢I XONG FILE, XÃ“A TASK KHá»ŽI Sá»”
        activeTtsTasks.delete(taskId);

        const fileRes = await fetch(`${API_BASE_URL}${downloadPath}`);
        if (!fileRes.ok) throw new Error("KhÃ´ng thá»ƒ táº£i file Ã¢m thanh tá»« server.");

        const arrayBuffer = await fileRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Thiáº¿t láº­p Ä‘Æ°á»ng dáº«n lÆ°u cá»¥c bá»™
        const documentsPath = app.getPath("documents");
        const saveDir = path.join(documentsPath, "ai.type", "data", "tts", username || "default");

        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const safeFilename = filename.endsWith(".wav") ? filename : `${filename}.wav`;
        const filePath = path.join(saveDir, safeFilename);

        // Ghi file
        fs.writeFileSync(filePath, buffer);

        sendToRenderer("tools-log", `[Type TTS] âœ… ÄÃ£ lÆ°u file thÃ nh cÃ´ng táº¡i: ${filePath}`);

        return {
            success: true,
            filePath: filePath
        };

    } catch (error) {
        console.error("Type TTS Error:", error);
        sendToRenderer("tools-log", `[Type TTS] âŒ Lá»—i: ${error.message}`);
        return { success: false, error: error.message };
    }
});

// 2. THÃŠM Cá»”NG Má»šI Äá»‚ NHáº¬N Lá»†NH Há»¦Y Tá»ª ANGULAR
ipcMain.handle('cancel-tts', async (event) => {
    console.log('Nháº­n lá»‡nh há»§y tá»« UI. Äang há»§y cÃ¡c task:', Array.from(activeTtsTasks));

    const cancelPromises = [];

    // Duyá»‡t qua táº¥t cáº£ cÃ¡c task Ä‘ang cháº¡y ngáº§m vÃ  gá»i API há»§y
    for (const taskId of activeTtsTasks) {
        cancelPromises.push(
            fetch(`https://tts.type.vn/cancel_task/${taskId}`, { method: 'POST' })
                .catch(err => console.log(`Lá»—i há»§y task ${taskId}:`, err.message))
        );
    }

    // Äá»£i gá»­i lá»‡nh há»§y xong
    await Promise.all(cancelPromises);

    // XÃ³a sáº¡ch sá»•
    activeTtsTasks.clear();
    return { success: true };
});

ipcMain.handle('download-video', async (event, payload) => {
    try {
        const { urls } = payload;
        if (!urls || urls.length === 0) {
            return { success: false, error: 'KhÃ´ng cÃ³ URL há»£p lá»‡' };
        }

        const ytdlpPath = binaries.ytdlp || "yt-dlp";

        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        // Output template cho yt-dlp: Downloads/AI.TYPING/{channel_name}/{title}.{ext}
        const outputTemplate = path.join(aiTypingDir, '%(uploader)s', '%(title)s.%(ext)s');

        sendToRenderer("tools-log", `[Download] Äang tiáº¿n hÃ nh táº£i dá»¯ liá»‡u cháº¥t lÆ°á»£ng tá»‘t nháº¥t...`);

        for (let url of urls) {
            // Táº£i best video & audio
            const args = [
                '-o', outputTemplate,
                '--newline',
                '-f', 'bestvideo+bestaudio/best'
            ];
            if (binaries.ffmpeg) {
                args.push('--ffmpeg-location', binaries.ffmpeg);
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
                    else reject(new Error(`Tháº¥t báº¡i vá»›i mÃ£ thoÃ¡t: ${code}`));
                });
            });
        }

        sendNotification("Táº£i Video", "Táº£i video hoÃ n táº¥t vÃ o thÆ° má»¥c AI.TYPING!");
        return { success: true };

    } catch (err) {
        console.error("Download Video Error:", err);
        return { success: false, error: err.message };
    }
});

// =====================================================================
// XUáº¤T BÃO CÃO PDF Báº°NG IPC (Chá»¯a chÃ¡y lá»—i No Print Preview cá»§a Electron)
// =====================================================================
ipcMain.handle('export-gsc-pdf', async (event, payload) => {
    try {
        const { siteUrl, startDate, endDate } = payload || {};
        let safeDomain = "SEO_Report";
        if (siteUrl) safeDomain = siteUrl.replace(/https?:\/\//, '').replace(/[\/\\]/g, '_');

        const defaultName = `[AI.TYPE] ${safeDomain} (${startDate} to ${endDate}).pdf`;
        const defaultPath = path.join(app.getPath('downloads'), defaultName);

        // Hiá»ƒn thá»‹ há»™p thoáº¡i lÆ°u file há»‡ thá»‘ng
        const { filePath } = await dialog.showSaveDialog({
            title: 'LÆ°u bÃ¡o cÃ¡o SEO thÃ nh PDF',
            defaultPath: defaultPath,
            filters: [
                { name: 'PDF Document', extensions: ['pdf'] }
            ]
        });

        // Náº¿u ngÆ°á»i dÃ¹ng chá»n chá»— lÆ°u
        if (filePath) {
            sendToRenderer("tools-log", `[PDF] Äang káº¿t xuáº¥t trang web SEO Report thÃ nh PDF... vui lÃ²ng chá».`);

            // Xá»­ lÃ½ dá»©t Ä‘iá»ƒm Bug kinh Ä‘iá»ƒn: PrintToPDF luÃ´n rÃ² rá»‰ mÃ u ná»n #212121 cá»§a BrowserWindow ra thÃ nh mÃ u PDF Page
            const win = BrowserWindow.fromWebContents(event.sender);
            const originalColor = win.getBackgroundColor();
            win.setBackgroundColor('#ffffff');

            // Láº¥y ná»™i dung frontend (Ä‘ang hiá»ƒn thá»‹ mÃ n hÃ¬nh Report) vÃ  build thÃ nh PDF Vector (cá»±c nÃ©t, dáº¡ng text)
            const marginInches = 0.4;
            const pdfData = await event.sender.printToPDF({
                printBackground: true,
                landscape: true,
                pageSize: 'A4',
                margins: { marginType: 'custom', top: marginInches, bottom: marginInches, left: marginInches, right: marginInches },
                displayHeaderFooter: true,
                headerTemplate: `<div style="font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #888; width: 100%; text-align: left; padding-left: ${marginInches * 96}px;">BÃ¡o cÃ¡o Ä‘á» xuáº¥t chá»‰nh sá»­a SEO cho ${safeDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')} (${startDate} to ${endDate})</div>`,
                footerTemplate: `<div style="font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #888; width: 100%; text-align: right; padding-right: ${marginInches * 96}px;">Trang <span class="pageNumber"></span> / <span class="totalPages"></span></div>`
            });

            // Phá»¥c há»“i láº¡i mÃ u ná»n tá»‘i cá»§a cá»­a sá»• App
            win.setBackgroundColor(originalColor || '#212121');

            // Ghi file
            fs.writeFileSync(filePath, pdfData);
            sendToRenderer("tools-log", `âœ… ÄÃ£ lÆ°u PDF BÃ¡o CÃ¡o thÃ nh cÃ´ng táº¡i: ${filePath}`);
            sendNotification("BÃ¡o cÃ¡o SEO", "Xuáº¥t file PDF thÃ nh cÃ´ng!");

            return { success: true, filePath };
        } else {
            return { success: false, error: "ÄÃ£ há»§y lÆ°u file" }; // NgÆ°á»i dÃ¹ng áº¥n Cancel
        }
    } catch (err) {
        console.error("Lá»—i xuáº¥t PDF:", err);
        sendToRenderer("tools-log", `âŒ Lá»—i khi xuáº¥t PDF: ${err.message}`);
        return { success: false, error: err.message };
    }
});

// =====================================================================
// IPC HANDLER: CHá»ŒN FILE VIDEO Cá»¤C Bá»˜ QUA Há»˜P THOáº I Há»† THá»NG
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
// IPC HANDLER: Táº¢I VÃ€ PHÃ‚N TÃCH VIDEO OFFLINE Báº°NG YT-DLP VÃ€ FFMPEG
// =====================================================================
ipcMain.handle('analyze-video-local', async (event, payload) => {
    try {
        let { url, extractInterval } = payload;
        if (!url) {
            return { success: false, error: 'KhÃ´ng cÃ³ URL há»£p lá»‡' };
        }
        url = url.trim();

        const ytdlpPath = binaries.ytdlp || "yt-dlp";
        const ffmpegPath = binaries.ffmpeg || "ffmpeg";

        const downloadsPath = app.getPath('downloads');
        const aiTypingDir = path.join(downloadsPath, 'AI.TYPING');
        if (!fs.existsSync(aiTypingDir)) {
            fs.mkdirSync(aiTypingDir, { recursive: true });
        }

        // Táº¡o má»™t thÆ° má»¥c táº¡m thá»i riÃªng cho task nÃ y
        const timestamp = Date.now();
        const tempDir = path.join(aiTypingDir, `_temp_${timestamp}`);
        fs.mkdirSync(tempDir, { recursive: true });

        let isLocalFile = false;
        let videoPath = '';
        let subtitlesText = "";
        let videoFile = "";

        // Kiá»ƒm tra xem URL cÃ³ pháº£i lÃ  file local khÃ´ng
        if (fs.existsSync(url) && fs.statSync(url).isFile()) {
            isLocalFile = true;
            videoPath = url;
            videoFile = path.basename(url);
            sendToRenderer("tools-log", `[AI Analyze] Sá»­ dá»¥ng video tá»« mÃ¡y tÃ­nh: ${url}`);
        } else {
            // Náº¿u url giá»‘ng má»™t Ä‘Æ°á»ng dáº«n mÃ¡y tÃ­nh (báº¯t Ä‘áº§u báº±ng á»• Ä‘Ä©a C:\ hoáº·c D:\ hoáº·c /) nhÆ°ng khÃ´ng tá»“n táº¡i file
            if (/^[a-zA-Z]:\\/.test(url) || url.startsWith('/')) {
                return { success: false, error: `KhÃ´ng tÃ¬m tháº¥y file video trÃªn mÃ¡y tÃ­nh táº¡i: ${url}. CÃ³ thá»ƒ file Ä‘Ã£ bá»‹ xÃ³a hoáº·c Ä‘á»•i tÃªn.` };
            }

            // Táº£i video Ä‘á»™ phÃ¢n giáº£i vá»«a Ä‘á»§ Ä‘á»ƒ tÄƒng tá»‘c, KÃˆM THEO PHá»¤ Äá»€
            const outputTemplate = path.join(tempDir, 'video.%(ext)s');

            sendToRenderer("tools-log", `[AI Analyze] Äang táº£i video tá»« YouTube Ä‘á»ƒ phÃ¢n tÃ­ch...`);

            const ytdlpArgs = [
                '-o', outputTemplate,
                '--newline',
                '--ignore-errors',
                '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
                '--write-auto-subs',
                '--write-subs',
                '--sub-lang', 'vi,en.*'
            ];
            if (binaries.ffmpeg) {
                ytdlpArgs.push('--ffmpeg-location', binaries.ffmpeg);
            }

            // Bá»• sung cookie tá»« trÃ¬nh duyá»‡t Chrome Ä‘á»‘i vá»›i Facebook Ä‘á»ƒ trÃ¡nh bá»‹ cháº·n
            const cookiesTxtPath = path.join(__dirname, 'cookies.txt');
            const cookiesJsonPath = path.join(__dirname, 'cookies.json');

            let hasCustomCookies = false;

            if (fs.existsSync(cookiesTxtPath)) {
                ytdlpArgs.push('--cookies', cookiesTxtPath);
                hasCustomCookies = true;
            } else if (fs.existsSync(cookiesJsonPath)) {
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
                    ytdlpArgs.push('--cookies', tempCookiePath);
                    hasCustomCookies = true;
                } catch (err) {
                    console.error("Lá»—i Ä‘á»c file cookies.json", err);
                }
            }

            // Náº¿u khÃ´ng cÃ³ file cookie nÃ o Ä‘Æ°á»£c xuáº¥t, thÃ¬ má»›i dÃ¹ng cookie tá»« trÃ¬nh duyá»‡t Chrome
            if (!hasCustomCookies && (url.includes('facebook.com') || url.includes('fb.watch') || url.includes('fb.com'))) {
                ytdlpArgs.push('--cookies-from-browser', 'chrome');
            }

            ytdlpArgs.push(url);

            await new Promise((resolve, reject) => {
                const child = spawn(ytdlpPath, ytdlpArgs);
                child.stdout.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line && line.includes('[download]')) sendToRenderer("tools-log", `[AI Analyze] ${line}`);
                });
                child.stderr.on('data', (data) => {
                    const line = data.toString().trim();
                    if (line) sendToRenderer("tools-log", `[AI Analyze] ${line}`);
                });
                child.on('close', (code) => {
                    resolve();
                });
            });

            // TÃ¬m file video vÃ  phá»¥ Ä‘á» vá»«a táº£i vá» trong thÆ° má»¥c táº¡m
            const files = fs.readdirSync(tempDir);
            const foundVideoFile = files.find(f => f.startsWith('video.') && !f.endsWith('.vtt') && !f.endsWith('.srt') && !f.endsWith('.lrc') && !f.endsWith('.json'));
            const subtitleFile = files.find(f => f.startsWith('video.') && (f.endsWith('.vtt') || f.endsWith('.srt')));

            if (!foundVideoFile) {
                throw new Error('KhÃ´ng tÃ¬m tháº¥y video táº£i vá».');
            }

            videoFile = foundVideoFile;
            videoPath = path.join(tempDir, videoFile);
            if (subtitleFile) {
                try {
                    const subPath = path.join(tempDir, subtitleFile);
                    subtitlesText = fs.readFileSync(subPath, 'utf8');
                    sendToRenderer("tools-log", `[AI Analyze] ÄÃ£ láº¥y Ä‘Æ°á»£c phá»¥ Ä‘á» cá»§a video.`);
                } catch (e) { }
            }
        }

        sendToRenderer("tools-log", `[AI Analyze] Báº¯t Ä‘áº§u trÃ­ch xuáº¥t phÃ¢n cáº£nh vÃ  Ã¢m thanh...`);

        const framePattern = path.join(tempDir, 'frame_%03d.jpg');
        const audioPath = path.join(tempDir, 'audio.mp3');

        // Lá»‡nh FFmpeg: Cáº¯t frame áº£nh
        const interval = parseFloat(extractInterval) || 1;
        const fps = (1 / interval).toFixed(4); // vÃ­ dá»¥: 5s/frame => fps=0.2

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
                else reject(new Error(`TrÃ­ch xuáº¥t phÃ¢n cáº£nh tháº¥t báº¡i vá»›i mÃ£ thoÃ¡t: ${code}`));
            });
        });

        // Lá»‡nh FFmpeg: Cáº¯t Ã¢m thanh
        const ffmpegAudioArgs = [
            '-y',
            '-i', videoPath,
            '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', audioPath
        ];

        // Láº¥y Ã¢m thanh nhÆ°ng khÃ´ng lÃ m há»ng tiáº¿n trÃ¬nh náº¿u video khÃ´ng cÃ³ tiáº¿ng
        await new Promise((resolve) => {
            const child = spawn(ffmpegPath, ffmpegAudioArgs);
            child.on('close', () => {
                resolve();
            });
        });

        sendToRenderer("tools-log", `[AI Analyze] TrÃ­ch xuáº¥t thÃ nh cÃ´ng. Äang Ä‘Ã³ng gÃ³i dá»¯ liá»‡u gá»­i cho AI...`);

        // Äá»c cÃ¡c frame
        const allFiles = fs.readdirSync(tempDir);
        const frameFiles = allFiles.filter(f => f.startsWith('frame_') && f.endsWith('.jpg')).sort();

        // Giá»›i háº¡n tá»‘i Ä‘a 100 frames (tráº£i Ä‘á»u kháº¯p video) Ä‘á»ƒ AI nhÃ¬n Ä‘Æ°á»£c tá»•ng quan mÃ  khÃ´ng bá»‹ quÃ¡ táº£i token
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
            // Loáº¡i bá» cÃ¡c pháº§n tá»­ trÃ¹ng láº·p (náº¿u cÃ³ do lÃ m trÃ²n)
            selectedFrames = [...new Set(selectedFrames)];
        }

        const base64Frames = [];
        for (const frameFile of selectedFrames) {
            const framePath = path.join(tempDir, frameFile);
            const data = fs.readFileSync(framePath);
            base64Frames.push(`data:image/jpeg;base64,${data.toString('base64')}`);
        }

        // Äá»c audio
        let audioBase64 = "";
        if (fs.existsSync(audioPath)) {
            const audioData = fs.readFileSync(audioPath);
            audioBase64 = `data:audio/mp3;base64,${audioData.toString('base64')}`;
        }

        // Move video ra thÆ° má»¥c AI.TYPING chÃ­nh náº¿u lÃ  video táº£i vá»
        let finalVideoPath = videoPath;
        if (!isLocalFile) {
            finalVideoPath = path.join(aiTypingDir, `analyze_video_${timestamp}${path.extname(videoFile)}`);
            fs.renameSync(videoPath, finalVideoPath);
        }

        // XÃ³a thÆ° má»¥c táº¡m (chá»©a cÃ¡c file jpg)
        // try {
        //     fs.rmSync(tempDir, { recursive: true, force: true });
        // } catch(e) {}

        sendToRenderer("tools-log", `[AI Analyze] ÄÃ£ hoÃ n táº¥t! Video Ä‘Æ°á»£c lÆ°u/sá»­ dá»¥ng táº¡i ${finalVideoPath}`);

        return {
            success: true,
            frames: base64Frames,
            audio: audioBase64,
            subtitles: subtitlesText
        };

    } catch (err) {
        console.error("Analyze Video Local Error:", err);
        sendToRenderer("tools-log", `[AI Analyze] Lá»—i: ${err.message}`);
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
        
        // Remove file://
        const videoPath = videoUrl.replace('file://', '');
        if (!fs.existsSync(videoPath)) {
            return { success: false, error: 'File gá»‘c khÃ´ng tá»“n táº¡i: ' + videoPath };
        }

        const ffmpegPath = binaries.ffmpeg || "ffmpeg";
        const dir = path.dirname(videoPath);
        const ext = path.extname(videoPath);
        const baseName = path.basename(videoPath, ext);
        let originalBaseName = baseName.replace(/_trimmed_\d+/g, '');
        const timestamp = new Date().getTime();
        const outputPath = path.join(dir, `${originalBaseName}_trimmed_${timestamp}${ext}`);

        const args = [
            '-ss', trimStart.toString(),
            '-i', videoPath,
            '-t', duration.toString(),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            '-y',
            outputPath
        ];

        return new Promise((resolve) => {
            const child = spawn(ffmpegPath, args);
            
            child.on('close', (code) => {
                if (code === 0 && fs.existsSync(outputPath)) {
                    if (baseName.includes('_trimmed_')) {
                        try { fs.unlinkSync(videoPath); } catch (e) {}
                    }
                    resolve({ success: true, path: outputPath });
                } else {
                    resolve({ success: false, error: `FFmpeg process exited with code ${code}` });
                }
            });
            
            child.on('error', (err) => {
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
