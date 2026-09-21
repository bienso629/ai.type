import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, ReplaySubject, tap } from 'rxjs';
import { User } from 'app/core/user/user.types';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private _user: ReplaySubject<User> = new ReplaySubject<User>(1);

    /**
     * Constructor
     */
    constructor(private _httpClient: HttpClient) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Setter & getter for user
     *
     * @param value
     */
    set user(value: User) {
        if (value && value.avatar) {
            value.avatar = value.avatar.replace(/&#x2F;/gi, '/');
            if (value.avatar === 'https://type.vnnull' || value.avatar === 'null') {
                value.avatar = null;
            } else if (!value.avatar.startsWith('http://') && !value.avatar.startsWith('https://') && !value.avatar.startsWith('data:') && !value.avatar.startsWith('assets/')) {
                value.avatar = 'https://type.vn' + (value.avatar.startsWith('/') ? '' : '/') + value.avatar;
            }
        }
        // Store the value
        this._user.next(value);
    }

    get user$(): Observable<User> {
        return this._user.asObservable();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get the current logged in user data
     */
    get(): Observable<User> {
        return this._httpClient.get<User>('api/common/user').pipe(
            tap((user) => {
                this._user.next(user);
            })
        );
    }

    /**
     * Update the user
     *
     * @param user
     */
    update(user: User): Observable<any> {
        return this._httpClient.patch<User>('api/common/user', { user }).pipe(
            map((response) => {
                this._user.next(response);
            })
        );
    }

    public permissionF(user: User) {
        let cn2 = 0, cn3 = 0;

        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            cn2++;
        }

        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            cn3++;
        }

        return { cn2, cn3 };
    }

    public permissionVideo(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionVideoDownloader(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionDreamina(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionText2Voice(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionScriptCommentLike(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }
}
