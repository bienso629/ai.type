import { ChangeDetectionStrategy, ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { Clipboard } from '@angular/cdk/clipboard';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserClientService } from 'app/_services/user';
import { UserSettingsService, getSettings, saveSettingsPartial, updateUserSettingsCache } from 'app/_services/user-settings.service';
import { ShopeeOfferItem, ShopeeOffersService, ShopeeOfferSyncState } from 'app/_services/shopee-offers.service';
import { AffiliateLivestreamService } from 'app/_services/affiliate-livestream.service';
import {
    AffiliateLivestreamDialogComponent,
    AffiliateLivestreamDialogData,
    AffiliateLivestreamDialogResult,
} from './dialogs/affiliate-livestream-dialog.component';

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

    // Kho sản phẩm Shopee Affiliate Offer đã đồng bộ trong database collection của tài khoản
    @ViewChild(CdkVirtualScrollViewport) offerViewport?: CdkVirtualScrollViewport;
    shopeeOffers: ShopeeOfferItem[] = [];
    offerTotalDocs = 0;
    offerLoading = false;
    offerLoadingMore = false;
    offerKeyword = '';
    offerSortBy = 'updatedAt';
    offerPage = 0;
    readonly offerPageSize = 50;
    readonly offerRowHeight = 104;
    offerSource: 'server' | 'local' = 'server';
    shopeeSyncState: ShopeeOfferSyncState;
    generatingLinkOfferId: string | null = null;

    get hasMoreOffers(): boolean {
        return this.shopeeOffers.length < this.offerTotalDocs;
    }

    trackByOfferId(index: number, item: ShopeeOfferItem): string {
        return item?._id || item?.id || item?.item_id || String(index);
    }

    private _unsubscribeAll: Subject<any> = new Subject<any>();
    private _pendingOfferReload = false;
    private readonly _onOffersSynced = () => {
        this._ngZone.run(() => {
            this.loadShopeeOffers(true);
        });
    };

    constructor(
        private _formBuilder: UntypedFormBuilder,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _userSettingsService: UserSettingsService,
        private _multiAccountService: MultiAccountService,
        private _shopeeOffersService: ShopeeOffersService,
        private _affiliateLivestreamService: AffiliateLivestreamService,
        private _matDialog: MatDialog,
        private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private _clipboard: Clipboard,
        private _toastr: ToastrService,
        private _cdr: ChangeDetectorRef,
        private _ngZone: NgZone
    ) {
        this.shopeeSyncState = this._shopeeOffersService.currentState;
    }

    private _ensureAffiliateAccess(notify = true): boolean {
        const activeUser = this.user || this._userService.user;
        if (this._userService.canAccessAffiliate(activeUser)) {
            return true;
        }
        if (notify) {
            this._toastr.warning('Chỉ tài khoản thuộc nhóm "nhóm-làm-affiliate" mới được phép truy cập Affiliate.');
        }
        return false;
    }

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
                if (user?.name && this._userService.canAccessAffiliate(user)) {
                    this.loadShopeeOffers(true);
                } else {
                    this.shopeeOffers = [];
                    this.offerTotalDocs = 0;
                }
            });

        this._shopeeOffersService.syncState$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((st) => {
                this._ngZone.run(() => {
                    this.shopeeSyncState = st;
                    this._cdr.markForCheck();
                });
            });

        window.addEventListener('shopee-offers-synced', this._onOffersSynced);

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

        // Nếu người dùng quay lại từ màn hình kiểm thử Livestream để sửa kịch bản -> tự động mở lại dialog sản phẩm đó
        this._activatedRoute.queryParams
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((params) => {
                const reopenOfferId = params?.['livestreamOffer'];
                if (reopenOfferId && this._ensureAffiliateAccess(false)) {
                    const draft = this._affiliateLivestreamService.loadDraftByOfferId(reopenOfferId);
                    if (draft?.product) {
                        this._router.navigate([], {
                            relativeTo: this._activatedRoute,
                            queryParams: { livestreamOffer: null },
                            queryParamsHandling: 'merge',
                            replaceUrl: true,
                        });
                        setTimeout(() => {
                            this.openLivestreamScriptDialog(draft.product);
                        }, 150);
                    }
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
        if (!this._ensureAffiliateAccess(true)) {
            return;
        }
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

    async loadShopeeOffers(reset = true): Promise<void> {
        if (reset) {
            if (this.offerLoading) {
                this._pendingOfferReload = true;
                return;
            }
            this._pendingOfferReload = false;
            this.offerPage = 0;
            this.offerLoading = true;
            this.offerLoadingMore = false;
        } else {
            if (this.offerLoading || this.offerLoadingMore || !this.hasMoreOffers) return;
            this.offerLoadingMore = true;
        }
        this._cdr.markForCheck();

        try {
            const username =
                this.user?.name ||
                this._multiAccountService.getItem('username') ||
                localStorage.getItem('username') ||
                'admin';

            // Lọc riêng toàn bộ sản phẩm đang có bản nháp kịch bản / ảnh khung nền / chuỗi video livestream (mới chỉnh gần nhất lên đầu)
            if (this.offerSortBy === 'livestream_in_progress') {
                const drafts = this._affiliateLivestreamService.getInProgressDrafts();
                let items: ShopeeOfferItem[] = drafts
                    .map((d) => ({
                        ...d.product,
                        images: Array.isArray(d.productImages) && d.productImages.length > 0
                            ? d.productImages
                            : d.product?.images || [],
                        attributes: Array.isArray(d.productAttributes) && d.productAttributes.length > 0
                            ? d.productAttributes
                            : d.product?.attributes || [],
                        variations: Array.isArray(d.productVariations) && d.productVariations.length > 0
                            ? d.productVariations
                            : d.product?.variations || [],
                        description: d.productDescription || d.product?.description || '',
                        updatedAt: d.updatedAt || d.product?.updatedAt,
                    }))
                    .filter((p) => !!p);

                // Gộp thêm thông tin mới nhất từ SQLite cục bộ (giá, hoa hồng, ảnh gallery, chi tiết sản phẩm)
                const electron = (window as any).electron;
                if (items.length > 0 && (electron?.getLocalShopeeOffersByIds || electron?.invoke)) {
                    try {
                        const ids = items.map((p) => p._id || p.id || '').filter(Boolean);
                        const itemIds = items.map((p) => p.item_id || '').filter(Boolean);
                        const localRes = electron.getLocalShopeeOffersByIds
                            ? await electron.getLocalShopeeOffersByIds({ username, ids, itemIds })
                            : await electron.invoke('get-local-shopee-offers-by-ids', { username, ids, itemIds });
                        if (localRes?.success && Array.isArray(localRes.data) && localRes.data.length > 0) {
                            const byId = new Map<string, ShopeeOfferItem>();
                            const byItemId = new Map<string, ShopeeOfferItem>();
                            for (const ld of localRes.data as ShopeeOfferItem[]) {
                                if (ld.id) byId.set(ld.id, ld);
                                if (ld._id) byId.set(ld._id, ld);
                                if (ld.item_id) byItemId.set(ld.item_id, ld);
                            }
                            items = items.map((p) => {
                                const lm = byId.get(p._id || p.id || '') || (p.item_id ? byItemId.get(p.item_id) : undefined);
                                if (!lm) return p;
                                const bestAffLink =
                                    this._shopeeOffersService.getBestAffiliateLink(lm) ||
                                    this._shopeeOffersService.getBestAffiliateLink(p);
                                const bestShort =
                                    (this._shopeeOffersService.isRealAffiliateLink(lm.short_link) ? lm.short_link : '') ||
                                    (this._shopeeOffersService.isRealAffiliateLink(p.short_link) ? p.short_link : '');
                                return {
                                    ...lm,
                                    ...p,
                                    short_link: bestShort,
                                    offer_link: bestAffLink,
                                    price: lm.price > 0 ? lm.price : p.price,
                                    commission_rate: lm.commission_rate > 0 ? lm.commission_rate : p.commission_rate,
                                    commission_amount: lm.commission_amount > 0 ? lm.commission_amount : p.commission_amount,
                                    sales: lm.sales > 0 ? lm.sales : p.sales,
                                    image_url: lm.image_url || p.image_url,
                                    images: Array.isArray(lm.images) && lm.images.length >= (p.images?.length || 0) ? lm.images : p.images,
                                    attributes: Array.isArray(lm.attributes) && lm.attributes.length >= (p.attributes?.length || 0) ? lm.attributes : p.attributes,
                                    variations: Array.isArray(lm.variations) && lm.variations.length >= (p.variations?.length || 0) ? lm.variations : p.variations,
                                    description: (lm.description || '').length >= (p.description || '').length ? lm.description : p.description,
                                };
                            });
                        }
                    } catch (_) {}
                }

                const kw = String(this.offerKeyword || '').trim().toLowerCase();
                if (kw) {
                    items = items.filter((p) =>
                        `${p.product_name || ''} ${p.shop_name || ''} ${p.item_id || ''} ${p.product_link || ''}`
                            .toLowerCase()
                            .includes(kw),
                    );
                }

                this.shopeeOffers = items;
                this.offerTotalDocs = items.length;
                this.offerSource = 'local';
                setTimeout(() => {
                    this.offerViewport?.scrollToIndex(0);
                    this.offerViewport?.checkViewportSize();
                }, 0);
                return;
            }

            const res = await this._shopeeOffersService.listOffers({
                username,
                keyword: this.offerKeyword,
                sortBy: this.offerSortBy,
                pageNumber: this.offerPage,
                size: this.offerPageSize,
            });
            const incoming = res.docs || [];
            if (reset) {
                this.shopeeOffers = incoming;
                setTimeout(() => {
                    this.offerViewport?.scrollToIndex(0);
                    this.offerViewport?.checkViewportSize();
                }, 0);
            } else {
                const seen = new Set(this.shopeeOffers.map((x) => x._id || x.id));
                const next = incoming.filter((x) => !seen.has(x._id || x.id));
                this.shopeeOffers = [...this.shopeeOffers, ...next];
                setTimeout(() => {
                    this.offerViewport?.checkViewportSize();
                }, 0);
            }
            this.offerTotalDocs = res.totalDocs || this.shopeeOffers.length;
            this.offerSource = res.source;
        } catch (_) {
            // Giữ trạng thái hiện tại
        } finally {
            this.offerLoading = false;
            this.offerLoadingMore = false;
            this._cdr.markForCheck();
            if (this._pendingOfferReload) {
                this._pendingOfferReload = false;
                setTimeout(() => this.loadShopeeOffers(true), 120);
            }
        }
    }

    loadMoreShopeeOffers(): void {
        if (this.offerLoading || this.offerLoadingMore || !this.hasMoreOffers) return;
        this.offerPage += 1;
        this.loadShopeeOffers(false);
    }

    onOffersScrolled(): void {
        if (!this.offerViewport || this.offerLoading || this.offerLoadingMore || !this.hasMoreOffers) {
            return;
        }
        const renderedRange = this.offerViewport.getRenderedRange();
        const bottomOffset = this.offerViewport.measureScrollOffset('bottom');
        const totalLoaded = this.shopeeOffers.length;
        if (totalLoaded > 0 && (bottomOffset <= 260 || renderedRange.end >= totalLoaded - 6)) {
            this.loadMoreShopeeOffers();
        }
    }

    onOffersViewportScroll(event: Event): void {
        if (this.offerLoading || this.offerLoadingMore || !this.hasMoreOffers) {
            return;
        }
        const el = event?.target as HTMLElement | null;
        if (el) {
            const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            if (distanceToBottom <= 260) {
                this.loadMoreShopeeOffers();
                return;
            }
        }
        this.onOffersScrolled();
    }

    openWebToolsAndSyncShopeeOffers(): void {
        if (!this._ensureAffiliateAccess(true)) return;
        if (this.shopeeSyncState?.isSyncing) return;

        // Mở Web Tools tới trang Shopee Product Offer
        window.dispatchEvent(
            new CustomEvent('open-web-tool', {
                detail: {
                    name: 'Shopee Affiliate',
                    url: 'https://affiliate.shopee.vn/offer/product_offer',
                },
            }),
        );

        const findShopeeWebview = (): any => {
            const container = document.getElementById('webview-container-div');
            if (!container) return null;
            return (
                Array.from(container.querySelectorAll('webview')).find((wv: any) => {
                    try {
                        const u = (typeof wv.getURL === 'function' ? wv.getURL() : '') || wv.getAttribute('src') || '';
                        return u.toLowerCase().includes('affiliate.shopee.vn');
                    } catch (_) {
                        return false;
                    }
                }) || null
            );
        };

        // Đợi thẻ webview Shopee Affiliate xuất hiện và tải xong trang trước khi tự động đồng bộ
        const startedAt = Date.now();
        const tryStartSync = () => {
            if (this.shopeeSyncState?.isSyncing) return;
            const wv = findShopeeWebview();
            if (wv && typeof wv.executeJavaScript === 'function') {
                let loading = false;
                try {
                    loading = typeof wv.isLoading === 'function' ? !!wv.isLoading() : false;
                } catch (_) {}
                if (!loading) {
                    setTimeout(() => {
                        if (!this.shopeeSyncState?.isSyncing) {
                            this._shopeeOffersService.syncAllFromWebview(wv);
                        }
                    }, 500);
                    return;
                }
            }
            if (Date.now() - startedAt < 12000) {
                setTimeout(tryStartSync, 400);
            } else {
                this._toastr.info(
                    'Đã mở trang Shopee Product Offer trên Web Tools. Sau khi trang tải xong, hãy bấm nút "Đồng bộ sản phẩm offer" trên thanh tiêu đề cửa sổ Web Tools.',
                    'Đồng bộ Shopee Offer',
                    { timeOut: 7000 },
                );
            }
        };
        setTimeout(tryStartSync, 500);
    }

    hasLivestreamDraft(item: ShopeeOfferItem): boolean {
        return this._affiliateLivestreamService.hasDraft(item);
    }

    openLivestreamScriptDialog(item: ShopeeOfferItem): void {
        if (!this._ensureAffiliateAccess(true)) return;
        const username =
            this.user?.name ||
            this._multiAccountService.getItem('username') ||
            localStorage.getItem('username') ||
            'admin';

        const dialogRef = this._matDialog.open<
            AffiliateLivestreamDialogComponent,
            AffiliateLivestreamDialogData,
            AffiliateLivestreamDialogResult
        >(AffiliateLivestreamDialogComponent, {
            width: '94vw',
            maxWidth: '1180px',
            maxHeight: '90vh',
            panelClass: ['dialog-no-padding'],
            autoFocus: false,
            data: {
                product: item,
                username,
                ctaTemplate: this.affiliateForm?.get('shopeeCtaTemplate')?.value || '',
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (this.offerSortBy === 'livestream_in_progress') {
                this.loadShopeeOffers(true);
            }
            this._cdr.markForCheck();
            if (result?.action === 'preview' && result.uuid) {
                this._router.navigate(['/livestream', result.uuid], {
                    queryParams: { mode: 'preview' },
                });
            }
        });
    }

    isRealAffiliateLink(item: ShopeeOfferItem): boolean {
        return !!this._shopeeOffersService.getBestAffiliateLink(item);
    }

    getOfferAffiliateLink(item: ShopeeOfferItem): string {
        return this._shopeeOffersService.getBestAffiliateLink(item);
    }

    async copyOfferLink(item: ShopeeOfferItem): Promise<void> {
        if (!item) return;
        const existingAffLink = this.getOfferAffiliateLink(item);
        if (existingAffLink) {
            this._clipboard.copy(existingAffLink);
            this._toastr.success(`Đã sao chép link Affiliate: ${existingAffLink}`);
            return;
        }

        const key = this.trackByOfferId(0, item);
        if (this.generatingLinkOfferId === key) return;
        this.generatingLinkOfferId = key;
        this._cdr.markForCheck();

        try {
            const res = await this._shopeeOffersService.generateAffiliateLinks([item], {
                persist: true,
                configOverride: this.affiliateForm?.value,
            });
            const generatedLink = this.getOfferAffiliateLink(item);
            if (generatedLink) {
                this._clipboard.copy(generatedLink);
                this._toastr.success(`Đã tạo và sao chép link Affiliate: ${generatedLink}`, 'Link Affiliate Shopee');
            } else if (res.needLogin) {
                this._toastr.warning(
                    'Chưa tạo được link Affiliate Shopee (s.shopee.vn). Hãy đăng nhập tài khoản affiliate.shopee.vn trên Web Tools (hoặc điền App ID + API Secret Shopee) rồi bấm lại.',
                    'Cần đăng nhập Shopee Affiliate',
                    { timeOut: 7000 },
                );
            } else {
                this._toastr.warning(
                    `Chưa tạo được link Affiliate Shopee (${res.error || 'kiểm tra đăng nhập affiliate.shopee.vn trên Web Tools hoặc App ID + Secret'}).`,
                    'Không thể tạo link Affiliate',
                    { timeOut: 7000 },
                );
            }
        } catch (err: any) {
            this._toastr.error(`Lỗi tạo link Affiliate Shopee: ${err?.message || 'Không xác định'}`);
        } finally {
            this.generatingLinkOfferId = null;
            this._cdr.markForCheck();
            try {
                this._cdr.detectChanges();
            } catch (_) {}
        }
    }

    openOfferLink(item: ShopeeOfferItem): void {
        const link = this.getOfferAffiliateLink(item) || item.product_link;
        if (!link) return;
        const electron = (window as any).electron;
        if (electron?.openUrlExternal) {
            electron.openUrlExternal(link);
        } else {
            window.open(link, '_blank', 'noopener,noreferrer');
        }
    }

    formatVnd(amount: number | undefined): string {
        const num = Number(amount) || 0;
        if (num <= 0) return '-';
        return num.toLocaleString('vi-VN') + ' ₫';
    }

    ngOnDestroy(): void {
        window.removeEventListener('shopee-offers-synced', this._onOffersSynced);
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
