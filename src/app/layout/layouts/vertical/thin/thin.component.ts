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
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';

import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ChangeDetectorRef } from '@angular/core';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { AuthUtils } from 'app/core/auth/auth.utils';

import { UserClientService } from 'app/modules/_services/user';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';

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

    async catureScreen() {
        // Tạo tên file theo timestamp
        const fileName = `screenshot_${new Date().getTime()}.png`;

        try {
            // Gọi xuống main process thông qua (window as any).electron
            // Đảm bảo preload.js của bạn đã expose hàm 'captureApp' trỏ tới ipcRenderer.invoke('capture-app', ...)
            const result = await (window as any).electron.captureApp({
                fileName: fileName,
                folder: 'screenshots' // Lưu vào thư mục screenshots
            });

            if (result && result.success) {
                console.log('Đã lưu ảnh tại:', result.path);

                // (Tuỳ chọn) Mở popup hiển thị ảnh vừa chụp ngay lập tức
                // Tận dụng PopupComponent đã có sẵn trong file thin.component.ts
                this.dialog.open(PopupComponent, {
                    width: '80%',
                    height: '80%',
                    backdropClass: 'custom-dialog-backdrop',
                    data: { url: result.url }, // Main trả về url dạng file:///...
                    panelClass: 'custom-dialog'
                });

            } else {
                console.error('Lỗi chụp màn hình:', result.error);
                this.error('Không thể chụp màn hình: ' + result.error);
            }
        } catch (err) {
            console.error('Lỗi gọi electron:', err);
        }
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
            width: '600px',
            height: '80%'
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
