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

        if (user.reputation >= 100000000 || user.groups?.includes('admin') || user.groups?.includes('nhóm-admin') || user.groups?.includes('nhóm-tạo-hình-ảnh') || user.groups?.includes('nhóm-thu-thập-dữ-liệu') || user.groups?.includes('nhóm-txt2voice') || user.groups?.includes('nhóm-big-data')) {
            cn2++;
        }

        if (user.groups?.includes('nhóm-đã-mua-chatbot') || user.groups?.includes('nhóm-seo-và-phân-tích') || user.groups?.includes('nhóm-tự-động-hóa') || user.groups?.includes('nhóm-x-cms') || user.groups?.includes('nhóm-chạy-traffic')) {
            cn3++;
        }

        return { cn2, cn3 };
    }

    public permissionVideo(user: User): boolean {
        if (user.groups?.includes('nhóm-video2content')) {
            return true;
        }

        return false;
    }

    public permissionVideoDownloader(user: User): boolean {
        if (user.groups?.includes('nhóm-download-video')) {
            return true;
        }

        return false;
    }

    public permissionDreamina(user: User): boolean {
        if (user.groups?.includes('nhóm-dreamina-ai')) {
            return true;
        }

        return false;
    }

    public permissionText2Voice(user: User): boolean {
        if (user.groups?.includes('nhóm-txt2voice')) {
            return true;
        }

        return false;
    }

    public permissionScriptCommentLike(user: User): boolean {
        if (user.groups?.includes('nhóm-tự-động-hóa')) {
            return true;
        }

        return false;
    }
}
