import { Component, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { CrawlService } from 'app/modules/_services/crawl';
import { UserService } from 'app/core/user/user.service';
import { ApexOptions } from 'ng-apexcharts';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';

import * as _ from 'lodash';
import moment from 'moment';
import { AppConfig } from 'app/core/config/app.config';
import { FuseConfirmationService } from '@fuse/services/confirmation';
import { FuseConfigService } from '@fuse/services/config';

@Component({
    selector: 'dollar',
    styleUrls: ['./dollar.component.scss'],
    templateUrl: './dollar.component.html',
    providers: [CrawlService],
    encapsulation: ViewEncapsulation.None
})
export class DollarComponent implements OnInit, OnDestroy {
    moneyChart: ApexOptions;
    config: AppConfig;
    user: User;

    d = new Date();

    money = [{
        name: "Nhuận bút",
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    {
        name: "Thanh toán",
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }];

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Prepare the chart data from the data
     *
     * @private
     */
    private _prepareChartData(money: any): void {
        // Visitors vs Page Views
        this.moneyChart = {
            series: money,
            chart: {
                height: 444,
                type: 'line',
                dropShadow: {
                    enabled: false,
                    color: '#000',
                    top: 18,
                    left: 7,
                    blur: 10,
                    opacity: 0.2
                },
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: false,
                        reset: false,
                        pan: false
                    }
                }
            },
            colors: ['#1ba274', '#feb019'],
            dataLabels: {
                enabled: false,
            },
            stroke: {
                curve: 'straight'
            },
            title: {
                text: `Nhuận bút của admin`,
                align: 'center',
                // margin: 10
            },
            grid: {
                show: false,
                borderColor: 'transparent',
                row: {
                    colors: ['#f3f3f3', 'transparent'], // takes an array which will be repeated on columns
                    opacity: 0.5
                },
            },
            xaxis: {
                categories: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'],
                title: {
                    text: 'Tháng'
                },
                axisBorder: {
                    show: false,
                    strokeWidth: 0
                },
                axisTicks: {
                    show: false
                }
            },
            yaxis: {
                title: {
                    text: `ƯỚC TÍNH ${this.d.getFullYear()} (VND)`
                },
                // min: 0,
                // max: 40
            },
            legend: {
                position: 'bottom',
                horizontalAlign: 'right',
                floating: true,
                offsetY: 10,
                offsetX: 0
            }
        };
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Fix the SVG fill references. This fix must be applied to all ApexCharts
     * charts in order to fix 'black color on gradient fills on certain browsers'
     * issue caused by the '<base>' tag.
     *
     * Fix based on https://gist.github.com/Kamshak/c84cdc175209d1a30f711abd6a81d472
     *
     * @param element
     * @private
     */
    private _fixSvgFill(element: Element): void {
        // Current URL
        const currentURL = this._router.url;

        // 1. Find all elements with 'fill' attribute within the element
        // 2. Filter out the ones that doesn't have cross reference so we only left with the ones that use the 'url(#id)' syntax
        // 3. Insert the 'currentURL' at the front of the 'fill' attribute value
        Array.from(element.querySelectorAll('*[fill]'))
            .filter(el => el.getAttribute('fill').indexOf('url(') !== -1)
            .forEach((el) => {
                const attrVal = el.getAttribute('fill');
                el.setAttribute('fill', `url(${currentURL}${attrVal.slice(attrVal.indexOf('#'))}`);
            });
    }

    fetch() {
        this._crawlService.money({
            year: this.d.getFullYear(),
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (!result || result.length === 0) {
                    } else {
                        if (result && result.success) {
                            this.money[0].data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                            let temp = _(result.data)
                                .groupBy(v => moment(v.createdAt).format('MM'))
                                .map((objs, key) => {
                                    const amount = _.sumBy(objs, 'amount');
                                    const index = parseInt(key);

                                    // set lại tiền cho từng tháng
                                    this.money[0].data[index - 1] = amount;

                                    return {
                                        [`${index}`]: amount
                                    }
                                })
                                .value();
                        } else {

                        }
                    }
                },
                error: () => {
                },
                complete: () => {
                    if (this.user) {
                        const cacheKey = `admin_money_stats_${this.user.name}_${this.d.getFullYear()}`;
                        localStorage.setItem(cacheKey, JSON.stringify(this.money));
                    }
                    this._prepareChartData(JSON.parse(JSON.stringify(this.money)));
                }
            });

        this._crawlService.payment({
            year: this.d.getFullYear(),
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (!result || result.length === 0) {
                    } else {
                        if (result && result.success) {
                            this.money[1].data = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                            let temp = _(result.data)
                                .groupBy(v => moment(v.createdAt).format('MM'))
                                .map((objs, key) => {
                                    const amount = _.sumBy(objs, 'amount');
                                    const index = parseInt(key);

                                    // set lại tiền cho từng tháng
                                    this.money[1].data[index - 1] = amount;

                                    return {
                                        [`${index}`]: amount
                                    }
                                })
                                .value();
                        } else {

                        }
                    }
                },
                error: () => {
                },
                complete: () => {
                    if (this.user) {
                        const cacheKey = `admin_money_stats_${this.user.name}_${this.d.getFullYear()}`;
                        localStorage.setItem(cacheKey, JSON.stringify(this.money));
                    }
                    this._prepareChartData(JSON.parse(JSON.stringify(this.money)));
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _userService: UserService,
        private _crawlService: CrawlService,
        private _fuseConfigService: FuseConfigService,
        private _fuseConfirmationService: FuseConfirmationService,
        private _router: Router
    ) {
        this.titleService.setTitle(`nhuận bút | ai.type - công cụ tạo content`);
    }

    ngOnInit(): void {
        // Attach SVG fill fixer to all ApexCharts
        window['Apex'] = {
            chart: {
                events: {
                    mounted: (chart: any, options?: any): void => {
                        this._fixSvgFill(chart.el);
                    },
                    updated: (chart: any, options?: any): void => {
                        this._fixSvgFill(chart.el);
                    }
                }
            }
        };

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });

        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;



                // Cache màn hình thống kê để hiển thị tức thì
                const cacheKey = `admin_money_stats_${this.user.name}_${this.d.getFullYear()}`;
                const cachedData = localStorage.getItem(cacheKey);
                if (cachedData) {
                    try {
                        const parsed = JSON.parse(cachedData);
                        if (parsed && parsed.length === 2) {
                            this.money = parsed;
                            this._prepareChartData(JSON.parse(JSON.stringify(this.money)));
                        }
                    } catch (e) {}
                }

                this.fetch();

            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
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

        // Subscribe to afterClosed from the dialog reference
        dialogRef.afterClosed().subscribe((_) => {
            this._router.navigate(['/sign-out']);
        });
    }
}
