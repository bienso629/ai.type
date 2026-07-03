import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { Component, Inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GenaiService } from 'app/genai.service';
import { ToastrService } from 'ngx-toastr';
import { ChangeDetectorRef } from '@angular/core';

export interface ControlTemplate {
    id: string;
    prompt: string;
    imageUrl: string;
    createdAt: number;
}

@Component({
    selector: 'app-director-mode',
    standalone: true,
    imports: [TranslocoModule, MatTooltipModule, 
        TranslocoModule,CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormsModule],
    templateUrl: './director-mode.component.html',
    styles: [`
        .light-theme {
            background-color: #ffffff;
            color: #111827;
        }
        .section-card {
            padding: 0;
            margin-bottom: 16px;
        }
        .section-card:last-child {
            margin-bottom: 0;
        }
        .option-img {
            width: 100%;
            height: 45px;
            object-fit: cover;
            border-radius: 8px;
            border: 2px solid transparent;
            transition: all 0.2s ease;
            background-color: #f9fafb;
        }
        .option-item.selected .option-img {
            border-color: #4f46e5;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
        }
        .option-item:hover .option-img {
            opacity: 0.8;
            background-color: #f3f4f6;
        }
        .toggle-btn {
            background-color: #ffffff;
            color: #6b7280;
            border-radius: 6px;
            padding: 8px 12px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 12px;
            flex: 1;
            border: 1px solid transparent;
        }
        .toggle-btn.selected {
            background-color: #ffffff;
            color: #4f46e5;
            font-weight: 600;
            border-color: #4f46e5;
            box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
    `]
})
export class DirectorModeComponent implements OnInit {
    
    activeTab: 'camera' | 'controlnet' | 'context' = 'camera';
    controlImageUrl: string | null = null;
    isUploadingControlImage: boolean = false;

    savedControlTemplates: ControlTemplate[] = [];
    isPromptingForSaveTemplate: boolean = false;
    saveTemplateName: string = '';
    
    // Video extraction
    @ViewChild('videoUploadInput') videoUploadInput!: ElementRef<HTMLInputElement>;
    extractedFrames: string[] = [];
    loadingMessage: string = '';
    
    // Global Context
    
    private safeUrlCache: { [url: string]: SafeUrl } = {};

    selections: any = {
        timeOfDay: '',
        lighting: '',
        filmStockColor: 'Full color',
        filmStockType: '',
        focusDepth: '',
        cameraAngle: '',
        composition: '',
        shotSize: '',
        lenses: '',
        cameraSpeed: '',
        movementType: '',
        movementSpeed: 'Standard movement',
        movementEasing: 'Standard easing',
        artStyle: ''
    };

    categories = {
        timeOfDay: ['Golden hour', 'Midday', 'Twilight', 'Neon'],
        lighting: ['Front lit', 'Side lit', 'Back lit', 'Top lit'],
        filmStockType: ['VHS', '16mm', '35mm', 'Digital'],
        focusDepth: ['Deep focus', 'Cinematic Bokeh', 'Selective focus'],
        composition: ['Rule of thirds', 'Center weighted', 'Negative space', 'Headroom'],
        cameraAngle: ['Eye level', 'Low angle', 'High angle', 'Top-down', 'Dutch angle'],
        shotSize: ['Extreme close-up', 'Close-up', 'Medium', 'Wide', 'Extreme wide'],
        lenses: ['Wide angle', 'Standard', 'Telephoto', 'Macro'],
        movementType: ['Static', 'Tilt', 'Dolly', 'Tracking', 'Orbit'],
        cameraSpeed: ['Real-time', 'Slow motion', 'Hyperlapse'],
        artStyle: ['Cinematic', 'Photorealistic', '3D Render', 'Unreal Engine 5', 'CGI', 'Anime', 'Animation', 'Illustration', 'Oil Painting', 'Smooth Skin']
    };

