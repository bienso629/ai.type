import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import * as CryptoTS from 'crypto-ts';

@Injectable({
    providedIn: 'root',
    
})
export class HelperService {
    public openChatGPTWithSEO$ = new Subject<{ question?: string, answer?: string, loading?: boolean, goiy?: string, attachedFile?: any }>();

    constructor() {}

    public textToNumber(text: string): number {
        return text
            .split('')
            .map((c) => c.charCodeAt(0))
            .reduce((a, b) => a + b, 0);
    }

    public updateStatistics(field: string, increment: number): void {
        let statistics = localStorage.getItem('statistics');
        let statistics_ai_writer = statistics
            ? JSON.parse(statistics)
            : {
                  done: 0,
                  money: 0,
                  archives: 0,
                  writing: 0,
                  chatgpt: 0,
                  wp2md: 0,
                  faceposts: 0,
                  links: 0,
              };

        statistics_ai_writer[field] += increment;
        localStorage.setItem(
            'statistics',
            JSON.stringify(statistics_ai_writer),
        );
    }

    public safeJsonParseFromAI(text: string): any {
        try {
            if (!text) throw new Error('Empty AI response');

            let jsonText = text.trim();

            // 1. Remove markdown ```json blocks
            jsonText = jsonText
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();

            // 2. Extract JSON if AI added explanation text
            const firstBrace = jsonText.indexOf('{');
            const firstBracket = jsonText.indexOf('[');

            let start = -1;

            if (firstBrace !== -1 && firstBracket !== -1) {
                start = Math.min(firstBrace, firstBracket);
            } else {
                start = Math.max(firstBrace, firstBracket);
            }

            if (start !== -1) {
                const isArray = jsonText[start] === '[';
                const endChar = isArray ? ']' : '}';
                const end = jsonText.lastIndexOf(endChar);
                if (end !== -1 && end >= start) {
                    jsonText = jsonText.substring(start, end + 1);
                } else {
                    jsonText = jsonText.substring(start);
                }
            }

            // 3. Remove invalid escape characters like \_
            jsonText = jsonText.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');

            // 4. Remove trailing commas
            jsonText = jsonText.replace(/,\s*([}\]])/g, '$1');

            // 5. Remove control characters
            jsonText = jsonText.replace(/[\u0000-\u001F]+/g, '');

            // 6. Parse
            return JSON.parse(jsonText);
        } catch (err: any) {
            console.error('AI JSON parse failed');
            console.error('Original:', text);
            throw new Error(`${err.message} | RAW: ${text.substring(0, 150)}`);
        }
    }

    public encrypt(object: object, key: string): String {
        const ciphertext = CryptoTS.AES.encrypt(
            JSON.stringify(object),
            key,
        ).toString();
        return ciphertext;
    }

    public decrypt(hashed: string, key: string): Object {
        const byte = CryptoTS.AES.decrypt(hashed, key);
        const decryptedData = JSON.parse(byte.toString(CryptoTS.enc.Utf8));

        return decryptedData;
    }
}
