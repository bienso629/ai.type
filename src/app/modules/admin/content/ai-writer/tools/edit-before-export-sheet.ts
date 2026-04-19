import { Component, Inject, OnDestroy, OnInit } from "@angular/core";
import { UntypedFormBuilder, UntypedFormGroup, Validators } from "@angular/forms";
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from "@angular/material/bottom-sheet";
import { HelperService } from "app/helper.service";
import { CrawlService } from "app/modules/_services/crawl";
import { WordpressService } from "app/modules/_services/wordpress";
import { ToastrService } from "ngx-toastr";
import { Subject, takeUntil } from "rxjs";
import { Clipboard } from '@angular/cdk/clipboard';

declare var TurndownService: any;

@Component({
    selector: 'edit-before-export-sheet',
    template: `<div class="px-2 pb-4">
        <div *ngIf="data.function === 'share'" class="text-xl my-4 font-normal text-gray-500 tracking-tight flex items-stretch">
            <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:check-square'"></mat-icon>
            <mat-label class="self-center">{{this.data.title}}</mat-label>
        </div>

        <div *ngIf="data.function === 'edit'" class="text-xl my-4 font-normal text-gray-500 tracking-tight flex items-stretch">
            <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:edit-3'"></mat-icon>
            <mat-label class="self-center">Chỉnh sửa</mat-label>
        </div>

        <div *ngIf="data.function === 'new'" class="text-xl my-4 font-normal text-gray-500 tracking-tight flex items-stretch">
            <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:plus'"></mat-icon>
            <mat-label class="self-center">Thêm nội dung</mat-label>
        </div>

        <div mat-dialog-content class="mt-6 p-0 overflow-hidden">
            <form [formGroup]="editorForm">
                <div class="flex flex-col p-0 bg-white rounded-md">
                    <div class="my-1 flex flex-row" *ngIf="data.function === 'share'">
                        <ng-select class="custom-select-ai-writer"
                            placeholder="Chọn danh mục" [items]="categoryitems" multiple="true" bindLabel="name" bindValue="id" [clearable]="true" [formControlName]="'categories'" [dropdownPosition]="'bottom'" [addTag]="addCategory" (clear)="onClearCategory()" (add)="onAddCategory($event)" (remove)="onRemoveCategory($event)" (change)="onChangeCategory($event)" [loading]="loading" appendTo="body">
                            <ng-template ng-tag-tmp let-search="searchTerm">
                                <mat-label class="text-base">Click để tạo danh mục mới:
                                    {{search}}</mat-label>
                            </ng-template>
                        </ng-select>

                        <ng-select class="custom-select-ai-writer ml-2"
                            placeholder="Chọn thẻ" [items]="tagitems" multiple="true" bindLabel="name" bindValue="id" [clearable]="true" [formControlName]="'tags'" [dropdownPosition]="'bottom'" [addTag]="addTag" (clear)="onClearTag()" (add)="onAddTag($event)" (remove)="onRemoveTag($event)" (change)="onChangeTag($event)" [loading]="loading" appendTo="body">
                            <ng-template ng-tag-tmp let-search="searchTerm">
                                <mat-label class="text-base">Click để tạo thẻ mới:
                                    {{search}}</mat-label>
                            </ng-template>
                        </ng-select>
                    </div>

                    <!-- <div class="my-1"><mat-label><b>Mô tả:</b> {{this.data.description || "Chưa có mô tả"}}</mat-label></div>
                    <div class="my-1"><mat-label><b>Khoá chính:</b> {{this.data.mainkey || "Chưa có khoá chính"}}</mat-label></div> -->

                    <div class="my-1">
                        <quill-editor class="w-full mt-2" theme="snow" format="html" [ngStyle]="{height: '200px'}" placeholder="Nhập nội dung" [formControlName]="'content'" (onEditorCreated)="getEditorInstance($event)"><div above-quill-editor-toolbar> above </div> <div quill-editor-toolbar> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <select class="ql-header !border !border-solid !border-slate-300 rounded hover:bg-slate-100"> <option value="1">Heading</option> <option value="2">Subheading</option> <option selected>Normal</option> </select> </span> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <button class="ql-bold !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> <button class="ql-italic !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> <button class="ql-underline !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100"></button> </span> <span class="ql-formats inline-flex gap-1 mr-2 mb-1"> <button class="ql-list !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" value="ordered"></button> <button class="ql-list !border !border-solid !border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" value="bullet"></button> <select class="ql-align !border !border-solid !border-slate-300 rounded hover:bg-slate-100"> <option label="left" selected></option> <option label="center" value="center"></option> <option label="right" value="right"></option> <option label="justify" value="justify"></option> </select> </span> <span class="ql-formats inline-flex gap-1 mb-1"> 
                            <button class="ql-blockquote !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Quote"><mat-icon class="icon-size-4" [svgIcon]="'feather:message-square'"></mat-icon></button>
                            <button class="ql-code-block !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Code"><mat-icon class="icon-size-4" [svgIcon]="'feather:code'"></mat-icon></button> 
                            <button class="ql-link !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Link"><mat-icon class="icon-size-4" [svgIcon]="'feather:link'"></mat-icon></button> 
                            <button class="ql-image !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Hình ảnh"><mat-icon class="icon-size-4" [svgIcon]="'feather:image'"></mat-icon></button> 
                            <button class="ql-video !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Video"><mat-icon class="icon-size-4" [svgIcon]="'feather:video'"></mat-icon></button>
                            <button class="ql-table !border border-solid border-slate-300 rounded flex items-center justify-center hover:bg-slate-100" title="Chèn bảng"><mat-icon class="icon-size-4" [svgIcon]="'feather:grid'"></mat-icon></button>
                        </span> </div> <div below-quill-editor-toolbar> below </div></quill-editor>
                    </div>
                </div>
            </form>
        </div>

        <div mat-dialog-actions class="p-0 mt-4">
            <button mat-flat-button *ngIf="data.function === 'share'" [color]="'primary'" (click)="share($event)" [disabled]="categoryitems.length == 0">
                <mat-icon class="icon-size-4" [svgIcon]="'feather:send'"></mat-icon>
                <mat-label class="ml-2">Đăng bài</mat-label>
            </button>

            <button mat-flat-button *ngIf="data.function === 'edit'" color="primary" (click)="save($event)">
                <mat-icon class="icon-size-4" [svgIcon]="'feather:check'"></mat-icon>
                <mat-label class="ml-2">Chỉnh xong</mat-label>
            </button>

            <!-- chuyển thành markdown tạm dừng
            <button mat-flat-button (click)="tomarkdown()" class="ml-2 bg-blue-500 text-white">
                <mat-icon class="icon-size-4" [svgIcon]="'feather:copy'"></mat-icon>
                <mat-label class="ml-2">Copy Markdown</mat-label>
            </button>
            -->

            <button mat-flat-button color="medium" (click)="close()" class="ml-2">Đóng</button>
        </div>
    </div>`,
    providers: [WordpressService, CrawlService]
})
export class EditBeforeExportSheet implements OnInit, OnDestroy {
    loading: boolean = false;

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
        toolbar.addHandler('image', this.imageHandler);
        toolbar.addHandler('table', this.tableHandler.bind(this));
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
                next: async (result) => {
                    if (result) {
                        this.categoryitems = result;
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
    addCategory(name: string, id: number) {
        return new Promise((resolve) => {
            this.loading = true;

            // Simulate backend call.
            setTimeout(() => {
                resolve({ name: name, id: id, new: true });
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
            }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: async (result) => {
                    if (result) {
                        $event.id = result.id;
                        let temp = this.editorForm.get('categories').value;
                        temp = temp.filter(Number);
                        temp.push(result.id);
                        this.editorForm.controls['categories'].setValue(temp);

                        this.toastr.success(`Tạo danh mục mới thành công.`);
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
    addTag(name: string, id: number) {
        return new Promise((resolve) => {
            this.loading = true;

            // Simulate backend call.
            setTimeout(() => {
                resolve({ name: name, id: id, new: true });
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
            }).pipe(takeUntil(this._unsubscribeAll)).subscribe({
                next: async (result) => {
                    if (result) {
                        $event.id = result.id;
                        let temp = this.editorForm.get('tags').value;
                        temp = temp.filter(Number);
                        temp.push(result.id);
                        this.editorForm.controls['tags'].setValue(temp);

                        this.toastr.success(`Tạo thẻ mới thành công.`);
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

    share(event: MouseEvent): void {
        this._wordpressService.create_post(this.editorForm.value)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data && result.data.id) {
                        // this.money(result.data);
                        this._bottomSheetRef.dismiss();
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

        event.preventDefault();
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
            tags: [[]],
            categories: [[], Validators.required],
            content: ['', Validators.required],
            excerpt: [this.data.description, Validators.required],
            username: [this.domain['username']],
            apppass: [this.domain['password']],
            status: ['pending', Validators.required],
            save: [true],
            domain: [this.domain['domain'], Validators.required]
        });

        this.data.content.map((item: string) => {
            this.editorForm.controls['content'].setValue(this.editorForm.controls['content'].value + item);
        });

        let domainacc: any = localStorage.getItem(`${this.domain['domain']}.account`);
        if (domainacc) {
            domainacc = this._h.decrypt(domainacc, `${this.domain['domain']}.account.key`);
            this.editorForm.controls['username'].setValue(domainacc.username);
            this.editorForm.controls['apppass'].setValue(domainacc.apppass);
        }

        if (this.data.function === 'share') {
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
