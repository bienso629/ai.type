import { Injectable } from '@angular/core';

export interface RenderedPdfPage {
    pageNumber: number;
    mimeType: string;
    data: string;
}

export interface PdfExtractResult {
    text: string;
    numPages: number;
    substantialTextPages: number;
    isScannedOrImagePdf: boolean;
    renderedPages: RenderedPdfPage[];
}

export interface ProcessedAttachmentResult {
    fileName: string;
    mimeType: string;
    textSection?: string;
    inlineParts: { mimeType: string; data: string }[];
    isScannedPdf?: boolean;
    numPages?: number;
}

/**
 * Service xử lý và trích xuất nội dung tệp đính kèm (PDF văn bản, PDF scan/ảnh,
 * DOCX, TXT/MD/CSV/JSON/HTML/XML/SRT và hình ảnh) ngay phía client để tương thích
 * đồng nhất cho cả Mì Tôm AI (OpenAI/Anthropic/Gemini proxy) lẫn Gemini API Key.
 */
@Injectable({ providedIn: 'root' })
export class PdfTextService {
    private _pdfjs: any = null;
    private static readonly MAX_EXTRACTED_TEXT_CHARS = 120000;
    private static readonly MAX_SCANNED_IMAGE_PAGES = 10;
    private static readonly MAX_SCANNED_TOTAL_B64_CHARS = 5500000; // ~4MB nhị phân để không vượt giới hạn proxy

    /**
     * Nạp lười thư viện pdfjs-dist (bản legacy tương thích mọi phiên bản Chromium/Electron/Safari)
     * và cấu hình fake worker chạy trực tiếp trên main thread.
     */
    private async _loadPdfjs(): Promise<any> {
        if (this._pdfjs) {
            return this._pdfjs;
        }
        let pdfjs: any;
        let workerModule: any;
        try {
            // @ts-ignore
            pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            // @ts-ignore
            workerModule = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
        } catch {
            pdfjs = await import('pdfjs-dist');
            // @ts-ignore
            workerModule = await import('pdfjs-dist/build/pdf.worker.mjs');
        }

        const handler =
            workerModule?.WorkerMessageHandler ||
            workerModule?.default?.WorkerMessageHandler;
        if (handler) {
            (globalThis as any).pdfjsWorker = { WorkerMessageHandler: handler };
        }
        this._pdfjs = pdfjs?.default && pdfjs.default.getDocument ? pdfjs.default : pdfjs;
        return this._pdfjs;
    }

