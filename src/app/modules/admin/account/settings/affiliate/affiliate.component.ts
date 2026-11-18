import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserClientService } from 'app/_services/user';
import { UserSettingsService, getSettings, saveSettingsPartial, updateUserSettingsCache } from 'app/_services/user-settings.service';

@Component({
    selector: 'settings-affiliate',
    templateUrl: './affiliate.component.html',
    styleUrls: ['./affiliate.component.scss'],
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false
})
export class SettingsAffiliateComponent implements OnInit, OnDestroy {
    user: User;
    affiliateForm: UntypedFormGroup;
    isSaving = false;

    showShopeeSecret = false;
    showLazadaSecret = false;
    showTiktokSecret = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _userSettingsService: UserSettingsService,
        private _multiAccountService: MultiAccountService,
        private _toastr: ToastrService,
        private _cdr: ChangeDetectorRef
    ) {}

    ngOnInit(): void {
        // Khởi tạo đồng bộ FormGroup ngay từ đầu để tránh lỗi NG01052
        this.affiliateForm = this._formBuilder.group({
            // Shopee Affiliate
            shopeeEnabled: [true],
            shopeeAppId: [''],
            shopeeSecret: [''],
            shopeeSubId: [''],
            shopeeCookie: [''],
            shopeeCtaTemplate: ['Mua ngay chính hãng trên Shopee tại đây: {link}'],

            // Lazada Affiliate
            lazadaEnabled: [false],
            lazadaAppKey: [''],
            lazadaAppSecret: [''],
            lazadaTrackingId: [''],
            lazadaCookie: [''],
            lazadaCtaTemplate: ['Săn deal Lazada giá hời tại đây: {link}'],

            // TikTok Shop Affiliate
            tiktokShopEnabled: [false],
            tiktokCreatorId: [''],
            tiktokAppKey: [''],
            tiktokAppSecret: [''],
            tiktokShopCipher: [''],
            tiktokCtaTemplate: ['Sản phẩm có trong giỏ hàng góc trái màn hình hoặc tại: {link}']
        });

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
                this._cdr.markForCheck();
            });

        this.loadAffiliateSettings();

        if (this._multiAccountService.isReady) {
            this._multiAccountService.isReady.then(() => {
                this.loadAffiliateSettings();
            });
        }

        this._userSettingsService.settings$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((settings: any) => {
                if (settings?.affiliate && typeof settings.affiliate === 'object') {
                    this.affiliateForm.patchValue(settings.affiliate, { emitEvent: false });
                    this._multiAccountService.setItem('affiliate_config', settings.affiliate);
                    this._cdr.markForCheck();
                }
            });
    }

    loadAffiliateSettings(): void {
        const currentSettings = getSettings() || {};
        const savedAffiliate =
            currentSettings.affiliate ||
            this._multiAccountService.getItem('affiliate_config') ||
            null;

        if (savedAffiliate && typeof savedAffiliate === 'object') {
            this.affiliateForm.patchValue(savedAffiliate, { emitEvent: false });
            this._cdr.markForCheck();
        }
    }

    save(): void {
        if (this.affiliateForm.invalid || this.isSaving) {
            return;
        }

        const affiliateValue = { ...this.affiliateForm.value };
        this._multiAccountService.setItem('affiliate_config', affiliateValue);

        const currentSettings = getSettings() || {};
        const updatedSettings = {
            ...currentSettings,
            affiliate: affiliateValue
        };

        const username =
            this.user?.name ||
            this._multiAccountService.getItem('username') ||
            localStorage.getItem('username') ||
            undefined;

        if (!username) {
            saveSettingsPartial({ affiliate: affiliateValue });
            this._toastr.success('Đã lưu cấu hình Affiliate!');
            return;
        }

        this.isSaving = true;
        this._cdr.markForCheck();

        const editor = this._multiAccountService.getItem('editor');
        const following_users = this._multiAccountService.getItem('following_users');

        this._userClientService
            .updateProfile({
                profile: {
                    settings: updatedSettings,
                    active_info: this._multiAccountService.getItem('active_info'),
                    editor: editor && editor !== 'undefined' ? editor : {},
                    following_users: following_users && following_users !== 'undefined' ? following_users : []
                },
                username
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (result: any) => {
                    this.isSaving = false;
                    if (result && result.success) {
                        updateUserSettingsCache(updatedSettings);
                        this._toastr.success('Lưu cấu hình Affiliate thành công!');
                    } else {
                        saveSettingsPartial({ affiliate: affiliateValue }, username);
                        this._toastr.success('Đã lưu cấu hình Affiliate!');
                    }
                    this._cdr.markForCheck();
                },
                error: () => {
                    this.isSaving = false;
                    saveSettingsPartial({ affiliate: affiliateValue }, username);
                    this._toastr.error('Không thể đồng bộ lên máy chủ, đã lưu tạm trên phiên hiện tại.');
                    this._cdr.markForCheck();
                }
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
