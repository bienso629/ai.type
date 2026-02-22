import { Injectable } from '@angular/core';
import * as CryptoTS from 'crypto-ts';

@Injectable({
    providedIn: 'root'
})
export class HelperService {
    constructor() { }

    public textToNumber(text: string): number {
        return text.split('')
            .map(c => c.charCodeAt(0))
            .reduce((a, b) => a + b, 0);
    }

    public updateStatistics(field: string, increment: number): void {
        let statistics = localStorage.getItem('statistics');
        let statistics_ai_writer = statistics ? JSON.parse(statistics) : {
            "done": 0,
            "money": 0,
            "archives": 0,
            "writing": 0,
            "chatgpt": 0,
            "wp2md": 0,
            "faceposts": 0,
            "links": 0
        };

        statistics_ai_writer[field] += increment;
        localStorage.setItem('statistics', JSON.stringify(statistics_ai_writer));
    }

    public encrypt(object: object, key: string): String {
        const ciphertext = CryptoTS.AES.encrypt(JSON.stringify(object), key).toString();
        return ciphertext;
    }

    public decrypt(hashed: string, key: string): Object {
        const byte = CryptoTS.AES.decrypt(hashed, key);
        const decryptedData = JSON.parse(byte.toString(CryptoTS.enc.Utf8));

        return decryptedData;
    }
}
