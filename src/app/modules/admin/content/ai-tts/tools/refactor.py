import os
import re

dir_ts = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/director-mode.component.ts'
dir_html = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/director-mode.component.html'
edit_ts = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/edit-scene-prompt-dialog.component.ts'
edit_html = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/edit-scene-prompt-dialog.component.html'

with open(dir_ts, 'r', encoding='utf-8') as f:
    dts = f.read()

with open(dir_html, 'r', encoding='utf-8') as f:
    dhtml = f.read()

with open(edit_ts, 'r', encoding='utf-8') as f:
    ets = f.read()

with open(edit_html, 'r', encoding='utf-8') as f:
    ehtml = f.read()

# 1. Update director-mode.component.ts
# Remove ControlTemplate interface
dts = re.sub(r'export interface ControlTemplate \{[\s\S]*?\}\n\n', '', dts)
# Remove variables
dts = re.sub(r"    activeTab: 'camera' \| 'controlnet' \| 'context' = 'camera';\n", "    activeTab: 'camera' | 'context' = 'camera';\n", dts)
dts = re.sub(r"    controlImageUrl: string \| null = null;\n    isUploadingControlImage: boolean = false;\n\n    savedControlTemplates: ControlTemplate\[\] = \[\];\n    isPromptingForSaveTemplate: boolean = false;\n    saveTemplateName: string = '';\n    \n    // Video extraction\n    @ViewChild\('videoUploadInput'\) videoUploadInput!: ElementRef<HTMLInputElement>;\n    extractedFrames: string\[\] = \[\];\n    loadingMessage: string = '';\n", "", dts)
# Remove methods
dts = re.sub(r"        // Khôi phục lại các khung hình đã trích xuất từ lần mở trước[\s\S]*?console\.error\('Lỗi khi tải cache frames:', e\);\n        }\n", "", dts)
dts = re.sub(r"    clearExtractedFrames\(\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    loadControlTemplates\(\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    saveCurrentControlAsTemplate\(\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    deleteControlTemplate\(id: string, event: Event\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    selectControlTemplate\(template: ControlTemplate\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    async onControlImageSelected\(event: any\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    triggerVideoUpload\(event: Event\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    async onVideoSelected\(event: any\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    onFramesScroll\(event: WheelEvent\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    async selectExtractedFrame\(frameUrl: string\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    isPromptingForPose: boolean = false;\n    posePromptText: string = '';\n    poseReferenceImageUrl: string \| null = null;\n\n", "", dts)
dts = re.sub(r"    onPoseReferenceImageSelected\(event: any\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    removePoseReferenceImage\(\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    openPosePrompt\(event: Event\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    async submitGeneratePose\(event: Event\) \{[\s\S]*?\}\n\n", "", dts)
dts = re.sub(r"    removeControlImage\(\) \{[\s\S]*?\}\n\n", "", dts)
# Update constructor assignment
dts = re.sub(r"            if \(data\.controlImageUrl\) \{\n                this\.controlImageUrl = data\.controlImageUrl;\n            \}\n", "", dts)
dts = re.sub(r"        this\.dialogRef\.close\(\{ \n            prompt: finalPrompt, \n            controlImageUrl: this\.controlImageUrl,\n            globalContext: this\.globalContext\n        \}\);\n", "        this.dialogRef.close({ \n            prompt: finalPrompt, \n            globalContext: this.globalContext\n        });\n", dts)

# Remove `this.loadControlTemplates();`
dts = dts.replace("        this.loadControlTemplates();\n", "")
dts = dts.replace("    @ViewChild('videoUploadInput') videoUploadInput!: ElementRef<HTMLInputElement>;\n", "")

with open(dir_ts, 'w', encoding='utf-8') as f:
    f.write(dts)

# 2. Update director-mode.component.html
dhtml = re.sub(r"            <h2 class=\"text-\[16px\] font-medium m-0 cursor-pointer transition-all duration-200\"\n                \[ngClass\]=\"activeTab === 'controlnet' \? 'text-indigo-600 border-b-2 border-indigo-600 pb-2 -mb-\[10px\]' : 'text-gray-500 hover:text-gray-700'\"\n                \(click\)=\"activeTab = 'controlnet'\"\>Khung xương & Bố cục</h2>\n", "", dhtml)
# Remove the controlnet tab content
dhtml = re.sub(r"        <!-- Tab ControlNet -->\n        <div \*ngIf=\"activeTab === 'controlnet'\" class=\"flex flex-col gap-4 py-4 min-h-\[300px\]\">\n[\s\S]*?        </div>\n        <!-- Tab Context & Seed -->", "        <!-- Tab Context & Seed -->", dhtml)

with open(dir_html, 'w', encoding='utf-8') as f:
    f.write(dhtml)

