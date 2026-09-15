import { TranslocoModule } from '@jsverse/transloco';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
    Component,
    OnInit,
    ViewChild,
    ElementRef,
    HostListener,
    AfterViewChecked,
    ChangeDetectorRef,
    NgZone,
    OnDestroy,
    ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { TextFieldModule } from '@angular/cdk/text-field';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { AddSceneComponent } from '../add-scene.component';
import { DirectorModeComponent } from '../director-mode.component';
import { CharacterDialogComponent } from '../character-dialog.component';
import { AudioGenerationComponent } from '../audio-generation.component';
import { MagicPromptDialogComponent } from './magic-prompt-dialog.component';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { GenaiService } from 'app/genai.service';
import { ToastrService } from 'ngx-toastr';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { MODEL_HINTS } from './model-hints.constant';
import { UserClientService } from 'app/_services/user';

interface NodeItem {
    id: string;
    type: 'image' | 'video' | 'tts' | 'composition' | 'storyboard';
    title: string;
    subtitle: string;
    x: number;
    y: number;
    inputs: string[];
    outputs: string[];
    data: any;
    baseX?: number;
    baseY?: number;
}

interface NodeConnection {
    id: string;
    fromNode: string;
    fromPort: string;
    toNode: string;
    toPort: string;
    path?: string;
    color?: string;
}

