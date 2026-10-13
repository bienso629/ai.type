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

export interface EncryptedPayloadObject {
    salt: string;
    iv: string;
    data: string;
}

/**
 * Giải mã payload AES-256-CBC được mã hoá bằng PBKDF2 (100.000 vòng lặp SHA-256)
 */
export function decryptPbkdf2AesCbc(
    payload: EncryptedPayloadObject,
    password?: string
): string | null {
    if (!payload || !payload.salt || !payload.iv || !payload.data) return null;

    const keysToTry: string[] = [];
    if (password && password.trim()) {
        keysToTry.push(password.trim());
    }
    if (!password || isMasterKey(password)) {
        for (const mKey of MASTER_ENCRYPTION_KEYS) {
            if (!keysToTry.includes(mKey)) keysToTry.push(mKey);
        }
    }

    for (const key of keysToTry) {
        try {
            const saltWA = CryptoJS.enc.Hex.parse(payload.salt);
            const ivWA = CryptoJS.enc.Hex.parse(payload.iv);
            const keyWA = CryptoJS.PBKDF2(key, saltWA, {
                keySize: 256 / 32,
                iterations: 100000,
                hasher: CryptoJS.algo.SHA256,
            });
            const cipherParams = (CryptoJS.lib as any).CipherParams.create({
                ciphertext: CryptoJS.enc.Hex.parse(payload.data),
            });
            const decryptedWA = CryptoJS.AES.decrypt(cipherParams, keyWA, {
                iv: ivWA,
                mode: CryptoJS.mode.CBC,
                padding: CryptoJS.pad.Pkcs7,
            });
            const decryptedStr = decryptedWA.toString(CryptoJS.enc.Utf8);
            if (decryptedStr && decryptedStr.length > 0) {
                return decryptedStr;
            }
        } catch (e) {}
    }
    return null;
}

/**
 * Thử giải mã một chuỗi ciphertext hoặc đối tượng encrypted_payload bằng mật khẩu người dùng hoặc Master Key của Admin.
 * Trả về chuỗi text sau khi giải mã hoặc null nếu không thể giải mã.
 */
export function tryDecryptWithMasterFallback(
    ciphertext: any,
    providedPassword?: string,
    masterCiphertext?: string
): string | null {
    if (!ciphertext && !masterCiphertext) return null;

    // A. Nếu ciphertext là đối tượng hoặc chuỗi JSON mang định dạng { salt, iv, data }
    let pbkdf2Obj: EncryptedPayloadObject | null = null;
    if (typeof ciphertext === 'object' && ciphertext && ciphertext.salt && ciphertext.iv && ciphertext.data) {
        pbkdf2Obj = ciphertext as EncryptedPayloadObject;
    } else if (typeof ciphertext === 'string' && ciphertext.trim().startsWith('{') && ciphertext.includes('"salt"') && ciphertext.includes('"iv"') && ciphertext.includes('"data"')) {
        try {
            const parsed = JSON.parse(ciphertext);
            if (parsed && parsed.salt && parsed.iv && parsed.data) {
                pbkdf2Obj = parsed;
            }
        } catch (e) {}
    }

    if (pbkdf2Obj) {
        const decrypted = decryptPbkdf2AesCbc(pbkdf2Obj, providedPassword);
        if (decrypted && decrypted.length > 0) return decrypted;
    }

    const strCipher = typeof ciphertext === 'string' ? ciphertext : '';

    // 1. Thử giải mã ciphertext chính bằng mật khẩu người dùng cung cấp (CryptoJS OpenSSL AES format)
    if (strCipher && providedPassword) {
        try {
            const bytes = CryptoJS.AES.decrypt(strCipher, providedPassword);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (decrypted && decrypted.length > 0) {
                return decrypted;
            }
        } catch (e) {}
    }

    // 2. Nếu mật khẩu cung cấp là một trong các Master Key (hoặc không cung cấp mật khẩu khi giải mã tự động bằng Master Key)
    if (!providedPassword || isMasterKey(providedPassword)) {
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
        if (strCipher) {
            for (const mKey of MASTER_ENCRYPTION_KEYS) {
                try {
                    const bytes = CryptoJS.AES.decrypt(strCipher, mKey);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    if (decrypted && decrypted.length > 0) return decrypted;
                } catch (e) {}
            }
        }
    }

    return null;
}