# 3. Update edit-scene-prompt-dialog.component.ts
ets_import = "import { ViewChild, ElementRef } from '@angular/core';\n"
if "ViewChild" not in ets:
    ets = ets.replace("import { Component, Inject, ChangeDetectorRef } from '@angular/core';", "import { Component, Inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';")

ets_interface = """
export interface ControlTemplate {
    id: string;
    prompt: string;
    imageUrl: string;
    createdAt: number;
}
"""
ets = ets.replace("@Component({", ets_interface + "\n@Component({")

ets_vars = """
    isUploadingControlImage: boolean = false;
    loadingMessage: string = '';
    savedControlTemplates: ControlTemplate[] = [];
    extractedFrames: string[] = [];
    isPromptingForPose: boolean = false;
    posePromptText: string = '';
    poseReferenceImageUrl: string | null = null;
    @ViewChild('videoUploadInput') videoUploadInput!: ElementRef<HTMLInputElement>;
"""
ets = ets.replace("    selectedReferenceChars = new Set<any>();\n", "    selectedReferenceChars = new Set<any>();\n" + ets_vars)

ets_init = """
        try {
            const savedFrames = localStorage.getItem('last_extracted_frames');
            if (savedFrames) {
                this.extractedFrames = JSON.parse(savedFrames);
            }
        } catch(e) {
            console.error('Lỗi khi tải cache frames:', e);
        }
        try {
            const saved = localStorage.getItem('saved_control_templates');
            if (saved) {
                this.savedControlTemplates = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Lỗi khi tải bố cục mẫu:', e);
        }
"""
ets = ets.replace("    ngOnInit(): void {\n", "    ngOnInit(): void {\n" + ets_init)

ets_methods = """
    clearExtractedFrames() {
        this.extractedFrames = [];
        localStorage.removeItem('last_extracted_frames');
    }

    saveCurrentControlAsTemplate() {
        if (!this.editingScenePrompt.imageUrl) {
            this.toastr.warning('Vui lòng đảm bảo đã có ảnh bố cục.');
            return;
        }
        
        const promptName = this.posePromptText?.trim() || 'Bố cục tuỳ chỉnh';

        const newTemplate: ControlTemplate = {
            id: 'template_' + Date.now(),
            prompt: promptName,
            imageUrl: this.editingScenePrompt.imageUrl,
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
        this.editingScenePrompt.imageUrl = template.imageUrl;
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
                        this.extractedFrames = result.paths.map((p: string) => p.startsWith('file://') ? p : `file://${p.replace(/\\\\/g, '/')}`);
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
            const cleanUrl = frameUrl.replace('file://', '').replace(/\\\\/g, '/');
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

            this.loadingMessage = 'Đang phân tích bối cảnh và dáng người bằng AI Vision...';
            this.cd.detectChanges();
            
            const visionPrompt = `Analyze this image in EXTREME detail for the purpose of recreating its exact structural composition in a storyboard sketch.
Focus ONLY on:
1. Camera angle and shot type (e.g., medium shot, low angle, wide shot).
2. The environment/background elements and their positions.
3. The exact physical poses, body language, and spatial relationships of all people/characters. Describe where their arms, legs, and heads are positioned, and which direction they are facing.
Do NOT describe colors, clothing style, facial features, or lighting.`;

            const visionResponse = await this._genaiService.generateContent({
                model: 'gemini-1.5-flash',
                contents: [{ 
                    role: 'user', 
                    parts: [
                        { text: visionPrompt },
                        { inlineData: { mimeType: 'image/jpeg', data: base64DataStr } }
                    ] 
                }],
                config: { bypassUModelverse: true } as any
            });
            
            const sceneDescription = visionResponse?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!sceneDescription) throw new Error('Vision AI failed to describe the image.');

            this.loadingMessage = 'Đang vẽ phác thảo chuẩn mực...';
            this.cd.detectChanges();

            const aiPrompt = `Draw a detailed professional storyboard sketch representing EXACTLY this scene layout and character poses:
"${sceneDescription}"

[MANDATORY: Make it a clear, high-quality storyboard sketch in grayscale or black-and-white. It MUST accurately reflect the environment and specific character poses described above. CRITICAL: Do NOT draw specific clothing, outfits, or detailed facial features for the characters. Draw all characters as simple 3D mannequins, wooden dummies, or blank base meshes. This is to ensure it only captures the POSE and STRUCTURAL COMPOSITION.]`;

            const aiResponse = await this._genaiService.generateContent({
                model: 'gemini-1.5-flash',
                contents: [{ role: 'user', parts: [{ text: aiPrompt }] }],
                config: { aspectRatio: this.selectedAspectRatio || '16:9', responseModalities: ['IMAGE'] } as any
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

            if (!newBase64Data) throw new Error('AI did not return any image data.');

            const fileName = `pose_reference_from_video_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: newBase64Data,
                fileName: fileName,
                folder: 'tts',
                username: this.data?.username || 'admin'
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\\\/g, '/')}`;
                this.editingScenePrompt.imageUrl = finalPath;
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

    onPoseReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.poseReferenceImageUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    removePoseReferenceImage() {
        this.poseReferenceImageUrl = null;
    }

    openPosePrompt(event: Event) {
        event.stopPropagation();
        this.isPromptingForPose = true;
        let basePrompt = this.editingScenePrompt.prompt || '';
        basePrompt = basePrompt.replace(/\[(?:Director|Cinematography|MANDATORY):.*?\]/g, '').replace(/\\n{2,}/g, '\\n').trim();
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

            const requestParts: any[] = [{ text: aiPrompt }];
            if (this.poseReferenceImageUrl) {
                const base64Data = this.poseReferenceImageUrl.split(',')[1];
                requestParts.push({
                    inlineData: { data: base64Data, mimeType: 'image/jpeg' }
                });
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-1.5-flash',
                contents: [{ role: 'user', parts: requestParts }],
                config: { aspectRatio: this.selectedAspectRatio || '16:9', responseModalities: ['IMAGE'] } as any
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

            if (!base64Data) throw new Error('AI did not return any image data.');

            const fileName = `pose_reference_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: base64Data,
                fileName: fileName,
                folder: 'tts',
                username: this.data.username || 'admin'
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\\\/g, '/')}`;
                this.editingScenePrompt.imageUrl = finalPath;
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
"""
ets = ets.replace("    autoFixVideoPrompt() {", ets_methods + "\n    autoFixVideoPrompt() {")

