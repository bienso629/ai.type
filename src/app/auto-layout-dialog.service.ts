import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { ViewportRuler } from '@angular/cdk/scrolling';
import { Subscription } from 'rxjs';

export interface AutoLayoutDialogConfig<D = unknown> extends MatDialogConfig<D> {
    /**
     * Nếu muốn chặn click ra ngoài nhưng không làm mờ nền:
     * đặt transparentBackdrop = true (service sẽ bật hasBackdrop và dùng backdrop trong suốt).
     */
    transparentBackdrop?: boolean;

    /**
     * Bật/tắt auto layout. Mặc định = true.
     * Khi false, dialog đó không bị service ép kích thước/định vị.
     */
    autoLayout?: boolean;

    /** Khoảng cách giữa các dialog (px). Mặc định: 24 */
    gapX?: number;
    gapY?: number;

    /** Lề an toàn (px). Mặc định: 16 */
    edgePadding?: number;

    /**
     * Giới hạn kích thước khi auto layout (px).
     * Mặc định: min 420x320, max 1280x900.
     */
    minWidthPx?: number;
    minHeightPx?: number;
    maxWidthPx?: number;
    maxHeightPx?: number;

    /**
     * Nếu true, luôn giữ nguyên width/height do bạn truyền,
     * service sẽ chỉ sắp xếp vị trí (không ép size). Mặc định: false.
     */
    lockSize?: boolean;
}

type Meta = {
    gapX: number; gapY: number; pad: number;
    minW: number; minH: number; maxW: number; maxH: number;
    autoLayout: boolean;
    lockSize: boolean;
};

@Injectable({ providedIn: 'root' })
export class AutoLayoutDialogService {
    private dialog = inject(MatDialog);
    private vp = inject(ViewportRuler);

    private metas = new Map<MatDialogRef<any, any>, Meta>();
    private vpSub?: Subscription;

    open<T, D = unknown, R = any>(
        component: ComponentType<T>,
        config: AutoLayoutDialogConfig<D> = {}
    ): MatDialogRef<T, R> {
        const openCount = this.dialog.openDialogs.length;
        const isFirst = openCount === 0;

        // Backdrop động (tôn trọng config.hasBackdrop nếu có)
        let hasBackdrop = config.hasBackdrop ?? isFirst;
        let backdropClass = config.backdropClass;
        if (config.transparentBackdrop) {
            hasBackdrop = true;
            backdropClass = mergeClass(config.backdropClass, 'cdk-overlay-transparent-backdrop');
        }

        const finalConfig: MatDialogConfig<D> = {
            autoFocus: true,
            restoreFocus: false,
            ...config,
            hasBackdrop,
            backdropClass,
            panelClass: mergeClass(config.panelClass, isFirst ? 'dlg-primary' : 'dlg-stacked'),
        };

        const ref = this.dialog.open(component, finalConfig);

        // Lưu metadata
        const meta: Meta = {
            gapX: config.gapX ?? 24,
            gapY: config.gapY ?? 24,
            pad: config.edgePadding ?? 16,
            minW: config.minWidthPx ?? 420,
            minH: config.minHeightPx ?? 320,
            maxW: config.maxWidthPx ?? 1280,
            maxH: config.maxHeightPx ?? 900,
            autoLayout: config.autoLayout ?? true,
            lockSize: config.lockSize ?? false,
        };
        this.metas.set(ref, meta);

        // Sau khi mở, reflow
        ref.afterOpened().subscribe(() => this.reflow());

        // Khi đóng, xoá meta & reflow
        ref.afterClosed().subscribe(() => {
            this.metas.delete(ref);
            this.reflow();
        });

        // Lắng nghe thay đổi viewport 1 lần duy nhất
        if (!this.vpSub) {
            this.vpSub = this.vp.change(100).subscribe(() => this.reflow());
        }

        return ref;
    }

    /**
     * Thuật toán:
     * - Lấy danh sách dialogs đang mở có autoLayout=true.
     * - Nếu số lượng < 2: không ép size, giữ mặc định (hoặc theo user).
     * - Nếu số lượng >= 2:
     *   + Tính cols = ceil(sqrt(n)), rows = ceil(n/cols)
     *   + Tính width/height mỗi "ô" để fit vào viewport với pad/gap
     *   + Clamp theo min/max; nếu lockSize=true thì không động width/height cho dialog đó
     *   + Đặt vị trí theo lưới để không chồng chéo
     */
    private reflow() {
        const allRefs = this.dialog.openDialogs;
        if (!allRefs.length) return;

        const autoRefs = allRefs.filter(r => this.metas.get(r)?.autoLayout);
        const n = autoRefs.length;

        // Trường hợp < 2: không ép kích thước
        if (n < 2) {
            // Nhưng nếu trước đó đã bị reposition, đưa về center:
            autoRefs.forEach(ref => ref.updatePosition());
            return;
        }

        // Tính lưới
        const { width: vw, height: vh } = this.vp.getViewportSize();
        // Lấy tham số dùng chung an toàn nhất (max pad/gap trong các meta)
        const pad = Math.max(...autoRefs.map(r => this.metas.get(r)!.pad));
        const gapX = Math.max(...autoRefs.map(r => this.metas.get(r)!.gapX));
        const gapY = Math.max(...autoRefs.map(r => this.metas.get(r)!.gapY));

        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);

        // Kích thước "slot" tối đa theo viewport
        const slotW = Math.floor((vw - pad * 2 - gapX * (cols - 1)) / cols);
        const slotH = Math.floor((vh - pad * 2 - gapY * (rows - 1)) / rows);

        // Với mỗi dialog: clamp kích thước phù hợp slot và min/max
        autoRefs.forEach((ref, i) => {
            const m = this.metas.get(ref)!;

            if (!m.lockSize) {
                const w = clamp(slotW, m.minW, m.maxW);
                const h = clamp(slotH, m.minH, m.maxH);
                ref.updateSize(`${w}px`, `${h}px`);
            }

            const col = i % cols;
            const row = Math.floor(i / cols);

            const left = pad + col * (slotW + gapX);
            const top = pad + row * (slotH + gapY);

            ref.updatePosition({ left: `${left}px`, top: `${top}px` });
        });

        // Các dialog không autoLayout vẫn giữ vị trí cũ/trung tâm,
        // nhưng vì autoRefs đã xếp thành lưới, chúng sẽ không bị đè lên nhau.
    }
}

/* Helpers */
function mergeClass(
    original: string | string[] | undefined,
    ...toAdd: string[]
): string[] {
    const arr = Array.isArray(original) ? original : (original ? [original] : []);
    return [...arr, ...toAdd];
}

function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
}
