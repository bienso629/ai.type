import { Component, Inject, OnDestroy, OnInit, ChangeDetectorRef } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { HelperService } from "app/helper.service";
import { CrawlService } from "app/modules/_services/crawl";
import { WordpressService } from "app/modules/_services/wordpress";
import { ToastrService } from "ngx-toastr";
import { Clipboard } from '@angular/cdk/clipboard';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import Quill from 'quill';

declare var TurndownService: any;

@Component({
    selector: 'edit-before-export-sheet',
    styles: [`
        ::ng-deep .edit-before-export-quill .ql-container {
            height: 35vh !important;
            max-height: 400px !important;
            overflow-y: auto !important;
        }
        ::ng-deep .edit-before-export-quill .ql-editor {
            padding: 16px !important;
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
        </div>`,
    providers: [WordpressService, CrawlService]
})
export class EditBeforeExportSheet implements OnInit, OnDestroy {
    loading: boolean = false;
    quillModules: any = {};
    quillEditorRef: any;
    maxUploadFileSize = 1000000;

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

    save(event: MouseEvent): void {
        this._bottomSheetRef.dismiss({
            title: this.editorForm.get('title').value,
            description: this.editorForm.get('description').value,
            content: this.editorForm.get('content').value
        });

        event.preventDefault();
    }

    async processBase64ImagesBeforeSave(): Promise<boolean> {
        let content = this.editorForm.get('content').value;
        const uname = this.editorForm.get('username').value;
        const pass = this.editorForm.get('apppass').value;
        const domain = this.editorForm.get('domain').value;

        // Tìm tất cả các thẻ img có src là data:image
        const regex = /<img[^>]+src="([^">]+)"/gi;
        let match;
        const b64Images = [];
        while ((match = regex.exec(content)) !== null) {
            if (match[1].startsWith('data:image/')) {
                b64Images.push(match[1]);
            }
        }

        if (b64Images.length > 0) {
            this.loading = true;
            this.cdr.markForCheck();
            this.toastr.info(`Đang tải lên ${b64Images.length} hình ảnh...`);
            for (let i = 0; i < b64Images.length; i++) {
                try {
                    const result = await firstValueFrom(this._wordpressService.upload_media(domain, b64Images[i], uname, pass, this.domain));
                    if (result && result.source_url) {
                        content = content.replace(b64Images[i], result.source_url);
                    }
                } catch (e) {
                    this.toastr.warning('Lỗi tải hình ảnh thứ ' + (i + 1));
                }
            }
            this.editorForm.get('content').setValue(content);
            this.loading = false;
            this.cdr.markForCheck();
        }

        return true;
    }

    async processThumbnailBeforeSave(): Promise<void> {
        let thumbnailVal = this.editorForm.get('thumbnail').value;
        if (!thumbnailVal) return;

        // Lấy đường dẫn đầu tiên
        let thumb = thumbnailVal.split('\n').map((t: string) => t.trim()).find((t: string) => t);
        if (!thumb) return;

        // Nếu thumbnail đã là một link URL (http:// hoặc https://) thì không cần upload lại
        if (thumb.startsWith('http://') || thumb.startsWith('https://')) {
            return;
        }

        let base64DataUrl = '';

        if (thumb.startsWith('data:image/')) {
            base64DataUrl = thumb;
        } else {
            // Đây là file local hoặc file://
            let localPath = thumb;
            if (localPath.startsWith('file://')) {
                localPath = localPath.substring('file://'.length);
            }
            // Đọc từ local qua IPC
            try {
                const res = await (window as any).electron.invoke('read-file-base64', { filePath: localPath });
                if (res && res.success && res.base64) {
                    const fileName = localPath.split(/[\\/]/).pop() || 'thumbnail.png';
                    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
                    const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`;
                    base64DataUrl = `data:${mimeType};name=${encodeURIComponent(fileName)};base64,${res.base64}`;
                } else {
                    console.error('Không thể đọc file local làm thumbnail:', res?.error);
                }
            } catch (e) {
                console.error('Lỗi IPC đọc file base64:', e);
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
                const result = await firstValueFrom(this._wordpressService.upload_media(domain, base64DataUrl, uname, pass, this.domain));
                if (result && result.id) {
                    // Set featured_media ID cho bài viết mới
                    this.editorForm.addControl('featured_media', this._formBuilder.control(result.id));
                    // Cập nhật lại giá trị cho cả trường thumbnail
                    if (result.source_url) {
                        this.editorForm.get('thumbnail').setValue(result.source_url);
                    }
                    this.toastr.success('Đã tải lên và đính kèm thumbnail thành công!');
                }
            } catch (e) {
                console.error('Lỗi tải thumbnail lên WordPress:', e);
                this.toastr.warning('Không thể tải hình ảnh đại diện (thumbnail) lên trang web.');
            } finally {
                this.loading = false;
                this.cdr.markForCheck();
            }
        }
    }

    async share(event: MouseEvent): Promise<void> {
        event.preventDefault();
        await this.processThumbnailBeforeSave();
        await this.processBase64ImagesBeforeSave();

        let submitData = {
            ...this.editorForm.value,
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
        await this.processThumbnailBeforeSave();
        await this.processBase64ImagesBeforeSave();

        let submitData = {
            ...this.editorForm.value,
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
        private _bottomSheetRef: MatBottomSheetRef<EditBeforeExportSheet>,
        private _formBuilder: UntypedFormBuilder,
        private clipboard: Clipboard,
        private cdr: ChangeDetectorRef,
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
            username: [this.data.wp_username || this.domain['username']],
            apppass: [this.data.wp_password || this.domain['password']],
            status: ['pending', Validators.required],
            save: [true],
            domain: [this.domain['domain'], Validators.required],
            wp_post_id: [this.data.wp_post_id],
            thumbnail: [this.data.thumbnail]
        });

        this.data.content.map((item: string) => {
            let formattedItem = item;
            if (formattedItem) {
                // Dọn dẹp các thẻ xuống dòng trống trước thẻ table
                formattedItem = formattedItem.replace(/(?:<p><br><\/p>\s*)+<table/gi, '<table');
                formattedItem = formattedItem.replace(/(?:<br\s*\/?>\s*)+<table/gi, '<table');
                
                formattedItem = formattedItem.replace(/<th/gi, '<td').replace(/<\/th>/gi, '</td>');
                formattedItem = formattedItem.replace(/<thead/gi, '<tbody').replace(/<\/thead>/gi, '</tbody>');
                formattedItem = formattedItem.replace(/<\/p>\s*<table/gi, '</p><table');
            }
            this.editorForm.controls['content'].setValue(this.editorForm.controls['content'].value + formattedItem);
        });

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

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
