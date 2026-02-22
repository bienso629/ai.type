import {
    AfterViewInit,
    Directive,
    ElementRef,
    Input,
    NgZone,
    OnDestroy,
} from '@angular/core';

@Directive({
    selector: '[appDraggable]',
    standalone: true,
})
export class DraggableDirective implements AfterViewInit, OnDestroy {
    /** CSS selector của handle; nếu bỏ trống sẽ dùng vùng kéo ở mép trên (dragZonePx) */
    @Input('appDraggable') handleSelector?: string;
    /** Khóa lưu vị trí trong localStorage (VD: 'livestream-pos') */
    @Input() saveKey?: string;
    /** Lề tối thiểu so với viền màn hình (px) */
    @Input() margin = 8;
    /** Bật hít cạnh khi thả */
    @Input() snap = false;
    /** Ngưỡng hít cạnh (px) */
    @Input() snapThreshold = 24;
    /** Nếu không có handle, chỉ cho kéo khi nhấn trong dải trên cùng (px) */
    @Input() dragZonePx = 28;

    private el: HTMLElement;
    private handleEl?: HTMLElement;
    private dragging = false;
    private startX = 0;
    private startY = 0;
    private startLeft = 0;
    private startTop = 0;

    private moveListener?: (e: PointerEvent) => void;
    private upListener?: (e: PointerEvent) => void;
    private cancelListener?: (e: PointerEvent) => void;
    private resizeListener?: () => void;
    private pointerDownListener?: (e: PointerEvent) => void;

    constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {
        this.el = host.nativeElement;
    }

    ngAfterViewInit(): void {
        const style = this.el.style;

        // Đảm bảo fixed + để pointer events mượt
        style.position = 'fixed';
        style.willChange = 'left, top';
        style.touchAction = 'none';

        // Nếu có 'inset' do code khác set, reset về auto rồi dùng left/top
        // (tránh xung đột shorthand)
        (style as any).inset = 'auto';

        // Nếu ban đầu đặt bottom/right (tailwind: bottom-4 right-4),
        // đọc rect hiện tại và chuyển sang left/top
        const rect = this.el.getBoundingClientRect();
        style.left = `${rect.left}px`;
        style.top = `${rect.top}px`;
        style.right = 'auto';
        style.bottom = 'auto';

        // Khôi phục vị trí đã lưu (nếu có)
        this.restorePosition();

        // Xác định handle (nếu có). Nếu không, sẽ fallback sang dragZonePx
        this.handleEl = this.handleSelector
            ? (this.el.querySelector(this.handleSelector) as HTMLElement | null) || undefined
            : undefined;

        // Gắn listeners ngoài Angular để mượt hơn
        this.zone.runOutsideAngular(() => {
            const target = this.handleEl ?? this.el;
            this.pointerDownListener = (e: PointerEvent) => this.onPointerDown(e);
            target.addEventListener('pointerdown', this.pointerDownListener, { passive: true });

            this.moveListener = (e: PointerEvent) => this.onPointerMove(e);
            this.upListener = (e: PointerEvent) => this.onPointerUp(e);
            this.cancelListener = (e: PointerEvent) => this.onPointerUp(e);

            // pointermove cần passive: false để có thể preventDefault() (mobile)
            window.addEventListener('pointermove', this.moveListener, { passive: false });
            window.addEventListener('pointerup', this.upListener, { passive: true });
            window.addEventListener('pointercancel', this.cancelListener, { passive: true });

            this.resizeListener = () => this.keepInsideViewport();
            window.addEventListener('resize', this.resizeListener, { passive: true });
        });
    }

    ngOnDestroy(): void {
        const target = this.handleEl ?? this.el;
        if (this.pointerDownListener) target.removeEventListener('pointerdown', this.pointerDownListener);
        if (this.moveListener) window.removeEventListener('pointermove', this.moveListener);
        if (this.upListener) window.removeEventListener('pointerup', this.upListener);
        if (this.cancelListener) window.removeEventListener('pointercancel', this.cancelListener);
        if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    }

