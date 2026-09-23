import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, switchMap, take, tap } from 'rxjs/operators';
import { MessagesService } from 'app/layout/common/messages/messages.service';
import { NavigationService } from 'app/core/navigation/navigation.service';
import { NotificationsService } from 'app/layout/common/notifications/notifications.service';
import { QuickChatService } from 'app/layout/common/quick-chat/quick-chat.service';
import { ShortcutsService } from 'app/layout/common/shortcuts/shortcuts.service';

import { UserService } from 'app/core/user/user.service';
import { UserClientService } from 'app/_services/user';
import { CrawlService } from 'app/_services/crawl';
import { DomainService } from 'app/_services/domain';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Injectable({
    providedIn: 'root'
})
export class InitialDataResolver 
{
    /**
     * Constructor
     */
    constructor(
        private _messagesService: MessagesService,
        private _navigationService: NavigationService,
        private _notificationsService: NotificationsService,
        private _quickChatService: QuickChatService,
        private _shortcutsService: ShortcutsService,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _crawlService: CrawlService,
        private _domainService: DomainService,
        private _multiAccountService: MultiAccountService
    ) { }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Use this resolver to resolve initial mock-api for the application
     *
     * @param route
     * @param state
     */
    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<any>
    {
        // Fork join multiple API endpoint calls to wait all of them to finish
        const baseResolvers = forkJoin([
            this._navigationService.get(),
            this._messagesService.getAll(),
            this._notificationsService.getAll(),
            this._quickChatService.getChats(),
            this._shortcutsService.getAll()
        ]);

        // Nếu tài khoản bị token_mismatch, không tải API profile/crawl
        if (this._multiAccountService.getItem('token_mismatch')) {
            return baseResolvers;
        }

        const userSource$ = this._userService.user ? of(this._userService.user) : this._userService.user$.pipe(take(1));

        return userSource$.pipe(
            switchMap(user => {
                if (!user || !user.name) return baseResolvers;
                
                const selectedYear = (new Date()).getFullYear().toString();

                const profile$ = this._userClientService.profile({ name: user.name }).pipe(
                    tap(result => {
                        (window as any)['profile_synced'] = true;
                        if (result && result.success && result.data) {
                            if (result.data.styles && result.data.styles.length > 0) this._multiAccountService.setItem('styles', result.data.styles);
                            if (result.data.editor) this._multiAccountService.setItem('editor', result.data.editor);
                            if (result.data.following_users) this._multiAccountService.setItem('following_users', result.data.following_users);
                            if (result.data.settings) {
                                this._multiAccountService.setItem('settings', result.data.settings);
                                if (result.data.settings.domainTargets) {
                                    localStorage.setItem('domainTargets', JSON.stringify(result.data.settings.domainTargets));
                                }
                            }
                        }
                    }),
                    catchError(() => of(null))
                );


                const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';

                const collections$ = (isAutoSaveLocal && (window as any).electron && (window as any).electron.listLocalCollections)
                    ? new Observable(observer => {
                        (window as any).electron.listLocalCollections({ username: user.name }).then((res: any) => {
                            if (res && res.success && res.data) {
                                const lightweightCache = res.data.map((col: any) => ({
                                    _id: col._id,
                                    title: col.title,
                                    count: col.count || (col.uuid && Array.isArray(col.uuid) ? col.uuid.length : 0),
                                    lastItemUpdatedAt: col.lastItemUpdatedAt,
                                    lastUpdatedAt: col.lastUpdatedAt,
                                    lastUpdated: col.lastUpdated,
                                    updatedAt: col.updatedAt
                                }));
                                localStorage.setItem(`dashboard_collections_${user.name}`, JSON.stringify(lightweightCache));
                                (window as any)['dashboard_collections_preloaded'] = true;
                            }
                            observer.next(res);
                            observer.complete();
                        }).catch((err: any) => {
                            observer.next(null);
                            observer.complete();
                        });
                    })
                    : this._crawlService.collections({
                        username: user.name,
                        page: { size: 100 },
                        includeUuid: false
                    }).pipe(
                        tap(result => {
                            if (result && result.success && result.data) {
                                const lightweightCache = result.data.map((col: any) => ({
                                    _id: col._id,
                                    title: col.title,
                                    count: col.count || (col.uuid && Array.isArray(col.uuid) ? col.uuid.length : 0),
                                    lastItemUpdatedAt: col.lastItemUpdatedAt,
                                    lastUpdatedAt: col.lastUpdatedAt,
                                    lastUpdated: col.lastUpdated,
                                    updatedAt: col.updatedAt
                                }));
                                localStorage.setItem(`dashboard_collections_${user.name}`, JSON.stringify(lightweightCache));
                                (window as any)['dashboard_collections_preloaded'] = true;
                            }
                        }),
                        catchError(() => of(null))
                    );

                const statistics$ = (isAutoSaveLocal && (window as any).electron && (window as any).electron.getLocalStatistics)
                    ? new Observable(observer => {
                        (window as any).electron.getLocalStatistics({ username: user.name }).then((res: any) => {
                            if (res && res.success && res.data) {
                                let oldStats: any = {};
                                try {
                                    const cached = localStorage.getItem('statistics');
                                    if (cached) oldStats = JSON.parse(cached);
                                } catch (e) {}

                                const newStats = {
                                    ...oldStats,
                                    ...res.data,
                                    archives: res.data.archives !== undefined ? res.data.archives : (res.total || 0)
                                };
                                localStorage.setItem('statistics', JSON.stringify(newStats));
                                (window as any)['dashboard_statistics_preloaded'] = true;
                            }
                            observer.next(res);
                            observer.complete();
                        }).catch(() => {
                            observer.next(null);
                            observer.complete();
                        });
                    })
                    : this._crawlService.statistics({
                        username: user.name,
                        reportYear: selectedYear
                    }).pipe(
                        tap(result => {
                            if (result && result.success) {
                                const nodes = result.data || [];
                                const doneCount = nodes[0] ? nodes[0].length : 0;
                                const moneyCount = nodes[0] ? nodes[0].reduce((total: number, obj: any) => (obj.amount || 0) + total, 0) : 0;
                                const writingData = nodes[1] || { total: 0 };
                                const archivesData = nodes[2] || { total: 0 };
                                const domainStatsDataRaw = nodes[3] || {};
                                const domainStatsData: any = {};
                                for (const rawDomain of Object.keys(domainStatsDataRaw)) {
                                    const dom = (rawDomain || '').trim().toLowerCase();
                                    if (!dom || dom.includes('[object') || dom.includes('object object')) continue;
                                    domainStatsData[rawDomain] = domainStatsDataRaw[rawDomain];
                                }

                                let oldStats: any = {};
                                try {
                                    const cached = localStorage.getItem('statistics');
                                    if (cached) oldStats = JSON.parse(cached);
                                } catch (e) {}

                                const newStats = {
                                    ...oldStats,
                                    done: doneCount,
                                    money: moneyCount,
                                    archives: archivesData.total || archivesData || 0,
                                    writing: writingData.total || writingData || 0,
                                    domainStats: domainStatsData
                                };
                                localStorage.setItem('statistics', JSON.stringify(newStats));
                                (window as any)['dashboard_statistics_preloaded'] = true;
                            }
                        }),
                        catchError(() => of(null))
                    );

                return forkJoin([
                    baseResolvers,
                    profile$,
                    collections$,
                    statistics$
                ]);
            })
        );
    }
}
