import { Component, Inject, OnDestroy, OnInit, ChangeDetectorRef } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { HelperService } from "app/helper.service";
import { CrawlService } from "app/_services/crawl";
import { WordpressService } from "app/_services/wordpress";
import { GenaiService } from "app/genai.service";
import { RemoveHTMLPipe } from "app/app.pipe";
import { ToastrService } from "ngx-toastr";
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import Quill from 'quill';
import { MatDialog } from '@angular/material/dialog';
import { ArticlePasswordDialog } from './article-password-dialog';

declare var TurndownService: any;

const BlockEmbed = Quill.import('blots/block/embed') as any;

class AudioBlot extends BlockEmbed {
    static blotName = 'audio';
    static tagName = 'AUDIO';

    static create(value: any) {
        const node = super.create() as HTMLElement;
        const src = typeof value === 'object' ? (value.src || value.url) : value;
        node.setAttribute('controls', '');
        node.setAttribute('preload', 'none');
        node.setAttribute('src', src || '');
        node.setAttribute('style', 'width: 100%; height: 40px; margin: 10px 0; display: block;');
        return node;
    }

    static value(node: HTMLElement) {
        return node.getAttribute('src') || '';
    }
}

try {
    Quill.register('formats/audio', AudioBlot, true);
    Quill.register(AudioBlot, true);
} catch (e) {
    console.warn('[Quill] AudioBlot registration error:', e);
}

