const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const dns = require('dns');
const { URL } = require('url');

const dnsCache = {};

function customLookup(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === '127.0.0.1' || hostname === 'localhost') {
        return dns.lookup(hostname, options, callback);
    }
    if (dnsCache[hostname]) {
        return callback(null, dnsCache[hostname], 4);
    }
    dns.lookup(hostname, options, (err, address, family) => {
        if (!err && address) {
            dnsCache[hostname] = address;
            return callback(null, address, family);
        }
        // Fallback: Query 1.1.1.1 DNS over HTTPS
        https.get(`https://1.1.1.1/dns-query?name=${hostname}&type=A`, {
            headers: { 'accept': 'application/dns-json' },
            timeout: 4000
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.Answer && parsed.Answer.length > 0) {
                        const aRecord = parsed.Answer.find(a => a.type === 1);
                        if (aRecord && aRecord.data) {
                            dnsCache[hostname] = aRecord.data;
                            return callback(null, aRecord.data, 4);
                        }
                    }
                } catch(e) {}
                callback(err || new Error(`Could not resolve ${hostname}`));
            });
        }).on('error', () => {
            callback(err || new Error(`Could not resolve ${hostname}`));
        });
    });
}

try {
    dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);
} catch (e) {}

class ColabMcpClient {
    constructor() {
        this.baseUrl = '';
        this.postEndpoint = '';
        this.isConnected = false;
        this.availableTools = [];
        this.serverInfo = null;
        this.gpuInfo = '';
        this.mode = 'http'; // 'http' | 'sse'
    }

    /**
     * Helper to perform HTTP request
     */
    async httpRequest(targetUrl, method = 'GET', data = null, timeoutMs = 15000) {
        const parsedUrl = new URL(targetUrl);
        const reqModule = parsedUrl.protocol === 'https:' ? https : http;

        return new Promise((resolve, reject) => {
            const postBody = data ? JSON.stringify(data) : null;
            const headers = {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'ai.type-Electron-MCPClient/1.2.3'
            };

            if (postBody) {
                headers['Content-Type'] = 'application/json';
                headers['Content-Length'] = Buffer.byteLength(postBody);
            }

            const req = reqModule.request(targetUrl, {
                method,
                headers,
                timeout: timeoutMs,
                lookup: customLookup
            }, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk.toString('utf-8'));
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(responseData));
                        } catch (e) {
                            resolve(responseData);
                        }
                    } else {
                        reject(new Error(`Máy chủ trả về mã lỗi HTTP ${res.statusCode}: ${responseData.slice(0, 100)}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`Yêu cầu tới Colab quá thời gian (Timeout ${timeoutMs / 1000}s)`));
            });

            req.on('error', (err) => {
                reject(new Error(`Lỗi kết nối Colab: ${err.message}`));
            });

            if (postBody) {
                req.write(postBody);
            }
            req.end();
        });
    }

    /**
     * Connect to Colab MCP / GPU Server
     * @param {string} serverUrl - e.g. https://xxx.trycloudflare.com or https://xxx.trycloudflare.com/sse
     */
    async connect(serverUrl) {
        if (!serverUrl || typeof serverUrl !== 'string') {
            throw new Error('URL máy chủ không hợp lệ');
        }

        let cleanUrl = serverUrl.trim();
        // Normalize: remove trailing slash and trailing /sse for base url
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const baseHttpUrl = cleanUrl.replace(/\/sse$/i, '');

        this.disconnect();
        this.baseUrl = baseHttpUrl;

        console.log(`[MCP Client] Đang kiểm tra kết nối Colab tại: ${this.baseUrl}`);

        // 1. Thử kết nối trực tiếp qua REST API (nhanh & ổn định nhất)
        try {
            const statusRes = await this.httpRequest(`${this.baseUrl}/status`, 'GET', null, 8000);
            if (statusRes && (statusRes.status === 'online' || statusRes.gpu || statusRes.tools)) {
                this.isConnected = true;
                this.mode = 'http';
                this.gpuInfo = statusRes.gpu || '';
                this.availableTools = statusRes.tools || [
                    { name: 'mineru_parse_pdf', description: 'Phân tích PDF bằng MinerU GPU' },
                    { name: 'check_gpu_status', description: 'Kiểm tra GPU Colab' }
                ];
                this.postEndpoint = `${this.baseUrl}/call_tool`;

                console.log(`[MCP Client] Kết nối Colab thành công qua HTTP! GPU: ${this.gpuInfo}`);
                return {
                    success: true,
                    gpu: this.gpuInfo,
                    tools: this.availableTools,
                    mode: 'http'
                };
            }
        } catch (httpErr) {
            console.log(`[MCP Client] Thử endpoint /status thất bại (${httpErr.message}), thử tiếp /tools...`);
        }

        // 2. Thử endpoint /tools
        try {
            const toolsRes = await this.httpRequest(`${this.baseUrl}/tools`, 'GET', null, 8000);
            if (toolsRes && (toolsRes.tools || Array.isArray(toolsRes))) {
                this.isConnected = true;
                this.mode = 'http';
                this.availableTools = toolsRes.tools || toolsRes;
                this.postEndpoint = `${this.baseUrl}/call_tool`;

                return {
                    success: true,
                    gpu: this.gpuInfo,
                    tools: this.availableTools,
                    mode: 'http'
                };
            }
        } catch (e) {}

        throw new Error(`Không thể kết nối đến Colab Server tại ${this.baseUrl}. Vui lòng đảm bảo Colab Notebook đang chạy và đường hầm Cloudflare đang hoạt động.`);
    }

    /**
     * Call a tool on Colab
     * @param {string} toolName - e.g. mineru_parse_pdf, check_gpu_status
     * @param {object} args - Arguments object
     */
    async callTool(toolName, args = {}) {
        if (!this.isConnected || !this.baseUrl) {
            throw new Error('Chưa kết nối tới máy chủ Colab');
        }

        const callUrl = `${this.baseUrl}/call_tool`;
        const payload = {
            name: toolName,
            arguments: args
        };

        const res = await this.httpRequest(callUrl, 'POST', payload, 300000); // 5 minutes for heavy PDF processing
        return res;
    }

    async analyzePdfOnColab(filePath, docType = 'qa_detailed', googleApiKey = '', onProgress = null, options = {}) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Tệp tin không tồn tại: ${filePath}`);
        }

        const filename = path.basename(filePath);
        if (onProgress) onProgress(`Đang đọc tệp PDF (${filename})...`);

        const fileBuffer = fs.readFileSync(filePath);
        const pdfBase64 = fileBuffer.toString('base64');
        const sizeMb = (fileBuffer.length / (1024 * 1024)).toFixed(2);

        // Nạp FAISS index hiện tại của user nếu có để tích lũy
        let existingFaissB64 = options.existing_faiss_base64 || '';
        let existingPklB64 = options.existing_pkl_base64 || '';
        const username = options.username || 'admin';

        if (!existingFaissB64 && username) {
            try {
                const os = require('os');
                const safeUser = (username || 'default_user').replace(/[^a-zA-Z0-9_-]/g, '_');
                const faissFile = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'faiss', safeUser, 'index.faiss');
                const pklFile = path.join(os.homedir(), 'Documents', 'ai.type', 'data', 'faiss', safeUser, 'index.pkl');
                if (fs.existsSync(faissFile) && fs.existsSync(pklFile)) {
                    existingFaissB64 = fs.readFileSync(faissFile).toString('base64');
                    existingPklB64 = fs.readFileSync(pklFile).toString('base64');
                    console.log(`[MCP Client] Đã đính kèm ${fs.statSync(faissFile).size} bytes FAISS hiện có để tích lũy.`);
                }
            } catch(e) {}
        }

