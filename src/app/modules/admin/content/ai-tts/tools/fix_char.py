import sys

file_path = 'c:/Users/Wing386/ai.type/src/app/modules/admin/content/ai-tts/tools/character-dialog.component.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

missing_code = """            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                resolve(dataURL.replace(/^data:image\\/(png|jpg|jpeg);base64,/, ""));
            };
            img.onerror = error => reject(error);
            img.src = finalUrl;
        });
    }

    cleanName(name: string) {
        if (!name) return '';
        return name.trim().toLowerCase()
            .normalize('NFD')
            .replace(/[\\u0300-\\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[^a-z0-9]/g, '');
    }

    availableReferenceImages: { url: string, name: string, variant: string }[] = [];

    updateAvailableReferenceImages() {
        const existingChars = this.data.existingCharacters || [];
        const result: { url: string, name: string, variant: string }[] = [];
        const seenUrls = new Set<string>();
        
        existingChars.forEach((c: any, idx: number) => {
            // Include all characters except the current one being edited
            if (idx !== this.data.index || c.variant !== this.editingChar.variant) {
                if (c.avatarUrls && c.avatarUrls.length > 0) {
                    c.avatarUrls.forEach((url: string) => {
                        if (!seenUrls.has(url)) {
                            result.push({ url, name: c.name || 'Vô danh', variant: c.variant || 'Gốc' });
                            seenUrls.add(url);
                        }
                    });
                } else if (c.avatarUrl && !seenUrls.has(c.avatarUrl)) {
                    result.push({ url: c.avatarUrl, name: c.name || 'Vô danh', variant: c.variant || 'Gốc' });
                    seenUrls.add(c.avatarUrl);
                }
            }
        });

        // Ưu tiên đưa các ảnh có cùng tên nhân vật lên đầu
        const cleanNameStr = this.cleanName(this.editingChar.name);
        if (cleanNameStr) {
            result.sort((a, b) => {
                const aMatch = this.cleanName(a.name) === cleanNameStr ? -1 : 1;
                const bMatch = this.cleanName(b.name) === cleanNameStr ? -1 : 1;
                return aMatch - bMatch;
            });
        }
        
        this.availableReferenceImages = result;
        
        // If the current reference image is not in the list anymore, clear it
        if (this.referenceImageUrl && !result.find(img => img.url === this.referenceImageUrl)) {
            this.referenceImageUrl = null;
        }
    }

    onReferenceImageSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            this.referenceImageUrl = URL.createObjectURL(file);
            this.generateAvatar();
        }
        event.target.value = '';
    }

    async generateAvatar() {
        if (!this.editingChar.prompt && !this.editingChar.appearance) {
            this.toastr.warning('Vui lòng điền Prompt Tạo hình hoặc Ngoại hình trước khi tạo ảnh!');
            return;
        }

        const electron = (window as any).electron;
        if (!electron || !electron.saveBase64) {
            this.toastr.error('Lỗi cấu hình. Tính năng này yêu cầu App Desktop (Electron).');
            return;
        }

        const settings = this.multiAccountService.getItem('settings');
        let secretKey;
        try {
            secretKey = settings.secretKey ? settings.secretKey.split(';') : undefined;
        } catch { }

        const keys = secretKey.map((k: string) => k.trim()).filter((k: string) => k);
        if (keys.length === 0) {
            this.toastr.warning('Bạn chưa cung cấp API Key hợp lệ.');
            return;
        }
        
        const apiKey = keys[Math.floor(Math.random() * keys.length)];

        this.isGeneratingAvatar = true;
        this.cd.markForCheck();

        try {
            // Build the prompt
            let promptPartsText = [];
            if (this.editingChar.name || this.editingChar.role) promptPartsText.push(`Subject: ${this.editingChar.name || this.editingChar.role}`);
            if (this.editingChar.appearance) promptPartsText.push(`Appearance: ${this.editingChar.appearance}`);
            if (this.editingChar.personality) promptPartsText.push(`Personality/Expression: ${this.editingChar.personality}`);
            if (this.editingChar.prompt) promptPartsText.push(`Style/Additional Prompt: ${this.editingChar.prompt}`);
            
            let finalPrompt = promptPartsText.join('\\n');
            
            // Lấy phong cách visual từ master prompt (master prompt quy định style toàn bộ project)
            if (this.masterPrompt && this.masterPrompt.trim()) {
                finalPrompt += `\\n\\n[VISUAL STYLE FROM PROJECT: ${this.masterPrompt.trim()}]\\n[IMPORTANT: The character avatar MUST strictly follow the visual style described above. Match the same art style, rendering technique, and aesthetic.]`;
            }
            
            finalPrompt += '\\n\\n[MANDATORY: Generate a professional "Character Reference Sheet" showing the character from multiple angles (front, side, back) on a single cohesive canvas. Neutral background.]';

            let requestParts: any[] = [{ text: finalPrompt }];

            let refImgUrl = null;

            const targetCleanName = this.cleanName(this.editingChar.name);

            // Thứ tự ưu tiên nạp ảnh tham chiếu (đồng bộ gương mặt):
            // 0. Ưu tiên cao nhất: Ảnh do người dùng chủ động đính kèm vào phần Prompt
            if (this.referenceImageUrl) {
                refImgUrl = this.referenceImageUrl;
            }
            // 1. Ưu tiên 1: Lấy ảnh hiện tại đang hoạt động của chính nhân vật này (nếu đã có ảnh trước đó và muốn tạo tư thế mới)
            else if (this.editingChar.avatarUrl) {
                refImgUrl = this.editingChar.avatarUrl;
            } else if (this.editingChar.avatarUrls && this.editingChar.avatarUrls.length > 0) {
                refImgUrl = this.editingChar.avatarUrls[0];
            } 
            // 2. Ưu tiên 2: Nếu chưa có ảnh, tìm nhân vật gốc cùng tên để đồng bộ gương mặt chéo giữa các phiên bản
            else {
                const existingChars = this.data.existingCharacters || [];
                const originalChar = existingChars.find((c: any, idx: number) => 
                    c.name && this.editingChar.name &&
                    this.cleanName(c.name) === targetCleanName && 
                    (c.avatarUrl || (c.avatarUrls && c.avatarUrls.length > 0)) &&
                    idx !== this.data.index &&
                    c.variant !== this.editingChar.variant
                );

                if (originalChar) {
                    refImgUrl = originalChar.avatarUrl || (originalChar.avatarUrls && originalChar.avatarUrls.length > 0 ? originalChar.avatarUrls[0] : null);
                    if (refImgUrl) {
                        this.toastr.info(`Đã tìm thấy phiên bản "${originalChar.variant || 'gốc'}" của ${this.editingChar.name}, đang tự động đồng bộ gương mặt nhân vật...`, 'Đồng bộ khuôn mặt');
                    }
                }
            }

            if (refImgUrl) {
                try {
                    const base64Data = await this.getBase64FromImageUrl(refImgUrl);
                    requestParts.push({
                        inlineData: {
                            data: base64Data,
                            mimeType: 'image/png'
                        }
                    });
                } catch (e) {
                    console.error('Không thể đọc ảnh gốc làm reference để đồng bộ:', e);
                }
            }

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.1-flash-image-preview',
                contents: [{ role: 'user', parts: requestParts }],
                config: {
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

            const fileName = `avatar_${this.editingChar.name || 'char'}_${Date.now()}.png`.replace(/[^a-zA-Z0-9_.]/g, '');
            const uuid = this.data?.uuid;
            const username = this.data?.username || 'anonymous';
            const saveParams: any = {
                base64: base64Data,
                fileName: fileName
            };
            if (uuid) {
                saveParams.customDir = `tts/${username}/${uuid}`;
            } else {
                saveParams.folder = 'avatars';
                saveParams.username = username;
            }

            const result = await electron.saveBase64(saveParams);

            if (result && result.success) {
                const finalPath = `file://${result.path.replace(/\\\\/g, '/')}`;
                if (!this.editingChar.avatarUrls) {
                    this.editingChar.avatarUrls = [];
                }
                this.editingChar.avatarUrls.push(finalPath);
                
                if (this.editingChar.avatarUrls.length === 1) {
                    this.editingChar.avatarUrl = this.editingChar.avatarUrls[0];
                }
                
                this.toastr.success('Đã tạo ảnh nhân vật thành công!');
            } else {
                throw new Error(result.error || 'Lỗi lưu file.');
            }
        } catch (error: any) {
            console.error('Error generating avatar:', error);
            const errorMsg = this.formatGeminiError(error);
            this.toastr.error('Lỗi tạo ảnh AI: ' + errorMsg);
        } finally {
            this.isGeneratingAvatar = false;
            this.referenceImageUrl = null;
            this.cd.markForCheck();
        }
    }

    private formatGeminiError(error: any): string {
        let msg = error.message || error.toString() || 'Lỗi không xác định';
"""

p1 = content.find('const img = new Image();')
p2 = content.find('        try {\n            const match = msg.match(/\{\"error\":.*\}/);')

if p1 != -1 and p2 != -1 and p1 < p2:
    new_content = content[:p1 + len('const img = new Image();\n')] + missing_code + content[p2:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Patched successfully!')
else:
    print('Failed to find markers!', p1, p2)
