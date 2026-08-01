import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { BlogService } from 'app/_services/blog';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { Subject, takeUntil, firstValueFrom } from 'rxjs';
import { GenaiService } from 'app/genai.service';
import { CrawlService } from 'app/_services/crawl';
import { MatDialog } from '@angular/material/dialog';
import { VideoEditorSettingsDialogComponent } from 'app/shared/components/video-editor-settings-dialog/video-editor-settings-dialog.component';

interface ScreenplayLine {
    type: string;
    text: string;
}

@Component({
    selector: 'ai-script-view',
    template: `
    <div class="absolute inset-0 flex flex-col bg-[#f0f2f5] min-w-0 overflow-hidden">
        <!-- Header -->
        <div class="z-10 flex flex-col sm:flex-row flex-0 sm:items-center sm:justify-between p-4 px-6 sm:px-10 bg-[#f0f2f5] pointer-events-auto">
            <div class="flex items-center gap-3 min-w-0">
                <button mat-icon-button class="text-gray-600 hover:bg-gray-100" (click)="isSidebarOpen = !isSidebarOpen" matTooltip="Ẩn/Hiện danh sách bài viết">
                    <mat-icon [svgIcon]="isSidebarOpen ? 'heroicons_outline:view-list' : 'heroicons_outline:menu'"></mat-icon>
                </button>

                <!-- Breadcrumbs -->
                <div class="hidden sm:flex flex-wrap items-center font-medium">
                    <div class="flex items-center whitespace-nowrap">
                        <a class="text-base text-primary-500" [routerLink]="['/dashboard']">ai.type</a>
                    </div>
                    <div class="flex items-center ml-1 whitespace-nowrap">
                        <mat-icon class="icon-size-4 text-secondary" style="margin-top: 2px;" [svgIcon]="'heroicons_solid:chevron-right'"></mat-icon>
                        <a class="ml-1 text-base text-primary-500 cursor-pointer" (click)="goBack()">công việc đang làm của bạn</a>
                    </div>
                    <div class="flex items-center ml-1 whitespace-nowrap relative">
                        <mat-icon class="icon-size-4 text-secondary" style="margin-top: 2px;" [svgIcon]="'heroicons_solid:chevron-right'"></mat-icon>
                        <span class="ml-1 text-base text-secondary font-bold">xem kịch bản</span>
                    </div>
                </div>
                <div class="flex sm:hidden">
                    <a class="inline-flex items-center -ml-1.5 text-secondary font-medium cursor-pointer" (click)="goBack()">
                        <mat-icon class="icon-size-4 text-secondary" [svgIcon]="'heroicons_solid:chevron-left'"></mat-icon>
                        <span class="ml-1 text-base">quay lại</span>
                    </a>
                </div>
            </div>

            <!-- Right Actions: Nút Dựng video -->
            <div class="flex items-center gap-3 mt-2 sm:mt-0">
                <button mat-flat-button color="primary" class="gap-2 font-semibold" (click)="navigateToVideoGenerator()">
                    <mat-icon class="icon-size-5" svgIcon="heroicons_outline:video-camera"></mat-icon>
                    <span>Dựng video</span>
                </button>
            </div>
        </div>

        <!-- Main Flex Layout: Left Sidebar + Screenplay View -->
        <div class="flex-1 flex min-h-0 overflow-hidden relative">

            <!-- LEFT SIDEBAR: DANH SÁCH BÀI VIẾT BỘ SƯU TẬP -->
            <div class="w-80 border-r border-t border-gray-200 bg-white flex flex-col shrink-0 z-20 overflow-hidden transition-all duration-300 rounded-tr-2xl" *ngIf="isSidebarOpen">
                <!-- Sidebar Header -->
                <div class="p-3.5 border-b border-gray-200 bg-gray-50/80 flex items-center justify-between gap-2">
                    <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2">
                            <mat-icon class="text-primary-600 icon-size-4" svgIcon="heroicons_outline:collection"></mat-icon>
                            <span class="font-bold text-gray-900 text-base">Danh sách bài viết</span>
                        </div>
                        <span class="text-xs text-gray-500 truncate mt-0.5" [title]="draftTitleFallback || scriptDoc?.title">
                            {{ draftTitleFallback || scriptDoc?.title || 'Kịch bản Bộ Sưu Tập' }}
                        </span>
                    </div>
                    <span class="shrink-0 bg-primary-100 text-primary-800 font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center" *ngIf="availableChapters?.length">
                        {{ availableChapters.length }}
                    </span>
                </div>

                <!-- Sidebar Chapter List -->
                <div class="flex-1 overflow-y-auto divide-y divide-gray-100 p-0">
                    <!-- Loading Skeleton -->
                    <div *ngIf="isLoadingChapterList" class="p-6 text-center text-gray-400 text-sm animate-pulse space-y-3">
                        <div class="h-12 bg-gray-100 rounded-lg w-full"></div>
                        <div class="h-12 bg-gray-100 rounded-lg w-full"></div>
                        <div class="h-12 bg-gray-100 rounded-lg w-full"></div>
                        <span class="text-xs">Đang đọc bài viết từ CSDL...</span>
                    </div>

                    <!-- Chapter Items (Standard Fuse List Rows) -->
                    <div *ngFor="let chapter of availableChapters; let cIdx = index" 
                         (click)="scrollToChapter(cIdx)"
                         class="group flex flex-col p-4 border-b border-gray-100 hover:bg-gray-50/80 transition-colors cursor-pointer relative bg-white">
                        
                        <!-- Top Row: Title & Status Badges -->
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-xs font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-full shrink-0">
                                    Chương {{ cIdx + 1 }}
                                </span>
                                <span class="font-bold text-base text-gray-900 truncate group-hover:text-primary-600 transition-colors" [title]="chapter.title">
                                    {{ chapter.title }}
                                </span>
                            </div>

                            <!-- Status Badges -->
                            <span *ngIf="isChapterInScript(chapter, cIdx)" class="shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Có kịch bản
                            </span>
                            <span *ngIf="!isChapterInScript(chapter, cIdx)" class="shrink-0 bg-amber-50 text-amber-700 border border-amber-200/60 text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                Mới
                            </span>
                        </div>

                        <!-- Middle: Preview text snippet -->
                        <p class="text-sm text-gray-500 line-clamp-2 leading-relaxed font-normal mt-2">
                            {{ chapter.done || 'Chưa có nội dung nguyên tác' }}
                        </p>

                        <!-- Bottom Row: Date & Action Icons (Clean Fuse Layout, No inner border line) -->
                        <div class="flex items-center justify-between mt-3 text-xs text-gray-400">
                            <span class="font-mono text-[11px]">
                                {{ chapter.createdAt ? (chapter.createdAt | date:'dd/MM/yyyy') : '' }}
                            </span>
                            <div class="flex items-center gap-1 -mr-2">
                                <button mat-icon-button
                                        class="w-8 h-8 min-h-8 min-w-8 text-gray-400 hover:text-primary-600" 
                                        (click)="regenerateSingleChapter(cIdx); $event.stopPropagation()" [disabled]="isRegenerating" matTooltip="Dựng lại kịch bản chương này">
                                    <mat-icon class="icon-size-4" [class.animate-spin]="isRegenerating && regeneratingChapterIdx === cIdx" svgIcon="heroicons_outline:refresh"></mat-icon>
                                </button>
                                <button mat-icon-button
                                        class="w-8 h-8 min-h-8 min-w-8 text-gray-400 hover:text-primary-600" 
                                        (click)="scrollToChapter(cIdx); $event.stopPropagation()" matTooltip="Cuộn đến chương này">
                                    <mat-icon class="icon-size-4" svgIcon="heroicons_outline:eye"></mat-icon>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div *ngIf="!isLoadingChapterList && (!availableChapters || availableChapters.length === 0)" class="p-6 text-center text-gray-400 text-xs">
                        Không tìm thấy bài viết nào trong CSDL Collection!
                    </div>
                </div>
            </div>

            <!-- Main Content Scroll Area -->
            <div class="flex-auto pt-4 sm:pt-6 pb-6 px-6 sm:pb-10 sm:px-10 bg-[#f0f2f5] overflow-auto flex flex-col gap-8 screenplay-container-scroll">
            <!-- Loading State -->
            <div class="flex flex-col items-center justify-center py-20 animate-pulse" *ngIf="isLoading">
                <mat-progress-spinner mode="indeterminate" diameter="48" color="primary"></mat-progress-spinner>
                <span class="text-gray-500 font-medium mt-4">Đang hoàn thành kịch bản...</span>
            </div>

            <!-- Script List View / Empty State -->
            <div class="flex flex-col w-full max-w-6xl mx-auto py-4" *ngIf="!isLoading && !scriptText">
                <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-800">Danh sách kịch bản đã tạo</h2>
                        <p class="text-sm text-gray-500 mt-1">Chọn kịch bản trong danh sách dưới đây để xem chi tiết hoặc chỉnh sửa kịch bản phim.</p>
                    </div>
                    <button mat-flat-button color="primary" class="flex items-center gap-2" (click)="loadScriptList()">
                        <mat-icon class="icon-size-4" svgIcon="heroicons_outline:refresh"></mat-icon>
                        <span>Làm mới danh sách</span>
                    </button>
                </div>

                <!-- Loading Script List -->
                <div class="flex flex-col items-center justify-center py-16" *ngIf="isLoadingScriptList">
                    <mat-progress-spinner mode="indeterminate" diameter="40" color="primary"></mat-progress-spinner>
                    <span class="text-gray-500 text-sm mt-3">Đang tải danh sách kịch bản...</span>
                </div>

                <!-- Script Cards Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" *ngIf="!isLoadingScriptList && scriptList && scriptList.length > 0">
                    <div *ngFor="let item of scriptList" (click)="selectScript(item)" 
                         class="group bg-white rounded-2xl p-6 border border-gray-200 hover:border-primary-500 transition-all duration-200 cursor-pointer flex flex-col justify-between relative overflow-hidden">
                        
                        <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary-400 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                        <div>
                            <div class="flex items-center justify-between text-xs font-semibold text-primary-600 mb-3">
                                <span class="flex items-center gap-1.5 bg-primary-50 px-2.5 py-1 rounded-md">
                                    <mat-icon class="icon-size-4 text-primary-600" svgIcon="heroicons_outline:film"></mat-icon>
                                    KỊCH BẢN PHIM
                                </span>
                                <span class="text-gray-400 font-mono text-[11px]">{{ item.uuid?.substring(0, 8) || item._id?.substring(0, 8) || '' }}</span>
                            </div>
                            
                            <h3 class="font-bold text-gray-900 text-lg group-hover:text-primary-600 transition-colors line-clamp-2 mb-2 leading-snug">
                                {{ item.title || item.name || 'Kịch bản chưa đặt tên' }}
                            </h3>
                            
                            <p class="text-sm text-gray-500 line-clamp-3 mb-6 leading-relaxed">
                                {{ item.meta || item.excerpt || 'Không có mô tả cho bản kịch bản này.' }}
                            </p>
                        </div>

                        <div class="flex items-center justify-between pt-4 border-t border-gray-100 text-xs text-gray-500">
                            <span class="flex items-center gap-1">
                                <mat-icon class="icon-size-3.5 text-gray-400" svgIcon="heroicons_outline:clock"></mat-icon>
                                {{ (item.updatedAt || item.createdAt) | date:'dd/MM/yyyy HH:mm' }}
                            </span>
                            <span class="text-primary-600 font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Xem kịch bản
                                <mat-icon class="icon-size-4" svgIcon="heroicons_outline:arrow-narrow-right"></mat-icon>
                            </span>
                        </div>
                    </div>
                </div>

                <!-- No Scripts Found -->
                <div class="flex flex-col items-center justify-center py-16 text-center bg-white rounded-2xl border border-gray-200" *ngIf="!isLoadingScriptList && (!scriptList || scriptList.length === 0)">
                    <mat-icon class="text-gray-300 icon-size-16 mb-4" svgIcon="heroicons_outline:document-search"></mat-icon>
                    <h3 class="text-xl font-bold text-gray-700">Chưa có kịch bản nào được tạo</h3>
                    <p class="text-gray-500 max-w-md mt-2">Vui lòng quay lại màn hình Dàn ý và nhấn "Tạo kịch bản" trong menu công cụ để AI sinh kịch bản trước.</p>
                    <button mat-flat-button color="primary" class="mt-6" (click)="goBack()">Quay lại</button>
                </div>
            </div>

            <!-- Screenplay Pages -->
            <ng-container *ngIf="!isLoading && scriptText">
                <!-- PAGE 0: COVER PAGE / TRANG BÌA (KHÔNG ĐÁNH SỐ TRANG) -->
                <div class="screenplay-outer screenplay-cover-page relative flex flex-col justify-between select-none">
                    <!-- Top Bar -->
                    <div class="flex justify-between items-center w-full">
                        <span class="text-xs text-gray-400 font-mono tracking-widest uppercase">TRANG BÌA KỊCH BẢN</span>
                        <button mat-icon-button class="text-gray-400 hover:text-primary-600 no-print" (click)="openCoverEditModal()" matTooltip="Chỉnh sửa thông tin trang bìa">
                            <mat-icon class="icon-size-4" svgIcon="heroicons_outline:pencil"></mat-icon>
                        </button>
                    </div>

                    <!-- Center Block: Title & Author -->
                    <div class="flex flex-col items-center justify-center text-center my-auto px-4 py-8">
                        <h1 class="text-3xl font-bold uppercase tracking-widest text-gray-900 mb-8 max-w-lg leading-relaxed" style="font-family: 'Courier Prime', 'Courier New', Courier, monospace;">
                            {{ draftTitleFallback || scriptDoc?.title || 'KỊCH BẢN CHƯA ĐẶT TÊN' }}
                        </h1>
                        
                        <div class="text-sm text-gray-500 font-mono italic mb-12">
                            Kịch bản chuyển thể điện ảnh
                        </div>

                        <div class="flex flex-col items-center space-y-2">
                            <span class="text-sm font-mono text-gray-500 uppercase tracking-wider">Kịch bản bởi</span>
                            <span class="text-xl font-bold font-mono text-gray-900 tracking-wide">
                                {{ authorName || _blogService.user?.name || 'Tác giả' }}
                            </span>
                        </div>
                    </div>

                    <!-- Bottom Block: Contact Information (Góc dưới cùng trang bìa) -->
                    <div class="flex justify-between items-end w-full pt-8 border-t border-gray-200 font-mono text-xs text-gray-700">
                        <div class="flex flex-col space-y-1 text-left">
                            <div class="font-bold text-gray-900 text-sm uppercase mb-1">THÔNG TIN LIÊN HỆ:</div>
                            <div><strong class="text-gray-800">Tác giả:</strong> {{ authorName || _blogService.user?.name || 'Chưa cập nhật' }}</div>
                            <div *ngIf="contactEmail"><strong class="text-gray-800">Email:</strong> {{ contactEmail }}</div>
                            <div *ngIf="contactPhone"><strong class="text-gray-800">Điện thoại:</strong> {{ contactPhone }}</div>
                            <div *ngIf="contactAddress"><strong class="text-gray-800">Địa chỉ:</strong> {{ contactAddress }}</div>
                        </div>
                        
                        <div class="text-right text-gray-400 font-mono text-[11px]">
                            <div>© {{ currentYear }} All Rights Reserved.</div>
                            <div class="mt-0.5 italic">Bản quyền thuộc tác giả</div>
                        </div>
                    </div>
                </div>

                <!-- CONTENT PAGES (PAGE INDEX 1, 2, 3... - ĐÁNH SỐ TRANG BẮT ĐẦU TỪ 1) -->
                <div *ngFor="let page of pages; let pageIndex = index" class="screenplay-outer relative">
                    <!-- Page Number (standard film screenplay style: top-right of page, starting from 1 for content page) -->
                    <div class="absolute top-8 right-12 text-sm text-gray-400 font-mono select-none">
                        {{ pageIndex + 1 }}.
                    </div>

                    <div class="screenplay-content">
                        <ng-container *ngFor="let item of page">
                            <div *ngIf="item.type === 'character-list-header'" class="screenplay-character-list-header font-bold text-gray-900 uppercase my-4 border-b pb-1 text-base">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'character-card-title'" class="screenplay-character-card-title font-bold text-blue-700 uppercase mt-5 mb-2 text-base border-b border-blue-200 pb-1">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'character-list-item'" class="screenplay-character-list-item text-gray-800 my-1.5 pl-4 border-l-2 border-primary-500 bg-gray-50/50 py-1 rounded-r">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'slugline'" class="screenplay-slugline">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'action'" class="screenplay-action">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'character'" class="screenplay-character">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'parenthetical'" class="screenplay-parenthetical">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'dialogue'" class="screenplay-dialogue">
                                {{ item.text }}
                            </div>
                            <div *ngIf="item.type === 'empty'" class="screenplay-empty"></div>
                        </ng-container>
                    </div>
                </div>
            </ng-container>
            </div>
        </div>

        <!-- Edit Cover Modal -->
        <div *ngIf="showCoverEditModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div class="bg-white rounded-xl max-w-md w-full p-6 flex flex-col gap-4">
                <div class="flex items-center justify-between border-b pb-3">
                    <h3 class="text-lg font-bold text-gray-900">Chỉnh sửa thông tin trang bìa</h3>
                    <button mat-icon-button (click)="showCoverEditModal = false">
                        <mat-icon svgIcon="heroicons_outline:x"></mat-icon>
                    </button>
                </div>

                <div class="flex flex-col gap-3 font-sans">
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Tên tác giả</label>
                        <input #authorInput type="text" [value]="authorName" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Nhập tên tác giả">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Email liên hệ</label>
                        <input #emailInput type="email" [value]="contactEmail" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Nhập email liên hệ">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Số điện thoại</label>
                        <input #phoneInput type="text" [value]="contactPhone" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Nhập số điện thoại">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold text-gray-600 mb-1">Địa chỉ / Đơn vị sản xuất</label>
                        <input #addressInput type="text" [value]="contactAddress" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" placeholder="Nhập địa chỉ">
                    </div>
                </div>

                <div class="flex justify-end gap-2 border-t pt-3 mt-2">
                    <button mat-button (click)="showCoverEditModal = false">Hủy</button>
                    <button mat-flat-button color="primary" (click)="saveCoverDetails(authorInput.value, emailInput.value, phoneInput.value, addressInput.value)">Lưu thông tin</button>
                </div>
            </div>
        </div>

        <!-- Modal chọn và dựng lại kịch bản 1 chương lẻ -->
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" *ngIf="showSingleChapterModal">
            <div class="bg-white rounded-xl max-w-lg w-full p-6 space-y-4">
                <div class="flex justify-between items-center border-b pb-3">
                    <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <mat-icon class="text-primary-600 icon-size-5" svgIcon="heroicons_outline:pencil-alt"></mat-icon>
                        <span>Sửa kịch bản 1 chương lẻ</span>
                    </h3>
                    <button mat-icon-button (click)="showSingleChapterModal = false">
                        <mat-icon svgIcon="heroicons_outline:x"></mat-icon>
                    </button>
                </div>

                <p class="text-xs text-gray-500">
                    Chọn chương bạn vừa chỉnh sửa trong CSDL để AI chuyển thể lại riêng kịch bản cho chương đó mà không làm ảnh hưởng tới các chương khác:
                </p>

                <div class="max-h-72 overflow-y-auto divide-y border rounded-lg">
                    <div *ngIf="isLoadingChapterList" class="p-4 text-center text-gray-500 text-sm animate-pulse flex items-center justify-center gap-2">
                        <mat-progress-spinner mode="indeterminate" diameter="20" color="primary"></mat-progress-spinner>
                        <span>Đang nạp danh sách chương từ CSDL...</span>
                    </div>
                    <div *ngFor="let chapter of availableChapters; let cIdx = index" class="p-3 hover:bg-primary-50/50 flex items-center justify-between transition-colors">
                        <div class="flex flex-col pr-3 min-w-0">
                            <span class="font-bold text-sm text-gray-800 truncate">Chương {{ cIdx + 1 }}: {{ chapter.title }}</span>
                            <span class="text-xs text-gray-400 font-mono truncate">{{ chapter.done ? (chapter.done.substring(0, 50) + '...') : 'Chưa có nội dung' }}</span>
                        </div>
                        <button mat-flat-button color="primary" class="shrink-0 text-xs px-2.5 h-8" (click)="regenerateSingleChapter(cIdx)" [disabled]="isRegenerating">
                            Dựng lại chương này
                        </button>
                    </div>
                    <div *ngIf="!isLoadingChapterList && (!availableChapters || availableChapters.length === 0)" class="p-4 text-center text-gray-400 text-sm">
                        Không tìm thấy bài viết nào trong Collection!
                    </div>
                </div>

                <div class="flex justify-end pt-2 border-t">
                    <button mat-button (click)="showSingleChapterModal = false">Đóng</button>
                </div>
            </div>
        </div>
    </div>
    `,
    styles: [`
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400;1,700&display=swap');

        .screenplay-outer {
            font-family: 'Courier Prime', 'Courier New', Courier, monospace;
            background-color: #ffffff;
            width: 21cm;
            min-height: 29.7cm;
            padding: 2.5cm 3cm 2.5cm 3.5cm;
            margin: 0 auto;
            box-sizing: border-box;
            box-shadow: 5px 5px 0px rgba(0, 0, 0, 0.08);
            border: none;
        }
        .screenplay-content {
            font-family: 'Courier Prime', 'Courier New', Courier, monospace;
            color: #111;
            font-size: 15px;
            line-height: 1.5;
        }
        .screenplay-character-list-header {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 0.25rem;
            text-align: left !important;
        }
        .screenplay-character-card-title {
            font-weight: bold;
            text-transform: uppercase;
            color: #1d4ed8;
            margin-top: 1.25rem;
            margin-bottom: 0.5rem;
            border-bottom: 1px dashed #93c5fd;
            padding-bottom: 0.25rem;
            text-align: left !important;
        }
        .screenplay-character-list-item {
            text-align: left !important;
            margin-top: 0.25rem;
            margin-bottom: 0.5rem;
            padding-left: 0.75rem;
            border-left: 3px solid #2563eb;
            background-color: #f8fafc;
            padding-top: 0.25rem;
            padding-bottom: 0.25rem;
        }
        .screenplay-slugline {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            text-align: left !important;
        }
        .screenplay-action {
            text-align: left !important;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .screenplay-character {
            font-weight: bold;
            text-transform: uppercase;
            text-align: left !important;
            margin-left: 35%;
            margin-top: 1rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-parenthetical {
            text-align: left !important;
            margin-left: 28%;
            margin-right: 25%;
            margin-top: 0.1rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-dialogue {
            text-align: left !important;
            margin-left: 20%;
            margin-right: 20%;
            margin-top: 0.1rem;
            margin-bottom: 0.8rem;
        }
        .screenplay-empty {
            height: 1rem;
        }
    `],
    providers: [BlogService]
})
export class AIScriptComponent implements OnInit, OnDestroy {
    uuid: string = '';
    name: string = '';
    scriptDoc: any = null;
    scriptText: string = '';
    pages: ScreenplayLine[][] = [];
    draftTitleFallback: string = '';
    isLoading: boolean = true;
    isRegenerating: boolean = false;
    parsedLines: ScreenplayLine[] = [];

