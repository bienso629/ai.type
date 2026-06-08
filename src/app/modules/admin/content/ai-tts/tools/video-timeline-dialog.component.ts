import {
    Component,
    OnInit,
    ViewChild,
    ElementRef,
    Inject,
    CUSTOM_ELEMENTS_SCHEMA,
    ChangeDetectorRef,
    HostListener,
    OnDestroy,
    TemplateRef,
    AfterViewInit
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { GoogleGenAI } from '@google/genai';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialog,
    MatDialogModule,
} from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import WaveSurfer from 'wavesurfer.js';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
    DragDropModule,
    CdkDragDrop,
    moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

import { AddSceneComponent } from './add-scene.component';
import { DirectorModeComponent } from './director-mode.component';
import { MatInputModule } from '@angular/material/input';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { Router } from '@angular/router';
import { Clipboard } from '@angular/cdk/clipboard';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { EditScenePromptDialogComponent } from './edit-scene-prompt-dialog.component';
import { GenaiService } from 'app/genai.service';
import { VideoProjectConfigDialogComponent } from './video-project-config-dialog.component';

interface electron {
    selectLocalFile: (filePath: string) => Promise<string>;
}

@Component({
    selector: 'app-video-timeline-dialog',
    standalone: true,
    templateUrl: 'video-timeline-dialog.component.html',
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        DragDropModule,
        ScrollingModule,
        MatProgressSpinnerModule,
        MatTooltipModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class VideoTimelineDialogComponent implements OnInit, OnDestroy, AfterViewInit {
    private readonly STORAGE_CLIPS_KEY = 'ai_type_video_ready_data';

    // [THÊM BIẾN NÀY] Trạng thái hiển thị Master Prompt
    showMasterPrompt: boolean = true;
    isGeneratingCharacter: boolean = false;

    // Lưu lại Scene hiện tại đang được xử lý (khi bấm Prompt)
    activeDownloadScene: any = null;

    isEditingMasterPrompt: boolean = false;

    allClips: any[] = []; // Chứa danh sách tất cả các câu thoại có trong project

    // --- Timeline & Drag Logic ---
    pixelsPerSecond: number = 20;
    draggingVideo: any = null;
    dragType: 'move' | 'left' | 'right' | null = null;
    dragStartX: number = 0;
    dragStartLeft: number = 0;
    dragStartWidth: number = 0;

    // --- Preview Area ---
    previewVideoUrl: string | null = null;
    previewImageUrl: string | null = null;
    previewAudioUrl: string | null = null;

    // --- Timeline Player ---
    isPlayingTimeline: boolean = false;
    isPreviewPlaying: boolean = false;

    get hasAnyExtractedAudio(): boolean {
        if (!this.projectData || !this.projectData.scenes) return false;
        return this.projectData.scenes.some((scene: any) => 
            scene.extractedAudios && scene.extractedAudios.length > 0
        );
    }
    currentTimelineTime: number = 0;
    timelineTimer: any = null;
    activeVideo: any = null;
    activeAudio: any = null;

    // Khai báo ViewChild để truy cập video tag trong template
    @ViewChild('mainVideoPlayer') mainVideoPlayer?: ElementRef<HTMLVideoElement>;
    @ViewChild('mainAudioPlayer') mainAudioPlayer?: ElementRef<HTMLAudioElement>;
    wavesurfers: { [key: string]: WaveSurfer } = {};

    playPreview(video: any) {
        this.clearPreview();
        this.pauseTimeline(); // Dừng timeline nếu đang phát
        if (video.videoUrl) {
            this.previewVideoUrl = video.videoUrl;
        } else if (video.imageUrl) {
            this.previewImageUrl = video.imageUrl;
        }
    }

    // ===== TIMELINE PLAYER LOGIC =====
    toggleTimelinePlay() {
        if (this.isPlayingTimeline) {
            this.pauseTimeline();
        } else {
            this.playTimeline();
        }
    }

    onReferenceImageSelectedOut(event: any, video: any, sceneIdx: number, tIdx: number) {
        const file = event.target.files[0];
        if (file) {
            video.aiReferenceImageLocalUrl = URL.createObjectURL(file);
            this.autoGenerateStoryboard(video, sceneIdx, tIdx);
        }
        event.target.value = '';
    }

    togglePreviewPlay() {
        if (this.mainVideoPlayer && this.previewVideoUrl) {
            const video = this.mainVideoPlayer.nativeElement;
            if (video.paused) {
                video.play();
                this.isPreviewPlaying = true;
            } else {
                video.pause();
                this.isPreviewPlaying = false;
            }
        } else if (this.mainAudioPlayer && this.previewAudioUrl) {
            const audio = this.mainAudioPlayer.nativeElement;
            if (audio.paused) {
                audio.play();
                this.isPreviewPlaying = true;
            } else {
                audio.pause();
                this.isPreviewPlaying = false;
            }
        }
    }

    getMaxTimelineTime(): number {
        if (!this.projectData || !this.projectData.scenes) return 0;
        let maxTime = 0;
        for (const scene of this.projectData.scenes) {
            if (scene.videos) {
                for (const v of scene.videos) {
                    const end = (v.startTime || 0) + (v.duration || 5);
                    if (end > maxTime) maxTime = end;
                }
            }
            if (scene.subtitles) {
                for (const s of scene.subtitles) {
                    const end = (s.startTime || 0) + (s.duration || 5);
                    if (end > maxTime) maxTime = end;
                }
            }
            if (scene.extractedAudios) {
                for (const a of scene.extractedAudios) {
                    const end = (a.startTime || 0) + (a.duration || 5);
                    if (end > maxTime) maxTime = end;
                }
            }
        }
        return maxTime;
    }

    playTimeline() {
        if (!this.projectData || !this.projectData.scenes) return;

        // Tính toán độ dài tối đa của timeline
        let maxTime = this.getMaxTimelineTime();

        if (maxTime === 0) return;

        // Nếu đã chạy tới cuối, phát lại từ đầu
        if (this.currentTimelineTime >= maxTime) {
            this.currentTimelineTime = 0;
        }

        this.isPlayingTimeline = true;

        let lastTimestamp = performance.now();

        const tick = (timestamp: number) => {
            if (!this.isPlayingTimeline) return;

            let deltaSeconds = (timestamp - lastTimestamp) / 1000;
            lastTimestamp = timestamp;

            const vidEl = this.mainVideoPlayer?.nativeElement;

            if (this.activeVideo && this.activeVideo.videoUrl && vidEl) {
                if (vidEl.seeking || vidEl.readyState < 3) {
                    // Video is seeking or buffering, pause the timeline clock
                    deltaSeconds = 0;
                } else if (!vidEl.paused) {
                    // Video is playing smoothly, let video drive the timeline
                    this.currentTimelineTime = (this.activeVideo.startTime || 0) + vidEl.currentTime;
                    deltaSeconds = 0; // We already updated currentTimelineTime
                }
            }

            this.currentTimelineTime += deltaSeconds;


            if (this.currentTimelineTime >= maxTime) {
                this.currentTimelineTime = maxTime;
                this.pauseTimeline();
            }

            this.updateTimelineSync();
            this.cd.detectChanges();

            if (this.isPlayingTimeline) {
                this.timelineTimer = requestAnimationFrame(tick);
            }
        };

        this.timelineTimer = requestAnimationFrame(tick);
    }

    pauseTimeline() {
        this.isPlayingTimeline = false;
        if (this.timelineTimer) {
            cancelAnimationFrame(this.timelineTimer);
            this.timelineTimer = null;
        }

        if (this.mainVideoPlayer && this.mainVideoPlayer.nativeElement) {
            this.mainVideoPlayer.nativeElement.pause();
        }
        if (this.mainAudioPlayer && this.mainAudioPlayer.nativeElement) {
            this.mainAudioPlayer.nativeElement.pause();
        }
        for (const key in this.wavesurfers) {
            if (this.wavesurfers[key].isPlaying()) {
                this.wavesurfers[key].pause();
            }
        }
    }

    updateTimelineSync() {
        if (!this.projectData || !this.projectData.scenes) return;

        let foundVideo = null;
        let foundAudio = null;

        for (const scene of this.projectData.scenes) {
            // Find active video
            if (scene.videos) {
                for (const v of scene.videos) {
                    if (v.disabled) continue;
                    const start = v.startTime || 0;
                    const end = start + (v.duration || 5);
                    if (this.currentTimelineTime >= start && this.currentTimelineTime < end) {
                        foundVideo = v;
                    }
                }
            }
        }

        // Handle Video
        if (foundVideo !== this.activeVideo) {
            this.activeVideo = foundVideo;
            if (foundVideo) {
                this.previewVideoUrl = foundVideo.videoUrl || null;
                this.previewImageUrl = foundVideo.imageUrl || null;

                // Cần setTimeout để chờ view update tag video/img
                setTimeout(() => {
                    if (this.mainVideoPlayer && this.mainVideoPlayer.nativeElement && this.previewVideoUrl) {
                        const vidEl = this.mainVideoPlayer.nativeElement;
                        vidEl.currentTime = this.currentTimelineTime - (foundVideo.startTime || 0);
                        vidEl.muted = !!foundVideo.muted;
                        if (this.isPlayingTimeline) {
                            vidEl.play().catch(e => console.error("Error playing video:", e));
                        } else {
                            vidEl.pause();
                        }
                    }
                }, 0);
            } else {
                this.previewVideoUrl = null;
                this.previewImageUrl = null;
            }
        } else if (this.activeVideo && this.activeVideo.videoUrl) {
            // Liên tục đồng bộ hóa phòng trường hợp bị khựng
            if (this.mainVideoPlayer && this.mainVideoPlayer.nativeElement) {
                const vidEl = this.mainVideoPlayer.nativeElement;
                const expectedTime = this.currentTimelineTime - (this.activeVideo.startTime || 0);
                const threshold = this.isPlayingTimeline ? 0.5 : 0.1;
                if (Math.abs(vidEl.currentTime - expectedTime) > threshold) {
                    if (!vidEl.seeking) {
                        vidEl.currentTime = expectedTime;
                    }
                }

                if (this.isPlayingTimeline && vidEl.paused) {
                    vidEl.play().catch(e => console.error("Error playing video:", e));
                } else if (!this.isPlayingTimeline && !vidEl.paused) {
                    vidEl.pause();
                }
            }
        }
        // Handle Subtitles (WaveSurfer)
        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (scene.subtitles) {
                for (let sIdx = 0; sIdx < scene.subtitles.length; sIdx++) {
                    const sub = scene.subtitles[sIdx];
                    const ws = this.wavesurfers[`waveform-sub-${sceneIdx}-${sIdx}`];
                    if (ws) {
                        const start = sub.startTime || 0;
                        const end = start + (sub.duration || 5);
                        const isPlayingNow = !sub.disabled && this.currentTimelineTime >= start && this.currentTimelineTime < end;

                        if (isPlayingNow) {
                            const expectedTime = this.currentTimelineTime - start;
                            if (this.isPlayingTimeline) {
                                if (!ws.isPlaying()) ws.play();
                                if (Math.abs(ws.getCurrentTime() - expectedTime) > 0.5) {
                                    ws.setTime(expectedTime);
                                }
                            } else {
                                if (ws.isPlaying()) ws.pause();
                                ws.setTime(expectedTime);
                            }
                        } else {
                            if (ws.isPlaying()) ws.pause();
                        }
                    }
                }
            }
        }


        // Handle Extracted Audios (WaveSurfer)
        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (scene.extractedAudios) {
                for (let aIdx = 0; aIdx < scene.extractedAudios.length; aIdx++) {
                    const audio = scene.extractedAudios[aIdx];
                    const ws = this.wavesurfers[`waveform-${sceneIdx}-${aIdx}`];
                    if (ws) {
                        const start = audio.startTime || 0;
                        const end = start + (audio.duration || 5);
                        const isPlayingNow = !audio.disabled && this.currentTimelineTime >= start && this.currentTimelineTime < end;

                        if (isPlayingNow) {
                            const expectedTime = this.currentTimelineTime - start;
                            if (this.isPlayingTimeline) {
                                if (!ws.isPlaying()) ws.play();
                                if (Math.abs(ws.getCurrentTime() - expectedTime) > 0.5) {
                                    ws.setTime(expectedTime);
                                }
                            } else {
                                if (ws.isPlaying()) ws.pause();
                                ws.setTime(expectedTime);
                            }
                        } else {
                            if (ws.isPlaying()) ws.pause();
                        }
                    }
                }
            }
        }
    }

    playWaveform(type: 'sub' | 'extracted', sceneIdx: number, idx: number) {
        // Pause all wavesurfers first
        for (const key in this.wavesurfers) {
            if (this.wavesurfers[key].isPlaying()) {
                this.wavesurfers[key].pause();
            }
        }

        // Play the selected one
        const prefix = type === 'sub' ? 'waveform-sub' : 'waveform';
        const ws = this.wavesurfers[`${prefix}-${sceneIdx}-${idx}`];
        if (ws) {
            ws.setTime(0);
            ws.play();
        }
    }

    clearPreview() {
        this.previewVideoUrl = null;
        this.previewImageUrl = null;
        this.previewAudioUrl = null;
    }

    // --- Scrubber Drag Logic ---
    isDraggingScrubber: boolean = false;

    onScrubberMouseDown(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.setActiveItem(null); // Clear active item so timeline takes priority
        this.isDraggingScrubber = true;
        document.addEventListener('mousemove', this.onScrubberMouseMove);
        document.addEventListener('mouseup', this.onScrubberMouseUp);
    }

    onTimelineScroll(event: WheelEvent) {
        if (event.deltaY !== 0) {
            const container = document.getElementById('timeline-scroll-container');
            if (container) {
                container.scrollLeft += event.deltaY;
                event.preventDefault();
            }
        }
    }

    onTimeRulerMouseDown(e: MouseEvent) {
        e.preventDefault();
        this.pauseTimeline(); // Pause while dragging
        this.setActiveItem(null); // Clear active item so timeline takes priority
        this.isDraggingScrubber = true;
        this.seekTimelineToMouse(e);
        document.addEventListener('mousemove', this.onScrubberMouseMove);
        document.addEventListener('mouseup', this.onScrubberMouseUp);
    }

    onScrubberMouseMove = (e: MouseEvent) => {
        if (!this.isDraggingScrubber) return;
        this.seekTimelineToMouse(e);
    }

    onScrubberMouseUp = (e: MouseEvent) => {
        if (!this.isDraggingScrubber) return;
        this.isDraggingScrubber = false;
        document.removeEventListener('mousemove', this.onScrubberMouseMove);
        document.removeEventListener('mouseup', this.onScrubberMouseUp);
        this.playTimeline(); // Start playing when released
    }

    seekTimelineToMouse(e: MouseEvent) {
        const container = document.getElementById('timeline-scroll-container');
        const contentContainer = container?.querySelector('.relative.w-\\[5000px\\]');
        if (!contentContainer) return;

        const rect = contentContainer.getBoundingClientRect();
        let x = e.clientX - rect.left - 128; // Trừ đi phần header Track 128px
        if (x < 0) x = 0;

        const newTime = x / this.pixelsPerSecond;
        let maxTime = this.getMaxTimelineTime();
        if (maxTime === 0) maxTime = 100; // Default max if empty

        this.currentTimelineTime = Math.min(newTime, maxTime);
        this.updateTimelineSync();
        this.cd.detectChanges();
    }

    // Tính toán số Track hiển thị (dựa trên scene nào có nhiều video nhất)
    get trackCount(): number {
        if (!this.projectData || !this.projectData.scenes) return 1;
        let max = 1;
        for (const scene of this.projectData.scenes) {
            if (scene.videos && scene.videos.length > max) {
                max = scene.videos.length;
            }
        }
        return max;
    }

    packTimeline(save: boolean = true) {
        if (!this.projectData || !this.projectData.scenes) return;

        let currentTime = 0;
        for (const scene of this.projectData.scenes) {
            if (scene.videos && scene.videos.length > 0) {
                const sceneStartTime = currentTime;

                // Videos nối tiếp nhau
                let videoTime = sceneStartTime;
                for (let i = 0; i < scene.videos.length; i++) {
                    const v = scene.videos[i];
                    if (v) {
                        v.startTime = videoTime;
                        videoTime += (v.duration || 5);
                    }
                }

                // Subtitles bắt đầu từ đầu scene và nối tiếp nhau
                let subTime = sceneStartTime;
                if (scene.subtitles) {
                    for (const sub of scene.subtitles) {
                        sub.startTime = subTime;
                        subTime += (sub.duration || 0);
                    }
                }

                // Audio bắt đầu từ đầu scene và nối tiếp nhau
                let extTime = sceneStartTime;
                if (scene.extractedAudios) {
                    for (const ext of scene.extractedAudios) {
                        ext.startTime = extTime;
                        extTime += (ext.duration || 0);
                    }
                }

                // Scene tiếp theo sẽ bắt đầu sau khi MỌI media của scene hiện tại kết thúc
                let maxEndTime = videoTime;
                if (subTime > maxEndTime) maxEndTime = subTime;
                if (extTime > maxEndTime) maxEndTime = extTime;

                currentTime = maxEndTime;
            }
        }

        if (save) {
            this.saveData();
            this.cd.detectChanges();
            setTimeout(() => this.updateLines(), 100);
        }
    }

    initializeTimeline() {
        if (!this.projectData || !this.projectData.scenes) return;
        let currentTime = 0;
        for (const scene of this.projectData.scenes) {
            // Dọn dẹp các [Âm thanh gốc] cũ vô tình bị lưu vào subtitles
            if (scene.subtitles) {
                const legacyExtracted = scene.subtitles.filter((sub: any) => sub.text === '[Âm thanh gốc]');
                if (legacyExtracted.length > 0) {
                    if (!scene.extractedAudios) scene.extractedAudios = [];
                    // Di chuyển chúng sang mảng extractedAudios
                    scene.extractedAudios.push(...legacyExtracted);
                    // Loại bỏ khỏi subtitles
                    scene.subtitles = scene.subtitles.filter((sub: any) => sub.text !== '[Âm thanh gốc]');
                }
            }

            if (!scene.videos || !Array.isArray(scene.videos) || scene.videos.length === 0) {
                let defaultDuration = scene.forcedDuration || 5;
                if (!scene.forcedDuration && scene.subtitles) {
                    let totalSecs = 0;
                    for (const sub of scene.subtitles) {
                        if (sub.duration) totalSecs += sub.duration;
                        else if (sub.text) totalSecs += Math.max(1, sub.text.trim().split(/\s+/).length / 4);
                    }
                    if (totalSecs > 0) defaultDuration = Math.round(totalSecs);
                }
                scene.videos = [{
                    id: 1,
                    prompt: scene.prompt || '',
                    imageUrl: scene.imageUrl || null,
                    duration: defaultDuration
                }];
            }

            // Clean up any null/undefined videos
            scene.videos = scene.videos.filter((v: any) => v);

            for (const video of scene.videos) {
                // Ensure duration is a valid number
                let dur = typeof video.duration === 'number' ? video.duration : parseFloat(String(video.duration).replace('s', ''));
                if (isNaN(dur) || dur <= 0) {
                    dur = 5;
                }
                video.duration = dur;
                if (video.maxDuration === undefined && (video.videoUrl || video.audioUrl)) {
                    video.maxDuration = video.duration;
                }

                // Ensure startTime is a valid number
                if (video.startTime === undefined || isNaN(video.startTime) || video.startTime === null) {
                    video.startTime = currentTime;
                } else {
                    // Try parsing if it's a string somehow
                    let start = parseFloat(String(video.startTime));
                    if (isNaN(start) || start > 100000 || !isFinite(start)) start = currentTime;
                    if (start < 0) start = 0; // Prevent negative start
                    video.startTime = start;
                }

                if (!isFinite(video.duration) || video.duration > 100000) video.duration = 5;

                currentTime = Math.max(currentTime, video.startTime + video.duration);
            }

            // Gán startTime cho các phần tử audio/subtitle trong scene
            if (scene.subtitles && scene.videos.length > 0) {
                let subTime = scene.videos[0].startTime || 0;
                for (const sub of scene.subtitles) {
                    let subDur = sub.duration;
                    if (!subDur || isNaN(subDur) || subDur <= 0) {
                        subDur = Math.max(1, (sub.text ? sub.text.trim().split(/\s+/).length / 4 : 2));
                        sub.duration = subDur;
                    }
                    if (sub.maxDuration === undefined && sub.audioUrl) {
                        sub.maxDuration = sub.duration;
                    }
                    sub.startTime = subTime;
                    subTime += subDur;
                }
            }
        }
        this.saveData(); // Save the normalized data back to prevent recurring issues

        // Initialize WaveSurfers after data is loaded
        setTimeout(() => this.initWaveSurfers(), 500);
    }

    initWaveSurfers() {
        if (!this.projectData || !this.projectData.scenes) return;

        // Cleanup existing
        for (const key in this.wavesurfers) {
            this.wavesurfers[key].destroy();
        }
        this.wavesurfers = {};

        // Create new ones for extractedAudios
        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (scene.extractedAudios) {
                for (let aIdx = 0; aIdx < scene.extractedAudios.length; aIdx++) {
                    const audio = scene.extractedAudios[aIdx];
                    const containerId = `waveform-${sceneIdx}-${aIdx}`;
                    const container = document.getElementById(containerId);

                    if (container && audio.audioUrl) {
                        const ws = WaveSurfer.create({
                            container: container,
                            waveColor: '#4f46e5',
                            progressColor: '#818cf8',
                            height: 40,
                            barWidth: 2,
                            interact: false
                        });
                        ws.load(audio.audioUrl);
                        this.wavesurfers[containerId] = ws;
                    }
                }
            }

            // Create new ones for subtitles
            if (scene.subtitles) {
                for (let sIdx = 0; sIdx < scene.subtitles.length; sIdx++) {
                    const sub = scene.subtitles[sIdx];
                    const containerId = `waveform-sub-${sceneIdx}-${sIdx}`;
                    const container = document.getElementById(containerId);

                    if (container && sub.audioUrl) {
                        const ws = WaveSurfer.create({
                            container: container,
                            waveColor: '#4f46e5',
                            progressColor: '#818cf8',
                            height: 40,
                            barWidth: 2,
                            interact: false
                        });
                        ws.load(sub.audioUrl);
                        this.wavesurfers[containerId] = ws;
                    }
                }
            }
        }
    }

    dragInitialStarts: Map<any, number> = new Map();
    dragSceneIdx: number = -1;
    dragVideoIdx: number = -1;

    onDragBlockStart(e: MouseEvent, video: any, sceneIdx: number) {
        if (e.button !== 0) return; // Only left click
        e.stopPropagation();
        this.draggingVideo = video;
        this.setActiveItem(video); // Activate & show preview
        this.dragType = 'move';
        this.dragStartX = e.clientX;
        this.dragStartLeft = video.startTime || 0;
        this.dragSceneIdx = sceneIdx;

        this.dragVideoIdx = -1;
        const scene = this.projectData?.scenes?.[sceneIdx];
        if (scene && scene.videos) {
            this.dragVideoIdx = scene.videos.indexOf(video);
        }

        this.dragInitialStarts.clear();
        if (this.projectData?.scenes) {
            for (const s of this.projectData.scenes) {
                if (s.videos) s.videos.forEach((v: any) => this.dragInitialStarts.set(v, v.startTime || 0));
                if (s.subtitles) s.subtitles.forEach((sub: any) => this.dragInitialStarts.set(sub, sub.startTime || 0));
                if (s.extractedAudios) s.extractedAudios.forEach((ext: any) => this.dragInitialStarts.set(ext, ext.startTime || 0));
            }
        }

        document.addEventListener('mousemove', this.onTimelineMouseMove);
        document.addEventListener('mouseup', this.onTimelineMouseUp);
    }

    onResizeStart(e: MouseEvent, video: any, type: 'left' | 'right') {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.draggingVideo = video;
        this.setActiveItem(video); // Activate & show preview
        this.dragType = type;
        this.dragStartX = e.clientX;
        this.dragStartLeft = video.startTime || 0;
        this.dragStartWidth = video.duration || 5;

        document.addEventListener('mousemove', this.onTimelineMouseMove);
        document.addEventListener('mouseup', this.onTimelineMouseUp);
    }

    onTimelineMouseMove = (e: MouseEvent) => {
        if (!this.draggingVideo) return;
        const deltaX = e.clientX - this.dragStartX;
        const deltaSeconds = deltaX / this.pixelsPerSecond;
        const snapThreshold = 15 / this.pixelsPerSecond; // Khoảng cách hút dính (15 pixels)

        // Thu thập tất cả các điểm snap (bỏ qua các video sẽ bị kéo theo)
        const snapPoints: number[] = [0];
        if (this.projectData?.scenes) {
            for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                const scene = this.projectData.scenes[sIdx];
                if (scene.videos) {
                    for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                        const v = scene.videos[vIdx];
                        if (v === this.draggingVideo) continue;
                        if (vIdx === this.dragVideoIdx && sIdx > this.dragSceneIdx && this.dragType === 'move') continue;

                        if (v.startTime !== undefined) {
                            snapPoints.push(v.startTime);
                            snapPoints.push(v.startTime + (v.duration || 0));
                        }
                    }
                }
            }
        }

        if (this.dragType === 'move') {
            let newStart = this.dragStartLeft + deltaSeconds;

            // Tìm điểm snap gần nhất
            let bestSnap = newStart;
            let minDiff = snapThreshold;
            for (const point of snapPoints) {
                if (Math.abs(newStart - point) < minDiff) {
                    minDiff = Math.abs(newStart - point);
                    bestSnap = point;
                }
                const endPos = newStart + (this.draggingVideo.duration || 0);
                if (Math.abs(endPos - point) < minDiff) {
                    minDiff = Math.abs(endPos - point);
                    bestSnap = point - (this.draggingVideo.duration || 0);
                }
            }

            const targetVisualStart = Math.max(0, bestSnap);
            this.draggingVideo.startTime = targetVisualStart;
            const totalDelta = targetVisualStart - this.dragStartLeft;

            // Đồng bộ subtitle và audio nếu đây là video chính (track 0)
            if (this.dragVideoIdx === 0 && this.projectData?.scenes) {
                const scene = this.projectData.scenes[this.dragSceneIdx];
                if (scene) {
                    if (scene.subtitles) {
                        scene.subtitles.forEach((sub: any) => {
                            sub.startTime = (this.dragInitialStarts.get(sub) || 0) + totalDelta;
                        });
                    }
                    if (scene.extractedAudios) {
                        scene.extractedAudios.forEach((ext: any) => {
                            ext.startTime = (this.dragInitialStarts.get(ext) || 0) + totalDelta;
                        });
                    }
                }
            }

            // Realtime sort and pack
            if (this.projectData?.scenes) {
                this.projectData.scenes.sort((a, b) => {
                    const startA = (a.videos && a.videos.length > 0) ? (a.videos[0].startTime || 0) : 0;
                    const startB = (b.videos && b.videos.length > 0) ? (b.videos[0].startTime || 0) : 0;
                    return startA - startB;
                });

                // Cập nhật lại dragSceneIdx do vị trí mảng đã thay đổi sau khi sort
                if (this.dragVideoIdx === 0) {
                    const newIdx = this.projectData.scenes.findIndex(s => s.videos && s.videos[0] === this.draggingVideo);
                    if (newIdx >= 0) this.dragSceneIdx = newIdx;
                }

                // Đóng gói giả (không save) để các scene khác tự dạt ra realtime
                this.packTimeline(false);

                // Khôi phục lại vị trí visual của scene đang kéo để nó vẫn dính vào chuột
                if (this.dragVideoIdx === 0) {
                    const scene = this.projectData.scenes[this.dragSceneIdx];
                    if (scene && scene.videos && scene.videos.length > 0) {
                        const packedStart = scene.videos[0].startTime || 0;
                        const restoreDelta = targetVisualStart - packedStart;

                        scene.videos[0].startTime = targetVisualStart;
                        for (let i = 1; i < scene.videos.length; i++) {
                            scene.videos[i].startTime = (scene.videos[i].startTime || 0) + restoreDelta;
                        }
                        if (scene.subtitles) {
                            scene.subtitles.forEach((sub: any) => sub.startTime = (sub.startTime || 0) + restoreDelta);
                        }
                        if (scene.extractedAudios) {
                            scene.extractedAudios.forEach((ext: any) => ext.startTime = (ext.startTime || 0) + restoreDelta);
                        }
                    }
                } else {
                    this.draggingVideo.startTime = targetVisualStart;
                }
            }
        } else if (this.dragType === 'left') {
            let newStart = this.dragStartLeft + deltaSeconds;
            let newDuration = this.dragStartWidth - deltaSeconds;

            // Tìm điểm snap gần nhất cho đầu video
            let bestSnapStart = newStart;
            let minDiff = snapThreshold;
            for (const point of snapPoints) {
                if (Math.abs(newStart - point) < minDiff) {
                    minDiff = Math.abs(newStart - point);
                    bestSnapStart = point;
                }
            }

            if (bestSnapStart !== newStart) {
                newDuration = this.dragStartLeft + this.dragStartWidth - bestSnapStart;
                newStart = bestSnapStart;
            }

            if (newDuration < 1) {
                newDuration = 1;
                newStart = this.dragStartLeft + this.dragStartWidth - 1;
            }

            // Cap at maxDuration if media
            let maxAllowable = this.draggingVideo.maxDuration;
            if (!this.draggingVideo.videoUrl && !this.draggingVideo.audioUrl) {
                maxAllowable = Infinity;
            } else if (!maxAllowable) {
                maxAllowable = this.dragStartWidth;
            }
            if (newDuration > maxAllowable) {
                newDuration = maxAllowable;
                newStart = this.dragStartLeft + this.dragStartWidth - newDuration;
            }

            if (newStart < 0) {
                newStart = 0;
                newDuration = this.dragStartWidth + this.dragStartLeft;
            }
            this.draggingVideo.startTime = newStart;
            this.draggingVideo.duration = newDuration;
        } else if (this.dragType === 'right') {
            let newDuration = this.dragStartWidth + deltaSeconds;
            let newEnd = this.dragStartLeft + newDuration;

            // Tìm điểm snap gần nhất cho đuôi video
            let bestSnapEnd = newEnd;
            let minDiff = snapThreshold;
            for (const point of snapPoints) {
                if (Math.abs(newEnd - point) < minDiff) {
                    minDiff = Math.abs(newEnd - point);
                    bestSnapEnd = point;
                }
            }

            if (bestSnapEnd !== newEnd) {
                newDuration = bestSnapEnd - this.dragStartLeft;
            }

            if (newDuration < 1) newDuration = 1;

            // Cap at maxDuration if media
            let maxAllowable = this.draggingVideo.maxDuration;
            if (!this.draggingVideo.videoUrl && !this.draggingVideo.audioUrl) {
                maxAllowable = Infinity;
            } else if (!maxAllowable) {
                maxAllowable = this.dragStartWidth;
            }
            if (newDuration > maxAllowable) {
                newDuration = maxAllowable;
            }

            this.draggingVideo.duration = newDuration;
        }

        // Logic cập nhật audio theo dragType left/right (nếu là video chính)
        if (this.dragType !== 'move' && this.projectData?.scenes) {
            for (const scene of this.projectData.scenes) {
                if (scene.videos && scene.videos[0] === this.draggingVideo) {
                    let subTime = this.draggingVideo.startTime || 0;
                    if (scene.subtitles) {
                        for (const sub of scene.subtitles) {
                            sub.startTime = subTime;
                            subTime += (sub.duration || 0);
                        }
                    }
                    let extTime = this.draggingVideo.startTime || 0;
                    if (scene.extractedAudios) {
                        for (const ext of scene.extractedAudios) {
                            ext.startTime = extTime;
                            extTime += (ext.duration || 0);
                        }
                    }
                    break;
                }
            }
        }

        this.updateLines();
    }

    onTimelineMouseUp = () => {
        if (this.draggingVideo) {
            if (this.dragType === 'move' && this.projectData && this.projectData.scenes) {
                // Sắp xếp lại mảng scenes dựa trên startTime trực quan sau khi kéo
                this.projectData.scenes.sort((a, b) => {
                    const startA = (a.videos && a.videos.length > 0) ? (a.videos[0].startTime || 0) : 0;
                    const startB = (b.videos && b.videos.length > 0) ? (b.videos[0].startTime || 0) : 0;
                    return startA - startB;
                });
                // Tính toán lại timeline để các video xếp nối tiếp nhau tự động
                this.packTimeline();
            }
            this.saveData();
        }
        this.draggingVideo = null;
        this.dragType = null;
        document.removeEventListener('mousemove', this.onTimelineMouseMove);
        document.removeEventListener('mouseup', this.onTimelineMouseUp);
    }
    // ----------------------------

    linkingSourceVideo: any = null;
    linkingSourceSceneIndex: number = -1;
    linkingSourceVideoIndex: number = -1;

    // --- Drag to Link logic ---
    isDraggingLink: boolean = false;
    currentMouseX: number = 0;
    currentMouseY: number = 0;

    onDragLinkStart(e: MouseEvent, video: any, sceneIdx: number, vIdx: number) {
        e.stopPropagation();
        e.preventDefault();

        this.linkingSourceVideo = video;
        this.linkingSourceSceneIndex = sceneIdx;
        this.linkingSourceVideoIndex = vIdx;
        this.isDraggingLink = true;

        this.currentMouseX = e.clientX;
        this.currentMouseY = e.clientY;

        document.addEventListener('mousemove', this.onDragLinkMove);
        document.addEventListener('mouseup', this.onDragLinkEnd);

        this.updateLines();
    }

    onDragLinkMove = (e: MouseEvent) => {
        if (!this.isDraggingLink) return;
        this.currentMouseX = e.clientX;
        this.currentMouseY = e.clientY;
        this.updateLines();
    }

    onDragLinkEnd = (e: MouseEvent) => {
        document.removeEventListener('mousemove', this.onDragLinkMove);
        document.removeEventListener('mouseup', this.onDragLinkEnd);

        if (!this.isDraggingLink) return;
        this.isDraggingLink = false;

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        if (dropTarget) {
            const videoWrapper = dropTarget.closest('[data-scene-idx]');
            if (videoWrapper) {
                const targetSceneIdx = parseInt(videoWrapper.getAttribute('data-scene-idx') || '-1', 10);
                const targetVIdx = parseInt(videoWrapper.getAttribute('data-v-idx') || '-1', 10);

                if (targetSceneIdx !== -1 && targetVIdx !== -1) {
                    const targetVideo = this.projectData?.scenes?.[targetSceneIdx]?.videos?.[targetVIdx];
                    if (targetVideo) {
                        this.completeLinking(targetVideo, targetSceneIdx, targetVIdx);
                        this.updateLines();
                        return;
                    }
                }
            }
        }

        // Hủy nếu không thả vào vùng video hợp lệ
        this.cancelLinking();
        this.updateLines();
    }
    // ----------------------------

    cancelLinking() {
        this.linkingSourceVideo = null;
        this.linkingSourceSceneIndex = -1;
        this.linkingSourceVideoIndex = -1;
    }

    private getGeminiKey(): string | null {
        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        const keys = secretKey.map((k: string) => k.trim()).filter((k: string) => k);
        if (keys.length === 0) return null;

        return keys[Math.floor(Math.random() * keys.length)];
    }

    private getBase64FromImageUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject('Empty URL');
                return;
            }

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                
                // Đảm bảo kích thước tối thiểu và tỷ lệ khung hình an toàn cho Kling V3
                // (tránh lỗi ConvertImageRequest do server proxy cố tự resize ảnh không hợp lệ)
                let targetW = img.width;
                let targetH = img.height;
                
                // Nếu ảnh quá nhỏ, scale lên tối thiểu 512
                if (targetW < 512 || targetH < 512) {
                    const scale = Math.max(512 / targetW, 512 / targetH);
                    targetW = Math.round(targetW * scale);
                    targetH = Math.round(targetH * scale);
                }
                
                // Khống chế kích thước tối đa 1536 để tránh file quá nặng
                if (targetW > 1536 || targetH > 1536) {
                    const scale = Math.min(1536 / targetW, 1536 / targetH);
                    targetW = Math.round(targetW * scale);
                    targetH = Math.round(targetH * scale);
                }

                // Kiểm tra tỷ lệ khung hình (Kling giới hạn 1:2.5 đến 2.5:1)
                // Ta sẽ pad (thêm viền) nếu tỷ lệ vượt quá 1:2 hoặc 2:1 để an toàn
                let finalW = targetW;
                let finalH = targetH;
                const ratio = targetW / targetH;
                
                if (ratio > 2) {
                    // Quá rộng -> thêm viền trên dưới
                    finalH = Math.round(targetW / 2);
                } else if (ratio < 0.5) {
                    // Quá cao -> thêm viền 2 bên
                    finalW = Math.round(targetH / 2);
                }

                canvas.width = finalW;
                canvas.height = finalH;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Lót nền trắng để tránh bị đen do ảnh PNG trong suốt chuyển sang JPEG
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, finalW, finalH);
                    
                    // Vẽ ảnh vào giữa canvas
                    const offsetX = (finalW - targetW) / 2;
                    const offsetY = (finalH - targetH) / 2;
                    ctx.drawImage(img, offsetX, offsetY, targetW, targetH);
                }

                const dataURL = canvas.toDataURL('image/jpeg', 0.85);
                resolve(dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, ""));
            };
            img.onerror = error => reject(error);
            img.src = url;
        });
    }

    async autoGenerateStoryboard(video: any, sceneIdx: number, vIdx: number) {
        if (!video.prompt) return;

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) return;

        const apiKey = this.getGeminiKey();
        if (!apiKey) return;

        video.isGeneratingImage = true;
        this.cd.detectChanges();

        try {
            this.toastr.info(`Đang tự động vẽ Storyboard cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}...`, 'Hệ thống');

            let promptText = video.imagePrompt || video.prompt || '';
            promptText = promptText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();

            const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
            if (master) {
                promptText = master + '\n\n' + promptText;
            }
            const noSplitScreenConstraint = "\n\n[MANDATORY: Generate exactly ONE single, unified frame. Do NOT generate multiple panels, split screens, storyboards, comic strips, collages, or grids. This must be a single cohesive image.]";

            let requestParts: any[] = [{ text: promptText + noSplitScreenConstraint }];

            // Gắn thêm ảnh tham khảo do người dùng tải lên (nếu có từ nút Tải ảnh mẫu)
            if (video.aiReferenceImageLocalUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(video.aiReferenceImageLocalUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                    video.aiReferenceImageLocalUrl = null; // consume it
                } catch (e) {
                    console.error('Không thể đọc ảnh reference upload', e);
                }
            }

            // Gắn thêm ảnh reference của nhân vật được tick nếu có
            // Tìm các nhân vật có tên xuất hiện trong prompt
            if (this.projectData?.characters) {
                for (const char of this.projectData.characters) {
                    const charName = char.name || char.role;
                    if (charName && video.prompt.includes(`[Character '${charName}'`)) {
                        const imgUrl = char.avatarUrl || (char.avatarUrls && char.avatarUrls.length > 0 ? char.avatarUrls[0] : null);
                        if (imgUrl) {
                            try {
                                const base64Data = await this.getBase64FromImageUrl(imgUrl);
                                requestParts.push({
                                    inlineData: {
                                        data: base64Data,
                                        mimeType: 'image/png'
                                    }
                                });
                            } catch (e) {
                                console.error('Không thể đọc ảnh reference cho', char.name, e);
                            }
                        }
                    }
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ role: 'user', parts: requestParts }],
                config: {
                    aspectRatio: this.projectData?.aspectRatio || '16:9',
                    responseModalities: ['IMAGE']
                } as any
            });

            let base64Data = null;
            if (response.candidates && response.candidates.length > 0) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        base64Data = part.inlineData.data;
                        break;
                    }
                }
            }

            if (base64Data) {
                const fileName = `scene_auto_${Date.now()}_${sceneIdx}_${vIdx}.png`;
                const result = await electron.saveBase64({
                    base64: base64Data,
                    fileName: fileName,
                    customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
                });

                if (result && result.success) {
                    const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                    video.imageUrl = finalPath;
                    this.saveData();
                    this.cd.detectChanges();
                    this.toastr.success(`Đã tự động tạo ảnh Storyboard cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}!`);
                }
            }
        } catch (error) {
            console.error('Lỗi tự động tạo Storyboard:', error);
        } finally {
            video.isGeneratingImage = false;
            this.cd.detectChanges();
        }
    }

    async autoGenerateVideo(scene: any, video: any, sceneIdx: number, vIdx: number) {
        if (!video.prompt) {
            this.toastr.warning('Vui lòng nhập prompt phân cảnh trước khi tạo video!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        video.isGeneratingVideo = true;
        this.cd.detectChanges();

        try {
            this.toastr.info(`Đang tự động tạo Video cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}...`, 'Hệ thống', { timeOut: 5000 });
            let base64 = '';

            const isProxy = this._genaiService.isUModelverseEnabled();
            
            let referenceImages: any[] = [];
            // Gắn thêm ảnh Storyboard làm reference
            if (video.imageUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(video.imageUrl);
                    referenceImages.push({
                        image: { imageBytes: base64Data, mimeType: 'image/jpeg' },
                        referenceType: 'START_FRAME'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Storyboard làm reference cho video:', e);
                }
            }

            // [NEW] Gắn thêm ảnh cuối từ video liên kết (nếu có)
            if (video.linkedTo) {
                const targetScene = this.projectData?.scenes?.[video.linkedTo.sceneIndex];
                const targetVideo = targetScene?.videos?.[video.linkedTo.videoIndex];
                if (targetVideo && targetVideo.imageUrl) {
                    try {
                        const base64DataEnd = await this.getBase64FromImageUrl(targetVideo.imageUrl);
                        referenceImages.push({
                            image: { imageBytes: base64DataEnd, mimeType: 'image/jpeg' },
                            referenceType: 'END_FRAME'
                        });
                    } catch (e) {
                        console.error('Không thể đọc ảnh đích làm reference cho video:', e);
                    }
                }
            }

            // Gắn thêm ảnh Khung xương/Bố cục (ControlNet / Pose reference)
            let controlImg = video.controlImageUrl || this.projectData?.masterControlImageUrl;
            if (controlImg) {
                try {
                    const base64DataControl = await this.getBase64FromImageUrl(controlImg);
                    referenceImages.push({
                        image: { imageBytes: base64DataControl, mimeType: 'image/jpeg' },
                        referenceType: 'CONTROL_IMAGE'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Khung xương/Bố cục làm reference cho video:', e);
                }
            }

            // Gắn ảnh avatar nhân vật để giữ nhất quán nhân vật giữa các video
            let hasCharacterRef = false;
            if (this.projectData?.characters) {
                for (const char of this.projectData.characters) {
                    const charName = char.name || char.role;
                    if (charName && video.prompt.includes(`[Character '${charName}'`)) {
                        const imgUrl = char.avatarUrl || (char.avatarUrls && char.avatarUrls.length > 0 ? char.avatarUrls[0] : null);
                        if (imgUrl) {
                            try {
                                const base64Data = await this.getBase64FromImageUrl(imgUrl);
                                referenceImages.push({
                                    image: { imageBytes: base64Data, mimeType: 'image/jpeg' },
                                    referenceType: 'ASSET'
                                });
                                hasCharacterRef = true;
                            } catch (e) {
                                console.error('Không thể đọc ảnh reference cho video:', char.name, e);
                            }
                        }
                    }
                }
            }

            let promptText = video.prompt || '';
            const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
            let basePrompt = master ? `${master}\n\n${promptText}` : promptText;
            
            let mandatoryTags = '';
            if (video.duration) {
                mandatoryTags += `\n[MANDATORY: Generate video with exact duration of ${video.duration} seconds]`;
            }

            if (referenceImages && referenceImages.length > 0) {
                mandatoryTags += `\n[MANDATORY: Strictly follow layout, skeleton & character references 100%. No hallucinations or extra details.]`;
            }

            let finalPrompt = basePrompt + mandatoryTags;
            let byteLength = new TextEncoder().encode(finalPrompt).length;

            if (byteLength > 2500 && isProxy) {
                this.toastr.warning(`Đoạn video có tổng độ dài prompt (${byteLength} bytes) vượt quá 2500 của hệ thống. Đã bỏ qua đoạn này.`);
                return;
            }
            if (isProxy) {
                base64 = await this._genaiService.generateVideoUModelverse(
                    finalPrompt,
                    this.projectData?.aspectRatio || '16:9',
                    referenceImages,
                    video.duration
                );
            } else {
                const apiKey = this.getGeminiKey();
                if (!apiKey) {
                    this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
                    return;
                }

                const ai = this._genaiService.googleAi || new GoogleGenAI({ apiKey: apiKey });
                let operation: any;
                const videoConfig: any = {};
                if (this.projectData?.aspectRatio) {
                    videoConfig.aspectRatio = this.projectData.aspectRatio;
                }
                if (referenceImages.length > 0) {
                    // Google SDK might strictly require ASSET or specific enum values
                    videoConfig.referenceImages = referenceImages.slice(0, 3).map(img => {
                        return {
                            ...img,
                            referenceType: 'ASSET'
                        };
                    });
                }

                operation = await ai.models.generateVideos({
                    model: 'veo-3.1-generate-preview',
                    prompt: finalPrompt,
                    config: videoConfig
                });

                let pollCount = 0;
                const MAX_POLLS = 60; 

                while (!operation.done) {
                    if (pollCount >= MAX_POLLS) throw new Error('Quá thời gian chờ tạo video (10 phút).');
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    operation = await ai.operations.getVideosOperation({ operation: operation });
                    pollCount++;
                }

                if (!operation.response || !operation.response.generatedVideos || operation.response.generatedVideos.length === 0) {
                    throw new Error('Không nhận được video từ AI.');
                }

                const videoUri = operation.response.generatedVideos[0].video.uri;
                if (!videoUri) throw new Error('Không tìm thấy URI tải video.');

                this.toastr.info('Đang tải video về máy...', 'Hệ thống');
                const res = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
                if (!res.ok) throw new Error('Không thể tải file video từ Google.');

                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                const chunkSize = 8192;
                for (let i = 0; i < len; i += chunkSize) {
                    base64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
                }
                base64 = btoa(base64);
            }

            const fileName = `scene_video_${Date.now()}_${sceneIdx}_${vIdx}.mp4`;
            const result = await electron.saveBase64({
                base64: base64,
                fileName: fileName,
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                video.videoUrl = finalPath;
                this.saveData();
                this.cd.detectChanges();
                this.toastr.success(`Đã tự động tạo Video cho Scene ${sceneIdx + 1} - Phần ${vIdx + 1}!`);
            } else {
                throw new Error(result.error || 'Lỗi lưu file video.');
            }
        } catch (error: any) {
            console.error('Lỗi tự động tạo Video:', error);
            const errorMsg = error.message || 'Có lỗi xảy ra.';
            this.toastr.error('Lỗi tạo video AI: ' + errorMsg);
        } finally {
            video.isGeneratingVideo = false;
            this.cd.detectChanges();
        }
    }

    completeLinking(targetVideo: any, targetSceneIdx: number, targetVIdx: number) {
        if (!this.linkingSourceVideo) return;

        if (this.linkingSourceVideo === targetVideo) {
            this.toastr.warning('Không thể liên kết với chính nó.');
            this.cancelLinking();
            return;
        }

        const sourceVideo = this.linkingSourceVideo;
        const sourceSceneIdx = this.linkingSourceSceneIndex;
        const sourceVIdx = this.linkingSourceVideoIndex;

        // Đảm bảo target video có ID để liên kết không bị hỏng khi kéo thả đổi chỗ Scene
        if (!targetVideo.videoId) {
            targetVideo.videoId = 'vid_' + Math.random().toString(36).substr(2, 9);
        }

        sourceVideo.linkedTo = {
            sceneIndex: targetSceneIdx,
            videoIndex: targetVIdx,
            videoId: targetVideo.videoId,
            text: `Scene ${targetSceneIdx + 1} - Phần ${targetVIdx + 1}`
        };

        this.saveData();
        this.toastr.success(`Đã tạo liên kết thành công!`);

        // Tự động tạo Storyboard cho cả 2 video nếu chưa có ảnh
        let missingImage = false;
        if (!sourceVideo.imageUrl) {
            this.autoGenerateStoryboard(sourceVideo, sourceSceneIdx, sourceVIdx);
            missingImage = true;
        }
        if (!targetVideo.imageUrl) {
            this.autoGenerateStoryboard(targetVideo, targetSceneIdx, targetVIdx);
            missingImage = true;
        }

        // Tự động tạo Video nếu cả 2 video đã có ảnh
        if (!missingImage) {
            const scene = this.projectData?.scenes?.[sourceSceneIdx];
            if (scene) {
                this.autoGenerateVideo(scene, sourceVideo, sourceSceneIdx, sourceVIdx);
            }
        }

        this.cancelLinking();
    }

    removeLink(video: any) {
        video.linkedTo = null;
        this.saveData();
        this.updateLines();
    }

    scrollToLinkedVideo(linkedTo: any) {
        if (!linkedTo) return;
        const targetId = `video_${linkedTo.sceneIndex}_${linkedTo.videoIndex}`;
        const element = document.getElementById(targetId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            element.classList.add('ring-4', 'ring-indigo-500');
            setTimeout(() => {
                element.classList.remove('ring-4', 'ring-indigo-500');
            }, 1500);
        } else {
            this.toastr.warning('Không tìm thấy Video đích. Có thể nó đã bị xoá hoặc ẩn.');
        }
    }

    hasIncomingLink(sceneIdx: number, vIdx: number): boolean {
        if (!this.projectData || !this.projectData.scenes) return false;
        for (const scene of this.projectData.scenes) {
            if (!scene.videos) continue;
            for (const video of scene.videos) {
                if (video.linkedTo && video.linkedTo.sceneIndex === sceneIdx && video.linkedTo.videoIndex === vIdx) {
                    return true;
                }
            }
        }
        return false;
    }

    @HostListener('document:keydown.escape', ['$event'])
    onKeydownHandler(event: KeyboardEvent) {
        if (this.linkingSourceVideo) {
            this.cancelLinking();
            this.toastr.info('Đã hủy tạo liên kết.');
        }
    }

    @HostListener('window:resize', ['$event'])
    onWindowResize() {
        this.updateLines();
    }

    svgLines: { path: string, color: string }[] = [];
    private lastLinesStr = '';
    private animationFrameId: any;
    isSvgReady = false;

    updateLines() {
        if (!this.projectData || !this.projectData.scenes) {
            return;
        }

        const newLines: any[] = [];
        const svgContainer = this.svgLayer?.nativeElement;
        if (!svgContainer) return;

        const containerRect = svgContainer.getBoundingClientRect();

        // Tối ưu hóa: Xây dựng Map O(1) để tra cứu videoId, tránh vòng lặp lồng nhau O(N^2) gây giật lag
        const videoIdMap = new Map<string, { sIdx: number, vIdx: number }>();
        for (let s = 0; s < this.projectData.scenes.length; s++) {
            const scene = this.projectData.scenes[s];
            if (!scene.videos) continue;
            for (let v = 0; v < scene.videos.length; v++) {
                const vid = scene.videos[v];
                if (vid.videoId) {
                    videoIdMap.set(vid.videoId, { sIdx: s, vIdx: v });
                }
            }
        }

        for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
            const scene = this.projectData.scenes[sIdx];
            if (!scene.videos) continue;

            for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                const video = scene.videos[vIdx];

                if (!video.videoId) {
                    video.videoId = 'vid_' + Math.random().toString(36).substr(2, 9);
                    videoIdMap.set(video.videoId, { sIdx, vIdx });
                }

                if (video.linkedTo) {
                    let targetSceneIdx = video.linkedTo.sceneIndex;
                    let targetVIdx = video.linkedTo.videoIndex;

                    if (video.linkedTo.videoId) {
                        const targetInfo = videoIdMap.get(video.linkedTo.videoId);
                        if (targetInfo) {
                            targetSceneIdx = targetInfo.sIdx;
                            targetVIdx = targetInfo.vIdx;
                        } else {
                            video.linkedTo = null;
                            continue;
                        }
                    }

                    // Cập nhật lại data phòng khi index bị lệch
                    video.linkedTo.sceneIndex = targetSceneIdx;
                    video.linkedTo.videoIndex = targetVIdx;
                    video.linkedTo.text = `Scene ${targetSceneIdx + 1} - Phần ${targetVIdx + 1}`;

                    const sourceId = `video_${sIdx}_${vIdx}`;
                    const targetId = `video_${targetSceneIdx}_${targetVIdx}`;

                    const sourceEl = document.getElementById(sourceId);
                    const targetEl = document.getElementById(targetId);

                    if (sourceEl && targetEl) {
                        const sourceRect = sourceEl.getBoundingClientRect();
                        const targetRect = targetEl.getBoundingClientRect();

                        // Điểm bắt đầu (cạnh ngoài của node bottom)
                        const startX = sourceRect.left + sourceRect.width / 2 - containerRect.left;
                        const startY = sourceRect.bottom - containerRect.top + 12;

                        // Điểm kết thúc (cạnh ngoài của node top)
                        const endX = targetRect.left + targetRect.width / 2 - containerRect.left;
                        const endY = targetRect.top - containerRect.top - 12;

                        // Cập nhật logic: Nối trong cùng 1 scene thì không báo đỏ
                        const targetSceneIdx = video.linkedTo.sceneIndex;
                        const targetVIdx = video.linkedTo.videoIndex;
                        const isLogicalBackwards = targetSceneIdx < sIdx || (targetSceneIdx === sIdx && targetVIdx < vIdx);
                        const color = isLogicalBackwards ? 'rgba(239, 68, 68, 0.7)' : 'rgba(99, 102, 241, 0.7)';

                        // Tính control points cho đường cong Bezier dọc
                        let distanceY;
                        if (endY >= startY) {
                            // target ở dưới source
                            distanceY = Math.min(60, Math.max(20, Math.abs(endY - startY) * 0.5));
                        } else {
                            // target ở trên source (hoặc trên cùng track)
                            distanceY = Math.min(150, Math.max(40, Math.abs(endX - startX) * 0.5));
                        }

                        // Đường cong M startX startY C cp1X cp1Y, cp2X cp2Y, endX endY
                        const path = `M ${startX} ${startY} C ${startX} ${startY + distanceY}, ${endX} ${endY - distanceY}, ${endX} ${endY}`;

                        newLines.push({ path, color });
                    }
                }
            }
        }

        // --- Dragging line ---
        if (this.isDraggingLink && this.linkingSourceVideo) {
            const sourceId = `video_${this.linkingSourceSceneIndex}_${this.linkingSourceVideoIndex}`;
            const sourceEl = document.getElementById(sourceId);
            if (sourceEl) {
                const sourceRect = sourceEl.getBoundingClientRect();

                // Điểm bắt đầu (cạnh ngoài của node bottom)
                const startX = sourceRect.left + sourceRect.width / 2 - containerRect.left;
                const startY = sourceRect.bottom - containerRect.top + 12;

                // Điểm kết thúc là tọa độ chuột hiện tại
                const endX = this.currentMouseX - containerRect.left;
                const endY = this.currentMouseY - containerRect.top;

                let distanceY;
                if (endY >= startY) {
                    distanceY = Math.min(60, Math.max(20, Math.abs(endY - startY) * 0.5));
                } else {
                    distanceY = Math.min(150, Math.max(40, Math.abs(endX - startX) * 0.5));
                }
                const path = `M ${startX} ${startY} C ${startX} ${startY + distanceY}, ${endX} ${endY - distanceY}, ${endX} ${endY}`;

                // Hiển thị đường màu cam nét đứt hoặc màu cam đậm
                newLines.push({ path, color: 'rgba(249, 115, 22, 0.9)' });
            }
        }

        // Tối ưu hóa render 60fps: Cập nhật DOM trực tiếp thay vì thông qua Angular Change Detection
        // Điều này giúp loại bỏ hoàn toàn hiện tượng giật lag khi cuộn chuột hoặc kéo thả
        while (svgContainer.firstChild) {
            svgContainer.removeChild(svgContainer.firstChild);
        }

        newLines.forEach(line => {
            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', line.path);
            pathEl.setAttribute('fill', 'none');
            pathEl.setAttribute('stroke', line.color);
            pathEl.setAttribute('stroke-width', '3');
            pathEl.setAttribute('stroke-linecap', 'round');
            svgContainer.appendChild(pathEl);
        });
    }

    @ViewChild('svgLayer') svgLayer!: ElementRef;

    // Fallback cho scroll (đã loại bỏ CdkVirtualScroll)
    get scrollContainer() {
        return {
            elementRef: {
                nativeElement: document.getElementById('timeline-scroll-container')
            }
        };
    }

    openConfigDialog() {
        const dialogRef = this.dialog.open(VideoProjectConfigDialogComponent, {
            width: '800px',
            maxWidth: '95vw',
            autoFocus: false,
            data: {
                projectData: this.projectData,
                uuid: this.data?.uuid,
                username: this.data?.username || 'anonymous',
                onSave: (newData: any) => {
                    this.projectData = newData;
                    this.saveData();
                }
            }
        });
        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.projectData = result;
                this.saveData();
                this.cd.detectChanges();
            }
        });
    }

    projectData: any;

    editingScenePrompt: any = null;
    editingSceneIndex: number = -1;

    @ViewChild('characterDialogTemplate') characterDialogTemplate!: any;
    editingChar: any = {};
    editingCharIndex: number = -1;
    private characterDialogRef: any = null;
    private editSceneDialogRef: any = null;

    // Pan (Kéo Timeline)
    private isMouseDown = false;
    private startX = 0;
    private scrollLeftStart = 0;

    onWheelScroll(event: WheelEvent) {
        // Có thể để trống hoặc thêm logic scroll timeline
    }

    onSceneWheel(event: WheelEvent) {
        // Đã không còn Scene Columns dọc
    }

    startDragging(e: MouseEvent) {
        if ((e.target as HTMLElement).closest('.cdk-drag-handle')) return;
        this.isMouseDown = true;
        this.startX = e.pageX - this.scrollContainer.elementRef.nativeElement.offsetLeft;
        this.scrollLeftStart = this.scrollContainer.elementRef.nativeElement.scrollLeft;
    }

    stopDragging() {
        this.isMouseDown = false;
    }



    getGlobalIndex(sceneIdx: number, subIdx: number): number {
        if (!this.projectData || !this.projectData.scenes) return 0;
        let total = 0;
        for (let i = 0; i < sceneIdx; i++) {
            total += this.projectData.scenes[i].subtitles?.length || 0;
        }
        return total + subIdx + 1;
    }

    async onAudioFileSelected(event: any, sub: any) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const electron = (window as any).electron;
            const originalPath = electron.getPathForFile(file);
            const localPath = await electron.selectLocalFile(originalPath);
            sub.audioUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

            const audioObj = new Audio(sub.audioUrl);
            audioObj.addEventListener('loadedmetadata', () => {
                sub.duration = audioObj.duration;
                sub.maxDuration = sub.duration;
                this.saveData();
                this.cd.detectChanges();
            });

            this.saveData();
            this.toastr.success('Đã cập nhật Audio!');
        } catch (e) {
            this.toastr.error('Lỗi: ' + e);
        }
    }

    removeAudio(sub: any) {
        if (sub.audioUrl) {
            delete sub.audioUrl;
            delete sub.duration;
            delete sub.maxDuration;

            this.saveData();
            this.toastr.info('Đã xóa liên kết âm thanh câu thoại.');
        }
    }

    // --- Logic Sửa Subtitle Inline ---
    enableEditSub(sub: any) {
        sub.isEditing = true;
        sub.tempText = sub.text;
    }

    saveEditSub(scene: any, sub: any) {
        const newText = sub.tempText ? sub.tempText.trim() : '';

        // NẾU NGƯỜI DÙNG ĐỂ TRỐNG: Xóa subtitle này khỏi scene
        if (newText === '') {
            const index = scene.subtitles.indexOf(sub);
            if (index !== -1) {
                scene.subtitles.splice(index, 1);
                this.toastr.warning('Đã xóa câu thoại do nội dung bị bỏ trống.');
                this.saveData();
            }
            return;
        }

        // NẾU CÓ NỘI DUNG: Lưu bình thường
        sub.text = newText;
        sub.isEditing = false;

        if (sub.audioUrl && sub.text !== sub.tempText) {
            this.toastr.info('Bạn vừa sửa lời thoại. Hãy cẩn thận vì file âm thanh cũ có thể không còn khớp nữa nhé!', 'Lưu ý');
        } else {
            this.toastr.success('Đã cập nhật câu thoại!');
        }

        this.saveData();
    }

    cancelEditSub(sub: any) {
        sub.isEditing = false;
        delete sub.tempText;
    }
    // ---------------------------------

    async generateImage(scene: any, video: any, index: number) {
        // Lấy Master Prompt từ dữ liệu tổng của Project
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";

        // Tự động nối Master Prompt vào Scene Prompt để copy
        const scenePrompt = video.prompt || scene.prompt;
        const finalPrompt = master ? `${master}\n\n${scenePrompt}` : scenePrompt;

        // Copy vào Clipboard
        this.clipboard.copy(finalPrompt);
        this.toastr.info(`Đã copy Master Prompt + Scene #${index + 1} vào khay nhớ tạm!`, 'Thành công');

        // 4. Lưu lại scene để nếu có ảnh download về thì tự động gán vào
        this.activeDownloadScene = video;
    }

    copyCharacterPrompt(char: any) {
        if (!char.prompt) {
            this.toastr.warning('Nhân vật này chưa có câu prompt tạo hình.');
            return;
        }

        // Nối Master Prompt vào để nhân vật cũng giữ đúng phong cách (VD: hoạt hình 3D)
        const master = this.projectData?.masterPrompt ? this.projectData.masterPrompt.trim() : "";
        const finalPrompt = master ? `${master}\n\n${char.prompt}` : char.prompt;

        this.clipboard.copy(finalPrompt);
        this.toastr.success(`Đã copy Master Prompt + Nhân vật: ${char.name || char.role}`, 'Thành công');
    }

    addCharacterToMasterPrompt(char: any) {
        if (!char.prompt) {
            this.toastr.warning('Nhân vật này chưa có câu prompt tạo hình.');
            return;
        }

        if (!this.projectData) this.projectData = {};
        const currentPrompt = this.projectData.masterPrompt ? this.projectData.masterPrompt.trim() : '';

        if (currentPrompt) {
            if (currentPrompt.includes(char.prompt)) {
                this.toastr.info('Nhân vật này đã có trong Master Prompt rồi.');
                return;
            }
            this.projectData.masterPrompt = currentPrompt + (currentPrompt.endsWith(',') || currentPrompt.endsWith('.') ? ' ' : '. ') + char.prompt;
        } else {
            this.projectData.masterPrompt = char.prompt;
        }

        this.saveData();
        this.toastr.success(`Đã thêm tạo hình "${char.name || char.role}" vào Master Prompt!`);
    }

    openEditScenePromptDialog(scene: any, video: any, index: number, vIdx: number = -1) {
        let previousVideoUrl: string | null = null;
        if (vIdx > 0 && scene.videos && scene.videos[vIdx - 1]) {
            previousVideoUrl = scene.videos[vIdx - 1].videoUrl || null;
        } else if (index > 0 && this.projectData?.scenes?.[index - 1]) {
            const prevScene = this.projectData.scenes[index - 1];
            if (prevScene.videos && prevScene.videos.length > 0) {
                previousVideoUrl = prevScene.videos[prevScene.videos.length - 1].videoUrl || null;
            } else if (prevScene.videoUrl) {
                previousVideoUrl = prevScene.videoUrl;
            }
        }

        const dialogRef = this.dialog.open(EditScenePromptDialogComponent, {
            data: {
                scene,
                video,
                index,
                vIdx,
                previousVideoUrl,
                characters: this.projectData?.characters || [],
                projectAspectRatio: this.projectData?.aspectRatio || '16:9',
                masterPrompt: this.projectData?.masterPrompt || '',
                masterControlImageUrl: this.projectData?.masterControlImageUrl || '',
                globalContext: this.projectData?.globalContext || null,
                mediaDir: this.projectData?.mediaDir || '',
                uuid: this.projectData?.uuid || this.data?.uuid,
                username: this.projectData?.username || this.data?.username
            },
            width: '75vw',
            maxWidth: '90vw',
            maxHeight: '95vh',
            disableClose: true
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                if (!this.projectData || !this.projectData.scenes) return;
                if (index >= 0 && index < this.projectData.scenes.length) {
                    video.prompt = result.prompt;
                    video.imageUrl = result.imageUrl;
                    if (result.imagePrompt !== undefined) video.imagePrompt = result.imagePrompt;
                    if (result.videoUrl !== undefined) video.videoUrl = result.videoUrl;
                    if (result.aspectRatio !== undefined) video.aspectRatio = result.aspectRatio;
                    if (result.duration !== undefined) {
                        video.duration = result.duration;
                        video.maxDuration = result.duration;
                    }
                    if (result.usePreviousSceneFrame !== undefined) video.usePreviousSceneFrame = result.usePreviousSceneFrame;
                    if (result.controlImageUrl !== undefined) video.controlImageUrl = result.controlImageUrl;
                    this.saveData();
                    this.cd.detectChanges();
                    this.toastr.success('Đã lưu Prompt phân cảnh!');
                }
            }
        });
    }

    toggleVideoCompleted(video: any) {
        video.isCompleted = !video.isCompleted;
        this.saveData();
    }

    generateAllImages(): void {
        this.saveData();

        if (
            !this.projectData ||
            !this.projectData.scenes ||
            this.projectData.scenes.length === 0
        ) {
            this.toastr.warning('Không có cảnh nào để tạo audio!');
            return;
        }

        this.projectData['username'] = this.data.username || 'anonymous';

        this.alert({
            title: 'Khởi tạo Audio thành công!',
            message: `Hệ thống đã hoàn tất tạo âm thanh cho toàn bộ Video Timeline. <span class="font-medium text-blue-600">Bạn có muốn tiếp tục render Video không?</span>`,
            confirm: 'Tiếp tục Production',
            cb: () => {
                this.dialogRef.close(this.projectData);
                this.router.navigate(['/livestream', this.projectData.uuid || 'unknown_project']);
            },
            cc: () => {
                this.toastr.info('Hủy tiến trình tạo Audio.');
            },
        });
    }

    async prepareForVideoGeneration(silent: boolean = false) {
        if (!this.projectData || !this.projectData.scenes) {
            if (!silent) this.toastr.warning('Không có dữ liệu để rà soát!');
            return;
        }

        if (!silent) this.toastr.info('Đang rà soát và cập nhật thời lượng các file audio...', 'Hệ thống');

        if (!(window as any).electron) {
            this.toastr.warning('Tính năng scan file chỉ hoạt động trên App Desktop.');
        }

        const projectSubPath = `${this.data.username || 'anonymous'}/${this.data.uuid || 'default'}`;
        const promises: Promise<void>[] = [];
        let updatedCount = 0;

        for (let sceneIdx = 0; sceneIdx < this.projectData.scenes.length; sceneIdx++) {
            const scene = this.projectData.scenes[sceneIdx];
            if (!scene.subtitles) continue;

            for (let subIdx = 0; subIdx < scene.subtitles.length; subIdx++) {
                const sub = scene.subtitles[subIdx];

                // Nếu chưa có audioUrl, thử tìm kiếm dưới local
                if (!sub.audioUrl && sub.text && sub.text.trim() !== '' && (window as any).electron) {
                    const globalIndex = this.getGlobalIndex(sceneIdx, subIdx);
                    const prefix = globalIndex.toString().padStart(3, '0');
                    const shortText = sub.text.substring(0, 50);
                    const slug = this.toSlug(shortText);

                    const possibleFilenames = [
                        `${prefix}_${slug}.mp3`,
                        `${prefix}_${slug}.wav`,
                        `${prefix}_${slug}_ausync.mp3`,
                        `${prefix}_${slug}_ausync.wav`
                    ];

                    for (const fname of possibleFilenames) {
                        try {
                            const payload = {
                                username: projectSubPath,
                                filename: fname
                            };
                            const result = await (window as any).electron.invoke('check-local-file-exists', payload);

                            if (result && result.exists) {
                                sub.audioUrl = result.path.startsWith('file://') ? result.path : `file://${result.path}`;
                                break;
                            }
                        } catch (e) { }
                    }
                }

                if (sub.audioUrl) {
                    const p = new Promise<void>((resolve) => {
                        const audioObj = new Audio(sub.audioUrl);
                        audioObj.addEventListener('loadedmetadata', () => {
                            sub.duration = audioObj.duration;
                            sub.maxDuration = sub.duration;
                            updatedCount++;
                            resolve();
                        });
                        audioObj.addEventListener('error', () => {
                            console.error('Không thể load audio:', sub.audioUrl);
                            // Xóa URL nếu file không tồn tại
                            sub.audioUrl = null;
                            sub.duration = 0;
                            resolve();
                        });
                    });
                    promises.push(p);
                }
            }
        }

        if (promises.length > 0) {
            await Promise.all(promises);
            this.saveData();
            if (!silent) this.toastr.success(`Đã quét và cập nhật thời lượng cho ${updatedCount} file audio thành công!`);
        } else {
            if (!silent) this.toastr.warning('Không tìm thấy file audio nào để rà soát.');
            this.saveData();
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

    saveData() {
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.multiAccountService.setItem(storageKey, this.projectData);
    }

    close() {
        this.dialogRef.close();
    }

    trackByScene(index: number, scene: any): any {
        return scene;
    }

    async onFileSelected(event: any, scene: any, video: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];

            try {
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình.');
                    return;
                }

                const originalPath = electron.getPathForFile(file);

                if (!originalPath) {
                    this.toastr.error('Không thể xác nhận đường dẫn file tải về.');
                    return;
                }

                const uuid = this.projectData?.uuid || this.data?.uuid;
                const customDir = uuid ? `tts/admin/${uuid}` : undefined;
                const localFilePath = await electron.selectLocalFile(originalPath, customDir);
                const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath.replace(/\\/g, '/')}`;

                if (file.type.startsWith('video/') || file.name.match(/\.(mp4|webm|avi|mov)$/i)) {
                    video.videoUrl = finalPath;
                    const videoObj = document.createElement('video');
                    videoObj.src = video.videoUrl;
                    videoObj.addEventListener('loadedmetadata', () => {
                        if (videoObj.duration && !isNaN(videoObj.duration)) {
                            video.duration = parseFloat(videoObj.duration.toFixed(1));
                            video.maxDuration = video.duration;
                        }
                    });
                } else {
                    video.imageUrl = finalPath;
                }

                video.isCompleted = true;
                this.saveData();
                this.cd.detectChanges();
                setTimeout(() => this.updateLines(), 150);
                this.toastr.success('Đã tải file thành công!');
            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    clearVideoMedia(video: any) {
        video.imageUrl = null;
        video.videoUrl = null;
        video.isCompleted = false;
        video.maxDuration = undefined;
        this.saveData();
        this.cd.detectChanges();
    }

    isImageType(url: string): boolean {
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        ];
        let cleanUrl = url.replace('file://', '').replace('media://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    selectedSceneIndex: number = -1;

    addNewScene(insertAfterIndex?: number) {
        const dialogRef = this.dialog.open(AddSceneComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '95vh',
            disableClose: true,
            data: {
                selectedClip: null,
                prompt: '',
                characters: this.projectData?.characters || [],
                masterPrompt: this.projectData?.masterPrompt || '',
                availableClips: this.allClips
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.selectedClip && result.prompt) {
                const clip = result.selectedClip;
                const formattedSubtitles = [
                    {
                        id: clip.id,
                        text: clip.description,
                        duration: clip.duration || 0,
                        maxDuration: clip.duration || 0,
                        audioUrl: clip.localFilePath ? `file://${clip.localFilePath.replace(/\\/g, '/')}` : null
                    }
                ];

                const totalDuration = clip.duration || 8;

                const newScene = {
                    id: `manual_${Date.now()}`,
                    subtitles: formattedSubtitles,
                    prompt: result.prompt.trim(),
                    imageUrl: null,
                    videos: [{
                        id: 1,
                        prompt: result.prompt.trim(),
                        imageUrl: null,
                        duration: totalDuration,
                        maxDuration: totalDuration
                    }]
                };

                if (!this.projectData) this.projectData = { scenes: [] };
                if (!this.projectData.scenes) this.projectData.scenes = [];

                let targetIndex = this.projectData.scenes.length;
                
                if (insertAfterIndex !== undefined && insertAfterIndex !== null) {
                    targetIndex = insertAfterIndex + 1;
                } else if (this.activeItem) {
                    // activeItem is the raw video/audio object, find its scene index
                    for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                        const s = this.projectData.scenes[sIdx];
                        if ((s.videos && s.videos.includes(this.activeItem)) ||
                            (s.subtitles && s.subtitles.includes(this.activeItem)) ||
                            (s.extractedAudios && s.extractedAudios.includes(this.activeItem))) {
                            targetIndex = sIdx + 1; // Insert AFTER the scene containing the active item
                            break;
                        }
                    }
                }

                if (targetIndex < this.projectData.scenes.length) {
                    this.projectData.scenes.splice(targetIndex, 0, newScene);
                } else {
                    this.projectData.scenes.push(newScene);
                }

                // Cập nhật lại thời gian cho các cảnh do đã chèn vào giữa
                this.initializeTimeline();
                this.saveData();

                // Tự động focus vào video mới tạo
                setTimeout(() => {
                    this.setActiveItem(newScene.videos[0]);
                    this.currentTimelineTime = (newScene.videos[0] as any).startTime || 0;
                    this.updateTimelineSync();
                    this.cd.detectChanges();
                }, 100);
                this.toastr.success('Đã thêm Scene mới thành công!');

                setTimeout(() => {
                    const el = this.scrollContainer.elementRef.nativeElement;
                    const startX = ((newScene.videos[0] as any).startTime || 0) * this.pixelsPerSecond;
                    // Chỉ scroll nếu điểm bắt đầu nằm ngoài màn hình
                    if (startX < el.scrollLeft || startX > el.scrollLeft + el.clientWidth) {
                        el.scrollLeft = Math.max(0, startX - 100); // 100px padding
                    }
                    this.updateLines();
                }, 100);
            }
        });
    }

    toggleMute(video: any) {
        video.muted = !video.muted;
        this.saveData();
    }

    async extractAudio(video: any, sceneIdx: number) {
        if (!video.videoUrl) return;
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene) return;

        const electron = (window as any).electron;
        if (!electron || !electron.extractAudio || !electron.getPathForFile) {
            this.toastr.error('Tính năng tách audio không khả dụng (Electron error).');
            return;
        }

        try {
            this.toastr.info('Đang tách âm thanh, vui lòng đợi...', 'Đang xử lý');
            let originalPath = video.videoUrl;
            if (originalPath.startsWith('media://')) {
                originalPath = decodeURIComponent(originalPath.substring(8));
            } else if (originalPath.startsWith('file://')) {
                originalPath = decodeURIComponent(originalPath.substring(7));
            }
            if (originalPath.match(/^\/[a-zA-Z]:[\\/]/)) {
                originalPath = originalPath.substring(1);
            }
            const extractedAudioPath = await electron.extractAudio(originalPath);

            // Generate a local url for the browser
            const audioUrl = `media://${extractedAudioPath.replace(/\\/g, '/')}`;

            // Bổ sung vào danh sách extractedAudios của scene hiện tại
            if (!scene.extractedAudios) scene.extractedAudios = [];

            const existIdx = scene.extractedAudios.findIndex((a: any) => a.startTime === video.startTime && a.text === '[Âm thanh gốc]');

            if (existIdx >= 0) {
                // Cập nhật lại thay vì tạo mới
                scene.extractedAudios[existIdx].audioUrl = audioUrl;
                scene.extractedAudios[existIdx].duration = video.duration || 5;
                scene.extractedAudios[existIdx].maxDuration = scene.extractedAudios[existIdx].duration;
            } else {
                scene.extractedAudios.push({
                    text: '[Âm thanh gốc]',
                    audioUrl: audioUrl,
                    startTime: video.startTime,
                    duration: video.duration || 5,
                    maxDuration: video.duration || 5
                });
            }

            // Tắt tiếng video gốc để tránh phát trùng
            video.muted = true;

            this.toastr.success('Đã tách âm thanh thành công!');
            this.saveData();
            setTimeout(() => this.initWaveSurfers(), 500); // Initialize wavesurfers after DOM update
            this.initializeTimeline();
        } catch (err: any) {
            console.error('Extract audio error', err);
            this.toastr.error(`Lỗi khi tách âm thanh: ${err.message}`);
        }
    }

    hasExtractedAudio(scene: any, video: any): boolean {
        if (!scene || !scene.extractedAudios || !video) return false;
        return scene.extractedAudios.some((a: any) => a.startTime === video.startTime && a.text === '[Âm thanh gốc]');
    }

    activeItem: any = null;

    setActiveItem(item: any, event?: MouseEvent) {
        if (event) event.stopPropagation();
        this.activeItem = item;

        // Hiện lên preview nếu là video/image
        if (item && (item.videoUrl || item.imageUrl)) {
            this.playPreview(item);
        } else if (!item) {
            this.updateTimelineSync();
        }
    }

    removeSubtitle(sceneIdx: number, subIdx: number) {
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene || !scene.subtitles) return;

        this.alert({
            title: 'Xóa Track Audio',
            message: `Bạn có chắc chắn muốn xóa đoạn audio này không?`,
            confirm: 'Xóa',
            cb: () => {
                scene.subtitles.splice(subIdx, 1);
                this.saveData();
                this.toastr.warning(`Đã xóa audio!`);
                setTimeout(() => this.initWaveSurfers(), 500);
            }
        });
    }

    removeExtractedAudio(sceneIdx: number, aIdx: number) {
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene || !scene.extractedAudios) return;

        this.alert({
            title: 'Xóa Âm thanh gốc',
            message: `Bạn có chắc chắn muốn xóa đoạn âm thanh gốc này không?`,
            confirm: 'Xóa',
            cb: () => {
                const audio = scene.extractedAudios[aIdx];
                if (scene.videos) {
                    const video = scene.videos.find((v: any) => v.startTime === audio.startTime);
                    if (video) video.muted = false;
                }
                scene.extractedAudios.splice(aIdx, 1);
                this.saveData();
                this.toastr.warning(`Đã xóa âm thanh gốc!`);
                setTimeout(() => this.initWaveSurfers(), 500);
            }
        });
    }

    removeVideo(sceneIdx: number, vIdx: number) {
        const scene = this.projectData.scenes[sceneIdx];
        if (!scene || !scene.videos || !scene.videos[vIdx]) return;

        this.alert({
            title: 'Xóa Video',
            message: `Bạn có chắc chắn muốn xóa video này không? Các video phía sau sẽ tự động dồn lên.`,
            confirm: 'Xóa liền',
            cb: () => {
                const deletedVideo = scene.videos[vIdx];
                const shiftAmount = deletedVideo.duration || 0;

                // 1. Dịch chuyển các video phía sau sang trái TRƯỚC KHI xoá phần tử trong mảng
                let passedDeleted = false;
                for (let s = 0; s < this.projectData.scenes.length; s++) {
                    const currentScene = this.projectData.scenes[s];
                    if (!currentScene.videos) continue;

                    if (s > sceneIdx) passedDeleted = true;

                    for (let v = 0; v < currentScene.videos.length; v++) {
                        const vid = currentScene.videos[v];
                        if (s === sceneIdx && v > vIdx) {
                            passedDeleted = true;
                        }

                        if (passedDeleted && vid.startTime !== undefined) {
                            vid.startTime = Math.max(0, vid.startTime - shiftAmount);
                        }
                    }
                }

                // 2. Xoá video khỏi danh sách
                scene.videos.splice(vIdx, 1);

                // 3. Nếu scene trống thì xoá luôn scene
                if (scene.videos.length === 0) {
                    this.projectData.scenes.splice(sceneIdx, 1);
                }

                this.saveData();
                this.toastr.warning(`Đã xóa video và dồn timeline!`);
                setTimeout(() => this.updateLines(), 100);
            },
        });
    }

    openDirectorMode() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '95vh',
            panelClass: 'dark-theme-dialog',
            data: { 
                prompt: this.projectData?.masterPrompt || '', 
                targetName: 'Apply to Master Prompt',
                globalContext: this.projectData?.globalContext || null,
                aspectRatio: this.projectData?.aspectRatio || '16:9'
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                let promptResult = typeof result === 'string' ? result : result.prompt;
                
                if (!this.projectData) this.projectData = {};
                let currentPrompt = this.projectData.masterPrompt ? this.projectData.masterPrompt.trim() : '';
                currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentPrompt) {
                    this.projectData.masterPrompt = '[Cinematography: ' + promptResult + ']\n\n' + currentPrompt;
                } else {
                    this.projectData.masterPrompt = '[Cinematography: ' + promptResult + ']';
                }
                
                if (typeof result !== 'string' && result.controlImageUrl) {
                    this.projectData.masterControlImageUrl = result.controlImageUrl;
                }

                if (typeof result !== 'string' && result.globalContext) {
                    this.projectData.globalContext = { ...result.globalContext };
                }
                
                this.saveData();
                this.toastr.success('Đã áp dụng các thông số Director Mode vào Master Prompt!');
            }
        });
    }

    // Thêm hàm này vào trong class VideoTimelineDialogComponent
    getSceneDuration(scene: any): string {
        if (scene.forcedDuration) {
            return `${scene.forcedDuration}s`;
        }

        if (!scene || !scene.subtitles || scene.subtitles.length === 0) return '0s';

        let totalSeconds = 0;

        for (const sub of scene.subtitles) {
            if (sub.duration) {
                // Nếu đã có sẵn thời lượng thực tế của file audio
                totalSeconds += sub.duration;
            } else if (sub.text) {
                // Ước lượng nếu chưa có file audio (trung bình ~4 từ/giây)
                const words = sub.text.trim().split(/\s+/).length;
                totalSeconds += Math.max(1, words / 4); // Ít nhất là 1 giây
            }
        }

        const total = Math.round(totalSeconds);

        // Format hiển thị (VD: 45s hoặc 1m15s)
        if (total < 60) return `${total}s`;

        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${minutes}m${seconds}s`;
    }

    constructor(
        public dialogRef: MatDialogRef<VideoTimelineDialogComponent>,
        private clipboard: Clipboard,
        private multiAccountService: MultiAccountService,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private _fuseConfirmationService: FuseConfirmationService,
        private router: Router,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) { }

    private safeUrlCache: { [url: string]: SafeUrl } = {};
    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        if (cleanUrl.startsWith('http') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
            // do nothing
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            const originalPath = cleanUrl;

            const mediaDir = this.projectData?.mediaDir || this.data?.mediaDir || '';
            let projectUuid = this.projectData?.uuid || this.data?.uuid;
            if (!projectUuid) {
                const parts = window.location.href.split('/');
                projectUuid = parts[parts.length - 1];
            }

            cleanUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=${encodeURIComponent(projectUuid || 'default')}`;
        }

        if (this.safeUrlCache[cleanUrl]) return this.safeUrlCache[cleanUrl];

        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(cleanUrl);
        this.safeUrlCache[cleanUrl] = safeUrl;
        return safeUrl;
    }

    ngAfterViewInit() {
        const el = document.getElementById('timeline-scroll-container');
        if (el) {
            el.addEventListener('scroll', () => {
                this.updateLines();
            });
        }
    }

    ngOnInit() {
        this.isSvgReady = false;
        const storageKey = `${this.STORAGE_CLIPS_KEY}_${this.data.uuid}`;
        this.projectData = this.multiAccountService.getItem(storageKey);

        const audioStorageKey = `ai_type_audio_merger_data_${this.data.uuid}`;
        const audioData = this.multiAccountService.getItem(audioStorageKey);
        this.allClips = audioData && audioData.clips ? audioData.clips : [];

        // Backward compatibility: Convert old scenes to grouped videos format
        if (this.projectData && this.projectData.scenes) {
            this.projectData.scenes.forEach((scene: any) => {
                // Clear any stale generating flags
                if (scene.videos) {
                    scene.videos.forEach((video: any) => {
                        video.isGeneratingImage = false;
                        video.isGeneratingVideo = false;
                    });
                }

                if (!scene.videos || scene.videos.length === 0) {
                    let defaultDuration = scene.forcedDuration || 5;
                    if (!scene.forcedDuration && scene.subtitles) {
                        let totalSecs = 0;
                        for (const sub of scene.subtitles) {
                            if (sub.duration) totalSecs += sub.duration;
                            else if (sub.text) totalSecs += Math.max(1, sub.text.trim().split(/\s+/).length / 4);
                        }
                        if (totalSecs > 0) defaultDuration = Math.round(totalSecs);
                    }
                    scene.videos = [{
                        id: 1,
                        prompt: scene.prompt || '',
                        imageUrl: scene.imageUrl || null,
                        duration: defaultDuration
                    }];
                }
            });
        }

        // Khởi tạo Timeline (gán startTime cho các video)
        this.initializeTimeline();

        // Select the first video by default
        if (this.projectData && this.projectData.scenes && this.projectData.scenes.length > 0) {
            const firstScene = this.projectData.scenes[0];
            if (firstScene.videos && firstScene.videos.length > 0) {
                const firstVideo = firstScene.videos[0];
                this.setActiveItem(firstVideo);
                this.currentTimelineTime = firstVideo.startTime || 0;
                this.updateTimelineSync();
            }
        }

        // Tự động kiểm tra file audio ngay khi mở màn hình
        this.prepareForVideoGeneration(true);

        // Lắng nghe sự kiện tải ảnh từ webview (Gemini/Labs)
        const electron = (window as any).electron;
        if (electron && electron.onWebviewDownloadComplete) {
            electron.onWebviewDownloadComplete((res: any) => {
                if (this.activeDownloadScene && res && res.file) {
                    const localPath = res.file;
                    // Gắn URL hình ảnh
                    this.activeDownloadScene.imageUrl = localPath.startsWith('file://') ? localPath : `file://${localPath}`;

                    // Lưu lại và báo thành công
                    this.saveData();
                    this.toastr.success(`Đã gán ảnh vừa tải ảnh vào Phân cảnh!`, "Tải ảnh thành công!");

                    // Xóa scene đang được chọn để tránh gắn nhầm cho các lần tải sau
                    // và ngăn chặn lỗi hiển thị nhiều thông báo do event listener bị trùng lặp
                    this.activeDownloadScene = null;
                }
            });
        }

        // Vẽ SVG lần đầu sau khi view render xong
        // Đảm bảo updateLines chạy đủ lâu để chờ virtual scroll render xong các item ảo
        setTimeout(() => this.updateLines(), 100);
        setTimeout(() => this.updateLines(), 300);
        setTimeout(() => this.updateLines(), 600);
        setTimeout(() => {
            this.updateLines();
            this.isSvgReady = true;
            this.cd.detectChanges();
        }, 800);
    }

    ngOnDestroy() {
        // Hủy các sự kiện nếu có
    }

    alert(alert?: any) {
        const dialogRef = this._fuseConfirmationService.open({
            title: alert ? alert.title : 'Hoàn tất!',
            message: alert
                ? alert.message
                : 'Chúng tôi thấy rằng bạn đã hoàn tất việc lấy dữ liệu. <span class="font-medium">Hãy tiếp tục với một URL mới luôn nào!</span>',
            icon: { show: true, name: 'feather:check', color: 'primary' },
            actions: {
                confirm: { show: true, label: alert ? alert.confirm : 'Khởi động lại', color: 'primary' },
                cancel: { show: true, label: alert ? alert.cancel : 'Đóng cửa sổ' },
            },
            dismissible: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                if (alert.cb) alert.cb();
            } else {
                if (alert.cc) alert.cc();
            }
        });
    }

    resetVideoDuration(e: MouseEvent, video: any) {
        e.preventDefault();
        e.stopPropagation();
        if (video && video.maxDuration !== undefined) {
            video.duration = video.maxDuration;
            this.saveData();
            this.cd.detectChanges();
        }
    }
}