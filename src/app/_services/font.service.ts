import { Injectable } from '@angular/core';

export interface ActiveFontVariant {
    fileName: string;
    fontName: string;
    extension: string;
    fontWeight: number;
    fontStyle: string;
    dataUrl?: string;
    filePath?: string;
}

export interface ActiveAppFontGroup {
    folderName: string;
    variants: ActiveFontVariant[];
}

@Injectable({
    providedIn: 'root'
})
export class FontService {
    private readonly STORAGE_KEY = 'ai_type_active_font_group';
    private readonly STYLE_ELEMENT_ID = 'active-app-global-font-style';

    constructor() {}

    /**
     * Nhận diện chuẩn xác Font Weight (100-900) dựa trên tên file / tên font
     * Kiểm tra các từ ghép (SemiBold, ExtraBold, ExtraLight...) trước từ đơn (Bold, Light)
     */
    detectFontWeight(fontName: string): number {
        const lower = fontName.toLowerCase();
        
        // 1. Kiểm tra các từ ghép / độ nét đặc thù trước
        if (lower.includes('extrabold') || lower.includes('extra-bold') || lower.includes('ultrabold') || lower.includes('ultra-bold') || lower.includes('heavy') || lower.includes('ultra')) return 800;
        if (lower.includes('semibold') || lower.includes('semi-bold') || lower.includes('demibold') || lower.includes('demi-bold') || lower.includes('demi')) return 600;
        if (lower.includes('extralight') || lower.includes('extra-light') || lower.includes('ultralight') || lower.includes('ultra-light') || lower.includes('xlight')) return 200;

        // 2. Kiểm tra các độ nét tiêu chuẩn
        if (lower.includes('black') || lower.includes('poster')) return 900;
        if (lower.includes('thin') || lower.includes('hairline')) return 100;
        if (lower.includes('light')) return 300;
        if (lower.includes('medium')) return 500;
        if (lower.includes('bold')) return 700;
        if (lower.includes('book') || lower.includes('regular') || lower.includes('normal')) return 400;

        return 400; // Mặc định Regular / Normal
    }

    /**
     * Nhận diện Font Style (normal / italic) dựa trên tên file / tên font
     */
    detectFontStyle(fontName: string): string {
        const lower = fontName.toLowerCase();
        if (lower.includes('italic') || lower.includes('oblique') || lower.includes('slanted')) return 'italic';
        return 'normal';
    }

