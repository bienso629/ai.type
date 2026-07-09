import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, tap } from 'rxjs';
import { Navigation } from 'app/core/navigation/navigation.types';
import { UserService } from 'app/core/user/user.service';
import { FuseNavigationItem } from '@fuse/components/navigation';

@Injectable({
    providedIn: 'root'
})
export class NavigationService
{
    private _navigation: ReplaySubject<Navigation> = new ReplaySubject<Navigation>(1);
    private _currentUser: any = null;

    /**
     * Constructor
     */
    constructor(private _httpClient: HttpClient, private _userService: UserService)
    {
        this._userService.user$.subscribe(user => this._currentUser = user);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for navigation
     */
    get navigation$(): Observable<Navigation>
    {
        return this._navigation.asObservable();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get all navigation data
     */
    get(): Observable<Navigation>
    {
        return this._httpClient.get<Navigation>('api/common/navigation').pipe(
            tap((navigation) => {
                const attachHiddenProperty = (items: FuseNavigationItem[]) => {
                    if (!items) return;
                    for (const item of items) {
                        if (item.id === 'admin.ai-crawl-nodes') {
                            item.hidden = () => {
                                if (!this._currentUser || !this._currentUser.groups) return true;
                                return !this._currentUser.groups.includes('nhóm-thu-thập-dữ-liệu');
                            };
                        }
                        if (item.children) {
                            attachHiddenProperty(item.children);
                        }
                    }
                };

                attachHiddenProperty(navigation.default);
                attachHiddenProperty(navigation.compact);
                attachHiddenProperty(navigation.futuristic);
                attachHiddenProperty(navigation.horizontal);

                this._navigation.next(navigation);
            })
        );
    }
}
