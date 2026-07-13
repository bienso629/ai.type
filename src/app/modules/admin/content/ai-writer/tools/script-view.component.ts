import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { BlogService } from 'app/modules/_services/blog';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { GenaiService } from 'app/genai.service';

interface ScreenplayLine {
    type: string;
    text: string;
}

@Component({
    selector: 'ai-script-view',
    template: `
    <div class="absolute inset-0 flex flex-col bg-white min-w-0 overflow-hidden">
        <!-- Header -->
        <div class="flex flex-row items-center justify-between p-6 border-b bg-card">
            <!-- Back Link -->
            <a class="inline-flex items-center text-secondary font-medium hover:text-primary transition-colors cursor-pointer text-sm" (click)="goBack()">
                <mat-icon class="icon-size-4 mr-1" [svgIcon]="'heroicons_solid:chevron-left'"></mat-icon>
                Quay lại soạn thảo
            </a>

            <!-- Re-generate Button -->
            <button mat-flat-button color="primary" class="ml-auto flex items-center justify-center gap-2 select-none" (click)="regenerateScript()" [disabled]="isRegenerating || isLoading">
                <mat-icon class="icon-size-4" [class.animate-spin]="isRegenerating" svgIcon="heroicons_outline:refresh"></mat-icon>
                <span>{{ isRegenerating ? 'Đang tạo lại kịch bản...' : 'Tạo lại kịch bản' }}</span>
            </button>
        </div>

        <!-- Main Content -->
        <div class="flex-auto p-6 sm:p-10 bg-gray-100 overflow-auto flex flex-col gap-8">
            <!-- Loading State -->
            <div class="flex flex-col items-center justify-center py-20 animate-pulse" *ngIf="isLoading">
                <mat-progress-spinner mode="indeterminate" diameter="48" color="primary"></mat-progress-spinner>
                <span class="text-gray-500 font-medium mt-4">Đang truy xuất kịch bản từ database...</span>
            </div>

            <!-- Empty State -->
            <div class="flex flex-col items-center justify-center py-20 text-center" *ngIf="!isLoading && !scriptText">
                <mat-icon class="text-gray-400 icon-size-16 mb-4" svgIcon="heroicons_outline:document-search"></mat-icon>
                <h3 class="text-xl font-bold text-gray-700">Chưa có kịch bản cho tập phim này</h3>
                <p class="text-gray-500 max-w-md mt-2">Vui lòng quay lại màn hình Dàn ý và nhấn "Tạo kịch bản" trong menu công cụ để AI sinh kịch bản trước.</p>
                <button mat-flat-button color="primary" class="mt-6" (click)="goBack()">Quay lại</button>
            </div>

            <!-- Screenplay Pages -->
            <ng-container *ngIf="!isLoading && scriptText">
                <div *ngFor="let page of pages; let pageIndex = index" class="screenplay-outer relative">
                    <!-- Page Number (standard film screenplay style: top-right of page) -->
                    <div class="absolute top-8 right-12 text-sm text-gray-400 font-mono select-none">
                        {{ pageIndex + 1 }}.
                    </div>
                    
                    <!-- First page title -->
                    <div *ngIf="pageIndex === 0" class="text-center font-bold text-2xl uppercase mb-10 tracking-wider text-gray-900" style="font-family: 'Courier New', Courier, monospace;">
                        {{ scriptDoc?.title || draftTitleFallback || 'Kịch bản chưa đặt tên' }}
                    </div>

                    <div class="screenplay-content">
                        <ng-container *ngFor="let item of page">
                            <div *ngIf="item.type === 'slugline'" class="screenplay-slugline">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'action'" class="screenplay-action">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'character'" class="screenplay-character">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'parenthetical'" class="screenplay-parenthetical">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'dialogue'" class="screenplay-dialogue">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'empty'" class="screenplay-empty"></div>
                        </ng-container>
                    </div>
                </div>
            </ng-container>
        </div>
    </div>
    `,
    styles: [`
        .screenplay-outer {
            font-family: 'Courier New', Courier, monospace;
            background-color: #ffffff;
            width: 21cm;
            min-height: 29.7cm;
            padding: 2.5cm 3cm 2.5cm 3.5cm;
            margin: 0 auto;
            box-sizing: border-box;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid #e5e7eb;
        }
        .screenplay-content {
            font-family: 'Courier New', Courier, monospace;
            color: #111;
            font-size: 15px;
            line-height: 1.5;
        }
        .screenplay-slugline {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            text-align: left !important;
        }
        .screenplay-action {
            text-align: left !important;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .screenplay-character {
            font-weight: bold;
            text-transform: uppercase;
            text-align: left !important;
            margin-left: 35%;
            margin-top: 1rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-parenthetical {
            text-align: left !important;
            margin-left: 28%;
            margin-right: 25%;
            margin-top: 0.1rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-dialogue {
            text-align: left !important;
            margin-left: 20%;
            margin-right: 20%;
            margin-top: 0.1rem;
            margin-bottom: 0.8rem;
        }
        .screenplay-empty {
            height: 1rem;
        }
    `],
    providers: [BlogService]
})
export class AIScriptComponent implements OnInit, OnDestroy {
    uuid: string = '';
    name: string = '';
    scriptDoc: any = null;
    scriptText: string = '';
    pages: ScreenplayLine[][] = [];
    draftTitleFallback: string = '';
    isLoading: boolean = true;
    isRegenerating: boolean = false;
    parsedLines: ScreenplayLine[] = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private _blogService: BlogService,
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService
    ) { }

    ngOnInit(): void {
        this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe((params: Params) => {
            this.uuid = params['uuid'];
            this.name = params['name'];
            if (this.uuid) {
                this.loadScript();
            } else {
                this.isLoading = false;
            }
        });
    }

    loadScript() {
        this.isLoading = true;
        this.cd.markForCheck();
        
        let username = this._blogService.user?.name || 'admin';

        // Load fallback draft title
        this._blogService.getDraft(this.uuid).subscribe({
            next: (draftRes: any) => {
                if (draftRes && draftRes.success && draftRes.data) {
                    this.draftTitleFallback = draftRes.data.title;
                    this.cd.markForCheck();
                }
            }
        });

        this._blogService.getScript({
            username: username,
            uuid: this.uuid
        }).subscribe({
            next: (res: any) => {
                if (res && res.success && res.data) {
                    this.scriptDoc = res.data;
                    this.scriptText = res.data.script || '';
                } else if (res && res.script) {
                    // Cấu trúc fallback trực tiếp
                    this.scriptDoc = res;
                    this.scriptText = res.script;
                }
                this.parseScriptText();
                this.isLoading = false;
                this.cd.markForCheck();
            },
            error: (err) => {
                console.error('Error loading script:', err);
                this.isLoading = false;
                this.cd.markForCheck();
            }
        });
    }

    parseScriptText() {
        if (!this.scriptText) {
            this.parsedLines = [];
            return;
        }

        // Normalize HTML tags to newlines and plain text
        let processedText = this.scriptText || '';
        
        // 1. Replace br tags with newlines
        processedText = processedText.replace(/<br\s*\/?>/gi, '\n');
        
        // 2. Replace closing block tags with newlines
        processedText = processedText.replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, '\n');
        
        // 3. Strip all other remaining HTML tags
        processedText = processedText.replace(/<\/?[^>]+(>|$)/g, '');
        
        // 4. Decode HTML entities (e.g. &nbsp; &amp; &lt; &gt; &quot;)
        const doc = new DOMParser().parseFromString(processedText, 'text/html');
        processedText = doc.documentElement.textContent || processedText;

        // 5. Replace all non-breaking spaces and special unicode spaces with normal space
        processedText = processedText.replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');

        // 6. Normalize multiple consecutive spaces and tabs to a single space (while keeping newlines)
        processedText = processedText.replace(/[ \t]+/g, ' ');

        const rawLines = processedText.split('\n');
        this.parsedLines = [];
        let lastType = '';
        
        for (let line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
                this.parsedLines.push({ type: 'empty', text: '' });
                lastType = ''; // Reset state on blank lines to separate paragraphs correctly
                continue;
            }

            // Remove markdown bold tags and normalize multiple spaces to a single space
            let clean = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/\s+/g, ' ').trim();

            // Identify Sluglines
            const isSlugline = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|CẢNH\s+\d+|PHÂN\s+CẢNH\s+\d+)/i.test(clean) ||
                               /^(INT\s|EXT\s)/i.test(clean) ||
                               (clean.toUpperCase() === clean && (clean.includes(' - ') || clean.includes(' – ')));

            if (isSlugline) {
                this.parsedLines.push({ type: 'slugline', text: clean.toUpperCase() });
                lastType = 'slugline';
                continue;
            }

            // Identify Parentheticals
            const isParenthetical = clean.startsWith('(') && clean.endsWith(')');
            if (isParenthetical) {
                this.parsedLines.push({ type: 'parenthetical', text: clean });
                lastType = 'parenthetical';
                continue;
            }

            // Identify Character Names
            const isCharacter = clean.toUpperCase() === clean && 
                                !/[.?!:,]$/.test(clean) && 
                                clean.split(/\s+/).length <= 4;

            if (isCharacter && lastType !== 'character') {
                this.parsedLines.push({ type: 'character', text: clean });
                lastType = 'character';
                continue;
            }

            // Identify Dialogue continuation
            if (lastType === 'dialogue' && !isCharacter) {
                const lastItem = this.parsedLines[this.parsedLines.length - 1];
                if (lastItem && lastItem.type === 'dialogue') {
                    lastItem.text += ' ' + clean;
                } else {
                    this.parsedLines.push({ type: 'dialogue', text: clean });
                }
                lastType = 'dialogue';
                continue;
            }

            // Identify Dialogue
            if (lastType === 'character' || lastType === 'parenthetical') {
                this.parsedLines.push({ type: 'dialogue', text: clean });
                lastType = 'dialogue';
                continue;
            }

            // Default: Action
            const lastItem = this.parsedLines[this.parsedLines.length - 1];
            if (lastItem && lastItem.type === 'action') {
                lastItem.text += ' ' + clean;
            } else {
                this.parsedLines.push({ type: 'action', text: clean });
            }
            lastType = 'action';
        }

        // Paginate the parsed lines into A4 pages
        this.pages = [];
        let currentPage: ScreenplayLine[] = [];
        let currentHeight = 0;
        const maxHeight = 85; // Max height units per A4 page

        for (let item of this.parsedLines) {
            let itemHeight = 0;
            switch (item.type) {
                case 'slugline':
                    itemHeight = 8;
                    break;
                case 'action':
                    // Estimate wrapped lines based on ~55 chars per line
                    const actionLines = Math.max(1, Math.ceil(item.text.length / 55));
                    itemHeight = 3 + (actionLines * 3.5);
                    break;
                case 'character':
                    itemHeight = 4;
                    break;
                case 'parenthetical':
                    itemHeight = 3;
                    break;
                case 'dialogue':
                    // Dialogue wraps earlier because of 20% left/right margins (~35 chars per line)
                    const dialogueLines = Math.max(1, Math.ceil(item.text.length / 35));
                    itemHeight = 2 + (dialogueLines * 3.5);
                    break;
                case 'empty':
                    itemHeight = 2;
                    break;
                default:
                    itemHeight = 3;
            }

            if (currentHeight + itemHeight > maxHeight && currentPage.length > 0) {
                this.pages.push(currentPage);
                currentPage = [];
                currentHeight = 0;
                
                // If it starts with an empty line on the new page, skip it
                if (item.type === 'empty') {
                    continue;
                }
            }

            currentPage.push(item);
            currentHeight += itemHeight;
        }

        if (currentPage.length > 0) {
            this.pages.push(currentPage);
        }
    }

    copyToClipboard() {
        if (this.scriptText) {
            this.clipboard.copy(this.scriptText);
            this.toastr.success('Đã copy kịch bản vào clipboard!');
        }
    }

    goBack() {
        this.router.navigate(['/ai-writer', this.name, this.uuid]);
    }

    async regenerateScript() {
        const outlineText = this.scriptDoc?.outline || '';
        if (!outlineText) {
            this.toastr.warning('Không tìm thấy dàn ý của kịch bản này để tạo lại.', 'Cảnh báo');
            return;
        }

        this.isRegenerating = true;
        this.isLoading = true;
        this.cd.markForCheck();

        this.toastr.info('Đang gửi dàn ý lên AI để dựng lại kịch bản phim...', 'Đang xử lý');
        
        const prompt = `Bạn là một nhà biên kịch phim điện ảnh và truyền hình chuyên nghiệp.
Hãy chuyển đổi dàn ý dưới đây thành một kịch bản phân cảnh phim hoàn chỉnh, cực kỳ chi tiết và đầy đủ.

Dàn ý:
${outlineText}

Yêu cầu định dạng kịch bản chuẩn:
1. **Slugline (Dòng cảnh):** Viết chữ in hoa, in đậm, bắt đầu bằng nơi chốn và thời gian (ví dụ: EXT. PRIVET DRIVE - NIGHT hoặc INT. OFFICE - DAY).
2. **Action (Hành động):** Đoạn miêu tả chi tiết bối cảnh, âm thanh, hành động nhân vật, viết căn lề trái bình thường. Khi một nhân vật mới xuất hiện lần đầu tiên, tên của họ phải được viết IN HOA.
3. **Character Name (Tên nhân vật):** Viết IN HOA ở dòng riêng, căn giữa (hoặc thụt lề nhiều vào giữa).
4. **Dialogue (Lời thoại):** Đặt ngay bên dưới tên nhân vật, viết căn giữa (hoặc thụt lề vào giữa hai bên).
5. **Parenthetical (Chú thích tâm trạng/hành động ngắn):** Đặt trong dấu ngoặc đơn ngay dưới tên nhân vật và trước lời thoại (ví dụ: (smile fading)).

LƯU Ý QUAN TRỌNG VỀ ĐỘ DÀI VÀ CHI TIẾT:
- Bạn phải viết kịch bản đầy đủ diễn biến, phân tích tâm lý, hành động cụ thể và các câu thoại đầy đủ của các nhân vật.
- KHÔNG ĐƯỢC tóm tắt hoặc viết tắt các phân cảnh. Hãy khai triển tất cả các ý trong dàn ý thành các cảnh phim hoàn chỉnh, sinh động, kéo dài diễn biến để kịch bản có độ dài tương xứng.
- Tránh việc cắt cụt kịch bản giữa chừng. Kịch bản phải có mở đầu, diễn tiến và kết thúc rõ ràng cho phân đoạn này.
- Hãy viết bằng tiếng Việt, cuốn hút, giàu hình ảnh và kịch tính. Bắt đầu viết kịch bản ngay lập tức mà không kèm theo bất kỳ lời dẫn hay giải thích nào khác.`;

        try {
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const scriptText = response.text;
            if (scriptText) {
                const title = this.scriptDoc?.title || this.draftTitleFallback || 'Kịch bản chưa đặt tên';
                const username = this._blogService.user?.name || 'admin';
                
                this._blogService.storeScript({
                    username: username,
                    uuid: this.uuid,
                    title: title,
                    outline: outlineText,
                    script: scriptText
                }).subscribe({
                    next: (res) => {
                        this.toastr.success('Tạo lại kịch bản phim thành công!');
                        this.scriptText = scriptText;
                        if (this.scriptDoc) {
                            this.scriptDoc.script = scriptText;
                        }
                        this.parseScriptText();
                        this.isRegenerating = false;
                        this.isLoading = false;
                        this.cd.markForCheck();
                    },
                    error: (err) => {
                        console.error('Lỗi khi lưu kịch bản vào database:', err);
                        this.toastr.error('Tạo lại kịch bản thành công nhưng không thể lưu vào database.', 'Lỗi lưu trữ');
                        this.isRegenerating = false;
                        this.isLoading = false;
                        this.cd.markForCheck();
                    }
                });
            } else {
                this.toastr.error('AI không phản hồi nội dung kịch bản.', 'Lỗi AI');
                this.isRegenerating = false;
                this.isLoading = false;
                this.cd.markForCheck();
            }
        } catch (error) {
            console.error('Lỗi tạo lại kịch bản:', error);
            this.toastr.error('Không thể kết nối đến máy chủ AI để tạo lại kịch bản.', 'Lỗi kết nối');
            this.isRegenerating = false;
            this.isLoading = false;
            this.cd.markForCheck();
        }
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