    labels: any = {
        'Cinematic': 'Điện ảnh',
        'Photorealistic': 'Chân thực',
        '3D Render': '3D Render',
        'Unreal Engine 5': 'Unreal Engine',
        'CGI': 'Kỹ xảo CGI',
        'Anime': 'Anime',
        'Animation': 'Hoạt hình',
        'Illustration': 'Minh họa 2D',
        'Oil Painting': 'Tranh sơn dầu',
        'Smooth Skin': 'Mịn da (Beauty)',

        'Golden hour': 'Giờ vàng',
        'Midday': 'Trưa nắng',
        'Twilight': 'Chạng vạng',
        'Neon': 'Đèn Neon',

        'Front lit': 'Sáng mặt trước',
        'Side lit': 'Sáng ngang',
        'Back lit': 'Sáng ngược',
        'Top lit': 'Sáng từ trên',

        'Eye level': 'Ngang tầm mắt',
        'Low angle': 'Từ dưới lên',
        'High angle': 'Từ trên xuống',
        'Top-down': 'Đỉnh đầu',
        'Dutch angle': 'Góc nghiêng',

        'Real-time': 'Bình thường',
        'Slow motion': 'Quay chậm',
        'Hyperlapse': 'Tua nhanh',

        'VHS': 'Băng VHS',
        '16mm': 'Phim 16mm',
        '35mm': 'Phim 35mm',
        'Digital': 'Kỹ thuật số',
        'Full color': 'Đầy đủ màu sắc',
        'Black & White': 'Trắng đen',

        'Deep focus': 'Nét sâu',
        'Cinematic Bokeh': 'Xóa phông mờ ảo',
        'Selective focus': 'Lấy nét có chọn lọc',

        'Rule of thirds': 'Quy tắc 1/3',
        'Center weighted': 'Cân bằng giữa',
        'Negative space': 'Không gian trống',
        'Headroom': 'Khoảng không đỉnh đầu',

        'Extreme close-up': 'Đặc tả',
        'Close-up': 'Cận cảnh',
        'Medium': 'Trung cảnh',
        'Wide': 'Toàn cảnh',
        'Extreme wide': 'Viễn cảnh',

        'Wide angle': 'Góc rộng',
        'Standard': 'Tiêu chuẩn',
        'Telephoto': 'Chụp xa',
        'Macro': 'Siêu cận',

        'Static': 'Cố định',
        'Tilt': 'Nghiêng',
        'Dolly': 'Trượt',
        'Tracking': 'Bám theo',
        'Orbit': 'Xoay vòng',

        'Subtle': 'Nhẹ nhàng',
        'Standard movement': 'Tiêu chuẩn',
        'Intense': 'Mạnh mẽ',

        'Linear': 'Đều đặn',
        'Standard easing': 'Tiêu chuẩn',
        'Natural': 'Tự nhiên'
    };

    // Dummy images for UI display. You can replace these with local assets later.
    getInitials(label: string) {
        let textParts = label.split(' ');
        let initials = textParts.length > 1 ? textParts[0][0] + textParts[1][0] : label.substring(0, 2);
        return initials.toUpperCase();
    }

    constructor(
        public dialogRef: MatDialogRef<DirectorModeComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private sanitizer: DomSanitizer,
        private _genaiService: GenaiService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef
    ) {
        // Init with existing prompt if any
        if (data && data.prompt) {
            const match = data.prompt.match(/[\[\(](?:Director|Cinematography):\s*(.*?)[\]\)]/);
            if (match && match[1]) {
                const parts = match[1].split(',').map((p: string) => p.trim());
                parts.forEach((part: string) => {
                    let cleanPart = part;
                    if (cleanPart.endsWith(' shot')) {
                        cleanPart = cleanPart.replace(' shot', '');
                    }
                    
                    if (this.categories.timeOfDay.includes(cleanPart)) this.selections.timeOfDay = cleanPart;
                    else if (this.categories.lighting.includes(cleanPart)) this.selections.lighting = cleanPart;
                    else if (this.categories.focusDepth.includes(cleanPart)) this.selections.focusDepth = cleanPart;
                    else if (this.categories.composition.includes(cleanPart)) this.selections.composition = cleanPart;
                    else if (this.categories.shotSize.includes(cleanPart)) this.selections.shotSize = cleanPart;
                    else if (this.categories.cameraAngle.includes(cleanPart)) this.selections.cameraAngle = cleanPart;
                    else if (this.categories.lenses.includes(cleanPart)) this.selections.lenses = cleanPart;
                    else if (this.categories.cameraSpeed.includes(cleanPart)) this.selections.cameraSpeed = cleanPart;
                    else if (this.categories.artStyle.includes(cleanPart)) this.selections.artStyle = cleanPart;
                    else if (cleanPart === 'Static camera' || cleanPart === 'Static') {
                        this.selections.movementType = 'Static';
                    }
                    else {
                        let foundMovement = false;
                        for (const type of this.categories.movementType) {
                            if (cleanPart.includes(` ${type} with `)) {
                                this.selections.movementType = type;
                                const mParts = cleanPart.split(` ${type} with `);
                                this.selections.movementSpeed = mParts[0];
                                this.selections.movementEasing = mParts[1];
                                foundMovement = true;
                                break;
                            }
                        }
                        if (foundMovement) return;

                        let foundFilmStock = false;
                        for (const type of this.categories.filmStockType) {
                            if (cleanPart.endsWith(type)) {
                                this.selections.filmStockType = type;
                                const colorStr = cleanPart.replace(` ${type}`, '').trim();
                                if (colorStr) {
                                    this.selections.filmStockColor = colorStr;
                                }
                                foundFilmStock = true;
                                break;
                            }
                        }
                        if (!foundFilmStock) {
                            if (cleanPart === 'Black & White' || cleanPart === 'Full color') {
                                this.selections.filmStockColor = cleanPart;
                            }
                        }
                    }
                });
            }
            if (data.controlImageUrl) {
                this.controlImageUrl = data.controlImageUrl;
            }
        }
    }

