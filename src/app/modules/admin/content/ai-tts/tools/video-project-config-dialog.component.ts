import { TranslocoModule } from '@jsverse/transloco';
import {
    Component,
    Inject,
    OnInit,
    ChangeDetectorRef,
    ChangeDetectionStrategy,
} from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

import { FormsModule } from '@angular/forms';
import {
    MAT_DIALOG_DATA,
    MatDialogRef,
    MatDialog,
    MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { CharacterDialogComponent } from './character-dialog.component';
import { DirectorModeComponent } from './director-mode.component';
import { GenaiService } from 'app/genai.service';
import { FuseConfirmationService } from '@fuse/services/confirmation/confirmation.service';
import { SwiperDirective } from 'app/swiper.directive';
import type { SwiperOptions } from 'swiper/types';
import { A11y, Mousewheel, Navigation, Pagination } from 'swiper/modules';

@Component({
    selector: 'app-video-project-config-dialog',
    imports: [
        TranslocoModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule,
        MatInputModule,
        MatInputModule,
        MatTooltipModule,
        SwiperDirective,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './video-project-config-dialog.component.html',
})
export class VideoProjectConfigDialogComponent implements OnInit {
    projectData: any;
    isEditingMasterPrompt: boolean = false;
    isGeneratingCharacter: boolean = false;

    public swipe: SwiperOptions = {
        modules: [Navigation, Pagination, A11y, Mousewheel],
        direction: 'horizontal',
        mousewheel: true,
        spaceBetween: 16,
        pagination: { clickable: true, dynamicBullets: true },
        slidesPerView: 'auto',
        observer: true,
        observeParents: true,
    };

    constructor(
        public dialogRef: MatDialogRef<VideoProjectConfigDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private toastr: ToastrService,
        private multiAccountService: MultiAccountService,
        private dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private _genaiService: GenaiService,
        private _fuseConfirmationService: FuseConfirmationService,
        private sanitizer: DomSanitizer,
    ) {
        this.projectData = this.data?.projectData || {};
        if (!this.projectData.characters) {
            this.projectData.characters = [];
        }
    }

    private safeUrlCache: { [url: string]: SafeUrl } = {};
    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        let cleanUrl = url;

        if (
            cleanUrl.startsWith('http') ||
            cleanUrl.startsWith('data:') ||
            cleanUrl.startsWith('blob:')
        ) {
            // do nothing
        } else {
            cleanUrl = cleanUrl.replace(/^unsafe:/, '');
            const originalPath = cleanUrl;

            const mediaDir =
                this.projectData?.mediaDir || this.data?.mediaDir || '';
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
    ngOnInit(): void {}

    close() {
        this.dialogRef.close(this.projectData);
    }

    save() {
        if (this.data.onSave) {
            this.data.onSave(this.projectData);
        }
    }

    isReanalyzingScenes: boolean = false;

    toggleEditMasterPrompt() {
        if (this.isEditingMasterPrompt) {
            this.save();
            this.toastr.success('Đã lưu Master Prompt!');

            const dialogRef = this._fuseConfirmationService.open({
                title: 'Cập nhật bối cảnh cho từng Scene?',
                message:
                    'Bạn có muốn AI tự động phân tích và tạo lại bối cảnh (prompt) riêng cho từng phần của các Scene dựa trên Master Prompt mới này không?',
                icon: {
                    show: true,
                    name: 'heroicons_outline:sparkles',
                    color: 'primary',
                },
                actions: {
                    confirm: {
                        show: true,
                        label: 'Có, tự động tạo',
                        color: 'primary',
                    },
                    cancel: { show: true, label: 'Không, giữ nguyên' },
                },
            });

            dialogRef.afterClosed().subscribe((result) => {
                if (result === 'confirmed') {
                    this.reAnalyzeScenesWithMasterPrompt();
                }
            });
        }
        this.isEditingMasterPrompt = !this.isEditingMasterPrompt;
    }

    async reAnalyzeScenesWithMasterPrompt() {
        if (!this.projectData?.scenes || this.projectData.scenes.length === 0)
            return;

        this.isReanalyzingScenes = true;
        this.cd.detectChanges();

        try {
            const sceneDataToAnalyze = [];
            for (let sIdx = 0; sIdx < this.projectData.scenes.length; sIdx++) {
                const scene = this.projectData.scenes[sIdx];
                if (scene.videos) {
                    for (let vIdx = 0; vIdx < scene.videos.length; vIdx++) {
                        const video = scene.videos[vIdx];
                        sceneDataToAnalyze.push({
                            sceneIdx: sIdx,
                            partIdx: vIdx,
                            voiceText: video.text || '',
                            currentPrompt: video.prompt || '',
                        });
                    }
                }
            }

            if (sceneDataToAnalyze.length === 0) {
                this.isReanalyzingScenes = false;
                return;
            }

            const prompt = `Bạn là một đạo diễn hình ảnh AI chuyên nghiệp.
            
Tôi có một Master Prompt (Cấu hình chung) cho toàn bộ video như sau:
"${this.projectData.masterPrompt}"

Dưới đây là danh sách các phân cảnh (scene) và phần (part) của video:
${JSON.stringify(sceneDataToAnalyze, null, 2)}

Nhiệm vụ của bạn là:
1. Đọc kĩ Master Prompt và nội dung voiceText/currentPrompt của từng phần.
2. Viết lại hoặc tối ưu hóa \`newPrompt\` cho từng phần sao cho nó mang chi tiết bối cảnh, góc máy, ánh sáng, màu sắc phù hợp với tinh thần của Master Prompt nhưng ĐƯỢC CHIA NHỎ và áp dụng một cách hợp lý cho ngữ cảnh của phần đó (dựa vào voiceText). Không nhồi nhét toàn bộ Master Prompt vào từng phần.
3. Chỉ trả về kết quả dưới dạng mảng JSON thuần túy (không bọc trong markdown \`\`\`json), với định dạng:
[
  {
    "sceneIdx": 0,
    "partIdx": 0,
    "newPrompt": "Bối cảnh chi tiết..."
  }
]`;

            const aiRes = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            let text = aiRes?.text || '';
            text = text
                .replace(/```json/gi, '')
                .replace(/```/g, '')
                .trim();

            const jsonStart = text.indexOf('[');
            const jsonEnd = text.lastIndexOf(']');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                text = text.substring(jsonStart, jsonEnd + 1);
            }

            const newPrompts = JSON.parse(text);

            if (Array.isArray(newPrompts)) {
                let updatedCount = 0;
                newPrompts.forEach((item: any) => {
                    if (
                        item.sceneIdx !== undefined &&
                        item.partIdx !== undefined &&
                        item.newPrompt
                    ) {
                        if (
                            this.projectData.scenes[item.sceneIdx]?.videos?.[
                                item.partIdx
                            ]
                        ) {
                            this.projectData.scenes[item.sceneIdx].videos[
                                item.partIdx
                            ].prompt = item.newPrompt;
                            updatedCount++;
                        }
                    }
                });
                this.toastr.success(
                    `Đã cập nhật bối cảnh cho ${updatedCount} phân đoạn!`,
                );
                this.save();
            } else {
                this.toastr.error('AI không trả về đúng định dạng mảng JSON.');
            }
        } catch (error) {
            console.error('Error reanalyzing scenes:', error);
            this.toastr.error('Có lỗi xảy ra khi gọi AI phân tích bối cảnh.');
        } finally {
            this.isReanalyzingScenes = false;
            this.cd.detectChanges();
        }
    }

    openDirectorMode() {
        const dialogRef = this.dialog.open(DirectorModeComponent, {
            data: {
                prompt: this.projectData.masterPrompt,
                controlImageUrl: this.projectData.masterControlImageUrl,
            },
            width: '600px',
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                let promptResult =
                    typeof result === 'string' ? result : result.prompt;

                if (!this.projectData) this.projectData = {};
                let currentPrompt = this.projectData.masterPrompt
                    ? this.projectData.masterPrompt.trim()
                    : '';
                currentPrompt = currentPrompt
                    .replace(/\[(?:Director|Cinematography):.*?\]/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                if (currentPrompt) {
                    this.projectData.masterPrompt =
                        '[Cinematography: ' +
                        promptResult +
                        ']\n\n' +
                        currentPrompt;
                } else {
                    this.projectData.masterPrompt =
                        '[Cinematography: ' + promptResult + ']';
                }

                if (typeof result !== 'string' && result.controlImageUrl) {
                    this.projectData.masterControlImageUrl =
                        result.controlImageUrl;
                }

                this.save();
            }
        });
    }

    async generateCharacterAndOpenDialog() {
        this.isGeneratingCharacter = true;
        this.cd.detectChanges();

        try {
            const prompt = `Từ kịch bản gốc và master prompt sau đây, hãy trích xuất hoặc sáng tạo ra MỘT nhân vật chính/quan trọng nhất chưa có trong danh sách dàn cast hiện tại. 
Yêu cầu trả về định dạng JSON thuần túy (không có markdown \`\`\`json) với cấu trúc:
{
    "role": "Vai trò của nhân vật (ví dụ: Chuyên gia CNTT, Khách hàng, Giám đốc...)",
    "name": "Tên nhân vật (nếu có)",
    "appearance": "Mô tả chi tiết về ngoại hình, độ tuổi, trang phục, kiểu tóc...",
    "personality": "Mô tả tính cách, thái độ, biểu cảm...",
    "prompt": "Câu prompt tạo hình nhân vật (BẰNG TIẾNG VIỆT). YÊU CẦU: Tập trung miêu tả cực kỳ chi tiết ngoại hình, trang phục, màu sắc, chất liệu. Hãy viết theo dạng 'Bản vẽ thiết kế nhân vật (Character design sheet), nhiều góc độ (front, back, side view), chi tiết vật liệu' để ra được hình mẫu chuẩn."
}

Master Prompt:
${this.projectData.masterPrompt || 'Không có'}

Danh sách nhân vật hiện tại:
${this.projectData.characters?.map((c: any) => `- ${c.name || c.role}: ${c.appearance}`).join('\n') || 'Chưa có ai'}

Lưu ý: Chỉ trả về object JSON, không kèm thêm bất kỳ text nào khác.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.7,
                },
            });
            const text = response.text;
            if (text) {
                const jsonMatch =
                    text.match(/```json\n([\s\S]*?)\n```/) ||
                    text.match(/{[\s\S]*}/);
                if (jsonMatch) {
                    const charData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    this.toastr.success(
                        'AI đã trích xuất thành công nhân vật mới!',
                    );
                    this.openCharacterDialog(charData);
                    return;
                }
            }
            this.toastr.error(
                'AI không trả về dữ liệu chuẩn, mở form trống...',
            );
            this.openCharacterDialog();
        } catch (error: any) {
            console.error('Error generating character:', error);
            this.toastr.error('Lỗi AI, đang mở form trống...');
            this.openCharacterDialog();
        } finally {
            this.isGeneratingCharacter = false;
            this.cd.detectChanges();
        }
    }

    openCharacterDialog(char: any = null, index: number = -1) {
        const dialogRef = this.dialog.open(CharacterDialogComponent, {
            width: '600px',
            maxWidth: '98vw',
            height: 'auto',
            maxHeight: '90vh',
            disableClose: true,
            data: {
                char: char,
                index: index,
                masterPrompt: this.projectData?.masterPrompt || '',
                existingCharacters: this.projectData?.characters || [],
                uuid: this.data?.uuid,
                username: this.data?.username || 'anonymous',
                mediaDir: this.data?.mediaDir || '',
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                if (!this.projectData) this.projectData = {};
                if (!this.projectData.characters)
                    this.projectData.characters = [];

                if (index >= 0) {
                    const oldChar = this.projectData.characters[index];
                    const oldPrompt = oldChar?.prompt
                        ? oldChar.prompt.trim()
                        : '';
                    const newPrompt = result.prompt ? result.prompt.trim() : '';
                    const oldName = oldChar?.name ? oldChar.name.trim() : '';
                    const newName = result.name ? result.name.trim() : '';

                    this.projectData.characters[index] = result;
                    let replacedCount = 0;

                    // 1. Tự động tìm và thay thế (Replace) Tên nhân vật cũ bằng Tên mới
                    if (oldName && newName && oldName !== newName) {
                        if (this.projectData.scenes) {
                            // Tạo Regex có boundary \b để thay thế từ nguyên vẹn (an toàn với tiếng Anh, vì prompt video thường là tiếng Anh)
                            // Nếu tên có dấu tiếng Việt, \b có thể hoạt động không hoàn hảo, nhưng prompt AI trả về đa số là tên riêng độc lập
                            // Để an toàn 100% với tên có dấu, ta dùng split join
                            this.projectData.scenes.forEach((scene: any) => {
                                if (
                                    scene.prompt &&
                                    scene.prompt.includes(oldName)
                                ) {
                                    scene.prompt = scene.prompt
                                        .split(oldName)
                                        .join(newName);
                                    replacedCount++;
                                }
                                if (scene.videos) {
                                    scene.videos.forEach((video: any) => {
                                        if (
                                            video.prompt &&
                                            video.prompt.includes(oldName)
                                        ) {
                                            video.prompt = video.prompt
                                                .split(oldName)
                                                .join(newName);
                                            replacedCount++;
                                        }
                                    });
                                }
                            });
                        }
                    }

                    // 2. Tự động tìm và thay thế (Replace) câu prompt tạo hình cũ bằng câu mới ở tất cả mọi nơi
                    if (oldPrompt && newPrompt && oldPrompt !== newPrompt) {
                        // Cập nhật Master Prompt
                        if (
                            this.projectData.masterPrompt &&
                            this.projectData.masterPrompt.includes(oldPrompt)
                        ) {
                            this.projectData.masterPrompt =
                                this.projectData.masterPrompt
                                    .split(oldPrompt)
                                    .join(newPrompt);
                            replacedCount++;
                        }

                        // Cập nhật tất cả các Phân cảnh (Scenes & Videos)
                        if (this.projectData.scenes) {
                            this.projectData.scenes.forEach((scene: any) => {
                                if (
                                    scene.prompt &&
                                    scene.prompt.includes(oldPrompt)
                                ) {
                                    scene.prompt = scene.prompt
                                        .split(oldPrompt)
                                        .join(newPrompt);
                                    replacedCount++;
                                }
                                if (scene.videos) {
                                    scene.videos.forEach((video: any) => {
                                        if (
                                            video.prompt &&
                                            video.prompt.includes(oldPrompt)
                                        ) {
                                            video.prompt = video.prompt
                                                .split(oldPrompt)
                                                .join(newPrompt);
                                            replacedCount++;
                                        }
                                    });
                                }
                            });
                        }
                    }

                    if (replacedCount > 0) {
                        this.toastr.info(
                            `Đã tự động cập nhật tạo hình/tên nhân vật này cho ${replacedCount} đoạn Prompt!`,
                        );
                    }
                } else {
                    this.projectData.characters.push(result);
                }

                if (this.data.uuid) {
                    this.multiAccountService.setItem(
                        `casting_list_${this.data.uuid}`,
                        this.projectData.characters,
                    );
                }
                this.save();

                this.toastr.success(
                    index >= 0
                        ? 'Đã cập nhật nhân vật'
                        : 'Đã thêm nhân vật mới',
                );
            }
        });
    }

    async duplicateCharacter(char: any) {
        if (this.isGeneratingCharacter) return;
        this.isGeneratingCharacter = true;
        this.cd.detectChanges();

        this.toastr.info(
            `Đang dùng AI phân tích cốt truyện để nhân bản "${char.name || char.role}"...`,
            'Hệ thống',
            { timeOut: 3000 },
        );

        try {
            const storyContext = this.projectData.scenes
                ? this.projectData.scenes
                      .map((s: any, idx: number) => {
                          const subsText = s.subtitles
                              ? s.subtitles
                                    .map((sub: any) => sub.text)
                                    .join(' ')
                              : '';
                          return `Cảnh #${idx + 1}: ${s.prompt || ''}\nLời thoại: ${subsText}`;
                      })
                      .join('\n\n')
                : '';

            const prompt = `Bạn là Giám đốc Sáng tạo và Đạo diễn cốt truyện xuất sắc.
Tôi muốn nhân bản nhân vật dưới đây để tạo ra một phiên bản mới phù hợp với diễn biến cốt truyện.
Ví dụ: Nếu phiên bản cũ là "Ông Minh (Quá khứ / nghèo khó / trẻ trung)", phiên bản mới có thể là "Ông Minh (Hiện tại / thành đạt / già hơn)" hoặc thay đổi trang phục, trạng thái cảm xúc để phù hợp với ngữ cảnh câu chuyện.

THÔNG TIN DỰ ÁN:
- Master Prompt: ${this.projectData.masterPrompt || 'Không có'}
- Tóm tắt diễn biến kịch bản/câu thoại:
${storyContext}

NHÂN VẬT GỐC CẦN NHÂN BẢN:
- Tên nhân vật: ${char.name || ''}
- Vai trò: ${char.role || ''}
- Phiên bản hiện tại (Variant): ${char.variant || 'Mặc định'}
- Ngoại hình: ${char.appearance || ''}
- Tính cách: ${char.personality || ''}
- Prompt tạo hình: ${char.prompt || ''}

NHIỆM VỤ CỦA BẠN:
Hãy phân tích kịch bản và nhân vật gốc, sau đó sáng tạo ra MỘT PHIÊN BẢN NHÂN BẢN MỚI của nhân vật này. Phiên bản mới này phải thể hiện sự thay đổi logic (về tuổi tác, trang phục, biểu cảm, trạng thái hoặc hoàn cảnh) để phục vụ cho các phân cảnh khác trong câu chuyện.
Yêu cầu trả về định dạng JSON thuần túy (không có markdown \`\`\`json) với cấu trúc:
{
    "name": "Giữ nguyên tên của nhân vật gốc",
    "role": "Cập nhật vai trò nếu có thay đổi nhỏ, hoặc giữ nguyên",
    "variant": "Tên phiên bản mới ngắn gọn (Ví dụ: 'Hiện tại', 'Sau 5 năm', 'Lúc giàu sang', 'Mặc đồ công sở', 'Lúc tức giận'...)",
    "appearance": "Mô tả chi tiết ngoại hình mới (thay đổi trang phục phù hợp hoàn cảnh mới, tuổi tác nếu có, nhưng phải giữ nét đặc trưng nhận diện)",
    "personality": "Mô tả tính cách/trạng thái cảm xúc mới phù hợp diễn biến mới",
    "prompt": "Câu prompt tạo hình mới (BẰNG TIẾNG VIỆT). YÊU CẦU: Giữ nguyên phong cách của prompt gốc nhưng thay đổi trang phục, tuổi tác hoặc bối cảnh thiết kế phù hợp phiên bản mới."
}

Lưu ý: Chỉ trả về object JSON, không kèm thêm bất kỳ text nào khác.`;

            const response = await this._genaiService.generateContent({
                model: 'gemini-3.6-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: {
                    temperature: 0.7,
                },
            });

            const text = response.text;
            let newChar = null;

            if (text) {
                const jsonMatch =
                    text.match(/```json\n([\s\S]*?)\n```/) ||
                    text.match(/{[\s\S]*}/);
                if (jsonMatch) {
                    const charData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                    newChar = {
                        ...char,
                        avatarUrls: char.avatarUrls ? [...char.avatarUrls] : [],
                        name: charData.name || char.name,
                        role: charData.role || char.role,
                        variant: charData.variant || 'Phiên bản mới',
                        appearance: charData.appearance || char.appearance,
                        personality: charData.personality || char.personality,
                        prompt: charData.prompt || char.prompt,
                    };
                }
            }

            if (!newChar) {
                newChar = {
                    ...char,
                    avatarUrls: char.avatarUrls ? [...char.avatarUrls] : [],
                };
                newChar.variant = newChar.variant
                    ? `${newChar.variant} (Copy)`
                    : 'Phiên bản mới';
            }

            if (!this.projectData.characters) {
                this.projectData.characters = [];
            }
            this.projectData.characters.push(newChar);

            if (this.data.uuid) {
                this.multiAccountService.setItem(
                    `casting_list_${this.data.uuid}`,
                    this.projectData.characters,
                );
            }
            this.save();

            this.toastr.success(
                `Đã dùng AI nhân bản thành công nhân vật: ${newChar.name} (${newChar.variant})`,
            );
        } catch (error: any) {
            console.error('Error duplicating character:', error);
            const fallbackChar = {
                ...char,
                avatarUrls: char.avatarUrls ? [...char.avatarUrls] : [],
            };
            fallbackChar.variant = fallbackChar.variant
                ? `${fallbackChar.variant} (Copy)`
                : 'Phiên bản mới';
            this.projectData.characters.push(fallbackChar);
            if (this.data.uuid) {
                this.multiAccountService.setItem(
                    `casting_list_${this.data.uuid}`,
                    this.projectData.characters,
                );
            }
            this.save();
            this.toastr.warning(
                `Lỗi AI, đã nhân bản bản sao thông thường cho: ${char.name}`,
            );
        } finally {
            this.isGeneratingCharacter = false;
            this.cd.detectChanges();
        }
    }

    removeCharacter(index: number) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Xóa nhân vật',
            message:
                'Bạn có chắc chắn muốn xóa nhân vật này? Các prompt có sử dụng mô tả của nhân vật này sẽ không tự động bị xóa.',
            icon: {
                show: true,
                name: 'heroicons_outline:question-mark-circle',
                color: 'warn',
            },
            actions: {
                confirm: { show: true, label: 'Xóa', color: 'warn' },
                cancel: { show: true, label: 'Hủy' },
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                this.projectData.characters.splice(index, 1);
                if (this.data.uuid) {
                    this.multiAccountService.setItem(
                        `casting_list_${this.data.uuid}`,
                        this.projectData.characters,
                    );
                }
                this.save();
                this.toastr.warning('Đã xóa nhân vật');
            }
        });
    }
}
