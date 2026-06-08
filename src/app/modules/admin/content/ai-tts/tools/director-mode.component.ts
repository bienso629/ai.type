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
    imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, FormsModule],
    templateUrl: './director-mode.component.html',
    styles: [`
        .light-theme {
            background-color: #ffffff;
            color: #111827;
        }
        .section-card {
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
            border: 1px solid #f3f4f6;
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
    globalContext = {
        seed: null as number | null,
        referenceImageUrl: null as string | null,
        environmentPrompt: ''
    };
    isUploadingReferenceImage: boolean = false;
    
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
        movementEasing: 'Standard easing'
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
        cameraSpeed: ['Real-time', 'Slow motion', 'Hyperlapse']
    };

    labels: any = {
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
            const match = data.prompt.match(/\[(?:Director|Cinematography):\s*(.*?)\]/);
            if (match && match[1]) {
                const parts = match[1].split(',').map((p: string) => p.trim());
                parts.forEach((part: string) => {
                    if (this.categories.timeOfDay.includes(part)) this.selections.timeOfDay = part;
                    else if (this.categories.lighting.includes(part)) this.selections.lighting = part;
                    else if (this.categories.focusDepth.includes(part)) this.selections.focusDepth = part;
                    else if (this.categories.composition.includes(part)) this.selections.composition = part;
                    else if (this.categories.shotSize.includes(part)) this.selections.shotSize = part;
                    else if (this.categories.lenses.includes(part)) this.selections.lenses = part;
                    else if (part === 'Static camera') {
                        this.selections.movementType = 'Static';
                    }
                    else {
                        let foundMovement = false;
                        for (const type of this.categories.movementType) {
                            if (part.includes(` ${type} with `)) {
                                this.selections.movementType = type;
                                const mParts = part.split(` ${type} with `);
                                this.selections.movementSpeed = mParts[0];
                                this.selections.movementEasing = mParts[1];
                                foundMovement = true;
                                break;
                            }
                        }
                        if (foundMovement) return;

                        let foundFilmStock = false;
                        for (const type of this.categories.filmStockType) {
                            if (part.endsWith(type)) {
                                this.selections.filmStockType = type;
                                const colorStr = part.replace(` ${type}`, '').trim();
                                if (colorStr) {
                                    this.selections.filmStockColor = colorStr;
                                }
                                foundFilmStock = true;
                                break;
                            }
                        }
                        if (!foundFilmStock) {
                            if (part === 'Black & White' || part === 'Full color') {
                                this.selections.filmStockColor = part;
                            }
                        }
                    }
                });
            }
            if (data.controlImageUrl) {
                this.controlImageUrl = data.controlImageUrl;
            }
            if (this.data && this.data.globalContext) {
                this.globalContext = { ...this.data.globalContext };
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

    saveCurrentControlAsTemplate() {
        if (!this.controlImageUrl) {
            this.toastr.warning('Vui lòng đảm bảo đã có ảnh bố cục.');
            return;
        }
        
        const promptName = this.posePromptText?.trim() || 'Bố cục tuỳ chỉnh';

        const newTemplate: ControlTemplate = {
            id: 'template_' + Date.now(),
            prompt: promptName,
            imageUrl: this.controlImageUrl,
            createdAt: Date.now()
        };

        this.savedControlTemplates.push(newTemplate);
        localStorage.setItem('saved_control_templates', JSON.stringify(this.savedControlTemplates));
        
        this.toastr.success('Đã lưu bố cục mẫu thành công!');
    }

    deleteControlTemplate(id: string, event: Event) {
        event.stopPropagation();
        this.savedControlTemplates = this.savedControlTemplates.filter(t => t.id !== id);
        localStorage.setItem('saved_control_templates', JSON.stringify(this.savedControlTemplates));
    }

    selectControlTemplate(template: ControlTemplate) {
        this.controlImageUrl = template.imageUrl;
    }

    onReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.isUploadingReferenceImage = true;
            this.globalContext.referenceImageUrl = URL.createObjectURL(file);
            this.isUploadingReferenceImage = false;
        }
    }

    removeReferenceImage() {
        this.globalContext.referenceImageUrl = null;
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

    async onControlImageSelected(event: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            try {
                this.isUploadingControlImage = true;
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    const file = fileInput.files[0];
                    this.controlImageUrl = URL.createObjectURL(file);
                    this.isUploadingControlImage = false;
                    return;
                }

                const file = fileInput.files[0];
                const originalPath = electron.getPathForFile(file);

                if (originalPath) {
                    const uuid = this.data?.uuid;
                    const username = this.data?.username || 'anonymous';
                    const customDir = uuid ? `tts/${username}/${uuid}` : undefined;
                    
                    const localFilePath = await electron.selectLocalFile(originalPath, customDir);
                    const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath}`;
                    this.controlImageUrl = finalPath;
                }
                this.isUploadingControlImage = false;
                this.cd.detectChanges();
            } catch (error) {
                console.error('Process error:', error);
                this.isUploadingControlImage = false;
                this.cd.detectChanges();
            }
        }
    }

    triggerVideoUpload(event: Event) {
        event.stopPropagation();
        this.videoUploadInput.nativeElement.click();
    }

    async onVideoSelected(event: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            try {
                this.isUploadingControlImage = true;
                this.loadingMessage = 'Đang trích xuất khung hình từ Video (có thể mất vài chục giây)...';
                this.cd.detectChanges();

                const electron = (window as any).electron;
                if (!electron || !electron.getPathForFile || !electron.extractVideoFrames) {
                    this.toastr.error('Tính năng này yêu cầu môi trường Desktop (Electron).');
                    this.isUploadingControlImage = false;
                    return;
                }

                const file = fileInput.files[0];
                const originalPath = electron.getPathForFile(file);

                if (originalPath) {
                    const result = await electron.extractVideoFrames(originalPath);
                    if (result && result.success && result.paths && result.paths.length > 0) {
                        this.extractedFrames = result.paths.map((p: string) => p.startsWith('file://') ? p : `file://${p.replace(/\\/g, '/')}`);
                        localStorage.setItem('last_extracted_frames', JSON.stringify(this.extractedFrames)); // Lưu lại để lần sau mở còn thấy
                        this.toastr.success(`Đã trích xuất ${result.paths.length} khung hình.`);
                    } else {
                        this.toastr.warning('Không tìm thấy khung hình nào.');
                    }
                }
            } catch (error: any) {
                console.error('Lỗi trích xuất video:', error);
                this.toastr.error('Lỗi khi trích xuất video: ' + error.message);
            } finally {
                this.isUploadingControlImage = false;
                this.loadingMessage = '';
                // Reset input
                fileInput.value = '';
                this.cd.detectChanges();
            }
        }
    }

    onFramesScroll(event: WheelEvent) {
        if (event.deltaY !== 0) {
            const el = event.currentTarget as HTMLElement;
            el.scrollLeft += event.deltaY;
            event.preventDefault();
        }
    }

    async selectExtractedFrame(frameUrl: string) {
        // Không xóa extractedFrames để người dùng có thể đổi ý chọn hình khác sau khi xóa ControlImage hiện tại
        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang dùng AI để chuyển đổi khung hình thành bản phác thảo chuẩn mực...';
        this.cd.detectChanges();

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Tính năng này yêu cầu môi trường Desktop (Electron) để lưu ảnh.');
            this.isUploadingControlImage = false;
            return;
        }

        try {
            // 1. Fetch the local frame image and convert to base64
            const cleanUrl = frameUrl.replace('file://', '').replace(/\\/g, '/');
            const response = await fetch(frameUrl);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => {
                    const base64data = reader.result as string;
                    resolve(base64data.split(',')[1]);
                };
            });
            reader.readAsDataURL(blob);
            const base64DataStr = await base64Promise;

            // 2. Call Vision AI (gemini-3-flash-preview) to analyze the image
            this.loadingMessage = 'Đang phân tích bối cảnh và dáng người bằng AI Vision...';
            this.cd.detectChanges();
            
            const visionPrompt = `Analyze this image in EXTREME detail for the purpose of recreating its exact structural composition in a storyboard sketch.
Focus ONLY on:
1. Camera angle and shot type (e.g., medium shot, low angle, wide shot).
2. The environment/background elements and their positions.
3. The exact physical poses, body language, and spatial relationships of all people/characters. Describe where their arms, legs, and heads are positioned, and which direction they are facing.
Do NOT describe colors, clothing style, facial features, or lighting.`;

            const visionResponse = await this._genaiService.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [{ 
                    role: 'user', 
                    parts: [
                        { text: visionPrompt },
                        { inlineData: { mimeType: 'image/jpeg', data: base64DataStr } }
                    ] 
                }],
                config: {
                    bypassUModelverse: true // Ép dùng API miễn phí của Google (bỏ qua Mì Tôm AI)
                } as any
            });
            
            const sceneDescription = visionResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!sceneDescription) throw new Error('Vision AI failed to describe the image.');

            // 3. Call Image Generation AI to draw the sketch
            this.loadingMessage = 'Đang vẽ phác thảo chuẩn mực...';
            this.cd.detectChanges();

            const aiPrompt = `Draw a detailed professional storyboard sketch representing EXACTLY this scene layout and character poses:
"${sceneDescription}"

[MANDATORY: Make it a clear, high-quality storyboard sketch in grayscale or black-and-white. It MUST accurately reflect the environment and specific character poses described above. CRITICAL: Do NOT draw specific clothing, outfits, or detailed facial features for the characters. Draw all characters as simple 3D mannequins, wooden dummies, or blank base meshes. This is to ensure it only captures the POSE and STRUCTURAL COMPOSITION.]`;

            const aiResponse = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ 
                    role: 'user', 
                    parts: [
                        { text: aiPrompt }
                    ] 
                }],
                config: {
                    aspectRatio: this.data?.aspectRatio || '16:9',
                    responseModalities: ['IMAGE']
                } as any
            });

            let newBase64Data = null;
            if (aiResponse.candidates && aiResponse.candidates.length > 0) {
                for (const part of aiResponse.candidates[0].content.parts) {
                    if (part.inlineData) {
                        newBase64Data = part.inlineData.data;
                        break;
                    }
                }
            }

            if (!newBase64Data) {
                throw new Error('AI did not return any image data.');
            }

            // 3. Save new AI sketch to local
            const fileName = `pose_reference_from_video_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: newBase64Data,
                fileName: fileName,
                folder: 'tts',
                username: this.data?.username || 'admin'
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.controlImageUrl = finalPath;
                this.toastr.success('Đã tạo ảnh phác thảo chuẩn mực thành công!');
            } else {
                throw new Error(result.error || 'Failed to save local file');
            }

        } catch (error: any) {
            console.error('Error generating sketch from frame:', error);
            this.toastr.error('Lỗi khi chuyển đổi bằng AI: ' + error.message);
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            this.cd.detectChanges();
        }
    }

    isPromptingForPose: boolean = false;
    posePromptText: string = '';

    openPosePrompt(event: Event) {
        event.stopPropagation();
        this.isPromptingForPose = true;
        let basePrompt = '';
        if (this.data && (this.data.prompt || this.data.videoPrompt)) {
            let combined = '';
            if (this.data.prompt) combined += this.data.prompt.trim();
            if (this.data.videoPrompt) combined += (combined ? '\n\n' : '') + this.data.videoPrompt.trim();
            
            basePrompt = combined;
            basePrompt = basePrompt.replace(/\[(?:Director|Cinematography|MANDATORY):.*?\]/g, '').replace(/\n{2,}/g, '\n').trim();
        }
        if (!basePrompt) {
            basePrompt = "Góc máy ngang tầm mắt, trung cảnh (Medium Shot). Một người đàn ông đang đứng khoanh tay suy nghĩ.";
        }
        this.posePromptText = basePrompt;
        this.cd.detectChanges();
    }

    async submitGeneratePose(event: Event) {
        event.stopPropagation();
        const promptInput = this.posePromptText.trim();
        if (!promptInput) return;

        this.isPromptingForPose = false;

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Tính năng này yêu cầu môi trường Desktop (Electron) để lưu ảnh.');
            return;
        }

        try {
            this.isUploadingControlImage = true;
            this.cd.detectChanges();

            const aiPrompt = `Draw a detailed professional storyboard sketch representing EXACTLY this scene/layout: "${promptInput}". 
