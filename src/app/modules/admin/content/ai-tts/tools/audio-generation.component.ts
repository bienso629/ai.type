import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@jsverse/transloco';
import {
    Component,
    Inject,
    OnInit,
    ChangeDetectorRef,
    OnDestroy,
    NgZone,
    ChangeDetectionStrategy,
} from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialogModule,
} from '@angular/material/dialog';

import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { MyKeysService } from 'app/_services/mykey';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'app-video-generation',
    imports: [
        TranslocoModule,
        MatTooltipModule,
        TranslocoModule,
        MatDialogModule,
        MatProgressBarModule,
        MatIconModule,
        MatButtonModule,
        MatSelectModule,
        MatInputModule,
        FormsModule,
    ],
    providers: [MyKeysService],
    template: `
        <div class="p-0 bg-white">
            <div class="flex items-start justify-between mb-4">
                <div class="flex items-center text-primary mt-1">
                    <mat-icon class="mr-2 icon-size-5 text-primary"
                        >bolt</mat-icon
                    >
                    <span class="text-xl font-semibold tracking-tight"
                        >Tạo giọng đọc</span
                    >
                </div>
                <button
                    (click)="cancel()"
                    class="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                >
                    <mat-icon class="icon-size-5">close</mat-icon>
                </button>
            </div>

            <div class="overflow-y-auto max-h-[75vh] scrollbar-hide">
                <div class="space-y-4">
                    @if (!data?.standaloneTTSNode) {
                        <div
                            class="bg-blue-50 p-4 rounded-md border border-blue-100 flex items-start"
                        >
                            <mat-icon class="text-blue-500 mr-3 mt-0.5"
                                >info</mat-icon
                            >
                            @if (
                                $safeNavigationMigration(
                                    data?.targetSceneIndex
                                ) === null ||
                                $safeNavigationMigration(
                                    data?.targetSceneIndex
                                ) === undefined
                            ) {
                                <p
                                    class="text-sm text-blue-800 leading-relaxed m-0"
                                >
                                    Hệ thống sẽ chuyển đổi tổng cộng
                                    <strong>{{ totalTasks }}</strong> câu thoại
                                    (subtitle) thành âm thanh ở chế độ chạy
                                    ngầm.
                                </p>
                            }
                            @if (
                                $safeNavigationMigration(
                                    data?.targetSceneIndex
                                ) !== null &&
                                $safeNavigationMigration(
                                    data?.targetSceneIndex
                                ) !== undefined
                            ) {
                                <p
                                    class="text-sm text-blue-800 leading-relaxed m-0"
                                >
                                    Hệ thống sẽ chuyển đổi lại
                                    <strong>{{ totalTasks }}</strong> câu thoại
                                    bên trong phân cảnh này thành âm thanh ở chế
                                    độ chạy ngầm.
                                </p>
                            }
                        </div>
                    }

                    @if (data?.standaloneTTSNode) {
                        <div class="mb-2">
                            <mat-form-field
                                appearance="outline"
                                class="w-full fuse-mat-dense"
                                subscriptSizing="dynamic"
                            >
                                <mat-label>Nội dung văn bản</mat-label>
                                <textarea
                                    matInput
                                    [(ngModel)]="
                                        data.standaloneTTSNode.data.text
                                    "
                                    rows="5"
                                    placeholder="Nhập văn bản cần chuyển đổi thành giọng nói..."
                                ></textarea>
                            </mat-form-field>
                        </div>
                    }

                    <mat-form-field
                        appearance="outline"
                        class="w-full fuse-mat-dense"
                        subscriptSizing="dynamic"
                    >
                        <mat-label>Giọng đọc (Voice)</mat-label>
                        <mat-select [(ngModel)]="selectedVoice">
                            @for (v of voiceList; track v) {
                                <mat-option [value]="v.id">
                                    {{ v.name }}
                                </mat-option>
                            }
                        </mat-select>
                    </mat-form-field>

                    <mat-form-field
                        appearance="outline"
                        class="w-full fuse-mat-dense"
                        subscriptSizing="dynamic"
                    >
                        <mat-label>Tốc độ (Rate)</mat-label>
                        <mat-select [(ngModel)]="selectedRate">
                            <mat-option [value]="0.5"
                                >0.5x (Rất chậm)</mat-option
                            >
                            <mat-option [value]="0.6">0.6x</mat-option>
                            <mat-option [value]="0.7">0.7x</mat-option>
                            <mat-option [value]="0.8">0.8x (Chậm)</mat-option>
                            <mat-option [value]="0.9">0.9x</mat-option>
                            <mat-option [value]="1.0">1.0x (Chuẩn)</mat-option>
                            <mat-option [value]="1.1">1.1x</mat-option>
                            <mat-option [value]="1.2"
                                >1.2x (Nhanh nhẹ)</mat-option
                            >
                            <mat-option [value]="1.3">1.3x</mat-option>
                            <mat-option [value]="1.4">1.4x</mat-option>
                            <mat-option [value]="1.5"
                                >1.5x (Rất nhanh)</mat-option
                            >
                            <mat-option [value]="1.7">1.7x</mat-option>
                            <mat-option [value]="2.0"
                                >2.0x (Cực nhanh)</mat-option
                            >
                        </mat-select>
                        <mat-icon matSuffix class="icon-size-5">speed</mat-icon>
                    </mat-form-field>

                    <mat-form-field
                        appearance="outline"
                        class="w-full fuse-mat-dense"
                        subscriptSizing="dynamic"
                    >
                        <mat-label>Cao độ (Pitch)</mat-label>
                        <mat-select [(ngModel)]="selectedPitch">
                            <mat-option [value]="-20"
                                >-20 (Cực trầm)</mat-option
                            >
                            <mat-option [value]="-15">-15</mat-option>
                            <mat-option [value]="-10"
                                >-10 (Trầm thấp)</mat-option
                            >
                            <mat-option [value]="-5">-5 (Trầm nhẹ)</mat-option>
                            <mat-option [value]="-2">-2 (Hơi trầm)</mat-option>
                            <mat-option [value]="0">0 (Mặc định)</mat-option>
                            <mat-option [value]="2">+2 (Hơi cao)</mat-option>
                            <mat-option [value]="5">+5 (Cao nhẹ)</mat-option>
                            <mat-option [value]="10"
                                >+10 (Trong trẻo)</mat-option
                            >
                            <mat-option [value]="15">+15</mat-option>
                            <mat-option [value]="20"
                                >+20 (Chibi/Child)</mat-option
                            >
                        </mat-select>
                        <mat-icon matSuffix class="icon-size-5"
                            >graphic_eq</mat-icon
                        >
                    </mat-form-field>
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-6">
                <button mat-flat-button color="accent" (click)="cancel()">
                    Hủy bỏ
                </button>
                <button
                    mat-flat-button
                    color="primary"
                    (click)="startParallelProcess()"
                >
                    BẮT ĐẦU TẠO AUDIO
                </button>
            </div>
        </div>
    `,
    changeDetection: ChangeDetectionStrategy.Eager,
    styles: [
        `
            :host {
                display: block;
            }
            .mat-mdc-progress-bar {
                --mdc-linear-progress-active-indicator-color: #4f46e5;
            }
        `,
    ],
})
export class AudioGenerationComponent implements OnInit, OnDestroy {
    voiceList = [
        { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh' },
        { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My' },
    ];
    selectedVoice = 'vi-VN-HoaiMyNeural';
    selectedRate: number = 1.0;
    selectedPitch: number = 0;

    isStarted = false;
    isFinished = false;
    totalTasks = 0;
    completedTasks = 0;
    progress = 0;
    currentStatus = 'Đang chờ cấu hình...';

    myvoices: any = [];
    isCancelled = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';

    constructor(
        private _voice: MyKeysService,
        public dialogRef: MatDialogRef<AudioGenerationComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService,
        private ngZone: NgZone,
    ) {}

    saveData() {
        if (!this.data || !this.data.uuid) return;
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.multiAccountService.setItem(storageKey, this.data);
    }

    async checkColabStatus() {
        try {
            let connected = false;
            if ((window as any).electronAPI && (window as any).electronAPI.checkColabGpuStatus) {
                const res = await (window as any).electronAPI.checkColabGpuStatus();
                connected = !!(res && res.is_connected);
            } else {
                const resp = await fetch('http://127.0.0.1:7868/status', { signal: AbortSignal.timeout(1500) });
                if (resp.ok) {
                    const data = await resp.json();
                    connected = !!(data && data.is_connected);
                }
            }
            const omniVoices = [
                { id: 'omnivoice-yenai', name: 'Yenai (OmniVoice Colab)' },
                { id: 'omnivoice-mpsg', name: 'MPSG (OmniVoice Colab)' }
            ];
            if (connected) {
                omniVoices.forEach(ov => {
                    if (!this.voiceList.some(v => v.id === ov.id)) {
                        this.voiceList.push(ov);
                    }
                });
            } else {
                this.voiceList = this.voiceList.filter(v => !v.id.startsWith('omnivoice-'));
                if (this.selectedVoice.startsWith('omnivoice-')) {
                    this.selectedVoice = 'vi-VN-HoaiMyNeural';
                }
            }
            this.cd.detectChanges();
        } catch (e) {}
    }

    getMyKeys() {
        this.checkColabStatus();
        this._voice
            .getMyKeys({
                username: this.data.username,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.myvoices = result.data;
                        this.myvoices.map((voice: any) => {
                            if (
                                voice.base === 'ausynclab.io' ||
                                voice.base === 'tts.type.vn'
                            ) {
                                if (!this.voiceList.some(v => v.id === `${voice.id}-${voice.base}`)) {
                                    this.voiceList.push({
                                        id: `${voice.id}-${voice.base}`,
                                        name: voice.name,
                                    });
                                }
                            }
                        });
                        this.cd.detectChanges();
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Tải video thất bại.');
                },
                complete: () => {},
            });
    }

    startParallelProcess(): void {
        this.dialogRef.close({
            action: 'start',
            selectedVoice: this.selectedVoice,
            selectedRate: this.selectedRate,
            selectedPitch: this.selectedPitch,
            myvoices: this.myvoices,
        });
    }
    cancel(): void {
        this.dialogRef.close(null);
    }

    ngOnInit(): void {
        if (this.data && this.data.standaloneTTSNode) {
            this.totalTasks = !this.data.standaloneTTSNode.data.audioUrl
                ? 1
                : 0;
        } else if (this.data && this.data.scenes) {
            let count = 0;
            this.data.scenes.forEach((scene: any, sIdx: number) => {
                if (
                    this.data.targetSceneIndex !== undefined &&
                    this.data.targetSceneIndex !== null &&
                    this.data.targetSceneIndex !== sIdx
                ) {
                    return;
                }
                scene.subtitles.forEach((sub: any) => {
                    if (!sub.audioUrl) {
                        count++;
                    }
                });
            });
            this.totalTasks = count;
        }
        this.getMyKeys();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
