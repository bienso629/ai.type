import { AfterContentInit, AfterViewInit, Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FuseMediaWatcherService } from '@fuse/services/media-watcher';
import { FuseNavigationService, FuseVerticalNavigationComponent } from '@fuse/components/navigation';
import { Navigation } from 'app/core/navigation/navigation.types';
import { NavigationService } from 'app/core/navigation/navigation.service';
import { AnimationMode, Direction } from '@ecodev/fab-speed-dial';

import { FuseConfirmationService } from '@fuse/services/confirmation';
import { HelpComponent } from 'app/modules/microsites/help/help.component';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { NgIf } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ChangeDetectorRef } from '@angular/core';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { AuthUtils } from 'app/core/auth/auth.utils';

import { UserClientService } from 'app/modules/_services/user';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { TranslocoModule } from '@ngneat/transloco';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
    selector: 'app-bug-report-dialog',
    standalone: true,
    imports: [TranslocoModule, MatTooltipModule, MatTooltipModule, TranslocoModule, FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDialogModule, MatIconModule, NgIf],
    template: `
        <div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
            <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:mail'"></mat-icon>
            <mat-label class="self-center">Góp ý báo lỗi</mat-label>
        </div>

        <div mat-dialog-content class="mt-4 p-0">
            <p class="text-blue-500 font-semibold mb-4 text-sm">Mô tả lỗi hoặc góp ý của bạn. Trình duyệt sẽ mở ứng dụng mail mặc định để gửi.</p>
            <div *ngIf="data.screenshotPath" class="mb-4 text-xs text-blue-600 bg-blue-50 p-2 rounded break-all">
                Ảnh chụp màn hình đã lưu tại: {{ data.screenshotPath }}. Vui lòng đính kèm file này vào email nếu cần.
            </div>
            
            <mat-form-field class="w-full mb-3 fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Tiêu đề</mat-label>
                <input matInput [(ngModel)]="subject" placeholder="Nhập tiêu đề">
            </mat-form-field>
            
            <mat-form-field class="w-full mb-3 custom-textarea fuse-mat-dense fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
                <mat-label>Nội dung</mat-label>
                <textarea class="max-h-60 min-h-20 px-2" matInput [(ngModel)]="content" placeholder="Nhập nội dung báo lỗi..."></textarea>
            </mat-form-field>
        </div>

        <div mat-dialog-actions class="p-0 mt-4 flex justify-end gap-2">
            <button mat-flat-button color="medium" mat-dialog-close>Đóng cửa sổ</button>
            <button mat-flat-button color="primary" (click)="sendEmail()" [disabled]="isSending">
                {{ isSending ? 'Đang gửi...' : 'Gửi Email' }}
            </button>
        </div>
    `,
    styles: [
        `.custom-textarea .mat-mdc-text-field-wrapper { padding-top: 0 !important; }`
    ]
})
export class BugReportDialogComponent {
    subject: string = '';
    content: string = '';
    isSending: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<BugReportDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService
    ) {}

    async sendEmail() {
        if (!this.subject || !this.content) {
            this.toastr.warning('Vui lòng nhập đầy đủ tiêu đề và nội dung');
            return;
        }

        this.isSending = true;
        let fullContent = this.content;
        if (this.data.user) {
            fullContent += `<br><br>---<br>Người báo cáo: ${this.data.user.name || 'Ẩn danh'} (${this.data.user.email || 'N/A'})`;
        }
        if (this.data.screenshotPath) {
            fullContent += `<br>Ảnh đính kèm: ${this.data.screenshotPath}`;
        }

        const settings = this.data.settings || {};
        const emailConfig = {
            nodebbUrl: settings.emailConfig_nodebbUrl || 'https://type.vn',
            nodebbToken: settings.emailConfig_nodebbToken || '',
            smtpHost: settings.emailConfig_smtpHost || 'smtp.gmail.com',
            smtpPort: parseInt(settings.emailConfig_smtpPort || '587', 10),
            smtpUser: settings.emailConfig_smtpUser || '',
            smtpPass: settings.emailConfig_smtpPass || ''
        };

        if (!emailConfig.smtpUser || !emailConfig.smtpPass) {
            this.toastr.error('Bạn chưa cấu hình SMTP trong phần Cài đặt.');
            this.isSending = false;
            return;
        }

        try {
            if ((window as any).electronAPI && (window as any).electronAPI.sendMassEmails) {
                const result = await (window as any).electronAPI.sendMassEmails({
                    senderName: this.data.user?.name || 'User Báo Lỗi',
                    subject: '[Báo Lỗi] ' + this.subject,
                    htmlContent: fullContent,
                    users: [{ email: 'typevn@gmail.com', username: 'Ban Quản Trị' }],
                    config: emailConfig
                });

                if (result && result.success) {
                    this.toastr.success('Gửi báo lỗi thành công!');
                    this.dialogRef.close();
                } else {
                    this.toastr.error('Lỗi khi gửi báo lỗi: ' + (result?.error || 'Unknown'));
                }
            } else {
                this.toastr.error('Môi trường không hỗ trợ gửi email trực tiếp.');
            }
        } catch (error) {
            this.toastr.error('Lỗi kết nối: ' + (error as any).message);
        } finally {
            this.isSending = false;
        }
    }
}

