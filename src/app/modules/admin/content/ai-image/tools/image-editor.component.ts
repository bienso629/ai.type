import {
    Component,
    ElementRef,
    Inject,
    OnInit,
    ViewChild,
    OnDestroy,
    HostListener,
    ChangeDetectionStrategy,
    ChangeDetectorRef,
} from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ToastrService } from 'ngx-toastr';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { GenaiService } from 'app/genai.service';
import {
    extractPromptFromImageBase64,
    extractPromptFromImageBytes,
} from './image-metadata.helper';

// --- INTERFACES ---
interface LayerBase {
    id: string;
    x: number;
    y: number;
    type: 'text' | 'logo';
}

interface TextObject extends LayerBase {
    type: 'text';
    content: string;
    fontFamily?: string;
    letterSpacing?: number;
    fontSize: number;
    rotation: number;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    isBold?: boolean;
    isItalic?: boolean;
    isUnderline?: boolean;
    color1: string;
    color2: string;
    isGradient: boolean;
    gradientAngle: number;
    gradientStops?: { color: string; offset: number }[];
    opacity: number;
    width?: number;
    height?: number;
    // Border
    hasBorder: boolean;
    borderColor: string;
    borderWidth: number;
    // Shadow
    hasShadow: boolean;
    shadowColor: string;
    shadowBlur: number;
    shadowX: number;
    shadowY: number;
}

interface LogoObject extends LayerBase {
    type: 'logo';
    src: string;
    scale: number;
    opacity: number;
    rotation: number;
    element?: HTMLImageElement;
    width?: number;
    height?: number;
}

interface EditorState {
    imageBase64: string;
    layers: (TextObject | LogoObject)[];
    zoomLevel: number;
    originalUrlCheck: string;
}

