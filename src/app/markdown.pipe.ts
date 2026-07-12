import { Pipe, PipeTransform, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ===== (tuỳ chọn) highlight code =====
// import { markedHighlight } from 'marked-highlight';
// import Prism from 'prismjs';
// import 'prismjs/components/prism-typescript';
// import 'prismjs/components/prism-javascript';
// import 'prismjs/components/prism-json';
// marked.use(markedHighlight({
//   highlight(code, lang) {
//     try {
//       if (lang && (Prism as any).languages[lang]) {
//         return Prism.highlight(code, (Prism as any).languages[lang], lang);
//       }
//     } catch {}
//     return code;
//   }
// }));

marked.setOptions({ gfm: true, breaks: true });

@Pipe({
    name: 'markdown',
    standalone: true,
    pure: true
})
export class MarkdownPipe implements PipeTransform {
    private sanitizer = inject(DomSanitizer);
    private platformId = inject(PLATFORM_ID);

    transform(src: string | null | undefined): SafeHtml | string {
        if (!src) return '';

        // Chỉ parse trên front-end

        if (!isPlatformBrowser(this.platformId)) {
            // render sơ bộ để SSR không vỡ layout (có thể trả '' nếu muốn)
            return src;
        }

        const html = marked.parse(src) as string;
        let clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

        // Tự động chuyển đổi các đường dẫn tệp local tuyệt đối thành protocol media:// để Electron có thể hiển thị ảnh
        clean = clean.replace(/(src|href)=["']([^"']+)["']/g, (match, attr, path) => {
            if (path.startsWith('file:///')) {
                const cleanPath = path.substring('file:///'.length);
                return `${attr}="media:///${cleanPath}"`;
            }
            if (path.startsWith('/home/') || path.startsWith('/Users/') || path.startsWith('/tmp/') || /^[a-zA-Z]:[/\\]/.test(path)) {
                return `${attr}="media://${path}"`;
            }
            return match;
        });

        return this.sanitizer.bypassSecurityTrustHtml(clean);
    }
}
