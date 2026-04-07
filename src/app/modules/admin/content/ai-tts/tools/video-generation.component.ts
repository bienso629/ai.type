import { Component, Inject, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialogModule,
} from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { MyKeysService } from 'app/modules/_services/mykey';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'app-video-generation',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatProgressBarModule,
        MatIconModule,
        MatButtonModule,
        MatSelectModule,
        FormsModule,
    ],
    providers: [MyKeysService],
    template: `
        <div class="p-0 min-w-[480px] bg-white rounded-lg">
            <div class="flex items-center justify-between mb-6">
                <div class="flex items-center text-primary">
                    <mat-icon class="mr-2 icon-size-5 text-primary"
                        >bolt</mat-icon
                    >
                    <span class="text-xl font-semibold tracking-tight"
                        >Chuẩn bị tạo video</span
                    >
                </div>
                <button mat-icon-button (click)="cancel()" *ngIf="!isStarted">
                    <mat-icon class="icon-size-5">close</mat-icon>
                </button>
            </div>

            <div *ngIf="!isStarted" class="space-y-5">
                <div
                    class="bg-blue-50 p-4 rounded-md border border-blue-100 flex items-start"
                >
                    <mat-icon class="text-blue-500 mr-3 mt-0.5">info</mat-icon>
                    <p class="text-sm text-blue-800 leading-relaxed">
                        Hệ thống sẽ chuyển đổi
                        <strong>{{ totalTasks }}</strong> đoạn subtitle thành âm
                        thanh.
                    </p>
                </div>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense" subscriptSizing="dynamic">
                    <mat-label>Giọng đọc (Voice)</mat-label>
                    <mat-select [(ngModel)]="selectedVoice">
                        <mat-option *ngFor="let v of voiceList" [value]="v.id">
                            {{ v.name }}
                        </mat-option>
                    </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense" subscriptSizing="dynamic">
                    <mat-label>Tốc độ (Rate)</mat-label>
                    <mat-select [(ngModel)]="selectedRate">
                        <mat-option [value]="0.5">0.5x (Rất chậm)</mat-option>
                        <mat-option [value]="0.6">0.6x</mat-option>
                        <mat-option [value]="0.7">0.7x</mat-option>
                        <mat-option [value]="0.8">0.8x (Chậm)</mat-option>
                        <mat-option [value]="0.9">0.9x</mat-option>
                        <mat-option [value]="1.0">1.0x (Chuẩn)</mat-option>
                        <mat-option [value]="1.1">1.1x</mat-option>
                        <mat-option [value]="1.2">1.2x (Nhanh nhẹ)</mat-option>
                        <mat-option [value]="1.3">1.3x</mat-option>
                        <mat-option [value]="1.4">1.4x</mat-option>
                        <mat-option [value]="1.5">1.5x (Rất nhanh)</mat-option>
                        <mat-option [value]="1.7">1.7x</mat-option>
                        <mat-option [value]="2.0">2.0x (Cực nhanh)</mat-option>
                    </mat-select>
                    <mat-icon matSuffix class="icon-size-5">speed</mat-icon>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full fuse-mat-dense" subscriptSizing="dynamic">
                    <mat-label>Cao độ (Pitch)</mat-label>
                    <mat-select [(ngModel)]="selectedPitch">
                        <mat-option [value]="-20">-20 (Cực trầm)</mat-option>
                        <mat-option [value]="-15">-15</mat-option>
                        <mat-option [value]="-10">-10 (Trầm thấp)</mat-option>
                        <mat-option [value]="-5">-5 (Trầm nhẹ)</mat-option>
                        <mat-option [value]="-2">-2 (Hơi trầm)</mat-option>
                        <mat-option [value]="0">0 (Mặc định)</mat-option>
                        <mat-option [value]="2">+2 (Hơi cao)</mat-option>
                        <mat-option [value]="5">+5 (Cao nhẹ)</mat-option>
                        <mat-option [value]="10">+10 (Trong trẻo)</mat-option>
                        <mat-option [value]="15">+15</mat-option>
                        <mat-option [value]="20">+20 (Chibi/Child)</mat-option>
                    </mat-select>
                    <mat-icon matSuffix class="icon-size-5">graphic_eq</mat-icon>
                </mat-form-field>
            </div>

            <div *ngIf="isStarted" class="space-y-6 py-4">
                <div
                    class="flex flex-col items-center justify-center space-y-2"
                >
                    <div
                        class="text-4xl font-black text-indigo-600 tracking-tighter"
                    >
                        {{ progress }}%
                    </div>
                    <div class="text-sm font-medium text-gray-500">
                        Đang xử lý {{ completedTasks }} /
                        {{ totalTasks }} subtitles
                    </div>
                </div>

                <mat-progress-bar
                    mode="determinate"
                    [value]="progress"
                    class="h-3 rounded-full"
                ></mat-progress-bar>

                <div
                    class="bg-gray-50 rounded-xl p-4 border border-gray-200 shadow-inner"
                >
                    <div class="flex items-center mb-2">
                        <div
                            class="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"
                        ></div>
                        <span
                            class="text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                            >Đang chạy ngầm</span
                        >
                    </div>

                    <p
                        class="text-sm text-gray-700 italic truncate"
                        [title]="currentStatus"
                    >
                        "{{ currentStatus }}"
                    </p>
                </div>
            </div>

            <div
                mat-dialog-actions
                class="justify-end mt-2 pt-2 border-t"
                *ngIf="!isFinished"
            >
                <button
                    mat-flat-button
                    color="primary"
                    (click)="startParallelProcess()"
                    [disabled]="isFinished"
                >
                    BẮT ĐẦU TẠO AUDIO
                </button>

                <button
                    mat-flat-button
                    color="accent"
                    (click)="cancel()"
                >
                    Hủy bỏ
                </button>
            </div>
        </div>
    `,
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
export class VideoGenerationComponent implements OnInit, OnDestroy {
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
        public dialogRef: MatDialogRef<VideoGenerationComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService
    ) { }

    saveData() {
        if (!this.data || !this.data.uuid) return;
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.multiAccountService.setItem(storageKey, this.data);
    }

    getMyKeys() {
        this._voice.getMyKeys({
            username: this.data.username
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data.length > 0) {
                        this.myvoices = result.data;
                        this.myvoices.map((voice: any) => {
                            if (voice.base === 'ausynclab.io' || voice.base === 'tts.type.vn') {
                                this.voiceList.push({
                                    id: `${voice.id}-${voice.base}`,
                                    name: voice.name
                                });
                            }
                        });
                    }
                },
                error: (e: any) => {
                    this.toastr.warning('Tải video thất bại.');
                },
                complete: () => { }
            });
    }

    async startParallelProcess(): Promise<void> {
        this.isStarted = true;
        this.isCancelled = false;

        const pendingSubs: {
            sub: any;
            sIdx: number;
            subIdx: number;
            globalIndex: number;
        }[] = [];
        let globalCounter = 0;

        // 1. Gom tất cả dữ liệu
        this.data.scenes.forEach((scene: any, sIdx: number) => {
            scene.subtitles.forEach((sub: any, subIdx: number) => {
                if (!sub.audioUrl) {
                    pendingSubs.push({
                        sub,
                        sIdx,
                        subIdx,
                        globalIndex: globalCounter,
                    });
                }
                globalCounter++;
            });
        });

        if (pendingSubs.length === 0) {
            setTimeout(() => { this.dialogRef.close(this.data); }, 1000);
            return;
        }

        this.toastr.info(`Bắt đầu xử lý ${pendingSubs.length} mục...`, 'System');
        this.currentStatus = 'Đang khởi tạo luồng xử lý liên tục...';

        // 2. XÁC ĐỊNH SỐ LUỒNG CHẠY SONG SONG
        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        const isEdgeVoice = edgeVoices.includes(this.selectedVoice);
        const isTTSTypeVoice = this.selectedVoice.indexOf('tts.type.vn') !== -1;

        const concurrencyLimit = (isEdgeVoice || isTTSTypeVoice) ? 3 : 1;

        try {
            let currentIndex = 0;

            // 3. TẠO HÀM WORKER XỬ LÝ LIÊN TỤC
            const worker = async () => {
                while (currentIndex < pendingSubs.length) {
                    if (this.isCancelled) {
                        console.log('Tiến trình worker đã dừng do người dùng hủy.');
                        break;
                    }

                    const taskIndex = currentIndex++;
                    const item = pendingSubs[taskIndex];

                    await this.generateAudioForSub(
                        item.sub,
                        item.sIdx,
                        item.subIdx,
                        item.globalIndex
                    );

                    // LƯU NGAY LẬP TỨC SAU KHI CÓ KẾT QUẢ CỦA 1 CÂU
                    this.saveData();
                }
            };

            // 4. KÍCH HOẠT CÁC WORKERS CHẠY CÙNG LÚC
            const workers = [];
            for (let i = 0; i < concurrencyLimit; i++) {
                workers.push(worker());
            }

            await Promise.all(workers);

            // 5. HOÀN TẤT
            if (!this.isCancelled) {
                this.isFinished = true;
                this.currentStatus = 'Hoàn tất!';
                this.toastr.success('Đã hoàn tất quá trình!');
                setTimeout(() => { this.dialogRef.close(this.data); }, 1000);
            }
        } catch (err) {
            console.error('Concurrency processing error:', err);
            this.toastr.error('Có lỗi xảy ra trong quá trình xử lý liên tục.');
        } finally {
            this.cd.markForCheck();
        }
    }

    async generateAudioForSub(
        sub: any,
        sceneIdx: number,
        subIdx: number,
        globalIndex: number,
    ): Promise<void> {
        return new Promise(async (resolve) => {
            if (!sub.text || !sub.text.trim()) {
                resolve();
                return;
            }

            if (!(window as any).electron || !(window as any).electron.invoke) {
                this.toastr.error('Cần chạy trên App Desktop (Electron).');
                resolve();
                return;
            }

            const username = this.data.username || 'anonymous';
            const subPath = `${username}/${this.data.uuid || 'default'}`;
            const prefix = (globalIndex >= 0 ? globalIndex + 1 : 0).toString().padStart(3, '0');
            const slug = this.toSlug(sub.text.substring(0, 50));

            const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
            const isEdgeVoice = edgeVoices.includes(this.selectedVoice);

            let res: any;

            try {
                if (isEdgeVoice) {
                    const niceFilename = `${prefix}_${slug}_${this.selectedVoice}`;
                    const payload = {
                        text: sub.text,
                        voice: this.selectedVoice,
                        rate: this.selectedRate,
                        pitch: this.selectedPitch,
                        filename: niceFilename,
                        username: subPath,
                    };
                    res = await (window as any).electron.invoke('tts-generate', payload);
                } else {
                    const selectedVoice = this.selectedVoice.split('-');
                    const voice_id = selectedVoice[0];

                    if (selectedVoice[1] === 'tts.type.vn') {
                        const niceFilename = `${prefix}_${slug}_typetts`;
                        const voice = await this.myvoices.filter((voice: any) => (voice['id'] === voice_id));

                        const payload = {
                            text: sub.text,
                            voice_id: voice[0]['id'],
                            key: voice[0]['api_key'],
                            ref_audio_name: voice[0]['ref_audio_name'],
                            ref_text: voice[0]['ref_text'],
                            speed: voice[0]['speed'] || this.selectedRate || 1.0,
                            num_step: voice[0]['num_step'] || 16,
                            filename: niceFilename,
                            username: subPath,
                        };

                        res = await (window as any).electron.invoke('tts-type-generate', payload);
                    } else {
                        const niceFilename = `${prefix}_${slug}_ausync`;
                        const voice = await this.myvoices.filter((voice: any) => (voice['id'] === voice_id));

                        const payload = {
                            text: sub.text,
                            voice_id: voice_id,
                            key: voice[0]['api_key'],
                            speed: voice[0]['api_key'] || this.selectedRate || 1.0,
                            filename: niceFilename,
                            username: subPath,
                        };

                        res = await (window as any).electron.invoke('tts-ausync-generate', payload);
                    }
                }

                if (res && res.success !== false && !res.error) {
                    const rawPath = res.filePath || res.url || res.result;
                    if (rawPath) {
                        sub.audioUrl = rawPath.startsWith('file://')
                            ? rawPath
                            : `file://${rawPath}`;
                    }
                } else {
                    const errorMsg = res?.error || 'Lỗi không xác định từ API';
                    console.error(`Error processing sub ${sub.text}:`, errorMsg);
                    this.toastr.error(`Lỗi tạo âm thanh: ${errorMsg}`);
                    sub.hasError = true;
                    sub.errorMessage = errorMsg;
                }
            } catch (err: any) {
                console.error(`Lỗi Electron cho sub ${sub.id}:`, err.message);
            } finally {
                this.completedTasks++;
                this.progress = Math.round((this.completedTasks / this.totalTasks) * 100);
                this.currentStatus = sub.text;
                this.cd.markForCheck();
                resolve();
            }
        });
    }

    getDateStr(): string {
        const d = new Date();
        const day = ('0' + d.getDate()).slice(-2);
        const month = ('0' + (d.getMonth() + 1)).slice(-2);
        const year = d.getFullYear();
        return `${day}${month}${year}`;
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

    async cancel(): Promise<void> {
        this.isCancelled = true;

        if (this.isStarted) {
            this.toastr.warning('Đang ngắt kết nối và hủy tiến trình ngầm...', 'Hệ thống');
            try {
                if ((window as any).electron) {
                    await (window as any).electron.invoke('cancel-tts');
                }
            } catch (err) {
                console.error('Lỗi khi gửi lệnh hủy:', err);
            }
        }

        this.dialogRef.close(null);
    }

    ngOnInit(): void {
        if (this.data && this.data.scenes) {
            this.totalTasks = this.data.scenes.reduce(
                (acc: number, scene: any) => acc + scene.subtitles.length,
                0,
            );
        }
        this.getMyKeys();
    }

    ngOnDestroy(): void {
        if (this.isStarted && !this.isFinished) {
            this.cancel();
        }
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}