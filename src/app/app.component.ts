import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { DeviceUUID } from "device-uuid";
import { UserService } from './core/user/user.service';
import { Subject, takeUntil } from 'rxjs';
import { User } from './core/user/user.types';
import { MatDialog } from '@angular/material/dialog';
import { MultiAccountService } from './modules/_services/multi-account.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
    user: User;
    uuid = new DeviceUUID().get();

    statistics: any = {};
    checkActiveInfo = false;
    dialogRef: any;

    // Biến để lưu ID của timer giúp dọn dẹp sau này
    private intervalId: any;

    // 5 phút kiểm tra một lần
    private readonly ONE_HOUR_MS = 1000 * 60 * 5;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    updateTime(): void {
        let activeInfo = this.multiAccountService.getItem('active_info');

        if (activeInfo && activeInfo != 'null' && activeInfo != 'undefined') {
            const isLicenseKeyExpired = AuthUtils.isLicenseKeyExpired(activeInfo);
            // this.checkActiveInfo = AuthUtils._verifyActiveInfo(activeInfo, this.uuid);

            if (isLicenseKeyExpired === true) {
                this.error('Phần mềm của bạn đã hết hạn.');

                this.router.navigate(['/settings'], {
                    queryParams: {
                        tab: 'active'
                    }
                });
            } else {
                // Phần mềm đã được kích hoạt
                if (this.intervalId) {
                    clearInterval(this.intervalId);
                }
            }
        } else {
            this.error('Bạn chưa kích hoạt phần mềm.');
        }
    }

    /**
     * Constructor
     */
    constructor(
        private _userService: UserService,
        private _fuseConfirmationService: FuseConfirmationService,
        public dialog: MatDialog,
        private router: Router,
        private multiAccountService: MultiAccountService
    ) {
        // kiểm tra settings và khởi tạo
        let settings: any = this.multiAccountService.getItem('settings');
        if (!settings || settings == 'undefined') {
            settings = {
                saveimages: false,
                statusTypeLite: false,
                autosave: true,
                closethread: true,
                proccessing: false,
                linkDonate: null,
                language: 'vi',
                secretKey: null,
                defaultlinks: null,
                port: 12345,
                styles: [],
                typelite_plugin: 'http://localhost:12345', // Type Lite Plugin
                downloader_plugin: 'http://localhost:12345', // Downloader Plugin
                tts: '', // Text to Speech Plugin
                sst: '', // Speech to Text Plugin
                mxhauto: '', // MXH tự động Plugin
                chatbot: '', // Chatbot Api
                bigdata: '', // Big Data Plugin
                customer: '', // Device Token Api
                searchAPIKey: '', // API key for search functionality
                n8n: '', // API key for n8n functionality
            };

            this.multiAccountService.setItem('settings', settings);
        }
    }

    ngOnInit() {
        // 2. Thiết lập bộ đếm (Timer)
        this.intervalId = setInterval(() => {
            this.updateTime();
        }, this.ONE_HOUR_MS);

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnDestroy() {
        // 3. QUAN TRỌNG: Xóa timer khi component bị hủy để tránh rò rỉ bộ nhớ (memory leak)
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }

    error(message?: string) {
        // đóng trước khi mở
        if (this.dialogRef) this._fuseConfirmationService.close();

        this.dialogRef = this._fuseConfirmationService.open({
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
                    label: 'Đóng',
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại'
                }
            },
            dismissible: false
        });

        // Subscribe to afterClosed from the dialog reference
        this.dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/settings']);
        });
    }
}