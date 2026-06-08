const fs = require('fs');
const filePath = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html';
let data = fs.readFileSync(filePath, 'utf8');

const searchStr = `<div class="w-full flex-grow flex-shrink min-h-[20vh] bg-black p-4 md:p-6 flex flex-col items-center justify-center relative group">
            <div class="w-full h-full relative flex flex-col items-center justify-center bg-black rounded-2xl overflow-hidden">
                <video #mainVideoPlayer [src]="getSafeUrl(previewVideoUrl)" *ngIf="previewVideoUrl"
                    class="w-full h-full object-contain" (ended)="isPreviewPlaying = false" (pause)="isPreviewPlaying = false" (play)="isPreviewPlaying = true"></video>
                <img [src]="getSafeUrl(previewImageUrl)" *ngIf="previewImageUrl && !previewVideoUrl"
                    class="w-full h-full object-contain" />`;

const replaceStr = `<div class="w-full flex-grow flex-shrink min-h-[20vh] bg-black p-4 md:p-8 flex flex-col items-center justify-center relative group">
            <div class="w-full h-full relative flex flex-col items-center justify-center">
                <video #mainVideoPlayer [src]="getSafeUrl(previewVideoUrl)" *ngIf="previewVideoUrl"
                    class="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_15px_rgba(255,255,255,0.05)]" (ended)="isPreviewPlaying = false" (pause)="isPreviewPlaying = false" (play)="isPreviewPlaying = true"></video>
                <img [src]="getSafeUrl(previewImageUrl)" *ngIf="previewImageUrl && !previewVideoUrl"
                    class="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_15px_rgba(255,255,255,0.05)]" />`;

if (data.indexOf(searchStr) !== -1) {
    data = data.replace(searchStr, replaceStr);
    fs.writeFileSync(filePath, data, 'utf8');
    console.log('Fixed preview styling successfully.');
} else {
    console.log('Start tag not found!');
}
