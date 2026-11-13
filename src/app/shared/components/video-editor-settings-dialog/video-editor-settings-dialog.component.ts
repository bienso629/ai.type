import { Component, Inject, ChangeDetectionStrategy } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-video-editor-settings-dialog',
    templateUrl: './video-editor-settings-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class VideoEditorSettingsDialogComponent {
    extraPrompt = '';
    videoFormat = 'video';
    aspectRatio = '16:9';
    resolution = '720p';
    maxDuration = 0;
    attachedVideoFiles: File[] = [];
    hasVideoProject = false;
    isAnalyzing = false;

    readonly aspectRatioOptions = [
        { value: '21:9', label: '21:9', iconW: 22, iconH: 10 },
        { value: '16:9', label: '16:9', iconW: 20, iconH: 12 },
        { value: '4:3', label: '4:3', iconW: 18, iconH: 14 },
        { value: '1:1', label: '1:1', iconW: 15, iconH: 15 },
        { value: '3:4', label: '3:4', iconW: 14, iconH: 18 },
        { value: '9:16', label: '9:16', iconW: 12, iconH: 20 },
    ];

    readonly resolutionOptions = [
        { value: '480p', label: '480P' },
        { value: '720p', label: '720P' },
        { value: '1080p', label: '1080P' },
        { value: '4k', label: '4K' },
    ];

    readonly durationTicks = [0, 5, 10, 15, 20, 25, 30];

    constructor(
        public dialogRef: MatDialogRef<VideoEditorSettingsDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
    ) {
        if (data) {
            this.extraPrompt = data.extraPrompt || '';
            this.videoFormat = data.videoFormat || 'video';
            const incomingRatio = String(data.aspectRatio || '16:9').trim();
            this.aspectRatio = this.aspectRatioOptions.some((o) => o.value === incomingRatio)
                ? incomingRatio
                : '16:9';
            const incomingRes = String(data.resolution || '720p').trim().toLowerCase();
            this.resolution = this.resolutionOptions.some((o) => o.value === incomingRes)
                ? incomingRes
                : '720p';
            const parsedDur = Number(data.maxDuration);
            this.maxDuration = Number.isFinite(parsedDur)
                ? Math.max(0, Math.min(30, Math.round(parsedDur)))
                : 0;
            this.hasVideoProject = !!data.hasVideoProject;
            this.isAnalyzing = !!data.isAnalyzing;
        }
    }

    selectAspectRatio(value: string) {
        this.aspectRatio = value;
    }

    selectResolution(value: string) {
        this.resolution = value;
    }

    onDurationChange(rawValue: any) {
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
            this.maxDuration = 0;
            return;
        }
        const num = Number(rawValue);
        if (!Number.isFinite(num)) {
            return;
        }
        this.maxDuration = Math.max(0, Math.min(30, Math.round(num)));
    }

    normalizeDuration() {
        const num = Number(this.maxDuration);
        this.maxDuration = Number.isFinite(num)
            ? Math.max(0, Math.min(30, Math.round(num)))
            : 0;
    }

    getDurationSliderBackground(): string {
        const pct = Math.max(0, Math.min(100, (this.maxDuration / 30) * 100));
        return `linear-gradient(to right, #10b981 0%, #10b981 ${pct}%, #d1d5db ${pct}%, #d1d5db 100%)`;
    }

    onVideoAttachmentSelected(event: any) {
        if (event.target.files && event.target.files.length > 0) {
            const newFiles: File[] = Array.from(event.target.files);
            this.attachedVideoFiles = [...this.attachedVideoFiles, ...newFiles];
            event.target.value = '';
        }
    }

    removeFile(index: number) {
        this.attachedVideoFiles.splice(index, 1);
    }

    clearAllFiles() {
        this.attachedVideoFiles = [];
    }

    submit(action: 'create' | 'script') {
        this.normalizeDuration();
        this.dialogRef.close({
            action,
            extraPrompt: this.extraPrompt,
            videoFormat: this.videoFormat,
            aspectRatio: this.aspectRatio,
            resolution: this.resolution,
            maxDuration: this.maxDuration,
            attachedVideoFiles: this.attachedVideoFiles,
        });
    }

    cancel() {
        this.dialogRef.close();
    }
}
