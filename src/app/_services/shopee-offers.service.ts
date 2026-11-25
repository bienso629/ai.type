import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { getSettings } from 'app/_services/user-settings.service';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface ShopeeOfferItem {
    _id?: string;
    id?: string;
    item_id: string;
    shop_id: string;
    product_name: string;
    shop_name?: string;
    price: number;
    price_min?: number;
    price_max?: number;
    original_price?: number;
    commission_rate: number;
    commission_amount: number;
    seller_commission_rate?: number;
    shopee_commission_rate?: number;
    sales: number;
    rating_star: number;
    image_url: string;
    images?: string[];
    attributes?: Array<{ name: string; value: string }>;
    variations?: Array<{ name: string; options: string[] }>;
    description?: string;
    product_link: string;
    offer_link: string;
    short_link?: string;
    category_id?: string;
    category_name?: string;
    offer_id?: string;
    offer_type?: string;
    period_start_time?: number;
    period_end_time?: number;
    source_url?: string;
    syncedAt?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface ShopeeOfferSyncState {
    isSyncing: boolean;
    currentPage: number;
    totalPages: number;
    pagesSynced: number;
    collectedCount: number;
    savedServerCount: number;
    savedLocalCount: number;
    totalInDb: number;
    statusText: string;
    lastFinishedMessage: string;
    error: string;
}

const INITIAL_SYNC_STATE: ShopeeOfferSyncState = {
    isSyncing: false,
    currentPage: 0,
    totalPages: 0,
    pagesSynced: 0,
    collectedCount: 0,
    savedServerCount: 0,
    savedLocalCount: 0,
    totalInDb: 0,
    statusText: '',
    lastFinishedMessage: '',
    error: '',
};

const HTTP_OPTIONS = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    }),
};

/**
 * Script passive hook cho webview affiliate.shopee.vn:
 * - Ghi nhận dữ liệu JSON sản phẩm Offer từ phản hồi fetch/XHR của chính trang Shopee Affiliate
 *   (không can thiệp, không thay đổi request/response của Shopee).
 * - Cung cấp bộ hàm nhận diện phân trang đa tầng dùng chung cho cả Extract / Probe / Advance.
 */