[MANDATORY: Make it a clear, high-quality storyboard sketch in grayscale or black-and-white. It MUST include details of the environment, background, and specific character poses described in the prompt. CRITICAL: Do NOT draw specific clothing, outfits, or detailed facial features for the characters. Draw all characters as simple 3D mannequins, wooden dummies, or blank base meshes. This is to ensure it only captures the POSE and STRUCTURAL COMPOSITION without polluting the final video's clothing style.]`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                config: {
                    aspectRatio: this.data?.aspectRatio || '16:9',
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

            if (!base64Data) {
                throw new Error('AI did not return any image data.');
            }

            const fileName = `pose_reference_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: base64Data,
                fileName: fileName,
                folder: 'tts',
                username: this.data.username || 'admin'
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.controlImageUrl = finalPath;
                this.toastr.success('Đã tạo ảnh phác thảo thành công!');
            } else {
                throw new Error(result.error || 'Failed to save local file');
            }

        } catch (error: any) {
            console.error('Error generating pose:', error);
            this.toastr.error('Lỗi khi tạo ảnh phác thảo: ' + error.message);
        } finally {
            this.isUploadingControlImage = false;
            this.cd.detectChanges();
        }
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
            controlImageUrl: this.controlImageUrl,
            globalContext: this.globalContext
        });
    }
}