@Component({
    selector: 'edit-before-export-sheet',
    styles: [`
        :host {
            display: flex;
            flex-direction: column;
            max-height: 85vh; /* Keep within viewport */
        }
        .px-2.pb-4.pt-2 {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            overflow: hidden;
        }
        .mt-2.p-0 {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            overflow: hidden;
        }
        form {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            overflow: hidden;
        }
        .my-1.flex.flex-col.w-full {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            overflow: hidden;
        }
        ::ng-deep .edit-before-export-quill {
            display: flex;
            flex-direction: column;
            flex-grow: 1;
            overflow: hidden;
        }
        ::ng-deep .edit-before-export-quill .ql-container {
            flex-grow: 1;
            height: 35vh !important;
            overflow-y: auto !important;
        }
        ::ng-deep .edit-before-export-quill .ql-editor {
            padding: 16px !important;
        }
        ::ng-deep .edit-before-export-quill .ql-editor audio {
            width: 100% !important;
            height: 40px !important;
            margin: 12px 0 !important;
            display: block !important;
            border-radius: 8px !important;
        }
    `],
    template: `<div class="px-2 pb-4 pt-2">
        <div class="flex items-center justify-between mb-1 mt-1">
            <div *ngIf="data.function === 'share'" class="text-2xl font-bold text-gray-800 tracking-tight">{{this.data.title}}</div>
            <div *ngIf="data.function === 'edit'" class="text-2xl font-bold text-gray-800 tracking-tight">Chỉnh sửa</div>
            <div *ngIf="data.function === 'new'" class="text-2xl font-bold text-gray-800 tracking-tight">Thêm nội dung</div>
            <div *ngIf="data.function === 'update'" class="text-2xl font-bold text-gray-800 tracking-tight">Cập nhật lên WordPress</div>
            <button mat-icon-button (click)="close()" type="button">
                <mat-icon [svgIcon]="'heroicons_outline:x'"></mat-icon>
            </button>
        </div>

        <div class="mt-2 p-0">
            <form [formGroup]="editorForm">
                <div class="flex flex-col p-0 bg-white rounded-md">
                    <div class="my-1 flex flex-row" *ngIf="data.function === 'share' || data.function === 'update'">
                        <ng-select class="custom-select-ai-writer flex-1"
                            placeholder="Chọn danh mục" [items]="categoryitems" multiple="true" bindLabel="name" bindValue="id" [clearable]="true" [formControlName]="'categories'" [dropdownPosition]="'bottom'" [addTag]="addCategory" (clear)="onClearCategory()" (add)="onAddCategory($event)" (remove)="onRemoveCategory($event)" (change)="onChangeCategory($event)" [loading]="loading" appendTo="body">
                            <ng-template ng-tag-tmp let-search="searchTerm">
                                <mat-label class="text-base">Click để tạo danh mục mới:
                                    {{search}}</mat-label>
                            </ng-template>
                        </ng-select>

                        <ng-select class="custom-select-ai-writer ml-2 flex-1"
                            placeholder="Chọn thẻ" [items]="tagitems" multiple="true" bindLabel="name" bindValue="id" [clearable]="true" [formControlName]="'tags'" [dropdownPosition]="'bottom'" [addTag]="addTag" (clear)="onClearTag()" (add)="onAddTag($event)" (remove)="onRemoveTag($event)" (change)="onChangeTag($event)" [loading]="loading" appendTo="body">
                            <ng-template ng-tag-tmp let-search="searchTerm">
                                <mat-label class="text-base">Click để tạo thẻ mới:
                                    {{search}}</mat-label>
                            </ng-template>
                        </ng-select>
                    </div>

                    <!-- <div class="my-1"><mat-label><b>Mô tả:</b> {{this.data.description || "Chưa có mô tả"}}</mat-label></div>
                    <div class="my-1"><mat-label><b>Khoá chính:</b> {{this.data.mainkey || "Chưa có khoá chính"}}</mat-label></div> -->

                    <div class="my-1 flex flex-col w-full">
                        <quill-editor class="w-full mt-2 edit-before-export-quill" theme="snow" format="html" placeholder="Nhập nội dung" [formControlName]="'content'" (onEditorCreated)="getEditorInstance($event)" [modules]="quillModules"><div quill-editor-toolbar class="flex flex-wrap items-center"> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <select class="ql-header hover:bg-slate-100"> <option value="1">Heading</option> <option value="2">Subheading</option> <option selected>Normal</option> </select> </span> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <button class="ql-bold !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> <button class="ql-italic !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> <button class="ql-underline !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> </span> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <button class="ql-list !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" value="ordered"></button> <button class="ql-list !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" value="bullet"></button> <select class="ql-align !border !border-solid !border-slate-300 rounded hover:bg-slate-100"> <option label="left" selected></option> <option label="center" value="center"></option> <option label="right" value="right"></option> <option label="justify" value="justify"></option> </select> </span> <span class="ql-formats inline-flex gap-1 mb-1">
                            <button class="ql-blockquote !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Quote"><mat-icon class="icon-size-4" [svgIcon]="'feather:message-square'"></mat-icon></button>
                            <button class="ql-code-block !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Code"><mat-icon class="icon-size-4" [svgIcon]="'feather:code'"></mat-icon></button> 
                            <button class="ql-link !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Link"><mat-icon class="icon-size-4" [svgIcon]="'feather:link'"></mat-icon></button> 
                            <button class="ql-image !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Hình ảnh"><mat-icon class="icon-size-4" [svgIcon]="'feather:image'"></mat-icon></button> 
                            <button class="ql-video !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Video"><mat-icon class="icon-size-4" [svgIcon]="'feather:video'"></mat-icon></button>
                            <button class="ql-table !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Chèn bảng"><mat-icon class="icon-size-4" [svgIcon]="'feather:grid'"></mat-icon></button>
                        </span> </div></quill-editor>
                    </div>
                </div>
            </form>
        </div>

        <div class="p-0 mt-4 flex justify-end gap-2">
            <div class="flex gap-2">
                <button mat-flat-button class="!bg-emerald-600 !text-white disabled:!bg-emerald-600 disabled:!text-white disabled:!opacity-100" (click)="aihelp($event)" [disabled]="aiHelpLoading">
                    <mat-icon class="icon-size-4 !text-white" [svgIcon]="'feather:droplet'"></mat-icon>
                    <mat-label class="ml-2 !text-white">{{aiHelpLoading ? 'Đang xử lý...' : 'AI sửa'}}</mat-label>
                </button>
                
                <button mat-flat-button *ngIf="data.function === 'share'" [color]="'primary'" (click)="share($event)" [disabled]="categoryitems.length == 0">
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:send'"></mat-icon>
                    <mat-label class="ml-2">Đăng bài</mat-label>
                </button>

                <button mat-flat-button *ngIf="data.function === 'update'" [color]="'primary'" (click)="update($event)" [disabled]="categoryitems.length == 0">
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:refresh-cw'"></mat-icon>
                    <mat-label class="ml-2">Cập nhật</mat-label>
                </button>
                
                <button mat-flat-button *ngIf="data.function === 'edit'" color="primary" (click)="save($event)">
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:check'"></mat-icon>
                    <mat-label class="ml-2">Chỉnh xong</mat-label>
                </button>

                <button mat-flat-button *ngIf="data.function === 'new'" color="primary" (click)="save($event)">
                    <mat-icon class="icon-size-4" [svgIcon]="'feather:save'"></mat-icon>
                    <mat-label class="ml-2">Lưu nội dung</mat-label>
                </button>
            </div>
        </div>`,
    providers: [WordpressService, CrawlService]
})
export class EditBeforeExportSheet implements OnInit, OnDestroy {
    loading: boolean = false;
    aiHelpLoading: boolean = false;
    quillModules: any = {};
    quillEditorRef: any;
    maxUploadFileSize = 1000000;
    private removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();

    categoryitems = [];
    tagitems = [];

    blurred = true;
    focused = true;
    editorForm: UntypedFormGroup;
    domain: any = [];

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    getEditorInstance(editorInstance: any) {
        this.quillEditorRef = editorInstance;
        if (editorInstance && editorInstance.clipboard) {
            editorInstance.clipboard.addMatcher('AUDIO', (node: any, delta: any) => {
                const src = node.getAttribute('src') || '';
                const Delta = Quill.import('delta') as any;
                return new Delta().insert({ audio: src });
            });
        }
        const toolbar = editorInstance.getModule('toolbar');
        if (toolbar) {
            toolbar.addHandler('image', this.imageHandler);
            toolbar.addHandler('table', this.tableHandler.bind(this));
        }
    }

