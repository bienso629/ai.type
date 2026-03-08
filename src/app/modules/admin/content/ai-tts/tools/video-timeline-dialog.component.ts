import { Component, OnInit } from '@angular/core';

@Component({
    selector: 'app-video-timeline-dialog',
    templateUrl: 'video-timeline-dialog.component.html',
    styles: [`
    .scrollbar-thin::-webkit-scrollbar { height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: #f1f1f1; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: #888; border-radius: 3px; }
    .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: #555; }
  `]
})
export class VideoTimelineDialogComponent implements OnInit {
    projectData: any;

    ngOnInit() {
        const raw = localStorage.getItem('ai_type_video_ready_data');
        if (raw) {
            this.projectData = JSON.parse(raw);
        }
    }

    async generateImage(scene: any, index: number) {
        // Giả lập gọi API tạo ảnh
        console.log("Creating image for prompt:", scene.prompt);

        // Ở đây bạn sẽ gọi Service tạo ảnh (Leonardo/DALL-E...)
        // Sau khi có URL, cập nhật lại dữ liệu
        scene.imageUrl = 'https://via.placeholder.com/400x225?text=Processing...';

        // Cập nhật lại localStorage để lưu trạng thái
        this.saveData();
    }

    generateAllImages() {
        // Logic để chạy vòng lặp tạo toàn bộ ảnh chưa có
        alert("Hệ thống sẽ bắt đầu tạo " + this.projectData.scenes.length + " hình ảnh!");
    }

    saveData() {
        localStorage.setItem('ai_type_video_ready_data', JSON.stringify(this.projectData));
    }
}