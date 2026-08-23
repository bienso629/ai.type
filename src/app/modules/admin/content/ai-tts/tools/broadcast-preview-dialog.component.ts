import {
    Component,
    Inject,
    OnInit,
    ViewChild,
    ElementRef,
    ChangeDetectorRef,
    OnDestroy,
    Optional
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';

export interface BroadcastSubtitleItem {
    id?: any;
    text: string;
    startTime: number;
    duration: number;
}

export interface BroadcastDialogData {
    title?: string;
    videoUrl?: string;
    sourceUrl?: string;
    subtitles?: BroadcastSubtitleItem[];
    projectData?: any;
}

@Component({
    selector: 'app-broadcast-preview-dialog',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatIconModule,
        MatButtonModule,
        MatTooltipModule,
        MatProgressSpinnerModule,
        MatFormFieldModule,
        MatInputModule
    ],
    templateUrl: './broadcast-preview-dialog.component.html',
    styles: []
})
export class BroadcastPreviewDialogComponent implements OnInit, OnDestroy {
    @ViewChild('broadcastVideoPlayer') broadcastVideoPlayer?: ElementRef<HTMLVideoElement>;

    title: string = 'Phát sóng video';
    currentStreamUrl: string | null = null;
    currentSourceUrl: string | null = null;
    safeStreamUrl: SafeUrl | string | null = null;
    
    subtitles: BroadcastSubtitleItem[] = [];
    activeSubtitleText: string | null = null;
    activeSubtitleIndex: number = -1;

    currentTime: number = 0;
    videoDuration: number = 0;
    
    showSubtitles: boolean = true;
    subtitleSize: 'small' | 'medium' | 'large' = 'medium';
    subtitlePosition: 'bottom' | 'middle' | 'top' = 'bottom';
    showSidebar: boolean = true;

    isLoading: boolean = false;
    loadingMessage: string = 'Đang tải luồng phát...';
    isStreamActive: boolean = false;

    inputUrl: string = '';
    quickInputUrl: string = '';

    constructor(
        @Optional() @Inject(MAT_DIALOG_DATA) public data: BroadcastDialogData,
        private dialogRef: MatDialogRef<BroadcastPreviewDialogComponent>,
        private sanitizer: DomSanitizer,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef
    ) {
        if (this.data) {
            this.title = this.data.title || 'Phát sóng video';
            this.subtitles = this.data.subtitles || [];
            this.currentStreamUrl = this.data.videoUrl || null;
            this.currentSourceUrl = this.data.sourceUrl || null;
        }
    }

    get subtitleSizeLabel(): string {
        switch (this.subtitleSize) {
            case 'small': return 'Nhỏ';
            case 'medium': return 'Vừa';
            case 'large': return 'Lớn';
        }
    }

    ngOnInit(): void {
        if (this.currentSourceUrl && (this.currentSourceUrl.startsWith('http://') || this.currentSourceUrl.startsWith('https://'))) {
            this.loadOnlineStream(this.currentSourceUrl);
        } else if (this.currentStreamUrl) {
            if (this.currentStreamUrl.startsWith('http://') || this.currentStreamUrl.startsWith('https://')) {
                if (this.currentStreamUrl.includes('facebook.com') || this.currentStreamUrl.includes('fb.watch') || this.currentStreamUrl.includes('youtube.com') || this.currentStreamUrl.includes('youtu.be') || this.currentStreamUrl.includes('tiktok.com')) {
                    this.loadOnlineStream(this.currentStreamUrl);
                } else {
                    this.setVideoUrl(this.currentStreamUrl);
                }
            } else {
                this.setVideoUrl(this.currentStreamUrl);
            }
        }
    }

    ngOnDestroy(): void {
        if (this.broadcastVideoPlayer && this.broadcastVideoPlayer.nativeElement) {
            this.broadcastVideoPlayer.nativeElement.pause();
            this.broadcastVideoPlayer.nativeElement.src = '';
        }
    }

    setVideoUrl(url: string): void {
        this.currentStreamUrl = url;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('media://') || url.startsWith('mediacors://')) {
            this.safeStreamUrl = this.sanitizer.bypassSecurityTrustUrl(url);
        } else {
            const cleanPath = url.replace(/^file:\/\//i, '');
            const mediaUrl = 'media://SMART_FIND/?path=' + encodeURIComponent(cleanPath) + '&dir=&uuid=default';
            this.safeStreamUrl = this.sanitizer.bypassSecurityTrustUrl(mediaUrl);
        }
        this.isStreamActive = true;
        this.isLoading = false;
        this.cd.detectChanges();
    }

    async loadOnlineStream(rawUrl: string): Promise<void> {
        if (!rawUrl || !rawUrl.trim()) return;
        const url = rawUrl.trim();

        const electronApi = (window as any).electron;
        if (!electronApi) {
            this.setVideoUrl(url);
            return;
        }

        this.isLoading = true;
        this.loadingMessage = 'Đang trích xuất luồng phát video trực tiếp...';
        this.cd.detectChanges();

        try {
            const res = electronApi.extractOnlineVideoStream
                ? await electronApi.extractOnlineVideoStream(url)
                : await electronApi.invoke('extract-online-video-stream', url);

            if (res && res.success && res.streamUrl) {
                this.currentSourceUrl = url;
                if (res.title) this.title = res.title;
                this.setVideoUrl(res.streamUrl);
                this.toastr.success('Đã kết nối luồng phát thành công!', res.title || 'Video Stream');
            } else {
                this.isLoading = false;
                this.toastr.error(res?.error || 'Không thể trích xuất luồng video từ đường dẫn này.');
            }
        } catch (err: any) {
            this.isLoading = false;
            this.toastr.error('Lỗi khi tải luồng phát: ' + (err.message || err));
        }
        this.cd.detectChanges();
    }