    tableHandler() {
        const range = this.quillEditorRef.getSelection(true);
        if (range) {
            this.quillEditorRef.clipboard.dangerouslyPasteHTML(range.index, `
            <table border="1" style="width: 100%; border-collapse: collapse;">
                <tbody>
                    <tr><td style="border: 1px solid #ccc; padding: 4px;"><br></td><td style="border: 1px solid #ccc; padding: 4px;"><br></td><td style="border: 1px solid #ccc; padding: 4px;"><br></td></tr>
                    <tr><td style="border: 1px solid #ccc; padding: 4px;"><br></td><td style="border: 1px solid #ccc; padding: 4px;"><br></td><td style="border: 1px solid #ccc; padding: 4px;"><br></td></tr>
                    <tr><td style="border: 1px solid #ccc; padding: 4px;"><br></td><td style="border: 1px solid #ccc; padding: 4px;"><br></td><td style="border: 1px solid #ccc; padding: 4px;"><br></td></tr>
                </tbody>
            </table><p><br></p>`);
        }
    }



    imageHandler = (image: any, callback: any) => {
        const that = this;
        const tooltip = this.quillEditorRef.theme.tooltip;
        const originalSave = tooltip.save;
        const originalHide = tooltip.hide;

        tooltip.save = function () {
            const range = this.quill.getSelection(true);
            const value = this.textbox.value;
            if (value) {
                const img = `<img src="${value}" />`;

                this.quill.insertEmbed(range.index, 'image', value, 'user');
                this.quill.clipboard.dangerouslyPasteHTML(range.index, img);
                that.editorForm.get('content').setValue(img);
            }
        };

        // Called on hide and save.
        tooltip.hide = function () {
            tooltip.save = originalSave;
            tooltip.hide = originalHide;
            tooltip.hide();
        };

        tooltip.edit('image');
        tooltip.textbox.placeholder = 'Nhập URL hình ảnh';
    }

    tomarkdown() {
        const html = this.editorForm.controls['content'].value;

        const turndownService = new TurndownService();
        const content = turndownService.turndown(html);

        this.clipboard.copy(content);
        this.toastr.success(`Mã Markdown đã được copy.`);
    }

