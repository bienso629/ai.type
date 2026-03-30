const {
    app,
    BrowserWindow,
    Menu,
    globalShortcut,
    screen,
    session,
    ipcMain,
} = require("electron");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { exec, execFile, spawn } = require("child_process");
const os = require("os");
const path = require("path");
const http = require("http");
const fs = require("fs");
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
                                `Google Ads API trả về body rỗng (status ${res.statusCode})`,
                            ),
                        );
                    }

                    const contentType = (
                        res.headers["content-type"] || ""
                    ).toLowerCase();

                    if (!contentType.includes("application/json")) {
                        return reject(
                            new Error(
                                `Google Ads API trả về nội dung không phải JSON (status ${res.statusCode}). ` +
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

    // Đường dẫn linh hoạt: dev lùi ra ngoài src/, packaged lấy từ Resources
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

    // Cấp quyền thực thi (chỉ cần thiết cho macOS)
    if (platform !== "win32") {
        try {
            fs.chmodSync(binPath, "755");
        } catch (e) {
            console.error("Lỗi cấp quyền macOS:", e);
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

// 2. Hàm download giữ nguyên tên, nhưng xử lý được mọi loại file binary
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
                    // Dùng hàm infer của bạn cho các trường hợp ảnh
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
        } catch (e) {
            sendToRenderer("tools-log", `[Dreamina] ❌ Lỗi: ${e.message}`);
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
            "[Screenshot] Đang fetch Chrome remote debug...",
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
                `[Screenshot] ❌ Không tìm thấy page có uniqueID=${uniqueID}`,
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
            `[Screenshot] ✅ Đã chụp ảnh: ${screenshotPath}`,
        );

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer(
            "tools-log",
            `[Screenshot] ❌ Lỗi khi chụp ảnh: ${err.message}`,
        );
        if (targetWindow) targetWindow.close();
    }
}

async function getFacebookCookies(uniqueID, event) {
    try {
        sendToRenderer(
            "tools-log",
            `[FB-GetCookie] Đang tìm page với uniqueID=${uniqueID}...`,
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
                `[FB-GetCookie] ❌ Không tìm thấy page có uniqueID=${uniqueID}`,
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
            `[FB-GetCookie] Đã lưu cookies vào: ${cookiePath}`,
        );

        // Trả cookie về UI
        event.reply("tools-response", {
            action: "get-facebook-cookies",
            success: true,
            cookies,
            file: cookiePath,
        });

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer("tools-log", `[FB-GetCookie] ❌ Lỗi: ${err.message}`);
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
                `[FB-Login] ❌ Không tìm thấy page có uniqueID=${uniqueID}`,
            );
            await browser.disconnect();
            return;
        }

        sendToRenderer(
            "tools-log",
            `[FB-Login] Đã tìm thấy tab Facebook cần đăng nhập!`,
        );

        // Tùy mục tiêu, ví dụ: lấy cookie sau khi user tự login
        // Chờ user login, bạn có thể chờ đến khi url đổi sang https://www.facebook.com/?sk=welcome hoặc cookie đầy đủ
        // Ở đây mình lấy cookies luôn sau 20s (hoặc bạn có thể trigger bằng nút trên giao diện, hoặc logic thông minh hơn)
        setTimeout(async () => {
            const cookies = await matchedPage.cookies();
            sendToRenderer(
                "tools-log",
                `[FB-Login] Cookie sau login: ${JSON.stringify(cookies)}`,
            );
            // Bạn có thể lưu cookies vào file hoặc gửi trả về renderer nếu cần
            await browser.disconnect();
            if (targetWindow) targetWindow.close();
        }, 200000); // chờ 200s, tuỳ ý
    } catch (err) {
        sendToRenderer("tools-log", `[FB-Login] ❌ Lỗi: ${err.message}`);
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
                `[Website-Crawl] ❌ Không tìm thấy tab có uniqueID=${uniqueID}`,
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
                        `[Gemini] ❌ Lỗi xử lý "${item.key}": ${err.message}`,
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
        sendToRenderer("tools-log", `✅ Đã lưu dữ liệu JSON: ${jsonPath}`);

        await browser.disconnect();
        if (targetWindow) targetWindow.close();
    } catch (err) {
        sendToRenderer("tools-log", `[Website-Crawl] ❌ Lỗi: ${err.message}`);
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

            if (txt.includes('phút') || txt.includes('vừa xong') || txt.includes('min')) {
                timeText = txt;
            }
        });

        if (!timeText) return;
        postUrls = [...new Set(postUrls)];

        // --- 2. LẤY TÁC GIẢ ---
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

        // --- ĐIỀU KIỆN MỚI: BỎ QUA NẾU KHÔNG CÓ TEXT VÀ KHÔNG CÓ ẢNH ---
        if (!content && finalImages.length === 0) {
            return; // Bỏ qua bài post "trống" (chỉ có video hoặc chỉ có sticker/link)
        }

        // --- 5. VIDEO LINK ---
        let videoUrl = post.find('a[href*="/videos/"], a[href*="/watch/"]').first().attr('href') || null;
        if (videoUrl && !videoUrl.startsWith('http')) videoUrl = `https://www.facebook.com${videoUrl}`;

        // --- 6. TƯƠNG TÁC ---
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

        const pages = await browser.pages();
        let facebookPage = pages.find((p) => p.url().includes(`uniqueID=${uniqueID}`));

        if (!facebookPage) {
            sendToRenderer("tools-log", "❌ Không tìm thấy tab Facebook.");
            return;
        }

        await facebookPage.bringToFront();

        while (allPosts.length < maxPosts && count < 1000) {
            count++;
            if (!targetWindow || targetWindow.isDestroyed()) break;

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
                    sendToRenderer("tools-log", `[FB-Crawl] ✅ Đã lấy: ${post.author.name} (${post.images.length} ảnh)`);
                }
                if (allPosts.length >= maxPosts) break;
            }

            if (allPosts.length >= maxPosts) break;
        }

        sendToRenderer("tools-response", {
            action: "facebook-crawl",
            success: true,
            posts: allPosts.slice(0, maxPosts),
        });

        if (browser) await browser.disconnect();
        if (targetWindow && !targetWindow.isDestroyed()) targetWindow.close();

    } catch (err) {
        sendToRenderer("tools-log", `❌ Lỗi: ${err.message}`);
        if (browser) await browser.disconnect();
    }
}