@Component({
    selector: 'app-node-editor',
    providers: [UserClientService],
    imports: [
        MatTooltipModule,
        TranslocoModule,
        CommonModule,
        MatIconModule,
        RouterModule,
        TextFieldModule,
        FormsModule,
        MatButtonModule,
        MatDialogModule,
        MatMenuModule,
        MatAutocompleteModule,
    ],
    templateUrl: './node-editor.component.html',
    styleUrls: ['./node-editor.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    host: {
        class: 'absolute inset-0 flex flex-col overflow-hidden',
    },
})
export class NodeEditorComponent
    implements OnInit, AfterViewChecked, OnDestroy
{
    isAiAgentEnabled: boolean = false;
    @ViewChild('workspace', { static: true }) workspace!: ElementRef;
    @ViewChild('contextMenuTrigger') contextMenuTrigger!: MatMenuTrigger;
    @ViewChild('avatarFileInput')
    avatarFileInput!: ElementRef<HTMLInputElement>;
    targetAvatarChar: any = null;

    nodes: NodeItem[] = [];
    connections: NodeConnection[] = [];

    scale = 1;
    isPanning = false;
    selectedNode: NodeItem | null = null;
    startX = 0;
    startY = 0;
    startScrollLeft = 0;
    startScrollTop = 0;

    draggedNode: NodeItem | null = null;
    nodeStartX = 0;
    nodeStartY = 0;

    draggedConnection: {
        fromNode: string;
        fromPort: string;
        toX: number;
        toY: number;
        path?: string;
        color?: string;
    } | null = null;
    hoveredNode: NodeItem | null = null;
    hoveredInput: { node: NodeItem; port: string } | null = null;

    private mouseMoveListener: any;
    private mouseUpListener: any;

    contextMenuVisible = false;
    contextMenuPosition = { x: 0, y: 0 };
    contextMenuCanvasPosition = { x: 0, y: 0 };

    uuid: string | null = null;
    projectData: any = null;

    activeCharacters: any[] = [];

    expandedCharIndex: number | null = null;

    canvasWidth = 2000;
    canvasHeight = 1000;

    nodeHeights: { [id: string]: number } = {};

    availableModels: string[] = ['3.1 Pro'];
    filteredModels: string[] = [];
    filteredModelGroups: { name: string; models: string[] }[] = [];
    selectedModel: string = '3.1 Pro';
    selectedVideoModel: string = '';
    globalActiveModality: 'IMAGE' | 'VIDEO' = 'IMAGE';
    isModelInputFocused: boolean = false;
    modelSearchValue: string = '';
    modelInputValue: string = '';

    globalPromptText: string = '';
    editingType: 'scene' | 'character' | 'master' | 'none' = 'none';
    editingCharacter: any = null;
    isGeneratingPrompt: boolean = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private multiAccountService: MultiAccountService,
        private dialog: MatDialog,
        private cdr: ChangeDetectorRef,
        private genaiService: GenaiService,
        private ngZone: NgZone,
        private _fuseConfirmationService: FuseConfirmationService,
        private sanitizer: DomSanitizer,
        private toastr: ToastrService,
        private _userClientService: UserClientService,
    ) {}

    openVideoEditorDialog() {
        const username = this.projectData?.username || 'anonymous';
        const uuid = this.uuid || '';
        if (uuid) {
            this.router.navigate(['/voice2video', username, uuid], {
                queryParams: { action: 'edit-script' },
            });
        } else {
            this.toastr.warning('Lỗi không xác định được dự án.');
        }
    }

    @HostListener('window:keydown', ['$event'])
    onKeyDown(event: KeyboardEvent) {
        if (
            (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === 's'
        ) {
            event.preventDefault();

            // Cập nhật lại prompt cuối cùng trước khi lưu nếu user đang gõ
            this.saveEditorState(); // Cập nhật vị trí các khối

            // Tiến hành lưu
            this.saveProject(true);
            this.toastr.success('Đã lưu dữ liệu!');
        }
    }

    ngAfterViewChecked() {
        let changed = false;
        const newHeights: { [id: string]: number } = {};
        for (const node of this.nodes) {
            const el = document.getElementById(node.id);
            if (el) {
                const h = el.offsetHeight;
                if (this.nodeHeights[node.id] !== h) {
                    newHeights[node.id] = h;
                    changed = true;
                }
            }
        }
        if (changed) {
            setTimeout(() => {
                this.nodeHeights = { ...this.nodeHeights, ...newHeights };
                this.updateConnectionPaths();
                this.cdr.detectChanges();
            }, 0);
        }
    }

    ngOnInit(): void {
        this.multiAccountService.activeAccount$.subscribe(
            async (sessionData) => {
                let isAiAgentActive = false;
                if (sessionData && sessionData.settings) {
                    isAiAgentActive =
                        sessionData.settings.enableAiAgent === true;
                }

                if (
                    (window as any).electronAPI &&
                    (window as any).electronAPI.getPluginsStatus
                ) {
                    try {
                        const list = await (
                            window as any
                        ).electronAPI.getPluginsStatus();
                        const aiAgent = list?.find(
                            (p: any) => p.id === 'ai_agent',
                        );
                        if (aiAgent && aiAgent.enabled !== undefined) {
                            isAiAgentActive = aiAgent.enabled;
                        }
                    } catch (e) {}
                }

                this.isAiAgentEnabled = isAiAgentActive;
                this.cdr.detectChanges();
            },
        );

        this.mouseMoveListener = this.onMouseMoveOutside.bind(this);
        this.mouseUpListener = this.onMouseUpOutside.bind(this);
        this.ngZone.runOutsideAngular(() => {
            window.addEventListener('mousemove', this.mouseMoveListener, {
                passive: true,
            });
            window.addEventListener('mouseup', this.mouseUpListener);
        });

        this.uuid = this.route.snapshot.paramMap.get('uuid');
        if (!this.uuid) {
            this.router.navigate(['../'], { relativeTo: this.route });
            return;
        }

        const storageKey = `ai_type_video_ready_data_${this.uuid}`;
        this.projectData = this.multiAccountService.getItem(storageKey);

        if (
            this.projectData &&
            this.projectData.scenes &&
            this.projectData.scenes.length > 0
        ) {
            this.buildGraphFromData(this.projectData);
        } else {
            this.buildFakeGraph();
        }

        this.loadModels();
    }

    ngOnDestroy(): void {
        if (this.mouseMoveListener)
            window.removeEventListener('mousemove', this.mouseMoveListener);
        if (this.mouseUpListener)
            window.removeEventListener('mouseup', this.mouseUpListener);
    }

    get modelHint(): string {
        if (!this.selectedModel) return '';
        const m = this.selectedModel.toLowerCase();

        let info = MODEL_HINTS[this.selectedModel];
        if (!info) {
            for (const key of Object.keys(MODEL_HINTS)) {
                if (
                    m.includes(key.toLowerCase()) ||
                    key.toLowerCase().includes(m)
                ) {
                    info = MODEL_HINTS[key];
                    break;
                }
            }
        }

        let defaultHint =
            'Gõ nội dung, kịch bản hoặc ý tưởng bạn muốn AI thực hiện...';
        if (
            m.includes('image') ||
            m.includes('dall-e') ||
            m.includes('midjourney') ||
            m.includes('flux')
        ) {
            defaultHint =
                'Mô tả chi tiết bằng tiếng Anh (ánh sáng, phong cách, camera...).';
        } else if (
            m.includes('video') ||
            m.includes('sora') ||
            m.includes('runway') ||
            m.includes('kling') ||
            m.includes('hailuo') ||
            m.includes('wan') ||
            m.includes('vidu')
        ) {
            defaultHint =
                'Tả rõ hành động, sự kiện và góc máy (pan, zoom, tilt) để video mượt mà hơn.';
        } else if (
            m.includes('tts') ||
            m.includes('voice') ||
            m.includes('elevenlabs') ||
            m.includes('kokoro') ||
            m.includes('audio')
        ) {
            defaultHint =
                'Viết nội dung cần đọc. Dùng dấu câu hợp lý để AI ngắt nghỉ đúng nhịp, tự nhiên hơn.';
        } else if (
            m.includes('gpt') ||
            m.includes('claude') ||
            m.includes('gemini') ||
            m.includes('pro') ||
            m.includes('doubao') ||
            m.includes('qwen') ||
            m.includes('deepseek')
        ) {
            defaultHint =
                'Bạn có thể yêu cầu AI viết kịch bản, lên ý tưởng hoặc tóm tắt nội dung.';
        }

        if (info) {
            const supports = [];
            if (info.text) supports.push('văn bản');
            if (info.max_images > 0)
                supports.push(`tối đa ${info.max_images} hình ảnh`);
            if (info.max_videos > 0)
                supports.push(`tối đa ${info.max_videos} video`);

            const limitsText =
                supports.length > 0
                    ? `Hỗ trợ đầu vào: ${supports.join(', ')}.`
                    : '';
            return limitsText + ' ' + defaultHint;
        }

        return defaultHint;
    }

    async loadModels() {
        try {
            const models = await this.genaiService.getUModelverseModels();
            const allModels = ['Local ComfyUI'];
            if (models && models.length > 0) {
                allModels.push(...models);
            }
            this.availableModels = allModels;
            this.filteredModels = [...this.availableModels];
            this.filteredModelGroups = this.groupModels(this.filteredModels);

            const settings = this.multiAccountService.getItem('settings') || {};

            const savedModel =
                settings.umodelverseImageModel ||
                settings.ai_type_selected_model ||
                localStorage.getItem('ai_type_selected_model');
            if (
                savedModel &&
                (this.availableModels.includes(savedModel) ||
                    Object.keys(MODEL_HINTS).some(
                        (k) => k.toLowerCase() === savedModel.toLowerCase(),
                    ))
            ) {
                this.selectedModel = savedModel;
            } else if (!this.availableModels.includes(this.selectedModel)) {
                this.selectedModel = this.availableModels[0];
            }

            const savedVideoModel =
                settings.umodelverseVideoModel ||
                settings.ai_type_selected_video_model ||
                localStorage.getItem('ai_type_selected_video_model');
            if (
                savedVideoModel &&
                (this.availableModels.includes(savedVideoModel) ||
                    Object.keys(MODEL_HINTS).some(
                        (k) =>
                            k.toLowerCase() === savedVideoModel.toLowerCase(),
                    ))
            ) {
                this.selectedVideoModel = savedVideoModel;
            } else {
                const defaultVideoModel = this.availableModels.find(
                    (m) =>
                        m.toLowerCase().includes('video') ||
                        m.toLowerCase().includes('seedance') ||
                        m.toLowerCase().includes('kling'),
                );
                this.selectedVideoModel =
                    defaultVideoModel || this.availableModels[0];
            }

            this.cdr.detectChanges();
        } catch (e) {
            console.error('Failed to load models', e);
        }
    }

    buildGraphFromData(data: any) {
        if (!data) return;

        if (
            data.editorLayout &&
            data.editorLayout.nodes &&
            data.editorLayout.connections
        ) {
            this.nodes = data.editorLayout.nodes;
            this.nodes.forEach((node) => {
                if (node.data) {
                    node.data.isGenerating = false;
                    node.data.isGeneratingAudio = false;
                }
            });
            this.connections = data.editorLayout.connections;

            // Sync backend data back into nodes
            if (data.scenes) {
                this.nodes.forEach((node) => {
                    if (node.data && node.data.sceneIndex !== undefined) {
                        const scene = data.scenes[node.data.sceneIndex];
                        if (scene) {
                            if (node.type === 'video') {
                                let imageUrl = scene.imageUrl;
                                let videoUrl = null;
                                if (scene.videos && scene.videos.length > 0) {
                                    imageUrl =
                                        scene.videos[0].imageUrl ||
                                        scene.videos[0].controlImageUrl ||
                                        imageUrl;
                                    videoUrl = scene.videos[0].videoUrl || null;
                                }
                                node.data.imageUrl =
                                    imageUrl || node.data.imageUrl;
                                node.data.videoUrl =
                                    videoUrl || node.data.videoUrl;
                                node.data.isVideo = !!node.data.videoUrl;
                                node.data.text = scene.script;
                                node.data.sceneData = scene;
                            } else if (node.type === 'tts') {
                                if (
                                    scene.subtitles &&
                                    scene.subtitles.length > 0
                                ) {
                                    node.data.audioUrl =
                                        scene.subtitles[0].audioUrl ||
                                        node.data.audioUrl;
                                    node.data.text = scene.subtitles[0].text;
                                    node.title =
                                        scene.subtitles[0].text ||
                                        'Text to Speech';
                                    node.data.sceneData = scene;
                                }
                                node.inputs = []; // Ensure TTS nodes don't have input ports
                            } else if (node.type === 'storyboard') {
                                node.data.sceneData = scene;
                            }
                        }
                    }
                });
            }

            // Auto-fix overlapping TTS nodes for backward compatibility
            this.nodes.forEach((node) => {
                if (node.type === 'tts') {
                    const conn = this.connections.find(
                        (c) => c.fromNode === node.id && c.toPort === 'tts_in',
                    );
                    if (conn) {
                        const vidNode = this.nodes.find(
                            (n) => n.id === conn.toNode,
                        );
                        const vidHeight = this.getNodeHeight(vidNode);
                        if (node.y < vidNode.y + vidHeight) {
                            node.y = vidNode.y + vidHeight + 25;
                            node.baseY = node.y;
                        }
                    }
                }
            });

            const compNode = this.nodes.find((n) => n.id === 'comp_final');
            if (compNode) {
                compNode.data.videoUrl = data.finalVideoUrl || null;
            }

            this.calculateCanvasSize();

            if (
                data.editorLayout.scrollLeft !== undefined &&
                data.editorLayout.scrollTop !== undefined
            ) {
                setTimeout(() => {
                    if (this.workspace && this.workspace.nativeElement) {
                        this.workspace.nativeElement.scrollLeft =
                            data.editorLayout.scrollLeft;
                        this.workspace.nativeElement.scrollTop =
                            data.editorLayout.scrollTop;
                    }
                }, 100);
            }

            return;
        }

        this.nodes = [];
        this.connections = [];
        let startX = 150;

        const compNode: NodeItem = {
            id: 'comp1',
            type: 'composition',
            title: 'Composition',
            subtitle: 'Final Output',
            x: data.scenes.length * 450 + 150,
            y: 300,
            inputs: [],
            outputs: [],
            data: { imageUrl: '' },
            baseX: data.scenes.length * 450 + 150,
            baseY: 300,
        };

        let maxNodeY = 600;
        data.scenes.forEach((scene: any, index: number) => {
            const sceneX = startX + index * 450;
            const yOffset = Math.floor(Math.random() * 300) - 150;

            const ttsNodeId = `tts_${index}`;
            const vidNodeId = `vid_${index}`;

            let hasTts = false;

            let imageUrl = scene.imageUrl;
            let videoUrl = null;
            let duration = scene.forcedDuration || 5;
            let aspectRatio =
                data.ratio ||
                data.aspectRatio ||
                scene.ratio ||
                scene.aspectRatio ||
                '16:9';

            if (scene.videos && scene.videos.length > 0) {
                imageUrl =
                    scene.videos[0].imageUrl ||
                    scene.videos[0].controlImageUrl ||
                    imageUrl;
                videoUrl = scene.videos[0].videoUrl || null;
            }

            let ttsDuration = 0;
            let usedClipIds = new Set<string>();

            let ttsY = 450;
            if (aspectRatio === '9:16') ttsY = 700;
            else if (
                aspectRatio === '1:1' ||
                aspectRatio === '3:4' ||
                aspectRatio === '4:3'
            )
                ttsY = 550;

            if (scene.subtitles && scene.subtitles.length > 0) {
                scene.subtitles.forEach((s: any) => usedClipIds.add(s.id));
                const sub = scene.subtitles[0];
                ttsDuration = sub.duration ? Math.round(sub.duration) : 5;
                this.nodes.push({
                    id: ttsNodeId,
                    type: 'tts',
                    title: sub.text || 'Text to Speech',
                    subtitle: `${ttsDuration}s`,
                    x: sceneX,
                    y: ttsY + yOffset,
                    inputs: [],
                    outputs: ['out'],
                    data: {
                        text: sub.text,
                        duration: `00:${ttsDuration.toString().padStart(2, '0')}`,
                        audioUrl: sub.audioUrl,
                        sceneData: scene,
                        sceneIndex: index,
                        showOnCanvas: true,
                    },
                    baseX: sceneX,
                    baseY: ttsY + yOffset,
                });
                hasTts = true;
                maxNodeY = Math.max(maxNodeY, ttsY + yOffset + 150);
            } else {
                maxNodeY = Math.max(
                    maxNodeY,
                    150 + yOffset + (aspectRatio === '9:16' ? 530 : 380),
                );
            }

            const visualUrl = videoUrl || imageUrl || null;

            const estimatedDuration = duration;
            const vidSubtitle = videoUrl
                ? `${estimatedDuration}s`
                : `~${estimatedDuration}s`;
            const vidNode: NodeItem = {
                id: vidNodeId,
                type: 'video',
                title: `Scene Visuals ${index + 1}`,
                subtitle: vidSubtitle,
                x: sceneX,
                y: 150 + yOffset,
                inputs: [],
                outputs: ['out'],
                data: {
                    imageUrl: imageUrl,
                    videoUrl: videoUrl,
                    text: scene.script,
                    isVideo: !!videoUrl,
                    aspectRatio: aspectRatio,
                    sceneData: scene,
                    projectCharacters: data.characters,
                    sceneIndex: index,
                },
                baseX: sceneX,
                baseY: 150 + yOffset,
            };

            if (hasTts) {
                vidNode.inputs.push('tts_in');
                this.connections.push({
                    id: `c_tts_${index}`,
                    fromNode: ttsNodeId,
                    fromPort: 'out',
                    toNode: vidNodeId,
                    toPort: 'tts_in',
                });
            }

            if (index > 0) {
                const prevVidNodeId = `vid_${index - 1}`;
                vidNode.inputs.push('prev_scene_in');
                this.connections.push({
                    id: `c_seq_${index}`,
                    fromNode: prevVidNodeId,
                    fromPort: 'out',
                    toNode: vidNodeId,
                    toPort: 'prev_scene_in',
                });
            }

            this.nodes.push(vidNode);
        });

        if (data.scenes.length > 0) {
            const lastVidNodeId = `vid_${data.scenes.length - 1}`;
            compNode.inputs.push(lastVidNodeId);
            this.connections.push({
                id: `c_comp`,
                fromNode: lastVidNodeId,
                fromPort: 'out',
                toNode: compNode.id,
                toPort: lastVidNodeId,
            });
        }

        if (data.originalClips && data.originalClips.length > 0) {
            let floatingX = 150;
            let floatingY = maxNodeY + 50;
            data.originalClips.forEach((clip: any) => {
                // Xử lý id (vì trong AI trả về có thể là số, nhưng clip.id có thể là string/số)
                if (
                    !this.nodes.find(
                        (n) =>
                            n.type === 'tts' &&
                            n.data?.text === clip.description,
                    )
                ) {
                    let safeAudioUrl = null;
                    if (clip.localFilePath) {
                        const safePath = clip.localFilePath.replace(/\\/g, '/');
                        safeAudioUrl = safePath.startsWith('/')
                            ? `file://${safePath}`
                            : `file:///${safePath}`;
                    }
                    const ttsDuration = clip.duration
                        ? Math.round(clip.duration)
                        : 5;
                    this.nodes.push({
                        id: `tts_floating_${clip.id}`,
                        type: 'tts',
                        title: clip.description || 'Text to Speech',
                        subtitle: `${ttsDuration}s`,
                        x: floatingX,
                        y: floatingY,
                        inputs: [],
                        outputs: ['out'],
                        data: {
                            text: clip.description,
                            duration: `00:${ttsDuration.toString().padStart(2, '0')}`,
                            audioUrl: safeAudioUrl,
                        },
                        baseX: floatingX,
                        baseY: floatingY,
                    });
                    floatingX += 300;
                    if (floatingX > 1500) {
                        floatingX = 150;
                        floatingY += 150;
                    }
                }
            });
        }

        if (compNode.inputs.length > 0) {
            this.nodes.push(compNode);
        }

        this.nodes.forEach((n) => {
            if (n.inputs && n.inputs.length > 1) {
                n.inputs.sort((a, b) => {
                    const aIsTts = a.startsWith('tts_in');
                    const bIsTts = b.startsWith('tts_in');
                    if (aIsTts && !bIsTts) return 1;
                    if (!aIsTts && bIsTts) return -1;
                    return a.localeCompare(b);
                });
            }
        });

        this.calculateCanvasSize();
        this.saveEditorState();
    }

    buildFakeGraph() {
        this.nodes = [
            {
                id: 'img1',
                type: 'image',
                title: 'Image',
                subtitle: 'Nano Banana Pro',
                x: 150,
                y: 150,
                inputs: [],
                outputs: ['out'],
                data: {
                    imageUrl: 'assets/images/placeholder.jpg',
                    text: 'A speed boat on the coast line during the summer, cinematic, moody and colorful',
                },
                baseX: 150,
                baseY: 150,
            },
            {
                id: 'vid1',
                type: 'video',
                title: 'Video',
                subtitle: '5s',
                x: 550,
                y: 100,
                inputs: ['in1'],
                outputs: ['out'],
                data: {
                    imageUrl: 'assets/images/placeholder.jpg',
                    text: 'Camera moves from start frame to end frame',
                    aspectRatio: '16:9',
                    sceneData: {
                        visualPrompt:
                            'Cinematic lighting, 8k resolution, highly detailed',
                    },
                    projectCharacters: [
                        { name: 'Nano Banana' },
                        { name: 'Captain' },
                    ],
                },
                baseX: 550,
                baseY: 100,
            },
            {
                id: 'tts1',
                type: 'tts',
                title: 'Text to Speech',
                subtitle: '5s',
                x: 550,
                y: 400,
                inputs: [],
                outputs: ['out'],
                data: {
                    text: 'Every sunset looks better from the water.',
                    duration: '00:05',
                },
                baseX: 550,
                baseY: 400,
            },
            {
                id: 'comp1',
                type: 'composition',
                title: 'Composition',
                subtitle: '',
                x: 950,
                y: 200,
                inputs: ['vid_in', 'audio_in'],
                outputs: [],
                data: { imageUrl: 'assets/images/placeholder.jpg' },
                baseX: 950,
                baseY: 200,
            },
        ];

        this.connections = [
            {
                id: 'c1',
                fromNode: 'img1',
                fromPort: 'out',
                toNode: 'vid1',
                toPort: 'in1',
            },
            {
                id: 'c2',
                fromNode: 'vid1',
                fromPort: 'out',
                toNode: 'comp1',
                toPort: 'vid_in',
            },
            {
                id: 'c3',
                fromNode: 'tts1',
                fromPort: 'out',
                toNode: 'comp1',
                toPort: 'audio_in',
            },
        ];

        this.calculateCanvasSize();
        this.saveEditorState();
    }

    getCurrentProjectAspectRatio(): string {
        const existingNode = this.nodes?.find(
            (n) =>
                (n.type === 'video' ||
                    n.type === 'storyboard' ||
                    n.type === 'composition') &&
                (n.data?.aspectRatio ||
                    n.data?.sceneData?.aspectRatio ||
                    n.data?.sceneData?.ratio ||
                    n.data?.ratio),
        );
        if (existingNode) {
            return this.getNodeAspectRatio(existingNode);
        }
        if (this.projectData?.aspectRatio) return this.projectData.aspectRatio;
        if (this.projectData?.ratio) return this.projectData.ratio;
        if (this.projectData?.settings?.aspectRatio)
            return this.projectData.settings.aspectRatio;
        if (this.projectData?.settings?.ratio)
            return this.projectData.settings.ratio;
        return '16:9';
    }

    getNodeAspectRatio(node: any): string {
        if (!node) return this.getCurrentProjectAspectRatio();
        return (
            node.data?.aspectRatio ||
            node.data?.sceneData?.aspectRatio ||
            node.data?.sceneData?.ratio ||
            node.data?.ratio ||
            this.getCurrentProjectAspectRatio()
        );
    }

    getNodeWidth(n: any): number {
        if (!n) return 280;
        if (n.type === 'composition') return 540;
        if (n.type === 'video' || n.type === 'storyboard') {
            const ratio = this.getNodeAspectRatio(n);
            return ratio === '9:16' ? 240 : 360;
        }
        return 280;
    }

    getNodeHeight(n: any): number {
        if (!n) return 340;
        if (n.type === 'composition') return 400;
        if (n.type === 'tts') return 120;
        if (
            n.type === 'video' ||
            n.type === 'storyboard' ||
            n.type === 'image'
        ) {
            const ratio = this.getNodeAspectRatio(n);
            if (ratio === '9:16') return 550;
            if (ratio === '3:4') return 490;
            if (ratio === '1:1') return 400;
            if (ratio === '4:3') return 370;
            return 340;
        }
        return 340;
    }

    getAspectRatioCss(ratio?: string): string {
        if (!ratio) return '16/9';
        return ratio.replace(':', '/');
    }

    calculateCanvasSize() {
        let maxRight = 0;
        let maxBottom = 0;
        this.nodes.forEach((n) => {
            const nodeWidth = this.getNodeWidth(n);
            if (n.x + nodeWidth > maxRight) maxRight = n.x + nodeWidth;
            if (n.y + 300 > maxBottom) maxBottom = n.y + 300;
        });
        this.canvasWidth = Math.max(1200, maxRight + 300);
        this.canvasHeight = Math.max(800, maxBottom + 300);
        this.updateConnectionPaths();
    }

    cleanupUnusedPorts() {
        this.nodes.forEach((node) => {
            if (node.type !== 'video' && node.type !== 'composition') return;
            node.inputs = node.inputs.filter((port) => {
                if (!port.startsWith('tts_in')) return true;
                return this.connections.some(
                    (c) => c.toNode === node.id && c.toPort === port,
                );
            });
        });
    }

    updateConnectionPaths() {
        this.cleanupUnusedPorts();
        this.connections.forEach((conn) => {
            conn.path = this.getConnectionPath(conn);
            const fromObj = this.nodes.find((n) => n.id === conn.fromNode);
            conn.color =
                fromObj?.type === 'storyboard'
                    ? '#eab308'
                    : fromObj?.type === 'tts'
                      ? '#d97706'
                      : '#5eead4';
        });
    }

    getConnectionPath(conn: NodeConnection): string {
        const from = this.nodes.find((n) => n.id === conn.fromNode);
        const to = this.nodes.find((n) => n.id === conn.toNode);
        if (!from || !to) return '';

        let fromHeight =
            this.nodeHeights[from.id] ||
            (from.type === 'tts'
                ? 100
                : from.type === 'storyboard'
                  ? 140
                  : 250);
        let fromWidth = this.getNodeWidth(from);
        let toHeight =
            this.nodeHeights[to.id] ||
            (to.type === 'tts' ? 100 : to.type === 'storyboard' ? 140 : 250);

        const fromX = from.x + fromWidth;
        const fromY =
            from.type === 'tts' ? from.y + 66 : from.y + fromHeight / 2;

        const toX = to.x;
        let toY = to.type === 'tts' ? to.y + 66 : to.y + toHeight / 2;

        const numPorts = to.inputs.length;
        const portIndex = to.inputs.indexOf(conn.toPort);
        if (numPorts > 1 && portIndex >= 0) {
            const totalPortHeight = numPorts * 24 + (numPorts - 1) * 8;
            const startY = toY - totalPortHeight / 2;
            toY = startY + portIndex * 32 + 12;
        }

        let dx = Math.abs(toX - fromX) * 0.4;
        dx = Math.min(Math.max(dx, 50), 120);

        return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
    }

    getDraggedConnectionPath(): string {
        if (!this.draggedConnection) return '';
        const from = this.nodes.find(
            (n) => n.id === this.draggedConnection!.fromNode,
        );
        if (!from) return '';

        let fromHeight =
            this.nodeHeights[from.id] ||
            (from.type === 'tts'
                ? 100
                : from.type === 'storyboard'
                  ? 140
                  : 250);
        let fromWidth = this.getNodeWidth(from);

        const fromX = from.x + fromWidth;
        const fromY =
            from.type === 'tts' ? from.y + 66 : from.y + fromHeight / 2;

        const toX = this.draggedConnection.toX;
        const toY = this.draggedConnection.toY;

        let dx = Math.abs(toX - fromX) * 0.4;
        dx = Math.min(Math.max(dx, 50), 120);

        return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
    }

    onInputPortMouseDown(event: MouseEvent, node: NodeItem, port: string) {
        event.stopPropagation();
        const existingConnIndex = this.connections.findIndex(
            (c) => c.toNode === node.id && c.toPort === port,
        );
        if (existingConnIndex >= 0) {
            const conn = this.connections[existingConnIndex];
            this.connections.splice(existingConnIndex, 1);

            this.updateConnectionPaths();

            const rect = this.workspace.nativeElement.getBoundingClientRect();
            const mouseX =
                (event.clientX -
                    rect.left +
                    this.workspace.nativeElement.scrollLeft) /
                this.scale;
            const mouseY =
                (event.clientY -
                    rect.top +
                    this.workspace.nativeElement.scrollTop) /
                this.scale;

            this.draggedConnection = {
                fromNode: conn.fromNode,
                fromPort: conn.fromPort,
                toX: mouseX,
                toY: mouseY,
                color: '#818cf8',
            };
        }
    }

    onOutputPortMouseDown(event: MouseEvent, node: NodeItem, port: string) {
        event.stopPropagation();

        if (!node.data) node.data = {};
        node.data.showOnCanvas = true;

        if (node.type === 'tts') {
            const existingConnIndex = this.connections.findIndex(
                (c) => c.fromNode === node.id && c.fromPort === port,
            );
            if (existingConnIndex >= 0) {
                const conn = this.connections[existingConnIndex];
                this.connections.splice(existingConnIndex, 1);

                // Xóa input port tts_in_x bên target node nếu có
                const toObj = this.nodes.find((n) => n.id === conn.toNode);
                if (toObj) {
                    toObj.inputs = toObj.inputs.filter(
                        (p) => p !== conn.toPort,
                    );
                }
                this.updateConnectionPaths();
            }
        }

        const rect = this.workspace.nativeElement.getBoundingClientRect();
        const mouseX =
            (event.clientX -
                rect.left +
                this.workspace.nativeElement.scrollLeft) /
            this.scale;
        const mouseY =
            (event.clientY -
                rect.top +
                this.workspace.nativeElement.scrollTop) /
            this.scale;

        this.draggedConnection = {
            fromNode: node.id,
            fromPort: port,
            toX: mouseX,
            toY: mouseY,
            color: '#818cf8',
        };
    }

    createConnection(
        fromNode: string,
        fromPort: string,
        toNode: string,
        toPort: string,
    ) {
        if (fromNode === toNode) return;

        const fromObj = this.nodes.find((n) => n.id === fromNode);
        const toObj = this.nodes.find((n) => n.id === toNode);

        if (fromObj && toObj) {
            if (fromObj.type === 'tts') {
                if (!toPort.startsWith('tts_in')) {
                    const usedPorts = this.connections
                        .filter((c) => c.toNode === toNode)
                        .map((c) => c.toPort);
                    let freePort = toObj.inputs.find(
                        (p) => p.startsWith('tts_in') && !usedPorts.includes(p),
                    );
                    if (!freePort) {
                        let i = 1;
                        while (toObj.inputs.includes(`tts_in_${i}`)) i++;
                        freePort = `tts_in_${i}`;
                        toObj.inputs.push(freePort);
                    }
                    toPort = freePort;
                } else {
                    const isOccupied = this.connections.some(
                        (c) => c.toNode === toNode && c.toPort === toPort,
                    );
                    if (isOccupied) {
                        let i = 1;
                        while (toObj.inputs.includes(`tts_in_${i}`)) i++;
                        const newPort = `tts_in_${i}`;
                        toObj.inputs.push(newPort);
                        toPort = newPort;
                    }
                }
            } else if (fromObj.type === 'video' || fromObj.type === 'image') {
                if (
                    toObj.type !== 'composition' &&
                    toPort !== 'prev_scene_in' &&
                    toPort !== 'in1' &&
                    !toPort.startsWith('storyboard_in')
                )
                    return;
            } else if (fromObj.type === 'storyboard') {
                if (toObj.type !== 'video' && toObj.type !== 'image') return;
                if (!toPort.startsWith('storyboard_in')) {
                    const usedPorts = this.connections
                        .filter((c) => c.toNode === toNode)
                        .map((c) => c.toPort);
                    let freePort = toObj.inputs.find(
                        (p) =>
                            p.startsWith('storyboard_in') &&
                            !usedPorts.includes(p),
                    );
                    if (!freePort) {
                        let i = 1;
                        while (toObj.inputs.includes(`storyboard_in_${i}`)) i++;
                        freePort = `storyboard_in_${i}`;
                        toObj.inputs.push(freePort);
                    }
                    toPort = freePort;
                }
            }
        }

        this.connections = this.connections.filter(
            (c) => !(c.toNode === toNode && c.toPort === toPort),
        );

        if (toObj && !toObj.inputs.includes(toPort)) {
            toObj.inputs.push(toPort);
        }

        this.connections.push({
            id: `c_${Date.now()}`,
            fromNode,
            fromPort,
            toNode,
            toPort,
        });

        if (toObj) {
            toObj.inputs.sort((a, b) => {
                const aIsTts = a.startsWith('tts_in');
                const bIsTts = b.startsWith('tts_in');
                if (aIsTts && !bIsTts) return 1;
                if (!aIsTts && bIsTts) return -1;
                return a.localeCompare(b);
            });
        }

        this.updateConnectionPaths();
        this.saveEditorState();
    }

    onWorkspaceMouseDown(event: MouseEvent) {
        if (this.contextMenuVisible) {
            this.closeContextMenu();
        }
        const target = event.target as HTMLElement;
        if (
            target.closest('.cursor-move') ||
            target.closest('.fixed.bottom-12')
        ) {
            return;
        }
        this.isPanning = true;
        this.selectedNode = null;
        this.editingType = 'none';
        this.editingCharacter = null;
        this.globalPromptText = '';
        this.activeCharacters = [];
        this.attachedFiles = [];
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.startScrollLeft = this.workspace.nativeElement.scrollLeft;
        this.startScrollTop = this.workspace.nativeElement.scrollTop;
    }

    onWorkspaceContextMenu(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (
            target.closest('.cursor-move') ||
            target.closest('.fixed.bottom-12')
        ) {
            return;
        }

        event.preventDefault();
        this.contextMenuPosition = { x: event.clientX, y: event.clientY };

        const rect = this.workspace.nativeElement.getBoundingClientRect();
        const x =
            (event.clientX -
                rect.left +
                this.workspace.nativeElement.scrollLeft) /
            this.scale;
        const y =
            (event.clientY -
                rect.top +
                this.workspace.nativeElement.scrollTop) /
            this.scale;
        this.contextMenuCanvasPosition = { x, y };

        if (this.contextMenuTrigger) {
            this.contextMenuTrigger.openMenu();
        }
    }

    autoArrangeAllNodes() {
        this.autoStashDisconnectedNodes(true);

        const isPrimary = (type: string) =>
            type === 'video' || type === 'image';
        const isComp = (type: string) =>
            type === 'composition' || type === 'comp';

        const primaryNodes = this.nodes.filter((n) => isPrimary(n.type));
        const compNodes = this.nodes.filter((n) => isComp(n.type));
        const storyboardNodes = this.nodes.filter(
            (n) => n.type === 'storyboard',
        );
        const secondaryNodes = this.nodes.filter(
            (n) =>
                !isPrimary(n.type) &&
                !isComp(n.type) &&
                n.type !== 'storyboard',
        );

        const colMap = new Map<string, number>();
        primaryNodes.forEach((n) => colMap.set(n.id, 0));

        let changed = true;
        let iterations = 0;
        while (changed && iterations < 100) {
            changed = false;
            iterations++;
            this.connections.forEach((c) => {
                const fromNode = this.nodes.find((n) => n.id === c.fromNode);
                const toNode = this.nodes.find((n) => n.id === c.toNode);

                if (
                    fromNode &&
                    toNode &&
                    isPrimary(fromNode.type) &&
                    isPrimary(toNode.type)
                ) {
                    const fromCol = colMap.get(fromNode.id) || 0;
                    const toCol = colMap.get(toNode.id) || 0;
                    if (fromCol + 1 > toCol) {
                        colMap.set(toNode.id, fromCol + 1);
                        changed = true;
                    }
                }
            });
        }

        const sortedByScene = [...primaryNodes].sort(
            (a, b) => (a.data?.sceneIndex || 0) - (b.data?.sceneIndex || 0),
        );
        for (let i = 1; i < sortedByScene.length; i++) {
            const curr = sortedByScene[i];
            const prev = sortedByScene[i - 1];
            const hasIncoming = this.connections.some(
                (c) =>
                    c.toNode === curr.id &&
                    isPrimary(
                        this.nodes.find((n) => n.id === c.fromNode)?.type || '',
                    ),
            );
            if (!hasIncoming) {
                const expectedCol = (colMap.get(prev.id) || 0) + 1;
                if ((colMap.get(curr.id) || 0) < expectedCol) {
                    colMap.set(curr.id, expectedCol);
                }
            }
        }

        changed = true;
        iterations = 0;
        while (changed && iterations < 100) {
            changed = false;
            iterations++;
            this.connections.forEach((c) => {
                const fromNode = this.nodes.find((n) => n.id === c.fromNode);
                const toNode = this.nodes.find((n) => n.id === c.toNode);

                if (
                    fromNode &&
                    toNode &&
                    isPrimary(fromNode.type) &&
                    isPrimary(toNode.type)
                ) {
                    const fromCol = colMap.get(fromNode.id) || 0;
                    const toCol = colMap.get(toNode.id) || 0;
                    if (fromCol + 1 > toCol) {
                        colMap.set(toNode.id, fromCol + 1);
                        changed = true;
                    }
                }
            });
        }

        const secondaryToPrimary = new Map<string, string>();
        const primaryToSecondaries = new Map<string, NodeItem[]>();
        this.connections.forEach((c) => {
            const fromNode = this.nodes.find((n) => n.id === c.fromNode);
            const toNode = this.nodes.find((n) => n.id === c.toNode);
            if (
                fromNode &&
                toNode &&
                !isPrimary(fromNode.type) &&
                isPrimary(toNode.type)
            ) {
                secondaryToPrimary.set(fromNode.id, toNode.id);
                if (!primaryToSecondaries.has(toNode.id))
                    primaryToSecondaries.set(toNode.id, []);
                primaryToSecondaries.get(toNode.id)!.push(fromNode);
            }
        });

        const cols = new Map<number, NodeItem[]>();
        primaryNodes.forEach((n) => {
            const col = colMap.get(n.id) || 0;
            if (!cols.has(col)) cols.set(col, []);
            cols.get(col)!.push(n);
        });

        const sortedCols = Array.from(cols.keys()).sort((a, b) => a - b);

        const blockPositions = new Map<
            string,
            { x: number; currentY: number }
        >();
        let maxPrimaryX = 150;

        sortedCols.forEach((colIndex, cIdx) => {
            const colNodes = cols.get(colIndex)!;
            colNodes.sort(
                (a, b) => (a.data?.sceneIndex || 0) - (b.data?.sceneIndex || 0),
            );

            let totalColHeight = 0;
            const nodeHeights = colNodes.map((pNode) => {
                const secondaries = primaryToSecondaries.get(pNode.id) || [];
                const pHeight = this.getNodeHeight(pNode);
                const h = pHeight + secondaries.length * 140;
                totalColHeight += h;
                return h;
            });
            totalColHeight += Math.max(0, colNodes.length - 1) * 50;

            let currentY = 150;
            if (colNodes.length > 1) {
                currentY = Math.max(50, 300 - totalColHeight / 2);
            } else {
                currentY = 150;
            }

            colNodes.forEach((pNode, rIdx) => {
                pNode.x = 150 + cIdx * 450;
                pNode.baseX = pNode.x;
                maxPrimaryX = Math.max(maxPrimaryX, pNode.x);

                pNode.y = currentY;
                pNode.baseY = pNode.y;

                const pHeight = this.getNodeHeight(pNode);
                blockPositions.set(pNode.id, {
                    x: pNode.x,
                    currentY: pNode.y + pHeight + 30,
                });

                if (colNodes.length > 1) {
                    currentY += nodeHeights[rIdx] + 50;
                }
            });
        });

        compNodes.forEach((cNode, index) => {
            cNode.x = maxPrimaryX + 450 + index * 450;
            cNode.baseX = cNode.x;
            cNode.y = 300;
            cNode.baseY = cNode.y;
        });

        if (primaryNodes.length > 0) {
            const minX = Math.min(...primaryNodes.map((n) => n.x));
            const maxX = Math.max(...primaryNodes.map((n) => n.x));
            const centerX = (minX + maxX) / 2;

            storyboardNodes.forEach((sNode, index) => {
                sNode.x = centerX;
                sNode.baseX = sNode.x;
                sNode.y = 550 + index * 200;
                sNode.baseY = sNode.y;
            });
        }

        let unconnectedX = 150 + sortedCols.length * 450;

        secondaryNodes.forEach((sNode, sIdx) => {
            let targetId = secondaryToPrimary.get(sNode.id);
            if (!targetId && sNode.data?.sceneIndex !== undefined) {
                const matchedPrimary = primaryNodes.find(
                    (p) => p.data?.sceneIndex === sNode.data.sceneIndex,
                );
                if (matchedPrimary) targetId = matchedPrimary.id;
            }
            if (!targetId && primaryNodes[sIdx]) {
                targetId = primaryNodes[sIdx].id;
            }

            if (targetId && blockPositions.has(targetId)) {
                const pos = blockPositions.get(targetId)!;
                sNode.x = pos.x;
                sNode.baseX = sNode.x;
                sNode.y = pos.currentY;
                sNode.baseY = sNode.y;
                pos.currentY += 140;
            } else {
                sNode.x = unconnectedX;
                sNode.baseX = sNode.x;
                sNode.y = 730;
                sNode.baseY = sNode.y;
                unconnectedX += 450;
            }
        });

        this.updateConnectionPaths();
        this.calculateCanvasSize();
        this.saveEditorState();
        this.cdr.detectChanges();
    }

    closeContextMenu() {
        this.contextMenuVisible = false;
    }

    deleteNode(nodeId: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message:
                'Bạn có chắc chắn muốn xóa khối này không? Toàn bộ dây kết nối liên quan cũng sẽ bị xóa.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error',
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đồng ý',
                    color: 'warn',
                },
                cancel: {
                    show: true,
                    label: 'Hủy',
                },
            },
            dismissible: true,
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result === 'confirmed') {
                // Remove all connections associated with this node
                this.connections = this.connections.filter(
                    (c) => c.fromNode !== nodeId && c.toNode !== nodeId,
                );
                // Remove the node itself
                this.nodes = this.nodes.filter((n) => n.id !== nodeId);

                this.updateConnectionPaths();
                this.calculateCanvasSize();
                this.autoStashDisconnectedNodes(true);
                this.saveEditorState();
                this.cdr.detectChanges();
            }
        });
    }

    addNewSceneNode() {
        const id = `scene_${Date.now()}`;
        const x = this.contextMenuCanvasPosition.x
            ? Math.round(this.contextMenuCanvasPosition.x)
            : 150;
        const y = this.contextMenuCanvasPosition.y
            ? Math.round(this.contextMenuCanvasPosition.y)
            : 150;
        const currentRatio = this.getCurrentProjectAspectRatio();

        const newScene: NodeItem = {
            id,
            type: 'video',
            title: `Scene Visuals ${this.nodes.filter((n) => n.type === 'video' || n.type === 'composition').length + 1}`,
            subtitle: '~5s',
            x,
            y,
            baseX: x,
            baseY: y,
            inputs: ['in1'],
            outputs: ['out'],
            data: {
                imageUrl: '',
                videoUrl: '',
                text: '',
                isVideo: false,
                showOnCanvas: true,
                aspectRatio: currentRatio,
                sceneData: {
                    visualPrompt: '',
                    aspectRatio: currentRatio,
                    ratio: currentRatio,
                },
                projectCharacters: [],
            },
        };
        this.nodes = [...this.nodes, newScene];
        this.selectNode(newScene);
        this.calculateCanvasSize();
        this.closeContextMenu();
        this.saveEditorState();

        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    addNewAudioNode() {
        const id = `tts_${Date.now()}`;
        const x = this.contextMenuCanvasPosition.x
            ? Math.round(this.contextMenuCanvasPosition.x)
            : 150;
        const y = this.contextMenuCanvasPosition.y
            ? Math.round(this.contextMenuCanvasPosition.y)
            : 150;

        const newAudio: NodeItem = {
            id,
            type: 'tts',
            title: 'Text to Speech',
            subtitle: '0s',
            x,
            y,
            baseX: x,
            baseY: y,
            inputs: [],
            outputs: ['out'],
            data: {
                text: '',
                duration: '0s',
                audioUrl: '',
                isGeneratingAudio: false,
                sceneData: {},
                showOnCanvas: true,
            },
        };
        this.nodes = [...this.nodes, newAudio];
        this.selectNode(newAudio);
        this.calculateCanvasSize();
        this.closeContextMenu();
        this.saveEditorState();

        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    autoStashDisconnectedNodes(silent: boolean = false) {
        let stashedCount = 0;
        this.nodes.forEach((n) => {
            if (n.type !== 'composition') {
                const hasConnection = this.connections.some(
                    (c) => c.fromNode === n.id || c.toNode === n.id,
                );
                if (!hasConnection && n.data?.showOnCanvas) {
                    n.data.showOnCanvas = false;
                    stashedCount++;
                }
            }
        });
        if (stashedCount > 0) {
            if (!silent)
                this.toastr.success(
                    `Đã cất ${stashedCount} khối chưa kết nối vào kho!`,
                );
            this.saveEditorState();
            this.calculateCanvasSize();
            this.cdr.detectChanges();
        } else if (!silent) {
            this.toastr.info('Không có khối nào cần cất!');
        }
        this.closeContextMenu();
    }

    stashNode(node: NodeItem) {
        if (node.type === 'composition') return;
        if (!node.data) node.data = {};
        node.data.showOnCanvas = false;

        this.connections = this.connections.filter(
            (c) => c.fromNode !== node.id && c.toNode !== node.id,
        );

        this.updateConnectionPaths();
        this.saveEditorState();
        this.toastr.success(`Đã cất ${node.title} vào kho!`);
        this.cdr.detectChanges();
    }

    get unusedAudioNodes(): NodeItem[] {
        return this.nodes.filter(
            (n) =>
                n.type === 'tts' &&
                !this.connections.some(
                    (c) => c.fromNode === n.id || c.toNode === n.id,
                ) &&
                !n.data?.showOnCanvas,
        );
    }

    get unusedVisualNodes(): NodeItem[] {
        return this.nodes.filter(
            (n) =>
                (n.type === 'video' ||
                    n.type === 'image' ||
                    n.type === 'storyboard') &&
                !this.connections.some(
                    (c) => c.fromNode === n.id || c.toNode === n.id,
                ) &&
                !n.data?.showOnCanvas,
        );
    }

    isNodeVisible(node: NodeItem): boolean {
        if (node.type !== 'composition') {
            if (node.data?.showOnCanvas) return true;
            return this.connections.some(
                (c) => c.fromNode === node.id || c.toNode === node.id,
            );
        }
        return true;
    }

    addUnusedAudioToCanvas(node: NodeItem) {
        if (!node.data) node.data = {};
        node.data.showOnCanvas = true;

        const x = this.contextMenuCanvasPosition.x
            ? Math.round(this.contextMenuCanvasPosition.x)
            : 150;
        const y = this.contextMenuCanvasPosition.y
            ? Math.round(this.contextMenuCanvasPosition.y)
            : 150;

        node.x = x;
        node.y = y;
        node.baseX = x;
        node.baseY = y;

        this.selectNode(node);
        this.closeContextMenu();
        this.saveEditorState();
        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    addUnusedVisualToCanvas(node: NodeItem) {
        if (!node.data) node.data = {};
        node.data.showOnCanvas = true;

        const x = this.contextMenuCanvasPosition.x
            ? Math.round(this.contextMenuCanvasPosition.x)
            : 150;
        const y = this.contextMenuCanvasPosition.y
            ? Math.round(this.contextMenuCanvasPosition.y)
            : 150;

        node.x = x;
        node.y = y;
        node.baseX = x;
        node.baseY = y;

        this.selectNode(node);
        this.closeContextMenu();
        this.saveEditorState();
        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    addStoryboardNode() {
        const id = `storyboard_${Date.now()}`;

        // Auto center below scenes
        const primaryNodes = this.nodes.filter(
            (n) => n.type === 'video' || n.type === 'image',
        );
        let x = 150;
        let y = 750;
        if (primaryNodes.length > 0) {
            const minX = Math.min(...primaryNodes.map((n) => n.x));
            const maxX = Math.max(...primaryNodes.map((n) => n.x));
            x = (minX + maxX) / 2;
            const maxY = Math.max(
                ...primaryNodes.map(
                    (n) => n.y + (this.nodeHeights[n.id] || 250),
                ),
            );
            y = maxY + 150;
        } else {
            x = this.contextMenuCanvasPosition.x
                ? Math.round(this.contextMenuCanvasPosition.x)
                : 150;
            y = this.contextMenuCanvasPosition.y
                ? Math.round(this.contextMenuCanvasPosition.y)
                : 150;
        }

        const newStoryboard: NodeItem = {
            id,
            type: 'storyboard',
            title: 'Bản vẽ',
            subtitle: '',
            x,
            y,
            baseX: x,
            baseY: y,
            inputs: [],
            outputs: ['out'],
            data: {
                prompt: '',
            },
        };
        this.nodes = [...this.nodes, newStoryboard];

        // Connect to all existing video nodes
        this.nodes.forEach((n) => {
            if (n.type === 'video' || n.type === 'image') {
                let freePort = n.inputs.find(
                    (p) =>
                        p.startsWith('storyboard_in') &&
                        !this.connections.some(
                            (c) => c.toNode === n.id && c.toPort === p,
                        ),
                );
                if (!freePort) {
                    let i = 1;
                    while (n.inputs.includes(`storyboard_in_${i}`)) i++;
                    freePort = `storyboard_in_${i}`;
                    n.inputs.push(freePort);
                }
                this.connections.push({
                    id: `c_${Date.now()}_${Math.random()}`,
                    fromNode: newStoryboard.id,
                    fromPort: 'out',
                    toNode: n.id,
                    toPort: freePort,
                });
            }
        });

        this.selectNode(newStoryboard);
        this.calculateCanvasSize();
        this.closeContextMenu();
        this.saveEditorState();
        setTimeout(() => this.cdr.detectChanges(), 0);
    }

    private saveProjectTimeout: any;

    manualSave() {
        this.saveEditorState();
        this.saveProject(true);
        this.toastr.success('Đã lưu dữ liệu!');
    }

    saveProject(immediate: boolean = false) {
        if (!this.uuid || !this.projectData) return;

        // Nếu gọi saveProject() mà không có immediate=true, ta bỏ qua (không tự động lưu nữa)
        // Người dùng sẽ chủ động bấm Ctrl+S để lưu.
        if (immediate) {
            const storageKey = `ai_type_video_ready_data_${this.uuid}`;
            this.multiAccountService.setItem(storageKey, this.projectData);
        }
    }

    saveEditorState() {
        if (this.projectData) {
            const strippedNodes = this.nodes.map((n) => {
                const nCopy = JSON.parse(JSON.stringify(n));
                if (nCopy.data) {
                    delete nCopy.data.projectCharacters;
                    delete nCopy.data.isGenerating;
                    delete nCopy.data.isGeneratingAudio;
                    // Chỉ strip media URLs nếu node có liên kết với scene
                    if (
                        nCopy.data.sceneIndex !== undefined &&
                        nCopy.data.sceneIndex !== null
                    ) {
                        delete nCopy.data.sceneData;
                    }
                }
                return nCopy;
            });

            this.projectData.editorLayout = {
                nodes: strippedNodes,
                connections: JSON.parse(JSON.stringify(this.connections)),
                scrollLeft: this.workspace?.nativeElement?.scrollLeft || 0,
                scrollTop: this.workspace?.nativeElement?.scrollTop || 0,
            };
            this.saveProject();
        }
    }

    onWorkspaceScroll(event: Event) {
        if (this.projectData && this.projectData.editorLayout) {
            this.projectData.editorLayout.scrollLeft =
                this.workspace.nativeElement.scrollLeft;
            this.projectData.editorLayout.scrollTop =
                this.workspace.nativeElement.scrollTop;
            this.saveProject();
        }
    }

    selectNode(node: NodeItem) {
        this.selectedNode = node;
        this.editingType = 'scene';
        this.editingCharacter = null;

        if (node.type === 'tts') {
            this.globalPromptText = node.data?.text || '';
            return;
        }

        let text =
            node.data?.sceneData?.prompt ||
            node.data?.sceneData?.visualPrompt ||
            node.data?.sceneData?.imagePrompt ||
            node.data?.text ||
            '';

        if (node.data?.sceneData) {
            let parts = [];
            if (this.projectData?.masterPrompt)
                parts.push(`Master Prompt: ${this.projectData.masterPrompt}`);
            if (node.data.sceneData.setting)
                parts.push(`Setting: ${node.data.sceneData.setting}`);
            if (node.data.sceneData.time)
                parts.push(`Time: ${node.data.sceneData.time}`);

            let charsDesc = '';
            if (
                this.projectData?.characters &&
                this.projectData.characters.length > 0
            ) {
                const fullSceneText = `${text} ${node.data.sceneData.script || ''} ${node.data.sceneData.setting || ''}`;
                const sceneChars = [];
                let sceneTextCopy = fullSceneText;
                const sortedChars = [...this.projectData.characters].sort(
                    (a, b) => (b.name || '').length - (a.name || '').length,
                );
                const escapeRegExp = (string: string) =>
                    string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                for (const char of sortedChars) {
                    if (char.name) {
                        const nameRegex = new RegExp(
                            `(?<=^|[^\\p{L}\\p{N}_])${escapeRegExp(char.name)}(?=[^\\p{L}\\p{N}_]|$)`,
                            'giu',
                        );
                        if (nameRegex.test(sceneTextCopy)) {
                            sceneChars.push(char);
                            sceneTextCopy = sceneTextCopy.replace(
                                nameRegex,
                                ' '.repeat(char.name.length),
                            );
                        }
                    }
                }
                if (sceneChars.length > 0) {
                    charsDesc = sceneChars
                        .map((c: any) => {
                            let cParts = [];
                            if (c.name) cParts.push(`Name: ${c.name}`);
                            if (c.variant) cParts.push(`Variant: ${c.variant}`);
                            if (c.role) cParts.push(`Role: ${c.role}`);
                            if (c.appearance)
                                cParts.push(`Appearance: ${c.appearance}`);
                            if (c.personality)
                                cParts.push(`Personality: ${c.personality}`);
                            if (c.prompt) cParts.push(`Prompt: ${c.prompt}`);
                            return `- ${cParts.join(', ')}`;
                        })
                        .join('\n');
                    parts.push(`Characters:\n${charsDesc}`);
                }
            }

            if (node.data.sceneData.script)
                parts.push(`Dialogue: ${node.data.sceneData.script}`);

            parts.push(`Action/Visuals: ${text}`);
            text = parts.join('\n\n');
        }
        this.globalPromptText = text;

        this.activeCharacters = [];
        if (this.projectData?.characters?.length && text) {
            let textCopy = text
                .replace(
                    /Characters:\n[\s\S]*?(?=\n\nDialogue:|\n\nAction\/Visuals:|$)/is,
                    '',
                )
                .replace(
                    /Master Prompt:\s*[\s\S]*?(?=\n\nCharacters:|\n\nDialogue:|\n\nAction\/Visuals:|$)/is,
                    '',
                );
            const sortedChars = [...this.projectData.characters].sort(
                (a, b) => (b.name || '').length - (a.name || '').length,
            );
            const escapeRegExp = (string: string) =>
                string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            for (const char of sortedChars) {
                if (char.name) {
                    const nameRegex = new RegExp(
                        `(?<=^|[^\\p{L}\\p{N}_])${escapeRegExp(char.name)}(?=[^\\p{L}\\p{N}_]|$)`,
                        'giu',
                    );
                    if (nameRegex.test(textCopy)) {
                        this.activeCharacters.push(char);
                        textCopy = textCopy.replace(
                            nameRegex,
                            ' '.repeat(char.name.length),
                        );
                    }
                }
            }
        }

        if (node.id === 'master') {
            this.selectedNode = null;
            this.editingType = 'master';
            this.globalPromptText = this.projectData?.masterPrompt || '';
        }

        this.cdr.detectChanges();
    }

    private async extractBase64FromResponse(
        response: any,
    ): Promise<string | null> {
        if (!response) return null;
        if (response.image?.base64) return response.image.base64;
        if (typeof response.image === 'string' && response.image.length > 50) {
            return response.image.replace(
                /^data:image\/(png|jpg|jpeg|webp);base64,/,
                '',
            );
        }

        const parts =
            response.candidates?.[0]?.content?.parts || response.parts || [];
        if (!Array.isArray(parts)) return null;

        const electron = (window as any).electron;

        for (const part of parts) {
            if (!part) continue;
            if (part.inlineData?.data) {
                return part.inlineData.data;
            }
            if (part.imageUrl && typeof part.imageUrl === 'string') {
                if (part.imageUrl.startsWith('data:image/')) {
                    return part.imageUrl.replace(
                        /^data:image\/(png|jpg|jpeg|webp);base64,/,
                        '',
                    );
                }
                if (
                    (part.imageUrl.startsWith('file://') ||
                        part.imageUrl.startsWith('/')) &&
                    electron?.readFileBase64
                ) {
                    try {
                        const filePath = part.imageUrl.replace('file://', '');
                        const b64 = await electron.readFileBase64(filePath);
                        if (b64) return b64;
                    } catch (e) {}
                }
            }
            if (part.image && typeof part.image === 'string') {
                return part.image.replace(
                    /^data:image\/(png|jpg|jpeg|webp);base64,/,
                    '',
                );
            }
            if (part.text && typeof part.text === 'string') {
                const dataUrlMatch = part.text.match(
                    /data:image\/(?:png|jpg|jpeg|webp);base64,([A-Za-z0-9+/=]+)/,
                );
                if (dataUrlMatch && dataUrlMatch[1]) {
                    return dataUrlMatch[1];
                }
                const localMatch =
                    part.text.match(/\[LOCAL_IMAGE:\s*(.+?)\]/) ||
                    part.text.match(/!\[.*?\]\((file:\/\/.+?|\/.+?)\)/);
                if (localMatch && localMatch[1]) {
                    const filePath = localMatch[1]
                        .replace('file://', '')
                        .trim();
                    if (electron?.readFileBase64) {
                        try {
                            const b64 = await electron.readFileBase64(filePath);
                            if (b64) return b64;
                        } catch (e) {}
                    }
                }
            }
        }
        return null;
    }

    async submitPrompt(
        generateAll: boolean = false,
        forceModality?: 'IMAGE' | 'VIDEO' | 'AUDIO',
    ) {
        if (this.editingType === 'character' && this.editingCharacter) {
            const targetCharacter = this.editingCharacter;
            if (!this.globalPromptText) {
                this.toastr.warning('Vui lòng nhập prompt cho nhân vật!');
                return;
            }

            const electron = (window as any).electron;
            if (!electron || !electron.saveBase64) {
                this.toastr.error(
                    'Lỗi cấu hình. Yêu cầu App Desktop (Electron).',
                );
                return;
            }

            this.toastr.info('Đang gửi yêu cầu tạo hình nhân vật...');

            this.isGeneratingPrompt = true;
            this.cdr.detectChanges();

            try {
                const master = this.projectData?.masterPrompt
                    ? this.projectData.masterPrompt.trim()
                    : '';
                let finalPrompt = master
                    ? `${master}\n\n${this.globalPromptText}`
                    : this.globalPromptText;

                if (
                    this.editingType === 'character' &&
                    !finalPrompt.includes('--ar')
                ) {
                    finalPrompt += ' --ar 1:1';
                }

                const response = await this.genaiService.generateContent({
                    model: this.selectedModel || 'gemini-3.6-flash',
                    contents: [
                        { role: 'user', parts: [{ text: finalPrompt }] },
                    ],
                    config: {
                        aspectRatio: '1:1',
                        responseModalities: ['IMAGE'],
                    } as any,
                });

                const base64Data =
                    await this.extractBase64FromResponse(response);

                if (base64Data) {
                    const username = this.projectData?.username || 'anonymous';
                    const projectUuid =
                        this.uuid || this.projectData?.uuid || 'default';
                    const result = await electron.saveBase64({
                        base64: base64Data,
                        fileName: `char_${Date.now()}.png`,
                        folder: 'characters',
                        username: username,
                        customDir: `tts/${username}/${projectUuid}`,
                    });

                    if (result && result.success) {
                        targetCharacter.avatarUrl = `file://${result.path.replace(/\\/g, '/')}`;
                        this.toastr.success('Đã tạo hình nhân vật thành công!');
                        this.saveProject();
                    } else {
                        this.toastr.error('Lỗi khi lưu ảnh xuống đĩa');
                    }
                } else {
                    this.toastr.error('Không nhận được ảnh từ AI');
                }
            } catch (error) {
                console.error(error);
                this.toastr.error('Lỗi khi tạo ảnh nhân vật: ' + error);
            } finally {
                this.isGeneratingPrompt = false;
                this.cdr.detectChanges();
            }
        } else if (
            this.editingType === 'scene' ||
            this.editingType === 'master'
        ) {
            const electron = (window as any).electron;
            if (!electron || !electron.saveBase64) {
                this.toastr.error(
                    'Lỗi cấu hình. Yêu cầu App Desktop (Electron).',
                );
                return;
            }

            let targetModality = forceModality || 'IMAGE';
            if (!forceModality) {
                const lowerModel = (this.selectedModel || '').toLowerCase();
                if (this.selectedNode?.type === 'tts') {
                    targetModality = 'AUDIO';
                } else if (
                    lowerModel.includes('audio') ||
                    lowerModel.includes('tts') ||
                    lowerModel.includes('speech')
                ) {
                    targetModality = 'AUDIO';
                } else if (
                    lowerModel.includes('video') ||
                    lowerModel.includes('kling') ||
                    lowerModel.includes('luma') ||
                    lowerModel.includes('runway') ||
                    lowerModel.includes('sora') ||
                    lowerModel.includes('haiper') ||
                    lowerModel.includes('wan') ||
                    lowerModel.includes('minimax') ||
                    lowerModel.includes('veo') ||
                    lowerModel.includes('hunyuan') ||
                    lowerModel.includes('doubao') ||
                    lowerModel.includes('seedance')
                ) {
                    targetModality = 'VIDEO';
                } else if (
                    lowerModel.includes('image') ||
                    lowerModel.includes('dall-e')
                ) {
                    targetModality = 'IMAGE';
                } else {
                    targetModality = this.globalActiveModality || 'IMAGE';
                }
            }

            // Lấy các node scene
            let sceneNodes = [];
            if (
                !generateAll &&
                this.selectedNode &&
                (this.selectedNode.type === 'video' ||
                    this.selectedNode.type === 'storyboard' ||
                    this.selectedNode.type === 'tts')
            ) {
                sceneNodes = [this.selectedNode];
            } else if (generateAll) {
                sceneNodes = this.nodes.filter((n) => {
                    if (n.type !== 'video' && n.type !== 'storyboard')
                        return false;
                    if (targetModality === 'IMAGE' && n.data?.imageUrl)
                        return false;
                    if (targetModality === 'VIDEO' && n.data?.videoUrl)
                        return false;
                    return true;
                });
            }

            if (sceneNodes.length === 0) {
                this.toastr.warning(
                    generateAll
                        ? 'Tất cả các scene đều đã có hình/video, không có gì mới để tạo!'
                        : 'Vui lòng chọn một scene cụ thể để tạo!',
                );
                return;
            }

            const prompts: string[] = [];
            const nodesMapping: any[] = [];
            const refImagesUrls: string[][] = [];
            const master = this.projectData?.masterPrompt
                ? this.projectData.masterPrompt.trim()
                : '';

            for (const n of sceneNodes) {
                let finalPrompt = '';

                let promptTextRaw =
                    n.data?.prompt ||
                    n.data?.sceneData?.prompt ||
                    n.data?.sceneData?.visualPrompt ||
                    n.data?.text ||
                    n.title ||
                    '';
                const fullSceneText = (
                    promptTextRaw +
                    ' ' +
                    (n.data?.text || '') +
                    ' ' +
                    (n.data?.sceneData?.script || '')
                ).toLowerCase();
                const sceneChars = this.projectData?.characters
                    ? this.projectData.characters.filter(
                          (c: any) =>
                              c.name &&
                              fullSceneText.includes(c.name.toLowerCase()),
                      )
                    : [];
                let sceneAvatars: string[] = [];
                for (const c of sceneChars) {
                    const url =
                        c.avatarUrl ||
                        (c.avatarUrls && c.avatarUrls.length > 0
                            ? c.avatarUrls[0]
                            : null);
                    if (url) {
                        sceneAvatars.push(url);
                    }
                }

                if (targetModality === 'VIDEO') {
                    const sceneImg =
                        n.data?.imageUrl ||
                        n.data?.sceneData?.imageUrl ||
                        n.data?.thumbnailUrl;
                    if (sceneImg) {
                        sceneAvatars.unshift(sceneImg);
                    }
                }

                refImagesUrls.push(sceneAvatars);

                let promptText =
                    n.data?.prompt ||
                    n.data?.sceneData?.prompt ||
                    n.data?.sceneData?.visualPrompt ||
                    n.data?.text ||
                    n.title ||
                    '';
                // Loại bỏ các chữ rác nếu lỡ dính vào
                promptText = promptText
                    .replace(/Style:/g, '')
                    .replace(/Scene details:/g, '')
                    .trim();
                if (master && promptText.includes(master)) {
                    promptText = promptText.replace(master, '').trim();
                }

                // Xử lý xung đột prompt: Nếu master prompt là hoạt hình, xóa các từ khóa người thật bị AI nhét vào do lỗi cũ
                const lowerMaster = master.toLowerCase();
                if (
                    lowerMaster.includes('3d') ||
                    lowerMaster.includes('hoạt hình') ||
                    lowerMaster.includes('anime') ||
                    lowerMaster.includes('comic') ||
                    lowerMaster.includes('illustration')
                ) {
                    promptText = promptText
                        .replace(/photorealistic/gi, '')
                        .replace(/hyper-realistic/gi, '')
                        .replace(/hyper realistic/gi, '')
                        .replace(/live-action/gi, '')
                        .replace(/live action/gi, '')
                        .replace(/, ,/g, ',')
                        .trim();
                }

                let characterContext = '';
                if (sceneChars.length > 0) {
                    characterContext =
                        'Character reference: ' +
                        sceneChars
                            .map(
                                (c: any) =>
                                    c.name +
                                    (c.appearance
                                        ? ' (' + c.appearance + ')'
                                        : ''),
                            )
                            .join(', ') +
                        '.\n';
                }

                finalPrompt = `${master ? 'Master Style: ' + master + '\n' : ''}${characterContext}Scene details: ${promptText}`;

                prompts.push(finalPrompt);
                nodesMapping.push(n);
            }

            let finalPrompts = prompts;
            this.isGeneratingPrompt = true;
            this.cdr.detectChanges();

            this.toastr.info(
                `Đang gửi ${finalPrompts.length} prompts lên server vẽ...`,
            );
            try {
                const ratio = this.projectData?.aspectRatio || '16:9';
                const currentModel =
                    targetModality === 'VIDEO'
                        ? this.selectedVideoModel
                        : this.selectedModel;
                if (currentModel && currentModel !== 'Local ComfyUI') {
                    for (let i = 0; i < finalPrompts.length; i++) {
                        try {
                            let requestParts: any[] = [
                                { text: finalPrompts[i] },
                            ];
                            if (
                                refImagesUrls[i] &&
                                refImagesUrls[i].length > 0
                            ) {
                                for (
                                    let imgIdx = 0;
                                    imgIdx < refImagesUrls[i].length;
                                    imgIdx++
                                ) {
                                    const url = refImagesUrls[i][imgIdx];
                                    try {
                                        const base64Data =
                                            await this.getBase64FromImageUrl(
                                                url,
                                            );
                                        let rType = 'CHARACTER';
                                        if (
                                            targetModality === 'VIDEO' &&
                                            imgIdx === 0
                                        ) {
                                            const sceneImg =
                                                nodesMapping[i].data
                                                    ?.imageUrl ||
                                                nodesMapping[i].data?.sceneData
                                                    ?.imageUrl ||
                                                nodesMapping[i].data
                                                    ?.thumbnailUrl;
                                            if (sceneImg) {
                                                rType = 'STORYBOARD';
                                            }
                                        }
                                        requestParts.push({
                                            inlineData: {
                                                data: base64Data,
                                                mimeType: 'image/png',
                                            },
                                            referenceType: rType,
                                        } as any);
                                    } catch (e) {
                                        console.error(
                                            'Không thể load ảnh nhân vật reference:',
                                            e,
                                        );
                                    }
                                }
                            }

                            // Nếu bật kế thừa khung hình cảnh trước, thêm ảnh đó vào prompt cho Gemini (Image-to-Image / Context)
                            if (
                                nodesMapping[i].data?.sceneData?.videos?.[0]
                                    ?.usePreviousSceneFrame
                            ) {
                                try {
                                    let prevNode = null;
                                    const incomingConnection =
                                        this.connections.find(
                                            (c) =>
                                                c.toNode === nodesMapping[i].id,
                                        );
                                    if (incomingConnection) {
                                        prevNode = this.nodes.find(
                                            (n) =>
                                                n.id ===
                                                incomingConnection.fromNode,
                                        );
                                    }
                                    if (
                                        !prevNode ||
                                        prevNode.type !== 'video'
                                    ) {
                                        prevNode = this.nodes.find(
                                            (x) =>
                                                x.type === 'video' &&
                                                x.data?.sceneIndex ===
                                                    nodesMapping[i].data
                                                        .sceneIndex -
                                                        1,
                                        );
                                    }
                                    let previousUrl =
                                        prevNode?.data?.imageUrl ||
                                        prevNode?.data?.thumbnailUrl;

                                    // Nếu cảnh trước là video, ưu tiên gọi extractLastFrame
                                    let previousVideoUrl =
                                        prevNode?.data?.videoUrl ||
                                        prevNode?.data?.sceneData?.videos?.[0]
                                            ?.videoUrl;
                                    if (previousVideoUrl) {
                                        let cleanUrl = previousVideoUrl.replace(
                                            'file://',
                                            '',
                                        );
                                        if (
                                            typeof cleanUrl !== 'string' &&
                                            (cleanUrl as any)
                                                .changingThisBreaksApplicationSecurity
                                        ) {
                                            cleanUrl = (
                                                cleanUrl as any
                                            ).changingThisBreaksApplicationSecurity.replace(
                                                'file://',
                                                '',
                                            );
                                        }
                                        const electron = (window as any)
                                            .electron;
                                        if (
                                            electron &&
                                            electron.extractLastFrame
                                        ) {
                                            // @ts-ignore
                                            const extractResult =
                                                await electron.extractLastFrame(
                                                    cleanUrl,
                                                );
                                            if (
                                                extractResult &&
                                                extractResult.success
                                            ) {
                                                if (extractResult.base64) {
                                                    previousUrl =
                                                        'data:image/png;base64,' +
                                                        extractResult.base64;
                                                } else if (extractResult.path) {
                                                    let properPath =
                                                        extractResult.path.replace(
                                                            /\\/g,
                                                            '/',
                                                        );
                                                    if (
                                                        !properPath.startsWith(
                                                            '/',
                                                        )
                                                    )
                                                        properPath =
                                                            '/' + properPath;
                                                    previousUrl =
                                                        'file://' + properPath;
                                                }
                                            }
                                        }
                                    }

                                    if (previousUrl) {
                                        const base64Data =
                                            await this.getBase64FromImageUrl(
                                                previousUrl,
                                            );
                                        requestParts.push({
                                            inlineData: {
                                                data: base64Data,
                                                mimeType: 'image/jpeg',
                                            },
                                            referenceType: 'START_FRAME',
                                        } as any);

                                        // Ensure the constraint is in the text prompt
                                        if (
                                            !requestParts[0].text.includes(
                                                'Seamless continuous motion from previous frame',
                                            )
                                        ) {
                                            requestParts[0].text +=
                                                '\n\n[MANDATORY: Seamless continuous motion from previous frame. NO teleportation. NO cuts.]';
                                        }
                                    }
                                } catch (e) {
                                    console.error(
                                        'Không thể load ảnh kế thừa frame cuối:',
                                        e,
                                    );
                                }
                            }

                            if (
                                !generateAll &&
                                i === 0 &&
                                this.attachedFiles &&
                                this.attachedFiles.length > 0
                            ) {
                                for (const attachedFile of this.attachedFiles) {
                                    if (
                                        attachedFile.base64 &&
                                        attachedFile.mimeType
                                    ) {
                                        requestParts.push({
                                            inlineData: {
                                                data: attachedFile.base64,
                                                mimeType: attachedFile.mimeType,
                                            },
                                            referenceType:
                                                attachedFile.referenceType,
                                        } as any);
                                    }
                                }
                            }

                            if (requestParts.length > 1) {
                                const textPart = requestParts[0];
                                const imageParts = requestParts.slice(1);
                                imageParts.sort((a, b) => {
                                    const rank = (type: string) => {
                                        if (type === 'START_FRAME') return 1;
                                        if (type === 'END_FRAME') return 2;
                                        if (type === 'STORYBOARD') return 3;
                                        return 4; // CHARACTER and others
                                    };
                                    return (
                                        rank(a.referenceType) -
                                        rank(b.referenceType)
                                    );
                                });
                                requestParts = [textPart, ...imageParts];
                            }

                            nodesMapping[i].data.isGenerating = true;
                            this.cdr.detectChanges();

                            const nodeDuration =
                                nodesMapping[i].data?.sceneData
                                    ?.forcedDuration || 5;
                            const nodeRatio =
                                nodesMapping[i]?.data?.aspectRatio ||
                                nodesMapping[i]?.data?.sceneData?.aspectRatio ||
                                this.projectData?.aspectRatio ||
                                '16:9';

                            const response =
                                await this.genaiService.generateContent({
                                    model:
                                        targetModality === 'VIDEO'
                                            ? this.selectedVideoModel ||
                                              this.selectedModel
                                            : this.selectedModel,
                                    contents: [
                                        { role: 'user', parts: requestParts },
                                    ],
                                    config: {
                                        aspectRatio: nodeRatio,
                                        duration: nodeDuration,
                                        responseModalities: [targetModality],
                                        bypassModelOverride: true,
                                    } as any,
                                });

                            const username =
                                this.projectData?.username || 'anonymous';
                            const projectUuid =
                                this.uuid ||
                                this.projectData?.uuid ||
                                'default';

                            if (targetModality === 'IMAGE') {
                                const base64Data =
                                    await this.extractBase64FromResponse(
                                        response,
                                    );

                                if (base64Data) {
                                    const saveResult =
                                        await electron.saveBase64({
                                            base64: base64Data,
                                            fileName: `scene_${nodesMapping[i].id}_${Date.now()}.png`,
                                            folder: 'storyboards',
                                            username: username,
                                            customDir: `tts/${username}/${projectUuid}`,
                                        });

                                    if (saveResult && saveResult.success) {
                                        const localPath = `file://${saveResult.path.replace(/\\/g, '/')}`;
                                        nodesMapping[i].data.imageUrl =
                                            localPath;
                                        nodesMapping[i].data.isVideo = false;
                                        nodesMapping[i].data.videoUrl = null;

                                        if (nodesMapping[i].data.sceneData) {
                                            nodesMapping[
                                                i
                                            ].data.sceneData.imageUrl =
                                                localPath;
                                            if (
                                                nodesMapping[i].data.sceneData
                                                    .videos
                                            ) {
                                                nodesMapping[
                                                    i
                                                ].data.sceneData.videos[0].videoUrl =
                                                    null;
                                                nodesMapping[
                                                    i
                                                ].data.sceneData.videos[0].imageUrl =
                                                    localPath;
                                            }
                                        }

                                        if (electron.createThumbnail) {
                                            try {
                                                const thumbPath =
                                                    saveResult.path.replace(
                                                        '.png',
                                                        '_thumb.jpg',
                                                    );
                                                await electron.createThumbnail({
                                                    source: saveResult.path,
                                                    target: thumbPath,
                                                    width: 200,
                                                });
                                                nodesMapping[
                                                    i
                                                ].data.thumbnailUrl =
                                                    `file://${thumbPath.replace(/\\/g, '/')}`;
                                            } catch (e) {
                                                console.error(
                                                    'Thumbnail error',
                                                    e,
                                                );
                                            }
                                        }
                                    }
                                }
                            } else if (targetModality === 'VIDEO') {
                                let videoUrl =
                                    (response as any)?.video?.url ||
                                    (response as any)?.candidates?.[0]?.content
                                        ?.parts?.[0]?.videoUrl;
                                let videoBase64 = (response as any)?.video
                                    ?.base64;

                                let finalVideoUrl = null;
                                if (videoBase64) {
                                    const saveResult =
                                        await electron.saveBase64({
                                            base64: videoBase64,
                                            fileName: `scene_${nodesMapping[i].id}_${Date.now()}.mp4`,
                                            folder: 'videos',
                                            username: username,
                                            customDir: `tts/${username}/${projectUuid}`,
                                        });
                                    if (saveResult && saveResult.success) {
                                        finalVideoUrl = `file://${saveResult.path.replace(/\\/g, '/')}`;
                                    }
                                } else if (videoUrl) {
                                    finalVideoUrl = videoUrl;
                                }

                                if (finalVideoUrl) {
                                    nodesMapping[i].data.videoUrl =
                                        finalVideoUrl;
                                    nodesMapping[i].data.isVideo = true;

                                    if (electron.extractLastFrame) {
                                        const thumbPath = finalVideoUrl.replace(
                                            'file://',
                                            '',
                                        );
                                        const thumbRes =
                                            await electron.extractLastFrame(
                                                thumbPath,
                                            );
                                        if (thumbRes && thumbRes.success) {
                                            if (thumbRes.path) {
                                                nodesMapping[i].data.imageUrl =
                                                    `file://${thumbRes.path.replace(/\\/g, '/')}`;
                                            } else if (thumbRes.base64) {
                                                nodesMapping[i].data.imageUrl =
                                                    `data:image/jpeg;base64,${thumbRes.base64}`;
                                            }
                                        }
                                    }

                                    if (
                                        nodesMapping[i].data.sceneData &&
                                        nodesMapping[i].data.sceneData.videos
                                    ) {
                                        if (
                                            nodesMapping[i].data.sceneData
                                                .videos.length === 0
                                        ) {
                                            nodesMapping[
                                                i
                                            ].data.sceneData.videos.push({});
                                        }
                                        nodesMapping[
                                            i
                                        ].data.sceneData.videos[0].videoUrl =
                                            finalVideoUrl;
                                        nodesMapping[
                                            i
                                        ].data.sceneData.videos[0].imageUrl =
                                            nodesMapping[i].data.imageUrl;
                                    }
                                }
                            } else if (targetModality === 'AUDIO') {
                                let audioUrl =
                                    (response as any)?.audio?.url ||
                                    (response as any)?.candidates?.[0]?.content
                                        ?.parts?.[0]?.audioUrl;
                                let audioBase64 = (response as any)?.audio
                                    ?.base64;

                                if (audioBase64) {
                                    const saveResult =
                                        await electron.saveBase64({
                                            base64: audioBase64,
                                            fileName: `scene_${nodesMapping[i].id}_${Date.now()}.mp3`,
                                            folder: 'audio',
                                            username: username,
                                            customDir: `tts/${username}/${projectUuid}`,
                                        });
                                    if (saveResult && saveResult.success) {
                                        nodesMapping[i].data.audioUrl =
                                            `file://${saveResult.path.replace(/\\/g, '/')}`;
                                    }
                                } else if (audioUrl) {
                                    nodesMapping[i].data.audioUrl = audioUrl;
                                }
                            }

                            nodesMapping[i].data.isGenerating = false;
                            this.cdr.detectChanges();
                        } catch (e) {
                            nodesMapping[i].data.isGenerating = false;
                            this.cdr.detectChanges();
                            console.error('Lỗi khi vẽ cảnh', i, e);
                            this.toastr.error(`Lỗi vẽ cảnh ${i + 1}: ${e}`);
                        }

                        this.cdr.detectChanges();
                        this.toastr.success(
                            `Đã hoàn thành ${i + 1}/${finalPrompts.length} bản vẽ!`,
                        );
                    }
                    this.saveProject();
                    this.isGeneratingPrompt = false;
                    this.cdr.detectChanges();
                    return;
                }

                let width = 1024;
                let height = 576;
                if (ratio === '9:16') {
                    width = 576;
                    height = 1024;
                } else if (ratio === '1:1') {
                    width = 1024;
                    height = 1024;
                } else if (ratio === '4:3') {
                    width = 1024;
                    height = 768;
                }

                const apiRes = await fetch(
                    'https://pangolin-innocent-especially.ngrok-free.app/api/storyboard',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'ngrok-skip-browser-warning': 'true',
                        },
                        body: JSON.stringify({
                            prompts: finalPrompts,
                            aspect_ratio: ratio,
                            aspectRatio: ratio,
                            width: width,
                            height: height,
                        }),
                    },
                );

                if (!apiRes.ok) {
                    if (apiRes.status === 503 || apiRes.status === 502) {
                        throw new Error(
                            'ComfyUI chưa khởi động xong hoặc bị lỗi! Vui lòng kiểm tra lại log bên Kaggle.',
                        );
                    }
                    throw new Error(`Lỗi kết nối API: ${apiRes.status}`);
                }

                const data = await apiRes.json();
                if (!data.job_id)
                    throw new Error('Không nhận được job_id từ ComfyUI');

                const jobId = data.job_id;
                this.toastr.info('Đã đưa vào hàng đợi, đang xử lý...');

                // Polling và xử lý từng phần
                let completed = false;
                let processedCount = 0;
                const username = this.projectData?.username || 'anonymous';
                const projectUuid =
                    this.uuid || this.projectData?.uuid || 'default';

                while (!completed) {
                    await new Promise((r) => setTimeout(r, 3000));
                    const statusRes = await fetch(
                        `https://pangolin-innocent-especially.ngrok-free.app/api/storyboard/${jobId}`,
                        {
                            headers: { 'ngrok-skip-browser-warning': 'true' },
                        },
                    );

                    if (!statusRes.ok) {
                        if (
                            statusRes.status === 503 ||
                            statusRes.status === 502
                        ) {
                            throw new Error(
                                'ComfyUI chưa khởi động xong hoặc bị lỗi! Vui lòng kiểm tra lại log bên Kaggle.',
                            );
                        }
                        throw new Error(`Lỗi kết nối API: ${statusRes.status}`);
                    }

                    const statusData = await statusRes.json();

                    if (statusData.error) {
                        throw new Error(statusData.error);
                    }

                    const results = statusData.results || [];

                    // Xử lý các ảnh mới hoàn thành
                    if (results.length > processedCount) {
                        for (let i = processedCount; i < results.length; i++) {
                            if (results[i] && nodesMapping[i]) {
                                const imgUrl =
                                    'https://pangolin-innocent-especially.ngrok-free.app' +
                                    results[i];
                                try {
                                    const imgRes = await fetch(imgUrl, {
                                        headers: {
                                            'ngrok-skip-browser-warning':
                                                'true',
                                        },
                                    });
                                    const blob = await imgRes.blob();

                                    // Convert blob to base64
                                    const base64Data =
                                        await new Promise<string>(
                                            (resolve, reject) => {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    const b64 = (
                                                        reader.result as string
                                                    ).split(',')[1];
                                                    resolve(b64);
                                                };
                                                reader.onerror = reject;
                                                reader.readAsDataURL(blob);
                                            },
                                        );

                                    const saveResult =
                                        await electron.saveBase64({
                                            base64: base64Data,
                                            fileName: `scene_${nodesMapping[i].id}_${Date.now()}.png`,
                                            folder: 'storyboards',
                                            username: username,
                                            customDir: `tts/${username}/${projectUuid}`,
                                        });

                                    if (saveResult && saveResult.success) {
                                        const localPath = `file://${saveResult.path.replace(/\\/g, '/')}`;
                                        nodesMapping[i].data.imageUrl =
                                            localPath;
                                        nodesMapping[i].data.isVideo = false;
                                        nodesMapping[i].data.videoUrl = null;

                                        if (nodesMapping[i].data.sceneData) {
                                            nodesMapping[
                                                i
                                            ].data.sceneData.imageUrl =
                                                localPath;
                                            if (
                                                nodesMapping[i].data.sceneData
                                                    .videos
                                            ) {
                                                nodesMapping[
                                                    i
                                                ].data.sceneData.videos[0].videoUrl =
                                                    null;
                                                nodesMapping[
                                                    i
                                                ].data.sceneData.videos[0].imageUrl =
                                                    localPath;
                                            }
                                        }

                                        // Tạo thumbnail file
                                        if (electron.createThumbnail) {
                                            try {
                                                const thumbPath =
                                                    saveResult.path.replace(
                                                        '.png',
                                                        '_thumb.jpg',
                                                    );
                                                await electron.createThumbnail({
                                                    source: saveResult.path,
                                                    target: thumbPath,
                                                    width: 200,
                                                });
                                                nodesMapping[
                                                    i
                                                ].data.thumbnailUrl =
                                                    `file://${thumbPath.replace(/\\/g, '/')}`;
                                            } catch (e) {
                                                console.error(
                                                    'Thumbnail error',
                                                    e,
                                                );
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.error(
                                        `Lỗi khi tải ảnh cho scene ${i}:`,
                                        err,
                                    );
                                }

                                // Cập nhật giao diện ngay lập tức
                                this.cdr.detectChanges();
                                this.toastr.success(
                                    `Đã hoàn thành ${i + 1}/${statusData.total} bản vẽ!`,
                                );
                            }
                        }
                        processedCount = results.length;
                        this.saveProject(); // Lưu project sau mỗi lần có ảnh mới
                    }

                    if (statusData.status === 'completed') {
                        completed = true;
                    } else {
                        console.log(
                            `Tiến độ: ${statusData.completed}/${statusData.total}`,
                        );
                    }
                }

                this.toastr.success('Hoàn tất tạo bản vẽ cho tất cả scenes!');
                this.saveProject();
            } catch (error) {
                console.error(error);
                this.toastr.error('Lỗi khi tạo bản vẽ: ' + error);
            } finally {
                this.isGeneratingPrompt = false;
                this.cdr.detectChanges();
            }
        }
    }

    updatePrompt(text: string) {
        this.globalPromptText = text;

        this.activeCharacters = [];
        if (this.projectData?.characters?.length && text) {
            let textCopy = text
                .replace(
                    /Characters:\n[\s\S]*?(?=\n\nDialogue:|\n\nAction\/Visuals:|$)/is,
                    '',
                )
                .replace(
                    /Master Prompt:\s*[\s\S]*?(?=\n\nCharacters:|\n\nDialogue:|\n\nAction\/Visuals:|$)/is,
                    '',
                );
            const sortedChars = [...this.projectData.characters].sort(
                (a, b) => (b.name || '').length - (a.name || '').length,
            );
            const escapeRegExp = (string: string) =>
                string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            for (const char of sortedChars) {
                if (char.name) {
                    const nameRegex = new RegExp(
                        `(?<=^|[^\\p{L}\\p{N}_])${escapeRegExp(char.name)}(?=[^\\p{L}\\p{N}_]|$)`,
                        'giu',
                    );
                    if (nameRegex.test(textCopy)) {
                        this.activeCharacters.push(char);
                        textCopy = textCopy.replace(
                            nameRegex,
                            ' '.repeat(char.name.length),
                        );
                    }
                }
            }
        }

        if (this.editingType === 'master') {
            if (this.projectData) {
                this.projectData.masterPrompt = text;
                this.saveProject();
            }
        } else if (this.editingType === 'character' && this.editingCharacter) {
            let nameMatch = text.match(/Name:\s*(.*?)(?=\n|$)/i);
            if (nameMatch) this.editingCharacter.name = nameMatch[1].trim();

            let variantMatch = text.match(/Variant:\s*(.*?)(?=\n|$)/i);
            if (variantMatch)
                this.editingCharacter.variant = variantMatch[1].trim();

            let roleMatch = text.match(/Role:\s*(.*?)(?=\n|$)/i);
            if (roleMatch) this.editingCharacter.role = roleMatch[1].trim();

            let appMatch = text.match(
                /Appearance:\s*(.*?)(?=\n(?:Name|Variant|Role|Appearance|Personality|Prompt):|$)/is,
            );
            if (appMatch) this.editingCharacter.appearance = appMatch[1].trim();

            let persMatch = text.match(
                /Personality:\s*(.*?)(?=\n(?:Name|Variant|Role|Appearance|Personality|Prompt):|$)/is,
            );
            if (persMatch)
                this.editingCharacter.personality = persMatch[1].trim();

            let promptMatch = text.match(/Prompt:\s*([\s\S]*)/i);
            if (promptMatch) {
                this.editingCharacter.prompt = promptMatch[1].trim();
            } else if (!nameMatch && !roleMatch && !appMatch && !persMatch) {
                // Nếu người dùng xóa hết các tag và chỉ gõ text thuần, coi toàn bộ là prompt
                this.editingCharacter.prompt = text;
            }

            this.saveProject();
        } else if (this.editingType === 'scene' && this.selectedNode) {
            if (this.selectedNode.type === 'tts') {
                this.selectedNode.data = {
                    ...this.selectedNode.data,
                    text: text,
                };
                this.selectedNode.title = text || 'Text to Speech';
                if (
                    this.selectedNode.data.sceneData &&
                    this.selectedNode.data.sceneData.subtitles &&
                    this.selectedNode.data.sceneData.subtitles.length > 0
                ) {
                    this.selectedNode.data.sceneData.subtitles[0].text = text;
                }
                this.saveProject();
                return;
            }

            let savedText = text;

            // Parse Master Prompt
            const masterMarker = 'Master Prompt: ';
            let masterMatch = text.match(
                /Master Prompt:\s*([\s\S]*?)(?=\n\nCharacters:|\n\nAction\/Visuals:|$)/is,
            );
            if (masterMatch && this.projectData) {
                this.projectData.masterPrompt = masterMatch[1].trim();
            }

            // Parse Characters
            let charMatch = text.match(
                /Characters:\n([\s\S]*?)(?=\n\nAction\/Visuals:|$)/is,
            );
            if (charMatch && this.projectData && this.projectData.characters) {
                const charLines = charMatch[1].split('\n');
                for (const line of charLines) {
                    if (line.trim().startsWith('- Name:')) {
                        const nameM = line.match(
                            /- Name:\s*(.*?)(?:, Role:|, Appearance:|, Personality:|, Prompt:|$)/i,
                        );
                        if (nameM) {
                            const cName = nameM[1].trim().toLowerCase();
                            const character = this.projectData.characters.find(
                                (c: any) =>
                                    c.name && c.name.toLowerCase() === cName,
                            );
                            if (character) {
                                const roleM = line.match(
                                    /Role:\s*(.*?)(?:, Appearance:|, Personality:|, Prompt:|$)/i,
                                );
                                if (roleM) character.role = roleM[1].trim();

                                const appM = line.match(
                                    /Appearance:\s*(.*?)(?:, Personality:|, Prompt:|$)/i,
                                );
                                if (appM) character.appearance = appM[1].trim();

                                const persM = line.match(
                                    /Personality:\s*(.*?)(?:, Prompt:|$)/i,
                                );
                                if (persM)
                                    character.personality = persM[1].trim();

                                const prM = line.match(/Prompt:\s*(.*?)$/i);
                                if (prM) character.prompt = prM[1].trim();
                            }
                        }
                    }
                }
            }

            // Parse Scene Prompt (Action/Visuals)
            const visualMarker = 'Action/Visuals: ';
            const index = text.lastIndexOf(visualMarker);
            if (index !== -1) {
                savedText = text.substring(index + visualMarker.length).trim();
            } else {
                const dialogMarker = 'Dialogue: ';
                const charMarker = 'Characters:\n';

                let lastKnownIndex = Math.max(
                    text.lastIndexOf(dialogMarker) > -1
                        ? text.lastIndexOf(dialogMarker) + dialogMarker.length
                        : -1,
                    text.lastIndexOf(charMarker) > -1
                        ? text.lastIndexOf(charMarker) +
                              text.indexOf(
                                  '\n\n',
                                  text.lastIndexOf(charMarker),
                              ) +
                              2
                        : -1,
                    text.lastIndexOf(masterMarker) > -1
                        ? text.lastIndexOf(masterMarker) +
                              text.indexOf(
                                  '\n\n',
                                  text.lastIndexOf(masterMarker),
                              ) +
                              2
                        : -1,
                );

                if (lastKnownIndex > -1) {
                    savedText = text.substring(lastKnownIndex).trim();
                }
            }

            if (this.selectedNode.data?.sceneData) {
                if (this.selectedNode.data.sceneData.prompt !== undefined) {
                    this.selectedNode.data.sceneData.prompt = savedText;
                } else if (
                    this.selectedNode.data.sceneData.visualPrompt !== undefined
                ) {
                    this.selectedNode.data.sceneData.visualPrompt = savedText;
                } else if (
                    this.selectedNode.data.sceneData.imagePrompt !== undefined
                ) {
                    this.selectedNode.data.sceneData.imagePrompt = savedText;
                } else {
                    this.selectedNode.data.sceneData.prompt = savedText;
                }
                // Luôn cập nhật .data.prompt để UI Sticky note nhận diện
                this.selectedNode.data.prompt = savedText;
            } else {
                if (!this.selectedNode.data) this.selectedNode.data = {};
                this.selectedNode.data.text = savedText;
                this.selectedNode.data.prompt = savedText;
            }
            this.saveProject();
        }
    }

    onScenePromptChange(node: any, text: string) {
        if (node.data) {
            node.data.prompt = text;
            if (node.data.sceneData) {
                node.data.sceneData.prompt = text;
            }
        }
        this.saveProject();
    }

    addSceneNode() {
        const dialogRef = this.dialog.open(AddSceneComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            disableClose: true,
            data: {
                selectedClip: null,
                prompt: '',
                characters: this.projectData?.characters || [],
                masterPrompt: this.projectData?.masterPrompt || '',
                availableClips: [],
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.selectedClip && result.prompt) {
                const clip = result.selectedClip;
                const newId = `scene_${Date.now()}`;

                const newNode: NodeItem = {
                    id: newId,
                    type: 'video',
                    title: 'Scene Mới',
                    subtitle: 'Video',
                    x: 150,
                    y: 150,
                    inputs: [],
                    outputs: ['out'],
                    data: {
                        text: clip.description,
                        sceneData: {
                            prompt: result.prompt,
                            script: clip.description,
                        },
                        showOnCanvas: true,
                        projectCharacters: this.projectData?.characters || [],
                    },
                    baseX: 150,
                    baseY: 150,
                };

                if (this.nodes.length > 0) {
                    const lastNode = this.nodes[this.nodes.length - 1];
                    newNode.x = lastNode.x + 350;
                    newNode.y = lastNode.y + (Math.random() * 200 - 100);
                    newNode.baseX = newNode.x;
                    newNode.baseY = newNode.y;
                }

                this.nodes.push(newNode);
                this.selectedNode = newNode;
                this.calculateCanvasSize();
                this.saveEditorState();
            }
        });
    }

    toggleCharacter(index: number) {
        if (this.expandedCharIndex === index) {
            this.expandedCharIndex = null;
        } else {
            this.expandedCharIndex = index;
        }
    }

    filterModels(query: string) {
        if (!query) {
            this.filteredModels = [...this.availableModels];
        } else {
            const lowerQuery = query.toLowerCase();
            const matchedFromApi = this.availableModels.filter((m) =>
                m.toLowerCase().includes(lowerQuery),
            );

            // Auto-suggest models that have hints (i.e. documented) even if not in API yet
            const matchedFromHints = Object.keys(MODEL_HINTS).filter(
                (hintKey) =>
                    hintKey.toLowerCase().includes(lowerQuery) &&
                    !this.availableModels.some(
                        (m) => m.toLowerCase() === hintKey.toLowerCase(),
                    ),
            );

            this.filteredModels = [...matchedFromApi, ...matchedFromHints];
        }
        this.filteredModelGroups = this.groupModels(this.filteredModels);
    }

    groupModels(models: string[]): { name: string; models: string[] }[] {
        const textModels = [];
        const imageModels = [];
        const videoModels = [];
        const otherModels = [];

        for (const m of models) {
            const lower = m.toLowerCase();
            if (
                lower.includes('dall-e') ||
                lower.includes('midjourney') ||
                lower.includes('stable-diffusion') ||
                lower.includes('imagen') ||
                lower.includes('flux')
            ) {
                imageModels.push(m);
            } else if (
                lower.includes('sora') ||
                lower.includes('runway') ||
                lower.includes('pika') ||
                lower.includes('luma') ||
                lower.includes('kling') ||
                lower.includes('video')
            ) {
                videoModels.push(m);
            } else if (
                lower.includes('gpt') ||
                lower.includes('claude') ||
                lower.includes('gemini') ||
                lower.includes('llama') ||
                lower.includes('mixtral') ||
                lower.includes('qwen') ||
                lower.includes('deepseek')
            ) {
                textModels.push(m);
            } else {
                otherModels.push(m);
            }
        }

        const groups = [];
        if (textModels.length)
            groups.push({ name: 'Text / Ngôn ngữ', models: textModels });
        if (imageModels.length)
            groups.push({ name: 'Hình ảnh', models: imageModels });
        if (videoModels.length)
            groups.push({ name: 'Video', models: videoModels });
        if (otherModels.length)
            groups.push({ name: 'Khác', models: otherModels });
        return groups;
    }

    trimModel(m: string): string {
        if (!m) return 'Chưa chọn';
        return m.length > 14 ? m.substring(0, 14) + '...' : m;
    }

    activateModality(modality: 'IMAGE' | 'VIDEO', inputEl: HTMLInputElement) {
        this.globalActiveModality = modality;
        this.isModelInputFocused = true;
        this.modelSearchValue = '';
        this.filterModels('');
        setTimeout(() => inputEl.focus(), 50);
    }

    onModelInputBlur() {
        setTimeout(() => {
            this.isModelInputFocused = false;
            this.cdr.detectChanges();
        }, 250);
    }

    onModelSelected(model: string) {
        if (this.globalActiveModality === 'VIDEO') {
            this.selectedVideoModel = model;
        } else {
            this.selectedModel = model;
        }

        // Tự động dùng luôn model vừa chọn (không lưu vào profile hay localStorage)
        this.submitPrompt(false, this.globalActiveModality);
    }

    async toggleUsePreviousFrame() {
        if (
            this.selectedNode &&
            this.selectedNode.type === 'video' &&
            this.selectedNode.data
        ) {
            if (!this.selectedNode.data.sceneData) return;

            if (!this.selectedNode.data.sceneData.videos) {
                this.selectedNode.data.sceneData.videos = [{}];
            }
            if (this.selectedNode.data.sceneData.videos.length === 0) {
                this.selectedNode.data.sceneData.videos.push({});
            }

            const videoObj = this.selectedNode.data.sceneData.videos[0];
            videoObj.usePreviousSceneFrame = !videoObj.usePreviousSceneFrame;

            if (videoObj.usePreviousSceneFrame) {
                let prevNode = null;
                const incomingConn = this.connections.find(
                    (c) => c.toNode === this.selectedNode!.id,
                );
                if (incomingConn) {
                    prevNode = this.nodes.find(
                        (x) => x.id === incomingConn.fromNode,
                    );
                }
                if (!prevNode || prevNode.type !== 'video') {
                    prevNode = this.nodes.find(
                        (x) =>
                            x.type === 'video' &&
                            x.data?.sceneIndex ===
                                this.selectedNode!.data.sceneIndex - 1,
                    );
                }

                let previousVideoUrl =
                    prevNode?.data?.videoUrl ||
                    prevNode?.data?.sceneData?.videos?.[0]?.videoUrl;
                let previousImageUrl =
                    prevNode?.data?.imageUrl ||
                    prevNode?.data?.thumbnailUrl ||
                    prevNode?.data?.sceneData?.imageUrl;

                let finalUrl = '';

                if (previousVideoUrl) {
                    try {
                        this.toastr.info(
                            'Đang trích xuất khung hình từ cảnh trước...',
                            'Hệ thống',
                        );
                        let cleanUrl = previousVideoUrl.replace('file://', '');
                        if (
                            typeof cleanUrl !== 'string' &&
                            (cleanUrl as any)
                                .changingThisBreaksApplicationSecurity
                        ) {
                            cleanUrl = (
                                cleanUrl as any
                            ).changingThisBreaksApplicationSecurity.replace(
                                'file://',
                                '',
                            );
                        }

                        const electron = (window as any).electron;
                        if (!electron || !electron.extractLastFrame) {
                            this.toastr.error(
                                'Lỗi cấu hình. Yêu cầu App Desktop (Electron).',
                            );
                            videoObj.usePreviousSceneFrame = false;
                            return;
                        }

                        // @ts-ignore
                        const extractResult =
                            await electron.extractLastFrame(cleanUrl);
                        if (extractResult && extractResult.success) {
                            if (extractResult.base64) {
                                finalUrl =
                                    'data:image/png;base64,' +
                                    extractResult.base64;
                            } else if (extractResult.path) {
                                let properPath = extractResult.path.replace(
                                    /\\/g,
                                    '/',
                                );
                                if (!properPath.startsWith('/'))
                                    properPath = '/' + properPath;
                                finalUrl = 'file://' + properPath;
                            }
                        } else {
                            this.toastr.error(
                                'Không thể trích xuất khung hình từ video trước.',
                            );
                            videoObj.usePreviousSceneFrame = false;
                            return;
                        }
                    } catch (e) {
                        this.toastr.error('Lỗi khi trích xuất khung hình.');
                        videoObj.usePreviousSceneFrame = false;
                        console.error(e);
                        return;
                    }
                } else if (previousImageUrl) {
                    // Fallback to image if video is not available
                    finalUrl = previousImageUrl;
                    this.toastr.info(
                        'Đã lấy hình ảnh từ cảnh trước để kế thừa.',
                        'Hệ thống',
                    );
                } else {
                    this.toastr.warning(
                        'Cảnh trước chưa có Hình ảnh/Video để kế thừa!',
                    );
                    videoObj.usePreviousSceneFrame = false;
                    return;
                }

                if (finalUrl) {
                    this.selectedNode.data.imageUrl = finalUrl;
                    // Update thumbnail explicitly to show in UI
                    this.selectedNode.data.thumbnailUrl = finalUrl;

                    // Clear existing video so the UI can show the new extracted image frame
                    this.selectedNode.data.isVideo = false;
                    this.selectedNode.data.videoUrl = null;
                    if (this.selectedNode.data.sceneData?.videos?.length > 0) {
                        this.selectedNode.data.sceneData.videos[0].videoUrl =
                            null;
                    }

                    const constraintMsg =
                        '\n\n[MANDATORY: Seamless continuous motion from previous frame. NO teleportation. NO cuts.]';
                    let prompt =
                        this.selectedNode.data.prompt ||
                        this.selectedNode.data.sceneData?.prompt ||
                        this.selectedNode.data.sceneData?.visualPrompt ||
                        '';
                    if (
                        prompt &&
                        !prompt.includes(
                            'Seamless continuous motion from previous frame',
                        )
                    ) {
                        prompt += constraintMsg;
                    } else if (!prompt) {
                        prompt = constraintMsg.trim();
                    }

                    if (this.selectedNode.data.sceneData) {
                        if (
                            this.selectedNode.data.sceneData.prompt !==
                            undefined
                        ) {
                            this.selectedNode.data.sceneData.prompt = prompt;
                        } else {
                            this.selectedNode.data.sceneData.visualPrompt =
                                prompt;
                        }
                    }
                    this.selectedNode.data.prompt = prompt;
                    this.selectNode(this.selectedNode);
                    this.saveProject();
                    if (previousVideoUrl) {
                        this.toastr.success(
                            'Đã trích xuất và gán khung hình nối tiếp thành công!',
                        );
                    }
                }
            } else {
                const constraintMsg =
                    '\n\n[MANDATORY: Seamless continuous motion from previous frame. NO teleportation. NO cuts.]';
                let prompt =
                    this.selectedNode.data.prompt ||
                    this.selectedNode.data.sceneData?.prompt ||
                    this.selectedNode.data.sceneData?.visualPrompt ||
                    '';

                if (prompt.includes(constraintMsg)) {
                    prompt = prompt.replace(constraintMsg, '');
                } else if (prompt.includes(constraintMsg.trim())) {
                    prompt = prompt.replace(constraintMsg.trim(), '');
                }

                if (this.selectedNode.data.sceneData) {
                    if (this.selectedNode.data.sceneData.prompt !== undefined) {
                        this.selectedNode.data.sceneData.prompt = prompt;
                    } else {
                        this.selectedNode.data.sceneData.visualPrompt = prompt;
                    }
                }
                this.selectedNode.data.prompt = prompt;
                this.selectedNode.data.imageUrl = null;
                this.selectedNode.data.thumbnailUrl = null;
                this.selectNode(this.selectedNode);
                this.saveProject();
            }
            this.saveProject();
            this.cdr.detectChanges();
        }
    }

    attachedFiles: {
        file: File;
        base64: string;
        mimeType: string;
        url: string;
        referenceType?: string;
    }[] = [];
    pendingFileType: string = 'image';

    @ViewChild('hiddenFileInput') hiddenFileInput!: ElementRef;

    triggerFileInput(type: string) {
        this.pendingFileType = type;
        if (this.hiddenFileInput) {
            this.hiddenFileInput.nativeElement.click();
        }
    }

    onFileSelected(event: any) {
        const files = event.target.files;
        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const reader = new FileReader();
                reader.onload = () => {
                    const base64String = (reader.result as string).split(
                        ',',
                    )[1];
                    this.attachedFiles.push({
                        file: file,
                        base64: base64String,
                        mimeType: file.type,
                        url: reader.result as string,
                        referenceType: this.pendingFileType,
                    });
                };
                reader.readAsDataURL(file);
            }
        }
        // reset input
        if (this.hiddenFileInput) {
            this.hiddenFileInput.nativeElement.value = '';
        }
    }

    removeAttachedFile(index: number) {
        this.attachedFiles.splice(index, 1);
    }

    getFirstFrame() {
        return this.attachedFiles.find(
            (f) => f.referenceType === 'START_FRAME',
        );
    }

    getLastFrame() {
        return this.attachedFiles.find((f) => f.referenceType === 'END_FRAME');
    }

    getRegularFiles() {
        return this.attachedFiles.filter(
            (f) =>
                f.referenceType !== 'START_FRAME' &&
                f.referenceType !== 'END_FRAME',
        );
    }

    hasFrameAttached() {
        return this.getFirstFrame() != null || this.getLastFrame() != null;
    }

    removeFileByRef(file: any) {
        const idx = this.attachedFiles.indexOf(file);
        if (idx > -1) {
            this.attachedFiles.splice(idx, 1);
        }
    }

    swapFrames() {
        const first = this.getFirstFrame();
        const last = this.getLastFrame();
        if (first) first.referenceType = 'END_FRAME';
        if (last) last.referenceType = 'START_FRAME';
    }

    openAudioGeneration(node?: NodeItem) {
        const targetNode = node || this.selectedNode;
        const isSpecificNode = !!targetNode;

        if (isSpecificNode && targetNode.type === 'tts') {
            if (
                targetNode.data?.sceneData &&
                Object.keys(targetNode.data.sceneData).length > 0
            ) {
                const sceneData = targetNode.data.sceneData;
                if (sceneData.subtitles) {
                    sceneData.subtitles.forEach(
                        (sub: any) => (sub.audioUrl = null),
                    );
                }
            } else {
                targetNode.data.audioUrl = null;
            }
        }

        const dialogRef = this.dialog.open(AudioGenerationComponent, {
            width: '400px',
            maxWidth: '100vw',
            data: {
                ...this.projectData,
                selectedModel: this.selectedModel,
                scenePrompt: targetNode?.data?.text || '',
                targetSceneIndex: isSpecificNode
                    ? targetNode.data.sceneIndex
                    : null,
                standaloneTTSNode:
                    isSpecificNode &&
                    targetNode.type === 'tts' &&
                    (!targetNode.data.sceneData ||
                        Object.keys(targetNode.data.sceneData).length === 0)
                        ? targetNode
                        : null,
            },
        });

        dialogRef.afterClosed().subscribe((data) => {
            if (data && data.action === 'start') {
                this.generateAudioInBackground(
                    data,
                    targetNode,
                    isSpecificNode,
                );
            } else if (data && !data.action) {
                // Backward compatibility
                this.projectData = data;
                this.saveEditorState();
                this.buildGraphFromData(this.projectData);
                this.cdr.detectChanges();
            }
        });
    }

    async generateAudioInBackground(
        config: any,
        targetNode: NodeItem,
        isSpecificNode: boolean,
    ) {
        const pendingSubs: {
            sub: any;
            sIdx: number;
            subIdx: number;
            globalIndex: number;
        }[] = [];
        let globalCounter = 0;

        // Gom dữ liệu
        if (
            isSpecificNode &&
            targetNode.type === 'tts' &&
            (!targetNode.data.sceneData ||
                Object.keys(targetNode.data.sceneData).length === 0)
        ) {
            targetNode.data.isGeneratingAudio = true;
            this.cdr.detectChanges();
            pendingSubs.push({
                sub: targetNode.data,
                sIdx: -1,
                subIdx: -1,
                globalIndex: 0,
            });
        } else if (this.projectData.scenes) {
            this.projectData.scenes.forEach((scene: any, sIdx: number) => {
                const targetSceneIndex = isSpecificNode
                    ? targetNode.data.sceneIndex
                    : null;
                if (
                    targetSceneIndex !== undefined &&
                    targetSceneIndex !== null &&
                    targetSceneIndex !== sIdx
                ) {
                    return;
                }
                if (targetSceneIndex === sIdx && targetNode) {
                    targetNode.data.isGeneratingAudio = true;
                }
                scene.subtitles.forEach((sub: any, subIdx: number) => {
                    if (!sub.audioUrl) {
                        pendingSubs.push({
                            sub,
                            sIdx,
                            subIdx,
                            globalIndex: globalCounter,
                        });
                    }
                    globalCounter++;
                });
            });
            this.cdr.detectChanges();
        }

        if (pendingSubs.length === 0) return;

        this.toastr.info(
            `Bắt đầu xử lý ${pendingSubs.length} mục...`,
            'System',
        );

        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        const isEdgeVoice = edgeVoices.includes(config.selectedVoice);
        const isTTSTypeVoice =
            config.selectedVoice.indexOf('tts.type.vn') !== -1;
        const concurrencyLimit = isEdgeVoice || isTTSTypeVoice ? 3 : 1;

        try {
            let currentIndex = 0;
            const worker = async () => {
                while (currentIndex < pendingSubs.length) {
                    const taskIndex = currentIndex++;
                    const item = pendingSubs[taskIndex];

                    await this.generateAudioForSub(
                        item.sub,
                        item.globalIndex,
                        config,
                    );

                    this.ngZone.run(() => {
                        this.saveEditorState();
                        this.buildGraphFromData(this.projectData);
                        this.cdr.detectChanges();
                    });
                }
            };

            const workers = [];
            for (let i = 0; i < concurrencyLimit; i++) {
                workers.push(worker());
            }
            await Promise.all(workers);

            this.ngZone.run(() => {
                this.nodes.forEach((n) => {
                    if (n.data) n.data.isGeneratingAudio = false;
                });
                if (this.projectData.scenes) {
                    this.projectData.scenes.forEach((scene: any) => {
                        scene.subtitles.forEach((sub: any) => {
                            sub.isGeneratingAudio = false;
                        });
                    });
                }

                const hasErrors = pendingSubs.some((item) => item.sub.hasError);
                if (hasErrors) {
                    this.toastr.warning(
                        'Quá trình hoàn tất nhưng có lỗi xảy ra ở một số tiến trình.',
                    );
                } else {
                    this.toastr.success('Đã hoàn tất quá trình tạo audio!');
                }
                this.saveEditorState();
                this.buildGraphFromData(this.projectData);
                this.cdr.detectChanges();
            });
        } catch (err) {
            this.ngZone.run(() => {
                this.nodes.forEach((n) => {
                    if (n.data) n.data.isGeneratingAudio = false;
                });
                console.error('Concurrency processing error:', err);
                this.toastr.error(
                    'Có lỗi xảy ra trong quá trình xử lý liên tục.',
                );
                this.cdr.detectChanges();
            });
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

    async generateAudioForSub(
        sub: any,
        globalIndex: number,
        config: any,
    ): Promise<void> {
        return new Promise(async (resolve) => {
            if (!sub.text || !sub.text.trim()) {
                resolve();
                return;
            }
            if (!(window as any).electron || !(window as any).electron.invoke) {
                this.toastr.error('Cần chạy trên App Desktop (Electron).');
                resolve();
                return;
            }

            const username = this.projectData.username || 'anonymous';
            const subPath = `${username}/${this.projectData.uuid || 'default'}`;
            const prefix = (globalIndex >= 0 ? globalIndex + 1 : 0)
                .toString()
                .padStart(3, '0');
            const slug = this.toSlug(sub.text.substring(0, 50));

            const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
            const isEdgeVoice = edgeVoices.includes(config.selectedVoice);

            let res: any;
            try {
                if (isEdgeVoice) {
                    const niceFilename = `${prefix}_${slug}`;
                    const payload = {
                        text: sub.text,
                        voice: config.selectedVoice,
                        rate: config.selectedRate,
                        pitch: config.selectedPitch,
                        filename: niceFilename,
                        username: subPath,
                    };
                    res = await (window as any).electron.invoke(
                        'tts-generate',
                        payload,
                    );
                } else {
                    const isTTSTypeVoice =
                        config.selectedVoice.endsWith('tts.type.vn');
                    const isAusyncVoice =
                        config.selectedVoice.endsWith('ausynclab.io');

                    if (isTTSTypeVoice) {
                        const voice_id = config.selectedVoice.replace(
                            '-tts.type.vn',
                            '',
                        );
                        const niceFilename = `${prefix}_${slug}`;
                        const voice = await config.myvoices.filter(
                            (voice: any) =>
                                String(voice['id']) === String(voice_id),
                        );
                        let safeText = sub.text;
                        if (safeText.length < 150) {
                            safeText = safeText.replace(/[.!?\n]+/g, ', ');
                            safeText = safeText.replace(/,\s*$/, '').trim();
                        }
                        const payload = {
                            text: safeText,
                            voice_id: voice[0]['id'],
                            key: voice[0]['api_key'],
                            ref_audio_name: voice[0]['ref_audio_name'],
                            ref_text: voice[0]['ref_text'],
                            speed:
                                voice[0]['speed'] || config.selectedRate || 1.0,
                            num_step: voice[0]['num_step'] || 16,
                            filename: niceFilename,
                            username: subPath,
                        };
                        res = await (window as any).electron.invoke(
                            'tts-type-generate',
                            payload,
                        );
                    } else if (isAusyncVoice) {
                        const voice_id = config.selectedVoice.replace(
                            '-ausynclab.io',
                            '',
                        );
                        const niceFilename = `${prefix}_${slug}_ausync`;
                        const voice = await config.myvoices.filter(
                            (voice: any) =>
                                String(voice['id']) === String(voice_id),
                        );
                        const payload = {
                            text: sub.text,
                            voice_id: voice_id,
                            key: voice[0]['api_key'],
                            speed:
                                voice[0]['speed'] || config.selectedRate || 1.0,
                            filename: niceFilename,
                            username: subPath,
                        };
                        res = await (window as any).electron.invoke(
                            'tts-ausync-generate',
                            payload,
                        );
                    }
                }

                if (res && res.success !== false && !res.error) {
                    const rawPath = res.filePath || res.url || res.result;
                    if (rawPath) {
                        let finalAudioUrl = rawPath;
                        if (
                            !rawPath.startsWith('http://') &&
                            !rawPath.startsWith('https://') &&
                            !rawPath.startsWith('file://') &&
                            !rawPath.startsWith('media://')
                        ) {
                            finalAudioUrl = `file://${rawPath}`;
                        }
                        sub.audioUrl = finalAudioUrl;
                        if (
                            sub.sceneData &&
                            sub.sceneData.subtitles &&
                            sub.sceneData.subtitles.length > 0
                        ) {
                            sub.sceneData.subtitles[0].audioUrl = finalAudioUrl;
                        }
                        sub.hasError = false;
                        sub.errorMessage = '';
                    }
                } else {
                    let errorMsg = res?.error || 'Lỗi không xác định từ API';
                    if (
                        errorMsg.includes('CUDA error') ||
                        errorMsg.includes('device-side assert')
                    ) {
                        errorMsg =
                            'Hệ thống đang bị quá tải hoặc gặp sự cố phần cứng (GPU).';
                    }
                    console.error(
                        `Error processing sub ${sub.text}:`,
                        errorMsg,
                    );
                    this.toastr.error(`Lỗi tạo âm thanh: ${errorMsg}`);
                    sub.hasError = true;
                    sub.errorMessage = errorMsg;
                }
            } catch (err: any) {
                console.error(`Lỗi Electron cho sub ${sub.id}:`, err.message);
            } finally {
                resolve();
            }
        });
    }

    private safeUrlCache: { [url: string]: SafeUrl | string } = {};

    getSafeUrl(url: string | null): SafeUrl | string | null {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;

        let cleanUrl = url.replace('unsafe:', '');

        // Sử dụng cấu trúc media://SMART_FIND/ để Chromium phân tích URL hợp lệ có hostname
        if (cleanUrl.startsWith('file://')) {
            const originalPath = cleanUrl.replace('file://', '');
            cleanUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}`;
        }

        if (this.safeUrlCache[cleanUrl]) return this.safeUrlCache[cleanUrl];

        const safeUrl = this.sanitizer.bypassSecurityTrustUrl(cleanUrl);
        this.safeUrlCache[cleanUrl] = safeUrl;
        return safeUrl;
    }

    updateDuration(node: NodeItem, durationSec: number) {
        if (durationSec && !isNaN(durationSec)) {
            const m = Math.floor(durationSec / 60);
            const s = Math.floor(durationSec % 60);
            node.data.duration = `${m > 0 ? m + ':' : '00:'}${s.toString().padStart(2, '0')}`;
            this.cdr.detectChanges();
        }
    }

    onVideoLoaded(node: any, videoEl: HTMLVideoElement) {
        if (videoEl && videoEl.duration) {
            node.data.totalDuration = videoEl.duration;

            if (
                node.type === 'composition' ||
                node.id === 'comp1' ||
                node.id === 'comp_final' ||
                node.subtitle === 'Final Output' ||
                videoEl.duration > 20
            ) {
                node.data.videoStart = 0;
                node.data.videoEnd = videoEl.duration;
                node.data.sceneData = { forcedDuration: videoEl.duration };
                node.subtitle = `${Math.round(videoEl.duration)}s`;
                this.saveEditorState();
            } else {
                // Initialize start and end if not defined
                if (
                    node.data.videoStart === undefined ||
                    node.data.videoStart === null
                ) {
                    node.data.videoStart = 0;
                }
                if (
                    node.data.videoEnd === undefined ||
                    node.data.videoEnd === null
                ) {
                    node.data.videoEnd = videoEl.duration;
                }
            }

            // Initialize speed if not defined
            if (
                node.data.videoSpeed === undefined ||
                node.data.videoSpeed === null
            ) {
                node.data.videoSpeed = 1;
            }
            const speed = node.data.videoSpeed;
            videoEl.playbackRate = speed < 0 ? 1 / Math.abs(speed) : speed;

            // Seek to starting cut time so browser renders the start frame as poster thumbnail
            videoEl.currentTime = node.data.videoStart;

            this.updateNodeDurationAndSubtitle(node);
            this.cdr.detectChanges();
        }
    }

    // Video timeline drag state variables
    private activeDragNode: any = null;
    private activeDragType: 'start' | 'end' | null = null;
    private activeDragVideoEl: HTMLVideoElement | null = null;
    private dragTrackWidth = 0;
    private dragTrackLeft = 0;

    onHandleMouseDown(
        event: MouseEvent,
        type: 'start' | 'end',
        node: any,
        trackEl: HTMLElement,
        videoEl: HTMLVideoElement,
    ) {
        event.stopPropagation();
        event.preventDefault();
        this.activeDragNode = node;
        this.activeDragType = type;
        this.activeDragVideoEl = videoEl;

        const rect = trackEl.getBoundingClientRect();
        this.dragTrackWidth = rect.width;
        this.dragTrackLeft = rect.left;

        const onMouseMove = (moveEvent: MouseEvent) => {
            this.handleTimelineDrag(moveEvent);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            this.activeDragNode = null;
            this.activeDragType = null;
            this.activeDragVideoEl = null;
            this.saveProject();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    onTimelineTrackMouseDown(
        event: MouseEvent,
        node: any,
        trackEl: HTMLElement,
        videoEl: HTMLVideoElement,
    ) {
        event.stopPropagation();
        event.preventDefault();

        const rect = trackEl.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = clickX / rect.width;
        const totalDur =
            node.data.totalDuration || node.data.sceneData?.forcedDuration || 5;
        const clickTime = percentage * totalDur;

        const distToStart = Math.abs(clickTime - (node.data.videoStart || 0));
        const distToEnd = Math.abs(
            clickTime -
                (node.data.videoEnd !== undefined
                    ? node.data.videoEnd
                    : totalDur),
        );

        const dragType = distToStart < distToEnd ? 'start' : 'end';
        this.activeDragNode = node;
        this.activeDragType = dragType;
        this.activeDragVideoEl = videoEl;
        this.dragTrackWidth = rect.width;
        this.dragTrackLeft = rect.left;

        this.updateTimelineValue(event.clientX);

        const onMouseMove = (moveEvent: MouseEvent) => {
            this.handleTimelineDrag(moveEvent);
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            this.activeDragNode = null;
            this.activeDragType = null;
            this.activeDragVideoEl = null;
            this.saveProject();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    private handleTimelineDrag(event: MouseEvent) {
        if (!this.activeDragNode || !this.activeDragType) return;
        this.updateTimelineValue(event.clientX);
    }

    private updateTimelineValue(clientX: number) {
        const node = this.activeDragNode;
        const type = this.activeDragType;
        const totalDuration =
            node.data.totalDuration || node.data.sceneData?.forcedDuration || 5;

        let relativeX = clientX - this.dragTrackLeft;
        relativeX = Math.max(0, Math.min(this.dragTrackWidth, relativeX));
        const percentage = relativeX / this.dragTrackWidth;
        let newTime = parseFloat((percentage * totalDuration).toFixed(1));

        if (type === 'start') {
            const currentEnd =
                node.data.videoEnd !== undefined
                    ? node.data.videoEnd
                    : totalDuration;
            newTime = Math.min(newTime, currentEnd - 0.5);
            node.data.videoStart = Math.max(0, newTime);
            if (this.activeDragVideoEl) {
                this.activeDragVideoEl.currentTime = node.data.videoStart;
            }
        } else if (type === 'end') {
            const currentStart =
                node.data.videoStart !== undefined ? node.data.videoStart : 0;
            newTime = Math.max(newTime, currentStart + 0.5);
            node.data.videoEnd = Math.min(totalDuration, newTime);
            if (this.activeDragVideoEl) {
                this.activeDragVideoEl.currentTime = node.data.videoEnd;
            }
        }

        this.updateNodeDurationAndSubtitle(node);
        this.cdr.detectChanges();
    }

    changeVideoSpeed(node: any, speed: any, videoEl: HTMLVideoElement) {
        const numSpeed = Number(speed) || 1;
        node.data.videoSpeed = numSpeed;
        if (videoEl) {
            const actualSpeed =
                numSpeed < 0 ? 1 / Math.abs(numSpeed) : numSpeed;
            videoEl.playbackRate = actualSpeed;
        }
        this.updateNodeDurationAndSubtitle(node);
        this.saveProject();
    }

    updateNodeDurationAndSubtitle(node: any) {
        if (node.data && node.data.sceneData) {
            const start =
                node.data.videoStart !== undefined ? node.data.videoStart : 0;
            const totalDur =
                node.data.totalDuration ||
                node.data.sceneData?.forcedDuration ||
                5;
            const end =
                node.data.videoEnd !== undefined
                    ? node.data.videoEnd
                    : totalDur;
            const speed = node.data.videoSpeed || 1;

            const actualSpeed = speed < 0 ? 1 / Math.abs(speed) : speed;
            node.data.sceneData.forcedDuration = parseFloat(
                ((end - start) / actualSpeed).toFixed(1),
            );
            node.subtitle = `${Math.round(node.data.sceneData.forcedDuration)}s`;
        }
    }

    onVideoTimeUpdate(node: any, videoEl: HTMLVideoElement) {
        if (
            node.type === 'composition' ||
            node.id === 'comp1' ||
            node.id === 'comp_final' ||
            node.subtitle === 'Final Output' ||
            (videoEl && videoEl.duration > 20)
        ) {
            if (videoEl && videoEl.duration && !isNaN(videoEl.duration)) {
                if (
                    node.data.totalDuration !== videoEl.duration ||
                    node.data.videoEnd !== videoEl.duration
                ) {
                    node.data.totalDuration = videoEl.duration;
                    node.data.videoStart = 0;
                    node.data.videoEnd = videoEl.duration;
                    node.data.sceneData = { forcedDuration: videoEl.duration };
                    node.subtitle = `${Math.round(videoEl.duration)}s`;
                    this.cdr.detectChanges();
                    this.saveEditorState();
                }
            }
            this.cdr.detectChanges();
            return;
        }

        const start =
            node.data.videoStart !== undefined ? node.data.videoStart : 0;
        const end =
            node.data.videoEnd !== undefined
                ? node.data.videoEnd
                : node.data.totalDuration || videoEl.duration || 5;

        if (videoEl.currentTime < start) {
            videoEl.currentTime = start;
        }
        if (videoEl.currentTime > end) {
            videoEl.pause();
            videoEl.currentTime = start;
        }
        this.cdr.detectChanges();
    }

    getPlayheadPercent(node: any, videoEl: HTMLVideoElement): number {
        const start =
            node.data.videoStart !== undefined ? node.data.videoStart : 0;
        let end =
            node.data.videoEnd !== undefined
                ? node.data.videoEnd
                : node.data.totalDuration || videoEl.duration || 5;

        if (
            node.type === 'composition' ||
            node.id === 'comp1' ||
            node.id === 'comp_final' ||
            node.subtitle === 'Final Output' ||
            (videoEl && videoEl.duration > 20)
        ) {
            end = videoEl.duration || node.data.totalDuration || 5;
        }

        const total =
            node.data.totalDuration || node.data.sceneData?.forcedDuration || 5;

        const current = Math.max(
            start,
            Math.min(end, videoEl.currentTime || 0),
        );
        return (current / total) * 100;
    }

    getPlayheadPercentInsideGreen(
        node: any,
        videoEl: HTMLVideoElement,
    ): number {
        const start =
            node.data.videoStart !== undefined ? node.data.videoStart : 0;
        let end =
            node.data.videoEnd !== undefined
                ? node.data.videoEnd
                : node.data.totalDuration || videoEl.duration || 5;

        if (
            node.type === 'composition' ||
            node.id === 'comp1' ||
            node.id === 'comp_final' ||
            node.subtitle === 'Final Output' ||
            (videoEl && videoEl.duration > 20)
        ) {
            end = videoEl.duration || node.data.totalDuration || 5;
        }

        const range = end - start;
        if (range <= 0) return 0;

        const current = Math.max(
            start,
            Math.min(end, videoEl.currentTime || 0),
        );
        return ((current - start) / range) * 100;
    }

    getConnectedVideoNodes(compositionNodeId: string): any[] {
        const visited = new Set<string>();
        const tempVisited = new Set<string>();
        const sortedNodes: any[] = [];

        const reachable = new Set<string>();
        const queue = [compositionNodeId];
        const backwardAdj = new Map<string, string[]>();

        this.connections.forEach((c) => {
            if (!backwardAdj.has(c.toNode)) {
                backwardAdj.set(c.toNode, []);
            }
            backwardAdj.get(c.toNode)!.push(c.fromNode);
        });

        let head = 0;
        while (head < queue.length) {
            const curr = queue[head++];
            reachable.add(curr);
            const parents = backwardAdj.get(curr) || [];
            parents.forEach((p) => {
                if (!queue.includes(p)) {
                    queue.push(p);
                }
            });
        }

        const forwardAdj = new Map<string, string[]>();
        this.connections.forEach((c) => {
            if (reachable.has(c.fromNode) && reachable.has(c.toNode)) {
                if (!forwardAdj.has(c.fromNode)) {
                    forwardAdj.set(c.fromNode, []);
                }
                forwardAdj.get(c.fromNode)!.push(c.toNode);
            }
        });

        const visit = (nodeId: string) => {
            if (tempVisited.has(nodeId)) {
                return;
            }
            if (!visited.has(nodeId)) {
                tempVisited.add(nodeId);
                const children = forwardAdj.get(nodeId) || [];
                children.forEach((childId) => visit(childId));
                tempVisited.delete(nodeId);
                visited.add(nodeId);

                const nodeObj = this.nodes.find((n) => n.id === nodeId);
                if (
                    nodeObj &&
                    nodeId !== compositionNodeId &&
                    (nodeObj.type === 'video' || nodeObj.type === 'composition')
                ) {
                    sortedNodes.unshift(nodeObj);
                }
            }
        };

        const hasIncoming = new Set<string>();
        this.connections.forEach((c) => {
            if (reachable.has(c.toNode)) {
                hasIncoming.add(c.toNode);
            }
        });

        reachable.forEach((nodeId) => {
            if (!hasIncoming.has(nodeId)) {
                visit(nodeId);
            }
        });

        reachable.forEach((nodeId) => {
            if (!visited.has(nodeId)) {
                visit(nodeId);
            }
        });

        return sortedNodes;
    }

    async renderFinalOutput(node: any, event: MouseEvent) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        const videoNodes = this.getConnectedVideoNodes(node.id).filter(
            (n) => n.data?.videoUrl,
        );

        if (videoNodes.length === 0) {
            this.toastr.warning(
                'Không tìm thấy video nào được kết nối đến khối Final Output. Hãy kết nối các khối video của bạn!',
            );
            return;
        }

        const videosData = videoNodes.map((n) => {
            const connectedAudios = this.connections
                .filter((c) => c.toNode === n.id)
                .map((c) =>
                    this.nodes.find((nodeObj) => nodeObj.id === c.fromNode),
                )
                .filter(
                    (nodeObj) =>
                        nodeObj &&
                        nodeObj.type === 'tts' &&
                        nodeObj.data?.audioUrl,
                )
                .map((nodeObj) => nodeObj.data.audioUrl);

            return {
                videoUrl: n.data.videoUrl,
                videoStart:
                    n.data.videoStart !== undefined ? n.data.videoStart : 0,
                videoEnd:
                    n.data.videoEnd !== undefined
                        ? n.data.videoEnd
                        : n.data.totalDuration || 5,
                videoSpeed: n.data.videoSpeed || 1,
                title: n.title || 'scene',
                audios: connectedAudios,
            };
        });

        node.data.isGenerating = true;
        this.cdr.detectChanges();
        this.toastr.info('Đang chuẩn bị render và ghép video...');

        try {
            const res = await (window as any).electron.invoke(
                'render-final-composition',
                {
                    projectTitle: this.projectData?.title || 'final_video',
                    projectUuid: this.uuid,
                    aspectRatio:
                        this.projectData?.settings?.aspectRatio || '16:9',
                    videos: videosData,
                },
            );

            node.data.isGenerating = false;
            this.cdr.detectChanges();

            if (res && res.success) {
                this.toastr.success('Ghép video thành công!');

                // Force the video element to reload by clearing it temporarily
                node.data.videoUrl = '';
                this.cdr.detectChanges();

                setTimeout(() => {
                    node.data.videoUrl =
                        'file://' + res.path + '?t=' + Date.now();
                    node.data.isVideo = true;
                    node.data.imageUrl = '';

                    // Clear any old boundaries so that the video element's duration determines them on load
                    delete node.data.totalDuration;
                    delete node.data.videoStart;
                    delete node.data.videoEnd;

                    this.cdr.detectChanges();
                    this.saveEditorState();
                }, 50);

                if (res.path) {
                    (window as any).electron.invoke('open-file-path', res.path);
                }
            } else {
                this.toastr.error(
                    'Lỗi render: ' + (res?.error || 'Không rõ nguyên nhân'),
                );
            }
        } catch (err: any) {
            node.data.isGenerating = false;
            this.cdr.detectChanges();
            this.toastr.error('Lỗi ghép video: ' + err.message);
        }
    }

    onAudioError(event: any, node: NodeItem) {
        if (!node.data.audioUrl) return;
        console.error('Lỗi tải Audio:', event);
        console.error('URL thực tế trong thẻ audio:', event.target?.src);
        console.error('URL gốc trong node.data:', node.data.audioUrl);
        const errorMsg = event.target?.error
            ? ` (Mã lỗi: ${event.target.error.code})`
            : '';
        this.toastr.error(
            `Lỗi tải âm thanh từ: ${node.data.audioUrl}${errorMsg}`,
        );
    }

    toggleAudio(node: NodeItem, audioEl: HTMLAudioElement, event: Event) {
        if (!node.data.audioUrl || !audioEl) return;
        event.stopPropagation();

        if (audioEl.paused) {
            const playPromise = audioEl.play();
            if (playPromise !== undefined) {
                playPromise.catch((error) => {
                    console.error('Audio playback error:', error);
                    this.toastr.error(
                        'Không thể phát âm thanh: ' + error.message,
                    );
                });
            }
        } else {
            audioEl.pause();
        }
        this.cdr.detectChanges();
    }

    openMagicPromptDialog() {
        const dialogRef = this.dialog.open(MagicPromptDialogComponent, {
            width: '500px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            data: {
                currentPrompt: this.globalPromptText,
                type: this.editingType,
                selectedModel: this.selectedModel,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                this.updatePrompt(result);
            }
        });
    }

    openAddCharacter() {
        this.selectedNode = null;
        const dialogRef = this.dialog.open(CharacterDialogComponent, {
            width: '800px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            disableClose: true,
            data: {
                char: null,
                index: -1,
                projectUuid: this.uuid,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result) {
                if (!this.projectData) this.projectData = {};
                if (!this.projectData.characters)
                    this.projectData.characters = [];
                this.projectData.characters.push(result);
                this.saveProject();
            }
        });
    }

    insertCharacterToPrompt(char: any) {
        this.selectedNode = null;
        this.editingType = 'character';
        this.editingCharacter = char;
        this.activeCharacters = [char];

        let parts = [];
        if (char.name) parts.push(`Name: ${char.name}`);
        if (char.variant) parts.push(`Variant: ${char.variant}`);
        if (char.role) parts.push(`Role: ${char.role}`);
        if (char.appearance) parts.push(`Appearance: ${char.appearance}`);
        if (char.personality) parts.push(`Personality: ${char.personality}`);
        if (char.prompt) parts.push(`Prompt: ${char.prompt}`);
        let charDesc = parts.join('\n');
        if (!charDesc) charDesc = `Portrait of ${char.name}`;

        this.globalPromptText = charDesc;
        this.saveProject();
    }

    async onNodeVisualDoubleClick(event: MouseEvent, node: NodeItem) {
        if (node.type !== 'video' && node.type !== 'composition') return;
        event.stopPropagation();
        event.preventDefault();

        if (!(window as any).electron || !(window as any).electron.invoke) {
            this.toastr.warning('Chỉ hỗ trợ trên ứng dụng Desktop.');
            return;
        }

        try {
            const filePath = await (window as any).electron.invoke(
                'select-video-file',
            );

            if (filePath) {
                const safeUrl = `file://${filePath.replace(/\\/g, '/')}`;

                node.data.videoUrl = safeUrl;
                node.data.isVideo = true;

                if ((window as any).electron.extractLastFrame) {
                    const thumbRes = await (
                        window as any
                    ).electron.extractLastFrame(filePath);
                    if (thumbRes && thumbRes.success) {
                        if (thumbRes.path) {
                            node.data.imageUrl = `file://${thumbRes.path.replace(/\\/g, '/')}`;
                        } else if (thumbRes.base64) {
                            node.data.imageUrl = `data:image/jpeg;base64,${thumbRes.base64}`;
                        }
                    }
                }

                if (node.data.sceneData && node.data.sceneData.videos) {
                    if (node.data.sceneData.videos.length === 0) {
                        node.data.sceneData.videos.push({});
                    }
                    node.data.sceneData.videos[0].videoUrl = safeUrl;
                    node.data.sceneData.videos[0].imageUrl = node.data.imageUrl;
                }

                this.saveProject();
                this.cdr.detectChanges();
                this.toastr.success('Đã import video thành công!');
            }
        } catch (e) {
            console.error('Lỗi khi import video:', e);
            this.toastr.error('Có lỗi xảy ra khi import video.');
        }
    }

    insertVoiceTag() {
        if (this.editingType === 'none') return;

        let subtitleText = '';
        if (
            this.selectedNode &&
            this.selectedNode.type === 'video' &&
            this.selectedNode.data?.sceneData?.subtitles?.length > 0
        ) {
            subtitleText =
                this.selectedNode.data.sceneData.subtitles[0].text || '';
        } else if (
            this.selectedNode &&
            this.selectedNode.type === 'tts' &&
            this.selectedNode.data?.text
        ) {
            subtitleText = this.selectedNode.data.text;
        }

        let charName = 'Tên Nhân Vật';
        if (
            this.projectData &&
            this.projectData.characters &&
            this.projectData.characters.length > 0
        ) {
            charName = this.projectData.characters[0].name || charName;
        }

        let voiceTag = `\n[Voice: ${charName} - ]`;
        if (subtitleText && subtitleText.trim() !== '') {
            voiceTag = `\n[Voice: ${charName} - "${subtitleText.trim()}"]`;
        }

        if (!this.globalPromptText) {
            this.globalPromptText = voiceTag.trim();
        } else {
            this.globalPromptText += voiceTag;
        }
        this.updatePrompt(this.globalPromptText);
    }

    onAvatarDoubleClick(event: MouseEvent, char: any) {
        event.stopPropagation();
        event.preventDefault();
        if (char) {
            this.targetAvatarChar = char;
        } else if (this.editingType === 'character' && this.editingCharacter) {
            this.targetAvatarChar = this.editingCharacter;
        } else {
            return;
        }
        if (this.avatarFileInput?.nativeElement) {
            this.avatarFileInput.nativeElement.click();
        }
    }

    onAvatarFileSelected(event: any) {
        const file = event.target.files[0];
        if (file && this.targetAvatarChar) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                this.targetAvatarChar.avatarUrl = e.target.result;
                this.saveProject();
                this.targetAvatarChar = null;
                if (this.avatarFileInput?.nativeElement) {
                    this.avatarFileInput.nativeElement.value = '';
                }
            };
            reader.readAsDataURL(file);
        }
    }

    getUnusedCharacters(): any[] {
        if (!this.projectData?.characters) return [];

        const currentPromptText = (this.globalPromptText || '').toLowerCase();

        return this.projectData.characters.filter((c: any) => {
            if (!c.name) return false;
            return !currentPromptText.includes(c.name.toLowerCase());
        });
    }

    addCharacterToPrompt(char: any) {
        if (char && char.name) {
            const actionMatch =
                this.globalPromptText?.match(/Action\/Visuals:\s*/i);
            if (actionMatch) {
                const insertIndex = actionMatch.index! + actionMatch[0].length;
                this.globalPromptText =
                    this.globalPromptText.slice(0, insertIndex) +
                    char.name +
                    ' ' +
                    this.globalPromptText.slice(insertIndex);
            } else {
                if (
                    this.globalPromptText &&
                    !this.globalPromptText.endsWith(' ') &&
                    !this.globalPromptText.endsWith('\n')
                ) {
                    this.globalPromptText += ', ';
                }
                this.globalPromptText += char.name;
            }
            this.updatePrompt(this.globalPromptText);

            // Refresh the node to rebuild the Characters section with the new character's details
            if (this.selectedNode) {
                this.selectNode(this.selectedNode);
            }
        }
    }

    removeCharacterFromPrompt(char: any, event: Event) {
        event.stopPropagation();
        if (!this.selectedNode) return;

        const escapeRegExp = (string: string) =>
            string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const charNameEscaped = escapeRegExp(char.name);

        // Loại bỏ tên nhân vật và các dấu câu thừa xung quanh (như phẩy, khoảng trắng)
        const nameRegex = new RegExp(
            `[,\\s]*(?<=^|[^\\p{L}\\p{N}_])${charNameEscaped}(?=[^\\p{L}\\p{N}_]|$)[,\\s]*`,
            'giu',
        );

        const sd = this.selectedNode.data?.sceneData;

        if (sd) {
            if (sd.prompt !== undefined) {
                sd.prompt = sd.prompt.replace(nameRegex, ' ').trim();
                // Xóa dấu phẩy thừa ở cuối nếu có
                if (sd.prompt.endsWith(','))
                    sd.prompt = sd.prompt.slice(0, -1).trim();
            }
            if (sd.imagePrompt !== undefined) {
                sd.imagePrompt = sd.imagePrompt.replace(nameRegex, ' ').trim();
                if (sd.imagePrompt.endsWith(','))
                    sd.imagePrompt = sd.imagePrompt.slice(0, -1).trim();
            }
            if (sd.script !== undefined) {
                sd.script = sd.script.replace(nameRegex, ' ').trim();
            }
            if (sd.setting !== undefined) {
                sd.setting = sd.setting.replace(nameRegex, ' ').trim();
            }
        } else {
            if (this.selectedNode.data?.text) {
                this.selectedNode.data.text = this.selectedNode.data.text
                    .replace(nameRegex, ' ')
                    .trim();
                if (this.selectedNode.data.text.endsWith(','))
                    this.selectedNode.data.text = this.selectedNode.data.text
                        .slice(0, -1)
                        .trim();
            }
        }

        this.saveProject();
        this.selectNode(this.selectedNode);
    }

    onMouseMoveOutside(event: MouseEvent) {
        if (this.isPanning) {
            const dx = event.clientX - this.startX;
            const dy = event.clientY - this.startY;
            this.workspace.nativeElement.scrollLeft = this.startScrollLeft - dx;
            this.workspace.nativeElement.scrollTop = this.startScrollTop - dy;
        } else if (this.draggedNode) {
            const dx = (event.clientX - this.startX) / this.scale;
            const dy = (event.clientY - this.startY) / this.scale;
            let newX = this.nodeStartX + dx;
            let newY = this.nodeStartY + dy;

            const maxRadius = 50;
            if (
                this.draggedNode.baseX !== undefined &&
                this.draggedNode.baseY !== undefined
            ) {
                const dist = Math.sqrt(
                    Math.pow(newX - this.draggedNode.baseX, 2) +
                        Math.pow(newY - this.draggedNode.baseY, 2),
                );
                if (dist > maxRadius) {
                    const angle = Math.atan2(
                        newY - this.draggedNode.baseY,
                        newX - this.draggedNode.baseX,
                    );
                    newX = this.draggedNode.baseX + Math.cos(angle) * maxRadius;
                    newY = this.draggedNode.baseY + Math.sin(angle) * maxRadius;
                }
            }
            this.draggedNode.x = newX;
            this.draggedNode.y = newY;

            const el = document.getElementById(this.draggedNode.id);
            if (el) {
                el.style.left = newX + 'px';
                el.style.top = newY + 'px';
            }

            this.connections.forEach((conn) => {
                if (
                    conn.fromNode === this.draggedNode!.id ||
                    conn.toNode === this.draggedNode!.id
                ) {
                    conn.path = this.getConnectionPath(conn);
                    const cEl = document.getElementById('conn_' + conn.id);
                    if (cEl && conn.path) {
                        cEl.setAttribute('d', conn.path);
                    }
                }
            });
        } else if (this.draggedConnection) {
            const rect = this.workspace.nativeElement.getBoundingClientRect();
            const mouseX =
                (event.clientX -
                    rect.left +
                    this.workspace.nativeElement.scrollLeft) /
                this.scale;
            const mouseY =
                (event.clientY -
                    rect.top +
                    this.workspace.nativeElement.scrollTop) /
                this.scale;
            this.draggedConnection.toX = mouseX;
            this.draggedConnection.toY = mouseY;
            this.draggedConnection.path = this.getDraggedConnectionPath();

            const dEl = document.getElementById('dragged_conn');
            if (dEl && this.draggedConnection.path) {
                dEl.setAttribute('d', this.draggedConnection.path);
            }
        }
    }

    onMouseUpOutside() {
        this.ngZone.run(() => {
            if (this.draggedConnection) {
                if (this.hoveredInput) {
                    this.createConnection(
                        this.draggedConnection.fromNode,
                        this.draggedConnection.fromPort,
                        this.hoveredInput.node.id,
                        this.hoveredInput.port,
                    );
                } else if (this.hoveredNode) {
                    const fromObj = this.nodes.find(
                        (n) => n.id === this.draggedConnection!.fromNode,
                    );
                    let targetPort = null;

                    if (fromObj?.type === 'tts') {
                        targetPort = this.hoveredNode.inputs.includes('tts_in')
                            ? 'tts_in'
                            : null;
                    } else if (
                        fromObj?.type === 'video' ||
                        fromObj?.type === 'image'
                    ) {
                        if (
                            this.hoveredNode.type === 'video' ||
                            this.hoveredNode.type === 'image'
                        ) {
                            targetPort = this.hoveredNode.inputs.includes('in1')
                                ? 'in1'
                                : this.hoveredNode.inputs.includes(
                                        'prev_scene_in',
                                    )
                                  ? 'prev_scene_in'
                                  : this.hoveredNode.inputs.length > 0
                                    ? this.hoveredNode.inputs[0]
                                    : 'in1';
                        } else if (this.hoveredNode.type === 'composition') {
                            targetPort =
                                this.hoveredNode.inputs.length > 0
                                    ? this.hoveredNode.inputs[0]
                                    : null;
                        }
                    } else {
                        targetPort =
                            this.hoveredNode.inputs.length > 0
                                ? this.hoveredNode.inputs[0]
                                : null;
                    }

                    if (targetPort) {
                        this.createConnection(
                            this.draggedConnection.fromNode,
                            this.draggedConnection.fromPort,
                            this.hoveredNode.id,
                            targetPort,
                        );
                    }
                } else {
                    this.updateConnectionPaths();
                    this.saveEditorState();
                }
                this.draggedConnection = null;
                this.autoStashDisconnectedNodes(true);
            }

            if (this.draggedNode) {
                if (
                    this.draggedNode.x !== this.nodeStartX ||
                    this.draggedNode.y !== this.nodeStartY
                ) {
                    this.saveEditorState();
                }
            }

            this.isPanning = false;
            this.draggedNode = null;
            this.cdr.detectChanges();
        });
    }

    openDirectorMode(event?: Event) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        let promptText = '';
        let target = '';
        let aspectRatio = '16:9';

        if (this.selectedNode) {
            promptText =
                this.selectedNode.data?.sceneData?.prompt ||
                this.selectedNode.data?.sceneData?.visualPrompt ||
                this.selectedNode.data?.sceneData?.imagePrompt ||
                this.selectedNode.data?.text ||
                '';
            target = 'Apply to Scene';
            aspectRatio = this.selectedNode.data?.aspectRatio || '16:9';
        } else if (this.projectData) {
            promptText = this.projectData.masterPrompt || '';
            target = 'Apply to Master Prompt';
            aspectRatio = this.projectData.aspectRatio || '16:9';
        } else {
            return; // nothing to edit
        }

        const dialogRef = this.dialog.open(DirectorModeComponent, {
            width: '650px',
            maxWidth: '95vw',
            maxHeight: '90vh',
            data: {
                prompt: promptText,
                targetName: target,
                aspectRatio: aspectRatio,
            },
        });

        dialogRef.afterClosed().subscribe((result) => {
            if (result && result.prompt !== undefined) {
                let currentPrompt = promptText;
                currentPrompt = currentPrompt
                    .replace(/[\[\(](?:Director|Cinematography):.*?[\]\)]/g, '')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                if (result.prompt) {
                    if (currentPrompt) {
                        currentPrompt =
                            '(Cinematography: ' +
                            result.prompt +
                            ')\n\n' +
                            currentPrompt;
                    } else {
                        currentPrompt =
                            '(Cinematography: ' + result.prompt + ')';
                    }
                }

                if (this.selectedNode) {
                    this.selectedNode.data.prompt = currentPrompt;
                    if (this.selectedNode.data.sceneData) {
                        this.selectedNode.data.sceneData.prompt = currentPrompt;
                        this.selectedNode.data.sceneData.visualPrompt =
                            currentPrompt;
                    }
                    this.saveProject();
                    this.selectNode(this.selectedNode);
                } else if (this.projectData) {
                    this.projectData.masterPrompt = currentPrompt;
                    this.saveProject();
                    this.selectNode({ id: 'master', type: 'master' } as any);
                }
            }
        });
    }

    onWheel(event: WheelEvent) {
        // Only zoom if ctrl is pressed, otherwise native scroll works!
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const zoomIntensity = 0.03;
            const delta = event.deltaY > 0 ? -zoomIntensity : zoomIntensity;
            let newScale = this.scale + delta;
            // Restrict zoom out to 0.5x (50%) and zoom in to 1.5x (150%)
            newScale = Math.min(Math.max(0.5, newScale), 1.5);
            this.scale = newScale;
        }
    }

    onNodeMouseDown(event: MouseEvent, node: NodeItem) {
        event.stopPropagation();

        if (!node.data) node.data = {};
        node.data.showOnCanvas = true;

        this.draggedNode = node;
        const isNewSelection =
            this.selectedNode !== node || this.editingType !== 'scene';
        if (isNewSelection) {
            this.expandedCharIndex = null;
            this.selectNode(node);
        }
        this.startX = event.clientX;
        this.startY = event.clientY;
        this.nodeStartX = node.x;
        this.nodeStartY = node.y;
    }

    hasIncomingConnection(node: NodeItem | null): boolean {
        if (!node) return false;
        return this.connections.some((c) => c.toNode === node.id);
    }

    private getBase64FromImageUrl(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!url) {
                reject('Empty URL');
                return;
            }
            if (url.startsWith('data:image')) {
                resolve(url.split(',')[1]);
                return;
            }

            let finalUrl = url;
            if (
                !finalUrl.startsWith('http') &&
                !finalUrl.startsWith('data:') &&
                !finalUrl.startsWith('blob:') &&
                !finalUrl.startsWith('media://')
            ) {
                finalUrl = finalUrl.replace(/^unsafe:/, '');
                let originalPath = finalUrl.split('?')[0];
                originalPath = originalPath.replace(/^file:\/\//i, '');
                finalUrl = `media://SMART_FIND/?path=${encodeURIComponent(originalPath)}&dir=&uuid=default`;
            }

            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0);
                const dataURL = canvas.toDataURL('image/png');
                resolve(
                    dataURL.replace(/^data:image\/(png|jpg|jpeg);base64,/, ''),
                );
            };
            img.onerror = (error) => reject(error);
            img.src = finalUrl;
        });
    }
}
