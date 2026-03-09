import { Component, OnInit, ViewChild, ElementRef, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-video-timeline-dialog',
    templateUrl: 'video-timeline-dialog.component.html',
    styles: [`
    /* Ẩn thanh cuộn nhưng vẫn giữ tính năng scroll */
    .timeline-container {
        scrollbar-width: none; /* Firefox */
        -ms-overflow-style: none;  /* IE and Edge */
        scroll-behavior: auto; /* Tắt smooth scroll khi kéo để không bị delay */
    }
    .timeline-container::-webkit-scrollbar {
        display: none; /* Chrome, Safari, Opera */
    }
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
  `]
})
export class VideoTimelineDialogComponent implements OnInit {
    @ViewChild('scrollContainer') scrollContainer!: ElementRef;

    projectData: any;

    // Các biến phục vụ kéo thả
    private isMouseDown = false;
    private startX = 0;
    private scrollLeftStart = 0;

    constructor(
        public dialogRef: MatDialogRef<VideoTimelineDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { imageUrl: string, username: string },
        private toastr: ToastrService
    ) {
    }

    ngOnInit() {
        const raw = localStorage.getItem('ai_type_video_ready_data');
        if (raw) {
            this.projectData = JSON.parse(raw);
        }
    }

    // --- Logic Kéo thả ---
    startDragging(e: MouseEvent) {
        this.isMouseDown = true;
        this.startX = e.pageX - this.scrollContainer.nativeElement.offsetLeft;
        this.scrollLeftStart = this.scrollContainer.nativeElement.scrollLeft;
    }

    stopDragging() {
        this.isMouseDown = false;
    }

    moveEvent(e: MouseEvent) {
        if (!this.isMouseDown) return;

        e.preventDefault();
        const x = e.pageX - this.scrollContainer.nativeElement.offsetLeft;
        // Nhân hệ số (ví dụ 1.5) để kéo nhạy hơn
        const walk = (x - this.startX) * 1.5;
        this.scrollContainer.nativeElement.scrollLeft = this.scrollLeftStart - walk;
    }
    // ---------------------

    async generateImage(scene: any, index: number) {
        console.log("Creating image for prompt:", scene.prompt);
        // Giả lập
        scene.imageUrl = 'https://via.placeholder.com/400x225?text=Generating...';
        this.saveData();
    }

    generateAllImages() {
        alert("Hệ thống sẽ bắt đầu tạo " + this.projectData.scenes.length + " hình ảnh!");
    }

    saveData() {
        localStorage.setItem('ai_type_video_ready_data', JSON.stringify(this.projectData));
    }

    close() { this.dialogRef.close(); }
}