import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { BlogService } from 'app/_services/blog';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { Subject, takeUntil } from 'rxjs';
import { GenaiService } from 'app/genai.service';

interface ScreenplayLine {
    type: string;
    text: string;
}

@Component({
    selector: 'ai-script-view',
    template: `
    <div class="absolute inset-0 flex flex-col bg-[#f0f2f5] min-w-0 overflow-hidden">
        <!-- Header -->
        <div class="absolute top-0 inset-x-0 z-10 flex flex-col sm:flex-row flex-0 sm:items-center sm:justify-between p-4 pb-4 sm:pt-4 sm:pb-4 sm:px-10 bg-transparent dark:bg-transparent pointer-events-none">
            <div class="flex-1 min-w-0 pointer-events-auto">
                <!-- Breadcrumbs -->
                <div class="hidden sm:flex flex-wrap items-center font-medium">
                    <div class="flex items-center whitespace-nowrap">
                        <a class="text-base text-primary-500" [routerLink]="['/dashboard']">ai.type</a>
                    </div>
                    <div class="flex items-center ml-1 whitespace-nowrap">
                        <mat-icon class="icon-size-4 text-secondary" style="margin-top: 2px;" [svgIcon]="'heroicons_solid:chevron-right'"></mat-icon>
                        <a class="ml-1 text-base text-primary-500 cursor-pointer" (click)="goBack()">công việc đang làm của bạn</a>
                    </div>
                    <div class="flex items-center ml-1 whitespace-nowrap relative">
                        <mat-icon class="icon-size-4 text-secondary" style="margin-top: 2px;" [svgIcon]="'heroicons_solid:chevron-right'"></mat-icon>
                        <span class="ml-1 text-base text-secondary">xem kịch bản</span>
                    </div>
                </div>
                <div class="flex sm:hidden">
                    <a class="inline-flex items-center -ml-1.5 text-secondary font-medium cursor-pointer" (click)="goBack()">
                        <mat-icon class="icon-size-4 text-secondary" [svgIcon]="'heroicons_solid:chevron-left'"></mat-icon>
                        <span class="ml-1 text-base">quay lại</span>
                    </a>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex shrink-0 items-center mt-6 sm:mt-0 sm:ml-4 pointer-events-auto">
                <button mat-flat-button color="primary" class="flex items-center justify-center gap-2 select-none" (click)="regenerateScript()" [disabled]="isRegenerating || isLoading">
                    <mat-icon class="icon-size-4" [class.animate-spin]="isRegenerating" svgIcon="heroicons_outline:refresh"></mat-icon>
                    <span>{{ isRegenerating ? 'Đang tạo lại kịch bản...' : 'Tạo lại kịch bản' }}</span>
                </button>
            </div>
        </div>

        <!-- Main Content -->
        <div class="flex-auto pt-4 sm:pt-6 pb-6 px-6 sm:pb-10 sm:px-10 bg-[#f0f2f5] overflow-auto flex flex-col gap-8">
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
                    <div *ngIf="pageIndex === 0" class="text-center font-bold text-2xl uppercase mb-10 tracking-wider text-gray-900" style="font-family: 'Courier Prime', 'Courier New', Courier, monospace;">
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
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap');

        .screenplay-outer {
            font-family: 'Courier Prime', 'Courier New', Courier, monospace;
            background-color: #ffffff;
            width: 21cm;
            min-height: 29.7cm;
            padding: 2.5cm 3cm 2.5cm 3.5cm;
            margin: 0 auto;
            box-sizing: border-box;
            box-shadow: 5px 5px 0px rgba(0, 0, 0, 0.08);
            border: none;
        }
        .screenplay-content {
            font-family: 'Courier Prime', 'Courier New', Courier, monospace;
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
        private _genaiService: GenaiService,
        private _multiAccountService: MultiAccountService
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
                    this._multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
                } else if (res && res.script) {
                    // Cấu trúc fallback trực tiếp
                    this.scriptDoc = res;
                    this.scriptText = res.script;
                    this._multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
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
        
        const prompt = `Bạn là một nhà biên kịch phim Hollywood xuất chúng. Nhiệm vụ của bạn là chuyển thể dàn ý dưới đây thành một kịch bản phim (screenplay) chuẩn mực, tuân thủ khắt khe các nguyên tắc định dạng và cấu trúc chuyên nghiệp của ngành công nghiệp điện ảnh.

Dàn ý:
${outlineText}

Dưới đây là các nguyên tắc cốt lõi bạn BẮT BUỘC phải tuân thủ khi viết:

1. SCENE HEADING (Tiêu đề cảnh):
- Bắt đầu bằng INT. (Nội cảnh) hoặc EXT. (Ngoại cảnh) + ĐỊA ĐIỂM + THỜI GIAN (DAY, NIGHT...). VD: "INT. TÒA NHÀ CHỌC TRỜI - TẦNG 45 - NIGHT".
- Sử dụng Subheading (Tiêu đề phụ) để chuyển vị trí nhỏ trong cùng một không gian (VD: "BÊN NGOÀI CỬA SỔ", "HÀNH LANG") giúp mạch phim liên tục.

2. ACTION LINES (Dòng hành động - Rất quan trọng):
- QUY TẮC VÀNG: Chỉ miêu tả những gì khán giả có thể NHÌN THẤY và NGHE THẤY. Tuyệt đối không miêu tả suy nghĩ nội tâm. Hãy dùng hành động để thể hiện cảm xúc.
- Viết ở ngôi thứ ba, thì hiện tại. Lược bỏ các đại từ, liên từ thừa thãi. Viết câu ngắn để tạo nhịp điệu dồn dập, câu dài để tạo sự tĩnh lặng.
- IN HOA (ALL CAPS) các âm thanh lớn (VD: BÙM, RĂNG RẮC) và các sự vật, hiện tượng quan trọng tác động mạnh đến cốt truyện (VD: QUẢ CẦU LỬA, SÓNG THẦN).

3. CHARACTER INTRODUCTIONS (Giới thiệu nhân vật):
- Lần đầu tiên nhân vật xuất hiện, phải IN HOA TÊN, kèm theo độ tuổi và một câu ngắn gọn lột tả diện mạo hoặc nét tính cách đặc trưng nhất. VD: "CHÀNG TRAI (20s, phờ phạc, đôi mắt dán chặt vào màn hình)".

4. DIALOGUE & PARENTHETICALS (Thoại & Ngoặc đơn):
- Tên nhân vật in hoa đặt ở giữa lề.
- Dùng phần mở rộng (O.S.) cho tiếng ngoài khung hình, và (V.O.) cho giọng tự sự/độc thoại nội tâm.
- Ngoặc đơn Parentheticals: Dùng CỰC KỲ HẠN CHẾ chỉ để hướng dẫn hành động siêu nhỏ hoặc sắc thái thoại (VD: "(thì thầm)", "(bàng hoàng)"). Không dùng để thay thế dòng hành động.

5. CAMERA SHOTS & TRANSITIONS (Góc máy & Chuyển cảnh):
- KHÔNG trực tiếp chỉ đạo máy quay (Không dùng "Máy quay lia tới..."). Hãy miêu tả hành động để "gợi ý" góc máy một cách tinh tế.
- Chuyển cảnh: Dùng CUT TO: hoặc FADE TO BLACK. một cách tiết chế, thường đặt ở cuối các đoạn cao trào.

6. CẤU TRÚC KỂ CHUYỆN (Structure):
- Cảm nhận nhịp điệu của nguyên tác. Xây dựng đúng cấu trúc: Bối cảnh (Exposition) -> Biến cố (Rising Action) -> Đỉnh điểm (Climax) -> Hệ quả (Falling action). 
- Biến mọi tính từ miêu tả trong văn xuôi thành các "Beat" hành động cụ thể.

HƯỚNG DẪN ĐẦU RA:
- Hãy định dạng văn bản giống một trang kịch bản thực thụ nhất có thể (Sử dụng Markdown để in đậm, viết hoa và giãn dòng hợp lý).
- Bạn phải viết kịch bản đầy đủ diễn biến, phân tích tâm lý, hành động cụ thể và các câu thoại đầy đủ của các nhân vật.
- Tránh việc cắt cụt kịch bản giữa chừng. Bắt đầu viết kịch bản ngay lập tức mà không kèm theo bất kỳ lời dẫn hay giải thích nào khác.`;

        try {
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
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
                        this._multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
                        this.toastr.success('Dựng kịch bản phim thành công và đã lưu vào database!');
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
