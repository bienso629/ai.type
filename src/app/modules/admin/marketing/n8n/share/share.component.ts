import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { RemoveHTMLPipe } from "app/app.pipe";
import { N8nService } from 'app/modules/_services/n8n.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CrawlService } from 'app/modules/_services/crawl';

import { HttpClient } from '@angular/common/http';
import { UserService } from 'app/core/user/user.service';

@Component({
    selector: 'amxh-share',
    templateUrl: './share.component.html',
    styleUrls: ['./share.component.scss'],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AMXHShareAppComponent implements OnInit, OnDestroy, OnChanges {
    @Input() data: any;
    shareForm: UntypedFormGroup;
    private removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();
    
    fbPages: any[] = [];
    isFetchingPages: boolean = false;
    searchPageTerm: string = '';

    get filteredFbPages() {
        if (!this.searchPageTerm) return this.fbPages;
        const term = this.searchPageTerm.toLowerCase();
        return this.fbPages.filter(p => p.name.toLowerCase().includes(term) || p.id.includes(term));
    }

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _changeDetectorRef: ChangeDetectorRef,
        private toastr: ToastrService,
        private _n8nService: N8nService,
        private http: HttpClient,
        private multiAccountService: MultiAccountService,
        private sanitizer: DomSanitizer,
        private _crawlService: CrawlService,
        private _userService: UserService
    ) {}

    ngOnInit(): void {
        this.shareForm = this._formBuilder.group({
            title: ['', Validators.required],
            description: [''],
            thumbnail: [''],
            pageIds: [[], Validators.required],
            scheduleTime: [null]
        });
        
        // Lắng nghe thay đổi pageIds để lưu lại
        this.shareForm.get('pageIds').valueChanges.subscribe((selectedIds) => {
            if (selectedIds && selectedIds.length > 0) {
                this.multiAccountService.setItem('fb_selected_pages', selectedIds);
            }
        });
        
        // Load pages từ MultiAccountService nếu có
        const savedPages = this.multiAccountService.getItem('fb_pages');
        if (savedPages) {
            try {
                this.fbPages = typeof savedPages === 'string' ? JSON.parse(savedPages) : savedPages;
                
                // Khôi phục các page đã chọn trước đó
                const savedSelectedPages = this.multiAccountService.getItem('fb_selected_pages');
                if (savedSelectedPages) {
                    const parsedSelected = typeof savedSelectedPages === 'string' ? JSON.parse(savedSelectedPages) : savedSelectedPages;
                    // Lọc những ID có tồn tại trong danh sách fbPages hiện tại
                    const validIds = parsedSelected.filter((id: string) => this.fbPages.some(p => p.id === id));
                    if (validIds.length > 0) {
                        this.shareForm.get('pageIds').setValue(validIds);
                    } else if (this.fbPages.length > 0) {
                        this.shareForm.get('pageIds').setValue([this.fbPages[0].id]);
                    }
                } else if (this.fbPages.length > 0) {
                    this.shareForm.get('pageIds').setValue([this.fbPages[0].id]);
                }
            } catch (e) {}
        }
        
        this.updateFormFromData();

        // Tự động kiểm tra và tạo Workflow trên n8n nếu chưa có
        this._n8nService.setupFacebookWorkflow().subscribe({
            next: (res) => {
                if (res.status === 'created') {
                    this.toastr.success('Đã tự động khởi tạo Workflow Đăng bài Facebook trên n8n!');
                }
            },
            error: (err) => {
                console.warn('Không thể tự động tạo workflow n8n:', err);
            }
        });
    }

    showTokenInput: boolean = false;
    fbTokenInput: string = '';
    private objectUrls: { [key: string]: string } = {};

    fetchFacebookPages(): void {
        if (!this.fbTokenInput) {
            this.toastr.warning('Vui lòng nhập Token trước khi đồng bộ!');
            return;
        }

        this.isFetchingPages = true;
        this.toastr.info('Đang lấy danh sách Fanpage từ Facebook...');
        
        this.http.get(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,category,picture{url}&access_token=${this.fbTokenInput}`).subscribe({
            next: (res: any) => {
                if (res && res.data && res.data.length > 0) {
                    this.fbPages = res.data;
                    this.multiAccountService.setItem('fb_pages', this.fbPages);
                    this.toastr.success(`Đã đồng bộ ${this.fbPages.length} Fanpage thành công!`);
                    
                    if (!this.shareForm.get('pageIds').value || this.shareForm.get('pageIds').value.length === 0) {
                        this.shareForm.get('pageIds').setValue([this.fbPages[0].id]);
                    }
                    this.showTokenInput = false;
                } else {
                    this.toastr.warning('Không tìm thấy Fanpage nào hoặc Token không có quyền!');
                }
                this.isFetchingPages = false;
                this._changeDetectorRef.markForCheck();
            },
            error: (err) => {
                this.toastr.error('Lỗi khi lấy danh sách Fanpage! Vui lòng kiểm tra lại Token.');
                console.error(err);
                this.isFetchingPages = false;
                this._changeDetectorRef.markForCheck();
            }
        });
    }

    toggleTokenInput(): void {
        this.showTokenInput = !this.showTokenInput;
        this._changeDetectorRef.markForCheck();
    }

    openN8n(): void {
        window.open('http://localhost:5678/workflows', '_blank');
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes.data && !changes.data.firstChange) {
            this.updateFormFromData();
        }
    }

    private updateFormFromData() {
        if (!this.data || !this.shareForm) return;

        let descriptionText = this.data.description || '';
        
        // Nếu bài viết có mảng content (done), nối lại thành text sạch
        if (this.data.done && Array.isArray(this.data.done)) {
            const cleanParagraphs = this.data.done.map((p: string) => this.removeHTML.transform(p));
            descriptionText = cleanParagraphs.join('\n\n');
        }

        let thumbnailValue = this.data.thumbnail || '';
        if (Array.isArray(thumbnailValue)) {
            thumbnailValue = thumbnailValue.join('\n');
        }

        this.shareForm.patchValue({
            title: this.data.title || '',
            description: descriptionText,
            thumbnail: thumbnailValue
        });
        
        this._changeDetectorRef.markForCheck();
    }

    ngOnDestroy(): void {
        // Giải phóng bộ nhớ của object URLs
        Object.values(this.objectUrls).forEach(url => {
            try { URL.revokeObjectURL(url); } catch (e) {}
        });
    }

    get thumbnailsList(): string[] {
        if (!this.shareForm) return [];
        const val = this.shareForm.get('thumbnail').value;
        if (!val) return [];
        if (Array.isArray(val)) return val;
        return val.split('\n').filter((p: string) => p.trim() !== '');
    }

    private autoSave(thumbnailStr: string) {
        if (this.data && this.data.uuid) {
            // Must pass all fields and new_version: -1 because backend archiveUpdate expects it
            let username = '';
            this._userService.user$.subscribe(user => {
                if (user && user.name) username = user.name;
            }).unsubscribe();

            this._crawlService.archiveUpdate({
                uuid: this.data.uuid,
                source: this.data.source,
                done: this.data.done,
                title: this.data.title,
                url: this.data.url,
                trash: this.data.trash,
                seo: this.data.seo,
                arr_keyword: this.data.arr_keyword,
                domain: this.data.domain,
                username: username,
                thumbnail: thumbnailStr,
                new_version: -1,
                createdAt: this.data.createdAt
            }).subscribe({
                next: () => {
                    // Cập nhật lại this.data.thumbnail để đồng bộ state
                    this.data.thumbnail = thumbnailStr;
                },
                error: (err) => console.error('Lỗi auto save thumbnail:', err)
            });
        }
    }

    removeThumbnail(index: number) {
        const list = this.thumbnailsList;
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            const newValue = list.join('\n');
            this.shareForm.get('thumbnail').setValue(newValue);
            this.autoSave(newValue);
            this._changeDetectorRef.markForCheck();
        }
    }

    getFileName(fileStr: string): string {
        if (!fileStr) return '';
        if (fileStr.startsWith('local-video:')) {
            const path = fileStr.substring('local-video:'.length);
            return path.split(/[/\\]/).pop();
        }
        if (fileStr.startsWith('memory-video:')) {
            return fileStr.substring('memory-video:'.length);
        }
        if (fileStr.includes('data:')) {
            const match = fileStr.match(/;name=([^;]+);base64,/);
            if (match && match[1]) {
                return decodeURIComponent(match[1]);
            }
            if (fileStr.includes('data:image')) return 'Ảnh đính kèm (Dữ liệu nội bộ)';
            if (fileStr.includes('data:video')) return 'Video đính kèm (Dữ liệu nội bộ)';
            return 'Tệp đính kèm (Dữ liệu nội bộ)';
        }
        return fileStr;
    }

    isImage(file: string): boolean {
        if (!file) return false;
        const cleanFile = file.trim();
        if (cleanFile.includes('data:image')) return true;
        if (cleanFile.startsWith('local-video:') || cleanFile.startsWith('memory-video:')) return false;
        const lower = cleanFile.toLowerCase();
        return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif') || lower.endsWith('.webp');
    }

    isVideo(file: string): boolean {
        if (!file) return false;
        const cleanFile = file.trim();
        if (cleanFile.includes('data:video') || cleanFile.startsWith('local-video:') || cleanFile.startsWith('memory-video:')) return true;
        const lower = cleanFile.toLowerCase();
        return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.mkv') || lower.endsWith('.webm');
    }

    getFileSrc(file: string): SafeUrl {
        if (!file) return '';
        const cleanFile = file.trim();
        if (this.objectUrls[cleanFile]) {
            return this.sanitizer.bypassSecurityTrustUrl(this.objectUrls[cleanFile]);
        }
        if (cleanFile.startsWith('local-video:')) {
            const path = cleanFile.substring('local-video:'.length);
            let safePath = path.replace(/\\/g, '/');
            if (!safePath.startsWith('/')) {
                safePath = '/' + safePath;
            }
            return this.sanitizer.bypassSecurityTrustUrl('file://' + safePath);
        }
        if (cleanFile.startsWith('http://') || cleanFile.startsWith('https://') || cleanFile.includes('data:image') || cleanFile.startsWith('blob:')) {
            return this.sanitizer.bypassSecurityTrustUrl(cleanFile);
        }
        let safePath = cleanFile.replace(/\\/g, '/');
        if (!safePath.startsWith('/')) {
            safePath = '/' + safePath;
        }
        return this.sanitizer.bypassSecurityTrustUrl('file://' + safePath);
    }

    isMemoryFileMissing(fileStr: string): boolean {
        if (!fileStr) return false;
        if (fileStr.startsWith('memory-video:')) {
            const fileName = fileStr.substring('memory-video:'.length);
            return !this.multiAccountService.memoryVideoFiles[fileName];
        }
        return false;
    }

    getSelectedPageNames(): string {
        const selectedIds = this.shareForm?.get('pageIds')?.value || [];
        if (!selectedIds.length) return '';
        const selectedPages = this.fbPages.filter(p => selectedIds.includes(p.id));
        return selectedPages.map(p => p.name).join(', ');
    }

    onThumbnailSelected(event: any) {
        if (event.target.files && event.target.files.length > 0) {
            const files = Array.from(event.target.files);
            
            const processFile = (file: any): Promise<string> => {
                return new Promise((resolve) => {
                    if (file.type && file.type.startsWith('video/')) {
                        // Tránh lưu Base64 của video vào CSDL
                        if (file.path) {
                            resolve(`local-video:${file.path}`);
                        } else {
                            this.multiAccountService.saveMemoryFile(file.name, file);
                            console.log('SAVED MEMORY VIDEO:', file.name, file);
                            resolve(`memory-video:${file.name}`);
                        }
                    } else {
                        const reader = new FileReader();
                        reader.onload = (e: any) => {
                            const result = e.target.result as string;
                            const nameParam = `;name=${encodeURIComponent(file.name)};base64,`;
                            const modifiedResult = result.replace(/;?base64,/, nameParam);
                            resolve(modifiedResult);
                        };
                        reader.readAsDataURL(file);
                    }
                });
            };

            Promise.all(files.map(processFile)).then(base64Strings => {
                const paths = base64Strings.map((b64: string, index: number) => {
                    const file = files[index] as any;
                    const b64Key = b64;
                    if (b64Key.startsWith('memory-video:')) {
                        this.objectUrls[b64Key] = URL.createObjectURL(file);
                    } else if (this.isImage(file.name) || this.isVideo(file.name) || (b64Key.includes('data:video')) || b64Key.startsWith('local-video:')) {
                        this.objectUrls[b64Key] = b64; // Hiển thị base64
                    }
                    return b64Key;
                });
                
                const existingValue = this.shareForm.get('thumbnail').value || '';
                const newValue = existingValue.trim() ? existingValue.trim() + '\n' + paths.join('\n') : paths.join('\n');
                
                this.shareForm.get('thumbnail').setValue(newValue);
                this.autoSave(newValue);
                this.toastr.success(`Đã đính kèm ${files.length} tệp (Mã hóa nội bộ)!`);
                this._changeDetectorRef.markForCheck();
                
                event.target.value = '';
            });
        }
    }

    async submitShare() {
        if (this.shareForm.invalid) {
            this.toastr.warning('Vui lòng điền đủ thông tin bài viết!');
            return;
        }
        
        const data = this.shareForm.value;
        // Chuyển string thumbnail về mảng để n8n dễ lấy
        if (data.thumbnail) {
            if (Array.isArray(data.thumbnail)) {
                data.thumbnail = data.thumbnail.map((p: any) => p?.toString().trim()).filter((p: string) => p !== '');
            } else {
                data.thumbnail = data.thumbnail.split('\n').map((p: string) => p.trim()).filter((p: string) => p !== '');
            }
        } else {
            data.thumbnail = [];
        }

        // Convert everything to FormData to support large video files without base64 memory crash
        const formData = new FormData();
        formData.append('title', data.title || '');
        formData.append('description', data.description || '');

        const selectedPages = this.fbPages.filter(p => data.pageIds.includes(p.id));
        if (selectedPages && selectedPages.length > 0) {
            const pagesPayload = selectedPages.map(p => ({
                id: p.id,
                name: p.name,
                access_token: p.access_token
            }));
            formData.append('pages', JSON.stringify(pagesPayload));
        } else {
            formData.append('pages', '[]');
        }

        let fileIndex = 0;
        if (data.thumbnail && data.thumbnail.length > 0) {
            this.toastr.info('Đang xử lý tệp đính kèm...');
            for (const thumb of data.thumbnail) {
                if (thumb.startsWith('local-video:')) {
                    const filePath = thumb.substring('local-video:'.length);
                    try {
                        let safePath = filePath.replace(/\\/g, '/');
                        if (!safePath.startsWith('/')) safePath = '/' + safePath;
                        const response = await fetch('file://' + safePath);
                        if (!response.ok) throw new Error('Failed to fetch');
                        const blob = await response.blob();
                        const fileName = filePath.split(/[/\\]/).pop();
                        formData.append(`file_${fileIndex}`, blob, fileName);
                        fileIndex++;
                    } catch (e) {
                        this.toastr.error('Không thể đọc file video: ' + filePath);
                    }
                } else if (thumb.startsWith('memory-video:')) {
                    const fileName = thumb.substring('memory-video:'.length);
                    const file = this.multiAccountService.memoryVideoFiles[fileName];
                    console.log('LOOKING UP MEMORY VIDEO:', fileName, 'FOUND:', file);
                    console.log('ALL MEMORY FILES:', this.multiAccountService.memoryVideoFiles);
                    if (!file) {
                        this.toastr.error(`File video "${fileName}" đã bị mất khỏi bộ nhớ tạm do tải lại trang. Vui lòng chọn lại!`);
                        return; // Ngăn chặn tiếp tục submit nếu thiếu file
                    }
                    formData.append(`file_${fileIndex}`, file, fileName);
                    fileIndex++;
                } else if (thumb.startsWith('data:')) {
                    try {
                        const arr = thumb.split(',');
                        const match = arr[0].match(/:(.*?);/);
                        const mime = match ? match[1] : '';
                        const bstr = atob(arr[1]);
                        let n = bstr.length;
                        const u8arr = new Uint8Array(n);
                        while(n--) { u8arr[n] = bstr.charCodeAt(n); }
                        const blob = new Blob([u8arr], {type: mime});
                        
                        let fileName = mime.startsWith('video/') ? `video_${fileIndex}.mp4` : `image_${fileIndex}.png`;
                        const nameMatch = thumb.match(/name=([^;]+)/);
                        if (nameMatch) fileName = decodeURIComponent(nameMatch[1]);
                        
                        formData.append(`file_${fileIndex}`, blob, fileName);
                        fileIndex++;
                    } catch (e) {
                        console.error('Lỗi parse data URI', e);
                    }
                }
            }
        }

        let delay_minutes = 0;
        if (data.scheduleTime) {
            const selectedTime = new Date(data.scheduleTime).getTime();
            const now = new Date().getTime();
            delay_minutes = Math.max(0, Math.floor((selectedTime - now) / 60000));
        }
        data.delay_minutes = delay_minutes;

        if (delay_minutes > 0) {
            this.toastr.info(`Đang lên lịch qua Python Scheduler (chờ ${delay_minutes} phút)...`);
            // Payload cho app.py (FastAPI)
            const schedulePayload = {
                delay_minutes: delay_minutes,
                target_url: this._n8nService.getWebhookUrl('share-facebook'),
                forward_header_name: 'X-N8N-API-KEY',
                forward_header_value: '' // Sẽ dùng mặc định trong .env của Python
            };

            fetch('http://localhost:8080/api/schedule/users-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schedulePayload)
            })
            .then(res => res.json())
            .then(scheduleRes => {
                this.toastr.success(`✅ Đã lên lịch thành công! Mã workflow tạm: ${scheduleRes.workflow_id}`);
            })
            .catch(err => {
                this.toastr.error('Lỗi khi gọi Python Scheduler: ' + err.message);
            });

        } else {
            this.toastr.info('Đang gửi dữ liệu sang n8n webhook...');
            
            // Gửi FormData thay vì data JSON
            this._n8nService.triggerWebhook('share-facebook', formData).subscribe({
                next: (res) => {
                    this.toastr.success('✅ Đã gửi lệnh đăng bài ngay lập tức!');
                },
                error: (err) => {
                    console.error(err);
                    this.toastr.error('Lỗi khi gọi n8n: ' + (err.error?.message || err.message));
                    this.toastr.warning('Vui lòng tạo Node Webhook có path "share-facebook" trên n8n.');
                }
            });
        }
    }
}
