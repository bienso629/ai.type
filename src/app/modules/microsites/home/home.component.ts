import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { A11y, Mousewheel, Navigation, Pagination, SwiperOptions } from 'swiper';
import { Title } from '@angular/platform-browser';
import { Subject, takeUntil } from 'rxjs';
import { ChatGPTService } from 'app/_services/chatgpt';
import { ToastrService } from 'ngx-toastr';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { AIText2SpeechComponent } from 'app/modules/admin/content/ai-text2speech/ai-text2speech.component';
import { BlogService } from 'app/_services/blog';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectionList } from '@angular/material/list';
import { TranslocoService } from '@ngneat/transloco';
// import { CloudData, CloudOptions, ZoomOnHoverOptions } from 'angular-tag-cloud-module';

import Typewriter from 't-writer.js';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'landing-app',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    providers: [ChatGPTService, BlogService],
    encapsulation: ViewEncapsulation.None
})

export class LandingAppComponent implements OnInit, OnDestroy, AfterViewInit {
    yearlyBilling: boolean = true;

    drawerMode: 'over' | 'side' = 'side';
    drawerOpened: boolean = true;

    translate: any;
    goiy: string = '';
    cocongtent = {
        q: '',
        text: []
    };

    @ViewChild('trend') trend: MatSelectionList;
    trends: any = [];
    // data: CloudData[] = [];

    loading: boolean = false;
    helper: boolean = true;

    public config: SwiperOptions = {
        modules: [Navigation, Pagination, A11y, Mousewheel],
        autoHeight: true,
        direction: 'vertical',
        mousewheel: true,
        autoplay: false,
        keyboard: true,
        loop: false,
        hashNavigation: false,
        spaceBetween: 0,
        navigation: false,
        pagination: { clickable: true, dynamicBullets: true },
        slidesPerView: 1,
        centeredSlides: true,
        breakpoints: {
            400: {
                slidesPerView: 'auto',
                centeredSlides: true
            },
        }
    }

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Getter for current year
     */
    get currentYear(): number {
        return new Date().getFullYear();
    }

    /**
     * Sắp xếp lại nội dung bài viết
     */
    drop(event: CdkDragDrop<string[]>) {
        moveItemInArray(this.cocongtent.text, event.previousIndex, event.currentIndex);
    }

    /**
     * Lưu bài viết tét thử
     */
    save() { }

    /**
     * Bắt sự kiện khi slide hoạt động
     */
    onSlideChange() {
        this.helper = false;
    }

    /**
     * Sử dụng trend của Google để thử tạo nội dung
     */
    getTrend(item: any) {
        let results = [];
        let news_item_title = [];
        this.goiy = '';

        if (this.trend) {
            results.push(this.trend.selectedOptions.selected.map(s => s.value['ht:news_item']));
        }

        results.map(item => {
            item.map((s: any) => {
                s.map((d: any, i: number) => {
                    news_item_title.push(d['ht:news_item_title'][0]);
                })
            });
        });

        this.goiy = `Viết 1 blog đầy đủ, chi tiết và chính xác hơn 1000 từ về sự kiện ${item['title'][0]} dựa trên những ý phụ sau: ${news_item_title.join(' và ')}. Giọng văn nhẹ nhàng, truyền cảm, mang phong cách review vui tươi & hóm hỉnh. Không cần trích dẫn nguồn trong bài viết, không đưa link vào trong bài viết, không dẫn nguồn domain website nào cả.`;
    }

    /**
     * Xoá nội dung tét thủ tạo nội dung
     */
    clear() {
        localStorage.removeItem('test.chatgpt');

        this.cocongtent = {
            q: '',
            text: []
        };
    }

    getRandomColor() {
        var letters = '0123456789ABCDEF';
        var color = '#';

        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }

