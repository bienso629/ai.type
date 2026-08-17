import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import JSZip from 'jszip';
import { FontService, ActiveAppFontGroup, ActiveFontVariant } from 'app/_services/font.service';

export interface AppFontItem {
    fileName: string;
    fontName: string;
    filePath?: string;
    folderName: string;
    extension: string;
    sizeFormatted: string;
    dataUrl?: string;
}

export interface AppFontGroup {
    folderName: string;
    folderPath?: string;
    fonts: AppFontItem[];
}

@Component({
    selector: 'settings-font',
    templateUrl: './font.component.html',
    styleUrls: ['./font.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsFontComponent implements OnInit, OnDestroy {
    fontGroups: AppFontGroup[] = [];
    totalFonts: number = 0;
    fontsDir: string = 'Documents/ai.type/fonts';
    isLoading: boolean = false;
    isUploading: boolean = false;

    activeFontGroup: ActiveAppFontGroup | null = null;

    get activeFont(): ActiveAppFontGroup | null {
        return this.activeFontGroup;
    }

    get fonts(): AppFontItem[] {
        return this.fontGroups.flatMap(g => g.fonts);
    }

    private _unsubscribeAll: Subject<any> = new Subject<any>();
    private _injectedFontStyles: Map<string, HTMLStyleElement> = new Map();

    constructor(
        private _changeDetectorRef: ChangeDetectorRef,
        private toastr: ToastrService,
        public fontService: FontService
    ) {}

    ngOnInit(): void {
        this.activeFontGroup = this.fontService.getActiveFontGroup();
        this.loadFonts();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    async loadFonts(): Promise<void> {
        this.isLoading = true;
        this.activeFontGroup = this.fontService.getActiveFontGroup();
        this._changeDetectorRef.markForCheck();

        try {
            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('fonts:list');
                if (res && res.success) {
                    this.fontGroups = res.groups || [];
                    this.totalFonts = res.totalFonts || 0;
                    if (res.fontsDir) {
                        this.fontsDir = res.fontsDir;
                    }
                    this.registerAllFontFaces(this.fontGroups);
                } else {
                    this.fontGroups = [];
                    this.totalFonts = 0;
                }
            } else {
                // Browser fallback with LocalStorage
                const saved = localStorage.getItem('ai_type_web_font_groups');
                if (saved) {
                    try {
                        this.fontGroups = JSON.parse(saved);
                        this.totalFonts = this.fontGroups.reduce((acc, g) => acc + g.fonts.length, 0);
                        this.registerAllFontFaces(this.fontGroups);
                    } catch (e) {
                        this.fontGroups = [];
                        this.totalFonts = 0;
                    }
                }
            }
        } catch (e: any) {
            console.error('Lỗi khi nạp danh sách font:', e);
            this.toastr.error('Không thể nạp danh sách font chữ.');
        } finally {
            this.isLoading = false;
            this._changeDetectorRef.markForCheck();
        }
    }

    registerAllFontFaces(groups: AppFontGroup[]): void {
        for (const group of groups) {
            for (const item of group.fonts) {
                if (!item.dataUrl || this._injectedFontStyles.has(item.fontName)) {
                    continue;
                }
                try {
                    const styleEl = document.createElement('style');
                    styleEl.setAttribute('id', `font-face-${item.fontName.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
                    let format = 'truetype';
                    if (item.extension === '.otf') format = 'opentype';
                    else if (item.extension === '.woff') format = 'woff';
                    else if (item.extension === '.woff2') format = 'woff2';

                    styleEl.appendChild(document.createTextNode(`
                        @font-face {
                            font-family: '${item.fontName}';
                            src: url('${item.dataUrl}') format('${format}');
                            font-weight: normal;
                            font-style: normal;
                        }
                    `));
                    document.head.appendChild(styleEl);
                    this._injectedFontStyles.set(item.fontName, styleEl);
                } catch (err) {
                    console.warn('Lỗi khi inject font-face:', item.fontName, err);
                }
            }
        }
    }

    /**
     * Áp dụng TRỌN BỘ FONT (bao gồm tất cả các biến thể: In đậm, In nghiêng, Thường...) cho phần mềm
     */
    applyGroupFont(group: AppFontGroup): void {
        if (!group.fonts || group.fonts.length === 0) return;

        const variants: ActiveFontVariant[] = group.fonts.map(f => ({
            fileName: f.fileName,
            fontName: f.fontName,
            extension: f.extension,
            fontWeight: this.fontService.detectFontWeight(f.fontName),
            fontStyle: this.fontService.detectFontStyle(f.fontName),
            dataUrl: f.dataUrl,
            filePath: f.filePath
        }));

        const activeGroupData: ActiveAppFontGroup = {
            folderName: group.folderName,
            variants: variants
        };

        this.fontService.applyFontGroupToApp(activeGroupData);
        this.activeFontGroup = activeGroupData;
        this.toastr.success(`Đã áp dụng trọn bộ font "${group.folderName}" (gồm ${variants.length} kiểu chữ: Đậm, Thường, Nghiêng...) cho phần mềm!`);
        this._changeDetectorRef.markForCheck();
    }

    onZipFileSelected(event: any): void {
        const files: FileList = event.target.files;
        if (!files || files.length === 0) return;

        const zipFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.zip'));
        if (zipFiles.length === 0) {
            this.toastr.warning('Vui lòng chọn ít nhất một file nén định dạng .ZIP!');
            return;
        }

        this.importZipFiles(zipFiles);
        event.target.value = '';
    }

    async importZipFiles(files: File[]): Promise<void> {
        this.isUploading = true;
        this.toastr.info(`Đang giải nén ${files.length} file ZIP font chữ...`, 'Import Font ZIP');
        this._changeDetectorRef.markForCheck();

        let successFolders = 0;
        let totalImportedCount = 0;

        for (const file of files) {
            try {
                const zipName = file.name.replace(/\.zip$/i, '').trim();
                const arrayBuffer = await file.arrayBuffer();

                if ((window as any).electron && (window as any).electron.invoke) {
                    const base64 = this.arrayBufferToBase64(arrayBuffer);
                    const res = await (window as any).electron.invoke('fonts:import-zip', {
                        zipName: zipName,
                        base64Data: base64
                    });
                    if (res && res.success) {
                        successFolders++;
                        totalImportedCount += (res.count || 0);
                    }
                } else {
                    const zip = new JSZip();
                    const contents = await zip.loadAsync(arrayBuffer);
                    const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
                    const extractedFonts: AppFontItem[] = [];

                    for (const [relativePath, fileObj] of Object.entries(contents.files)) {
                        if (!fileObj.dir) {
                            const ext = relativePath.substring(relativePath.lastIndexOf('.')).toLowerCase();
                            if (fontExtensions.includes(ext)) {
                                const fontName = relativePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Font';
                                const fileName = relativePath.split('/').pop() || `${fontName}${ext}`;
                                const buf = await fileObj.async('arraybuffer');
                                const b64 = this.arrayBufferToBase64(buf);
                                let mime = 'font/ttf';
                                if (ext === '.otf') mime = 'font/otf';
                                else if (ext === '.woff') mime = 'font/woff';
                                else if (ext === '.woff2') mime = 'font/woff2';

                                extractedFonts.push({
                                    fileName: fileName,
                                    fontName: fontName,
                                    folderName: zipName,
                                    extension: ext,
                                    sizeFormatted: (buf.byteLength / 1024).toFixed(1) + ' KB',
                                    dataUrl: `data:${mime};base64,${b64}`
                                });
                            }
                        }
                    }

                    if (extractedFonts.length > 0) {
                        let group = this.fontGroups.find(g => g.folderName === zipName);
                        if (!group) {
                            group = { folderName: zipName, fonts: [] };
                            this.fontGroups.push(group);
                        }
                        group.fonts.push(...extractedFonts);
                        successFolders++;
                        totalImportedCount += extractedFonts.length;
                    }
                }
            } catch (e) {
                console.error('Lỗi giải nén ZIP file:', file.name, e);
            }
        }

        if (successFolders > 0) {
            if (!(window as any).electron?.invoke) {
                localStorage.setItem('ai_type_web_font_groups', JSON.stringify(this.fontGroups));
            }
            this.toastr.success(`Đã nhập thành công ${totalImportedCount} font chữ vào ${successFolders} thư mục riêng!`);
            await this.loadFonts();
        } else {
            this.toastr.error('Lỗi hoặc không tìm thấy file font trong các file ZIP đã chọn!');
        }

        this.isUploading = false;
        this._changeDetectorRef.markForCheck();
    }

    onFontFilesSelected(event: any): void {
        const files: FileList = event.target.files;
        if (!files || files.length === 0) return;
        this.importSingleFontFiles(Array.from(files));
        event.target.value = '';
    }

    async importSingleFontFiles(files: File[]): Promise<void> {
        this.isUploading = true;
        this._changeDetectorRef.markForCheck();
        let successCount = 0;
        const targetFolderName = 'Mặc định';

        for (const file of files) {
            const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
            const fontExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
            if (!fontExtensions.includes(ext)) continue;

            try {
                const arrayBuffer = await file.arrayBuffer();
                const b64 = this.arrayBufferToBase64(arrayBuffer);

                if ((window as any).electron && (window as any).electron.invoke) {
                    const res = await (window as any).electron.invoke('fonts:import-file', {
                        folderName: targetFolderName,
                        fileName: file.name,
                        base64Data: b64
                    });
                    if (res && res.success) successCount++;
                } else {
                    let mime = 'font/ttf';
                    if (ext === '.otf') mime = 'font/otf';
                    else if (ext === '.woff') mime = 'font/woff';
                    else if (ext === '.woff2') mime = 'font/woff2';

                    const fontName = file.name.replace(/\.[^/.]+$/, '');
                    let group = this.fontGroups.find(g => g.folderName === targetFolderName);
                    if (!group) {
                        group = { folderName: targetFolderName, fonts: [] };
                        this.fontGroups.push(group);
                    }
                    group.fonts.push({
                        fileName: file.name,
                        fontName: fontName,
                        folderName: targetFolderName,
                        extension: ext,
                        sizeFormatted: (file.size / 1024).toFixed(1) + ' KB',
                        dataUrl: `data:${mime};base64,${b64}`
                    });
                    successCount++;
                }
            } catch (e) {
                console.error('Lỗi nạp font file:', file.name, e);
            }
        }

        if (successCount > 0) {
            this.toastr.success(`Đã thêm thành công ${successCount} font chữ!`);
            if (!(window as any).electron?.invoke) {
                localStorage.setItem('ai_type_web_font_groups', JSON.stringify(this.fontGroups));
            }
            await this.loadFonts();
        } else {
            this.toastr.warning('Không có file font (.ttf, .otf, .woff, .woff2) nào hợp lệ!');
        }
        this.isUploading = false;
        this._changeDetectorRef.markForCheck();
    }

    async deleteFolderGroup(group: AppFontGroup): Promise<void> {
        if (!confirm(`Bạn có chắc chắn muốn xóa toàn bộ thư mục font "${group.folderName}" và ${group.fonts.length} font chữ bên trong?`)) {
            return;
        }

        try {
            if (this.activeFontGroup?.folderName === group.folderName) {
                this.fontService.clearActiveFont();
                this.activeFontGroup = null;
            }

            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('fonts:delete-folder', {
                    folderName: group.folderName,
                    folderPath: group.folderPath
                });
                if (res && res.success) {
                    this.toastr.success(`Đã xóa thư mục font "${group.folderName}"`);
                }
            } else {
                this.fontGroups = this.fontGroups.filter(g => g.folderName !== group.folderName);
                localStorage.setItem('ai_type_web_font_groups', JSON.stringify(this.fontGroups));
                this.toastr.success(`Đã xóa thư mục font "${group.folderName}"`);
            }

            for (const item of group.fonts) {
                const injectedStyle = this._injectedFontStyles.get(item.fontName);
                if (injectedStyle) {
                    injectedStyle.remove();
                    this._injectedFontStyles.delete(item.fontName);
                }
            }

            await this.loadFonts();
        } catch (e: any) {
            this.toastr.error('Lỗi khi xóa thư mục font');
        }
    }

    async deleteFontFile(item: AppFontItem): Promise<void> {
        try {
            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('fonts:delete-file', {
                    filePath: item.filePath,
                    fileName: item.fileName,
                    folderName: item.folderName
                });
                if (res && res.success) {
                    this.toastr.success(`Đã xóa font ${item.fontName}`);
                }
            } else {
                for (const g of this.fontGroups) {
                    g.fonts = g.fonts.filter(f => f.fileName !== item.fileName);
                }
                this.fontGroups = this.fontGroups.filter(g => g.fonts.length > 0);
                localStorage.setItem('ai_type_web_font_groups', JSON.stringify(this.fontGroups));
                this.toastr.success(`Đã xóa font ${item.fontName}`);
            }

            const injectedStyle = this._injectedFontStyles.get(item.fontName);
            if (injectedStyle) {
                injectedStyle.remove();
                this._injectedFontStyles.delete(item.fontName);
            }

            await this.loadFonts();

            // Nếu đang dùng bộ font này, cập nhật lại biến thể
            if (this.activeFontGroup?.folderName === item.folderName) {
                const updatedGroup = this.fontGroups.find(g => g.folderName === item.folderName);
                if (updatedGroup && updatedGroup.fonts.length > 0) {
                    this.applyGroupFont(updatedGroup);
                } else {
                    this.fontService.clearActiveFont();
                    this.activeFontGroup = null;
                }
            }
        } catch (e: any) {
            this.toastr.error('Lỗi khi xóa font chữ');
        }
    }

    copyFontName(name: string): void {
        navigator.clipboard.writeText(name);
        this.toastr.info(`Đã chép tên font "${name}" vào clipboard`);
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