export const SHOPEE_OFFER_HOOK_SCRIPT = `
(function () {
    try {
        var state = window.__aiTypeShopeeOfferState || {
            offersMap: {},
            dirtyKeys: {},
            captureCount: 0,
            lastCaptureTs: 0,
            totalCount: 0,
            pageSize: 20,
            hasMore: null,
            lastApiUrl: ''
        };
        if (!state.dirtyKeys) state.dirtyKeys = {};
        if (!state.pageSize) state.pageSize = 20;
        window.__aiTypeShopeeOfferState = state;

        function scalePrice(v) {
            if (v === null || v === undefined || v === '') return 0;
            var n = typeof v === 'number' ? v : Number(String(v).replace(/[^\\d.-]/g, ''));
            if (!isFinite(n) || n <= 0) return 0;
            if (n >= 100000000) return Math.round(n / 100000);
            return Math.round(n);
        }

        function scaleRate(v) {
            if (v === null || v === undefined || v === '') return 0;
            var s = String(v).trim();
            if (s.endsWith('%')) {
                var p = parseFloat(s.replace('%', '').replace(',', '.'));
                return isFinite(p) ? Number(p.toFixed(2)) : 0;
            }
            var n = Number(s.replace(',', '.'));
            if (!isFinite(n) || n <= 0) return 0;
            if (n > 100000) return Number((n / 100000).toFixed(2));
            if (n > 100) return Number((n / 1000).toFixed(2));
            if (n > 0 && n <= 1) return Number((n * 100).toFixed(2));
            return Number(n.toFixed(2));
        }

        function isRealAffiliateUrl(raw) {
            var s = String(raw || '').trim().toLowerCase();
            if (!s || !(s.startsWith('http://') || s.startsWith('https://'))) return false;
            return (
                s.includes('s.shopee.vn/') ||
                s.includes('shope.ee/') ||
                s.includes('shp.ee/') ||
                s.includes('utm_source=an_') ||
                s.includes('utm_medium=affiliates') ||
                s.includes('mmp_pid=an_')
            );
        }

        function buildImgUrl(img) {
            if (!img) return '';
            var s = String(img).trim();
            if (!s) return '';
            if (s.startsWith('http://') || s.startsWith('https://')) return s;
            if (s.startsWith('//')) return 'https:' + s;
            return 'https://down-vn.img.susercontent.com/file/' + s.replace(/^\\/+/, '');
        }

        function normalizeRawOffer(entry, sourceUrl) {
            if (!entry || typeof entry !== 'object') return null;
            var card = entry.batch_item_for_item_card_full || entry.item_basic || entry.item_card || entry.product || null;

            var itemId = String(
                entry.item_id || entry.itemId || entry.itemid || entry.productId ||
                (card && (card.itemid || card.item_id || card.itemId)) || ''
            ).trim();
            var shopId = String(
                entry.shop_id || entry.shopId || entry.shopid ||
                (card && (card.shopid || card.shop_id || card.shopId)) || ''
            ).trim();
            var productName = String(
                entry.product_name || entry.productName || entry.item_name || entry.name || entry.title ||
                (card && (card.name || card.title || card.product_name)) || ''
            ).trim();

            if (!itemId || !productName) return null;

            var hasProductSignal = !!(
                entry.commission_rate !== undefined ||
                entry.commissionRate !== undefined ||
                entry.seller_commission_rate !== undefined ||
                entry.sellerCommissionRate !== undefined ||
                entry.default_commission_rate !== undefined ||
                entry.commission !== undefined ||
                entry.max_commission !== undefined ||
                entry.offer_link || entry.offerLink || entry.long_link || entry.product_link || entry.productLink ||
                card
            );
            if (!hasProductSignal) return null;

            var rawPrice = entry.price ?? entry.price_min ?? entry.priceMin ?? (card && (card.price ?? card.price_min));
            var rawPriceMin = entry.price_min ?? entry.priceMin ?? (card && card.price_min) ?? rawPrice;
            var rawPriceMax = entry.price_max ?? entry.priceMax ?? (card && card.price_max) ?? rawPrice;
            var rawOrigPrice = entry.original_price ?? entry.originalPrice ?? entry.price_before_discount ?? (card && (card.price_before_discount || card.price_min_before_discount)) ?? 0;

            var price = scalePrice(rawPrice);
            var priceMin = scalePrice(rawPriceMin) || price;
            var priceMax = scalePrice(rawPriceMax) || price;
            var originalPrice = scalePrice(rawOrigPrice);

            var sellerRate = scaleRate(entry.seller_commission_rate ?? entry.sellerCommissionRate ?? entry.extra_commission_rate ?? 0);
            var shopeeRate = scaleRate(entry.shopee_commission_rate ?? entry.shopeeCommissionRate ?? entry.default_commission_rate ?? 0);
            var totalRate = scaleRate(
                entry.commission_rate ?? entry.commissionRate ?? entry.max_commission_rate ?? entry.maxCommissionRate ?? 0
            );
            if (!totalRate && (sellerRate || shopeeRate)) {
                totalRate = Number((sellerRate + shopeeRate).toFixed(2));
            }

            var rawCommAmt = entry.commission_amount ?? entry.commissionAmount ?? entry.max_commission ?? entry.commission ?? 0;
            var commAmt = scalePrice(rawCommAmt);
            if (!commAmt && price > 0 && totalRate > 0) {
                commAmt = Math.round((price * totalRate) / 100);
            }

            var salesRaw = entry.sales ?? entry.sold ?? entry.soldCount ?? entry.historical_sold ?? (card && (card.historical_sold ?? card.sold)) ?? 0;
            var sales = Math.max(0, Math.round(Number(salesRaw) || 0));

            var ratingRaw = entry.rating_star ?? entry.ratingStar ?? (card && card.item_rating && card.item_rating.rating_star) ?? (card && card.rating_star) ?? 0;
            var ratingStar = Number((Number(ratingRaw) || 0).toFixed(2));

            var imgRaw = entry.image_url || entry.imageUrl || entry.image ||
                (card && (card.image || (Array.isArray(card.images) && card.images[0]))) || '';
            var imageUrl = buildImgUrl(imgRaw);

            var imgSet = {};
            var allImages = [];
            function pushImgCandidate(rawVal) {
                var u = buildImgUrl(rawVal);
                if (!u) return;
                var cleanU = u.split('@')[0].split('?')[0].replace(/_tn(?=\\.[a-z0-9]+$|$)/i, '');
                if (!imgSet[cleanU]) {
                    imgSet[cleanU] = true;
                    allImages.push(cleanU);
                }
            }
            pushImgCandidate(imageUrl);
            var imgArrays = [
                entry.images,
                entry.image_list,
                entry.product_images,
                entry.item_images,
                card && card.images,
                card && card.image_list
            ];
            for (var ia = 0; ia < imgArrays.length; ia++) {
                var arr = imgArrays[ia];
                if (Array.isArray(arr)) {
                    for (var ib = 0; ib < arr.length; ib++) {
                        pushImgCandidate(arr[ib]);
                    }
                }
            }
            var tierVars = (card && card.tier_variations) || entry.tier_variations;
            if (Array.isArray(tierVars)) {
                for (var tv = 0; tv < tierVars.length; tv++) {
                    var tImgs = tierVars[tv] && tierVars[tv].images;
                    if (Array.isArray(tImgs)) {
                        for (var ti = 0; ti < tImgs.length; ti++) {
                            pushImgCandidate(tImgs[ti]);
                        }
                    }
                }
            }
            if (!imageUrl && allImages.length > 0) {
                imageUrl = allImages[0];
            }

            var productLink = String(entry.product_link || entry.productLink || entry.long_link || entry.longLink || '').trim();
            if (!productLink && shopId && itemId) {
                productLink = 'https://shopee.vn/product/' + shopId + '/' + itemId;
            }
            var rawShortLink = String(entry.short_link || entry.shortLink || entry.custom_link || entry.customLink || '').trim();
            var rawOfferLink = String(entry.offer_link || entry.offerLink || entry.affiliate_link || entry.affiliateLink || entry.product_offer_link || '').trim();
            var shortLink = isRealAffiliateUrl(rawShortLink) ? rawShortLink : (isRealAffiliateUrl(rawOfferLink) ? rawOfferLink : '');
            var offerLink = shortLink || (isRealAffiliateUrl(rawOfferLink) ? rawOfferLink : '');

            var shopName = String(entry.shop_name || entry.shopName || (card && card.shop_name) || '').trim();
            var catId = String(
                entry.category_id || entry.categoryId || entry.catid ||
                (Array.isArray(entry.productCatIds) && entry.productCatIds[0]) ||
                (card && card.catid) || ''
            ).trim();
            var catName = String(entry.category_name || entry.categoryName || '').trim();
            var offerId = String(entry.offer_id || entry.offerId || '').trim();
            var offerType = String(entry.offer_type || entry.offerType || 'product_offer').trim();

            var key = shopId ? ('offer_' + shopId + '_' + itemId) : ('offer_' + itemId);
            return {
                _id: key,
                id: key,
                item_id: itemId,
                shop_id: shopId,
                product_name: productName,
                shop_name: shopName,
                price: price,
                price_min: priceMin,
                price_max: priceMax,
                original_price: originalPrice,
                commission_rate: totalRate,
                commission_amount: commAmt,
                seller_commission_rate: sellerRate,
                shopee_commission_rate: shopeeRate,
                sales: sales,
                rating_star: ratingStar,
                image_url: imageUrl,
                images: allImages.slice(0, 30),
                product_link: productLink,
                offer_link: offerLink,
                short_link: shortLink,
                category_id: catId,
                category_name: catName,
                offer_id: offerId,
                offer_type: offerType,
                period_start_time: Math.max(0, Math.round(Number(entry.period_start_time ?? entry.periodStartTime) || 0)),
                period_end_time: Math.max(0, Math.round(Number(entry.period_end_time ?? entry.periodEndTime) || 0)),
                source_url: sourceUrl || location.href
            };
        }

        function mergeIntoMap(item) {
            if (!item || !item.id) return false;
            var prev = state.offersMap[item.id];
            if (!prev) {
                state.offersMap[item.id] = item;
                state.dirtyKeys[item.id] = true;
                return true;
            }
            var mergedImgSet = {};
            var mergedImages = [];
            var combinedImgs = [].concat(
                Array.isArray(prev.images) ? prev.images : [],
                Array.isArray(item.images) ? item.images : [],
                item.image_url ? [item.image_url] : [],
                prev.image_url ? [prev.image_url] : []
            );
            for (var mi = 0; mi < combinedImgs.length; mi++) {
                var mu = String(combinedImgs[mi] || '').trim();
                if (mu && !mergedImgSet[mu]) {
                    mergedImgSet[mu] = true;
                    mergedImages.push(mu);
                }
            }
            var next = {
                ...prev,
                ...item,
                product_name: item.product_name || prev.product_name,
                shop_name: item.shop_name || prev.shop_name,
                price: item.price > 0 ? item.price : prev.price,
                price_min: item.price_min > 0 ? item.price_min : prev.price_min,
                price_max: item.price_max > 0 ? item.price_max : prev.price_max,
                original_price: item.original_price > 0 ? item.original_price : prev.original_price,
                commission_rate: item.commission_rate > 0 ? item.commission_rate : prev.commission_rate,
                commission_amount: item.commission_amount > 0 ? item.commission_amount : prev.commission_amount,
                seller_commission_rate: item.seller_commission_rate > 0 ? item.seller_commission_rate : prev.seller_commission_rate,
                shopee_commission_rate: item.shopee_commission_rate > 0 ? item.shopee_commission_rate : prev.shopee_commission_rate,
                sales: item.sales > 0 ? item.sales : prev.sales,
                rating_star: item.rating_star > 0 ? item.rating_star : prev.rating_star,
                image_url: item.image_url || prev.image_url,
                images: mergedImages.slice(0, 30),
                product_link: item.product_link || prev.product_link,
                offer_link: isRealAffiliateUrl(item.offer_link) ? item.offer_link : (isRealAffiliateUrl(prev.offer_link) ? prev.offer_link : ''),
                short_link: isRealAffiliateUrl(item.short_link) ? item.short_link : (isRealAffiliateUrl(prev.short_link) ? prev.short_link : '')
            };
            var changed = (
                next.price !== prev.price ||
                next.commission_rate !== prev.commission_rate ||
                next.commission_amount !== prev.commission_amount ||
                next.offer_link !== prev.offer_link ||
                next.image_url !== prev.image_url ||
                next.shop_name !== prev.shop_name ||
                (next.images ? next.images.length : 0) !== (prev.images ? prev.images.length : 0)
            );
            state.offersMap[item.id] = next;
            if (changed) state.dirtyKeys[item.id] = true;
            return changed;
        }

        function scanJsonForOffers(payload, apiUrl, depth) {
            if (!payload || typeof payload !== 'object' || depth > 7) return 0;
            var found = 0;

            if (Array.isArray(payload)) {
                var arrFound = 0;
                for (var i = 0; i < payload.length; i++) {
                    var norm = normalizeRawOffer(payload[i], location.href);
                    if (norm) {
                        mergeIntoMap(norm);
                        arrFound++;
                    } else if (payload[i] && typeof payload[i] === 'object' && depth < 4) {
                        found += scanJsonForOffers(payload[i], apiUrl, depth + 1);
                    }
                }
                if (arrFound > 0) {
                    if (arrFound >= 8) state.pageSize = arrFound;
                    found += arrFound;
                }
                return found;
            }

            if (typeof payload.total_count === 'number' && payload.total_count > 0) {
                state.totalCount = payload.total_count;
            } else if (typeof payload.totalCount === 'number' && payload.totalCount > 0) {
                state.totalCount = payload.totalCount;
            } else if (typeof payload.total === 'number' && payload.total > 20) {
                state.totalCount = payload.total;
            }
            if (typeof payload.has_more === 'boolean') state.hasMore = payload.has_more;
            if (typeof payload.hasNextPage === 'boolean') state.hasMore = payload.hasNextPage;

            var keys = Object.keys(payload);
            for (var k = 0; k < keys.length; k++) {
                var val = payload[keys[k]];
                if (val && typeof val === 'object') {
                    found += scanJsonForOffers(val, apiUrl, depth + 1);
                }
            }
            return found;
        }

        /**
         * Bộ tìm thanh phân trang đa tầng (hỗ trợ Ant Design, Shopee SSC, custom pager & nhận diện cấu trúc số trang 1, 2, 3...)
         */
        function isVisibleEl(el) {
            if (!el) return false;
            try {
                var rect = el.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return false;
                var st = window.getComputedStyle(el);
                return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
            } catch (_) {
                return true;
            }
        }

        function isDisabledEl(el) {
            if (!el) return true;
            try {
                if (el.disabled) return true;
                if (el.getAttribute('aria-disabled') === 'true') return true;
                var cls = String(el.className || '').toLowerCase();
                if (cls.includes('disabled') || cls.includes('ban') || cls.includes('inactive-btn')) return true;
                var parent = el.closest && el.closest('[aria-disabled="true"], [class*="disabled" i]');
                if (parent && parent !== document.body && parent !== document.documentElement) {
                    var pCls = String(parent.className || '').toLowerCase();
                    if (pCls.includes('next') || pCls.includes('page') || pCls.includes('btn') || pCls.includes('item')) {
                        return true;
                    }
                }
                var st = window.getComputedStyle(el);
                if (st.pointerEvents === 'none' || st.cursor === 'not-allowed') return true;
            } catch (_) {}
            return false;
        }

        function findPaginationInfo() {
            var container = null;
            var knownContainers = document.querySelectorAll(
                '.ant-pagination, .ssc-pagination, .shopee-page-controller, .page-container, [class*="pagination" i], [class*="pager" i], nav[aria-label*="pagination" i]'
            );

            // Chọn container phân trang đang hiển thị và có chứa ít nhất 2 số trang hoặc nút Next
            for (var i = 0; i < knownContainers.length; i++) {
                var c = knownContainers[i];
                if (!isVisibleEl(c)) continue;
                var nums = Array.from(c.querySelectorAll('li, button, a, span')).filter(function (el) {
                    return el.children.length === 0 && /^\\d{1,4}$/.test((el.textContent || '').trim()) && isVisibleEl(el);
                });
                if (nums.length >= 2) {
                    container = c;
                    break;
                }
            }

            // Fallback nhận diện cấu trúc: tìm bất kỳ khung nào chứa đồng thời các nút số "1" và "2" nằm cùng hàng ngang
            if (!container) {
                var allCandidates = Array.from(document.querySelectorAll('li, button, a, span, div')).filter(function (el) {
                    if (el.children.length > 1) return false;
                    var t = (el.textContent || '').trim();
                    return t === '1' || t === '2';
                });
                var ones = allCandidates.filter(function (el) { return (el.textContent || '').trim() === '1' && isVisibleEl(el); });
                var twos = allCandidates.filter(function (el) { return (el.textContent || '').trim() === '2' && isVisibleEl(el); });
                for (var oi = 0; oi < ones.length && !container; oi++) {
                    var r1 = ones[oi].getBoundingClientRect();
                    for (var ti = 0; ti < twos.length; ti++) {
                        var r2 = twos[ti].getBoundingClientRect();
                        if (Math.abs(r1.top - r2.top) < 28 && r2.left > r1.left && (r2.left - r1.left) < 160) {
                            var anc = ones[oi].parentElement;
                            for (var up = 0; up < 5 && anc; up++) {
                                if (anc.contains(twos[ti]) && anc.getBoundingClientRect().height < 140) {
                                    container = anc;
                                    break;
                                }
                                anc = anc.parentElement;
                            }
                            if (container) break;
                        }
                    }
                }
            }

            var currentPage = 0;
            var totalPages = 0;
            var pageElements = [];

            if (container) {
                var rawNodes = Array.from(container.querySelectorAll('li, button, a, span, div'));
                var seenNum = {};
                for (var ri = 0; ri < rawNodes.length; ri++) {
                    var el = rawNodes[ri];
                    if (!isVisibleEl(el)) continue;
                    // Chỉ lấy phần tử lá hoặc li bọc 1 nút số
                    if (el.children.length > 1) continue;
                    var txt = (el.textContent || '').trim();
                    if (!/^\\d{1,4}$/.test(txt)) continue;
                    var num = parseInt(txt, 10);
                    if (!isFinite(num) || num <= 0) continue;
                    if (num > totalPages) totalPages = num;
                    if (!seenNum[num]) {
                        seenNum[num] = el;
                        pageElements.push({ num: num, el: el });
                    }
                    // Nhận diện trang đang active
                    var cls = String(el.className || '').toLowerCase();
                    var pCls = el.parentElement ? String(el.parentElement.className || '').toLowerCase() : '';
                    if (
                        cls.includes('active') || cls.includes('current') || cls.includes('selected') ||
                        pCls.includes('active') || pCls.includes('current') || pCls.includes('selected') ||
                        el.getAttribute('aria-current') === 'page' ||
                        (el.parentElement && el.parentElement.getAttribute('aria-current') === 'page')
                    ) {
                        currentPage = num;
                    }
                }

                // Nếu không có class active -> phát hiện bằng màu nền/màu chữ khác biệt (ví dụ cam Shopee #ee4d2d)
                if (!currentPage && pageElements.length >= 2) {
                    var bgCounts = {};
                    pageElements.forEach(function (p) {
                        var st = window.getComputedStyle(p.el);
                        var sig = st.backgroundColor + '|' + st.color + '|' + st.borderColor;
                        p.sig = sig;
                        bgCounts[sig] = (bgCounts[sig] || 0) + 1;
                    });
                    var uniqueHighlighted = pageElements.find(function (p) { return bgCounts[p.sig] === 1; });
                    if (uniqueHighlighted) currentPage = uniqueHighlighted.num;
                }
            }

            // Đọc thêm tổng số trang từ chữ "1/50" hoặc "Trang 1 / 50" nếu có
            if (container) {
                var cText = (container.innerText || '').trim();
                var slashMatch = cText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
                if (slashMatch) {
                    var a = parseInt(slashMatch[1], 10);
                    var b = parseInt(slashMatch[2], 10);
                    if (isFinite(a) && a > 0 && !currentPage) currentPage = a;
                    if (isFinite(b) && b > totalPages) totalPages = b;
                }
            }

            if (!totalPages && state.totalCount > 0) {
                totalPages = Math.ceil(state.totalCount / (state.pageSize || 20));
            }
            if (!currentPage) currentPage = 1;

            // Tìm nút Next theo nhiều chiến lược
            var nextBtn = null;
            var scope = container || document;
            var explicitSelectors = [
                'li.ant-pagination-next button',
                'li.ant-pagination-next',
                '.ant-pagination-next',
                '.page-item.page-next',
                '.page-next',
                '.ssc-pagination-next',
                '.shopee-icon-button--right',
                'button[aria-label*="next" i]',
                'a[aria-label*="next" i]',
                '[title*="next" i]',
                '[title*="trang sau" i]',
                '[title*="tiếp" i]',
                '[class*="pagination" i] [class*="next" i]',
                '[class*="pager" i] [class*="next" i]'
            ];
            for (var si = 0; si < explicitSelectors.length; si++) {
                var cand = scope.querySelector(explicitSelectors[si]);
                if (cand && isVisibleEl(cand)) {
                    nextBtn = cand;
                    break;
                }
            }

            // Fallback tìm nút mũi tên > nằm bên phải số trang lớn nhất trong container
            if (!nextBtn && container && pageElements.length > 0) {
                var maxRight = 0;
                pageElements.forEach(function (p) {
                    var r = p.el.getBoundingClientRect();
                    if (r.right > maxRight) maxRight = r.right;
                });
                var clickables = Array.from(container.querySelectorAll('button, li, a, span')).filter(function (el) {
                    if (!isVisibleEl(el)) return false;
                    var r = el.getBoundingClientRect();
                    if (r.left < maxRight - 4) return false;
                    var t = (el.textContent || '').trim();
                    if (/^\\d+$/.test(t)) return false;
                    if (t === '>' || t === '›' || t === '»' || el.querySelector('svg, i')) {
                        return r.width <= 80 && r.height <= 60;
                    }
                    return false;
                });
                clickables.sort(function (a, b) {
                    return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
                });
                if (clickables.length > 0) {
                    nextBtn = clickables[0];
                }
            }

            var nextBtnEnabled = !!(nextBtn && !isDisabledEl(nextBtn));
            var targetNextNum = currentPage + 1;
            var numericNextEl = pageElements.find(function (p) { return p.num === targetNextNum; });
            var quickJumpInput = container ? container.querySelector('input[type="text"], input[type="number"], input:not([type])') : null;
            var hasMoreByTotal = totalPages > 0 && currentPage < totalPages;
            var hasNextPage = nextBtnEnabled || !!(numericNextEl && !isDisabledEl(numericNextEl.el)) || (!!quickJumpInput && hasMoreByTotal);

            return {
                container: container,
                currentPage: currentPage,
                totalPages: totalPages,
                pageElements: pageElements,
                nextBtn: nextBtn,
                nextBtnEnabled: nextBtnEnabled,
                numericNextEl: numericNextEl ? numericNextEl.el : null,
                quickJumpInput: quickJumpInput,
                hasPaginationBar: !!container,
                hasNextPage: hasNextPage
            };
        }

        function computeVisibleDomSignature(pInfo) {
            var parts = [];
            try {
                // Lấy 6 ảnh sản phẩm đầu tiên đang hiển thị
                var imgs = Array.from(document.querySelectorAll('img')).filter(function (im) {
                    var src = im.currentSrc || im.src || '';
                    return (src.includes('susercontent') || src.includes('shopee')) && im.getBoundingClientRect().width >= 60;
                }).slice(0, 6);
                for (var i = 0; i < imgs.length; i++) {
                    var s = imgs[i].currentSrc || imgs[i].src || '';
                    parts.push(s.slice(-24));
                }
                // Nếu chưa có ảnh -> lấy 6 đoạn text giá ₫ đầu tiên
                if (parts.length === 0) {
                    var links = Array.from(document.querySelectorAll('a[href*="/offer/product_offer/"], a[href*="shopee.vn/product/"]')).slice(0, 6);
                    for (var j = 0; j < links.length; j++) {
                        parts.push((links[j].getAttribute('href') || '').slice(-24));
                    }
                }
            } catch (_) {}
            return (pInfo ? pInfo.currentPage : 1) + '|' + parts.join(',') + '|' + (state.captureCount || 0) + '|' + location.search;
        }

        function scrollPageToBottom() {
            var prevY = window.scrollY;
            var maxH = Math.max(document.documentElement.scrollHeight || 0, document.body.scrollHeight || 0);
            window.scrollTo(0, maxH);
            var scrolledInner = false;
            var scrollables = Array.from(document.querySelectorAll('main, section, div')).filter(function (el) {
                try {
                    if (el.scrollHeight <= el.clientHeight + 180) return false;
                    var ov = window.getComputedStyle(el).overflowY;
                    return ov === 'auto' || ov === 'scroll';
                } catch (_) {
                    return false;
                }
            });
            for (var s = 0; s < scrollables.length; s++) {
                var el = scrollables[s];
                var before = el.scrollTop;
                el.scrollTop = el.scrollHeight;
                if (el.scrollTop > before) scrolledInner = true;
            }
            return (window.scrollY > prevY) || scrolledInner;
        }

        function checkBlockedPage() {
            var href = String(location.href || '');
            var lowerHref = href.toLowerCase();
            var bodyText = String((document.body && document.body.innerText) || '').slice(0, 6000);
            var lowerBody = bodyText.toLowerCase();

            if (
                lowerHref.includes('/login') ||
                lowerHref.includes('accounts.shopee') ||
                lowerHref.includes('/buyer/login') ||
                (document.querySelector('input[type="password"]') && !document.querySelector('[class*="offer"], [class*="product"]'))
            ) {
                return { blocked: 'login', message: 'Bạn chưa đăng nhập Shopee Affiliate trên Web Tools. Vui lòng đăng nhập rồi bấm đồng bộ lại.' };
            }

            if (
                lowerHref.includes('/verify') ||
                lowerHref.includes('captcha') ||
                document.querySelector('iframe[src*="captcha"], [class*="captcha" i][class*="modal" i], [id*="captcha" i]') ||
                lowerBody.includes('verify to continue') ||
                lowerBody.includes('kéo thanh trượt để xác minh') ||
                lowerBody.includes('vui lòng xác minh')
            ) {
                return { blocked: 'captcha', message: 'Shopee đang yêu cầu xác minh bảo mật trên Web Tools. Vui lòng xác minh thủ công trực tiếp trên cửa sổ rồi bấm đồng bộ lại.' };
            }
            return null;
        }

        window.__aiTypeShopeeHelpers = {
            normalizeRawOffer: normalizeRawOffer,
            mergeIntoMap: mergeIntoMap,
            findPaginationInfo: findPaginationInfo,
            computeVisibleDomSignature: computeVisibleDomSignature,
            scrollPageToBottom: scrollPageToBottom,
            checkBlockedPage: checkBlockedPage,
            isDisabledEl: isDisabledEl
        };

        if (window.__aiTypeShopeeOfferHookInstalled) return true;
        window.__aiTypeShopeeOfferHookInstalled = true;

        function handleTextResponse(url, text) {
            try {
                if (!url || !text || text.length < 20) return;
                var lowerUrl = String(url).toLowerCase();
                if (!lowerUrl.includes('/api/') && !lowerUrl.includes('offer') && !lowerUrl.includes('gql') && !lowerUrl.includes('product')) return;
                var trimmed = text.trim();
                if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;
                var json = JSON.parse(trimmed);
                var found = scanJsonForOffers(json, url, 0);
                if (found > 0) {
                    state.captureCount += found;
                    state.lastCaptureTs = Date.now();
                    state.lastApiUrl = String(url);
                }
            } catch (_) {}
        }

        if (typeof window.fetch === 'function') {
            var origFetch = window.fetch;
            window.fetch = function () {
                var reqUrl = '';
                try {
                    reqUrl = typeof arguments[0] === 'string' ? arguments[0] : (arguments[0] && arguments[0].url) || '';
                } catch (_) {}
                var p = origFetch.apply(this, arguments);
                try {
                    p.then(function (resp) {
                        try {
                            if (resp && resp.ok && typeof resp.clone === 'function') {
                                var ct = (resp.headers && resp.headers.get && resp.headers.get('content-type')) || '';
                                if (ct.includes('json') || String(reqUrl).includes('/api/') || String(reqUrl).includes('gql')) {
                                    resp.clone().text().then(function (txt) {
                                        handleTextResponse(reqUrl || resp.url, txt);
                                    }).catch(function () {});
                                }
                            }
                        } catch (_) {}
                    }).catch(function () {});
                } catch (_) {}
                return p;
            };
        }

        if (typeof window.XMLHttpRequest === 'function') {
            var origOpen = XMLHttpRequest.prototype.open;
            var origSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (method, url) {
                try { this.__aiTypeUrl = url; } catch (_) {}
                return origOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function () {
                try {
                    var xhr = this;
                    xhr.addEventListener('load', function () {
                        try {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                if (!xhr.responseType || xhr.responseType === 'text') {
                                    handleTextResponse(xhr.__aiTypeUrl || xhr.responseURL, xhr.responseText);
                                } else if (xhr.responseType === 'json' && xhr.response) {
                                    var found = scanJsonForOffers(xhr.response, xhr.__aiTypeUrl || xhr.responseURL, 0);
                                    if (found > 0) {
                                        state.captureCount += found;
                                        state.lastCaptureTs = Date.now();
                                        state.lastApiUrl = String(xhr.__aiTypeUrl || xhr.responseURL || '');
                                    }
                                }
                            }
                        } catch (_) {}
                    });
                } catch (_) {}
                return origSend.apply(this, arguments);
            };
        }
        return true;
    } catch (e) {
        return false;
    }
})();
`;