// ==== FALLBACK SERVER ====
function startFallbackServer() {
    const fallbackApp = express();
    const fallbackPath = path.resolve(__dirname, "..", "fallback");
    fallbackApp.use(express.static(fallbackPath));
    fallbackApp.listen(fallbackPort, () => {
        sendToRenderer(
            "tools-log",
            `[✓] Fallback server chạy tại http://localhost:${fallbackPort}`,
        );
    });
}

puppeteer.use(StealthPlugin());
app.commandLine.appendSwitch("remote-debugging-port", "9999"); // BẮT BUỘC cho puppeteer.connect()

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

const downloader = path.resolve(
    __dirname,
    "..",
    process.platform === "win32" ? "downloader-win.exe" : "downloader-macos",
);
const type = path.resolve(
    __dirname,
    "..",
    process.platform === "win32" ? "type-lite-win.exe" : "type-lite-macos",
);

// [THÊM] Khai báo đường dẫn tool Edge TTS mới
const edgeTtsExe = path.resolve(
    __dirname,
    "..",
    process.platform === "win32" ? "edge-tts-win.exe" : "edge-tts-macos",
);

let mainWindow;
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
        sendToRenderer("tools-log", `[GSC] Đã lưu token vào ${TOKEN_GSC_PATH}`);
    } catch (e) {
        sendToRenderer("tools-log", `[GSC] Lỗi lưu token: ${e.message}`);
    }
}