        let toolName = 'build_faiss_from_pdf';
        const hasBuildTool = this.availableTools && this.availableTools.some(t => (t.name || t) === 'build_faiss_from_pdf');
        if (!hasBuildTool) {
            toolName = 'mineru_parse_pdf';
        }

        if (onProgress) onProgress(`Colab GPU đang bóc tách nội dung & tạo FAISS (${filename})...`);

        let result = await this.callTool(toolName, {
            pdf_base64: pdfBase64,
            filename: filename,
            doc_type: docType,
            google_api_key: googleApiKey,
            existing_faiss_base64: existingFaissB64,
            existing_pkl_base64: existingPklB64
        });

        // Fallback nếu server Colab đang chạy code cũ chưa có build_faiss_from_pdf
        if (result && result.error && typeof result.error === 'string' && result.error.includes('Unknown tool')) {
            console.log('[Colab MCP] Thử fallback sang mineru_parse_pdf...');
            if (onProgress) onProgress(`Đang chuyển sang công cụ mineru_parse_pdf (${filename})...`);
            result = await this.callTool('mineru_parse_pdf', {
                pdf_base64: pdfBase64,
                filename: filename
            });
        }

        if (onProgress) onProgress('Đã nhận kết quả AI từ Colab GPU thành công!');
        return result;
    }

    disconnect() {
        this.isConnected = false;
        this.postEndpoint = '';
        this.gpuInfo = '';
        this.availableTools = [];
    }
}

const colabMcpClient = new ColabMcpClient();

module.exports = {
    colabMcpClient
};
