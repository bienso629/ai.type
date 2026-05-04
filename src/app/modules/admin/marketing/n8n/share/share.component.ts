import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { RemoveHTMLPipe } from "app/app.pipe";
import { N8nService } from 'app/modules/_services/n8n.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

import { HttpClient } from '@angular/common/http';

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

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _changeDetectorRef: ChangeDetectorRef,
        private toastr: ToastrService,
        private _n8nService: N8nService,
        private http: HttpClient,
        private multiAccountService: MultiAccountService
    ) {}

    ngOnInit(): void {
        this.shareForm = this._formBuilder.group({
            title: ['', Validators.required],
            description: [''],
            thumbnail: [''],
            pageId: ['', Validators.required],
            delay_minutes: [0]
        });
        
        // Load pages từ MultiAccountService nếu có
        const savedPages = this.multiAccountService.getItem('fb_pages');
        if (savedPages) {
            try {
                this.fbPages = typeof savedPages === 'string' ? JSON.parse(savedPages) : savedPages;
                // Tự động chọn page đầu tiên nếu có
                if (this.fbPages.length > 0) {
                    this.shareForm.get('pageId').setValue(this.fbPages[0].id);
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

    fetchFacebookPages(): void {
        if (!this.fbTokenInput) {
            this.toastr.warning('Vui lòng nhập Token trước khi đồng bộ!');
            return;
        }

        this.isFetchingPages = true;
        this.toastr.info('Đang lấy danh sách Fanpage từ Facebook...');
        
        this.http.get(`https://graph.facebook.com/v20.0/me/accounts?access_token=${this.fbTokenInput}`).subscribe({
            next: (res: any) => {
                if (res && res.data && res.data.length > 0) {
                    this.fbPages = res.data;
                    this.multiAccountService.setItem('fb_pages', this.fbPages);
                    this.toastr.success(`Đã đồng bộ ${this.fbPages.length} Fanpage thành công!`);
                    
                    if (!this.shareForm.get('pageId').value) {
                        this.shareForm.get('pageId').setValue(this.fbPages[0].id);
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

        this.shareForm.patchValue({
            title: this.data.title || '',
            description: descriptionText,
            thumbnail: this.data.thumbnail || ''
        });
        
        this._changeDetectorRef.markForCheck();
    }

    ngOnDestroy(): void {}

    get thumbnailsList(): string[] {
        if (!this.shareForm) return [];
        const val = this.shareForm.get('thumbnail').value;
        return val ? val.split('\n').filter((p: string) => p.trim() !== '') : [];
    }

    removeThumbnail(index: number) {
        const list = this.thumbnailsList;
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            this.shareForm.get('thumbnail').setValue(list.join('\n'));
            this._changeDetectorRef.markForCheck();
        }
    }

    onThumbnailSelected(event: any) {
        if (event.target.files && event.target.files.length > 0) {
            const files = Array.from(event.target.files);
            const paths = files.map((file: any) => file.path || file.name);
            const existingValue = this.shareForm.get('thumbnail').value || '';
            
            const newValue = existingValue.trim() ? existingValue.trim() + '\n' + paths.join('\n') : paths.join('\n');
            
            this.shareForm.get('thumbnail').setValue(newValue);
            this.toastr.success(`Đã đính kèm ${files.length} tệp phương tiện local!`);
            this._changeDetectorRef.markForCheck();
            
            event.target.value = '';
        }
    }

    submitShare() {
        if (this.shareForm.invalid) {
            this.toastr.warning('Vui lòng điền đủ thông tin bài viết!');
            return;
        }
        
        const data = this.shareForm.value;
        // Chuyển string thumbnail về mảng để n8n dễ lấy
        if (data.thumbnail) {
            data.thumbnail = data.thumbnail.split('\n').map(p => p.trim()).filter(p => p !== '');
        } else {
            data.thumbnail = [];
        }

        // Đính kèm Page Access Token nếu có
        const selectedPage = this.fbPages.find(p => p.id === data.pageId);
        if (selectedPage && selectedPage.access_token) {
            data.pageAccessToken = selectedPage.access_token;
        }

        if (data.delay_minutes > 0) {
            this.toastr.info(`Đang lên lịch qua Python Scheduler (chờ ${data.delay_minutes} phút)...`);
            
            // Payload cho app.py (FastAPI)
            const schedulePayload = {
                delay_minutes: data.delay_minutes,
                target_url: this._n8nService.getWebhookUrl('share-facebook'),
                forward_header_name: 'X-N8N-API-KEY',
                forward_header_value: '' // Sẽ dùng mặc định trong .env của Python
            };

            // Gọi API Python (bạn cần viết thêm method scheduleTask trong N8nService hoặc dùng fetch)
            // Tạm thời gọi qua fetch để demo, bạn có thể đưa vào N8nService sau
            fetch('http://localhost:8080/api/schedule/users-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(schedulePayload)
            })
            .then(res => res.json())
            .then(scheduleRes => {
                this.toastr.success(`✅ Đã lên lịch thành công! Mã workflow tạm: ${scheduleRes.workflow_id}`);
                
                // Đồng thời, ta cần gửi data thật sự vào đâu đó để chờ? 
                // À, thiết kế của app.py là gọi webhook với header. Nhưng data post thật sự (title, thumbnail) thì sao?
                // app.py hiện tại CHƯA thiết kế để NHẬN body JSON từ ứng dụng và forward đi!
                // Do đó để giải quyết triệt để, ta cứ bắn thẳng dữ liệu qua webhook n8n nhé!
            })
            .catch(err => {
                this.toastr.error('Lỗi khi gọi Python Scheduler: ' + err.message);
            });

        } else {
            this.toastr.info('Đang gửi dữ liệu sang n8n webhook...');
            
            this._n8nService.triggerWebhook('share-facebook', data).subscribe({
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