// Mở cửa sổ login Google, lấy "code" rồi đổi sang access_token + refresh_token
async function gscDoLogin() {
    // Tạo URL đăng nhập Google
    const authUrl = gscOauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES_GSC, // ['https://www.googleapis.com/auth/webmasters.readonly']
        prompt: "consent", // để lần đầu chắc chắn trả refresh_token
    });

    sendToRenderer("tools-log", `[GSC] Mở cửa sổ đăng nhập: ${authUrl}`);

    return new Promise((resolve, reject) => {
        const authWindow = new BrowserWindow({
            width: 600,
            height: 800,
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
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        authWindow.loadURL(authUrl);

        // Bắt các lần redirect của Google
        authWindow.webContents.on("will-redirect", async (_event, url) => {
            try {
                // Chỉ xử lý khi redirect đúng về GSC_REDIRECT_URI
                if (!url.startsWith(GSC_REDIRECT_URI)) {
                    return;
                }

                const urlObj = new URL(url);
                const code = urlObj.searchParams.get("code");
                const error = urlObj.searchParams.get("error");

                if (error) {
                    sendToRenderer("tools-log", `[GSC] Lỗi OAuth: ${error}`);
                    reject(new Error(error));
                    authWindow.close();
                    return;
                }

                if (!code) {
                    // Không có code cũng coi như thất bại
                    sendToRenderer(
                        "tools-log",
                        "[GSC] Không tìm thấy mã code trong redirect URL",
                    );
                    reject(new Error("No code in redirect URL"));
                    authWindow.close();
                    return;
                }

                sendToRenderer(
                    "tools-log",
                    "[GSC] Nhận code, đang đổi sang token...",
                );

                // Đổi authorization code lấy access_token + refresh_token
                const { tokens } = await gscOauth2Client.getToken(code);
                gscOauth2Client.setCredentials(tokens);
                gscSaveToken(tokens); // lưu ra file TOKEN_GSC_PATH

                sendToRenderer(
                    "tools-log",
                    "[GSC] Đăng nhập thành công, đã lưu token.",
                );

                resolve();
                authWindow.close();
            } catch (err) {
                sendToRenderer(
                    "tools-log",
                    `[GSC] Lỗi trong will-redirect: ${(err && err.message) || err}`,
                );
                reject(err);
                authWindow.close();
            }
        });

        // Nếu user tự tắt cửa sổ thì coi như hủy
        authWindow.on("closed", () => {
            sendToRenderer(
                "tools-log",
                "[GSC] Cửa sổ đăng nhập bị đóng trước khi hoàn tất.",
            );
            reject(new Error("Login window closed by user"));
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
    const prompt = `Bạn là AI chuyên trích xuất dữ liệu từ HTML theo hướng dẫn. Hãy đọc đoạn HTML sau và trích ra dữ liệu theo yêu cầu:

    [INSTRUCTION]
    ${instruction}

    [HTML]
    ${html}

    Trả về JSON với 1 key duy nhất là "value", ví dụ: { "value": "Kết quả" }
    Nếu không tìm thấy, trả về: { "value": "" }`;

    const result = await model.generateContent(prompt);
    let text = result.response.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Loại bỏ ```json ... ```
    text = text.trim();
    if (text.startsWith("```json")) {
        text = text
            .replace(/^```json\s*/, "")
            .replace(/```$/, "")
            .trim();
    }

    // Loại bỏ nếu bị bọc markdown kiểu khác
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
            sendToRenderer("tools-log", `Đã huỷ tiến trình chiếm port ${port}`);
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
        const userDataDir = path.join(os.tmpdir(), "chrome-stt-" + Date.now());

        const args = [
            `--app=${targetUrl}`,
            // --- THÊM DÒNG NÀY ĐỂ CHỈNH KÍCH THƯỚC ---
            `--window-size=${width},${height}`,

            // Nếu muốn chỉnh vị trí xuất hiện (tùy chọn):
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
            "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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
        sendToRenderer("tools-log", `[ChromeApp] ❌ Exception: ${err.message}`);
    }
}

// Trả về đường dẫn đúng cho preload ở cả dev (electron .) và app.asar
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
    return candidate1; // vẫn trả về candidate1 để log báo lỗi
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
            webviewTag: false,
            devTools: true,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: true,
            preload: resolvePreload(),
        },
    });

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
            { label: "Cửa sổ", role: "windowMenu" },
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
    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workArea;

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
        width: winWidth,
        height: winHeight,
        x: (screenW - winWidth) / 2,
        y: (screenH - winHeight) / 2,
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
            webSecurity: false,
            webviewTag: false,
            devTools: false,
            nodeIntegrationInSubFrames: true,
            preload: resolvePreload(),
        },
    });

    // Fake user-agent nếu cần
    targetWindow.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

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

    targetWindow.on("closed", () => {
        targetWindow = null;
    });

    return targetWindow;
}

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

/**
 * Hàm sinh audio từ Edge TTS bằng WebSocket thuần.
 * Không cần cài Python, không cần edge-tts cli.
 */
async function generateEdgeAudioByExe(text, voice, outputPath, subPath, rate, pitch) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(edgeTtsExe)) {
            return reject(new Error(`Không tìm thấy file Edge TTS Core tại: ${edgeTtsExe}`));
        }

        // [SỬA TẠI ĐÂY]: Sử dụng cú pháp --key=value để tránh lỗi tham số âm
        const args = [
            `--text=${text}`,
            `--voice=${voice}`,
            `--output=${outputPath}`,
            `--rate=${rate || "+0%"}`,
            `--pitch=${pitch || "+0Hz"}`,
            `--write-subtitles=${subPath}`
        ];

        sendToRenderer("tools-log", `[TTS-Exe] Executing: ${edgeTtsExe} ...`);

        execFile(edgeTtsExe, args, (error, stdout, stderr) => {
            if (error) {
                sendToRenderer("tools-log", `[TTS-Exe] Error: ${stderr || error.message}`);
                return reject(error);
            }
            resolve({ audio: outputPath, sub: subPath });
        });
    });
}

