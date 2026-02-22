import { AfterViewInit, Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DomSanitizer, Title } from '@angular/platform-browser';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { BlogService } from 'app/modules/_services/blog';
import { filter, interval, Subject, switchMap, take, takeUntil } from 'rxjs';
import WaveSurfer from 'wavesurfer.js';
import { RemoveHTMLPipe } from 'app/app.pipe';
import { Router } from '@angular/router';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { ToastrService } from 'ngx-toastr';
import { MatSelectChange } from '@angular/material/select';

@Component({
    selector: 'ai-text2speech',
    templateUrl: './ai-text2speech.component.html',
    encapsulation: ViewEncapsulation.None,
    providers: [BlogService]
})
export class AIText2SpeechComponent implements OnInit, OnDestroy, AfterViewInit {
    config: AppConfig;
    user: User;
    wavesurfer: WaveSurfer;

    max = 200;
    min = 0;
    showTicks = false;
    step = 10;
    thumbLabel = true;
    text2speechForm: UntypedFormGroup;

    downloadMP3Href: any;
    nameMP3Href: string = '';
    removeHTML: RemoveHTMLPipe = new RemoveHTMLPipe();

    audioUrl: string | null = null;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private _userService: UserService,
        private _blogService: BlogService,
        private _formBuilder: UntypedFormBuilder,
        private domSanitizer: DomSanitizer,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private toastr: ToastrService,
        private router: Router,
        private titleService: Title,
        @Inject(MAT_DIALOG_DATA) public data: any,
    ) {
        this.titleService.setTitle(`text2speech | ai.type - công cụ tạo content`);

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                this.config = config;
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;

                if (user && user.reputation < 50000) {
                    this.error('Tài khoản của bạn không đủ điều kiện để truy cập!');
                    return;
                }
            });

        // Create the form
        this.text2speechForm = this._formBuilder.group({
            text: [(this.data) ? this.removeHTML.transform(this.data) : ''],
            // Mặc định chọn giọng Neural
            voice: ['vi-VN-NamMinhNeural'],
            speed: [0]
        });
    }

    ngAfterViewInit() {
        this.text2speechForm.controls['speed'].setValue(140);
    }

    ngOnInit(): void {
        this.fetchAudioWithHeader();
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    onVoiceChange(event: MatSelectChange) {
        // Edge voices không có file sample tĩnh, các giọng cũ thì load sample
        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        if (!edgeVoices.includes(event.value)) {
            this.wavesurfer.load(`assets/audios/${event.value}.wav`);
            this.wavesurfer.once('interaction', () => {
                this.wavesurfer.play();
            });
        }
    }

    generateId(): string {
        return Math.random().toString(36).substr(2, 5); // ID ngắn gọn 5 ký tự
    }

    // [MỚI] Hàm tạo Slug từ tiếng Việt (VD: "Xin chào Việt Nam" -> "xin-chao-viet-nam")
    toSlug(str: string): string {
        str = str || '';
        str = str.toLowerCase();
        str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Bỏ dấu
        str = str.replace(/[đĐ]/g, 'd');
        str = str.replace(/([^0-9a-z-\s])/g, ''); // Bỏ ký tự đặc biệt
        str = str.replace(/(\s+)/g, '-'); // Thay khoảng trắng bằng gạch ngang
        str = str.replace(/^-+|-+$/g, ''); // Bỏ gạch ngang đầu cuối
        return str;
    }

    async text2speech2025() {
        // Phòng hờ form chưa khởi tạo
        if (!this.text2speechForm) {
            this.toastr.error('Form chưa được khởi tạo, vui lòng tải lại trang.');
            return;
        }

        const textControl = this.text2speechForm.get('text');
        const voiceControl = this.text2speechForm.get('voice');

        const text = (textControl?.value || '').toString();
        const voice = (voiceControl?.value || 'nam-calm').toString();

        if (!text.trim()) {
            this.toastr.warning('Vui lòng nhập nội dung cần đọc.');
            return;
        }

        // --- [NEW LOGIC] XỬ LÝ EDGE TTS BẰNG LOCAL EXE ---
        const edgeVoices = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
        if (edgeVoices.includes(voice)) {
            this.generateEdgeTTSLocal(text, voice);
            return;
        }
        // -------------------------------------------------

        // --- LOGIC CŨ (GỌI API PYTHON BACKEND) ---
        const payload = {
            "tts_text": text.split(/\r?\n|\r|\n/g),
            "speaker_audio": `${voice}.wav`,
            "language": "vi",
            "normalize_text": true,
            "use_filter": false,
            "output_sr": 48000,
            "crossfade_ms": 30,
            "concurrency": 2,
            "join_silence_ms": 800,
            "flat": true,
            "username": this.user.name
        };

        this.toastr.info('Đang gửi yêu cầu', 'Đang xử lý');

        // BƯỚC 1: Gửi job, backend trả về job_id
        this._blogService
            .text2speech3(payload)
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (res: any) => {
                    if (res?.job_id) {
                        // BƯỚC 2: Poll job-status cho đến khi xong
                        this.pollJobUntilDone(res.job_id);
                    } else {
                        this.toastr.error('Không nhận được job từ server.');
                    }
                },
                error: () => {
                    this.toastr.error('Gửi yêu cầu chuyển đổi không thành công.');
                }
            });
    }

    // [CẬP NHẬT] Hàm gọi xuống Electron Main Process
    async generateEdgeTTSLocal(text: string, voice: string) {
        // Sử dụng (window as any).electron như yêu cầu
        if (!(window as any).electron || !(window as any).electron.invoke) {
            this.toastr.error('Tính năng này chỉ hoạt động trên ứng dụng Desktop.');
            return;
        }

        this.toastr.info('Đang xử lý giọng đọc', 'System');

        // [CẬP NHẬT] Tạo tên file readable
        // 1. Lấy 60 ký tự đầu tiên
        const shortText = text.substring(0, 60);
        // 2. Chuyển thành slug (khong-dau-gach-ngang)
        const slug = this.toSlug(shortText);
        // 3. Ghép với ID ngắn để tránh trùng lặp
        const niceFilename = `${slug}_${this.generateId()}`;

        const payload = {
            text: text,
            voice: voice,
            filename: niceFilename, // Tên file: xin-chao-moi-nguoi_a1b2c
            username: this.user?.name || 'anonymous'
        };

        try {
            // Gọi xuống main.js bằng cách ép kiểu (window as any)
            const res = await (window as any).electron.invoke('tts-generate', payload);

            if (res && res.success) {
                // res.url: file:///C:/Users/.../Documents/ai.type/data/tts/...
                const fullUrl = res.url;
                const filename = res.filePath ? res.filePath.split(/[\\/]/).pop() : `${payload.filename}.mp3`;

                // Cập nhật UI: Bypass security để Angular cho phép load file local
                this.downloadMP3Href = this.domSanitizer.bypassSecurityTrustUrl(fullUrl);
                this.nameMP3Href = filename;

                // Load vào WaveSurfer và Play
                this.wavesurfer.load(fullUrl);
                this.wavesurfer.once('interaction', () => {
                    this.wavesurfer.play();
                });

                this.toastr.success('Chuyển đổi thành công!');
            } else {
                this.toastr.error(res.error || 'Lỗi từ bộ xử lý TTS.');
            }
        } catch (err: any) {
            console.error(err);
            this.toastr.error('Lỗi khi gọi ứng dụng: ' + err.message);
        }
    }

    private pollJobUntilDone(jobId: string) {
        const polling$ = interval(3000).pipe(
            switchMap(() => this._blogService.getJobStatus(jobId)),
            switchMap(async (resp: any) => {
                const httpResp = resp as import('@angular/common/http').HttpResponse<Blob>;
                const headers = httpResp.headers;
                const body = httpResp.body as Blob;

                const contentType = headers.get('content-type') || body.type || '';

                // Nếu là audio (job DONE) -> trả kết quả
                if (contentType.startsWith('audio/')) {
                    let filename = 'tts-audio.wav';

                    const cd = headers.get('content-disposition') || '';
                    const match = /filename="?([^"]+)"?/i.exec(cd);
                    if (match && match[1]) {
                        filename = match[1];
                    }

                    return { done: true, blob: body, filename };
                }

                // Còn lại: coi body là JSON ở dạng blob -> parse thử
                const text = await body.text();
                try {
                    const json = JSON.parse(text);

                    if (json.status === 'failed') {
                        throw new Error(json.error || 'Job failed');
                    }

                    // pending / processing -> chưa xong
                    return { done: false, blob: null, filename: '' };
                } catch {
                    // parse lỗi -> cũng coi là chưa xong
                    return { done: false, blob: null, filename: '' };
                }
            }),
            filter(res => res.done),
            take(1)
        );

        polling$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: (res: any) => {
                    const blob = res.blob as Blob;
                    const filename = res.filename || 'tts-audio.wav';

                    const audioUrl = URL.createObjectURL(blob);

                    // dùng cho nút download
                    this.downloadMP3Href = this.domSanitizer.bypassSecurityTrustUrl(audioUrl);
                    this.nameMP3Href = filename;

                    // dùng cho waveform player
                    this.wavesurfer.load(audioUrl);
                    this.wavesurfer.once('interaction', () => {
                        this.wavesurfer.play();
                    });

                    this.toastr.success('Chuyển đổi thành công!');
                },
                error: (err) => {
                    console.error(err);
                    this.toastr.error('Chuyển đổi không thành công.');
                }
            });
    }

    fetchAudioWithHeader() {
        this.wavesurfer = WaveSurfer.create({
            container: '#waveform',
            waveColor: 'rgb(200, 0, 200)',
            progressColor: 'rgb(100, 0, 100)',
            barWidth: 4,
            barRadius: 4,
            barGap: 2,
            height: 100,
        });

        this.wavesurfer.load(`assets/audios/nam-calm.wav`);

        this.wavesurfer.once('interaction', () => {
            this.wavesurfer.play();
        });

        this.wavesurfer.on('finish', () => {
            // Seek về đầu
            this.wavesurfer.seekTo(0);
            // Gắn lại sự kiện để lần sau người dùng tương tác sẽ play lại
            this.wavesurfer.once('interaction', () => {
                this.wavesurfer.play();
            });
        });
    }

    error(message?: string) {
        const dialogRef = this._fuseConfirmationService.open({
            title: 'Thông báo!',
            message: (message) ? message : 'Yêu cầu hiển thị của bạn không được tìm thấy vào lúc này.',
            icon: {
                show: true,
                name: 'feather:alert-triangle',
                color: 'error'
            },
            actions: {
                confirm: {
                    show: true,
                    label: 'Đóng',
                    color: 'warn'
                },
                cancel: {
                    show: false,
                    label: 'Đóng lại'
                }
            },
            dismissible: false
        });

        dialogRef.afterClosed().subscribe((_) => {
            this.router.navigate(['/tools']);
        });
    }
}