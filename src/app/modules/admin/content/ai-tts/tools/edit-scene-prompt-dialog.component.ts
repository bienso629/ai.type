import { Component, Inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TextFieldModule } from '@angular/cdk/text-field';
import { ToastrService } from 'ngx-toastr';
import { DirectorModeComponent } from './director-mode.component';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';
import { GoogleGenAI } from '@google/genai';
import { GenaiService } from 'app/genai.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';

import { ControlNetDialogComponent } from './controlnet-dialog.component';

@Component({
    selector: 'app-edit-scene-prompt-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatInputModule, TextFieldModule, MatProgressSpinnerModule, MatTooltipModule, MatSelectModule, MatMenuModule],
    templateUrl: './edit-scene-prompt-dialog.component.html'
})
export class EditScenePromptDialogComponent {

    editingScenePrompt: any;
    editingSceneIndex: number;
    editingVideoIndex: number = -1;
    characters: any[] = [];
    masterPrompt: string = '';
    globalContext: any = null;
    previousVideoUrl: string | null = null;
    usePreviousSceneFrame: boolean = false;
    selectedReferenceChars = new Set<any>();

    sliderValue: number = 50;

    isGeneratingImage: boolean = false;
    isGeneratingVideo: boolean = false;

    aiReferenceImageLocalUrl: string | null = null;
    aiReferenceVideoLocalUrl: string | null = null;
    aiReferenceVideoBase64: string | null = null;


    onReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.aiReferenceImageLocalUrl = URL.createObjectURL(file);
            this.generateImage();
        }
        // Reset file input
        event.target.value = '';
    }

    onReferenceVideoSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.aiReferenceVideoLocalUrl = URL.createObjectURL(file);
            const reader = new FileReader();
            reader.onload = (e) => {
                this.aiReferenceVideoBase64 = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        }
        event.target.value = '';
    }

    removeReferenceVideo() {
        this.aiReferenceVideoLocalUrl = null;
        this.aiReferenceVideoBase64 = null;
    }

    selectedAspectRatio: string = '9:16';
    aspectRatios = [
        { value: '16:9', label: '16:9 (Ngang)' },
        { value: '9:16', label: '9:16 (Dọc)' },
        { value: '4:3', label: '4:3' },
        { value: '3:4', label: '3:4' },
        { value: '1:1', label: '1:1 (Vuông)' }
    ];

    getAspectRatioStyle() {
        switch (this.selectedAspectRatio) {
            case '16:9': return { 'width': '384px', 'height': '216px' };
            case '9:16': return { 'width': '216px', 'height': '384px' };
            case '4:3': return { 'width': '320px', 'height': '240px' };
            case '3:4': return { 'width': '240px', 'height': '320px' };
            case '1:1': return { 'width': '288px', 'height': '288px' };
            default: return { 'width': '384px', 'height': '216px' };
        }
    }

    getDialogueForThisPart(): string {
        const scene = this.data.scene;
        if (!scene || !scene.subtitles || !scene.videos) return '';

        let partStartTime = 0;
        if (this.editingVideoIndex >= 0) {
            for (let i = 0; i < this.editingVideoIndex; i++) {
                partStartTime += scene.videos[i].duration || 0;
            }
        }

        const dur = this.editingScenePrompt.duration || 0;
        let partEndTime = dur > 0 ? partStartTime + dur : 99999;

        let dialogueWords: string[] = [];
        let currentSubTime = 0;

        for (const sub of scene.subtitles) {
            let subDuration = 0;
            if (sub.duration) {
                subDuration = sub.duration;
            } else if (sub.text) {
                subDuration = Math.max(1, sub.text.trim().split(/\s+/).length / 4);
            }

            const subStartTime = currentSubTime;
            const subEndTime = currentSubTime + subDuration;

            if (subStartTime < partEndTime && subEndTime > partStartTime) {
                if (sub.text) {
                    const textStr = sub.text.trim();
                    const words = textStr.split(/\s+/);
                    if (subStartTime >= partStartTime && subEndTime <= partEndTime) {
                        dialogueWords.push(...words);
                    } else {
                        const overlapStart = Math.max(0, partStartTime - subStartTime);
                        const overlapEnd = Math.min(subDuration, partEndTime - subStartTime);

                        const startRatio = overlapStart / subDuration;
                        const endRatio = overlapEnd / subDuration;

                        // Use Math.round for both to ensure identical cut points for adjacent parts
                        let startIndex = Math.round(startRatio * words.length);
                        let endIndex = Math.round(endRatio * words.length);

                        const findBestBoundary = (targetIndex: number) => {
                            let bestIdx = targetIndex;
                            let minDistance = 999;
                            let searchRadius = 12; // Adjusted radius

                            for (let i = Math.max(0, targetIndex - searchRadius); i < Math.min(words.length + 1, targetIndex + searchRadius); i++) {
                                if (i > 0 && i <= words.length) {
                                    const dist = Math.abs(i - targetIndex);
                                    if (words[i - 1].match(/[.!?]$/)) {
                                        if (dist - 5 < minDistance) {
                                            bestIdx = i;
                                            minDistance = dist - 5;
                                        }
                                    } else if (words[i - 1].match(/[,;]$/)) {
                                        if (dist < minDistance) {
                                            bestIdx = i;
                                            minDistance = dist;
                                        }
                                    }
                                }
                            }
                            return bestIdx;
                        };

                        let bestStartIndex = startRatio > 0.01 ? findBestBoundary(startIndex) : 0;
                        let bestEndIndex = endRatio < 0.99 ? findBestBoundary(endIndex) : words.length;

                        // Fallback if snapping causes invalid ranges
                        if (bestEndIndex <= bestStartIndex) {
                            bestStartIndex = startIndex;
                            bestEndIndex = endIndex;
                        }

                        dialogueWords.push(...words.slice(bestStartIndex, bestEndIndex));
                    }
                }
            }

            currentSubTime = subEndTime;
        }

        return dialogueWords.join(' ').trim();
    }

    addDialogueToPrompt() {
        let dialogue = this.getDialogueForThisPart();
        if (!dialogue) {
            dialogue = "Nhập lời thoại của bạn vào đây...";
            this.toastr.info('Không tìm thấy lời thoại, đã thêm đoạn mẫu để bạn tự nhập.');
        }

        let speaker = "Tên_nhân_vật";
        if (this.selectedReferenceChars.size === 1) {
            const char = Array.from(this.selectedReferenceChars)[0] as any;
            speaker = char.name || char.role || "Tên_nhân_vật";
        } else if (this.selectedReferenceChars.size > 1) {
            speaker = "Tên_nhân_vật_đang_nói";
        }

        const dialogText = `[${speaker} says: "${dialogue}"]`;
        if (this.editingScenePrompt.prompt) {
            if (this.editingScenePrompt.prompt.includes(dialogText)) {
                this.toastr.info('Lời thoại đã được thêm vào prompt trước đó rồi.');
                return;
            }

            // Check if there are constraints or NOTE at the end, insert before it if possible
            const prompt = this.editingScenePrompt.prompt;
            const noteRegex = /\n*(\(Constraints:|\[NOTE:|\[MANDATORY:)/i;
            const match = prompt.match(noteRegex);

            if (match && match.index !== undefined) {
                const firstPart = prompt.substring(0, match.index).trim();
                const lastPart = prompt.substring(match.index).trim();
                this.editingScenePrompt.prompt = firstPart + '\n\n' + dialogText + '\n\n' + lastPart;
            } else {
                this.editingScenePrompt.prompt += '\n\n' + dialogText;
            }
        } else {
            this.editingScenePrompt.prompt = dialogText;
        }
        this.toastr.success('Đã thêm lời thoại vào Prompt tạo Video!');
    }

    toggleReferenceChar(char: any) {
        if (this.selectedReferenceChars.has(char)) {
            this.selectedReferenceChars.delete(char);

            // Tự động xóa thông tin nhân vật khỏi prompt
            const charName = char.name || char.role;
            if (charName && this.editingScenePrompt.prompt) {
                const escapedName = charName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                const regex = new RegExp(`\\s*\\[Character '${escapedName}'[\\s\\S]*?\\]`, 'g');
                this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(regex, '').trim();
            }
        } else {
            this.selectedReferenceChars.add(char);

            // Tự động chèn thông tin nhân vật vào prompt nếu chưa có
            const charName = char.name || char.role;
            const charToken = `[Character '${charName}'`;

            if (this.editingScenePrompt.prompt) {
                if (!this.editingScenePrompt.prompt.includes(charToken)) {
                    let charDesc = char.appearance ? char.appearance : `Portrait of ${charName}`;
                    this.editingScenePrompt.prompt += `\n\n[Character '${charName}': ${charDesc}]`;
                }
            } else {
                let charDesc = char.appearance ? char.appearance : `Portrait of ${charName}`;
                this.editingScenePrompt.prompt = `[Character '${charName}': ${charDesc}]`;
            }
        }
    }

    isReferenceCharSelected(char: any): boolean {
        return this.selectedReferenceChars.has(char);
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

                // Đảm bảo kích thước tối thiểu và tỷ lệ khung hình an toàn cho Kling V3 (tránh lỗi ConvertImageRequest do server cố tự resize)
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

    constructor(
        @Inject(MAT_DIALOG_DATA) public data: any,
        private dialogRef: MatDialogRef<EditScenePromptDialogComponent>,
        private dialog: MatDialog,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private sanitizer: DomSanitizer
    ) {
        this.editingSceneIndex = data.index;
        this.editingVideoIndex = data.vIdx !== undefined ? data.vIdx : -1;
        this.editingScenePrompt = data.video ? { ...data.video } : { ...data.scene };
        this.selectedAspectRatio = this.editingScenePrompt.aspectRatio || data.projectAspectRatio || '16:9';
        this.characters = data.characters || [];
        this.masterPrompt = data.masterPrompt ? data.masterPrompt.trim() : '';
        this.globalContext = data.globalContext || null;
        this.previousVideoUrl = data.previousVideoUrl || null;
        this.usePreviousSceneFrame = this.editingScenePrompt.usePreviousSceneFrame || false;

        // Không còn dán masterPrompt vào Scene Prompt nữa
        // Theo yêu cầu mới, masterPrompt đã được đưa thẳng vào Character Prompt.

        // Tự động active các nhân vật có tên trong prompt
        if (this.editingScenePrompt.prompt) {
            for (const char of this.characters) {
                const charName = char.name || char.role;
                if (charName && this.editingScenePrompt.prompt.includes(charName)) {
                    this.selectedReferenceChars.add(char);

                    // Tự động chèn thông tin nhân vật vào textarea cho người dùng thấy rõ
                    const charToken = `[Character '${charName}'`;
                    if (!this.editingScenePrompt.prompt.includes(charToken)) {
                        let charDesc = char.appearance ? char.appearance : `Portrait of ${charName}`;
                        this.editingScenePrompt.prompt += `\n\n[Character '${charName}': ${charDesc}]`;
                    }
                }
            }
        }

        // Tự động đồng bộ thời lượng trong prompt nếu có sự lệch hướng khi mở dialog
        if (this.editingScenePrompt.duration && this.editingScenePrompt.prompt) {
            const regex = /(NOTE:\s*This\s*scene\s*is\s*)([\d.]+)(\s*seconds?\s*long)/gi;
            this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(
                regex,
                `$1${this.editingScenePrompt.duration}$3`
            );
        }
    }

    private cacheBuster: number = Date.now();
    private safeUrlCache: { [url: string]: SafeUrl } = {};
    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        let hash = '';
        const hashIndex = cleanUrl.indexOf('#');
        if (hashIndex !== -1) {
            hash = cleanUrl.substring(hashIndex);
            cleanUrl = cleanUrl.substring(0, hashIndex);
        }

        if (cleanUrl.startsWith('http') || cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
            cleanUrl = cleanUrl + hash;
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            // Loại bỏ query string cũ nếu có để tránh lỗi và bỏ prefix file://
            let originalPath = cleanUrl.split('?')[0];
            originalPath = originalPath.replace(/^file:\/{2,3}/i, '');

            const mediaDir = this.data?.mediaDir || '';
            let projectUuid = this.data?.uuid;
            if (!projectUuid) {
                const parts = window.location.href.split('/');
                projectUuid = parts[parts.length - 1];
            }

            cleanUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=${encodeURIComponent(projectUuid || 'default')}&_t=${this.cacheBuster}${hash}`;
        }

        if (this.safeUrlCache[cleanUrl]) return this.safeUrlCache[cleanUrl];

        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(cleanUrl);
        this.safeUrlCache[cleanUrl] = safeUrl;
        return safeUrl;
    }

    private getGeminiKey(): string | null {
        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        const keys = secretKey.map((k: string) => k.trim()).filter((k: string) => k);
        if (keys.length === 0) return null;

        // Random load balancing cho các tính năng render ảnh/video phụ trợ
        return keys[Math.floor(Math.random() * keys.length)];
    }

    getFullImagePrompt(): string {
        // Lấy prompt dành cho ảnh (không có lệnh tạo video)
        let baseText = this.editingScenePrompt.imagePrompt || this.editingScenePrompt.prompt || '';

        // Loại bỏ các thẻ [Character ...] cũ nếu có để tạo lại từ các checkbox hiện tại
        baseText = baseText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();

        let addedChars = [];
        for (const char of this.selectedReferenceChars) {
            let charDesc = char.prompt || char.appearance || '';
            if (this.masterPrompt && charDesc.startsWith(this.masterPrompt.trim())) {
                charDesc = charDesc.substring(this.masterPrompt.trim().length).trim();
            }
            if (charDesc) {
                addedChars.push(`[Character '${char.name}': ${charDesc}]`);
            }
        }

        if (addedChars.length > 0) {
            baseText = addedChars.join('\n') + '\n\n[MANDATORY: Use the provided reference images as the EXACT visual appearance for the characters. Match their face, clothing, and details perfectly.]\n\n' + baseText;
        }

        if (this.masterPrompt) {
            baseText = this.masterPrompt.trim() + '\n\n' + baseText;
        }

        return baseText;
    }

    getFullVideoPrompt(): string {
        // Lấy prompt dành cho video
        let baseText = this.editingScenePrompt.prompt || '';

        // Loại bỏ các thẻ [Character ...] cũ nếu có để tạo lại từ các checkbox hiện tại
        baseText = baseText.replace(/\[Character '[^']+': [^\]]+\]/g, '').trim();

        let addedChars = [];
        for (const char of this.selectedReferenceChars) {
            let charDesc = char.prompt || char.appearance || '';
            if (this.masterPrompt && charDesc.startsWith(this.masterPrompt.trim())) {
                charDesc = charDesc.substring(this.masterPrompt.trim().length).trim();
            }
            if (charDesc) {
                addedChars.push(`[Character '${char.name}': ${charDesc}]`);
            }
        }

        if (addedChars.length > 0) {
            baseText = addedChars.join('\n') + '\n\n[MANDATORY: Use the provided reference images as the EXACT visual appearance for the characters. Match their face, clothing, and details perfectly.]\n\n' + baseText;
        }

        if (this.masterPrompt) {
            baseText = this.masterPrompt.trim() + '\n\n' + baseText;
        }

        return baseText;
    }

    isAutoFixing: boolean = false;


    ngOnInit() {
    }

    openControlNetDialog() {
        let cleanPrompt = this.editingScenePrompt.prompt || '';
        // Bỏ các thẻ hướng dẫn để tránh làm nhiễu AI vẽ khung xương
        cleanPrompt = cleanPrompt.replace(/\[[^\]]+\]/g, '').trim();

        const dialogRef = this.dialog.open(ControlNetDialogComponent, {
            width: '800px',
            maxWidth: '90vw',
            data: {
                projectId: this.data?.uuid,
                mediaDir: this.data?.mediaDir,
                username: this.data?.username,
                controlImageUrl: this.editingScenePrompt.controlImageUrl,
                prompt: cleanPrompt
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result !== undefined && result.controlImageUrl !== undefined) {
                this.editingScenePrompt.controlImageUrl = result.controlImageUrl;

                // Tự động append pose prompt vào video prompt
                if (result.posePromptText) {
                    const currentPrompt = this.editingScenePrompt.prompt || '';
                    if (!currentPrompt.includes(result.posePromptText)) {
                        this.editingScenePrompt.prompt = currentPrompt
                            ? currentPrompt + '\n' + result.posePromptText
                            : result.posePromptText;
                    }
                }

                this.cd.detectChanges();
            }
        });
    }

    async autoFixVideoPrompt() {
        if (!this.editingScenePrompt.imagePrompt || !this.editingScenePrompt.imagePrompt.trim()) {
            this.toastr.warning('Bạn chưa có Prompt Hình ảnh để bù đắp!');
            return;
        }

        if (!this.editingScenePrompt.prompt || !this.editingScenePrompt.prompt.trim()) {
            this.toastr.warning('Bạn chưa có Prompt Video!');
            return;
        }

        const dialogRef = this.dialog.open(PromptInputDialogComponent, {
            width: '500px',
            panelClass: 'dark-theme-dialog',
            data: {
                title: 'Yêu cầu thêm với AI (Tùy chọn)',
                placeholder: 'Ví dụ: Thêm hiệu ứng slow-mo, góc máy kịch tính hơn...'
            }
        });

        const result = await new Promise<any>((resolve) => {
            dialogRef.afterClosed().subscribe((res: any) => resolve(res));
        });

        if (result === null || result === undefined) {
            // Người dùng bấm Cancel
            return;
        }

        const extraInstructions = result.text || '';
        const attachedFile = result.file;

        if (this.isAutoFixing) return;
        this.isAutoFixing = true;
        this.toastr.info('Đang dùng AI tối ưu hóa Prompt Video...', 'Đang xử lý');

        let systemPrompt = `You are an expert AI video generation prompt engineer (for tools like Kling, Runway Gen-3, Dreamina).
Your task is to merge a "Scene/Background Image Prompt" and an "Action/Video Prompt" into ONE single highly detailed, coherent, and visually stunning video prompt.

Image Prompt (Context/Lighting/Setting):
${this.editingScenePrompt.imagePrompt}

Video Prompt (Character/Action/Movement/Constraints):
${this.editingScenePrompt.prompt}

Instructions:
1. Combine them naturally. The environment and lighting from the Image Prompt must set the stage for the action in the Video Prompt.
2. Maintain the exact character constraints, Dialogue tags, NOTE tags, and Constraints tags from the original Video Prompt. DO NOT remove them!
3. Enhance the descriptive language slightly to make the video generation look cinematic, realistic, and beautiful. Keep it in the same language as the input.
4. Output ONLY the final merged prompt, nothing else. No markdown code blocks, no explanations.`;

        if (extraInstructions.trim()) {
            systemPrompt += `\n5. SPECIAL USER REQUEST: ${extraInstructions.trim()} (Please ensure this is incorporated into the final prompt).`;
        }

        const parts: any[] = [{ text: systemPrompt }];

        if (attachedFile) {
            parts.push({
                inlineData: {
                    mimeType: attachedFile.mimeType,
                    data: attachedFile.data
                }
            });
            systemPrompt += `\n(Also referring to the attached image for context)`;
        }

        let finalControlImage = this.editingScenePrompt.controlImageUrl || this.data?.masterControlImageUrl;
        if (finalControlImage) {
            try {
                const base64Data = await this.getBase64FromImageUrl(finalControlImage);
                parts.push({
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Data
                    }
                });
                systemPrompt += `\n[IMPORTANT INSTRUCTION: A ControlNet/Pose Sketch image is attached. This sketch illustrates the exact sequence of actions or movements of the character. Please analyze this sketch and extract the actions chronologically. Incorporate these precise movements into the final Video Prompt to ensure the character's animation matches the sketch.]`;
            } catch (e) {
                console.error("Error reading control image for auto fix", e);
            }
        }

        try {
            let result = await this._genaiService.generateText({
                model: 'gemini-3.5-flash',
                contents: [{ role: 'user', parts: parts }],
                config: {
                    temperature: 0.7
                }
            });

            if (result && result.trim()) {
                result = result.replace(/^```[a-zA-Z]*\n/i, '').replace(/```$/i, '').trim();
                this.editingScenePrompt.prompt = result;
                this.toastr.success('Đã tối ưu xong Prompt Video!');
            } else {
                this.toastr.error('AI không trả về kết quả. Vui lòng thử lại hoặc kiểm tra API Key.');
            }
        } catch (err: any) {
            this.toastr.error('Lỗi khi gọi AI: ' + err.message);
        } finally {
            this.isAutoFixing = false;
        }
    }

    async generateImage() {
        if (!this.editingScenePrompt.prompt) {
            this.toastr.warning('Vui lòng nhập prompt phân cảnh trước khi tạo ảnh!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        const apiKey = this.getGeminiKey();
        if (!apiKey) {
            this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
            return;
        }

        this.isGeneratingImage = true;
        this.cd.markForCheck();

        try {
            // Sử dụng prompt video để AI vẽ ảnh bám sát mô tả của video
            let promptText = this.getFullVideoPrompt();

            if (this.globalContext?.environmentPrompt) {
                promptText += `\n[Global Environment: ${this.globalContext.environmentPrompt}]`;
            }

            const noSplitScreenConstraint = "\n\n[MANDATORY: Generate exactly ONE single, unified frame. Do NOT generate multiple panels, split screens, storyboards, comic strips, collages, or grids. This must be a single cohesive image.]";

            let requestParts: any[] = [{ text: promptText + noSplitScreenConstraint }];

            // Nếu bật kế thừa khung hình cảnh trước
            let usedPreviousFrame = false;
            if (this.usePreviousSceneFrame && this.previousVideoUrl) {
                try {
                    this.toastr.info('Đang trích xuất khung hình từ cảnh trước...', 'Hệ thống');
                    let cleanUrl = this.previousVideoUrl.replace('file://', '');
                    // Nếu là đường dẫn an toàn qua bypassSecurityTrustUrl thì bóc url thực
                    if (typeof cleanUrl !== 'string' && (cleanUrl as any).changingThisBreaksApplicationSecurity) {
                        cleanUrl = (cleanUrl as any).changingThisBreaksApplicationSecurity.replace('file://', '');
                    }

                    const extractResult = await electron.extractLastFrame(cleanUrl);
                    if (extractResult && extractResult.success) {
                        const base64Data = await this.getBase64FromImageUrl('file://' + extractResult.path);
                        requestParts.push({
                            inlineData: {
                                data: base64Data,
                                mimeType: 'image/jpeg'
                            }
                        });
                        usedPreviousFrame = true;

                        // Hiển thị trực quan ảnh nối tiếp trên UI
                        this.editingScenePrompt.imageUrl = 'file://' + extractResult.path;

                        this.toastr.success('Đã trích xuất khung hình nối tiếp thành công!');
                    }
                } catch (e) {
                    console.error('Lỗi khi trích xuất frame từ video trước:', e);
                    this.toastr.error('Lỗi khi trích xuất frame: ' + e);
                }
            }

            // Gắn thêm ảnh tham khảo do người dùng tải lên
            if (this.aiReferenceImageLocalUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.aiReferenceImageLocalUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                    // Reset reference image sau khi đã dùng để tránh dùng lại ở lần generate sau
                    this.aiReferenceImageLocalUrl = null;
                } catch (e) {
                    console.error('Không thể đọc ảnh reference upload', e);
                }
            }

            // Gắn thêm Global Reference Image
            if (this.globalContext?.referenceImageUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.globalContext.referenceImageUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Global Reference Image', e);
                }
            }

            // Gắn thêm control image (Khung xương / Bố cục)
            let finalControlImage = this.editingScenePrompt.controlImageUrl || this.data?.masterControlImageUrl;
            if (finalControlImage) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(finalControlImage);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh control image', e);
                }
            }

            // Gắn thêm ảnh reference của nhân vật vào parts
            for (const char of this.selectedReferenceChars) {
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

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview', // Thay thế bằng model phù hợp của Gemini
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

            const fileName = `scene_${Date.now()}.png`;
            const result = await electron.saveBase64({
                base64: base64Data,
                fileName: fileName,
                folder: 'scenes',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.cacheBuster = Date.now();
                this.editingScenePrompt.imageUrl = finalPath;
                this.toastr.success('Đã tạo Storyboard thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (error: any) {
            console.error('Error generating scene image:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo ảnh AI: ' + errorMsg);
        } finally {
            this.isGeneratingImage = false;
            this.cd.markForCheck();
        }
    }

    async generateVideo() {
        if (!this.editingScenePrompt.prompt) {
            this.toastr.warning('Vui lòng nhập prompt phân cảnh trước khi tạo video!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        this.isGeneratingVideo = true;
        this.cd.markForCheck();

        try {
            let base64 = '';

            const isProxy = this._genaiService.isUModelverseEnabled();
            console.log("generateVideo: UModelverse proxy enabled status =", isProxy, "URL =", this._genaiService.umodelverseUrl);

            // Fetch storyboard image if exists
            let referenceImages: any[] = [];

            if (this.editingScenePrompt.imageUrl && this.isImageType(this.editingScenePrompt.imageUrl)) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.editingScenePrompt.imageUrl);
                    referenceImages.push({
                        image: {
                            imageBytes: base64Data,
                            mimeType: 'image/png'
                        },
                        referenceType: 'START_FRAME'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Storyboard làm reference cho video:', e);
                }
            }

            if (this.aiReferenceVideoBase64) {
                referenceImages.push({
                    image: {
                        imageBytes: this.aiReferenceVideoBase64,
                        mimeType: 'video/mp4'
                    },
                    referenceType: 'REFERENCE_VIDEO'
                });
            }

            // Fetch character reference images if selected
            for (const char of this.selectedReferenceChars) {
                const imgUrl = char.avatarUrl || (char.avatarUrls && char.avatarUrls.length > 0 ? char.avatarUrls[0] : null);
                if (imgUrl) {
                    try {
                        const base64Data = await this.getBase64FromImageUrl(imgUrl);
                        referenceImages.push({
                            image: {
                                imageBytes: base64Data,
                                mimeType: 'image/png'
                            },
                            referenceType: 'CHARACTER_REFERENCE'
                        });
                    } catch (e) {
                        console.error('Không thể đọc ảnh reference cho video:', char.name, e);
                    }
                }
            }

            // Fetch control image riêng của phân cảnh (Khung xương / Bố cục)
            let sceneControlImageVid = this.editingScenePrompt.controlImageUrl;
            if (sceneControlImageVid) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(sceneControlImageVid);
                    referenceImages.push({
                        image: {
                            imageBytes: base64Data,
                            mimeType: 'image/png'
                        },
                        referenceType: 'CONTROL_IMAGE'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh control image của scene cho video:', e);
                }
            }

            // Fetch Master Control Image (Phong cách chung toàn video)
            let masterControlImageVid = this.data?.masterControlImageUrl;
            if (masterControlImageVid && masterControlImageVid !== sceneControlImageVid) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(masterControlImageVid);
                    referenceImages.push({
                        image: {
                            imageBytes: base64Data,
                            mimeType: 'image/png'
                        },
                        referenceType: 'STYLE_REFERENCE'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh master control image cho video:', e);
                }
            }

            // Fetch Global Reference Image (Nhân vật / Phong cách tham chiếu chung)
            if (this.globalContext?.referenceImageUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(this.globalContext.referenceImageUrl);
                    referenceImages.push({
                        image: {
                            imageBytes: base64Data,
                            mimeType: 'image/png'
                        },
                        referenceType: 'CHARACTER_REFERENCE'
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh Global Reference Image cho video:', e);
                }
            }

            let basePrompt = this.getFullVideoPrompt();
            if (this.globalContext?.environmentPrompt) {
                basePrompt += `\n[Global Environment: ${this.globalContext.environmentPrompt}]`;
            }

            let mandatoryTags = '';
            if (this.editingScenePrompt.duration) {
                mandatoryTags += `\n[MANDATORY: Generate video with exact duration of ${this.editingScenePrompt.duration} seconds]`;
            }

            if (referenceImages && referenceImages.length > 0) {
                mandatoryTags += `\n[MANDATORY: Strictly follow layout, skeleton & character references 100%. No hallucinations or extra details.]`;
                const hasControlImage = referenceImages.some(img => img.referenceType === 'CONTROL_IMAGE');
                if (hasControlImage) {
                    mandatoryTags += `\n[CRITICAL INSTRUCTION: The attached reference image is a SKETCH/StoryBoard layout. DO NOT render the video in a sketch, drawing, or wireframe style. Use the image ONLY for pose, composition, and framing. The final video MUST be highly photorealistic and cinematic according to the prompt.]`;
                }
            }

            // Determine model based on aiReferenceVideoBase64 presence
            let overrideModel = undefined;
            if (this.aiReferenceVideoBase64) {
                overrideModel = 'kling-v3-motion-control';
            }

            let finalPrompt = basePrompt + mandatoryTags;
            let byteLength = new TextEncoder().encode(finalPrompt).length;

            if (byteLength > 2500 && isProxy) {
                this.toastr.warning(`Độ dài prompt (${byteLength} bytes) vượt quá giới hạn 2500 của hệ thống. Vui lòng rút gọn kịch bản hoặc Master Prompt.`);
                this.isGeneratingVideo = false;
                this.cd.markForCheck();
                return;
            }

            const seedToUse = this.globalContext?.seed ? this.globalContext.seed : undefined;

            if (isProxy) {
                // Sử dụng Mì Tôm AI (Proxy) để tạo Video
                let modelName = this._genaiService.umodelverseVideoModel || 'cogvideox-5b';

                // Bắt buộc chuyển sang Kling-v3 nếu có đính kèm video mẫu
                if (this.aiReferenceVideoBase64) {
                    modelName = 'kling-v3-motion-control';
                    this.toastr.info('Phát hiện Video Mẫu, tự động chuyển sang model Kling V3 Motion Control.', 'Hệ thống');
                }

                this.toastr.info(`Đang gửi yêu cầu tạo video qua Mì Tôm AI (Base URL: ${this._genaiService.umodelverseUrl}, Model: ${modelName})...`, 'Hệ thống', { timeOut: 5000 });

                base64 = await this._genaiService.generateVideoUModelverse(
                    finalPrompt,
                    this.selectedAspectRatio,
                    referenceImages,
                    this.editingScenePrompt.duration,
                    seedToUse,
                    modelName // Truyền thẳng modelName đã ghi đè vào service
                );
            } else {
                // Chạy trực tiếp qua máy chủ Google bằng SDK chính thức
                const apiKey = this.getGeminiKey();
                if (!apiKey) {
                    this.toastr.error('Thiếu API Key cho AI (Gemini). Vui lòng cấu hình trong Cài đặt.');
                    this.isGeneratingVideo = false;
                    this.cd.markForCheck();
                    return;
                }

                const ai = this._genaiService.googleAi || new GoogleGenAI({ apiKey: apiKey });
                let operation: any;

                const videoConfig: any = {};
                if (this.selectedAspectRatio) {
                    videoConfig.aspectRatio = this.selectedAspectRatio;
                }
                if (referenceImages.length > 0) {
                    videoConfig.referenceImages = referenceImages.slice(0, 3);
                }

                operation = await ai.models.generateVideos({
                    model: 'veo-3.1-generate-preview',
                    prompt: finalPrompt,
                    config: videoConfig
                });

                let pollCount = 0;
                const MAX_POLLS = 60; // 10 minutes max

                while (!operation.done) {
                    if (pollCount >= MAX_POLLS) {
                        throw new Error('Quá thời gian chờ tạo video (10 phút).');
                    }
                    await new Promise(resolve => setTimeout(resolve, 10000));

                    // Refresh operation status
                    operation = await ai.operations.getVideosOperation({
                        operation: operation,
                    });
                    pollCount++;
                }

                if (!operation.response || !operation.response.generatedVideos || operation.response.generatedVideos.length === 0) {
                    throw new Error('Không nhận được video từ AI.');
                }

                const videoInfo = operation.response.generatedVideos[0];
                const videoUri = videoInfo.video.uri;

                if (!videoUri) {
                    throw new Error('Không tìm thấy URI tải video.');
                }

                this.toastr.info('Đang tải video về máy...', 'Hệ thống');

                // Download video using fetch with API key header
                const res = await fetch(videoUri, { headers: { "x-goog-api-key": apiKey } });
                if (!res.ok) throw new Error('Không thể tải file video từ Google.');

                const buffer = await res.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;

                // Optimization for large base64 conversion
                const chunkSize = 8192;
                for (let i = 0; i < len; i += chunkSize) {
                    base64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
                }
                base64 = btoa(base64);
            }

            const fileName = `scene_video_${Date.now()}.mp4`;
            const result = await electron.saveBase64({
                base64: base64,
                fileName: fileName,
                folder: 'scenes_videos',
                username: 'ai_type',
                customDir: `tts/${this.data?.username || 'anonymous'}/${this.data?.uuid || 'default'}`
            });

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\/g, '/')}`;
                this.cacheBuster = Date.now();
                this.editingScenePrompt.videoUrl = finalPath;
                this.toastr.success('Đã tạo và tải Video phân cảnh thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file video.');
            }
        } catch (error: any) {
            console.error('Error generating scene video:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo video AI: ' + errorMsg);
        } finally {
            this.isGeneratingVideo = false;
            this.cd.markForCheck();
        }
    }

    private formatGeminiError(error: any): string {
        let msg = error.message || error.toString() || 'Lỗi không xác định';

        try {
            const match = msg.match(/\{"error":[\s\S]*?\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (parsed.error && parsed.error.message) {
                    msg = parsed.error.message;
                }
            }
        } catch { }

        // Nếu là lỗi của Proxy UModelverse hoặc chứa trace_id / model mismatch, giữ nguyên để hiển thị
        if (
            msg.includes('trace_id') ||
            msg.toLowerCase().includes('model') ||
            msg.toLowerCase().includes('umodelverse') ||
            msg.toLowerCase().includes('support')
        ) {
            return msg;
        }

        if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
            return 'Tài khoản API Key đã hết hạn mức (Quota Exceeded) hoặc bị giới hạn tốc độ. Vui lòng thiết lập thẻ thanh toán trên Google AI Studio hoặc thử lại sau.';
        }
        if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
            return 'Lỗi cấu hình (400): Prompt không hợp lệ hoặc chứa nội dung bị cấm.';
        }
        if (msg.includes('500') || msg.includes('INTERNAL')) {
            return 'Lỗi máy chủ Google (500). Hệ thống AI đang gặp sự cố, vui lòng thử lại sau.';
        }
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            return 'Lỗi mạng, không thể kết nối tới Google AI.';
        }

        return msg;
    }

    async onUsePreviousFrameChange(checked: boolean) {
        const constraintMsg = '\n\n[MANDATORY: Seamless continuous motion from previous frame. NO teleportation. NO cuts.]';
        if (checked && this.previousVideoUrl) {
            try {
                this.toastr.info('Đang trích xuất khung hình từ cảnh trước...', 'Hệ thống');
                let cleanUrl = this.previousVideoUrl.replace('file://', '');
                if (typeof cleanUrl !== 'string' && (cleanUrl as any).changingThisBreaksApplicationSecurity) {
                    cleanUrl = (cleanUrl as any).changingThisBreaksApplicationSecurity.replace('file://', '');
                }

                // @ts-ignore
                const extractResult = await electron.extractLastFrame(cleanUrl);
                if (extractResult && extractResult.success) {
                    let finalUrl = '';
                    if (extractResult.base64) {
                        // Trình xử lý IPC trả về base64 trực tiếp
                        finalUrl = 'data:image/png;base64,' + extractResult.base64;
                    } else if (extractResult.path) {
                        // Trình xử lý IPC trả về đường dẫn file
                        let properPath = extractResult.path.replace(/\\/g, '/');
                        if (!properPath.startsWith('/')) properPath = '/' + properPath;
                        finalUrl = 'file://' + properPath;
                    }

                    if (finalUrl) {
                        this.editingScenePrompt.imageUrl = finalUrl;
                        if (this.editingScenePrompt.prompt && !this.editingScenePrompt.prompt.includes('Seamless continuous motion from previous frame')) {
                            this.editingScenePrompt.prompt += constraintMsg;
                        } else if (!this.editingScenePrompt.prompt) {
                            this.editingScenePrompt.prompt = constraintMsg.trim();
                        }
                        this.cd.markForCheck();
                        this.toastr.success('Đã trích xuất và gán khung hình nối tiếp thành công!');
                    } else {
                        throw new Error('Kết quả trích xuất không chứa ảnh hoặc đường dẫn hợp lệ.');
                    }
                } else {
                    this.toastr.error('Không thể trích xuất khung hình từ video trước.');
                    this.usePreviousSceneFrame = false;
                    this.cd.markForCheck();
                }
            } catch (e) {
                console.error('Lỗi trích xuất frame:', e);
                this.toastr.error('Lỗi khi trích xuất khung hình: ' + e);
                this.usePreviousSceneFrame = false;
                this.cd.markForCheck();
            }
        } else {
            // Khi bỏ check, xoá ảnh kế thừa đi (nếu đó là ảnh last_frame)
            if (this.editingScenePrompt.imageUrl && this.editingScenePrompt.imageUrl.includes('_last_frame.jpg')) {
                this.editingScenePrompt.imageUrl = null;
            }
            if (this.editingScenePrompt.prompt && this.editingScenePrompt.prompt.includes('Seamless continuous motion from previous frame')) {
                this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(constraintMsg, '').replace(constraintMsg.trim(), '').trim();
            }
            this.cd.markForCheck();
        }
    }

    onDurationChanged(newDuration: number) {
        if (!this.editingScenePrompt) return;
        this.editingScenePrompt.duration = newDuration;

        if (this.editingScenePrompt.prompt && newDuration !== null && newDuration !== undefined) {
            const regex = /(NOTE:\s*This\s*scene\s*is\s*)([\d.]+)(\s*seconds?\s*long)/gi;
            this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(
                regex,
                `$1${newDuration}$3`
            );
        }
    }

    addCharToScenePrompt(char: any) {
        if (!this.editingScenePrompt) return;

        const currentPrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
        let charDesc = char.appearance ? char.appearance : char.prompt;
        if (!charDesc) return;

        if (charDesc.toLowerCase().startsWith('mặc ') || charDesc.toLowerCase().startsWith('đang mặc ')) {
            charDesc = charDesc.charAt(0).toLowerCase() + charDesc.slice(1);
        }

        const textToInsert = `${char.name || char.role}: ${charDesc}`;

        if (currentPrompt) {
            if (currentPrompt.includes(charDesc) || currentPrompt.includes(textToInsert)) {
                this.toastr.info('Nhân vật này đã có trong phân cảnh rồi.');
                return;
            }

            let insertIndex = currentPrompt.length;
            const constraintsMatch = currentPrompt.match(/\n*(\(Constraints:|\[BẮT BUỘC:)/i);
            if (constraintsMatch && constraintsMatch.index !== undefined) {
                insertIndex = constraintsMatch.index;
            }

            if (insertIndex < currentPrompt.length) {
                const firstPart = currentPrompt.substring(0, insertIndex).trim();
                const lastPart = currentPrompt.substring(insertIndex).trim();
                const separator = firstPart.endsWith(',') || firstPart.endsWith('.') ? '\n\n' : '.\n\n';
                this.editingScenePrompt.prompt = firstPart + separator + textToInsert + '\n\n' + lastPart;
            } else {
                const separator = currentPrompt.endsWith(',') || currentPrompt.endsWith('.') ? '\n\n' : '.\n\n';
                this.editingScenePrompt.prompt = currentPrompt + separator + textToInsert;
            }
        } else {
            this.editingScenePrompt.prompt = textToInsert;
        }

        this.toastr.success(`Đã thêm nhân vật "${char.name || char.role}" vào phân cảnh!`);
    }

    openDirectorModeForScene() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '650px',
            maxWidth: '95vw',
            panelClass: 'dark-theme-dialog',
            data: {
                prompt: this.editingScenePrompt?.prompt || '',
                videoPrompt: this.editingScenePrompt?.videoPrompt || '',
                targetName: 'Apply to Scene Prompt',
                controlImageUrl: this.editingScenePrompt?.controlImageUrl || null,
                aspectRatio: this.selectedAspectRatio || '16:9'
            }
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                let promptResult = typeof result === 'string' ? result : result.prompt;

                if (typeof result !== 'string' && result.controlImageUrl !== undefined) {
                    this.editingScenePrompt.controlImageUrl = result.controlImageUrl;
                }

                // 1. Áp dụng cho Video Prompt
                let currentPrompt = this.editingScenePrompt.prompt ? this.editingScenePrompt.prompt.trim() : '';
                currentPrompt = currentPrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentPrompt) {
                    this.editingScenePrompt.prompt = '[Cinematography: ' + promptResult + ']\n\n' + currentPrompt;
                } else {
                    this.editingScenePrompt.prompt = '[Cinematography: ' + promptResult + ']';
                }

                // 2. Áp dụng cho Image Prompt (Blueprint)
                let currentImagePrompt = this.editingScenePrompt.imagePrompt ? this.editingScenePrompt.imagePrompt.trim() : '';
                currentImagePrompt = currentImagePrompt.replace(/\[(?:Director|Cinematography):.*?\]/g, '').replace(/\n{3,}/g, '\n\n').trim();

                if (currentImagePrompt) {
                    this.editingScenePrompt.imagePrompt = '[Cinematography: ' + promptResult + ']\n\n' + currentImagePrompt;
                } else {
                    this.editingScenePrompt.imagePrompt = '[Cinematography: ' + promptResult + ']';
                }

                this.toastr.success('Đã áp dụng thông số Director Mode cho cả Hình Ảnh và Video!');
            }
        });
    }

    removeMedia() {
        this.editingScenePrompt.imageUrl = null;
        this.editingScenePrompt.videoUrl = null;
    }

    isImageType(url: string): boolean {
        if (!url) return false;
        if (url.startsWith('data:image')) return true;

        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg',
        ];
        const cleanUrl = url.replace('file://', '');
        const fileExtension = cleanUrl.split('.').pop()?.toLowerCase();

        if (!url.includes('.') && !url.startsWith('data:')) return true; // Handle paths without extensions just in case
        return fileExtension ? imageExtensions.includes(fileExtension) : true;
    }

    async onImageSelected(event: any) {
        const fileInput = event.target as HTMLInputElement;
        if (fileInput.files && fileInput.files.length > 0) {
            try {
                const electron = (window as any).electron;

                if (!electron || !electron.getPathForFile) {
                    this.toastr.error('Lỗi cấu hình. Tính năng này yêu cầu App Desktop.');
                    return;
                }

                const file = fileInput.files[0];
                const originalPath = electron.getPathForFile(file);

                if (originalPath) {
                    const localFilePath = await electron.selectLocalFile(originalPath);
                    const finalPath = localFilePath.startsWith('file://') ? localFilePath : `file://${localFilePath}`;
                    this.cacheBuster = Date.now();
                    this.editingScenePrompt.imageUrl = finalPath;
                }

                this.toastr.success('Đã tải ảnh Storyboard thành công!');
            } catch (error) {
                console.error('Process error:', error);
                this.toastr.error('Có lỗi xảy ra: ' + error);
            }
        }
    }

    copyPrompt(text: string) {
        if (!text) {
            this.toastr.warning('Không có nội dung để copy.');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            this.toastr.success('Đã copy Prompt phân cảnh (bao gồm Master Prompt & Nhân vật)!');
        }).catch(err => {
            console.error('Lỗi khi copy:', err);
            this.toastr.error('Lỗi khi copy!');
        });
    }

    async generateKlingFromTrimmed() {
        if (!this.data || !this.data.video || !this.data.video.videoUrl) {
            this.toastr.warning('Video này không hợp lệ để tạo Kling Motion Control.');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.invoke) {
            this.toastr.error('Lỗi cấu hình. Yêu cầu App Desktop (Electron).');
            return;
        }

        this.isGeneratingVideo = true;
        this.cd.markForCheck();

        try {
            this.toastr.info('Đang trích xuất đoạn video làm mẫu...', 'Hệ thống');

            // 1. Trích xuất video
            const payload = {
                videoUrl: this.data.video.videoUrl,
                trimStart: this.data.video.trimStart || 0,
                duration: this.data.video.duration || 5
            };

            const extractResult = await electron.invoke('trim-video', payload);
            if (!extractResult || !extractResult.success) {
                throw new Error(extractResult?.error || 'Lỗi trích xuất video');
            }

            // 2. Lấy Base64 của video đã cắt
            const originalPath = extractResult.path.replace(/\\/g, '/');
            const localVideoPath = 'file://' + originalPath;
            
            const mediaDir = this.data?.mediaDir || '';
            const projectUuid = this.data?.uuid || 'default';
            // Gọi media://SMART_FIND/ để lách qua CORS và Local File Restriction của browser
            const fetchUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=${encodeURIComponent(mediaDir)}&uuid=${encodeURIComponent(projectUuid)}`;
            
            const res = await fetch(fetchUrl);
            const blob = await res.blob();
            
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onloadend = () => {
                    const base64data = (reader.result as string).split(',')[1];
                    resolve(base64data);
                };
                reader.onerror = reject;
            });
            reader.readAsDataURL(blob);
            
            const base64Video = await base64Promise;

            // 3. Gán vào aiReferenceVideoBase64 và aiReferenceVideoLocalUrl để generateVideo sử dụng
            this.aiReferenceVideoBase64 = base64Video;
            this.aiReferenceVideoLocalUrl = localVideoPath;

            this.toastr.success('Trích xuất thành công, bắt đầu gửi tới Kling...');

            // 4. Gọi generateVideo (generateVideo sẽ bắt cờ aiReferenceVideoBase64 và tự dùng Kling v3)
            await this.generateVideo();

            // 5. Nếu tạo thành công, video mới tạo ra đã là bản ngắn, cần reset trimStart về 0
            if (this.editingScenePrompt && this.editingScenePrompt.videoUrl) {
                this.editingScenePrompt.trimStart = 0;
            }

        } catch (e: any) {
            console.error('Error generating from trimmed video:', e);
            this.toastr.error('Lỗi khi tạo từ video cắt: ' + (e.message || e));
            this.isGeneratingVideo = false;
            this.cd.markForCheck();
        }
    }

    save() {
        if (this.editingScenePrompt) {
            this.editingScenePrompt.aspectRatio = this.selectedAspectRatio;
            this.editingScenePrompt.usePreviousSceneFrame = this.usePreviousSceneFrame;
            // Đảm bảo đồng bộ thời lượng trong prompt một lần nữa trước khi lưu
            if (this.editingScenePrompt.duration && this.editingScenePrompt.prompt) {
                const regex = /(NOTE:\s*This\s*scene\s*is\s*)([\d.]+)(\s*seconds?\s*long)/gi;
                this.editingScenePrompt.prompt = this.editingScenePrompt.prompt.replace(
                    regex,
                    `$1${this.editingScenePrompt.duration}$3`
                );
            }
        }
        this.dialogRef.close(this.editingScenePrompt);
    }
}

@Component({
    selector: 'app-prompt-input-dialog',
    standalone: true,
    imports: [CommonModule, FormsModule, MatButtonModule, MatInputModule, TextFieldModule, MatIconModule, MatTooltipModule],
    template: `
        <h2 class="text-lg font-semibold mb-4 text-slate-800">{{data.title}}</h2>
        <mat-form-field class="custom-textarea fuse-mat-dense w-full fuse-mat-emphasized-affix" [subscriptSizing]="'dynamic'">
            <textarea matInput [(ngModel)]="value" [placeholder]="data.placeholder" cdkTextareaAutosize cdkAutosizeMinRows="3"></textarea>
        </mat-form-field>
        
        <div class="flex justify-between items-center mt-4">
            <div class="flex items-center gap-2 overflow-hidden mr-2">
                <button mat-icon-button class="text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors rounded-full flex-shrink-0" matTooltip="Đính kèm ảnh/tài liệu" (click)="fileInput.click()">
                    <mat-icon class="icon-size-5">attach_file</mat-icon>
                </button>
                <input #fileInput type="file" class="hidden" (change)="onFileSelected($event)">
                
                <div *ngIf="attachedFile" class="flex items-center gap-1 overflow-hidden bg-slate-50 rounded-full px-3 py-1 pr-1">
                    <span class="text-sm text-slate-700 truncate max-w-[200px]" [matTooltip]="attachedFileName">{{attachedFileName}}</span>
                    <button mat-icon-button class="text-red-500 hover:bg-red-50 icon-size-6 flex-shrink-0" (click)="removeFile()">
                        <mat-icon class="icon-size-4">close</mat-icon>
                    </button>
                </div>
            </div>
            <div class="flex gap-2 flex-shrink-0">
                <button mat-button (click)="dialogRef.close(null)">Hủy</button>
                <button mat-flat-button color="primary" (click)="submit()">Đồng ý</button>
            </div>
        </div>
    `
})
export class PromptInputDialogComponent {
    value: string = '';
    attachedFile: { mimeType: string, data: string } | null = null;
    attachedFileName: string = '';

    constructor(
        public dialogRef: MatDialogRef<PromptInputDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) { }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        this.attachedFileName = file.name;
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(',')[1];
            this.attachedFile = {
                mimeType: file.type,
                data: base64Data
            };
        };
        reader.readAsDataURL(file);

        event.target.value = '';
    }

    removeFile() {
        this.attachedFile = null;
        this.attachedFileName = '';
    }

    submit() {
        this.dialogRef.close({
            text: this.value || '',
            file: this.attachedFile
        });
    }
}