// --- IPC HANDLER: Xử lý việc copy file ---
// Lắng nghe sự kiện 'select-local-file' từ Renderer process
ipcMain.handle('select-local-file', async (event, { filePath }) => {
    try {
        const fileName = path.basename(filePath);
        // Tạo một tên file duy nhất để tránh bị trùng (ví dụ: timestamp_filename)
        const uniqueFileName = `${Date.now()}_${fileName}`;
        const destinationPath = path.join(uploadsDir, uniqueFileName);

        // Copy file từ đường dẫn gốc sang thư mục uploads của app
        fs.copyFileSync(filePath, destinationPath);

        console.log(`File copied from ${filePath} to ${destinationPath}`);

        // Trả về đường dẫn mới về Renderer process.
        // LƯU Ý: Để Angular có thể hiển thị ảnh/video này, đường dẫn
        // cần được định dạng dưới dạng một file:// protocol URL.
        // path.resolve() đảm bảo đường dẫn là tuyệt đối.
        return `file://${path.resolve(destinationPath)}`;
    } catch (error) {
        console.error('Error selecting file:', error);
        throw error; // Gửi lỗi về Renderer process
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
        // Quan trọng: Dấu trừ của số âm sẽ tự xuất hiện khi chuyển thành chuỗi
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

        // Tạo thêm đường dẫn cho file phụ đề (cùng tên, khác đuôi)
        const subPath = path.join(
            saveDir,
            filename.endsWith(".mp3") ? filename.replace('.mp3', '.vtt') : `${filename}.vtt`
        );

        // [THAY ĐỔI]: Truyền biến đã format vào đây
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

// 2. Hàm đọc file - Cập nhật logic fallback (phòng hờ)
ipcMain.handle("read-local-audio", async (event, payload) => {
    try {
        const { path: filePath, filename } = payload;
        let targetPath = filePath;

        // Nếu Frontend không gửi đường dẫn tuyệt đối (chỉ gửi tên file)
        // Ta sẽ tìm trong thư mục Documents mặc định
        if (!targetPath && filename) {
            const documentsPath = app.getPath("documents");
            // Lưu ý: Logic tìm kiếm này chỉ mang tính ước lượng nếu thiếu path
            // Tốt nhất Frontend nên gửi path tuyệt đối (clip['localFilePath'])
            targetPath = path.join(
                documentsPath,
                "ai.type",
                "data",
                "tts",
                "admin",
                filename,
            );
        }

        if (targetPath && fs.existsSync(targetPath)) {
            const fileBuffer = fs.readFileSync(targetPath);
            return { success: true, base64: fileBuffer.toString("base64") };
        } else {
            return {
                success: false,
                error: `Không tìm thấy file: ${targetPath}`,
            };
        }
    } catch (error) {
        return { success: false, error: error.message };
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
    const { base64, fileName, folder, username } = args;

    const docPath = app.getPath("documents");

    // SỬA ĐƯỜNG DẪN: Thêm username vào cuối đường dẫn
    // Ví dụ: .../uploads/thumbnails/admin/
    const saveDir = path.join(
        docPath,
        "ai.type",
        "data",
        "uploads",
        folder || "thumbnails",
        username || "default",
    );

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

    // 1. Chuẩn bị đường dẫn lưu file
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
        // CÁCH 1: Dùng Puppeteer để chụp FULL PAGE (Chất lượng cao, lấy hết chiều dài)
        // Kết nối vào chính trình duyệt Electron hiện tại qua port 9999
        const res = await fetch("http://localhost:9999/json/version");
        const json = await res.json();

        // Kết nối Puppeteer
        const browser = await puppeteer.connect({
            browserWSEndpoint: json.webSocketDebuggerUrl,
            defaultViewport: null, // Để null để lấy đúng kích thước hiện tại
        });

        // Lấy danh sách các tab đang mở
        const pages = await browser.pages();

        // Tìm tab Main Window (Thường là tab không có uniqueID hoặc là tab đầu tiên)
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
                fullPage: true, // <--- ĐÂY LÀ CHÌA KHOÁ ĐỂ CHỤP FULL HEIGHT
            });

            // Restore lại thanh cuộn (nếu cần)
            await page.addStyleTag({
                content: "body { overflow-y: auto !important; }",
            });

            await browser.disconnect();

            sendToRenderer(
                "tools-log",
                `[Screenshot] ✅ Đã chụp Full Height: ${filePath}`,
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
        // CÁCH 2: FALLBACK (Dự phòng)
        // Nếu lỗi Puppeteer thì dùng cách cũ chụp Viewport
        sendToRenderer(
            "tools-log",
            `[Screenshot] ⚠️ Lỗi Puppeteer (${e.message}), chuyển sang chụp Viewport.`,
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
        return { action: "allow" };
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
        
        /* [2] CUSTOM SCROLLBAR CHO ĐẸP */
        ::-webkit-scrollbar {
            width: 8px; /* Độ rộng thanh cuộn */
            height: 8px;
        }
        ::-webkit-scrollbar-track {
            background: #111; /* Màu nền đường ray */
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
            log('▶️ Đang tải nguồn: ' + url, 'info');
            if(hls) { hls.destroy(); hls = null; }

            if (Hls.isSupported()) {
                hls = new Hls({ debug: false, enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    log('✅ Đã nhận tín hiệu Video', 'info');
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
            if (!window.webkitSpeechRecognition) return log('❌ Trình duyệt không hỗ trợ STT', 'err');
            
            recognition = new webkitSpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'vi-VN';

            recognition.onstart = () => log('🎙️ STT đang lắng nghe...', 'info');
            recognition.onerror = (e) => { if (e.error !== 'no-speech') log('⚠️ Lỗi Mic: ' + e.error, 'err'); };
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
                        log('📝 ' + processedFinal, 'final');
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

    sttApp.listen(port, () => {
        sendToRenderer(
            "tools-log",
            `[STT-Server] Server running at http://localhost:${port}`,
        );
    });
}

// ==== APP EVENT ==== //
app.whenReady().then(async () => {
    const filter = {
        urls: [
            "*://*.type.vn/*",
            "*://*.facebook.com/*",
            "*://facebook.com/*",
            "*://chatgpt.com/*",
            "*://google.com/*",
            "*://*.messenger.com/*",
        ]
    };

    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        details.requestHeaders["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

        if (details.url.includes('type.vn')) {
            // Ép Origin để NodeBB cho phép hiển thị ảnh từ localhost:5454
            details.requestHeaders['Origin'] = 'https://type.vn';
            details.requestHeaders['Referer'] = 'https://type.vn/';
            delete details.requestHeaders['Sec-Fetch-Site'];
        }
        callback({ requestHeaders: details.requestHeaders });
    });

    startGoService();
    startSttWebSocketServer();
    startSttServer(); // <--- [THÊM] Gọi hàm vừa tạo
    createMainWindow();

    if (downloader && fs.existsSync(downloader)) {
        downloaderProcess = execFile(downloader, [], (err, stdout, stderr) => {
            if (err) sendToRenderer("tools-log", `❌ Downloader lỗi: ${err}`);
            if (stdout) sendToRenderer("tools-log", `📥 Downloader: ${stdout}`);
            if (stderr)
                sendToRenderer("tools-log", `⚠️ Downloader stderr: ${stderr}`);
        });
    }

    if (type && fs.existsSync(type)) {
        typeProcess = execFile(type, [], (err, stdout, stderr) => {
            if (err) sendToRenderer("tools-log", `❌ Type lỗi: ${err}`);
            if (stdout) sendToRenderer("tools-log", `📥 Type: ${stdout}`);
            if (stderr)
                sendToRenderer("tools-log", `⚠️ Type stderr: ${stderr}`);
        });
    }

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
        if (!data || !data.command) {
            event.reply("tools-response", {
                error: "Không có lệnh nào được gửi",
            });
            return;
        }

        if (!data.url) data.url = "https://google.com.vn";

        if (targetWindow) targetWindow.close();

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

                createTargetWindow(
                    data.url,
                    () => {
                        createImageByDreamina(data.url, uniqueID, {
                            outDir: data.outDir || defaultOutDir,
                            maxImages: data.maxImages || 100,
                            filenamePrefix: data.filenamePrefix || "dream_",
                        });
                    },
                    uniqueID,
                    data.width || 1000,
                    data.height || 1100,
                );
                break;
            }
            case "facebook-login": {
                const uniqueID = data.uniqueID || createUniqueID();
                if (data.cookiePath && fs.existsSync(data.cookiePath)) {
                    setFacebookCookiesFromFile(data.cookiePath).then(() => {
                        sendToRenderer(
                            "tools-log",
                            `[FB-Login] Đã set cookies từ file: ${data.cookiePath}`,
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
                    model: "gemini-2.0-flash",
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

                if (data.cookiePath && fs.existsSync(data.cookiePath)) {
                    setFacebookCookiesFromFile(data.cookiePath).then(() => {
                        sendToRenderer(
                            "tools-log",
                            `[FB-Crawl] Đã set cookies từ file: ${data.cookiePath}`,
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
                            if (targetWindow && !targetWindow.isDestroyed())
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
    });

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    globalShortcut.register("CommandOrControl+Shift+I", () => {
        if (mainWindow) mainWindow.webContents.toggleDevTools();
    });

    globalShortcut.register("CommandOrControl+C+G", () => {
        if (targetWindow) targetWindow.close();
    });

    globalShortcut.register("CommandOrControl+Shift+N", () => {
        createMainWindow();
    });

    // Đăng ký phím tắt CTRL+R hoặc Command+R
    globalShortcut.register('CommandOrControl+Shift+R', () => {
        if (mainWindow) {
            mainWindow.reload(); // Làm mới cửa sổ chính
            console.log('Đã làm mới trình duyệt');
        }
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
        // Đổi kích thước cửa sổ (true = có hiệu ứng animation resize mượt mà trên macOS/Windows)
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

// Nếu bạn muốn set mặc định property ID qua biến môi trường:
const GA_DEFAULT_PROPERTY_ID = process.env.GA_PROPERTY_ID || "293654701";

// ✅ ĐƯỜNG DẪN MẶC ĐỊNH: C:\Users\<User>\Documents\ai.type\ga4-service.json
const GA_KEY_FILE_DEFAULT = path.join(
    documentsDir,
    "ai.type",
    "ga4-service.json",
);

function resolveGaKeyFile() {
    // 1) Ưu tiên: GA_KEY_FILE trong biến môi trường
    if (process.env.GA_KEY_FILE && fileExists(process.env.GA_KEY_FILE)) {
        return process.env.GA_KEY_FILE;
    }

    // 2) Mặc định: Documents\ai.type\ga4-service.json (trường hợp của bạn)
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
                "Hãy nhập trong UI hoặc set biến môi trường GA_PROPERTY_ID.",
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

    sendToRenderer("tools-log", "[Zalo-Direct] 🚀 Đang trích xuất dữ liệu từ 44 bảng...");

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
            sendToRenderer("tools-log", "[Zalo-Direct] ⚠️ " + result.error);
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

            sendToRenderer("tools-log", `[Zalo-Direct] ✅ Đã lưu file: ${filePath}`);

            // Trả về response có chứa 'path' để Angular không bị undefined
            sendToRenderer("tools-response", {
                action: "zalo-crawl",
                success: true,
                path: filePath, // Đường dẫn file thực tế
                uid: result.uid
            });
        }
    } catch (e) {
        sendToRenderer("tools-log", "[Zalo-Direct] ❌ Lỗi: " + e.message);
    }
}

// =====================================================================
// [RENDER VIDEO] CÁC HÀM TIỆN ÍCH DÀNH RIÊNG CHO RENDER FFmpeg
// =====================================================================

function cleanFilePath(fileUrl) {
    if (!fileUrl) return '';
    let p = fileUrl.replace('file://', '');
    if (process.platform === 'win32' && p.startsWith('/')) {
        p = p.substring(1);
    }
    return p;
}

async function getAudioDuration(filePath) {
    try {
        await execPromise(`ffmpeg -i "${filePath}"`);
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
// IPC HANDLER: RENDER CUSTOM VIDEO CHUẨN STUDIO (CHỐNG LỆCH AUDIO)
// =====================================================================

ipcMain.handle('render-custom-video', async (event, projectData) => {
    try {
        sendToRenderer("tools-log", `[Render] Bắt đầu xử lý dự án: ${projectData.title}`);

        let baseW = 1920; let baseH = 1080;
        let qualityName = projectData.quality || '1080p';

        if (qualityName === '2k') { baseW = 2560; baseH = 1440; }
        else if (qualityName === '4k') { baseW = 3840; baseH = 2160; }

        let w = 1080, h = 1920;
        let ratioName = "tiktok";

        if (projectData.exportRatio === '9:16') { w = baseH; h = baseW; ratioName = "tiktok"; }
        else if (projectData.exportRatio === '16:9') { w = baseW; h = baseH; ratioName = "youtube"; }
        else if (projectData.exportRatio === '1:1') { w = baseH; h = baseH; ratioName = "square"; }

        const docPath = app.getPath('documents');
        const workspaceDir = path.join(docPath, 'ai.type', 'data', 'exports', projectData.uuid);

        if (fs.existsSync(workspaceDir)) fs.rmSync(workspaceDir, { recursive: true, force: true });
        fs.mkdirSync(workspaceDir, { recursive: true });

        const sceneVideos = [];
        let finalAudioListContent = "";
        const finalAudioListTxt = path.join(workspaceDir, 'final_audio_list.txt');

        // --- BƯỚC 1: XỬ LÝ TỪNG SCENE ---
        for (let i = 0; i < projectData.scenes.length; i++) {
            const scene = projectData.scenes[i];
            sendToRenderer("tools-log", `[Render] Xử lý Scene ${i + 1}/${projectData.scenes.length}...`);

            const sceneImgPath = cleanFilePath(scene.imageUrl);
            if (!fs.existsSync(sceneImgPath) || !scene.subtitles || scene.subtitles.length === 0) continue;

            let sceneDurationMs = 0;
            let mergedVtt = "WEBVTT\n\n";
            let isFirstSub = true;

            for (let j = 0; j < scene.subtitles.length; j++) {
                const sub = scene.subtitles[j];
                const audioPath = cleanFilePath(sub.audioUrl);
                if (!fs.existsSync(audioPath)) continue;

                // 1.1 Convert MP3 sang WAV (Xóa khoảng đệm MP3) + Thêm khoảng lặng 0.5s cho câu đầu tiên
                const wavPath = path.join(workspaceDir, `temp_${i}_${j}.wav`);
                if (isFirstSub) {
                    await execPromise(`ffmpeg -y -i "${audioPath}" -af "adelay=500|500" -c:a pcm_s16le "${wavPath}"`);
                } else {
                    await execPromise(`ffmpeg -y -i "${audioPath}" -c:a pcm_s16le "${wavPath}"`);
                }

                // 1.2 Đo độ dài CHÍNH XÁC của file WAV
                const durationSec = await getAudioDuration(wavPath);
                const durationMs = Math.round(durationSec * 1000);

                // 1.3 Dịch thời gian phụ đề: Lùi phụ đề lại 500ms nếu là câu đầu (chờ hiệu ứng Fade)
                const startMs = isFirstSub ? sceneDurationMs + 500 : sceneDurationMs;
                const endMs = sceneDurationMs + durationMs;

                mergedVtt += `${formatVttTime(startMs)} --> ${formatVttTime(endMs)}\n`;
                mergedVtt += `${sub.text.replace(/\n/g, ' ')}\n\n`;

                sceneDurationMs += durationMs;
                isFirstSub = false;

                // 1.4 Ghi vào danh sách file audio tổng (An toàn với đường dẫn Windows)
                finalAudioListContent += `file '${wavPath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'\n`;
            }

            if (sceneDurationMs === 0) continue;

            const sceneDurationSec = (sceneDurationMs / 1000).toFixed(3);
            const mergedVttPath = path.join(workspaceDir, `scene_${i}_merged.vtt`);
            fs.writeFileSync(mergedVttPath, mergedVtt, 'utf-8');

            const safeSubPathForFFmpeg = mergedVttPath.replace(/\\/g, '/').replace(/:/g, '\\:');

            // 1.5 Render Video TĨNH (KHÔNG AUDIO) với độ dài cực chuẩn nhờ tham số (-t)
            const sceneVideoPath = path.join(workspaceDir, `scene_${i}_video.mp4`);
            const isVideo = sceneImgPath.toLowerCase().endsWith('.mp4');

            const inputArgs = isVideo ? `-stream_loop -1 -i "${sceneImgPath}"` : `-loop 1 -framerate 30 -i "${sceneImgPath}"`;

            // [CẬP NHẬT] Kiểm tra cờ withSubtitle từ giao diện gửi xuống
            const includeSubtitle = projectData.withSubtitle !== false; // Mặc định là true nếu không truyền

            // Nếu bật phụ đề thì nối thêm chuỗi filter subtitles, nếu tắt thì để chuỗi rỗng
            const subtitleFilter = includeSubtitle
                ? `,subtitles='${safeSubPathForFFmpeg}'`
                : "";

            // Ép biến subtitleFilter vào lệnh FFmpeg
            const videoCmd = `ffmpeg -y ${inputArgs} -t ${sceneDurationSec} -vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fade=t=in:st=0:d=0.5${subtitleFilter}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p "${sceneVideoPath}"`;

            await execPromise(videoCmd);
            sceneVideos.push(sceneVideoPath);
        }

        // --- BƯỚC 2: GỘP AUDIO TỔNG THÀNH FILE WAV (CHỐNG LỆCH) ---
        sendToRenderer("tools-log", `[Render] Đang tạo Audio tổng (Master Audio)...`);
        fs.writeFileSync(finalAudioListTxt, finalAudioListContent);
        const finalAudioWav = path.join(workspaceDir, 'final_audio.wav');
        await execPromise(`ffmpeg -y -f concat -safe 0 -i "${finalAudioListTxt}" -c copy "${finalAudioWav}"`);

        // --- BƯỚC 3: GỘP VIDEO TỔNG (KHÔNG TIẾNG) ---
        sendToRenderer("tools-log", `[Render] Đang ghép hình ảnh ${sceneVideos.length} phân cảnh...`);
        const finalVideoListTxt = path.join(workspaceDir, 'final_video_list.txt');
        const finalVideoListContent = sceneVideos.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
        fs.writeFileSync(finalVideoListTxt, finalVideoListContent);

        const finalVideoMuted = path.join(workspaceDir, 'final_video_muted.mp4');
        await execPromise(`ffmpeg -y -f concat -safe 0 -i "${finalVideoListTxt}" -c copy "${finalVideoMuted}"`);

        // --- BƯỚC 4: MUX (GHÉP) HÌNH VÀ TIẾNG LẠI VỚI NHAU ---
        sendToRenderer("tools-log", `[Render] Đang Mux Audio và Video thành phẩm...`);
        const safeTitle = projectData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const finalExportPath = path.join(docPath, 'ai.type', 'data', 'exports', `${safeTitle}_${ratioName}_${qualityName}.mp4`);

        // Lệnh copy c:v giúp ghép siêu tốc mà không làm giảm chất lượng video thêm lần nào nữa
        await execPromise(`ffmpeg -y -i "${finalVideoMuted}" -i "${finalAudioWav}" -c:v copy -c:a aac -b:a 192k -shortest "${finalExportPath}"`);

        // fs.rmSync(workspaceDir, { recursive: true, force: true });
        sendToRenderer("tools-log", `[Render] ✅ HOÀN TẤT! Video lưu tại: ${finalExportPath}`);

        return { success: true, path: finalExportPath, url: `file://${finalExportPath}` };

    } catch (err) {
        console.error("Lỗi Render Video:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('apply-rvc', async (event, payload) => {
    try {
        const { inputAudio, outputAudio, pitch, pthPath, indexPath } = payload;
        const fs = require('fs'); // Đảm bảo có thư viện xử lý file

        // CHỐNG LỖI CÂM (0 BYTES): Bắt Python xuất ra file tạm trước
        const tempOutput = inputAudio + ".tmp.wav";

        sendToRenderer("tools-log", `[RVC] Đang gọi API biến đổi giọng...`);

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
            // KHI PYTHON LÀM XONG -> LẤY FILE TẠM GHI ĐÈ THẲNG LÊN FILE OUTPUT
            if (fs.existsSync(outputAudio)) {
                try { fs.unlinkSync(outputAudio); } catch (e) { } // Xóa output cũ nếu có
            }
            fs.renameSync(tempOutput, outputAudio); // Di chuyển file tạm thành output chính

            // Nếu file đầu vào là .mp3, mà output là .wav, ta dọn sạch luôn file .mp3 gốc cho rỗng thùng rác
            if (inputAudio !== outputAudio && fs.existsSync(inputAudio)) {
                try { fs.unlinkSync(inputAudio); } catch (e) { }
            }

            sendToRenderer("tools-log", `[RVC] ✅ Đã biến đổi và ghi đè file thành công!`);
            return { success: true, path: outputAudio };
        } else {
            sendToRenderer("tools-log", `[RVC] ❌ Lỗi từ API: ${data.error}`);
            return { success: false, error: data.error };
        }
    } catch (error) {
        sendToRenderer("tools-log", `[RVC] ❌ Mất kết nối tới Python API: ${error.message}`);
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
                "callback_url": ""      // Để trống vì chúng ta dùng cơ chế Polling (hỏi liên tục)
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

        // BƯỚC 2: Polling GET để chờ file hoàn thành (GET https://api.ausynclab.io/api/v1/speech/{audio_id})
        sendToRenderer("tools-log", `[AusyncLab] Đang xử lý Audio ID: ${audioId}...`);

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

            // Đợi 2 giây trước khi hỏi lại
            await new Promise(r => setTimeout(r, 2000));
            attempts++;
        }

        if (!audioUrl) throw new Error("Quá thời gian chờ (Timeout) - API chưa trả về link download.");

        // BƯỚC 3: Tải file về thư mục cục bộ giống generateEdgeTTSLocal
        const documentsPath = app.getPath("documents");
        const saveDir = path.join(documentsPath, "ai.type", "data", "tts", username);
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });

        // Xác định đường dẫn file cuối cùng (thường Ausync trả về .wav)
        const filePath = path.join(saveDir, `${filename}.wav`);

        const fileRes = await fetch(audioUrl);
        if (!fileRes.ok) throw new Error("Không thể kết nối tới máy chủ lưu trữ audio để tải file.");

        const buffer = await fileRes.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        return {
            success: true,
            filePath: filePath // Trả về đường dẫn để Angular load vào WaveSurfer
        };

    } catch (error) {
        console.error("AusyncLab TTS Error:", error);
        return { success: false, error: error.message };
    }
});