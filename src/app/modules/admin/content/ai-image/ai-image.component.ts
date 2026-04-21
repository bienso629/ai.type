import {
    AfterContentChecked,
    ChangeDetectorRef,
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
} from '@angular/core';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { ChatGPTService } from 'app/modules/_services/chatgpt';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfigService } from '@fuse/services/config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { Router } from '@angular/router';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { HttpClient } from '@angular/common/http';

import { GoogleGenAI } from '@google/genai';

import { MatDialog } from '@angular/material/dialog';
import { ImageEditorDialogComponent } from './tools/image-editor.component';

import * as uuid from 'uuid';
import { BlogService } from 'app/modules/_services/blog';
import { DomainService } from 'app/modules/_services/domain';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { MyKeysService } from 'app/modules/_services/mykey';

interface ReferenceFile {
    base64Data: string;
    mimeType: string;
    fileName: string;
}

@Component({
    selector: 'ai-image',
    templateUrl: './ai-image.component.html',
    styleUrls: ['./ai-image.component.scss'],
    providers: [ChatGPTService, BlogService, DomainService, MyKeysService],
    encapsulation: ViewEncapsulation.None,
})
export class AIImageComponent
    implements OnInit, OnDestroy, AfterContentChecked {
    config: AppConfig;
    user: User;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    permissionDreamina: boolean = false;

    ai: any;

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    domain = 'https://type.vn';
    domains = [];
    alldomain: any[] = [];

    downloadJsonHref: any;
    fileName = '';

    form: UntypedFormGroup;
    imageUrls: any = [];
    loading: boolean = false;

    cols: number;
    // Cấu hình số cột theo độ rộng màn hình (Breakpoints)
    gridByBreakpoint = {
        xl: 10,
        lg: 8,
        md: 6,
        sm: 3,
        xs: 2,
    };

    gridSize = 6; // Mặc định
    rowHeight = 110; // Mặc định
    containerWidth = 800; // Biến lưu độ rộng container
    rows = [];

    referenceFiles: ReferenceFile[] = []; // Lưu trữ ảnh bạn upload lên

    @ViewChild('datatable', { static: false }) datatable: any;

    private unsubscribeLog: () => void;
    private unsubscribeRes: () => void;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * SỰ KIỆN RESIZE: Cần thiết để giao diện phản hồi (Responsive)
     */
    @HostListener('window:resize', ['$event'])
    onResize(event: any) {
        const oldGridSize = this.gridSize;

        // Tính toán lại kích thước lưới
        this.detectGrid();

        // Chỉ "đập đi xây lại" các hàng (rebuildRows) khi số lượng cột THAY ĐỔI
        // Nếu số lượng cột giữ nguyên (chỉ co giãn nhẹ), detectGrid đã tự cập nhật rowHeight rồi.
        if (this.gridSize !== oldGridSize) {
            this.rebuildRows();
        }

        // Cập nhật UI
        this.cd.detectChanges();
    }

    /**
     * TÍNH TOÁN GRID (CỘT & DÒNG)
     * Hàm này chạy 1 lần khi Init và mỗi khi Resize
     */
    detectGrid() {
        const w = window.innerWidth;

        // 1. Tính số cột (Cols) dựa trên Breakpoints
        if (w >= 1280) this.gridSize = this.gridByBreakpoint.xl;
        else if (w >= 1024) this.gridSize = this.gridByBreakpoint.lg;
        else if (w >= 768) this.gridSize = this.gridByBreakpoint.md;
        else if (w >= 480) this.gridSize = this.gridByBreakpoint.sm;
        else this.gridSize = this.gridByBreakpoint.xs;

        // 2. Tính chiều cao dòng (Row Height) để ảnh vuông
        let containerW = w;

        if (
            this.datatable &&
            this.datatable.element &&
            this.datatable.element.clientWidth > 0
        ) {
            // Nếu bảng đã hiện, lấy kích thước thật
            containerW = this.datatable.element.clientWidth;
        } else {
            // Nếu bảng chưa hiện (lúc Init), ước lượng kích thước trừ đi Sidebar & Padding
            // Giả sử sidebar side mode ~280px + padding ~40px
            if (w >= 1024) containerW = w - 320;
            else containerW = w - 32; // Mobile full width trừ padding
        }

        // Tính chiều rộng 1 ô
        const cellWidth = containerW / this.gridSize;

        // Gán chiều cao dòng bằng chiều rộng ô + 14px padding bottom cho thoáng
        this.rowHeight = Math.round(cellWidth) + 14;
    }

    /**
     * Chia danh sách ảnh thành các hàng (rows) cho ngx-datatable
     */
    rebuildRows() {
        this.rows = this.chunkImages(this.imageUrls, this.gridSize);
    }

    chunkImages(list: string[], size: number) {
        const out: any[] = [];
        if (!list) return out;

        for (let i = 0; i < list.length; i += size) {
            const images = list.slice(i, i + size);
            out.push({ images });
        }
        return out;
    }

    // --- CÁC LOGIC KHÁC GIỮ NGUYÊN ---
    getMyKeys() {
        this._voice.getMyKeys({
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        result.data.map((voice: any) => {
                            if (voice.base === 'aistudio.google.com') {
                                if (this.secretKey) {
                                    let geminiKey = this.secretKey[0];
                                    if (voice.api_key) geminiKey = voice.api_key;
                                    this.ai = new GoogleGenAI({ apiKey: geminiKey });
                                }
                            }
                        });
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Tải video thất bại.');
                },
                complete: () => { }
            });
    }

    alldomains() {
        this._domainService
            .fetch({ username: this.user.name })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.domains = result.data;
                        this.domain = this.domains[0];
                        this.alldomain = this.domains;
                        this.cd.markForCheck();
                    }
                },
            });
    }

    onDomainChange(event: any) {
        this.domain = event.value;
    }

    editImage(url: string) {
        const dialogRef = this._matDialog.open(ImageEditorDialogComponent, {
            panelClass: 'custom-dialog',
            maxWidth: '100vw',
            maxHeight: '100vh',
            data: { imageUrl: url, username: this.user.name },
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result && result.success) {
                const base64Content = result.dataUrl.split(',')[1];
                const ext = result.format.split('/')[1];
                const newFileName = `edited_${new Date().getTime()}.${ext}`;

                if ((window as any).electron) {
                    await (window as any).electron.saveBase64({
                        base64: base64Content,
                        fileName: newFileName,
                        username: this.user.name,
                        folder: 'thumbnails',
                    });
                    this.toastr.success('Đã lưu ảnh chỉnh sửa!');
                    this.fetch();
                }
            }
        });
    }

    async handleSaveEditedImage(base64Data: string, format: string) {
        const base64Content = base64Data.split(',')[1];
        const ext = format.split('/')[1];
        const newFileName = `edited_${new Date().getTime()}.${ext}`;
        try {
            if ((window as any).electron) {
                await (window as any).electron.saveBase64({
                    base64: base64Content,
                    fileName: newFileName,
                    username: this.user.name,
                    folder: 'thumbnails',
                });
                this.toastr.success('Lưu ảnh chỉnh sửa thành công!');
                this.fetch();
            } else {
                const link = document.createElement('a');
                link.href = base64Data;
                link.download = newFileName;
                link.click();
            }
        } catch (e) {
            this.toastr.error('Lỗi khi lưu ảnh');
            console.error(e);
        }
    }

    deleteImage(filePath: string, index: number) {
        this.alert({
            title: 'Thông báo',
            message: `Chương trình sẽ xóa tấm hình này?`,
            confirm: 'Xóa ngay',
            cb: () => {
                this._blogService
                    .deleteImage({
                        filePath: filePath,
                        username: this.user.name,
                    })
                    .pipe(takeUntil(this._unsubscribeAll))
                    .subscribe({
                        next: async (result) => {
                            if (result) {
                                this.imageUrls.splice(index, 1);
                                this.rebuildRows();
                                this.toastr.success('Xóa hình ảnh thành công!');
                            }
                        },
                        error: () => {
                            this.toastr.warning('Không xóa được hình ảnh.');
                        },
                    });
            },
        });
    }

    uploadImage(imagePath: string) {
        this._blogService
            .uploadImage({
                imagePath: imagePath,
                domain: this.domain,
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) this.toastr.success('Tải hình ảnh thành công!');
                },
                error: () => {
                    this.toastr.warning('Không tải được hình ảnh.');
                },
            });
    }

    stop() {
        this.loading = false;
        this._chatGPTService
            .stop2025({})
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: () => { },
                error: () => {
                    this.toastr.warning('Không thể dừng tạo hình ảnh.');
                },
                complete: () => {
                    this.toastr.warning('Đã dừng tạo hình ảnh.');
                },
            });
    }

    // Hàm xử lý khi bạn chọn file từ máy tính
    onFileSelected(event: any) {
        const files = event.target.files;
        if (files) {
            for (let file of files) {
                const reader = new FileReader();
                reader.onload = (e: any) => {
                    this.referenceFiles.push({
                        base64Data: e.target.result.split(',')[1],
                        mimeType: file.type,
                        fileName: file.name
                    });
                    this.cd.markForCheck();
                };
                reader.readAsDataURL(file);
            }
        }
    }

    async createImg() {
        const promptValue = this.form.get('prompt')?.value;
        if (!promptValue || this.loading) return;

        this.loading = true;
        const selectedSize = this.form.get('resolution')?.value || "512px";
        const selectedRatio = this.form.get('aspectRatio')?.value || "16:9";
        const modelId = this.form.get('modelId')?.value;

        try {
            // 1. Cấu hình gửi đi chuẩn SDK v2 (@google/genai)
            const generateOptions = {
                model: modelId,
                contents: [{ role: 'user', parts: [{ text: promptValue }] }],
                config: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: {
                        aspectRatio: selectedRatio,
                        imageSize: selectedSize
                    }
                }
            };

            // Thêm ảnh tham chiếu nếu có
            if (this.referenceFiles?.length > 0) {
                this.referenceFiles.forEach(file => {
                    generateOptions.contents[0].parts.push({
                        inlineData: { data: file.base64Data, mimeType: file.mimeType }
                    } as any);
                });
            }

            // 2. Gọi API Banana Pro
            const response = await this.ai.models.generateContent(generateOptions);

            // 3. Rà soát Logic phản hồi
            const candidates = response.candidates;

            // LẤY TOKEN TẠI ĐÂY
            const usage = response.usageMetadata;
            console.log('Token Usage:', usage); // Debug xem có dữ liệu không

            if (candidates?.[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) {
                    let rawBase64 = '';
                    let mimeType = 'image/png'; // Mặc định PNG

                    if (part.inlineData) {
                        rawBase64 = part.inlineData.data;
                        mimeType = part.inlineData.mimeType;
                    } else if ((part as any).image) {
                        rawBase64 = (part as any).image.data;
                        mimeType = (part as any).image.mimeType || 'image/png';
                    }

                    if (rawBase64) {
                        // 1. Tự động tải về máy tính để bạn kiểm tra (dùng full base64 có header)
                        // const fullBase64ForPreview = `data:${mimeType};base64,${rawBase64}`;
                        // this.downloadImage(fullBase64ForPreview, `banana-${Date.now()}.png`);

                        this.toastr.info(`Tiêu tốn: ${usage?.totalTokenCount || 0} tokens`);

                        // 2. LOGIC QUAN TRỌNG: Gửi lên Server
                        await this.processAndUploadImage(rawBase64, mimeType);
                    }
                }

                // reset lại nội dung form và ảnh tham chiếu sau khi tạo xong (nếu muốn)
                // this.referenceFiles = [];
                // this.form.get('prompt')?.setValue('');

                this.toastr.success('Tạo hình ảnh thành công!')
            }
        } catch (err: any) {
            console.error('Lỗi Banana Logic:', err);
            this.toastr.error('Không thể tạo hình ảnh. Vui lòng thử lại.');

            this.loading = false;
            this.cd.markForCheck();
        } finally {
            this.loading = false;
            this.cd.markForCheck();
        }
    }

    /**
     * Hàm hỗ trợ tải ảnh trực tiếp về trình duyệt
     */
    private downloadImage(base64Data: string, fileName: string) {
        const link = document.createElement('a');
        link.href = base64Data;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    downloadImageWithURL(url: string) {
        this.http.get(url, { responseType: 'blob' }).subscribe(
            (blob) => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `${uuid.v4()}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            },
            (error) => {
                console.error('Error downloading:', error);
            },
        );
    }

    // Hàm phụ để xử lý upload giúp code sạch hơn
    async processAndUploadImage(rawBase64: string, mimeType: string) {
        const thumbnail = await Promise.all([
            this._blogService.uploadThumbnailPromise({
                imageData: rawBase64,
                folder: 'thumbnails',
                username: this.user.name,
            }),
        ]);

        // Lưu vào danh sách hiển thị với URL đã upload thành công
        if (thumbnail && thumbnail[0]) {
            thumbnail.forEach((image) => {
                if (image && image['img']) {
                    this.imageUrls.unshift(image['img']);
                    this.rebuildRows();
                    this.form.get('prompt').enable();
                    this.loading = false;
                    this.toastr.success('Tạo hình ảnh thành công!');
                    this.cd.markForCheck();
                } else {
                    this.toastr.warning('Không thể tạo hình ảnh.');
                }
            });
        }
    }

    async createImgWithDreamina(url: string) {
        const uniqueID = Math.random().toString(36).substr(2, 9);
        await (window as any).electron.tools({
            url: url,
            command: 'dreamina.capcut',
            uniqueID,
            username: this.user.name,
            filenamePrefix: 'dream_',
            width: 1600,
            height: 900,
        });
    }

    fetch() {
        this._blogService
            .allFiles({
                username: this.user.name,
                folder: 'thumbnails',
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) this.imageUrls = result.files;
                },
                complete: () => {
                    this.rebuildRows();
                    this.cd.markForCheck();
                },
            });
    }

    readFile = (e: any) => {
        const file: File = e.target.files[0];
        if (file) {
            this.fileName = e.target.files[0].name;
            this._blogService
                .img2text({ file: file, username: this.user.name })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result: any) => {
                        if (result && result.body) {
                            this.imageUrls.push(result.body.url);
                            this.rebuildRows();
                        }
                    },
                    error: () => {
                        this.toastr.error('Không tải hình ảnh được.');
                    },
                    complete: () => {
                        this.toastr.success('Tải hình ảnh xong.');
                    },
                });
        }
    };

    generateDownloadJsonUri() {
        var theJSON = JSON.stringify(this.imageUrls);
        var uri = this.sanitizer.bypassSecurityTrustUrl(
            'data:text/json;charset=UTF-8,' + encodeURIComponent(theJSON),
        );
        this.downloadJsonHref = uri;
    }

    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _chatGPTService: ChatGPTService,
        private _blogService: BlogService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private _domainService: DomainService,
        private sanitizer: DomSanitizer,
        private _formBuilder: UntypedFormBuilder,
        private _matDialog: MatDialog,
        private toastr: ToastrService,
        private http: HttpClient,
        private _voice: MyKeysService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService
    ) {
        this.titleService.setTitle(`tạo hình | ai.type - công cụ tạo content`);

        this.settings = this.multiAccountService.getItem('settings');

        this.secretKey = this.settings.secretKey
            ? this.settings.secretKey.split(';')
            : undefined;
        this.searchAPIKey = this.settings.searchAPIKey
            ? this.settings.searchAPIKey.split(';')
            : undefined;

        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                if (this._userService.permissionDreamina(this.user)) {
                    this.permissionDreamina = true;
                }

                this.getMyKeys();

                if (user.reputation < 2000) {
                    this.error(
                        'Tài khoản của bạn không đủ điều kiện để truy cập!',
                    );
                    return;
                } else {
                    this.fetch();
                    this.alldomains();
                }
            });

        this.unsubscribeRes = (window as any).electron.onToolsResponse(
            (data: {
                action: string;
                success: any;
                cookies: any;
                file: any;
            }) => {
                if (data.action === 'dreamina.capcut') {
                    console.log('data:', data);
                } else {
                    console.error('Lỗi:', data);
                    this.toastr.error('Đã xảy ra lỗi trong quá trình xử lý.');
                }
            },
        );

        this.unsubscribeLog = (window as any).electron.onToolsLog(
            (msg: any) => {
                console.log('Log từ main:', msg);
                if (msg.indexOf('Đã tải') > -1) {
                    this.fetch();
                }
            },
        );
    }

    ngAfterViewInit() {
        // TÍNH TOÁN NGAY KHI KHỞI TẠO (QUAN TRỌNG)
        this.detectGrid();
    }

    ngAfterContentChecked(): void { }

    ngOnInit(): void {
        this.form = this._formBuilder.group({
            prompt: [''],
            resolution: ['512px'], // Mặc định 512px cho rẻ
            aspectRatio: ['9:16'], // Mặc định dọc cho đa dụng
            modelId: ['gemini-3.1-flash-image-preview'], // Mặc định Flash cho nhẹ
            // ... các field cũ của bạn ...
        });
    }

    ngOnDestroy(): void {
        if (this.unsubscribeLog) this.unsubscribeLog();
        if (this.unsubscribeRes) this.unsubscribeRes();
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: alert ? alert.title : 'Hoàn tất!',
            message: alert
                ? alert.message
                : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu.',
            icon: { show: true, name: 'feather:check', color: 'success' },
            actions: {
                confirm: {
                    show: true,
                    label: alert ? alert.confirm : 'Khởi động lại',
                    color: 'primary',
                },
                cancel: { show: true, label: 'Đóng cửa sổ' },
            },
            dismissible: true,
        });
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (alert.cb) alert.cb();
            }
        });
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: message
                ? message
                : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error',
            },
            actions: {
                confirm: { show: true, label: 'Đóng', color: 'warn' },
                cancel: { show: false, label: 'Đóng lại' },
            },
            dismissible: false,
        });
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}