@Component({
    selector: 'thin-layout',
    templateUrl: './thin.component.html',
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None
})
export class ThinLayoutComponent implements OnInit, OnDestroy, AfterViewInit, AfterContentInit {
    fileName: string;
    isRecording: boolean = false;
    appVersion: string = '1.0.0';
    activeInfo: any = {};
    private _recordingStateListener: any;

    isScreenSmall: boolean;
    navigation: Navigation;

    public spin = true;
    public direction: Direction = 'up';
    public animationMode: AnimationMode = 'fling';

    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for current year
     */
    get currentYear(): number {
        return new Date().getFullYear();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    public stopPropagation(event: Event): void {
        // Prevent the click to propagate to document and trigger
        // the FAB to be closed automatically right before we toggle it ourselves
        event.stopPropagation();
    }

    public doAction(event: string): void {
        console.log(event);
    }

    get enableUmodelverse(): boolean {
        const settings = this.multiAccountService.getItem('settings');
        return settings ? (settings.enableUmodelverse === true) : false;
    }

    set enableUmodelverse(value: boolean) {
        let settings = this.multiAccountService.getItem('settings') || {};
        settings.enableUmodelverse = value;
        this.multiAccountService.setItem('settings', settings);
    }

    toggleUmodelverse(): void {
        this.enableUmodelverse = !this.enableUmodelverse;
        
        // Cập nhật trạng thái lên máy chủ để không bị mất khi F5
        if (this.user) {
            let settings = this.multiAccountService.getItem('settings') || {};
            const editor = this.multiAccountService.getItem('editor');
            const following_users = this.multiAccountService.getItem('following_users');

            this._userClientService.updateProfile({
                profile: {
                    settings: settings,
                    active_info: this.multiAccountService.getItem('active_info'),
                    editor: (editor && editor != 'undefined') ? editor : {},
                    following_users: (following_users && following_users != 'undefined') ? following_users : [],
                },
                username: this.user.name
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe();
        }
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    startRecording() {
        window.dispatchEvent(new Event('start-recording'));
    }


    /**
     * Toggle navigation
     *
     * @param name
     */
    toggleNavigation(name: string): void {
        // Get the navigation
        const navigation = this._fuseNavigationService.getComponent<FuseVerticalNavigationComponent>(name);

        if (navigation) {
            // Toggle the opened status
            navigation.toggle();
        }
    }

    /**
     * Mở hướng dẫn
     */
    help() {
        this.dialog.open(HelpComponent, {
            width: '1000px',
            maxWidth: '95vw',
            height: '90vh'
        });
    }

    openPopup() {
        this.dialog.open(PopupComponent, {
            width: '666px',
            height: '666px',
            backdropClass: 'custom-dialog-backdrop',
            data: { url: 'http://localhost:12345' },
            panelClass: 'custom-dialog',
            disableClose: false
        });
    }

    readFile = (e: any) => {
        const file: File = e.target.files[0];

        if (file) {
            this.fileName = e.target.files[0].name;
            // console.log('aaa', e.target.files[0]);
            // window.open('/assets/type-lite-macos', null);
        }
    }

    /**
     * Constructor
     */
    constructor(
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        public dialog: MatDialog,
        private _navigationService: NavigationService,
        private _fuseMediaWatcherService: FuseMediaWatcherService,
        private _fuseNavigationService: FuseNavigationService,
        private _changeDetectorRef: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private _userService: UserService,
        private _userClientService: UserClientService
    ) { 
        const activeInfo = this.multiAccountService.getItem('active_info');
        if (activeInfo && activeInfo != 'null' && activeInfo != 'undefined') {
            this.activeInfo = AuthUtils._getActiveInfo(activeInfo);
        }
    }

    ngAfterViewInit(): void { }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------
    ngAfterContentInit(): void { }

    /**
     * On init
     */
    ngOnInit(): void {
        if ((window as any).electron) {
            (window as any).electron.getAppVersion().then((v: string) => {
                this.appVersion = v;
            });
        }

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        this._recordingStateListener = (event: any) => {
            this.isRecording = event.detail;
            this._changeDetectorRef.detectChanges();
        };
        window.addEventListener('recording-state-changed', this._recordingStateListener);

        // Subscribe to navigation data
        this._navigationService.navigation$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((navigation: Navigation) => {
                this.navigation = navigation;
            });

        // Subscribe to media changes
        this._fuseMediaWatcherService.onMediaChange$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(({ matchingAliases }) => {
                // Check if the screen is small
                this.isScreenSmall = !matchingAliases.includes('md');
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        window.removeEventListener('recording-state-changed', this._recordingStateListener);
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: (message) ? message : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đi kích hoạt',
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: 'Dùng chùa'
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/settings'], {
                queryParams: {
                    'tab': 'active'
                }
            });
        });
    }
}

@Component({
    selector: 'app-popup',
    standalone: true,
    template: `<div cdkDrag class="popup-wrapper"><iframe [src]="safeUrl" class="iframe-content"></iframe></div>`,
    styles: [`.popup-wrapper {
        width: 100%;
        height: 100%;
        overflow: hidden;
    }

    .iframe-content {
        width: 100%;
        height: 100%;
        border: none;
        overflow: hidden;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }`]
})
export class PopupComponent {
    safeUrl!: SafeResourceUrl;

    constructor(@Inject(MAT_DIALOG_DATA) public data: any, private sanitizer: DomSanitizer) {
        this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(data.url);
    }
}

