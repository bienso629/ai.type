/**
 * Helper hỗ trợ nhúng và trích xuất Metadata (prompt, model, aspectRatio,...)
 * trực tiếp vào cấu trúc nhị phân của ảnh:
 * - PNG: chunk tEXt với keyword 'prompt'
 * - JPEG: marker COM (0xFF 0xFE)
 */

export interface ImagePromptMetadata {
    prompt: string;
    modelId?: string;
    aspectRatio?: string;
    createdAt?: number;
    [key: string]: any;
}

// Bảng tra cứu CRC32 cho PNG chunk
const crcTable: Uint32Array = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c >>> 0;
    }
    return table;
})();

function calculateCRC32(buf: Uint8Array, offset: number, length: number): number {
    let crc = 0xffffffff;
    for (let i = 0; i < length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ buf[offset + i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 16384;
    for (let i = 0; i < len; i += chunkSize) {
        const sub = bytes.subarray(i, Math.min(i + chunkSize, len));
        binary += String.fromCharCode.apply(null, sub as any);
    }
    return btoa(binary);
}

/**
 * Nhúng chunk tEXt vào PNG (ngay sau chunk IHDR)
 */
function embedPngTextChunk(bytes: Uint8Array, keyword: string, text: string): Uint8Array {
    // Kiểm tra PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (bytes.length < 8 ||
        bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47 ||
        bytes[4] !== 0x0d || bytes[5] !== 0x0a || bytes[6] !== 0x1a || bytes[7] !== 0x0a) {
        return bytes;
    }

    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(keyword);
    const textBytes = encoder.encode(text);
    const chunkDataLen = keyBytes.length + 1 + textBytes.length; // keyword + null separator (0x00) + text

    // Chunk layout: 4 bytes length + 4 bytes 'tEXt' + chunkDataLen bytes + 4 bytes CRC
    const chunkTotalLen = 4 + 4 + chunkDataLen + 4;
    const chunkBuffer = new Uint8Array(chunkTotalLen);
    const view = new DataView(chunkBuffer.buffer);

    view.setUint32(0, chunkDataLen, false); // Length
    chunkBuffer[4] = 0x74; // 't'
    chunkBuffer[5] = 0x45; // 'E'
    chunkBuffer[6] = 0x58; // 'X'
    chunkBuffer[7] = 0x74; // 't'

    chunkBuffer.set(keyBytes, 8);
    chunkBuffer[8 + keyBytes.length] = 0x00; // null separator
    chunkBuffer.set(textBytes, 8 + keyBytes.length + 1);

    // Tính CRC trên 'tEXt' + data (bỏ qua 4 bytes length đầu)
    const crc = calculateCRC32(chunkBuffer, 4, 4 + chunkDataLen);
    view.setUint32(chunkTotalLen - 4, crc, false);

    // Tìm vị trí sau chunk IHDR (IHDR bắt đầu ở byte 8, length là 4 bytes tiếp theo)
    const ihdrLen = (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
    const insertPos = 8 + 4 + 4 + ihdrLen + 4; // 8 sig + 4 len + 4 type + data + 4 crc

    const result = new Uint8Array(bytes.length + chunkTotalLen);
    result.set(bytes.subarray(0, insertPos), 0);
    result.set(chunkBuffer, insertPos);
    result.set(bytes.subarray(insertPos), insertPos + chunkTotalLen);
    return result;
}

/**
 * Đọc chunk tEXt từ PNG theo keyword
 */
function extractPngTextChunk(bytes: Uint8Array, keyword: string): string | null {
    if (bytes.length < 8) return null;
    const decoder = new TextDecoder('utf-8');
    let pos = 8; // Bỏ qua PNG signature

    while (pos + 8 <= bytes.length) {
        const length = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
        const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        const dataStart = pos + 8;
        const dataEnd = dataStart + length;

        if (dataEnd + 4 > bytes.length) break;

        if (type === 'tEXt') {
            const chunkData = bytes.subarray(dataStart, dataEnd);
            let nullIdx = -1;
            for (let i = 0; i < chunkData.length; i++) {
                if (chunkData[i] === 0x00) {
                    nullIdx = i;
                    break;
                }
            }
            if (nullIdx !== -1) {
                const chunkKey = decoder.decode(chunkData.subarray(0, nullIdx));
                if (chunkKey.toLowerCase() === keyword.toLowerCase()) {
                    return decoder.decode(chunkData.subarray(nullIdx + 1));
                }
            }
        }

        pos = dataEnd + 4; // Bỏ qua CRC
    }
    return null;
}

/**
 * Nhúng COM marker (0xFF 0xFE) vào JPEG
 */
function embedJpegComment(bytes: Uint8Array, comment: string): Uint8Array {
    // Kiểm tra SOI: FF D8
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return bytes;
    }

    const encoder = new TextEncoder();
    const commentBytes = encoder.encode(comment);
    const markerLen = 2 + commentBytes.length; // độ dài marker bao gồm cả 2 bytes size

    // Format: 0xFF 0xFE (2 bytes) + Length (2 bytes big endian) + data
    const comSegment = new Uint8Array(2 + 2 + commentBytes.length);
    comSegment[0] = 0xff;
    comSegment[1] = 0xfe;
    comSegment[2] = (markerLen >> 8) & 0xff;
    comSegment[3] = markerLen & 0xff;
    comSegment.set(commentBytes, 4);

    // Tìm vị trí chèn: tốt nhất là sau segment APP0 (0xFF 0xE0) hoặc APP1 (0xFF 0xE1) nếu có
    let insertPos = 2;
    let pos = 2;
    while (pos < bytes.length - 4) {
        if (bytes[pos] !== 0xff) {
            pos++;
            continue;
        }
        const marker = bytes[pos + 1];
        if (marker === 0xd8) {
            pos += 2;
            continue;
        }
        if (marker === 0xd9 || marker === 0xda) {
            // Đã đến EOI hoặc SOS, dừng lại và chèn ngay trước SOS
            insertPos = pos;
            break;
        }
        const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
        if (marker === 0xe0 || marker === 0xe1) {
            // Chèn ngay sau APP0 / APP1
            insertPos = pos + 2 + length;
        }
        pos += 2 + length;
    }

    const result = new Uint8Array(bytes.length + comSegment.length);
    result.set(bytes.subarray(0, insertPos), 0);
    result.set(comSegment, insertPos);
    result.set(bytes.subarray(insertPos), insertPos + comSegment.length);
    return result;
}

/**
 * Đọc COM marker từ JPEG
 */
function extractJpegComment(bytes: Uint8Array): string | null {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    const decoder = new TextDecoder('utf-8');
    let pos = 2;

    while (pos < bytes.length - 1) {
        if (bytes[pos] !== 0xff) {
            pos++;
            continue;
        }

        const marker = bytes[pos + 1];
        if (marker === 0xd9) break; // EOI
        if (marker === 0xda) break; // SOS (bắt đầu dữ liệu nén quét)

        if (pos + 4 > bytes.length) break;
        const length = (bytes[pos + 2] << 8) | bytes[pos + 3];

        if (marker === 0xfe) { // COM
            const payload = bytes.subarray(pos + 4, pos + 2 + length);
            return decoder.decode(payload);
        }

        pos += 2 + length;
    }
    return null;
}

function isPngSignature(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
    );
}