@Component({
    selector: 'app-image-editor-dialog',
    templateUrl: './image-editor.component.html',
    styles: [
        `
            :host {
                display: block;
                height: 95vh;
                width: 95vw;
            }
            mat-form-field {
                width: 100%;
            }
            textarea {
                min-height: 50px;
                line-height: 1.4;
            }
            #canvas-container::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            #canvas-container::-webkit-scrollbar-thumb {
                background: #cbd5e1;
                border-radius: 4px;
            }
            .pattern-checkered {
                background-image:
                    linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
                    linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
                    linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
                background-size: 20px 20px;
                background-position:
                    0 0,
                    0 10px,
                    10px -10px,
                    -10px 0px;
            }
            input[type='color'] {
                -webkit-appearance: none;
                border: none;
                padding: 0;
                background: none;
                overflow: hidden;
                min-width: 32px;
                min-height: 32px;
                width: 32px;
                height: 32px;
            }
            input[type='color']::-webkit-color-swatch-wrapper {
                padding: 0;
            }
            input[type='color']::-webkit-color-swatch {
                border: 1px solid #d1d5db;
                border-radius: 6px;
            }

            .layer-item.active {
                background-color: #fafafa;
                border-color: #e4e4e4ff;
            }
            .layer-item:hover {
                background-color: #fafafa;
            }
            .layer-item {
                transition: all 0.2s;
            }
        `,
    ],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class ImageEditorDialogComponent implements OnInit, OnDestroy {
    @ViewChild('canvas', { static: true })
    canvasRef: ElementRef<HTMLCanvasElement>;
    @ViewChild('canvasContainer', { static: true })
    containerRef: ElementRef<HTMLDivElement>;

    baseImage: HTMLImageElement;
    originalUrl: string;
    ctx: CanvasRenderingContext2D;
    processing = false;

    zoomLevel = 1.0;
    fitZoomLevel = 1.0;
    showGrid = false;
    cursorStyle = 'default';

    layers: (TextObject | LogoObject)[] = [];
    selectedId: string | null = null;

    draggedLayerIndex: number | null = null;

    dragState = {
        isDragging: false,
        dragTarget: null as 'layer' | 'crop' | 'crop-resize' | null,
        targetId: null as string | null,
        resizeHandle: null as string | null,
        lastMouseX: 0,
        lastMouseY: 0,
    };

    isCropping = false;
    cropRect = { x: 0, y: 0, w: 0, h: 0 };
    cropStart = { x: 0, y: 0 };
    readonly HANDLE_SIZE = 10;

    guides = { x: null, y: null };
    snapThreshold = 10;

    output = {
        width: 0,
        height: 0,
        aspectRatio: 1,
        maintainAspectRatio: true,
        format: 'image/webp',
        quality: 0.9,
    };

    history: EditorState[] = [];
    historyIndex = -1;
    private isUndoing = false;
    private saveTrigger = new Subject<void>();
    private readonly SINGLE_STORAGE_KEY = 'ai_editor_latest_draft';

    @HostListener('window:keydown', ['$event'])
    handleKeyboardEvent(event: KeyboardEvent) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            event.preventDefault();
            this.undo();
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
            event.preventDefault();
            this.redo();
        }
        if (event.key === 'Delete') {
            this.deleteSelected();
        }
    }

    @HostListener('window:mousemove', ['$event'])
    handleWindowMouseMove(event: MouseEvent) {
        if (
            this.isDraggingAngle &&
            this.activeAngleTxt &&
            this.activeAngleElement
        ) {
            this.updateAngleFromMouseEvent(
                event,
                this.activeAngleTxt,
                this.activeAngleElement,
            );
        }
    }

    @HostListener('window:mouseup', ['$event'])
    handleWindowMouseUp(event: MouseEvent) {
        if (this.isDraggingAngle) {
            this.isDraggingAngle = false;
            this.activeAngleTxt = null;
            this.activeAngleElement = null;
            this.recordHistory();
        }
    }

    fontGroups: any[] = [];
    aiPrompt: string = '';
    isGeneratingAi: boolean = false;

    constructor(
        public dialogRef: MatDialogRef<ImageEditorDialogComponent>,
        @Inject(MAT_DIALOG_DATA)
        public data: { imageUrl: string; username: string; prompt?: string },
        private toastr: ToastrService,
        private cdr: ChangeDetectorRef,
        private genaiService: GenaiService,
    ) {
        this.saveTrigger.pipe(debounceTime(1000)).subscribe(() => {
            if (!this.isUndoing) this.saveStateToStorage();
        });
    }

    ngOnInit(): void {
        this.refreshGradientPresets();
        this.loadAvailableFonts();
        if (this.data?.prompt) {
            this.aiPrompt = this.data.prompt;
        }
        let src = this.data.imageUrl;
        if (
            !src.startsWith('http') &&
            !src.startsWith('data:') &&
            !src.startsWith('file:')
        )
            src = 'file:///' + src;
        this.originalUrl = src;
        this.initCanvas(this.originalUrl, true);
        this.extractPromptFromOriginalImage();
    }

    async extractPromptFromOriginalImage(): Promise<void> {
        if (this.aiPrompt) return;
        try {
            const cleanPath = (this.data.imageUrl || '')
                .replace(/^file:\/\/\//, '')
                .replace(/^file:\/\//, '');

            let meta = null;
            if ((window as any).electron?.readFileBase64) {
                try {
                    const res = await (window as any).electron.readFileBase64(cleanPath);
                    if (res && res.success && res.base64) {
                        meta = extractPromptFromImageBase64(res.base64);
                    }
                } catch {}
            }

            if (!meta) {
                try {
                    const fetchUrl = cleanPath.startsWith('/') ? 'file://' + cleanPath : 'file:///' + cleanPath;
                    const response = await fetch(fetchUrl);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        meta = extractPromptFromImageBytes(new Uint8Array(arrayBuffer));
                    }
                } catch {}
            }

            if (meta?.prompt) {
                this.aiPrompt = meta.prompt;
                this.cdr.markForCheck();
            }
        } catch (e) {
            console.warn('Lỗi đọc prompt metadata trong dialog:', e);
        }
    }

    async loadAvailableFonts(): Promise<void> {
        try {
            if ((window as any).electron && (window as any).electron.invoke) {
                const res = await (window as any).electron.invoke('fonts:list');
                if (res && res.success && res.groups) {
                    this.fontGroups = res.groups;
                    this.registerFontFaces(res.groups);
                }
            } else {
                const saved = localStorage.getItem('ai_type_web_font_groups');
                if (saved) {
                    this.fontGroups = JSON.parse(saved);
                    this.registerFontFaces(this.fontGroups);
                }
            }
        } catch (e) {
            console.warn('Lỗi nạp font cho Image Editor:', e);
        }
    }

    private registerFontFaces(groups: any[]): void {
        for (const group of groups) {
            for (const item of group.fonts) {
                if (!item.dataUrl) continue;
                const styleId = `font-face-editor-${item.fontName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                if (document.getElementById(styleId)) continue;
                try {
                    const styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    let format = 'truetype';
                    if (item.extension === '.otf') format = 'opentype';
                    else if (item.extension === '.woff') format = 'woff';
                    else if (item.extension === '.woff2') format = 'woff2';

                    styleEl.appendChild(
                        document.createTextNode(`
                        @font-face {
                            font-family: '${item.fontName}';
                            src: url('${item.dataUrl}') format('${format}');
                            font-weight: 100 900;
                            font-style: normal;
                        }
                    `),
                    );
                    document.head.appendChild(styleEl);
                } catch (err) {}
            }
        }
    }

    async onFontFamilyChange(txt: TextObject, font: string): Promise<void> {
        if (!txt) return;
        txt.fontFamily = font;
        this.draw();
        this.recordHistory();
        this.cdr.markForCheck();

        if (document.fonts) {
            try {
                await Promise.all([
                    document.fonts.load(`bold ${txt.fontSize || 40}px "${font}"`),
                    document.fonts.load(`${txt.fontSize || 40}px "${font}"`),
                ]);
            } catch (e) {
                // bỏ qua lỗi nạp font
            }
            this.draw();
            this.cdr.markForCheck();
        }
    }

    setTextAlignment(txt: TextObject, align: 'left' | 'center' | 'right' | 'justify'): void {
        if (!txt) return;
        txt.textAlign = align;
        this.draw();
        this.recordHistory();
        this.cdr.markForCheck();
    }

    toggleBold(txt: TextObject): void {
        if (!txt) return;
        txt.isBold = txt.isBold === false ? true : false;
        this.draw();
        this.recordHistory();
        this.cdr.markForCheck();
    }

    toggleItalic(txt: TextObject): void {
        if (!txt) return;
        txt.isItalic = !txt.isItalic;
        this.draw();
        this.recordHistory();
        this.cdr.markForCheck();
    }

    toggleUnderline(txt: TextObject): void {
        if (!txt) return;
        txt.isUnderline = !txt.isUnderline;
        this.draw();
        this.recordHistory();
        this.cdr.markForCheck();
    }

    ngOnDestroy(): void {
        this.saveTrigger.complete();
    }

    initCanvas(src: string, isInitialLoad = false) {
        const canvas = this.canvasRef.nativeElement;
        this.ctx = canvas.getContext('2d');
        this.baseImage = new Image();
        this.baseImage.crossOrigin = 'anonymous';
        this.baseImage.src = src;

        this.baseImage.onload = () => {
            canvas.width = this.baseImage.width;
            canvas.height = this.baseImage.height;
            this.output.width = this.baseImage.width;
            this.output.height = this.baseImage.height;
            this.output.aspectRatio =
                this.baseImage.width / this.baseImage.height;

            if (isInitialLoad) {
                this.loadStateFromStorage();
                setTimeout(() => {
                    this.fitToScreen();
                    this.recordHistory();
                    this.draw();
                }, 50);
            } else {
                this.draw();
            }
        };
        this.baseImage.onerror = () => this.toastr.error('Lỗi tải ảnh');
    }

    // --- CROP LOGIC (KHÔI PHỤC ĐẦY ĐỦ) ---
    startCrop() {
        this.isCropping = true;
        this.selectedId = null; // Bỏ chọn layer để tránh nhầm lẫn
        this.dragState.dragTarget = null;

        // Khởi tạo vùng crop mặc định (cách lề 50px)
        this.cropRect = {
            x: 50,
            y: 50,
            w: Math.max(100, this.baseImage.width - 100),
            h: Math.max(100, this.baseImage.height - 100),
        };
        this.draw();
    }

    cancelCrop() {
        this.isCropping = false;
        this.draw();
    }

    applyCrop() {
        if (this.cropRect.w <= 0 || this.cropRect.h <= 0) return;

        // 1. Tạo canvas tạm để cắt ảnh
        const t = document.createElement('canvas');
        t.width = this.cropRect.w;
        t.height = this.cropRect.h;
        const tx = t.getContext('2d');

        // Vẽ phần ảnh gốc nằm trong cropRect vào canvas tạm
        tx.drawImage(
            this.baseImage,
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
            0,
            0,
            this.cropRect.w,
            this.cropRect.h,
        );

        // 2. Chuyển thành ảnh mới
        const n = t.toDataURL();
        const i = new Image();
        i.onload = () => {
            this.baseImage = i;
            this.canvasRef.nativeElement.width = i.width;
            this.canvasRef.nativeElement.height = i.height;
            this.output.width = i.width;
            this.output.height = i.height;
            this.output.aspectRatio = i.width / i.height;

            // 3. Dời vị trí các Layers để khớp với ảnh mới
            this.layers.forEach((l) => {
                l.x -= this.cropRect.x;
                l.y -= this.cropRect.y;
            });

            this.isCropping = false;
            this.fitToScreen();
            this.recordHistory();
            this.draw();
        };
        i.src = n;
    }

    setCropRatio(wRatio: number, hRatio: number) {
        const imgW = this.baseImage.width;
        const imgH = this.baseImage.height;
        const targetRatio = wRatio / hRatio;
        let cropW, cropH;
        if (imgW / imgH > targetRatio) {
            cropH = imgH;
            cropW = cropH * targetRatio;
        } else {
            cropW = imgW;
            cropH = cropW / targetRatio;
        }
        this.cropRect = {
            w: Math.round(cropW),
            h: Math.round(cropH),
            x: Math.round((imgW - cropW) / 2),
            y: Math.round((imgH - cropH) / 2),
        };
        this.draw();
    }

    setCropSize(w: number, h: number) {
        this.cropRect.w = w;
        this.cropRect.h = h;
        this.cropRect.x = Math.max(0, (this.baseImage.width - w) / 2);
        this.cropRect.y = Math.max(0, (this.baseImage.height - h) / 2);
        this.draw();
    }

    drawCropOverlay(w: number, h: number) {
        // 1. Vẽ màn che tối (Dimming)
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(0, 0, w, h);

        // 2. Xóa màn che ở vùng Crop để làm sáng vùng chọn
        this.ctx.clearRect(
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
        );

        // 3. Vẽ lại phần ảnh và layer bên trong vùng crop để nó hiển thị rõ
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
        );
        this.ctx.clip(); // Chỉ vẽ trong vùng crop

        // Vẽ ảnh gốc
        this.ctx.drawImage(this.baseImage, 0, 0, w, h);

        // Vẽ lại các layer (để người dùng căn chỉnh text khi crop)
        this.drawLayers();

        this.ctx.restore();

        // 4. Vẽ lưới quy tắc 1/3
        this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        // Dọc
        this.ctx.moveTo(this.cropRect.x + this.cropRect.w / 3, this.cropRect.y);
        this.ctx.lineTo(
            this.cropRect.x + this.cropRect.w / 3,
            this.cropRect.y + this.cropRect.h,
        );
        this.ctx.moveTo(
            this.cropRect.x + (2 * this.cropRect.w) / 3,
            this.cropRect.y,
        );
        this.ctx.lineTo(
            this.cropRect.x + (2 * this.cropRect.w) / 3,
            this.cropRect.y + this.cropRect.h,
        );
        // Ngang
        this.ctx.moveTo(this.cropRect.x, this.cropRect.y + this.cropRect.h / 3);
        this.ctx.lineTo(
            this.cropRect.x + this.cropRect.w,
            this.cropRect.y + this.cropRect.h / 3,
        );
        this.ctx.moveTo(
            this.cropRect.x,
            this.cropRect.y + (2 * this.cropRect.h) / 3,
        );
        this.ctx.lineTo(
            this.cropRect.x + this.cropRect.w,
            this.cropRect.y + (2 * this.cropRect.h) / 3,
        );
        this.ctx.stroke();

        // 5. Vẽ viền trắng
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
            this.cropRect.x,
            this.cropRect.y,
            this.cropRect.w,
            this.cropRect.h,
        );

        // 6. Vẽ các tay nắm (Handles)
        const handles = this.getCropHandles(this.cropRect);
        this.ctx.fillStyle = '#fff';
        for (const key in handles) {
            const handle = handles[key];
            this.ctx.fillRect(
                handle.x - this.HANDLE_SIZE / 2,
                handle.y - this.HANDLE_SIZE / 2,
                this.HANDLE_SIZE,
                this.HANDLE_SIZE,
            );
        }
    }

    getCropHandles(r: { x: number; y: number; w: number; h: number }) {
        return {
            nw: { x: r.x, y: r.y },
            ne: { x: r.x + r.w, y: r.y },
            sw: { x: r.x, y: r.y + r.h },
            se: { x: r.x + r.w, y: r.y + r.h },
            n: { x: r.x + r.w / 2, y: r.y },
            s: { x: r.x + r.w / 2, y: r.y + r.h },
            w: { x: r.x, y: r.y + r.h / 2 },
            e: { x: r.x + r.w, y: r.y + r.h / 2 },
        };
    }

    // --- DRAWING MAIN ---
    draw() {
        this.saveTrigger.next();
        if (!this.ctx || !this.baseImage) return;
        const w = this.canvasRef.nativeElement.width;
        const h = this.canvasRef.nativeElement.height;
        this.ctx.clearRect(0, 0, w, h);

        // 1. Vẽ nền
        this.ctx.drawImage(this.baseImage, 0, 0, w, h);

        // 2. Vẽ lưới (nếu bật)
        if (this.showGrid && !this.isCropping) this.drawGrid(w, h);

        // 3. Nếu đang Crop -> Vẽ giao diện Crop
        if (this.isCropping) {
            this.drawCropOverlay(w, h);
            return;
        }

        // 4. Nếu không Crop -> Vẽ các Layer bình thường
        this.drawLayers();

        // 5. Vẽ đường gióng (Snap Guides)
        if (this.guides.x !== null)
            this.drawGuideLine(this.guides.x, 0, this.guides.x, h);
        if (this.guides.y !== null)
            this.drawGuideLine(0, this.guides.y, w, this.guides.y);
    }

    drawLayers() {
        this.layers.forEach((layer) => {
            this.ctx.save();
            this.ctx.translate(layer.x, layer.y);

            if (layer.type === 'logo') {
                const l = layer as LogoObject;
                if (l.element) {
                    this.ctx.globalAlpha = l.opacity;
                    this.ctx.rotate((l.rotation * Math.PI) / 180);
                    const lw = l.element.width * l.scale;
                    const lh = l.element.height * l.scale;
                    this.ctx.drawImage(l.element, -lw / 2, -lh / 2, lw, lh);
                    if (!this.isCropping && this.selectedId === l.id)
                        this.drawSelectionUI(lw, lh);
                }
            } else if (layer.type === 'text') {
                const t = layer as TextObject;
                this.ctx.globalAlpha = t.opacity;
                this.ctx.rotate((t.rotation * Math.PI) / 180);
                const fontFam = t.fontFamily || 'Arial';
                const fontStyle = t.isItalic ? 'italic' : 'normal';
                const fontWeight = t.isBold !== false ? 'bold' : 'normal';
                this.ctx.font = `${fontStyle} ${fontWeight} ${t.fontSize}px "${fontFam}", Arial, sans-serif`;
                const letterSpace = t.letterSpacing || 0;
                try {
                    (this.ctx as any).letterSpacing = `${letterSpace}px`;
                } catch (e) {}

                const lines = (t.content || '').split('\n');
                const lineHeight = t.fontSize * 1.2;
                const totalHeight = lines.length * lineHeight;
                const align = t.textAlign || 'center';

                // Đo độ rộng từng dòng
                const lineWidths = lines.map((line) => {
                    const metric = this.ctx.measureText(line);
                    return (
                        metric.width +
                        (line.length > 1 ? (line.length - 1) * letterSpace : 0)
                    );
                });
                const maxWidth = Math.max(...lineWidths, 10);
                t.width = maxWidth;
                t.height = totalHeight;

                const startY = -(totalHeight / 2) + lineHeight / 2;

                lines.forEach((line, index) => {
                    const lineY = startY + index * lineHeight;
                    const lineW = lineWidths[index];

                    // Căn chỉnh vị trí X của từng dòng
                    let lineX = 0;
                    if (align === 'left') {
                        lineX = -maxWidth / 2;
                        this.ctx.textAlign = 'left';
                    } else if (align === 'right') {
                        lineX = maxWidth / 2;
                        this.ctx.textAlign = 'right';
                    } else {
                        // center hoặc justify cơ bản
                        lineX = 0;
                        this.ctx.textAlign = 'center';
                    }
                    this.ctx.textBaseline = 'middle';

                    // Xử lý căn đều (justify) cho dòng nhiều từ
                    const words = line.trim().split(/\s+/);
                    const isJustifyLine = align === 'justify' && words.length > 1 && (index < lines.length - 1 || lines.length === 1);

                    // Thiết lập Shadow
                    if (t.hasShadow) {
                        this.ctx.shadowColor = t.shadowColor;
                        this.ctx.shadowBlur = t.shadowBlur;
                        this.ctx.shadowOffsetX = t.shadowX;
                        this.ctx.shadowOffsetY = t.shadowY;
                    } else {
                        this.ctx.shadowColor = 'transparent';
                        this.ctx.shadowBlur = 0;
                        this.ctx.shadowOffsetX = 0;
                        this.ctx.shadowOffsetY = 0;
                    }

                    // Thiết lập Fill
                    if (t.isGradient) {
                        const angleRad = (t.gradientAngle * Math.PI) / 180;
                        const r = t.fontSize * 2;
                        const x1 = r * Math.cos(angleRad + Math.PI);
                        const y1 = lineY + r * Math.sin(angleRad + Math.PI);
                        const x2 = r * Math.cos(angleRad);
                        const y2 = lineY + r * Math.sin(angleRad);
                        const gradient = this.ctx.createLinearGradient(
                            x1,
                            y1,
                            x2,
                            y2,
                        );

                        const stops =
                            t.gradientStops && t.gradientStops.length >= 2
                                ? t.gradientStops
                                : [
                                      {
                                          color: t.color1 || '#ffffff',
                                          offset: 0,
                                      },
                                      {
                                          color: t.color2 || '#ff0000',
                                          offset: 1,
                                      },
                                  ];

                        stops.forEach((s) => {
                            try {
                                const off = Math.max(
                                    0,
                                    Math.min(1, Number(s.offset)),
                                );
                                gradient.addColorStop(
                                    off,
                                    s.color || '#ffffff',
                                );
                            } catch (e) {}
                        });
                        this.ctx.fillStyle = gradient;
                    } else {
                        this.ctx.fillStyle = t.color1;
                    }

                    if (isJustifyLine) {
                        // Vẽ từng từ phân bổ đều
                        const wordMetrics = words.map((w) => this.ctx.measureText(w).width);
                        const totalWordW = wordMetrics.reduce((a, b) => a + b, 0);
                        const spaceGap = (maxWidth - totalWordW) / (words.length - 1);
                        let curX = -maxWidth / 2;
                        this.ctx.textAlign = 'left';

                        words.forEach((w, wIdx) => {
                            if (t.hasBorder) {
                                this.ctx.lineJoin = 'round';
                                this.ctx.lineWidth = t.borderWidth;
                                this.ctx.strokeStyle = t.borderColor;
                                this.ctx.strokeText(w, curX, lineY);
                            }
                            this.ctx.fillText(w, curX, lineY);
                            curX += wordMetrics[wIdx] + spaceGap;
                        });
                    } else {
                        // Vẽ dòng bình thường
                        if (t.hasBorder) {
                            this.ctx.lineJoin = 'round';
                            this.ctx.lineWidth = t.borderWidth;
                            this.ctx.strokeStyle = t.borderColor;
                            this.ctx.strokeText(line, lineX, lineY);
                        }
                        this.ctx.fillText(line, lineX, lineY);
                    }

                    // Gạch chân (underline)
                    if (t.isUnderline) {
                        this.ctx.save();
                        this.ctx.shadowColor = 'transparent';
                        this.ctx.fillStyle = t.color1 || '#ffffff';
                        const underlineY = lineY + t.fontSize * 0.55;
                        const underlineH = Math.max(2, t.fontSize * 0.08);

                        let startUnderlineX = -lineW / 2;
                        if (align === 'left') startUnderlineX = -maxWidth / 2;
                        else if (align === 'right') startUnderlineX = maxWidth / 2 - lineW;
                        else if (align === 'justify' && isJustifyLine) startUnderlineX = -maxWidth / 2;

                        const underlineW = (align === 'justify' && isJustifyLine) ? maxWidth : lineW;
                        this.ctx.fillRect(startUnderlineX, underlineY, underlineW, underlineH);
                        this.ctx.restore();
                    }
                });

                if (!this.isCropping && this.selectedId === t.id)
                    this.drawSelectionUI(maxWidth, totalHeight);
            }
            this.ctx.restore();
        });
    }

    drawSelectionUI(w: number, h: number) {
        this.ctx.strokeStyle = '#3b82f6';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        const p = 10;
        this.ctx.strokeRect(-(w / 2) - p, -(h / 2) - p, w + p * 2, h + p * 2);
        this.ctx.setLineDash([]);
        const delX = w / 2 + p;
        const delY = -(h / 2) - p;
        this.ctx.beginPath();
        this.ctx.arc(delX, delY, 12, 0, 2 * Math.PI);
        this.ctx.fillStyle = '#ef4444';
        this.ctx.fill();
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(delX - 5, delY - 5);
        this.ctx.lineTo(delX + 5, delY + 5);
        this.ctx.moveTo(delX + 5, delY - 5);
        this.ctx.lineTo(delX - 5, delY + 5);
        this.ctx.stroke();
    }

    // --- INTERACTION ---
    onMouseDown(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        const { x, y } = this.getMousePos(e);
        this.dragState.lastMouseX = x;
        this.dragState.lastMouseY = y;

        // Xử lý Crop
        if (this.isCropping) {
            const handles = this.getCropHandles(this.cropRect);
            const hs = this.HANDLE_SIZE + 5;
            for (const key in handles) {
                const h = handles[key];
                if (Math.abs(x - h.x) < hs && Math.abs(y - h.y) < hs) {
                    this.dragState.isDragging = true;
                    this.dragState.dragTarget = 'crop-resize';
                    this.dragState.resizeHandle = key;
                    return;
                }
            }
            if (
                x > this.cropRect.x &&
                x < this.cropRect.x + this.cropRect.w &&
                y > this.cropRect.y &&
                y < this.cropRect.y + this.cropRect.h
            ) {
                this.dragState.isDragging = true;
                this.dragState.dragTarget = 'crop';
                return;
            }
            return;
        }

        // Xử lý Layer
        if (this.checkDeleteClick(x, y)) return;

        const reversedLayers = [...this.layers].reverse();
        for (const layer of reversedLayers) {
            let w = 0,
                h = 0;
            if (layer.type === 'logo') {
                const l = layer as LogoObject;
                if (!l.element) continue;
                w = l.element.width * l.scale;
                h = l.element.height * l.scale;
                if (this.hitTestRotated(x, y, l.x, l.y, w, h, l.rotation)) {
                    this.selectedId = l.id;
                    this.dragState.dragTarget = 'layer';
                    this.dragState.targetId = l.id;
                    this.dragState.isDragging = true;
                    this.draw();
                    return;
                }
            } else {
                const t = layer as TextObject;
                w = t.width || (t.content.length * t.fontSize * 0.6);
                h = t.height || t.fontSize;
                if (this.hitTestRotated(x, y, t.x, t.y, w, h, t.rotation)) {
                    this.selectedId = t.id;
                    this.dragState.dragTarget = 'layer';
                    this.dragState.targetId = t.id;
                    this.dragState.isDragging = true;
                    this.draw();
                    return;
                }
            }
        }
        this.selectedId = null;
        this.dragState.dragTarget = null;
        this.draw();
    }

    onMouseMove(e: MouseEvent) {
        e.preventDefault();
        const { x, y } = this.getMousePos(e);

        if (this.isCropping && !this.dragState.isDragging) {
            const handles = this.getCropHandles(this.cropRect);
            const hs = this.HANDLE_SIZE + 5;
            let cursor = 'default';
            if (
                Math.abs(x - handles['nw'].x) < hs &&
                Math.abs(y - handles['nw'].y) < hs
            )
                cursor = 'nw-resize';
            else if (
                Math.abs(x - handles['ne'].x) < hs &&
                Math.abs(y - handles['ne'].y) < hs
            )
                cursor = 'ne-resize';
            else if (
                Math.abs(x - handles['sw'].x) < hs &&
                Math.abs(y - handles['sw'].y) < hs
            )
                cursor = 'sw-resize';
            else if (
                Math.abs(x - handles['se'].x) < hs &&
                Math.abs(y - handles['se'].y) < hs
            )
                cursor = 'se-resize';
            else if (
                Math.abs(x - handles['n'].x) < hs &&
                Math.abs(y - handles['n'].y) < hs
            )
                cursor = 'n-resize';
            else if (
                Math.abs(x - handles['s'].x) < hs &&
                Math.abs(y - handles['s'].y) < hs
            )
                cursor = 's-resize';
            else if (
                Math.abs(x - handles['w'].x) < hs &&
                Math.abs(y - handles['w'].y) < hs
            )
                cursor = 'w-resize';
            else if (
                Math.abs(x - handles['e'].x) < hs &&
                Math.abs(y - handles['e'].y) < hs
            )
                cursor = 'e-resize';
            else if (
                x > this.cropRect.x &&
                x < this.cropRect.x + this.cropRect.w &&
                y > this.cropRect.y &&
                y < this.cropRect.y + this.cropRect.h
            )
                cursor = 'move';
            this.cursorStyle = cursor;
        } else {
            this.cursorStyle = this.dragState.isDragging
                ? 'grabbing'
                : 'default';
        }

        if (!this.dragState.isDragging) return;

        const dx = x - this.dragState.lastMouseX;
        const dy = y - this.dragState.lastMouseY;

        if (
            this.dragState.dragTarget === 'crop-resize' &&
            this.dragState.resizeHandle
        ) {
            const h = this.dragState.resizeHandle;
            const r = this.cropRect;
            if (h.includes('w')) {
                r.x += dx;
                r.w -= dx;
            }
            if (h.includes('e')) {
                r.w += dx;
            }
            if (h.includes('n')) {
                r.y += dy;
                r.h -= dy;
            }
            if (h.includes('s')) {
                r.h += dy;
            }
            if (r.w < 20) r.w = 20;
            if (r.h < 20) r.h = 20;
            this.draw();
        } else if (this.dragState.dragTarget === 'crop') {
            this.cropRect.x += dx;
            this.cropRect.y += dy;
            this.draw();
        } else if (
            this.dragState.dragTarget === 'layer' &&
            this.dragState.targetId
        ) {
            const targetObj = this.layers.find(
                (l) => l.id === this.dragState.targetId,
            );
            if (targetObj) {
                let newX = targetObj.x + dx;
                let newY = targetObj.y + dy;
                // Snap to Center
                const cX = this.canvasRef.nativeElement.width / 2;
                const cY = this.canvasRef.nativeElement.height / 2;
                this.guides = { x: null, y: null };
                if (Math.abs(newX - cX) < this.snapThreshold) {
                    newX = cX;
                    this.guides.x = cX;
                }
                if (Math.abs(newY - cY) < this.snapThreshold) {
                    newY = cY;
                    this.guides.y = cY;
                }
                targetObj.x = newX;
                targetObj.y = newY;
            }
            this.draw();
        }
        this.dragState.lastMouseX = x;
        this.dragState.lastMouseY = y;
    }

    onMouseUp() {
        if (this.dragState.isDragging) this.recordHistory();
        this.dragState.isDragging = false;
        this.dragState.resizeHandle = null;
        this.guides = { x: null, y: null };
        this.draw();
    }

    // --- OTHER HELPERS ---
    checkDeleteClick(x: number, y: number): boolean {
        if (this.selectedId) {
            const l = this.layers.find((i) => i.id === this.selectedId);
            if (l) {
                let w = 0,
                    h = 0;
                if (l.type === 'logo') {
                    w =
                        (l as LogoObject).element.width *
                        (l as LogoObject).scale;
                    h =
                        (l as LogoObject).element.height *
                        (l as LogoObject).scale;
                } else {
                    w =
                        (l as TextObject).content.length *
                        (l as TextObject).fontSize *
                        0.6;
                    h = (l as TextObject).fontSize;
                }
                if (
                    this.hitTestDeleteBtn(
                        x,
                        y,
                        l.x,
                        l.y,
                        w,
                        h,
                        (l as any).rotation,
                    )
                ) {
                    this.deleteSelected();
                    return true;
                }
            }
        }
        return false;
    }
    hitTestRotated(mx, my, ox, oy, w, h, rot) {
        const rad = (-rot * Math.PI) / 180;
        const dx = mx - ox;
        const dy = my - oy;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        return Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2;
    }
    hitTestDeleteBtn(mx, my, ox, oy, w, h, rot) {
        const rad = (-rot * Math.PI) / 180;
        const dx = mx - ox;
        const dy = my - oy;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        const btnX = w / 2 + 10;
        const btnY = -h / 2 - 10;
        const dist = Math.sqrt(Math.pow(lx - btnX, 2) + Math.pow(ly - btnY, 2));
        return dist <= 15;
    }
    getMousePos(evt) {
        const rect = this.canvasRef.nativeElement.getBoundingClientRect();
        return {
            x: (evt.clientX - rect.left) / this.zoomLevel,
            y: (evt.clientY - rect.top) / this.zoomLevel,
        };
    }

    addTextLayer() {
        const id = 'text_' + new Date().getTime();
        const defaultFont = this.fontGroups[0]?.fonts[0]?.fontName || 'Arial';
        this.layers.push({
            id: id,
            type: 'text',
            content: 'Text',
            x: this.canvasRef.nativeElement.width / 2,
            y: this.canvasRef.nativeElement.height / 2,
            fontFamily: defaultFont,
            letterSpacing: 0,
            fontSize: 80,
            rotation: 0,
            textAlign: 'center',
            isBold: true,
            isItalic: false,
            isUnderline: false,
            color1: '#ffffff',
            color2: '#ff0000',
            isGradient: false,
            gradientAngle: 90,
            opacity: 1.0,
            hasBorder: false,
            borderColor: '#000000',
            borderWidth: 3,
            hasShadow: false,
            shadowColor: '#000000',
            shadowBlur: 5,
            shadowX: 5,
            shadowY: 5,
        } as TextObject);
        this.selectedId = id;
        this.recordHistory();
        this.draw();
    }

    onLogoUpload(e: any) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev: any) => {
                const img = new Image();
                img.onload = () => {
                    const id = 'logo_' + new Date().getTime();
                    this.layers.push({
                        id: id,
                        type: 'logo',
                        src: ev.target.result,
                        x: this.canvasRef.nativeElement.width / 2,
                        y: this.canvasRef.nativeElement.height / 2,
                        scale: 0.5,
                        rotation: 0,
                        opacity: 1.0,
                        element: img,
                        width: img.width,
                        height: img.height,
                    } as LogoObject);
                    this.selectedId = id;
                    this.recordHistory();
                    this.draw();
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        }
    }

    deleteSelected() {
        this.layers = this.layers.filter((l) => l.id !== this.selectedId);
        this.selectedId = null;
        this.recordHistory();
        this.draw();
    }

    deleteLayer(id: string) {
        this.layers = this.layers.filter((l) => l.id !== id);
        if (this.selectedId === id) this.selectedId = null;
        this.recordHistory();
        this.draw();
    }

    // Storage & History
    saveStateToStorage() {
        if (this.processing) return;
        const s = this.getCurrentState();
        try {
            localStorage.setItem(
                this.SINGLE_STORAGE_KEY,
                JSON.stringify({ ...s, originalUrlCheck: this.originalUrl }),
            );
        } catch (e) {}
    }
    loadStateFromStorage() {
        const s = localStorage.getItem(this.SINGLE_STORAGE_KEY);
        if (!s) return;
        try {
            const d = JSON.parse(s);
            if (d.originalUrlCheck !== this.originalUrl) {
                if (d.layers) this.restoreLayers(d.layers);
                else if (d.textLayers || d.logoLayers) {
                    const m = [
                        ...(d.textLayers || []),
                        ...(d.logoLayers || []),
                    ].map((l) => {
                        if (!l.type) l.type = l.src ? 'logo' : 'text';
                        return l;
                    });
                    this.restoreLayers(m);
                }
                return;
            }
            this.applyState(d);
        } catch {}
    }
    async generateWithAi() {
        if (!this.aiPrompt?.trim() || this.isGeneratingAi) return;

        this.isGeneratingAi = true;
        this.cdr.markForCheck();

        try {
            // Lấy canvas hiện tại làm ảnh tham chiếu
            const currentCanvas = this.canvasRef.nativeElement;
            const currentDataUrl = currentCanvas.toDataURL('image/png');
            const base64Data = currentDataUrl.split(',')[1];

            // Xác định tỷ lệ ảnh gần nhất
            const currentRatio = currentCanvas.width / currentCanvas.height;
            let ratioStr = '1:1';
            if (currentRatio > 1.5) ratioStr = '16:9';
            else if (currentRatio > 1.2) ratioStr = '4:3';
            else if (currentRatio < 0.6) ratioStr = '9:16';
            else if (currentRatio < 0.8) ratioStr = '3:4';

            const generateOptions = {
                model: 'gemini-3.1-flash-image-preview',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { text: this.aiPrompt.trim() },
                            {
                                inlineData: {
                                    data: base64Data,
                                    mimeType: 'image/png',
                                },
                            } as any,
                        ],
                    },
                ],
                config: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    imageConfig: {
                        aspectRatio: ratioStr,
                    },
                },
            };

            const response = await this.genaiService.generateContent(generateOptions);
            const candidates = response?.candidates;

            let newImageBase64 = '';
            let newMimeType = 'image/png';

            if (candidates?.[0]?.content?.parts) {
                for (const part of candidates[0].content.parts) {
                    if (part.inlineData) {
                        newImageBase64 = part.inlineData.data;
                        newMimeType = part.inlineData.mimeType || 'image/png';
                        break;
                    } else if ((part as any).image) {
                        newImageBase64 = (part as any).image.data;
                        newMimeType = (part as any).image.mimeType || 'image/png';
                        break;
                    }
                }
            }

            if (newImageBase64) {
                const newSrc = `data:${newMimeType};base64,${newImageBase64}`;
                this.initCanvas(newSrc, false);
                this.toastr.success('AI đã chỉnh sửa hình ảnh!');
            } else {
                this.toastr.warning('Không nhận được hình ảnh trả về từ AI.');
            }
        } catch (err: any) {
            console.error('Lỗi tạo ảnh AI trong Editor:', err);
            this.toastr.error('Lỗi khi áp dụng AI: ' + (err.message || 'Vui lòng thử lại.'));
        } finally {
            this.isGeneratingAi = false;
            this.cdr.markForCheck();
        }
    }

    saveImage() {
        this.processing = true;
        this.saveStateToStorage();
        this.selectedId = null;
        this.showGrid = false;
        this.guides = { x: null, y: null };
        this.draw();
        setTimeout(() => {
            const t = document.createElement('canvas');
            t.width = this.output.width;
            t.height = this.output.height;
            const tx = t.getContext('2d');
            tx.imageSmoothingQuality = 'high';
            tx.drawImage(this.canvasRef.nativeElement, 0, 0, t.width, t.height);
            this.dialogRef.close({
                success: true,
                dataUrl: t.toDataURL(this.output.format, this.output.quality),
                format: this.output.format,
                prompt: this.aiPrompt?.trim() || '',
            });
        }, 100);
    }
    hardReset() {
        localStorage.removeItem(this.SINGLE_STORAGE_KEY);
        this.history = [];
        this.layers = [];
        this.selectedId = null;
        this.isCropping = false;
        this.initCanvas(this.originalUrl, true);
        this.toastr.warning('Đã reset!');
    }
    recordHistory() {
        if (!this.isUndoing) {
            if (this.historyIndex < this.history.length - 1)
                this.history = this.history.slice(0, this.historyIndex + 1);
            this.history.push(this.getCurrentState());
            this.historyIndex++;
            if (this.history.length > 20) {
                this.history.shift();
                this.historyIndex--;
            }
        }
    }
    undo() {
        if (this.historyIndex > 0) {
            this.isUndoing = true;
            this.historyIndex--;
            this.applyState(this.history[this.historyIndex]);
            this.isUndoing = false;
        }
    }
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.isUndoing = true;
            this.historyIndex++;
            this.applyState(this.history[this.historyIndex]);
            this.isUndoing = false;
        }
    }
    getCurrentState(): EditorState {
        return {
            imageBase64: this.baseImage.src,
            layers: JSON.parse(JSON.stringify(this.layers)),
            zoomLevel: this.zoomLevel,
            originalUrlCheck: this.originalUrl,
        };
    }
    applyState(state: EditorState) {
        this.layers = JSON.parse(JSON.stringify(state.layers));
        this.restoreLayers(this.layers);
        this.zoomLevel = state.zoomLevel;
        if (state.imageBase64 !== this.baseImage.src) {
            const i = new Image();
            i.onload = () => {
                this.baseImage = i;
                this.canvasRef.nativeElement.width = i.width;
                this.canvasRef.nativeElement.height = i.height;
                this.draw();
            };
            i.src = state.imageBase64;
        } else {
            this.draw();
        }
    }
    async restoreLayers(layers: any[]) {
        const promises = layers.map(
            (l) =>
                new Promise<any>((resolve) => {
                    if (l.type === 'logo') {
                        const i = new Image();
                        i.onload = () =>
                            resolve({
                                ...l,
                                element: i,
                                width: i.width,
                                height: i.height,
                            });
                        i.onerror = () => resolve(null);
                        i.src = l.src;
                    } else {
                        resolve(l);
                    }
                }),
        );
        const loaded = await Promise.all(promises);
        this.layers = loaded.filter((l) => l !== null);
        this.draw();
    }

    // Multi-color Gradient Helpers
    MathFloor(val: number): number {
        return Math.floor(val);
    }
    MathRound(val: number): number {
        return Math.round(val);
    }

    getGradientStops(txt: TextObject): { color: string; offset: number }[] {
        if (!txt.gradientStops || txt.gradientStops.length < 2) {
            txt.gradientStops = [
                { color: txt.color1 || '#ffffff', offset: 0 },
                { color: txt.color2 || '#ff0000', offset: 1 },
            ];
        }
        return txt.gradientStops;
    }

    addGradientStop(txt: TextObject) {
        const stops = this.getGradientStops(txt);
        stops.push({ color: '#3b82f6', offset: 0.5 });
        stops.sort((a, b) => a.offset - b.offset);
        this.syncLegacyColors(txt);
        this.draw();
        this.recordHistory();
    }

    removeGradientStop(txt: TextObject, index: number) {
        const stops = this.getGradientStops(txt);
        if (stops.length > 2) {
            stops.splice(index, 1);
            this.syncLegacyColors(txt);
            this.draw();
            this.recordHistory();
        }
    }

    gradientPool: { name: string; colors: string[] }[] = [
        { name: 'Sunset', colors: ['#ff7e5f', '#feb47b', '#86a8e7'] },
        {
            name: 'Rainbow',
            colors: [
                '#ff0000',
                '#ffa500',
                '#ffff00',
                '#008000',
                '#0000ff',
                '#ee82ee',
            ],
        },
        {
            name: 'Cyberpunk',
            colors: ['#00f2fe', '#4facfe', '#f093fb', '#f5576c'],
        },
        { name: 'Gold', colors: ['#ffe066', '#f5af19', '#e65c00'] },
        { name: 'Ocean', colors: ['#2ef195', '#00b4db', '#0083b0'] },
        { name: 'Aurora', colors: ['#00c9ff', '#92fe9d'] },
        { name: 'Neon', colors: ['#f857a6', '#ff5858'] },
        { name: 'Pastel', colors: ['#a8edf0', '#fed6e3'] },
        { name: 'Cosmic', colors: ['#ff007f', '#7928ca', '#00dfd8'] },
        { name: 'Midnight', colors: ['#0f2027', '#203a43', '#2c5364'] },
        { name: 'Emerald', colors: ['#11998e', '#38ef7d'] },
        { name: 'Rose Gold', colors: ['#f4c4f3', '#fc67fa'] },
        { name: 'Volcanic', colors: ['#ff4e50', '#f9d423'] },
        { name: 'Candy', colors: ['#d4fc79', '#96e6a1'] },
        { name: 'Deep Sea', colors: ['#4e54c8', '#8f94fb'] },
        { name: 'Coral', colors: ['#ff9a9e', '#fecfef'] },
        { name: 'Twilight', colors: ['#fa709a', '#fee140'] },
        { name: 'Fire', colors: ['#f12711', '#f5af19'] },
        { name: 'Dusk', colors: ['#2c3e50', '#fd746c'] },
        { name: 'Tropic', colors: ['#00b4db', '#0083b0', '#f857a6'] },
    ];

    presetGradients: { name: string; colors: string[] }[] = [];

    refreshGradientPresets() {
        const shuffled = [...this.gradientPool].sort(() => Math.random() - 0.5);
        this.presetGradients = shuffled.slice(0, 5);
    }

    applyGradientPreset(txt: TextObject, colors: string[]) {
        txt.gradientStops = colors.map((c, i) => ({
            color: c,
            offset: i / (colors.length - 1),
        }));
        this.syncLegacyColors(txt);
        this.draw();
        this.recordHistory();
    }

    syncLegacyColors(txt: TextObject) {
        if (txt.gradientStops && txt.gradientStops.length >= 2) {
            txt.color1 = txt.gradientStops[0].color;
            txt.color2 = txt.gradientStops[txt.gradientStops.length - 1].color;
        }
    }

    getGradientCss(txt: TextObject): string {
        const stops = this.getGradientStops(txt);
        const stopCss = stops
            .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
            .join(', ');
        return `linear-gradient(${txt.gradientAngle || 90}deg, ${stopCss})`;
    }

    // Angle Dial Dragging
    isDraggingAngle = false;
    activeAngleTxt: TextObject | null = null;
    activeAngleElement: HTMLElement | null = null;

    onAngleDialMouseDown(
        event: MouseEvent,
        txt: TextObject,
        element: HTMLElement,
    ) {
        event.preventDefault();
        this.isDraggingAngle = true;
        this.activeAngleTxt = txt;
        this.activeAngleElement = element;
        this.updateAngleFromMouseEvent(event, txt, element);
    }

    private updateAngleFromMouseEvent(
        event: MouseEvent,
        txt: TextObject,
        element: HTMLElement,
    ) {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = event.clientX - centerX;
        const dy = event.clientY - centerY;
        let rad = Math.atan2(dy, dx);
        let deg = Math.round(rad * (180 / Math.PI));
        deg = (deg + 90) % 360; // 0 deg points UP at 12 o'clock knob
        if (deg < 0) deg += 360;
        txt.gradientAngle = deg;
        this.draw();
    }

    // Helpers UI
    toggleGrid() {
        this.showGrid = !this.showGrid;
        this.draw();
    }

    drawGrid(w: number, h: number) {
        this.ctx.save();
        this.ctx.globalAlpha = 1.0;
        this.ctx.lineWidth = 1;

        // Kích thước ô lưới vuông 1:1 dày dặn và chuẩn xác (khoảng 30-40px tùy theo ảnh)
        const gridSize = Math.max(
            25,
            Math.min(50, Math.floor(Math.min(w, h) / 25)),
        );

        // 1. Đường nét đứt màu đen tương phản trên vùng ảnh sáng
        this.ctx.setLineDash([3, 3]);
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        this.ctx.beginPath();
        for (let x = gridSize; x < w; x += gridSize) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
        }
        for (let y = gridSize; y < h; y += gridSize) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
        }
        this.ctx.stroke();

        // 2. Đường nét đứt màu trắng lệch 1px tương phản trên vùng ảnh tối
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        this.ctx.beginPath();
        for (let x = gridSize; x < w; x += gridSize) {
            this.ctx.moveTo(x + 1, 0);
            this.ctx.lineTo(x + 1, h);
        }
        for (let y = gridSize; y < h; y += gridSize) {
            this.ctx.moveTo(0, y + 1);
            this.ctx.lineTo(w, y + 1);
        }
        this.ctx.stroke();

        // 3. Đường gióng Tỷ lệ 1/3 (Rule of Thirds) màu xanh
        this.ctx.setLineDash([]);
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = 'rgba(59, 130, 246, 0.75)';
        this.ctx.beginPath();
        this.ctx.moveTo(w / 3, 0);
        this.ctx.lineTo(w / 3, h);
        this.ctx.moveTo((2 * w) / 3, 0);
        this.ctx.lineTo((2 * w) / 3, h);
        this.ctx.moveTo(0, h / 3);
        this.ctx.lineTo(w, h / 3);
        this.ctx.moveTo(0, (2 * h) / 3);
        this.ctx.lineTo(w, (2 * h) / 3);
        this.ctx.stroke();

        this.ctx.restore();
    }
    drawGuideLine(x1, y1, x2, y2) {
        this.ctx.strokeStyle = '#ec4899';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }
    onDimensionChange(t) {
        if (this.output.maintainAspectRatio) {
            if (t === 'w')
                this.output.height = Math.round(
                    this.output.width / this.output.aspectRatio,
                );
            else
                this.output.width = Math.round(
                    this.output.height * this.output.aspectRatio,
                );
        }
    }
    close() {
        this.dialogRef.close();
    }
    fitToScreen() {
        const c = this.containerRef.nativeElement;
        const s = Math.min(
            (c.clientWidth - 64) / this.baseImage.width,
            (c.clientHeight - 64) / this.baseImage.height,
        );
        this.zoomLevel = Math.max(0.05, Math.min(s, 1.0));
        this.fitZoomLevel = this.zoomLevel;
    }
    changeZoom(d) {
        this.zoomLevel = Math.max(0.05, Math.min(this.zoomLevel + d, 5.0));
    }

    // Getters for HTML
    getSelectedText() {
        return this.layers.find(
            (l) => l.id === this.selectedId && l.type === 'text',
        ) as TextObject;
    }
    getSelectedLogo() {
        return this.layers.find(
            (l) => l.id === this.selectedId && l.type === 'logo',
        ) as LogoObject;
    }

    // Drag Drop
    onDragStart(index: number) {
        this.draggedLayerIndex = index;
    }
    onDragOver(event: DragEvent) {
        event.preventDefault();
    }
    onDrop(dropIndex: number) {
        if (
            this.draggedLayerIndex !== null &&
            this.draggedLayerIndex !== dropIndex
        ) {
            const item = this.layers.splice(this.draggedLayerIndex, 1)[0];
            this.layers.splice(dropIndex, 0, item);
            this.draggedLayerIndex = null;
            this.recordHistory();
            this.draw();
        }
    }
    selectLayer(id: string) {
        this.selectedId = id;
        this.draw();
    }
}
