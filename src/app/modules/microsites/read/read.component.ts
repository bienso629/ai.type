import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CrawlService } from 'app/_services/crawl';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Params } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

@Component({
    selector: 'read',
    templateUrl: './read.component.html',
    styleUrls: ['./read.component.scss'],
    providers: [CrawlService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class ReadComponent implements OnInit, OnDestroy, AfterViewInit {
    user: User;
    uuid: string;
    name: string;
    server: string;
    fontsize: number = 14;

    player: any;
    isUnMuted = false;

    details: any;

    /* END TWO OBJECTS */
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    fontSize(number: number) {
        this.fontsize = this.fontsize + number;
    }

    /**
     * Chi tiết lưu trữ
     */
    read() {
        this._crawlService.read({
            uuid: this.uuid,
            server: this.server,
            username: this.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success) {
                        this.details = result.data;
                        this.titleService.setTitle(`${this.details['title']} | ai.type - công cụ tạo content`);
                    }
                },
                error: () => {
                },
                complete: () => {
                    // (<any>window).onYouTubeIframeAPIReady = () => {
                    //     this.details.done.map((item: any) => {
                    //         if (item.indexOf('youtube-playlist') >= 0) {
                    //             const id = $(item).attr('id');
                    //             const playlist = $(item).text();
                    //             new (<any>window).YT.Player(id, {
                    //                 height: this.youtubeh,
                    //                 width: '100%',
                    //                 playerVars: {
                    //                     playlist: playlist,
                    //                     autoplay: 0,
                    //                     controls: 0,
                    //                     enablejsapi: 0,
                    //                     showinfo: 0,
                    //                     modestbranding: 0,
                    //                     loop: 0,
                    //                     fs: 1,
                    //                     cc_load_policty: 0,
                    //                     iv_load_policy: 3,
                    //                     playsinline: 1,
                    //                     color: 1
                    //                 },
                    //                 events: {
                    //                     onReady: (event: any) => {
                    //                     },
                    //                     onStateChange: (event: any) => {
                    //                     },
                    //                 }
                    //             });
                    //         }
                    //     });
                    // }

                    // lam moi lai giao dien
                    this.cd.markForCheck();
                }
            });
    }

    private setVolume(va: any) {
        this.player.setVolume(va);
    }

    /**
     * Getter for current year
     */
    get currentYear(): number {
        return new Date().getFullYear();
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        public dialog: MatDialog,
        private _crawlService: CrawlService,
        private cd: ChangeDetectorRef,
        private route: ActivatedRoute
    ) {
        this.titleService.setTitle(`đang đọc | ai.type - công cụ tạo content`);

        // var tag = document.createElement('script');
        // tag.src = "https://www.youtube.com/iframe_api";
        // var firstScriptTag = document.getElementsByTagName('script')[0];
        // firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    ngAfterViewInit(): void {
        
    }

    ngOnInit() {
        // if (1 === 1) return;
        this.route.params.subscribe((params: Params) => {
            const hash = params['hash'];
            const temp = JSON.parse(atob(hash));

            this.uuid = temp[2];
            this.name = temp[0];
            this.server = temp[1];

            this.read();
        });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
