import * as CryptoJS from 'crypto-js';

export const MASTER_ENCRYPTION_KEYS = [
    'ai_type_secret_key_2026_!@#',
    '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8',
    'ai.type.vn-secret-key-2026'
];

export const PRIMARY_MASTER_KEY = MASTER_ENCRYPTION_KEYS[0];

export function isMasterKey(key: string): boolean {
    if (!key) return false;
    const trimmed = key.trim();
    return MASTER_ENCRYPTION_KEYS.includes(trimmed);
}

/**
 * Thử giải mã một chuỗi ciphertext bằng mật khẩu người dùng hoặc Master Key của Admin.
 * Trả về chuỗi text sau khi giải mã hoặc null nếu không thể giải mã.
 */
export function tryDecryptWithMasterFallback(
    ciphertext: string,
    providedPassword?: string,
    masterCiphertext?: string
): string | null {
    if (!ciphertext && !masterCiphertext) return null;

    // 1. Thử giải mã ciphertext chính bằng mật khẩu người dùng cung cấp
    if (ciphertext && providedPassword) {
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, providedPassword);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (decrypted && decrypted.length > 0) {
                return decrypted;
            }
        } catch (e) {}
    }

    // 2. Nếu mật khẩu cung cấp là một trong các Master Key
    if (providedPassword && isMasterKey(providedPassword)) {
        // Thử giải mã masterCiphertext
        if (masterCiphertext) {
            for (const mKey of MASTER_ENCRYPTION_KEYS) {
                try {
                    const bytes = CryptoJS.AES.decrypt(masterCiphertext, mKey);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if (decrypted && decrypted.length > 0) return decrypted;
                } catch (e) {}
            }
        }
        // Thử giải mã ciphertext chính bằng Master Key
        if (ciphertext) {
            try {
                const bytes = CryptoJS.AES.decrypt(ciphertext, providedPassword.trim());
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                if (decrypted && decrypted.length > 0) return decrypted;
            } catch (e) {}
        }
    }

    // 3. Quét tất cả Master Key trên cả masterCiphertext và ciphertext chính
    const targets = [masterCiphertext, ciphertext].filter(Boolean) as string[];
    for (const target of targets) {
        for (const mKey of MASTER_ENCRYPTION_KEYS) {
            try {
                const bytes = CryptoJS.AES.decrypt(target, mKey);
                const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                if (decrypted && decrypted.length > 0) return decrypted;
            } catch (e) {}
        }
    }

    return null;
}