with open(edit_ts, 'w', encoding='utf-8') as f:
    f.write(ets)

# 4. Update edit-scene-prompt-dialog.component.html
ehtml_blocks = """
    <!-- Saved Templates Select -->
    <div *ngIf="savedControlTemplates.length > 0" class="flex flex-col gap-2 mt-2">
        <label class="font-semibold text-gray-800 text-sm">Chọn từ bố cục đã lưu:</label>
        <div class="flex flex-wrap gap-2">
            <div *ngFor="let template of savedControlTemplates"
                class="relative w-24 h-24 rounded-lg overflow-hidden border-2 cursor-pointer group hover:border-indigo-500 transition-colors"
                [ngClass]="{'border-indigo-600': editingScenePrompt.imageUrl === template.imageUrl, 'border-gray-200': editingScenePrompt.imageUrl !== template.imageUrl}"
                (click)="selectControlTemplate(template)" [title]="template.prompt">
                <img [src]="getSafeUrl(template.imageUrl)" class="w-full h-full object-cover">
                <div
                    class="absolute bottom-0 inset-x-0 bg-black/60 p-1 text-[10px] text-white truncate text-center">
                    {{ template.prompt }}
                </div>
                <button
                    class="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    (click)="deleteControlTemplate(template.id, $event)" title="Xoá">
                    <mat-icon class="text-[14px] w-[14px] h-[14px] text-white">close</mat-icon>
                </button>
            </div>
        </div>
    </div>

    <!-- Extracted Frames Gallery -->
    <div *ngIf="extractedFrames.length > 0"
        class="flex flex-col gap-2 mt-2 bg-white p-4 rounded-xl border border-gray-200 w-full overflow-hidden">
        <div class="flex justify-between items-center mb-2">
            <label class="font-semibold text-gray-800 text-sm">Khung hình trích xuất từ Video (Chọn 1):</label>
            <button mat-icon-button color="warn" (click)="clearExtractedFrames()" matTooltip="Hủy bỏ">
                <mat-icon>close</mat-icon>
            </button>
        </div>
        <div class="flex overflow-x-auto gap-2 pb-2 w-full scrollbar-hide"
            style="-ms-overflow-style: none; scrollbar-width: none;" (wheel)="onFramesScroll($event)">
            <div *ngFor="let frame of extractedFrames"
                class="flex-shrink-0 relative w-32 h-24 rounded-lg overflow-hidden border-2 cursor-pointer group hover:border-indigo-500 transition-colors border-gray-200"
                (click)="selectExtractedFrame(frame)">
                <img [src]="getSafeUrl(frame)" class="w-full h-full object-cover">
                <div
                    class="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity">
                </div>
            </div>
        </div>
    </div>
"""

ehtml = ehtml.replace("    <!-- Storyboard Area -->", ehtml_blocks + "\n    <!-- Storyboard Area -->")

