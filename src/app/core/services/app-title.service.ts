import { Inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { TranslocoService } from '@ngneat/transloco';

const titleTranslations: { [key: string]: string } = {
    "tự động cào bài": "Auto Crawl",
    "tập của bạn": "Your Collections",
    "bộ công cụ": "Toolkits",
    "tra cứu từ": "Dictionary",
    "tất cả node của bạn": "All Nodes",
    "hỏi chatgpt": "Ask ChatGPT",
    "mua 1 ly cafe": "Buy Me a Coffee",
    "tải toàn bộ kênh youtube": "Download YouTube Channel",
    "link nhận tiền": "Donate Link",
    "Quản lý Profile & Nhân cách": "Profile & Personality Management",
    "quản lý tên miền": "Domain Management",
    "báo cáo seo": "SEO Report",
    "nhuận bút": "Royalties",
    "hướng dẫn sử dụng": "User Guide",
    "cấu hình tài khoản": "Account Settings",
    "admin": "Admin",
    "node từ wordpress": "WordPress Nodes",
    "link tốt": "Good Links",
    "thống kê": "Analytics",
    "wordpress importer": "WordPress Importer",
    "đang đọc": "Reading",
    "nhân đôi sản phẩm": "Clone Product",
    "lên kịch bản": "Scripting",
    "tạo phong cách viết": "Create Writing Style",
    "key hoạt động của app": "App License Keys",
    "Danh sách kịch bản video": "Video Script List",
    "tạo hình": "Generate Image",
    "chương trình làm video": "Video Maker Program",
    "kích hoạt phần mềm": "Activate Software",
    "lưu trữ": "Archives",
    "text2speech": "Text2Speech",
    "cập nhật lưu trữ": "Update Archive",
    "văn bản": "Document",
    "ai.type - công cụ tạo content": "AI Type - Content Creator",
    "ai.type": "AI Type"
};

@Injectable({
    providedIn: 'root'
})
export class AppTitleService extends Title {
    private currentTitle: string = '';

    constructor(
        @Inject(DOCUMENT) doc: any,
        private translocoService: TranslocoService
    ) {
        super(doc);
        this.translocoService.langChanges$.subscribe(() => {
            if (this.currentTitle) {
                this.updateTitle();
            }
        });
    }

    override setTitle(newTitle: string) {
        this.currentTitle = newTitle;
        this.updateTitle();
    }

    private updateTitle() {
        if (!this.currentTitle) return;

        const lang = this.translocoService.getActiveLang();
        
        if (lang === 'vi') {
            super.setTitle(this.currentTitle);
            return;
        }

        const parts = this.currentTitle.split(' | ');
        const translatedParts = parts.map(part => this.translatePart(part));
        
        super.setTitle(translatedParts.join(' | '));
    }

    private translatePart(part: string): string {
        let match = part.match(/^đang tạo "(.*)"$/);
        if (match) {
            return `Creating "${match[1]}"`;
        }

        if (titleTranslations[part]) {
            return titleTranslations[part];
        }

        return part;
    }
}