/**
 * Chuẩn bị phiên đồng bộ mới chính xác từ trang 1 của https://affiliate.shopee.vn/offer/product_offer:
 * - Nếu đang ở trang > 1, tự động quay về trang 1 trước để quét đầy đủ 100% sản phẩm
 * - Chỉ giữ lại các offer thuộc đúng URL hiện tại, loại bỏ cache cũ từ các trang khác
 */
const SHOPEE_BEGIN_SYNC_SCRIPT = `
(function () {
    var state = window.__aiTypeShopeeOfferState;
    var h = window.__aiTypeShopeeHelpers;
    var curPage = 1;
    var jumpedToFirst = false;

    if (h) {
        h.scrollPageToBottom();
        var pInfo = h.findPaginationInfo();
        curPage = pInfo.currentPage || 1;
        if (curPage > 1 && pInfo.hasPaginationBar) {
            var p1 = pInfo.pageElements.find(function (p) { return p.num === 1; });
            if (p1 && p1.el) {
                try {
                    p1.el.scrollIntoView({ behavior: 'instant', block: 'center' });
                    var target = p1.el.querySelector && p1.el.querySelector('button, a') ? p1.el.querySelector('button, a') : p1.el;
                    target.click();
                    jumpedToFirst = true;
                } catch (_) {}
            }
        }
    }

    if (state) {
        if (jumpedToFirst) {
            state.offersMap = {};
            state.dirtyKeys = {};
        } else if (state.offersMap) {
            var curHref = String(location.href || '');
            var filtered = {};
            var dirty = {};
            Object.keys(state.offersMap).forEach(function (k) {
                var item = state.offersMap[k];
                if (item && (!item.source_url || String(item.source_url) === curHref)) {
                    filtered[k] = item;
                    dirty[k] = true;
                }
            });
            state.offersMap = filtered;
            state.dirtyKeys = dirty;
        }
    }
    return { jumpedToFirst: jumpedToFirst, previousPage: curPage, startedOnFirstPage: curPage === 1 || jumpedToFirst };
})();
`;

/**
 * Probe siêu nhẹ (< 500 bytes) để kiểm tra trang mới đã chuyển xong chưa mà không serialize lại toàn bộ sản phẩm.
 */
const SHOPEE_PAGE_PROBE_SCRIPT = `
(function () {
    try {
        var h = window.__aiTypeShopeeHelpers;
        if (!h) return { ready: false };
        var blocked = h.checkBlockedPage();
        if (blocked) return blocked;
        var pInfo = h.findPaginationInfo();
        var state = window.__aiTypeShopeeOfferState || {};
        return {
            blocked: null,
            url: String(location.href || ''),
            currentPage: pInfo.currentPage,
            totalPages: pInfo.totalPages,
            hasPaginationBar: pInfo.hasPaginationBar,
            hasNextPage: pInfo.hasNextPage,
            captureCount: state.captureCount || 0,
            lastCaptureTs: state.lastCaptureTs || 0,
            pageSignature: h.computeVisibleDomSignature(pInfo)
        };
    } catch (e) {
        return { error: String(e && e.message || e) };
    }
})();
`;

/**
 * Trích xuất DELTA sản phẩm mới/cập nhật trên trang hiện tại (O(pageSize) cho mọi trang, không chậm khi đồng bộ hàng trăm trang):
 * 1) Cuộn xuống cuối trang để render đủ thẻ sản phẩm lazy và thanh phân trang
 * 2) Gom dữ liệu từ Network Hook + React Fiber (hỗ trợ cả thẻ div lẫn thẻ a) + DOM card fallback
 * 3) Chỉ trả về danh sách sản phẩm mới/thay đổi từ lần quét trước
 */