    ngOnInit(): void {
        this.loadControlTemplates();
        
        // Khôi phục lại các khung hình đã trích xuất từ lần mở trước
        try {
            const savedFrames = localStorage.getItem('last_extracted_frames');
            if (savedFrames) {
                this.extractedFrames = JSON.parse(savedFrames);
            }
        } catch(e) {
            console.error('Lỗi khi tải cache frames:', e);
        }
    }

    loadControlTemplates() {
        try {
            const saved = localStorage.getItem('saved_control_templates');
            if (saved) {
                this.savedControlTemplates = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Lỗi khi tải bố cục mẫu:', e);
        }
    }

    selectControlTemplate(template: ControlTemplate) {
        this.controlImageUrl = template.imageUrl;
    }


    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        if (cleanUrl.startsWith('http') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
            // do nothing
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            const originalPath = cleanUrl;

            const mediaDir = this.data?.mediaDir || '';
            let projectUuid = this.data?.uuid;
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

    removeControlImage() {
        this.controlImageUrl = null;
    }

    select(category: string, value: string) {
        if (this.selections[category] === value) {
            this.selections[category] = ''; // toggle off
        } else {
            this.selections[category] = value;
        }
    }

    apply() {
        let parts = [];
        
        if (this.selections.artStyle) parts.push(this.selections.artStyle);
        if (this.selections.timeOfDay) parts.push(this.selections.timeOfDay);
        if (this.selections.lighting) parts.push(this.selections.lighting);
        
        if (this.selections.filmStockType) {
            if (this.selections.filmStockColor) {
                parts.push(`${this.selections.filmStockColor} ${this.selections.filmStockType}`);
            } else {
                parts.push(this.selections.filmStockType);
            }
        } else if (this.selections.filmStockColor) {
            parts.push(this.selections.filmStockColor);
        }
        
        if (this.selections.focusDepth) parts.push(this.selections.focusDepth);
        if (this.selections.composition) parts.push(this.selections.composition);
        if (this.selections.cameraAngle) parts.push(`${this.selections.cameraAngle} shot`);
        if (this.selections.shotSize) parts.push(`${this.selections.shotSize} shot`);
        if (this.selections.lenses) parts.push(this.selections.lenses);
        if (this.selections.cameraSpeed) parts.push(this.selections.cameraSpeed);
        
        if (this.selections.movementType) {
            if (this.selections.movementType !== 'Static') {
                parts.push(`${this.selections.movementSpeed} ${this.selections.movementType} with ${this.selections.movementEasing}`);
            } else {
                parts.push('Static camera');
            }
        }

        let finalPrompt = '';
        if (parts.length > 0) {
            finalPrompt = parts.join(', ');
        }

        this.dialogRef.close({ 
            prompt: finalPrompt, 
            controlImageUrl: this.controlImageUrl
        });
    }
}
