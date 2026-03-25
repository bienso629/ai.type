import { Component, Inject, OnInit, ChangeDetectorRef } from '@angular/core';
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
export class VideoGenerationComponent implements OnInit {
    voiceList = [
        { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Offline)' },
        { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Offline)' },
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

    constructor(
        public dialogRef: MatDialogRef<VideoGenerationComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
    ) { }

    ngOnInit(): void {
        if (this.data && this.data.scenes) {
            this.totalTasks = this.data.scenes.reduce(
                (acc: number, scene: any) => acc + scene.subtitles.length,
                0,
            );
        }
    }

    async startParallelProcess(): Promise<void> {
        this.isStarted = true;

        const pendingSubs: {
            sub: any;
            sIdx: number;
            subIdx: number;
            globalIndex: number;
        }[] = [];
        let globalCounter = 0;

        // 1. Gom tất cả dữ liệu (BỎ LOGIC CHECK FILE CŨ ĐỂ ÉP TẠO LẠI VTT)
        this.data.scenes.forEach((scene: any, sIdx: number) => {
            scene.subtitles.forEach((sub: any, subIdx: number) => {
                pendingSubs.push({
                    sub,
                    sIdx,
                    subIdx,
                    globalIndex: globalCounter,
                });
                globalCounter++;
            });
        });

        if (pendingSubs.length === 0) {
            setTimeout(() => { this.dialogRef.close(this.data); }, 1000);
            return;
        }

        this.toastr.info(`Bắt đầu xử lý ${pendingSubs.length} mục...`, 'System');
        this.currentStatus = 'Đang khởi tạo các luồng xử lý...';

        // 2. CHẠY THEO CỤM (BATCHING) - Cứ 3 file chạy cùng lúc để máy không bị Crash
        const batchSize = 3; 
        
        try {
            for (let i = 0; i < pendingSubs.length; i += batchSize) {
                const batch = pendingSubs.slice(i, i + batchSize);
                
                // Mở 3 tiến trình cùng lúc
                const tasks = batch.map((item) =>
                    this.generateAudioForSub(
                        item.sub,
                        item.sIdx,
                        item.subIdx,
                        item.globalIndex,
                    )
                );

                // Bắt buộc phải đợi 3 file này đẻ ra xong xuôi mới chạy 3 file tiếp theo
                await Promise.all(tasks);
            }

            this.isFinished = true;
            this.currentStatus = 'Hoàn tất khởi tạo toàn bộ tài nguyên âm thanh & phụ đề!';
            this.toastr.success(`Đã hoàn tất quá trình xử lý cho ${this.totalTasks} câu thoại!`);

            setTimeout(() => {
                this.dialogRef.close(this.data);
            }, 1000);
        } catch (err) {
            console.error('Batch error:', err);
            this.toastr.error('Có lỗi xảy ra trong quá trình xử lý.');
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

            const dateFolder = this.getDateStr();
            const username = this.data.username || 'anonymous';
            const subPath = `${username}/${dateFolder}/${this.data.uuid || 'default'}`;

            const prefix = (globalIndex >= 0 ? globalIndex + 1 : 0)
                .toString()
                .padStart(3, '0');
            const shortText = sub.text.substring(0, 50);
            const slug = this.toSlug(shortText);
            const niceFilename = `${prefix}_${slug}_${this.selectedVoice}`;

            const payload = {
                text: sub.text,
                voice: this.selectedVoice,
                rate: this.selectedRate,
                pitch: this.selectedPitch,
                filename: niceFilename,
                username: subPath,
            };

            try {
                // Gọi xuống IPC (main.js)
                const res = await (window as any).electron.invoke(
                    'tts-generate',
                    payload,
                );

                if (res && res.success) {
                    const rawPath = res.filePath || res.url || res.result;
                    sub.audioUrl = rawPath.startsWith('file://')
                        ? rawPath
                        : `file://${rawPath}`;
                } else {
                    console.error(`Error processing sub ${sub.id}:`, res?.error || 'Unknown error');
                }
            } catch (err: any) {
                console.error(`Lỗi Electron cho sub ${sub.id}:`, err.message);
            } finally {
                this.completedTasks++;
                this.progress = Math.round((this.completedTasks / this.totalTasks) * 100);
                this.currentStatus = sub.text;
                this.cd.markForCheck();
                resolve(); // Báo hiệu tiến trình con này đã xong
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

    cancel(): void {
        this.dialogRef.close(null);
    }
}