    /**
     * Khởi tạo font hệ thống khi ứng dụng khởi chạy
     */
    async initFontSystem(): Promise<void> {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (!saved) return;

        try {
            const fontGroup: ActiveAppFontGroup = JSON.parse(saved);
            if (!fontGroup || !fontGroup.folderName || !fontGroup.variants) return;

            // Nếu trong môi trường Electron, tải dữ liệu font mới nhất từ ổ cứng
            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('fonts:list');
                if (res && res.success && res.groups) {
                    const group = res.groups.find((g: any) => g.folderName === fontGroup.folderName);
                    if (group && group.fonts) {
                        fontGroup.variants = group.fonts.map((f: any) => ({
                            fileName: f.fileName,
                            fontName: f.fontName,
                            extension: f.extension,
                            fontWeight: this.detectFontWeight(f.fontName),
                            fontStyle: this.detectFontStyle(f.fontName),
                            dataUrl: f.dataUrl,
                            filePath: f.filePath
                        }));
                    }
                }
            }

            this.applyFontGroupToApp(fontGroup);
        } catch (e) {
            console.error('Lỗi khi nạp font mặc định ứng dụng:', e);
        }
    }

    /**
     * Lấy thông tin bộ font hiện tại đang áp dụng
     */
    getActiveFontGroup(): ActiveAppFontGroup | null {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            return null;
        }
    }

    /**
     * Tạo chuỗi CSS @font-face ánh xạ chuẩn xác 9 độ nét font (100-900).
     * Khi thiếu biến thể, ưu tiên lấy theo thứ tự W:400 -> W:300 -> W:200 -> W:100 cho văn bản thường.
     */
    private buildFullFontFamilyRules(familyName: string, variants: ActiveFontVariant[]): string {
        const rules: string[] = [];
        const normalVariants = variants.filter(v => v.fontStyle === 'normal');
        const italicVariants = variants.filter(v => v.fontStyle === 'italic');

        const fillWeights = (variantList: ActiveFontVariant[], isItalic: boolean) => {
            if (variantList.length === 0) return;

            const targetWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900];

            for (const tw of targetWeights) {
                let best: ActiveFontVariant | null = variantList.find(v => v.fontWeight === tw) || null;

                if (!best) {
                    if (tw <= 600) {
                        // Cho độ nét văn bản thường (<= 600): Ưu tiên W:400 -> W:300 -> W:200 -> W:100 -> W:500 -> W:600
                        const normalPriority = [400, 300, 200, 100, 500, 600, 700, 800, 900];
                        for (const pw of normalPriority) {
                            best = variantList.find(v => v.fontWeight === pw) || null;
                            if (best) break;
                        }
                    } else {
                        // Cho độ nét văn bản in đậm (>= 700): Ưu tiên W:700 -> W:800 -> W:900 -> W:600 -> W:500 -> W:400
                        const boldPriority = [700, 800, 900, 600, 500, 400, 300, 200, 100];
                        for (const pw of boldPriority) {
                            best = variantList.find(v => v.fontWeight === pw) || null;
                            if (best) break;
                        }
                    }
                }

                if (!best) {
                    best = variantList[0];
                }

                if (best && best.dataUrl) {
                    let format = 'truetype';
                    if (best.extension === '.otf') format = 'opentype';
                    else if (best.extension === '.woff') format = 'woff';
                    else if (best.extension === '.woff2') format = 'woff2';

                    rules.push(`
                        @font-face {
                            font-family: '${familyName}';
                            src: url('${best.dataUrl}') format('${format}');
                            font-weight: ${tw};
                            font-style: ${isItalic ? 'italic' : 'normal'};
                            font-display: swap;
                        }
                    `);
                }
            }
        };

        fillWeights(normalVariants, false);

        if (italicVariants.length > 0) {
            fillWeights(italicVariants, true);
        } else if (normalVariants.length > 0) {
            fillWeights(normalVariants, true);
        }

        return rules.join('\n');
    }

    /**
     * Áp dụng NGUYÊN BẢN toàn bộ các kiểu chữ (Thin, ExtraLight, Light, Regular, Medium, SemiBold, Bold, ExtraBold, Black, Italic...)
     * của bộ font vào hệ thống theo chuẩn CSS @font-face
     */
    applyFontGroupToApp(fontGroup: ActiveAppFontGroup): void {
        if (!fontGroup || !fontGroup.variants || fontGroup.variants.length === 0) return;

        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(fontGroup));

        let existingStyle = document.getElementById(this.STYLE_ELEMENT_ID) as HTMLStyleElement;
        if (!existingStyle) {
            existingStyle = document.createElement('style');
            existingStyle.id = this.STYLE_ELEMENT_ID;
            document.head.appendChild(existingStyle);
        }

        const appCustomRules = this.buildFullFontFamilyRules('AppCustomFontFamily', fontGroup.variants);
        const folderNameRules = this.buildFullFontFamilyRules(fontGroup.folderName, fontGroup.variants);

        existingStyle.innerHTML = `
            ${appCustomRules}
            ${folderNameRules}

            :root {
                --fuse-font-sans: 'AppCustomFontFamily', 'Inter var', sans-serif !important;
            }
            body, button, input, select, textarea, .text-base, .mat-typography {
                font-family: 'AppCustomFontFamily', 'Inter var', sans-serif !important;
            }
        `;
    }

    /**
     * Hủy bỏ font tùy chỉnh, khôi phục font mặc định ban đầu của ứng dụng
     */
    clearActiveFont(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        const existingStyle = document.getElementById(this.STYLE_ELEMENT_ID);
        if (existingStyle) {
            existingStyle.remove();
        }
        document.documentElement.style.removeProperty('--fuse-font-sans');
    }
}