    onTimeUpdate(): void {
        const video = this.broadcastVideoPlayer?.nativeElement;
        if (!video) return;

        this.currentTime = video.currentTime;
        this.updateActiveSubtitle(this.currentTime);
    }

    onLoadedMetadata(): void {
        const video = this.broadcastVideoPlayer?.nativeElement;
        if (!video) return;
        this.videoDuration = video.duration || 0;
        this.isLoading = false;
        this.cd.detectChanges();
    }

    onPlay(): void {
        this.isLoading = false;
    }

    onPause(): void { }

    onWaiting(): void {
        this.isLoading = true;
        this.loadingMessage = 'Đang đệm video (buffering)...';
        this.cd.detectChanges();
    }

    onPlaying(): void {
        this.isLoading = false;
        this.cd.detectChanges();
    }

    togglePlayPause(): void {
        const video = this.broadcastVideoPlayer?.nativeElement;
        if (!video) return;
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }

    seekTo(seconds: number): void {
        const video = this.broadcastVideoPlayer?.nativeElement;
        if (!video) return;
        video.currentTime = seconds;
        video.play().catch(() => {});
    }

    updateActiveSubtitle(time: number): void {
        let foundIndex = -1;
        let foundText: string | null = null;

        for (let i = 0; i < this.subtitles.length; i++) {
            const sub = this.subtitles[i];
            const start = sub.startTime || 0;
            const end = start + (sub.duration || 3);
            if (time >= start && time < end) {
                foundIndex = i;
                foundText = sub.text;
                break;
            }
        }

        if (this.activeSubtitleIndex !== foundIndex) {
            this.activeSubtitleIndex = foundIndex;
            this.activeSubtitleText = foundText;
            this.cd.detectChanges();

            if (foundIndex !== -1 && this.showSidebar) {
                const el = document.getElementById('broadcast-sub-' + foundIndex);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    }

    toggleSubtitleVisibility(): void {
        this.showSubtitles = !this.showSubtitles;
    }

    cycleSubtitleSize(): void {
        if (this.subtitleSize === 'small') this.subtitleSize = 'medium';
        else if (this.subtitleSize === 'medium') this.subtitleSize = 'large';
        else this.subtitleSize = 'small';
    }

    toggleScriptSidebar(): void {
        this.showSidebar = !this.showSidebar;
    }

    importSrtLocal(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.srt,.vtt,.txt';

        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event: any) => {
                const content = event.target.result;
                const parsed = this.parseSrt(content);
                if (parsed.length > 0) {
                    this.subtitles = parsed;
                    this.toastr.success('Đã nạp ' + parsed.length + ' câu phụ đề từ file!');
                    this.cd.detectChanges();
                } else {
                    this.toastr.error('Không tìm thấy phụ đề hợp lệ trong file.');
                }
            };
            reader.readAsText(file, 'utf-8');
        };
        input.click();
    }

    parseSrt(srtText: string): BroadcastSubtitleItem[] {
        const results: BroadcastSubtitleItem[] = [];
        if (!srtText) return results;

        const normalized = srtText.split('\r\n').join('\n').split('\r').join('\n');
        const blocks = normalized.split(/\n\s*\n/);

        const parseTimestampToSeconds = (timeStr: string): number => {
            const parts = timeStr.trim().split(':');
            if (parts.length < 3) return 0;
            const hours = parseFloat(parts[0]) || 0;
            const minutes = parseFloat(parts[1]) || 0;
            const secParts = parts[2].split(/[,\.]/);
            const seconds = parseFloat(secParts[0]) || 0;
            const ms = parseFloat(secParts[1] || '0') || 0;
            return hours * 3600 + minutes * 60 + seconds + (ms / 1000);
        };

        for (const block of blocks) {
            const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            let timeLineIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('-->')) {
                    timeLineIndex = i;
                    break;
                }
            }

            if (timeLineIndex === -1) continue;

            const timeLine = lines[timeLineIndex];
            const [startStr, endStr] = timeLine.split('-->');
            if (!startStr || !endStr) continue;

            const startSec = parseTimestampToSeconds(startStr);
            const endSec = parseTimestampToSeconds(endStr);
            const duration = Math.max(0.1, parseFloat((endSec - startSec).toFixed(2)));

            const textLines = lines.slice(timeLineIndex + 1);
            const text = textLines.join(' ').replace(/<[^>]*>/g, '').trim();

            if (text) {
                results.push({
                    text,
                    startTime: parseFloat(startSec.toFixed(2)),
                    duration
                });
            }
        }
        return results;
    }

    formatTime(seconds: number): string {
        if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
    }

    close(): void {
        this.dialogRef.close();
    }
}