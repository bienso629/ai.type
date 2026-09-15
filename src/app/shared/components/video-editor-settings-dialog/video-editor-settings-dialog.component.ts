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
    maxDuration = 0;
    attachedVideoFiles: File[] = [];
    hasVideoProject = false;
    isAnalyzing = false;

    constructor(
        public dialogRef: MatDialogRef<VideoEditorSettingsDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
    ) {
        if (data) {
            this.extraPrompt = data.extraPrompt || '';
            this.videoFormat = data.videoFormat || 'video';
            this.aspectRatio = data.aspectRatio || '16:9';
            this.maxDuration = data.maxDuration || 0;
            this.hasVideoProject = !!data.hasVideoProject;
            this.isAnalyzing = !!data.isAnalyzing;
        }
    }

    onVideoAttachmentSelected(event: any) {
        if (event.target.files && event.target.files.length > 0) {
            this.attachedVideoFiles = Array.from(event.target.files);
        }
    }

    submit(action: 'create' | 'script') {
        this.dialogRef.close({
            action,
            extraPrompt: this.extraPrompt,
            videoFormat: this.videoFormat,
            aspectRatio: this.aspectRatio,
            maxDuration: this.maxDuration,
            attachedVideoFiles: this.attachedVideoFiles,
        });
    }

    cancel() {
        this.dialogRef.close();
    }
}