ehtml = ehtml.replace("""
            <button mat-icon-button
                class="absolute -top-2 -right-2 bg-red-500 text-white shadow-md rounded-full w-6 h-6 min-h-0 min-w-0 p-0 flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                (click)="removeMedia()">
                <mat-icon class="icon-size-4 text-white">close</mat-icon>
            </button>
""", """
            <button mat-icon-button
                class="absolute -top-2 -right-2 bg-red-500 text-white shadow-md rounded-full w-6 h-6 min-h-0 min-w-0 p-0 flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                (click)="removeMedia()">
                <mat-icon class="icon-size-4 text-white">close</mat-icon>
            </button>

            <button mat-mini-fab color="primary"
                class="absolute top-4 right-4 z-10 shadow-md scale-75 origin-top-right hover:scale-90 transition-transform"
                (click)="saveCurrentControlAsTemplate()" matTooltip="Lưu làm bố cục mẫu">
                <mat-icon [svgIcon]="'heroicons_outline:bookmark'"></mat-icon>
            </button>
""")

ehtml_menu = """
                <mat-divider></mat-divider>
                <button mat-menu-item (click)="openPosePrompt($event)">
                    <mat-icon class="text-indigo-500">sparkles</mat-icon>
                    <span>Tạo bản phác thảo bố cục từ Prompt</span>
                </button>
                <button mat-menu-item (click)="triggerVideoUpload($event)">
                    <mat-icon class="text-orange-500">movie</mat-icon>
                    <span>Trích xuất bố cục từ Video</span>
                </button>
"""
ehtml = ehtml.replace("            </mat-menu>\n        </div>\n\n        <input #imageInput", ehtml_menu + "\n            </mat-menu>\n        </div>\n\n        <input #videoUploadInput type=\"file\" class=\"hidden\" accept=\"video/*\" (change)=\"onVideoSelected($event)\">\n        <input #imageInput")

ehtml_pose = """
    <!-- Pose Prompt Box Overlay -->
    <div *ngIf="isPromptingForPose" class="bg-gray-50 border-2 border-indigo-200 rounded-lg p-4 mt-2">
        <p class="text-sm font-semibold text-gray-700 mb-2 w-full">Mô tả tư thế / bố cục bạn muốn tạo phác thảo:</p>
        <textarea [(ngModel)]="posePromptText"
            class="w-full h-32 bg-white rounded-lg p-3 mb-4 text-sm border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
            placeholder="Ví dụ: Góc máy ngang tầm mắt, trung cảnh (Medium Shot). Một kiếm khách đang đứng thủ thế..."></textarea>
        
        <div class="flex gap-2 w-full justify-end items-center">
            <input type="file" #poseImageInput class="hidden" accept="image/*" (change)="onPoseReferenceImageSelected($event)">
            
            <div *ngIf="poseReferenceImageUrl" class="relative mr-auto flex items-center h-full">
                <img [src]="poseReferenceImageUrl" class="h-9 w-9 object-cover rounded shadow border border-gray-300">
                <button mat-icon-button class="absolute -top-2 -right-2 w-5 h-5 min-w-[20px] bg-red-500 text-white flex items-center justify-center rounded-full shadow"
                    (click)="removePoseReferenceImage()">
                    <mat-icon style="font-size: 14px; width: 14px; height: 14px;">close</mat-icon>
                </button>
            </div>
            
            <button *ngIf="!poseReferenceImageUrl" class="mr-auto" mat-icon-button matTooltip="Đính kèm ảnh mẫu" (click)="poseImageInput.click()">
                <mat-icon [svgIcon]="'heroicons_outline:photograph'"></mat-icon>
            </button>

            <button mat-button (click)="isPromptingForPose = false">Hủy</button>
            <button mat-flat-button color="primary" (click)="submitGeneratePose($event)">
                <mat-icon [svgIcon]="'heroicons_outline:sparkles'"></mat-icon>
                <mat-label class="ml-2">Tạo phác thảo</mat-label>
            </button>
        </div>
    </div>
"""
ehtml = ehtml.replace("    <div class=\"grid grid-cols-2 gap-4 mt-2\">", ehtml_pose + "\n    <div class=\"grid grid-cols-2 gap-4 mt-2\">")

# Add spinner when loading control image
ehtml_spinner = """
    <div *ngIf="isUploadingControlImage" class="flex flex-col items-center p-4 bg-gray-50 border border-gray-200 rounded-lg mt-2 mb-2">
        <mat-spinner diameter="30"></mat-spinner>
        <p class="text-sm text-gray-500 mt-2">{{ loadingMessage || 'Đang xử lý...' }}</p>
    </div>
"""
ehtml = ehtml.replace("    <!-- Storyboard Area -->", ehtml_spinner + "\n    <!-- Storyboard Area -->")

with open(edit_html, 'w', encoding='utf-8') as f:
    f.write(ehtml)