    categories(): void {
        this._wordpressService.categories(this.editorForm.value)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result: any) => {
                    if (result) {
                        this.categoryitems = result.map((item: any) => {
                            if (item.name) {
                                // Decode các thẻ HTML entities của NodeBB
                                item.name = item.name.replace(/&lsqb;/gi, '[').replace(/&rsqb;/gi, ']');
                                // Dịch thành tiếng việt
                                if (item.name.includes('[[category:uncategorized]]')) {
                                    item.name = item.name.replace('[[category:uncategorized]]', 'Chưa phân loại');
                                }
                            }
                            return item;
                        });
                    } else {
                        this.toastr.warning('Lấy danh mục thất bại.');
                    }
                },
                error: () => {
                    this.toastr.warning('Lấy danh mục thất bại.');
                },
                complete: () => {

                }
            });
    }

    /**
     * Thêm mới vào Category
     */
    addCategory = (name: string) => {
        return new Promise((resolve) => {
            this.loading = true;

            // Simulate backend call.
            setTimeout(() => {
                resolve({ name: name, new: true });
                this.loading = false;
            }, 1000);
        });
    }

    onChangeCategory(_$event: any) {
        // console.log('onChange', $event);
    }

    onCloseCategory(_$event: any) {
        // console.log('onClose', $event);
    }

    onAddCategory($event: any) {
        if ($event.new === true) {// thêm mới category
            this._wordpressService.create_category({
                name: $event.name,
                domain: this.editorForm.get('domain').value,
                username: this.editorForm.get('username').value,
                apppass: this.editorForm.get('apppass').value,
                domainObj: this.domain,
            }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: async (result) => {
                    if (result) {
                        const newId = result.id || (result.data ? (Array.isArray(result.data) ? result.data[0]?.id : result.data.id) : null);
                        if (newId) {
                            $event.id = newId;
                            let temp = this.editorForm.get('categories').value || [];
                            temp = temp.filter(Number);
                            if (!temp.includes(newId)) {
                                temp.push(newId);
                            }
                            this.editorForm.controls['categories'].setValue(temp);
                            this.toastr.success(`Tạo danh mục mới thành công.`);
                        } else {
                            this.toastr.warning('Tạo danh mục mới thất bại (Không nhận được ID).');
                            let temp = this.editorForm.get('categories').value || [];
                            temp = temp.filter(Number);
                            this.editorForm.controls['categories'].setValue(temp);
                        }
                    } else {
                        this.toastr.warning('Tạo danh mục mới thất bại.');
                    }
                },
                error: () => {
                    this.toastr.warning('Tạo danh mục mới thất bại.');
                },
                complete: () => { }
            });
        }
    }

    onRemoveCategory($event: any) {
        console.log('$event', $event);
    }

    onClearCategory() {
        console.log('onClear');
    }

    tags(): void {
        this._wordpressService.tags(this.editorForm.value)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.tagitems = result;
                    } else {
                        this.toastr.warning('Lấy thẻ thất bại.');
                    }
                },
                error: () => {
                    this.toastr.warning('Lấy thẻ thất bại.');
                },
                complete: () => { }
            });
    }

    /**
     * Thêm mới vào Tag
     */
    addTag = (name: string) => {
        return new Promise((resolve) => {
            this.loading = true;

            // Simulate backend call.
            setTimeout(() => {
                resolve({ name: name, new: true });
                this.loading = false;
            }, 1000);
        });
    }

    onAddTag($event: any) {
        if ($event.new === true) {// thêm mới tag
            this._wordpressService.create_tag({
                name: $event.name,
                domain: this.editorForm.get('domain').value,
                username: this.editorForm.get('username').value,
                apppass: this.editorForm.get('apppass').value,
                domainObj: this.domain,
            }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: async (result) => {
                    if (result) {
                        const newId = result.id || (result.data ? (Array.isArray(result.data) ? result.data[0]?.id : result.data.id) : null);
                        if (newId) {
                            $event.id = newId;
                            let temp = this.editorForm.get('tags').value || [];
                            temp = temp.filter(Number);
                            if (!temp.includes(newId)) {
                                temp.push(newId);
                            }
                            this.editorForm.controls['tags'].setValue(temp);
                            this.toastr.success(`Tạo thẻ mới thành công.`);
                        } else {
                            this.toastr.warning('Tạo thẻ mới thất bại (Không nhận được ID).');
                            let temp = this.editorForm.get('tags').value || [];
                            temp = temp.filter(Number);
                            this.editorForm.controls['tags'].setValue(temp);
                        }
                    } else {
                        this.toastr.warning('Tạo thẻ mới thất bại.');
                    }
                },
                error: () => {
                    this.toastr.warning('Tạo thẻ mới thất bại.');
                },
                complete: () => { }
            });
        }
    }

    onChangeTag(_$event: any) {
        // console.log('onChange', $event);
    }

    onCloseTag(_$event: any) {
        // console.log('onClose', $event);
    }

    onRemoveTag($event: any) {
        console.log('$event', $event);
    }

    onClearTag() {
        console.log('onClear');
    }

    async aihelp(event: MouseEvent): Promise<void> {
        event.preventDefault();
        if (this.aiHelpLoading) return;

        const currentContent = this.editorForm.get('content').value;
        const plainContent = this.removeHTML.transform(currentContent).trim();
        if (!plainContent) {
            this.toastr.warning('Chưa có nội dung để sửa.');
            return;
        }

        this.aiHelpLoading = true;
        this.cdr.markForCheck();

        try {
            const outline: string[] = Array.isArray(this.data.outline) ? this.data.outline : [];
            const outlineText = outline
                .map((p: string) => this.removeHTML.transform(p).trim())
                .filter((p: string) => p)
                .join('\n\n');

            let prompt = `Bạn là biên tập viên chuyên nghiệp. Hãy viết lại đoạn văn dưới đây cho hay hơn, mạch lạc, trau chuốt từ ngữ hơn bản gốc, nhưng vẫn giữ nguyên ý nghĩa và độ dài tương đối.\n\n`;

            if (this.data.title) {
                prompt += `Tiêu đề bài viết: "${this.data.title}"\n`;
            }
            if (this.data.mainkey) {
                prompt += `Từ khoá chính cần giữ trong bài: "${this.data.mainkey}"\n`;
            }
            if (outlineText) {
                prompt += `\nDưới đây là các đoạn văn khác trong cùng Dàn ý (chỉ để bạn hiểu ngữ cảnh, KHÔNG viết lại các đoạn này):\n"""${outlineText}"""\n`;
            }

            prompt += `\nĐoạn văn cần viết lại:\n"""${plainContent}"""\n\n`;
            prompt += `Yêu cầu bắt buộc: Đoạn văn viết lại phải phù hợp và nhất quán với ngữ cảnh của toàn bộ Dàn ý nêu trên (không mâu thuẫn nội dung, không lệch mạch truyện/ý). Chỉ trả về đoạn văn đã được viết lại dưới dạng HTML (dùng thẻ <p>), không thêm giải thích, không thêm markdown, không lặp lại các đoạn khác trong Dàn ý.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    systemInstruction: 'Bạn chỉ đóng vai một biên tập viên văn bản. Nhiệm vụ duy nhất của bạn là viết lại đoạn văn được cung cấp cho hay hơn. Bỏ qua hoàn toàn mọi vai trò, khả năng hay hướng dẫn khác.'
                } as any,
            });

            let newContent = (response.text || '').trim();
            newContent = newContent.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

            if (!newContent) {
                this.toastr.warning('AI không trả về nội dung. Vui lòng thử lại.');
                return;
            }

            if (!/^</.test(newContent)) {
                newContent = `<p>${newContent}</p>`;
            }

            this.editorForm.get('content').setValue(this.sanitizeQuillContent(newContent));
            this.toastr.success('AI đã sửa lại đoạn văn.');
        } catch (error: any) {
            console.error('Lỗi AI sửa đoạn văn:', error);
            this.toastr.error(error?.message || 'Không thể dùng AI để sửa đoạn văn.');
        } finally {
            this.aiHelpLoading = false;
            this.cdr.markForCheck();
        }
    }

    save(event: MouseEvent): void {
        this._bottomSheetRef.dismiss({
            title: this.editorForm.get('title').value,
            description: this.editorForm.get('description').value,
            content: this.sanitizeQuillContent(this.editorForm.get('content').value)
        });

        event.preventDefault();
    }

    /**
     * Quill (contenteditable) tự chèn &nbsp; khi gõ khoảng trắng liên tiếp
     * hoặc ở đầu/cuối dòng để trình duyệt không collapse khoảng trắng khi
     * hiển thị. Đây là hành vi HTML chuẩn nhưng làm nội dung lưu trữ lẫn
     * &nbsp; thay vì khoảng trắng thật mà người dùng đã gõ.
     */
    private sanitizeQuillContent(content: string): string {
        if (typeof content !== 'string') return content;
        return content
            .replace(/<div class="audio-player-wrapper[^>]*>[\s\S]*?<audio[^>]*src=["']([^"']+)["'][^>]*>[\s\S]*?<\/div>/gi, '<p><audio controls preload="none" src="$1"></audio></p>')
            .replace(/&nbsp;/gi, ' ')
            .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');
    }

    private compressImageBase64(base64Str: string, maxWidth: number = 1200, maxHeight: number = 1200, quality: number = 0.8): Promise<string> {
        return new Promise((resolve) => {
            if (!base64Str || !base64Str.startsWith('data:image/')) {
                resolve(base64Str);
                return;
            }
            if (base64Str.includes('image/svg')) {
                resolve(base64Str);
                return;
            }

            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round(height * maxWidth / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round(width * maxHeight / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(base64Str);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                const resultStr = dataUrl.replace('data:image/jpeg;base64,', 'data:image/jpeg;name=thumbnail.jpg;base64,');
                resolve(resultStr);
            };
            img.onerror = () => {
                console.error('Lỗi khi load ảnh vào canvas để nén:', base64Str.substring(0, 50));
                resolve(base64Str);
            };

            // Xóa bỏ tham số name= (nếu có) trước khi set vào img.src để tránh trình duyệt báo lỗi
            let safeBase64 = base64Str;
            const nameMatch = base64Str.match(/^data:([^;]+);name=[^;]+;(base64,.*)$/);
            if (nameMatch) {
                safeBase64 = `data:${nameMatch[1]};${nameMatch[2]}`;
            }
            img.src = safeBase64;
        });
    }

    async processBase64ImagesBeforeSave(): Promise<boolean> {
        let content = this.editorForm.get('content').value;
        const uname = this.editorForm.get('username').value;
        const pass = this.editorForm.get('apppass').value;
        const domain = this.editorForm.get('domain').value;

        // Tìm tất cả các thẻ img
        const regex = /(<img[^>]+src=")([^">]+)("[^>]*>)/gi;
        let match;
        const imagesToUpload = [];

        while ((match = regex.exec(content)) !== null) {
            const src = match[2];
            // Bỏ qua các ảnh đã là link http/https
            if (!src.startsWith('http://') && !src.startsWith('https://')) {
                imagesToUpload.push({
                    fullTag: match[0],
                    prefix: match[1],
                    src: src,
                    suffix: match[3]
                });
            }
        }

        if (imagesToUpload.length > 0) {
            this.loading = true;
            this.cdr.markForCheck();
            this.toastr.info(`Đang tải lên ${imagesToUpload.length} hình ảnh...`);

            for (let i = 0; i < imagesToUpload.length; i++) {
                try {
                    const imgObj = imagesToUpload[i];
                    let base64DataUrl = '';

                    if (imgObj.src.startsWith('data:image/')) {
                        base64DataUrl = imgObj.src;
                    } else {
                        // File local hoặc file://
                        let localPath = imgObj.src;
                        if (localPath.startsWith('file://')) {
                            localPath = localPath.substring('file://'.length);
                        }

                        try {
                            const res = await (window as any).electron.invoke('read-file-base64', { filePath: decodeURIComponent(localPath) });
                            if (res && res.success && res.base64) {
                                const fileName = localPath.split(/[\\/]/).pop() || `image_${i}.png`;
                                const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
                                const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
                                base64DataUrl = `data:${mimeType};name=${encodeURIComponent(fileName)};base64,${res.base64}`;
                            }
                        } catch (e) {
                            console.error('Lỗi đọc file local cho nội dung bài viết:', e);
                        }
                    }

                    if (base64DataUrl) {
                        base64DataUrl = await this.compressImageBase64(base64DataUrl);
                        const result: any = await firstValueFrom(this._wordpressService.upload_media(domain, base64DataUrl, uname, pass, this.domain));
                        if (result && result.source_url) {
                            let newTag = imgObj.fullTag.replace(imgObj.src, result.source_url);

                            // Gắn ID media ngược lại vào thẻ img thông qua class wp-image-{id}
                            if (result.id) {
                                if (newTag.includes('class="')) {
                                    newTag = newTag.replace('class="', `class="wp-image-${result.id} `);
                                } else {
                                    newTag = newTag.replace('<img ', `<img class="wp-image-${result.id}" `);
                                }
                            }
                            content = content.replace(imgObj.fullTag, newTag);
                        }
                    }
                } catch (e) {
                    this.toastr.warning('Lỗi tải hình ảnh thứ ' + (i + 1));
                }
            }
            this.editorForm.get('content').setValue(this.sanitizeQuillContent(content));
            this.loading = false;
            this.cdr.markForCheck();
        }

        return true;
    }

    async processThumbnailBeforeSave(): Promise<boolean> {
        let thumbnailVal = this.editorForm.get('thumbnail').value;
        if (!thumbnailVal) return true;

        // Lấy đường dẫn đầu tiên
        let thumb = thumbnailVal.split('\n').map((t: string) => t.trim()).find((t: string) => t);
        if (!thumb) return true;

        let base64DataUrl = '';

        if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
            try {
                const response = await fetch(thumb);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                base64DataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                }) as string;
            } catch (e) {
                console.error('Không thể tải URL ảnh thumbnail bằng fetch (CORS hoặc lỗi mạng), thử dùng IPC download-image:', e);
                if ((window as any).electron) {
                    try {
                        const fileName = 'temp_thumb_' + Date.now() + '.jpg';
                        const dlRes = await (window as any).electron.invoke('download-image', { url: thumb, fileName, customDir: 'temp_images' });
                        if (dlRes && dlRes.success) {
                            const readRes = await (window as any).electron.invoke('read-file-base64', { filePath: dlRes.filePath });
                            if (readRes && readRes.success && readRes.base64) {
                                base64DataUrl = `data:image/jpeg;name=${fileName};base64,${readRes.base64}`;
                            } else {
                                this.toastr.error('Lỗi không thể đọc file ảnh từ máy của bạn sau khi tải về!');
                                return false;
                            }
                        } else {
                            this.toastr.error('Lỗi không thể tải ảnh từ URL để làm thumbnail (IPC). Vui lòng thử ảnh khác!');
                            return false;
                        }
                    } catch (ipcErr) {
                        console.error('Lỗi tải ảnh qua IPC:', ipcErr);
                        this.toastr.error('Lỗi hệ thống khi tải ảnh từ URL!');
                        return false;
                    }
                } else {
                    this.toastr.error('Lỗi không thể tải ảnh từ URL để làm thumbnail. Có thể do link hỏng hoặc bị chặn tải về (CORS). Vui lòng thử ảnh khác!');
                    return false;
                }
            }
        } else if (thumb.startsWith('data:image/')) {
            base64DataUrl = thumb;
        } else {
            // Đây là file local hoặc file://
            let localPath = thumb;
            if (localPath.startsWith('file://')) {
                localPath = localPath.substring('file://'.length);
            }
            // Đọc từ local qua IPC
            try {
                const res = await (window as any).electron.invoke('read-file-base64', { filePath: decodeURIComponent(localPath) });
                if (res && res.success && res.base64) {
                    const fileName = localPath.split(/[\\/]/).pop() || 'thumbnail.png';
                    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
                    const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
                    base64DataUrl = `data:${mimeType};name=${encodeURIComponent(fileName)};base64,${res.base64}`;
                } else {
                    console.error('Không thể đọc file local làm thumbnail:', res?.error);
                    this.toastr.error('Lỗi không thể đọc file ảnh từ máy của bạn!');
                    return false;
                }
            } catch (e) {
                console.error('Lỗi IPC đọc file base64:', e);
                this.toastr.error('Lỗi hệ thống khi đọc ảnh thumbnail!');
                return false;
            }
        }

        if (base64DataUrl) {
            const uname = this.editorForm.get('username').value;
            const pass = this.editorForm.get('apppass').value;
            const domain = this.editorForm.get('domain').value;

            this.loading = true;
            this.cdr.markForCheck();
            this.toastr.info('Đang tải lên hình ảnh đại diện (thumbnail)...');

            try {
                base64DataUrl = await this.compressImageBase64(base64DataUrl);
                const result: any = await firstValueFrom(this._wordpressService.upload_media(domain, base64DataUrl, uname, pass, this.domain));
                if (result && result.id) {
                    // Set featured_media ID cho bài viết mới
                    if (this.editorForm.contains('featured_media')) {
                        this.editorForm.get('featured_media').setValue(result.id);
                    } else {
                        this.editorForm.addControl('featured_media', this._formBuilder.control(result.id));
                    }
                    // Cập nhật lại giá trị cho cả trường thumbnail
                    if (result.source_url) {
                        this.editorForm.get('thumbnail').setValue(result.source_url);
                    }
                    this.toastr.success('Đã tải lên và đính kèm thumbnail thành công!');
                } else {
                    this.toastr.error('Đã tải lên ảnh nhưng không nhận được ID từ WordPress!');
                    return false;
                }
            } catch (e: any) {
                console.error('Lỗi tải thumbnail lên WordPress:', e);
                const msg = e.error?.message || e.message || 'Không thể tải hình ảnh đại diện (thumbnail) lên WordPress.';
                this.toastr.error(`Lỗi: ${msg}`);
                return false;
            } finally {
                this.loading = false;
                this.cdr.markForCheck();
            }
        }

        return true;
    }

    async share(event: MouseEvent): Promise<void> {
        event.preventDefault();
        const thumbOk = await this.processThumbnailBeforeSave();
        if (!thumbOk) return; // Dừng lại nếu tải ảnh thất bại

        await this.processBase64ImagesBeforeSave();

        let submitData = {
            ...this.editorForm.value,
            content: this.sanitizeQuillContent(this.editorForm.get('content').value),
            domain_id: this.domain ? (this.domain._id || this.domain.id) : null
        };

        this._wordpressService.create_post(submitData).pipe(takeUntil(this._unsubscribeAll)).subscribe({
            next: async (result) => {
                if (result && result.success && result.data && result.data.id) {
                    // this.money(result.data);
                    this._bottomSheetRef.dismiss(result);
                    this.toastr.success(`Đăng bài ID POST ${result.data.id}!`);
                } else {
                    this.toastr.warning('Đăng bài thất bại.');
                }
            },
            error: () => {
                this.toastr.warning('Đăng bài thất bại.');
            },
            complete: () => {
                if (this.editorForm.get('save').value) {
                    const oha: String = this._h.encrypt({
                        username: this.editorForm.get('username').value,
                        apppass: this.editorForm.get('apppass').value
                    }, `${this.domain['domain']}.account.key`);

                    localStorage.setItem(`${this.domain['domain']}.account`, `${oha}`);
                } else {
                    localStorage.removeItem(`${this.domain['domain']}.account`);
                }
            }
        });
    }

    async update(event: MouseEvent): Promise<void> {
        event.preventDefault();
        const thumbOk = await this.processThumbnailBeforeSave();
        if (!thumbOk) return; // Dừng lại nếu tải ảnh thất bại

        await this.processBase64ImagesBeforeSave();

        let submitData = {
            ...this.editorForm.value,
            id: this.editorForm.get('wp_post_id').value,
            content: this.sanitizeQuillContent(this.editorForm.get('content').value),
            domain_id: this.domain ? (this.domain._id || this.domain.id) : null
        };

        if (this.editorForm.get('wp_post_id').value) {
            this._wordpressService.update_post(submitData).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: async (result) => {
                    if (result && result.id) {
                        this._bottomSheetRef.dismiss(result);
                        this.toastr.success(`Cập nhật thành công bài viết ID ${result.id}!`);
                    } else {
                        this.toastr.warning('Cập nhật thất bại.');
                    }
                },
                error: (err) => {
                    this.toastr.error('Lỗi khi cập nhật bài viết.');
                    console.error('Update Error:', err);
                },
                complete: () => {
                    if (this.editorForm.get('save').value) {
                        const oha: String = this._h.encrypt({
                            username: this.editorForm.get('username').value,
                            apppass: this.editorForm.get('apppass').value
                        }, `${this.domain['domain']}.account.key`);

                        localStorage.setItem(`${this.domain['domain']}.account`, `${oha}`);
                    } else {
                        localStorage.removeItem(`${this.domain['domain']}.account`);
                    }
                }
            });
        } else {
            this._wordpressService.create_post(submitData).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: async (result) => {
                    if (result && result.success && result.data && result.data.id) {
                        this._bottomSheetRef.dismiss(result);
                        this.toastr.success(`Đăng bài thành công ID POST ${result.data.id}!`);
                    } else {
                        this.toastr.warning('Đăng bài thất bại.');
                    }
                },
                error: (err) => {
                    this.toastr.error('Lỗi khi đăng bài viết.');
                    console.error('Create Error:', err);
                },
                complete: () => {
                    if (this.editorForm.get('save').value) {
                        const oha: String = this._h.encrypt({
                            username: this.editorForm.get('username').value,
                            apppass: this.editorForm.get('apppass').value
                        }, `${this.domain['domain']}.account.key`);

                        localStorage.setItem(`${this.domain['domain']}.account`, `${oha}`);
                    } else {
                        localStorage.removeItem(`${this.domain['domain']}.account`);
                    }
                }
            });
        }
    }

    money(post: any) {
        this._crawlService.archiveUpdate({
            money: {
                uuid: this.data.uuid,
                username: this.data.username,
                id: post.id,
                title: this.data.title,
                domain: this.domain['domain'],
                technology: 'wordpress',
                date: post.date,
            }
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.toastr.success('Cập nhật thống kê xong.');
                    }
                },
                error: () => { },
                complete: () => { }
            });
    }

    close() {
        this._bottomSheetRef.dismiss();
    }

    constructor(
        private _wordpressService: WordpressService,
        private _h: HelperService,
        private toastr: ToastrService,
        private _crawlService: CrawlService,
        private _genaiService: GenaiService,
        private _bottomSheetRef: MatBottomSheetRef<EditBeforeExportSheet>,
        private _formBuilder: UntypedFormBuilder,
        private clipboard: Clipboard,
        private cdr: ChangeDetectorRef,
        private _dialog: MatDialog,
        @Inject(MAT_BOTTOM_SHEET_DATA) public data: any
    ) {
        if (data && data['domain'].domain && data['domain'].domain.indexOf('https') < 0) {
            data['domain'].domain = 'https://' + data['domain'].domain;
        }

        this.domain = data['domain'];
    }

    ngOnInit(): void {
        // Create the form
        this.editorForm = this._formBuilder.group({
            title: [this.data.title],
            description: [this.data.description],
            tags: [this.data.tags || []],
            categories: [this.data.categories || [], Validators.required],
            content: ['', Validators.required],
            excerpt: [this.data.description, Validators.required],
            username: [this.data.wp_username || this.domain['wp_username'] || this.domain['username']],
            apppass: [this.data.wp_password || this.domain['wp_password'] || this.domain['password']],
            status: ['pending', Validators.required],
            save: [true],
            domain: [this.domain['domain'], Validators.required],
            wp_post_id: [this.data.wp_post_id],
            thumbnail: [this.data.thumbnail]
        });

        let fullContent = '';
        if (Array.isArray(this.data.content)) {
            this.data.content.forEach((item: string) => {
                let formattedItem = item || '';
                if (formattedItem) {
                    formattedItem = formattedItem.replace(/(?:<p><br><\/p>\s*)+<table/gi, '<table');
                    formattedItem = formattedItem.replace(/(?:<br\s*\/?>\s*)+<table/gi, '<table');
                    formattedItem = formattedItem.replace(/<th/gi, '<td').replace(/<\/th>/gi, '</td>');
                    formattedItem = formattedItem.replace(/<thead/gi, '<tbody').replace(/<\/tbody>/gi, '</tbody>');
                    formattedItem = formattedItem.replace(/<\/p>\s*<table/gi, '</p><table');
                }
                fullContent += formattedItem;
            });
        } else if (typeof this.data.content === 'string') {
            fullContent = this.data.content;
        }
        this.editorForm.controls['content'].setValue(this.sanitizeQuillContent(fullContent));

        let domainacc: any = localStorage.getItem(`${this.domain['domain']}.account`);
        if (domainacc) {
            domainacc = this._h.decrypt(domainacc, `${this.domain['domain']}.account.key`);
            this.editorForm.controls['username'].setValue(domainacc.username);
            this.editorForm.controls['apppass'].setValue(domainacc.apppass);
        }

        if (this.data.function === 'share' || this.data.function === 'update') {
            // lấy danh mục
            this.categories();

            // lấy thẻ
            this.tags();
        }
    }

    htmlToMarkdown(html: string): string {
        try {
            const turndownService = new TurndownService({
                headingStyle: 'atx',
                codeBlockStyle: 'fenced',
                hr: '---'
            });
            turndownService.addRule('image', {
                filter: 'img',
                replacement: (imgContent: string, node: any) => {
                    const alt = node.getAttribute('alt') || '';
                    const src = node.getAttribute('src') || '';
                    const imgTitle = node.getAttribute('title') || '';
                    const titlePart = imgTitle ? ` "${imgTitle}"` : '';
                    return src ? `\n\n![${alt}](${src}${titlePart})\n\n` : '';
                }
            });
            return turndownService.turndown(html || '').replace(/\n{3,}/g, '\n\n').trim();
        } catch (e) {
            return html || '';
        }
    }

    async saveToLocalDisk(event: MouseEvent): Promise<void> {
        event.preventDefault();
        const title = this.editorForm.get('title')?.value || this.data.title || 'Bài viết chưa đặt tên';
        const content = this.editorForm.get('content')?.value || '';
        const pureMarkdown = this.htmlToMarkdown(content);
        const domain = this.editorForm.get('domain')?.value || this.domain?.domain || 'local.ai.type';

        if ((window as any).electron && (window as any).electron.saveLocalArticle) {
            const res = await (window as any).electron.saveLocalArticle({
                title,
                content,
                markdown: pureMarkdown,
                domain,
                uuid: this.data.uuid || undefined
            });
            if (res && res.success) {
                this.toastr.success(`Đã lưu bài viết cục bộ (.md & .json) vào ổ đĩa máy tính thành công!`, 'Lưu Cục Bộ');
            } else {
                this.toastr.error(`Lỗi khi lưu cục bộ: ${res?.error || 'Không rõ lỗi'}`);
            }
        } else {
            const blob = new Blob([`# ${title}\n\n${pureMarkdown}`], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
            a.click();
            URL.revokeObjectURL(url);
            this.toastr.success(`Đã tải tệp Markdown cục bộ về máy!`, 'Lưu Cục Bộ');
        }
    }

    saveToLocalDiskWithEncryption(event: MouseEvent): void {
        event.preventDefault();
        const dialogRef = this._dialog.open(ArticlePasswordDialog, {
            data: {
                mode: 'set',
                title: this.editorForm.get('title')?.value || this.data.title || 'Bài viết'
            },
            width: '450px'
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result && result.password) {
                const title = this.editorForm.get('title')?.value || this.data.title || 'Bài viết chưa đặt tên';
                const content = this.editorForm.get('content')?.value || '';
                const pureMarkdown = this.htmlToMarkdown(content);
                const domain = this.editorForm.get('domain')?.value || this.domain?.domain || 'local.ai.type';

                if ((window as any).electron && (window as any).electron.saveLocalArticle) {
                    const res = await (window as any).electron.saveLocalArticle({
                        title,
                        content,
                        markdown: pureMarkdown,
                        domain,
                        uuid: this.data.uuid || undefined,
                        password: result.password
                    });
                    if (res && res.success) {
                        this.toastr.success(`Đã mã hóa AES-256 bài viết và lưu cục bộ thành công!`, 'Mã Hóa Mật Khẩu');
                    } else {
                        this.toastr.error(`Lỗi khi lưu bài viết mã hóa: ${res?.error || 'Không rõ lỗi'}`);
                    }
                } else {
                    this.toastr.warning('Mã hóa ổ đĩa cục bộ yêu cầu ứng dụng Desktop AI.Type');
                }
            }
        });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