        return color;
    }

    /**
     * Lấy trend của Google mới nhất 247
     */
    googletrend() {
        this._blogService.googletrend()
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result) {
                        this.trends = result;
                    }
                },
                error: (e: any) => { },
                complete: () => { }
            });
    }

    /**
     * Dừng hoạt động tạo nội dung
     */
    stop() {
        this._chatGPTService.stop2025({
            username: 'khach123'
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => { },
                error: (e: any) => {
                    this.toastr.warning(this.translate?.toastr.chatgpt.stop.error);
                },
                complete: () => {
                    this.toastr.success(this.translate?.toastr.chatgpt.stop.success);
                }
            });
    }

    /**
     * Sử dụng ChatGPT tạo nội dung
     */
    chatgpt(question: string, index?: number) {
        if (question) {
            this.loading = !this.loading;
            let settings: any = this.multiAccountService.getItem('settings');
            
            this._chatGPTService.faq2025({
                OPENAI_API_KEY: settings.secretKey,
                openwindow: (settings.proccessing) ? 'close' : 'always',
                closethread: (settings.closethread) ? 'close' : 'always',
                username: 'khach123'
            }, question)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    next: async (result) => {
                        if (result && result.html && result.text) {
                            result.text = result.text.split('\n').filter((i: string) => i);
                            result.q = question;

                            if (index && index >= 0) {
                                // nôí kết quả nội dung
                                this.cocongtent.text.splice.apply(this.cocongtent.text, [index + 1, 0].concat(result.text));
                            } else {
                                // nếu chưa phát sinh nội dung gì thì bắt đầu thôi
                                this.cocongtent = result;
                            }

                            // lưu nội dung tét thử dưới local
                            localStorage.setItem('test.chatgpt', JSON.stringify({
                                q: question,
                                text: this.cocongtent.text
                            }));

                            this.toastr.success(this.translate?.toastr.chatgpt.stop.success);
                        } else {
                            this.toastr.warning('Type Lite của bạn chưa được bật.');
                        }
                    },
                    error: (e: any) => {
                        this.toastr.warning('Type Lite của bạn chưa được bật.');
                    },
                    complete: () => {
                        this.loading = !this.loading;
                    }
                });
        } else {
            this.toastr.warning(this.translate?.toastr.chatgpt.stop.success);
        }
    }

    /**
     * Sử dụng AI tạo âm thanh từ văn bản
     */
    voice(ct: string) {
        const dialogRef = this.dialog.open(AIText2SpeechComponent, {
            width: '600px',
            maxWidth: '95vw',
            panelClass: 'dlg-primary',
            data: ct,
            autoFocus: false
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                this.toastr.success(this.translate?.toastr.voice.success);
            }
        });
    }

    /**
     * Sử dụng AI tạo âm thanh từ văn bản
     */
    typewriter() {
        const target = document.querySelector('.tw');
        if (target) {
            const writer = new Typewriter(target, {
                loop: true,
                typeColor: 'blue'
            });

            writer
                .type(this.translate?.text1)
                .rest(500)
                .clear()
                .changeTypeColor('red')
                .type(this.translate?.text2)
                .rest(500)
                .clear()
                .changeTypeColor('green')
                .type(this.translate?.text3)
                .rest(500)
                .clear()
                .changeTypeColor('#8806ce')
                .type(this.translate?.text4)
                .rest(500)
                .clear()
                .changeTypeColor('blue')
                .start();
        }
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private toastr: ToastrService,
        public dialog: MatDialog,
        private cd: ChangeDetectorRef,
        private translocoService: TranslocoService,
        private _chatGPTService: ChatGPTService,
        private _blogService: BlogService,
         private multiAccountService: MultiAccountService
    ) { }

    /**
     * Khởi tạo dữ liệu ban đầu
     */
    ngAfterViewInit() { }

    /**
     * Bắt đầu ứng dụng
     */
    ngOnInit() {
        // this.googletrend();
        this.translocoService
            .selectTranslate("microsites.home", {}, this.translocoService.getActiveLang(), true)
            .subscribe(translate => {
                this.translate = translate;
                this.titleService.setTitle(this.translate?.title);

                this.typewriter();

                // lam moi lai giao dien
                this.cd.detectChanges();
            });
    }

    /**
     * Huỷ mọi hoạt động từ màn hình này
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
