import sys
import codecs
import re

src_path = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/director-mode.component.ts'
with codecs.open(src_path, 'r', 'utf8') as f:
    src = f.read()

dst_path = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/edit-scene-prompt-dialog.component.ts'
with codecs.open(dst_path, 'r', 'utf8') as f:
    dst = f.read()

props = """
    // ControlNet UI properties
    isUploadingControlImage: boolean = false;
    savedControlTemplates: any[] = [];
    extractedFrames: string[] = [];
    loadingMessage: string = '';
    isPromptingForPose: boolean = false;
    posePromptText: string = '';
    poseReferenceImageUrl: string | null = null;
    @ViewChild('videoUploadInput') videoUploadInput: any;
    @ViewChild('poseImageInput') poseImageInput: any;
"""

methods = """
    ngOnInit() {
        this.loadSavedControlTemplates();
    }

    loadSavedControlTemplates() {
        const saved = localStorage.getItem('saved_control_templates');
        if (saved) {
            try {
                this.savedControlTemplates = JSON.parse(saved);
            } catch (e) { }
        }
    }

    onPoseReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.poseReferenceImageUrl = URL.createObjectURL(file);
        }
        event.target.value = '';
    }

    removePoseReferenceImage() {
        this.poseReferenceImageUrl = null;
    }

    openPosePrompt(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        this.isPromptingForPose = true;
    }

    async submitGeneratePose(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!this.posePromptText || !this.posePromptText.trim()) {
            this.toastr.warning('Vui lòng nhập mô tả tư thế/bố cục.');
            return;
        }

        const apiKey = this.getGeminiKey();
        if (!apiKey) {
            this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Cần chạy trên ứng dụng Desktop (Electron) để lưu ảnh.');
            return;
        }

        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang vẽ phác thảo...';
        this.cd.markForCheck();

        try {
            let requestParts: any[] = [{ text: "Create a simple, clear skeleton/pose reference sketch for video generation based on this description. " + this.posePromptText }];
            
            if (this.poseReferenceImageUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.poseReferenceImageUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/jpeg'
                        }
                    });
                } catch(e) {
                    console.error("Error reading pose reference image", e);
                }
            }
            
            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ role: 'user', parts: requestParts }],
                config: {
                    aspectRatio: this.selectedAspectRatio,
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
                throw new Error('Không nhận được dữ liệu ảnh từ AI.');
            }

            const fileName = `control_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: base64Data,
                fileName: fileName,
                folder: 'scenes',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\\\/g, '/')}`;
                this.editingScenePrompt.controlImageUrl = finalPath;
                this.isPromptingForPose = false;
                this.toastr.success('Đã tạo ảnh phác thảo thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (err: any) {
            console.error('Lỗi khi AI vẽ phác thảo:', err);
            this.toastr.error('Lỗi tạo ảnh: ' + (err.message || err));
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            this.cd.markForCheck();
        }
    }

    triggerVideoUpload(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        if (this.videoUploadInput) {
            this.videoUploadInput.nativeElement.click();
        }
    }

    async onVideoSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        const electron = (window as any).electron;
        if (!electron || !electron.extractFramesFromVideo) {
            this.toastr.error('Chức năng này chỉ hoạt động trên bản Desktop (Electron).');
            return;
        }

        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang trích xuất khung hình...';
        this.cd.markForCheck();

        try {
            const result = await electron.extractFramesFromVideo({
                videoPath: file.path,
                frameCount: 5,
                folder: 'scenes',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success && result.frames && result.frames.length > 0) {
                this.extractedFrames = result.frames.map((f: string) => `file://${f.replace(/\\\\/g, '/')}`);
                this.toastr.success(`Đã trích xuất ${this.extractedFrames.length} khung hình.`);
            } else {
                throw new Error(result?.error || 'Lỗi không xác định.');
            }
        } catch (err: any) {
            console.error('Extract frames error:', err);
            this.toastr.error('Lỗi trích xuất: ' + (err.message || err));
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            
            if (this.videoUploadInput && this.videoUploadInput.nativeElement) {
                this.videoUploadInput.nativeElement.value = '';
            }
            this.cd.markForCheck();
        }
    }

    selectExtractedFrame(frameUrl: string) {
        this.editingScenePrompt.controlImageUrl = frameUrl;
        this.extractedFrames = [];
    }

    onFramesScroll(event: WheelEvent) {
        event.preventDefault();
        const container = event.currentTarget as HTMLElement;
        container.scrollLeft += event.deltaY;
    }

    async onControlImageSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        const electron = (window as any).electron;
        if (!electron || !electron.uploadLocalFile) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        this.isUploadingControlImage = true;
        this.loadingMessage = 'Đang tải ảnh lên...';
        this.cd.markForCheck();

        try {
            const fileName = `control_${Date.now()}_${file.name}`;
            const result = await electron.uploadLocalFile({
                filePath: file.path,
                fileName: fileName,
                folder: 'scenes',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\\\/g, '/')}`;
                this.editingScenePrompt.controlImageUrl = finalPath;
                this.toastr.success('Tải ảnh bố cục thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (error: any) {
            console.error('Lỗi tải ảnh:', error);
            this.toastr.error('Lỗi tải ảnh: ' + (error.message || error));
        } finally {
            this.isUploadingControlImage = false;
            this.loadingMessage = '';
            event.target.value = '';
            this.cd.markForCheck();
        }
    }

    removeControlImage() {
        this.editingScenePrompt.controlImageUrl = null;
    }

    saveCurrentControlAsTemplate() {
        if (!this.editingScenePrompt.controlImageUrl) return;

        const dialogRef = this.dialog.open(PromptInputDialogComponent, {
            width: '400px',
            data: {
                title: 'Lưu bố cục mẫu',
                placeholder: 'Nhập tên hoặc ghi chú cho bố cục này...'
            }
        });

        dialogRef.afterClosed().subscribe(name => {
            if (name) {
                const newTemplate = {
                    id: Date.now().toString(),
                    imageUrl: this.editingScenePrompt.controlImageUrl,
                    prompt: name
                };
                this.savedControlTemplates.push(newTemplate);
                localStorage.setItem('saved_control_templates', JSON.stringify(this.savedControlTemplates));
                this.toastr.success('Đã lưu bố cục mẫu!');
            }
        });
    }

    deleteControlTemplate(id: string, event: Event) {
        event.stopPropagation();
        this.savedControlTemplates = this.savedControlTemplates.filter(t => t.id !== id);
        localStorage.setItem('saved_control_templates', JSON.stringify(this.savedControlTemplates));
    }

    selectControlTemplate(template: any) {
        this.editingScenePrompt.controlImageUrl = template.imageUrl;
    }
"""

dst = dst.replace("export class EditScenePromptDialogComponent {", "export class EditScenePromptDialogComponent {\n" + props)
dst = dst.replace("    async autoFixVideoPrompt() {", methods + "\n    async autoFixVideoPrompt() {")

if "PromptInputDialogComponent" not in dst:
    import_statement = "import { PromptInputDialogComponent } from 'app/modules/admin/content/ai-tts/tools/prompt-input-dialog.component';\n"
    dst = import_statement + dst

with codecs.open(dst_path, 'w', 'utf8') as f:
    f.write(dst)
