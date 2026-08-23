import { Inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { filter } from 'rxjs';

const APP_NAME = 'AI.Type';

const routeTitleMapVi: { [key: string]: string } = {
    'dashboard': 'Thống kê & Tổng quan',
    'ai-writer': 'Soạn thảo bài viết',
    'voice2video': 'Làm Video AI',
    'ai-text2speech': 'Tạo giọng đọc AI',
    'ai-image': 'Tạo hình ảnh AI',
    'nodes': 'Tất cả Node',
    'wp2md': 'WordPress Nodes',
    'tools': 'Bộ công cụ AI',
    'dollar': 'Quản lý nhuận bút',
    'archives': 'Lưu trữ bài viết',
    'collection': 'Tuyển tập',
    'synonym': 'Tra cứu từ điển',
    'payment': 'Nâng cấp & Thanh toán',
    'settings': 'Cài đặt & Cấu hình',
    'profile': 'Hồ sơ cá nhân',
    'import': 'WordPress Importer',
    'all-tube': 'Tải toàn bộ kênh YouTube',
    'chatbot': 'Hỏi đáp AI Chatbot',
    'profiles': 'Quản lý Profile & Trình duyệt',
    'woocommerce': 'Nhân đôi sản phẩm',
    'customers': 'Quản lý khách hàng (X-CMS)',
    'zalo': 'Zalo Marketing',
    'ai-crawl': 'Tự động cào bài viết',
    'face2node': 'Trend & Face2Node',
    'data': 'BigData & Lưu trữ',
    'links': 'Bộ sưu tập Link SEO',
    'gscr': 'Báo cáo SEO & Search Console',
    'amxh': 'Tự động hóa mạng xã hội (AMXH)',
    'schedule': 'Lên lịch kịch bản',
    'sign-in': 'Đăng nhập',
    'sign-up': 'Đăng ký',
    'sign-out': 'Đăng xuất',
    'forgot-password': 'Quên mật khẩu',
    'help': 'Hướng dẫn sử dụng'
};

const routeTitleMapEn: { [key: string]: string } = {
    'dashboard': 'Analytics & Overview',
    'ai-writer': 'Article Writer',
    'voice2video': 'AI Video Maker',
    'ai-text2speech': 'Text to Speech (AI Voice)',
    'ai-image': 'AI Image Generator',
    'nodes': 'All Nodes',
    'wp2md': 'WordPress Nodes',
    'tools': 'AI Toolkits',
    'dollar': 'Royalties Management',
    'archives': 'Articles Archive',
    'collection': 'Collections',
    'synonym': 'Dictionary Lookup',
    'payment': 'Upgrade & Billing',
    'settings': 'Settings & Preferences',
    'profile': 'User Profile',
    'import': 'WordPress Importer',
    'all-tube': 'Download YouTube Channel',
    'chatbot': 'AI Chatbot',
    'profiles': 'Browser Profiles Management',
    'woocommerce': 'Product Cloner',
    'customers': 'Customer Management (X-CMS)',
    'zalo': 'Zalo Marketing',
    'ai-crawl': 'Auto Web Crawl',
    'face2node': 'Trend & Face2Node',
    'data': 'BigData & Archives',
    'links': 'SEO Good Links',
    'gscr': 'SEO Report & Search Console',
    'amxh': 'Social Media Automation (AMXH)',
    'schedule': 'Script Scheduler',
    'sign-in': 'Sign In',
    'sign-up': 'Sign Up',
    'sign-out': 'Sign Out',
    'forgot-password': 'Forgot Password',
    'help': 'User Manual'
};

const titleDictionaryVi: { [key: string]: string } = {
    'thống kê': 'Thống kê & Tổng quan',
    'nhuận bút': 'Quản lý nhuận bút',
    'cấu hình tài khoản': 'Cấu hình tài khoản',
    'kích hoạt phần mềm': 'Kích hoạt bản quyền',
    'admin': 'Quản trị hệ thống',
    'key hoạt động của app': 'Quản lý License Keys',
    'quản lý tên miền': 'Quản lý tên miền',
    'link nhận tiền': 'Link nhận tiền & Donate',
    'plugins': 'Quản lý Plugins AI',
    'tạo phong cách viết': 'Phong cách viết AI',
    'bộ công cụ': 'Bộ công cụ AI',
    'tự động cào bài': 'Tự động cào bài viết',
    'tạo hình': 'Tạo hình ảnh AI',
    'tất cả node của bạn': 'Tất cả Node',
    'text2speech': 'Tạo giọng đọc AI',
    'chương trình làm video': 'Làm Video AI',
    'tải toàn bộ kênh youtube': 'Tải toàn bộ kênh YouTube',
    'lưu trữ': 'Lưu trữ bài viết',
    'node từ wordpress': 'WordPress Nodes',
    'tập của bạn': 'Tuyển tập',
    'wordpress importer': 'WordPress Importer',
    'tra cứu từ': 'Tra cứu từ điển',
    'hỏi chatgpt': 'Hỏi đáp AI Chatbot',
    'nhân đôi sản phẩm': 'Nhân đôi sản phẩm',
    'Quản lý Profile & Nhân cách': 'Quản lý Profile & Nhân cách',
    'lên kịch bản': 'Lên kịch bản tự động',
    'link tốt': 'Bộ sưu tập Link SEO',
    'báo cáo seo': 'Báo cáo SEO & Analytics',
    'mua 1 ly cafe': 'Mua 1 ly cafe (Donate)',
    'hướng dẫn sử dụng': 'Hướng dẫn sử dụng',
    'cập nhật lưu trữ': 'Chỉnh sửa bài viết',
    'văn bản': 'Soạn thảo bài viết',
    'đang đọc': 'Đang đọc bài viết',
    'Danh sách kịch bản video': 'Danh sách kịch bản Video',
    'Livestream AI': 'Livestream AI'
};

const titleDictionaryEn: { [key: string]: string } = {
    'thống kê': 'Analytics & Overview',
    'nhuận bút': 'Royalties Management',
    'cấu hình tài khoản': 'Account Settings',
    'kích hoạt phần mềm': 'Software License Activation',
    'admin': 'System Admin',
    'key hoạt động của app': 'App License Keys',
    'quản lý tên miền': 'Domain Management',
    'link nhận tiền': 'Donate & Payment Link',
    'plugins': 'AI Plugins Management',
    'tạo phong cách viết': 'AI Writing Style',
    'bộ công cụ': 'AI Toolkits',
    'tự động cào bài': 'Auto Web Crawl',
    'tạo hình': 'AI Image Generator',
    'tất cả node của bạn': 'All Nodes',
    'text2speech': 'Text to Speech (AI Voice)',
    'chương trình làm video': 'AI Video Maker',
    'tải toàn bộ kênh youtube': 'Download YouTube Channel',
    'lưu trữ': 'Articles Archive',
    'node từ wordpress': 'WordPress Nodes',
    'tập của bạn': 'Collections',
    'wordpress importer': 'WordPress Importer',
    'tra cứu từ': 'Dictionary Lookup',
    'hỏi chatgpt': 'AI Chatbot',
    'nhân đôi sản phẩm': 'Product Cloner',
    'Quản lý Profile & Nhân cách': 'Profile & Persona Management',
    'lên kịch bản': 'AI Scripting',
    'link tốt': 'SEO Good Links',
    'báo cáo seo': 'SEO & Search Console Report',
    'mua 1 ly cafe': 'Buy Me a Coffee',
    'hướng dẫn sử dụng': 'User Manual',
    'cập nhật lưu trữ': 'Edit Article',
    'văn bản': 'Article Writer',
    'đang đọc': 'Reading Article',
    'Danh sách kịch bản video': 'Video Script List',
    'Livestream AI': 'AI Livestream'
};

@Injectable({
    providedIn: 'root'
})
export class AppTitleService extends Title {
    private currentRawTitle: string = '';

    constructor(
        @Inject(DOCUMENT) doc: any,
        private translocoService: TranslocoService
    ) {
        super(doc);

        this.translocoService.langChanges$.subscribe(() => {
            if (this.currentRawTitle) {
                this.updateTitle();
            }
        });

        if (this.translocoService.events$) {
            this.translocoService.events$.subscribe((event: any) => {
                if (event && event.type === 'translationLoadSuccess' && this.currentRawTitle) {
                    this.updateTitle();
                }
            });
        }
    }

    public handleRouteChange(rawUrl: string) {
        const url = (rawUrl || '').split('?')[0].split('#')[0];
        const segments = url.split('/').filter(s => s.length > 0);
        const primarySegment = segments[0] || '';
        const secondarySegment = segments[1] || '';

        const matchedKey = (secondarySegment && routeTitleMapVi[`${primarySegment}/${secondarySegment}`])
            ? `${primarySegment}/${secondarySegment}`
            : primarySegment;

        if (matchedKey && routeTitleMapVi[matchedKey]) {
            this.setTitle(matchedKey);
        }
    }

    override setTitle(newTitle: string) {
        if (!newTitle) return;
        this.currentRawTitle = newTitle;
        this.updateTitle();
    }

    private updateTitle() {
        if (!this.currentRawTitle) return;

        const lang = this.translocoService.getActiveLang() || 'vi';
        const formattedTitle = this.formatTitle(this.currentRawTitle, lang);

        super.setTitle(formattedTitle);
    }

    private formatTitle(raw: string, lang: string): string {
        // Làm sạch các đuôi cũ
        let cleaned = raw
            .replace(/\s*\|\s*ai\.type\s*-\s*công cụ tạo content/gi, '')
            .replace(/\s*\|\s*ai\.type/gi, '')
            .replace(/\s*\|\s*ai_type/gi, '')
            .replace(/\s*\|\s*Audio Manager/gi, '')
            .trim();

        // 1. Kiểm tra nếu là template đang tạo bài viết: đang tạo "..."
        const matchCreating = cleaned.match(/^đang tạo "(.*)"$/i);
        if (matchCreating) {
            const articleName = matchCreating[1];
            return lang === 'en'
                ? `Creating "${articleName}" | ${APP_NAME}`
                : `Đang tạo "${articleName}" | ${APP_NAME}`;
        }

        // 2. Kiểm tra nếu là route key trực tiếp
        if (routeTitleMapVi[cleaned]) {
            const screenName = lang === 'en' ? (routeTitleMapEn[cleaned] || routeTitleMapVi[cleaned]) : routeTitleMapVi[cleaned];
            return `${screenName} | ${APP_NAME}`;
        }

        // 3. Kiểm tra theo từ điển tiêu đề
        const lowerCleaned = cleaned.toLowerCase();
        if (titleDictionaryVi[lowerCleaned] || titleDictionaryVi[cleaned]) {
            const dictKey = titleDictionaryVi[cleaned] ? cleaned : lowerCleaned;
            const screenName = lang === 'en' ? titleDictionaryEn[dictKey] : titleDictionaryVi[dictKey];
            return `${screenName} | ${APP_NAME}`;
        }

        // 4. Nếu có dấu | phân tách
        if (cleaned.includes('|')) {
            const parts = cleaned.split('|').map(p => p.trim()).filter(p => p.length > 0);
            const mainPart = parts[0];
            const lowerMain = mainPart.toLowerCase();
            const translatedMain = (lang === 'en' ? titleDictionaryEn[lowerMain] : titleDictionaryVi[lowerMain]) || this.capitalizeFirst(mainPart);
            return `${translatedMain} | ${APP_NAME}`;
        }

        // 5. Mặc định: viết hoa chữ cái đầu và gắn suffix APP_NAME
        const finalMain = this.capitalizeFirst(cleaned);
        return `${finalMain} | ${APP_NAME}`;
    }

    private capitalizeFirst(str: string): string {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
