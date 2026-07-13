import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router, Params } from '@angular/router';
import { BlogService } from 'app/modules/_services/blog';
import { Clipboard } from '@angular/cdk/clipboard';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';

interface ScreenplayLine {
    type: string;
    text: string;
}

@Component({
    selector: 'ai-script-view',
    template: `
    <div class="flex flex-col flex-auto min-w-0 bg-white">
        <!-- Header -->
        <div class="flex flex-row items-center justify-between p-6 border-b bg-card">
            <!-- Back Link -->
            <a class="inline-flex items-center text-secondary font-medium hover:text-primary transition-colors cursor-pointer text-sm" (click)="goBack()">
                <mat-icon class="icon-size-4 mr-1" [svgIcon]="'heroicons_solid:chevron-left'"></mat-icon>
                Quay lại soạn thảo
            </a>

            <!-- Actions -->
            <div class="flex items-center gap-2">
                <button mat-stroked-button (click)="copyToClipboard()" color="primary" [disabled]="!scriptText">
                    <mat-icon class="icon-size-4 mr-2" svgIcon="heroicons_outline:clipboard-copy"></mat-icon>
                    Copy kịch bản
                </button>
                <button mat-flat-button color="warn" (click)="goBack()">
                    Thoát
                </button>
            </div>
        </div>

        <!-- Main Content -->
        <div class="flex-auto p-6 sm:p-10 bg-gray-100 overflow-auto">
            <div class="screenplay-outer">
                <!-- Loading State -->
                <div class="flex flex-col items-center justify-center py-20" *ngIf="isLoading">
                    <mat-progress-spinner mode="indeterminate" diameter="48" color="primary"></mat-progress-spinner>
                    <span class="text-gray-500 font-medium mt-4">Đang truy xuất kịch bản từ database...</span>
                </div>

                <!-- Empty State -->
                <div class="flex flex-col items-center justify-center py-20 text-center" *ngIf="!isLoading && !scriptText">
                    <mat-icon class="text-gray-400 icon-size-16 mb-4" svgIcon="heroicons_outline:document-search"></mat-icon>
                    <h3 class="text-xl font-bold text-gray-700">Chưa có kịch bản cho tập phim này</h3>
                    <p class="text-gray-500 max-w-md mt-2">Vui lòng quay lại màn hình Dàn ý và nhấn "Tạo kịch bản" trong menu công cụ để AI sinh kịch bản trước.</p>
                    <button mat-flat-button color="primary" class="mt-6" (click)="goBack()">Quay lại</button>
                </div>

                <!-- Screenplay Display -->
                <div class="screenplay-container" *ngIf="!isLoading && scriptText">
                    <div class="text-center font-bold text-2xl uppercase mb-10 tracking-wider text-gray-900" style="font-family: 'Courier New', Courier, monospace;">
                        {{ scriptDoc?.title || draftTitleFallback || 'Kịch bản chưa đặt tên' }}
                    </div>
                    <div class="screenplay-content">
                        <ng-container *ngFor="let item of parsedLines">
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
            </div>
        </div>
    </div>
    `,
    styles: [`
        .screenplay-outer {
            font-family: 'Courier New', Courier, monospace;
            background-color: #ffffff;
            width: 21cm;
            min-height: 29.7cm;
            padding: 2.5cm 3cm 2.5cm 3.5cm;
            margin: 0 auto;
            box-sizing: border-box;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid #e5e7eb;
        }
        .screenplay-content {
            font-family: 'Courier New', Courier, monospace;
            color: #111;
            font-size: 15px;
            line-height: 1.5;
        }
        .screenplay-slugline {
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 1.5rem;
            margin-bottom: 0.5rem;
            text-align: left;
        }
        .screenplay-action {
            text-align: left;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
        }
        .screenplay-character {
            font-weight: bold;
            text-transform: uppercase;
            text-align: left;
            margin-left: 35%;
            margin-top: 1rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-parenthetical {
            text-align: left;
            margin-left: 28%;
            margin-right: 25%;
            margin-top: 0.1rem;
            margin-bottom: 0.1rem;
        }
        .screenplay-dialogue {
            text-align: left;
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
    draftTitleFallback: string = '';
    isLoading: boolean = true;
    parsedLines: ScreenplayLine[] = [];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private _blogService: BlogService,
        private clipboard: Clipboard,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef
    ) { }

    ngOnInit(): void {
        this.route.params.pipe(takeUntil(this._unsubscribeAll)).subscribe((params: Params) => {
            this.uuid = params['uuid'];
            this.name = params['name'];
            if (this.uuid) {
                this.loadScript();
            } else {
                this.isLoading = false;
            }
        });
    }

    loadScript() {
        this.isLoading = true;
        this.cd.markForCheck();
        
        let username = this._blogService.user?.name || 'admin';

        // Load fallback draft title
        this._blogService.getDraft(this.uuid).subscribe({
            next: (draftRes: any) => {
                if (draftRes && draftRes.success && draftRes.data) {
                    this.draftTitleFallback = draftRes.data.title;
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
                    this.scriptText = res.data.script || '';
                } else if (res && res.script) {
                    // Cấu trúc fallback trực tiếp
                    this.scriptDoc = res;
                    this.scriptText = res.script;
                }
                this.parseScriptText();
                this.isLoading = false;
                this.cd.markForCheck();
            },
            error: (err) => {
                console.error('Error loading script:', err);
                this.isLoading = false;
                this.cd.markForCheck();
            }
        });
    }

    parseScriptText() {
        if (!this.scriptText) {
            this.parsedLines = [];
            return;
        }

        const rawLines = this.scriptText.split('\n');
        this.parsedLines = [];
        let lastType = '';

        for (let line of rawLines) {
            const trimmed = line.trim();
            if (!trimmed) {
                this.parsedLines.push({ type: 'empty', text: '' });
                continue;
            }

            // Remove markdown bold tags
            let clean = trimmed.replace(/^\*\*|\*\*$/g, '').trim();

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
                this.parsedLines.push({ type: 'dialogue', text: clean });
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
            this.parsedLines.push({ type: 'action', text: clean });
            lastType = 'action';
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

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