    /**
     * Nhận diện chính xác MIME type dựa trên tên file, MIME trình duyệt cấp và chữ ký byte đầu (magic bytes).
     * Khắc phục triệt để tình trạng Windows/Linux/Electron trả về file.type === "" hoặc "application/octet-stream".
     */
    public inferMimeType(fileName?: string, rawMime?: string, base64Data?: string): string {
        const cleanMime = String(rawMime || '').trim().toLowerCase();
        const lowerName = String(fileName || '').trim().toLowerCase();
        const b64Head = String(base64Data || '').trim().slice(0, 32);

        // 1. Kiểm tra chữ ký nhị phân (Magic Bytes trong Base64)
        if (b64Head.startsWith('JVBERi0')) {
            return 'application/pdf';
        }
        if (b64Head.startsWith('/9j/')) {
            return 'image/jpeg';
        }
        if (b64Head.startsWith('iVBORw0KGgo')) {
            return 'image/png';
        }
        if (b64Head.startsWith('R0lGOD')) {
            return 'image/gif';
        }
        if (b64Head.startsWith('UklGR')) {
            return cleanMime.startsWith('audio/') ? cleanMime : 'image/webp';
        }

        // 2. Kiểm tra đuôi mở rộng của tên file
        if (lowerName.endsWith('.pdf')) return 'application/pdf';
        if (lowerName.endsWith('.docx')) {
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        if (lowerName.endsWith('.txt') || lowerName.endsWith('.log') || lowerName.endsWith('.ini')) {
            return 'text/plain';
        }
        if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
            return 'text/markdown';
        }
        if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
            return 'text/csv';
        }
        if (lowerName.endsWith('.json')) {
            return 'application/json';
        }
        if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
            return 'text/html';
        }
        if (lowerName.endsWith('.xml')) {
            return 'application/xml';
        }
        if (lowerName.endsWith('.srt') || lowerName.endsWith('.vtt') || lowerName.endsWith('.yaml') || lowerName.endsWith('.yml')) {
            return 'text/plain';
        }
        if (lowerName.endsWith('.png')) return 'image/png';
        if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
        if (lowerName.endsWith('.webp')) return 'image/webp';
        if (lowerName.endsWith('.gif')) return 'image/gif';
        if (lowerName.endsWith('.mp3')) return 'audio/mp3';
        if (lowerName.endsWith('.wav')) return 'audio/wav';
        if (lowerName.endsWith('.mp4')) return 'video/mp4';

        // 3. Nếu chữ ký PKZip (UEsDB) và không có tên file rõ ràng -> có thể là .docx
        if (b64Head.startsWith('UEsDB') && (!cleanMime || cleanMime === 'application/octet-stream' || cleanMime.includes('zip') || cleanMime.includes('officedocument'))) {
            return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }

        if (cleanMime && cleanMime !== 'application/octet-stream') {
            return cleanMime;
        }
        return 'application/octet-stream';
    }

    public isTextLikeMime(mime: string, fileName?: string): boolean {
        const m = String(mime || '').toLowerCase();
        const n = String(fileName || '').toLowerCase();
        if (
            m.startsWith('text/') ||
            m === 'application/json' ||
            m === 'application/xml' ||
            m === 'application/javascript' ||
            m === 'application/x-yaml' ||
            m.includes('csv')
        ) {
            return true;
        }
        return /\.(txt|md|markdown|csv|tsv|json|html|htm|xml|srt|vtt|yaml|yml|log|ini)$/i.test(n);
    }

    /**
     * Đọc file PDF và trả về toàn bộ text ghép theo trang (giữ tương thích ngược).
     */
    public async extractText(file: File, maxPages = 80): Promise<string> {
        const res = await this.extractPdf(file, { maxPages, renderScannedPages: false });
        return res.text;
    }

    /**
     * Trích xuất văn bản từ chuỗi base64 của file PDF (giữ tương thích ngược).
     */
    public async extractTextFromBase64(base64Data: string, maxPages = 80): Promise<string> {
        const res = await this.extractPdfFromBase64(base64Data, { maxPages, renderScannedPages: false });
        return res.text;
    }

    /**
     * Trích xuất đầy đủ PDF từ File hoặc ArrayBuffer:
     * - Trích xuất lớp văn bản có giữ cấu trúc xuống dòng.
     * - Nếu PDF là bản scan / sách ảnh (hoặc chỉ có watermark ngắn trên mỗi trang),
     *   tự động render các trang đầu ra ảnh JPEG sắc nét để cả Mì Tôm AI lẫn Gemini đọc bằng Vision OCR.
     */
    public async extractPdf(
        fileOrBuffer: File | ArrayBuffer,
        options?: { maxPages?: number; renderScannedPages?: boolean; maxImagePages?: number }
    ): Promise<PdfExtractResult> {
        const buffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
        return this._extractPdfFromBuffer(buffer, options);
    }

    public async extractPdfFromBase64(
        base64Data: string,
        options?: { maxPages?: number; renderScannedPages?: boolean; maxImagePages?: number }
    ): Promise<PdfExtractResult> {
        const cleanB64 = this._stripDataUriPrefix(base64Data);
        const bytes = this._base64ToUint8Array(cleanB64);
        return this._extractPdfFromBuffer(bytes.buffer as ArrayBuffer, options);
    }

    private async _extractPdfFromBuffer(
        data: ArrayBuffer,
        options?: { maxPages?: number; renderScannedPages?: boolean; maxImagePages?: number }
    ): Promise<PdfExtractResult> {
        const maxPages = options?.maxPages ?? 80;
        const renderScannedPages = options?.renderScannedPages !== false;
        const maxImagePages = options?.maxImagePages ?? PdfTextService.MAX_SCANNED_IMAGE_PAGES;

        const pdfjs = await this._loadPdfjs();
        // Nhân bản buffer để fake worker không làm detach ArrayBuffer gốc của caller
        const safeBytes = new Uint8Array(data.slice(0));
        const doc = await pdfjs.getDocument({
            data: safeBytes,
            useSystemFonts: true,
            isEvalSupported: false,
        }).promise;

        try {
            const numPages = doc.numPages || 0;
            const totalToRead = Math.min(numPages, maxPages);
            const pagesText: string[] = [];
            let substantialTextPages = 0;
            let accumulatedChars = 0;

            for (let i = 1; i <= totalToRead; i++) {
                const page = await doc.getPage(i);
                const textContent = await page.getTextContent();
                let lineBuf = '';
                for (const item of textContent.items || []) {
                    if (typeof item?.str === 'string') {
                        lineBuf += item.str;
                        lineBuf += item.hasEOL ? '\n' : ' ';
                    }
                }
                const pageText = lineBuf
                    .replace(/[ \t]+\n/g, '\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .replace(/[ \t]{2,}/g, ' ')
                    .trim();

                if (pageText.replace(/\s+/g, '').length >= 120) {
                    substantialTextPages++;
                }

                if (pageText) {
                    const entry = `[Trang ${i}/${numPages}]\n${pageText}`;
                    pagesText.push(entry);
                    accumulatedChars += entry.length;
                    if (accumulatedChars >= PdfTextService.MAX_EXTRACTED_TEXT_CHARS) {
                        pagesText.push(`[... Đã trích xuất ${i}/${numPages} trang đầu (giới hạn độ dài ngữ cảnh) ...]`);
                        break;
                    }
                }
            }

            const fullText = pagesText.join('\n\n').trim();
            // Nếu không có bất kỳ trang nào đạt >= 120 ký tự thực (ví dụ PDF scan hoặc PDF chỉ dính watermark FAHASA.COM)
            // và tổng văn bản rất ít (< 200 ký tự), coi là PDF scan/ảnh để kích hoạt render trang ra JPEG.
            const isScannedOrImagePdf = substantialTextPages === 0 || fullText.length < 100;
            const renderedPages: RenderedPdfPage[] = [];

            if (renderScannedPages && isScannedOrImagePdf && typeof document !== 'undefined' && numPages > 0) {
                const pagesToRender = Math.min(numPages, maxImagePages);
                let totalB64Len = 0;

                for (let i = 1; i <= pagesToRender; i++) {
                    try {
                        const page = await doc.getPage(i);
                        const baseViewport = page.getViewport({ scale: 1 });
                        const maxEdge = Math.max(baseViewport.width || 1, baseViewport.height || 1);
                        const targetScale = Math.min(2.0, Math.max(1.15, 1320 / maxEdge));
                        const viewport = page.getViewport({ scale: targetScale });

                        const canvas = document.createElement('canvas');
                        canvas.width = Math.max(1, Math.floor(viewport.width));
                        canvas.height = Math.max(1, Math.floor(viewport.height));
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            continue;
                        }

                        // Tô nền trắng trước khi vẽ để trang PDF nền trong suốt không bị đen khi xuất JPEG
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        await page.render({
                            canvasContext: ctx,
                            viewport: viewport,
                        }).promise;

                        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                        const b64 = this._stripDataUriPrefix(dataUrl);
                        canvas.width = 0;
                        canvas.height = 0;

                        if (b64) {
                            if (totalB64Len + b64.length > PdfTextService.MAX_SCANNED_TOTAL_B64_CHARS && renderedPages.length > 0) {
                                break;
                            }
                            renderedPages.push({
                                pageNumber: i,
                                mimeType: 'image/jpeg',
                                data: b64,
                            });
                            totalB64Len += b64.length;
                        }
                    } catch (renderErr) {
                        console.warn(`[PdfTextService] Không thể render trang ${i} sang ảnh:`, renderErr);
                    }
                }
            }

            return {
                text: fullText,
                numPages,
                substantialTextPages,
                isScannedOrImagePdf,
                renderedPages,
            };
        } finally {
            try {
                await doc.destroy();
            } catch {
                // Bỏ qua lỗi giải phóng bộ nhớ pdfjs
            }
        }
    }

    /**
     * Trích xuất văn bản từ tệp Word (.docx) ngay phía client bằng JSZip.
     */
    public async extractDocxFromBuffer(buffer: ArrayBuffer): Promise<string> {
        const jszipMod: any = await import('jszip');
        const JSZip = jszipMod?.default || jszipMod;
        const zip = await JSZip.loadAsync(buffer.slice(0));
        const docXmlFile = zip.file('word/document.xml');
        if (!docXmlFile) {
            return '';
        }
        const xmlContent: string = await docXmlFile.async('string');
        const plain = xmlContent
            .replace(/<w:tab\b[^>]*\/?>/gi, '\t')
            .replace(/<w:br\b[^>]*\/?>/gi, '\n')
            .replace(/<\/w:p>/gi, '\n')
            .replace(/<\/w:tr>/gi, '\n')
            .replace(/<\/w:tc>/gi, '\t')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'")
            .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (plain.length > PdfTextService.MAX_EXTRACTED_TEXT_CHARS) {
            return plain.slice(0, PdfTextService.MAX_EXTRACTED_TEXT_CHARS) + '\n[... Nội dung đã được rút gọn theo giới hạn ngữ cảnh ...]';
        }
        return plain;
    }

    public async extractDocxFromBase64(base64Data: string): Promise<string> {
        const cleanB64 = this._stripDataUriPrefix(base64Data);
        const bytes = this._base64ToUint8Array(cleanB64);
        return this.extractDocxFromBuffer(bytes.buffer as ArrayBuffer);
    }

    public decodeUtf8FromBase64(base64Data: string): string {
        const cleanB64 = this._stripDataUriPrefix(base64Data);
        const bytes = this._base64ToUint8Array(cleanB64);
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
        if (text.length > PdfTextService.MAX_EXTRACTED_TEXT_CHARS) {
            return text.slice(0, PdfTextService.MAX_EXTRACTED_TEXT_CHARS) + '\n[... Nội dung đã được rút gọn theo giới hạn ngữ cảnh ...]';
        }
        return text;
    }

    /**
     * Xử lý toàn diện một đối tượng File đính kèm từ giao diện người dùng (AI Writer / Chat)
     * thành văn bản trích xuất và/hoặc danh sách inlineParts chuẩn hóa cho AI.
     */
    public async processFileAttachment(file: File): Promise<ProcessedAttachmentResult> {
        const fileName = file.name || 'tep-dinh-kem';
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const headB64 = this._uint8ArrayToBase64(bytes.subarray(0, Math.min(bytes.length, 48)));
        const mimeType = this.inferMimeType(fileName, file.type, headB64);

        // 1. Tệp PDF (cả PDF văn bản lẫn PDF scan/sách ảnh)
        if (mimeType === 'application/pdf') {
            const pdfRes = await this._extractPdfFromBuffer(buffer, {
                maxPages: 80,
                renderScannedPages: true,
                maxImagePages: PdfTextService.MAX_SCANNED_IMAGE_PAGES,
            });

            if (!pdfRes.isScannedOrImagePdf && pdfRes.text.trim().length > 0) {
                return {
                    fileName,
                    mimeType,
                    numPages: pdfRes.numPages,
                    isScannedPdf: false,
                    textSection: `\n\n=== TÀI LIỆU PDF ĐÍNH KÈM: "${fileName}" (${pdfRes.numPages} trang) ===\n${pdfRes.text}\n=== HẾT TÀI LIỆU PDF: "${fileName}" ===\n`,
                    inlineParts: [],
                };
            }

            if (pdfRes.renderedPages.length > 0) {
                const extraSparseText = pdfRes.text.trim()
                    ? `\nVăn bản phụ trích xuất được trên trang: "${pdfRes.text.trim()}"\n`
                    : '';
                return {
                    fileName,
                    mimeType,
                    numPages: pdfRes.numPages,
                    isScannedPdf: true,
                    textSection: `\n\n=== TÀI LIỆU PDF ĐÍNH KÈM (DẠNG TRANG ẢNH / SCAN): "${fileName}" ===\nTệp PDF gồm ${pdfRes.numPages} trang; hệ thống đã chuyển ${pdfRes.renderedPages.length} trang đầu thành các hình ảnh đính kèm ngay trong yêu cầu này.${extraSparseText}Hãy quan sát và đọc kỹ toàn bộ chữ viết, bìa sách, tiêu đề, thông tin chi tiết trên các trang ảnh đính kèm để thực hiện chính xác yêu cầu của người dùng.\n=== HẾT THÔNG TIN TỆP PDF "${fileName}" ===\n`,
                    inlineParts: pdfRes.renderedPages.map((pg) => ({
                        mimeType: pg.mimeType,
                        data: pg.data,
                    })),
                };
            }

            if (pdfRes.text.trim().length > 0) {
                return {
                    fileName,
                    mimeType,
                    numPages: pdfRes.numPages,
                    isScannedPdf: false,
                    textSection: `\n\n=== TÀI LIỆU PDF ĐÍNH KÈM: "${fileName}" (${pdfRes.numPages} trang) ===\n${pdfRes.text}\n=== HẾT TÀI LIỆU PDF: "${fileName}" ===\n`,
                    inlineParts: [],
                };
            }

            // Trường hợp dự phòng cuối cùng (ví dụ môi trường không có canvas): gửi kèm base64 PDF gốc cho Gemini/Claude
            return {
                fileName,
                mimeType: 'application/pdf',
                numPages: pdfRes.numPages,
                isScannedPdf: true,
                textSection: `\n\n[Đã đính kèm tệp PDF gốc: "${fileName}" (${pdfRes.numPages} trang)]\n`,
                inlineParts: [
                    {
                        mimeType: 'application/pdf',
                        data: this._uint8ArrayToBase64(bytes),
                    },
                ],
            };
        }

        // 2. Tệp Word (.docx)
        if (mimeType.includes('wordprocessingml') || fileName.toLowerCase().endsWith('.docx')) {
            try {
                const docxText = await this.extractDocxFromBuffer(buffer);
                if (docxText.trim().length > 0) {
                    return {
                        fileName,
                        mimeType,
                        textSection: `\n\n=== TÀI LIỆU WORD ĐÍNH KÈM: "${fileName}" ===\n${docxText}\n=== HẾT TÀI LIỆU WORD: "${fileName}" ===\n`,
                        inlineParts: [],
                    };
                }
            } catch (docxErr) {
                console.warn(`[PdfTextService] Lỗi đọc file DOCX "${fileName}":`, docxErr);
            }
        }

        // 3. Các tệp văn bản thuần / dữ liệu có cấu trúc (.txt, .md, .csv, .json, .html, .xml, .srt...)
        if (this.isTextLikeMime(mimeType, fileName)) {
            let textContent = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
            if (textContent.length > PdfTextService.MAX_EXTRACTED_TEXT_CHARS) {
                textContent =
                    textContent.slice(0, PdfTextService.MAX_EXTRACTED_TEXT_CHARS) +
                    '\n[... Nội dung đã được rút gọn theo giới hạn ngữ cảnh ...]';
            }
            return {
                fileName,
                mimeType,
                textSection: `\n\n=== TỆP VĂN BẢN ĐÍNH KÈM: "${fileName}" ===\n${textContent}\n=== HẾT TỆP: "${fileName}" ===\n`,
                inlineParts: [],
            };
        }

        // 4. Hình ảnh / Âm thanh / Video (giữ dạng inlineData với MIME chuẩn xác)
        const normalizedMediaMime =
            mimeType && mimeType !== 'application/octet-stream' ? mimeType : 'image/jpeg';
        const isImage = normalizedMediaMime.startsWith('image/');
        return {
            fileName,
            mimeType: normalizedMediaMime,
            textSection: isImage
                ? `\n[Người dùng đã đính kèm tệp hình ảnh: "${fileName}". Hãy phân tích kỹ nội dung hiển thị trong ảnh đính kèm.]\n`
                : `\n[Người dùng đã đính kèm tệp phương tiện: "${fileName}"]\n`,
            inlineParts: [
                {
                    mimeType: normalizedMediaMime,
                    data: this._uint8ArrayToBase64(bytes),
                },
            ],
        };
    }

    private _stripDataUriPrefix(raw: string): string {
        if (!raw) return '';
        const commaIdx = raw.indexOf(',');
        if (raw.startsWith('data:') && commaIdx >= 0) {
            return raw.slice(commaIdx + 1).trim();
        }
        return raw.trim();
    }

    private _base64ToUint8Array(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    private _uint8ArrayToBase64(bytes: Uint8Array): string {
        const chunkSize = 0x8000;
        const chunks: string[] = [];
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const sub = bytes.subarray(i, i + chunkSize);
            chunks.push(String.fromCharCode.apply(null, sub as unknown as number[]));
        }
        return btoa(chunks.join(''));
    }
}