function isJpegSignature(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 4 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
    );
}

/**
 * Hàm nhúng thông tin prompt metadata vào base64 hình ảnh (PNG hoặc JPEG)
 * Tự động nhận diện cấu trúc file qua magic bytes thay vì chỉ tin tưởng mimeType!
 */
export function embedPromptToImageBase64(
    base64Data: string,
    mimeType?: string,
    metadata?: ImagePromptMetadata
): string {
    if (!metadata) return base64Data;
    try {
        const jsonStr = JSON.stringify(metadata);
        const bytes = base64ToUint8Array(base64Data);

        // 1. Kiểm tra magic bytes thực tế
        if (isPngSignature(bytes)) {
            const modifiedBytes = embedPngTextChunk(bytes, 'prompt', jsonStr);
            return uint8ArrayToBase64(modifiedBytes);
        } else if (isJpegSignature(bytes)) {
            const modifiedBytes = embedJpegComment(bytes, jsonStr);
            return uint8ArrayToBase64(modifiedBytes);
        }

        // 2. Dự phòng nếu magic bytes chưa phát hiện ra nhưng mimeType có đề cập
        if (mimeType && mimeType.includes('png')) {
            const modifiedBytes = embedPngTextChunk(bytes, 'prompt', jsonStr);
            return uint8ArrayToBase64(modifiedBytes);
        } else if (mimeType && (mimeType.includes('jpeg') || mimeType.includes('jpg'))) {
            const modifiedBytes = embedJpegComment(bytes, jsonStr);
            return uint8ArrayToBase64(modifiedBytes);
        }

        return base64Data;
    } catch (err) {
        console.error('Lỗi khi nhúng metadata vào ảnh:', err);
        return base64Data;
    }
}

/**
 * Hàm trích xuất prompt metadata từ Uint8Array hoặc ArrayBuffer
 */
export function extractPromptFromImageBytes(bytes: Uint8Array): ImagePromptMetadata | null {
    try {
        // Kiểm tra PNG
        if (isPngSignature(bytes)) {
            const raw = extractPngTextChunk(bytes, 'prompt');
            if (raw) {
                try {
                    return JSON.parse(raw);
                } catch {
                    return { prompt: raw };
                }
            }
        }
        // Kiểm tra JPEG
        else if (isJpegSignature(bytes)) {
            const raw = extractJpegComment(bytes);
            if (raw) {
                try {
                    return JSON.parse(raw);
                } catch {
                    return { prompt: raw };
                }
            }
        } else {
            // Thử quét cả 2 định dạng nếu header lệch nhẹ
            const pngRaw = extractPngTextChunk(bytes, 'prompt');
            if (pngRaw) {
                try {
                    return JSON.parse(pngRaw);
                } catch {
                    return { prompt: pngRaw };
                }
            }
            const jpegRaw = extractJpegComment(bytes);
            if (jpegRaw) {
                try {
                    return JSON.parse(jpegRaw);
                } catch {
                    return { prompt: jpegRaw };
                }
            }
        }
    } catch (err) {
        console.error('Lỗi khi đọc metadata từ ảnh:', err);
    }
    return null;
}

/**
 * Hàm trích xuất prompt metadata từ base64
 */
export function extractPromptFromImageBase64(base64Data: string): ImagePromptMetadata | null {
    try {
        const bytes = base64ToUint8Array(base64Data);
        return extractPromptFromImageBytes(bytes);
    } catch (err) {
        console.error('Lỗi extract metadata từ base64:', err);
        return null;
    }
}