    authorName: string = '';
    contactPhone: string = '';
    contactEmail: string = '';
    contactAddress: string = '';
    showCoverEditModal: boolean = false;
    showSingleChapterModal: boolean = false;
    isLoadingChapterList: boolean = false;
    availableChapters: any[] = [];
    isSidebarOpen: boolean = true;
    regeneratingChapterIdx: number | null = null;
    currentYear: number = new Date().getFullYear();

    scriptList: any[] = [];
    isLoadingScriptList: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private _blogService: BlogService,
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private _multiAccountService: MultiAccountService,
        private _crawlService: CrawlService,
        private dialog: MatDialog
    ) { }

    ngOnInit(): void {
        this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe((params: Params) => {
            this.uuid = params['uuid'];
            this.name = params['name'];
            if (this.uuid) {
                this.loadScript();
            } else {
                this.isLoading = false;
                this.loadScriptList();
            }
        });
    }

    loadScriptList(): void {
        this.isLoadingScriptList = true;
        this.cd.markForCheck();
        let username = this._blogService.user?.name || 'admin';

        this._crawlService.searchTotalArchive({
            username: username,
            limit: 50
        }).subscribe({
            next: (res: any) => {
                this.isLoadingScriptList = false;
                if (res && res.data && Array.isArray(res.data)) {
                    this.scriptList = res.data;
                } else if (res && Array.isArray(res)) {
                    this.scriptList = res;
                } else {
                    this.scriptList = [];
                }
                this.cd.markForCheck();
            },
            error: (err) => {
                console.error('Error loading script list:', err);
                this.isLoadingScriptList = false;
                this.cd.markForCheck();
            }
        });
    }

    selectScript(item: any): void {
        const targetUuid = item.uuid || item._id || item.id;
        if (targetUuid) {
            this.router.navigate(['/content/ai-writer/script-view', targetUuid]);
        }
    }

    openCoverEditModal() {
        this.showCoverEditModal = true;
        this.cd.markForCheck();
    }

    saveCoverDetails(author: string, email: string, phone: string, address: string) {
        this.authorName = (author || '').trim();
        this.contactEmail = (email || '').trim();
        this.contactPhone = (phone || '').trim();
        this.contactAddress = (address || '').trim();

        const coverData = {
            authorName: this.authorName,
            contactEmail: this.contactEmail,
            contactPhone: this.contactPhone,
            contactAddress: this.contactAddress
        };
        this._multiAccountService.setItem(`ai_type_script_cover_${this.uuid}`, JSON.stringify(coverData));
        this.showCoverEditModal = false;
        this.toastr.success('Đã lưu thông tin trang bìa kịch bản!');
        this.cd.markForCheck();
    }

    loadCoverDetails() {
        const saved = this._multiAccountService.getItem(`ai_type_script_cover_${this.uuid}`);
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.authorName = data.authorName || '';
                this.contactEmail = data.contactEmail || '';
                this.contactPhone = data.contactPhone || '';
                this.contactAddress = data.contactAddress || '';
            } catch (e) {}
        }
        if (!this.authorName) {
            this.authorName = this._blogService.user?.name || 'Tác giả';
        }
        if (!this.contactEmail) {
            this.contactEmail = this._blogService.user?.email || '';
        }
    }

    loadScript() {
        this.isLoading = true;
        this.loadCoverDetails();
        this.loadSidebarChapters();
        this.cd.markForCheck();
        
        let username = this._blogService.user?.name || 'admin';

        // Load fallback draft title
        this._blogService.getDraft(this.uuid).subscribe({
            next: (draftRes: any) => {
                if (draftRes && draftRes.success && draftRes.data && draftRes.data.title) {
                    const realTitle = draftRes.data.title.trim();
                    this.draftTitleFallback = realTitle;
                    if (this.scriptDoc) {
                        this.scriptDoc.title = realTitle;
                    }
                    this.cd.markForCheck();
                }
            }
        });

        this._blogService.getScript({
            username: username,
            uuid: this.uuid
        }).subscribe({
            next: (res: any) => {
                if (res && res.success && res.data) {
                    this.scriptDoc = res.data;
                    if (this.draftTitleFallback) {
                        this.scriptDoc.title = this.draftTitleFallback;
                    }
                    this.scriptText = res.data.script || '';
                    this._multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
                } else if (res && res.script) {
                    // Cấu trúc fallback trực tiếp
                    this.scriptDoc = res;
                    if (this.draftTitleFallback) {
                        this.scriptDoc.title = this.draftTitleFallback;
                    }
                    this.scriptText = res.script;
                    this._multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
                }
                this.parseScriptText();
                this.isLoading = false;
                if (!this.scriptText) {
                    this.loadScriptList();
                }
                this.cd.markForCheck();
            },
            error: (err) => {
                console.error('Error loading script:', err);
                this.isLoading = false;
                this.loadScriptList();
                this.cd.markForCheck();
            }
        });
    }

    parseScriptText() {
        if (!this.scriptText) {
            this.parsedLines = [];
            return;
        }

        // Normalize HTML tags to newlines and plain text
        let processedText = this.scriptText || '';
        
        // 1. Replace br tags with newlines
        processedText = processedText.replace(/<br\s*\/?>/gi, '\n');
        
        // 2. Replace closing block tags with newlines
        processedText = processedText.replace(/<\/p>|<\/div>|<\/h[1-6]>/gi, '\n');
        
        // 3. Strip all other remaining HTML tags
        processedText = processedText.replace(/<\/?[^>]+(>|$)/g, '');
        
        // 4. Decode HTML entities (e.g. &nbsp; &amp; &lt; &gt; &quot;)
        const doc = new DOMParser().parseFromString(processedText, 'text/html');
        processedText = doc.documentElement.textContent || processedText;

        // 5. Replace all non-breaking spaces and special unicode spaces with normal space
        processedText = processedText.replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, ' ');

        // 6. Normalize multiple consecutive spaces and tabs to a single space (while keeping newlines)
        processedText = processedText.replace(/[ \t]+/g, ' ');

        const rawLines = processedText.split('\n');
        this.parsedLines = [];
        let lastType = '';
        
        for (let line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
                this.parsedLines.push({ type: 'empty', text: '' });
                lastType = ''; // Reset state on blank lines to separate paragraphs correctly
                continue;
            }

            // Remove markdown bold tags and normalize multiple spaces to a single space
            let clean = trimmed.replace(/^\*\*|\*\*$/g, '').replace(/\s+/g, ' ').trim();

            // Identify Character List / Character Breakdown Header & Cards
            const isCharacterListHeader = /^(DANH SÁCH NHÂN VẬT|GIỚI THIỆU NHÂN VẬT|CHARACTERS|CHARACTER BREAKDOWN)/i.test(clean);
            if (isCharacterListHeader) {
                this.parsedLines.push({ type: 'character-list-header', text: clean.replace(/^#+\s*/, '').toUpperCase() });
                lastType = 'character-list-header';
                continue;
            }

            const isCharacterCardTitle = /^NHÂN VẬT\s*:/i.test(clean) || /^CHARACTER\s*:/i.test(clean);
            if (isCharacterCardTitle) {
                this.parsedLines.push({ type: 'character-card-title', text: clean });
                lastType = 'character-card-title';
                continue;
            }

            if ((lastType === 'character-list-header' || lastType === 'character-card-title' || lastType === 'character-list-item') &&
                (clean.startsWith('•') || clean.startsWith('-') || clean.startsWith('*') || clean.includes(':'))) {
                if (!/^(INT\.|EXT\.|FADE\s+IN)/i.test(clean)) {
                    this.parsedLines.push({ type: 'character-list-item', text: clean });
                    lastType = 'character-list-item';
                    continue;
                }
            }

            // Identify Sluglines
            const isSlugline = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|CẢNH\s+\d+|PHÂN\s+CẢNH\s+\d+)/i.test(clean) ||
                               /^(INT\s|EXT\s)/i.test(clean) ||
                               (clean.toUpperCase() === clean && (clean.includes(' - ') || clean.includes(' – ')));

            if (isSlugline) {
                this.parsedLines.push({ type: 'slugline', text: clean.toUpperCase() });
                lastType = 'slugline';
                continue;
            }

            // Identify Parentheticals
            const isParenthetical = clean.startsWith('(') && clean.endsWith(')');
            if (isParenthetical) {
                this.parsedLines.push({ type: 'parenthetical', text: clean });
                lastType = 'parenthetical';
                continue;
            }

            // Identify Character Names
            const isCharacter = clean.toUpperCase() === clean && 
                                !/[.?!:,]$/.test(clean) && 
                                clean.split(/\s+/).length <= 4;

            if (isCharacter && lastType !== 'character') {
                this.parsedLines.push({ type: 'character', text: clean });
                lastType = 'character';
                continue;
            }

            // Identify Dialogue continuation
            if (lastType === 'dialogue' && !isCharacter) {
                const lastItem = this.parsedLines[this.parsedLines.length - 1];
                if (lastItem && lastItem.type === 'dialogue') {
                    lastItem.text += ' ' + clean;
                } else {
                    this.parsedLines.push({ type: 'dialogue', text: clean });
                }
                lastType = 'dialogue';
                continue;
            }

            // Identify Dialogue
            if (lastType === 'character' || lastType === 'parenthetical') {
                this.parsedLines.push({ type: 'dialogue', text: clean });
                lastType = 'dialogue';
                continue;
            }

            // Default: Action
            const lastItem = this.parsedLines[this.parsedLines.length - 1];
            if (lastItem && lastItem.type === 'action') {
                lastItem.text += ' ' + clean;
            } else {
                this.parsedLines.push({ type: 'action', text: clean });
            }
            lastType = 'action';
        }

        // Paginate the parsed lines into A4 pages
        this.pages = [];
        let currentPage: ScreenplayLine[] = [];
        let currentHeight = 0;
        const maxHeight = 85; // Max height units per A4 page

        for (let item of this.parsedLines) {
            let itemHeight = 0;
            switch (item.type) {
                case 'character-list-header':
                    itemHeight = 6;
                    break;
                case 'character-card-title':
                    itemHeight = 6;
                    break;
                case 'character-list-item':
                    const listItemLines = Math.max(1, Math.ceil(item.text.length / 50));
                    itemHeight = 2 + (listItemLines * 3.5);
                    break;
                case 'slugline':
                    itemHeight = 8;
                    break;
                case 'action':
                    // Estimate wrapped lines based on ~55 chars per line
                    const actionLines = Math.max(1, Math.ceil(item.text.length / 55));
                    itemHeight = 3 + (actionLines * 3.5);
                    break;
                case 'character':
                    itemHeight = 4;
                    break;
                case 'parenthetical':
                    itemHeight = 3;
                    break;
                case 'dialogue':
                    // Dialogue wraps earlier because of 20% left/right margins (~35 chars per line)
                    const dialogueLines = Math.max(1, Math.ceil(item.text.length / 35));
                    itemHeight = 2 + (dialogueLines * 3.5);
                    break;
                case 'empty':
                    itemHeight = 2;
                    break;
                default:
                    itemHeight = 3;
            }

            if (currentHeight + itemHeight > maxHeight && currentPage.length > 0) {
                this.pages.push(currentPage);
                currentPage = [];
                currentHeight = 0;
                
                // If it starts with an empty line on the new page, skip it
                if (item.type === 'empty') {
                    continue;
                }
            }

            currentPage.push(item);
            currentHeight += itemHeight;
        }

        if (currentPage.length > 0) {
            this.pages.push(currentPage);
        }
    }

    copyToClipboard() {
        if (this.scriptText) {
            this.clipboard.copy(this.scriptText);
            this.toastr.success('Đã copy kịch bản vào clipboard!');
        }
    }

    goBack() {
        this.router.navigate(['/ai-writer', this.name, this.uuid]);
    }

    extractCleanDoneContent(art: any): string {
        if (!art) return '';
        let content = '';
        const rawDone = art.done || art.content || art.text || (art.source ? (art.source.done || art.source.text || art.source.prompt) : null);
        if (rawDone) {
            if (Array.isArray(rawDone)) {
                content = rawDone
                    .map((paragraph: any) => typeof paragraph === 'string' ? paragraph.replace(/<[^>]*>?/gm, '').trim() : '')
                    .filter((text: string) => text.length > 0)
                    .join('\n\n');
            } else if (typeof rawDone === 'string') {
                content = rawDone.replace(/<[^>]*>?/gm, '').trim();
            }
        }
        return content;
    }

    async fetchCollectionContentBulk(uuids: string[], username: string): Promise<any[]> {
        if (!uuids || uuids.length === 0) return [];
        let docsMap: Record<string, any> = {};

        try {
            const bulkRes: any = await firstValueFrom(this._crawlService.archive({
                username: username,
                uuids: uuids,
                page: { size: Math.max(uuids.length, 2000) }
            })).catch(() => null);

            let docsList: any[] = [];
            if (bulkRes && bulkRes.data) {
                if (Array.isArray(bulkRes.data.docs)) {
                    docsList = bulkRes.data.docs;
                } else if (Array.isArray(bulkRes.data)) {
                    docsList = bulkRes.data;
                } else if (Array.isArray(bulkRes.data.data)) {
                    docsList = bulkRes.data.data;
                }
            } else if (bulkRes && Array.isArray(bulkRes.docs)) {
                docsList = bulkRes.docs;
            }

            docsList.forEach((doc: any) => {
                if (doc) {
                    const cleanContent = this.extractCleanDoneContent(doc);
                    const docItem = {
                        uuid: doc.uuid || doc._id || doc.id,
                        title: doc.title || doc.name || '',
                        done: cleanContent,
                        style: (doc.source && doc.source.style) ? doc.source.style : (doc.style || null),
                        createdAt: doc.createdAt || doc.created_at || doc.date || doc.updatedAt || 0
                    };
                    if (doc.uuid) docsMap[doc.uuid] = docItem;
                    if (doc._id) docsMap[doc._id] = docItem;
                    if (doc.id) docsMap[doc.id] = docItem;
                }
            });
        } catch (err) {
            console.warn('Lỗi gọi bulk archive:', err);
        }

        let resultDocs = uuids.map(uuid => docsMap[uuid]).filter(doc => !!doc && !!doc.done);
        if (resultDocs.length === 0 && Object.keys(docsMap).length > 0) {
            resultDocs = Object.values(docsMap).filter((doc: any) => !!doc && !!doc.done);
        }

        resultDocs.sort((a: any, b: any) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return dateA - dateB;
        });
        return resultDocs;
    }

    async getCollectionDocsFromDb(username: string): Promise<any[]> {
        const colRes: any = await firstValueFrom(this._crawlService.collections({
            username: username,
            page: { size: 500 },
            includeUuid: true
        })).catch(() => null);

        let allCollections: any[] = [];
        if (colRes && colRes.success && colRes.data) {
            if (Array.isArray(colRes.data)) {
                allCollections = colRes.data;
            } else if (Array.isArray(colRes.data.docs)) {
                allCollections = colRes.data.docs;
            } else if (Array.isArray(colRes.data.data)) {
                allCollections = colRes.data.data;
            }
        } else if (colRes && Array.isArray(colRes.docs)) {
            allCollections = colRes.docs;
        }

        let targetCol: any = allCollections.find((c: any) => {
            if (!c) return false;
            if (c._id === this.uuid || c.id === this.uuid || c.collectionId === this.uuid) return true;
            if (Array.isArray(c.uuid) && c.uuid.includes(this.uuid)) return true;
            if (c.uuid === this.uuid) return true;
            if (Array.isArray(c.uuids) && c.uuids.includes(this.uuid)) return true;
            if (c.uuids === this.uuid) return true;
            if (this.scriptDoc && (c._id === this.scriptDoc.collectionId || c.id === this.scriptDoc.collectionId)) return true;
            return false;
        });

        let uuidsToFetch: string[] = [];
        if (targetCol) {
            const rawUuids = targetCol.uuid || targetCol.uuids || targetCol.articles;
            if (Array.isArray(rawUuids)) {
                uuidsToFetch = rawUuids.filter((u: any) => typeof u === 'string' && u.trim().length > 0);
            } else if (rawUuids && typeof rawUuids === 'string') {
                uuidsToFetch = [rawUuids];
            }
        }

        if (uuidsToFetch.length === 0 && this.uuid) {
            try {
                const nodeColRes: any = await firstValueFrom(this._crawlService.nodeInCollection({
                    uuid: this.uuid,
                    username: username
                })).catch(() => null);
                if (nodeColRes && nodeColRes.data) {
                    const nData = nodeColRes.data;
                    if (Array.isArray(nData.uuid)) uuidsToFetch = nData.uuid;
                    else if (Array.isArray(nData.uuids)) uuidsToFetch = nData.uuids;
                    else if (Array.isArray(nData.docs)) uuidsToFetch = nData.docs.map((d: any) => d.uuid || d._id).filter((u: any) => !!u);
                    else if (Array.isArray(nData)) uuidsToFetch = nData.map((d: any) => d.uuid || d._id || d).filter((u: any) => !!u);
                }
            } catch (e) {}
        }

        if (uuidsToFetch.length === 0 && this.scriptDoc) {
            if (Array.isArray(this.scriptDoc.uuids)) uuidsToFetch = this.scriptDoc.uuids;
            else if (Array.isArray(this.scriptDoc.articles)) uuidsToFetch = this.scriptDoc.articles;
        }

        if (uuidsToFetch.length === 0 && this.uuid) {
            uuidsToFetch = [this.uuid];
        }

        uuidsToFetch = Array.from(new Set(uuidsToFetch));
        return await this.fetchCollectionContentBulk(uuidsToFetch, username);
    }

    async saveScriptTextToDb(username: string): Promise<boolean> {
        if (!this.uuid || !this.scriptText) return false;
        const collectionTitle = this.scriptDoc?.title || this.draftTitleFallback || 'Kịch bản tiểu thuyết';
        try {
            await firstValueFrom(this._blogService.storeScript({
                username: username,
                uuid: this.uuid,
                title: collectionTitle,
                outline: this.scriptDoc?.outline || 'Toàn bộ Collection',
                script: this.scriptText
            }));
            this._multiAccountService.setItem(`ai_type_script_data_${this.uuid}`, true);
            if (this.scriptDoc) {
                this.scriptDoc.script = this.scriptText;
            }
            return true;
        } catch (e) {
            console.warn('Lỗi khi lưu kịch bản vào DB:', e);
            return false;
        }
    }

    async regenerateScript() {
        this.isRegenerating = true;
        this.isLoading = true;
        this.cd.markForCheck();

        const username = this._blogService.user?.name || 'admin';
        let loadedFullDocs: any[] = [];
        let collectionTitle = this.scriptDoc?.title || this.draftTitleFallback || 'Kịch bản tiểu thuyết';

        try {
            this.toastr.info('Đang đọc trực tiếp dữ liệu các bài viết từ CSDL...', 'Đang xử lý siêu tốc');
            loadedFullDocs = await this.getCollectionDocsFromDb(username);
        } catch (err) {
            console.warn('Lỗi khi đọc bài viết từ CSDL:', err);
        }

        if (!loadedFullDocs || loadedFullDocs.length === 0) {
            this.toastr.error('Không tìm thấy dữ liệu bài viết (trường done) trong cơ sở dữ liệu để tạo lại kịch bản!', 'Lỗi dữ liệu');
            this.isRegenerating = false;
            this.isLoading = false;
            this.cd.markForCheck();
            return;
        }

        let fullScriptParts: string[] = [];
        let currentSceneNumber = 1;

        this.toastr.info(`Đang dựng lại kịch bản trọn vẹn từ ${loadedFullDocs.length} bài viết trong CSDL...`, 'Xử lý từng chương');

        for (let idx = 0; idx < loadedFullDocs.length; idx++) {
            const art = loadedFullDocs[idx];
            const chapterTitle = art.title || `Chương ${idx + 1}`;
            const contentFromDone = (art.done || '').trim();
            if (!contentFromDone) continue;

            this.toastr.info(`[Chương ${idx + 1}/${loadedFullDocs.length}] Đang mổ xẻ chi tiết trường DONE của bài: "${chapterTitle}"...`, 'Đang xử lý');

            let prompt = `Bạn là một Nhà biên kịch Điện ảnh Chuyên nghiệp.
Nhiệm vụ của bạn là CHUYỂN THỂ TRUNG THỰC TUYỆT ĐỐI (100% High-Fidelity Adaptation) CHƯƠNG ${idx + 1}/${loadedFullDocs.length} thuộc tác phẩm dưới đây thành một KỊCH BẢN PHIM ĐIỆN ẢNH chuẩn mực chiếu rạp.

TIÊU ĐỀ TÁC PHẨM TỔNG THỂ: ${collectionTitle}
CHƯƠNG HIỆN TẠI (CHƯƠNG ${idx + 1}/${loadedFullDocs.length}): ${chapterTitle}\n`;

            if (art.style) {
                if (typeof art.style === 'string' && art.style.trim()) {
                    prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n${art.style.trim()}\n`;
                } else if (typeof art.style === 'object') {
                    const styleName = art.style.name || '';
                    const styleDesc = art.style.desc || '';
                    if (styleName || styleDesc) {
                        prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n`;
                        if (styleName) prompt += `- Tên phong cách: ${styleName}\n`;
                        if (styleDesc) prompt += `- Mô tả phong cách: ${styleDesc}\n`;
                    }
                }
            }

            prompt += `\nNỘI DUNG VĂN BẢN GỐC CỦA CHƯƠNG NÀY TRONG CSDL (TRƯỜNG DONE):
${contentFromDone}

QUY TẮC BẮT BUỘC CHUYỂN THỂ SIÊU CHI TIẾT:
1. BÁM SÁT 100% TỪNG ĐOẠN VĂN CỦA TRƯỜNG DONE CHƯƠNG NÀY - ZERO OMISSION:
- Chuyển thể TUẦN TỰ TỪNG ĐOẠN VĂN từ đầu tới cuối của trường DONE Chương này sang các phân cảnh kịch bản. KHÔNG BỎ SÓT BẤT KỲ ĐOẠN VĂN HAY CHI TIẾT NÀO.
- ĐÁNH SỐ CẢNH: Bắt đầu đánh số phân cảnh từ CẢNH ${currentSceneNumber}. Tăng dần số cảnh liên tục (Cảnh ${currentSceneNumber}, Cảnh ${currentSceneNumber + 1}, ...).

2. VIẾT CỰC KỲ CHI TIẾT HÀNH ĐỘNG, THOẠI VÀ BỐI CẢNH (ULTRA-DETAILED ACTION & FULL DIALOGUE):
- DÒNG HÀNH ĐỘNG (ACTION LINES) SIÊU CHI TIẾT: Mổ xẻ tỉ mỉ cử chỉ, biểu cảm, ánh mắt, tư thế, di chuyển, âm thanh môi trường và ánh sáng bối cảnh.
- LỜI THOẠI (DIALOGUE) TRỌN VẸN 100%: Viết đầy đủ từng câu thoại, mở ngoặc đơn sắc thái tình cảm. CẤM VIẾT TẮT, cấm dùng các từ tóm tắt hời hợt như "v.v.", "...", "hai người tiếp tục trò chuyện...".
- ĐỘ TUỔI, TÊN GỐC & NGHỀ NGHIỆP: Giữ nguyên 100% tên gốc, con số độ tuổi (Ví dụ: Nếu nguyên tác ghi "40 tuổi" thì kịch bản BẮT BUỘC ghi (40), TUYỆT ĐỐI KHÔNG ĐỔI THÀNH 20 hay 30 tuổi!) và nghề nghiệp nguyên tác.

3. ĐỊNH DẠNG KỊCH BẢN ĐIỆN ẢNH CHUẨN ĐIỆN ẢNH CHIẾU RẠP:
- TUYỆT ĐỐI KHÔNG VIẾT MỤC 'NHÂN VẬT:' HOẶC LIỆT KÊ DANH SÁCH NHÂN VẬT Ở ĐẦU KỊCH BẢN.
- GIỚI THIỆU NHÂN VẬT TRỰC TIẾP TRONG DÒNG HÀNH ĐỘNG (ACTION LINES) khi nhân vật xuất hiện lần đầu tiên ở phân cảnh (Ví dụ: MAI (27), một phụ nữ trẻ cương nghị...).
- Bắt đầu kịch bản ngay bằng CẢNH ${currentSceneNumber} hoặc "FADE IN:". KHÔNG kèm lời dẫn hay giải thích thừa.`;

            try {
                const response = await this._genaiService.generateContent({
                    model: 'gemini-3.6-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: { temperature: 0.1 }
                });

                const chapterScript = response.text ? response.text.trim() : '';
                if (chapterScript) {
                    const sceneMatches = chapterScript.match(/(?:CẢNH|SCENE)\s+(\d+)/gi);
                    if (sceneMatches && sceneMatches.length > 0) {
                        const lastMatch = sceneMatches[sceneMatches.length - 1];
                        const numMatch = lastMatch.match(/\d+/);
                        if (numMatch) {
                            currentSceneNumber = parseInt(numMatch[0], 10) + 1;
                        }
                    } else {
                        currentSceneNumber += 5;
                    }

                    fullScriptParts.push(`========================================\n[PHẦN KỊCH BẢN CHƯƠNG ${idx + 1}: ${chapterTitle}]\n========================================\n\n` + chapterScript);
                }
            } catch (e) {
                console.warn(`Lỗi khi dựng kịch bản cho Chương ${idx + 1}:`, e);
            }
        }

        const finalScriptText = fullScriptParts.join('\n\n');

        if (finalScriptText && finalScriptText.trim()) {
            this.scriptText = finalScriptText;
            await this.saveScriptTextToDb(username);
            this.parseScriptText();
            this.toastr.success(`Tạo lại kịch bản từ ${loadedFullDocs.length} bài viết trong CSDL thành công!`);
        } else {
            this.toastr.error('AI không phản hồi nội dung kịch bản.', 'Lỗi AI');
        }
        this.isRegenerating = false;
        this.isLoading = false;
        this.cd.markForCheck();
    }

    async appendNewChapters() {
        if (this.isRegenerating || this.isLoading) return;
        this.isRegenerating = true;
        this.isLoading = true;
        this.cd.markForCheck();

        const username = this._blogService.user?.name || 'admin';
        let collectionTitle = this.scriptDoc?.title || this.draftTitleFallback || 'Kịch bản tiểu thuyết';

        try {
            this.toastr.info('Đang kiểm tra các chương mới trong CSDL Collection...', 'Đang xử lý');
            const fullDocs = await this.getCollectionDocsFromDb(username);

            if (!fullDocs || fullDocs.length === 0) {
                this.toastr.warning('Không tìm thấy dữ liệu bài viết nào trong Collection!', 'Thông báo');
                return;
            }

            const missingDocs: { doc: any; originalIdx: number }[] = [];
            fullDocs.forEach((doc: any, idx: number) => {
                const chTitle = doc.title || `Chương ${idx + 1}`;
                const isAlreadyIncluded = this.scriptText.includes(`PHẦN KỊCH BẢN CHƯƠNG ${idx + 1}:`) || 
                                         this.scriptText.toLowerCase().includes(chTitle.toLowerCase().trim());
                if (!isAlreadyIncluded) {
                    missingDocs.push({ doc: doc, originalIdx: idx });
                }
            });

            if (missingDocs.length === 0) {
                this.toastr.info(`Tất cả ${fullDocs.length} chương trong Collection đã có trọn vẹn trong kịch bản!`, 'Không có chương mới');
                return;
            }

            let highestScene = 1;
            const matches = this.scriptText.match(/(?:CẢNH|SCENE)\s+(\d+)/gi);
            if (matches && matches.length > 0) {
                matches.forEach(m => {
                    const num = parseInt(m.replace(/\D/g, ''), 10);
                    if (!isNaN(num) && num > highestScene) {
                        highestScene = num;
                    }
                });
                highestScene += 1;
            }

            this.toastr.info(`Phát hiện ${missingDocs.length} chương mới! Bắt đầu tạo nối tiếp từ CẢNH ${highestScene}...`, 'Tạo nối tiếp');

            let newScriptParts: string[] = [];
            let currentSceneNumber = highestScene;

            for (let i = 0; i < missingDocs.length; i++) {
                const { doc: art, originalIdx } = missingDocs[i];
                const chapterTitle = art.title || `Chương ${originalIdx + 1}`;
                const contentFromDone = (art.done || '').trim();
                if (!contentFromDone) continue;

                this.toastr.info(`[Nối tiếp ${i + 1}/${missingDocs.length}] Đang chuyển thể Chương ${originalIdx + 1}: "${chapterTitle}"...`, 'Đang xử lý');

                let prompt = `Bạn là một Nhà biên kịch Điện ảnh Chuyên nghiệp.
Nhiệm vụ của bạn là CHUYỂN THỂ TRUNG THỰC TUYỆT ĐỐI (100% High-Fidelity Adaptation) CHƯƠNG ${originalIdx + 1}/${fullDocs.length} thuộc tác phẩm dưới đây thành một KỊCH BẢN PHIM ĐIỆN ẢNH chuẩn mực chiếu rạp.

TIÊU ĐỀ TÁC PHẨM TỔNG THỂ: ${collectionTitle}
CHƯƠNG HIỆN TẠI (CHƯƠNG ${originalIdx + 1}/${fullDocs.length}): ${chapterTitle}\n`;

                if (art.style) {
                    if (typeof art.style === 'string' && art.style.trim()) {
                        prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n${art.style.trim()}\n`;
                    } else if (typeof art.style === 'object') {
                        const styleName = art.style.name || '';
                        const styleDesc = art.style.desc || '';
                        if (styleName || styleDesc) {
                            prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n`;
                            if (styleName) prompt += `- Tên phong cách: ${styleName}\n`;
                            if (styleDesc) prompt += `- Mô tả phong cách: ${styleDesc}\n`;
                        }
                    }
                }

                prompt += `\nNỘI DUNG VĂN BẢN GỐC CỦA CHƯƠNG NÀY TRONG CSDL (TRƯỜNG DONE):
${contentFromDone}

QUY TẮC BẮT BUỘC CHUYỂN THỂ SIÊU CHI TIẾT:
1. BÁM SÁT 100% TỪNG ĐOẠN VĂN CỦA TRƯỜNG DONE CHƯƠNG NÀY - ZERO OMISSION:
- Chuyển thể TUẦN TỰ TỪNG ĐOẠN VĂN từ đầu tới cuối của trường DONE Chương này sang các phân cảnh kịch bản. KHÔNG BỎ SÓT BẤT KỲ ĐOẠN VĂN HAY CHI TIẾT NÀO.
- ĐÁNH SỐ CẢNH: Bắt đầu đánh số phân cảnh từ CẢNH ${currentSceneNumber}. Tăng dần số cảnh liên tục (Cảnh ${currentSceneNumber}, Cảnh ${currentSceneNumber + 1}, ...).

2. VIẾT CỰC KỲ CHI TIẾT HÀNH ĐỘNG, THOẠI VÀ BỐI CẢNH (ULTRA-DETAILED ACTION & FULL DIALOGUE):
- DÒNG HÀNH ĐỘNG (ACTION LINES) SIÊU CHI TIẾT: Mổ xẻ tỉ mỉ cử chỉ, biểu cảm, ánh mắt, tư thế, di chuyển, âm thanh môi trường và ánh sáng bối cảnh.
- LỜI THOẠI (DIALOGUE) TRỌN VẸN 100%: Viết đầy đủ từng câu thoại, mở ngoặc đơn sắc thái tình cảm. CẤM VIẾT TẮT, cấm dùng các từ tóm tắt hời hợt như "v.v.", "...", "hai người tiếp tục trò chuyện...".
- ĐỘ TUỔI, TÊN GỐC & NGHỀ NGHIỆP: Giữ nguyên 100% tên gốc, con số độ tuổi (Ví dụ: Nếu nguyên tác ghi "40 tuổi" thì kịch bản BẮT BUỘC ghi (40), TUYỆT ĐỐI KHÔNG ĐỔI THÀNH 20 hay 30 tuổi!) và nghề nghiệp nguyên tác.

3. ĐỊNH DẠNG KỊCH BẢN ĐIỆN ẢNH CHUẨN ĐIỆN ẢNH CHIẾU RẠP:
- TUYỆT ĐỐI KHÔNG VIẾT MỤC 'NHÂN VẬT:' HOẶC LIỆT KÊ DANH SÁCH NHÂN VẬT Ở ĐẦU KỊCH BẢN.
- GIỚI THIỆU NHÂN VẬT TRỰC TIẾP TRONG DÒNG HÀNH ĐỘNG (ACTION LINES) khi nhân vật xuất hiện lần đầu tiên ở phân cảnh (Ví dụ: MAI (27), một phụ nữ trẻ cương nghị...).
- Bắt đầu kịch bản ngay bằng CẢNH ${currentSceneNumber} hoặc "FADE IN:". KHÔNG kèm lời dẫn hay giải thích thừa.`;

                try {
                    const response = await this._genaiService.generateContent({
                        model: 'gemini-3.6-flash',
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        config: { temperature: 0.1 }
                    });

                    const chapterScript = response.text ? response.text.trim() : '';
                    if (chapterScript) {
                        const sceneMatches = chapterScript.match(/(?:CẢNH|SCENE)\s+(\d+)/gi);
                        if (sceneMatches && sceneMatches.length > 0) {
                            const lastMatch = sceneMatches[sceneMatches.length - 1];
                            const numMatch = lastMatch.match(/\d+/);
                            if (numMatch) {
                                currentSceneNumber = parseInt(numMatch[0], 10) + 1;
                            }
                        } else {
                            currentSceneNumber += 5;
                        }

                        newScriptParts.push(`========================================\n[PHẦN KỊCH BẢN CHƯƠNG ${originalIdx + 1}: ${chapterTitle}]\n========================================\n\n` + chapterScript);
                    }
                } catch (e) {
                    console.warn(`Lỗi khi dựng kịch bản nối tiếp cho Chương ${originalIdx + 1}:`, e);
                }
            }

            if (newScriptParts.length > 0) {
                this.scriptText = (this.scriptText ? this.scriptText + '\n\n' : '') + newScriptParts.join('\n\n');
                await this.saveScriptTextToDb(username);
                this.parseScriptText();
                this.toastr.success(`Đã tạo nối tiếp kịch bản thành công cho ${newScriptParts.length} chương mới!`, 'Hoàn tất');
            }
        } catch (err) {
            console.error('Lỗi tạo nối tiếp:', err);
        } finally {
            this.isRegenerating = false;
            this.isLoading = false;
            this.cd.markForCheck();
        }
    }

    async openSingleChapterModal() {
        this.showSingleChapterModal = true;
        this.isLoadingChapterList = true;
        this.cd.markForCheck();

        const username = this._blogService.user?.name || 'admin';
        this.availableChapters = await this.getCollectionDocsFromDb(username);
        this.isLoadingChapterList = false;
        this.cd.markForCheck();
    }

    async regenerateSingleChapter(artIdx: number) {
        if (this.isRegenerating) return;
        this.isRegenerating = true;
        this.regeneratingChapterIdx = artIdx;
        this.showSingleChapterModal = false;
        this.isLoading = true;
        this.cd.markForCheck();

        const username = this._blogService.user?.name || 'admin';
        let collectionTitle = this.scriptDoc?.title || this.draftTitleFallback || 'Kịch bản tiểu thuyết';

        try {
            const art = this.availableChapters[artIdx];
            if (!art) {
                this.toastr.error('Không tìm thấy dữ liệu chương được chọn!');
                return;
            }

            const chapterTitle = art.title || `Chương ${artIdx + 1}`;
            const contentFromDone = (art.done || '').trim();

            if (!contentFromDone) {
                this.toastr.error(`Chương "${chapterTitle}" chưa có nội dung trường DONE trong CSDL!`);
                return;
            }

            let startScene = 1;
            const chapterHeaderPattern = new RegExp(`========================================\\s*\\[PHẦN KỊCH BẢN CHƯƠNG ${artIdx + 1}:`, 'i');
            const headerMatch = this.scriptText.match(chapterHeaderPattern);
            
            if (headerMatch && headerMatch.index !== undefined) {
                const textBefore = this.scriptText.substring(0, headerMatch.index);
                const matches = textBefore.match(/(?:CẢNH|SCENE)\s+(\d+)/gi);
                if (matches && matches.length > 0) {
                    const lastMatch = matches[matches.length - 1];
                    const num = parseInt(lastMatch.replace(/\D/g, ''), 10);
                    if (!isNaN(num)) startScene = num + 1;
                }
            }

            this.toastr.info(`Đang chuyển thể lại riêng kịch bản cho Chương ${artIdx + 1}: "${chapterTitle}" (từ CẢNH ${startScene})...`, 'Đang xử lý');

            let prompt = `Bạn là một Nhà biên kịch Điện ảnh Chuyên nghiệp.
Nhiệm vụ của bạn là CHUYỂN THỂ TRUNG THỰC TUYỆT ĐỐI (100% High-Fidelity Adaptation) CHƯƠNG ${artIdx + 1}/${this.availableChapters.length} thuộc tác phẩm dưới đây thành một KỊCH BẢN PHIM ĐIỆN ẢNH chuẩn mực chiếu rạp.

TIÊU ĐỀ TÁC PHẨM TỔNG THỂ: ${collectionTitle}
CHƯƠNG HIỆN TẠI (CHƯƠNG ${artIdx + 1}/${this.availableChapters.length}): ${chapterTitle}\n`;

            if (art.style) {
                if (typeof art.style === 'string' && art.style.trim()) {
                    prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n${art.style.trim()}\n`;
                } else if (typeof art.style === 'object') {
                    const styleName = art.style.name || '';
                    const styleDesc = art.style.desc || '';
                    if (styleName || styleDesc) {
                        prompt += `\nPHONG CÁCH TÁC GIẢ / NGUYÊN TÁC:\n`;
                        if (styleName) prompt += `- Tên phong cách: ${styleName}\n`;
                        if (styleDesc) prompt += `- Mô tả phong cách: ${styleDesc}\n`;
                    }
                }
            }

            prompt += `\nNỘI DUNG VĂN BẢN GỐC CỦA CHƯƠNG NÀY TRONG CSDL (TRƯỜNG DONE):
${contentFromDone}

QUY TẮC BẮT BUỘC CHUYỂN THỂ SIÊU CHI TIẾT:
1. BÁM SÁT 100% TỪNG ĐOẠN VĂN CỦA TRƯỜNG DONE CHƯƠNG NÀY - ZERO OMISSION:
- Chuyển thể TUẦN TỰ TỪNG ĐOẠN VĂN từ đầu tới cuối của trường DONE Chương này sang các phân cảnh kịch bản. KHÔNG BỎ SÓT BẤT KỲ ĐOẠN VĂN HAY CHI TIẾT NÀO.
- ĐÁNH SỐ CẢNH: Bắt đầu đánh số phân cảnh từ CẢNH ${startScene}. Tăng dần số cảnh liên tục (Cảnh ${startScene}, Cảnh ${startScene + 1}, ...).

2. VIẾT CỰC KỲ CHI TIẾT HÀNH ĐỘNG, THOẠI VÀ BỐI CẢNH (ULTRA-DETAILED ACTION & FULL DIALOGUE):
- DÒNG HÀNH ĐỘNG (ACTION LINES) SIÊU CHI TIẾT: Mổ xẻ tỉ mỉ cử chỉ, biểu cảm, ánh mắt, tư thế, di chuyển, âm thanh môi trường và ánh sáng bối cảnh.
- LỜI THOẠI (DIALOGUE) TRỌN VẸN 100%: Viết đầy đủ từng câu thoại, mở ngoặc đơn sắc thái tình cảm. CẤM VIẾT TẮT, cấm dùng các từ tóm tắt hời hợt như "v.v.", "...", "hai người tiếp tục trò chuyện...".
- ĐỘ TUỔI, TÊN GỐC & NGHỀ NGHIỆP: Giữ nguyên 100% tên gốc, con số độ tuổi (Ví dụ: Nếu nguyên tác ghi "40 tuổi" thì kịch bản BẮT BUỘC ghi (40), TUYỆT ĐỐI KHÔNG ĐỔI THÀNH 20 hay 30 tuổi!) và nghề nghiệp nguyên tác.

3. ĐỊNH DẠNG KỊCH BẢN ĐIỆN ẢNH CHUẨN ĐIỆN ẢNH CHIẾU RẠP:
- TUYỆT ĐỐI KHÔNG VIẾT MỤC 'NHÂN VẬT:' HOẶC LIỆT KÊ DANH SÁCH NHÂN VẬT Ở ĐẦU KỊCH BẢN.
- GIỚI THIỆU NHÂN VẬT TRỰC TIẾP TRONG DÒNG HÀNH ĐỘNG (ACTION LINES) khi nhân vật xuất hiện lần đầu tiên ở phân cảnh (Ví dụ: MAI (27), một phụ nữ trẻ cương nghị...).
- Bắt đầu kịch bản ngay bằng CẢNH ${startScene} hoặc "FADE IN:". KHÔNG kèm lời dẫn hay giải thích thừa.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { temperature: 0.1 }
            });

            const newChapterScript = response.text ? response.text.trim() : '';

            if (newChapterScript) {
                const formattedBlock = `========================================\n[PHẦN KỊCH BẢN CHƯƠNG ${artIdx + 1}: ${chapterTitle}]\n========================================\n\n` + newChapterScript;
                
                const blockStartPattern = new RegExp(`========================================\\s*\\[PHẦN KỊCH BẢN CHƯƠNG ${artIdx + 1}:[\\s\\S]*?(?=(========================================\\s*\\[PHẦN KỊCH BẢN CHƯƠNG |$))`, 'i');
                
                if (blockStartPattern.test(this.scriptText)) {
                    this.scriptText = this.scriptText.replace(blockStartPattern, formattedBlock + '\n\n');
                } else {
                    this.scriptText = (this.scriptText ? this.scriptText + '\n\n' : '') + formattedBlock;
                }

                await this.saveScriptTextToDb(username);
                this.parseScriptText();
                this.toastr.success(`Đã dựng lại kịch bản cho Chương ${artIdx + 1}: "${chapterTitle}" thành công!`, 'Hoàn tất');
            }
        } catch (e) {
            console.error('Lỗi khi dựng lại kịch bản 1 chương:', e);
            this.toastr.error('Có lỗi xảy ra khi tạo lại kịch bản chương này!');
        } finally {
            this.isRegenerating = false;
            this.regeneratingChapterIdx = null;
            this.isLoading = false;
            this.cd.markForCheck();
        }
    }

    loadSidebarChapters(): void {
        this.isLoadingChapterList = true;
        this.cd.markForCheck();
        const username = this._blogService.user?.name || 'admin';

        this.getCollectionDocsFromDb(username).then((docs) => {
            this.availableChapters = docs || [];
            this.isLoadingChapterList = false;
            this.cd.markForCheck();
        }).catch((err) => {
            console.warn('Lỗi nạp bài viết cho Sidebar:', err);
            this.availableChapters = [];
            this.isLoadingChapterList = false;
            this.cd.markForCheck();
        });
    }

    isChapterInScript(chapter: any, index: number): boolean {
        if (!this.scriptText) return false;
        const title = chapter.title || '';
        if (this.scriptText.includes(`PHẦN KỊCH BẢN CHƯƠNG ${index + 1}:`)) return true;
        if (title.length > 3 && this.scriptText.toLowerCase().includes(title.toLowerCase().trim())) return true;
        return false;
    }

    scrollToChapter(index: number): void {
        const chapterTitle = this.availableChapters[index]?.title || `Chương ${index + 1}`;
        const chapterHeaderPattern = new RegExp(`CHƯƠNG ${index + 1}`, 'i');
        
        const elements = Array.from(document.querySelectorAll('.screenplay-outer, .screenplay-character-list-header, .screenplay-slugline, .screenplay-action'));
        const targetEl = elements.find(el => el.textContent && (el.textContent.toLowerCase().includes(chapterTitle.toLowerCase().trim()) || chapterHeaderPattern.test(el.textContent)));

        if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.toastr.info(`Đã cuộn đến ${chapterTitle}`, 'Di chuyển');
        } else {
            this.toastr.warning(`Không tìm thấy vị trí ${chapterTitle} trong kịch bản.`);
        }
    }

    toSlug(str: string): string {
        str = str || '';
        str = str.toLowerCase();
        str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        str = str.replace(/[đĐ]/g, 'd');
        str = str.replace(/([^0-9a-z-\s])/g, '');
        str = str.replace(/(\s+)/g, '-');
        str = str.replace(/^-+|-+$/g, '');
        return str;
    }

    cleanDialogueText(text: string): string {
        if (!text) return '';
        let clean = text;

        // 1. Loại bỏ các ghi chú sắc thái/hướng dẫn diễn xuất trong ngoặc đơn (kể cả có dấu * xung quanh)
        // Ví dụ: *(Giọng độc thoại nội tâm...)* hay (Mỉa mai, giọng...) hay *(Gào lên trong gió nước)*
        clean = clean.replace(/\*?\s*\([^)]*\)\s*\*?/gi, '');
        clean = clean.replace(/\*?\s*\[[^\]]*\]\s*\*?/gi, '');

        // 2. Loại bỏ các ký tự markdown dư thừa (*, _, ~, #)
        clean = clean.replace(/[*_~#]/g, '');

        // 3. Chuẩn hóa khoảng trắng dư thừa
        clean = clean.replace(/\s+/g, ' ').trim();

        return clean;
    }

    navigateToVideoGenerator(): void {
        if (!this.uuid) {
            this.toastr.error('Không tìm thấy mã hiệu kịch bản!');
            return;
        }

        const scriptTitle = this.scriptDoc?.title || this.draftTitleFallback || 'Kịch bản phim';

        if (!this.parsedLines || this.parsedLines.length === 0) {
            this.parseScriptText();
        }

        const audioClips: any[] = [];
        let currentCharacter = '';

        for (let i = 0; i < this.parsedLines.length; i++) {
            const lineItem = this.parsedLines[i];
            if (lineItem.type === 'character') {
                currentCharacter = lineItem.text.trim();
            } else if (lineItem.type === 'dialogue') {
                const rawDialogue = (lineItem.text || '').trim();

                // Lọc bỏ nếu đây là tiêu đề chương / tiêu đề kịch bản
                if (/^(PHẦN\s+KỊCH\s+BẢN|CHƯƠNG\s+\d+|PHẦN\s+\d+|CẢNH\s+\d+|PHÂN\s+CẢNH)/i.test(rawDialogue)) {
                    continue;
                }

                const dialogueContent = this.cleanDialogueText(rawDialogue);
                if (dialogueContent && dialogueContent.length > 1) {
                    audioClips.push({
                        id: String(audioClips.length + 1),
                        name: dialogueContent,
                        description: dialogueContent,
                        voice: 'vi-VN-HoaiMyNeural',
                        rate: 1.0,
                        pitch: 0,
                        duration: 0
                    });
                }
            }
        }

        // Fallback nếu kịch bản không chứa thoại phân lập
        if (audioClips.length === 0 && this.parsedLines.length > 0) {
            for (let i = 0; i < this.parsedLines.length; i++) {
                const lineItem = this.parsedLines[i];
                if (lineItem.text && lineItem.type !== 'empty' && lineItem.type !== 'slugline') {
                    const rawText = lineItem.text.trim();
                    if (/^(PHẦN\s+KỊCH\s+BẢN|CHƯƠNG\s+\d+|PHẦN\s+\d+|CẢNH\s+\d+|PHÂN\s+CẢNH)/i.test(rawText)) {
                        continue;
                    }

                    const textContent = this.cleanDialogueText(rawText);
                    if (textContent && textContent.length > 5) {
                        audioClips.push({
                            id: String(audioClips.length + 1),
                            name: textContent,
                            description: textContent,
                            voice: 'vi-VN-HoaiMyNeural',
                            rate: 1.0,
                            pitch: 0,
                            duration: 0
                        });
                    }
                }
            }
        }

        if (audioClips.length === 0) {
            this.toastr.warning('Kịch bản chưa có nội dung thoại để dựng video!');
            return;
        }

        const storageKeyAudio = `ai_type_audio_merger_data_${this.uuid}`;
        const dataToSave = {
            uuid: this.uuid,
            title: scriptTitle,
            extraPrompt: '',
            videoFormat: 'video',
            aspectRatio: '16:9',
            maxDuration: 0,
            clips: audioClips
        };

        this._multiAccountService.setItem(storageKeyAudio, dataToSave);
        this.toastr.success(`Đã trích xuất ${audioClips.length} câu thoại từ kịch bản để chuẩn bị dựng video!`, 'Chuyển sang Dựng video');

        const scriptNameSlug = this.toSlug(scriptTitle) || 'kich-ban';
        this.router.navigate([`/voice2video/${scriptNameSlug}/${this.uuid}`]);
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
