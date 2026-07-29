import { Injectable, NgZone } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { Observable, Subject, takeUntil } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LogStreamService {
    config: AppConfig;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private zone: NgZone,
        private _fuseConfigService: FuseConfigService
    ) {
        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    /**
     * Stream logs via SSE. Mặc định chỉ lấy phần đuôi (tail) khi connect.
     * Nếu backend đã áp patch 'start=tail', tham số đó sẽ hoạt động.
     * Nếu chưa, tham số 'from_start=false' (đã có sẵn trong API hiện tại) sẽ được dùng.
     */
    streamJobLogs(
        opts: { tailLines?: number; pollMs?: number } = {}
    ): Observable<string> {
        const tailLines = opts.tailLines ?? 200;
        const pollMs = opts.pollMs ?? 500;

        const url = new URL(`${this.config.settings.bigdata}/v1/jobs/logs/stream?fmt=sse&tail=200&follow=true`, window.location.origin);

        // Ưu tiên API mới (nếu bạn đã áp dụng patch server mình gửi trước đó)
        url.searchParams.set('start', 'tail');           // tail|start|end
        url.searchParams.set('tail_lines', String(tailLines));
        url.searchParams.set('poll_ms', String(pollMs));
        url.searchParams.set('max_lines_per_chunk', String(50));

        // Fallback cho API hiện tại (trong repo đang có):
        // sẽ bị backend bỏ qua nếu không hỗ trợ, nên safe khi set song song
        url.searchParams.set('from_start', 'false');     // chỉ theo dõi phần mới
        url.searchParams.set('poll_ms', String(pollMs));

        return new Observable<string>((observer) => {
            // Quan trọng: DÙNG EventSource, đừng dùng HttpClient cho SSE
            const es = new EventSource(url.toString(), { withCredentials: false });

            es.onmessage = (ev) => {
                // đẩy vào RxJS từ ngoài zone để giảm số lần change detection
                this.zone.runOutsideAngular(() => observer.next(ev.data));
            };
            es.onerror = (err) => {
                // đóng khi có lỗi (tránh giữ kết nối treo)
                es.close();
                this.zone.run(() => observer.error(err));
            };

            // teardown
            return () => es.close();
        });
    }
}

