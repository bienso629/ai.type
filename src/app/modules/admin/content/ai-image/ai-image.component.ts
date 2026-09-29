import { Media } from '@capacitor-community/media';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import {
    AfterContentChecked,
    ChangeDetectorRef,
    Component,
    HostListener,
    OnDestroy,
    OnInit,
    ViewChild,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { ChatGPTService } from 'app/_services/chatgpt';
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

import { GenaiService } from 'app/genai.service';
import { HelperService } from 'app/helper.service';

import { MatDialog } from '@angular/material/dialog';
import { ImageEditorDialogComponent } from './tools/image-editor.component';
import { ForumService } from 'app/_services/forum';

import * as uuid from 'uuid';
import { BlogService } from 'app/_services/blog';
import { DomainService } from 'app/_services/domain';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { MyKeysService } from 'app/_services/mykey';
import { WordpressService } from 'app/_services/wordpress';
import {
    embedPromptToImageBase64,
    extractPromptFromImageBytes,
    extractPromptFromImageBase64,
    ImagePromptMetadata,
} from './tools/image-metadata.helper';

interface ReferenceFile {
    base64Data: string;
    mimeType: string;
    fileName: string;
}

@Component({
    selector: 'ai-image',
    templateUrl: './ai-image.component.html',
    styleUrls: ['./ai-image.component.scss'],
    providers: [
        ChatGPTService,
        BlogService,
        DomainService,
        MyKeysService,
        ForumService,
        WordpressService,
    ],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class AIImageComponent
    implements OnInit, OnDestroy, AfterContentChecked
{
    config: AppConfig;
    user: User;
    settings: any;
    secretKey: any;
    searchAPIKey: any;

    permissionDreamina: boolean = false;

    // ai: any;

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    domain: any = 'https://type.vn';
    domains: any[] = [];
    alldomain: any[] = [];

    downloadJsonHref: any;
    fileName = '';

    form: UntypedFormGroup;
    imageUrls: any = [];
    // Danh sach anh Gallery native (base64) - giu lai de khoi bi fetch() ghi de mat
    private nativeGalleryUrls: string[] = [];
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
    selectedImages: Set<string> = new Set<string>();

    isImageSelected(img: string): boolean {
        return this.selectedImages.has(img);
    }

    toggleSelectImage(img: string, event?: MouseEvent): void {
        if (event) {
            event.stopPropagation();
        }
        if (this.selectedImages.has(img)) {
            this.selectedImages.delete(img);
        } else {
            this.selectedImages.add(img);
        }
        this.cd.markForCheck();
    }

    selectAllImages(): void {
        if (!this.imageUrls || this.imageUrls.length === 0) return;
        if (this.selectedImages.size === this.imageUrls.length) {
            this.selectedImages.clear();
        } else {
            this.imageUrls.forEach((img: string) => this.selectedImages.add(img));
        }
        this.cd.markForCheck();
    }

    clearSelectedImages(): void {
        this.selectedImages.clear();
        this.cd.markForCheck();
    }

    deleteSelectedImages(): void {
        const count = this.selectedImages.size;
        if (count === 0) return;

        this.alert({
            title: 'Xác nhận xóa nhiều ảnh',
            message: `Chương trình sẽ xóa vĩnh viễn ${count} hình ảnh/video đã chọn khỏi danh sách và ổ đĩa?`,
            confirm: `Xóa ${count} mục`,
            cb: async () => {
                const toDelete = Array.from(this.selectedImages);
                if ((window as any).electron) {
                    for (const filePath of toDelete) {
                        try {
                            await (window as any).electron.invoke(
                                'delete-local-file',
                                filePath,
                            );
                        } catch (e) {
                            console.error('Failed to delete file via electron', filePath, e);
                        }
                    }
                }

                this.imageUrls = this.imageUrls.filter((img: string) => !this.selectedImages.has(img));
                this.selectedImages.clear();
                this.rebuildRows();
                this.toastr.success(`Đã xóa thành công ${count} mục!`);
                this.cd.markForCheck();
            },
        });
    }

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
        this._voice
            .getMyKeys({
                username: this.user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        result.data.map((voice: any) => {
                            if (voice.base === 'aistudio.google.com') {
                                if (this.secretKey) {
                                    let geminiKey = this.secretKey[0];
                                    // Không cần gán this.ai ở đây nữa vì GenaiService tự lo
                                    // this.ai = new GoogleGenAI({ apiKey: geminiKey });
                                }
                            }
                        });
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Tải video thất bại.');
                },
                complete: () => {},
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
                        this.alldomain = this.domains;
                    }
                    this.domain = this.domains[0];
                    this.cd.markForCheck();
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
            maxHeight: '90vh',
            data: { imageUrl: url, username: this.user.name },
        });

        dialogRef.afterClosed().subscribe(async (result) => {
            if (result && result.success) {
                let base64Content = result.dataUrl.split(',')[1];
                let ext = result.format.split('/')[1];
                let mimeType = result.format;

                if (ext !== 'jpg' && ext !== 'jpeg') {
                    base64Content = await this.convertToJpg(
                        base64Content,
                        mimeType,
                    );
                    ext = 'jpg';
                    mimeType = 'image/jpeg';
                }

                // Nếu có prompt (nhập từ dialog hoặc giữ lại từ ảnh gốc), nhúng vào metadata ảnh
                if (result.prompt) {
                    try {
                        const metadata: ImagePromptMetadata = {
                            prompt: result.prompt,
                            modelId: 'gemini-3.1-flash-image-preview',
                            createdAt: Date.now(),
                        };
                        base64Content = embedPromptToImageBase64(
                            base64Content,
                            mimeType,
                            metadata,
                        );
                    } catch (e) {
                        console.warn('Lỗi nhúng prompt vào ảnh chỉnh sửa:', e);
                    }
                }

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

    async shareImage(imgPath: string) {
        const cleanPath = imgPath.replace('file:///', '');
        const filename = cleanPath.split('/').pop() || 'image.png';
        const ext = filename.split('.').pop()?.toLowerCase() || 'png';

        let mimeType = 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') {
            mimeType = 'image/jpeg';
        } else if (ext === 'webp') {
            mimeType = 'image/webp';
        } else if (ext === 'gif') {
            mimeType = 'image/gif';
        } else if (ext === 'mp4') {
            mimeType = 'video/mp4';
        }

        try {
            const response = await fetch('file:///' + cleanPath);
            const blob = await response.blob();
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const shareText = 'Hãy chia sẻ hình ảnh này lên';

            this._h.openChatGPTWithSEO$.next({
                goiy: shareText,
                attachedFile: {
                    name: filename,
                    type: mimeType,
                    path: cleanPath,
                    base64: base64Data,
                },
            });
        } catch (err) {
            this.toastr.error('Không thể đọc file ảnh để chia sẻ.');
        }
    }

    /**
     * Tái sử dụng prompt từ metadata nhúng trong ảnh (PNG chunk tEXt / JPEG COM)
     */
    async reusePromptFromImage(imagePath: string) {
        try {
            let cleanPath = imagePath
                .replace(/^file:\/\/\//, '')
                .replace(/^file:\/\//, '');

            let meta: ImagePromptMetadata | null = null;

            // 1. Nếu đang chạy trong môi trường Electron, ưu tiên dùng readFileBase64 để đọc trực tiếp file cục bộ
            if ((window as any).electron?.readFileBase64) {
                try {
                    const res = await (window as any).electron.readFileBase64(cleanPath);
                    if (res && res.success && res.base64) {
                        meta = extractPromptFromImageBase64(res.base64);
                    }
                } catch (electronErr) {
                    console.warn('Electron readFileBase64 error, fallback fetch:', electronErr);
                }
            }

            // 2. Dự phòng thử đọc qua fetch
            if (!meta) {
                try {
                    const fetchUrl = cleanPath.startsWith('/') ? 'file://' + cleanPath : 'file:///' + cleanPath;
                    const response = await fetch(fetchUrl);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        meta = extractPromptFromImageBytes(new Uint8Array(arrayBuffer));
                    }
                } catch (fetchErr) {
                    console.warn('Fetch image failed:', fetchErr);
                }
            }

            if (!meta || !meta.prompt) {
                this.toastr.warning('Ảnh này không chứa thông tin metadata prompt.');
                return;
            }

            // Điền lại thông tin vào Form
            if (this.form) {
                this.form.get('prompt')?.setValue(meta.prompt);

                if (meta.modelId && this.form.get('modelId')) {
                    this.form.get('modelId')?.setValue(meta.modelId);
                }

                if (meta.aspectRatio && this.form.get('aspectRatio')) {
                    this.form.get('aspectRatio')?.setValue(meta.aspectRatio);
                }
            }

            // Cuộn lên đầu trang hoặc focus vào ô prompt để người dùng tiện chỉnh sửa
            const promptEl = document.querySelector('textarea[formControlName="prompt"], input[formControlName="prompt"]') as HTMLElement;
            if (promptEl) {
                promptEl.focus();
                promptEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            this.toastr.success('Đã tải prompt từ ảnh vào ô nhập liệu!');
            this.cd.markForCheck();
        } catch (err: any) {
            console.error('Lỗi khi đọc prompt từ ảnh:', err);
            this.toastr.error('Không thể đọc thông tin prompt từ ảnh.');
        }
    }

    async attachToPrompt(imagePath: string) {
        let cleanPath = imagePath
            .replace(/^file:\/\/\//, '')
            .replace(/^file:\/\//, '');
        let filename = cleanPath.split('/').pop() || 'image.png';

        let ext = filename.split('.').pop()?.toLowerCase();
        let mimeType = 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') {
            mimeType = 'image/jpeg';
        } else if (ext === 'webp') {
            mimeType = 'image/webp';
        } else if (ext === 'gif') {
            mimeType = 'image/gif';
        } else if (ext === 'mp4') {
            mimeType = 'video/mp4';
        }

        try {
            const response = await fetch('file:///' + cleanPath);
            const blob = await response.blob();
            const base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            if (!this.referenceFiles) {
                this.referenceFiles = [];
            }

            this.referenceFiles.push({
                base64Data: base64Data,
                mimeType: mimeType,
                fileName: filename,
            });

            this.cd.markForCheck();
        } catch (err) {
            console.error('Không thể đọc file ảnh để đính kèm:', err);
        }
    }

    async handleSaveEditedImage(base64Data: string, format: string) {
        let base64Content = base64Data.split(',')[1];
        let ext = format.split('/')[1];

        if (ext !== 'jpg' && ext !== 'jpeg') {
            base64Content = await this.convertToJpg(base64Content, format);
            ext = 'jpg';
            base64Data = `data:image/jpeg;base64,${base64Content}`;
        }

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
            message: `Chương trình sẽ xóa tấm hình này khỏi danh sách hiển thị?`,
            confirm: 'Xóa ngay',
            cb: async () => {
                if ((window as any).electron) {
                    try {
                        await (window as any).electron.invoke(
                            'delete-local-file',
                            filePath,
                        );
                    } catch (e) {
                        console.error('Failed to delete file via electron', e);
                    }
                }

                this.imageUrls.splice(index, 1);
                this.rebuildRows();
                this.toastr.success('Xóa hình ảnh khỏi danh sách thành công!');
            },
        });
    }

    async uploadImage(imagePath: string) {
        if (this.domain && this.domain.domain) {
            try {
                const response = await fetch('file:///' + imagePath);
                const blob = await response.blob();
                const base64Data = await new Promise<string>(
                    (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const base64 = (reader.result as string).split(
                                ',',
                            )[1];
                            resolve(base64);
                        };
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    },
                );

                this._wordpressService
                    .upload_media(
                        this.domain.domain,
                        base64Data,
                        '',
                        '',
                        this.domain,
                    )
                    .subscribe({
                        next: (res) => {
                            if (res)
                                this.toastr.success('Tải hình ảnh thành công!');
                        },
                        error: () => {
                            this.toastr.warning('Không tải được hình ảnh.');
                        },
                    });
            } catch (err) {
                this.toastr.warning('Không thể đọc file ảnh.');
            }
        } else {
            this._blogService
                .uploadImage({
                    imagePath: imagePath,
                    domain: this.domain,
                    username: this.user.name,
                })
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result)
                            this.toastr.success('Tải hình ảnh thành công!');
                    },
                    error: () => {
                        this.toastr.warning('Không tải được hình ảnh.');
                    },
                });
        }
    }

    stop() {
        this.loading = false;
        this._chatGPTService
            .stop2025({})
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: () => {},
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
                        fileName: file.name,
                    });
                    this.cd.markForCheck();
                };
                reader.readAsDataURL(file);
            }
        }
    }

    getFileExtension(fileName: string): string {
        if (!fileName) return 'FILE';
        const parts = fileName.split('.');
        if (parts.length > 1) {
            const ext = parts[parts.length - 1].toLowerCase();
            return ext.substring(0, 4);
        }
        return 'FILE';
    }

    cleanDomain(domain: string): string {
        if (!domain) return '';
        return domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    }

    onPromptKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            if (event.shiftKey || event.ctrlKey) {
                // Cho phép xuống dòng bình thường
                return;
            }
            // Bấm Enter đơn thuần thì kích hoạt tạo ảnh
            event.preventDefault();
            this.createImg();
        }
    }

    async createImg() {
        const promptValue = this.form.get('prompt')?.value;
        if (!promptValue || this.loading) return;

        this.loading = true;
        const selectedSize = this.form.get('resolution')?.value || '512px';
        const selectedRatio = this.form.get('aspectRatio')?.value || '16:9';
        const modelId = this.form.get('modelId')?.value;

        let qualityTag = '';
        if (modelId === 'gemini-3.1-flash-image-preview') {
            qualityTag = ', chất lượng 1K';
        } else if (modelId === 'imagen-3.0-generate-002') {
            qualityTag = ', chất lượng 2K';
        } else if (modelId === 'gemini-3-pro-image-preview') {
            qualityTag = ', chất lượng 4K';
        }

        const finalPromptText =
            promptValue.trim() +
            (promptValue.toLowerCase().includes('1k') ||
            promptValue.toLowerCase().includes('2k') ||
            promptValue.toLowerCase().includes('4k')
                ? ''
                : qualityTag);

        try {
            // 1. Cấu hình gửi đi chuẩn SDK v2 (@google/genai)
            const generateOptions = {
                model: modelId,
                contents: [
                    { role: 'user', parts: [{ text: finalPromptText }] },
                ],
                config: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: {
                        aspectRatio: selectedRatio,
                    },
                },
            };

            // Thêm ảnh tham chiếu nếu có
            if (this.referenceFiles?.length > 0) {
                this.referenceFiles.forEach((file) => {
                    generateOptions.contents[0].parts.push({
                        inlineData: {
                            data: file.base64Data,
                            mimeType: file.mimeType,
                        },
                    } as any);
                });
            }

            // 2. Gọi API thông qua GenaiService (Routing tự động)
            const response =
                await this._genaiService.generateContent(generateOptions);

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

                        this.toastr.info(
                            `Tiêu tốn: ${usage?.totalTokenCount || 0} tokens`,
                        );

                        // 2. LOGIC QUAN TRỌNG: Gửi lên Server và lưu cục bộ (kèm metadata Prompt)
                        const metadata: ImagePromptMetadata = {
                            prompt: promptValue,
                            modelId: modelId,
                            aspectRatio: selectedRatio,
                            createdAt: Date.now(),
                        };
                        await this.processAndUploadImage(rawBase64, mimeType, metadata);
                    }
                }

                // reset lại nội dung form và ảnh tham chiếu sau khi tạo xong (nếu muốn)
                // this.referenceFiles = [];
                // this.form.get('prompt')?.setValue('');

                this.toastr.success('Tạo hình ảnh thành công!');
            }
        } catch (err: any) {
            console.error('Lỗi Banana Logic:', err);
            this.toastr.error(
                'Lỗi tạo ảnh: ' + (err.message || 'Vui lòng thử lại.'),
            );

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

    private convertToPng(base64: string, mimeType: string): Promise<string> {
        return new Promise((resolve) => {
            if (mimeType === 'image/png') {
                resolve(base64);
                return;
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/png');
                    resolve(dataUrl.split(',')[1]);
                } else {
                    resolve(base64);
                }
            };
            img.onerror = () => resolve(base64);
            img.src = `data:${mimeType};base64,${base64}`;
        });
    }

    private convertToJpg(base64: string, mimeType: string): Promise<string> {
        return new Promise((resolve) => {
            if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
                resolve(base64);
                return;
            }
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                    resolve(dataUrl.split(',')[1]);
                } else {
                    resolve(base64);
                }
            };
            img.onerror = () => resolve(base64);
            img.src = `data:${mimeType};base64,${base64}`;
        });
    }

    // Hàm phụ để xử lý upload giúp code sạch hơn

    /**
     * Lưu ảnh vừa tạo vào Thư viện ảnh (Photos) của thiết bị Native (iPad/Android).
     * Luồng: base64 -> ghi file tạm vào Cache -> savePhoto (Media plugin) -> xóa file tạm.
     */
    private async saveGeneratedImageToPhotos(finalBase64: string, mime: string = 'image/png'): Promise<void> {
        if (!Capacitor.isNativePlatform()) {
            return;
        }
        try {
            // Chuẩn hóa base64 thuần (bỏ header data URL nếu có)
            let pureBase64 = finalBase64;
            const commaIdx = finalBase64.indexOf(',');
            if (finalBase64.startsWith('data:') && commaIdx > -1) {
                pureBase64 = finalBase64.substring(commaIdx + 1);
            }

            const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : 'png';
            const fileName = `aitype_${Date.now()}.${ext}`;

            // Ghi file tạm vào bộ nhớ Cache của app
            const written = await Filesystem.writeFile({
                path: fileName,
                data: pureBase64,
                directory: Directory.Cache,
                recursive: true,
            });

            // Yêu cầu plugin Media lưu vào Photos (addOnly permission)
            await (Media as any).savePhoto({ path: written.uri });

            // Dọn file tạm
            try {
                await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache });
            } catch (e) {
                // ignore cleanup error
            }
        } catch (saveErr) {
            console.warn('Không thể lưu ảnh vào Photos:', saveErr);
        }
    }

    async processAndUploadImage(
        rawBase64: string,
        mimeType: string,
        metadata?: ImagePromptMetadata
    ) {
        let finalBase64 = rawBase64;
        let finalMime = mimeType;

        // Nhúng metadata (prompt, model, aspectRatio,...) trực tiếp vào ảnh
        // embedPromptToImageBase64 tự động phân tích magic bytes (PNG tEXt chunk hoặc JPEG COM marker)
        if (metadata) {
            try {
                finalBase64 = embedPromptToImageBase64(
                    finalBase64,
                    finalMime,
                    metadata
                );
            } catch (embedErr) {
                console.warn('Lỗi nhúng metadata prompt vào ảnh:', embedErr);
            }
        }

        // Lưu vào Photos của thiết bị (iPad/Android) ngay khi tạo xong
        this.saveGeneratedImageToPhotos(finalBase64, finalMime);

        try {
            const thumbnail = await Promise.all([
                this._blogService.uploadThumbnailPromise({
                    imageData: finalBase64,
                    folder: 'thumbnails',
                    username: this.user.name,
                    ext: 'png',
                    mimeType: 'image/png',
                }),
            ]);

            // Lưu vào danh sách hiển thị với URL đã upload thành công
            if (thumbnail && thumbnail[0]) {
                thumbnail.forEach((image) => {
                    if (image && image['img']) {
                        this.imageUrls.unshift(image['img']);
                        this.rebuildRows();
                        this.form.get('prompt')?.enable();
                        this.loading = false;
                        this.toastr.success('Tạo hình ảnh thành công!');
                        this.cd.markForCheck();
                    } else {
                        this.toastr.warning('Không thể tạo hình ảnh.');
                    }
                });
            }
        } catch (uploadErr) {
            console.warn('Không thể upload ảnh lên local daemon, hiển thị ảnh tạm thời trên trình duyệt.', uploadErr);
            // Fallback: Hiển thị trực tiếp base64 lên giao diện
            const base64Url = `data:${finalMime || 'image/png'};base64,${finalBase64}`;
            if (!this.imageUrls) this.imageUrls = [];
            this.imageUrls.unshift(base64Url);
            this.rebuildRows();
            this.form.get('prompt')?.enable();
            this.loading = false;
            this.toastr.success('Tạo hình ảnh thành công (đã lưu tạm trên trình duyệt)!');
            this.cd.markForCheck();
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
                    // Giu nguyen anh Gallery native va gop them anh server vao sau
                    const serverFiles: string[] = (result && result.files) ? result.files : [];
                    this.imageUrls = [...this.nativeGalleryUrls, ...serverFiles];
                },
                complete: () => {
                    this.rebuildRows();
                    this.cd.markForCheck();
                    setTimeout(() => {
                        if (this.datatable) {
                            this.datatable.recalculate();
                            this.detectGrid();
                            this.rebuildRows();
                            this.cd.detectChanges();
                        }
                    }, 100);
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
        private multiAccountService: MultiAccountService,
        private _genaiService: GenaiService,
        private _forumService: ForumService,
        private _h: HelperService,
        private _wordpressService: WordpressService,
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

                this.fetch();
                this.alldomains();
            });

        if ((window as any).electron) {
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
        ); }

        if ((window as any).electron) {
            this.unsubscribeLog = (window as any).electron.onToolsLog(
            (msg: any) => {
                console.log('Log từ main:', msg);
                if (msg.indexOf('Đã tải') > -1) {
                    this.fetch();
                }
            },
        ); }
    }

    ngAfterViewInit() {
        // TÍNH TOÁN NGAY KHI KHỞI TẠO (QUAN TRỌNG)
        this.detectGrid();
        setTimeout(() => {
            if (this.datatable) {
                this.datatable.recalculate();
                this.detectGrid();
                this.rebuildRows();
                this.cd.detectChanges();
            }
        }, 150);
    }

    ngAfterContentChecked(): void {}

    
    async loadNativeGallery() {
        if (!Capacitor.isNativePlatform()) {
            // Khong chay tren web/desktop
            return;
        }

        try {
            // Luu y: plugin iOS KHONG co method requestPermissions.
            // getMedias() tu dong hien popup xin quyen neu chua duoc cap.
            const mediaResponse = await Media.getMedias({
                quantity: 200, // Lay 200 tam gan nhat
                thumbnailWidth: 512,
                thumbnailHeight: 512,
                thumbnailQuality: 80,
                types: 'photos',
                sort: [{ key: 'creationDate', ascending: false }]
            });

            const medias = mediaResponse?.medias || [];
            if (medias.length > 0) {
                const galleryUrls: string[] = [];
                medias.forEach((m: any) => {
                    if (m.data) {
                        galleryUrls.push(`data:image/jpeg;base64,${m.data}`);
                    }
                });

                // Danh dau kho native de khong bi fetch() tu server ghi de mat
                this.nativeGalleryUrls = galleryUrls;

                // Gop: gallery native dung dau, anh server o sau
                this.imageUrls = [...this.nativeGalleryUrls, ...this.imageUrls.filter((u: string) => !u.startsWith('data:image/jpeg;base64,'))];

                this.rebuildRows();
                this.cd.detectChanges();
            }
            // Silent success/empty - khong toast tru khi loi

        } catch (err: any) {
            // Nguoi tu choi quyen hoac loi khac - chi ghi log, khong lam don giao dien
            console.error('loadNativeGallery error:', err);
        }
    }

    
    resolveMediaSrc(url: string): string {
        if (!url) return '';
        if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) {
            return url;
        }
        return 'file:///' + url;
    }

    ngOnInit(): void {
        this.loadNativeGallery();
        this.form = this._formBuilder.group({
            prompt: [''],
            aspectRatio: ['16:9'],
            modelId: ['imagen-3.0-generate-002'],
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
            title: alert && alert.title ? alert.title : 'Hoàn tất!',
            message:
                alert && alert.message
                    ? alert.message
                    : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu.',
            icon: { show: true, name: 'feather:check', color: 'success' },
            actions: {
                confirm: {
                    show: true,
                    label: alert && alert.confirm ? alert.confirm : 'Đồng ý',
                    color: 'primary',
                },
                cancel: { show: true, label: 'Đóng' },
            },
            dismissible: true,
        });
        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (alert && alert.cb) alert.cb();
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