const SHOPEE_EXTRACT_PAGE_SCRIPT = `
(function () {
    try {
        var h = window.__aiTypeShopeeHelpers;
        if (!h) return { error: 'Hook chưa được khởi tạo.' };

        var blocked = h.checkBlockedPage();
        if (blocked) return blocked;

        var href = String(location.href || '');
        var state = window.__aiTypeShopeeOfferState || { offersMap: {}, dirtyKeys: {}, captureCount: 0, lastCaptureTs: 0, totalCount: 0 };
        if (!state.dirtyKeys) state.dirtyKeys = {};

        // 1. Cuộn xuống cuối để render đủ ảnh/card lazy và thanh phân trang phía dưới
        h.scrollPageToBottom();

        // 2. Quét React Fiber từ cả card theo class, link offer, lẫn thẻ ảnh sản phẩm Shopee (hỗ trợ card không dùng thẻ <a>)
        var fiberFound = 0;
        var cardRoots = Array.from(document.querySelectorAll(
            '[class*="product-offer" i], [class*="offer-card" i], [class*="product-card" i], [class*="item-card" i], a[href*="/offer/product_offer/"], a[href*="shopee.vn/product/"]'
        ));
        // Bổ sung ảnh sản phẩm Shopee kích thước lớn (>= 80px) để bao phủ trường hợp card dùng class hash
        var prodImgs = Array.from(document.querySelectorAll('img')).filter(function (im) {
            var src = im.currentSrc || im.src || '';
            var r = im.getBoundingClientRect();
            return (src.includes('susercontent') || src.includes('shopee')) && r.width >= 80 && r.height >= 80;
        });
        for (var ii = 0; ii < prodImgs.length && ii < 120; ii++) {
            cardRoots.push(prodImgs[ii]);
        }

        var visited = new Set();
        for (var c = 0; c < cardRoots.length && c < 350; c++) {
            var cur = cardRoots[c];
            for (var up = 0; up < 5 && cur; up++) {
                var keys = Object.keys(cur);
                for (var ki = 0; ki < keys.length; ki++) {
                    var k = keys[ki];
                    if (k.startsWith('__reactProps$') || k.startsWith('__reactFiber$')) {
                        var queue = [cur[k]];
                        var steps = 0;
                        while (queue.length > 0 && steps < 24) {
                            steps++;
                            var obj = queue.shift();
                            if (!obj || typeof obj !== 'object' || visited.has(obj)) continue;
                            visited.add(obj);
                            var candidateProps = obj.memoizedProps || obj;
                            if (candidateProps && typeof candidateProps === 'object') {
                                var direct = h.normalizeRawOffer(candidateProps, href);
                                if (direct) {
                                    h.mergeIntoMap(direct);
                                    fiberFound++;
                                }
                                var subKeys = ['item', 'data', 'product', 'offer', 'record', 'card', 'info', 'itemData', 'productOffer', 'offerItem'];
                                for (var sk = 0; sk < subKeys.length; sk++) {
                                    var sub = candidateProps[subKeys[sk]];
                                    if (sub && typeof sub === 'object') {
                                        var subNorm = h.normalizeRawOffer(sub, href);
                                        if (subNorm) {
                                            h.mergeIntoMap(subNorm);
                                            fiberFound++;
                                        }
                                    }
                                }
                            }
                            if (obj.return && steps < 10) queue.push(obj.return);
                        }
                    }
                }
                cur = cur.parentElement;
            }
        }

        // 3. DOM card fallback (cả thẻ <a> lẫn card bọc ảnh sản phẩm)
        function parseVndText(txt) {
            if (!txt) return 0;
            var m = String(txt).match(/[₫đ]\\s*([\\d.,]+)|([\\d.,]+)\\s*[₫đ]/i);
            if (!m) return 0;
            var raw = (m[1] || m[2] || '').replace(/[.,\\s]/g, '');
            var n = parseInt(raw, 10);
            return isFinite(n) ? n : 0;
        }
        function parseSoldText(txt) {
            if (!txt) return 0;
            var m = String(txt).match(/(?:đã bán|sold)\\s*([\\d.,]+)\\s*([kKmM])?/i);
            if (!m) return 0;
            var num = parseFloat(m[1].replace(',', '.'));
            if (!isFinite(num)) return 0;
            var unit = (m[2] || '').toLowerCase();
            if (unit === 'k') num *= 1000;
            else if (unit === 'm') num *= 1000000;
            return Math.round(num);
        }

        var domVisibleCount = 0;
        var domAnchors = Array.from(document.querySelectorAll(
            'a[href*="/offer/product_offer/"], a[href*="shopee.vn/product/"], a[href*="-i."]'
        ));
        var seenDomKeys = new Set();
        var existingByItemId = {};
        Object.keys(state.offersMap).forEach(function (k) {
            var it = state.offersMap[k];
            if (it && it.item_id) existingByItemId[it.item_id] = k;
        });

        for (var i = 0; i < domAnchors.length; i++) {
            var a = domAnchors[i];
            var linkHref = a.href || a.getAttribute('href') || '';
            var itemId = '';
            var shopId = '';

            var mOffer = linkHref.match(/\\/offer\\/product_offer\\/(\\d+)/);
            var mProd = linkHref.match(/\\/product\\/(\\d+)\\/(\\d+)/);
            var mSlug = linkHref.match(/-i\\.(\\d+)\\.(\\d+)/);
            if (mProd) { shopId = mProd[1]; itemId = mProd[2]; }
            else if (mSlug) { shopId = mSlug[1]; itemId = mSlug[2]; }
            else if (mOffer) { itemId = mOffer[1]; }

            if (!itemId) continue;
            var domKey = shopId ? ('offer_' + shopId + '_' + itemId) : ('offer_' + itemId);
            if (seenDomKeys.has(domKey)) continue;

            var container = a;
            for (var p = 0; p < 5; p++) {
                if (!container.parentElement) break;
                var parentLinks = container.parentElement.querySelectorAll('a[href*="/offer/product_offer/"], a[href*="shopee.vn/product/"], a[href*="-i."]').length;
                if (parentLinks > 2) break;
                container = container.parentElement;
                var pt = (container.innerText || '').trim();
                if (pt.includes('₫') || pt.includes('%')) break;
            }

            var txt = (container.innerText || '').trim();
            var lines = txt.split(/\\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
            var title = '';
            for (var li = 0; li < lines.length; li++) {
                var ln = lines[li];
                if (ln.length >= 8 && !ln.startsWith('₫') && !ln.match(/^\\d+[.,]?\\d*%$/) && !ln.toLowerCase().startsWith('hoa hồng') && !ln.toLowerCase().startsWith('lấy link')) {
                    title = ln;
                    break;
                }
            }
            if (!title) title = (a.getAttribute('title') || a.innerText || '').trim();
            if (!title) continue;

            seenDomKeys.add(domKey);
            domVisibleCount++;

            var imgEl = container.querySelector('img');
            var imgUrl = imgEl ? (imgEl.currentSrc || imgEl.src || imgEl.getAttribute('data-src') || '') : '';
            var rateMatch = txt.match(/(\\d+(?:[.,]\\d+)?)\\s*%/);
            var commRate = rateMatch ? parseFloat(rateMatch[1].replace(',', '.')) : 0;
            var priceMatches = txt.match(/[₫đ]\\s*[\\d.,]+|[\\d.,]+\\s*[₫đ]/gi) || [];
            var price = priceMatches.length > 0 ? parseVndText(priceMatches[0]) : 0;
            var commAmt = 0;
            for (var pm = 0; pm < lines.length; pm++) {
                if (lines[pm].toLowerCase().includes('hoa hồng') || lines[pm].toLowerCase().includes('commission')) {
                    commAmt = parseVndText(lines[pm]) || (lines[pm + 1] ? parseVndText(lines[pm + 1]) : 0);
                    if (commAmt) break;
                }
            }
            if (!commAmt && price > 0 && commRate > 0) {
                commAmt = Math.round((price * commRate) / 100);
            }

            var productLink = (shopId && itemId)
                ? ('https://shopee.vn/product/' + shopId + '/' + itemId)
                : (linkHref.startsWith('http') ? linkHref : ('https://affiliate.shopee.vn' + linkHref));

            var matchedKey = existingByItemId[itemId];
            if (matchedKey && state.offersMap[matchedKey]) {
                var ex = state.offersMap[matchedKey];
                var patched = false;
                if (!ex.image_url && imgUrl) { ex.image_url = imgUrl; patched = true; }
                if (!ex.product_name && title) { ex.product_name = title; patched = true; }
                if (!ex.price && price) { ex.price = price; patched = true; }
                if (!ex.commission_rate && commRate) { ex.commission_rate = commRate; patched = true; }
                if (!ex.commission_amount && commAmt) { ex.commission_amount = commAmt; patched = true; }
                if (patched) state.dirtyKeys[matchedKey] = true;
            } else {
                state.offersMap[domKey] = {
                    _id: domKey,
                    id: domKey,
                    item_id: itemId,
                    shop_id: shopId,
                    product_name: title,
                    shop_name: '',
                    price: price,
                    price_min: price,
                    price_max: price,
                    original_price: 0,
                    commission_rate: isFinite(commRate) ? commRate : 0,
                    commission_amount: commAmt,
                    seller_commission_rate: 0,
                    shopee_commission_rate: 0,
                    sales: parseSoldText(txt),
                    rating_star: 0,
                    image_url: imgUrl,
                    product_link: productLink,
                    offer_link: '',
                    short_link: '',
                    source_url: href
                };
                state.dirtyKeys[domKey] = true;
                existingByItemId[itemId] = domKey;
            }
        }

        // Chỉ gom các sản phẩm MỚI hoặc CẬP NHẬT (delta) để truyền qua IPC cực nhanh
        var deltaKeys = Object.keys(state.dirtyKeys);
        var deltaOffers = [];
        for (var dk = 0; dk < deltaKeys.length; dk++) {
            var itemObj = state.offersMap[deltaKeys[dk]];
            if (itemObj) deltaOffers.push(itemObj);
        }
        state.dirtyKeys = {};

        var pInfo = h.findPaginationInfo();

        return {
            blocked: null,
            url: href,
            deltaOffers: deltaOffers,
            totalInMap: Object.keys(state.offersMap).length,
            domVisibleCount: Math.max(domVisibleCount, prodImgs.length),
            fiberFound: fiberFound,
            captureCount: state.captureCount || 0,
            lastCaptureTs: state.lastCaptureTs || 0,
            currentPage: pInfo.currentPage,
            totalPages: pInfo.totalPages,
            hasPaginationBar: pInfo.hasPaginationBar,
            hasNextPage: pInfo.hasNextPage,
            pageSignature: h.computeVisibleDomSignature(pInfo)
        };
    } catch (e) {
        return { error: String(e && e.message || e) };
    }
})();
`;

/**
 * Script chuyển sang trang kế tiếp với 5 tầng chiến lược:
 * 1) Cuộn xuống cuối để đảm bảo thanh phân trang hiện rõ
 * 2) Click nút số trang (currentPage + 1) hoặc nút Next (ưu tiên thử lần 2 bằng chiến lược khác nếu preferNumeric=true)
 * 3) Nhập số trang vào ô Quick Jumper nếu có
 * 4) Nếu trang không có thanh phân trang -> cuộn xuống cuối danh sách (infinite scroll)
 */