    // === Event handlers ===
    private onPointerDown = (ev: PointerEvent) => {
        // chỉ nhận left click / touch
        if (ev.button !== 0) return;

        // Nếu không có handle, chỉ cho phép drag khi nhấn trong dải trên (dragZonePx)
        if (!this.handleEl) {
            const hostRect = this.el.getBoundingClientRect();
            const offsetY = ev.clientY - hostRect.top;
            if (offsetY > this.dragZonePx) return; // để user thao tác video bình thường
        }

        this.dragging = true;
        try { this.el.setPointerCapture?.(ev.pointerId); } catch { }

        const rect = this.el.getBoundingClientRect();
        this.startX = ev.clientX;
        this.startY = ev.clientY;
        this.startLeft = rect.left;
        this.startTop = rect.top;

        // Chống select text, đổi cursor khi kéo
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    };

    private onPointerMove = (ev: PointerEvent) => {
        if (!this.dragging) return;

        // Chặn scroll khi kéo trên mobile
        ev.preventDefault();

        const dx = ev.clientX - this.startX;
        const dy = ev.clientY - this.startY;

        let nextLeft = this.startLeft + dx;
        let nextTop = this.startTop + dy;

        // Giới hạn trong viewport
        const bounds = this.getBounds();
        const size = this.el.getBoundingClientRect();

        nextLeft = Math.min(
            Math.max(nextLeft, bounds.left + this.margin),
            bounds.right - size.width - this.margin
        );
        nextTop = Math.min(
            Math.max(nextTop, bounds.top + this.margin),
            bounds.bottom - size.height - this.margin
        );

        const style = this.el.style;
        style.left = `${nextLeft}px`;
        style.top = `${nextTop}px`;
    };

    private onPointerUp = (ev: PointerEvent) => {
        if (!this.dragging) return;
        this.dragging = false;

        try { this.el.releasePointerCapture?.(ev.pointerId); } catch { }

        document.body.style.userSelect = '';
        document.body.style.cursor = '';

        if (this.snap) this.applySnap();
        this.savePosition();
    };

    // === Utils ===
    private getBounds() {
        // Vì element là fixed, dùng kích thước viewport
        return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    }

    private keepInsideViewport() {
        const style = this.el.style;
        const rect = this.el.getBoundingClientRect();
        const bounds = this.getBounds();

        let left = rect.left;
        let top = rect.top;

        const clampedLeft = Math.min(
            Math.max(left, this.margin),
            bounds.right - rect.width - this.margin
        );
        const clampedTop = Math.min(
            Math.max(top, this.margin),
            bounds.bottom - rect.height - this.margin
        );

        if (clampedLeft !== left || clampedTop !== top) {
            style.left = `${clampedLeft}px`;
            style.top = `${clampedTop}px`;
            this.savePosition();
        }
    }

    private applySnap() {
        const rect = this.el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const dLeft = rect.left - this.margin;
        const dTop = rect.top - this.margin;
        const dRight = vw - (rect.right + this.margin);
        const dBottom = vh - (rect.bottom + this.margin);

        let left = rect.left;
        let top = rect.top;

        if (Math.min(dLeft, dRight) <= this.snapThreshold) {
            left = dLeft < dRight ? this.margin : vw - rect.width - this.margin;
        }
        if (Math.min(dTop, dBottom) <= this.snapThreshold) {
            top = dTop < dBottom ? this.margin : vh - rect.height - this.margin;
        }

        const style = this.el.style;
        style.left = `${left}px`;
        style.top = `${top}px`;
    }

    private savePosition() {
        if (!this.saveKey) return;
        const rect = this.el.getBoundingClientRect();
        try {
            localStorage.setItem(this.saveKey, JSON.stringify({ left: rect.left, top: rect.top }));
        } catch { }
    }

    private restorePosition() {
        if (!this.saveKey) return;
        try {
            const raw = localStorage.getItem(this.saveKey);
            if (!raw) return;
            const { left, top } = JSON.parse(raw);
            if (typeof left === 'number' && typeof top === 'number') {
                this.el.style.left = `${left}px`;
                this.el.style.top = `${top}px`;
                // Đợi layout rồi kẹp lại nếu màn hình đổi size
                setTimeout(() => this.keepInsideViewport());
            }
        } catch { }
    }
}
