import { Injectable } from '@angular/core';

/**
 * Service trích xuất nội dung văn bản từ file PDF ngay phía client.
 *
 * Dùng pdfjs-dist với cơ chế "fake worker" (gán WorkerMessageHandler vào
 * globalThis.pdfjsWorker để chạy trên main thread), không cần nạp file
 * worker ngoài nên hoạt động tốt cả trong Electron (giao thức file://)
 * lẫn trình duyệt web.
 */
@Injectable({ providedIn: 'root' })
export class PdfTextService {
    private _pdfjs: any = null;

    /**
     * Nạp lười thư viện pdfjs-dist và cấu hình fake worker (chỉ làm 1 lần).
     */
    private async _loadPdfjs(): Promise<any> {
        if (this._pdfjs) {
            return this._pdfjs;
        }
        const pdfjs: any = await import('pdfjs-dist');
        // @ts-ignore - module worker của pdfjs không có file khai báo kiểu
        const workerModule: any = await import('pdfjs-dist/build/pdf.worker.mjs');
        // QUAN TRỌNG: pdfjs đọc handler qua globalThis.pdfjsWorker?.WorkerMessageHandler
        // nên phải gán một object có thuộc tính WorkerMessageHandler, KHÔNG gán
        // trực tiếp handler (nó sẽ thành handler.WorkerMessageHandler = undefined
        // và pdfjs ném lỗi No "GlobalWorkerOptions.workerSrc" specified).
        (globalThis as any).pdfjsWorker = { WorkerMessageHandler: workerModule.WorkerMessageHandler };
        this._pdfjs = pdfjs;
        return pdfjs;
    }

    /**
     * Đọc file PDF và trả về toàn bộ text ghép theo trang.
     * Trả về chuỗi rỗng nếu PDF là bản scan (không có lớp văn bản).
     */
    public async extractText(file: File, maxPages = 60): Promise<string> {
        const buffer = await file.arrayBuffer();
        return this._extractFromBuffer(buffer, maxPages);
    }

    /**
     * Trích xuất văn bản từ chuỗi base64 của file PDF
     * (dùng cho các luồng đã đọc file thành inlineData trước đó).
     */
    public async extractTextFromBase64(base64Data: string, maxPages = 60): Promise<string> {
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return this._extractFromBuffer(bytes.buffer, maxPages);
    }

    private async _extractFromBuffer(data: ArrayBuffer, maxPages: number): Promise<string> {
        const pdfjs = await this._loadPdfjs();
        const doc = await pdfjs.getDocument({ data: data }).promise;
        const total = Math.min(doc.numPages, maxPages);
        const pages: string[] = [];
        for (let i = 1; i <= total; i++) {
            const page = await doc.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (pageText) {
                pages.push(`[Trang ${i}] ${pageText}`);
            }
        }
        await doc.destroy();
        return pages.join('\n\n');
    }
}