function buildAdvancePageScript(expectedNextPage: number, preferNumeric: boolean): string {
    return `
(function () {
    try {
        var h = window.__aiTypeShopeeHelpers;
        if (!h) return { mode: 'error', error: 'Hook chưa sẵn sàng' };

        var expectedNext = ${Math.max(2, Math.floor(expectedNextPage || 2))};
        var preferNumeric = ${preferNumeric ? 'true' : 'false'};

        function triggerClick(el) {
            if (!el) return false;
            try { el.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
            try {
                var target = el.querySelector && el.querySelector('button, a') ? el.querySelector('button, a') : el;
                target.click();
                return true;
            } catch (_) {
                try { el.click(); return true; } catch (_2) { return false; }
            }
        }

        function triggerQuickJump(inputEl, targetPage) {
            if (!inputEl) return false;
            try {
                inputEl.scrollIntoView({ behavior: 'instant', block: 'center' });
                inputEl.focus();
                var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                if (nativeSetter) {
                    nativeSetter.call(inputEl, String(targetPage));
                } else {
                    inputEl.value = String(targetPage);
                }
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                var keyOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
                inputEl.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
                inputEl.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
                inputEl.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
                inputEl.blur();
                return true;
            } catch (_) {
                return false;
            }
        }

        // Luôn cuộn xuống cuối trước để thanh phân trang không bị ẩn/lazy
        var scrolled = h.scrollPageToBottom();
        var pInfo = h.findPaginationInfo();
        var targetPage = Math.max(expectedNext, (pInfo.currentPage || 1) + 1);

        if (pInfo.hasPaginationBar) {
            var numericEl = pInfo.pageElements.find(function (p) { return p.num === targetPage; });
            var numericReady = !!(numericEl && !h.isDisabledEl(numericEl.el));

            if (preferNumeric && numericReady) {
                if (triggerClick(numericEl.el)) {
                    return { mode: 'pagination', strategy: 'numeric', clicked: true, targetPage: targetPage, currentPage: pInfo.currentPage, totalPages: pInfo.totalPages };
                }
            }

            if (pInfo.nextBtnEnabled && pInfo.nextBtn) {
                if (triggerClick(pInfo.nextBtn)) {
                    return { mode: 'pagination', strategy: 'next_btn', clicked: true, targetPage: targetPage, currentPage: pInfo.currentPage, totalPages: pInfo.totalPages };
                }
            }

            if (numericReady) {
                if (triggerClick(numericEl.el)) {
                    return { mode: 'pagination', strategy: 'numeric_fallback', clicked: true, targetPage: targetPage, currentPage: pInfo.currentPage, totalPages: pInfo.totalPages };
                }
            }

            if (pInfo.quickJumpInput && (pInfo.totalPages === 0 || targetPage <= pInfo.totalPages)) {
                if (triggerQuickJump(pInfo.quickJumpInput, targetPage)) {
                    return { mode: 'pagination', strategy: 'quick_jump', clicked: true, targetPage: targetPage, currentPage: pInfo.currentPage, totalPages: pInfo.totalPages };
                }
            }

            // Đã ở trang cuối của thanh phân trang
            return { mode: 'pagination_end', clicked: false, currentPage: pInfo.currentPage, totalPages: pInfo.totalPages };
        }

        // Không có thanh phân trang -> chế độ cuộn vô hạn (infinite scroll)
        return {
            mode: 'scroll',
            clicked: false,
            scrolled: scrolled
        };
    } catch (e) {
        return { mode: 'error', error: String(e && e.message || e) };
    }
})();
`;
}

@Injectable({
    providedIn: 'root',
})
export class ShopeeOffersService {
    private readonly year = 2023;
    private config: AppConfig;
    private user: User;
    private _cancelRequested = false;

    private _syncStateSubject = new BehaviorSubject<ShopeeOfferSyncState>({
        ...INITIAL_SYNC_STATE,
    });
    public readonly syncState$ = this._syncStateSubject.asObservable();

    constructor(
        private http: HttpClient,
        private _h: HelperService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService,
        private toastr: ToastrService,
    ) {
        this._userService.user$.subscribe((user: User) => {
            this.user = user;
        });
        this._fuseConfigService.config$.subscribe((config: AppConfig) => {
            this.config = config;
        });
    }

    get currentState(): ShopeeOfferSyncState {
        return this._syncStateSubject.value;
    }

    private updateState(patch: Partial<ShopeeOfferSyncState>): void {
        this._syncStateSubject.next({
            ...this._syncStateSubject.value,
            ...patch,
        });
    }

    dismissStatusMessage(): void {
        this.updateState({ lastFinishedMessage: '', error: '' });
    }

    stopSync(): void {
        if (this._syncStateSubject.value.isSyncing) {
            this._cancelRequested = true;
            this.updateState({
                statusText: 'Đang dừng và lưu các sản phẩm đã thu thập...',
            });
        }
    }

    private getUsername(): string {
        return (
            this.user?.name ||
            this.multiAccountService.getItem('username') ||
            localStorage.getItem('username') ||
            'admin'
        );
    }

    private getActiveToken(): string | null {
        const raw = this.multiAccountService.getItem('active_info');
        if (!raw) return null;
        const parsed = AuthUtils._getActiveInfo(raw);
        return parsed?.user?.appToken || null;
    }

    private getApiBase(): string | null {
        const serverKey = this.user?.server;
        if (!this.config?.settings?.api || !serverKey) return null;
        return this.config.settings.api[serverKey] || null;
    }

    async installWebviewHook(webview: any): Promise<boolean> {
        if (!webview || typeof webview.executeJavaScript !== 'function') {
            return false;
        }
        try {
            const ok = await webview.executeJavaScript(SHOPEE_OFFER_HOOK_SCRIPT);
            return !!ok;
        } catch (_) {
            return false;
        }
    }

    async persistBatch(
        offers: ShopeeOfferItem[],
        username: string,
        sourceUrl: string,
    ): Promise<{ serverSaved: number; localSaved: number; totalInDb: number; serverOk: boolean }> {
        if (!offers || offers.length === 0) {
            return { serverSaved: 0, localSaved: 0, totalInDb: 0, serverOk: false };
        }

        let serverSaved = 0;
        let localSaved = 0;
        let totalInDb = 0;
        let serverOk = false;

        const apiBase = this.getApiBase();
        const appToken = this.getActiveToken();
        if (apiBase && appToken && this.config?.settings?.gen) {
            try {
                const payload = {
                    username,
                    year: this.year,
                    appId: 'ai.typing',
                    appToken,
                    sourceUrl,
                    offers,
                };
                const res: any = await firstValueFrom(
                    this.http
                        .post<any>(
                            `${apiBase}/crawl/shopee/offers/sync`,
                            { params: this._h.encrypt(payload, this.config.settings.gen) },
                            HTTP_OPTIONS,
                        )
                        .pipe(catchError(() => of(null))),
                );
                const data = res?.data || res;
                if (data && (data.success || data.uniqueProcessed >= 0)) {
                    serverOk = true;
                    serverSaved = (data.inserted || 0) + (data.updated || 0);
                    if (typeof data.totalInDb === 'number') {
                        totalInDb = data.totalInDb;
                    }
                }
            } catch (_) {}
        }

        const electron = (window as any).electron;
        if (electron?.saveLocalShopeeOffers) {
            try {
                const localRes = await electron.saveLocalShopeeOffers({
                    username,
                    sourceUrl,
                    offers,
                });
                if (localRes?.success) {
                    localSaved = localRes.saved || offers.length;
                    if (!totalInDb && typeof localRes.totalInDb === 'number') {
                        totalInDb = localRes.totalInDb;
                    }
                }
            } catch (_) {}
        }

        return { serverSaved, localSaved, totalInDb, serverOk };
    }

    private mergeUniqueImageUrls(...lists: Array<string[] | string | undefined>): string[] {
        const seen = new Set<string>();
        const out: string[] = [];
        const pushOne = (raw: any) => {
            const u = String(raw || '').trim();
            if (!u || !/^https?:\/\//i.test(u)) return;
            const fk = (u.split('/file/')[1] || u)
                .split('@')[0]
                .split('?')[0]
                .replace(/_tn(?=\.[a-z0-9]+$|$)/i, '')
                .replace(/\.(?:webp|jpg|jpeg|png)$/i, '')
                .toLowerCase();
            if (!seen.has(fk)) {
                seen.add(fk);
                out.push(u);
            }
        };
        for (const item of lists) {
            if (Array.isArray(item)) {
                item.forEach(pushOne);
            } else if (typeof item === 'string') {
                pushOne(item);
            }
        }
        return out.slice(0, 30);
    }

    isRealAffiliateLink(url?: string | null): boolean {
        const s = String(url || '').trim().toLowerCase();
        if (!s || !/^https?:\/\//.test(s)) return false;
        return (
            s.includes('s.shopee.vn/') ||
            s.includes('shope.ee/') ||
            s.includes('shp.ee/') ||
            s.includes('utm_source=an_') ||
            s.includes('utm_medium=affiliates') ||
            s.includes('mmp_pid=an_')
        );
    }

    getBestAffiliateLink(item?: Partial<ShopeeOfferItem> | null): string {
        if (!item) return '';
        if (this.isRealAffiliateLink(item.short_link)) return String(item.short_link).trim();
        if (this.isRealAffiliateLink(item.offer_link)) return String(item.offer_link).trim();
        return '';
    }

    private getAffiliateConfig(override?: any): {
        shopeeAppId: string;
        shopeeSecret: string;
        shopeeSubId: string;
        shopeeCookie: string;
    } {
        const savedSettings = getSettings() || {};
        const stored = savedSettings?.affiliate || this.multiAccountService.getItem('affiliate_config') || {};
        const merged = { ...(stored || {}), ...(override || {}) };
        return {
            shopeeAppId: String(merged.shopeeAppId || '').trim(),
            shopeeSecret: String(merged.shopeeSecret || '').trim(),
            shopeeSubId: String(merged.shopeeSubId || '').trim(),
            shopeeCookie: String(merged.shopeeCookie || '').trim(),
        };
    }

    findShopeeAffiliateWebview(): any {
        try {
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
        } catch (_) {
            return null;
        }
    }

    private getOfferLookupKey(item: Partial<ShopeeOfferItem>): string {
        if (!item) return '';
        if (item._id) return String(item._id);
        if (item.id) return String(item.id);
        if (item.shop_id && item.item_id) return `offer_${item.shop_id}_${item.item_id}`;
        if (item.item_id) return `offer_${item.item_id}`;
        return String(item.product_link || '');
    }

    private getCanonicalOriginUrl(item: Partial<ShopeeOfferItem>): string {
        const shopId = String(item?.shop_id || '').trim();
        const itemId = String(item?.item_id || '').trim();
        if (shopId && itemId) {
            return `https://shopee.vn/product/${shopId}/${itemId}`;
        }
        return String(item?.product_link || '').trim();
    }

    private async generateAffiliateLinksInWebview(
        webview: any,
        items: ShopeeOfferItem[],
        subId: string,
    ): Promise<{
        links: Array<{ id: string; item_id: string; shop_id: string; short_link: string; offer_link: string }>;
        needLogin: boolean;
        error: string;
    }> {
        if (!webview || typeof webview.executeJavaScript !== 'function' || !items.length) {
            return { links: [], needLogin: false, error: '' };
        }
        const batchInput = items
            .map((it) => ({
                id: this.getOfferLookupKey(it),
                item_id: String(it.item_id || ''),
                shop_id: String(it.shop_id || ''),
                originUrl: this.getCanonicalOriginUrl(it),
            }))
            .filter((x) => !!x.originUrl);

        if (batchInput.length === 0) {
            return { links: [], needLogin: false, error: '' };
        }

        const script = `
        (async function () {
            try {
                var items = ${JSON.stringify(batchInput)};
                var subId = ${JSON.stringify(String(subId || '').trim().slice(0, 64))};
                var isAff = function (raw) {
                    var s = String(raw || '').trim().toLowerCase();
                    if (!s || !(s.startsWith('http://') || s.startsWith('https://'))) return false;
                    return s.includes('s.shopee.vn/') || s.includes('shope.ee/') || s.includes('shp.ee/') || s.includes('utm_source=an_') || s.includes('utm_medium=affiliates') || s.includes('mmp_pid=an_');
                };
                var csrf = '';
                try {
                    var cm = String(document.cookie || '').match(/(?:^|;\\s*)(?:csrftoken|SPC_CSRF_TOKEN)=([^;\\s]+)/i);
                    if (cm && cm[1]) csrf = cm[1].trim();
                } catch (_) {}

                var headers = {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'Accept': 'application/json, text/plain, */*',
                    'affiliate-program-type': '1'
                };
                if (csrf) {
                    headers['csrf-token'] = csrf;
                    headers['x-csrftoken'] = csrf;
                }

                var variants = [
                    {
                        operationName: 'batchGetCustomLink',
                        query: 'query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) { batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) { shortLink longLink failCode } }',
                        variables: {
                            linkParams: items.map(function (x) {
                                return { originalLink: x.originUrl, advancedLinkParams: subId ? { subId1: subId } : {} };
                            }),
                            sourceCaller: 'CUSTOM_LINK_CALLER'
                        }
                    },
                    {
                        operationName: 'batchGetCustomLink',
                        query: 'query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) { batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) { shortLink longLink failCode } }',
                        variables: {
                            linkParams: items.map(function (x) {
                                return subId ? { originalLink: x.originUrl, subId1: subId } : { originalLink: x.originUrl };
                            }),
                            sourceCaller: 'DEFAULT'
                        }
                    },
                    {
                        operationName: 'batchGetCustomLink',
                        query: 'query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) { batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) { shortLink longLink failCode } }',
                        variables: {
                            linkParams: items.map(function (x) {
                                return subId ? { longLink: x.originUrl, subId1: subId } : { longLink: x.originUrl };
                            }),
                            sourceCaller: 'DEFAULT'
                        }
                    }
                ];

                var lastErr = '';
                var needLogin = false;
                for (var vi = 0; vi < variants.length; vi++) {
                    var resp = await fetch('https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink', {
                        method: 'POST',
                        credentials: 'include',
                        headers: headers,
                        body: JSON.stringify(variants[vi])
                    });
                    if (resp.status === 401 || resp.status === 403) {
                        needLogin = true;
                        lastErr = 'Phiên đăng nhập affiliate.shopee.vn đã hết hạn (HTTP ' + resp.status + ').';
                        break;
                    }
                    if (!resp.ok) {
                        lastErr = 'HTTP ' + resp.status;
                        continue;
                    }
                    var ct = String(resp.headers.get('content-type') || '');
                    if (!ct.includes('json')) {
                        needLogin = true;
                        lastErr = 'Cần đăng nhập affiliate.shopee.vn trên Web Tools.';
                        break;
                    }
                    var data = await resp.json();
                    var arr = data && data.data && data.data.batchCustomLink;
                    if (Array.isArray(arr) && arr.length > 0) {
                        var out = [];
                        for (var i = 0; i < Math.min(items.length, arr.length); i++) {
                            var r = arr[i];
                            if (!r) continue;
                            var sl = isAff(r.shortLink) ? String(r.shortLink).trim() : '';
                            var ll = isAff(r.longLink) ? String(r.longLink).trim() : '';
                            if (sl || ll) {
                                out.push({
                                    id: items[i].id,
                                    item_id: items[i].item_id,
                                    shop_id: items[i].shop_id,
                                    short_link: sl,
                                    offer_link: sl || ll
                                });
                            } else if (r.failCode) {
                                lastErr = 'Shopee failCode=' + r.failCode;
                            }
                        }
                        if (out.length > 0) {
                            return { links: out, needLogin: false, error: '' };
                        }
                    }
                    if (data && Array.isArray(data.errors) && data.errors.length > 0) {
                        lastErr = String(data.errors[0].message || 'Lỗi GraphQL');
                        if (/unauth|login|forbidden|permission|token/i.test(lastErr)) {
                            needLogin = true;
                            break;
                        }
                    }
                }
                return { links: [], needLogin: needLogin, error: lastErr };
            } catch (e) {
                return { links: [], needLogin: false, error: String(e && e.message || e) };
            }
        })();
        `;

        try {
            const res = await webview.executeJavaScript(script);
            if (res && Array.isArray(res.links)) {
                return {
                    links: res.links,
                    needLogin: !!res.needLogin,
                    error: String(res.error || ''),
                };
            }
        } catch (err: any) {
            return { links: [], needLogin: false, error: err?.message || '' };
        }
        return { links: [], needLogin: false, error: '' };
    }

    /**
     * Tạo link tiếp thị liên kết Shopee Affiliate thật (dạng https://s.shopee.vn/...) cho 1 hoặc nhiều sản phẩm:
     * - Ưu tiên 1: Shopee Open API (nếu đã cấu hình App ID + Secret)
     * - Ưu tiên 2: Gọi trực tiếp batchCustomLink trong webview affiliate.shopee.vn đang mở trên Web Tools
     * - Ưu tiên 3: Gọi qua Electron IPC sử dụng phiên đăng nhập persist:gemini-webview hoặc Cookie đã lưu
     */
    async generateAffiliateLinks(
        items: ShopeeOfferItem[],
        options?: {
            webview?: any;
            persist?: boolean;
            username?: string;
            configOverride?: any;
        },
    ): Promise<{
        generatedCount: number;
        linksById: Map<string, { short_link: string; offer_link: string }>;
        needLogin: boolean;
        error: string;
    }> {
        const linksById = new Map<string, { short_link: string; offer_link: string }>();
        const targetItems = (Array.isArray(items) ? items : []).filter((it) => !!it && !this.getBestAffiliateLink(it));
        if (targetItems.length === 0) {
            return { generatedCount: 0, linksById, needLogin: false, error: '' };
        }

        const cfg = this.getAffiliateConfig(options?.configOverride);
        const electron = (window as any).electron;
        const itemByKey = new Map<string, ShopeeOfferItem>();
        const itemByItemId = new Map<string, ShopeeOfferItem>();
        for (const it of targetItems) {
            const k = this.getOfferLookupKey(it);
            if (k) itemByKey.set(k, it);
            if (it.item_id) itemByItemId.set(String(it.item_id), it);
        }

        const applyGeneratedList = (list: Array<{ id?: string; item_id?: string; short_link?: string; offer_link?: string }>) => {
            for (const row of list || []) {
                const sl = this.isRealAffiliateLink(row?.short_link) ? String(row.short_link).trim() : '';
                const ol = sl || (this.isRealAffiliateLink(row?.offer_link) ? String(row.offer_link).trim() : '');
                if (!ol) continue;
                const matched =
                    (row.id ? itemByKey.get(String(row.id)) : undefined) ||
                    (row.item_id ? itemByItemId.get(String(row.item_id)) : undefined);
                if (matched) {
                    matched.short_link = sl || matched.short_link || '';
                    matched.offer_link = ol;
                    const key = this.getOfferLookupKey(matched);
                    linksById.set(key, { short_link: matched.short_link || '', offer_link: ol });
                }
            }
        };

        let lastError = '';
        let needLogin = false;

        // 1. Nếu có Open API App ID + Secret -> gọi qua Electron IPC ngay lập tức
        if (cfg.shopeeAppId && cfg.shopeeSecret && (electron?.generateShopeeAffiliateLinks || electron?.invoke)) {
            try {
                const payload = {
                    items: targetItems.map((it) => ({
                        id: this.getOfferLookupKey(it),
                        item_id: it.item_id,
                        shop_id: it.shop_id,
                        product_link: this.getCanonicalOriginUrl(it),
                    })),
                    appId: cfg.shopeeAppId,
                    secret: cfg.shopeeSecret,
                    subId: cfg.shopeeSubId,
                    cookie: cfg.shopeeCookie,
                };
                const res = electron.generateShopeeAffiliateLinks
                    ? await electron.generateShopeeAffiliateLinks(payload)
                    : await electron.invoke('generate-shopee-affiliate-links', payload);
                if (res?.links?.length) {
                    applyGeneratedList(res.links);
                }
                if (res?.error) lastError = res.error;
                if (res?.needLogin) needLogin = true;
            } catch (e: any) {
                lastError = e?.message || '';
            }
        }

        // 2. Với các sản phẩm chưa có link -> ưu tiên gọi trực tiếp trong webview affiliate.shopee.vn đang mở (đủ cookie & header gốc)
        let pending = targetItems.filter((it) => !this.getBestAffiliateLink(it));
        const activeWebview = options?.webview || this.findShopeeAffiliateWebview();
        if (pending.length > 0 && activeWebview) {
            const CHUNK = 25;
            for (let i = 0; i < pending.length; i += CHUNK) {
                const slice = pending.slice(i, i + CHUNK);
                const wvRes = await this.generateAffiliateLinksInWebview(activeWebview, slice, cfg.shopeeSubId);
                if (wvRes.links.length > 0) {
                    applyGeneratedList(wvRes.links);
                }
                if (wvRes.error) lastError = wvRes.error;
                if (wvRes.needLogin) {
                    needLogin = true;
                    break;
                }
            }
        }

        // 3. Nếu vẫn còn sản phẩm chưa tạo được -> gọi qua Electron IPC sử dụng phiên persist:gemini-webview / cookie đã lưu
        pending = targetItems.filter((it) => !this.getBestAffiliateLink(it));
        if (pending.length > 0 && (electron?.generateShopeeAffiliateLinks || electron?.invoke)) {
            try {
                const payload = {
                    items: pending.map((it) => ({
                        id: this.getOfferLookupKey(it),
                        item_id: it.item_id,
                        shop_id: it.shop_id,
                        product_link: this.getCanonicalOriginUrl(it),
                    })),
                    appId: cfg.shopeeAppId,
                    secret: cfg.shopeeSecret,
                    subId: cfg.shopeeSubId,
                    cookie: cfg.shopeeCookie,
                };
                const res = electron.generateShopeeAffiliateLinks
                    ? await electron.generateShopeeAffiliateLinks(payload)
                    : await electron.invoke('generate-shopee-affiliate-links', payload);
                if (res?.links?.length) {
                    applyGeneratedList(res.links);
                }
                if (res?.error) lastError = res.error;
                if (res?.needLogin) needLogin = true;
            } catch (e: any) {
                lastError = e?.message || '';
            }
        }

        // Lưu link Affiliate vừa tạo vào cả Server 3 CouchDB & SQLite cục bộ
        const updatedOffers = targetItems.filter((it) => !!this.getBestAffiliateLink(it));
        if (options?.persist !== false && updatedOffers.length > 0) {
            const targetUser = options?.username || this.getUsername();
            const sourceUrl = updatedOffers[0]?.source_url || 'https://affiliate.shopee.vn/offer/product_offer';
            await this.persistBatch(updatedOffers, targetUser, sourceUrl);
        }

        return {
            generatedCount: updatedOffers.length,
            linksById,
            needLogin: updatedOffers.length === 0 ? needLogin : false,
            error: updatedOffers.length > 0 ? '' : lastError,
        };
    }

    private mergeServerWithLocalOffer(serverDoc: ShopeeOfferItem, localDoc?: ShopeeOfferItem): ShopeeOfferItem {
        if (!localDoc) return serverDoc;
        const mergedImages = this.mergeUniqueImageUrls(
            serverDoc.image_url,
            serverDoc.images,
            localDoc.images,
            localDoc.image_url,
        );
        const serverAttrs = Array.isArray(serverDoc.attributes) ? serverDoc.attributes : [];
        const localAttrs = Array.isArray(localDoc.attributes) ? localDoc.attributes : [];
        const serverVars = Array.isArray(serverDoc.variations) ? serverDoc.variations : [];
        const localVars = Array.isArray(localDoc.variations) ? localDoc.variations : [];
        const serverDesc = typeof serverDoc.description === 'string' ? serverDoc.description.trim() : '';
        const localDesc = typeof localDoc.description === 'string' ? localDoc.description.trim() : '';
        const bestShort =
            (this.isRealAffiliateLink(serverDoc.short_link) ? serverDoc.short_link : '') ||
            (this.isRealAffiliateLink(localDoc.short_link) ? localDoc.short_link : '');
        const bestOffer =
            bestShort ||
            (this.isRealAffiliateLink(serverDoc.offer_link) ? serverDoc.offer_link : '') ||
            (this.isRealAffiliateLink(localDoc.offer_link) ? localDoc.offer_link : '');

        return {
            ...serverDoc,
            short_link: bestShort || '',
            offer_link: bestOffer || '',
            image_url: serverDoc.image_url || localDoc.image_url || mergedImages[0] || '',
            images: mergedImages,
            attributes: serverAttrs.length >= localAttrs.length ? serverAttrs : localAttrs,
            variations: serverVars.length >= localVars.length ? serverVars : localVars,
            description: serverDesc.length >= localDesc.length ? serverDesc : localDesc,
        };
    }

    async syncSingleOfferDetails(offer: ShopeeOfferItem, username?: string): Promise<void> {
        if (!offer) return;
        const targetUser = username || this.getUsername();
        const sourceUrl = offer.source_url || 'https://affiliate.shopee.vn/offer/product_offer';
        await this.persistBatch([offer], targetUser, sourceUrl);
    }

    async listOffers(params?: {
        username?: string;
        keyword?: string;
        sortBy?: string;
        pageNumber?: number;
        size?: number;
    }): Promise<{ docs: ShopeeOfferItem[]; totalDocs: number; source: 'server' | 'local' }> {
        const username = params?.username || this.getUsername();
        const keyword = params?.keyword || '';
        const sortBy = params?.sortBy || 'updatedAt';
        const pageNumber = params?.pageNumber || 0;
        const size = params?.size || 50;

        const electron = (window as any).electron;
        const apiBase = this.getApiBase();
        const appToken = this.getActiveToken();
        if (apiBase && appToken && this.config?.settings?.gen) {
            try {
                const payload = {
                    username,
                    year: this.year,
                    appId: 'ai.typing',
                    appToken,
                    keyword,
                    sortBy,
                    page: { pageNumber, size },
                };
                const res: any = await firstValueFrom(
                    this.http
                        .post<any>(
                            `${apiBase}/crawl/shopee/offers/list`,
                            { params: this._h.encrypt(payload, this.config.settings.gen) },
                            HTTP_OPTIONS,
                        )
                        .pipe(catchError(() => of(null))),
                );
                const data = res?.data;
                if (res?.success && data && Array.isArray(data.docs)) {
                    if (data.docs.length > 0 || !electron?.listLocalShopeeOffers) {
                        let mergedDocs: ShopeeOfferItem[] = data.docs;
                        // Luôn gộp thêm hình ảnh gallery, chi tiết sản phẩm và mô tả đã lưu trong SQLite cục bộ
                        if (mergedDocs.length > 0 && (electron?.getLocalShopeeOffersByIds || electron?.invoke)) {
                            try {
                                const ids = mergedDocs.map((d) => d._id || d.id || '').filter(Boolean);
                                const itemIds = mergedDocs.map((d) => d.item_id || '').filter(Boolean);
                                const localBatch = electron.getLocalShopeeOffersByIds
                                    ? await electron.getLocalShopeeOffersByIds({ username, ids, itemIds })
                                    : await electron.invoke('get-local-shopee-offers-by-ids', { username, ids, itemIds });
                                if (localBatch?.success && Array.isArray(localBatch.data) && localBatch.data.length > 0) {
                                    const byId = new Map<string, ShopeeOfferItem>();
                                    const byItemId = new Map<string, ShopeeOfferItem>();
                                    for (const ld of localBatch.data as ShopeeOfferItem[]) {
                                        if (ld.id) byId.set(ld.id, ld);
                                        if (ld._id) byId.set(ld._id, ld);
                                        if (ld.item_id) byItemId.set(ld.item_id, ld);
                                    }
                                    mergedDocs = mergedDocs.map((sd) => {
                                        const localMatch =
                                            byId.get(sd._id || sd.id || '') ||
                                            (sd.item_id ? byItemId.get(sd.item_id) : undefined);
                                        return this.mergeServerWithLocalOffer(sd, localMatch);
                                    });
                                }
                            } catch (_) {}
                        }
                        return {
                            docs: mergedDocs,
                            totalDocs: data.totalDocs || mergedDocs.length,
                            source: 'server',
                        };
                    }
                }
            } catch (_) {}
        }

        if (electron?.listLocalShopeeOffers) {
            try {
                const localRes = await electron.listLocalShopeeOffers({
                    username,
                    keyword,
                    sortBy,
                    page: { pageNumber, size },
                });
                if (localRes?.success && localRes.data) {
                    return {
                        docs: localRes.data.docs || [],
                        totalDocs: localRes.data.totalDocs || 0,
                        source: 'local',
                    };
                }
            } catch (_) {}
        }

        return { docs: [], totalDocs: 0, source: 'server' };
    }

    /**
     * Đối soát chính xác database collection của tài khoản sau khi hoàn tất quét trọn vẹn toàn bộ trang
     * trên https://affiliate.shopee.vn/offer/product_offer (chỉ giữ đúng những sản phẩm còn tồn tại trên Shopee Offer).
     */
    async reconcileActiveOffers(
        activeIds: string[],
        username: string,
        sourceUrl: string,
    ): Promise<{ pruned: number; totalInDb: number }> {
        if (!Array.isArray(activeIds) || activeIds.length === 0) {
            return { pruned: 0, totalInDb: 0 };
        }

        let pruned = 0;
        let totalInDb = 0;

        const apiBase = this.getApiBase();
        const appToken = this.getActiveToken();
        if (apiBase && appToken && this.config?.settings?.gen) {
            try {
                const payload = {
                    username,
                    year: this.year,
                    appId: 'ai.typing',
                    appToken,
                    sourceUrl,
                    offers: [],
                    reconcile: true,
                    activeIds,
                };
                const res: any = await firstValueFrom(
                    this.http
                        .post<any>(
                            `${apiBase}/crawl/shopee/offers/sync`,
                            { params: this._h.encrypt(payload, this.config.settings.gen) },
                            HTTP_OPTIONS,
                        )
                        .pipe(catchError(() => of(null))),
                );
                const data = res?.data || res;
                if (data && data.success) {
                    pruned = data.pruned || 0;
                    if (typeof data.totalInDb === 'number') {
                        totalInDb = data.totalInDb;
                    }
                }
            } catch (_) {}
        }

        const electron = (window as any).electron;
        if (electron?.saveLocalShopeeOffers) {
            try {
                const localRes = await electron.saveLocalShopeeOffers({
                    username,
                    sourceUrl,
                    offers: [],
                    reconcile: true,
                    activeIds,
                });
                if (localRes?.success) {
                    if (!pruned && typeof localRes.pruned === 'number') {
                        pruned = localRes.pruned;
                    }
                    if (!totalInDb && typeof localRes.totalInDb === 'number') {
                        totalInDb = localRes.totalInDb;
                    }
                }
            } catch (_) {}
        }

        return { pruned, totalInDb: totalInDb || activeIds.length };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async waitForWebviewIdle(webview: any, maxMs = 7000): Promise<void> {
        if (!webview) return;
        const started = Date.now();
        while (Date.now() - started < maxMs) {
            let loading = false;
            try {
                loading = typeof webview.isLoading === 'function' ? !!webview.isLoading() : false;
            } catch (_) {
                loading = false;
            }
            if (!loading) {
                await this.sleep(350);
                return;
            }
            await this.sleep(250);
        }
    }

    /**
     * Đồng bộ TẤT CẢ CÁC TRANG sản phẩm Shopee Offer từ cửa sổ Web Tools đang mở affiliate.shopee.vn:
     * - Tự động cuộn trang để tải đủ thẻ sản phẩm và thanh phân trang
     * - Tự động lật trang qua mọi kiểu phân trang (nút Next, click trực tiếp trang N+1, ô nhập số trang, hoặc cuộn vô hạn)
     * - Trích xuất theo cơ chế Delta (tốc độ không đổi dù đồng bộ hàng trăm trang)
     * - Lưu tăng dần theo từng batch lên cả CouchDB Server 3 ({username}_shopee_offers_2023) và SQLite cục bộ
     */
    async syncAllFromWebview(webview: any): Promise<void> {
        if (this._syncStateSubject.value.isSyncing) {
            return;
        }
        if (!webview || typeof webview.executeJavaScript !== 'function') {
            this.toastr.warning('Không tìm thấy cửa sổ Web Tools đang mở Shopee Affiliate.');
            return;
        }

        const username = this.getUsername();
        this._cancelRequested = false;

        this.updateState({
            isSyncing: true,
            currentPage: 1,
            totalPages: 0,
            pagesSynced: 0,
            collectedCount: 0,
            savedServerCount: 0,
            savedLocalCount: 0,
            totalInDb: 0,
            statusText: 'Đang kiểm tra trang Shopee Affiliate Offer...',
            lastFinishedMessage: '',
            error: '',
        });

        const collectedMap = new Map<string, ShopeeOfferItem>();
        const pendingQueue = new Map<string, ShopeeOfferItem>();
        let totalServerSaved = 0;
        let totalLocalSaved = 0;
        let latestTotalInDb = 0;
        let pagesSynced = 0;
        let sourceUrl = 'https://affiliate.shopee.vn/offer/product_offer';

        const emitSyncedEvent = () => {
            window.dispatchEvent(
                new CustomEvent('shopee-offers-synced', {
                    detail: {
                        username,
                        pagesSynced,
                        collectedCount: collectedMap.size,
                        savedServerCount: totalServerSaved,
                        savedLocalCount: totalLocalSaved,
                        totalInDb: latestTotalInDb,
                    },
                }),
            );
        };

        const flushPending = async (force = false) => {
            if (pendingQueue.size === 0) return;
            if (!force && pendingQueue.size < 40) return;

            const batchAll = Array.from(pendingQueue.values());
            for (let i = 0; i < batchAll.length; i += 100) {
                const slice = batchAll.slice(i, i + 100);
                // Tự động tạo link tiếp thị liên kết Shopee Affiliate thật (s.shopee.vn) cho các sản phẩm chưa có link Affiliate
                try {
                    const missingAffCount = slice.filter((it) => !this.getBestAffiliateLink(it)).length;
                    if (missingAffCount > 0) {
                        this.updateState({
                            statusText: `Đang tạo link Affiliate Shopee (s.shopee.vn) cho ${missingAffCount} sản phẩm và lưu DB...`,
                        });
                        await this.generateAffiliateLinks(slice, {
                            webview,
                            persist: false,
                            username,
                        });
                    }
                } catch (_) {}
                const res = await this.persistBatch(slice, username, sourceUrl);
                if (res.serverOk || res.localSaved > 0) {
                    slice.forEach((it) => {
                        if (it.id) pendingQueue.delete(it.id);
                    });
                    totalServerSaved += res.serverSaved;
                    totalLocalSaved += res.localSaved;
                    if (res.totalInDb > 0) latestTotalInDb = res.totalInDb;
                    this.updateState({
                        savedServerCount: totalServerSaved,
                        savedLocalCount: totalLocalSaved,
                        totalInDb: latestTotalInDb,
                    });
                }
            }
            emitSyncedEvent();
        };

        const absorbOffers = (list: ShopeeOfferItem[]) => {
            if (!Array.isArray(list)) return 0;
            let added = 0;
            for (const item of list) {
                if (!item || !item.id) continue;
                const prev = collectedMap.get(item.id);
                if (!prev) {
                    collectedMap.set(item.id, item);
                    pendingQueue.set(item.id, item);
                    added += 1;
                } else {
                    const mergedImages = this.mergeUniqueImageUrls(
                        item.image_url,
                        item.images,
                        prev.images,
                        prev.image_url,
                    );
                    const merged: ShopeeOfferItem = {
                        ...prev,
                        ...item,
                        product_name: item.product_name || prev.product_name,
                        shop_name: item.shop_name || prev.shop_name,
                        price: item.price > 0 ? item.price : prev.price,
                        commission_rate: item.commission_rate > 0 ? item.commission_rate : prev.commission_rate,
                        commission_amount: item.commission_amount > 0 ? item.commission_amount : prev.commission_amount,
                        sales: item.sales > 0 ? item.sales : prev.sales,
                        image_url: item.image_url || prev.image_url || mergedImages[0] || '',
                        images: mergedImages,
                        short_link: this.isRealAffiliateLink(item.short_link)
                            ? item.short_link
                            : (this.isRealAffiliateLink(prev.short_link) ? prev.short_link : ''),
                        offer_link: this.getBestAffiliateLink(item) || this.getBestAffiliateLink(prev) || '',
                    };
                    collectedMap.set(item.id, merged);
                    pendingQueue.set(item.id, merged);
                }
            }
            return added;
        };

        try {
            // Chờ webview ổn định nếu đang chuyển trang để không bị xóa mất hook sau khi reload
            await this.waitForWebviewIdle(webview, 6000);
            // Đảm bảo hook & bộ nhận diện phân trang luôn được cài mới nhất
            await this.installWebviewHook(webview);

            // Kiểm tra URL hiện tại -> luôn đồng bộ đúng từ trang https://affiliate.shopee.vn/offer/product_offer (không dính bộ lọc/trang con)
            let curUrl = '';
            try {
                curUrl = typeof webview.getURL === 'function' ? webview.getURL() : (webview.getAttribute('src') || '');
            } catch (_) {}

            const isCleanProductOfferUrl = (rawUrl: string): boolean => {
                if (!rawUrl) return false;
                try {
                    const u = new URL(rawUrl);
                    if (u.hostname !== 'affiliate.shopee.vn') return false;
                    if (u.pathname.replace(/\/+$/, '') !== '/offer/product_offer') return false;
                    const filterParams = ['keyword', 'q', 'search', 'cat', 'category', 'cat_id', 'shop_id'];
                    for (const fp of filterParams) {
                        if (u.searchParams.get(fp)) return false;
                    }
                    const pageParam = Number(u.searchParams.get('page') || '0');
                    const offsetParam = Number(u.searchParams.get('page_offset') || '0');
                    if (pageParam > 1 || offsetParam > 0) return false;
                    return true;
                } catch (_) {
                    return false;
                }
            };

            if (!isCleanProductOfferUrl(curUrl)) {
                this.updateState({ statusText: 'Đang mở trang https://affiliate.shopee.vn/offer/product_offer...' });
                if (typeof webview.loadURL === 'function') {
                    webview.loadURL('https://affiliate.shopee.vn/offer/product_offer');
                    await this.sleep(1200);
                    await this.waitForWebviewIdle(webview, 8000);
                    await this.sleep(1400);
                    await this.installWebviewHook(webview);
                }
            }

            let beginRes: any = await webview.executeJavaScript(SHOPEE_BEGIN_SYNC_SCRIPT);
            if (beginRes?.jumpedToFirst) {
                this.updateState({ statusText: 'Đang quay về trang 1 để đồng bộ đầy đủ từ đầu...' });
                await this.sleep(1600);
            } else if (beginRes?.previousPage > 1 && typeof webview.loadURL === 'function') {
                this.updateState({ statusText: 'Đang tải lại trang 1 của https://affiliate.shopee.vn/offer/product_offer...' });
                webview.loadURL('https://affiliate.shopee.vn/offer/product_offer');
                await this.sleep(1200);
                await this.waitForWebviewIdle(webview, 8000);
                await this.sleep(1400);
                await this.installWebviewHook(webview);
                beginRes = await webview.executeJavaScript(SHOPEE_BEGIN_SYNC_SCRIPT);
            }

            const MAX_PAGES = 2000;
            let loopStep = 1;
            let staleScrollCount = 0;
            let reachedEndCleanly = false;
            let startedFromPageOne = true;
            let stoppedByTimeout = false;

            while (!this._cancelRequested && loopStep <= MAX_PAGES) {
                const knownTotalPages = this._syncStateSubject.value.totalPages;
                this.updateState({
                    statusText: `Đang quét trang ${this._syncStateSubject.value.currentPage || loopStep}${knownTotalPages ? '/' + knownTotalPages : ''} (đã thu ${collectedMap.size} SP · đã lưu ${Math.max(totalServerSaved, totalLocalSaved)} SP)...`,
                });

                let snap: any = await webview.executeJavaScript(SHOPEE_EXTRACT_PAGE_SCRIPT);

                // Nếu trang vừa tự reload khiến hook bị mất -> tự động cài lại hook và quét lại 1 lần
                if (snap?.error && String(snap.error).includes('Hook')) {
                    await this.waitForWebviewIdle(webview, 5000);
                    await this.installWebviewHook(webview);
                    await this.sleep(600);
                    snap = await webview.executeJavaScript(SHOPEE_EXTRACT_PAGE_SCRIPT);
                }

                if (!snap || snap.error) {
                    throw new Error(snap?.error || 'Không đọc được dữ liệu từ trang Shopee Affiliate.');
                }

                if (snap.blocked) {
                    await flushPending(true);
                    this.updateState({
                        isSyncing: false,
                        error: snap.message,
                        statusText: '',
                        lastFinishedMessage: collectedMap.size > 0
                            ? `Đã tạm dừng ở trang ${snap.currentPage || loopStep} và lưu ${collectedMap.size} sản phẩm trước khi Shopee yêu cầu xác minh.`
                            : '',
                    });
                    this.toastr.warning(snap.message, 'Cần thao tác trên Web Tools', { timeOut: 7000 });
                    return;
                }

                if (snap.url) sourceUrl = snap.url;

                const beforeSize = collectedMap.size;
                absorbOffers(snap.deltaOffers);

                // Nếu trang đầu chưa có sản phẩm nào -> đợi trang render xong thêm 2s rồi quét lại
                if (loopStep === 1 && collectedMap.size === 0) {
                    await this.sleep(2000);
                    const retrySnap: any = await webview.executeJavaScript(SHOPEE_EXTRACT_PAGE_SCRIPT);
                    if (retrySnap && !retrySnap.error && !retrySnap.blocked) {
                        absorbOffers(retrySnap.deltaOffers);
                    }
                }

                pagesSynced += 1;
                const displayPage = snap.currentPage || loopStep;
                if (loopStep === 1 && displayPage > 1) {
                    startedFromPageOne = false;
                }
                const totalPages = Math.max(snap.totalPages || 0, this._syncStateSubject.value.totalPages);

                this.updateState({
                    currentPage: displayPage,
                    totalPages,
                    pagesSynced,
                    collectedCount: collectedMap.size,
                    statusText: `Trang ${displayPage}${totalPages ? '/' + totalPages : ''} — Đã thu thập ${collectedMap.size} SP — Đã lưu DB: ${Math.max(totalServerSaved, totalLocalSaved)} SP`,
                });

                // Lưu tăng dần theo batch
                await flushPending(false);

                if (this._cancelRequested) break;

                // Nếu đã biết chắc đang ở trang cuối cùng (và không có nút next) -> kết thúc sạch
                if (snap.hasPaginationBar && !snap.hasNextPage && totalPages > 0 && displayPage >= totalPages) {
                    reachedEndCleanly = true;
                    break;
                }

                const prevSig = snap.pageSignature || '';
                const prevCaptureTs = snap.lastCaptureTs || 0;
                const prevCaptureCount = snap.captureCount || 0;

                // Thử tối đa 2 lần chuyển trang (lần 1 ưu tiên Next/Numeric, lần 2 đảo chiến lược sang click số trang N+1 / Quick Jump)
                let advanced = false;
                let genuineEnd = false;
                let blockedDuringAdvance: { blocked: string; message: string } | null = null;
                let usedScrollMode = false;

                for (let attempt = 0; attempt < 2 && !advanced && !genuineEnd && !blockedDuringAdvance && !this._cancelRequested; attempt++) {
                    const preferNumeric = attempt === 1;
                    const adv: any = await webview.executeJavaScript(
                        buildAdvancePageScript(displayPage + 1, preferNumeric),
                    );

                    if (adv?.mode === 'pagination_end') {
                        genuineEnd = true;
                        break;
                    }

                    if (adv?.mode === 'pagination' && adv.clicked) {
                        // Đợi trang mới tải xong (tối đa 10 giây, kiểm tra mỗi 500ms bằng probe siêu nhẹ)
                        for (let wait = 0; wait < 20; wait++) {
                            if (this._cancelRequested) break;
                            await this.sleep(500);
                            const probe: any = await webview.executeJavaScript(SHOPEE_PAGE_PROBE_SCRIPT);
                            if (probe?.blocked) {
                                blockedDuringAdvance = probe;
                                break;
                            }
                            if (
                                probe &&
                                (probe.currentPage > displayPage ||
                                    probe.lastCaptureTs > prevCaptureTs ||
                                    probe.captureCount > prevCaptureCount ||
                                    (probe.pageSignature && probe.pageSignature !== prevSig))
                            ) {
                                advanced = true;
                                // Nghỉ nhẹ để toàn bộ card & dữ liệu trang mới render ổn định
                                await this.sleep(550);
                                break;
                            }
                        }
                    } else if (adv?.mode === 'scroll') {
                        usedScrollMode = true;
                        await this.sleep(1500);
                        // Quét nhẹ xem cuộn xuống có sinh thêm sản phẩm mới không
                        const afterScrollSnap: any = await webview.executeJavaScript(SHOPEE_EXTRACT_PAGE_SCRIPT);
                        if (afterScrollSnap?.blocked) {
                            blockedDuringAdvance = afterScrollSnap;
                            break;
                        }
                        if (afterScrollSnap && !afterScrollSnap.error) {
                            absorbOffers(afterScrollSnap.deltaOffers);
                            this.updateState({ collectedCount: collectedMap.size });
                        }
                        if (collectedMap.size > beforeSize) {
                            staleScrollCount = 0;
                            advanced = true;
                        } else {
                            staleScrollCount += 1;
                            if (!adv.scrolled || staleScrollCount >= 3) {
                                genuineEnd = true;
                            } else {
                                advanced = true;
                            }
                        }
                        break;
                    } else {
                        break;
                    }
                }

                if (blockedDuringAdvance) {
                    await flushPending(true);
                    this.updateState({
                        isSyncing: false,
                        error: blockedDuringAdvance.message,
                        statusText: '',
                        lastFinishedMessage: collectedMap.size > 0
                            ? `Đã tạm dừng ở trang ${displayPage} và lưu ${collectedMap.size} sản phẩm trước khi Shopee yêu cầu xác minh.`
                            : '',
                    });
                    this.toastr.warning(blockedDuringAdvance.message, 'Cần thao tác trên Web Tools', { timeOut: 7000 });
                    return;
                }

                if (genuineEnd) {
                    if (!this._cancelRequested) {
                        reachedEndCleanly = true;
                    }
                    break;
                }

                if (!advanced) {
                    stoppedByTimeout = true;
                    break;
                }

                // Nếu là scroll mode và đã dừng tăng sản phẩm thì thoát
                if (usedScrollMode && staleScrollCount >= 3) {
                    if (!this._cancelRequested) {
                        reachedEndCleanly = true;
                    }
                    break;
                }

                loopStep += 1;
            }

            // Lưu toàn bộ sản phẩm còn lại trong hàng đợi
            await flushPending(true);

            // Chỉ đối soát gỡ offer cũ khi quét trọn vẹn từ trang 1 tới trang cuối cùng (không bị dừng/timeout/xác minh)
            let prunedCount = 0;
            if (reachedEndCleanly && startedFromPageOne && !this._cancelRequested && collectedMap.size > 0) {
                this.updateState({
                    statusText: `Đang đối soát chính xác ${collectedMap.size} sản phẩm Shopee Offer với database tài khoản...`,
                });
                const rec = await this.reconcileActiveOffers(
                    Array.from(collectedMap.keys()),
                    username,
                    sourceUrl,
                );
                prunedCount = rec.pruned || 0;
                if (rec.totalInDb > 0) {
                    latestTotalInDb = rec.totalInDb;
                }
            }

            const finalCollected = collectedMap.size;
            const savedCount = Math.max(totalServerSaved, totalLocalSaved);
            const finishedMsg = this._cancelRequested
                ? `Đã dừng ở trang ${this._syncStateSubject.value.currentPage}: lưu thành công ${savedCount}/${finalCollected} sản phẩm Shopee Offer (${pagesSynced} trang) vào database tài khoản (${username}).`
                : stoppedByTimeout
                  ? `Chuyển trang bị gián đoạn ở trang ${this._syncStateSubject.value.currentPage}: đã lưu tạm ${savedCount}/${finalCollected} sản phẩm (${pagesSynced} trang) và giữ nguyên dữ liệu cũ. Vui lòng thử đồng bộ lại khi mạng ổn định.`
                  : finalCollected > 0
                    ? `Hoàn tất đồng bộ chính xác ${finalCollected} sản phẩm Shopee Offer (${pagesSynced} trang${prunedCount > 0 ? ', tự động gỡ ' + prunedCount + ' sản phẩm đã hết offer' : ''}) vào database collection của tài khoản (${username}).`
                    : 'Không tìm thấy sản phẩm Offer nào trên trang hiện tại. Hãy đảm bảo bạn đã đăng nhập và đang ở trang Sản phẩm Offer của Shopee.';

            this.updateState({
                isSyncing: false,
                pagesSynced,
                collectedCount: finalCollected,
                savedServerCount: totalServerSaved,
                savedLocalCount: totalLocalSaved,
                totalInDb: latestTotalInDb || savedCount,
                statusText: '',
                lastFinishedMessage: finishedMsg,
                error: '',
            });

            if (finalCollected > 0) {
                this.toastr.success(finishedMsg, 'Đồng bộ Shopee Offer', { timeOut: 7000 });
                emitSyncedEvent();
            } else {
                this.toastr.warning(finishedMsg, 'Đồng bộ Shopee Offer', { timeOut: 6000 });
            }
        } catch (err: any) {
            await flushPending(true);
            const errMsg = `Lỗi khi đồng bộ Shopee Offer: ${err?.message || 'Không xác định'}`;
            this.updateState({
                isSyncing: false,
                statusText: '',
                error: errMsg,
            });
            this.toastr.error(errMsg, 'Đồng bộ Shopee Offer');
        } finally {
            this._cancelRequested = false;
        }
    }
}
